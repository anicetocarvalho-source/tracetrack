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

interface AtRiskException {
  id: string;
  severity: string;
  shipment_ref: string;
  client_name: string;
  rule_name: string;
  current_status: string;
  hours_open: number;
  sla_target: number;
  percent_used: number;
  hours_remaining: number;
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'P1': return '#dc2626';
    case 'P2': return '#f59e0b';
    case 'P3': return '#3b82f6';
    default: return '#6b7280';
  }
}

function getSeverityBadge(severity: string): string {
  const color = getSeverityColor(severity);
  return `<span style="display: inline-block; padding: 2px 8px; background: ${color}; color: white; border-radius: 4px; font-size: 12px; font-weight: bold;">${severity}</span>`;
}

function getUrgencyBadge(percentUsed: number): string {
  if (percentUsed >= 90) {
    return `<span style="display: inline-block; padding: 2px 8px; background: #dc2626; color: white; border-radius: 4px; font-size: 11px; font-weight: bold;">🔥 CRITICAL</span>`;
  } else if (percentUsed >= 80) {
    return `<span style="display: inline-block; padding: 2px 8px; background: #f97316; color: white; border-radius: 4px; font-size: 11px; font-weight: bold;">⚠️ HIGH RISK</span>`;
  } else {
    return `<span style="display: inline-block; padding: 2px 8px; background: #eab308; color: white; border-radius: 4px; font-size: 11px; font-weight: bold;">⏰ AT RISK</span>`;
  }
}

