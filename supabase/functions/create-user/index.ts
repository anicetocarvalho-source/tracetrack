import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create client with user's token to check permissions
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user: caller }, error: authError } = await userClient.auth.getUser()
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if caller is a MANAGER or ADMIN
    const { data: roleData } = await userClient.from('user_roles').select('role').eq('user_id', caller.id).single()
    if (roleData?.role !== 'MANAGER' && roleData?.role !== 'ADMIN') {
      return new Response(JSON.stringify({ error: 'Only managers and admins can create users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Additional check: Only ADMIN can create ADMIN users
    const { role: newUserRole } = await req.clone().json()
    if (newUserRole === 'ADMIN' && roleData?.role !== 'ADMIN') {
      return new Response(JSON.stringify({ error: 'Only admins can create admin users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Only ADMIN can create COUNTRY_ADMIN users
    if (newUserRole === 'COUNTRY_ADMIN' && roleData?.role !== 'ADMIN') {
      return new Response(JSON.stringify({ error: 'Only admins can create country admin users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, password, name, role, client_id, branch_id, country_id } = await req.json()

    if (!email || !password || !name || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate country_id for COUNTRY_ADMIN role
    if (role === 'COUNTRY_ADMIN' && !country_id) {
      return new Response(JSON.stringify({ error: 'Country admin must have a country assigned' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role to create user
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    })

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update profile with client_id, branch_id, and country_id if provided
    const profileUpdate: Record<string, any> = {}
    if (client_id) profileUpdate.client_id = client_id
    if (branch_id) profileUpdate.branch_id = branch_id
    if (country_id) profileUpdate.country_id = country_id
    
    if (Object.keys(profileUpdate).length > 0) {
      await adminClient.from('profiles').update(profileUpdate).eq('id', newUser.user.id)
    }

    // Create user role
    const { error: roleError } = await adminClient.from('user_roles').insert({
      user_id: newUser.user.id,
      role,
    })

    if (roleError) {
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
