import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
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
  AlertTriangle,
  CheckCircle,
  Clock,
  MessageSquare,
  Radio,
  Files,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { TrackingTimeline } from '@/components/shipments/TrackingTimeline';
import { AddTrackingEventDrawer } from '@/components/shipments/AddTrackingEventDrawer';
import { SLACountdownTimer } from '@/components/shipments/SLACountdownTimer';
import { EditShipmentDrawer } from '@/components/shipments/EditShipmentDrawer';
import { DocumentList } from '@/components/documents/DocumentList';
import { DocumentUploadDialog } from '@/components/documents/DocumentUploadDialog';
import { supabase } from '@/integrations/supabase/client';
import { Shipment, TrackingEvent, ShipmentContainer, ShipmentException, ExceptionRule } from '@/types/database';
import { ShipmentStatus, SEVERITY_LABELS, EXCEPTION_STATUS_LABELS } from '@/lib/constants';
import { safeFormatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeShipmentSLA } from '@/hooks/useRealtimeSLA';

export default function ShipmentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showEditShipment, setShowEditShipment] = useState(false);
  const [resolveDialog, setResolveDialog] = useState<{ open: boolean; exception: ShipmentException | null }>({
    open: false,
    exception: null,
  });
  const [resolutionNote, setResolutionNote] = useState('');

  // Enable realtime updates for this shipment's SLA
  useRealtimeShipmentSLA(id);

  const canEdit = role === 'SUPERVISOR' || role === 'MANAGER';
  const canResolve = role === 'SUPERVISOR' || role === 'MANAGER';

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

  const { data: exceptions } = useQuery({
    queryKey: ['shipment-exceptions', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipment_exceptions')
        .select(`
          *,
          exception_rule:exception_rules(id, name, description)
        `)
        .eq('shipment_id', id!)
        .order('detected_at', { ascending: false });

      if (error) throw error;

      // Fetch resolver/acknowledger names
      const userIds = [
        ...new Set([
          ...data?.map((e) => e.resolved_by).filter(Boolean) || [],
          ...data?.map((e) => e.acknowledged_by).filter(Boolean) || [],
        ]),
      ] as string[];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return data?.map((e) => ({
        ...e,
        resolved_by_profile: e.resolved_by ? profileMap.get(e.resolved_by) : null,
        acknowledged_by_profile: e.acknowledged_by ? profileMap.get(e.acknowledged_by) : null,
      })) as (ShipmentException & {
        exception_rule: ExceptionRule;
        resolved_by_profile: { id: string; name: string } | null;
        acknowledged_by_profile: { id: string; name: string } | null;
      })[];
    },
    enabled: !!id,
  });

  // Fetch shipment SLA records
  const { data: slaRecords } = useQuery({
    queryKey: ['shipment-sla', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipment_sla')
        .select(`
          *,
          sla_config:sla_config(max_hours)
        `)
        .eq('shipment_id', id!)
        .order('entered_at', { ascending: true });

      if (error) throw error;
      return data as {
        id: string;
        shipment_status: ShipmentStatus;
        entered_at: string;
        exited_at: string | null;
        elapsed_hours: number | null;
        breached: boolean;
        sla_config: { max_hours: number } | null;
      }[];
    },
    enabled: !!id,
  });

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (exceptionId: string) => {
      const { error } = await supabase
        .from('shipment_exceptions')
        .update({
          status: 'ACKNOWLEDGED',
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user?.id,
        })
        .eq('id', exceptionId);

      if (error) throw error;

      // Audit log
      const exception = exceptions?.find(e => e.id === exceptionId);
      await supabase.from('audit_log').insert({
        entity_type: 'SHIPMENT_EXCEPTION',
        entity_id: exceptionId,
        action: 'EXCEPTION_ACKNOWLEDGED',
        actor_user_id: user?.id,
        metadata_json: {
          shipment_ref: shipment?.shipment_ref,
          rule_name: exception?.exception_rule?.name,
          severity: exception?.severity,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment-exceptions', id] });
      toast({ title: t('exceptions.acknowledged') });
    },
    onError: () => {
      toast({ title: t('exceptions.failedToAcknowledge'), variant: 'destructive' });
    },
  });

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: async ({ exceptionId, note }: { exceptionId: string; note: string }) => {
      const { error } = await supabase
        .from('shipment_exceptions')
        .update({
          status: 'RESOLVED',
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolution_note: note,
        })
        .eq('id', exceptionId);

      if (error) throw error;

      // Audit log
      const exception = exceptions?.find(e => e.id === exceptionId);
      await supabase.from('audit_log').insert({
        entity_type: 'SHIPMENT_EXCEPTION',
        entity_id: exceptionId,
        action: 'EXCEPTION_RESOLVED',
        actor_user_id: user?.id,
        metadata_json: {
          shipment_ref: shipment?.shipment_ref,
          rule_name: exception?.exception_rule?.name,
          severity: exception?.severity,
          resolution_note: note,
        },
      });

      // Send resolution email notification
      try {
        await supabase.functions.invoke('send-exception-alert', {
          body: {
            type: 'resolution',
            resolutions: [{
              shipment_ref: shipment?.shipment_ref || 'Unknown',
              client_name: shipment?.client?.name || 'Unknown Client',
              rule_name: exception?.exception_rule?.name || 'Unknown Rule',
              severity: exception?.severity || 'P3',
              resolved_by: profile?.name || 'Unknown User',
              resolution_note: note,
            }],
          },
        });
      } catch (notifyError) {
        console.error('Failed to send resolution notification:', notifyError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment-exceptions', id] });
      setResolveDialog({ open: false, exception: null });
      setResolutionNote('');
      toast({ title: t('exceptions.resolved') });
    },
    onError: () => {
      toast({ title: t('exceptions.failedToResolve'), variant: 'destructive' });
    },
  });

  const handleResolve = () => {
    if (resolveDialog.exception && resolutionNote.trim()) {
      resolveMutation.mutate({
        exceptionId: resolveDialog.exception.id,
        note: resolutionNote.trim(),
      });
    }
  };

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
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.serviceRequestDate')}</p>
                    <p className="font-medium">
                      {safeFormatDate(shipment.service_request_date, 'MMM d, yyyy', '—')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.docsReceivedDate')}</p>
                    <p className="font-medium">
                      {safeFormatDate(shipment.docs_received_date, 'MMM d, yyyy', '—')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('shipments.created')}</p>
                    <p className="font-medium">
                      {safeFormatDate(shipment.created_at, 'MMM d, yyyy')}
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

            {/* SLA Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  {t('sla.performance')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!slaRecords || slaRecords.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('sla.noSlaData')}</p>
                ) : (
                  <div className="space-y-4">
                    {/* Live Countdown Timer for Active SLA */}
                    {(() => {
                      const activeSla = slaRecords.find(r => !r.exited_at && r.sla_config?.max_hours);
                      if (activeSla && activeSla.sla_config?.max_hours) {
                        return (
                          <div className="p-4 border-2 border-primary rounded-lg bg-primary/5">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" />
                                {t('sla.liveCountdown')}
                              </h4>
                              <StatusBadge status={activeSla.shipment_status} />
                            </div>
                            <SLACountdownTimer
                              enteredAt={activeSla.entered_at}
                              maxHours={activeSla.sla_config.max_hours}
                              breached={activeSla.breached || false}
                            />
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* SLA History */}
                    <div className="space-y-2">
                      {slaRecords.map((record) => {
                        const maxHours = record.sla_config?.max_hours;
                        const elapsed = record.elapsed_hours;
                        const isActive = !record.exited_at;
                        const isBreach = record.breached;
                        
                        // For active records, calculate current elapsed time
                        const currentElapsed = isActive
                          ? Math.round((Date.now() - new Date(record.entered_at).getTime()) / (1000 * 60 * 60))
                          : elapsed;
                        
                        const percentUsed = maxHours && currentElapsed 
                          ? Math.min((currentElapsed / maxHours) * 100, 100) 
                          : 0;
                        
                        return (
                          <div
                            key={record.id}
                            className={`p-3 border rounded-lg ${isBreach ? 'border-destructive bg-destructive/5' : isActive ? 'border-primary bg-primary/5' : ''}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <StatusBadge status={record.shipment_status} />
                                {isActive && (
                                  <Badge variant="outline" className="text-xs border-primary text-primary">
                                    {t('sla.current')}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isBreach ? (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    {t('sla.breached')}
                                  </Badge>
                                ) : record.exited_at ? (
                                  <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    {t('sla.ok')}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                            
                            {maxHours && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>{currentElapsed}h / {maxHours}h</span>
                                  <span>{Math.round(percentUsed)}%</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all ${
                                      isBreach ? 'bg-destructive' : 
                                      percentUsed >= 75 ? 'bg-amber-500' : 
                                      'bg-green-500'
                                    }`}
                                    style={{ width: `${percentUsed}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            
                            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                              <span>{t('sla.entered')}: {safeFormatDate(record.entered_at, 'MMM d, HH:mm')}</span>
                              {record.exited_at && (
                                <span>{t('sla.exited')}: {safeFormatDate(record.exited_at, 'MMM d, HH:mm')}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Exceptions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  {t('exceptions.title')} ({exceptions?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!exceptions || exceptions.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('exceptions.noExceptions')}</p>
                ) : (
                  <div className="space-y-3">
                    {exceptions.map((exception) => (
                      <div
                        key={exception.id}
                        className="p-4 border rounded-lg space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={exception.severity === 'P1' ? 'destructive' : 'secondary'}
                              className={
                                exception.severity === 'P2'
                                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                                  : exception.severity === 'P3'
                                  ? 'bg-yellow-500 text-black hover:bg-yellow-600'
                                  : ''
                              }
                            >
                              {SEVERITY_LABELS[exception.severity]}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={
                                exception.status === 'OPEN'
                                  ? 'border-destructive text-destructive'
                                  : exception.status === 'ACKNOWLEDGED'
                                  ? 'border-yellow-500 text-yellow-600'
                                  : 'border-green-500 text-green-600'
                              }
                            >
                              {exception.status === 'OPEN' && <AlertTriangle className="w-3 h-3 mr-1" />}
                              {exception.status === 'ACKNOWLEDGED' && <Clock className="w-3 h-3 mr-1" />}
                              {exception.status === 'RESOLVED' && <CheckCircle className="w-3 h-3 mr-1" />}
                              {EXCEPTION_STATUS_LABELS[exception.status]}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(exception.detected_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="font-medium">{exception.exception_rule?.name}</p>
                        {exception.exception_rule?.description && (
                          <p className="text-sm text-muted-foreground">{exception.exception_rule.description}</p>
                        )}
                        {exception.status === 'ACKNOWLEDGED' && exception.acknowledged_by_profile && (
                          <p className="text-xs text-muted-foreground">
                            {t('exceptions.acknowledgedBy')}: {exception.acknowledged_by_profile.name}
                            {exception.acknowledged_at && ` • ${safeFormatDate(exception.acknowledged_at, 'MMM d, yyyy HH:mm')}`}
                          </p>
                        )}
                        {exception.status === 'RESOLVED' && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>
                              {t('exceptions.resolvedBy')}: {exception.resolved_by_profile?.name || t('common.unknown')}
                              {exception.resolved_at && ` • ${safeFormatDate(exception.resolved_at, 'MMM d, yyyy HH:mm')}`}
                            </p>
                            {exception.resolution_note && (
                              <p className="italic">"{exception.resolution_note}"</p>
                            )}
                          </div>
                        )}
                        
                        {/* Action buttons */}
                        {exception.status !== 'RESOLVED' && (
                          <div className="flex gap-2 pt-2 border-t">
                            {exception.status === 'OPEN' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => acknowledgeMutation.mutate(exception.id)}
                                disabled={acknowledgeMutation.isPending}
                              >
                                <Clock className="w-4 h-4 mr-1" />
                                {t('exceptions.acknowledge')}
                              </Button>
                            )}
                            {canResolve && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => {
                                  setResolveDialog({ open: true, exception });
                                  setResolutionNote('');
                                }}
                              >
                                <MessageSquare className="w-4 h-4 mr-1" />
                                {t('exceptions.resolve')}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Files className="w-5 h-5" />
                  {t('documents.title')}
                </CardTitle>
                <DocumentUploadDialog shipmentId={id!} />
              </CardHeader>
              <CardContent>
                <DocumentList shipmentId={id!} isCustomer={false} />
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

      {/* Resolve Exception Dialog */}
      <Dialog open={resolveDialog.open} onOpenChange={(open) => setResolveDialog({ open, exception: open ? resolveDialog.exception : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('exceptions.resolveException')}</DialogTitle>
            <DialogDescription>
              {resolveDialog.exception?.exception_rule?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="resolution-note">{t('exceptions.resolutionNote')}</Label>
              <Textarea
                id="resolution-note"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder={t('exceptions.resolutionNotePlaceholder')}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog({ open: false, exception: null })}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleResolve} 
              disabled={!resolutionNote.trim() || resolveMutation.isPending}
            >
              {t('exceptions.resolve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
