import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExceptionRule {
  id: string;
  name: string;
  status_trigger: string;
  max_hours_in_status: number;
  applies_to_client_id: string | null;
  severity: string;
}

interface Shipment {
  id: string;
  shipment_ref: string;
  client_id: string;
  current_status: string;
}

interface ExceptionAlert {
  shipment_ref: string;
  client_name: string;
  rule_name: string;
  severity: string;
  hours_in_status: number;
  max_hours: number;
  current_status: string;
  escalated_from?: string;
}

interface EscalationConfig {
  p2_to_p1_hours: number;
  p3_to_p2_hours: number;
  enabled: boolean;
}

interface ShipmentException {
  id: string;
  shipment_id: string;
  severity: string;
  detected_at: string;
  status: string;
  shipment: {
    shipment_ref: string;
    current_status: string;
    client: { name: string } | null;
  };
  exception_rule: { name: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[detect-exceptions] Starting exception detection scan');

    // Fetch active exception rules
    const { data: rules, error: rulesError } = await supabase
      .from('exception_rules')
      .select('*')
      .eq('is_active', true);

    if (rulesError) {
      console.error('[detect-exceptions] Error fetching rules:', rulesError);
      throw rulesError;
    }

    console.log(`[detect-exceptions] Found ${rules?.length || 0} active rules`);

    let exceptionsCreated = 0;
    const p1Alerts: ExceptionAlert[] = [];

    for (const rule of (rules as ExceptionRule[]) || []) {
      // Fetch shipments matching the status trigger with client info
      let shipmentsQuery = supabase
        .from('shipments')
        .select('id, shipment_ref, client_id, current_status, client:clients(name)')
        .eq('current_status', rule.status_trigger);

      // Apply client filter if specified
      if (rule.applies_to_client_id) {
        shipmentsQuery = shipmentsQuery.eq('client_id', rule.applies_to_client_id);
      }

      const { data: shipments, error: shipmentsError } = await shipmentsQuery;

      if (shipmentsError) {
        console.error(`[detect-exceptions] Error fetching shipments for rule ${rule.name}:`, shipmentsError);
        continue;
      }

      console.log(`[detect-exceptions] Rule "${rule.name}": ${shipments?.length || 0} shipments in status ${rule.status_trigger}`);

      for (const shipment of (shipments as Shipment[]) || []) {
        // Check if there's already an OPEN exception for this shipment + rule
        const { data: existingException, error: existingError } = await supabase
          .from('shipment_exceptions')
          .select('id')
          .eq('shipment_id', shipment.id)
          .eq('exception_rule_id', rule.id)
          .eq('status', 'OPEN')
          .maybeSingle();

        if (existingError) {
          console.error(`[detect-exceptions] Error checking existing exception:`, existingError);
          continue;
        }

        if (existingException) {
          // Exception already exists, skip
          continue;
        }

        // Get the latest tracking event for this status
        const { data: lastEvent, error: eventError } = await supabase
          .from('tracking_events')
          .select('event_datetime')
          .eq('shipment_id', shipment.id)
          .eq('status', rule.status_trigger)
          .order('event_datetime', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (eventError) {
          console.error(`[detect-exceptions] Error fetching last event:`, eventError);
          continue;
        }

        if (!lastEvent) {
          // No event for this status, check shipment created date as fallback
          continue;
        }

        const eventTime = new Date(lastEvent.event_datetime);
        const now = new Date();
        const hoursInStatus = (now.getTime() - eventTime.getTime()) / (1000 * 60 * 60);

        if (hoursInStatus > rule.max_hours_in_status) {
          // Create exception
          const { error: insertError } = await supabase
            .from('shipment_exceptions')
            .insert({
              shipment_id: shipment.id,
              exception_rule_id: rule.id,
              severity: rule.severity,
              status: 'OPEN',
            });

          if (insertError) {
            console.error(`[detect-exceptions] Error creating exception:`, insertError);
            continue;
          }

          exceptionsCreated++;

          // Collect alerts for email notification (all severities)
          const clientName = (shipment as any).client?.name || 'Unknown Client';
          p1Alerts.push({
            shipment_ref: shipment.shipment_ref,
            client_name: clientName,
            rule_name: rule.name,
            severity: rule.severity,
            hours_in_status: Math.round(hoursInStatus),
            max_hours: rule.max_hours_in_status,
            current_status: shipment.current_status,
          });

          // Log to audit
          await supabase.from('audit_log').insert({
            entity_type: 'SHIPMENT_EXCEPTION',
            entity_id: shipment.id,
            action: 'EXCEPTION_DETECTED',
            metadata_json: {
              rule_name: rule.name,
              shipment_ref: shipment.shipment_ref,
              severity: rule.severity,
              hours_in_status: Math.round(hoursInStatus),
              max_hours: rule.max_hours_in_status,
            },
          });

          console.log(`[detect-exceptions] Created exception for shipment ${shipment.shipment_ref} (rule: ${rule.name}, ${Math.round(hoursInStatus)}h > ${rule.max_hours_in_status}h)`);
        }
      }
    }

    console.log(`[detect-exceptions] Scan complete. Created ${exceptionsCreated} new exceptions.`);

    // ===== ESCALATION LOGIC =====
    let exceptionsEscalated = 0;
    const escalationAlerts: ExceptionAlert[] = [];

    // Fetch escalation config
    const { data: escalationSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'exception_escalation')
      .maybeSingle();

    const escalationConfig: EscalationConfig = escalationSetting?.value as EscalationConfig || {
      p2_to_p1_hours: 24,
      p3_to_p2_hours: 48,
      enabled: true,
    };

    if (escalationConfig.enabled) {
      console.log(`[detect-exceptions] Checking for escalations (P2→P1: ${escalationConfig.p2_to_p1_hours}h, P3→P2: ${escalationConfig.p3_to_p2_hours}h)`);

      // Find OPEN exceptions eligible for escalation
      const { data: openExceptions, error: exceptionsError } = await supabase
        .from('shipment_exceptions')
        .select(`
          id,
          shipment_id,
          severity,
          detected_at,
          status,
          shipment:shipments(shipment_ref, current_status, client:clients(name)),
          exception_rule:exception_rules(name)
        `)
        .in('status', ['OPEN', 'ACKNOWLEDGED'])
        .in('severity', ['P2', 'P3']);

      if (exceptionsError) {
        console.error('[detect-exceptions] Error fetching exceptions for escalation:', exceptionsError);
      } else {
        const now = new Date();

        for (const exception of (openExceptions as unknown as ShipmentException[]) || []) {
          const detectedAt = new Date(exception.detected_at);
          const hoursOpen = (now.getTime() - detectedAt.getTime()) / (1000 * 60 * 60);

          let newSeverity: string | null = null;

          if (exception.severity === 'P2' && hoursOpen > escalationConfig.p2_to_p1_hours) {
            newSeverity = 'P1';
          } else if (exception.severity === 'P3' && hoursOpen > escalationConfig.p3_to_p2_hours) {
            newSeverity = 'P2';
          }

          if (newSeverity) {
            // Update exception severity
            const { error: updateError } = await supabase
              .from('shipment_exceptions')
              .update({ severity: newSeverity })
              .eq('id', exception.id);

            if (updateError) {
              console.error(`[detect-exceptions] Error escalating exception ${exception.id}:`, updateError);
              continue;
            }

            exceptionsEscalated++;

            const shipment = exception.shipment;
            const clientName = shipment?.client?.name || 'Unknown Client';

            escalationAlerts.push({
              shipment_ref: shipment?.shipment_ref || 'Unknown',
              client_name: clientName,
              rule_name: exception.exception_rule?.name || 'Unknown Rule',
              severity: newSeverity,
              hours_in_status: Math.round(hoursOpen),
              max_hours: exception.severity === 'P2' ? escalationConfig.p2_to_p1_hours : escalationConfig.p3_to_p2_hours,
              current_status: shipment?.current_status || 'Unknown',
              escalated_from: exception.severity,
            });

            // Log to audit
            await supabase.from('audit_log').insert({
              entity_type: 'SHIPMENT_EXCEPTION',
              entity_id: exception.id,
              action: 'EXCEPTION_ESCALATED',
              metadata_json: {
                shipment_id: exception.shipment_id,
                from_severity: exception.severity,
                to_severity: newSeverity,
                hours_open: Math.round(hoursOpen),
              },
            });

            console.log(`[detect-exceptions] Escalated exception ${exception.id} from ${exception.severity} to ${newSeverity} (open for ${Math.round(hoursOpen)}h)`);
          }
        }
      }
    }

    console.log(`[detect-exceptions] Escalation complete. Escalated ${exceptionsEscalated} exceptions.`);

    // Send email alerts for new exceptions (excluding escalations)
    const newExceptionAlerts = p1Alerts.filter(a => !a.escalated_from);
    if (newExceptionAlerts.length > 0) {
      console.log(`[detect-exceptions] Sending email alerts for ${newExceptionAlerts.length} new exceptions`);
      
      try {
        const alertResponse = await fetch(`${supabaseUrl}/functions/v1/send-exception-alert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ type: 'detection', exceptions: newExceptionAlerts }),
        });
        
        if (!alertResponse.ok) {
          console.error('[detect-exceptions] Failed to send detection alerts:', await alertResponse.text());
        } else {
          const alertResult = await alertResponse.json();
          console.log('[detect-exceptions] Detection alerts sent:', alertResult);
        }
      } catch (alertError) {
        console.error('[detect-exceptions] Error sending detection alerts:', alertError);
      }
    }

    // Send separate escalation email
    if (escalationAlerts.length > 0) {
      console.log(`[detect-exceptions] Sending escalation alerts for ${escalationAlerts.length} escalated exceptions`);
      
      try {
        const escalationResponse = await fetch(`${supabaseUrl}/functions/v1/send-exception-alert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ type: 'escalation', escalations: escalationAlerts }),
        });
        
        if (!escalationResponse.ok) {
          console.error('[detect-exceptions] Failed to send escalation alerts:', await escalationResponse.text());
        } else {
          const escalationResult = await escalationResponse.json();
          console.log('[detect-exceptions] Escalation alerts sent:', escalationResult);
        }
      } catch (escalationError) {
        console.error('[detect-exceptions] Error sending escalation alerts:', escalationError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        exceptions_created: exceptionsCreated,
        exceptions_escalated: exceptionsEscalated,
        rules_processed: rules?.length || 0,
        detection_alerts_sent: newExceptionAlerts.length,
        escalation_alerts_sent: escalationAlerts.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('[detect-exceptions] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
