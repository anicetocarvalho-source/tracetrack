import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScorecardData {
  clientId: string;
  clientName: string;
  periodYear: number;
  periodMonth: number;
  totalShipments: number;
  deliveredShipments: number;
  onTimeDeliveryRate: number;
  slaComplianceRate: number;
  totalIncidents: number;
  avgTransitHours: number;
  exceptionsP1: number;
  exceptionsP2: number;
  exceptionsP3: number;
  statusBreakdown: Record<string, number>;
  topIssues: { issue: string; count: number; severity: string }[];
  trendData: { month: string; shipments: number; onTime: number; compliance: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Received',
  REGISTERED: 'Registered',
  DOCS_VALIDATION: 'Docs Validation',
  PROCESSING: 'Processing',
  IN_TRANSIT: 'In Transit',
  AT_TERMINAL: 'At Terminal',
  CLEARANCE: 'Clearance',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  ON_HOLD_INCIDENT: 'On Hold - Incident',
  CANCELLED: 'Cancelled',
};

function getMonthName(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1] || '';
}

function getMonthStart(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

function getMonthEnd(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user and role
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is a manager
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'MANAGER') {
      return new Response(
        JSON.stringify({ error: 'Only managers can generate scorecards' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { clientId, year, month } = await req.json();
    
    if (!clientId || !year || !month) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: clientId, year, month' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-scorecard] Generating scorecard for client ${clientId}, ${year}-${month}`);

    // Get client info
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const periodStart = getMonthStart(year, month).toISOString();
    const periodEnd = getMonthEnd(year, month).toISOString();

    // Fetch all shipments for the period
    const { data: shipments, error: shipmentsError } = await supabase
      .from('shipments')
      .select('id, current_status, created_at')
      .eq('client_id', clientId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (shipmentsError) {
      console.error('[generate-scorecard] Error fetching shipments:', shipmentsError);
      throw shipmentsError;
    }

    const shipmentIds = shipments?.map(s => s.id) || [];
    const totalShipments = shipments?.length || 0;
    const deliveredShipments = shipments?.filter(s => s.current_status === 'DELIVERED').length || 0;

    // Status breakdown
    const statusBreakdown: Record<string, number> = {};
    for (const s of shipments || []) {
      statusBreakdown[s.current_status] = (statusBreakdown[s.current_status] || 0) + 1;
    }

    // Fetch SLA records for the period
    let slaComplianceRate = 100;
    let avgTransitHours = 0;

    if (shipmentIds.length > 0) {
      const { data: slaRecords, error: slaError } = await supabase
        .from('shipment_sla')
        .select('shipment_id, elapsed_hours, breached, exited_at')
        .in('shipment_id', shipmentIds)
        .not('exited_at', 'is', null);

      if (!slaError && slaRecords) {
        const breachedCount = slaRecords.filter(r => r.breached === true).length;
        const totalTransitions = slaRecords.length;
        slaComplianceRate = totalTransitions > 0 
          ? Math.round(((totalTransitions - breachedCount) / totalTransitions) * 100)
          : 100;

        // Calculate average transit time (for DELIVERED shipments)
        const deliveredIds = shipments?.filter(s => s.current_status === 'DELIVERED').map(s => s.id) || [];
        if (deliveredIds.length > 0) {
          const deliveredSla = slaRecords.filter(r => deliveredIds.includes(r.shipment_id));
          const totalHours = deliveredSla.reduce((sum, r) => sum + (r.elapsed_hours || 0), 0);
          avgTransitHours = deliveredSla.length > 0 ? totalHours / deliveredSla.length : 0;
        }
      }
    }

    // On-time delivery rate (delivered within SLA)
    let onTimeDeliveryRate = 0;
    if (deliveredShipments > 0) {
      const deliveredIds = shipments?.filter(s => s.current_status === 'DELIVERED').map(s => s.id) || [];
      const { data: deliveredSla } = await supabase
        .from('shipment_sla')
        .select('shipment_id, breached')
        .in('shipment_id', deliveredIds)
        .eq('shipment_status', 'DELIVERED');

      if (deliveredSla) {
        const onTimeCount = deliveredSla.filter(r => r.breached !== true).length;
        onTimeDeliveryRate = Math.round((onTimeCount / deliveredShipments) * 100);
      }
    }

    // Fetch exceptions
    let exceptionsP1 = 0;
    let exceptionsP2 = 0;
    let exceptionsP3 = 0;
    let totalIncidents = 0;
    const topIssues: { issue: string; count: number; severity: string }[] = [];

    if (shipmentIds.length > 0) {
      const { data: exceptions, error: exceptionsError } = await supabase
        .from('shipment_exceptions')
        .select(`
          id,
          severity,
          exception_rule:exception_rules(name)
        `)
        .in('shipment_id', shipmentIds);

      if (!exceptionsError && exceptions) {
        totalIncidents = exceptions.length;
        exceptionsP1 = exceptions.filter(e => e.severity === 'P1').length;
        exceptionsP2 = exceptions.filter(e => e.severity === 'P2').length;
        exceptionsP3 = exceptions.filter(e => e.severity === 'P3').length;

        // Group by rule for top issues
        const issueMap: Record<string, { count: number; severity: string }> = {};
        for (const e of exceptions) {
          const ruleName = (e.exception_rule as any)?.name || 'Unknown';
          if (!issueMap[ruleName]) {
            issueMap[ruleName] = { count: 0, severity: e.severity };
          }
          issueMap[ruleName].count++;
        }
        
        const sortedIssues = Object.entries(issueMap)
          .map(([issue, data]) => ({ issue, ...data }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        
        topIssues.push(...sortedIssues);
      }
    }

    // Generate trend data (last 6 months)
    const trendData: { month: string; shipments: number; onTime: number; compliance: number }[] = [];
    
    for (let i = 5; i >= 0; i--) {
      let trendMonth = month - i;
      let trendYear = year;
      
      while (trendMonth <= 0) {
        trendMonth += 12;
        trendYear--;
      }

      const trendStart = getMonthStart(trendYear, trendMonth).toISOString();
      const trendEnd = getMonthEnd(trendYear, trendMonth).toISOString();

      const { data: trendShipments } = await supabase
        .from('shipments')
        .select('id, current_status')
        .eq('client_id', clientId)
        .gte('created_at', trendStart)
        .lte('created_at', trendEnd);

      const trendTotal = trendShipments?.length || 0;
      const trendDelivered = trendShipments?.filter(s => s.current_status === 'DELIVERED').length || 0;

      let trendOnTime = 0;
      let trendCompliance = 100;

      if (trendTotal > 0) {
        const trendIds = trendShipments?.map(s => s.id) || [];
        const { data: trendSla } = await supabase
          .from('shipment_sla')
          .select('shipment_id, breached, shipment_status')
          .in('shipment_id', trendIds)
          .not('exited_at', 'is', null);

        if (trendSla && trendSla.length > 0) {
          const breached = trendSla.filter(r => r.breached === true).length;
          trendCompliance = Math.round(((trendSla.length - breached) / trendSla.length) * 100);
          
          const deliveredSla = trendSla.filter(r => r.shipment_status === 'DELIVERED' && r.breached !== true);
          trendOnTime = trendDelivered > 0 ? Math.round((deliveredSla.length / trendDelivered) * 100) : 0;
        }
      }

      trendData.push({
        month: `${getMonthName(trendMonth)} ${trendYear}`,
        shipments: trendTotal,
        onTime: trendOnTime,
        compliance: trendCompliance,
      });
    }

    console.log('[generate-scorecard] Scorecard data calculated, saving to database');

    // Upsert scorecard
    const { data: scorecard, error: upsertError } = await supabase
      .from('client_scorecards')
      .upsert({
        client_id: clientId,
        period_year: year,
        period_month: month,
        total_shipments: totalShipments,
        delivered_shipments: deliveredShipments,
        on_time_delivery_rate: onTimeDeliveryRate,
        sla_compliance_rate: slaComplianceRate,
        total_incidents: totalIncidents,
        avg_transit_hours: Math.round(avgTransitHours * 100) / 100,
        exceptions_p1: exceptionsP1,
        exceptions_p2: exceptionsP2,
        exceptions_p3: exceptionsP3,
        status_breakdown: statusBreakdown,
        top_issues: topIssues,
        trend_data: trendData,
        generated_at: new Date().toISOString(),
        generated_by: user.id,
      }, {
        onConflict: 'client_id,period_year,period_month',
      })
      .select()
      .single();

    if (upsertError) {
      console.error('[generate-scorecard] Error saving scorecard:', upsertError);
      throw upsertError;
    }

    // Audit log
    await supabase.from('audit_log').insert({
      entity_type: 'client_scorecard',
      entity_id: scorecard.id,
      action: 'SCORECARD_GENERATED',
      actor_user_id: user.id,
      metadata_json: {
        client_id: clientId,
        client_name: client.name,
        period: `${year}-${month}`,
        total_shipments: totalShipments,
        sla_compliance_rate: slaComplianceRate,
      },
    });

    console.log('[generate-scorecard] Scorecard generated successfully:', scorecard.id);

    // Send notification to client
    try {
      const origin = req.headers.get('origin') || '';
      await fetch(`${supabaseUrl}/functions/v1/notify-scorecard-available`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          scorecardId: scorecard.id,
          portalUrl: origin,
        }),
      });
      console.log('[generate-scorecard] Notification sent to client');
    } catch (notifyError) {
      console.error('[generate-scorecard] Failed to send notification:', notifyError);
      // Don't fail the whole request if notification fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        scorecard: {
          ...scorecard,
          client_name: client.name,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-scorecard] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
