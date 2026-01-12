-- =============================================
-- MULTI-TENANT ARCHITECTURE: Countries & Branches
-- =============================================

-- 1. Create countries table
CREATE TABLE public.countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  default_language TEXT NOT NULL DEFAULT 'en',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Create branches table
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT, -- NULL means inherit from country
  default_language TEXT, -- NULL means inherit from country
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Create branch_settings table for branch-specific configurations
CREATE TABLE public.branch_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(branch_id, setting_key)
);

-- 4. Add branch columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN allowed_branch_ids UUID[] DEFAULT '{}'::uuid[];

-- 5. Add columns to clients
ALTER TABLE public.clients
  ADD COLUMN parent_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN subsidiary_visibility TEXT NOT NULL DEFAULT 'own_only' CHECK (subsidiary_visibility IN ('own_only', 'own_and_subsidiaries', 'read_only_group'));

-- 6. Add branch_id to sla_config for branch-level overrides
ALTER TABLE public.sla_config
  ADD COLUMN branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;

-- 7. Add branch_id and country_id to audit_log
ALTER TABLE public.audit_log
  ADD COLUMN branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL;

-- 8. Add branch_id to shipments for filtering
ALTER TABLE public.shipments
  ADD COLUMN branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- =============================================
-- CREATE DEFAULT COUNTRY AND BRANCH
-- =============================================

-- Insert default country (Global/HQ)
INSERT INTO public.countries (id, code, name, timezone, default_language)
VALUES ('00000000-0000-0000-0000-000000000001', 'GLB', 'Global Headquarters', 'UTC', 'en');

-- Insert default branch
INSERT INTO public.branches (id, country_id, code, name, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'HQ', 'Headquarters', true);

-- Assign existing data to default branch
UPDATE public.profiles SET branch_id = '00000000-0000-0000-0000-000000000001' WHERE branch_id IS NULL;
UPDATE public.clients SET branch_id = '00000000-0000-0000-0000-000000000001' WHERE branch_id IS NULL;
UPDATE public.shipments SET branch_id = '00000000-0000-0000-0000-000000000001' WHERE branch_id IS NULL;

-- =============================================
-- SECURITY DEFINER FUNCTIONS
-- =============================================

-- Function to get user's branch_id
CREATE OR REPLACE FUNCTION public.get_user_branch_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.profiles WHERE id = _user_id
$$;

-- Function to get user's allowed branches (including their own)
CREATE OR REPLACE FUNCTION public.get_user_allowed_branches(_user_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN allowed_branch_ids IS NOT NULL AND array_length(allowed_branch_ids, 1) > 0 
    THEN array_append(allowed_branch_ids, branch_id)
    ELSE ARRAY[branch_id]
  END
  FROM public.profiles WHERE id = _user_id
$$;

-- Function to check if user has access to a specific branch
CREATE OR REPLACE FUNCTION public.user_has_branch_access(_user_id UUID, _branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
    AND (
      branch_id = _branch_id
      OR _branch_id = ANY(allowed_branch_ids)
    )
  )
$$;

-- Function to check if user is multi-branch manager
CREATE OR REPLACE FUNCTION public.is_multi_branch_manager(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON p.id = ur.user_id
    WHERE p.id = _user_id
    AND ur.role = 'MANAGER'
    AND array_length(p.allowed_branch_ids, 1) > 0
  )
$$;

-- Function to get client's subsidiary IDs based on visibility settings
CREATE OR REPLACE FUNCTION public.get_client_visible_ids(_client_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE client_tree AS (
    -- Start with the client itself
    SELECT id, parent_client_id, subsidiary_visibility, 0 as depth
    FROM public.clients WHERE id = _client_id
    
    UNION ALL
    
    -- Add subsidiaries if visibility allows
    SELECT c.id, c.parent_client_id, c.subsidiary_visibility, ct.depth + 1
    FROM public.clients c
    JOIN client_tree ct ON c.parent_client_id = ct.id
    WHERE ct.subsidiary_visibility IN ('own_and_subsidiaries', 'read_only_group')
    AND ct.depth < 10 -- Prevent infinite recursion
  )
  SELECT array_agg(DISTINCT id) FROM client_tree
$$;

-- =============================================
-- UPDATED SLA CONFIG FUNCTION (with branch inheritance)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_sla_config(p_client_id UUID, p_status shipment_status)
RETURNS TABLE(id UUID, max_hours INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Priority: 1) Client-specific, 2) Branch-specific, 3) Global
  SELECT sc.id, sc.max_hours
  FROM public.sla_config sc
  LEFT JOIN public.clients c ON c.id = p_client_id
  WHERE sc.shipment_status = p_status
    AND sc.is_active = true
    AND (
      sc.client_id = p_client_id 
      OR (sc.client_id IS NULL AND sc.branch_id = c.branch_id)
      OR (sc.client_id IS NULL AND sc.branch_id IS NULL)
    )
  ORDER BY 
    sc.client_id NULLS LAST,
    sc.branch_id NULLS LAST
  LIMIT 1
