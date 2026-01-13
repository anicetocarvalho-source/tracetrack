-- Step 2: Create helper functions and update RLS policies for COUNTRY_ADMIN

-- Create helper function to get user's country_id
CREATE OR REPLACE FUNCTION public.get_user_country_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT country_id FROM public.profiles WHERE id = _user_id
$$;

-- Create function to check if user is a country admin for a specific country
CREATE OR REPLACE FUNCTION public.is_country_admin(_user_id uuid, _country_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id 
    AND ur.role = 'COUNTRY_ADMIN'
    AND p.country_id = _country_id
  )
$$;

-- Create function to check if user is ANY country admin (for their assigned country)
CREATE OR REPLACE FUNCTION public.is_any_country_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'COUNTRY_ADMIN'
  )
$$;

-- Create function to check if user has country access (ADMIN sees all, COUNTRY_ADMIN sees their country)
CREATE OR REPLACE FUNCTION public.user_has_country_access(_user_id uuid, _country_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.is_admin(_user_id)
    OR public.is_country_admin(_user_id, _country_id)
$$;

-- Update is_internal_user to include COUNTRY_ADMIN
CREATE OR REPLACE FUNCTION public.is_internal_user(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('ADMIN', 'COUNTRY_ADMIN', 'TECHNICIAN', 'SUPERVISOR', 'MANAGER')
  );
END;
$$;

-- Update branches RLS
DROP POLICY IF EXISTS "Managers can manage branches" ON public.branches;
DROP POLICY IF EXISTS "Users can view branches they have access to" ON public.branches;
DROP POLICY IF EXISTS "Admins can manage all branches" ON public.branches;
DROP POLICY IF EXISTS "Country admins can manage country branches" ON public.branches;
DROP POLICY IF EXISTS "Managers can manage their branch" ON public.branches;
DROP POLICY IF EXISTS "Internal users can view accessible branches" ON public.branches;

CREATE POLICY "Admins can manage all branches"
ON public.branches FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Country admins can manage country branches"
ON public.branches FOR ALL
USING (public.is_country_admin(auth.uid(), country_id))
WITH CHECK (public.is_country_admin(auth.uid(), country_id));

CREATE POLICY "Managers can manage their branch"
ON public.branches FOR ALL
USING (
  public.has_role(auth.uid(), 'MANAGER') 
  AND public.user_has_branch_access(auth.uid(), id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'MANAGER') 
  AND public.user_has_branch_access(auth.uid(), id)
);

CREATE POLICY "Internal users can view accessible branches"
ON public.branches FOR SELECT
USING (
  public.is_internal_user(auth.uid()) 
  AND (
    public.is_admin(auth.uid())
    OR public.is_country_admin(auth.uid(), country_id)
    OR public.user_has_branch_access(auth.uid(), id)
  )
);

-- Update countries RLS
DROP POLICY IF EXISTS "Managers can manage countries" ON public.countries;
DROP POLICY IF EXISTS "All authenticated users can view countries" ON public.countries;
DROP POLICY IF EXISTS "Customers can view countries" ON public.countries;
DROP POLICY IF EXISTS "Admins can manage all countries" ON public.countries;
DROP POLICY IF EXISTS "Country admins can manage their country" ON public.countries;
DROP POLICY IF EXISTS "Authenticated users can view countries" ON public.countries;

CREATE POLICY "Admins can manage all countries"
ON public.countries FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Country admins can manage their country"
ON public.countries FOR ALL
USING (public.is_country_admin(auth.uid(), id))
WITH CHECK (public.is_country_admin(auth.uid(), id));

CREATE POLICY "Authenticated users can view countries"
ON public.countries FOR SELECT
USING (true);

-- Update clients RLS
DROP POLICY IF EXISTS "Managers can manage clients" ON public.clients;
DROP POLICY IF EXISTS "Internal users can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Customers can view their own client" ON public.clients;
DROP POLICY IF EXISTS "Admins can manage all clients" ON public.clients;
DROP POLICY IF EXISTS "Country admins can manage country clients" ON public.clients;
DROP POLICY IF EXISTS "Managers can manage branch clients" ON public.clients;
DROP POLICY IF EXISTS "Internal users can view accessible clients" ON public.clients;

CREATE POLICY "Admins can manage all clients"
ON public.clients FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Country admins can manage country clients"
ON public.clients FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = clients.branch_id
    AND public.is_country_admin(auth.uid(), b.country_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = clients.branch_id
    AND public.is_country_admin(auth.uid(), b.country_id)
  )
);

CREATE POLICY "Managers can manage branch clients"
ON public.clients FOR ALL
USING (
  public.has_role(auth.uid(), 'MANAGER')
  AND public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'MANAGER')
  AND public.user_has_branch_access(auth.uid(), branch_id)
);

CREATE POLICY "Internal users can view accessible clients"
ON public.clients FOR SELECT
USING (
  public.is_internal_user(auth.uid())
  AND (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = clients.branch_id
      AND public.is_country_admin(auth.uid(), b.country_id)
    )
    OR public.user_has_branch_access(auth.uid(), branch_id)
  )
);

CREATE POLICY "Customers can view their own client"
ON public.clients FOR SELECT
USING (id = public.get_user_client_id(auth.uid()));

-- Update profiles RLS
DROP POLICY IF EXISTS "Managers can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Internal users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Country admins can manage country profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers can manage branch profiles" ON public.profiles;
DROP POLICY IF EXISTS "Internal users can view accessible profiles" ON public.profiles;

CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Country admins can manage country profiles"
ON public.profiles FOR ALL
USING (public.is_country_admin(auth.uid(), country_id))
WITH CHECK (public.is_country_admin(auth.uid(), country_id));

