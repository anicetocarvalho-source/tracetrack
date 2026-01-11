-- Create client scorecards table
CREATE TABLE public.client_scorecards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  
  -- KPI metrics
  total_shipments INTEGER NOT NULL DEFAULT 0,
  delivered_shipments INTEGER NOT NULL DEFAULT 0,
  on_time_delivery_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  sla_compliance_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  total_incidents INTEGER NOT NULL DEFAULT 0,
  avg_transit_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Exception breakdown
  exceptions_p1 INTEGER NOT NULL DEFAULT 0,
  exceptions_p2 INTEGER NOT NULL DEFAULT 0,
  exceptions_p3 INTEGER NOT NULL DEFAULT 0,
  
  -- Status breakdown (JSON for flexibility)
  status_breakdown JSONB NOT NULL DEFAULT '{}',
  top_issues JSONB NOT NULL DEFAULT '[]',
  
  -- Trend data (last 6 months for charts)
  trend_data JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id),
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint per client per period
  UNIQUE(client_id, period_year, period_month)
);

-- Enable RLS
ALTER TABLE public.client_scorecards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Managers can do everything
CREATE POLICY "Managers can manage scorecards"
ON public.client_scorecards
FOR ALL
USING (has_role(auth.uid(), 'MANAGER'))
WITH CHECK (has_role(auth.uid(), 'MANAGER'));

-- Supervisors can view all scorecards
CREATE POLICY "Supervisors can view scorecards"
ON public.client_scorecards
FOR SELECT
USING (has_role(auth.uid(), 'SUPERVISOR'));

-- Technicians can view scorecards
CREATE POLICY "Technicians can view scorecards"
ON public.client_scorecards
FOR SELECT
USING (has_role(auth.uid(), 'TECHNICIAN'));

-- Customers can view their own client's scorecards only
CREATE POLICY "Customers can view own scorecards"
ON public.client_scorecards
FOR SELECT
USING (
  has_role(auth.uid(), 'CUSTOMER') 
  AND client_id = get_user_client_id(auth.uid())
);

-- Create scorecard exports table for audit
CREATE TABLE public.scorecard_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scorecard_id UUID NOT NULL REFERENCES public.client_scorecards(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('PDF', 'EMAIL')),
  exported_by UUID NOT NULL REFERENCES auth.users(id),
  recipient_emails TEXT[],
  exported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scorecard_exports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for exports
CREATE POLICY "Internal users can manage exports"
ON public.scorecard_exports
FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

-- Customers can view their exports
CREATE POLICY "Customers can view own exports"
ON public.scorecard_exports
FOR SELECT
USING (
  has_role(auth.uid(), 'CUSTOMER')
  AND EXISTS (
    SELECT 1 FROM public.client_scorecards cs
    WHERE cs.id = scorecard_exports.scorecard_id
    AND cs.client_id = get_user_client_id(auth.uid())
  )
);

-- Add updated_at trigger
CREATE TRIGGER update_client_scorecards_updated_at
BEFORE UPDATE ON public.client_scorecards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_client_scorecards_client_period ON public.client_scorecards(client_id, period_year DESC, period_month DESC);
CREATE INDEX idx_client_scorecards_period ON public.client_scorecards(period_year DESC, period_month DESC);