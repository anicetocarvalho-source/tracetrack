import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyCommentRequest {
  request_id: string;
  shipment_ref: string;
  client_name: string;
  request_type: string;
  comment_message: string;
  commenter_name: string;
  commenter_email: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("notify-new-comment function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: NotifyCommentRequest = await req.json();
    console.log("Request body:", body);

    const {
      request_id,
      shipment_ref,
      client_name,
      request_type,
      comment_message,
      commenter_name,
      commenter_email,
    } = body;

    // Get notification recipients from system settings
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "notification_recipients")
      .single();

    let recipients: string[] = [];
    if (settingsData?.value) {
      const settings = settingsData.value as { emails?: string[] };
      recipients = settings.emails || [];
    }

    // Fallback to default if no recipients configured
    if (recipients.length === 0) {
      console.log("No notification recipients configured, skipping email");
      return new Response(
        JSON.stringify({ success: true, message: "No recipients configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending notification to ${recipients.length} recipients`);

    const requestTypeLabels: Record<string, string> = {
      UPDATE_REQUEST: "Status Update Request",
      DOC_UPLOAD: "Document Upload",
      INSTRUCTION_CHANGE: "Instruction Change",
    };

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Comment on Customer Request</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #FFCC00; padding: 20px; text-align: center; }
          .header img { height: 40px; }
          .content { padding: 20px; background: #f9f9f9; }
          .highlight { background: #fff; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #D40511; }
          .label { font-weight: bold; color: #666; font-size: 12px; text-transform: uppercase; }
          .value { font-size: 16px; margin-bottom: 10px; }
          .comment-box { background: #e8f4fd; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .btn { display: inline-block; background: #D40511; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin: 0; color: #D40511;">📝 New Comment on Request</h2>
        </div>
        <div class="content">
          <p>A customer has added a new comment to a request:</p>
          
          <div class="highlight">
            <div class="label">Shipment</div>
            <div class="value">${shipment_ref}</div>
            
            <div class="label">Client</div>
            <div class="value">${client_name}</div>
            
            <div class="label">Request Type</div>
            <div class="value">${requestTypeLabels[request_type] || request_type}</div>
          </div>

          <div class="comment-box">
            <div class="label">Comment from ${commenter_name}</div>
            <div class="value" style="margin-top: 8px;">${comment_message}</div>
          </div>

          <p style="font-size: 14px; color: #666;">
            <strong>Commenter:</strong> ${commenter_name} (${commenter_email})
          </p>
        </div>
        <div class="footer">
          <p>DHL Tracking & Trace System</p>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "DHL Tracking <onboarding@resend.dev>",
      to: recipients,
      subject: `[Follow-up] ${shipment_ref} - New comment from ${client_name}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-new-comment function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
