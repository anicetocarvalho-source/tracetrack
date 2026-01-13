import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, Plus, Pencil, Trash2, Target, TrendingUp, AlertTriangle, CheckCircle, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCountry } from '@/hooks/useCountry';
import { useTranslation } from 'react-i18next';
import { STATUS_LABELS, ShipmentStatus } from '@/lib/constants';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';

interface SLAConfig {
  id: string;
  client_id: string | null;
  shipment_status: ShipmentStatus;
  max_hours: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  client?: { name: string } | null;
}

interface SLAStats {
  totalShipments: number;
  totalBreaches: number;
  compliancePercent: number;
  avgTimeByStatus: { status: string; avgHours: number; maxHours: number }[];
  breachesByClient: { name: string; breaches: number }[];
  breachesByStatus: { status: string; breaches: number; total: number }[];
}

const STATUS_ORDER: ShipmentStatus[] = [
  'RECEIVED', 'REGISTERED', 'DOCS_VALIDATION', 'PROCESSING', 
  'IN_TRANSIT', 'AT_TERMINAL', 'CLEARANCE', 'OUT_FOR_DELIVERY', 
  'DELIVERED', 'ON_HOLD_INCIDENT', 'CANCELLED'
];

const SLAManagement = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { role, isAdmin, isCountryAdmin } = useAuth();
  const { currentCountry } = useCountry();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SLAConfig | null>(null);
  const [formData, setFormData] = useState({
    client_id: '',
    shipment_status: '' as ShipmentStatus | '',
    max_hours: '',
    is_active: true,
  });

  const isManager = role === 'MANAGER';

  // Get branch IDs for the selected country
  const { data: countryBranchIds = [] } = useQuery({
    queryKey: ['country-branches', currentCountry?.id],
    queryFn: async () => {
      if (!currentCountry) return [];
      const { data, error } = await supabase
        .from('branches')
        .select('id')
        .eq('country_id', currentCountry.id)
        .eq('is_active', true);
      if (error) throw error;
      return data.map(b => b.id);
    },
    enabled: !!currentCountry && (isAdmin || isCountryAdmin),
  });

  const shouldFilterByCountry = (isAdmin || isCountryAdmin) && currentCountry && countryBranchIds.length > 0;

  // Fetch SLA configs (filtered by country)
  const { data: slaConfigs = [], isLoading: isLoadingConfigs } = useQuery({
    queryKey: ['sla-configs', currentCountry?.id, countryBranchIds],
    queryFn: async () => {
      let query = supabase
        .from('sla_config')
        .select('*, client:clients(name, branch_id), branch:branches(name, country_id)')
        .order('shipment_status');
      
      if (shouldFilterByCountry) {
        // Filter by branch or client's branch
        query = query.or(`branch_id.in.(${countryBranchIds.join(',')}),branch_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Additional client-side filtering for client-specific configs
      let filtered = data || [];
      if (shouldFilterByCountry) {
        filtered = filtered.filter((config: any) => {
          // Global configs (no client, no branch) should show for all
          if (!config.client_id && !config.branch_id) return true;
          // Branch-specific configs
          if (config.branch_id && countryBranchIds.includes(config.branch_id)) return true;
          // Client-specific configs - check client's branch
          if (config.client_id && config.client?.branch_id && countryBranchIds.includes(config.client.branch_id)) return true;
          return false;
        });
      }
      
      return filtered as SLAConfig[];
    },
  });

  // Fetch clients for dropdown (filtered by country)
  const { data: clients = [] } = useQuery({
    queryKey: ['clients-list', currentCountry?.id, countryBranchIds],
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('id, name, branch_id')
        .order('name');
      
      if (shouldFilterByCountry) {
        query = query.in('branch_id', countryBranchIds);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch SLA statistics (filtered by country)
  const { data: slaStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['sla-stats', currentCountry?.id, countryBranchIds],
    queryFn: async () => {
      // Get all shipment SLA records
      const { data: slaRecords, error } = await supabase
        .from('shipment_sla')
        .select(`
          id,
          shipment_status,
          elapsed_hours,
          breached,
          sla_config:sla_config(max_hours),
          shipment:shipments(branch_id, client:clients(name, branch_id))
        `)
        .not('exited_at', 'is', null);

      if (error) throw error;

      // Filter by country if applicable
      let records = slaRecords || [];
      if (shouldFilterByCountry) {
        records = records.filter((r: any) => 
          r.shipment?.branch_id && countryBranchIds.includes(r.shipment.branch_id)
        );
      }

      const totalRecords = records.length;
      const breachedRecords = records.filter(r => r.breached);
      const compliancePercent = totalRecords > 0 
        ? Math.round(((totalRecords - breachedRecords.length) / totalRecords) * 100) 
        : 100;

      // Average time by status
      const statusTimes: Record<string, { total: number; count: number; maxHours: number }> = {};
      records.forEach(r => {
        if (!statusTimes[r.shipment_status]) {
          statusTimes[r.shipment_status] = { total: 0, count: 0, maxHours: (r.sla_config as any)?.max_hours || 0 };
        }
        statusTimes[r.shipment_status].total += r.elapsed_hours || 0;
        statusTimes[r.shipment_status].count++;
        if ((r.sla_config as any)?.max_hours) {
          statusTimes[r.shipment_status].maxHours = (r.sla_config as any).max_hours;
        }
      });

      const avgTimeByStatus = Object.entries(statusTimes).map(([status, data]) => ({
        status: STATUS_LABELS[status as ShipmentStatus] || status,
        avgHours: Math.round(data.total / data.count),
        maxHours: data.maxHours,
      }));

      // Breaches by client
      const clientBreaches: Record<string, number> = {};
      breachedRecords.forEach(r => {
        const clientName = (r.shipment as any)?.client?.name || 'Unknown';
        clientBreaches[clientName] = (clientBreaches[clientName] || 0) + 1;
      });

      const breachesByClient = Object.entries(clientBreaches)
        .map(([name, breaches]) => ({ name, breaches }))
        .sort((a, b) => b.breaches - a.breaches)
        .slice(0, 10);

      // Breaches by status
      const statusBreaches: Record<string, { breaches: number; total: number }> = {};
      records.forEach(r => {
        if (!statusBreaches[r.shipment_status]) {
          statusBreaches[r.shipment_status] = { breaches: 0, total: 0 };
        }
        statusBreaches[r.shipment_status].total++;
        if (r.breached) {
          statusBreaches[r.shipment_status].breaches++;
        }
      });

      const breachesByStatus = Object.entries(statusBreaches).map(([status, data]) => ({
        status: STATUS_LABELS[status as ShipmentStatus] || status,
        breaches: data.breaches,
        total: data.total,
      }));

      return {
        totalShipments: totalRecords,
        totalBreaches: breachedRecords.length,
        compliancePercent,
        avgTimeByStatus,
        breachesByClient,
        breachesByStatus,
      } as SLAStats;
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('sla_config').insert({
        client_id: data.client_id || null,
        shipment_status: data.shipment_status as ShipmentStatus,
        max_hours: parseInt(data.max_hours),
        is_active: data.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-configs'] });
      toast({ title: t('sla.configCreated') });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: t('sla.errorCreating'), description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from('sla_config').update({
        client_id: data.client_id || null,
        shipment_status: data.shipment_status as ShipmentStatus,
        max_hours: parseInt(data.max_hours),
        is_active: data.is_active,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-configs'] });
      toast({ title: t('sla.configUpdated') });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: t('sla.errorUpdating'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sla_config').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-configs'] });
      toast({ title: t('sla.configDeleted') });
    },
    onError: (error: Error) => {
      toast({ title: t('sla.errorDeleting'), description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({ client_id: '', shipment_status: '', max_hours: '', is_active: true });
    setEditingConfig(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (config: SLAConfig) => {
    setEditingConfig(config);
    setFormData({
      client_id: config.client_id || '',
      shipment_status: config.shipment_status,
      max_hours: config.max_hours.toString(),
      is_active: config.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.shipment_status || !formData.max_hours) {
      toast({ title: t('common.requiredField'), variant: 'destructive' });
      return;
    }
    if (editingConfig) {
      updateMutation.mutate({ id: editingConfig.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Group configs by global vs client-specific
  const globalConfigs = slaConfigs.filter(c => !c.client_id);
  const clientConfigs = slaConfigs.filter(c => c.client_id);

  const COLORS = ['#dc2626', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Target className="h-8 w-8 text-primary" />
              {t('sla.title')}
            </h1>
            <p className="text-muted-foreground">{t('sla.subtitle')}</p>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList>
            <TabsTrigger value="dashboard">{t('sla.dashboard')}</TabsTrigger>
            <TabsTrigger value="config">{t('sla.configuration')}</TabsTrigger>
          </TabsList>

          {/* SLA Dashboard */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('sla.totalTransitions')}</CardDescription>
                  <CardTitle className="text-3xl">{slaStats?.totalShipments || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card className={slaStats && slaStats.totalBreaches > 0 ? 'border-destructive/50' : ''}>
                <CardHeader className="pb-2">
                  <CardDescription>{t('sla.totalBreaches')}</CardDescription>
                  <CardTitle className="text-3xl text-destructive">{slaStats?.totalBreaches || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('sla.complianceRate')}</CardDescription>
                  <CardTitle className={`text-3xl ${(slaStats?.compliancePercent || 100) >= 90 ? 'text-green-600' : (slaStats?.compliancePercent || 100) >= 70 ? 'text-amber-600' : 'text-destructive'}`}>
                    {slaStats?.compliancePercent || 100}%
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('sla.activeRules')}</CardDescription>
                  <CardTitle className="text-3xl">{slaConfigs.filter(c => c.is_active).length}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Average Time by Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {t('sla.avgTimeByStatus')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {isLoadingStats ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        {t('common.loading')}
                      </div>
                    ) : slaStats?.avgTimeByStatus?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={slaStats.avgTimeByStatus} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="status" width={100} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="avgHours" name={t('sla.avgHours')} fill="#3b82f6" />
                          <Bar dataKey="maxHours" name={t('sla.maxHours')} fill="#dc2626" fillOpacity={0.3} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        {t('sla.noData')}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Breaches by Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    {t('sla.breachesByStatus')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {isLoadingStats ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        {t('common.loading')}
                      </div>
                    ) : slaStats?.breachesByStatus?.filter(s => s.breaches > 0).length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={slaStats.breachesByStatus.filter(s => s.breaches > 0)}
                            dataKey="breaches"
                            nameKey="status"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label={({ status, breaches }) => `${status}: ${breaches}`}
                          >
                            {slaStats.breachesByStatus.filter(s => s.breaches > 0).map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <CheckCircle className="h-12 w-12 text-green-500 mb-2" />
                        <p>{t('sla.noBreaches')}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Breaches by Client */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    {t('sla.breachesByClient')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    {isLoadingStats ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        {t('common.loading')}
                      </div>
                    ) : slaStats?.breachesByClient?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={slaStats.breachesByClient}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="breaches" fill="#dc2626" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <CheckCircle className="h-12 w-12 text-green-500 mb-2" />
                        <p>{t('sla.noBreaches')}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SLA Configuration */}
          <TabsContent value="config" className="space-y-6">
            {isManager && (
              <div className="flex justify-end">
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => resetForm()}>
                      <Plus className="h-4 w-4 mr-2" />
                      {t('sla.addRule')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingConfig ? t('sla.editRule') : t('sla.addRule')}</DialogTitle>
                      <DialogDescription>{t('sla.ruleDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>{t('sla.client')}</Label>
                        <Select
                          value={formData.client_id}
                          onValueChange={(v) => setFormData({ ...formData, client_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('sla.globalDefault')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{t('sla.globalDefault')}</SelectItem>
                            {clients.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{t('sla.clientHint')}</p>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('sla.status')} *</Label>
                        <Select
                          value={formData.shipment_status}
                          onValueChange={(v) => setFormData({ ...formData, shipment_status: v as ShipmentStatus })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('sla.selectStatus')} />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_ORDER.filter(s => s !== 'DELIVERED' && s !== 'CANCELLED').map(status => (
                              <SelectItem key={status} value={status}>
                                {STATUS_LABELS[status]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('sla.maxHours')} *</Label>
                        <Input
                          type="number"
                          min="1"
                          value={formData.max_hours}
                          onChange={(e) => setFormData({ ...formData, max_hours: e.target.value })}
                          placeholder="24"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>{t('sla.active')}</Label>
                          <p className="text-xs text-muted-foreground">{t('sla.activeHint')}</p>
                        </div>
                        <Switch
                          checked={formData.is_active}
                          onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={resetForm}>{t('common.cancel')}</Button>
                      <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                        {editingConfig ? t('common.save') : t('common.create')}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {/* Global Rules */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  {t('sla.globalRules')}
                </CardTitle>
                <CardDescription>{t('sla.globalRulesDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingConfigs ? (
                  <p className="text-muted-foreground">{t('common.loading')}</p>
                ) : globalConfigs.length === 0 ? (
                  <p className="text-muted-foreground">{t('sla.noRules')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('sla.status')}</TableHead>
                        <TableHead>{t('sla.maxHours')}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                        {isManager && <TableHead className="text-right">{t('common.actions')}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {globalConfigs.map(config => (
                        <TableRow key={config.id}>
                          <TableCell className="font-medium">{STATUS_LABELS[config.shipment_status]}</TableCell>
                          <TableCell>{config.max_hours}h</TableCell>
                          <TableCell>
                            <Badge variant={config.is_active ? 'default' : 'secondary'}>
                              {config.is_active ? t('common.active') : t('common.inactive')}
                            </Badge>
                          </TableCell>
                          {isManager && (
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(config)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => deleteMutation.mutate(config.id)}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Client-specific Rules */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {t('sla.clientRules')}
                </CardTitle>
                <CardDescription>{t('sla.clientRulesDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingConfigs ? (
                  <p className="text-muted-foreground">{t('common.loading')}</p>
                ) : clientConfigs.length === 0 ? (
                  <p className="text-muted-foreground">{t('sla.noClientRules')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('sla.client')}</TableHead>
                        <TableHead>{t('sla.status')}</TableHead>
                        <TableHead>{t('sla.maxHours')}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                        {isManager && <TableHead className="text-right">{t('common.actions')}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientConfigs.map(config => (
                        <TableRow key={config.id}>
                          <TableCell className="font-medium">{config.client?.name}</TableCell>
                          <TableCell>{STATUS_LABELS[config.shipment_status]}</TableCell>
                          <TableCell>{config.max_hours}h</TableCell>
                          <TableCell>
                            <Badge variant={config.is_active ? 'default' : 'secondary'}>
                              {config.is_active ? t('common.active') : t('common.inactive')}
                            </Badge>
                          </TableCell>
                          {isManager && (
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(config)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => deleteMutation.mutate(config.id)}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </BackofficeLayout>
  );
};

export default SLAManagement;
