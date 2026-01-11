import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Plus, X, Ship, Package, MapPin, Users, Clock, AlertTriangle, Loader2, TrendingUp, Target, Mail, Send, BarChart3, Moon, Sun, Monitor, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useAISettings } from '@/hooks/useAISettings';

interface SystemSetting {
  id: string;
  key: string;
  value: string[] | string | EscalationConfig | SLATargetsConfig;
  description: string | null;
  updated_at: string;
}

interface EscalationConfig {
  p2_to_p1_hours: number;
  p3_to_p2_hours: number;
  enabled: boolean;
}

interface SLATargetsConfig {
  P1: number;
  P2: number;
  P3: number;
}

type CronFrequency = '30min' | '1hour' | '4hours';

const FREQUENCY_OPTIONS: { value: CronFrequency; label: string }[] = [
  { value: '30min', label: 'Every 30 minutes' },
  { value: '1hour', label: 'Every hour' },
  { value: '4hours', label: 'Every 4 hours' },
];

const ESCALATION_HOURS_OPTIONS = [
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '48 hours' },
  { value: 72, label: '72 hours' },
];

const SLA_HOURS_OPTIONS = [
  { value: 2, label: '2 hours' },
  { value: 4, label: '4 hours' },
  { value: 8, label: '8 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '48 hours' },
  { value: 72, label: '72 hours' },
  { value: 96, label: '96 hours' },
  { value: 168, label: '168 hours (1 week)' },
];

const Settings = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, role } = useAuth();
  const { theme } = useTheme();
  const { updateTheme, isSaving: isPreferenceSaving } = useUserPreferences();
  const { config: aiConfig, updateConfig: updateAIConfig, isUpdating: isAIUpdating } = useAISettings();
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

  // Get current escalation settings
  const escalationSetting = settings.find(s => s.key === 'exception_escalation');
  const currentEscalation: EscalationConfig = (escalationSetting?.value as EscalationConfig) || {
    p2_to_p1_hours: 24,
    p3_to_p2_hours: 48,
    enabled: true,
  };

  // Get current SLA targets
  const slaSetting = settings.find(s => s.key === 'sla_targets');
  const currentSLATargets: SLATargetsConfig = (slaSetting?.value as SLATargetsConfig) || {
    P1: 4,
    P2: 24,
    P3: 72,
  };

  const updateEscalationMutation = useMutation({
    mutationFn: async (config: EscalationConfig) => {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: config as unknown as string, updated_by: user?.id })
        .eq('key', 'exception_escalation');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({ title: t('settings.escalationUpdated') });
    },
    onError: (error: Error) => {
      toast({ title: t('settings.errorUpdatingEscalation'), description: error.message, variant: 'destructive' });
    },
  });

  const updateSLAMutation = useMutation({
    mutationFn: async (config: SLATargetsConfig) => {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: config as unknown as string, updated_by: user?.id })
        .eq('key', 'sla_targets');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-sla-compliance'] });
      toast({ title: t('settings.slaUpdated') });
    },
    onError: (error: Error) => {
      toast({ title: t('settings.errorUpdatingSLA'), description: error.message, variant: 'destructive' });
    },
  });

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

  const sendTestReportMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('weekly-sla-report', {
        body: {},
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ 
        title: t('settings.testReportSent'),
        description: data.message || t('settings.testReportSentDesc'),
      });
    },
    onError: (error: Error) => {
      toast({ title: t('settings.errorSendingTestReport'), description: error.message, variant: 'destructive' });
    },
  });

  const sendRiskAlertMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('daily-sla-risk-alert', {
        body: {},
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ 
        title: t('settings.riskAlertSent'),
        description: data.atRiskCount > 0 
          ? t('settings.riskAlertSentDesc', { count: data.atRiskCount }) 
          : t('settings.noAtRiskShipments'),
      });
    },
    onError: (error: Error) => {
      toast({ title: t('settings.errorSendingRiskAlert'), description: error.message, variant: 'destructive' });
    },
  });

  const generateScorecardBatchMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('monthly-scorecard-batch', {
        body: {},
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ 
        title: t('settings.scorecardBatchGenerated'),
        description: t('settings.scorecardBatchGeneratedDesc', { 
          success: data.successCount, 
          total: data.processed 
        }),
      });
    },
    onError: (error: Error) => {
      toast({ title: t('settings.errorGeneratingScorecardBatch'), description: error.message, variant: 'destructive' });
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

        {/* Appearance Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sun className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg">{t('settings.appearance')}</CardTitle>
            </div>
            <CardDescription>{t('settings.appearanceDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('settings.theme')}</Label>
              <div className="flex gap-2">
                <Button
                  variant={theme === 'light' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateTheme('light')}
                  className="flex items-center gap-2"
                  disabled={isPreferenceSaving}
                >
                  <Sun className="h-4 w-4" />
                  {t('settings.themeLight')}
                </Button>
                <Button
                  variant={theme === 'dark' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateTheme('dark')}
                  className="flex items-center gap-2"
                  disabled={isPreferenceSaving}
                >
                  <Moon className="h-4 w-4" />
                  {t('settings.themeDark')}
                </Button>
                <Button
                  variant={theme === 'system' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateTheme('system')}
                  className="flex items-center gap-2"
                  disabled={isPreferenceSaving}
                >
                  <Monitor className="h-4 w-4" />
                  {t('settings.themeSystem')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.themeDesc')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Classification Settings */}
        {role === 'MANAGER' && (
          <Card className="border-purple-500/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />
                <CardTitle className="text-lg">{t('settings.aiClassificationSettings')}</CardTitle>
              </div>
              <CardDescription>{t('settings.aiClassificationSettingsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enable/Disable AI Classification */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.enableAIClassification')}</Label>
                  <p className="text-xs text-muted-foreground">{t('settings.enableAIClassificationDesc')}</p>
                </div>
                <Switch
                  checked={aiConfig.enabled}
                  onCheckedChange={(enabled) => updateAIConfig({ enabled })}
                  disabled={isAIUpdating}
                />
              </div>

              {aiConfig.enabled && (
                <>
                  {/* Debounce Time */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>{t('settings.aiDebounceTime')}</Label>
                      <span className="text-sm font-medium">{aiConfig.debounce_ms}ms</span>
                    </div>
                    <Slider
                      value={[aiConfig.debounce_ms]}
                      onValueChange={([value]) => updateAIConfig({ debounce_ms: value })}
                      min={500}
                      max={5000}
                      step={100}
                      disabled={isAIUpdating}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>500ms ({t('settings.faster')})</span>
                      <span>5000ms ({t('settings.slower')})</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.aiDebounceTimeDesc')}
                    </p>
                  </div>

                  {/* Minimum Text Length */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>{t('settings.aiMinTextLength')}</Label>
                      <span className="text-sm font-medium">{aiConfig.min_text_length} {t('settings.characters')}</span>
                    </div>
                    <Slider
                      value={[aiConfig.min_text_length]}
                      onValueChange={([value]) => updateAIConfig({ min_text_length: value })}
                      min={5}
                      max={100}
                      step={5}
                      disabled={isAIUpdating}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>5 {t('settings.characters')}</span>
                      <span>100 {t('settings.characters')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.aiMinTextLengthDesc')}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
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

        {/* Exception Escalation Settings */}
        {role === 'MANAGER' && (
          <Card className="border-amber-500/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-lg">{t('settings.escalationSettings')}</CardTitle>
              </div>
              <CardDescription>{t('settings.escalationSettingsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enable/Disable escalation */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.enableEscalation')}</Label>
                  <p className="text-xs text-muted-foreground">{t('settings.enableEscalationDesc')}</p>
                </div>
                <Switch
                  checked={currentEscalation.enabled}
                  onCheckedChange={(enabled) => 
                    updateEscalationMutation.mutate({ ...currentEscalation, enabled })
                  }
                  disabled={updateEscalationMutation.isPending}
                />
              </div>

              {currentEscalation.enabled && (
                <>
                  {/* P2 to P1 escalation */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">P2 → P1</Badge>
                      {t('settings.p2ToP1Hours')}
                    </Label>
                    <div className="flex gap-2">
                      <Select
                        value={currentEscalation.p2_to_p1_hours.toString()}
                        onValueChange={(value) => 
                          updateEscalationMutation.mutate({ 
                            ...currentEscalation, 
                            p2_to_p1_hours: parseInt(value) 
                          })
                        }
                        disabled={updateEscalationMutation.isPending}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ESCALATION_HOURS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value.toString()}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {updateEscalationMutation.isPending && (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.p2ToP1HoursDesc')}
                    </p>
                  </div>

                  {/* P3 to P2 escalation */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">P3 → P2</Badge>
                      {t('settings.p3ToP2Hours')}
                    </Label>
                    <div className="flex gap-2">
                      <Select
                        value={currentEscalation.p3_to_p2_hours.toString()}
                        onValueChange={(value) => 
                          updateEscalationMutation.mutate({ 
                            ...currentEscalation, 
                            p3_to_p2_hours: parseInt(value) 
                          })
                        }
                        disabled={updateEscalationMutation.isPending}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ESCALATION_HOURS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value.toString()}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.p3ToP2HoursDesc')}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* SLA Targets Settings */}
        {role === 'MANAGER' && (
          <Card className="border-green-500/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-green-500" />
                <CardTitle className="text-lg">{t('settings.slaTargets')}</CardTitle>
              </div>
              <CardDescription>{t('settings.slaTargetsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* P1 SLA Target */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">P1</Badge>
                  {t('settings.slaTargetHours')}
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={currentSLATargets.P1.toString()}
                    onValueChange={(value) => 
                      updateSLAMutation.mutate({ 
                        ...currentSLATargets, 
                        P1: parseInt(value) 
                      })
                    }
                    disabled={updateSLAMutation.isPending}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLA_HOURS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value.toString()}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {updateSLAMutation.isPending && (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.p1SlaDesc')}
                </p>
              </div>

              {/* P2 SLA Target */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">P2</Badge>
                  {t('settings.slaTargetHours')}
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={currentSLATargets.P2.toString()}
                    onValueChange={(value) => 
                      updateSLAMutation.mutate({ 
                        ...currentSLATargets, 
                        P2: parseInt(value) 
                      })
                    }
                    disabled={updateSLAMutation.isPending}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLA_HOURS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value.toString()}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.p2SlaDesc')}
                </p>
              </div>

              {/* P3 SLA Target */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">P3</Badge>
                  {t('settings.slaTargetHours')}
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={currentSLATargets.P3.toString()}
                    onValueChange={(value) => 
                      updateSLAMutation.mutate({ 
                        ...currentSLATargets, 
                        P3: parseInt(value) 
                      })
                    }
                    disabled={updateSLAMutation.isPending}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLA_HOURS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value.toString()}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.p3SlaDesc')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Email Reports Settings */}
        {role === 'MANAGER' && (
          <Card className="border-blue-500/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-500" />
                <CardTitle className="text-lg">{t('settings.emailReports')}</CardTitle>
              </div>
              <CardDescription>{t('settings.emailReportsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <p className="font-medium">{t('settings.weeklySLAReport')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.weeklySLAReportDesc')}</p>
                </div>
                <Button
                  onClick={() => sendTestReportMutation.mutate()}
                  disabled={sendTestReportMutation.isPending}
                  variant="outline"
                  className="gap-2"
                >
                  {sendTestReportMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {t('settings.sendTestReport')}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <p className="font-medium">{t('settings.dailyRiskAlert')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.dailyRiskAlertDesc')}</p>
                </div>
                <Button
                  onClick={() => sendRiskAlertMutation.mutate()}
                  disabled={sendRiskAlertMutation.isPending}
                  variant="outline"
                  className="gap-2"
                >
                  {sendRiskAlertMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {t('settings.sendRiskAlert')}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <p className="font-medium">{t('settings.monthlyScorecardBatch')}</p>
                  <p className="text-sm text-muted-foreground">{t('settings.monthlyScorecardBatchDesc')}</p>
                </div>
                <Button
                  onClick={() => generateScorecardBatchMutation.mutate()}
                  disabled={generateScorecardBatchMutation.isPending}
                  variant="outline"
                  className="gap-2"
                >
                  {generateScorecardBatchMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart3 className="h-4 w-4" />
                  )}
                  {t('settings.generateNow')}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('settings.scheduledReportInfo')}
              </p>
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
