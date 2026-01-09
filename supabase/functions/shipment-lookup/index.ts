import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RateLimitResult {
  allowed: boolean;
  remaining_attempts: number;
  blocked_until: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client IP
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create user client to get user info
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get user from token
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is a customer
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const isCustomer = roleData?.role === 'CUSTOMER';
    
    // Rate limiting only for customers (more aggressive limits)
    if (isCustomer) {
      const identifier = `${user.id}:${clientIp}`;
      
      // Check rate limit: 30 requests per 1 minute, block for 5 minutes
      const { data: rateLimitData, error: rateLimitError } = await supabaseAdmin
        .rpc('check_rate_limit', {
          p_identifier: identifier,
          p_action: 'shipment_lookup',
          p_max_attempts: 30,
          p_window_seconds: 60,
          p_block_seconds: 300
        });

      if (rateLimitError) {
        console.error('Rate limit check error:', rateLimitError);
      } else {
        const rateLimit: RateLimitResult = rateLimitData?.[0];
        
        if (!rateLimit?.allowed) {
          console.log(`Rate limited shipment lookup for user ${user.id} from ${clientIp}`);
          
          return new Response(
            JSON.stringify({ 
              error: 'Too many requests. Please try again later.',
              rate_limited: true,
              blocked_until: rateLimit.blocked_until
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Parse query parameters
    const url = new URL(req.url);
    const shipmentId = url.searchParams.get('id');
    const shipmentRef = url.searchParams.get('shipment_ref');
    const blReference = url.searchParams.get('bl_reference');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    
    // Get user's client_id if customer
    let userClientId: string | null = null;
    if (isCustomer) {
      const { data: profileData } = await supabaseAdmin
        .from('profiles')
        .select('client_id')
        .eq('id', user.id)
        .single();
      userClientId = profileData?.client_id;
      
      if (!userClientId) {
        return new Response(
          JSON.stringify({ error: 'Customer must have a client_id' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Build query
    let query = supabaseAdmin.from('shipments').select(`
      id,
      shipment_ref,
      client_ref,
      bl_reference,
      shipping_line,
      current_status,
      created_at,
      updated_at,
      discharge_date,
      service_request_date,
      forecast_shipping_line,
      forecast_terminal,
      client_id,
      ${!isCustomer ? 'docs_received_date, assigned_operator, file_number,' : ''}
      clients!inner(id, name),
      shipment_containers(id, container_number, container_type)
    `, { count: 'exact' });

    // Apply filters
    if (shipmentId) {
      query = query.eq('id', shipmentId);
    }
    if (shipmentRef) {
      query = query.ilike('shipment_ref', `%${shipmentRef}%`);
    }
    if (blReference) {
      query = query.ilike('bl_reference', `%${blReference}%`);
    }

    // Restrict customers to their own client's shipments
    if (isCustomer && userClientId) {
      query = query.eq('client_id', userClientId);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    const { data: shipments, error: queryError, count } = await query;

    if (queryError) {
      console.error('Shipment query error:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch shipments' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Shipment lookup by user ${user.id}: found ${shipments?.length || 0} shipments`);

    return new Response(
      JSON.stringify({ 
        shipments,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Shipment lookup error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
