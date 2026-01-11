import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getMonthName(month: number, lang: string = 'en'): string {
  const months: Record<string, string[]> = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    pt: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
    fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  };
  return (months[lang] || months.en)[month - 1] || '';
}

function getComplianceColor(rate: number): string {
  if (rate >= 90) return '#16a34a';
  if (rate >= 70) return '#f59e0b';
  return '#dc2626';
}

function getComplianceBg(rate: number): string {
  if (rate >= 90) return '#f0fdf4';
  if (rate >= 70) return '#fffbeb';
  return '#fef2f2';
}

interface ScorecardData {
  id: string;
  client_id: string;
  period_year: number;
  period_month: number;
  total_shipments: number;
  delivered_shipments: number;
  on_time_delivery_rate: number;
  sla_compliance_rate: number;
  total_incidents: number;
  avg_transit_hours: number;
  exceptions_p1: number;
  exceptions_p2: number;
  exceptions_p3: number;
}

function buildEmailHtml(scorecard: ScorecardData, clientName: string, portalUrl: string): string {
  const periodLabel = `${getMonthName(scorecard.period_month)} ${scorecard.period_year}`;
  const complianceColor = getComplianceColor(scorecard.sla_compliance_rate);
  const onTimeColor = getComplianceColor(scorecard.on_time_delivery_rate);
  const complianceBg = getComplianceBg(scorecard.sla_compliance_rate);
  const onTimeBg = getComplianceBg(scorecard.on_time_delivery_rate);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Scorecard Available - ${clientName}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #D40511 0%, #FFCC00 100%); padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">📊 New Performance Scorecard</h1>
            <p style="color: rgba(255,255,255,0.95); margin: 12px 0 0 0; font-size: 18px; font-weight: 600;">${clientName}</p>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 14px;">${periodLabel}</p>
          </div>

          <!-- Introduction -->
          <div style="padding: 24px 24px 16px 24px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0;">
              Hello,<br><br>
              Your monthly performance scorecard for <strong>${periodLabel}</strong> is now available. 
              Here's a quick summary of your logistics performance:
            </p>
          </div>

          <!-- Key Metrics -->
          <div style="padding: 0 24px 24px 24px;">
            <table style="width: 100%; border-collapse: separate; border-spacing: 8px;">
              <tr>
                <td style="background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center; width: 33%;">
                  <div style="font-size: 28px; font-weight: bold; color: #1e40af;">${scorecard.total_shipments}</div>
                  <div style="font-size: 11px; color: #3b82f6; margin-top: 4px;">Total Shipments</div>
                </td>
                <td style="background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center; width: 33%;">
                  <div style="font-size: 28px; font-weight: bold; color: #16a34a;">${scorecard.delivered_shipments}</div>
                  <div style="font-size: 11px; color: #22c55e; margin-top: 4px;">Delivered</div>
                </td>
                <td style="background: ${scorecard.total_incidents > 0 ? '#fef2f2' : '#f0fdf4'}; border-radius: 8px; padding: 16px; text-align: center; width: 33%;">
                  <div style="font-size: 28px; font-weight: bold; color: ${scorecard.total_incidents > 0 ? '#dc2626' : '#16a34a'};">${scorecard.total_incidents}</div>
                  <div style="font-size: 11px; color: ${scorecard.total_incidents > 0 ? '#ef4444' : '#22c55e'}; margin-top: 4px;">Incidents</div>
                </td>
              </tr>
              <tr>
                <td colspan="3" style="padding-top: 8px;"></td>
              </tr>
              <tr>
                <td style="background: ${onTimeBg}; border-radius: 8px; padding: 16px; text-align: center;" colspan="1">
                  <div style="font-size: 28px; font-weight: bold; color: ${onTimeColor};">${scorecard.on_time_delivery_rate}%</div>
                  <div style="font-size: 11px; color: ${onTimeColor}; margin-top: 4px;">On-Time Delivery</div>
                </td>
                <td style="background: ${complianceBg}; border-radius: 8px; padding: 16px; text-align: center;" colspan="2">
                  <div style="font-size: 28px; font-weight: bold; color: ${complianceColor};">${scorecard.sla_compliance_rate}%</div>
                  <div style="font-size: 11px; color: ${complianceColor}; margin-top: 4px;">SLA Compliance</div>
                </td>
              </tr>
            </table>
          </div>

          <!-- Exception Summary -->
          ${scorecard.total_incidents > 0 ? `
          <div style="padding: 0 24px 24px 24px;">
            <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
              <h3 style="color: #374151; font-size: 14px; margin: 0 0 12px 0;">⚠️ Exception Summary</h3>
              <div style="display: flex; gap: 8px; text-align: center;">
                <div style="flex: 1; padding: 8px; background: #fef2f2; border-radius: 6px;">
                  <div style="font-size: 20px; font-weight: bold; color: #dc2626;">${scorecard.exceptions_p1}</div>
                  <div style="font-size: 10px; color: #991b1b;">P1 Critical</div>
                </div>
                <div style="flex: 1; padding: 8px; background: #fffbeb; border-radius: 6px;">
                  <div style="font-size: 20px; font-weight: bold; color: #f59e0b;">${scorecard.exceptions_p2}</div>
                  <div style="font-size: 10px; color: #92400e;">P2 High</div>
                </div>
                <div style="flex: 1; padding: 8px; background: #eff6ff; border-radius: 6px;">
                  <div style="font-size: 20px; font-weight: bold; color: #3b82f6;">${scorecard.exceptions_p3}</div>
                  <div style="font-size: 10px; color: #1e40af;">P3 Medium</div>
                </div>
              </div>
            </div>
          </div>
          ` : ''}

          <!-- CTA Button -->
          <div style="padding: 0 24px 32px 24px; text-align: center;">
            <a href="${portalUrl}/portal/scorecard" 
               style="display: inline-block; background: linear-gradient(135deg, #D40511 0%, #b90410 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(212, 5, 17, 0.3);">
              View Full Scorecard →
            </a>
            <p style="color: #6b7280; font-size: 12px; margin: 16px 0 0 0;">
              Log in to your customer portal to view the complete scorecard with detailed analytics.
            </p>
          </div>

          <!-- Footer -->
          <div style="background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              This is an automated notification from DHL Express Customs Tracking System.
            </p>
            <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px;">
              © ${new Date().getFullYear()} DHL Express. All rights reserved.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.error('[notify-scorecard-available] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    const { scorecardId, portalUrl } = await req.json();

    if (!scorecardId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: scorecardId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[notify-scorecard-available] Processing notification for scorecard ${scorecardId}`);

    // Fetch scorecard with client info
    const { data: scorecard, error: scorecardError } = await supabase
      .from('client_scorecards')
      .select(`
        *,
        clients:client_id(id, name, notification_emails)
      `)
      .eq('id', scorecardId)
      .single();

    if (scorecardError || !scorecard) {
      console.error('[notify-scorecard-available] Scorecard not found:', scorecardError);
      return new Response(
        JSON.stringify({ error: 'Scorecard not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const client = scorecard.clients as any;
    const clientName = client?.name || 'Unknown Client';
    const notificationEmails = client?.notification_emails || [];

    if (notificationEmails.length === 0) {
      console.log('[notify-scorecard-available] No notification emails configured for client');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No notification emails configured for this client',
          emailsSent: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get customer users for this client to also notify them
    const { data: customerProfiles } = await supabase
      .from('profiles')
      .select('email')
      .eq('client_id', client.id)
      .eq('is_active', true);

    const customerEmails = customerProfiles?.map(p => p.email) || [];
    
    // Combine notification emails and customer emails (deduplicated)
    const allEmails = [...new Set([...notificationEmails, ...customerEmails])];

    console.log(`[notify-scorecard-available] Sending to ${allEmails.length} recipients`);

    const baseUrl = portalUrl || supabaseUrl.replace('.supabase.co', '.lovable.app');
    const html = buildEmailHtml(scorecard as ScorecardData, clientName, baseUrl);
    const periodLabel = `${getMonthName(scorecard.period_month)} ${scorecard.period_year}`;

    // Send email to all recipients
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: 'DHL Express <onboarding@resend.dev>',
      to: allEmails,
      subject: `📊 Your ${periodLabel} Performance Scorecard is Ready - ${clientName}`,
      html,
    });

    if (emailError) {
      console.error('[notify-scorecard-available] Error sending email:', emailError);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[notify-scorecard-available] Emails sent successfully:', emailResult);

    // Audit log
    await supabase.from('audit_log').insert({
      entity_type: 'client_scorecard',
      entity_id: scorecardId,
      action: 'SCORECARD_NOTIFICATION_SENT',
      metadata_json: {
        client_id: client.id,
        client_name: clientName,
        period: `${scorecard.period_year}-${scorecard.period_month}`,
        recipients: allEmails,
        email_id: emailResult?.id,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Notifications sent successfully',
        emailsSent: allEmails.length,
        recipients: allEmails,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[notify-scorecard-available] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
