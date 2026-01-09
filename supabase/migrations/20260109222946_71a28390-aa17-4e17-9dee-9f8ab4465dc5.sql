
-- Update the log_sla_breach function to also send email notification via pg_net
CREATE OR REPLACE FUNCTION public.log_sla_breach()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shipment_ref TEXT;
  v_client_name TEXT;
  v_max_hours INTEGER;
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_payload JSONB;
BEGIN
  -- Only log when breached changes from false/null to true
  IF NEW.breached = true AND (OLD.breached IS NULL OR OLD.breached = false) THEN
    -- Get shipment and client info
    SELECT s.shipment_ref, c.name INTO v_shipment_ref, v_client_name
    FROM public.shipments s
    LEFT JOIN public.clients c ON s.client_id = c.id
    WHERE s.id = NEW.shipment_id;
    
    -- Get SLA max hours
    SELECT max_hours INTO v_max_hours
    FROM public.sla_config
    WHERE id = NEW.sla_config_id;
    
    -- Create audit log entry
    INSERT INTO public.audit_log (entity_type, entity_id, action, metadata_json)
    VALUES (
      'shipment_sla',
      NEW.id,
      'SLA_BREACH',
      jsonb_build_object(
        'shipment_id', NEW.shipment_id,
        'shipment_ref', v_shipment_ref,
        'client_name', v_client_name,
        'shipment_status', NEW.shipment_status,
        'elapsed_hours', NEW.elapsed_hours,
        'max_hours', v_max_hours,
        'entered_at', NEW.entered_at,
        'exited_at', NEW.exited_at
      )
    );
    
    -- Prepare payload for email notification
    v_payload := jsonb_build_object(
      'shipment_sla_id', NEW.id,
      'shipment_id', NEW.shipment_id,
      'shipment_ref', v_shipment_ref,
      'client_name', v_client_name,
      'shipment_status', NEW.shipment_status,
      'elapsed_hours', NEW.elapsed_hours,
      'max_hours', v_max_hours,
      'entered_at', NEW.entered_at,
      'exited_at', NEW.exited_at
    );
    
    -- Get Supabase URL from vault or use default
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    IF v_supabase_url IS NULL THEN
      v_supabase_url := 'https://dcaoeagpjswnjgmoqkfu.supabase.co';
    END IF;
    
    v_service_role_key := current_setting('app.settings.service_role_key', true);
    
    -- Call edge function to send email notification using pg_net
    IF v_service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/notify-sla-breach',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := v_payload
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;
