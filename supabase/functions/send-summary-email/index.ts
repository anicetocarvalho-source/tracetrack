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

// Format status for display
const formatStatus = (status: string) => {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

// Get status color based on shipment status
const getStatusColor = (status: string): { bg: string; text: string } => {
  const statusColors: Record<string, { bg: string; text: string }> = {
    DELIVERED: { bg: "#10b981", text: "#ffffff" },
    IN_TRANSIT: { bg: "#3b82f6", text: "#ffffff" },
    OUT_FOR_DELIVERY: { bg: "#8b5cf6", text: "#ffffff" },
    AT_TERMINAL: { bg: "#f59e0b", text: "#ffffff" },
    CLEARANCE: { bg: "#6366f1", text: "#ffffff" },
    PROCESSING: { bg: "#0ea5e9", text: "#ffffff" },
    ON_HOLD_INCIDENT: { bg: "#ef4444", text: "#ffffff" },
    CANCELLED: { bg: "#6b7280", text: "#ffffff" },
  };
  return statusColors[status] || { bg: "#D40511", text: "#ffffff" };
};

// Internal team email template - detailed operations focus
const buildInternalEmailTemplate = (
  shipment: any,
  summary: string,
  generatedAt: string
): string => {
  const statusColor = getStatusColor(shipment.current_status);
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Internal Operations Summary</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 700px; margin: 0 auto; padding: 0; background-color: #f3f4f6;">
      
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 24px 30px; border-radius: 0;">
        <table style="width: 100%;">
          <tr>
            <td>
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">🔒 Internal Operations Report</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 13px;">Confidential - For Internal Use Only</p>
            </td>
            <td style="text-align: right;">
              <span style="background: ${statusColor.bg}; color: ${statusColor.text}; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                ${formatStatus(shipment.current_status)}
              </span>
            </td>
          </tr>
        </table>
      </div>
      
      <div style="padding: 30px; background-color: #ffffff;">
        
        <!-- Quick Reference Bar -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="text-align: center; border-right: 1px solid #e2e8f0; padding: 0 15px;">
                <p style="margin: 0; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Shipment Ref</p>
                <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 700; color: #0f172a;">${shipment.shipment_ref}</p>
              </td>
              <td style="text-align: center; border-right: 1px solid #e2e8f0; padding: 0 15px;">
                <p style="margin: 0; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Client</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${shipment.client?.name || "N/A"}</p>
              </td>
              <td style="text-align: center; padding: 0 15px;">
                <p style="margin: 0; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Operator</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${shipment.assigned_operator || "Unassigned"}</p>
              </td>
            </tr>
          </table>
        </div>
        
        <!-- Shipment Details Grid -->
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0 0 16px 0; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
            📦 Shipment Details
          </h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; color: #64748b; width: 35%; font-size: 14px;">Client Reference:</td>
              <td style="padding: 10px 0; font-weight: 500; font-size: 14px;">${shipment.client_ref}</td>
            </tr>
            <tr style="background: #f8fafc;">
              <td style="padding: 10px; color: #64748b; font-size: 14px;">BL Reference:</td>
              <td style="padding: 10px; font-weight: 500; font-size: 14px;">${shipment.bl_reference}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Shipping Line:</td>
              <td style="padding: 10px 0; font-weight: 500; font-size: 14px;">${shipment.shipping_line}</td>
            </tr>
            <tr style="background: #f8fafc;">
              <td style="padding: 10px; color: #64748b; font-size: 14px;">File Number:</td>
              <td style="padding: 10px; font-weight: 500; font-size: 14px;">${shipment.file_number || "Not assigned"}</td>
            </tr>
            ${shipment.discharge_date ? `
            <tr>
              <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Discharge Date:</td>
              <td style="padding: 10px 0; font-weight: 500; font-size: 14px;">${new Date(shipment.discharge_date).toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
            </tr>
            ` : ""}
            ${shipment.forecast_terminal ? `
            <tr style="background: #f8fafc;">
              <td style="padding: 10px; color: #64748b; font-size: 14px;">Forecast Terminal:</td>
              <td style="padding: 10px; font-weight: 500; font-size: 14px;">${shipment.forecast_terminal}</td>
            </tr>
            ` : ""}
          </table>
        </div>
        
        <!-- AI Summary Section -->
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%); border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <h2 style="margin: 0 0 12px 0; font-size: 14px; color: #92400e; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center;">
            ✨ AI Operations Analysis
          </h2>
          <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${summary}</p>
        </div>
        
        <!-- Action Items Note -->
        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; font-size: 13px; color: #1e40af;">
            <strong>💡 Note:</strong> This AI-generated summary includes internal details such as SLA breaches, incidents, and operational notes. Please review before taking action.
          </p>
        </div>
      </div>
      
      <!-- Footer -->
      <div style="background: #1e293b; padding: 20px 30px; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #64748b;">
          Internal Operations Report • Generated on ${generatedAt}
        </p>
        <p style="margin: 8px 0 0 0; font-size: 10px; color: #475569;">
          This email contains confidential information. Do not forward to external parties.
        </p>
      </div>
    </body>
    </html>
  `;
};

// Customer-facing email template - clean, professional, limited info
const buildCustomerEmailTemplate = (
  shipment: any,
  summary: string,
  generatedAt: string
): string => {
  const statusColor = getStatusColor(shipment.current_status);
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Shipment Update</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f5f5f5;">
      
      <!-- Header with DHL Branding -->
      <div style="background: linear-gradient(135deg, #D40511 0%, #FC0 100%); padding: 30px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,0.1);">
          📦 Shipment Update
        </h1>
        <p style="color: rgba(255,255,255,0.95); margin: 10px 0 0 0; font-size: 15px;">
          Your shipment tracking summary
        </p>
      </div>
      
      <div style="background-color: #ffffff; padding: 35px 30px;">
        
        <!-- Status Card -->
        <div style="text-align: center; margin-bottom: 30px;">
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">Current Status</p>
          <span style="display: inline-block; background: ${statusColor.bg}; color: ${statusColor.text}; padding: 10px 24px; border-radius: 30px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
            ${formatStatus(shipment.current_status)}
          </span>
        </div>
        
        <!-- Shipment Info Card -->
        <div style="background: #fafafa; border-radius: 12px; padding: 24px; margin-bottom: 28px; border: 1px solid #eeeeee;">
          <h2 style="margin: 0 0 18px 0; font-size: 16px; color: #333333; font-weight: 600;">
            Shipment Information
          </h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; color: #888888; font-size: 14px; border-bottom: 1px solid #eeeeee;">Tracking Reference</td>
              <td style="padding: 12px 0; font-weight: 600; font-size: 14px; text-align: right; border-bottom: 1px solid #eeeeee; color: #D40511;">${shipment.shipment_ref}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #888888; font-size: 14px; border-bottom: 1px solid #eeeeee;">Your Reference</td>
              <td style="padding: 12px 0; font-weight: 500; font-size: 14px; text-align: right; border-bottom: 1px solid #eeeeee;">${shipment.client_ref}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #888888; font-size: 14px;">Carrier</td>
              <td style="padding: 12px 0; font-weight: 500; font-size: 14px; text-align: right;">${shipment.shipping_line}</td>
            </tr>
          </table>
        </div>
        
        <!-- Summary Section -->
        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 16px 0; font-size: 16px; color: #333333; font-weight: 600; display: flex; align-items: center;">
            ✨ Tracking Summary
          </h2>
          <div style="background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px;">
            <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.75; white-space: pre-wrap;">${summary}</p>
          </div>
        </div>
        
        <!-- Help Section -->
        <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 12px;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #666666;">
            Questions about your shipment?
          </p>
          <p style="margin: 0; font-size: 13px; color: #888888;">
            Contact our customer service team for assistance
          </p>
        </div>
      </div>
      
      <!-- Footer -->
      <div style="background: #333333; padding: 25px 30px; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #999999;">
          This summary was generated based on your shipment's tracking data
        </p>
        <p style="margin: 10px 0 0 0; font-size: 11px; color: #666666;">
          ${generatedAt}
        </p>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #444444;">
          <p style="margin: 0; font-size: 10px; color: #666666;">
            Thank you for choosing our services
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

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

    const generatedAt = new Date().toLocaleString("en-US", { 
      dateStyle: "full", 
      timeStyle: "short" 
    });

    // Build email based on mode
    const isInternal = mode === "internal";
    const subject = isInternal
      ? `🔒 [Internal] Operations Summary - ${shipment.shipment_ref}`
      : `📦 Shipment Update - ${shipment.shipment_ref}`;

    const html = isInternal
      ? buildInternalEmailTemplate(shipment, summary, generatedAt)
      : buildCustomerEmailTemplate(shipment, summary, generatedAt);

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
        template: isInternal ? "internal_operations" : "customer_tracking",
        shipment_ref: shipment.shipment_ref,
        recipient_count: recipient_emails.length,
        recipients: recipient_emails,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email sent to ${recipient_emails.length} recipient(s)`,
        template: isInternal ? "internal_operations" : "customer_tracking",
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
