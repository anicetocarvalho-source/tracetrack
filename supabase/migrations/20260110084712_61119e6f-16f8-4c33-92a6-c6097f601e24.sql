-- Enable realtime for shipment_sla table
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipment_sla;

-- Enable realtime for tracking_events table (triggers status changes)
ALTER PUBLICATION supabase_realtime ADD TABLE public.tracking_events;

-- Set REPLICA IDENTITY FULL for complete row data on updates
ALTER TABLE public.shipment_sla REPLICA IDENTITY FULL;
ALTER TABLE public.tracking_events REPLICA IDENTITY FULL;