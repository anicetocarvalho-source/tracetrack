import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Ship, Package, Calendar, FileText, MessageSquare, Anchor, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { TrackingTimeline } from '@/components/shipments/TrackingTimeline';
import { TimelineSummary } from '@/components/shipments/TimelineSummary';
import { ShipmentProgressIndicator } from '@/components/shipments/ShipmentProgressIndicator';
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

  const latestEvent = trackingEvents?.[0];

  return (
    <CustomerLayout>
      <div className="space-y-6">
        {/* Header with prominent status */}
        <div className="relative">
          <div className="flex items-start gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/portal')}
              className="mt-1 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{shipment.shipment_ref}</h1>
                <StatusBadge status={shipment.current_status as ShipmentStatus} className="text-sm px-3 py-1" />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Anchor className="w-3.5 h-3.5" />
                  {t('shipments.clientRef')}: <span className="font-medium text-foreground">{shipment.client_ref}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Ship className="w-3.5 h-3.5" />
                  {shipment.shipping_line}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <Card className="overflow-hidden border-none shadow-md bg-gradient-to-br from-card to-muted/30">
          <CardContent className="p-6">
            <ShipmentProgressIndicator 
              currentStatus={shipment.current_status as ShipmentStatus} 
              compact
            />
            {latestEvent && (
              <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  {t('shipments.lastUpdate')}: 
                  <span className="font-medium text-foreground">
                    {format(new Date(latestEvent.event_datetime), 'MMM d, yyyy HH:mm')}
                  </span>
                </span>
                {latestEvent.location && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {latestEvent.location}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Timeline Summary */}
        <TimelineSummary shipmentId={id!} mode="customer" compact />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Info Cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Shipment Reference Card */}
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -translate-y-12 translate-x-12" />
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-primary/10">
                      <Ship className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground mb-1">{t('shipments.blReference')}</p>
                      <p className="font-mono font-semibold text-lg truncate">{shipment.bl_reference}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Containers Summary Card */}
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/10 rounded-full -translate-y-12 translate-x-12" />
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-secondary/20">
                      <Package className="w-5 h-5 text-secondary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground mb-1">{t('shipments.containers')}</p>
                      <p className="font-semibold text-lg">{containers?.length || 0} {t('shipments.units')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Dates & Forecasts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="w-4 h-4 text-primary" />
                  {t('shipments.forecasts')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t('shipments.forecastShippingLine')}
                    </p>
                    <p className="font-semibold">
                      {safeFormatDate(shipment.forecast_shipping_line, 'MMM d, yyyy', '—')}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t('shipments.forecastTerminal')}
                    </p>
                    <p className="font-semibold">
                      {safeFormatDate(shipment.forecast_terminal, 'MMM d, yyyy', '—')}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t('shipments.dischargeDate')}
                    </p>
                    <p className="font-semibold">
                      {safeFormatDate(shipment.discharge_date, 'MMM d, yyyy', '—')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Containers */}
            {containers && containers.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="w-4 h-4 text-primary" />
                    {t('shipments.containers')} 
                    <Badge variant="secondary" className="ml-1">{containers.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {containers.map((container) => (
                      <div
                        key={container.id}
                        className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border/50 hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-background">
                            <Package className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <span className="font-mono text-sm font-medium">{container.container_number}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {container.container_type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Documents */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-4 h-4 text-primary" />
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
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  {t('requests.myRequests')}
                  {myRequests && myRequests.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{myRequests.length}</Badge>
                  )}
                </CardTitle>
                <SubmitRequestDialog 
                  shipmentId={id!}
                />
              </CardHeader>
              <CardContent>
                {!myRequests || myRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{t('requests.noRequests')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myRequests.map((request) => (
                      <div
                        key={request.id}
                        className="p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="font-normal">
                            {REQUEST_TYPE_LABELS[request.request_type]}
                          </Badge>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            request.status === 'RESOLVED' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                              : request.status === 'IN_PROGRESS'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                          }`}>
                            {REQUEST_STATUS_LABELS[request.status]}
                          </span>
                        </div>
                        <p className="text-sm">{request.message}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(request.created_at), 'MMM d, yyyy HH:mm')}
                        </p>
                        {request.resolution_note && (
                          <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-lg text-sm">
                            <span className="font-medium text-green-800 dark:text-green-300">{t('requests.resolution')}: </span>
                            <span className="text-green-700 dark:text-green-400">{request.resolution_note}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Timeline Sidebar */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <Card className="overflow-hidden">
                <CardHeader className="pb-3 bg-muted/30">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="w-4 h-4 text-primary" />
                    {t('shipments.trackingHistory')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <TrackingTimeline events={trackingEvents || []} showVisibility={false} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
