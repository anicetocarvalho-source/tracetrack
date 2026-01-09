import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BreachNotification {
  shipment_sla_id: string;
  shipment_id: string;
  shipment_ref: string;
  client_name: string;
  shipment_status: string;
  elapsed_hours: number;
  max_hours: number;
  entered_at: string;
  exited_at: string;
}

const formatHours = (hours: number): string => {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours >= 1) {
    return `${Math.round(hours)}h`;
  }
  return `${Math.round(hours * 60)}m`;
};

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    RECEIVED: "Received",
    REGISTERED: "Registered",
    DOCS_VALIDATION: "Docs Validation",
    PROCESSING: "Processing",
    IN_TRANSIT: "In Transit",
    AT_TERMINAL: "At Terminal",
    CLEARANCE: "Clearance",
    OUT_FOR_DELIVERY: "Out for Delivery",
    DELIVERED: "Delivered",
    ON_HOLD_INCIDENT: "On Hold - Incident",
    CANCELLED: "Cancelled",
  };
  return labels[status] || status;
};

const handler = async (req: Request): Promise<Response> => {
  console.log("notify-sla-breach function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const breach: BreachNotification = await req.json();
    console.log("Processing SLA breach notification:", breach);

    // Fetch managers and supervisors to notify
    const { data: userRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["MANAGER", "SUPERVISOR"]);

    if (rolesError) {
      console.error("Error fetching user roles:", rolesError);
      throw rolesError;
    }

    if (!userRoles || userRoles.length === 0) {
      console.log("No managers or supervisors found to notify");
      return new Response(JSON.stringify({ success: true, message: "No recipients found" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const userIds = userRoles.map((ur) => ur.user_id);
    
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, name")
      .in("id", userIds)
      .eq("is_active", true);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      console.log("No active profiles found for managers/supervisors");
      return new Response(JSON.stringify({ success: true, message: "No active recipients found" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const recipientEmails = profiles.map((p) => p.email);
    console.log(`Sending SLA breach notification to ${recipientEmails.length} recipients`);

    const overage = breach.elapsed_hours - breach.max_hours;
    const overagePercent = Math.round((overage / breach.max_hours) * 100);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SLA Breach Alert</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ SLA Breach Detected</h1>
        </div>
        
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 30px; border-radius: 0 0 12px 12px;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; color: #991b1b; font-weight: 600;">
              A shipment has exceeded its SLA target by ${formatHours(overage)} (${overagePercent}% over limit)
            </p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; width: 40%;">Shipment Reference</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${breach.shipment_ref}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Client</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${breach.client_name || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Status</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                <span style="background: #fee2e2; color: #991b1b; padding: 4px 12px; border-radius: 9999px; font-size: 14px;">
                  ${getStatusLabel(breach.shipment_status)}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Time in Status</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                <span style="color: #dc2626; font-weight: 600;">${formatHours(breach.elapsed_hours)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">SLA Target</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${formatHours(breach.max_hours)}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Entered Status</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${new Date(breach.entered_at).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: 600;">Exited Status</td>
              <td style="padding: 12px;">${new Date(breach.exited_at).toLocaleString()}</td>
            </tr>
          </table>

          <div style="text-align: center; margin-top: 24px;">
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">
              Please review this shipment and take appropriate action to prevent future delays.
            </p>
          </div>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
          <p>This is an automated notification from Tracking Trace.</p>
        </div>
      </body>
      </html>
    `;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Tracking Trace <onboarding@resend.dev>",
      to: recipientEmails,
      subject: `🚨 SLA Breach: ${breach.shipment_ref} - ${getStatusLabel(breach.shipment_status)}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Error sending email:", emailError);
      throw emailError;
    }

    console.log("SLA breach notification sent successfully:", emailData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Notification sent to ${recipientEmails.length} recipients`,
        emailId: emailData?.id 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in notify-sla-breach function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
