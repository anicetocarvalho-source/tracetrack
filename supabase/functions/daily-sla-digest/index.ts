import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DailySLAMetrics {
  totalActive: number;
  totalCompleted: number;
  totalBreaches: number;
  complianceRate: number;
  atRiskCount: number;
  criticalCount: number;
  avgCompletionTime: number;
  statusBreakdown: { status: string; active: number; completed: number; breached: number }[];
  clientBreakdown: { name: string; active: number; breached: number }[];
  recentBreaches: { shipmentRef: string; client: string; status: string; elapsed: number; target: number; breachedAt: string }[];
  upcomingRisks: { shipmentRef: string; client: string; status: string; percentUsed: number; hoursRemaining: number }[];
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

function formatHours(hours: number): string {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours >= 1) {
    return `${Math.round(hours)}h`;
  }
  return `${Math.round(hours * 60)}m`;
}

function getComplianceColor(percent: number): string {
  if (percent >= 90) return '#16a34a';
  if (percent >= 70) return '#f59e0b';
  return '#dc2626';
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    RECEIVED: '#6366f1',
    REGISTERED: '#8b5cf6',
    DOCS_VALIDATION: '#a855f7',
    PROCESSING: '#3b82f6',
    IN_TRANSIT: '#06b6d4',
    AT_TERMINAL: '#14b8a6',
    CLEARANCE: '#f59e0b',
    OUT_FOR_DELIVERY: '#84cc16',
    DELIVERED: '#22c55e',
    ON_HOLD_INCIDENT: '#ef4444',
    CANCELLED: '#6b7280',
  };
  return colors[status] || '#6b7280';
}

