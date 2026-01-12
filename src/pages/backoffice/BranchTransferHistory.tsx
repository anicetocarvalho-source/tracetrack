import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { 
  ArrowRightLeft, 
  Search, 
  Filter, 
  X, 
  Building2, 
  User, 
  Calendar,
  Globe,
  Package,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangePickerCompact } from '@/components/ui/date-range-picker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { DateRange } from 'react-day-picker';

const PAGE_SIZE = 20;

interface TransferRecord {
  id: string;
  timestamp: string;
  action: string;
  actor_user_id: string | null;
  entity_id: string | null;
  metadata_json: {
    shipment_ref?: string;
    from_branch_id?: string;
    from_branch_name?: string;
    from_branch_code?: string;
    from_country?: string;
    to_branch_id?: string;
    to_branch_name?: string;
    to_branch_code?: string;
    to_country?: string;
    transfer_reason?: string;
    transferred_by?: string;
    transferred_at?: string;
    cross_country?: boolean;
    bulk_transfer?: boolean;
    total_in_batch?: number;
  };
  actor?: { name: string; email: string } | null;
}

export default function BranchTransferHistory() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [sourceBranchFilter, setSourceBranchFilter] = useState<string>('all');
  const [targetBranchFilter, setTargetBranchFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);

  // Fetch branches for filters
  const { data: branches = [] } = useQuery({
    queryKey: ['all-branches-for-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, code')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch transfer history from audit_log
  const { data, isLoading } = useQuery({
    queryKey: ['branch-transfer-history', search, dateRange, sourceBranchFilter, targetBranchFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .in('action', ['BRANCH_TRANSFER', 'BULK_BRANCH_TRANSFER'])
        .order('timestamp', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (dateRange?.from) {
        query = query.gte('timestamp', format(dateRange.from, 'yyyy-MM-dd'));
      }
      if (dateRange?.to) {
        query = query.lte('timestamp', format(dateRange.to, 'yyyy-MM-dd') + 'T23:59:59');
      }

      const { data: transfers, error, count } = await query;
      if (error) throw error;

      // Filter in JS for JSON fields (source/target branch and search)
      let filtered = (transfers || []) as TransferRecord[];

      if (sourceBranchFilter && sourceBranchFilter !== 'all') {
        filtered = filtered.filter(t => t.metadata_json?.from_branch_id === sourceBranchFilter);
      }

      if (targetBranchFilter && targetBranchFilter !== 'all') {
        filtered = filtered.filter(t => t.metadata_json?.to_branch_id === targetBranchFilter);
      }

      if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(t => 
          t.metadata_json?.shipment_ref?.toLowerCase().includes(searchLower) ||
          t.metadata_json?.transfer_reason?.toLowerCase().includes(searchLower) ||
          t.metadata_json?.from_branch_name?.toLowerCase().includes(searchLower) ||
          t.metadata_json?.to_branch_name?.toLowerCase().includes(searchLower) ||
          t.metadata_json?.transferred_by?.toLowerCase().includes(searchLower)
        );
      }

      // Fetch actor profiles
      const actorIds = [...new Set(filtered.map(t => t.actor_user_id).filter(Boolean))];
      let actorProfiles: Record<string, { name: string; email: string }> = {};
      
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', actorIds);
        
        if (profiles) {
          actorProfiles = profiles.reduce((acc, p) => {
            acc[p.id] = { name: p.name, email: p.email };
            return acc;
          }, {} as Record<string, { name: string; email: string }>);
        }
      }

      // Attach actor info
      const enriched = filtered.map(t => ({
        ...t,
        actor: t.actor_user_id ? actorProfiles[t.actor_user_id] : null,
      }));

      return { 
        transfers: enriched, 
        totalCount: count || 0,
        filteredCount: enriched.length 
      };
    },
  });

  const transfers = data?.transfers || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  // Stats
  const totalTransfers = transfers.length;
  const crossCountryTransfers = transfers.filter(t => t.metadata_json?.cross_country).length;
  const bulkTransfers = transfers.filter(t => t.metadata_json?.bulk_transfer).length;

  const hasActiveFilters = sourceBranchFilter !== 'all' || targetBranchFilter !== 'all' || dateRange;

  return (
    <BackofficeLayout>
      <motion.div 
        className="space-y-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <ArrowRightLeft className="w-8 h-8 text-primary" />
              {t('transferHistory.title')}
            </h1>
            <p className="text-muted-foreground mt-1">{t('transferHistory.subtitle')}</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{t('transferHistory.totalTransfers')}</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalTransfers}</p>
                </div>
                <div className="bg-blue-500/20 p-3 rounded-xl">
                  <ArrowRightLeft className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-500/10 border-amber-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">{t('transferHistory.crossCountry')}</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{crossCountryTransfers}</p>
                </div>
                <div className="bg-amber-500/20 p-3 rounded-xl">
                  <Globe className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-purple-500/10 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600 dark:text-purple-400">{t('transferHistory.bulkTransfers')}</p>
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{bulkTransfers}</p>
                </div>
                <div className="bg-purple-500/20 p-3 rounded-xl">
                  <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="border-muted/50">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={t('transferHistory.searchPlaceholder')}
                    className="pl-10 h-10"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                  />
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => setShowFilters(!showFilters)}
                  className={showFilters ? 'bg-muted' : ''}
                >
                  <Filter className="w-4 h-4 mr-2" />
                  {t('common.filters')}
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                      {(sourceBranchFilter !== 'all' ? 1 : 0) + (targetBranchFilter !== 'all' ? 1 : 0) + (dateRange ? 1 : 0)}
                    </Badge>
                  )}
                </Button>
              </div>

              {showFilters && (
                <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t">
                  <Select value={sourceBranchFilter} onValueChange={(v) => { setSourceBranchFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder={t('transferHistory.sourceBranch')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('transferHistory.allSourceBranches')}</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={targetBranchFilter} onValueChange={(v) => { setTargetBranchFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder={t('transferHistory.targetBranch')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('transferHistory.allTargetBranches')}</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <DateRangePickerCompact
                    dateRange={dateRange}
                    onDateRangeChange={(range) => { setDateRange(range); setPage(0); }}
                    placeholder={t('dateRange.selectRange')}
                    className="w-full sm:w-auto"
                  />

                  {hasActiveFilters && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setSourceBranchFilter('all');
                        setTargetBranchFilter('all');
                        setDateRange(undefined);
                        setPage(0);
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      {t('common.clearFilters')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Transfer History Table */}
        <Card className="border-muted/50 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="font-semibold">{t('transferHistory.date')}</TableHead>
                  <TableHead className="font-semibold">{t('transferHistory.shipment')}</TableHead>
                  <TableHead className="font-semibold">{t('transferHistory.fromBranch')}</TableHead>
                  <TableHead className="font-semibold">{t('transferHistory.toBranch')}</TableHead>
                  <TableHead className="font-semibold">{t('transferHistory.reason')}</TableHead>
                  <TableHead className="font-semibold">{t('transferHistory.transferredBy')}</TableHead>
                  <TableHead className="font-semibold">{t('transferHistory.type')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-muted-foreground">{t('common.loading')}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : transfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <ArrowRightLeft className="w-12 h-12 text-muted-foreground/50" />
                        <p className="text-muted-foreground">{t('transferHistory.noTransfers')}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  transfers.map((transfer) => (
                    <TableRow key={transfer.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{format(new Date(transfer.timestamp), 'MMM d, yyyy')}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(transfer.timestamp), 'HH:mm')}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-muted-foreground" />
                          <span className="font-mono text-sm">{transfer.metadata_json?.shipment_ref || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{transfer.metadata_json?.from_branch_name || '-'}</p>
                            <p className="text-xs text-muted-foreground">{transfer.metadata_json?.from_country}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-primary" />
                          <div>
                            <p className="font-medium">{transfer.metadata_json?.to_branch_name || '-'}</p>
                            <p className="text-xs text-muted-foreground">{transfer.metadata_json?.to_country}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-start gap-2 max-w-[200px]">
                                <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                <p className="text-sm truncate">{transfer.metadata_json?.transfer_reason || '-'}</p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[300px]">
                              <p>{transfer.metadata_json?.transfer_reason}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{transfer.actor?.name || transfer.metadata_json?.transferred_by || '-'}</p>
                            {transfer.actor?.email && (
                              <p className="text-xs text-muted-foreground">{transfer.actor.email}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {transfer.metadata_json?.bulk_transfer && (
                            <Badge variant="secondary" className="text-xs w-fit">
                              {t('transferHistory.bulk')} ({transfer.metadata_json?.total_in_batch})
                            </Badge>
                          )}
                          {transfer.metadata_json?.cross_country && (
                            <Badge variant="outline" className="text-xs w-fit border-amber-500 text-amber-600">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {t('transferHistory.crossCountryBadge')}
                            </Badge>
                          )}
                          {!transfer.metadata_json?.bulk_transfer && !transfer.metadata_json?.cross_country && (
                            <Badge variant="outline" className="text-xs w-fit">
                              {t('transferHistory.single')}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalCount > 0 && (
            <CardContent className="border-t py-3">
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
                    {page + 1} / {totalPages || 1}
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
          )}
        </Card>
      </motion.div>
    </BackofficeLayout>
  );
}
