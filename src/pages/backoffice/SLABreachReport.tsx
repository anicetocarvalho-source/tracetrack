import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, FileWarning, Clock, Building2, Filter, X, Download, Eye, TrendingUp, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { STATUS_LABELS, ShipmentStatus } from '@/lib/constants';
import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Link } from 'react-router-dom';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AreaChart, Area, XAxis, YAxis, BarChart, Bar, Cell } from 'recharts';
import { DateRangePickerCompact } from '@/components/ui/date-range-picker';
import { useCountry } from '@/hooks/useCountry';
import { useAuth } from '@/hooks/useAuth';

interface SLABreachRecord {
  id: string;
  shipment_id: string;
  shipment_status: ShipmentStatus;
  entered_at: string;
  exited_at: string | null;
  elapsed_hours: number | null;
  breached: boolean | null;
  sla_config: {
    max_hours: number;
    client_id: string | null;
  } | null;
  shipment: {
    shipment_ref: string;
    client_ref: string;
    client: {
      id: string;
      name: string;
    } | null;
  } | null;
}

const formatHours = (hours: number): string => {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours >= 1) {
    return `${Math.round(hours)}h`;
  }
  return `${Math.round(hours * 60)}m`;
};

const ITEMS_PER_PAGE = 20;

const SLABreachReport = () => {
  const { t } = useTranslation();
  const { currentCountry } = useCountry();
  const { isAdmin, isCountryAdmin } = useAuth();
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBreach, setSelectedBreach] = useState<SLABreachRecord | null>(null);

  const hasActiveFilters = clientFilter !== 'all' || statusFilter !== 'all' || dateRange?.from;

  const clearFilters = () => {
    setClientFilter('all');
    setStatusFilter('all');
    setDateRange(undefined);
    setCurrentPage(1);
  };

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

  // Fetch clients for filter (filtered by country)
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

  // Fetch breach data
  const { data: breachData, isLoading } = useQuery({
    queryKey: ['sla-breaches', clientFilter, statusFilter, dateRange?.from, dateRange?.to, currentPage, currentCountry?.id, countryBranchIds],
    queryFn: async () => {
      let query = supabase
        .from('shipment_sla')
        .select(`
          id,
          shipment_id,
          shipment_status,
          entered_at,
          exited_at,
          elapsed_hours,
          breached,
          sla_config:sla_config(max_hours, client_id),
          shipment:shipments(
            shipment_ref,
            client_ref,
            branch_id,
            client:clients(id, name)
          )
        `, { count: 'exact' })
        .eq('breached', true)
        .order('exited_at', { ascending: false });

      // Apply filters
      if (statusFilter !== 'all') {
        query = query.eq('shipment_status', statusFilter as ShipmentStatus);
      }

      if (dateRange?.from) {
        query = query.gte('exited_at', format(dateRange.from, 'yyyy-MM-dd'));
      }

      if (dateRange?.to) {
        query = query.lte('exited_at', format(dateRange.to, 'yyyy-MM-dd') + 'T23:59:59');
      }

      // Pagination
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      // Filter by country (branch) and client in JS since nested filters
      let filteredData = data as (SLABreachRecord & { shipment: { branch_id?: string } })[];
      
      if (shouldFilterByCountry) {
        filteredData = filteredData.filter(
          r => r.shipment?.branch_id && countryBranchIds.includes(r.shipment.branch_id)
        );
      }
      
      if (clientFilter !== 'all') {
        filteredData = filteredData.filter(
          r => r.shipment?.client?.id === clientFilter
        );
      }

      return {
        breaches: filteredData as SLABreachRecord[],
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / ITEMS_PER_PAGE),
      };
    },
  });

  // Stats summary
  const { data: stats } = useQuery({
    queryKey: ['sla-breach-stats', clientFilter, statusFilter, dateRange?.from, dateRange?.to, currentCountry?.id, countryBranchIds],
    queryFn: async () => {
      let statsQuery = supabase
        .from('shipment_sla')
        .select(`
          id,
          shipment_status,
          elapsed_hours,
          breached,
          sla_config:sla_config(max_hours),
          shipment:shipments(branch_id, client:clients(id))
        `)
        .eq('breached', true);

      if (statusFilter !== 'all') {
        statsQuery = statsQuery.eq('shipment_status', statusFilter as ShipmentStatus);
      }

      if (dateRange?.from) {
        statsQuery = statsQuery.gte('exited_at', format(dateRange.from, 'yyyy-MM-dd'));
      }

      if (dateRange?.to) {
        statsQuery = statsQuery.lte('exited_at', format(dateRange.to, 'yyyy-MM-dd') + 'T23:59:59');
      }

      const { data, error } = await statsQuery;
      if (error) throw error;

      let records = data || [];
      
      // Filter by country (branch)
      if (shouldFilterByCountry) {
        records = records.filter(
          (r: any) => r.shipment?.branch_id && countryBranchIds.includes(r.shipment.branch_id)
        );
      }
      
      // Filter by client
      if (clientFilter !== 'all') {
        records = records.filter(
          (r: any) => r.shipment?.client?.id === clientFilter
        );
      }

      const totalBreaches = records.length;
      const avgOverage = records.length > 0
        ? records.reduce((sum: number, r: any) => {
            const elapsed = r.elapsed_hours || 0;
            const max = (r.sla_config as any)?.max_hours || elapsed;
            return sum + Math.max(0, elapsed - max);
          }, 0) / records.length
        : 0;

      // Worst status
      const statusCounts: Record<string, number> = {};
      records.forEach((r: any) => {
        statusCounts[r.shipment_status] = (statusCounts[r.shipment_status] || 0) + 1;
      });
      const worstStatus = Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      return {
        totalBreaches,
        avgOverage: Math.round(avgOverage),
        worstStatus,
      };
    },
  });

  const exportToCSV = () => {
    if (!breachData?.breaches.length) return;

    const headers = ['Shipment Ref', 'Client', 'Status', 'Entered At', 'Exited At', 'Elapsed Hours', 'Max Hours', 'Overage Hours'];
    const rows = breachData.breaches.map(b => [
      b.shipment?.shipment_ref || '',
      b.shipment?.client?.name || '',
      STATUS_LABELS[b.shipment_status] || b.shipment_status,
      format(new Date(b.entered_at), 'yyyy-MM-dd HH:mm'),
      b.exited_at ? format(new Date(b.exited_at), 'yyyy-MM-dd HH:mm') : '',
      b.elapsed_hours || 0,
      b.sla_config?.max_hours || 0,
      Math.max(0, (b.elapsed_hours || 0) - (b.sla_config?.max_hours || 0)),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sla-breach-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Fetch trend data for charts (last 30 days)
  const { data: trendData } = useQuery({
    queryKey: ['sla-breach-trends', currentCountry?.id, countryBranchIds],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      
      const { data, error } = await supabase
        .from('shipment_sla')
        .select('exited_at, shipment_status, elapsed_hours, sla_config:sla_config(max_hours), shipment:shipments(branch_id)')
        .eq('breached', true)
        .gte('exited_at', thirtyDaysAgo)
        .order('exited_at', { ascending: true });

      if (error) throw error;
      
      let records = data || [];
      
      // Filter by country (branch)
      if (shouldFilterByCountry) {
        records = records.filter(
          (r: any) => r.shipment?.branch_id && countryBranchIds.includes(r.shipment.branch_id)
        );
      }
      
      return records;
    },
  });

  // Process trend data for charts
  const chartData = useMemo(() => {
    if (!trendData?.length) return { daily: [], byStatus: [] };

    // Daily breach count
    const last30Days = eachDayOfInterval({
      start: subDays(new Date(), 29),
      end: new Date(),
    });

    const dailyCounts: Record<string, number> = {};
    last30Days.forEach(day => {
      dailyCounts[format(day, 'yyyy-MM-dd')] = 0;
    });

    trendData.forEach((breach: any) => {
      if (breach.exited_at) {
        const dayKey = format(parseISO(breach.exited_at), 'yyyy-MM-dd');
        if (dailyCounts[dayKey] !== undefined) {
          dailyCounts[dayKey]++;
        }
      }
    });

    const daily = Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      displayDate: format(parseISO(date), 'MMM d'),
      breaches: count,
    }));

    // Breaches by status
    const statusCounts: Record<string, number> = {};
    trendData.forEach((breach: any) => {
      const status = breach.shipment_status;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const statusColors: Record<string, string> = {
      received: 'hsl(var(--chart-1))',
      customs_held: 'hsl(var(--chart-2))',
      in_transit: 'hsl(var(--chart-3))',
      out_for_delivery: 'hsl(var(--chart-4))',
      pending: 'hsl(var(--chart-5))',
    };

    const byStatus = Object.entries(statusCounts)
      .map(([status, count]) => ({
        status,
        statusLabel: STATUS_LABELS[status as ShipmentStatus] || status,
        count,
        fill: statusColors[status] || 'hsl(var(--muted-foreground))',
      }))
      .sort((a, b) => b.count - a.count);

    return { daily, byStatus };
  }, [trendData]);

  const chartConfig = {
    breaches: {
      label: t('slaBreachReport.breaches'),
      color: 'hsl(var(--destructive))',
    },
  };

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FileWarning className="h-8 w-8 text-destructive" />
              {t('slaBreachReport.title')}
            </h1>
            <p className="text-muted-foreground">{t('slaBreachReport.subtitle')}</p>
          </div>
          <Button onClick={exportToCSV} variant="outline" disabled={!breachData?.breaches.length}>
            <Download className="h-4 w-4 mr-2" />
            {t('common.export')}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-destructive/50">
            <CardHeader className="pb-2">
              <CardDescription>{t('slaBreachReport.totalBreaches')}</CardDescription>
              <CardTitle className="text-3xl text-destructive">{stats?.totalBreaches || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('slaBreachReport.avgOverage')}</CardDescription>
              <CardTitle className="text-3xl">
                {stats?.avgOverage ? formatHours(stats.avgOverage) : '-'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('slaBreachReport.worstStatus')}</CardDescription>
              <CardTitle className="text-xl">
                {stats?.worstStatus ? STATUS_LABELS[stats.worstStatus as ShipmentStatus] : '-'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Trend Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Daily Breach Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-destructive" />
                {t('slaBreachReport.breachTrend')}
              </CardTitle>
              <CardDescription>{t('slaBreachReport.last30Days')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <AreaChart data={chartData.daily} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="breachGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="breaches"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    fill="url(#breachGradient)"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Breaches by Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                {t('slaBreachReport.breachesByStatus')}
              </CardTitle>
              <CardDescription>{t('slaBreachReport.last30Days')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart data={chartData.byStatus} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="statusLabel"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    cursor={{ fill: 'hsl(var(--muted))' }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {chartData.byStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              {t('common.filters')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('slaBreachReport.client')}</label>
                <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('slaBreachReport.status')}</label>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">{t('dateRange.dateRange')}</label>
                <DateRangePickerCompact
                  dateRange={dateRange}
                  onDateRangeChange={(range) => { setDateRange(range); setCurrentPage(1); }}
                  placeholder={t('dateRange.selectRange')}
                />
              </div>
              <div className="flex items-end">
                {hasActiveFilters && (
                  <Button variant="ghost" onClick={clearFilters} className="w-full">
                    <X className="h-4 w-4 mr-2" />
                    {t('common.clear')}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Breach Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t('slaBreachReport.breachList')}
            </CardTitle>
            <CardDescription>
              {t('common.showing')} {breachData?.breaches.length || 0} {t('common.of')} {breachData?.totalCount || 0}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('slaBreachReport.shipmentRef')}</TableHead>
                  <TableHead>{t('slaBreachReport.client')}</TableHead>
                  <TableHead>{t('slaBreachReport.status')}</TableHead>
                  <TableHead>{t('slaBreachReport.enteredAt')}</TableHead>
                  <TableHead>{t('slaBreachReport.exitedAt')}</TableHead>
                  <TableHead>{t('slaBreachReport.elapsed')}</TableHead>
                  <TableHead>{t('slaBreachReport.target')}</TableHead>
                  <TableHead>{t('slaBreachReport.overage')}</TableHead>
                  <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {t('common.loading')}
                    </TableCell>
                  </TableRow>
                ) : !breachData?.breaches.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {t('slaBreachReport.noBreaches')}
                    </TableCell>
                  </TableRow>
                ) : (
                  breachData.breaches.map((breach) => {
                    const overage = Math.max(0, (breach.elapsed_hours || 0) - (breach.sla_config?.max_hours || 0));
                    const overagePercent = breach.sla_config?.max_hours 
                      ? Math.round((overage / breach.sla_config.max_hours) * 100)
                      : 0;

                    return (
                      <TableRow key={breach.id}>
                        <TableCell>
                          <Link 
                            to={`/backoffice/shipments/${breach.shipment_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {breach.shipment?.shipment_ref}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {breach.shipment?.client?.name || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {STATUS_LABELS[breach.shipment_status] || breach.shipment_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(breach.entered_at), 'MMM d, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {breach.exited_at 
                            ? format(new Date(breach.exited_at), 'MMM d, yyyy HH:mm')
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-destructive">
                              {breach.elapsed_hours ? formatHours(breach.elapsed_hours) : '-'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {breach.sla_config?.max_hours 
                            ? formatHours(breach.sla_config.max_hours)
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="font-mono">
                            +{formatHours(overage)} ({overagePercent}%)
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setSelectedBreach(breach)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {breachData && breachData.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  {t('common.showing')} {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, breachData.totalCount)} {t('common.of')} {breachData.totalCount}
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    {t('common.previous')}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(breachData.totalPages, p + 1))}
                    disabled={currentPage === breachData.totalPages}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={!!selectedBreach} onOpenChange={() => setSelectedBreach(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                {t('slaBreachReport.breachDetails')}
              </DialogTitle>
              <DialogDescription>
                {selectedBreach?.shipment?.shipment_ref}
              </DialogDescription>
            </DialogHeader>
            {selectedBreach && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('slaBreachReport.client')}</p>
                    <p className="font-medium">{selectedBreach.shipment?.client?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('slaBreachReport.status')}</p>
                    <Badge variant="outline">
                      {STATUS_LABELS[selectedBreach.shipment_status]}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('slaBreachReport.enteredAt')}</p>
                    <p className="font-medium">
                      {format(new Date(selectedBreach.entered_at), 'PPpp')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('slaBreachReport.exitedAt')}</p>
                    <p className="font-medium">
                      {selectedBreach.exited_at 
                        ? format(new Date(selectedBreach.exited_at), 'PPpp')
                        : '-'
                      }
                    </p>
                  </div>
                </div>

                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">{t('slaBreachReport.elapsed')}</span>
                    <span className="font-bold text-destructive">
                      {selectedBreach.elapsed_hours ? formatHours(selectedBreach.elapsed_hours) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">{t('slaBreachReport.target')}</span>
                    <span className="font-medium">
                      {selectedBreach.sla_config?.max_hours 
                        ? formatHours(selectedBreach.sla_config.max_hours)
                        : '-'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-sm font-medium">{t('slaBreachReport.overage')}</span>
                    <Badge variant="destructive">
                      +{formatHours(Math.max(0, (selectedBreach.elapsed_hours || 0) - (selectedBreach.sla_config?.max_hours || 0)))}
                    </Badge>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button asChild>
                    <Link to={`/backoffice/shipments/${selectedBreach.shipment_id}`}>
                      {t('shipments.viewDetails')}
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
};

export default SLABreachReport;
