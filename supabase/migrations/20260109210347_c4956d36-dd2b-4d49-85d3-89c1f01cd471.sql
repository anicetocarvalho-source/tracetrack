-- Insert SLA targets setting if it doesn't exist
INSERT INTO public.system_settings (key, value, description)
VALUES (
  'sla_targets',
  '{"P1": 4, "P2": 24, "P3": 72}'::jsonb,
  'SLA target hours for exception resolution by severity'
)
ON CONFLICT (key) DO NOTHING;