$$;

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================

CREATE TRIGGER update_countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_branch_settings_updated_at
  BEFORE UPDATE ON public.branch_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Countries RLS
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view countries"
  ON public.countries FOR SELECT
  USING (true);

CREATE POLICY "Managers can manage countries"
  ON public.countries FOR ALL
  USING (has_role(auth.uid(), 'MANAGER'))
  WITH CHECK (has_role(auth.uid(), 'MANAGER'));

-- Branches RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view branches they have access to"
  ON public.branches FOR SELECT
  USING (
    is_internal_user(auth.uid()) 
    AND (
      id = get_user_branch_id(auth.uid())
      OR id = ANY(get_user_allowed_branches(auth.uid()))
    )
  );

CREATE POLICY "Managers can manage branches"
  ON public.branches FOR ALL
  USING (has_role(auth.uid(), 'MANAGER'))
  WITH CHECK (has_role(auth.uid(), 'MANAGER'));

-- Branch Settings RLS
ALTER TABLE public.branch_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view branch settings for their branches"
  ON public.branch_settings FOR SELECT
  USING (
    is_internal_user(auth.uid())
    AND user_has_branch_access(auth.uid(), branch_id)
  );

CREATE POLICY "Managers can manage branch settings"
  ON public.branch_settings FOR ALL
  USING (has_role(auth.uid(), 'MANAGER'))
  WITH CHECK (has_role(auth.uid(), 'MANAGER'));

-- =============================================
-- UPDATE EXISTING RLS POLICIES FOR BRANCH AWARENESS
-- =============================================

-- Update shipments policies to include branch filtering
DROP POLICY IF EXISTS "Internal users can view all shipments" ON public.shipments;
CREATE POLICY "Internal users can view branch shipments"
  ON public.shipments FOR SELECT
  USING (
    is_internal_user(auth.uid())
    AND user_has_branch_access(auth.uid(), branch_id)
  );

DROP POLICY IF EXISTS "Internal users can create shipments" ON public.shipments;
CREATE POLICY "Internal users can create branch shipments"
  ON public.shipments FOR INSERT
  WITH CHECK (
    is_internal_user(auth.uid())
    AND user_has_branch_access(auth.uid(), branch_id)
  );

DROP POLICY IF EXISTS "Internal users can update shipments" ON public.shipments;
CREATE POLICY "Internal users can update branch shipments"
  ON public.shipments FOR UPDATE
  USING (
    is_internal_user(auth.uid())
    AND user_has_branch_access(auth.uid(), branch_id)
  )
  WITH CHECK (
    is_internal_user(auth.uid())
    AND user_has_branch_access(auth.uid(), branch_id)
  );

-- Update customers policy to handle subsidiary visibility
DROP POLICY IF EXISTS "Customers can view own client shipments" ON public.shipments;
CREATE POLICY "Customers can view own client shipments"
  ON public.shipments FOR SELECT
  USING (
    has_role(auth.uid(), 'CUSTOMER')
    AND client_id = ANY(get_client_visible_ids(get_user_client_id(auth.uid())))
  );

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX idx_branches_country_id ON public.branches(country_id);
CREATE INDEX idx_branches_is_active ON public.branches(is_active);
CREATE INDEX idx_branch_settings_branch_id ON public.branch_settings(branch_id);
CREATE INDEX idx_profiles_branch_id ON public.profiles(branch_id);
CREATE INDEX idx_clients_branch_id ON public.clients(branch_id);
CREATE INDEX idx_clients_parent_client_id ON public.clients(parent_client_id);
CREATE INDEX idx_shipments_branch_id ON public.shipments(branch_id);
CREATE INDEX idx_audit_log_branch_id ON public.audit_log(branch_id);
CREATE INDEX idx_sla_config_branch_id ON public.sla_config(branch_id);