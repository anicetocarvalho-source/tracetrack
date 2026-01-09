import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Ship, Package, MapPin, Users, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';

interface SystemSetting {
  id: string;
  key: string;
  value: string[] | string;
  description: string | null;
  updated_at: string;
}

type CronFrequency = '30min' | '1hour' | '4hours';

const FREQUENCY_OPTIONS: { value: CronFrequency; label: string }[] = [
  { value: '30min', label: 'Every 30 minutes' },
  { value: '1hour', label: 'Every hour' },
  { value: '4hours', label: 'Every 4 hours' },
];

const Settings = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [newItems, setNewItems] = useState<Record<string, string>>({});

  const SETTING_CONFIG: Record<string, { title: string; description: string; icon: any; placeholder: string }> = {
    shipping_lines: {
      title: t('settings.shippingLines'),
      description: t('settings.shippingLinesDesc'),
      icon: Ship,
      placeholder: t('settings.addShippingLine'),
    },
    container_types: {
      title: t('settings.containerTypes'),
      description: t('settings.containerTypesDesc'),
      icon: Package,
      placeholder: t('settings.addContainerType'),
    },
    terminals: {
      title: t('settings.terminals'),
      description: t('settings.terminalsDesc'),
      icon: MapPin,
      placeholder: t('settings.addTerminal'),
    },
    operators: {
      title: t('settings.operators'),
      description: t('settings.operatorsDesc'),
      icon: Users,
      placeholder: t('settings.addOperator'),
    },
  };

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .order('key');
      if (error) throw error;
      return data.map((s) => ({
        ...s,
        value: typeof s.value === 'string' ? s.value : (Array.isArray(s.value) ? s.value : s.value),
      })) as SystemSetting[];
    },
  });

  // Get current frequency setting
  const currentFrequency = settings.find(s => s.key === 'exception_detection_frequency')?.value as CronFrequency | undefined;

  const updateCronMutation = useMutation({
    mutationFn: async (frequency: CronFrequency) => {
      const { data, error } = await supabase.functions.invoke('update-cron-schedule', {
        body: {
          job_name: 'detect-exceptions-hourly',
          frequency,
        },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({ 
        title: t('settings.cronUpdated'),
        description: `Exception detection will now run ${FREQUENCY_OPTIONS.find(o => o.value === data.frequency)?.label.toLowerCase()}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: t('settings.errorUpdatingCron'), description: error.message, variant: 'destructive' });
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string[] }) => {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: JSON.stringify(value), updated_by: user?.id })
        .eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({ title: t('settings.settingsSaved') });
    },
    onError: (error: Error) => {
      toast({ title: t('settings.errorSavingSettings'), description: error.message, variant: 'destructive' });
    },
  });

  const handleAddItem = (key: string) => {
    const newItem = newItems[key]?.trim();
    if (!newItem) return;

    const setting = settings.find((s) => s.key === key);
    if (!setting || !Array.isArray(setting.value)) return;

    if (setting.value.includes(newItem)) {
      toast({ title: t('common.itemAlreadyExists'), variant: 'destructive' });
      return;
    }

    updateSettingMutation.mutate({
      key,
      value: [...setting.value, newItem],
    });
    setNewItems({ ...newItems, [key]: '' });
  };

  const handleRemoveItem = (key: string, item: string) => {
    const setting = settings.find((s) => s.key === key);
    if (!setting || !Array.isArray(setting.value)) return;

    updateSettingMutation.mutate({
      key,
      value: setting.value.filter((v) => v !== item),
    });
  };

  const getArraySetting = (key: string) => {
    const setting = settings.find((s) => s.key === key);
    if (setting && Array.isArray(setting.value)) {
      return { ...setting, value: setting.value as string[] };
    }
    return null;
  };

  if (isLoading) {
    return (
      <BackofficeLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">{t('settings.loadingSettings')}</div>
        </div>
      </BackofficeLayout>
    );
  }

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
          <p className="text-muted-foreground">{t('settings.subtitle')}</p>
        </div>

        {/* Automation Settings */}
        {role === 'MANAGER' && (
          <Card className="border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{t('settings.automationSettings')}</CardTitle>
              </div>
              <CardDescription>{t('settings.automationSettingsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {t('settings.exceptionDetectionFrequency')}
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={currentFrequency || '1hour'}
                    onValueChange={(value) => updateCronMutation.mutate(value as CronFrequency)}
                    disabled={updateCronMutation.isPending}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder={t('settings.selectFrequency')} />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {updateCronMutation.isPending && (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.exceptionDetectionFrequencyDesc')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {Object.entries(SETTING_CONFIG).map(([key, config]) => {
            const setting = getArraySetting(key);
            const Icon = config.icon;

            return (
              <Card key={key}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{config.title}</CardTitle>
                  </div>
                  <CardDescription>{config.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Add new item */}
                  <div className="flex gap-2">
                    <Input
                      placeholder={config.placeholder}
                      value={newItems[key] || ''}
                      onChange={(e) => setNewItems({ ...newItems, [key]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddItem(key);
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={() => handleAddItem(key)}
                      disabled={!newItems[key]?.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Existing items */}
                  <div className="flex flex-wrap gap-2">
                    {setting?.value.map((item) => (
                      <Badge
                        key={item}
                        variant="secondary"
                        className="flex items-center gap-1 py-1.5 px-3"
                      >
                        {item}
                        <button
                          onClick={() => handleRemoveItem(key, item)}
                          className="ml-1 hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {(!setting?.value || setting.value.length === 0) && (
                      <span className="text-sm text-muted-foreground">{t('common.noItemsConfigured')}</span>
                    )}
                  </div>

                  {setting && (
                    <p className="text-xs text-muted-foreground">
                      {t('common.lastUpdated')}: {new Date(setting.updated_at).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </BackofficeLayout>
  );
};

export default Settings;
