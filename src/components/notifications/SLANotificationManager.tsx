import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';
import { useAuth } from '@/hooks/useAuth';
import { ShipmentStatus } from '@/lib/constants';
import { useRealtimeSLA } from '@/hooks/useRealtimeSLA';

interface AtRiskShipment {
  id: string;
  shipment_ref: string;
  shipment_status: ShipmentStatus;
  entered_at: string;
  max_hours: number;
  percentUsed: number;
  remainingMinutes: number;
}

// Track which shipments we've already notified about to avoid spam
const notifiedShipments = new Set<string>();

export function SLANotificationManager() {
  const { user, role } = useAuth();
  const { permission, showSLACriticalAlert } = useBrowserNotifications();
  const isInternalUser = role === 'MANAGER' || role === 'SUPERVISOR' || role === 'TECHNICIAN';
  const lastCheckRef = useRef<number>(Date.now());

  // Enable realtime updates to instantly detect SLA changes
  useRealtimeSLA();
  const { data: atRiskShipments } = useQuery({
    queryKey: ['sla-critical-notifications'],
    queryFn: async () => {
      const { data: slaRecords, error } = await supabase
        .from('shipment_sla')
        .select(`
          id,
          shipment_id,
          shipment_status,
          entered_at,
          sla_config:sla_config(max_hours),
          shipment:shipments(shipment_ref)
        `)
        .is('exited_at', null)
        .eq('breached', false);

      if (error) throw error;

      const now = Date.now();
      const atRisk: AtRiskShipment[] = [];

      for (const record of slaRecords || []) {
        const maxHours = record.sla_config?.max_hours;
        if (!maxHours) continue;

        const enteredAt = new Date(record.entered_at).getTime();
        const elapsedMs = now - enteredAt;
        const totalMs = maxHours * 60 * 60 * 1000;
        const percentUsed = (elapsedMs / totalMs) * 100;
        const remainingMs = totalMs - elapsedMs;
        const remainingMinutes = Math.floor(remainingMs / (60 * 1000));

        // Only include shipments at 90% or more
        if (percentUsed >= 90) {
          atRisk.push({
            id: record.shipment_id,
            shipment_ref: (record.shipment as any)?.shipment_ref || 'Unknown',
            shipment_status: record.shipment_status,
            entered_at: record.entered_at,
            max_hours: maxHours,
            percentUsed,
            remainingMinutes,
          });
        }
      }

      return atRisk;
    },
    enabled: isInternalUser && permission === 'granted',
    refetchInterval: 60000, // Check every minute
    staleTime: 30000,
  });

  // Show notifications for new critical shipments
  useEffect(() => {
    if (!atRiskShipments || permission !== 'granted') return;

    for (const shipment of atRiskShipments) {
      const notificationKey = `${shipment.id}-${Math.floor(shipment.percentUsed / 5) * 5}`; // Notify every 5% increase
      
      if (!notifiedShipments.has(notificationKey)) {
        notifiedShipments.add(notificationKey);
        
        // Only show notification if this is a new detection (not from initial load)
        if (Date.now() - lastCheckRef.current > 5000) {
          showSLACriticalAlert(
            shipment.shipment_ref,
            shipment.shipment_status,
            shipment.remainingMinutes,
            shipment.id
          );
        }
      }
    }

    lastCheckRef.current = Date.now();
  }, [atRiskShipments, permission, showSLACriticalAlert]);

  // Clear old notification keys periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      // Clear notifications older than 1 hour
      notifiedShipments.clear();
    }, 60 * 60 * 1000);

    return () => clearInterval(cleanup);
  }, []);

  return null; // This is a background manager, no UI
}
