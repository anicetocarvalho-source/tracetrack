import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SHIPMENT_STATUSES, ShipmentStatus } from '@/lib/constants';
import { toast } from 'sonner';
import { AIClassificationSuggestion, AIClassification } from './AIClassificationSuggestion';
import { useAIClassification } from '@/hooks/useAIClassification';
import { Badge } from '@/components/ui/badge';

const trackingEventSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  note: z.string().min(1, 'Note is required').max(2000),
  location: z.string().max(200).optional(),
  event_datetime: z.string(),
  visible_to_client: z.boolean(),
  notify_client: z.boolean(),
  // AI classification fields (optional)
  incident_category: z.string().optional(),
  incident_severity: z.enum(['P1', 'P2', 'P3']).optional(),
  incident_cause: z.string().optional(),
});

type TrackingEventFormData = z.infer<typeof trackingEventSchema>;

interface AddTrackingEventDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  currentStatus: ShipmentStatus;
}

export function AddTrackingEventDrawer({
  open,
  onOpenChange,
  shipmentId,
  currentStatus,
}: AddTrackingEventDrawerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<TrackingEventFormData>({
    resolver: zodResolver(trackingEventSchema),
    defaultValues: {
      status: currentStatus,
      note: '',
      location: '',
      event_datetime: new Date().toISOString().slice(0, 16),
      visible_to_client: false,
      notify_client: true,
      incident_category: undefined,
      incident_severity: undefined,
      incident_cause: undefined,
    },
  });

  const {
    classification,
    isLoading: isClassifying,
    error: classificationError,
    wasAccepted,
    autoClassifyText,
    acceptClassification,
    dismissClassification,
    reset: resetClassification,
  } = useAIClassification({
    entityType: 'tracking_event',
    entityId: shipmentId,
    autoClassify: true,
    debounceMs: 1500,
    minTextLength: 20,
  });

  const noteValue = form.watch('note');
  const statusValue = form.watch('status');

  // Auto-classify when note changes
  useEffect(() => {
    if (open && noteValue.trim().length >= 20 && !wasAccepted) {
      autoClassifyText(noteValue, `Status: ${statusValue}`);
    }
  }, [noteValue, statusValue, open, wasAccepted, autoClassifyText]);

  // Reset classification when drawer closes
  useEffect(() => {
    if (!open) {
      resetClassification();
    }
  }, [open, resetClassification]);

  const handleAcceptClassification = async (cls: AIClassification) => {
    await acceptClassification(cls);
    form.setValue('incident_category', cls.category);
    form.setValue('incident_severity', cls.severity);
    form.setValue('incident_cause', cls.likely_cause);
    toast.success(t('classification.accepted', 'Classification accepted'));
  };

  const handleDismissClassification = async () => {
    await dismissClassification();
    form.setValue('incident_category', undefined);
    form.setValue('incident_severity', undefined);
    form.setValue('incident_cause', undefined);
  };

  const createEventMutation = useMutation({
    mutationFn: async (data: TrackingEventFormData) => {
      // Create tracking event
      const { error: eventError } = await supabase.from('tracking_events').insert({
        shipment_id: shipmentId,
        status: data.status,
        note: data.note,
        location: data.location || null,
        event_datetime: data.event_datetime,
        visible_to_client: data.visible_to_client,
        notify_client: data.notify_client,
        created_by: user!.id,
      });

      if (eventError) throw eventError;

      // Update shipment status
      const { error: shipmentError } = await supabase
        .from('shipments')
        .update({ current_status: data.status })
        .eq('id', shipmentId);

      if (shipmentError) throw shipmentError;

      // Create audit log with classification data if present
      const auditMetadata = {
        status: data.status,
        visible_to_client: data.visible_to_client,
        notify_client: data.notify_client,
        classification: (data.incident_category || data.incident_severity || data.incident_cause) ? {
          category: data.incident_category || null,
          severity: data.incident_severity || null,
          cause: data.incident_cause || null,
          was_ai_assisted: wasAccepted,
        } : null,
      };

      await supabase.from('audit_log').insert([{
        entity_type: 'tracking_event',
        entity_id: shipmentId,
        action: 'CREATE',
        actor_user_id: user!.id,
        metadata_json: auditMetadata,
      }]);

      // Send email notification if enabled
      if (data.notify_client && data.visible_to_client) {
        try {
          await supabase.functions.invoke('send-tracking-notification', {
            body: {
              shipment_id: shipmentId,
              status: data.status,
              note: data.note,
              location: data.location || null,
            },
          });
        } catch (notifyError) {
          console.error('Failed to send notification:', notifyError);
          // Don't fail the whole operation if notification fails
        }
      }
    },
    onSuccess: () => {
      toast.success(t('tracking.eventAdded'));
      queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['tracking-events', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      form.reset({
        status: currentStatus,
        note: '',
        location: '',
        event_datetime: new Date().toISOString().slice(0, 16),
        visible_to_client: false,
        notify_client: true,
        incident_category: undefined,
        incident_severity: undefined,
        incident_cause: undefined,
      });
      resetClassification();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(t('tracking.failedToAdd') + ': ' + error.message);
    },
  });

  const onSubmit = (data: TrackingEventFormData) => {
    createEventMutation.mutate(data);
  };

  const incidentCategory = form.watch('incident_category');
  const incidentSeverity = form.watch('incident_severity');
  const incidentCause = form.watch('incident_cause');

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'P1': return 'bg-destructive text-destructive-foreground';
      case 'P2': return 'bg-orange-500 text-white';
      case 'P3': return 'bg-yellow-500 text-black';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('tracking.addEvent')}</SheetTitle>
          <SheetDescription>
            {t('tracking.addEventDesc')}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.status')} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('tracking.selectStatus')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SHIPMENT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`status.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('tracking.note')} *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('tracking.notePlaceholder')}
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* AI Classification Section */}
            <AIClassificationSuggestion
              classification={classification}
              isLoading={isClassifying}
              error={classificationError}
              onAccept={handleAcceptClassification}
              onDismiss={handleDismissClassification}
              hasText={noteValue.trim().length > 0}
              autoMode={true}
            />

            {/* Show accepted classification */}
            {wasAccepted && (incidentCategory || incidentSeverity || incidentCause) && (
              <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg border">
                <span className="text-xs text-muted-foreground w-full mb-1">
                  {t('classification.appliedClassification', 'Applied Classification')}:
                </span>
                {incidentSeverity && (
                  <Badge className={getSeverityColor(incidentSeverity)}>
                    {incidentSeverity}
                  </Badge>
                )}
                {incidentCategory && (
                  <Badge variant="outline">{incidentCategory.replace(/_/g, ' ')}</Badge>
                )}
                {incidentCause && (
                  <Badge variant="secondary">{incidentCause}</Badge>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('tracking.location')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('tracking.locationPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="event_datetime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('tracking.eventDateTime')}</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4 pt-4 border-t">
              <FormField
                control={form.control}
                name="visible_to_client"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t('tracking.visibleToClient')}</FormLabel>
                      <FormDescription>
                        {t('tracking.visibleToClientDesc')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notify_client"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t('tracking.notifyClient')}</FormLabel>
                      <FormDescription>
                        {t('tracking.notifyClientDesc')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={createEventMutation.isPending}
              >
                {createEventMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {t('shipments.addEvent')}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
