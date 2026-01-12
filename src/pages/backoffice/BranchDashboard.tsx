import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Package, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  ShieldAlert, 
  Timer,
  Building2,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { ShipmentStatus, STATUS_LABELS } from '@/lib/constants';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useBranch } from '@/hooks/useBranch';
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

const DEFAULT_SLA_TARGETS = {
  P1: 4,
  P2: 24,
  P3: 72,
};

interface SLATargetsConfig {
  P1: number;
  P2: number;
  P3: number;
}

export default function BranchDashboard() {
  const { t } = useTranslation();
  const { currentBranch, isLoading: branchLoading } = useBranch();

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
  };

  // Fetch branch-filtered shipment stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ['branch-dashboard-stats', currentBranch?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      if (!currentBranch?.id) return null;

      const { data: allShipments } = await supabase
        .from('shipments')
        .select('id, current_status, created_at, client_id')
        .eq('branch_id', currentBranch.id);

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

      // Get recent shipments for this branch
      const { data: recentShipments } = await supabase
        .from('shipments')
        .select('id, shipment_ref, client_ref, current_status, created_at, client:clients(name)')
        .eq('branch_id', currentBranch.id)
        .order('created_at', { ascending: false })
        .limit(5);

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

      // Get clients with shipment counts
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('branch_id', currentBranch.id);

      const clientShipmentCounts = clients?.map(client => ({
        name: client.name.length > 15 ? client.name.slice(0, 15) + '...' : client.name,
        shipments: shipments?.filter(s => s.client_id === client.id).length || 0,
      })).filter(c => c.shipments > 0).sort((a, b) => b.shipments - a.shipments).slice(0, 8) || [];

      // Pie chart data
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
    enabled: !!currentBranch?.id,
  });

  // Fetch branch-filtered exception counts
  const { data: exceptionCounts } = useQuery({
    queryKey: ['branch-exception-counts', currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return { P1: 0, P2: 0, P3: 0, total: 0 };

      // Get shipment IDs for this branch first
      const { data: branchShipments } = await supabase
        .from('shipments')
        .select('id')
        .eq('branch_id', currentBranch.id);

      const shipmentIds = branchShipments?.map(s => s.id) || [];
      if (shipmentIds.length === 0) return { P1: 0, P2: 0, P3: 0, total: 0 };

      const { data } = await supabase
        .from('shipment_exceptions')
        .select('severity, status, shipment_id')
        .in('status', ['OPEN', 'ACKNOWLEDGED'])
        .in('shipment_id', shipmentIds);

      const counts = { P1: 0, P2: 0, P3: 0, total: 0 };
      data?.forEach(ex => {
        counts[ex.severity as keyof typeof counts]++;
        counts.total++;
      });
      return counts;
    },
    enabled: !!currentBranch?.id,
  });

  // Fetch branch-filtered exception trends
  const { data: exceptionTrends } = useQuery({
    queryKey: ['branch-exception-trends', currentBranch?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      const { data: branchShipments } = await supabase
        .from('shipments')
        .select('id')
        .eq('branch_id', currentBranch.id);

      const shipmentIds = branchShipments?.map(s => s.id) || [];
      if (shipmentIds.length === 0) return [];

      const { data: allExceptions } = await supabase
        .from('shipment_exceptions')
        .select('severity, detected_at, status, shipment_id')
        .in('shipment_id', shipmentIds);

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

      const daysInRange = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

      return daysInRange.map(day => {
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
    },
    enabled: !!currentBranch?.id,
  });

  // Fetch SLA targets from branch settings or system settings
  const { data: slaTargets } = useQuery({
    queryKey: ['branch-sla-targets', currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return DEFAULT_SLA_TARGETS;

      // First check branch settings
      const { data: branchSettings } = await supabase
        .from('branch_settings')
        .select('value')
        .eq('branch_id', currentBranch.id)
        .eq('setting_key', 'sla_overrides')
        .single();

      if (branchSettings?.value) {
        const overrides = branchSettings.value as Record<string, number>;
        // Convert status-based overrides to severity if needed
        return DEFAULT_SLA_TARGETS;
      }

      // Fall back to system settings
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'sla_targets')
        .single();

      if (error || !data) return DEFAULT_SLA_TARGETS;
      return data.value as unknown as SLATargetsConfig;
    },
    enabled: !!currentBranch?.id,
  });

  const activeSLATargets = slaTargets || DEFAULT_SLA_TARGETS;

  // Fetch branch-filtered SLA compliance
  const { data: slaComplianceData } = useQuery({
    queryKey: ['branch-sla-compliance', currentBranch?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), activeSLATargets],
    queryFn: async () => {
      if (!currentBranch?.id) return null;

      const { data: branchShipments } = await supabase
        .from('shipments')
        .select('id')
        .eq('branch_id', currentBranch.id);

      const shipmentIds = branchShipments?.map(s => s.id) || [];
      if (shipmentIds.length === 0) return null;

      const { data: resolvedExceptions } = await supabase
        .from('shipment_exceptions')
        .select('severity, detected_at, resolved_at, shipment_id')
        .eq('status', 'RESOLVED')
        .not('resolved_at', 'is', null)
        .in('shipment_id', shipmentIds);

      const exceptions = dateRange?.from && dateRange?.to
        ? resolvedExceptions?.filter(ex => {
            const resolvedDate = new Date(ex.resolved_at!);
            return isWithinInterval(resolvedDate, {
              start: startOfDay(dateRange.from!),
              end: endOfDay(dateRange.to!),
            });
          })
        : resolvedExceptions;

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
    enabled: !!currentBranch?.id && !!activeSLATargets,
  });

  // Fetch at-risk shipments for this branch
  const { data: atRiskShipments } = useQuery({
    queryKey: ['branch-at-risk-shipments', currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return { critical: [], warning: [], criticalCount: 0, warningCount: 0, total: 0, topShipments: [] };

      const { data: activeSlaRecords, error } = await supabase
        .from('shipment_sla')
        .select(`
          id,
          shipment_id,
          shipment_status,
          entered_at,
          sla_config:sla_config(max_hours),
          shipment:shipments!inner(
            id,
            shipment_ref,
            branch_id,
            client:clients(name)
          )
        `)
        .is('exited_at', null)
        .eq('breached', false);

      if (error) {
        console.error('Error fetching at-risk shipments:', error);
        return { critical: [], warning: [], criticalCount: 0, warningCount: 0, total: 0, topShipments: [] };
      }

      // Filter by branch
      const branchRecords = activeSlaRecords?.filter(r => (r.shipment as any)?.branch_id === currentBranch.id) || [];

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

      for (const record of branchRecords) {
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
    enabled: !!currentBranch?.id,
    refetchInterval: 60000,
  });

  if (branchLoading) {
    return (
      <BackofficeLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-muted-foreground">{t('common.loading')}</div>
        </div>
      </BackofficeLayout>
    );
  }

  if (!currentBranch) {
    return (
      <BackofficeLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <Building2 className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">{t('branchDashboard.noBranchSelected')}</p>
          <p className="text-sm text-muted-foreground">{t('branchDashboard.selectBranchHint')}</p>
        </div>
      </BackofficeLayout>
    );
  }

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{currentBranch.name}</h1>
                <p className="text-muted-foreground flex items-center gap-2">
                  <span>{currentBranch.code}</span>
                  {currentBranch.country && (
                    <>
                      <span>•</span>
                      <span>{currentBranch.country.name}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            showPresets={true}
            align="end"
          />
        </div>

        {/* Branch Info Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {t('branchDashboard.branchOverview')}
            </CardTitle>
            <CardDescription>{t('branchDashboard.metricsForBranch', { branch: currentBranch.name })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-background">
                <div className="text-2xl font-bold">{stats?.totalShipments ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t('dashboard.totalShipments')}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-background">
                <div className="text-2xl font-bold">{stats?.activeShipments ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t('dashboard.activeShipments')}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-background">
                <div className="text-2xl font-bold text-green-600">{slaComplianceData?.overall ?? 0}%</div>
                <div className="text-xs text-muted-foreground">{t('branchDashboard.slaCompliance')}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-background">
                <div className="text-2xl font-bold text-destructive">{exceptionCounts?.total ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t('dashboard.openExceptions')}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Exceptions Widget */}
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-destructive" />
                {t('dashboard.openExceptions')}
              </CardTitle>
              <CardDescription>{t('branchDashboard.exceptionsInBranch')}</CardDescription>
            </div>
            <Link to="/backoffice/action-required">
              <Button variant="outline" size="sm">
                {t('shipments.viewAll')}
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="flex flex-col items-center p-3 rounded-lg bg-destructive/10">
                <span className="text-2xl font-bold text-destructive">
                  {exceptionCounts?.P1 ?? 0}
                </span>
                <span className="text-xs font-medium text-destructive">P1 Critical</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg bg-orange-500/10">
                <span className="text-2xl font-bold text-orange-600">
                  {exceptionCounts?.P2 ?? 0}
                </span>
                <span className="text-xs font-medium text-orange-600">P2 High</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg bg-yellow-500/10">
                <span className="text-2xl font-bold text-yellow-600">
                  {exceptionCounts?.P3 ?? 0}
                </span>
                <span className="text-xs font-medium text-yellow-600">P3 Medium</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg bg-muted">
                <span className="text-2xl font-bold">
                  {exceptionCounts?.total ?? 0}
                </span>
                <span className="text-xs font-medium text-muted-foreground">{t('common.all')}</span>
              </div>
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
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-amber-500/10">
                  <span className="text-2xl font-bold text-amber-600">
                    {atRiskShipments?.warningCount ?? 0}
                  </span>
                  <span className="text-xs font-medium text-amber-600 flex items-center gap-1">
                    ⚠️ {t('dashboard.warning')}
                  </span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-muted">
                  <span className="text-2xl font-bold">
                    {atRiskShipments?.total ?? 0}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">{t('common.total')}</span>
                </div>
              </div>

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

        {/* Stats Cards */}
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

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Shipments Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.shipmentsOverTime')}</CardTitle>
              <CardDescription>{t('branchDashboard.forThisBranch')}</CardDescription>
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
                        dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Shipments by Status */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.shipmentsByStatus')}</CardTitle>
              <CardDescription>{t('branchDashboard.currentStatusDistribution')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {t('common.loading')}
                  </div>
                ) : stats?.pieData && stats.pieData.length > 0 ? (
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
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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
                    {t('common.noData')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Exception Trends */}
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.exceptionTrends')}</CardTitle>
            <CardDescription>{t('branchDashboard.exceptionTrendsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {exceptionTrends && exceptionTrends.length > 0 ? (
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
                      fillOpacity={0.6}
                      name="P1 Critical"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="P2" 
                      stackId="1"
                      stroke="#f97316" 
                      fill="#f97316"
                      fillOpacity={0.6}
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
                  {t('common.noData')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* SLA Compliance */}
        {slaComplianceData && (
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.slaCompliance')}</CardTitle>
              <CardDescription>{t('branchDashboard.slaComplianceDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <div className={cn(
                    "text-3xl font-bold",
                    slaComplianceData.overall >= 90 ? 'text-green-600' :
                    slaComplianceData.overall >= 70 ? 'text-yellow-600' : 'text-destructive'
                  )}>
                    {slaComplianceData.overall}%
                  </div>
                  <div className="text-sm text-muted-foreground">{t('dashboard.overallCompliance')}</div>
                </div>
                {slaComplianceData.bySeverity.map(item => (
                  <div key={item.severity} className="text-center p-4 rounded-lg bg-muted/50">
                    <div className={cn(
                      "text-2xl font-bold",
                      item.compliancePercent >= 90 ? 'text-green-600' :
                      item.compliancePercent >= 70 ? 'text-yellow-600' : 'text-destructive'
                    )}>
                      {item.compliancePercent}%
                    </div>
                    <div className="text-sm text-muted-foreground">{item.severity}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.withinSLA}/{item.total} {t('branchDashboard.withinTarget')}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Clients by Shipments */}
        {stats?.clientShipmentCounts && stats.clientShipmentCounts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.shipmentsByClient')}</CardTitle>
              <CardDescription>{t('branchDashboard.topClientsInBranch')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.clientShipmentCounts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      tick={{ fontSize: 12 }}
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
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Shipments */}
        {stats?.recentShipments && stats.recentShipments.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t('dashboard.recentShipments')}</CardTitle>
                <CardDescription>{t('branchDashboard.latestShipmentsInBranch')}</CardDescription>
              </div>
              <Link to="/backoffice/shipments">
                <Button variant="outline" size="sm">
                  {t('shipments.viewAll')}
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.recentShipments.map((shipment: any) => (
                  <Link
                    key={shipment.id}
                    to={`/backoffice/shipments/${shipment.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="font-medium">{shipment.shipment_ref}</p>
                      <p className="text-sm text-muted-foreground">{shipment.client?.name}</p>
                    </div>
                    <StatusBadge status={shipment.current_status as ShipmentStatus} />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </BackofficeLayout>
  );
}
