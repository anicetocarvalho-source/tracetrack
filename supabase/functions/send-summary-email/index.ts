import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  shipment_id: string;
  summary: string;
  recipient_emails: string[];
  mode: "internal" | "customer";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { shipment_id, summary, recipient_emails, mode }: EmailRequest = await req.json();
    console.log(`Sending ${mode} summary email for shipment:`, shipment_id, "to:", recipient_emails);

    if (!recipient_emails || recipient_emails.length === 0) {
      throw new Error("No recipient emails provided");
    }

    if (!summary) {
      throw new Error("No summary content provided");
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch shipment data for email context
    const { data: shipment, error: shipmentError } = await supabase
      .from("shipments")
      .select(`
        *,
        client:clients(name)
      `)
      .eq("id", shipment_id)
      .single();

    if (shipmentError || !shipment) {
      console.error("Error fetching shipment:", shipmentError);
      throw new Error("Shipment not found");
    }

    // Format the status for display
    const formatStatus = (status: string) => {
      return status
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
    };

    const isInternal = mode === "internal";
    const subjectPrefix = isInternal ? "[Internal]" : "";
    const subject = `${subjectPrefix} Shipment Summary - ${shipment.shipment_ref}`.trim();

    // Build HTML email
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Shipment Summary</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #D40511 0%, #FC0 100%); padding: 30px; border-radius: 8px 8px 0 0;">
          <h1 style="color: #fff; margin: 0; font-size: 24px;">Shipment Summary</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">
            ${isInternal ? "Internal Operations Report" : "Tracking Update"}
          </p>
        </div>
        
        <div style="background: #f9f9f9; padding: 25px; border: 1px solid #e0e0e0; border-top: none;">
          <div style="background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e0e0e0;">
            <h2 style="margin: 0 0 15px 0; font-size: 16px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Shipment Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; width: 40%;">Reference:</td>
                <td style="padding: 8px 0; font-weight: 600;">${shipment.shipment_ref}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Client Reference:</td>
                <td style="padding: 8px 0;">${shipment.client_ref}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Client:</td>
                <td style="padding: 8px 0;">${shipment.client?.name || "N/A"}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Current Status:</td>
                <td style="padding: 8px 0;">
                  <span style="background: #D40511; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                    ${formatStatus(shipment.current_status)}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Shipping Line:</td>
                <td style="padding: 8px 0;">${shipment.shipping_line}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">BL Reference:</td>
                <td style="padding: 8px 0;">${shipment.bl_reference}</td>
              </tr>
            </table>
          </div>
          
          <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #e0e0e0;">
            <h2 style="margin: 0 0 15px 0; font-size: 16px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">
              ${isInternal ? "Operations Summary" : "Tracking Summary"}
            </h2>
            <p style="margin: 0; white-space: pre-wrap; color: #333;">
              ${summary}
            </p>
          </div>
        </div>
        
        <div style="text-align: center; padding: 20px; background: #333; border-radius: 0 0 8px 8px;">
          <p style="margin: 0; font-size: 12px; color: #999;">
            This summary was generated by AI based on available shipment data.
          </p>
          <p style="margin: 10px 0 0 0; font-size: 11px; color: #666;">
            Generated on ${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}
          </p>
        </div>
      </body>
      </html>
    `;

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: "DHL Tracking <onboarding@resend.dev>",
      to: recipient_emails,
      subject,
      html,
    });

    console.log("Email sent successfully:", emailResponse);

    // Get user from auth header for audit log
    const authHeader = req.headers.get("authorization");
    let userId = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    // Log to audit log
    await supabase.from("audit_log").insert({
      entity_type: "shipment",
      entity_id: shipment_id,
      action: "SUMMARY_EMAIL_SENT",
      actor_user_id: userId,
      metadata_json: {
        mode,
        shipment_ref: shipment.shipment_ref,
        recipient_count: recipient_emails.length,
        recipients: recipient_emails,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email sent to ${recipient_emails.length} recipient(s)`,
        email_id: emailResponse.data?.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-summary-email:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
