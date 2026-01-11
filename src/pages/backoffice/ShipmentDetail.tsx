import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow, format } from 'date-fns';
import { motion } from 'framer-motion';
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
  Files,
  Anchor,
  MapPin,
  TrendingUp,
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
import { ShipmentRequestsPanel } from '@/components/requests/ShipmentRequestsPanel';
import { TimelineSummary } from '@/components/shipments/TimelineSummary';
import { ShipmentProgressIndicator } from '@/components/shipments/ShipmentProgressIndicator';
import { supabase } from '@/integrations/supabase/client';
import { Shipment, TrackingEvent, ShipmentContainer, ShipmentException, ExceptionRule } from '@/types/database';
import { ShipmentStatus, SEVERITY_LABELS, EXCEPTION_STATUS_LABELS } from '@/lib/constants';
import { safeFormatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeShipmentSLA } from '@/hooks/useRealtimeSLA';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const }
  }
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const }
  }
};

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

  const latestEvent = trackingEvents?.[0];
  const openExceptions = exceptions?.filter(e => e.status !== 'RESOLVED') || [];

  return (
    <BackofficeLayout>
      <motion.div 
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header with prominent status */}
        <motion.div variants={itemVariants} className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate('/backoffice/shipments')}
                className="mt-1 shrink-0 hover:bg-primary/10 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                    {shipment.shipment_ref}
                  </h1>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={shipment.current_status as ShipmentStatus} className="text-sm px-3 py-1.5 shadow-sm" />
                    {openExceptions.length > 0 && (
                      <Badge variant="destructive" className="gap-1 animate-pulse">
                        <AlertTriangle className="w-3 h-3" />
                        {openExceptions.length} {t('exceptions.open')}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Anchor className="w-3.5 h-3.5" />
                    {t('shipments.clientRef')}: <span className="font-medium text-foreground">{shipment.client_ref}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    {shipment.client?.name}
                  </span>
                  {shipment.file_number && (
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      {shipment.file_number}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 sm:shrink-0">
              {canEdit && (
                <Button 
                  variant="outline" 
                  onClick={() => setShowEditShipment(true)}
                  className="hover:border-primary hover:text-primary transition-colors"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {t('common.edit')}
                </Button>
              )}
              <Button 
                onClick={() => setShowAddEvent(true)}
                className="shadow-md hover:shadow-lg transition-shadow"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('shipments.addEvent')}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Progress Indicator */}
        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden border-none shadow-lg bg-gradient-to-br from-card via-card to-muted/50">
            <CardContent className="p-6">
              <ShipmentProgressIndicator 
                currentStatus={shipment.current_status as ShipmentStatus} 
                compact
              />
              {latestEvent && (
                <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
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
        </motion.div>

        {/* AI Timeline Summary */}
        <motion.div variants={itemVariants}>
          <TimelineSummary 
            shipmentId={id!} 
            mode="internal" 
            clientEmails={shipment?.client?.notification_emails || []}
          />
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Info Cards */}
            <motion.div 
              className="grid gap-4 sm:grid-cols-3"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {/* Client Card */}
              <motion.div variants={cardVariants}>
                <Card className="relative overflow-hidden group hover:shadow-md transition-all duration-300 hover:border-primary/30">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -translate-y-12 translate-x-12 group-hover:bg-primary/10 transition-colors" />
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">{t('shipments.client')}</p>
                        <p className="font-semibold truncate">{shipment.client?.name}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* BL Reference Card */}
              <motion.div variants={cardVariants}>
                <Card className="relative overflow-hidden group hover:shadow-md transition-all duration-300 hover:border-secondary/30">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/10 rounded-full -translate-y-12 translate-x-12 group-hover:bg-secondary/20 transition-colors" />
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-secondary/20 group-hover:bg-secondary/30 transition-colors">
                        <Ship className="w-5 h-5 text-secondary-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">{t('shipments.blReference')}</p>
                        <p className="font-mono font-semibold truncate">{shipment.bl_reference}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Containers Card */}
              <motion.div variants={cardVariants}>
                <Card className="relative overflow-hidden group hover:shadow-md transition-all duration-300 hover:border-accent/50">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-accent/30 rounded-full -translate-y-12 translate-x-12 group-hover:bg-accent/50 transition-colors" />
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-accent group-hover:bg-accent/80 transition-colors">
                        <Package className="w-5 h-5 text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">{t('shipments.containers')}</p>
                        <p className="font-semibold text-lg">{containers?.length || 0} <span className="text-sm font-normal text-muted-foreground">{t('shipments.units')}</span></p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Shipment Details */}
            <motion.div variants={itemVariants}>
              <Card className="hover:shadow-md transition-shadow duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Ship className="w-4 h-4 text-primary" />
                    </div>
                    {t('shipments.shipmentDetails')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border/50 space-y-1.5 hover:border-primary/20 transition-colors">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('shipments.shippingLine')}</p>
                      <p className="font-semibold text-lg">{shipment.shipping_line}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border/50 space-y-1.5 hover:border-primary/20 transition-colors">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('shipments.assignedOperator')}</p>
                      <p className="font-semibold text-lg flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        {shipment.assigned_operator || '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Dates & Forecasts */}
            <motion.div variants={itemVariants}>
              <Card className="hover:shadow-md transition-shadow duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Calendar className="w-4 h-4 text-primary" />
                    </div>
                    {t('shipments.datesForecasts')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { label: t('shipments.forecastShippingLine'), value: shipment.forecast_shipping_line },
                      { label: t('shipments.forecastTerminal'), value: shipment.forecast_terminal },
                      { label: t('shipments.dischargeDate'), value: shipment.discharge_date },
                      { label: t('shipments.serviceRequestDate'), value: shipment.service_request_date },
                      { label: t('shipments.docsReceivedDate'), value: shipment.docs_received_date },
                      { label: t('shipments.created'), value: shipment.created_at },
                    ].map((item, index) => (
                      <div 
                        key={index}
                        className="p-4 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border/50 space-y-1.5 hover:border-primary/20 transition-colors group"
                      >
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {item.label}
                        </p>
                        <p className="font-semibold group-hover:text-primary transition-colors">
                          {safeFormatDate(item.value, 'MMM d, yyyy', '—')}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Containers */}
            {containers && containers.length > 0 && (
              <motion.div variants={itemVariants}>
                <Card className="hover:shadow-md transition-shadow duration-300">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <Package className="w-4 h-4 text-primary" />
                      </div>
                      {t('shipments.containers')}
                      <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary">{containers.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {containers.map((container, index) => (
                        <motion.div
                          key={container.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05, duration: 0.3 }}
                          className="flex items-center justify-between p-4 bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-background group-hover:bg-primary/10 transition-colors">
                              <Package className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <span className="font-mono text-sm font-medium">{container.container_number}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {container.container_type}
                          </Badge>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* SLA Performance */}
            <motion.div variants={itemVariants}>
              <Card className="hover:shadow-md transition-shadow duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <TrendingUp className="w-4 h-4 text-primary" />
                    </div>
                    {t('sla.performance')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!slaRecords || slaRecords.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">{t('sla.noSlaData')}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Live Countdown Timer for Active SLA */}
                      {(() => {
                        const activeSla = slaRecords.find(r => !r.exited_at && r.sla_config?.max_hours);
                        if (activeSla && activeSla.sla_config?.max_hours) {
                          return (
                            <motion.div 
                              className="p-5 border-2 border-primary rounded-xl bg-gradient-to-br from-primary/10 to-primary/5"
                              initial={{ scale: 0.95, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.3 }}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold flex items-center gap-2">
                                  <div className="p-1.5 rounded-lg bg-primary/20 animate-pulse">
                                    <Clock className="w-4 h-4 text-primary" />
                                  </div>
                                  {t('sla.liveCountdown')}
                                </h4>
                                <StatusBadge status={activeSla.shipment_status} />
                              </div>
                              <SLACountdownTimer
                                enteredAt={activeSla.entered_at}
                                maxHours={activeSla.sla_config.max_hours}
                                breached={activeSla.breached || false}
                              />
                            </motion.div>
                          );
                        }
                        return null;
                      })()}

                      {/* SLA History */}
                      <div className="space-y-2">
                        {slaRecords.map((record, index) => {
                          const maxHours = record.sla_config?.max_hours;
                          const elapsed = record.elapsed_hours;
                          const isActive = !record.exited_at;
                          const isBreach = record.breached;
                          
                          const currentElapsed = isActive
                            ? Math.round((Date.now() - new Date(record.entered_at).getTime()) / (1000 * 60 * 60))
                            : elapsed;
                          
                          const percentUsed = maxHours && currentElapsed 
                            ? Math.min((currentElapsed / maxHours) * 100, 100) 
                            : 0;
                          
                          return (
                            <motion.div
                              key={record.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.05, duration: 0.3 }}
                              className={`p-4 border rounded-xl transition-all hover:shadow-sm ${
                                isBreach ? 'border-destructive bg-gradient-to-br from-destructive/10 to-destructive/5' : 
                                isActive ? 'border-primary bg-gradient-to-br from-primary/10 to-primary/5' : 
                                'bg-gradient-to-br from-muted/50 to-muted/30 hover:border-border'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <StatusBadge status={record.shipment_status} />
                                  {isActive && (
                                    <Badge variant="outline" className="text-xs border-primary text-primary animate-pulse">
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
                                    <Badge variant="outline" className="text-xs border-green-500 text-green-600 dark:text-green-400">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      {t('sla.ok')}
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                              
                              {maxHours && (
                                <div className="space-y-1.5">
                                  <div className="flex justify-between text-xs text-muted-foreground font-medium">
                                    <span>{currentElapsed}h / {maxHours}h</span>
                                    <span>{Math.round(percentUsed)}%</span>
                                  </div>
                                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                    <motion.div 
                                      className={`h-full ${
                                        isBreach ? 'bg-destructive' : 
                                        percentUsed >= 75 ? 'bg-amber-500' : 
                                        'bg-green-500'
                                      }`}
                                      initial={{ width: 0 }}
                                      animate={{ width: `${percentUsed}%` }}
                                      transition={{ duration: 0.5, delay: index * 0.05 }}
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
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Exceptions */}
            <motion.div variants={itemVariants}>
              <Card className="hover:shadow-md transition-shadow duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <AlertTriangle className="w-4 h-4 text-primary" />
                    </div>
                    {t('exceptions.title')}
                    {exceptions && exceptions.length > 0 && (
                      <Badge 
                        variant={openExceptions.length > 0 ? 'destructive' : 'secondary'} 
                        className={`ml-1 ${openExceptions.length > 0 ? 'animate-pulse' : ''}`}
                      >
                        {exceptions.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!exceptions || exceptions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30 text-green-500" />
                      <p className="text-sm">{t('exceptions.noExceptions')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {exceptions.map((exception, index) => (
                        <motion.div
                          key={exception.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05, duration: 0.3 }}
                          className={`p-4 rounded-xl border space-y-3 transition-all hover:shadow-sm ${
                            exception.status === 'OPEN' ? 'border-destructive/50 bg-gradient-to-br from-destructive/10 to-destructive/5' :
                            exception.status === 'ACKNOWLEDGED' ? 'border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-amber-500/5' :
                            'bg-gradient-to-br from-muted/50 to-muted/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
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
                                    ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                                    : 'border-green-500 text-green-600 dark:text-green-400'
                                }
                              >
                                {exception.status === 'OPEN' && <AlertTriangle className="w-3 h-3 mr-1" />}
                                {exception.status === 'ACKNOWLEDGED' && <Clock className="w-3 h-3 mr-1" />}
                                {exception.status === 'RESOLVED' && <CheckCircle className="w-3 h-3 mr-1" />}
                                {EXCEPTION_STATUS_LABELS[exception.status]}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
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
                            <div className="text-xs text-muted-foreground space-y-1 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800/50">
                              <p className="text-green-700 dark:text-green-400">
                                {t('exceptions.resolvedBy')}: {exception.resolved_by_profile?.name || t('common.unknown')}
                                {exception.resolved_at && ` • ${safeFormatDate(exception.resolved_at, 'MMM d, yyyy HH:mm')}`}
                              </p>
                              {exception.resolution_note && (
                                <p className="italic text-green-600 dark:text-green-300">"{exception.resolution_note}"</p>
                              )}
                            </div>
                          )}
                          
                          {/* Action buttons */}
                          {exception.status !== 'RESOLVED' && (
                            <div className="flex gap-2 pt-3 border-t border-border/50">
                              {exception.status === 'OPEN' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => acknowledgeMutation.mutate(exception.id)}
                                  disabled={acknowledgeMutation.isPending}
                                  className="hover:border-amber-500 hover:text-amber-600 transition-colors"
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
                                  className="shadow-md hover:shadow-lg transition-shadow"
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  {t('exceptions.resolve')}
                                </Button>
                              )}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Documents */}
            <motion.div variants={itemVariants}>
              <Card className="hover:shadow-md transition-shadow duration-300">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Files className="w-4 h-4 text-primary" />
                    </div>
                    {t('documents.title')}
                  </CardTitle>
                  <DocumentUploadDialog shipmentId={id!} />
                </CardHeader>
                <CardContent>
                  <DocumentList shipmentId={id!} isCustomer={false} />
                </CardContent>
              </Card>
            </motion.div>

            {/* Customer Requests */}
            <motion.div variants={itemVariants}>
              <Card className="hover:shadow-md transition-shadow duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <MessageSquare className="w-4 h-4 text-primary" />
                    </div>
                    {t('requests.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ShipmentRequestsPanel shipmentId={id!} />
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Timeline Sidebar */}
          <motion.div 
            className="lg:col-span-1"
            variants={itemVariants}
          >
            <div className="lg:sticky lg:top-6">
              <Card className="overflow-hidden shadow-lg">
                <CardHeader className="pb-3 bg-gradient-to-r from-muted/50 to-muted/30">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    {t('tracking.timeline')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <TrackingTimeline events={trackingEvents || []} showVisibility />
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </div>
      </motion.div>

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
