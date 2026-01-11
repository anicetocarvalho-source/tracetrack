import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header for user validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { shipmentId } = await req.json();

    if (!shipmentId) {
      return new Response(
        JSON.stringify({ error: 'Missing shipmentId parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Bulk download requested for shipment: ${shipmentId} by user: ${user.id}`);

    // Get user role and client info
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const { data: userProfile } = await supabase
      .from('profiles')
      .select('client_id')
      .eq('id', user.id)
      .single();

    const isInternalUser = ['TECHNICIAN', 'SUPERVISOR', 'MANAGER'].includes(userRole?.role || '');
    const isCustomer = userRole?.role === 'CUSTOMER';

    // Get shipment to verify access
    const { data: shipment, error: shipmentError } = await supabase
      .from('shipments')
      .select('id, shipment_ref, client_id')
      .eq('id', shipmentId)
      .single();

    if (shipmentError || !shipment) {
      console.error('Shipment not found:', shipmentError);
      return new Response(
        JSON.stringify({ error: 'Shipment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify customer can only access their own shipments
    if (isCustomer && shipment.client_id !== userProfile?.client_id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized access to shipment' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query for documents
    let documentsQuery = supabase
      .from('shipment_documents')
      .select('*')
      .eq('shipment_id', shipmentId);

    // Customers can only see visible documents
    if (isCustomer) {
      documentsQuery = documentsQuery.eq('visible_to_client', true);
    }

    const { data: documents, error: docsError } = await documentsQuery;

    if (docsError) {
      console.error('Error fetching documents:', docsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch documents' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No documents found for this shipment' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${documents.length} documents to zip`);

    // Create ZIP file
    const zip = new JSZip();

    // Download each document and add to ZIP
    for (const doc of documents) {
      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('shipment-documents')
          .download(doc.storage_path);

        if (downloadError) {
          console.error(`Error downloading ${doc.filename}:`, downloadError);
          continue;
        }

        // Convert blob to array buffer
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Add to zip with document type folder structure
        const folderName = doc.document_type || 'OTHER';
        zip.addFile(`${folderName}/${doc.filename}`, uint8Array);
        
        console.log(`Added ${doc.filename} to ZIP`);
      } catch (err) {
        console.error(`Error processing ${doc.filename}:`, err);
        continue;
      }
    }

    // Generate ZIP file
    const zipData = await zip.generateAsync({ type: 'blob' });
    
    // Create filename with shipment reference
    const zipFilename = `${shipment.shipment_ref}_documents.zip`;

    console.log(`ZIP file created: ${zipFilename}`);

    return new Response(zipData, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
      },
    });

  } catch (error: unknown) {
    console.error('Bulk download error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
