import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, X, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';
import { useAuth } from '@/hooks/useAuth';

export function NotificationPermissionBanner() {
  const { t } = useTranslation();
  const { isSupported, permission, requestPermission, audioEnabled, toggleAudioAlerts, playAlert } = useBrowserNotifications();
  const { role } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const isInternalUser = role === 'MANAGER' || role === 'SUPERVISOR' || role === 'TECHNICIAN';

  // Check if user has previously dismissed the banner
  useEffect(() => {
    const wasDismissed = localStorage.getItem('notification-banner-dismissed');
    if (wasDismissed === 'true') {
      setDismissed(true);
    }
  }, []);

  const handleEnable = async () => {
    setIsRequesting(true);
    await requestPermission();
    setIsRequesting(false);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('notification-banner-dismissed', 'true');
  };

  const handleTestAudio = () => {
    playAlert('critical');
  };

  // Don't show for non-internal users
  if (!isInternalUser) {
    return null;
  }

  // Show audio settings if notifications are already granted
  if (permission === 'granted') {
    return (
      <div className="bg-muted/50 border rounded-lg p-4 mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-full">
            {audioEnabled ? (
              <Volume2 className="w-5 h-5 text-primary" />
            ) : (
              <VolumeX className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="font-medium text-sm">{t('notifications.audioAlerts')}</p>
            <p className="text-xs text-muted-foreground">{t('notifications.audioAlertsDescription')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestAudio}
            disabled={!audioEnabled}
          >
            {t('notifications.testSound')}
          </Button>
          <Switch
            checked={audioEnabled}
            onCheckedChange={toggleAudioAlerts}
          />
        </div>
      </div>
    );
  }

  // Don't show if not supported, denied, or dismissed
  if (!isSupported || permission === 'denied' || dismissed) {
    return null;
  }

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/20 rounded-full">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-medium text-sm">{t('notifications.enableTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('notifications.enableDescription')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleEnable}
          disabled={isRequesting}
        >
          {isRequesting ? t('common.loading') : t('notifications.enable')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
