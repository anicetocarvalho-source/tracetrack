import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, TrendingUp, AlertTriangle, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/hooks/useBranch';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const BRANCH_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1', // indigo
];

interface BranchExceptionData {
  branchId: string;
  branchName: string;
  branchCode: string;
  P1: number;
  P2: number;
  P3: number;
  total: number;
  totalShipments: number;
  exceptionRate: number;
}

export function BranchPerformanceComparison() {
  const { t } = useTranslation();
  const { availableBranches } = useBranch();

  const { data: branchData, isLoading } = useQuery({
    queryKey: ['branch-performance-comparison', availableBranches.map(b => b.id)],
    queryFn: async () => {
      if (availableBranches.length === 0) return [];

      const results: BranchExceptionData[] = [];

      for (const branch of availableBranches) {
        // Get shipment IDs for this branch
        const { data: branchShipments } = await supabase
          .from('shipments')
          .select('id')
          .eq('branch_id', branch.id);

        const shipmentIds = branchShipments?.map(s => s.id) || [];
        const totalShipments = shipmentIds.length;

        let exceptionCounts = { P1: 0, P2: 0, P3: 0, total: 0 };

        if (shipmentIds.length > 0) {
          const { data: exceptions } = await supabase
            .from('shipment_exceptions')
            .select('severity')
            .in('status', ['OPEN', 'ACKNOWLEDGED'])
            .in('shipment_id', shipmentIds);

          exceptions?.forEach(ex => {
            exceptionCounts[ex.severity as keyof typeof exceptionCounts]++;
            exceptionCounts.total++;
          });
        }

        results.push({
          branchId: branch.id,
          branchName: branch.name,
          branchCode: branch.code,
          ...exceptionCounts,
          totalShipments,
          exceptionRate: totalShipments > 0 
            ? Math.round((exceptionCounts.total / totalShipments) * 100) 
            : 0,
        });
      }

      return results.sort((a, b) => b.total - a.total);
    },
    enabled: availableBranches.length > 0,
  });

  if (availableBranches.length <= 1) {
    return null; // Don't show if only one branch accessible
  }

  const chartData = branchData?.map(branch => ({
    name: branch.branchCode,
    fullName: branch.branchName,
    P1: branch.P1,
    P2: branch.P2,
    P3: branch.P3,
    total: branch.total,
  })) || [];

  const totalExceptions = branchData?.reduce((sum, b) => sum + b.total, 0) || 0;
  const worstBranch = branchData?.[0];
  const bestBranch = branchData?.[branchData.length - 1];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            {t('branchDashboard.branchComparison', 'Branch Performance Comparison')}
          </CardTitle>
          <CardDescription>
            {t('branchDashboard.exceptionsAcrossBranches', 'Open exceptions across all accessible branches')}
          </CardDescription>
        </div>
        <Link to="/backoffice/branch-comparison">
          <Button variant="outline" size="sm">
            {t('common.viewDetails', 'View Details')}
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold">{totalExceptions}</div>
                <div className="text-xs text-muted-foreground">{t('common.totalExceptions', 'Total Exceptions')}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/10">
                <div className="text-lg font-bold text-destructive truncate" title={worstBranch?.branchName}>
                  {worstBranch?.branchCode || '-'}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {t('branchDashboard.mostExceptions', 'Most Exceptions')} ({worstBranch?.total || 0})
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-500/10">
                <div className="text-lg font-bold text-green-600 truncate" title={bestBranch?.branchName}>
                  {bestBranch?.branchCode || '-'}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {t('branchDashboard.fewestExceptions', 'Fewest Exceptions')} ({bestBranch?.total || 0})
                </div>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={true} vertical={false} />
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
                    width={60}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value, name) => [value, name === 'P1' ? 'P1 Critical' : name === 'P2' ? 'P2 High' : 'P3 Medium']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Legend />
                  <Bar dataKey="P1" stackId="a" fill="#ef4444" name="P1 Critical" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="P2" stackId="a" fill="#f97316" name="P2 High" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="P3" stackId="a" fill="#eab308" name="P3 Medium" radius={[4, 4, 4, 4]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Branch Details Table */}
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                {t('branchDashboard.exceptionBreakdown', 'Exception Breakdown by Branch')}
              </div>
              <div className="grid gap-2">
                {branchData?.map((branch, index) => (
                  <div 
                    key={branch.branchId}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: BRANCH_COLORS[index % BRANCH_COLORS.length] }}
                      />
                      <div>
                        <p className="text-sm font-medium">{branch.branchName}</p>
                        <p className="text-xs text-muted-foreground">
                          {branch.totalShipments} {t('common.shipments', 'shipments')} • {branch.exceptionRate}% {t('branchDashboard.exceptionRate', 'exception rate')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {branch.P1 > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-destructive/20 text-destructive">
                          P1: {branch.P1}
                        </span>
                      )}
                      {branch.P2 > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-orange-500/20 text-orange-600">
                          P2: {branch.P2}
                        </span>
                      )}
                      {branch.P3 > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-500/20 text-yellow-600">
                          P3: {branch.P3}
                        </span>
                      )}
                      {branch.total === 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-500/20 text-green-600">
                          ✓ {t('branchDashboard.noExceptions', 'No exceptions')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
