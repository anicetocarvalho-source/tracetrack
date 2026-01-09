import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExceptionAlert {
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[send-exception-alert] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { exceptions }: { exceptions: ExceptionAlert[] } = await req.json();

    if (!exceptions || exceptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No exceptions to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[send-exception-alert] Processing ${exceptions.length} P1 exception alerts`);

    // Fetch supervisor/manager users to notify
    const { data: supervisorRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['SUPERVISOR', 'MANAGER']);

    if (rolesError) {
      console.error('[send-exception-alert] Error fetching supervisor roles:', rolesError);
      throw rolesError;
    }

    if (!supervisorRoles || supervisorRoles.length === 0) {
      console.log('[send-exception-alert] No supervisors/managers to notify');
      return new Response(
        JSON.stringify({ success: true, message: 'No recipients configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userIds = supervisorRoles.map(r => r.user_id);
    
    // Get email addresses from profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('email')
      .in('id', userIds)
      .eq('is_active', true);

    if (profilesError) {
      console.error('[send-exception-alert] Error fetching profiles:', profilesError);
      throw profilesError;
    }

    const recipientEmails = profiles?.map(p => p.email).filter(Boolean) || [];

    if (recipientEmails.length === 0) {
      console.log('[send-exception-alert] No valid email addresses found');
      return new Response(
        JSON.stringify({ success: true, message: 'No valid recipients' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[send-exception-alert] Sending alerts to ${recipientEmails.length} recipients`);

    // Build email content
    const exceptionRows = exceptions.map(e => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${e.shipment_ref}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${e.client_name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${e.rule_name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${e.current_status}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${e.hours_in_status}h (max ${e.max_hours}h)</td>
      </tr>
    `).join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>P1 Exception Alert</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
          <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background: #dc2626; padding: 24px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ P1 Exception Alert</h1>
            </div>
            <div style="padding: 24px;">
              <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">
                <strong>${exceptions.length}</strong> critical (P1) exception${exceptions.length > 1 ? 's have' : ' has'} been detected and require${exceptions.length === 1 ? 's' : ''} immediate attention:
              </p>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Shipment</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Client</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Rule</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Time Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  ${exceptionRows}
                </tbody>
              </table>
              <div style="margin-top: 24px; padding: 16px; background: #fef2f2; border-radius: 6px; border-left: 4px solid #dc2626;">
                <p style="margin: 0; color: #991b1b; font-size: 14px;">
                  <strong>Action Required:</strong> Please review these exceptions in the Action Required dashboard and take appropriate action.
                </p>
              </div>
            </div>
            <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                DHL Shipment Tracking System • Automated Alert
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send email to all recipients
    const { error: emailError } = await resend.emails.send({
      from: 'DHL Alerts <onboarding@resend.dev>',
      to: recipientEmails,
      subject: `🚨 P1 Exception Alert: ${exceptions.length} Critical Issue${exceptions.length > 1 ? 's' : ''} Detected`,
      html: emailHtml,
    });

    if (emailError) {
      console.error('[send-exception-alert] Error sending email:', emailError);
      throw emailError;
    }

    console.log(`[send-exception-alert] Successfully sent alerts to ${recipientEmails.length} recipients`);

    // Log to audit
    await supabase.from('audit_log').insert({
      entity_type: 'EXCEPTION_ALERT',
      entity_id: null,
      action: 'P1_ALERT_SENT',
      metadata_json: {
        exception_count: exceptions.length,
        recipient_count: recipientEmails.length,
        shipment_refs: exceptions.map(e => e.shipment_ref),
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        alerts_sent: exceptions.length,
        recipients: recipientEmails.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[send-exception-alert] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
