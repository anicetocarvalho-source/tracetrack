import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Upload, ChevronLeft, ChevronRight, AlertTriangle, CheckSquare, X, Package, Clock, TruckIcon, CheckCircle2, AlertCircle, Filter, LayoutGrid, List, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { BulkBranchTransferDialog } from '@/components/shipments/BulkBranchTransferDialog';
import { safeFormatDate } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { DateRangePickerCompact } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { ExceptionSeverity } from '@/lib/constants';
import { Toggle } from '@/components/ui/toggle';

const PAGE_SIZE = 20;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

export default function Shipments() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkTransferDialogOpen, setBulkTransferDialogOpen] = useState(false);
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

  // Fetch stats for quick overview
  const { data: stats } = useQuery({
    queryKey: ['shipments-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipments')
        .select('current_status');
      if (error) throw error;
      
      const total = data.length;
      const inTransit = data.filter(s => s.current_status === 'IN_TRANSIT').length;
      const delivered = data.filter(s => s.current_status === 'DELIVERED').length;
      const pending = data.filter(s => ['RECEIVED', 'REGISTERED', 'DOCS_VALIDATION', 'PROCESSING'].includes(s.current_status)).length;
      const issues = data.filter(s => ['ON_HOLD_INCIDENT', 'CANCELLED'].includes(s.current_status)).length;
      
      return { total, inTransit, delivered, pending, issues };
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
      queryClient.invalidateQueries({ queryKey: ['shipments-stats'] });
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

  const statsCards = [
    {
      label: t('shipments.totalShipments'),
      value: stats?.total || 0,
      icon: Package,
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-500/20',
    },
    {
      label: t('shipments.inTransit'),
      value: stats?.inTransit || 0,
      icon: TruckIcon,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-500/20',
    },
    {
      label: t('shipments.delivered'),
      value: stats?.delivered || 0,
      icon: CheckCircle2,
      color: 'bg-green-500/10 text-green-600 dark:text-green-400',
      iconBg: 'bg-green-500/20',
    },
    {
      label: t('shipments.pending'),
      value: stats?.pending || 0,
      icon: Clock,
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-500/20',
    },
    {
      label: t('shipments.issues'),
      value: stats?.issues || 0,
      icon: AlertCircle,
      color: 'bg-red-500/10 text-red-600 dark:text-red-400',
      iconBg: 'bg-red-500/20',
    },
  ];

  return (
    <BackofficeLayout>
      <motion.div 
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div 
          variants={itemVariants}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('shipments.title')}</h1>
            <p className="text-muted-foreground mt-1">{t('shipments.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(true)} className="gap-2">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">{t('shipments.importCSV')}</span>
            </Button>
            <Button onClick={() => navigate('/backoffice/shipments/new')} className="gap-2">
              <Plus className="w-4 h-4" />
              {t('shipments.newShipment')}
            </Button>
          </div>
        </motion.div>

        <CSVImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} />

        {/* Stats Cards */}
        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
        >
          {statsCards.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className={`${stat.color} border-0 hover:shadow-md transition-all duration-300 cursor-pointer group`}
                onClick={() => {
                  if (stat.label === t('shipments.inTransit')) {
                    setStatusFilter('IN_TRANSIT');
                  } else if (stat.label === t('shipments.delivered')) {
                    setStatusFilter('DELIVERED');
                  } else if (stat.label === t('shipments.issues')) {
                    setStatusFilter('ON_HOLD_INCIDENT');
                  } else {
                    setStatusFilter('all');
                  }
                  setPage(0);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium opacity-80">{stat.label}</p>
                      <p className="text-2xl font-bold mt-1 group-hover:scale-105 transition-transform">
                        {stat.value}
                      </p>
                    </div>
                    <div className={`${stat.iconBg} p-3 rounded-xl`}>
                      <stat.icon className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Search and Filters */}
        <motion.div variants={itemVariants}>
          <Card className="border-muted/50">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                {/* Main Search Row */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder={t('shipments.searchPlaceholder')}
                      className="pl-10 h-10"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowFilters(!showFilters)}
                      className={showFilters ? 'bg-muted' : ''}
                    >
                      <Filter className="w-4 h-4 mr-2" />
                      {t('common.filters')}
                      {(statusFilter !== 'all' || dateRange) && (
                        <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                          {(statusFilter !== 'all' ? 1 : 0) + (dateRange ? 1 : 0)}
                        </Badge>
                      )}
                    </Button>
                    <div className="flex border rounded-md">
                      <Toggle
                        pressed={viewMode === 'table'}
                        onPressedChange={() => setViewMode('table')}
                        className="rounded-r-none border-r"
                        aria-label="Table view"
                      >
                        <List className="w-4 h-4" />
                      </Toggle>
                      <Toggle
                        pressed={viewMode === 'cards'}
                        onPressedChange={() => setViewMode('cards')}
                        className="rounded-l-none"
                        aria-label="Card view"
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </Toggle>
                    </div>
                  </div>
                </div>

                {/* Expandable Filters */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t">
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
                        {(statusFilter !== 'all' || dateRange) && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setStatusFilter('all');
                              setDateRange(undefined);
                              setPage(0);
                            }}
                          >
                            <X className="w-4 h-4 mr-1" />
                            {t('common.clearFilters')}
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Bulk Actions Bar */}
        <AnimatePresence>
          {someSelected && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-lg">
                        <CheckSquare className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-medium">
                        {t('shipments.selectedCount', { count: selectedIds.size })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setBulkStatusDialogOpen(true)}
                      >
                        {t('shipments.bulkUpdateStatus')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkTransferDialogOpen(true)}
                        className="gap-1.5"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                        {t('shipments.bulkTransferBranch')}
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content - Table or Cards View */}
        <motion.div variants={itemVariants}>
          {viewMode === 'table' ? (
            <Card className="border-muted/50 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-12">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label={t('common.selectAll')}
                        />
                      </TableHead>
                      <TableHead className="font-semibold">{t('shipments.shipmentRef')}</TableHead>
                      <TableHead className="font-semibold">{t('shipments.client')}</TableHead>
                      <TableHead className="font-semibold">{t('shipments.shippingLine')}</TableHead>
                      <TableHead className="font-semibold">{t('shipments.blReference')}</TableHead>
                      <TableHead className="font-semibold">{t('shipments.containers')}</TableHead>
                      <TableHead className="font-semibold">{t('common.status')}</TableHead>
                      <TableHead className="font-semibold">{t('shipments.createdAt')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <span className="text-muted-foreground">{t('common.loading')}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : shipments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12">
                          <div className="flex flex-col items-center gap-3">
                            <Package className="w-12 h-12 text-muted-foreground/50" />
                            <p className="text-muted-foreground">{t('shipments.noShipments')}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      shipments.map((shipment: any, index: number) => {
                        const exception = exceptionsByShipment[shipment.id];
                        const isSelected = selectedIds.has(shipment.id);
                        return (
                          <motion.tr 
                            key={shipment.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.02 }}
                            className={`cursor-pointer hover:bg-muted/50 transition-colors ${exception?.severity === 'P1' ? 'bg-destructive/5' : ''} ${isSelected ? 'bg-primary/5' : ''}`}
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
                                  <p className="font-semibold text-foreground">{shipment.shipment_ref}</p>
                                  <p className="text-sm text-muted-foreground">{shipment.client_ref}</p>
                                </div>
                                {exception && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge className={`${SEVERITY_CLASSES[exception.severity]} flex items-center gap-1 animate-pulse`}>
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
                            <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)} className="font-medium">
                              {shipment.client?.name}
                            </TableCell>
                            <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)}>
                              {shipment.shipping_line}
                            </TableCell>
                            <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)} className="font-mono text-sm">
                              {shipment.bl_reference}
                            </TableCell>
                            <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)}>
                              <Badge variant="outline" className="font-medium">
                                {shipment.containers?.length || 0}
                              </Badge>
                            </TableCell>
                            <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)}>
                              <StatusBadge status={shipment.current_status} />
                            </TableCell>
                            <TableCell onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)} className="text-muted-foreground">
                              {safeFormatDate(shipment.created_at, 'MMM d, yyyy')}
                            </TableCell>
                          </motion.tr>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                  <span className="text-sm text-muted-foreground">
                    {t('common.showing')} <span className="font-medium text-foreground">{page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)}</span> {t('common.of')} <span className="font-medium text-foreground">{totalCount}</span>
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
                    <span className="text-sm font-medium px-2">
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
            </Card>
          ) : (
            /* Cards View */
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-muted-foreground mt-3">{t('common.loading')}</span>
                </div>
              ) : shipments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Package className="w-12 h-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground mt-3">{t('shipments.noShipments')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {shipments.map((shipment: any, index: number) => {
                    const exception = exceptionsByShipment[shipment.id];
                    const isSelected = selectedIds.has(shipment.id);
                    return (
                      <motion.div
                        key={shipment.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                      >
                        <Card 
                          className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${exception?.severity === 'P1' ? 'border-destructive/50 bg-destructive/5' : ''} ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
                          onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelect(shipment.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={t('common.selectRow')}
                                />
                                <div>
                                  <p className="font-semibold">{shipment.shipment_ref}</p>
                                  <p className="text-sm text-muted-foreground">{shipment.client_ref}</p>
                                </div>
                              </div>
                              <StatusBadge status={shipment.current_status} />
                            </div>

                            {exception && (
                              <Badge className={`${SEVERITY_CLASSES[exception.severity]} flex items-center gap-1 w-fit mb-3 animate-pulse`}>
                                <AlertTriangle className="h-3 w-3" />
                                {SEVERITY_LABELS[exception.severity]} - {exception.count} {t('exceptions.openExceptions').toLowerCase()}
                              </Badge>
                            )}

                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('shipments.client')}</span>
                                <span className="font-medium">{shipment.client?.name}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('shipments.shippingLine')}</span>
                                <span>{shipment.shipping_line}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('shipments.containers')}</span>
                                <Badge variant="outline">{shipment.containers?.length || 0}</Badge>
                              </div>
                              <div className="flex justify-between pt-2 border-t">
                                <span className="text-muted-foreground">{t('shipments.createdAt')}</span>
                                <span className="text-muted-foreground">{safeFormatDate(shipment.created_at, 'MMM d, yyyy')}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Pagination for Cards View */}
              {totalPages > 1 && (
                <Card className="border-muted/50">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t('common.showing')} <span className="font-medium text-foreground">{page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)}</span> {t('common.of')} <span className="font-medium text-foreground">{totalCount}</span>
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
                        <span className="text-sm font-medium px-2">
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
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </motion.div>

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

        {/* Bulk Branch Transfer Dialog */}
        <BulkBranchTransferDialog
          open={bulkTransferDialogOpen}
          onOpenChange={setBulkTransferDialogOpen}
          shipmentIds={Array.from(selectedIds)}
          onSuccess={() => setSelectedIds(new Set())}
        />
      </motion.div>
    </BackofficeLayout>
  );
}
