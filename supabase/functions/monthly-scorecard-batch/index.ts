import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Shipment {
  id: string;
  current_status: string;
  created_at: string;
}

interface SlaRecord {
  shipment_id: string;
  elapsed_hours: number | null;
  breached: boolean | null;
  exited_at: string | null;
  shipment_status?: string;
}

interface ExceptionRecord {
  id: string;
  severity: string;
  exception_rule: { name: string }[] | null;
}

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

function getPreviousMonth(): { year: number; month: number } {
  const now = new Date();
  let month = now.getMonth(); // 0-indexed, so this is already previous month
  let year = now.getFullYear();
  
  if (month === 0) {
    month = 12;
    year--;
  }
  
  return { year, month };
}

async function generateScorecardForClient(
  supabase: SupabaseClient,
  clientId: string,
  clientName: string,
  year: number,
  month: number
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[monthly-scorecard-batch] Generating scorecard for ${clientName} (${clientId}), ${year}-${month}`);

    const periodStart = getMonthStart(year, month).toISOString();
    const periodEnd = getMonthEnd(year, month).toISOString();

    // Fetch all shipments for the period
    const { data: shipmentsData, error: shipmentsError } = await supabase
      .from('shipments')
      .select('id, current_status, created_at')
      .eq('client_id', clientId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (shipmentsError) {
      throw shipmentsError;
    }

    const shipments = (shipmentsData || []) as Shipment[];
    const shipmentIds = shipments.map(s => s.id);
    const totalShipments = shipments.length;
    const deliveredShipments = shipments.filter(s => s.current_status === 'DELIVERED').length;

    // Status breakdown
    const statusBreakdown: Record<string, number> = {};
    for (const s of shipments) {
      statusBreakdown[s.current_status] = (statusBreakdown[s.current_status] || 0) + 1;
    }

    // Fetch SLA records for the period
    let slaComplianceRate = 100;
    let avgTransitHours = 0;

    if (shipmentIds.length > 0) {
      const { data: slaData, error: slaError } = await supabase
        .from('shipment_sla')
        .select('shipment_id, elapsed_hours, breached, exited_at')
        .in('shipment_id', shipmentIds)
        .not('exited_at', 'is', null);

      if (!slaError && slaData) {
        const slaRecords = slaData as SlaRecord[];
        const breachedCount = slaRecords.filter(r => r.breached === true).length;
        const totalTransitions = slaRecords.length;
        slaComplianceRate = totalTransitions > 0 
          ? Math.round(((totalTransitions - breachedCount) / totalTransitions) * 100)
          : 100;

        // Calculate average transit time (for DELIVERED shipments)
        const deliveredIds = shipments.filter(s => s.current_status === 'DELIVERED').map(s => s.id);
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
      const deliveredIds = shipments.filter(s => s.current_status === 'DELIVERED').map(s => s.id);
      const { data: deliveredSlaData } = await supabase
        .from('shipment_sla')
        .select('shipment_id, breached')
        .in('shipment_id', deliveredIds)
        .eq('shipment_status', 'DELIVERED');

      if (deliveredSlaData) {
        const deliveredSla = deliveredSlaData as SlaRecord[];
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
      const { data: exceptionsData, error: exceptionsError } = await supabase
        .from('shipment_exceptions')
        .select(`
          id,
          severity,
          exception_rule:exception_rules(name)
        `)
        .in('shipment_id', shipmentIds);

      if (!exceptionsError && exceptionsData) {
        const exceptions = exceptionsData as ExceptionRecord[];
        totalIncidents = exceptions.length;
        exceptionsP1 = exceptions.filter(e => e.severity === 'P1').length;
        exceptionsP2 = exceptions.filter(e => e.severity === 'P2').length;
        exceptionsP3 = exceptions.filter(e => e.severity === 'P3').length;

        // Group by rule for top issues
        const issueMap: Record<string, { count: number; severity: string }> = {};
        for (const e of exceptions) {
          const ruleName = e.exception_rule?.[0]?.name || 'Unknown';
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

      const { data: trendShipmentsData } = await supabase
        .from('shipments')
        .select('id, current_status')
        .eq('client_id', clientId)
        .gte('created_at', trendStart)
        .lte('created_at', trendEnd);

      const trendShipments = (trendShipmentsData || []) as Shipment[];
      const trendTotal = trendShipments.length;
      const trendDelivered = trendShipments.filter(s => s.current_status === 'DELIVERED').length;

      let trendOnTime = 0;
      let trendCompliance = 100;

      if (trendTotal > 0) {
        const trendIds = trendShipments.map(s => s.id);
        const { data: trendSlaData } = await supabase
          .from('shipment_sla')
          .select('shipment_id, breached, shipment_status')
          .in('shipment_id', trendIds)
          .not('exited_at', 'is', null);

        if (trendSlaData && trendSlaData.length > 0) {
          const trendSla = trendSlaData as SlaRecord[];
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

    // Upsert scorecard (generated_by is null for automated generation)
    const { error: upsertError } = await supabase
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
        generated_by: null, // Automated generation
      }, {
        onConflict: 'client_id,period_year,period_month',
      });

    if (upsertError) {
      throw upsertError;
    }

    console.log(`[monthly-scorecard-batch] Successfully generated scorecard for ${clientName}`);
    return { success: true };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[monthly-scorecard-batch] Error generating scorecard for ${clientName}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

interface Client {
  id: string;
  name: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[monthly-scorecard-batch] Starting batch scorecard generation');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get previous month for scorecard generation
    const { year, month } = getPreviousMonth();
    console.log(`[monthly-scorecard-batch] Generating scorecards for period: ${year}-${month}`);

    // Fetch all active clients
    const { data: clientsData, error: clientsError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (clientsError) {
      console.error('[monthly-scorecard-batch] Error fetching clients:', clientsError);
      throw clientsError;
    }

    const clients = (clientsData || []) as Client[];

    if (clients.length === 0) {
      console.log('[monthly-scorecard-batch] No active clients found');
      return new Response(
        JSON.stringify({ success: true, message: 'No active clients to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[monthly-scorecard-batch] Found ${clients.length} active clients`);

    // Generate scorecards for each client
    const results: { clientName: string; success: boolean; error?: string }[] = [];
    
    for (const client of clients) {
      const result = await generateScorecardForClient(
        supabase,
        client.id,
        client.name,
        year,
        month
      );
      results.push({ clientName: client.name, ...result });
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log(`[monthly-scorecard-batch] Completed: ${successCount} success, ${failedCount} failed`);

    // Create audit log for batch generation
    await supabase.from('audit_log').insert({
      entity_type: 'client_scorecard',
      entity_id: null,
      action: 'SCORECARD_BATCH_GENERATED',
      actor_user_id: null,
      metadata_json: {
        period_year: year,
        period_month: month,
        total_clients: clients.length,
        success_count: successCount,
        failed_count: failedCount,
        failed_clients: results.filter(r => !r.success).map(r => r.clientName),
        generated_at: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        period: { year, month },
        processed: clients.length,
        successCount,
        failedCount,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[monthly-scorecard-batch] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
