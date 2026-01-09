-- SLA Configuration table: defines max hours per status, optionally per client
CREATE TABLE public.sla_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  shipment_status public.shipment_status NOT NULL,
  max_hours INTEGER NOT NULL CHECK (max_hours > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(client_id, shipment_status)
);

-- Shipment SLA tracking: records time spent in each status
CREATE TABLE public.shipment_sla (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  shipment_status public.shipment_status NOT NULL,
  entered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  exited_at TIMESTAMP WITH TIME ZONE,
  elapsed_hours INTEGER,
  breached BOOLEAN DEFAULT false,
  sla_config_id UUID REFERENCES public.sla_config(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(shipment_id, shipment_status, entered_at)
);

-- Enable RLS
ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_sla ENABLE ROW LEVEL SECURITY;

-- SLA Config policies
CREATE POLICY "Internal users can view SLA config"
  ON public.sla_config FOR SELECT
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Managers can manage SLA config"
  ON public.sla_config FOR ALL
  USING (public.has_role(auth.uid(), 'MANAGER'))
  WITH CHECK (public.has_role(auth.uid(), 'MANAGER'));

-- Shipment SLA policies
CREATE POLICY "Internal users can view shipment SLA"
  ON public.shipment_sla FOR SELECT
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can manage shipment SLA"
  ON public.shipment_sla FOR ALL
  USING (public.is_internal_user(auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Customers can view own shipment SLA"
  ON public.shipment_sla FOR SELECT
  USING (
    public.has_role(auth.uid(), 'CUSTOMER') AND
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_sla.shipment_id
      AND s.client_id = public.get_user_client_id(auth.uid())
    )
  );

-- Indexes for performance
CREATE INDEX idx_sla_config_client_status ON public.sla_config(client_id, shipment_status);
CREATE INDEX idx_sla_config_status ON public.sla_config(shipment_status) WHERE client_id IS NULL;
CREATE INDEX idx_shipment_sla_shipment ON public.shipment_sla(shipment_id);
CREATE INDEX idx_shipment_sla_breached ON public.shipment_sla(breached) WHERE breached = true;
CREATE INDEX idx_shipment_sla_status ON public.shipment_sla(shipment_status);

-- Update trigger for sla_config
CREATE TRIGGER update_sla_config_updated_at
  BEFORE UPDATE ON public.sla_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get applicable SLA config for a shipment status
CREATE OR REPLACE FUNCTION public.get_sla_config(
  p_client_id UUID,
  p_status public.shipment_status
)
RETURNS TABLE(id UUID, max_hours INTEGER) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- First try client-specific, then global
  SELECT sc.id, sc.max_hours
  FROM public.sla_config sc
  WHERE sc.shipment_status = p_status
    AND sc.is_active = true
    AND (sc.client_id = p_client_id OR sc.client_id IS NULL)
  ORDER BY sc.client_id NULLS LAST
  LIMIT 1;
$$;

-- Function to process SLA when status changes
CREATE OR REPLACE FUNCTION public.process_shipment_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sla_config_id UUID;
  v_max_hours INTEGER;
  v_elapsed_hours INTEGER;
  v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
  -- Only process if status changed
  IF OLD.current_status = NEW.current_status THEN
    RETURN NEW;
  END IF;

  -- Close out the previous status SLA record
  UPDATE public.shipment_sla
  SET 
    exited_at = v_now,
    elapsed_hours = EXTRACT(EPOCH FROM (v_now - entered_at)) / 3600
  WHERE shipment_id = NEW.id
    AND shipment_status = OLD.current_status
    AND exited_at IS NULL;

  -- Check if the closed record breached SLA
  UPDATE public.shipment_sla ss
  SET breached = (ss.elapsed_hours > sc.max_hours)
  FROM public.sla_config sc
  WHERE ss.shipment_id = NEW.id
    AND ss.shipment_status = OLD.current_status
    AND ss.exited_at = v_now
    AND ss.sla_config_id = sc.id;

  -- Get applicable SLA config for new status
  SELECT id, max_hours INTO v_sla_config_id, v_max_hours
  FROM public.get_sla_config(NEW.client_id, NEW.current_status);

  -- Create new SLA record for the new status
  INSERT INTO public.shipment_sla (
    shipment_id,
    shipment_status,
    entered_at,
    sla_config_id
  ) VALUES (
    NEW.id,
    NEW.current_status,
    v_now,
    v_sla_config_id
  );

  RETURN NEW;
END;
$$;

-- Trigger for shipment status changes
CREATE TRIGGER shipment_status_sla_trigger
  AFTER UPDATE OF current_status ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.process_shipment_sla();

-- Trigger for new shipments
CREATE OR REPLACE FUNCTION public.init_shipment_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sla_config_id UUID;
  v_max_hours INTEGER;
BEGIN
  -- Get applicable SLA config for initial status
  SELECT id, max_hours INTO v_sla_config_id, v_max_hours
  FROM public.get_sla_config(NEW.client_id, NEW.current_status);

  -- Create initial SLA record
  INSERT INTO public.shipment_sla (
    shipment_id,
    shipment_status,
    entered_at,
    sla_config_id
  ) VALUES (
    NEW.id,
    NEW.current_status,
    NEW.created_at,
    v_sla_config_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER shipment_init_sla_trigger
  AFTER INSERT ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.init_shipment_sla();

-- Insert default global SLA configs
INSERT INTO public.sla_config (client_id, shipment_status, max_hours) VALUES
  (NULL, 'RECEIVED', 4),
  (NULL, 'REGISTERED', 8),
  (NULL, 'DOCS_VALIDATION', 24),
  (NULL, 'PROCESSING', 48),
  (NULL, 'IN_TRANSIT', 168),
  (NULL, 'AT_TERMINAL', 24),
  (NULL, 'CLEARANCE', 72),
  (NULL, 'OUT_FOR_DELIVERY', 24),
  (NULL, 'ON_HOLD_INCIDENT', 48);