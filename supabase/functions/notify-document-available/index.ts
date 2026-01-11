import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyDocumentRequest {
  documentId: string;
  shipmentId: string;
  filename: string;
  documentType: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { documentId, shipmentId, filename, documentType }: NotifyDocumentRequest = await req.json();

    console.log(`Document notification requested for document: ${documentId}, shipment: ${shipmentId}`);

    // Get shipment details including client info
    const { data: shipment, error: shipmentError } = await supabase
      .from("shipments")
      .select(`
        id,
        shipment_ref,
        client_ref,
        client_id,
        clients (
          id,
          name,
          notification_emails
        )
      `)
      .eq("id", shipmentId)
      .single();

    if (shipmentError || !shipment) {
      console.error("Shipment not found:", shipmentError);
      return new Response(
        JSON.stringify({ error: "Shipment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get customer users associated with this client
    const { data: customerProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select(`
        id,
        email,
        name,
        is_active,
        user_roles!inner (
          role
        )
      `)
      .eq("client_id", shipment.client_id)
      .eq("is_active", true);

    if (profilesError) {
      console.error("Error fetching customer profiles:", profilesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch customer profiles" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter only CUSTOMER role users
    const customerEmails = customerProfiles
      ?.filter((p: any) => p.user_roles?.some((r: any) => r.role === "CUSTOMER"))
      .map((p: any) => p.email) || [];

    // Add client notification emails
    const clientNotificationEmails = (shipment.clients as any)?.notification_emails || [];
    
    // Combine and deduplicate emails
    const allEmails = [...new Set([...customerEmails, ...clientNotificationEmails])];

    if (allEmails.length === 0) {
      console.log("No recipients found for document notification");
      return new Response(
        JSON.stringify({ message: "No recipients found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending document notification to ${allEmails.length} recipients`);

    const documentTypeLabels: Record<string, string> = {
      POD: "Proof of Delivery",
      BL: "Bill of Lading",
      INVOICE: "Invoice",
      OTHER: "Document",
    };

    const documentTypeLabel = documentTypeLabels[documentType] || documentType;
    const clientName = (shipment.clients as any)?.name || "Client";

    // Send email notification
    const { data: emailResponse, error: emailError } = await resend.emails.send({
      from: "DHL Logistics <notifications@resend.dev>",
      to: allEmails,
      subject: `New Document Available - ${shipment.shipment_ref}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #D40511 0%, #FFCC00 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Document Available</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Dear ${clientName},</p>
            
            <p>A new document has been made available for your shipment.</p>
            
            <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #D40511;">
              <h3 style="margin-top: 0; color: #D40511;">Document Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; width: 140px;">Document Type:</td>
                  <td style="padding: 8px 0; font-weight: 600;">${documentTypeLabel}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Filename:</td>
                  <td style="padding: 8px 0; font-weight: 600;">${filename}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Shipment Ref:</td>
                  <td style="padding: 8px 0; font-weight: 600;">${shipment.shipment_ref}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Client Ref:</td>
                  <td style="padding: 8px 0; font-weight: 600;">${shipment.client_ref}</td>
                </tr>
              </table>
            </div>
            
            <p>You can view and download this document by logging into the customer portal.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${supabaseUrl.replace('.supabase.co', '.lovable.app')}/portal/documents" 
                 style="background: #D40511; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                View Documents
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            
            <p style="color: #666; font-size: 14px; margin-bottom: 0;">
              Best regards,<br>
              <strong>DHL Logistics Team</strong>
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </body>
        </html>
      `,
    });

    if (emailError) {
      console.error("Error sending email:", emailError);
      return new Response(
        JSON.stringify({ error: "Failed to send email notification", details: emailError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully:", emailResponse);

    // Log the notification in audit log
    await supabase.from("audit_log").insert({
      entity_type: "shipment_document",
      entity_id: documentId,
      action: "DOCUMENT_NOTIFICATION_SENT",
      metadata_json: {
        shipment_id: shipmentId,
        shipment_ref: shipment.shipment_ref,
        filename,
        document_type: documentType,
        recipients: allEmails,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Notification sent to ${allEmails.length} recipients`,
        recipients: allEmails 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Document notification error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
