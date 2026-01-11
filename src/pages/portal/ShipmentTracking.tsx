import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Ship, Package, Calendar, FileText, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { TrackingTimeline } from '@/components/shipments/TrackingTimeline';
import { TimelineSummary } from '@/components/shipments/TimelineSummary';
import { DocumentList } from '@/components/documents/DocumentList';
import { SubmitRequestDialog } from '@/components/requests/SubmitRequestDialog';
import { supabase } from '@/integrations/supabase/client';
import { Shipment, TrackingEvent, ShipmentContainer } from '@/types/database';
import { ShipmentStatus } from '@/lib/constants';
import { safeFormatDate } from '@/lib/utils';
import { CustomerRequest, REQUEST_STATUS_LABELS, REQUEST_TYPE_LABELS } from '@/types/documents';
import { format } from 'date-fns';

export default function ShipmentTracking() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: shipment, isLoading: loadingShipment } = useQuery({
    queryKey: ['portal-shipment', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipments')
        .select(`
          id,
          shipment_ref,
          client_ref,
          shipping_line,
          bl_reference,
          forecast_shipping_line,
          forecast_terminal,
          discharge_date,
          current_status,
          created_at,
          client:clients(id, name)
        `)
        .eq('id', id!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: containers } = useQuery({
    queryKey: ['portal-containers', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipment_containers')
        .select('*')
        .eq('shipment_id', id!)
        .order('created_at');

      if (error) throw error;
      return data as ShipmentContainer[];
    },
    enabled: !!id,
  });

  const { data: trackingEvents } = useQuery({
    queryKey: ['portal-tracking-events', id],
    queryFn: async () => {
      // RLS will filter to only visible_to_client=true events
      const { data, error } = await supabase
        .from('tracking_events')
        .select('*')
        .eq('shipment_id', id!)
        .order('event_datetime', { ascending: false });

      if (error) throw error;
      return data as TrackingEvent[];
    },
    enabled: !!id,
  });

  const { data: myRequests } = useQuery({
    queryKey: ['portal-my-requests', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_requests')
        .select('*')
        .eq('shipment_id', id!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CustomerRequest[];
    },
    enabled: !!id,
  });

  if (loadingShipment) {
    return (
      <CustomerLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </CustomerLayout>
    );
  }

  if (!shipment) {
    return (
      <CustomerLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">{t('shipments.shipmentNotFound')}</h2>
          <Button variant="link" onClick={() => navigate('/portal')}>
            {t('shipments.backToMyShipments')}
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/portal')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{shipment.shipment_ref}</h1>
              <StatusBadge status={shipment.current_status as ShipmentStatus} />
            </div>
            <p className="text-muted-foreground">{t('shipments.clientRef')}: {shipment.client_ref}</p>
          </div>
        </div>

        {/* AI Timeline Summary */}
        <TimelineSummary shipmentId={id!} mode="customer" compact />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Shipment Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ship className="w-5 h-5" />
                  {t('shipments.shipmentDetails')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.shippingLine')}</p>
                    <p className="font-medium">{shipment.shipping_line}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.blReference')}</p>
                    <p className="font-medium font-mono">{shipment.bl_reference}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dates & Forecasts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  {t('shipments.forecasts')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.forecastShippingLine')}</p>
                    <p className="font-medium">
                      {safeFormatDate(shipment.forecast_shipping_line, 'MMM d, yyyy', '—')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.forecastTerminal')}</p>
                    <p className="font-medium">
                      {safeFormatDate(shipment.forecast_terminal, 'MMM d, yyyy', '—')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.dischargeDate')}</p>
                    <p className="font-medium">
                      {safeFormatDate(shipment.discharge_date, 'MMM d, yyyy', '—')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Containers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {t('shipments.containers')} ({containers?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!containers || containers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('shipments.noContainers')}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {containers.map((container) => (
                      <div
                        key={container.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <span className="font-mono text-sm">{container.container_number}</span>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-background rounded">
                          {container.container_type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {t('documents.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DocumentList 
                  shipmentId={id!} 
                  isCustomer={true}
                />
              </CardContent>
            </Card>

            {/* My Requests */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  {t('requests.myRequests')}
                </CardTitle>
                <SubmitRequestDialog 
                  shipmentId={id!}
                />
              </CardHeader>
              <CardContent>
                {!myRequests || myRequests.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('requests.noRequests')}</p>
                ) : (
                  <div className="space-y-3">
                    {myRequests.map((request) => (
                      <div
                        key={request.id}
                        className="p-4 border rounded-lg space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {REQUEST_TYPE_LABELS[request.request_type]}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            request.status === 'RESOLVED' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : request.status === 'IN_PROGRESS'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          }`}>
                            {REQUEST_STATUS_LABELS[request.status]}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{request.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(request.created_at), 'MMM d, yyyy HH:mm')}
                        </p>
                        {request.resolution_note && (
                          <div className="mt-2 p-2 bg-muted rounded text-sm">
                            <span className="font-medium">{t('requests.resolution')}: </span>
                            {request.resolution_note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Timeline */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('shipments.trackingHistory')}</CardTitle>
              </CardHeader>
              <CardContent>
                <TrackingTimeline events={trackingEvents || []} showVisibility={false} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
