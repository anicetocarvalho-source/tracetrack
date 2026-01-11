import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, Mail, Package, FileText, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useToast } from '@/hooks/use-toast';

interface CustomerNotificationSettings {
  emailShipmentUpdates?: boolean;
  emailScorecardAvailable?: boolean;
  emailExceptions?: boolean;
  emailDocuments?: boolean;
}

export function NotificationPreferences() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { preferences, isSaving, savePreferences } = useUserPreferences();

  const customerNotifications = (preferences.notifications as CustomerNotificationSettings & typeof preferences.notifications) || {};

  const handleToggle = async (key: keyof CustomerNotificationSettings, value: boolean) => {
    const success = await savePreferences({
      notifications: {
        ...preferences.notifications,
        [key]: value,
      },
    });

    if (success) {
      toast({
        title: t('common.success'),
        description: t('notifications.preferencesSaved'),
      });
    } else {
      toast({
        title: t('common.error'),
        description: t('notifications.preferencesSaveFailed'),
        variant: 'destructive',
      });
    }
  };

  const notificationOptions = [
    {
      key: 'emailShipmentUpdates' as const,
      icon: Package,
      title: t('notifications.shipmentUpdates'),
      description: t('notifications.shipmentUpdatesDesc'),
      defaultValue: true,
    },
    {
      key: 'emailScorecardAvailable' as const,
      icon: FileText,
      title: t('notifications.scorecardAvailable'),
      description: t('notifications.scorecardAvailableDesc'),
      defaultValue: true,
    },
    {
      key: 'emailExceptions' as const,
      icon: AlertTriangle,
      title: t('notifications.exceptionAlerts'),
      description: t('notifications.exceptionAlertsDesc'),
      defaultValue: true,
    },
    {
      key: 'emailDocuments' as const,
      icon: Mail,
      title: t('notifications.documentNotifications'),
      description: t('notifications.documentNotificationsDesc'),
      defaultValue: false,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t('notifications.emailPreferences')}
          {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>{t('notifications.emailPreferencesDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {notificationOptions.map((option) => {
          const Icon = option.icon;
          const isEnabled = customerNotifications[option.key] ?? option.defaultValue;

          return (
            <div key={option.key} className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 rounded-lg bg-muted">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={option.key} className="text-sm font-medium cursor-pointer">
                    {option.title}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </div>
              <Switch
                id={option.key}
                checked={isEnabled}
                onCheckedChange={(checked) => handleToggle(option.key, checked)}
                disabled={isSaving}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
