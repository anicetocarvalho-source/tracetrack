
-- Update shipments RLS policies to include COUNTRY_ADMIN access based on country

-- Drop existing shipments policies
DROP POLICY IF EXISTS "Internal users can view branch shipments" ON public.shipments;
DROP POLICY IF EXISTS "Internal users can create branch shipments" ON public.shipments;
DROP POLICY IF EXISTS "Internal users can update branch shipments" ON public.shipments;

-- Create new policies that include COUNTRY_ADMIN support
CREATE POLICY "Internal users can view branch shipments"
  ON public.shipments FOR SELECT
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.user_has_branch_access(auth.uid(), branch_id)
      OR EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = shipments.branch_id
        AND public.is_country_admin(auth.uid(), b.country_id)
      )
    )
  );

CREATE POLICY "Internal users can create branch shipments"
  ON public.shipments FOR INSERT
  WITH CHECK (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.user_has_branch_access(auth.uid(), branch_id)
      OR EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = branch_id
        AND public.is_country_admin(auth.uid(), b.country_id)
      )
    )
  );

CREATE POLICY "Internal users can update branch shipments"
  ON public.shipments FOR UPDATE
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.user_has_branch_access(auth.uid(), branch_id)
      OR EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = shipments.branch_id
        AND public.is_country_admin(auth.uid(), b.country_id)
      )
    )
  )
  WITH CHECK (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.user_has_branch_access(auth.uid(), branch_id)
      OR EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = shipments.branch_id
        AND public.is_country_admin(auth.uid(), b.country_id)
      )
    )
  );

-- Also update related tables that shipments depend on

-- Update tracking_events RLS to include COUNTRY_ADMIN
DROP POLICY IF EXISTS "Internal users can view tracking events" ON public.tracking_events;
DROP POLICY IF EXISTS "Internal users can create tracking events" ON public.tracking_events;

CREATE POLICY "Internal users can view tracking events"
  ON public.tracking_events FOR SELECT
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        LEFT JOIN public.branches b ON b.id = s.branch_id
        WHERE s.id = tracking_events.shipment_id
        AND (
          public.user_has_branch_access(auth.uid(), s.branch_id)
          OR public.is_country_admin(auth.uid(), b.country_id)
        )
      )
    )
  );

CREATE POLICY "Internal users can create tracking events"
  ON public.tracking_events FOR INSERT
  WITH CHECK (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        LEFT JOIN public.branches b ON b.id = s.branch_id
        WHERE s.id = shipment_id
        AND (
          public.user_has_branch_access(auth.uid(), s.branch_id)
          OR public.is_country_admin(auth.uid(), b.country_id)
        )
      )
    )
  );

-- Update shipment_containers RLS to include COUNTRY_ADMIN
DROP POLICY IF EXISTS "Internal users can view containers" ON public.shipment_containers;
DROP POLICY IF EXISTS "Internal users can manage containers" ON public.shipment_containers;

CREATE POLICY "Internal users can view containers"
  ON public.shipment_containers FOR SELECT
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        LEFT JOIN public.branches b ON b.id = s.branch_id
        WHERE s.id = shipment_containers.shipment_id
        AND (
          public.user_has_branch_access(auth.uid(), s.branch_id)
          OR public.is_country_admin(auth.uid(), b.country_id)
        )
      )
    )
  );

CREATE POLICY "Internal users can manage containers"
  ON public.shipment_containers FOR ALL
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        LEFT JOIN public.branches b ON b.id = s.branch_id
        WHERE s.id = shipment_containers.shipment_id
        AND (
          public.user_has_branch_access(auth.uid(), s.branch_id)
          OR public.is_country_admin(auth.uid(), b.country_id)
        )
      )
    )
  );

-- Update shipment_documents RLS to include COUNTRY_ADMIN
DROP POLICY IF EXISTS "Internal users can view documents" ON public.shipment_documents;
DROP POLICY IF EXISTS "Internal users can manage documents" ON public.shipment_documents;

CREATE POLICY "Internal users can view documents"
  ON public.shipment_documents FOR SELECT
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        LEFT JOIN public.branches b ON b.id = s.branch_id
        WHERE s.id = shipment_documents.shipment_id
        AND (
          public.user_has_branch_access(auth.uid(), s.branch_id)
          OR public.is_country_admin(auth.uid(), b.country_id)
        )
      )
    )
  );

CREATE POLICY "Internal users can manage documents"
  ON public.shipment_documents FOR ALL
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        LEFT JOIN public.branches b ON b.id = s.branch_id
        WHERE s.id = shipment_documents.shipment_id
        AND (
          public.user_has_branch_access(auth.uid(), s.branch_id)
          OR public.is_country_admin(auth.uid(), b.country_id)
        )
      )
    )
  );

-- Update shipment_exceptions RLS to include COUNTRY_ADMIN
DROP POLICY IF EXISTS "Internal users can view exceptions" ON public.shipment_exceptions;
DROP POLICY IF EXISTS "Internal users can manage exceptions" ON public.shipment_exceptions;

CREATE POLICY "Internal users can view exceptions"
  ON public.shipment_exceptions FOR SELECT
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        LEFT JOIN public.branches b ON b.id = s.branch_id
        WHERE s.id = shipment_exceptions.shipment_id
        AND (
          public.user_has_branch_access(auth.uid(), s.branch_id)
          OR public.is_country_admin(auth.uid(), b.country_id)
        )
      )
    )
  );

CREATE POLICY "Internal users can manage exceptions"
  ON public.shipment_exceptions FOR ALL
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        LEFT JOIN public.branches b ON b.id = s.branch_id
        WHERE s.id = shipment_exceptions.shipment_id
        AND (
          public.user_has_branch_access(auth.uid(), s.branch_id)
          OR public.is_country_admin(auth.uid(), b.country_id)
        )
      )
    )
  );

-- Update shipment_sla RLS to include COUNTRY_ADMIN
DROP POLICY IF EXISTS "Internal users can view SLA records" ON public.shipment_sla;
DROP POLICY IF EXISTS "Internal users can manage SLA records" ON public.shipment_sla;

CREATE POLICY "Internal users can view SLA records"
  ON public.shipment_sla FOR SELECT
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        LEFT JOIN public.branches b ON b.id = s.branch_id
        WHERE s.id = shipment_sla.shipment_id
        AND (
          public.user_has_branch_access(auth.uid(), s.branch_id)
          OR public.is_country_admin(auth.uid(), b.country_id)
        )
      )
    )
  );

CREATE POLICY "Internal users can manage SLA records"
  ON public.shipment_sla FOR ALL
  USING (
    public.is_internal_user(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        LEFT JOIN public.branches b ON b.id = s.branch_id
        WHERE s.id = shipment_sla.shipment_id
        AND (
          public.user_has_branch_access(auth.uid(), s.branch_id)
          OR public.is_country_admin(auth.uid(), b.country_id)
        )
      )
    )
  );
