import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';
import { useAuth } from '@/hooks/useAuth';

export function NotificationPermissionBanner() {
  const { t } = useTranslation();
  const { isSupported, permission, requestPermission } = useBrowserNotifications();
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

  // Don't show if not supported, already granted/denied, dismissed, or not internal user
  if (!isSupported || permission !== 'default' || dismissed || !isInternalUser) {
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
