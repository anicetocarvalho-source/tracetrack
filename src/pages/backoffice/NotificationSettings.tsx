import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Volume2, VolumeX, AlertTriangle, Clock, Zap, Save, RotateCcw } from 'lucide-react';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { toast } from 'sonner';

interface NotificationSettings {
  browserNotificationsEnabled: boolean;
  audioAlertsEnabled: boolean;
  audioVolume: number;
  soundType: 'beep' | 'chime' | 'alert';
  criticalThreshold: number;
  warningThreshold: number;
  checkIntervalMinutes: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  notifyOnBreach: boolean;
  notifyOnWarning: boolean;
  notifyOnCritical: boolean;
}

const defaultSettings: NotificationSettings = {
  browserNotificationsEnabled: true,
  audioAlertsEnabled: true,
  audioVolume: 50,
  soundType: 'beep',
  criticalThreshold: 90,
  warningThreshold: 75,
  checkIntervalMinutes: 1,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  notifyOnBreach: true,
  notifyOnWarning: false,
  notifyOnCritical: true,
};

const STORAGE_KEY = 'sla-notification-settings';

function loadSettings(): NotificationSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load notification settings:', e);
  }
  return defaultSettings;
}

function saveSettings(settings: NotificationSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export default function NotificationSettings() {
  const { t } = useTranslation();
  const { permission, requestPermission, playAlert } = useBrowserNotifications();
  const { preferences, updateNotificationSettings, isSaving, isLoading: isPrefsLoading } = useUserPreferences();
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync with user preferences from database
  useEffect(() => {
    if (!isPrefsLoading && preferences.notifications) {
      const dbNotifs = preferences.notifications;
      setSettings(prev => ({
        ...prev,
        browserNotificationsEnabled: dbNotifs.enableBrowserNotifications ?? prev.browserNotificationsEnabled,
        notifyOnCritical: dbNotifs.notifyOnCritical ?? prev.notifyOnCritical,
        notifyOnWarning: dbNotifs.notifyOnWarning ?? prev.notifyOnWarning,
        notifyOnBreach: dbNotifs.notifyOnBreach ?? prev.notifyOnBreach,
        audioAlertsEnabled: dbNotifs.enableAudioAlerts ?? prev.audioAlertsEnabled,
        soundType: (dbNotifs.soundType as 'beep' | 'chime' | 'alert') ?? prev.soundType,
        audioVolume: dbNotifs.volume ?? prev.audioVolume,
      }));
    }
  }, [preferences.notifications, isPrefsLoading]);

  const updateSetting = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Save to localStorage for local use
    saveSettings(settings);
    // Also update the audio setting in the hook's localStorage
    localStorage.setItem('sla-audio-alerts', String(settings.audioAlertsEnabled));
    
    // Save to database for persistence across devices
    await updateNotificationSettings({
      enableBrowserNotifications: settings.browserNotificationsEnabled,
      notifyOnCritical: settings.notifyOnCritical,
      notifyOnWarning: settings.notifyOnWarning,
      notifyOnBreach: settings.notifyOnBreach,
      enableAudioAlerts: settings.audioAlertsEnabled,
      soundType: settings.soundType,
      volume: settings.audioVolume,
    });
    
    setHasChanges(false);
    toast.success(t('notificationSettings.saved'));
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    setHasChanges(true);
  };

  const handleTestSound = () => {
    playAlert('critical');
  };

  const handleEnableBrowserNotifications = async () => {
    const granted = await requestPermission();
    if (granted) {
      updateSetting('browserNotificationsEnabled', true);
      toast.success(t('notificationSettings.permissionGranted'));
    } else {
      toast.error(t('notificationSettings.permissionDenied'));
    }
  };

  return (
    <BackofficeLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="w-6 h-6" />
              {t('notificationSettings.title')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t('notificationSettings.subtitle')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset} disabled={!hasChanges || isSaving}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {t('notificationSettings.reset')}
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? t('common.saving') : t('notificationSettings.save')}
            </Button>
          </div>
        </div>

        {/* Browser Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              {t('notificationSettings.browserNotifications')}
            </CardTitle>
            <CardDescription>
              {t('notificationSettings.browserNotificationsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('notificationSettings.enableBrowserNotifications')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('notificationSettings.enableBrowserNotificationsDesc')}
                </p>
              </div>
              {permission === 'granted' ? (
                <Switch
                  checked={settings.browserNotificationsEnabled}
                  onCheckedChange={(checked) => updateSetting('browserNotificationsEnabled', checked)}
                />
              ) : (
                <Button onClick={handleEnableBrowserNotifications} size="sm">
                  {permission === 'denied' ? t('notificationSettings.blocked') : t('notificationSettings.enable')}
                </Button>
              )}
            </div>
            
            {permission === 'granted' && (
              <>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="notify-critical"
                      checked={settings.notifyOnCritical}
                      onCheckedChange={(checked) => updateSetting('notifyOnCritical', checked)}
                    />
                    <Label htmlFor="notify-critical" className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">
                        {t('notificationSettings.critical')}
                      </Badge>
                      {t('notificationSettings.notifyOnCritical')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="notify-warning"
                      checked={settings.notifyOnWarning}
                      onCheckedChange={(checked) => updateSetting('notifyOnWarning', checked)}
                    />
                    <Label htmlFor="notify-warning" className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 text-xs">
                        {t('notificationSettings.warning')}
                      </Badge>
                      {t('notificationSettings.notifyOnWarning')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="notify-breach"
                      checked={settings.notifyOnBreach}
                      onCheckedChange={(checked) => updateSetting('notifyOnBreach', checked)}
                    />
                    <Label htmlFor="notify-breach" className="flex items-center gap-2">
                      <Badge variant="outline" className="border-red-500 text-red-500 text-xs">
                        {t('notificationSettings.breach')}
                      </Badge>
                      {t('notificationSettings.notifyOnBreach')}
                    </Label>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Audio Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {settings.audioAlertsEnabled ? (
                <Volume2 className="w-5 h-5" />
              ) : (
                <VolumeX className="w-5 h-5" />
              )}
              {t('notificationSettings.audioAlerts')}
            </CardTitle>
            <CardDescription>
              {t('notificationSettings.audioAlertsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('notificationSettings.enableAudioAlerts')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('notificationSettings.enableAudioAlertsDesc')}
                </p>
              </div>
              <Switch
                checked={settings.audioAlertsEnabled}
                onCheckedChange={(checked) => updateSetting('audioAlertsEnabled', checked)}
              />
            </div>

            {settings.audioAlertsEnabled && (
              <>
                <Separator />
                
                <div className="space-y-3">
                  <Label>{t('notificationSettings.soundType')}</Label>
                  <RadioGroup
                    value={settings.soundType}
                    onValueChange={(value) => updateSetting('soundType', value as 'beep' | 'chime' | 'alert')}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="beep" id="beep" />
                      <Label htmlFor="beep">{t('notificationSettings.soundBeep')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="chime" id="chime" />
                      <Label htmlFor="chime">{t('notificationSettings.soundChime')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="alert" id="alert" />
                      <Label htmlFor="alert">{t('notificationSettings.soundAlert')}</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>{t('notificationSettings.volume')}</Label>
                    <span className="text-sm text-muted-foreground">{settings.audioVolume}%</span>
                  </div>
                  <Slider
                    value={[settings.audioVolume]}
                    onValueChange={([value]) => updateSetting('audioVolume', value)}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>

                <Button variant="outline" onClick={handleTestSound}>
                  <Volume2 className="w-4 h-4 mr-2" />
                  {t('notificationSettings.testSound')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Thresholds */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t('notificationSettings.thresholds')}
            </CardTitle>
            <CardDescription>
              {t('notificationSettings.thresholdsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">
                    {t('notificationSettings.critical')}
                  </Badge>
                  {t('notificationSettings.criticalThreshold')}
                </Label>
                <span className="text-sm font-medium">{settings.criticalThreshold}%</span>
              </div>
              <Slider
                value={[settings.criticalThreshold]}
                onValueChange={([value]) => updateSetting('criticalThreshold', value)}
                min={50}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {t('notificationSettings.criticalThresholdDesc', { percent: settings.criticalThreshold })}
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 text-xs">
                    {t('notificationSettings.warning')}
                  </Badge>
                  {t('notificationSettings.warningThreshold')}
                </Label>
                <span className="text-sm font-medium">{settings.warningThreshold}%</span>
              </div>
              <Slider
                value={[settings.warningThreshold]}
                onValueChange={([value]) => updateSetting('warningThreshold', Math.min(value, settings.criticalThreshold - 5))}
                min={25}
                max={95}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {t('notificationSettings.warningThresholdDesc', { percent: settings.warningThreshold })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Timing Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t('notificationSettings.timing')}
            </CardTitle>
            <CardDescription>
              {t('notificationSettings.timingDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('notificationSettings.checkInterval')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('notificationSettings.checkIntervalDesc')}
                </p>
              </div>
              <Select
                value={String(settings.checkIntervalMinutes)}
                onValueChange={(value) => updateSetting('checkIntervalMinutes', Number(value))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 {t('notificationSettings.minute')}</SelectItem>
                  <SelectItem value="2">2 {t('notificationSettings.minutes')}</SelectItem>
                  <SelectItem value="5">5 {t('notificationSettings.minutes')}</SelectItem>
                  <SelectItem value="10">10 {t('notificationSettings.minutes')}</SelectItem>
                  <SelectItem value="15">15 {t('notificationSettings.minutes')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('notificationSettings.quietHours')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('notificationSettings.quietHoursDesc')}
                  </p>
                </div>
                <Switch
                  checked={settings.quietHoursEnabled}
                  onCheckedChange={(checked) => updateSetting('quietHoursEnabled', checked)}
                />
              </div>

              {settings.quietHoursEnabled && (
                <div className="flex items-center gap-4 pl-4 border-l-2 border-muted">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('notificationSettings.from')}</Label>
                    <input
                      type="time"
                      value={settings.quietHoursStart}
                      onChange={(e) => updateSetting('quietHoursStart', e.target.value)}
                      className="block w-full px-3 py-2 border rounded-md bg-background text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('notificationSettings.to')}</Label>
                    <input
                      type="time"
                      value={settings.quietHoursEnd}
                      onChange={(e) => updateSetting('quietHoursEnd', e.target.value)}
                      className="block w-full px-3 py-2 border rounded-md bg-background text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Performance Note */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">{t('notificationSettings.performanceNote')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('notificationSettings.performanceNoteDesc')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </BackofficeLayout>
  );
}
