import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  Filter,
} from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
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
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [resolveDialog, setResolveDialog] = useState<{
    open: boolean;
    request: CustomerRequest | null;
  }>({ open: false, request: null });
  const [resolutionNote, setResolutionNote] = useState('');

  const canResolve = role === 'SUPERVISOR' || role === 'MANAGER';

  const { data: requests, isLoading } = useQuery({
    queryKey: ['all-customer-requests', statusFilter],
    queryFn: async () => {
      const baseQuery = supabase
        .from('customer_requests')
        .select(`
          *,
          shipment:shipments(
            shipment_ref,
            client_ref,
            client:clients(name)
          )
        `)
        .order('created_at', { ascending: false });

      const { data, error } = statusFilter === 'ALL' 
        ? await baseQuery
        : await baseQuery.eq('status', statusFilter as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED');
      if (error) throw error;

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

      return data?.map((r) => ({
        ...r,
        creator: profileMap.get(r.created_by) || null,
        resolver: r.resolved_by ? profileMap.get(r.resolved_by) || null : null,
      })) as CustomerRequest[];
    },
  });

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

  const openRequests = requests?.filter((r) => r.status === 'OPEN').length || 0;
  const inProgressRequests = requests?.filter((r) => r.status === 'IN_PROGRESS').length || 0;

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
              <Badge variant="destructive">{openRequests} {t('requests.open')}</Badge>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                {inProgressRequests} {t('requests.inProgress')}
              </Badge>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('requests.allStatuses')}</SelectItem>
                  <SelectItem value="OPEN">{REQUEST_STATUS_LABELS.OPEN}</SelectItem>
                  <SelectItem value="IN_PROGRESS">{REQUEST_STATUS_LABELS.IN_PROGRESS}</SelectItem>
                  <SelectItem value="RESOLVED">{REQUEST_STATUS_LABELS.RESOLVED}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Request List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              {t('requests.inbox')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : !requests || requests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{t('requests.noRequestsInbox')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
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
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
