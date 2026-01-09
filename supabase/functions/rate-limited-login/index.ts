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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Get client IP from headers
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    const { email, password } = await req.json();
    
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for rate limiting
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Use email + IP combination as identifier for rate limiting
    const identifier = `${email.toLowerCase()}:${clientIp}`;
    
    // Check rate limit: 5 attempts per 5 minutes, block for 15 minutes
    const { data: rateLimitData, error: rateLimitError } = await supabaseAdmin
      .rpc('check_rate_limit', {
        p_identifier: identifier,
        p_action: 'login',
        p_max_attempts: 5,
        p_window_seconds: 300,
        p_block_seconds: 900
      });

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rateLimit: RateLimitResult = rateLimitData?.[0];
    
    if (!rateLimit?.allowed) {
      const blockedUntil = rateLimit?.blocked_until ? new Date(rateLimit.blocked_until) : null;
      const minutesRemaining = blockedUntil 
        ? Math.ceil((blockedUntil.getTime() - Date.now()) / 60000) 
        : 15;
      
      // Log the rate-limited attempt
      await supabaseAdmin.from('audit_log').insert({
        entity_type: 'AUTH',
        action: 'LOGIN_RATE_LIMITED',
        metadata_json: { 
          email, 
          ip_address: clientIp,
          blocked_until: rateLimit.blocked_until 
        },
        ip_address: clientIp
      });

      console.log(`Rate limited login attempt for ${email} from ${clientIp}`);
      
      return new Response(
        JSON.stringify({ 
          error: `Too many login attempts. Please try again in ${minutesRemaining} minutes.`,
          rate_limited: true,
          blocked_until: rateLimit.blocked_until
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client for auth operation (uses anon key)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    
    // Attempt login
    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      // Log failed login
      await supabaseAdmin.from('audit_log').insert({
        entity_type: 'AUTH',
        action: 'LOGIN_FAIL',
        metadata_json: { 
          email, 
          error: authError.message,
          remaining_attempts: rateLimit.remaining_attempts
        },
        ip_address: clientIp
      });

      console.log(`Failed login attempt for ${email} from ${clientIp}: ${authError.message}`);

      return new Response(
        JSON.stringify({ 
          error: authError.message,
          remaining_attempts: rateLimit.remaining_attempts
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Successful login - reset rate limit
    await supabaseAdmin.rpc('reset_rate_limit', {
      p_identifier: identifier,
      p_action: 'login'
    });

    // Log successful login
    await supabaseAdmin.from('audit_log').insert({
      entity_type: 'AUTH',
      action: 'LOGIN_SUCCESS',
      actor_user_id: authData.user?.id,
      metadata_json: { email },
      ip_address: clientIp
    });

    console.log(`Successful login for ${email} from ${clientIp}`);

    return new Response(
      JSON.stringify({ 
        session: authData.session,
        user: authData.user
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
