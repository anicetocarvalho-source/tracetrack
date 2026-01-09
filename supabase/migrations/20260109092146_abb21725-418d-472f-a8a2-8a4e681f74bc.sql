-- Fix security warnings: Set search_path for trigger functions

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix prevent_tracking_event_modification function
CREATE OR REPLACE FUNCTION public.prevent_tracking_event_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Tracking events are immutable and cannot be modified or deleted';
END;
$$;

-- Fix the overly permissive audit_log INSERT policy
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (actor_user_id = auth.uid() OR actor_user_id IS NULL);