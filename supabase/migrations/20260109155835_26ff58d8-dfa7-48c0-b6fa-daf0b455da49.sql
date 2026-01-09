-- Create helper functions for managing cron jobs
CREATE OR REPLACE FUNCTION public.unschedule_cron_job(job_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  PERFORM cron.unschedule(job_name);
EXCEPTION
  WHEN OTHERS THEN
    -- Job doesn't exist, ignore
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_cron_job(
  p_job_name text,
  p_schedule text,
  p_url text,
  p_auth_key text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, extensions
AS $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT cron.schedule(
    p_job_name,
    p_schedule,
    format(
      'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb) AS request_id',
      p_url,
      json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || p_auth_key)::text,
      '{}'
    )
  ) INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.unschedule_cron_job(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_cron_job(text, text, text, text) TO authenticated;