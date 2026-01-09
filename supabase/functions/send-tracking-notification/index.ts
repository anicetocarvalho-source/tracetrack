import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  shipment_id: string;
  status: string;
  note: string;
  location?: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { shipment_id, status, note, location }: NotificationRequest = await req.json();

    console.log(`Processing notification for shipment: ${shipment_id}`);

    // Get shipment details with client info
    const { data: shipment, error: shipmentError } = await supabase
      .from("shipments")
      .select(`
        shipment_ref,
        client_ref,
        bl_reference,
        client:clients (
          name,
          notification_emails
        )
      `)
      .eq("id", shipment_id)
      .single();

    if (shipmentError || !shipment) {
      console.error("Error fetching shipment:", shipmentError);
      return new Response(
        JSON.stringify({ error: "Shipment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // deno-lint-ignore no-explicit-any
    const clientData = shipment.client as any;
    const client = Array.isArray(clientData) ? clientData[0] : clientData;
    
    if (!client?.notification_emails?.length) {
      console.log("No notification emails configured for client");
      return new Response(
        JSON.stringify({ message: "No notification emails configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending notification to: ${client.notification_emails.join(", ")}`);

    // Format status for display
    const statusDisplay = status.replace(/_/g, " ").toLowerCase()
      .replace(/\b\w/g, (l: string) => l.toUpperCase());

    // Build email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <!-- Header -->
            <div style="background-color: #FFCC00; padding: 20px; text-align: center;">
              <h1 style="color: #D40511; margin: 0; font-size: 28px; font-weight: bold;">DHL</h1>
              <p style="color: #333; margin: 5px 0 0 0; font-size: 12px;">Excellence. Simply delivered.</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px;">
              <h2 style="color: #333; margin: 0 0 20px 0;">Shipment Status Update</h2>
              
              <div style="background-color: #f9f9f9; border-left: 4px solid #D40511; padding: 15px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 14px; color: #666;">New Status</p>
                <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: bold; color: #D40511;">${statusDisplay}</p>
              </div>
              
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; width: 140px;">Shipment Ref:</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;">${shipment.shipment_ref}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Your Reference:</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;">${shipment.client_ref}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">BL Reference:</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;">${shipment.bl_reference}</td>
                </tr>
                ${location ? `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Location:</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;">${location}</td>
                </tr>
                ` : ""}
              </table>
              
              ${note ? `
              <div style="background-color: #fff8e1; border-radius: 4px; padding: 15px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 14px; color: #666;">Note</p>
                <p style="margin: 5px 0 0 0; color: #333;">${note}</p>
              </div>
              ` : ""}
              
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                For more details, please log in to your tracking portal.
              </p>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #D40511; padding: 20px; text-align: center;">
              <p style="color: #fff; margin: 0; font-size: 12px;">
                © ${new Date().getFullYear()} DHL International GmbH. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send email to all notification addresses
    const emailResponse = await resend.emails.send({
      from: "DHL Tracking <onboarding@resend.dev>",
      to: client.notification_emails,
      subject: `Shipment Update: ${shipment.shipment_ref} - ${statusDisplay}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-tracking-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
