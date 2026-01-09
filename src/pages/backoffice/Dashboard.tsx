import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, TrendingUp, AlertTriangle, CheckCircle, CalendarIcon, ShieldAlert, Target, Clock, Timer } from 'lucide-react';
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
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval, isWithinInterval, endOfDay, differenceInHours } from 'date-fns';
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

// Default SLA targets in hours by severity (will be overridden by system settings)
const DEFAULT_SLA_TARGETS = {
  P1: 4,  // 4 hours for critical
  P2: 24, // 24 hours for high
  P3: 72, // 72 hours for medium
};

interface SLATargetsConfig {
  P1: number;
  P2: number;
  P3: number;
}

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

  // Fetch exception trends over time
  const { data: exceptionTrends, isLoading: isLoadingTrends } = useQuery({
    queryKey: ['dashboard-exception-trends', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const { data: allExceptions } = await supabase
        .from('shipment_exceptions')
        .select('severity, detected_at, status');

      // Filter exceptions by date range
      const rangeStart = dateRange?.from || subDays(new Date(), 29);
      const rangeEnd = dateRange?.to || new Date();
      
      const exceptions = dateRange?.from && dateRange?.to
        ? allExceptions?.filter(ex => {
            const detectedDate = new Date(ex.detected_at);
            return isWithinInterval(detectedDate, {
              start: startOfDay(dateRange.from!),
              end: endOfDay(dateRange.to!),
            });
          })
        : allExceptions;

      // Calculate exceptions over time based on selected range
      const daysInRange = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

      const trendsData = daysInRange.map(day => {
        const dayStart = startOfDay(day);
        const dayExceptions = exceptions?.filter(ex => {
          const detectedDate = startOfDay(new Date(ex.detected_at));
          return detectedDate.getTime() === dayStart.getTime();
        }) || [];

        return {
          date: format(day, 'dd/MM'),
          P1: dayExceptions.filter(ex => ex.severity === 'P1').length,
          P2: dayExceptions.filter(ex => ex.severity === 'P2').length,
          P3: dayExceptions.filter(ex => ex.severity === 'P3').length,
          total: dayExceptions.length,
        };
      });

      return trendsData;
    },
  });

  // Fetch resolution time analysis
  const { data: resolutionTimeData, isLoading: isLoadingResolution } = useQuery({
    queryKey: ['dashboard-resolution-times', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const { data: resolvedExceptions } = await supabase
        .from('shipment_exceptions')
        .select('severity, detected_at, resolved_at')
        .eq('status', 'RESOLVED')
        .not('resolved_at', 'is', null);

      // Filter by date range
      const exceptions = dateRange?.from && dateRange?.to
        ? resolvedExceptions?.filter(ex => {
            const resolvedDate = new Date(ex.resolved_at!);
            return isWithinInterval(resolvedDate, {
              start: startOfDay(dateRange.from!),
              end: endOfDay(dateRange.to!),
            });
          })
        : resolvedExceptions;

      // Calculate average resolution time by severity
      const severities = ['P1', 'P2', 'P3'] as const;
      const resolutionData = severities.map(severity => {
        const severityExceptions = exceptions?.filter(ex => ex.severity === severity) || [];
        
        if (severityExceptions.length === 0) {
          return {
            severity,
            avgHours: 0,
            count: 0,
            minHours: 0,
            maxHours: 0,
          };
        }

        const resolutionTimes = severityExceptions.map(ex => 
          differenceInHours(new Date(ex.resolved_at!), new Date(ex.detected_at))
        );

        const avgHours = Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length);
        const minHours = Math.min(...resolutionTimes);
        const maxHours = Math.max(...resolutionTimes);

        return {
          severity,
          avgHours,
          count: severityExceptions.length,
          minHours,
          maxHours,
        };
      });

      return resolutionData;
    },
  });

  // Fetch SLA targets from system settings
  const { data: slaTargets } = useQuery({
    queryKey: ['sla-targets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'sla_targets')
        .single();
      
      if (error || !data) return DEFAULT_SLA_TARGETS;
      const value = data.value as unknown as SLATargetsConfig;
      return value;
    },
  });

  const activeSLATargets = slaTargets || DEFAULT_SLA_TARGETS;

  // Fetch SLA compliance data
  const { data: slaComplianceData, isLoading: isLoadingSLA } = useQuery({
    queryKey: ['dashboard-sla-compliance', dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), activeSLATargets],
    queryFn: async () => {
      const { data: resolvedExceptions } = await supabase
        .from('shipment_exceptions')
        .select('severity, detected_at, resolved_at')
        .eq('status', 'RESOLVED')
        .not('resolved_at', 'is', null);

      // Filter by date range
      const exceptions = dateRange?.from && dateRange?.to
        ? resolvedExceptions?.filter(ex => {
            const resolvedDate = new Date(ex.resolved_at!);
            return isWithinInterval(resolvedDate, {
              start: startOfDay(dateRange.from!),
              end: endOfDay(dateRange.to!),
            });
          })
        : resolvedExceptions;

      // Calculate SLA compliance by severity
      const severities = ['P1', 'P2', 'P3'] as const;
      const complianceData = severities.map(severity => {
        const severityExceptions = exceptions?.filter(ex => ex.severity === severity) || [];
        const total = severityExceptions.length;
        
        if (total === 0) {
          return {
            severity,
            total: 0,
            withinSLA: 0,
            breached: 0,
            compliancePercent: 0,
            targetHours: activeSLATargets[severity],
          };
        }

        const withinSLA = severityExceptions.filter(ex => {
          const resolutionHours = differenceInHours(new Date(ex.resolved_at!), new Date(ex.detected_at));
          return resolutionHours <= activeSLATargets[severity];
        }).length;

        const breached = total - withinSLA;
        const compliancePercent = Math.round((withinSLA / total) * 100);

        return {
          severity,
          total,
          withinSLA,
          breached,
          compliancePercent,
          targetHours: activeSLATargets[severity],
        };
      });

      // Calculate overall compliance
      const totalResolved = complianceData.reduce((sum, d) => sum + d.total, 0);
      const totalWithinSLA = complianceData.reduce((sum, d) => sum + d.withinSLA, 0);
      const overallCompliance = totalResolved > 0 ? Math.round((totalWithinSLA / totalResolved) * 100) : 0;

      return {
        bySeverity: complianceData,
        overall: overallCompliance,
        totalResolved,
        totalWithinSLA,
      };
    },
  });

  // Fetch slowest resolved exceptions
  const { data: slowestExceptions, isLoading: isLoadingSlowest } = useQuery({
    queryKey: ['dashboard-slowest-exceptions', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const { data: resolvedExceptions, error } = await supabase
        .from('shipment_exceptions')
        .select(`
          id,
          severity,
          detected_at,
          resolved_at,
          resolution_note,
          exception_rule:exception_rules(name),
          shipment:shipments(
            id,
            shipment_ref,
            current_status,
            client:clients(name)
          ),
          resolved_by_profile:profiles!shipment_exceptions_resolved_by_fkey(name)
        `)
        .eq('status', 'RESOLVED')
        .not('resolved_at', 'is', null)
        .order('resolved_at', { ascending: false });

      if (error) {
        console.error('Error fetching slowest exceptions:', error);
        return [];
      }

      // Filter by date range
      const exceptions = dateRange?.from && dateRange?.to
        ? resolvedExceptions?.filter(ex => {
            const resolvedDate = new Date(ex.resolved_at!);
            return isWithinInterval(resolvedDate, {
              start: startOfDay(dateRange.from!),
              end: endOfDay(dateRange.to!),
            });
          })
        : resolvedExceptions;

      // Calculate resolution time and sort by slowest
      const withResolutionTime = (exceptions || []).map(ex => {
        const detectedAt = new Date(ex.detected_at);
        const resolvedAt = new Date(ex.resolved_at!);
        const resolutionHours = differenceInHours(resolvedAt, detectedAt);
        const severity = ex.severity as 'P1' | 'P2' | 'P3';
        const slaTarget = activeSLATargets[severity];
        const breachedSLA = resolutionHours > slaTarget;

        return {
          id: ex.id,
          shipmentId: (ex.shipment as any)?.id,
          shipmentRef: (ex.shipment as any)?.shipment_ref || 'Unknown',
          clientName: (ex.shipment as any)?.client?.name || 'Unknown',
          severity: ex.severity,
          ruleName: (ex.exception_rule as any)?.name || 'Unknown',
          resolutionHours,
          slaTarget,
          breachedSLA,
          resolvedBy: (ex.resolved_by_profile as any)?.name || 'Unknown',
          resolvedAt: ex.resolved_at,
          resolutionNote: ex.resolution_note,
        };
      });

      // Sort by resolution time (slowest first) and take top 10
      return withResolutionTime
        .sort((a, b) => b.resolutionHours - a.resolutionHours)
        .slice(0, 10);
    },
    enabled: !!activeSLATargets,
  });

  // Fetch at-risk shipments (approaching SLA limits)
  const { data: atRiskShipments, isLoading: isLoadingAtRisk } = useQuery({
    queryKey: ['dashboard-at-risk-shipments'],
    queryFn: async () => {
      const { data: activeSlaRecords, error } = await supabase
        .from('shipment_sla')
        .select(`
          id,
          shipment_id,
          shipment_status,
          entered_at,
          sla_config:sla_config(max_hours),
          shipment:shipments(
            id,
            shipment_ref,
            client:clients(name)
          )
        `)
        .is('exited_at', null)
        .eq('breached', false);

      if (error) {
        console.error('Error fetching at-risk shipments:', error);
        return { critical: [], warning: [], criticalCount: 0, warningCount: 0, total: 0 };
      }

      const now = new Date();
      const CRITICAL_THRESHOLD = 0.90;
      const WARNING_THRESHOLD = 0.75;

      const atRisk: {
        id: string;
        shipmentId: string;
        shipmentRef: string;
        clientName: string;
        status: string;
        percentUsed: number;
        hoursRemaining: number;
        riskLevel: 'critical' | 'warning';
      }[] = [];

      for (const record of activeSlaRecords || []) {
        const maxHours = (record.sla_config as any)?.max_hours;
        if (!maxHours) continue;

        const enteredAt = new Date(record.entered_at);
        const elapsedMs = now.getTime() - enteredAt.getTime();
        const elapsedHours = elapsedMs / (1000 * 60 * 60);
        const percentUsed = elapsedHours / maxHours;

        if (percentUsed >= WARNING_THRESHOLD && percentUsed < 1.0) {
          atRisk.push({
            id: record.id,
            shipmentId: record.shipment_id,
            shipmentRef: (record.shipment as any)?.shipment_ref || 'Unknown',
            clientName: (record.shipment as any)?.client?.name || 'Unknown',
            status: STATUS_LABELS[record.shipment_status as ShipmentStatus] || record.shipment_status,
            percentUsed: Math.round(percentUsed * 100),
            hoursRemaining: Math.round((maxHours - elapsedHours) * 10) / 10,
            riskLevel: percentUsed >= CRITICAL_THRESHOLD ? 'critical' : 'warning',
          });
        }
      }

      // Sort by risk level and percent used
      atRisk.sort((a, b) => {
        if (a.riskLevel !== b.riskLevel) {
          return a.riskLevel === 'critical' ? -1 : 1;
        }
        return b.percentUsed - a.percentUsed;
      });

      const critical = atRisk.filter(s => s.riskLevel === 'critical');
      const warning = atRisk.filter(s => s.riskLevel === 'warning');

      return {
        critical,
        warning,
        criticalCount: critical.length,
        warningCount: warning.length,
        total: atRisk.length,
        topShipments: atRisk.slice(0, 5),
      };
    },
    refetchInterval: 60000, // Refresh every minute
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

        {/* At-Risk Shipments Widget */}
        {(atRiskShipments?.total ?? 0) > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Timer className="w-5 h-5 text-amber-500" />
                  {t('dashboard.atRiskShipments')}
                </CardTitle>
                <CardDescription>{t('dashboard.shipmentsApproachingSLA')}</CardDescription>
              </div>
              <Link to="/backoffice/sla-breach-report">
                <Button variant="outline" size="sm">
                  {t('dashboard.viewSLAReport')}
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="flex flex-col items-center p-3 rounded-lg bg-destructive/10">
                  <span className="text-2xl font-bold text-destructive">
                    {atRiskShipments?.criticalCount ?? 0}
                  </span>
                  <span className="text-xs font-medium text-destructive flex items-center gap-1">
                    🚨 {t('dashboard.critical')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">≥90% SLA</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-amber-500/10">
                  <span className="text-2xl font-bold text-amber-600">
                    {atRiskShipments?.warningCount ?? 0}
                  </span>
                  <span className="text-xs font-medium text-amber-600 flex items-center gap-1">
                    ⚠️ {t('dashboard.warning')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">75-90% SLA</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-muted">
                  <span className="text-2xl font-bold">
                    {atRiskShipments?.total ?? 0}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">{t('common.total')}</span>
                  <span className="text-[10px] text-muted-foreground">{t('dashboard.atRisk')}</span>
                </div>
              </div>

              {/* Top at-risk shipments */}
              {atRiskShipments?.topShipments && atRiskShipments.topShipments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{t('dashboard.mostUrgent')}</p>
                  {atRiskShipments.topShipments.map((shipment) => (
                    <Link
                      key={shipment.id}
                      to={`/backoffice/shipments/${shipment.shipmentId}`}
                      className="flex items-center justify-between p-2 rounded-lg bg-background hover:bg-muted/50 transition-colors border"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          shipment.riskLevel === 'critical' ? 'bg-destructive' : 'bg-amber-500'
                        )} />
                        <div>
                          <p className="text-sm font-medium">{shipment.shipmentRef}</p>
                          <p className="text-xs text-muted-foreground">{shipment.clientName}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full",
                                shipment.riskLevel === 'critical' ? 'bg-destructive' : 'bg-amber-500'
                              )}
                              style={{ width: `${Math.min(shipment.percentUsed, 100)}%` }}
                            />
                          </div>
                          <span className={cn(
                            "text-xs font-medium",
                            shipment.riskLevel === 'critical' ? 'text-destructive' : 'text-amber-600'
                          )}>
                            {shipment.percentUsed}%
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {shipment.hoursRemaining}h {t('dashboard.remaining')}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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

        {/* Exception trends chart */}
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              {t('dashboard.exceptionTrends')}
            </CardTitle>
            <CardDescription>{t('dashboard.exceptionsOverTime')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {isLoadingTrends ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('common.loading')}
                </div>
              ) : exceptionTrends?.some(d => d.total > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={exceptionTrends}>
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
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="P1" 
                      stackId="1"
                      stroke="#ef4444" 
                      fill="#ef4444"
                      fillOpacity={0.8}
                      name="P1 Critical"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="P2" 
                      stackId="1"
                      stroke="#f97316" 
                      fill="#f97316"
                      fillOpacity={0.7}
                      name="P2 High"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="P3" 
                      stackId="1"
                      stroke="#eab308" 
                      fill="#eab308"
                      fillOpacity={0.6}
                      name="P3 Medium"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('dashboard.noExceptions')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Resolution Time Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              {t('dashboard.resolutionTimeAnalysis')}
            </CardTitle>
            <CardDescription>{t('dashboard.avgResolutionTime')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {isLoadingResolution ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('common.loading')}
                </div>
              ) : resolutionTimeData?.some(d => d.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={resolutionTimeData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis 
                      type="number"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      label={{ value: t('dashboard.hours'), position: 'bottom', fontSize: 12 }}
                    />
                    <YAxis 
                      type="category"
                      dataKey="severity" 
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number, name: string, props: any) => {
                        const item = props.payload;
                        return [
                          `${value}h (${t('dashboard.min')}: ${item.minHours}h, ${t('dashboard.max')}: ${item.maxHours}h)`,
                          t('dashboard.avgTime')
                        ];
                      }}
                      labelFormatter={(label) => `${label} - ${resolutionTimeData?.find(d => d.severity === label)?.count || 0} ${t('dashboard.resolved')}`}
                    />
                    <Bar 
                      dataKey="avgHours" 
                      radius={[0, 4, 4, 0]}
                    >
                      {resolutionTimeData?.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.severity === 'P1' ? '#ef4444' : entry.severity === 'P2' ? '#f97316' : '#eab308'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('dashboard.noResolvedExceptions')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* SLA Compliance Tracking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              {t('dashboard.slaCompliance')}
            </CardTitle>
            <CardDescription>{t('dashboard.slaComplianceDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {isLoadingSLA ? (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  {t('common.loading')}
                </div>
              ) : slaComplianceData?.totalResolved ? (
                <>
                  {/* Overall compliance indicator */}
                  <div className="flex items-center justify-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <div className="text-center">
                      <div className={cn(
                        "text-4xl font-bold",
                        slaComplianceData.overall >= 90 ? "text-green-600" :
                        slaComplianceData.overall >= 70 ? "text-yellow-600" : "text-destructive"
                      )}>
                        {slaComplianceData.overall}%
                      </div>
                      <div className="text-sm text-muted-foreground">{t('dashboard.overallCompliance')}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {slaComplianceData.totalWithinSLA} / {slaComplianceData.totalResolved} {t('dashboard.resolvedWithinSLA')}
                    </div>
                  </div>

                  {/* Compliance by severity */}
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={slaComplianceData.bySeverity} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                        <XAxis 
                          type="number"
                          domain={[0, 100]}
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `${value}%`}
                        />
                        <YAxis 
                          type="category"
                          dataKey="severity" 
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          width={50}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number, name: string, props: any) => {
                            const item = props.payload;
                            return [
                              `${value}% (${item.withinSLA}/${item.total})`,
                              t('dashboard.complianceRate')
                            ];
                          }}
                          labelFormatter={(label) => {
                            const item = slaComplianceData.bySeverity.find(d => d.severity === label);
                            return `${label} - ${t('dashboard.target')}: ${item?.targetHours}h`;
                          }}
                        />
                        <Bar 
                          dataKey="compliancePercent" 
                          radius={[0, 4, 4, 0]}
                          name={t('dashboard.complianceRate')}
                        >
                          {slaComplianceData.bySeverity.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={
                                entry.compliancePercent >= 90 ? '#22c55e' :
                                entry.compliancePercent >= 70 ? '#eab308' : '#ef4444'
                              } 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* SLA targets legend */}
                  <div className="flex flex-wrap justify-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">P1:</span>
                      <span className="text-muted-foreground">{activeSLATargets.P1}h {t('dashboard.target')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">P2:</span>
                      <span className="text-muted-foreground">{activeSLATargets.P2}h {t('dashboard.target')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">P3:</span>
                      <span className="text-muted-foreground">{activeSLATargets.P3}h {t('dashboard.target')}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  {t('dashboard.noResolvedExceptions')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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

        {/* Slowest Resolved Exceptions */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <CardTitle>{t('dashboard.slowestExceptions')}</CardTitle>
            </div>
            <CardDescription>{t('dashboard.slowestExceptionsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSlowest ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : slowestExceptions && slowestExceptions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('dashboard.rank')}</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('exceptions.severity')}</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('shipments.shipmentRef')}</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('shipments.client')}</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('exceptions.exceptionName')}</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('dashboard.resolutionTime')}</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('dashboard.slaStatus')}</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('dashboard.resolvedBy')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slowestExceptions.map((ex, index) => (
                      <tr 
                        key={ex.id} 
                        className={cn(
                          "border-b hover:bg-muted/50 transition-colors",
                          ex.breachedSLA && "bg-destructive/5"
                        )}
                      >
                        <td className="py-3 px-2">
                          <span className={cn(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                            index === 0 ? "bg-amber-100 text-amber-800" :
                            index === 1 ? "bg-gray-100 text-gray-800" :
                            index === 2 ? "bg-orange-100 text-orange-800" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <span className={cn(
                            "inline-block px-2 py-0.5 rounded text-xs font-bold text-white",
                            ex.severity === 'P1' ? "bg-destructive" :
                            ex.severity === 'P2' ? "bg-orange-500" :
                            "bg-blue-500"
                          )}>
                            {ex.severity}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <Link 
                            to={`/backoffice/shipments/${ex.shipmentId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {ex.shipmentRef}
                          </Link>
                        </td>
                        <td className="py-3 px-2 text-muted-foreground">{ex.clientName}</td>
                        <td className="py-3 px-2">{ex.ruleName}</td>
                        <td className="py-3 px-2">
                          <span className={cn(
                            "font-semibold",
                            ex.breachedSLA ? "text-destructive" : "text-foreground"
                          )}>
                            {ex.resolutionHours < 24 
                              ? `${ex.resolutionHours.toFixed(1)}h` 
                              : `${Math.floor(ex.resolutionHours / 24)}d ${Math.round(ex.resolutionHours % 24)}h`
                            }
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            / {ex.slaTarget}h
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          {ex.breachedSLA ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                              <AlertTriangle className="h-3 w-3" />
                              {t('dashboard.breached')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                              <CheckCircle className="h-3 w-3" />
                              {t('dashboard.withinSLA')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-muted-foreground">{ex.resolvedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                {t('dashboard.noResolvedExceptions')}
              </div>
            )}
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
