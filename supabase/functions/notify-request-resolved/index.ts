import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestResolvedPayload {
  request_id: string;
  shipment_ref: string;
  request_type: string;
  original_message: string;
  resolution_note: string;
  resolved_by_name: string;
  customer_email: string;
  customer_name: string;
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  UPDATE_REQUEST: 'Status Update Request',
  DOC_UPLOAD: 'Document Upload',
  INSTRUCTION_CHANGE: 'Instruction Change',
};

const handler = async (req: Request): Promise<Response> => {
  console.log("notify-request-resolved function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: RequestResolvedPayload = await req.json();
    console.log("Received payload:", JSON.stringify(payload));

    const {
      request_id,
      shipment_ref,
      request_type,
      original_message,
      resolution_note,
      resolved_by_name,
      customer_email,
      customer_name,
    } = payload;

    if (!customer_email) {
      console.log("No customer email provided, skipping notification");
      return new Response(
        JSON.stringify({ message: "No customer email provided" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const requestTypeLabel = REQUEST_TYPE_LABELS[request_type] || request_type;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #D40511; color: white; padding: 20px; text-align: center; }
            .header img { height: 40px; }
            .content { padding: 30px 20px; background: #f9f9f9; }
            .resolution-box { background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; }
            .original-box { background: #fff; border: 1px solid #ddd; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .badge-resolved { background: #4caf50; color: white; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 24px;">DHL Tracking Portal</h1>
            </div>
            <div class="content">
              <p>Dear ${customer_name || 'Valued Customer'},</p>
              
              <p>Your request for shipment <strong>${shipment_ref}</strong> has been resolved.</p>
              
              <p>
                <span class="badge badge-resolved">RESOLVED</span>
                <strong style="margin-left: 10px;">${requestTypeLabel}</strong>
              </p>
              
              <div class="original-box">
                <p style="margin: 0 0 5px 0; font-weight: bold; color: #666;">Your Original Request:</p>
                <p style="margin: 0;">${original_message}</p>
              </div>
              
              <div class="resolution-box">
                <p style="margin: 0 0 5px 0; font-weight: bold; color: #2e7d32;">Resolution:</p>
                <p style="margin: 0;">${resolution_note}</p>
                <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">Resolved by: ${resolved_by_name}</p>
              </div>
              
              <p>If you have any further questions, please don't hesitate to submit a new request through the portal.</p>
              
              <p>Best regards,<br>DHL Operations Team</p>
            </div>
            <div class="footer">
              <p>This is an automated message from the DHL Tracking Portal.</p>
              <p>© ${new Date().getFullYear()} DHL. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    console.log("Sending email to:", customer_email);

    const emailResponse = await resend.emails.send({
      from: "DHL Tracking <onboarding@resend.dev>",
      to: [customer_email],
      subject: `Request Resolved - Shipment ${shipment_ref}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in notify-request-resolved function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

Deno.serve(handler);
