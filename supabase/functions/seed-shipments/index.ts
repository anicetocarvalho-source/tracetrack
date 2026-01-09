import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const clients = {
  acme: 'a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d',
  global: 'b2c3d4e5-f6a7-5b6c-9d8e-0f1a2b3c4d5e',
}

// Valid statuses: RECEIVED, REGISTERED, DOCS_VALIDATION, PROCESSING, IN_TRANSIT, AT_TERMINAL, CLEARANCE, OUT_FOR_DELIVERY, DELIVERED, ON_HOLD_INCIDENT, CANCELLED

const demoShipments = [
  {
    shipment_ref: 'SHP-2025-0001',
    client_ref: 'ACME-PO-1234',
    file_number: 'F-2025-001',
    client_id: clients.acme,
    shipping_line: 'Maersk',
    bl_reference: 'MAEU123456789',
    assigned_operator: 'João Technician',
    current_status: 'DELIVERED',
    containers: [
      { container_number: 'MSKU1234567', container_type: '40HC' },
    ],
    events: [
      { status: 'RECEIVED', note: 'Shipment registered in system', location: 'São Paulo, SP', days_ago: 15 },
      { status: 'DOCS_VALIDATION', note: 'Validating commercial invoice', location: 'São Paulo, SP', days_ago: 14 },
      { status: 'PROCESSING', note: 'All documents received and verified', location: 'São Paulo, SP', days_ago: 12 },
      { status: 'CLEARANCE', note: 'Submitted to customs for clearance', location: 'Porto de Santos', days_ago: 10 },
      { status: 'AT_TERMINAL', note: 'Container at terminal', location: 'Porto de Santos', days_ago: 7 },
      { status: 'OUT_FOR_DELIVERY', note: 'Container loaded for delivery', location: 'Porto de Santos', days_ago: 5 },
      { status: 'DELIVERED', note: 'Delivered to final destination', location: 'Campinas, SP', days_ago: 2 },
    ],
  },
  {
    shipment_ref: 'SHP-2025-0002',
    client_ref: 'ACME-PO-1235',
    file_number: 'F-2025-002',
    client_id: clients.acme,
    shipping_line: 'MSC',
    bl_reference: 'MSCU987654321',
    assigned_operator: 'Ana Supervisor',
    current_status: 'CLEARANCE',
    containers: [
      { container_number: 'MSCU2345678', container_type: '20DV' },
      { container_number: 'MSCU2345679', container_type: '20DV' },
    ],
    events: [
      { status: 'RECEIVED', note: 'Shipment registered', location: 'São Paulo, SP', days_ago: 5 },
      { status: 'DOCS_VALIDATION', note: 'Validating packing list', location: 'São Paulo, SP', days_ago: 4 },
      { status: 'PROCESSING', note: 'Documentation complete', location: 'São Paulo, SP', days_ago: 3 },
      { status: 'CLEARANCE', note: 'In customs clearance process', location: 'Porto de Santos', days_ago: 1 },
    ],
  },
  {
    shipment_ref: 'SHP-2025-0003',
    client_ref: 'GLB-IMP-789',
    file_number: 'F-2025-003',
    client_id: clients.global,
    shipping_line: 'Hapag-Lloyd',
    bl_reference: 'HLCU567890123',
    assigned_operator: 'João Technician',
    current_status: 'OUT_FOR_DELIVERY',
    containers: [
      { container_number: 'HLCU3456789', container_type: '40HC' },
    ],
    events: [
      { status: 'RECEIVED', note: 'Import registered', location: 'Rio de Janeiro, RJ', days_ago: 8 },
      { status: 'PROCESSING', note: 'All documents verified', location: 'Rio de Janeiro, RJ', days_ago: 6 },
      { status: 'CLEARANCE', note: 'Customs processing', location: 'Porto do Rio', days_ago: 4 },
      { status: 'AT_TERMINAL', note: 'Released by customs', location: 'Porto do Rio', days_ago: 2 },
      { status: 'OUT_FOR_DELIVERY', note: 'En route to warehouse', location: 'Porto do Rio', days_ago: 1 },
    ],
  },
  {
    shipment_ref: 'SHP-2025-0004',
    client_ref: 'GLB-IMP-790',
    file_number: 'F-2025-004',
    client_id: clients.global,
    shipping_line: 'CMA CGM',
    bl_reference: 'CMAU111222333',
    assigned_operator: 'Ana Supervisor',
    current_status: 'DOCS_VALIDATION',
    containers: [
      { container_number: 'CMAU4567890', container_type: '40DV' },
      { container_number: 'CMAU4567891', container_type: '40DV' },
      { container_number: 'CMAU4567892', container_type: '20RF' },
    ],
    events: [
      { status: 'RECEIVED', note: 'New shipment registered', location: 'São Paulo, SP', days_ago: 2 },
      { status: 'DOCS_VALIDATION', note: 'Waiting for bill of lading original', location: 'São Paulo, SP', days_ago: 1 },
    ],
  },
  {
    shipment_ref: 'SHP-2025-0005',
    client_ref: 'ACME-PO-1236',
    file_number: 'F-2025-005',
    client_id: clients.acme,
    shipping_line: 'Evergreen',
    bl_reference: 'EGLV444555666',
    assigned_operator: 'João Technician',
    current_status: 'RECEIVED',
    containers: [
      { container_number: 'EGLU5678901', container_type: '40HC' },
    ],
    events: [
      { status: 'RECEIVED', note: 'Shipment just registered in system', location: 'São Paulo, SP', days_ago: 0 },
    ],
  },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Get a technician user to use as created_by
    const { data: technicianRole } = await adminClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'TECHNICIAN')
      .limit(1)
      .single()

    if (!technicianRole) {
      return new Response(JSON.stringify({ error: 'No technician user found. Run seed-users first.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const createdBy = technicianRole.user_id
    const results = []

    for (const shipment of demoShipments) {
      // Create shipment
      const { data: newShipment, error: shipmentError } = await adminClient
        .from('shipments')
        .insert({
          shipment_ref: shipment.shipment_ref,
          client_ref: shipment.client_ref,
          file_number: shipment.file_number,
          client_id: shipment.client_id,
          shipping_line: shipment.shipping_line,
          bl_reference: shipment.bl_reference,
          assigned_operator: shipment.assigned_operator,
          current_status: shipment.current_status,
          created_by: createdBy,
        })
        .select()
        .single()

      if (shipmentError) {
        results.push({ shipment_ref: shipment.shipment_ref, error: shipmentError.message })
        continue
      }

      // Create containers
      for (const container of shipment.containers) {
        await adminClient.from('shipment_containers').insert({
          shipment_id: newShipment.id,
          container_number: container.container_number,
          container_type: container.container_type,
        })
      }

      // Create tracking events
      for (const event of shipment.events) {
        const eventDate = new Date()
        eventDate.setDate(eventDate.getDate() - event.days_ago)
        
        await adminClient.from('tracking_events').insert({
          shipment_id: newShipment.id,
          status: event.status,
          note: event.note,
          location: event.location,
          event_datetime: eventDate.toISOString(),
          visible_to_client: true,
          notify_client: false,
          created_by: createdBy,
        })
      }

      results.push({ 
        shipment_ref: shipment.shipment_ref, 
        success: true, 
        containers: shipment.containers.length,
        events: shipment.events.length,
      })
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
