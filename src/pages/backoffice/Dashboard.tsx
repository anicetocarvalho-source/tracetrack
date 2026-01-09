import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, TrendingUp, AlertTriangle, CheckCircle, CalendarIcon, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { ShipmentStatus, STATUS_LABELS } from '@/lib/constants';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
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
  LineChart,
  Line,
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

export default function Dashboard() {
  const { t } = useTranslation();
  
  const PRESET_RANGES = [
    { label: t('dashboard.last7Days'), days: 7 },
    { label: t('dashboard.last30Days'), days: 30 },
    { label: t('dashboard.last90Days'), days: 90 },
    { label: t('dashboard.allTime'), days: null },
  ];

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [activePreset, setActivePreset] = useState<number | null>(30);

  const handlePresetClick = (days: number | null) => {
    setActivePreset(days);
    if (days === null) {
      setDateRange(undefined);
    } else {
      setDateRange({
        from: subDays(new Date(), days - 1),
        to: new Date(),
      });
    }
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    setActivePreset(null);
  };

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      // Get all shipments with dates
      const { data: allShipments } = await supabase
        .from('shipments')
        .select('id, current_status, created_at, client_id');

      // Filter shipments by date range
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

      const totalShipments = shipments?.length || 0;
      const activeShipments = shipments?.filter(s => 
        !['DELIVERED', 'CANCELLED'].includes(s.current_status)
      ).length || 0;
      const onHoldCount = statusCounts['ON_HOLD_INCIDENT'] || 0;
      const deliveredCount = statusCounts['DELIVERED'] || 0;

      // Get recent shipments (always show recent, not filtered)
      const { data: recentShipments } = await supabase
        .from('shipments')
        .select('id, shipment_ref, client_ref, current_status, created_at, client:clients(name)')
        .order('created_at', { ascending: false })
        .limit(5);

      // Calculate shipments over time based on selected range
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

      // Get clients with shipment counts (filtered)
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name');

      const clientShipmentCounts = clients?.map(client => ({
        name: client.name.length > 15 ? client.name.slice(0, 15) + '...' : client.name,
        shipments: shipments?.filter(s => s.client_id === client.id).length || 0,
      })).filter(c => c.shipments > 0).sort((a, b) => b.shipments - a.shipments).slice(0, 8) || [];

      // Prepare pie chart data (filtered)
      const pieData = Object.entries(statusCounts).map(([status, count]) => ({
        name: STATUS_LABELS[status as ShipmentStatus] || status,
        value: count,
        status,
      }));

      return {
        totalShipments,
        activeShipments,
        onHoldCount,
        deliveredCount,
        statusCounts,
        recentShipments,
        shipmentsOverTime,
        clientShipmentCounts,
        pieData,
      };
    },
  });

  // Fetch exception counts by severity
  const { data: exceptionCounts } = useQuery({
    queryKey: ['dashboard-exception-counts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('shipment_exceptions')
        .select('severity, status')
        .in('status', ['OPEN', 'ACKNOWLEDGED']);

      const counts = { P1: 0, P2: 0, P3: 0, total: 0 };
      data?.forEach(ex => {
        counts[ex.severity as keyof typeof counts]++;
        counts.total++;
      });
      return counts;
    },
  });

  const dateRangeLabel = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}`
    : t('dashboard.allTime');

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
            <p className="text-muted-foreground">{t('dashboard.inSelectedPeriod')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PRESET_RANGES.map((preset) => (
              <Button
                key={preset.label}
                variant={activePreset === preset.days ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePresetClick(preset.days)}
              >
                {preset.label}
              </Button>
            ))}
            
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={activePreset === null && dateRange ? 'default' : 'outline'}
                  size="sm"
                  className={cn('justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {t('dashboard.customRange')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={handleDateRangeChange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Active filter indicator */}
        <div className="text-sm text-muted-foreground">
          {t('dashboard.dateRange')}: <span className="font-medium text-foreground">{dateRangeLabel}</span>
        </div>

        {/* Exceptions Widget */}
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-destructive" />
                {t('dashboard.openExceptions')}
              </CardTitle>
              <CardDescription>{t('dashboard.exceptionsRequiringAttention')}</CardDescription>
            </div>
            <Link to="/backoffice/action-required">
              <Button variant="outline" size="sm">
                {t('shipments.viewAll')}
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <Link 
                to="/backoffice/action-required?severity=P1" 
                className="flex flex-col items-center p-3 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors cursor-pointer"
              >
                <span className="text-2xl font-bold text-destructive">
                  {exceptionCounts?.P1 ?? 0}
                </span>
                <span className="text-xs font-medium text-destructive">P1 Critical</span>
              </Link>
              <Link 
                to="/backoffice/action-required?severity=P2" 
                className="flex flex-col items-center p-3 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 transition-colors cursor-pointer"
              >
                <span className="text-2xl font-bold text-orange-600">
                  {exceptionCounts?.P2 ?? 0}
                </span>
                <span className="text-xs font-medium text-orange-600">P2 High</span>
              </Link>
              <Link 
                to="/backoffice/action-required?severity=P3" 
                className="flex flex-col items-center p-3 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors cursor-pointer"
              >
                <span className="text-2xl font-bold text-yellow-600">
                  {exceptionCounts?.P3 ?? 0}
                </span>
                <span className="text-xs font-medium text-yellow-600">P3 Medium</span>
              </Link>
              <Link 
                to="/backoffice/action-required" 
                className="flex flex-col items-center p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors cursor-pointer"
              >
                <span className="text-2xl font-bold">
                  {exceptionCounts?.total ?? 0}
                </span>
                <span className="text-xs font-medium text-muted-foreground">{t('common.all')}</span>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Stats cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.totalShipments')}</CardTitle>
              <Package className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? '...' : stats?.totalShipments}
              </div>
              <p className="text-xs text-muted-foreground">{t('dashboard.inSelectedPeriod')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.activeShipments')}</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? '...' : stats?.activeShipments}
              </div>
              <p className="text-xs text-muted-foreground">{t('dashboard.inTransitOrProcessing')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.onHold')}</CardTitle>
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {isLoading ? '...' : stats?.onHoldCount}
              </div>
              <p className="text-xs text-muted-foreground">{t('dashboard.awaitingResolution')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.delivered')}</CardTitle>
              <CheckCircle className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {isLoading ? '...' : stats?.deliveredCount}
              </div>
              <p className="text-xs text-muted-foreground">{t('dashboard.completedSuccessfully')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Shipments over time */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.shipmentsOverTime')}</CardTitle>
              <CardDescription>{t('dashboard.inSelectedPeriod')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {t('common.loading')}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats?.shipmentsOverTime}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="shipments" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status distribution pie chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.shipmentsByStatus')}</CardTitle>
              <CardDescription>{t('dashboard.inSelectedPeriod')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {t('common.loading')}
                  </div>
                ) : stats?.pieData?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {stats.pieData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={STATUS_COLORS[entry.status] || '#6b7280'} 
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {t('shipments.noShipments')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Client shipments bar chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.shipmentsByClient')}</CardTitle>
            <CardDescription>{t('dashboard.inSelectedPeriod')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('common.loading')}
                </div>
              ) : stats?.clientShipmentCounts?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.clientShipmentCounts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis 
                      type="number"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <YAxis 
                      type="category"
                      dataKey="name" 
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={120}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar 
                      dataKey="shipments" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('clients.noClients')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent shipments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('dashboard.recentShipments')}</CardTitle>
              <CardDescription>{t('dashboard.inSelectedPeriod')}</CardDescription>
            </div>
            <Link 
              to="/backoffice/shipments" 
              className="text-sm text-primary hover:underline"
            >
              {t('shipments.viewDetails')}
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.recentShipments?.map((shipment: any) => (
                <Link
                  key={shipment.id}
                  to={`/backoffice/shipments/${shipment.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{shipment.shipment_ref}</p>
                    <p className="text-sm text-muted-foreground">
                      {shipment.client?.name} · {shipment.client_ref}
                    </p>
                  </div>
                  <StatusBadge status={shipment.current_status} />
                </Link>
              ))}
              {isLoading && <p className="text-muted-foreground">{t('common.loading')}</p>}
              {!isLoading && !stats?.recentShipments?.length && (
                <p className="text-muted-foreground text-center py-4">{t('shipments.noShipments')}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </BackofficeLayout>
  );
}