CREATE POLICY "Managers can manage branch profiles"
ON public.profiles FOR ALL
USING (
  public.has_role(auth.uid(), 'MANAGER')
  AND public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'MANAGER')
  AND public.user_has_branch_access(auth.uid(), branch_id)
);

CREATE POLICY "Internal users can view accessible profiles"
ON public.profiles FOR SELECT
USING (
  public.is_internal_user(auth.uid())
  AND (
    public.is_admin(auth.uid())
    OR public.is_country_admin(auth.uid(), country_id)
    OR public.user_has_branch_access(auth.uid(), branch_id)
    OR id = auth.uid()
  )
);

-- Update user_roles RLS
DROP POLICY IF EXISTS "Managers can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Internal users can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Country admins can manage country user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can manage branch user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Internal users can view accessible roles" ON public.user_roles;

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Country admins can manage country user roles"
ON public.user_roles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
    AND public.is_country_admin(auth.uid(), p.country_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
    AND public.is_country_admin(auth.uid(), p.country_id)
  )
  AND role NOT IN ('ADMIN', 'COUNTRY_ADMIN')
);

CREATE POLICY "Managers can manage branch user roles"
ON public.user_roles FOR ALL
USING (
  public.has_role(auth.uid(), 'MANAGER')
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
    AND public.user_has_branch_access(auth.uid(), p.branch_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'MANAGER')
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
    AND public.user_has_branch_access(auth.uid(), p.branch_id)
  )
  AND role NOT IN ('ADMIN', 'COUNTRY_ADMIN', 'MANAGER')
);

CREATE POLICY "Internal users can view accessible roles"
ON public.user_roles FOR SELECT
USING (
  public.is_internal_user(auth.uid())
  AND (
    public.is_admin(auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
      AND (
        public.is_country_admin(auth.uid(), p.country_id)
        OR public.user_has_branch_access(auth.uid(), p.branch_id)
      )
    )
  )
);

-- Update SLA config RLS
DROP POLICY IF EXISTS "Managers can manage SLA config" ON public.sla_config;
DROP POLICY IF EXISTS "Internal users can view SLA config" ON public.sla_config;
DROP POLICY IF EXISTS "Admins can manage all SLA config" ON public.sla_config;
DROP POLICY IF EXISTS "Country admins can manage country SLA config" ON public.sla_config;
DROP POLICY IF EXISTS "Managers can manage branch SLA config" ON public.sla_config;
DROP POLICY IF EXISTS "Internal users can view accessible SLA config" ON public.sla_config;

CREATE POLICY "Admins can manage all SLA config"
ON public.sla_config FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Country admins can manage country SLA config"
ON public.sla_config FOR ALL
USING (
  branch_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = sla_config.branch_id
    AND public.is_country_admin(auth.uid(), b.country_id)
  )
)
WITH CHECK (
  branch_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = sla_config.branch_id
    AND public.is_country_admin(auth.uid(), b.country_id)
  )
);

CREATE POLICY "Managers can manage branch SLA config"
ON public.sla_config FOR ALL
USING (
  public.has_role(auth.uid(), 'MANAGER')
  AND public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'MANAGER')
  AND public.user_has_branch_access(auth.uid(), branch_id)
);

CREATE POLICY "Internal users can view accessible SLA config"
ON public.sla_config FOR SELECT
USING (
  public.is_internal_user(auth.uid())
  AND (
    public.is_admin(auth.uid())
    OR branch_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = sla_config.branch_id
      AND public.is_country_admin(auth.uid(), b.country_id)
    )
    OR public.user_has_branch_access(auth.uid(), branch_id)
  )
);

-- Update exception_rules RLS
DROP POLICY IF EXISTS "Managers can manage exception rules" ON public.exception_rules;
DROP POLICY IF EXISTS "Internal users can view exception rules" ON public.exception_rules;
DROP POLICY IF EXISTS "Admins can manage all exception rules" ON public.exception_rules;
DROP POLICY IF EXISTS "Country admins can manage country exception rules" ON public.exception_rules;
DROP POLICY IF EXISTS "Managers can manage client exception rules" ON public.exception_rules;
DROP POLICY IF EXISTS "Internal users can view accessible exception rules" ON public.exception_rules;

CREATE POLICY "Admins can manage all exception rules"
ON public.exception_rules FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Country admins can manage country exception rules"
ON public.exception_rules FOR ALL
USING (
  applies_to_client_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.branches b ON b.id = c.branch_id
    WHERE c.id = exception_rules.applies_to_client_id
    AND public.is_country_admin(auth.uid(), b.country_id)
  )
)
WITH CHECK (
  applies_to_client_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.branches b ON b.id = c.branch_id
    WHERE c.id = exception_rules.applies_to_client_id
    AND public.is_country_admin(auth.uid(), b.country_id)
  )
);

CREATE POLICY "Managers can manage client exception rules"
ON public.exception_rules FOR ALL
USING (
  public.has_role(auth.uid(), 'MANAGER')
  AND applies_to_client_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = exception_rules.applies_to_client_id
    AND public.user_has_branch_access(auth.uid(), c.branch_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'MANAGER')
  AND applies_to_client_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = exception_rules.applies_to_client_id
    AND public.user_has_branch_access(auth.uid(), c.branch_id)
  )
);

CREATE POLICY "Internal users can view accessible exception rules"
ON public.exception_rules FOR SELECT
USING (
  public.is_internal_user(auth.uid())
  AND (
    public.is_admin(auth.uid())
    OR applies_to_client_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.clients c
      JOIN public.branches b ON b.id = c.branch_id
      WHERE c.id = exception_rules.applies_to_client_id
      AND (
        public.is_country_admin(auth.uid(), b.country_id)
        OR public.user_has_branch_access(auth.uid(), c.branch_id)
      )
    )
  )
);