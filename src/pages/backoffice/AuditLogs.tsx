import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { FileText, Filter, X, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { safeFormatDate } from '@/lib/utils';
import { DateRangePickerCompact } from '@/components/ui/date-range-picker';
import type { AuditLog, Profile } from '@/types/database';

const ENTITY_TYPES = ['shipment', 'tracking_event', 'client', 'user', 'AUTH', 'EMAIL'];
const PAGE_SIZE = 50;

const AuditLogs = () => {
  const { t } = useTranslation();
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

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

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('auditLogs.title')}</h1>
          <p className="text-muted-foreground">{t('auditLogs.subtitle')}</p>
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

        {/* Logs Table */}
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-5 w-5 animate-pulse" />
                      <span>{t('auditLogs.loadingLogs')}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {t('auditLogs.noLogsFound')}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
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
                ))
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
