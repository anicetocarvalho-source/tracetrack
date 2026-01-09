import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SLATargets {
  P1: number;
  P2: number;
  P3: number;
}

interface WeeklyMetrics {
  totalCreated: number;
  totalResolved: number;
  totalOpen: number;
  bySeverity: {
    P1: { created: number; resolved: number; open: number };
    P2: { created: number; resolved: number; open: number };
    P3: { created: number; resolved: number; open: number };
  };
  avgResolutionTimeHours: number;
  slaCompliance: number;
  topClients: { name: string; exceptions: number }[];
  escalations: number;
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'P1': return '#dc2626';
    case 'P2': return '#f59e0b';
    case 'P3': return '#3b82f6';
    default: return '#6b7280';
  }
}

function getComplianceColor(percent: number): string {
  if (percent >= 90) return '#16a34a';
  if (percent >= 70) return '#f59e0b';
  return '#dc2626';
}

function formatHours(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours.toFixed(0)}h`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[weekly-exception-report] Starting weekly report generation');

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[weekly-exception-report] RESEND_API_KEY not configured');
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

    console.log(`[weekly-exception-report] Fetching data from ${weekAgoISO} to ${now.toISOString()}`);

    // Fetch SLA targets from settings
    const { data: slaSettingData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'sla_targets')
      .single();

    const slaTargets: SLATargets = (slaSettingData?.value as SLATargets) || { P1: 4, P2: 24, P3: 72 };

    // Fetch all exceptions created this week
    const { data: createdExceptions, error: createdError } = await supabase
      .from('shipment_exceptions')
      .select(`
        id,
        severity,
        status,
        detected_at,
        resolved_at,
        shipment:shipments(client:clients(name))
      `)
      .gte('detected_at', weekAgoISO);

    if (createdError) {
      console.error('[weekly-exception-report] Error fetching created exceptions:', createdError);
      throw createdError;
    }

    // Fetch exceptions resolved this week
    const { data: resolvedExceptions, error: resolvedError } = await supabase
      .from('shipment_exceptions')
      .select('id, severity, detected_at, resolved_at')
      .eq('status', 'RESOLVED')
      .gte('resolved_at', weekAgoISO);

    if (resolvedError) {
      console.error('[weekly-exception-report] Error fetching resolved exceptions:', resolvedError);
      throw resolvedError;
    }

    // Fetch currently open exceptions
    const { data: openExceptions, error: openError } = await supabase
      .from('shipment_exceptions')
      .select('id, severity, detected_at')
      .in('status', ['OPEN', 'ACKNOWLEDGED']);

    if (openError) {
      console.error('[weekly-exception-report] Error fetching open exceptions:', openError);
      throw openError;
    }

    // Calculate metrics
    const metrics: WeeklyMetrics = {
      totalCreated: createdExceptions?.length || 0,
      totalResolved: resolvedExceptions?.length || 0,
      totalOpen: openExceptions?.length || 0,
      bySeverity: {
        P1: { created: 0, resolved: 0, open: 0 },
        P2: { created: 0, resolved: 0, open: 0 },
        P3: { created: 0, resolved: 0, open: 0 },
      },
      avgResolutionTimeHours: 0,
      slaCompliance: 0,
      topClients: [],
      escalations: 0,
    };

    // Count by severity
    createdExceptions?.forEach(ex => {
      const sev = ex.severity as 'P1' | 'P2' | 'P3';
      if (metrics.bySeverity[sev]) {
        metrics.bySeverity[sev].created++;
      }
    });

    resolvedExceptions?.forEach(ex => {
      const sev = ex.severity as 'P1' | 'P2' | 'P3';
      if (metrics.bySeverity[sev]) {
        metrics.bySeverity[sev].resolved++;
      }
    });

    openExceptions?.forEach(ex => {
      const sev = ex.severity as 'P1' | 'P2' | 'P3';
      if (metrics.bySeverity[sev]) {
        metrics.bySeverity[sev].open++;
      }
    });

    // Calculate average resolution time and SLA compliance
    if (resolvedExceptions && resolvedExceptions.length > 0) {
      let totalResolutionHours = 0;
      let withinSLA = 0;

      resolvedExceptions.forEach(ex => {
        const detectedAt = new Date(ex.detected_at);
        const resolvedAt = new Date(ex.resolved_at);
        const resolutionHours = (resolvedAt.getTime() - detectedAt.getTime()) / (1000 * 60 * 60);
        totalResolutionHours += resolutionHours;

        const sev = ex.severity as 'P1' | 'P2' | 'P3';
        if (resolutionHours <= slaTargets[sev]) {
          withinSLA++;
        }
      });

      metrics.avgResolutionTimeHours = totalResolutionHours / resolvedExceptions.length;
      metrics.slaCompliance = Math.round((withinSLA / resolvedExceptions.length) * 100);
    }

    // Top clients with exceptions this week
    const clientCounts: Record<string, number> = {};
    createdExceptions?.forEach(ex => {
      const clientName = (ex.shipment as any)?.client?.name || 'Unknown';
      clientCounts[clientName] = (clientCounts[clientName] || 0) + 1;
    });

    metrics.topClients = Object.entries(clientCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, exceptions]) => ({ name, exceptions }));

    console.log('[weekly-exception-report] Metrics calculated:', JSON.stringify(metrics));

    // Fetch manager emails
    const { data: managerRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'MANAGER');

    if (rolesError) {
      console.error('[weekly-exception-report] Error fetching manager roles:', rolesError);
      throw rolesError;
    }

    if (!managerRoles || managerRoles.length === 0) {
      console.log('[weekly-exception-report] No managers to notify');
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
      console.error('[weekly-exception-report] Error fetching profiles:', profilesError);
      throw profilesError;
    }

    const recipientEmails = profiles?.map(p => p.email).filter(Boolean) || [];

    if (recipientEmails.length === 0) {
      console.log('[weekly-exception-report] No valid email addresses found');
      return new Response(
        JSON.stringify({ success: true, message: 'No valid recipients' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format dates for display
    const weekStart = weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekEnd = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const reportPeriod = `${weekStart} - ${weekEnd}`;

    // Generate email HTML
    const complianceColor = getComplianceColor(metrics.slaCompliance);
    const trendEmoji = metrics.totalResolved >= metrics.totalCreated ? '📈' : '📉';

    const topClientsRows = metrics.topClients.length > 0
      ? metrics.topClients.map(c => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${c.name}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">${c.exceptions}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="2" style="padding: 12px; text-align: center; color: #6b7280;">No exceptions this week</td></tr>';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Weekly Exception Report</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
          <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">📊 Weekly Exception Report</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">${reportPeriod}</p>
            </div>

            <!-- Key Metrics -->
            <div style="padding: 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                ${trendEmoji} Key Metrics
              </h2>
              
              <div style="display: table; width: 100%; border-collapse: separate; border-spacing: 12px 0;">
                <div style="display: table-row;">
                  <div style="display: table-cell; background: #fef3c7; border-radius: 8px; padding: 16px; text-align: center; width: 25%;">
                    <div style="font-size: 32px; font-weight: bold; color: #92400e;">${metrics.totalCreated}</div>
                    <div style="font-size: 12px; color: #92400e; margin-top: 4px;">Created</div>
                  </div>
                  <div style="display: table-cell; background: #d1fae5; border-radius: 8px; padding: 16px; text-align: center; width: 25%;">
                    <div style="font-size: 32px; font-weight: bold; color: #065f46;">${metrics.totalResolved}</div>
                    <div style="font-size: 12px; color: #065f46; margin-top: 4px;">Resolved</div>
                  </div>
                  <div style="display: table-cell; background: #fee2e2; border-radius: 8px; padding: 16px; text-align: center; width: 25%;">
                    <div style="font-size: 32px; font-weight: bold; color: #991b1b;">${metrics.totalOpen}</div>
                    <div style="font-size: 12px; color: #991b1b; margin-top: 4px;">Still Open</div>
                  </div>
                  <div style="display: table-cell; background: #ede9fe; border-radius: 8px; padding: 16px; text-align: center; width: 25%;">
                    <div style="font-size: 32px; font-weight: bold; color: ${complianceColor};">${metrics.slaCompliance}%</div>
                    <div style="font-size: 12px; color: #5b21b6; margin-top: 4px;">SLA Compliance</div>
                  </div>
                </div>
              </div>

              ${metrics.avgResolutionTimeHours > 0 ? `
              <div style="margin-top: 16px; padding: 12px 16px; background: #f9fafb; border-radius: 6px;">
                <span style="color: #6b7280; font-size: 14px;">Average Resolution Time:</span>
                <span style="color: #374151; font-weight: bold; margin-left: 8px;">${formatHours(metrics.avgResolutionTimeHours)}</span>
              </div>
              ` : ''}
            </div>

            <!-- Breakdown by Severity -->
            <div style="padding: 0 24px 24px 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                🎯 Breakdown by Severity
              </h2>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Severity</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Created</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Resolved</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Open</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">SLA Target</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                      <span style="display: inline-block; padding: 2px 10px; background: ${getSeverityColor('P1')}; color: white; border-radius: 4px; font-size: 12px; font-weight: bold;">P1 Critical</span>
                    </td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${metrics.bySeverity.P1.created}</td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #16a34a;">${metrics.bySeverity.P1.resolved}</td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: ${metrics.bySeverity.P1.open > 0 ? '#dc2626' : '#6b7280'};">${metrics.bySeverity.P1.open}</td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${slaTargets.P1}h</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                      <span style="display: inline-block; padding: 2px 10px; background: ${getSeverityColor('P2')}; color: white; border-radius: 4px; font-size: 12px; font-weight: bold;">P2 High</span>
                    </td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${metrics.bySeverity.P2.created}</td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #16a34a;">${metrics.bySeverity.P2.resolved}</td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: ${metrics.bySeverity.P2.open > 0 ? '#f59e0b' : '#6b7280'};">${metrics.bySeverity.P2.open}</td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${slaTargets.P2}h</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                      <span style="display: inline-block; padding: 2px 10px; background: ${getSeverityColor('P3')}; color: white; border-radius: 4px; font-size: 12px; font-weight: bold;">P3 Medium</span>
                    </td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${metrics.bySeverity.P3.created}</td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #16a34a;">${metrics.bySeverity.P3.resolved}</td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: ${metrics.bySeverity.P3.open > 0 ? '#3b82f6' : '#6b7280'};">${metrics.bySeverity.P3.open}</td>
                    <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${slaTargets.P3}h</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Top Clients -->
            <div style="padding: 0 24px 24px 24px;">
              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                🏢 Top Clients with Exceptions
              </h2>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Client</th>
                    <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Exceptions</th>
                  </tr>
                </thead>
                <tbody>
                  ${topClientsRows}
                </tbody>
              </table>
            </div>

            <!-- SLA Compliance Status -->
            <div style="padding: 0 24px 24px 24px;">
              ${metrics.slaCompliance >= 90 ? `
              <div style="padding: 16px; background: #f0fdf4; border-radius: 6px; border-left: 4px solid #16a34a;">
                <p style="margin: 0; color: #166534; font-size: 14px;">
                  <strong>✅ Excellent Performance!</strong> SLA compliance is at ${metrics.slaCompliance}%, exceeding the 90% target.
                </p>
              </div>
              ` : metrics.slaCompliance >= 70 ? `
              <div style="padding: 16px; background: #fffbeb; border-radius: 6px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>⚠️ Attention Needed:</strong> SLA compliance is at ${metrics.slaCompliance}%, below the 90% target. Consider reviewing open exceptions.
                </p>
              </div>
              ` : `
              <div style="padding: 16px; background: #fef2f2; border-radius: 6px; border-left: 4px solid #dc2626;">
                <p style="margin: 0; color: #991b1b; font-size: 14px;">
                  <strong>🚨 Critical:</strong> SLA compliance is at ${metrics.slaCompliance}%, significantly below target. Immediate action required to improve resolution times.
                </p>
              </div>
              `}
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                DHL Shipment Tracking System • Weekly Summary Report
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px;">
                This is an automated report. To update report settings, visit the Settings page.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const subject = `📊 Weekly Exception Report: ${metrics.totalCreated} Created, ${metrics.totalResolved} Resolved (${reportPeriod})`;

    console.log(`[weekly-exception-report] Sending report to ${recipientEmails.length} managers`);

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: 'DHL Tracking <onboarding@resend.dev>',
      to: recipientEmails,
      subject: subject,
      html: emailHtml,
    });

    if (emailError) {
      console.error('[weekly-exception-report] Error sending email:', emailError);
      throw emailError;
    }

    console.log('[weekly-exception-report] Report sent successfully:', emailResult);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Weekly report sent to ${recipientEmails.length} manager(s)`,
        metrics,
        recipients: recipientEmails.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[weekly-exception-report] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
