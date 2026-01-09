-- Add escalation configuration to system_settings
INSERT INTO public.system_settings (key, value, description)
VALUES (
  'exception_escalation',
  '{"p2_to_p1_hours": 24, "p3_to_p2_hours": 48, "enabled": true}'::jsonb,
  'Configuration for automatic exception escalation. P2 exceptions escalate to P1 after p2_to_p1_hours, P3 to P2 after p3_to_p2_hours.'
)
ON CONFLICT (key) DO NOTHING;