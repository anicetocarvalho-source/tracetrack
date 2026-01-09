import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduleRequest {
  job_name: string;
  frequency: '30min' | '1hour' | '4hours';
}

function getCronExpression(frequency: string): string {
  switch (frequency) {
    case '30min':
      return '*/30 * * * *'; // Every 30 minutes
    case '1hour':
      return '0 * * * *'; // Every hour at minute 0
    case '4hours':
      return '0 */4 * * *'; // Every 4 hours at minute 0
    default:
      return '0 * * * *'; // Default to hourly
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user has manager role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is a manager
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || roleData?.role !== 'MANAGER') {
      return new Response(
        JSON.stringify({ error: 'Only managers can update cron schedules' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { job_name, frequency }: ScheduleRequest = await req.json();

    if (!job_name || !frequency) {
      return new Response(
        JSON.stringify({ error: 'job_name and frequency are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cronExpression = getCronExpression(frequency);
    console.log(`[update-cron-schedule] Updating ${job_name} to ${frequency} (${cronExpression})`);

    // First, unschedule the existing job
    const { error: unscheduleError } = await supabase.rpc('unschedule_cron_job', { job_name });
    
    if (unscheduleError) {
      console.log(`[update-cron-schedule] No existing job to unschedule or error:`, unscheduleError.message);
    }

    // Get the function URL based on job name
    let functionUrl = '';
    if (job_name === 'detect-exceptions-hourly') {
      functionUrl = `${supabaseUrl}/functions/v1/detect-exceptions`;
    } else {
      return new Response(
        JSON.stringify({ error: 'Unknown job name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Schedule the new job using raw SQL via RPC
    const { data: scheduleResult, error: scheduleError } = await supabase.rpc('schedule_cron_job', {
      p_job_name: job_name,
      p_schedule: cronExpression,
      p_url: functionUrl,
      p_auth_key: anonKey,
    });

    if (scheduleError) {
      console.error('[update-cron-schedule] Error scheduling job:', scheduleError);
      throw scheduleError;
    }

    // Update system settings to track the frequency
    const { error: settingError } = await supabase
      .from('system_settings')
      .upsert({
        key: 'exception_detection_frequency',
        value: JSON.stringify(frequency),
        description: 'Frequency for automatic exception detection',
        updated_by: user.id,
      }, { onConflict: 'key' });

    if (settingError) {
      console.error('[update-cron-schedule] Error updating setting:', settingError);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      entity_type: 'SYSTEM_SETTING',
      entity_id: null,
      action: 'CRON_SCHEDULE_UPDATED',
      actor_user_id: user.id,
      metadata_json: {
        job_name,
        frequency,
        cron_expression: cronExpression,
      },
    });

    console.log(`[update-cron-schedule] Successfully updated ${job_name} to ${frequency}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        job_name,
        frequency,
        cron_expression: cronExpression,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[update-cron-schedule] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
