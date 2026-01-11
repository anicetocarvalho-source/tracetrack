import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Filter, X, ChevronLeft, ChevronRight, Eye, Download, CheckSquare, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { safeFormatDate } from '@/lib/utils';
import { DateRangePickerCompact } from '@/components/ui/date-range-picker';
import { toast } from 'sonner';
import type { AuditLog, Profile } from '@/types/database';
import AISuggestionsHistory from '@/components/audit/AISuggestionsHistory';

const ENTITY_TYPES = ['shipment', 'tracking_event', 'client', 'user', 'AUTH', 'EMAIL'];
const PAGE_SIZE = 50;

const AuditLogs = () => {
  const { t } = useTranslation();
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: users = [] } = useQuery({
    queryKey: ['audit-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email')
        .order('name');
      if (error) throw error;
      return data as Profile[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', entityFilter, userFilter, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), page],
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (entityFilter && entityFilter !== 'all') {
        query = query.eq('entity_type', entityFilter);
      }
      if (userFilter && userFilter !== 'all') {
        query = query.eq('actor_user_id', userFilter);
      }
      if (dateRange?.from) {
        query = query.gte('timestamp', format(dateRange.from, "yyyy-MM-dd'T'00:00:00"));
      }
      if (dateRange?.to) {
        query = query.lte('timestamp', format(dateRange.to, "yyyy-MM-dd'T'23:59:59"));
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { logs: data as AuditLog[], totalCount: count || 0 };
    },
  });

  const logs = data?.logs || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  const clearFilters = () => {
    setEntityFilter('all');
    setUserFilter('all');
    setDateRange(undefined);
    setPage(0);
  };

  const hasActiveFilters = entityFilter !== 'all' || userFilter !== 'all' || dateRange?.from;

  const getUserName = (userId: string | null) => {
    if (!userId) return t('common.system');
    const user = users.find((u) => u.id === userId);
    return user?.name || user?.email || t('common.unknown');
  };

  const getActionBadgeVariant = (action: string) => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('create')) return 'default';
    if (actionLower.includes('update')) return 'secondary';
    if (actionLower.includes('delete')) return 'destructive';
    if (actionLower.includes('success')) return 'default';
    if (actionLower.includes('fail')) return 'destructive';
    if (actionLower.includes('sent')) return 'outline';
    return 'outline';
  };

  const getEntityBadgeVariant = (entity: string) => {
    switch (entity.toLowerCase()) {
      case 'shipment':
        return 'default';
      case 'tracking_event':
        return 'secondary';
      case 'client':
        return 'outline';
      case 'auth':
        return 'secondary';
      case 'email':
        return 'outline';
      case 'permission':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  // Selection helpers
  const allSelected = logs.length > 0 && logs.every((log) => selectedIds.has(log.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(logs.map((log) => log.id)));
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

  // Get selected logs for export
  const selectedLogs = useMemo(() => {
    return logs.filter((log) => selectedIds.has(log.id));
  }, [logs, selectedIds]);

  // Export functions
  const exportToCSV = () => {
    const logsToExport = selectedLogs.length > 0 ? selectedLogs : logs;
    
    if (logsToExport.length === 0) {
      toast.error(t('auditLogs.noLogsToExport'));
      return;
    }

    const headers = ['Timestamp', 'Entity Type', 'Action', 'User', 'Entity ID', 'IP Address', 'Metadata'];
    const rows = logsToExport.map((log) => [
      safeFormatDate(log.timestamp, 'yyyy-MM-dd HH:mm:ss'),
      log.entity_type,
      log.action,
      getUserName(log.actor_user_id),
      log.entity_id || '',
      log.ip_address || '',
      log.metadata_json ? JSON.stringify(log.metadata_json) : '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(t('auditLogs.exportSuccess', { count: logsToExport.length }));
  };

  const exportToJSON = () => {
    const logsToExport = selectedLogs.length > 0 ? selectedLogs : logs;
    
    if (logsToExport.length === 0) {
      toast.error(t('auditLogs.noLogsToExport'));
      return;
    }

    const exportData = logsToExport.map((log) => ({
      timestamp: log.timestamp,
      entity_type: log.entity_type,
      action: log.action,
      user: getUserName(log.actor_user_id),
      entity_id: log.entity_id,
      ip_address: log.ip_address,
      metadata: log.metadata_json,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(t('auditLogs.exportSuccess', { count: logsToExport.length }));
  };

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('auditLogs.title')}</h1>
            <p className="text-muted-foreground">{t('auditLogs.subtitle')}</p>
          </div>
        </div>

        <Tabs defaultValue="all" className="space-y-6">
          <TabsList>
            <TabsTrigger value="all" className="gap-2">
              <FileText className="h-4 w-4" />
              {t('auditLogs.allLogs')}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Brain className="h-4 w-4" />
              {t('auditLogs.aiHistory')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-0">
            <AISuggestionsHistory />
          </TabsContent>

          <TabsContent value="all" className="space-y-6">
            {/* Export buttons */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="w-4 h-4 mr-2" />
                {t('auditLogs.exportCSV')}
              </Button>
              <Button variant="outline" onClick={exportToJSON}>
                <Download className="w-4 h-4 mr-2" />
                {t('auditLogs.exportJSON')}
              </Button>
            </div>

        {/* Filters */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{t('common.filters')}</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
                <X className="h-4 w-4 mr-1" />
                {t('common.clear')}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>{t('auditLogs.entityType')}</Label>
              <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('auditLogs.allEntities')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('auditLogs.allEntities')}</SelectItem>
                  {ENTITY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('auditLogs.user')}</Label>
              <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('auditLogs.allUsers')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('auditLogs.allUsers')}</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>{t('dateRange.selectRange')}</Label>
              <DateRangePickerCompact
                dateRange={dateRange}
                onDateRangeChange={(range) => { setDateRange(range); setPage(0); }}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {someSelected && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckSquare className="w-5 h-5 text-primary" />
                  <span className="font-medium">
                    {t('auditLogs.selectedCount', { count: selectedIds.size })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToCSV}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    {t('auditLogs.exportSelectedCSV')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToJSON}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    {t('auditLogs.exportSelectedJSON')}
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

        {/* Logs Table */}
        <div className="rounded-lg border bg-card">
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
                <TableHead>{t('auditLogs.timestamp')}</TableHead>
                <TableHead>{t('auditLogs.entity')}</TableHead>
                <TableHead>{t('auditLogs.action')}</TableHead>
                <TableHead>{t('auditLogs.user')}</TableHead>
                <TableHead>{t('auditLogs.entityId')}</TableHead>
                <TableHead className="w-[80px]">{t('common.details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-5 w-5 animate-pulse" />
                      <span>{t('auditLogs.loadingLogs')}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('auditLogs.noLogsFound')}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const isSelected = selectedIds.has(log.id);
                  return (
                    <TableRow key={log.id} className={isSelected ? 'bg-primary/5' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(log.id)}
                          aria-label={t('common.selectRow')}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {safeFormatDate(log.timestamp, 'MMM dd, yyyy HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getEntityBadgeVariant(log.entity_type)}>
                          {log.entity_type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {log.action.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{getUserName(log.actor_user_id)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.entity_id ? log.entity_id.slice(0, 8) + '...' : '-'}
                      </TableCell>
                      <TableCell>
                        {log.metadata_json && Object.keys(log.metadata_json).length > 0 && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          
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
        </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('common.details')}</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('auditLogs.timestamp')}</p>
                  <p className="font-mono">{safeFormatDate(selectedLog.timestamp, 'PPpp')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('auditLogs.user')}</p>
                  <p>{getUserName(selectedLog.actor_user_id)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('auditLogs.entity')}</p>
                  <Badge variant={getEntityBadgeVariant(selectedLog.entity_type)}>
                    {selectedLog.entity_type}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('auditLogs.action')}</p>
                  <Badge variant={getActionBadgeVariant(selectedLog.action)}>
                    {selectedLog.action}
                  </Badge>
                </div>
                {selectedLog.entity_id && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">{t('auditLogs.entityId')}</p>
                    <p className="font-mono text-xs">{selectedLog.entity_id}</p>
                  </div>
                )}
                {selectedLog.ip_address && (
                  <div>
                    <p className="text-muted-foreground">IP</p>
                    <p className="font-mono text-xs">{selectedLog.ip_address}</p>
                  </div>
                )}
              </div>
              {selectedLog.metadata_json && Object.keys(selectedLog.metadata_json).length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2">Metadata</p>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
                    {JSON.stringify(selectedLog.metadata_json, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
};

export default AuditLogs;
