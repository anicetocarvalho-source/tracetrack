import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AtRiskShipment {
  shipmentId: string;
  shipmentRef: string;
  clientName: string;
  currentStatus: string;
  enteredAt: string;
  elapsedHours: number;
  maxHours: number;
  percentUsed: number;
  hoursRemaining: number;
  riskLevel: 'critical' | 'warning';
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

function getRiskColor(level: 'critical' | 'warning'): { bg: string; text: string; border: string } {
  return level === 'critical'
    ? { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' }
    : { bg: '#fffbeb', text: '#92400e', border: '#fde68a' };
}

function getProgressColor(percent: number): string {
  if (percent >= 90) return '#dc2626';
  if (percent >= 75) return '#f59e0b';
  return '#3b82f6';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[daily-sla-risk-alert] Starting daily SLA risk alert check');

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[daily-sla-risk-alert] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get currently active SLA records (not yet exited) with their config
    const { data: activeSlaRecords, error: slaError } = await supabase
      .from('shipment_sla')
      .select(`
        id,
        shipment_id,
        shipment_status,
        entered_at,
        sla_config:sla_config(max_hours, client_id),
        shipment:shipments(
          id,
          shipment_ref,
          client_ref,
          current_status,
          client:clients(id, name)
        )
      `)
      .is('exited_at', null)
      .eq('breached', false);

    if (slaError) {
      console.error('[daily-sla-risk-alert] Error fetching SLA records:', slaError);
      throw slaError;
    }

    console.log(`[daily-sla-risk-alert] Found ${activeSlaRecords?.length || 0} active SLA records`);

    const now = new Date();
    const atRiskShipments: AtRiskShipment[] = [];

    // Thresholds for risk levels
    const CRITICAL_THRESHOLD = 0.90; // 90% of SLA time used
    const WARNING_THRESHOLD = 0.75;  // 75% of SLA time used

    for (const record of activeSlaRecords || []) {
      const maxHours = (record.sla_config as any)?.max_hours;
      if (!maxHours) continue;

      const enteredAt = new Date(record.entered_at);
      const elapsedMs = now.getTime() - enteredAt.getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      const percentUsed = elapsedHours / maxHours;

      if (percentUsed >= WARNING_THRESHOLD && percentUsed < 1.0) {
        const riskLevel = percentUsed >= CRITICAL_THRESHOLD ? 'critical' : 'warning';
        const hoursRemaining = Math.max(0, maxHours - elapsedHours);

        atRiskShipments.push({
          shipmentId: record.shipment_id,
          shipmentRef: (record.shipment as any)?.shipment_ref || 'Unknown',
          clientName: (record.shipment as any)?.client?.name || 'Unknown',
          currentStatus: STATUS_LABELS[record.shipment_status] || record.shipment_status,
          enteredAt: record.entered_at,
          elapsedHours: Math.round(elapsedHours * 10) / 10,
          maxHours,
          percentUsed: Math.round(percentUsed * 100),
          hoursRemaining: Math.round(hoursRemaining * 10) / 10,
          riskLevel,
        });
      }
    }

    // Sort by risk level (critical first) then by percent used (highest first)
    atRiskShipments.sort((a, b) => {
      if (a.riskLevel !== b.riskLevel) {
        return a.riskLevel === 'critical' ? -1 : 1;
      }
      return b.percentUsed - a.percentUsed;
    });

    console.log(`[daily-sla-risk-alert] Found ${atRiskShipments.length} at-risk shipments`);

    if (atRiskShipments.length === 0) {
      console.log('[daily-sla-risk-alert] No shipments at risk, skipping email');
      return new Response(
        JSON.stringify({ success: true, message: 'No at-risk shipments found', atRiskCount: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch supervisor/manager emails
    const { data: supervisorRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['MANAGER', 'SUPERVISOR']);

    if (rolesError) {
      console.error('[daily-sla-risk-alert] Error fetching roles:', rolesError);
      throw rolesError;
    }

    if (!supervisorRoles || supervisorRoles.length === 0) {
      console.log('[daily-sla-risk-alert] No supervisors/managers to notify');
      return new Response(
        JSON.stringify({ success: true, message: 'No supervisors configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userIds = supervisorRoles.map(r => r.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('email')
      .in('id', userIds)
      .eq('is_active', true);

    if (profilesError) {
      console.error('[daily-sla-risk-alert] Error fetching profiles:', profilesError);
      throw profilesError;
    }

    const recipientEmails = profiles?.map(p => p.email).filter(Boolean) || [];

    if (recipientEmails.length === 0) {
      console.log('[daily-sla-risk-alert] No valid email addresses found');
      return new Response(
        JSON.stringify({ success: true, message: 'No valid recipients' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count by risk level
    const criticalCount = atRiskShipments.filter(s => s.riskLevel === 'critical').length;
    const warningCount = atRiskShipments.filter(s => s.riskLevel === 'warning').length;

    const today = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Generate shipment rows
    const shipmentRows = atRiskShipments.map(s => {
      const colors = getRiskColor(s.riskLevel);
      const progressColor = getProgressColor(s.percentUsed);
      const riskEmoji = s.riskLevel === 'critical' ? '🚨' : '⚠️';
      
      return `
        <tr style="background: ${colors.bg};">
          <td style="padding: 12px; border-bottom: 1px solid ${colors.border};">
            <span style="font-weight: 600;">${s.shipmentRef}</span>
            <br>
            <span style="font-size: 12px; color: #6b7280;">${s.clientName}</span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid ${colors.border};">
            <span style="display: inline-block; padding: 2px 8px; background: #e5e7eb; border-radius: 4px; font-size: 12px;">${s.currentStatus}</span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid ${colors.border}; text-align: center;">
            <div style="font-weight: 600; color: ${progressColor};">${s.percentUsed}%</div>
            <div style="width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px; margin-top: 4px;">
              <div style="width: ${Math.min(s.percentUsed, 100)}%; height: 100%; background: ${progressColor}; border-radius: 3px;"></div>
            </div>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid ${colors.border}; text-align: center;">
            <span style="font-weight: 600;">${formatHours(s.elapsedHours)}</span>
            <span style="color: #6b7280;"> / ${formatHours(s.maxHours)}</span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid ${colors.border}; text-align: center;">
            <span style="font-weight: 600; color: ${s.riskLevel === 'critical' ? '#dc2626' : '#f59e0b'};">
              ${formatHours(s.hoursRemaining)}
            </span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid ${colors.border}; text-align: center;">
            <span style="display: inline-block; padding: 4px 10px; background: ${colors.bg}; color: ${colors.text}; border: 1px solid ${colors.border}; border-radius: 4px; font-size: 12px; font-weight: 600;">
              ${riskEmoji} ${s.riskLevel.toUpperCase()}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Daily SLA Risk Alert</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
          <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">⏰ Daily SLA Risk Alert</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">${today}</p>
            </div>

            <!-- Summary -->
            <div style="padding: 24px;">
              <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 16px; color: #92400e;">
                  <strong>${atRiskShipments.length} shipment${atRiskShipments.length !== 1 ? 's' : ''}</strong> approaching SLA limits and require attention:
                </p>
                <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #92400e;">
                  ${criticalCount > 0 ? `<li><strong style="color: #dc2626;">🚨 ${criticalCount} Critical</strong> (≥90% of SLA time used)</li>` : ''}
                  ${warningCount > 0 ? `<li><strong style="color: #f59e0b;">⚠️ ${warningCount} Warning</strong> (75-90% of SLA time used)</li>` : ''}
                </ul>
              </div>

              <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                📋 At-Risk Shipments
              </h2>

              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; min-width: 700px;">
                  <thead>
                    <tr style="background: #f9fafb;">
                      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Shipment</th>
                      <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                      <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb; width: 120px;">Progress</th>
                      <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Elapsed</th>
                      <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Remaining</th>
                      <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${shipmentRows}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Actions -->
            <div style="padding: 0 24px 24px 24px;">
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px;">
                <h3 style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px;">💡 Recommended Actions</h3>
                <ul style="margin: 0; padding-left: 20px; color: #1e3a8a; font-size: 14px;">
                  <li>Review critical shipments immediately to prevent SLA breaches</li>
                  <li>Contact relevant teams or clients if delays are expected</li>
                  <li>Update shipment status if progress has been made</li>
                  <li>Document any issues or blockers in the shipment notes</li>
                </ul>
              </div>
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 13px;">
                This is an automated daily alert. Shipments are flagged when they reach 75% or more of their SLA time limit.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 12px;">
                Risk Levels: 🚨 Critical (≥90%) | ⚠️ Warning (75-90%)
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    console.log(`[daily-sla-risk-alert] Sending email to ${recipientEmails.length} recipients`);

    const emailResponse = await resend.emails.send({
      from: 'SLA Alerts <onboarding@resend.dev>',
      to: recipientEmails,
      subject: `⏰ SLA Risk Alert: ${criticalCount > 0 ? `${criticalCount} Critical, ` : ''}${warningCount} shipments at risk`,
      html: emailHtml,
    });

    console.log('[daily-sla-risk-alert] Email sent successfully:', emailResponse);

    return new Response(
      JSON.stringify({
        success: true,
        atRiskCount: atRiskShipments.length,
        criticalCount,
        warningCount,
        recipientCount: recipientEmails.length,
        emailId: emailResponse.data?.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[daily-sla-risk-alert] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
