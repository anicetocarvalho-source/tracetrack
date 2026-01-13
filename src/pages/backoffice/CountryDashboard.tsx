import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Globe, 
  Package, 
  Building2, 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Target,
  MapPin,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { ShipmentStatus, STATUS_LABELS } from '@/lib/constants';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useCountry } from '@/hooks/useCountry';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval, isWithinInterval, endOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';

const STATUS_COLORS: Record<string, string> = {
  REGISTERED: '#6b7280',
  RECEIVED: '#3b82f6',
  DOCS_VALIDATION: '#a855f7',
  PROCESSING: '#8b5cf6',
  IN_TRANSIT: '#0ea5e9',
  AT_TERMINAL: '#f59e0b',
  CLEARANCE: '#ec4899',
  OUT_FOR_DELIVERY: '#14b8a6',
  DELIVERED: '#22c55e',
  ON_HOLD_INCIDENT: '#ef4444',
  CANCELLED: '#71717a',
};

const SEVERITY_COLORS = {
  P1: '#ef4444',
  P2: '#f59e0b',
  P3: '#3b82f6',
};

export default function CountryDashboard() {
  const { t } = useTranslation();
  const { isAdmin, isCountryAdmin } = useAuth();
  const { currentCountry, availableCountries } = useCountry();

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  // Fetch branches for the selected country
  const { data: branches = [], isLoading: loadingBranches } = useQuery({
    queryKey: ['country-branches-details', currentCountry?.id],
    queryFn: async () => {
      if (!currentCountry?.id) return [];
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, code, is_active')
        .eq('country_id', currentCountry.id)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!currentCountry?.id,
  });

  const branchIds = useMemo(() => branches.map(b => b.id), [branches]);

  // Fetch clients for this country
  const { data: clients = [] } = useQuery({
    queryKey: ['country-clients', currentCountry?.id, branchIds],
    queryFn: async () => {
      if (!currentCountry?.id || branchIds.length === 0) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, branch_id')
        .in('branch_id', branchIds)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!currentCountry?.id && branchIds.length > 0,
  });

  // Fetch users for this country
  const { data: users = [] } = useQuery({
    queryKey: ['country-users', currentCountry?.id, branchIds],
    queryFn: async () => {
      if (!currentCountry?.id || branchIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, is_active, branch_id')
        .in('branch_id', branchIds);
      if (error) throw error;
      return data;
    },
    enabled: !!currentCountry?.id && branchIds.length > 0,
  });

  // Fetch shipments statistics
  const { data: shipmentStats, isLoading: loadingStats } = useQuery({
    queryKey: ['country-shipment-stats', currentCountry?.id, branchIds, dateRange?.from, dateRange?.to],
    queryFn: async () => {
      if (!currentCountry?.id || branchIds.length === 0) return null;

      const { data: allShipments, error } = await supabase
        .from('shipments')
        .select('id, current_status, created_at, client_id, branch_id')
        .in('branch_id', branchIds);
      
      if (error) throw error;

      // Filter by date range
      const shipments = dateRange?.from && dateRange?.to
        ? allShipments?.filter(s => {
            const createdDate = new Date(s.created_at);
            return isWithinInterval(createdDate, {
              start: startOfDay(dateRange.from!),
              end: endOfDay(dateRange.to!),
            });
          })
        : allShipments;

      const statusCounts: Record<string, number> = {};
      shipments?.forEach(s => {
        statusCounts[s.current_status] = (statusCounts[s.current_status] || 0) + 1;
      });

      // Per branch statistics
      const branchStats = branches.map(branch => {
        const branchShipments = shipments?.filter(s => s.branch_id === branch.id) || [];
        return {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          total: branchShipments.length,
          delivered: branchShipments.filter(s => s.current_status === 'DELIVERED').length,
          active: branchShipments.filter(s => !['DELIVERED', 'CANCELLED'].includes(s.current_status)).length,
          onHold: branchShipments.filter(s => s.current_status === 'ON_HOLD_INCIDENT').length,
        };
      });

      // Shipments over time
      const rangeStart = dateRange?.from || subDays(new Date(), 29);
      const rangeEnd = dateRange?.to || new Date();
      const daysInRange = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

      const shipmentsOverTime = daysInRange.map(day => {
        const dayStart = startOfDay(day);
        const count = shipments?.filter(s => {
          const createdDate = startOfDay(new Date(s.created_at));
          return createdDate.getTime() === dayStart.getTime();
        }).length || 0;

        return {
          date: format(day, 'dd/MM'),
          shipments: count,
        };
      });

      const totalShipments = shipments?.length || 0;
      const activeShipments = shipments?.filter(s => !['DELIVERED', 'CANCELLED'].includes(s.current_status)).length || 0;
      const deliveredCount = statusCounts['DELIVERED'] || 0;
      const onHoldCount = statusCounts['ON_HOLD_INCIDENT'] || 0;

      const pieData = Object.entries(statusCounts).map(([status, count]) => ({
        name: STATUS_LABELS[status as ShipmentStatus] || status,
        value: count,
        status,
      }));

      return {
        totalShipments,
        activeShipments,
        deliveredCount,
        onHoldCount,
        statusCounts,
        branchStats,
        shipmentsOverTime,
        pieData,
      };
    },
    enabled: !!currentCountry?.id && branchIds.length > 0,
  });

  // Fetch exceptions for this country
  const { data: exceptionStats } = useQuery({
    queryKey: ['country-exceptions', currentCountry?.id, branchIds],
    queryFn: async () => {
      if (!currentCountry?.id || branchIds.length === 0) return null;

      // Get shipment IDs for this country
      const { data: shipments } = await supabase
        .from('shipments')
        .select('id')
        .in('branch_id', branchIds);
      
      const shipmentIds = shipments?.map(s => s.id) || [];
      if (shipmentIds.length === 0) return { total: 0, P1: 0, P2: 0, P3: 0, open: 0 };

      const { data: exceptions } = await supabase
        .from('shipment_exceptions')
        .select('id, severity, status, shipment_id')
        .in('shipment_id', shipmentIds);

      const counts = { total: 0, P1: 0, P2: 0, P3: 0, open: 0 };
      exceptions?.forEach(ex => {
        counts.total++;
        counts[ex.severity as 'P1' | 'P2' | 'P3']++;
        if (ex.status === 'OPEN') counts.open++;
      });

      return counts;
    },
    enabled: !!currentCountry?.id && branchIds.length > 0,
  });

  // Fetch SLA compliance for this country
  const { data: slaStats } = useQuery({
    queryKey: ['country-sla', currentCountry?.id, branchIds],
    queryFn: async () => {
      if (!currentCountry?.id || branchIds.length === 0) return null;

      // Get shipment IDs for this country
      const { data: shipments } = await supabase
        .from('shipments')
        .select('id')
        .in('branch_id', branchIds);
      
      const shipmentIds = shipments?.map(s => s.id) || [];
      if (shipmentIds.length === 0) return { compliance: 100, totalRecords: 0, breaches: 0 };

      const { data: slaRecords } = await supabase
        .from('shipment_sla')
        .select('id, breached')
        .in('shipment_id', shipmentIds)
        .not('exited_at', 'is', null);

      const totalRecords = slaRecords?.length || 0;
      const breaches = slaRecords?.filter(r => r.breached).length || 0;
      const compliance = totalRecords > 0 ? Math.round(((totalRecords - breaches) / totalRecords) * 100) : 100;

      return { compliance, totalRecords, breaches };
    },
    enabled: !!currentCountry?.id && branchIds.length > 0,
  });

  // Fetch customer requests for this country
  const { data: requestStats } = useQuery({
    queryKey: ['country-requests', currentCountry?.id, branchIds],
    queryFn: async () => {
      if (!currentCountry?.id || branchIds.length === 0) return null;

      // Get shipment IDs for this country
      const { data: shipments } = await supabase
        .from('shipments')
        .select('id')
        .in('branch_id', branchIds);
      
      const shipmentIds = shipments?.map(s => s.id) || [];
      if (shipmentIds.length === 0) return { total: 0, open: 0, inProgress: 0, resolved: 0 };

      const { data: requests } = await supabase
        .from('customer_requests')
        .select('id, status')
        .in('shipment_id', shipmentIds);

      const stats = { total: 0, open: 0, inProgress: 0, resolved: 0 };
      requests?.forEach(r => {
        stats.total++;
        if (r.status === 'OPEN') stats.open++;
        else if (r.status === 'IN_PROGRESS') stats.inProgress++;
        else if (r.status === 'RESOLVED') stats.resolved++;
      });

      return stats;
    },
    enabled: !!currentCountry?.id && branchIds.length > 0,
  });

  if (!currentCountry) {
    return (
      <BackofficeLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <Globe className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">{t('country.selectCountry')}</h2>
          <p className="text-muted-foreground">{t('country.selectCountryDescription')}</p>
        </div>
      </BackofficeLayout>
    );
  }

  const isLoading = loadingBranches || loadingStats;

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Globe className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">
                  {t('country.dashboard')} - {currentCountry.name}
                </h1>
                <p className="text-muted-foreground">
                  {t('country.code')}: {currentCountry.code} • {t('country.timezone')}: {currentCountry.timezone}
                </p>
              </div>
            </div>
          </div>
          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            className="w-full md:w-auto"
          />
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('country.branches')}</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{branches.length}</div>
              <p className="text-xs text-muted-foreground">
                {branches.filter(b => b.is_active).length} {t('common.active')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('nav.clients')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clients.length}</div>
              <p className="text-xs text-muted-foreground">
                {t('country.acrossAllBranches')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('nav.users')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
              <p className="text-xs text-muted-foreground">
                {users.filter(u => u.is_active).length} {t('common.active')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.slaCompliance')}</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                (slaStats?.compliance || 100) >= 90 ? "text-green-600" : 
                (slaStats?.compliance || 100) >= 70 ? "text-amber-600" : "text-destructive"
              )}>
                {slaStats?.compliance || 100}%
              </div>
              <p className="text-xs text-muted-foreground">
                {slaStats?.breaches || 0} {t('sla.breaches')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Shipment Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/50 border-blue-200 dark:border-blue-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.totalShipments')}</CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{shipmentStats?.totalShipments || 0}</div>
              <p className="text-xs text-blue-600/70">{t('dashboard.inPeriod')}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/50 dark:to-amber-900/50 border-amber-200 dark:border-amber-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.activeShipments')}</CardTitle>
              <Clock className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{shipmentStats?.activeShipments || 0}</div>
              <p className="text-xs text-amber-600/70">{t('dashboard.inProgress')}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/50 border-green-200 dark:border-green-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.delivered')}</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{shipmentStats?.deliveredCount || 0}</div>
              <p className="text-xs text-green-600/70">{t('dashboard.completed')}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/50 dark:to-red-900/50 border-red-200 dark:border-red-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.onHold')}</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{shipmentStats?.onHoldCount || 0}</div>
              <p className="text-xs text-red-600/70">{t('dashboard.needsAttention')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Shipments Over Time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t('dashboard.shipmentsOverTime')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {t('common.loading')}
                  </div>
                ) : shipmentStats?.shipmentsOverTime?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={shipmentStats.shipmentsOverTime}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="shipments" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {t('common.noData')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {t('dashboard.statusDistribution')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {t('common.loading')}
                  </div>
                ) : shipmentStats?.pieData?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={shipmentStats.pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {shipmentStats.pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || '#6b7280'} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {t('common.noData')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Branch Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t('country.branchPerformance')}
            </CardTitle>
            <CardDescription>{t('country.branchPerformanceDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : shipmentStats?.branchStats?.length ? (
              <div className="space-y-4">
                {shipmentStats.branchStats.map((branch) => (
                  <div key={branch.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{branch.name}</span>
                        <Badge variant="outline" className="text-xs">{branch.code}</Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">{t('dashboard.total')}:</span>
                          <span className="ml-1 font-medium">{branch.total}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('dashboard.active')}:</span>
                          <span className="ml-1 font-medium text-amber-600">{branch.active}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('dashboard.delivered')}:</span>
                          <span className="ml-1 font-medium text-green-600">{branch.delivered}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('dashboard.onHold')}:</span>
                          <span className="ml-1 font-medium text-red-600">{branch.onHold}</span>
                        </div>
                      </div>
                    </div>
                    {branch.total > 0 && (
                      <div className="w-24">
                        <Progress 
                          value={(branch.delivered / branch.total) * 100} 
                          className="h-2"
                        />
                        <p className="text-xs text-center text-muted-foreground mt-1">
                          {Math.round((branch.delivered / branch.total) * 100)}% {t('dashboard.delivered')}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                {t('common.noData')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Exceptions and Requests Row */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Exceptions Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                {t('exceptions.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('exceptions.total')}</span>
                  <span className="text-2xl font-bold">{exceptionStats?.total || 0}</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/50">
                    <div className="text-lg font-bold text-red-600">{exceptionStats?.P1 || 0}</div>
                    <div className="text-xs text-red-600">P1 - {t('exceptions.critical')}</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50">
                    <div className="text-lg font-bold text-amber-600">{exceptionStats?.P2 || 0}</div>
                    <div className="text-xs text-amber-600">P2 - {t('exceptions.high')}</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/50">
                    <div className="text-lg font-bold text-blue-600">{exceptionStats?.P3 || 0}</div>
                    <div className="text-xs text-blue-600">P3 - {t('exceptions.medium')}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10">
                  <span className="text-destructive font-medium">{t('exceptions.open')}</span>
                  <Badge variant="destructive">{exceptionStats?.open || 0}</Badge>
                </div>
                <Link to="/backoffice/action-required" className="block">
                  <button className="w-full text-sm text-primary hover:underline flex items-center justify-center gap-1">
                    {t('common.viewAll')} <ArrowUpRight className="h-4 w-4" />
                  </button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Customer Requests */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('nav.customerRequests')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('requests.total')}</span>
                  <span className="text-2xl font-bold">{requestStats?.total || 0}</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/50">
                    <div className="text-lg font-bold text-red-600">{requestStats?.open || 0}</div>
                    <div className="text-xs text-red-600">{t('requests.open')}</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50">
                    <div className="text-lg font-bold text-amber-600">{requestStats?.inProgress || 0}</div>
                    <div className="text-xs text-amber-600">{t('requests.inProgress')}</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/50">
                    <div className="text-lg font-bold text-green-600">{requestStats?.resolved || 0}</div>
                    <div className="text-xs text-green-600">{t('requests.resolved')}</div>
                  </div>
                </div>
                <Link to="/backoffice/customer-requests" className="block">
                  <button className="w-full text-sm text-primary hover:underline flex items-center justify-center gap-1">
                    {t('common.viewAll')} <ArrowUpRight className="h-4 w-4" />
                  </button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </BackofficeLayout>
  );
}
