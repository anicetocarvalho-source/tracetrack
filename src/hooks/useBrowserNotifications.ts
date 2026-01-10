import { useState, useEffect, useCallback } from 'react';

type NotificationPermission = 'default' | 'granted' | 'denied';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn('Browser notifications are not supported');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, [isSupported]);

  const showNotification = useCallback(
    ({ title, body, icon, tag, requireInteraction = false, onClick }: NotificationOptions) => {
      if (!isSupported || permission !== 'granted') {
        console.warn('Cannot show notification: permission not granted');
        return null;
      }

      try {
        const notification = new Notification(title, {
          body,
          icon: icon || '/favicon.ico',
          tag, // Prevents duplicate notifications with same tag
          requireInteraction,
          badge: '/favicon.ico',
        });

        if (onClick) {
          notification.onclick = () => {
            window.focus();
            onClick();
            notification.close();
          };
        }

        return notification;
      } catch (error) {
        console.error('Error showing notification:', error);
        return null;
      }
    },
    [isSupported, permission]
  );

  const showSLACriticalAlert = useCallback(
    (shipmentRef: string, status: string, remainingMinutes: number, shipmentId: string) => {
      const title = '⚠️ Critical SLA Alert';
      const body = remainingMinutes > 0
        ? `Shipment ${shipmentRef} has only ${remainingMinutes} minutes remaining before SLA breach in ${status} status!`
        : `Shipment ${shipmentRef} has BREACHED SLA in ${status} status!`;

      return showNotification({
        title,
        body,
        tag: `sla-critical-${shipmentId}`,
        requireInteraction: true,
        onClick: () => {
          window.location.href = `/backoffice/shipments/${shipmentId}`;
        },
      });
    },
    [showNotification]
  );

  return {
    isSupported,
    permission,
    requestPermission,
    showNotification,
    showSLACriticalAlert,
  };
}
