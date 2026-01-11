import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NewRequestPayload {
  request_id: string;
  shipment_id: string;
  shipment_ref: string;
  client_name: string;
  request_type: string;
  message: string;
  requester_name: string;
  requester_email: string;
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  UPDATE_REQUEST: "Status Update Request",
  DOC_UPLOAD: "Document Upload",
  INSTRUCTION_CHANGE: "Instruction Change",
};

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: NewRequestPayload = await req.json();
    console.log("Received new request notification payload:", payload);

    const {
      request_id,
      shipment_id,
      shipment_ref,
      client_name,
      request_type,
      message,
      requester_name,
      requester_email,
    } = payload;

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch internal staff emails (supervisors and managers)
    const { data: staffProfiles, error: staffError } = await supabase
      .from("profiles")
      .select(`
        id,
        email,
        name,
        user_roles!inner(role)
      `)
      .in("user_roles.role", ["SUPERVISOR", "MANAGER"]);

    if (staffError) {
      console.error("Error fetching staff profiles:", staffError);
      throw staffError;
    }

    if (!staffProfiles || staffProfiles.length === 0) {
      console.log("No supervisors or managers found to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No recipients to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const recipientEmails = staffProfiles.map((p) => p.email).filter(Boolean);
    console.log("Sending notification to staff:", recipientEmails);

    const requestTypeLabel = REQUEST_TYPE_LABELS[request_type] || request_type;
    const dashboardUrl = `${supabaseUrl.replace(".supabase.co", ".lovable.app")}/backoffice/shipments/${shipment_id}`;

    // Send email notification
    const emailResponse = await resend.emails.send({
      from: "DHL Shipment Tracker <onboarding@resend.dev>",
      to: recipientEmails,
      subject: `[New Request] ${requestTypeLabel} - ${shipment_ref}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #D40511 0%, #FFCC00 100%); padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Customer Request</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 20px; border: 1px solid #e0e0e0; border-top: none;">
            <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <p style="margin: 0 0 10px 0;"><strong>Shipment:</strong> ${shipment_ref}</p>
              <p style="margin: 0 0 10px 0;"><strong>Client:</strong> ${client_name}</p>
              <p style="margin: 0 0 10px 0;"><strong>Request Type:</strong> ${requestTypeLabel}</p>
              <p style="margin: 0 0 10px 0;"><strong>Submitted by:</strong> ${requester_name} (${requester_email})</p>
            </div>
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 15px;">
              <p style="margin: 0; font-weight: 600;">Customer Message:</p>
              <p style="margin: 10px 0 0 0;">${message}</p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <a href="${dashboardUrl}" style="display: inline-block; background: #D40511; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
                View Shipment Details
              </a>
            </div>
          </div>
          
          <div style="text-align: center; padding: 15px; color: #666; font-size: 12px;">
            <p>This is an automated notification from DHL Shipment Tracker.</p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-new-request function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
