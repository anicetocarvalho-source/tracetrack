-- ============================================
-- HARDENING PASS: Database Constraints & Indexes
-- ============================================

-- 1. UNIQUE CONSTRAINTS
-- Shipment.shipment_ref UNIQUE
ALTER TABLE public.shipments 
ADD CONSTRAINT shipments_shipment_ref_unique UNIQUE (shipment_ref);

-- profiles.email UNIQUE
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_email_unique UNIQUE (email);

-- 2. TrackingEvent IMMUTABILITY (Trigger to prevent UPDATE/DELETE)
-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS prevent_tracking_event_update ON public.tracking_events;
DROP TRIGGER IF EXISTS prevent_tracking_event_delete ON public.tracking_events;

CREATE TRIGGER prevent_tracking_event_update
  BEFORE UPDATE ON public.tracking_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tracking_event_modification();

CREATE TRIGGER prevent_tracking_event_delete
  BEFORE DELETE ON public.tracking_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tracking_event_modification();

-- 3. INDEXES for performance
-- Shipment indexes
CREATE INDEX IF NOT EXISTS idx_shipments_shipment_ref ON public.shipments(shipment_ref);
CREATE INDEX IF NOT EXISTS idx_shipments_client_ref ON public.shipments(client_ref);
CREATE INDEX IF NOT EXISTS idx_shipments_bl_reference ON public.shipments(bl_reference);
CREATE INDEX IF NOT EXISTS idx_shipments_current_status ON public.shipments(current_status);
CREATE INDEX IF NOT EXISTS idx_shipments_client_id ON public.shipments(client_id);
CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON public.shipments(created_at DESC);

-- ShipmentContainer indexes
CREATE INDEX IF NOT EXISTS idx_shipment_containers_container_number ON public.shipment_containers(container_number);
CREATE INDEX IF NOT EXISTS idx_shipment_containers_shipment_id ON public.shipment_containers(shipment_id);

-- TrackingEvent indexes
CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment_id ON public.tracking_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_event_datetime ON public.tracking_events(event_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_status ON public.tracking_events(status);

-- AuditLog indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON public.audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON public.audit_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user_id ON public.audit_log(actor_user_id);

-- 4. Check constraint: Customer users must have client_id
-- Create a function to validate customer client_id
CREATE OR REPLACE FUNCTION public.validate_customer_client_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Get the user's role
  SELECT role INTO user_role FROM public.user_roles WHERE user_id = NEW.id LIMIT 1;
  
  -- If user is CUSTOMER and client_id is null, raise error
  IF user_role = 'CUSTOMER' AND NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'Customer users must have a client_id';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles to validate customer client_id
DROP TRIGGER IF EXISTS validate_customer_client_id_trigger ON public.profiles;
CREATE TRIGGER validate_customer_client_id_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_customer_client_id();

-- Also validate when role changes to CUSTOMER
CREATE OR REPLACE FUNCTION public.validate_role_change_client_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_client_id uuid;
BEGIN
  -- If new role is CUSTOMER, check that profile has client_id
  IF NEW.role = 'CUSTOMER' THEN
    SELECT client_id INTO profile_client_id FROM public.profiles WHERE id = NEW.user_id;
    IF profile_client_id IS NULL THEN
      RAISE EXCEPTION 'Cannot assign CUSTOMER role to user without client_id';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_role_change_client_id_trigger ON public.user_roles;
CREATE TRIGGER validate_role_change_client_id_trigger
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_role_change_client_id();