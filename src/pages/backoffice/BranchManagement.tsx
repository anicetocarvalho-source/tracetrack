import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Globe, 
  Building2, 
  Plus, 
  Pencil, 
  Trash2, 
  Loader2, 
  Settings2, 
  Clock, 
  Save,
  ChevronRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useCountry } from '@/hooks/useCountry';
import { Country, Branch, BranchSettings } from '@/types/database';
import { SHIPMENT_STATUSES, STATUS_LABELS, ShipmentStatus } from '@/lib/constants';

const TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Africa/Johannesburg',
  'Africa/Lagos',
];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
];

interface CountryForm {
  code: string;
  name: string;
  timezone: string;
  default_language: string;
  is_active: boolean;
}

interface BranchForm {
  country_id: string;
  code: string;
  name: string;
  timezone: string | null;
  default_language: string | null;
  is_active: boolean;
}

interface BranchSettingsForm {
  allowed_statuses: ShipmentStatus[];
  sla_overrides: Partial<Record<ShipmentStatus, number>>;
}

const BranchManagement = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isAdmin, isCountryAdmin } = useAuth();
  const { currentCountry } = useCountry();
  const queryClient = useQueryClient();
  
  const [countryDialogOpen, setCountryDialogOpen] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [selectedBranchForSettings, setSelectedBranchForSettings] = useState<Branch | null>(null);
  
  const [countryForm, setCountryForm] = useState<CountryForm>({
    code: '',
    name: '',
    timezone: 'UTC',
    default_language: 'en',
    is_active: true,
  });
  
  const [branchForm, setBranchForm] = useState<BranchForm>({
    country_id: '',
    code: '',
    name: '',
    timezone: null,
    default_language: null,
    is_active: true,
  });

  const [branchSettingsForm, setBranchSettingsForm] = useState<BranchSettingsForm>({
    allowed_statuses: [...SHIPMENT_STATUSES],
    sla_overrides: {} as Record<ShipmentStatus, number>,
  });

  // Fetch countries (filtered for COUNTRY_ADMIN)
  const { data: countries = [], isLoading: countriesLoading } = useQuery({
    queryKey: ['countries', currentCountry?.id, isCountryAdmin],
    queryFn: async () => {
      let query = supabase
        .from('countries')
        .select('*')
        .order('name');
      
      // COUNTRY_ADMIN can only see their assigned country
      if (isCountryAdmin && currentCountry) {
        query = query.eq('id', currentCountry.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Country[];
    },
  });

  // Fetch branches with country join (filtered by country)
  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['branches', currentCountry?.id, isAdmin, isCountryAdmin],
    queryFn: async () => {
      let query = supabase
        .from('branches')
        .select('*, country:countries(*)')
        .order('name');
      
      // Filter by selected country for ADMIN/COUNTRY_ADMIN
      if ((isAdmin || isCountryAdmin) && currentCountry) {
        query = query.eq('country_id', currentCountry.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as (Branch & { country: Country })[];
    },
  });

  // Fetch branch settings for selected branch
  const { data: branchSettings = [] } = useQuery({
    queryKey: ['branch-settings', selectedBranchForSettings?.id],
    queryFn: async () => {
      if (!selectedBranchForSettings) return [];
      const { data, error } = await supabase
        .from('branch_settings')
        .select('*')
        .eq('branch_id', selectedBranchForSettings.id);
      if (error) throw error;
      return data as BranchSettings[];
    },
    enabled: !!selectedBranchForSettings,
  });

  // Country mutations
  const createCountryMutation = useMutation({
    mutationFn: async (form: CountryForm) => {
      const { data, error } = await supabase
        .from('countries')
        .insert(form)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['countries'] });
      setCountryDialogOpen(false);
      resetCountryForm();
      toast({ title: t('branchManagement.countryCreated') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const updateCountryMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: Partial<CountryForm> }) => {
      const { data, error } = await supabase
        .from('countries')
        .update(form)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['countries'] });
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setCountryDialogOpen(false);
      resetCountryForm();
      toast({ title: t('branchManagement.countryUpdated') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteCountryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('countries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['countries'] });
      toast({ title: t('branchManagement.countryDeleted') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Branch mutations
  const createBranchMutation = useMutation({
    mutationFn: async (form: BranchForm) => {
      const { data, error } = await supabase
        .from('branches')
        .insert(form)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setBranchDialogOpen(false);
      resetBranchForm();
      toast({ title: t('branchManagement.branchCreated') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const updateBranchMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: Partial<BranchForm> }) => {
      const { data, error } = await supabase
        .from('branches')
        .update(form)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setBranchDialogOpen(false);
      resetBranchForm();
      toast({ title: t('branchManagement.branchUpdated') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteBranchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('branches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast({ title: t('branchManagement.branchDeleted') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Branch settings mutations
  const saveBranchSettingsMutation = useMutation({
    mutationFn: async ({ branchId, settings }: { branchId: string; settings: BranchSettingsForm }) => {
      // Upsert allowed_statuses - delete then insert to handle unique constraint
      const { error: deleteStatus } = await supabase
        .from('branch_settings')
        .delete()
        .eq('branch_id', branchId)
        .eq('setting_key', 'allowed_statuses');
      if (deleteStatus) throw deleteStatus;

      const { error: statusError } = await supabase
        .from('branch_settings')
        .insert([{
          branch_id: branchId,
          setting_key: 'allowed_statuses',
          value: JSON.parse(JSON.stringify(settings.allowed_statuses)),
        }]);
      if (statusError) throw statusError;

      // Upsert sla_overrides
      const { error: deleteSla } = await supabase
        .from('branch_settings')
        .delete()
        .eq('branch_id', branchId)
        .eq('setting_key', 'sla_overrides');
      if (deleteSla) throw deleteSla;

      const { error: slaError } = await supabase
        .from('branch_settings')
        .insert([{
          branch_id: branchId,
          setting_key: 'sla_overrides',
          value: JSON.parse(JSON.stringify(settings.sla_overrides)),
        }]);
      if (slaError) throw slaError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-settings'] });
      setSettingsDialogOpen(false);
      toast({ title: t('branchManagement.settingsSaved') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const resetCountryForm = () => {
    setCountryForm({
      code: '',
      name: '',
      timezone: 'UTC',
      default_language: 'en',
      is_active: true,
    });
    setEditingCountry(null);
  };

  const resetBranchForm = () => {
    setBranchForm({
      country_id: '',
      code: '',
      name: '',
      timezone: null,
      default_language: null,
      is_active: true,
    });
    setEditingBranch(null);
  };

  const openEditCountry = (country: Country) => {
    setEditingCountry(country);
    setCountryForm({
      code: country.code,
      name: country.name,
      timezone: country.timezone,
      default_language: country.default_language,
      is_active: country.is_active,
    });
    setCountryDialogOpen(true);
  };

  const openEditBranch = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchForm({
      country_id: branch.country_id,
      code: branch.code,
      name: branch.name,
      timezone: branch.timezone,
      default_language: branch.default_language,
      is_active: branch.is_active,
    });
    setBranchDialogOpen(true);
  };

  const openBranchSettings = (branch: Branch) => {
    setSelectedBranchForSettings(branch);
    // Parse existing settings - need to query fresh since branchSettings may be stale
    const allowedStatusesSetting = branchSettings.find(s => s.setting_key === 'allowed_statuses');
    const slaOverridesSetting = branchSettings.find(s => s.setting_key === 'sla_overrides');
    
    // Parse the value properly
    const allowedStatusesValue = allowedStatusesSetting?.value;
    const slaOverridesValue = slaOverridesSetting?.value;
    
    setBranchSettingsForm({
      allowed_statuses: Array.isArray(allowedStatusesValue) ? allowedStatusesValue as ShipmentStatus[] : [...SHIPMENT_STATUSES],
      sla_overrides: (typeof slaOverridesValue === 'object' && slaOverridesValue !== null && !Array.isArray(slaOverridesValue)) 
        ? slaOverridesValue as Partial<Record<ShipmentStatus, number>> 
        : {},
    });
    setSettingsDialogOpen(true);
  };

  const handleCountrySubmit = () => {
    if (editingCountry) {
      updateCountryMutation.mutate({ id: editingCountry.id, form: countryForm });
    } else {
      createCountryMutation.mutate(countryForm);
    }
  };

  const handleBranchSubmit = () => {
    if (editingBranch) {
      updateBranchMutation.mutate({ id: editingBranch.id, form: branchForm });
    } else {
      createBranchMutation.mutate(branchForm);
    }
  };

  const handleSettingsSubmit = () => {
    if (!selectedBranchForSettings) return;
    saveBranchSettingsMutation.mutate({
      branchId: selectedBranchForSettings.id,
      settings: branchSettingsForm,
    });
  };

  const toggleStatusAllowed = (status: ShipmentStatus) => {
    setBranchSettingsForm(prev => ({
      ...prev,
      allowed_statuses: prev.allowed_statuses.includes(status)
        ? prev.allowed_statuses.filter(s => s !== status)
        : [...prev.allowed_statuses, status],
    }));
  };

  const updateSLAOverride = (status: ShipmentStatus, hours: number | null) => {
    setBranchSettingsForm(prev => {
      const newOverrides = { ...prev.sla_overrides };
      if (hours === null) {
        delete newOverrides[status];
      } else {
        newOverrides[status] = hours;
      }
      return { ...prev, sla_overrides: newOverrides };
    });
  };

  const isLoading = countriesLoading || branchesLoading;
  const isMutating = createCountryMutation.isPending || updateCountryMutation.isPending ||
    createBranchMutation.isPending || updateBranchMutation.isPending ||
    saveBranchSettingsMutation.isPending;

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('branchManagement.title')}</h1>
          <p className="text-muted-foreground">{t('branchManagement.subtitle')}</p>
        </div>

        <Tabs defaultValue="countries" className="space-y-6">
          <TabsList>
            <TabsTrigger value="countries" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t('branchManagement.countries')}
            </TabsTrigger>
            <TabsTrigger value="branches" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {t('branchManagement.branches')}
            </TabsTrigger>
          </TabsList>

          {/* Countries Tab */}
          <TabsContent value="countries" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={countryDialogOpen} onOpenChange={(open) => {
                setCountryDialogOpen(open);
                if (!open) resetCountryForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t('branchManagement.addCountry')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingCountry ? t('branchManagement.editCountry') : t('branchManagement.addCountry')}
                    </DialogTitle>
                    <DialogDescription>
                      {t('branchManagement.countryFormDesc')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('branchManagement.countryCode')}</Label>
                        <Input
                          value={countryForm.code}
                          onChange={(e) => setCountryForm({ ...countryForm, code: e.target.value.toUpperCase() })}
                          placeholder="BR"
                          maxLength={3}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('branchManagement.countryName')}</Label>
                        <Input
                          value={countryForm.name}
                          onChange={(e) => setCountryForm({ ...countryForm, name: e.target.value })}
                          placeholder="Brazil"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('branchManagement.timezone')}</Label>
                        <Select
                          value={countryForm.timezone}
                          onValueChange={(v) => setCountryForm({ ...countryForm, timezone: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIMEZONES.map(tz => (
                              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('branchManagement.defaultLanguage')}</Label>
                        <Select
                          value={countryForm.default_language}
                          onValueChange={(v) => setCountryForm({ ...countryForm, default_language: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LANGUAGES.map(lang => (
                              <SelectItem key={lang.code} value={lang.code}>{lang.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={countryForm.is_active}
                        onCheckedChange={(v) => setCountryForm({ ...countryForm, is_active: v })}
                      />
                      <Label>{t('branchManagement.active')}</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCountryDialogOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button onClick={handleCountrySubmit} disabled={isMutating}>
                      {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingCountry ? t('common.save') : t('common.create')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  {t('branchManagement.countriesList')}
                </CardTitle>
                <CardDescription>{t('branchManagement.countriesListDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : countries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {t('branchManagement.noCountries')}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('branchManagement.code')}</TableHead>
                        <TableHead>{t('branchManagement.name')}</TableHead>
                        <TableHead>{t('branchManagement.timezone')}</TableHead>
                        <TableHead>{t('branchManagement.language')}</TableHead>
                        <TableHead>{t('branchManagement.status')}</TableHead>
                        <TableHead className="text-right">{t('common.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {countries.map((country) => (
                        <TableRow key={country.id}>
                          <TableCell className="font-mono font-medium">{country.code}</TableCell>
                          <TableCell>{country.name}</TableCell>
                          <TableCell className="text-muted-foreground">{country.timezone}</TableCell>
                          <TableCell>
                            {LANGUAGES.find(l => l.code === country.default_language)?.label || country.default_language}
                          </TableCell>
                          <TableCell>
                            <Badge variant={country.is_active ? 'default' : 'secondary'}>
                              {country.is_active ? t('branchManagement.active') : t('branchManagement.inactive')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditCountry(country)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteCountryMutation.mutate(country.id)}
                                disabled={deleteCountryMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branches Tab */}
          <TabsContent value="branches" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={branchDialogOpen} onOpenChange={(open) => {
                setBranchDialogOpen(open);
                if (!open) resetBranchForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={countries.length === 0}>
                    <Plus className="h-4 w-4" />
                    {t('branchManagement.addBranch')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingBranch ? t('branchManagement.editBranch') : t('branchManagement.addBranch')}
                    </DialogTitle>
                    <DialogDescription>
                      {t('branchManagement.branchFormDesc')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t('branchManagement.country')}</Label>
                      <Select
                        value={branchForm.country_id}
                        onValueChange={(v) => setBranchForm({ ...branchForm, country_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('branchManagement.selectCountry')} />
                        </SelectTrigger>
                        <SelectContent>
                          {countries.map(country => (
                            <SelectItem key={country.id} value={country.id}>
                              {country.name} ({country.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('branchManagement.branchCode')}</Label>
                        <Input
                          value={branchForm.code}
                          onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })}
                          placeholder="SP-001"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('branchManagement.branchName')}</Label>
                        <Input
                          value={branchForm.name}
                          onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                          placeholder="São Paulo Main"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('branchManagement.timezoneOverride')}</Label>
                        <Select
                          value={branchForm.timezone || 'inherit'}
                          onValueChange={(v) => setBranchForm({ ...branchForm, timezone: v === 'inherit' ? null : v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inherit">{t('branchManagement.inheritFromCountry')}</SelectItem>
                            {TIMEZONES.map(tz => (
                              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('branchManagement.languageOverride')}</Label>
                        <Select
                          value={branchForm.default_language || 'inherit'}
                          onValueChange={(v) => setBranchForm({ ...branchForm, default_language: v === 'inherit' ? null : v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inherit">{t('branchManagement.inheritFromCountry')}</SelectItem>
                            {LANGUAGES.map(lang => (
                              <SelectItem key={lang.code} value={lang.code}>{lang.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={branchForm.is_active}
                        onCheckedChange={(v) => setBranchForm({ ...branchForm, is_active: v })}
                      />
                      <Label>{t('branchManagement.active')}</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setBranchDialogOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button onClick={handleBranchSubmit} disabled={isMutating || !branchForm.country_id}>
                      {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingBranch ? t('common.save') : t('common.create')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {countries.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t('branchManagement.createCountryFirst')}
                </CardContent>
              </Card>
            )}

            {countries.map(country => {
              const countryBranches = branches.filter(b => b.country_id === country.id);
              return (
                <Card key={country.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-lg">{country.name}</CardTitle>
                      <Badge variant="outline">{country.code}</Badge>
                      {!country.is_active && (
                        <Badge variant="secondary">{t('branchManagement.inactive')}</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {countryBranches.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        {t('branchManagement.noBranchesInCountry')}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('branchManagement.code')}</TableHead>
                            <TableHead>{t('branchManagement.name')}</TableHead>
                            <TableHead>{t('branchManagement.timezone')}</TableHead>
                            <TableHead>{t('branchManagement.language')}</TableHead>
                            <TableHead>{t('branchManagement.status')}</TableHead>
                            <TableHead className="text-right">{t('common.actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {countryBranches.map((branch) => (
                            <TableRow key={branch.id}>
                              <TableCell className="font-mono font-medium">{branch.code}</TableCell>
                              <TableCell>{branch.name}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {branch.timezone || (
                                  <span className="italic">{country.timezone} ({t('branchManagement.inherited')})</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {branch.default_language ? (
                                  LANGUAGES.find(l => l.code === branch.default_language)?.label || branch.default_language
                                ) : (
                                  <span className="italic text-muted-foreground">
                                    {LANGUAGES.find(l => l.code === country.default_language)?.label} ({t('branchManagement.inherited')})
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={branch.is_active ? 'default' : 'secondary'}>
                                  {branch.is_active ? t('branchManagement.active') : t('branchManagement.inactive')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openBranchSettings(branch)}
                                    title={t('branchManagement.configureSettings')}
                                  >
                                    <Settings2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditBranch(branch)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteBranchMutation.mutate(branch.id)}
                                    disabled={deleteBranchMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>

        {/* Branch Settings Dialog */}
        <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                {t('branchManagement.branchSettings')}
              </DialogTitle>
              <DialogDescription>
                {selectedBranchForSettings?.name} - {t('branchManagement.configureSettingsDesc')}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="statuses" className="mt-4">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="statuses">{t('branchManagement.allowedStatuses')}</TabsTrigger>
                <TabsTrigger value="sla">{t('branchManagement.slaOverrides')}</TabsTrigger>
              </TabsList>

              <TabsContent value="statuses" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  {t('branchManagement.allowedStatusesDesc')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SHIPMENT_STATUSES.map((status) => (
                    <div key={status} className="flex items-center gap-2 p-2 rounded-lg border">
                      <Checkbox
                        checked={branchSettingsForm.allowed_statuses.includes(status)}
                        onCheckedChange={() => toggleStatusAllowed(status)}
                      />
                      <Label className="flex-1 cursor-pointer">
                        {STATUS_LABELS[status]}
                      </Label>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="sla" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  {t('branchManagement.slaOverridesDesc')}
                </p>
                <div className="space-y-3">
                  {SHIPMENT_STATUSES.map((status) => (
                    <div key={status} className="flex items-center gap-4 p-3 rounded-lg border">
                      <div className="flex-1">
                        <Label>{STATUS_LABELS[status]}</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          className="w-24"
                          placeholder={t('branchManagement.hours')}
                          value={branchSettingsForm.sla_overrides[status] || ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : null;
                            updateSLAOverride(status, val);
                          }}
                        />
                        <span className="text-sm text-muted-foreground">{t('branchManagement.hours')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSettingsSubmit} disabled={isMutating}>
                {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                {t('branchManagement.saveSettings')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
};

export default BranchManagement;
