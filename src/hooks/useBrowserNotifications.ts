import { useState, useEffect, useCallback, useRef } from 'react';

type NotificationPermission = 'default' | 'granted' | 'denied';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}

// Audio context for generating alert sounds
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

function playAlertSound(type: 'warning' | 'critical' = 'critical') {
  try {
    const ctx = getAudioContext();
    
    // Resume audio context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Different frequencies for warning vs critical
    const baseFreq = type === 'critical' ? 880 : 660; // A5 vs E5
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    
    // Create a pulsing effect for critical alerts
    if (type === 'critical') {
      // Three beeps for critical
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      
      // First beep
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
      
      // Second beep
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.25);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
      
      // Third beep
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.45);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.55);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.6);
    } else {
      // Single beep for warning
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.35);
    }
  } catch (error) {
    console.warn('Could not play alert sound:', error);
  }
}

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(() => {
    const stored = localStorage.getItem('sla-audio-alerts');
    return stored !== 'false'; // Default to enabled
  });
  const audioInitializedRef = useRef(false);

  useEffect(() => {
    if ('Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  // Initialize audio context on first user interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioInitializedRef.current) {
        try {
          getAudioContext();
          audioInitializedRef.current = true;
        } catch (e) {
          console.warn('Could not initialize audio context:', e);
        }
      }
    };

    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });

    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
  }, []);

  const toggleAudioAlerts = useCallback((enabled: boolean) => {
    setAudioEnabled(enabled);
    localStorage.setItem('sla-audio-alerts', String(enabled));
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

  const playAlert = useCallback((type: 'warning' | 'critical' = 'critical') => {
    if (audioEnabled) {
      playAlertSound(type);
    }
  }, [audioEnabled]);

  const showSLACriticalAlert = useCallback(
    (shipmentRef: string, status: string, remainingMinutes: number, shipmentId: string) => {
      const title = '⚠️ Critical SLA Alert';
      const body = remainingMinutes > 0
        ? `Shipment ${shipmentRef} has only ${remainingMinutes} minutes remaining before SLA breach in ${status} status!`
        : `Shipment ${shipmentRef} has BREACHED SLA in ${status} status!`;

      // Play audio alert for critical SLA
      if (audioEnabled) {
        playAlertSound('critical');
      }

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
    [showNotification, audioEnabled]
  );

  return {
    isSupported,
    permission,
    audioEnabled,
    requestPermission,
    showNotification,
    showSLACriticalAlert,
    playAlert,
    toggleAudioAlerts,
  };
}
