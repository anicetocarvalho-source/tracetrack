import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Grid3X3, RefreshCw, Info, ExternalLink, Radio } from 'lucide-react';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { SHIPMENT_STATUSES, ShipmentStatus } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useRealtimeSLA } from '@/hooks/useRealtimeSLA';
import { DateRangePickerCompact } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';

interface ShipmentSLAData {
  shipment_id: string;
  shipment_ref: string;
  shipment_status: ShipmentStatus;
  entered_at: string;
  max_hours: number;
  percentUsed: number;
  remainingMinutes: number;
  breached: boolean;
}

interface HeatmapCell {
  status: ShipmentStatus;
  level: string;
  count: number;
  shipments: ShipmentSLAData[];
  color: string;
}

const SLA_LEVELS = [
  { id: 'safe', label: '0-50%', min: 0, max: 50, color: 'bg-green-500/80' },
  { id: 'moderate', label: '50-75%', min: 50, max: 75, color: 'bg-yellow-400/80' },
  { id: 'warning', label: '75-90%', min: 75, max: 90, color: 'bg-orange-500/80' },
  { id: 'critical', label: '90-100%', min: 90, max: 100, color: 'bg-red-500/80' },
  { id: 'breached', label: 'Breached', min: 100, max: Infinity, color: 'bg-red-900/90' },
];

// Filter to only active statuses (exclude terminal states)
const ACTIVE_STATUSES = SHIPMENT_STATUSES.filter(
  s => !['DELIVERED', 'CANCELLED'].includes(s)
);

