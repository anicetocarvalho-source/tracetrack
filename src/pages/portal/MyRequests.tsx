import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  Loader2, 
  Package,
  Search,
  Filter,
  AlertCircle,
  ChevronDown
} from 'lucide-react';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { CustomerRequest, RequestStatus, REQUEST_TYPE_LABELS, REQUEST_STATUS_LABELS } from '@/types/documents';
import { formatDistanceToNow, format } from 'date-fns';
import { pt, enUS, fr } from 'date-fns/locale';
import { RequestComments } from '@/components/requests/RequestComments';

const getLocale = (lang: string) => {
  switch (lang) {
    case 'pt': return pt;
    case 'fr': return fr;
    default: return enUS;
  }
};

export default function MyRequests() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const locale = getLocale(i18n.language);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Fetch all requests created by the current user
  const { data: requests, isLoading } = useQuery({
    queryKey: ['my-requests', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('customer_requests')
        .select(`
          *,
          shipment:shipments(
            id,
            shipment_ref,
            client_ref
          )
        `)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Get resolver names if any
      const resolverIds = (data || [])
        .filter(r => r.resolved_by)
        .map(r => r.resolved_by);
      
      let resolverMap: Record<string, string> = {};
      if (resolverIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', resolverIds);
        
        resolverMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.name;
          return acc;
        }, {} as Record<string, string>);
      }
      
      return (data || []).map(r => ({
        ...r,
        resolver: r.resolved_by ? { id: r.resolved_by, name: resolverMap[r.resolved_by] || 'Unknown' } : null,
      })) as CustomerRequest[];
    },
    enabled: !!user,
  });

  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    
    return requests.filter(req => {
      // Status filter
      if (statusFilter !== 'all' && req.status !== statusFilter) return false;
      
      // Type filter
      if (typeFilter !== 'all' && req.request_type !== typeFilter) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesRef = req.shipment?.shipment_ref?.toLowerCase().includes(query);
        const matchesClientRef = req.shipment?.client_ref?.toLowerCase().includes(query);
        const matchesMessage = req.message.toLowerCase().includes(query);
        if (!matchesRef && !matchesClientRef && !matchesMessage) return false;
      }
      
      return true;
    });
  }, [requests, statusFilter, typeFilter, searchQuery]);

  const getStatusIcon = (status: RequestStatus) => {
    switch (status) {
      case 'OPEN':
        return <AlertCircle className="w-4 h-4" />;
      case 'IN_PROGRESS':
        return <Clock className="w-4 h-4" />;
      case 'RESOLVED':
        return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  const getStatusVariant = (status: RequestStatus): 'default' | 'secondary' | 'outline' => {
    switch (status) {
      case 'OPEN':
        return 'default';
      case 'IN_PROGRESS':
        return 'secondary';
      case 'RESOLVED':
        return 'outline';
    }
  };

  const stats = useMemo(() => {
    if (!requests) return { total: 0, open: 0, inProgress: 0, resolved: 0 };
    return {
      total: requests.length,
      open: requests.filter(r => r.status === 'OPEN').length,
      inProgress: requests.filter(r => r.status === 'IN_PROGRESS').length,
      resolved: requests.filter(r => r.status === 'RESOLVED').length,
    };
  }, [requests]);

  return (
    <CustomerLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {t('requests.myRequests')}
            </h1>
            <p className="text-muted-foreground">
              {t('requests.myRequestsDesc')}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">{t('common.all')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <AlertCircle className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.open}</p>
                  <p className="text-xs text-muted-foreground">{t('requests.open')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <Clock className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.inProgress}</p>
                  <p className="text-xs text-muted-foreground">{t('requests.inProgress')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.resolved}</p>
                  <p className="text-xs text-muted-foreground">{t('requests.resolved')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('requests.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder={t('requests.filterByStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('requests.allStatuses')}</SelectItem>
                  <SelectItem value="OPEN">{REQUEST_STATUS_LABELS.OPEN}</SelectItem>
                  <SelectItem value="IN_PROGRESS">{REQUEST_STATUS_LABELS.IN_PROGRESS}</SelectItem>
                  <SelectItem value="RESOLVED">{REQUEST_STATUS_LABELS.RESOLVED}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder={t('requests.filterByType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('requests.allTypes')}</SelectItem>
                  {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Requests List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              {t('requests.requestsList')}
            </CardTitle>
            <CardDescription>
              {t('requests.showingRequests', { 
                count: filteredRequests.length, 
                total: requests?.length || 0 
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {requests?.length === 0 
                    ? t('requests.noRequests')
                    : t('requests.noMatchingRequests')
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((request) => (
                  <Collapsible key={request.id}>
                    <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="font-mono">
                              {REQUEST_TYPE_LABELS[request.request_type]}
                            </Badge>
                            <Badge 
                              variant={getStatusVariant(request.status)}
                              className="flex items-center gap-1"
                            >
                              {getStatusIcon(request.status)}
                              {REQUEST_STATUS_LABELS[request.status]}
                            </Badge>
                          </div>
                          
                          <p className="text-sm text-foreground line-clamp-2">
                            {request.message}
                          </p>
                          
                          {request.shipment && (
                            <Link 
                              to={`/portal/shipments/${request.shipment_id}`}
                              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                            >
                              <Package className="w-3.5 h-3.5" />
                              {request.shipment.shipment_ref}
                              <span className="text-muted-foreground">
                                ({request.shipment.client_ref})
                              </span>
                            </Link>
                          )}
                          
                          {request.status === 'RESOLVED' && request.resolution_note && (
                            <div className="mt-2 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                              <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                                {t('requests.resolution')}
                              </p>
                              <p className="text-sm text-foreground">
                                {request.resolution_note}
                              </p>
                              {request.resolver && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {t('requests.resolvedBy', { name: request.resolver.name })} •{' '}
                                  {request.resolved_at && format(new Date(request.resolved_at), 'PPp', { locale })}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(request.created_at), { 
                              addSuffix: true, 
                              locale 
                            })}
                          </span>
                          <CollapsibleTrigger className="p-1.5 rounded-md hover:bg-muted transition-colors group">
                            <ChevronDown className="w-4 h-4 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" />
                          </CollapsibleTrigger>
                        </div>
                      </div>
                      
                      <CollapsibleContent className="mt-4 pt-4 border-t">
                        <RequestComments 
                          requestId={request.id} 
                          requestStatus={request.status} 
                        />
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