function formatHours(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return `${days}d ${remainingHours}h`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[sla-breach-alert] Starting SLA breach check');

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[sla-breach-alert] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch SLA targets from settings
    const { data: slaSettingData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'sla_targets')
      .single();

    const slaTargets: SLATargets = (slaSettingData?.value as SLATargets) || { P1: 4, P2: 24, P3: 72 };
    
    // Alert threshold: notify when exception has used 75% or more of SLA time
    const ALERT_THRESHOLD = 0.75;

    console.log('[sla-breach-alert] SLA targets:', slaTargets);

    // Fetch open/acknowledged exceptions
    const { data: openExceptions, error: exceptionsError } = await supabase
      .from('shipment_exceptions')
      .select(`
        id,
        severity,
        detected_at,
        status,
        exception_rule:exception_rules(name),
        shipment:shipments(
          shipment_ref,
          current_status,
          client:clients(name)
        )
      `)
      .in('status', ['OPEN', 'ACKNOWLEDGED']);

    if (exceptionsError) {
      console.error('[sla-breach-alert] Error fetching exceptions:', exceptionsError);
      throw exceptionsError;
    }

    if (!openExceptions || openExceptions.length === 0) {
      console.log('[sla-breach-alert] No open exceptions');
      return new Response(
        JSON.stringify({ success: true, message: 'No open exceptions', atRisk: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const atRiskExceptions: AtRiskException[] = [];

    // Check each exception against SLA
    openExceptions.forEach(ex => {
      const severity = ex.severity as 'P1' | 'P2' | 'P3';
      const slaTarget = slaTargets[severity];
      const detectedAt = new Date(ex.detected_at);
      const hoursOpen = (now.getTime() - detectedAt.getTime()) / (1000 * 60 * 60);
      const percentUsed = hoursOpen / slaTarget;
      const hoursRemaining = slaTarget - hoursOpen;

      // Alert if 75%+ of SLA time used but not yet breached
      if (percentUsed >= ALERT_THRESHOLD && percentUsed < 1) {
        atRiskExceptions.push({
          id: ex.id,
          severity: ex.severity,
          shipment_ref: (ex.shipment as any)?.shipment_ref || 'Unknown',
          client_name: (ex.shipment as any)?.client?.name || 'Unknown',
          rule_name: (ex.exception_rule as any)?.name || 'Unknown',
          current_status: (ex.shipment as any)?.current_status || 'Unknown',
          hours_open: Math.round(hoursOpen * 10) / 10,
          sla_target: slaTarget,
          percent_used: Math.round(percentUsed * 100),
          hours_remaining: Math.round(hoursRemaining * 10) / 10,
        });
      }
    });

    if (atRiskExceptions.length === 0) {
      console.log('[sla-breach-alert] No at-risk exceptions');
      return new Response(
        JSON.stringify({ success: true, message: 'No at-risk exceptions', atRisk: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sort by urgency (highest percent_used first)
    atRiskExceptions.sort((a, b) => b.percent_used - a.percent_used);

    console.log(`[sla-breach-alert] Found ${atRiskExceptions.length} at-risk exceptions`);

    // Fetch manager emails
    const { data: managerRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['SUPERVISOR', 'MANAGER']);

    if (rolesError) {
      console.error('[sla-breach-alert] Error fetching manager roles:', rolesError);
      throw rolesError;
    }

    if (!managerRoles || managerRoles.length === 0) {
      console.log('[sla-breach-alert] No managers/supervisors to notify');
      return new Response(
        JSON.stringify({ success: true, message: 'No managers configured', atRisk: atRiskExceptions.length }),
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
      console.error('[sla-breach-alert] Error fetching profiles:', profilesError);
      throw profilesError;
    }

    const recipientEmails = profiles?.map(p => p.email).filter(Boolean) || [];

    if (recipientEmails.length === 0) {
      console.log('[sla-breach-alert] No valid email addresses found');
      return new Response(
        JSON.stringify({ success: true, message: 'No valid recipients', atRisk: atRiskExceptions.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count by severity
    const criticalCount = atRiskExceptions.filter(e => e.percent_used >= 90).length;
    const highRiskCount = atRiskExceptions.filter(e => e.percent_used >= 80 && e.percent_used < 90).length;
    const atRiskCount = atRiskExceptions.filter(e => e.percent_used < 80).length;

    const p1AtRisk = atRiskExceptions.filter(e => e.severity === 'P1').length;

    // Generate email HTML
    const exceptionRows = atRiskExceptions.map(ex => `
      <tr style="background: ${ex.percent_used >= 90 ? '#fef2f2' : ex.percent_used >= 80 ? '#fffbeb' : 'white'};">
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          ${getUrgencyBadge(ex.percent_used)}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          ${getSeverityBadge(ex.severity)}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${ex.shipment_ref}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${ex.client_name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${ex.rule_name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <div style="width: 100px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
            <div style="width: ${Math.min(ex.percent_used, 100)}%; height: 8px; background: ${ex.percent_used >= 90 ? '#dc2626' : ex.percent_used >= 80 ? '#f97316' : '#eab308'};"></div>
          </div>
          <span style="font-size: 11px; color: #6b7280;">${ex.percent_used}% used</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: ${ex.hours_remaining < 1 ? '#dc2626' : '#374151'};">
          ${formatHours(ex.hours_remaining)} left
        </td>
      </tr>
    `).join('');

    const headerColor = criticalCount > 0 ? '#dc2626' : highRiskCount > 0 ? '#f97316' : '#eab308';
    const headerEmoji = criticalCount > 0 ? '🚨' : '⏰';

    const subject = criticalCount > 0
      ? `🚨 SLA BREACH IMMINENT: ${criticalCount} Exception${criticalCount > 1 ? 's' : ''} About to Breach${p1AtRisk > 0 ? ` (${p1AtRisk} P1)` : ''}`
      : `⏰ SLA Warning: ${atRiskExceptions.length} Exception${atRiskExceptions.length > 1 ? 's' : ''} at Risk`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>SLA Breach Alert</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
          <div style="max-width: 900px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: ${headerColor}; padding: 24px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">${headerEmoji} SLA Breach Warning</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">
                ${atRiskExceptions.length} exception${atRiskExceptions.length > 1 ? 's are' : ' is'} at risk of breaching SLA
              </p>
            </div>

            <!-- Summary -->
            <div style="padding: 24px;">
              <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                ${criticalCount > 0 ? `
                <div style="flex: 1; background: #fef2f2; border-radius: 8px; padding: 16px; text-align: center; border: 2px solid #fecaca;">
                  <div style="font-size: 28px; font-weight: bold; color: #dc2626;">${criticalCount}</div>
                  <div style="font-size: 12px; color: #991b1b;">🔥 Critical (&gt;90%)</div>
                </div>
                ` : ''}
                ${highRiskCount > 0 ? `
                <div style="flex: 1; background: #fff7ed; border-radius: 8px; padding: 16px; text-align: center; border: 2px solid #fed7aa;">
                  <div style="font-size: 28px; font-weight: bold; color: #ea580c;">${highRiskCount}</div>
                  <div style="font-size: 12px; color: #9a3412;">⚠️ High Risk (80-90%)</div>
                </div>
                ` : ''}
                ${atRiskCount > 0 ? `
                <div style="flex: 1; background: #fefce8; border-radius: 8px; padding: 16px; text-align: center; border: 2px solid #fef08a;">
                  <div style="font-size: 28px; font-weight: bold; color: #ca8a04;">${atRiskCount}</div>
                  <div style="font-size: 12px; color: #854d0e;">⏰ At Risk (75-80%)</div>
                </div>
                ` : ''}
              </div>

              <!-- Exception table -->
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Urgency</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Severity</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Shipment</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Client</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Exception</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">SLA Usage</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Time Left</th>
                  </tr>
                </thead>
                <tbody>
                  ${exceptionRows}
                </tbody>
              </table>

              <!-- Urgent action notice -->
              <div style="margin-top: 24px; padding: 16px; background: #fef2f2; border-radius: 6px; border-left: 4px solid #dc2626;">
                <p style="margin: 0; color: #991b1b; font-size: 14px;">
                  <strong>⚡ Action Required:</strong> These exceptions are approaching their SLA deadlines. Please review and resolve them immediately to maintain SLA compliance.
                </p>
              </div>

              <!-- SLA targets reference -->
              <div style="margin-top: 16px; padding: 12px 16px; background: #f9fafb; border-radius: 6px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280; font-weight: 600;">Current SLA Targets:</p>
                <div style="display: flex; gap: 24px; font-size: 12px; color: #374151;">
                  <span><strong>P1:</strong> ${slaTargets.P1}h</span>
                  <span><strong>P2:</strong> ${slaTargets.P2}h</span>
                  <span><strong>P3:</strong> ${slaTargets.P3}h</span>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                DHL Shipment Tracking System • SLA Breach Warning
              </p>
              <p style="margin: 4px 0 0 0; color: #9ca3af; font-size: 11px;">
                This alert is sent when exceptions reach 75% of their SLA time limit.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    console.log(`[sla-breach-alert] Sending alert to ${recipientEmails.length} recipients`);

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: 'DHL Tracking <onboarding@resend.dev>',
      to: recipientEmails,
      subject: subject,
      html: emailHtml,
    });

    if (emailError) {
      console.error('[sla-breach-alert] Error sending email:', emailError);
      throw emailError;
    }

    console.log('[sla-breach-alert] Alert sent successfully:', emailResult);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `SLA breach alert sent to ${recipientEmails.length} recipient(s)`,
        atRisk: atRiskExceptions.length,
        critical: criticalCount,
        highRisk: highRiskCount,
        recipients: recipientEmails.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sla-breach-alert] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
