import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Plus,
  Ship,
  Package,
  Calendar,
  Building2,
  FileText,
  User,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { TrackingTimeline } from '@/components/shipments/TrackingTimeline';
import { AddTrackingEventDrawer } from '@/components/shipments/AddTrackingEventDrawer';
import { EditShipmentDrawer } from '@/components/shipments/EditShipmentDrawer';
import { supabase } from '@/integrations/supabase/client';
import { Shipment, TrackingEvent, ShipmentContainer } from '@/types/database';
import { ShipmentStatus } from '@/lib/constants';
import { useAuth } from '@/hooks/useAuth';

export default function ShipmentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showEditShipment, setShowEditShipment] = useState(false);

  const canEdit = role === 'SUPERVISOR' || role === 'MANAGER';

  const { data: shipment, isLoading: loadingShipment } = useQuery({
    queryKey: ['shipment', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipments')
        .select(`
          *,
          client:clients(id, name, notification_emails)
        `)
        .eq('id', id!)
        .maybeSingle();

      if (error) throw error;
      return data as Shipment & { client: { id: string; name: string; notification_emails: string[] } };
    },
    enabled: !!id,
  });

  const { data: containers } = useQuery({
    queryKey: ['containers', id],
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
    queryKey: ['tracking-events', id],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from('tracking_events')
        .select('*')
        .eq('shipment_id', id!)
        .order('event_datetime', { ascending: false });

      if (error) throw error;

      // Fetch creators separately
      const creatorIds = [...new Set(events?.map((e) => e.created_by) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', creatorIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return events?.map((e) => ({
        ...e,
        creator: profileMap.get(e.created_by) || null,
      })) as (TrackingEvent & { creator: { id: string; name: string } | null })[];
    },
    enabled: !!id,
  });

  if (loadingShipment) {
    return (
      <BackofficeLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </BackofficeLayout>
    );
  }

  if (!shipment) {
    return (
      <BackofficeLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">{t('shipments.shipmentNotFound')}</h2>
          <Button variant="link" onClick={() => navigate('/backoffice/shipments')}>
            {t('shipments.backToShipments')}
          </Button>
        </div>
      </BackofficeLayout>
    );
  }

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/backoffice/shipments')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{shipment.shipment_ref}</h1>
                <StatusBadge status={shipment.current_status as ShipmentStatus} />
              </div>
              <p className="text-muted-foreground">
                {t('shipments.clientRef')}: {shipment.client_ref}
                {shipment.file_number && ` • ${t('shipments.fileNumber')}: ${shipment.file_number}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="outline" onClick={() => setShowEditShipment(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                {t('common.edit')}
              </Button>
            )}
            <Button onClick={() => setShowAddEvent(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('shipments.addEvent')}
            </Button>
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
                    <p className="text-sm text-muted-foreground">{t('shipments.client')}</p>
                    <p className="font-medium flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      {shipment.client?.name}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.assignedOperator')}</p>
                    <p className="font-medium flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      {shipment.assigned_operator || '—'}
                    </p>
                  </div>
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
                  {t('shipments.datesForecasts')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.serviceRequestDate')}</p>
                    <p className="font-medium">
                      {shipment.service_request_date
                        ? format(new Date(shipment.service_request_date), 'MMM d, yyyy')
                        : '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.docsReceivedDate')}</p>
                    <p className="font-medium">
                      {shipment.docs_received_date
                        ? format(new Date(shipment.docs_received_date), 'MMM d, yyyy')
                        : '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.created')}</p>
                    <p className="font-medium">
                      {format(new Date(shipment.created_at), 'MMM d, yyyy')}
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
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {t('tracking.timeline')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TrackingTimeline events={trackingEvents || []} showVisibility />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AddTrackingEventDrawer
        open={showAddEvent}
        onOpenChange={setShowAddEvent}
        shipmentId={id!}
        currentStatus={shipment.current_status as ShipmentStatus}
      />

      {canEdit && shipment && (
        <EditShipmentDrawer
          open={showEditShipment}
          onOpenChange={setShowEditShipment}
          shipment={shipment}
        />
      )}
    </BackofficeLayout>
  );
}
