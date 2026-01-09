import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { ArrowLeft, Ship, Package, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { TrackingTimeline } from '@/components/shipments/TrackingTimeline';
import { supabase } from '@/integrations/supabase/client';
import { Shipment, TrackingEvent, ShipmentContainer } from '@/types/database';
import { ShipmentStatus } from '@/lib/constants';

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
                      {shipment.forecast_shipping_line
                        ? format(new Date(shipment.forecast_shipping_line), 'MMM d, yyyy')
                        : '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.forecastTerminal')}</p>
                    <p className="font-medium">
                      {shipment.forecast_terminal
                        ? format(new Date(shipment.forecast_terminal), 'MMM d, yyyy')
                        : '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.dischargeDate')}</p>
                    <p className="font-medium">
                      {shipment.discharge_date
                        ? format(new Date(shipment.discharge_date), 'MMM d, yyyy')
                        : '—'}
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
