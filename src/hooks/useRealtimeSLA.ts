import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface RealtimeSLAOptions {
  onSLAChange?: (payload: any) => void;
  onTrackingEvent?: (payload: any) => void;
  showToasts?: boolean;
}

export function useRealtimeSLA(options: RealtimeSLAOptions = {}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { onSLAChange, onTrackingEvent, showToasts = false } = options;

  useEffect(() => {
    console.log('[Realtime] Setting up SLA realtime subscriptions');

    // Subscribe to shipment_sla changes
    const slaChannel = supabase
      .channel('sla-realtime-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shipment_sla',
        },
        (payload) => {
          console.log('[Realtime] SLA change detected:', payload);
          
          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: ['sla-heatmap-data'] });
          queryClient.invalidateQueries({ queryKey: ['sla-critical-notifications'] });
          queryClient.invalidateQueries({ queryKey: ['shipment-sla'] });
          queryClient.invalidateQueries({ queryKey: ['shipment'] });
          
          // Show toast for breaches
          if (showToasts && payload.eventType === 'UPDATE' && payload.new?.breached === true && payload.old?.breached !== true) {
            toast.error(t('realtime.slaBreached'), {
              description: t('realtime.slaBreachedDescription'),
            });
          }
          
          onSLAChange?.(payload);
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] SLA channel status:', status);
      });

    // Subscribe to tracking_events changes (triggers status updates)
    const trackingChannel = supabase
      .channel('tracking-realtime-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tracking_events',
        },
        (payload) => {
          console.log('[Realtime] New tracking event:', payload);
          
          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: ['sla-heatmap-data'] });
          queryClient.invalidateQueries({ queryKey: ['sla-critical-notifications'] });
          queryClient.invalidateQueries({ queryKey: ['shipment'] });
          queryClient.invalidateQueries({ queryKey: ['tracking-events'] });
          queryClient.invalidateQueries({ queryKey: ['shipments'] });
          
          if (showToasts) {
            toast.info(t('realtime.statusUpdated'), {
              description: t('realtime.statusUpdatedDescription'),
            });
          }
          
          onTrackingEvent?.(payload);
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Tracking channel status:', status);
      });

    // Cleanup on unmount
    return () => {
      console.log('[Realtime] Cleaning up SLA realtime subscriptions');
      supabase.removeChannel(slaChannel);
      supabase.removeChannel(trackingChannel);
    };
  }, [queryClient, onSLAChange, onTrackingEvent, showToasts, t]);
}

// Hook specifically for a single shipment's SLA
export function useRealtimeShipmentSLA(shipmentId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!shipmentId) return;

    console.log('[Realtime] Setting up shipment-specific SLA subscription for:', shipmentId);

    const channel = supabase
      .channel(`shipment-sla-${shipmentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shipment_sla',
          filter: `shipment_id=eq.${shipmentId}`,
        },
        (payload) => {
          console.log('[Realtime] Shipment SLA update:', payload);
          
          // Invalidate this specific shipment's queries
          queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
          queryClient.invalidateQueries({ queryKey: ['shipment-sla', shipmentId] });
          queryClient.invalidateQueries({ queryKey: ['tracking-events', shipmentId] });
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Shipment channel status:', status);
      });

    return () => {
      console.log('[Realtime] Cleaning up shipment-specific subscription');
      supabase.removeChannel(channel);
    };
  }, [shipmentId, queryClient]);
}
