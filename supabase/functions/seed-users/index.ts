import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const testUsers = [
  { email: 'admin@dhl.test', password: 'Test123!', name: 'Super Admin', role: 'ADMIN', client_id: null },
  { email: 'manager@dhl.test', password: 'Test123!', name: 'Carlos Manager', role: 'MANAGER', client_id: null },
  { email: 'supervisor@dhl.test', password: 'Test123!', name: 'Ana Supervisor', role: 'SUPERVISOR', client_id: null },
  { email: 'technician@dhl.test', password: 'Test123!', name: 'João Technician', role: 'TECHNICIAN', client_id: null },
  { email: 'customer1@acme.test', password: 'Test123!', name: 'Pedro Cliente', role: 'CUSTOMER', client_id: 'a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d' },
  { email: 'customer2@global.test', password: 'Test123!', name: 'Maria Cliente', role: 'CUSTOMER', client_id: 'b2c3d4e5-f6a7-5b6c-9d8e-0f1a2b3c4d5e' },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const results = []

    for (const user of testUsers) {
      // Create user
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: { name: user.name },
      })

      if (createError) {
        results.push({ email: user.email, error: createError.message })
        continue
      }

      // Update profile with client_id if provided
      if (user.client_id) {
        await adminClient.from('profiles').update({ client_id: user.client_id }).eq('id', newUser.user.id)
      }

      // Create user role
      const { error: roleError } = await adminClient.from('user_roles').insert({
        user_id: newUser.user.id,
        role: user.role,
      })

      if (roleError) {
        results.push({ email: user.email, error: roleError.message })
        continue
      }

      results.push({ email: user.email, success: true, role: user.role })
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