function getRiskColor(percent: number): string {
  if (percent >= 90) return '#dc2626';
  if (percent >= 75) return '#f59e0b';
  if (percent >= 50) return '#3b82f6';
  return '#22c55e';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[daily-sla-digest] Starting daily SLA digest generation');

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[daily-sla-digest] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayISO = yesterday.toISOString();

    console.log(`[daily-sla-digest] Analyzing data from ${yesterdayISO} to ${now.toISOString()}`);

    // Fetch all active SLA records (shipments currently in progress)
    const { data: activeSlaRecords, error: activeError } = await supabase
      .from('shipment_sla')
      .select(`
        id,
        shipment_id,
        shipment_status,
        entered_at,
        breached,
        sla_config:sla_config(max_hours),
        shipment:shipments(
          shipment_ref,
          client_ref,
          client:clients(name)
        )
      `)
      .is('exited_at', null);

    if (activeError) {
      console.error('[daily-sla-digest] Error fetching active SLA records:', activeError);
      throw activeError;
    }

    // Fetch completed SLA records from the last 24 hours
    const { data: completedSlaRecords, error: completedError } = await supabase
      .from('shipment_sla')
      .select(`
        id,
        shipment_id,
        shipment_status,
        entered_at,
        exited_at,
        elapsed_hours,
        breached,
        sla_config:sla_config(max_hours),
        shipment:shipments(
          shipment_ref,
          client_ref,
          client:clients(name)
        )
      `)
      .not('exited_at', 'is', null)
      .gte('exited_at', yesterdayISO);

    if (completedError) {
      console.error('[daily-sla-digest] Error fetching completed SLA records:', completedError);
      throw completedError;
    }

    const activeRecords = activeSlaRecords || [];
    const completedRecords = completedSlaRecords || [];
    const breachedCompleted = completedRecords.filter(r => r.breached === true);

    console.log(`[daily-sla-digest] Found ${activeRecords.length} active, ${completedRecords.length} completed (${breachedCompleted.length} breaches)`);

    // Calculate at-risk shipments
    const atRiskShipments: { shipmentRef: string; client: string; status: string; percentUsed: number; hoursRemaining: number }[] = [];
    let criticalCount = 0;

    for (const record of activeRecords) {
      const maxHours = (record.sla_config as any)?.max_hours;
      if (!maxHours) continue;

      const enteredAt = new Date(record.entered_at);
      const elapsedMs = now.getTime() - enteredAt.getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      const percentUsed = (elapsedHours / maxHours) * 100;

      if (percentUsed >= 75 && percentUsed < 100) {
        if (percentUsed >= 90) criticalCount++;
        atRiskShipments.push({
          shipmentRef: (record.shipment as any)?.shipment_ref || 'Unknown',
          client: (record.shipment as any)?.client?.name || 'Unknown',
          status: STATUS_LABELS[record.shipment_status] || record.shipment_status,
          percentUsed: Math.round(percentUsed),
          hoursRemaining: Math.round((maxHours - elapsedHours) * 10) / 10,
        });
      }
    }

    // Sort at-risk by percent used descending
    atRiskShipments.sort((a, b) => b.percentUsed - a.percentUsed);

    // Calculate metrics
    const totalCompleted = completedRecords.length;
    const totalBreaches = breachedCompleted.length;
    const complianceRate = totalCompleted > 0 
      ? Math.round(((totalCompleted - totalBreaches) / totalCompleted) * 100)
      : 100;

    // Average completion time
    let avgCompletionTime = 0;
    if (completedRecords.length > 0) {
      const totalTime = completedRecords.reduce((sum, r) => sum + (r.elapsed_hours || 0), 0);
      avgCompletionTime = totalTime / completedRecords.length;
    }

    // Status breakdown
    const statusMap: Record<string, { active: number; completed: number; breached: number }> = {};
    
    for (const r of activeRecords) {
      if (!statusMap[r.shipment_status]) {
        statusMap[r.shipment_status] = { active: 0, completed: 0, breached: 0 };
      }
      statusMap[r.shipment_status].active++;
    }
    
    for (const r of completedRecords) {
      if (!statusMap[r.shipment_status]) {
        statusMap[r.shipment_status] = { active: 0, completed: 0, breached: 0 };
      }
      statusMap[r.shipment_status].completed++;
      if (r.breached) {
        statusMap[r.shipment_status].breached++;
      }
    }

    const statusBreakdown = Object.entries(statusMap)
      .map(([status, data]) => ({
        status: STATUS_LABELS[status] || status,
        statusKey: status,
        ...data,
      }))
      .sort((a, b) => (b.active + b.completed) - (a.active + a.completed));

    // Client breakdown
    const clientMap: Record<string, { active: number; breached: number }> = {};
    
    for (const r of activeRecords) {
      const clientName = (r.shipment as any)?.client?.name || 'Unknown';
      if (!clientMap[clientName]) {
        clientMap[clientName] = { active: 0, breached: 0 };
      }
      clientMap[clientName].active++;
    }
    
    for (const r of breachedCompleted) {
      const clientName = (r.shipment as any)?.client?.name || 'Unknown';
      if (!clientMap[clientName]) {
        clientMap[clientName] = { active: 0, breached: 0 };
      }
      clientMap[clientName].breached++;
    }

    const clientBreakdown = Object.entries(clientMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.breached - a.breached || b.active - a.active)
      .slice(0, 10);

    // Recent breaches (top 5)
    const recentBreaches = breachedCompleted
      .map(r => ({
        shipmentRef: (r.shipment as any)?.shipment_ref || 'Unknown',
        client: (r.shipment as any)?.client?.name || 'Unknown',
        status: STATUS_LABELS[r.shipment_status] || r.shipment_status,
        elapsed: r.elapsed_hours || 0,
        target: (r.sla_config as any)?.max_hours || 0,
        breachedAt: r.exited_at || '',
      }))
      .sort((a, b) => new Date(b.breachedAt).getTime() - new Date(a.breachedAt).getTime())
      .slice(0, 5);

    const metrics: DailySLAMetrics = {
      totalActive: activeRecords.length,
      totalCompleted,
      totalBreaches,
      complianceRate,
      atRiskCount: atRiskShipments.length,
      criticalCount,
      avgCompletionTime,
      statusBreakdown,
      clientBreakdown,
      recentBreaches,
      upcomingRisks: atRiskShipments.slice(0, 5),
    };

    console.log('[daily-sla-digest] Metrics calculated:', JSON.stringify(metrics));

    // Fetch manager emails
    const { data: managerRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'MANAGER');

    if (rolesError) {
      console.error('[daily-sla-digest] Error fetching manager roles:', rolesError);
      throw rolesError;
    }

    if (!managerRoles || managerRoles.length === 0) {
      console.log('[daily-sla-digest] No managers to notify');
      return new Response(
        JSON.stringify({ success: true, message: 'No managers configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userIds = managerRoles.map(r => r.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('email, name')
      .in('id', userIds)
      .eq('is_active', true);

    if (profilesError) {
      console.error('[daily-sla-digest] Error fetching profiles:', profilesError);
      throw profilesError;
    }

    const recipientEmails = profiles?.map(p => p.email).filter(Boolean) || [];

    if (recipientEmails.length === 0) {
      console.log('[daily-sla-digest] No valid email addresses found');
      return new Response(
        JSON.stringify({ success: true, message: 'No valid recipients' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format date for display
    const reportDate = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Generate status breakdown rows
    const statusRows = statusBreakdown.length > 0
      ? statusBreakdown.map(s => `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">
              <span style="display: inline-block; padding: 2px 10px; background: ${getStatusColor(s.statusKey)}20; color: ${getStatusColor(s.statusKey)}; border-radius: 4px; font-size: 12px; font-weight: 600;">${s.status}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #3b82f6; font-weight: 600;">${s.active}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #22c55e; font-weight: 600;">${s.completed}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: ${s.breached > 0 ? '#dc2626' : '#6b7280'}; font-weight: ${s.breached > 0 ? 'bold' : 'normal'};">${s.breached}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #6b7280;">No SLA data today</td></tr>';

    // Generate at-risk rows
    const atRiskRows = metrics.upcomingRisks.length > 0
      ? metrics.upcomingRisks.map(s => {
          const riskColor = getRiskColor(s.percentUsed);
          const riskEmoji = s.percentUsed >= 90 ? '🚨' : '⚠️';
          return `
            <tr style="background: ${s.percentUsed >= 90 ? '#fef2f2' : '#fffbeb'};">
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">
                <span style="font-weight: 600;">${s.shipmentRef}</span><br>
                <span style="font-size: 12px; color: #6b7280;">${s.client}</span>
              </td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">
                <span style="font-size: 12px; color: #6b7280;">${s.status}</span>
              </td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                <span style="font-weight: 600; color: ${riskColor};">${s.percentUsed}%</span>
              </td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                <span style="font-weight: 600; color: ${riskColor};">${formatHours(s.hoursRemaining)}</span>
              </td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                ${riskEmoji}
              </td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #22c55e;">✅ No at-risk shipments!</td></tr>';

    // Generate recent breach rows
    const breachRows = recentBreaches.length > 0
      ? recentBreaches.map(b => `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">
              <span style="font-weight: 600;">${b.shipmentRef}</span><br>
              <span style="font-size: 12px; color: #6b7280;">${b.client}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${b.status}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
              <span style="color: #dc2626; font-weight: 600;">${formatHours(b.elapsed)}</span>
              <span style="color: #6b7280;"> / ${formatHours(b.target)}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
              <span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">+${formatHours(b.elapsed - b.target)}</span>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #22c55e;">🎉 No breaches in the last 24 hours!</td></tr>';

    // Generate client breakdown rows
    const clientRows = clientBreakdown.length > 0
      ? clientBreakdown.slice(0, 5).map(c => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${c.name}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #3b82f6; font-weight: 600;">${c.active}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: ${c.breached > 0 ? '#dc2626' : '#6b7280'}; font-weight: ${c.breached > 0 ? 'bold' : 'normal'};">${c.breached}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #6b7280;">No client data</td></tr>';

    const complianceColor = getComplianceColor(metrics.complianceRate);
    const overallEmoji = metrics.complianceRate >= 90 ? '✅' : metrics.complianceRate >= 70 ? '⚠️' : '🚨';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Daily SLA Digest</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
          <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">📊 Daily SLA Digest</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">${reportDate}</p>
            </div>

            <!-- Key Metrics -->
            <div style="padding: 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                ${overallEmoji} Today's Overview
              </h2>
              
              <table style="width: 100%; border-collapse: separate; border-spacing: 8px;">
                <tr>
                  <td style="background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center; width: 20%;">
                    <div style="font-size: 32px; font-weight: bold; color: #1e40af;">${metrics.totalActive}</div>
                    <div style="font-size: 12px; color: #3b82f6; margin-top: 4px;">Active</div>
                  </td>
                  <td style="background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center; width: 20%;">
                    <div style="font-size: 32px; font-weight: bold; color: #16a34a;">${metrics.totalCompleted}</div>
                    <div style="font-size: 12px; color: #22c55e; margin-top: 4px;">Completed</div>
                  </td>
                  <td style="background: #fef2f2; border-radius: 8px; padding: 16px; text-align: center; width: 20%;">
                    <div style="font-size: 32px; font-weight: bold; color: #dc2626;">${metrics.totalBreaches}</div>
                    <div style="font-size: 12px; color: #ef4444; margin-top: 4px;">Breaches</div>
                  </td>
                  <td style="background: ${metrics.complianceRate >= 90 ? '#f0fdf4' : metrics.complianceRate >= 70 ? '#fffbeb' : '#fef2f2'}; border-radius: 8px; padding: 16px; text-align: center; width: 20%;">
                    <div style="font-size: 32px; font-weight: bold; color: ${complianceColor};">${metrics.complianceRate}%</div>
                    <div style="font-size: 12px; color: ${complianceColor}; margin-top: 4px;">Compliance</div>
                  </td>
                  <td style="background: #fffbeb; border-radius: 8px; padding: 16px; text-align: center; width: 20%;">
                    <div style="font-size: 32px; font-weight: bold; color: #f59e0b;">${metrics.atRiskCount}</div>
                    <div style="font-size: 12px; color: #d97706; margin-top: 4px;">At Risk</div>
                  </td>
                </tr>
              </table>
            </div>

            <!-- At-Risk Shipments -->
            ${metrics.upcomingRisks.length > 0 ? `
            <div style="padding: 0 24px 24px 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                ⚠️ Shipments Approaching SLA Limits
              </h2>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Shipment</th>
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                    <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Used</th>
                    <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Left</th>
                    <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  ${atRiskRows}
                </tbody>
              </table>
            </div>
            ` : ''}

            <!-- Recent Breaches -->
            <div style="padding: 0 24px 24px 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                🚨 Recent SLA Breaches (24h)
              </h2>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Shipment</th>
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                    <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Time</th>
                    <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Overage</th>
                  </tr>
                </thead>
                <tbody>
                  ${breachRows}
                </tbody>
              </table>
            </div>

            <!-- Status Breakdown -->
            <div style="padding: 0 24px 24px 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                📋 Status Breakdown
              </h2>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                    <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Active</th>
                    <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Completed</th>
                    <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Breached</th>
                  </tr>
                </thead>
                <tbody>
                  ${statusRows}
                </tbody>
              </table>
            </div>

            <!-- Client Breakdown -->
            <div style="padding: 0 24px 24px 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                🏢 Top Clients
              </h2>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Client</th>
                    <th style="padding: 8px 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Active</th>
                    <th style="padding: 8px 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Breached</th>
                  </tr>
                </thead>
                <tbody>
                  ${clientRows}
                </tbody>
              </table>
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 13px;">
                This is an automated daily SLA summary report sent to managers.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 12px;">
                DHL Express Customs Tracking System
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    console.log(`[daily-sla-digest] Sending email to ${recipientEmails.length} managers`);

    const emailResponse = await resend.emails.send({
      from: 'SLA Reports <onboarding@resend.dev>',
      to: recipientEmails,
      subject: `📊 Daily SLA Digest: ${metrics.complianceRate}% Compliance | ${metrics.totalActive} Active | ${metrics.atRiskCount} At Risk`,
      html: emailHtml,
    });

    console.log('[daily-sla-digest] Email sent successfully:', emailResponse);

    // Log to audit
    await supabase.from('audit_log').insert({
      entity_type: 'report',
      action: 'DAILY_SLA_DIGEST_SENT',
      metadata_json: {
        metrics,
        recipientCount: recipientEmails.length,
        emailId: emailResponse.data?.id,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        metrics,
        recipientCount: recipientEmails.length,
        emailId: emailResponse.data?.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[daily-sla-digest] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
