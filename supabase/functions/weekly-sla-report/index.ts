import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WeeklySLAMetrics {
  totalTransitions: number;
  totalBreaches: number;
  complianceRate: number;
  avgElapsedHours: number;
  avgOverageHours: number;
  breachesByStatus: { status: string; count: number; avgOverage: number }[];
  breachesByClient: { name: string; count: number }[];
  worstBreaches: { shipmentRef: string; client: string; status: string; elapsed: number; target: number; overage: number }[];
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[weekly-sla-report] Starting weekly SLA report generation');

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[weekly-sla-report] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate date range for last 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoISO = weekAgo.toISOString();

    console.log(`[weekly-sla-report] Fetching data from ${weekAgoISO} to ${now.toISOString()}`);

    // Fetch all SLA records with breaches from last week
    const { data: slaRecords, error: slaError } = await supabase
      .from('shipment_sla')
      .select(`
        id,
        shipment_status,
        elapsed_hours,
        breached,
        entered_at,
        exited_at,
        sla_config:sla_config(max_hours),
        shipment:shipments(
          shipment_ref,
          client_ref,
          client:clients(name)
        )
      `)
      .not('exited_at', 'is', null)
      .gte('exited_at', weekAgoISO);

    if (slaError) {
      console.error('[weekly-sla-report] Error fetching SLA records:', slaError);
      throw slaError;
    }

    const records = slaRecords || [];
    const breachedRecords = records.filter(r => r.breached === true);

    console.log(`[weekly-sla-report] Found ${records.length} transitions, ${breachedRecords.length} breaches`);

    // Calculate metrics
    const metrics: WeeklySLAMetrics = {
      totalTransitions: records.length,
      totalBreaches: breachedRecords.length,
      complianceRate: records.length > 0 
        ? Math.round(((records.length - breachedRecords.length) / records.length) * 100)
        : 100,
      avgElapsedHours: 0,
      avgOverageHours: 0,
      breachesByStatus: [],
      breachesByClient: [],
      worstBreaches: [],
    };

    // Calculate average elapsed and overage hours for breaches
    if (breachedRecords.length > 0) {
      let totalElapsed = 0;
      let totalOverage = 0;

      breachedRecords.forEach(r => {
        const elapsed = r.elapsed_hours || 0;
        const maxHours = (r.sla_config as any)?.max_hours || elapsed;
        totalElapsed += elapsed;
        totalOverage += Math.max(0, elapsed - maxHours);
      });

      metrics.avgElapsedHours = totalElapsed / breachedRecords.length;
      metrics.avgOverageHours = totalOverage / breachedRecords.length;
    }

    // Breaches by status
    const statusBreaches: Record<string, { count: number; totalOverage: number }> = {};
    breachedRecords.forEach(r => {
      const status = r.shipment_status;
      if (!statusBreaches[status]) {
        statusBreaches[status] = { count: 0, totalOverage: 0 };
      }
      statusBreaches[status].count++;
      const maxHours = (r.sla_config as any)?.max_hours || 0;
      statusBreaches[status].totalOverage += Math.max(0, (r.elapsed_hours || 0) - maxHours);
    });

    metrics.breachesByStatus = Object.entries(statusBreaches)
      .map(([status, data]) => ({
        status: STATUS_LABELS[status] || status,
        count: data.count,
        avgOverage: Math.round(data.totalOverage / data.count),
      }))
      .sort((a, b) => b.count - a.count);

    // Breaches by client
    const clientBreaches: Record<string, number> = {};
    breachedRecords.forEach(r => {
      const clientName = (r.shipment as any)?.client?.name || 'Unknown';
      clientBreaches[clientName] = (clientBreaches[clientName] || 0) + 1;
    });

    metrics.breachesByClient = Object.entries(clientBreaches)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Worst breaches (top 5 by overage)
    metrics.worstBreaches = breachedRecords
      .map(r => {
        const elapsed = r.elapsed_hours || 0;
        const target = (r.sla_config as any)?.max_hours || elapsed;
        return {
          shipmentRef: (r.shipment as any)?.shipment_ref || 'Unknown',
          client: (r.shipment as any)?.client?.name || 'Unknown',
          status: STATUS_LABELS[r.shipment_status] || r.shipment_status,
          elapsed,
          target,
          overage: Math.max(0, elapsed - target),
        };
      })
      .sort((a, b) => b.overage - a.overage)
      .slice(0, 5);

    console.log('[weekly-sla-report] Metrics calculated:', JSON.stringify(metrics));

    // Fetch manager emails
    const { data: managerRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'MANAGER');

    if (rolesError) {
      console.error('[weekly-sla-report] Error fetching manager roles:', rolesError);
      throw rolesError;
    }

    if (!managerRoles || managerRoles.length === 0) {
      console.log('[weekly-sla-report] No managers to notify');
      return new Response(
        JSON.stringify({ success: true, message: 'No managers configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userIds = managerRoles.map(r => r.user_id);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('email')
      .in('id', userIds)
      .eq('is_active', true);

    if (profilesError) {
      console.error('[weekly-sla-report] Error fetching profiles:', profilesError);
      throw profilesError;
    }

    const recipientEmails = profiles?.map(p => p.email).filter(Boolean) || [];

    if (recipientEmails.length === 0) {
      console.log('[weekly-sla-report] No valid email addresses found');
      return new Response(
        JSON.stringify({ success: true, message: 'No valid recipients' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format dates for display
    const weekStart = weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekEnd = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const reportPeriod = `${weekStart} - ${weekEnd}`;

    // Generate status breakdown rows
    const statusRows = metrics.breachesByStatus.length > 0
      ? metrics.breachesByStatus.map(s => `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">
              <span style="display: inline-block; padding: 2px 10px; background: ${getStatusColor(s.status)}20; color: ${getStatusColor(s.status)}; border-radius: 4px; font-size: 12px; font-weight: 600;">${s.status}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: #dc2626;">${s.count}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #6b7280;">${formatHours(s.avgOverage)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3" style="padding: 16px; text-align: center; color: #6b7280;">No breaches this week! 🎉</td></tr>';

    // Generate client breakdown rows
    const clientRows = metrics.breachesByClient.length > 0
      ? metrics.breachesByClient.map(c => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${c.name}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold; color: #dc2626;">${c.count}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="2" style="padding: 12px; text-align: center; color: #6b7280;">No breaches this week</td></tr>';

    // Generate worst breaches rows
    const worstRows = metrics.worstBreaches.length > 0
      ? metrics.worstBreaches.map((b, i) => `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">#${i + 1}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${b.shipmentRef}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${b.client}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">
              <span style="font-size: 12px; color: #6b7280;">${b.status}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
              <span style="color: #dc2626; font-weight: bold;">${formatHours(b.elapsed)}</span>
              <span style="color: #6b7280;"> / ${formatHours(b.target)}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
              <span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">+${formatHours(b.overage)}</span>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="6" style="padding: 16px; text-align: center; color: #6b7280;">No breaches to report</td></tr>';

    const complianceColor = getComplianceColor(metrics.complianceRate);
    const trendEmoji = metrics.complianceRate >= 90 ? '✅' : metrics.complianceRate >= 70 ? '⚠️' : '🚨';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Weekly SLA Report</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
          <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">📊 Weekly SLA Performance Report</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">${reportPeriod}</p>
            </div>

            <!-- Key Metrics -->
            <div style="padding: 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                ${trendEmoji} Key SLA Metrics
              </h2>
              
              <table style="width: 100%; border-collapse: separate; border-spacing: 12px;">
                <tr>
                  <td style="background: #eff6ff; border-radius: 8px; padding: 20px; text-align: center; width: 25%;">
                    <div style="font-size: 36px; font-weight: bold; color: #1e40af;">${metrics.totalTransitions}</div>
                    <div style="font-size: 13px; color: #3b82f6; margin-top: 4px;">Transitions</div>
                  </td>
                  <td style="background: #fef2f2; border-radius: 8px; padding: 20px; text-align: center; width: 25%;">
                    <div style="font-size: 36px; font-weight: bold; color: #dc2626;">${metrics.totalBreaches}</div>
                    <div style="font-size: 13px; color: #ef4444; margin-top: 4px;">Breaches</div>
                  </td>
                  <td style="background: ${metrics.complianceRate >= 90 ? '#f0fdf4' : metrics.complianceRate >= 70 ? '#fffbeb' : '#fef2f2'}; border-radius: 8px; padding: 20px; text-align: center; width: 25%;">
                    <div style="font-size: 36px; font-weight: bold; color: ${complianceColor};">${metrics.complianceRate}%</div>
                    <div style="font-size: 13px; color: ${complianceColor}; margin-top: 4px;">Compliance</div>
                  </td>
                  <td style="background: #faf5ff; border-radius: 8px; padding: 20px; text-align: center; width: 25%;">
                    <div style="font-size: 36px; font-weight: bold; color: #7c3aed;">${metrics.avgOverageHours > 0 ? formatHours(metrics.avgOverageHours) : '-'}</div>
                    <div style="font-size: 13px; color: #8b5cf6; margin-top: 4px;">Avg Overage</div>
                  </td>
                </tr>
              </table>
            </div>

            <!-- Breaches by Status -->
            <div style="padding: 0 24px 24px 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                📋 Breaches by Status
              </h2>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Breaches</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Avg Overage</th>
                  </tr>
                </thead>
                <tbody>
                  ${statusRows}
                </tbody>
              </table>
            </div>

            <!-- Breaches by Client -->
            <div style="padding: 0 24px 24px 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                🏢 Breaches by Client
              </h2>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Client</th>
                    <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Breaches</th>
                  </tr>
                </thead>
                <tbody>
                  ${clientRows}
                </tbody>
              </table>
            </div>

            <!-- Worst Breaches -->
            <div style="padding: 0 24px 24px 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                🚨 Top 5 Worst Breaches
              </h2>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">#</th>
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Shipment</th>
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Client</th>
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                    <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Elapsed</th>
                    <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Overage</th>
                  </tr>
                </thead>
                <tbody>
                  ${worstRows}
                </tbody>
              </table>
            </div>

            <!-- Compliance Status -->
            <div style="padding: 0 24px 24px 24px;">
              ${metrics.complianceRate >= 90 ? `
              <div style="padding: 16px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #16a34a;">
                <p style="margin: 0; color: #166534; font-size: 14px;">
                  <strong>✅ Excellent SLA Performance!</strong> Your team maintained ${metrics.complianceRate}% compliance this week, exceeding the 90% target.
                </p>
              </div>
              ` : metrics.complianceRate >= 70 ? `
              <div style="padding: 16px; background: #fffbeb; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>⚠️ SLA Compliance Needs Attention</strong> Current compliance is ${metrics.complianceRate}%, below the 90% target. Review the status breakdown above to identify improvement areas.
                </p>
              </div>
              ` : `
              <div style="padding: 16px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #dc2626;">
                <p style="margin: 0; color: #991b1b; font-size: 14px;">
                  <strong>🚨 Critical SLA Issues</strong> Compliance has dropped to ${metrics.complianceRate}%. Immediate action is required to address the ${metrics.totalBreaches} breaches recorded this week.
                </p>
              </div>
              `}
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                This is an automated weekly SLA report from Tracking Trace.<br>
                Generated on ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    console.log(`[weekly-sla-report] Sending email to ${recipientEmails.length} managers`);

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Tracking Trace <onboarding@resend.dev>',
      to: recipientEmails,
      subject: `📊 Weekly SLA Report: ${metrics.complianceRate}% Compliance | ${reportPeriod}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error('[weekly-sla-report] Error sending email:', emailError);
      throw emailError;
    }

    console.log('[weekly-sla-report] Email sent successfully:', emailData);

    // Log to audit
    await supabase.from('audit_log').insert({
      entity_type: 'report',
      action: 'WEEKLY_SLA_REPORT_SENT',
      metadata_json: {
        report_period: reportPeriod,
        recipients: recipientEmails.length,
        metrics: {
          transitions: metrics.totalTransitions,
          breaches: metrics.totalBreaches,
          compliance: metrics.complianceRate,
        },
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Weekly SLA report sent to ${recipientEmails.length} managers`,
        metrics: {
          transitions: metrics.totalTransitions,
          breaches: metrics.totalBreaches,
          complianceRate: metrics.complianceRate,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[weekly-sla-report] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
