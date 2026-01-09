-- Create system settings table for configurable options
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Authenticated users can read settings"
ON public.system_settings FOR SELECT
TO authenticated
USING (true);

-- Only managers can modify settings
CREATE POLICY "Managers can manage settings"
ON public.system_settings FOR ALL
USING (has_role(auth.uid(), 'MANAGER'))
WITH CHECK (has_role(auth.uid(), 'MANAGER'));

-- Trigger for updated_at
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.system_settings (key, value, description) VALUES
('shipping_lines', '["MSC", "Maersk", "CMA CGM", "Hapag-Lloyd", "COSCO", "Evergreen", "ONE", "Yang Ming", "HMM", "ZIM"]', 'Available shipping lines'),
('container_types', '["20GP", "40GP", "40HC", "20RF", "40RF", "45HC", "20OT", "40OT", "20FR", "40FR"]', 'Available container types'),
('terminals', '["Terminal A", "Terminal B", "Terminal C", "Port Terminal 1", "Port Terminal 2"]', 'Available terminals'),
('operators', '["John Smith", "Jane Doe", "Mike Johnson", "Sarah Williams"]', 'Available operators');