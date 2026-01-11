import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SubmitRequestDialog } from './SubmitRequestDialog';
import { supabase } from '@/integrations/supabase/client';
import {
  CustomerRequest,
  REQUEST_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  RequestType,
  RequestStatus,
} from '@/types/documents';

interface CustomerRequestListProps {
  shipmentId: string;
}

export function CustomerRequestList({ shipmentId }: CustomerRequestListProps) {
  const { t } = useTranslation();

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
        creator: profileMap.get(r.created_by) || null,
        resolver: r.resolved_by ? profileMap.get(r.resolved_by) || null : null,
      })) as CustomerRequest[];
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {requests?.length || 0} {t('requests.requestsCount')}
        </p>
        <SubmitRequestDialog shipmentId={shipmentId} />
      </div>

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
              className="p-4 border rounded-lg space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">
                    {REQUEST_TYPE_LABELS[request.request_type as RequestType]}
                  </Badge>
                  <Badge variant="outline" className={getStatusClass(request.status as RequestStatus)}>
                    {getStatusIcon(request.status as RequestStatus)}
                    <span className="ml-1">
                      {REQUEST_STATUS_LABELS[request.status as RequestStatus]}
                    </span>
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                </span>
              </div>

              <p className="text-sm">{request.message}</p>

              {request.status === 'RESOLVED' && request.resolution_note && (
                <div className="p-3 bg-muted rounded-lg mt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t('requests.resolution')}
                  </p>
                  <p className="text-sm">{request.resolution_note}</p>
                  {request.resolver && (
                    <p className="text-xs text-muted-foreground mt-1">
                      — {request.resolver.name}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
