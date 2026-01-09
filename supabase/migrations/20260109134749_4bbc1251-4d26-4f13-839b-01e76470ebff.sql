-- Create rate_limits table for tracking request attempts
CREATE TABLE public.rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  action TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  blocked_until TIMESTAMP WITH TIME ZONE,
  UNIQUE(identifier, action)
);

-- Create index for fast lookups
CREATE INDEX idx_rate_limits_lookup ON public.rate_limits(identifier, action);
CREATE INDEX idx_rate_limits_cleanup ON public.rate_limits(last_attempt_at);

-- Enable RLS but allow service role access
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Function to check and update rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_window_seconds INTEGER DEFAULT 300,
  p_block_seconds INTEGER DEFAULT 900
)
RETURNS TABLE(allowed BOOLEAN, remaining_attempts INTEGER, blocked_until TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_record rate_limits%ROWTYPE;
  v_now TIMESTAMP WITH TIME ZONE := now();
  v_window_start TIMESTAMP WITH TIME ZONE := v_now - (p_window_seconds || ' seconds')::INTERVAL;
BEGIN
  -- Get or create rate limit record
  SELECT * INTO v_record 
  FROM rate_limits 
  WHERE identifier = p_identifier AND action = p_action
  FOR UPDATE;
  
  IF NOT FOUND THEN
    -- First attempt, create record
    INSERT INTO rate_limits (identifier, action, attempts, first_attempt_at, last_attempt_at)
    VALUES (p_identifier, p_action, 1, v_now, v_now);
    
    RETURN QUERY SELECT true, p_max_attempts - 1, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;
  
  -- Check if currently blocked
  IF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > v_now THEN
    RETURN QUERY SELECT false, 0, v_record.blocked_until;
    RETURN;
  END IF;
  
  -- Check if window has expired, reset if so
  IF v_record.first_attempt_at < v_window_start THEN
    UPDATE rate_limits 
    SET attempts = 1, first_attempt_at = v_now, last_attempt_at = v_now, blocked_until = NULL
    WHERE id = v_record.id;
    
    RETURN QUERY SELECT true, p_max_attempts - 1, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;
  
  -- Increment attempts
  IF v_record.attempts >= p_max_attempts THEN
    -- Block the identifier
    UPDATE rate_limits 
    SET blocked_until = v_now + (p_block_seconds || ' seconds')::INTERVAL,
        last_attempt_at = v_now
    WHERE id = v_record.id;
    
    RETURN QUERY SELECT false, 0, v_now + (p_block_seconds || ' seconds')::INTERVAL;
    RETURN;
  END IF;
  
  -- Allow and increment
  UPDATE rate_limits 
  SET attempts = attempts + 1, last_attempt_at = v_now
  WHERE id = v_record.id;
  
  RETURN QUERY SELECT true, p_max_attempts - v_record.attempts - 1, NULL::TIMESTAMP WITH TIME ZONE;
END;
$$;

-- Function to reset rate limit on successful action (e.g., successful login)
CREATE OR REPLACE FUNCTION public.reset_rate_limit(
  p_identifier TEXT,
  p_action TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM rate_limits WHERE identifier = p_identifier AND action = p_action;
END;
$$;

-- Cleanup old rate limit records (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limits 
  WHERE last_attempt_at < now() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;