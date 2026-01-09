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

interface TrackingEvent {
  id: string;
  shipment_id: string;
  status: string;
  event_datetime: string;
}

interface P1ExceptionAlert {
  shipment_ref: string;
  client_name: string;
  rule_name: string;
  severity: string;
  hours_in_status: number;
  max_hours: number;
  current_status: string;
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
    const p1Alerts: P1ExceptionAlert[] = [];

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

    // Send email alerts if any exceptions were created
    if (p1Alerts.length > 0) {
      console.log(`[detect-exceptions] Sending email alerts for ${p1Alerts.length} exceptions`);
      
      try {
        const alertResponse = await fetch(`${supabaseUrl}/functions/v1/send-exception-alert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ type: 'detection', exceptions: p1Alerts }),
        });
        
        if (!alertResponse.ok) {
          console.error('[detect-exceptions] Failed to send alerts:', await alertResponse.text());
        } else {
          const alertResult = await alertResponse.json();
          console.log('[detect-exceptions] Alerts sent:', alertResult);
        }
      } catch (alertError) {
        console.error('[detect-exceptions] Error sending alerts:', alertError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        exceptions_created: exceptionsCreated,
        rules_processed: rules?.length || 0,
        p1_alerts_sent: p1Alerts.length,
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
