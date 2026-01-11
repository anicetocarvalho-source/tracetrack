import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Upload, ChevronLeft, ChevronRight, AlertTriangle, CheckSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { SHIPMENT_STATUSES, ShipmentStatus, SEVERITY_LABELS, SEVERITY_CLASSES } from '@/lib/constants';
import { CSVImportDialog } from '@/components/shipments/CSVImportDialog';
import { safeFormatDate } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { DateRangePickerCompact } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { ExceptionSeverity } from '@/lib/constants';

const PAGE_SIZE = 20;

export default function Shipments() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [page, setPage] = useState(0);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState<ShipmentStatus | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['shipments', search, statusFilter, dateRange?.from, dateRange?.to, page],
    queryFn: async () => {
      let query = supabase
        .from('shipments')
        .select(`
          *,
          client:clients(id, name),
          containers:shipment_containers(id, container_number)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('current_status', statusFilter as ShipmentStatus);
      }

      if (search) {
        query = query.or(`shipment_ref.ilike.%${search}%,client_ref.ilike.%${search}%,bl_reference.ilike.%${search}%`);
      }

      if (dateRange?.from) {
        query = query.gte('created_at', format(dateRange.from, 'yyyy-MM-dd'));
      }

      if (dateRange?.to) {
        query = query.lte('created_at', format(dateRange.to, 'yyyy-MM-dd') + 'T23:59:59');
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { shipments: data, totalCount: count || 0 };
    },
  });

  const shipments = data?.shipments || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  // Fetch open exceptions for displayed shipments
  const shipmentIds = shipments.map((s: any) => s.id);
  const { data: exceptions } = useQuery({
    queryKey: ['shipment-exceptions-badges', shipmentIds],
    queryFn: async () => {
      if (shipmentIds.length === 0) return [];
      const { data, error } = await supabase
        .from('shipment_exceptions')
        .select('shipment_id, severity, status')
        .in('shipment_id', shipmentIds)
        .in('status', ['OPEN', 'ACKNOWLEDGED']);
      if (error) throw error;
      return data;
    },
    enabled: shipmentIds.length > 0,
  });

  // Group exceptions by shipment_id with highest severity
  const exceptionsByShipment = (exceptions || []).reduce((acc: Record<string, { count: number; severity: ExceptionSeverity }>, exc) => {
    const id = exc.shipment_id;
    if (!acc[id]) {
      acc[id] = { count: 0, severity: exc.severity as ExceptionSeverity };
    }
    acc[id].count++;
    // P1 > P2 > P3
    if (exc.severity === 'P1' || (exc.severity === 'P2' && acc[id].severity === 'P3')) {
      acc[id].severity = exc.severity as ExceptionSeverity;
    }
    return acc;
  }, {});

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, newStatus }: { ids: string[]; newStatus: ShipmentStatus }) => {
      const { error } = await supabase
        .from('shipments')
        .update({ current_status: newStatus, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_, { ids, newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      toast.success(t('shipments.bulkUpdateSuccess', { count: ids.length, status: t(`status.${newStatus}`) }));
      setSelectedIds(new Set());
      setBulkStatusDialogOpen(false);
      setBulkNewStatus('');
    },
    onError: () => {
      toast.error(t('shipments.bulkUpdateError'));
    },
  });

  // Selection helpers
  const allSelected = shipments.length > 0 && shipments.every((s: any) => selectedIds.has(s.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(shipments.map((s: any) => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkStatusUpdate = () => {
    if (!bulkNewStatus || selectedIds.size === 0) return;
    bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), newStatus: bulkNewStatus });
  };

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t('shipments.title')}</h1>
            <p className="text-muted-foreground">{t('shipments.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="w-4 h-4 mr-2" />
              {t('shipments.importCSV')}
            </Button>
            <Button onClick={() => navigate('/backoffice/shipments/new')}>
              <Plus className="w-4 h-4 mr-2" />
              {t('shipments.newShipment')}
            </Button>
          </div>
        </div>

        <CSVImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} />

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('shipments.searchPlaceholder')}
                  className="pl-10"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <Select 
                value={statusFilter} 
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder={t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {SHIPMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`status.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangePickerCompact
                dateRange={dateRange}
                onDateRangeChange={(range) => {
                  setDateRange(range);
                  setPage(0);
                }}
                placeholder={t('dateRange.selectRange')}
                className="w-full sm:w-auto"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions Bar */}
        {someSelected && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckSquare className="w-5 h-5 text-primary" />
                  <span className="font-medium">
                    {t('shipments.selectedCount', { count: selectedIds.size })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkStatusDialogOpen(true)}
                  >
                    {t('shipments.bulkUpdateStatus')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    <X className="w-4 h-4 mr-1" />
                    {t('common.clear')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label={t('common.selectAll')}
                      />
                    </TableHead>
                    <TableHead>{t('shipments.shipmentRef')}</TableHead>
                    <TableHead>{t('shipments.client')}</TableHead>
                    <TableHead>{t('shipments.shippingLine')}</TableHead>
                    <TableHead>{t('shipments.blReference')}</TableHead>
                    <TableHead>{t('shipments.containers')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('shipments.createdAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        {t('common.loading')}
                      </TableCell>
                    </TableRow>
                  ) : shipments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {t('shipments.noShipments')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    shipments.map((shipment: any) => {
                      const exception = exceptionsByShipment[shipment.id];
                      const isSelected = selectedIds.has(shipment.id);
                      return (
                        <TableRow 
                          key={shipment.id} 
                          className={`cursor-pointer hover:bg-muted/50 ${exception?.severity === 'P1' ? 'bg-destructive/5' : ''} ${isSelected ? 'bg-primary/5' : ''}`}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(shipment.id)}
                              aria-label={t('common.selectRow')}
                            />
                          </TableCell>
                          <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)}>
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="font-medium">{shipment.shipment_ref}</p>
                                <p className="text-sm text-muted-foreground">{shipment.client_ref}</p>
                              </div>
                              {exception && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge className={`${SEVERITY_CLASSES[exception.severity]} flex items-center gap-1`}>
                                        <AlertTriangle className="h-3 w-3" />
                                        {SEVERITY_LABELS[exception.severity]}
                                        {exception.count > 1 && ` (${exception.count})`}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {exception.count} {t('exceptions.openExceptions').toLowerCase()}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                          <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)}>{shipment.client?.name}</TableCell>
                          <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)}>{shipment.shipping_line}</TableCell>
                          <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)} className="font-mono text-sm">{shipment.bl_reference}</TableCell>
                          <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)}>{shipment.containers?.length || 0}</TableCell>
                          <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)}>
                            <StatusBadge status={shipment.current_status} />
                          </TableCell>
                          <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)} className="text-muted-foreground">
                            {safeFormatDate(shipment.created_at, 'MMM d, yyyy')}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-muted-foreground">
                  {t('common.showing')} {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} {t('common.of')} {totalCount}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p - 1)}
                    disabled={!hasPrevPage}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={!hasNextPage}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Status Update Dialog */}
        <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('shipments.bulkUpdateStatusTitle')}</DialogTitle>
              <DialogDescription>
                {t('shipments.bulkUpdateStatusDescription', { count: selectedIds.size })}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Select value={bulkNewStatus} onValueChange={(v) => setBulkNewStatus(v as ShipmentStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('shipments.selectNewStatus')} />
                </SelectTrigger>
                <SelectContent>
                  {SHIPMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`status.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkStatusDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleBulkStatusUpdate}
                disabled={!bulkNewStatus || bulkUpdateMutation.isPending}
              >
                {bulkUpdateMutation.isPending ? t('common.updating') : t('common.update')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
}
