-- Create severity enum
CREATE TYPE public.exception_severity AS ENUM ('P1', 'P2', 'P3');

-- Create exception status enum
CREATE TYPE public.exception_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- Create ExceptionRule table
CREATE TABLE public.exception_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status_trigger shipment_status NOT NULL,
  max_hours_in_status INTEGER NOT NULL,
  applies_to_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  applies_to_service_type TEXT,
  severity exception_severity NOT NULL DEFAULT 'P3',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ShipmentException table
CREATE TABLE public.shipment_exceptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  exception_rule_id UUID NOT NULL REFERENCES public.exception_rules(id) ON DELETE CASCADE,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  severity exception_severity NOT NULL,
  status exception_status NOT NULL DEFAULT 'OPEN',
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_exception_rules_status_trigger ON public.exception_rules(status_trigger);
CREATE INDEX idx_exception_rules_active ON public.exception_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_shipment_exceptions_status ON public.shipment_exceptions(status);
CREATE INDEX idx_shipment_exceptions_shipment ON public.shipment_exceptions(shipment_id);
CREATE INDEX idx_shipment_exceptions_severity ON public.shipment_exceptions(severity);
CREATE UNIQUE INDEX idx_shipment_exceptions_unique_open ON public.shipment_exceptions(shipment_id, exception_rule_id) WHERE status = 'OPEN';

-- Enable RLS
ALTER TABLE public.exception_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_exceptions ENABLE ROW LEVEL SECURITY;

-- RLS for exception_rules
CREATE POLICY "Internal users can view exception rules"
ON public.exception_rules FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Managers can manage exception rules"
ON public.exception_rules FOR ALL
USING (has_role(auth.uid(), 'MANAGER'))
WITH CHECK (has_role(auth.uid(), 'MANAGER'));

-- RLS for shipment_exceptions
CREATE POLICY "Internal users can view exceptions"
ON public.shipment_exceptions FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create exceptions"
ON public.shipment_exceptions FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update exceptions"
ON public.shipment_exceptions FOR UPDATE
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

-- Trigger for updated_at on exception_rules
CREATE TRIGGER update_exception_rules_updated_at
BEFORE UPDATE ON public.exception_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default exception rules
INSERT INTO public.exception_rules (name, description, status_trigger, max_hours_in_status, severity) VALUES
('Documents Pending Too Long', 'Documents not received within expected timeframe', 'DOCS_VALIDATION', 48, 'P2'),
('Processing Delay', 'Shipment stuck in processing', 'PROCESSING', 24, 'P2'),
('Transit Delay', 'Shipment in transit longer than expected', 'IN_TRANSIT', 72, 'P3'),
('Terminal Dwell Time', 'Shipment at terminal too long', 'AT_TERMINAL', 24, 'P2'),
('Clearance Delay', 'Customs clearance taking too long', 'CLEARANCE', 48, 'P1'),
('Delivery Delay', 'Out for delivery too long', 'OUT_FOR_DELIVERY', 8, 'P1'),
('Incident Not Resolved', 'Shipment on hold without resolution', 'ON_HOLD_INCIDENT', 12, 'P1');