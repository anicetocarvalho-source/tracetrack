
-- Function to log SLA config changes
CREATE OR REPLACE FUNCTION public.log_sla_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'SLA_CONFIG_CREATED';
    v_metadata := jsonb_build_object(
      'new_values', jsonb_build_object(
        'client_id', NEW.client_id,
        'shipment_status', NEW.shipment_status,
        'max_hours', NEW.max_hours,
        'is_active', NEW.is_active
      )
    );
    INSERT INTO public.audit_log (entity_type, entity_id, action, actor_user_id, metadata_json)
    VALUES ('sla_config', NEW.id, v_action, NEW.created_by, v_metadata);
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'SLA_CONFIG_UPDATED';
    v_metadata := jsonb_build_object(
      'old_values', jsonb_build_object(
        'client_id', OLD.client_id,
        'shipment_status', OLD.shipment_status,
        'max_hours', OLD.max_hours,
        'is_active', OLD.is_active
      ),
      'new_values', jsonb_build_object(
        'client_id', NEW.client_id,
        'shipment_status', NEW.shipment_status,
        'max_hours', NEW.max_hours,
        'is_active', NEW.is_active
      )
    );
    INSERT INTO public.audit_log (entity_type, entity_id, action, actor_user_id, metadata_json)
    VALUES ('sla_config', NEW.id, v_action, auth.uid(), v_metadata);
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'SLA_CONFIG_DELETED';
    v_metadata := jsonb_build_object(
      'deleted_values', jsonb_build_object(
        'client_id', OLD.client_id,
        'shipment_status', OLD.shipment_status,
        'max_hours', OLD.max_hours,
        'is_active', OLD.is_active
      )
    );
    INSERT INTO public.audit_log (entity_type, entity_id, action, actor_user_id, metadata_json)
    VALUES ('sla_config', OLD.id, v_action, auth.uid(), v_metadata);
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Trigger for SLA config changes
CREATE TRIGGER sla_config_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.sla_config
FOR EACH ROW
EXECUTE FUNCTION public.log_sla_config_change();

-- Function to log SLA breaches
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
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for SLA breaches
CREATE TRIGGER sla_breach_audit_trigger
AFTER UPDATE ON public.shipment_sla
FOR EACH ROW
EXECUTE FUNCTION public.log_sla_breach();
