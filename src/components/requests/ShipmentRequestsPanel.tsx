import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  CustomerRequest,
  REQUEST_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  RequestStatus,
} from '@/types/documents';

interface ShipmentRequestsPanelProps {
  shipmentId: string;
}

export function ShipmentRequestsPanel({ shipmentId }: ShipmentRequestsPanelProps) {
  const { t } = useTranslation();
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [resolveDialog, setResolveDialog] = useState<{ open: boolean; request: CustomerRequest | null }>({
    open: false,
    request: null,
  });
  const [resolutionNote, setResolutionNote] = useState('');

  const canManage = role === 'SUPERVISOR' || role === 'MANAGER' || role === 'TECHNICIAN';

  const { data: requests, isLoading } = useQuery({
    queryKey: ['customer-requests', shipmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_requests')
        .select('*')
        .eq('shipment_id', shipmentId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch creator/resolver names
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
        creator: profileMap.get(r.created_by),
        resolver: r.resolved_by ? profileMap.get(r.resolved_by) : null,
      })) as (CustomerRequest & { creator?: { name: string }; resolver?: { name: string } | null })[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: RequestStatus }) => {
      const { error } = await supabase
        .from('customer_requests')
        .update({ status })
        .eq('id', requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-requests', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['all-customer-requests'] });
      toast({ title: t('requests.statusUpdated') });
    },
    onError: () => {
      toast({ title: t('requests.updateError'), variant: 'destructive' });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ requestId, note, request }: { requestId: string; note: string; request: CustomerRequest }) => {
      const { error } = await supabase
        .from('customer_requests')
        .update({
          status: 'RESOLVED' as RequestStatus,
          resolved_by: user?.id,
          resolved_at: new Date().toISOString(),
          resolution_note: note,
        })
        .eq('id', requestId);

      if (error) throw error;

      // Fetch shipment and customer info for email notification
      try {
        const { data: shipmentData } = await supabase
          .from('shipments')
          .select('shipment_ref, client_id')
          .eq('id', shipmentId)
          .single();

        if (shipmentData) {
          // Fetch customer email (the creator of the request)
          const { data: creatorProfile } = await supabase
            .from('profiles')
            .select('email, name')
            .eq('id', request.created_by)
            .single();

          if (creatorProfile?.email) {
            // Send email notification
            await supabase.functions.invoke('notify-request-resolved', {
              body: {
                request_id: requestId,
                shipment_ref: shipmentData.shipment_ref,
                request_type: request.request_type,
                original_message: request.message,
                resolution_note: note,
                resolved_by_name: profile?.name || 'Operations Team',
                customer_email: creatorProfile.email,
                customer_name: creatorProfile.name,
              },
            });
            console.log('Resolution notification sent to:', creatorProfile.email);
          }
        }
      } catch (notifyError) {
        console.error('Failed to send resolution notification:', notifyError);
        // Don't fail the mutation if notification fails
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-requests', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['all-customer-requests'] });
      setResolveDialog({ open: false, request: null });
      setResolutionNote('');
      toast({ title: t('requests.statusUpdated') });
    },
    onError: () => {
      toast({ title: t('requests.updateError'), variant: 'destructive' });
    },
  });

  const getStatusIcon = (status: RequestStatus) => {
    switch (status) {
      case 'OPEN':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      case 'IN_PROGRESS':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'RESOLVED':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
    }
  };

  const getStatusClass = (status: RequestStatus) => {
    switch (status) {
      case 'OPEN':
        return 'border-destructive text-destructive';
      case 'IN_PROGRESS':
        return 'border-yellow-500 text-yellow-600';
      case 'RESOLVED':
        return 'border-green-500 text-green-600';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {requests?.length || 0} {t('requests.requestsCount')}
      </p>

      {!requests || requests.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('requests.noRequests')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div
              key={request.id}
              className="p-4 border rounded-lg space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {REQUEST_TYPE_LABELS[request.request_type]}
                  </Badge>
                  <Badge variant="outline" className={getStatusClass(request.status)}>
                    {getStatusIcon(request.status)}
                    <span className="ml-1">{REQUEST_STATUS_LABELS[request.status]}</span>
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                </span>
              </div>

              <p className="text-sm">{request.message}</p>

              <p className="text-xs text-muted-foreground">
                {t('requests.createdBy')}: {request.creator?.name || t('common.unknown')}
              </p>

              {request.status === 'RESOLVED' && (
                <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted rounded">
                  <p>
                    {t('requests.resolvedBy')}: {request.resolver?.name || t('common.unknown')}
                  </p>
                  {request.resolution_note && (
                    <p className="italic">"{request.resolution_note}"</p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {canManage && request.status !== 'RESOLVED' && (
                <div className="flex gap-2 pt-2 border-t">
                  {request.status === 'OPEN' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatusMutation.mutate({ requestId: request.id, status: 'IN_PROGRESS' })}
                      disabled={updateStatusMutation.isPending}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      {t('requests.startProgress')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      setResolveDialog({ open: true, request });
                      setResolutionNote('');
                    }}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    {t('requests.resolve')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Resolve Dialog */}
      <Dialog open={resolveDialog.open} onOpenChange={(open) => setResolveDialog({ open, request: open ? resolveDialog.request : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('requests.resolveRequest')}</DialogTitle>
            <DialogDescription>
              {resolveDialog.request && REQUEST_TYPE_LABELS[resolveDialog.request.request_type]}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="resolution-note">{t('requests.resolutionNote')}</Label>
              <Textarea
                id="resolution-note"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder={t('requests.resolutionPlaceholder')}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog({ open: false, request: null })}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={() => {
                if (resolveDialog.request && resolutionNote.trim()) {
                  resolveMutation.mutate({
                    requestId: resolveDialog.request.id,
                    note: resolutionNote.trim(),
                    request: resolveDialog.request,
                  });
                }
              }}
              disabled={!resolutionNote.trim() || resolveMutation.isPending}
            >
              {t('requests.resolve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
