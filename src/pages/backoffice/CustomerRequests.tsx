import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';
import {
  MessageSquare,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Filter,
  X,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  MessageCircle,
} from 'lucide-react';
import { useUnreadComments } from '@/hooks/useUnreadComments';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { DateRangePickerCompact } from '@/components/ui/date-range-picker';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCountry } from '@/hooks/useCountry';
import { supabase } from '@/integrations/supabase/client';
import { RequestComments } from '@/components/requests/RequestComments';
import {
  CustomerRequest,
  REQUEST_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  RequestType,
  RequestStatus,
} from '@/types/documents';

export default function CustomerRequests() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, role, isAdmin, isCountryAdmin } = useAuth();
  const { currentCountry } = useCountry();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get branch IDs for the selected country
  const { data: countryBranchIds = [] } = useQuery({
    queryKey: ['country-branches', currentCountry?.id],
    queryFn: async () => {
      if (!currentCountry) return [];
      const { data, error } = await supabase
        .from('branches')
        .select('id')
        .eq('country_id', currentCountry.id)
        .eq('is_active', true);
      if (error) throw error;
      return data.map(b => b.id);
    },
    enabled: !!currentCountry && (isAdmin || isCountryAdmin),
  });

  const shouldFilterByCountry = (isAdmin || isCountryAdmin) && currentCountry && countryBranchIds.length > 0;

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [clientFilter, setClientFilter] = useState<string>('ALL');
  const [requestTypeFilter, setRequestTypeFilter] = useState<string>('ALL');
  const [shipmentRefSearch, setShipmentRefSearch] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [resolveDialog, setResolveDialog] = useState<{
    open: boolean;
    request: CustomerRequest | null;
  }>({ open: false, request: null });
  const [resolutionNote, setResolutionNote] = useState('');

  const canResolve = role === 'SUPERVISOR' || role === 'MANAGER';

  type ClientOption = { id: string; name: string };
  
  // Fetch clients for the filter dropdown (filtered by country)
  const { data: clients } = useQuery<ClientOption[]>({
    queryKey: ['clients-filter', currentCountry?.id, countryBranchIds],
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('id, name, branch_id')
        .order('name');
      
      if (shouldFilterByCountry) {
        query = query.in('branch_id', countryBranchIds);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ClientOption[];
    },
  });

  const { data: requests, isLoading } = useQuery({
    queryKey: ['all-customer-requests', statusFilter, currentCountry?.id, countryBranchIds],
    queryFn: async () => {
      const baseQuery = supabase
        .from('customer_requests')
        .select(`
          *,
          shipment:shipments(
            shipment_ref,
            client_ref,
            client_id,
            branch_id,
            client:clients(id, name, branch_id)
          )
        `)
        .order('created_at', { ascending: false });

      const { data, error } = statusFilter === 'ALL' 
        ? await baseQuery
        : await baseQuery.eq('status', statusFilter as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED');
      if (error) throw error;

      // Filter by country (branch) if applicable
      let filtered = data || [];
      if (shouldFilterByCountry) {
        filtered = filtered.filter((r: any) => 
          r.shipment?.branch_id && countryBranchIds.includes(r.shipment.branch_id)
        );
      }

      // Fetch user names
      const userIds = [
        ...new Set([
          ...data?.map((r) => r.created_by) || [],
          ...data?.map((r) => r.resolved_by).filter(Boolean) || [],
        ]),
      ] as string[];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return filtered?.map((r) => ({
        ...r,
        creator: profileMap.get(r.created_by) || null,
        resolver: r.resolved_by ? profileMap.get(r.resolved_by) || null : null,
      })) as unknown as CustomerRequest[];
    },
  });

  // Get request IDs for unread comments tracking
  const requestIds = useMemo(() => 
    (requests || []).map(r => r.id), 
    [requests]
  );

  // Track unread comments
  const { getUnreadCount, markAsRead, totalUnread } = useUnreadComments(requestIds);

  // Track which collapsibles are open to mark as read
  const [openRequests, setOpenRequests] = useState<Set<string>>(new Set());

  const handleCollapsibleChange = (requestId: string, isOpen: boolean) => {
    setOpenRequests(prev => {
      const next = new Set(prev);
      if (isOpen) {
        next.add(requestId);
        // Mark comments as read when opening
        markAsRead(requestId);
      } else {
        next.delete(requestId);
      }
      return next;
    });
  };

  // Filter requests based on client, request type, date range, and shipment reference
  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    
    return requests.filter((request) => {
      // Client filter
      if (clientFilter !== 'ALL' && request.shipment?.client_id !== clientFilter) {
        return false;
      }
      
      // Request type filter
      if (requestTypeFilter !== 'ALL' && request.request_type !== requestTypeFilter) {
        return false;
      }
      
      // Date range filter
      if (dateRange?.from) {
        const requestDate = new Date(request.created_at);
        const fromDate = startOfDay(dateRange.from);
        const toDate = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
        
        if (!isWithinInterval(requestDate, { start: fromDate, end: toDate })) {
          return false;
        }
      }
      
      // Shipment reference search
      if (shipmentRefSearch.trim()) {
        const searchTerm = shipmentRefSearch.toLowerCase().trim();
        const shipmentRef = request.shipment?.shipment_ref?.toLowerCase() || '';
        const clientRef = request.shipment?.client_ref?.toLowerCase() || '';
        if (!shipmentRef.includes(searchTerm) && !clientRef.includes(searchTerm)) {
          return false;
        }
      }
      
      return true;
    });
  }, [requests, clientFilter, requestTypeFilter, dateRange, shipmentRefSearch]);

  const hasActiveFilters = clientFilter !== 'ALL' || requestTypeFilter !== 'ALL' || shipmentRefSearch.trim() !== '' || dateRange !== undefined;

  // Pagination calculations
  const totalItems = filteredRequests.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedRequests = filteredRequests.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleFilterChange = (filterSetter: (value: string) => void, value: string) => {
    filterSetter(value);
    setCurrentPage(1);
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setStatusFilter('ALL');
    setClientFilter('ALL');
    setRequestTypeFilter('ALL');
    setShipmentRefSearch('');
    setDateRange(undefined);
    setCurrentPage(1);
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      requestId,
      status,
      note,
    }: {
      requestId: string;
      status: RequestStatus;
      note?: string;
    }) => {
      const updateData: Record<string, unknown> = { status };

      if (status === 'RESOLVED') {
        updateData.resolved_by = user?.id;
        updateData.resolved_at = new Date().toISOString();
        updateData.resolution_note = note;
      }

      const { error } = await supabase
        .from('customer_requests')
        .update(updateData)
        .eq('id', requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-customer-requests'] });
      toast({ title: t('requests.statusUpdated') });
      setResolveDialog({ open: false, request: null });
      setResolutionNote('');
    },
    onError: () => {
      toast({ title: t('requests.updateError'), variant: 'destructive' });
    },
  });

  const getStatusIcon = (status: RequestStatus) => {
    switch (status) {
      case 'OPEN':
        return <AlertCircle className="w-4 h-4" />;
      case 'IN_PROGRESS':
        return <Clock className="w-4 h-4" />;
      case 'RESOLVED':
        return <CheckCircle className="w-4 h-4" />;
    }
  };

  const getStatusClass = (status: RequestStatus) => {
    switch (status) {
      case 'OPEN':
        return 'border-destructive text-destructive bg-destructive/10';
      case 'IN_PROGRESS':
        return 'border-yellow-500 text-yellow-600 bg-yellow-50';
      case 'RESOLVED':
        return 'border-green-500 text-green-600 bg-green-50';
    }
  };

  const openRequestsCount = filteredRequests?.filter((r) => r.status === 'OPEN').length || 0;
  const inProgressRequestsCount = filteredRequests?.filter((r) => r.status === 'IN_PROGRESS').length || 0;

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t('requests.title')}</h1>
            <p className="text-muted-foreground">{t('requests.description')}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <Badge variant="destructive">{openRequestsCount} {t('requests.open')}</Badge>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                {inProgressRequestsCount} {t('requests.inProgress')}
              </Badge>
              {totalUnread > 0 && (
                <Badge variant="outline" className="border-primary text-primary bg-primary/10">
                  <MessageCircle className="w-3 h-3 mr-1" />
                  {totalUnread} {t('requests.unreadComments')}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <Filter className="w-4 h-4 text-muted-foreground" />
              
              {/* Status filter */}
              <Select value={statusFilter} onValueChange={(v) => handleFilterChange(setStatusFilter, v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('requests.filterByStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('requests.allStatuses')}</SelectItem>
                  <SelectItem value="OPEN">{REQUEST_STATUS_LABELS.OPEN}</SelectItem>
                  <SelectItem value="IN_PROGRESS">{REQUEST_STATUS_LABELS.IN_PROGRESS}</SelectItem>
                  <SelectItem value="RESOLVED">{REQUEST_STATUS_LABELS.RESOLVED}</SelectItem>
                </SelectContent>
              </Select>

              {/* Client filter */}
              <Select value={clientFilter} onValueChange={(v) => handleFilterChange(setClientFilter, v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('requests.filterByClient')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('requests.allClients')}</SelectItem>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Request type filter */}
              <Select value={requestTypeFilter} onValueChange={(v) => handleFilterChange(setRequestTypeFilter, v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('requests.filterByType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('requests.allTypes')}</SelectItem>
                  {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Shipment reference search */}
              <div className="relative">
                <Input
                  placeholder={t('requests.searchShipmentRef')}
                  value={shipmentRefSearch}
                  onChange={(e) => {
                    setShipmentRefSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-56"
                />
                {shipmentRefSearch && (
                  <button
                    onClick={() => setShipmentRefSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Date range filter */}
              <DateRangePickerCompact
                dateRange={dateRange}
                onDateRangeChange={handleDateRangeChange}
                placeholder={t('requests.filterByDate')}
                className="w-64"
              />

              {/* Clear all filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                  <X className="w-4 h-4 mr-1" />
                  {t('requests.clearFilters')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Request List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              {t('requests.inbox')}
            </CardTitle>
            {totalItems > 0 && (
              <span className="text-sm text-muted-foreground font-normal">
                {t('common.showing')} {startIndex + 1}-{endIndex} {t('common.of')} {totalItems}
              </span>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : !filteredRequests || filteredRequests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{hasActiveFilters ? t('requests.noMatchingRequests') : t('requests.noRequestsInbox')}</p>
                {hasActiveFilters && (
                  <Button variant="link" onClick={clearAllFilters} className="mt-2">
                    {t('requests.clearFilters')}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedRequests.map((request) => {
                    const unreadCount = getUnreadCount(request.id);
                    return (
                      <Collapsible 
                        key={request.id}
                        open={openRequests.has(request.id)}
                        onOpenChange={(isOpen) => handleCollapsibleChange(request.id, isOpen)}
                      >
                        <div className={`p-4 border rounded-lg hover:bg-muted/50 transition-colors ${unreadCount > 0 ? 'border-primary/50 bg-primary/5' : ''}`}>
                          <div className="flex items-start gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                <Badge variant="secondary">
                                  {REQUEST_TYPE_LABELS[request.request_type as RequestType]}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={getStatusClass(request.status as RequestStatus)}
                                >
                                  {getStatusIcon(request.status as RequestStatus)}
                                  <span className="ml-1">
                                    {REQUEST_STATUS_LABELS[request.status as RequestStatus]}
                                  </span>
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(request.created_at), {
                                    addSuffix: true,
                                  })}
                                </span>
                              </div>

                              <div className="mb-2">
                                <button
                                  className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                                  onClick={() =>
                                    navigate(`/backoffice/shipments/${request.shipment_id}`)
                                  }
                                >
                                  {request.shipment?.shipment_ref}
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                                <p className="text-xs text-muted-foreground">
                                  {request.shipment?.client?.name} • {request.creator?.name}
                                </p>
                              </div>

                              <p className="text-sm line-clamp-2">{request.message}</p>

                              {request.status === 'RESOLVED' && request.resolution_note && (
                                <div className="p-2 bg-muted rounded mt-2">
                                  <p className="text-xs text-muted-foreground">
                                    {t('requests.resolution')}: {request.resolution_note}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-1 flex-shrink-0">
                              {request.status === 'OPEN' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    updateStatusMutation.mutate({
                                      requestId: request.id,
                                      status: 'IN_PROGRESS',
                                    })
                                  }
                                  disabled={updateStatusMutation.isPending}
                                >
                                  <Clock className="w-3 h-3 mr-1" />
                                  {t('requests.startProgress')}
                                </Button>
                              )}
                              {request.status !== 'RESOLVED' && canResolve && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setResolveDialog({ open: true, request });
                                    setResolutionNote('');
                                  }}
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {t('requests.resolve')}
                                </Button>
                              )}
                              <CollapsibleTrigger asChild>
                                <Button size="sm" variant="ghost" className="gap-1 relative">
                                  <MessageCircle className="w-3 h-3" />
                                  {t('requests.comments')}
                                  {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                                      {unreadCount}
                                    </span>
                                  )}
                                  <ChevronDown className="w-3 h-3 transition-transform group-data-[state=open]:rotate-180" />
                                </Button>
                              </CollapsibleTrigger>
                            </div>
                          </div>
                          
                          <CollapsibleContent className="mt-4 pt-4 border-t">
                            <RequestComments 
                              requestId={request.id} 
                              requestStatus={request.status as RequestStatus}
                              shipmentRef={request.shipment?.shipment_ref}
                              clientName={request.shipment?.client?.name}
                              requestType={request.request_type}
                            />
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t mt-4">
                    <div className="text-sm text-muted-foreground">
                      {t('common.showing')} {startIndex + 1}-{endIndex} {t('common.of')} {totalItems}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <div className="flex items-center gap-1 px-2">
                        <span className="text-sm font-medium">{currentPage}</span>
                        <span className="text-sm text-muted-foreground">/</span>
                        <span className="text-sm text-muted-foreground">{totalPages}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resolve Dialog */}
      <Dialog
        open={resolveDialog.open}
        onOpenChange={(open) =>
          setResolveDialog({ open, request: open ? resolveDialog.request : null })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('requests.resolveRequest')}</DialogTitle>
            <DialogDescription>
              {resolveDialog.request?.shipment?.shipment_ref}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">
                {REQUEST_TYPE_LABELS[resolveDialog.request?.request_type as RequestType]}
              </p>
              <p className="text-sm">{resolveDialog.request?.message}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolution">{t('requests.resolutionNote')}</Label>
              <Textarea
                id="resolution"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder={t('requests.resolutionPlaceholder')}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveDialog({ open: false, request: null })}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() =>
                resolveDialog.request &&
                updateStatusMutation.mutate({
                  requestId: resolveDialog.request.id,
                  status: 'RESOLVED',
                  note: resolutionNote.trim(),
                })
              }
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              {t('requests.resolve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
