import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Building2, 
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Package,
  Target,
  X
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { useTranslation } from 'react-i18next';
import { useBranch } from '@/hooks/useBranch';
import { useCountry } from '@/hooks/useCountry';
import { useAuth } from '@/hooks/useAuth';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval, isWithinInterval, endOfDay, differenceInHours } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Branch } from '@/types/database';

const BRANCH_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

interface BranchMetrics {
  branchId: string;
  branchName: string;
  branchCode: string;
  countryName: string;
  totalShipments: number;
  activeShipments: number;
  deliveredShipments: number;
  onHoldShipments: number;
  deliveryRate: number;
  openExceptions: number;
  p1Exceptions: number;
  p2Exceptions: number;
  p3Exceptions: number;
  slaCompliance: number;
  avgResolutionHours: number;
}

export default function BranchComparison() {
  const { t } = useTranslation();
  const { availableBranches } = useBranch();
  const { currentCountry } = useCountry();
  const { role } = useAuth();
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  const isAdmin = role === 'ADMIN';
  const isCountryAdmin = role === 'COUNTRY_ADMIN';

  // Filter branches by selected country for ADMIN and COUNTRY_ADMIN roles
  const filteredBranches = useMemo(() => {
    if ((isAdmin || isCountryAdmin) && currentCountry) {
      return availableBranches.filter(branch => branch.country_id === currentCountry.id);
    }
    return availableBranches;
  }, [availableBranches, currentCountry, isAdmin, isCountryAdmin]);

  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds(prev => 
      prev.includes(branchId)
        ? prev.filter(id => id !== branchId)
        : [...prev, branchId]
    );
  };

  const selectAllBranches = () => {
    setSelectedBranchIds(filteredBranches.map(b => b.id));
  };

  const clearAllBranches = () => {
    setSelectedBranchIds([]);
  };

  // Clear selected branches when country changes
  useMemo(() => {
    const validBranchIds = filteredBranches.map(b => b.id);
    const invalidSelections = selectedBranchIds.filter(id => !validBranchIds.includes(id));
    if (invalidSelections.length > 0) {
      setSelectedBranchIds(prev => prev.filter(id => validBranchIds.includes(id)));
    }
  }, [filteredBranches]);

  // Fetch metrics for all selected branches
  const { data: branchMetrics, isLoading } = useQuery({
    queryKey: ['branch-comparison-metrics', selectedBranchIds, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), currentCountry?.id],
    queryFn: async (): Promise<BranchMetrics[]> => {
      if (selectedBranchIds.length === 0) return [];

      const metrics: BranchMetrics[] = [];

      for (const branchId of selectedBranchIds) {
        const branch = filteredBranches.find(b => b.id === branchId);
        if (!branch) continue;

        // Fetch shipments for this branch
        const { data: allShipments } = await supabase
          .from('shipments')
          .select('id, current_status, created_at')
          .eq('branch_id', branchId);

        const shipments = dateRange?.from && dateRange?.to
          ? allShipments?.filter(s => {
              const createdDate = new Date(s.created_at);
              return isWithinInterval(createdDate, {
                start: startOfDay(dateRange.from!),
                end: endOfDay(dateRange.to!),
              });
            })
          : allShipments;

        const totalShipments = shipments?.length || 0;
        const activeShipments = shipments?.filter(s => 
          !['DELIVERED', 'CANCELLED'].includes(s.current_status)
        ).length || 0;
        const deliveredShipments = shipments?.filter(s => s.current_status === 'DELIVERED').length || 0;
        const onHoldShipments = shipments?.filter(s => s.current_status === 'ON_HOLD_INCIDENT').length || 0;
        const deliveryRate = totalShipments > 0 ? Math.round((deliveredShipments / totalShipments) * 100) : 0;

        // Fetch exceptions for this branch
        const shipmentIds = shipments?.map(s => s.id) || [];
        
        let openExceptions = 0;
        let p1Exceptions = 0;
        let p2Exceptions = 0;
        let p3Exceptions = 0;

        if (shipmentIds.length > 0) {
          const { data: exceptions } = await supabase
            .from('shipment_exceptions')
            .select('severity, status')
            .in('shipment_id', shipmentIds)
            .in('status', ['OPEN', 'ACKNOWLEDGED']);

          exceptions?.forEach(ex => {
            openExceptions++;
            if (ex.severity === 'P1') p1Exceptions++;
            else if (ex.severity === 'P2') p2Exceptions++;
            else if (ex.severity === 'P3') p3Exceptions++;
          });
        }

        // Calculate SLA compliance
        let slaCompliance = 0;
        let avgResolutionHours = 0;

        if (shipmentIds.length > 0) {
          const { data: resolvedExceptions } = await supabase
            .from('shipment_exceptions')
            .select('severity, detected_at, resolved_at')
            .in('shipment_id', shipmentIds)
            .eq('status', 'RESOLVED')
            .not('resolved_at', 'is', null);

          if (resolvedExceptions && resolvedExceptions.length > 0) {
            // Simple SLA calculation (assuming 24h target for all)
            const withinSLA = resolvedExceptions.filter(ex => {
              const hours = differenceInHours(new Date(ex.resolved_at!), new Date(ex.detected_at));
              return hours <= 24;
            }).length;
            slaCompliance = Math.round((withinSLA / resolvedExceptions.length) * 100);

            const totalHours = resolvedExceptions.reduce((sum, ex) => {
              return sum + differenceInHours(new Date(ex.resolved_at!), new Date(ex.detected_at));
            }, 0);
            avgResolutionHours = Math.round(totalHours / resolvedExceptions.length);
          }
        }

        metrics.push({
          branchId,
          branchName: branch.name,
          branchCode: branch.code,
          countryName: branch.country?.name || 'Unknown',
          totalShipments,
          activeShipments,
          deliveredShipments,
          onHoldShipments,
          deliveryRate,
          openExceptions,
          p1Exceptions,
          p2Exceptions,
          p3Exceptions,
          slaCompliance,
          avgResolutionHours,
        });
      }

      return metrics;
    },
    enabled: selectedBranchIds.length > 0,
  });

  // Prepare chart data
  const volumeChartData = useMemo(() => {
    return branchMetrics?.map((m, idx) => ({
      name: m.branchCode,
      total: m.totalShipments,
      active: m.activeShipments,
      delivered: m.deliveredShipments,
      onHold: m.onHoldShipments,
      fill: BRANCH_COLORS[idx % BRANCH_COLORS.length],
    })) || [];
  }, [branchMetrics]);

  const exceptionChartData = useMemo(() => {
    return branchMetrics?.map((m, idx) => ({
      name: m.branchCode,
      P1: m.p1Exceptions,
      P2: m.p2Exceptions,
      P3: m.p3Exceptions,
      total: m.openExceptions,
      fill: BRANCH_COLORS[idx % BRANCH_COLORS.length],
    })) || [];
  }, [branchMetrics]);

  const performanceRadarData = useMemo(() => {
    if (!branchMetrics || branchMetrics.length === 0) return [];
    
    // Normalize values for radar chart
    const maxVolume = Math.max(...branchMetrics.map(m => m.totalShipments), 1);
    
    return [
      {
        metric: t('branchComparison.deliveryRate'),
        ...Object.fromEntries(branchMetrics.map(m => [m.branchCode, m.deliveryRate])),
      },
      {
        metric: t('branchComparison.slaCompliance'),
        ...Object.fromEntries(branchMetrics.map(m => [m.branchCode, m.slaCompliance])),
      },
      {
        metric: t('branchComparison.volume'),
        ...Object.fromEntries(branchMetrics.map(m => [m.branchCode, Math.round((m.totalShipments / maxVolume) * 100)])),
      },
      {
        metric: t('branchComparison.efficiency'),
        ...Object.fromEntries(branchMetrics.map(m => [m.branchCode, m.avgResolutionHours > 0 ? Math.max(0, 100 - m.avgResolutionHours) : 100])),
      },
    ];
  }, [branchMetrics, t]);

  const comparisonTableData = useMemo(() => {
    return branchMetrics?.sort((a, b) => b.totalShipments - a.totalShipments) || [];
  }, [branchMetrics]);

  const getBestInCategory = (category: keyof BranchMetrics, higherIsBetter = true) => {
    if (!branchMetrics || branchMetrics.length === 0) return null;
    return branchMetrics.reduce((best, current) => {
      const bestValue = best[category] as number;
      const currentValue = current[category] as number;
      if (higherIsBetter) {
        return currentValue > bestValue ? current : best;
      }
      return currentValue < bestValue ? current : best;
    });
  };

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{t('branchComparison.title')}</h1>
                <p className="text-muted-foreground">{t('branchComparison.subtitle')}</p>
              </div>
            </div>
          </div>

          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            showPresets={true}
            align="end"
          />
        </div>

        {/* Branch Selection */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  {t('branchComparison.selectBranches')}
                </CardTitle>
                <CardDescription>{t('branchComparison.selectBranchesDesc')}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllBranches}>
                  {t('branchComparison.selectAll')}
                </Button>
                <Button variant="outline" size="sm" onClick={clearAllBranches}>
                  {t('branchComparison.clearAll')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {filteredBranches.map((branch, idx) => (
                <div
                  key={branch.id}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                    selectedBranchIds.includes(branch.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => toggleBranch(branch.id)}
                >
                  <Checkbox
                    checked={selectedBranchIds.includes(branch.id)}
                    onCheckedChange={() => toggleBranch(branch.id)}
                  />
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: BRANCH_COLORS[idx % BRANCH_COLORS.length] }}
                  />
                  <div>
                    <p className="font-medium text-sm">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">{branch.code} • {branch.country?.name}</p>
                  </div>
                </div>
              ))}
            </div>

            {selectedBranchIds.length > 0 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">{t('branchComparison.comparing')}:</span>
                {selectedBranchIds.map((id, idx) => {
                  const branch = filteredBranches.find(b => b.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: BRANCH_COLORS[idx % BRANCH_COLORS.length] }}
                      />
                      {branch?.code}
                      <X
                        className="w-3 h-3 cursor-pointer hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBranch(id);
                        }}
                      />
                    </Badge>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedBranchIds.length === 0 ? (
          <Card className="py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">{t('branchComparison.noBranchesSelected')}</p>
              <p className="text-muted-foreground">{t('branchComparison.selectBranchesToCompare')}</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card className="py-12">
            <CardContent className="flex items-center justify-center">
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Top Performers */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    {t('branchComparison.highestVolume')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{getBestInCategory('totalShipments')?.branchCode}</p>
                  <p className="text-sm text-muted-foreground">
                    {getBestInCategory('totalShipments')?.totalShipments} {t('branchComparison.shipments')}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {t('branchComparison.bestDeliveryRate')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{getBestInCategory('deliveryRate')?.branchCode}</p>
                  <p className="text-sm text-muted-foreground">
                    {getBestInCategory('deliveryRate')?.deliveryRate}% {t('branchComparison.delivered')}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    {t('branchComparison.bestSLACompliance')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{getBestInCategory('slaCompliance')?.branchCode}</p>
                  <p className="text-sm text-muted-foreground">
                    {getBestInCategory('slaCompliance')?.slaCompliance}% {t('branchComparison.compliance')}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {t('branchComparison.fewestExceptions')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{getBestInCategory('openExceptions', false)?.branchCode}</p>
                  <p className="text-sm text-muted-foreground">
                    {getBestInCategory('openExceptions', false)?.openExceptions} {t('branchComparison.openIssues')}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Shipment Volume Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('branchComparison.shipmentVolume')}</CardTitle>
                  <CardDescription>{t('branchComparison.shipmentVolumeDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={volumeChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend />
                        <Bar dataKey="delivered" stackId="a" fill="#22c55e" name={t('branchComparison.delivered')} />
                        <Bar dataKey="active" stackId="a" fill="#3b82f6" name={t('branchComparison.active')} />
                        <Bar dataKey="onHold" stackId="a" fill="#ef4444" name={t('branchComparison.onHold')} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Exception Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('branchComparison.exceptionComparison')}</CardTitle>
                  <CardDescription>{t('branchComparison.exceptionComparisonDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={exceptionChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend />
                        <Bar dataKey="P1" stackId="a" fill="#ef4444" name="P1 Critical" />
                        <Bar dataKey="P2" stackId="a" fill="#f97316" name="P2 High" />
                        <Bar dataKey="P3" stackId="a" fill="#eab308" name="P3 Medium" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Performance Radar */}
            {branchMetrics && branchMetrics.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('branchComparison.performanceRadar')}</CardTitle>
                  <CardDescription>{t('branchComparison.performanceRadarDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={performanceRadarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} />
                        {branchMetrics.map((m, idx) => (
                          <Radar
                            key={m.branchId}
                            name={m.branchCode}
                            dataKey={m.branchCode}
                            stroke={BRANCH_COLORS[idx % BRANCH_COLORS.length]}
                            fill={BRANCH_COLORS[idx % BRANCH_COLORS.length]}
                            fillOpacity={0.2}
                          />
                        ))}
                        <Legend />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Detailed Comparison Table */}
            <Card>
              <CardHeader>
                <CardTitle>{t('branchComparison.detailedComparison')}</CardTitle>
                <CardDescription>{t('branchComparison.detailedComparisonDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">{t('branchComparison.branch')}</th>
                        <th className="text-left py-3 px-4 font-medium">{t('branchComparison.country')}</th>
                        <th className="text-right py-3 px-4 font-medium">{t('branchComparison.totalShipments')}</th>
                        <th className="text-right py-3 px-4 font-medium">{t('branchComparison.active')}</th>
                        <th className="text-right py-3 px-4 font-medium">{t('branchComparison.deliveryRate')}</th>
                        <th className="text-right py-3 px-4 font-medium">{t('branchComparison.openExceptions')}</th>
                        <th className="text-right py-3 px-4 font-medium">{t('branchComparison.slaCompliance')}</th>
                        <th className="text-right py-3 px-4 font-medium">{t('branchComparison.avgResolution')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonTableData.map((m, idx) => (
                        <tr key={m.branchId} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: BRANCH_COLORS[selectedBranchIds.indexOf(m.branchId) % BRANCH_COLORS.length] }}
                              />
                              <span className="font-medium">{m.branchName}</span>
                              <span className="text-muted-foreground">({m.branchCode})</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{m.countryName}</td>
                          <td className="py-3 px-4 text-right font-medium">{m.totalShipments}</td>
                          <td className="py-3 px-4 text-right">{m.activeShipments}</td>
                          <td className="py-3 px-4 text-right">
                            <span className={cn(
                              "font-medium",
                              m.deliveryRate >= 80 ? 'text-green-600' :
                              m.deliveryRate >= 60 ? 'text-yellow-600' : 'text-destructive'
                            )}>
                              {m.deliveryRate}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={cn(
                              m.openExceptions > 10 ? 'text-destructive font-medium' :
                              m.openExceptions > 5 ? 'text-yellow-600' : ''
                            )}>
                              {m.openExceptions}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={cn(
                              "font-medium",
                              m.slaCompliance >= 90 ? 'text-green-600' :
                              m.slaCompliance >= 70 ? 'text-yellow-600' : 'text-destructive'
                            )}>
                              {m.slaCompliance}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-muted-foreground">
                            {m.avgResolutionHours}h
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </BackofficeLayout>
  );
}