export default function SLAHeatmap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Enable realtime updates for the heatmap
  useRealtimeSLA({ showToasts: true });

  const { data: slaData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sla-heatmap-data', dateRange?.from, dateRange?.to],
    queryFn: async () => {
      let query = supabase
        .from('shipment_sla')
        .select(`
          id,
          shipment_id,
          shipment_status,
          entered_at,
          breached,
          sla_config:sla_config(max_hours),
          shipment:shipments(shipment_ref, current_status)
        `)
        .is('exited_at', null);

      // Apply date filters
      if (dateRange?.from) {
        query = query.gte('entered_at', format(dateRange.from, 'yyyy-MM-dd'));
      }
      if (dateRange?.to) {
        query = query.lte('entered_at', format(dateRange.to, 'yyyy-MM-dd') + 'T23:59:59');
      }

      const { data: slaRecords, error } = await query;

      if (error) throw error;

      const now = Date.now();
      const processedData: ShipmentSLAData[] = [];

      for (const record of slaRecords || []) {
        const maxHours = record.sla_config?.max_hours;
        if (!maxHours) continue;

        const enteredAt = new Date(record.entered_at).getTime();
        const elapsedMs = now - enteredAt;
        const totalMs = maxHours * 60 * 60 * 1000;
        const percentUsed = (elapsedMs / totalMs) * 100;
        const remainingMs = totalMs - elapsedMs;
        const remainingMinutes = Math.floor(remainingMs / (60 * 1000));

        processedData.push({
          shipment_id: record.shipment_id,
          shipment_ref: (record.shipment as any)?.shipment_ref || 'Unknown',
          shipment_status: record.shipment_status,
          entered_at: record.entered_at,
          max_hours: maxHours,
          percentUsed,
          remainingMinutes,
          breached: record.breached || percentUsed >= 100,
        });
      }

      return processedData;
    },
    refetchInterval: 60000,
  });

  const heatmapData = useMemo(() => {
    if (!slaData) return [];

    const cells: HeatmapCell[] = [];

    for (const status of ACTIVE_STATUSES) {
      for (const level of SLA_LEVELS) {
        const shipments = slaData.filter(s => {
          if (s.shipment_status !== status) return false;
          if (level.id === 'breached') return s.breached || s.percentUsed >= 100;
          return s.percentUsed >= level.min && s.percentUsed < level.max && !s.breached;
        });

        cells.push({
          status,
          level: level.id,
          count: shipments.length,
          shipments,
          color: level.color,
        });
      }
    }

    return cells;
  }, [slaData]);

  const getCell = (status: ShipmentStatus, levelId: string) => {
    return heatmapData.find(c => c.status === status && c.level === levelId);
  };

  const totalShipments = slaData?.length || 0;
  const criticalCount = slaData?.filter(s => s.percentUsed >= 90 && !s.breached).length || 0;
  const breachedCount = slaData?.filter(s => s.breached || s.percentUsed >= 100).length || 0;

  const handleCellClick = (cell: HeatmapCell) => {
    if (cell.count > 0) {
      setSelectedCell(cell);
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Grid3X3 className="w-6 h-6" />
              {t('slaHeatmap.title')}
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              {t('slaHeatmap.subtitle')}
              <Badge variant="outline" className="text-xs gap-1">
                <Radio className="w-3 h-3 text-green-500 animate-pulse" />
                {t('realtime.live')}
              </Badge>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangePickerCompact
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              placeholder={t('dateRange.selectRange')}
            />
            <Button 
              variant="outline" 
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{totalShipments}</div>
              <p className="text-xs text-muted-foreground">{t('slaHeatmap.activeShipments')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {slaData?.filter(s => s.percentUsed < 75).length || 0}
              </div>
              <p className="text-xs text-muted-foreground">{t('slaHeatmap.onTrack')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-orange-600">{criticalCount}</div>
              <p className="text-xs text-muted-foreground">{t('slaHeatmap.critical')}</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{breachedCount}</div>
              <p className="text-xs text-muted-foreground">{t('slaHeatmap.breached')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Heatmap Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t('slaHeatmap.heatmapTitle')}
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-4 h-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{t('slaHeatmap.heatmapTooltip')}</p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <CardDescription>{t('slaHeatmap.heatmapDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <div className="grid gap-2" style={{ gridTemplateColumns: `120px repeat(${ACTIVE_STATUSES.length}, 1fr)` }}>
                  {Array.from({ length: 5 * (ACTIVE_STATUSES.length + 1) }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div 
                  className="grid gap-1 min-w-[800px]"
                  style={{ gridTemplateColumns: `100px repeat(${ACTIVE_STATUSES.length}, minmax(80px, 1fr))` }}
                >
                  {/* Header row */}
                  <div className="p-2 text-xs font-medium text-muted-foreground" />
                  {ACTIVE_STATUSES.map(status => (
                    <div 
                      key={status} 
                      className="p-2 text-xs font-medium text-center truncate"
                      title={formatStatus(status)}
                    >
                      {formatStatus(status)}
                    </div>
                  ))}

                  {/* Data rows */}
                  {SLA_LEVELS.map(level => (
                    <>
                      <div 
                        key={`label-${level.id}`}
                        className="p-2 text-xs font-medium flex items-center"
                      >
                        <Badge 
                          variant="outline" 
                          className={cn("text-xs", level.color, "text-white border-0")}
                        >
                          {level.label}
                        </Badge>
                      </div>
                      {ACTIVE_STATUSES.map(status => {
                        const cell = getCell(status, level.id);
                        const hasData = cell && cell.count > 0;
                        
                        return (
                          <button
                            key={`${status}-${level.id}`}
                            onClick={() => cell && handleCellClick(cell)}
                            disabled={!hasData}
                            className={cn(
                              "p-3 rounded-md transition-all text-center min-h-[60px] flex flex-col items-center justify-center",
                              hasData 
                                ? cn(
                                    level.color,
                                    "text-white font-bold cursor-pointer hover:scale-105 hover:shadow-lg"
                                  )
                                : "bg-muted/30 text-muted-foreground/50",
                              !hasData && "cursor-default"
                            )}
                          >
                            <span className="text-lg">{cell?.count || 0}</span>
                            {hasData && (
                              <span className="text-[10px] opacity-80">
                                {t('slaHeatmap.shipments', { count: cell.count })}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </>
                  ))}
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-4 justify-center border-t pt-4">
              {SLA_LEVELS.map(level => (
                <div key={level.id} className="flex items-center gap-2">
                  <div className={cn("w-4 h-4 rounded", level.color)} />
                  <span className="text-xs text-muted-foreground">{level.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Shipment List Dialog */}
        <Dialog open={!!selectedCell} onOpenChange={() => setSelectedCell(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Badge className={cn(selectedCell?.color, "text-white border-0")}>
                  {SLA_LEVELS.find(l => l.id === selectedCell?.level)?.label}
                </Badge>
                {formatStatus(selectedCell?.status || '')}
              </DialogTitle>
              <DialogDescription>
                {t('slaHeatmap.shipmentsInCategory', { count: selectedCell?.count || 0 })}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {selectedCell?.shipments.map(shipment => (
                  <div
                    key={shipment.shipment_id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{shipment.shipment_ref}</p>
                      <p className="text-sm text-muted-foreground">
                        {shipment.breached 
                          ? t('slaHeatmap.breachedBy', { minutes: Math.abs(shipment.remainingMinutes) })
                          : t('slaHeatmap.remainingTime', { minutes: shipment.remainingMinutes })
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={cn(
                          "text-sm font-medium",
                          shipment.percentUsed >= 100 ? "text-red-600" :
                          shipment.percentUsed >= 90 ? "text-orange-600" :
                          shipment.percentUsed >= 75 ? "text-yellow-600" :
                          "text-green-600"
                        )}>
                          {Math.round(shipment.percentUsed)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {shipment.max_hours}h SLA
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedCell(null);
                          navigate(`/backoffice/shipments/${shipment.shipment_id}`);
                        }}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
}
