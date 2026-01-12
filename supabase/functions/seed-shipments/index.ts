import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const clients = {
  acme: 'a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d',
  global: 'b2c3d4e5-f6a7-5b6c-9d8e-0f1a2b3c4d5e',
}

// Branch IDs
const branches = {
  hq: '00000000-0000-0000-0000-000000000001',
  lagos: '0446f2b4-ab6f-4269-b5c5-4a2e63e98e25',
  abuja: '80dff0da-2fe6-4aac-b863-d3e3a66eb63c',
}

// Valid statuses: RECEIVED, REGISTERED, DOCS_VALIDATION, PROCESSING, IN_TRANSIT, AT_TERMINAL, CLEARANCE, OUT_FOR_DELIVERY, DELIVERED, ON_HOLD_INCIDENT, CANCELLED

const demoShipments = [
  // === HQ Branch Shipments ===
  {
    shipment_ref: 'HQ-2025-0001',
    client_ref: 'ACME-PO-1234',
    file_number: 'F-HQ-001',
    client_id: clients.acme,
    branch_id: branches.hq,
    shipping_line: 'Maersk',
    bl_reference: 'MAEU123456789',
    assigned_operator: 'João Technician',
    current_status: 'DELIVERED',
    containers: [{ container_number: 'MSKU1234567', container_type: '40HC' }],
    events: [
      { status: 'RECEIVED', note: 'Shipment registered in system', location: 'Headquarters', days_ago: 15 },
      { status: 'DOCS_VALIDATION', note: 'Validating commercial invoice', location: 'Headquarters', days_ago: 14 },
      { status: 'PROCESSING', note: 'All documents received and verified', location: 'Headquarters', days_ago: 12 },
      { status: 'CLEARANCE', note: 'Submitted to customs for clearance', location: 'Port', days_ago: 10 },
      { status: 'DELIVERED', note: 'Delivered to final destination', location: 'Customer Site', days_ago: 2 },
    ],
  },
  {
    shipment_ref: 'HQ-2025-0002',
    client_ref: 'ACME-PO-1235',
    file_number: 'F-HQ-002',
    client_id: clients.acme,
    branch_id: branches.hq,
    shipping_line: 'MSC',
    bl_reference: 'MSCU987654321',
    assigned_operator: 'João Technician',
    current_status: 'CLEARANCE',
    containers: [
      { container_number: 'MSCU2345678', container_type: '20DV' },
      { container_number: 'MSCU2345679', container_type: '20DV' },
    ],
    events: [
      { status: 'RECEIVED', note: 'Shipment registered', location: 'Headquarters', days_ago: 5 },
      { status: 'DOCS_VALIDATION', note: 'Validating packing list', location: 'Headquarters', days_ago: 4 },
      { status: 'CLEARANCE', note: 'In customs clearance process', location: 'Port', days_ago: 1 },
    ],
  },
  {
    shipment_ref: 'HQ-2025-0003',
    client_ref: 'GLB-IMP-001',
    file_number: 'F-HQ-003',
    client_id: clients.global,
    branch_id: branches.hq,
    shipping_line: 'CMA CGM',
    bl_reference: 'CMAU111222333',
    assigned_operator: 'João Technician',
    current_status: 'ON_HOLD_INCIDENT',
    containers: [{ container_number: 'CMAU4567890', container_type: '40DV' }],
    events: [
      { status: 'RECEIVED', note: 'Shipment registered', location: 'Headquarters', days_ago: 8 },
      { status: 'ON_HOLD_INCIDENT', note: 'Missing original documents', location: 'Headquarters', days_ago: 6 },
    ],
  },
  
  // === Lagos Branch Shipments ===
  {
    shipment_ref: 'LOS-2025-0001',
    client_ref: 'ACME-LOS-789',
    file_number: 'F-LOS-001',
    client_id: clients.acme,
    branch_id: branches.lagos,
    shipping_line: 'Hapag-Lloyd',
    bl_reference: 'HLCU567890123',
    assigned_operator: 'Chidi Lagos Tech',
    current_status: 'OUT_FOR_DELIVERY',
    containers: [{ container_number: 'HLCU3456789', container_type: '40HC' }],
    events: [
      { status: 'RECEIVED', note: 'Import registered', location: 'Lagos Office', days_ago: 8 },
      { status: 'PROCESSING', note: 'All documents verified', location: 'Lagos Office', days_ago: 6 },
      { status: 'CLEARANCE', note: 'Customs processing', location: 'Apapa Port', days_ago: 4 },
      { status: 'OUT_FOR_DELIVERY', note: 'En route to warehouse', location: 'Lagos', days_ago: 1 },
    ],
  },
  {
    shipment_ref: 'LOS-2025-0002',
    client_ref: 'GLB-LOS-456',
    file_number: 'F-LOS-002',
    client_id: clients.global,
    branch_id: branches.lagos,
    shipping_line: 'Evergreen',
    bl_reference: 'EGLV444555666',
    assigned_operator: 'Chidi Lagos Tech',
    current_status: 'IN_TRANSIT',
    containers: [
      { container_number: 'EGLU5678901', container_type: '40HC' },
      { container_number: 'EGLU5678902', container_type: '40HC' },
    ],
    events: [
      { status: 'RECEIVED', note: 'Shipment registered', location: 'Lagos Office', days_ago: 3 },
      { status: 'IN_TRANSIT', note: 'Vessel departed origin port', location: 'Shanghai Port', days_ago: 2 },
    ],
  },
  {
    shipment_ref: 'LOS-2025-0003',
    client_ref: 'ACME-LOS-790',
    file_number: 'F-LOS-003',
    client_id: clients.acme,
    branch_id: branches.lagos,
    shipping_line: 'ONE',
    bl_reference: 'ONEU777888999',
    assigned_operator: 'Chidi Lagos Tech',
    current_status: 'DOCS_VALIDATION',
    containers: [{ container_number: 'ONEU9876543', container_type: '20RF' }],
    events: [
      { status: 'RECEIVED', note: 'New refrigerated shipment', location: 'Lagos Office', days_ago: 1 },
      { status: 'DOCS_VALIDATION', note: 'Verifying phytosanitary certificate', location: 'Lagos Office', days_ago: 0 },
    ],
  },
  {
    shipment_ref: 'LOS-2025-0004',
    client_ref: 'GLB-LOS-457',
    file_number: 'F-LOS-004',
    client_id: clients.global,
    branch_id: branches.lagos,
    shipping_line: 'PIL',
    bl_reference: 'PCIU123123123',
    assigned_operator: 'Chidi Lagos Tech',
    current_status: 'DELIVERED',
    containers: [{ container_number: 'PCIU1111111', container_type: '40HC' }],
    events: [
      { status: 'RECEIVED', note: 'Shipment registered', location: 'Lagos Office', days_ago: 20 },
      { status: 'CLEARANCE', note: 'Customs cleared', location: 'Apapa Port', days_ago: 15 },
      { status: 'DELIVERED', note: 'Delivered successfully', location: 'Ikeja', days_ago: 10 },
    ],
  },

  // === Abuja Branch Shipments ===
  {
    shipment_ref: 'ABJ-2025-0001',
    client_ref: 'ACME-ABJ-001',
    file_number: 'F-ABJ-001',
    client_id: clients.acme,
    branch_id: branches.abuja,
    shipping_line: 'Yang Ming',
    bl_reference: 'YMLU333444555',
    assigned_operator: 'Amina Abuja Tech',
    current_status: 'AT_TERMINAL',
    containers: [{ container_number: 'YMLU7654321', container_type: '40HC' }],
    events: [
      { status: 'RECEIVED', note: 'Shipment registered', location: 'Abuja Office', days_ago: 6 },
      { status: 'PROCESSING', note: 'Documents verified', location: 'Abuja Office', days_ago: 5 },
      { status: 'AT_TERMINAL', note: 'Container arrived at dry port', location: 'Kaduna Dry Port', days_ago: 2 },
    ],
  },
  {
    shipment_ref: 'ABJ-2025-0002',
    client_ref: 'GLB-ABJ-100',
    file_number: 'F-ABJ-002',
    client_id: clients.global,
    branch_id: branches.abuja,
    shipping_line: 'COSCO',
    bl_reference: 'COSU666777888',
    assigned_operator: 'Amina Abuja Tech',
    current_status: 'PROCESSING',
    containers: [
      { container_number: 'COSU1234567', container_type: '20DV' },
      { container_number: 'COSU1234568', container_type: '20DV' },
      { container_number: 'COSU1234569', container_type: '20DV' },
    ],
    events: [
      { status: 'RECEIVED', note: 'Large shipment registered', location: 'Abuja Office', days_ago: 2 },
      { status: 'PROCESSING', note: 'Processing multi-container shipment', location: 'Abuja Office', days_ago: 1 },
    ],
  },
  {
    shipment_ref: 'ABJ-2025-0003',
    client_ref: 'ACME-ABJ-002',
    file_number: 'F-ABJ-003',
    client_id: clients.acme,
    branch_id: branches.abuja,
    shipping_line: 'ZIM',
    bl_reference: 'ZIMU999000111',
    assigned_operator: 'Amina Abuja Tech',
    current_status: 'RECEIVED',
    containers: [{ container_number: 'ZIMU5555555', container_type: '40HC' }],
    events: [
      { status: 'RECEIVED', note: 'Just registered today', location: 'Abuja Office', days_ago: 0 },
    ],
  },
  {
    shipment_ref: 'ABJ-2025-0004',
    client_ref: 'GLB-ABJ-101',
    file_number: 'F-ABJ-004',
    client_id: clients.global,
    branch_id: branches.abuja,
    shipping_line: 'Maersk',
    bl_reference: 'MAEU999888777',
    assigned_operator: 'Amina Abuja Tech',
    current_status: 'DELIVERED',
    containers: [{ container_number: 'MSKU9999999', container_type: '40HC' }],
    events: [
      { status: 'RECEIVED', note: 'Shipment registered', location: 'Abuja Office', days_ago: 25 },
      { status: 'CLEARANCE', note: 'Customs cleared', location: 'Kaduna Dry Port', days_ago: 18 },
      { status: 'DELIVERED', note: 'Delivered to customer', location: 'Abuja', days_ago: 12 },
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
      // Create shipment with branch_id
      const { data: newShipment, error: shipmentError } = await adminClient
        .from('shipments')
        .insert({
          shipment_ref: shipment.shipment_ref,
          client_ref: shipment.client_ref,
          file_number: shipment.file_number,
          client_id: shipment.client_id,
          branch_id: shipment.branch_id,
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
