-- ENUMS
CREATE TYPE public.app_role AS ENUM ('TECHNICIAN', 'SUPERVISOR', 'MANAGER', 'CUSTOMER');
CREATE TYPE public.shipment_status AS ENUM (
  'RECEIVED', 'REGISTERED', 'DOCS_VALIDATION', 'PROCESSING', 
  'IN_TRANSIT', 'AT_TERMINAL', 'CLEARANCE', 'OUT_FOR_DELIVERY', 
  'DELIVERED', 'ON_HOLD_INCIDENT', 'CANCELLED'
);

-- CLIENTS TABLE
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  notification_emails TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PROFILES TABLE (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- USER_ROLES TABLE (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- SHIPMENTS TABLE
CREATE TABLE public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_ref TEXT UNIQUE NOT NULL,
  client_ref TEXT NOT NULL,
  file_number TEXT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  assigned_operator TEXT,
  shipping_line TEXT NOT NULL,
  bl_reference TEXT NOT NULL,
  forecast_shipping_line DATE,
  forecast_terminal DATE,
  discharge_date DATE,
  service_request_date DATE,
  docs_received_date DATE,
  current_status shipment_status NOT NULL DEFAULT 'RECEIVED',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SHIPMENT_CONTAINERS TABLE
CREATE TABLE public.shipment_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  container_number TEXT NOT NULL,
  container_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRACKING_EVENTS TABLE (immutable ledger)
CREATE TABLE public.tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  status shipment_status NOT NULL,
  note TEXT NOT NULL,
  location TEXT,
  event_datetime TIMESTAMPTZ NOT NULL DEFAULT now(),
  visible_to_client BOOLEAN NOT NULL DEFAULT false,
  notify_client BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AUDIT_LOG TABLE
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  metadata_json JSONB DEFAULT '{}'
);

-- INDEXES
CREATE INDEX idx_shipments_client ON public.shipments(client_id);
CREATE INDEX idx_shipments_status ON public.shipments(current_status);
CREATE INDEX idx_shipments_ref ON public.shipments(shipment_ref);
CREATE INDEX idx_shipment_containers_shipment ON public.shipment_containers(shipment_id);
CREATE INDEX idx_tracking_events_shipment ON public.tracking_events(shipment_id);
CREATE INDEX idx_tracking_events_datetime ON public.tracking_events(event_datetime DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_actor ON public.audit_log(actor_user_id);
CREATE INDEX idx_audit_log_timestamp ON public.audit_log(timestamp DESC);
CREATE INDEX idx_profiles_client ON public.profiles(client_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

-- SECURITY DEFINER FUNCTION: Check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- SECURITY DEFINER FUNCTION: Get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- SECURITY DEFINER FUNCTION: Get user client_id
CREATE OR REPLACE FUNCTION public.get_user_client_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE id = _user_id
$$;

-- SECURITY DEFINER FUNCTION: Is internal user
CREATE OR REPLACE FUNCTION public.is_internal_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('TECHNICIAN', 'SUPERVISOR', 'MANAGER')
  )
$$;

-- UPDATE TIMESTAMPS TRIGGER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PREVENT TRACKING EVENT UPDATES/DELETES (immutable)
CREATE OR REPLACE FUNCTION public.prevent_tracking_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Tracking events are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_tracking_event_update
  BEFORE UPDATE ON public.tracking_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tracking_event_modification();

CREATE TRIGGER prevent_tracking_event_delete
  BEFORE DELETE ON public.tracking_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tracking_event_modification();

-- ENABLE RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- CLIENTS RLS: Internal users can view all, Customers can view their own
CREATE POLICY "Internal users can view all clients"
  ON public.clients FOR SELECT
  TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Customers can view their own client"
  ON public.clients FOR SELECT
  TO authenticated
  USING (id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Managers can manage clients"
  ON public.clients FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'MANAGER'))
  WITH CHECK (public.has_role(auth.uid(), 'MANAGER'));

-- PROFILES RLS
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Internal users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Managers can manage all profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'MANAGER'))
  WITH CHECK (public.has_role(auth.uid(), 'MANAGER'));

-- USER_ROLES RLS
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Internal users can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Managers can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'MANAGER'))
  WITH CHECK (public.has_role(auth.uid(), 'MANAGER'));

-- SHIPMENTS RLS
CREATE POLICY "Internal users can view all shipments"
  ON public.shipments FOR SELECT
  TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Customers can view own client shipments"
  ON public.shipments FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'CUSTOMER') 
    AND client_id = public.get_user_client_id(auth.uid())
  );

CREATE POLICY "Internal users can create shipments"
  ON public.shipments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update shipments"
  ON public.shipments FOR UPDATE
  TO authenticated
  USING (public.is_internal_user(auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()));

-- SHIPMENT_CONTAINERS RLS
CREATE POLICY "Internal users can view all containers"
  ON public.shipment_containers FOR SELECT
  TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Customers can view own shipment containers"
  ON public.shipment_containers FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'CUSTOMER') 
    AND EXISTS (
      SELECT 1 FROM public.shipments s 
      WHERE s.id = shipment_id 
      AND s.client_id = public.get_user_client_id(auth.uid())
    )
  );

CREATE POLICY "Internal users can manage containers"
  ON public.shipment_containers FOR ALL
  TO authenticated
  USING (public.is_internal_user(auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()));

-- TRACKING_EVENTS RLS
CREATE POLICY "Internal users can view all events"
  ON public.tracking_events FOR SELECT
  TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Customers can view visible events only"
  ON public.tracking_events FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'CUSTOMER') 
    AND visible_to_client = true
    AND EXISTS (
      SELECT 1 FROM public.shipments s 
      WHERE s.id = shipment_id 
      AND s.client_id = public.get_user_client_id(auth.uid())
    )
  );

CREATE POLICY "Internal users can create events"
  ON public.tracking_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_internal_user(auth.uid()));

-- AUDIT_LOG RLS
CREATE POLICY "Managers can view audit logs"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'MANAGER'));

CREATE POLICY "System can insert audit logs"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- FUNCTION: Handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED DATA: Demo Clients
INSERT INTO public.clients (id, name, notification_emails) VALUES
  ('a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d', 'Acme Logistics', ARRAY['logistics@acme.com', 'ops@acme.com']),
  ('b2c3d4e5-f6a7-5b6c-9d8e-0f1a2b3c4d5e', 'Global Trade Co', ARRAY['shipping@globaltrade.com']);