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

const trackingEventSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  note: z.string().min(1, 'Note is required').max(2000),
  location: z.string().max(200).optional(),
  event_datetime: z.string(),
  visible_to_client: z.boolean(),
  notify_client: z.boolean(),
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
    },
  });

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

      // Create audit log
      await supabase.from('audit_log').insert({
        entity_type: 'tracking_event',
        entity_id: shipmentId,
        action: 'CREATE',
        actor_user_id: user!.id,
        metadata_json: {
          status: data.status,
          visible_to_client: data.visible_to_client,
          notify_client: data.notify_client,
        },
      });

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
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(t('tracking.failedToAdd') + ': ' + error.message);
    },
  });

  const onSubmit = (data: TrackingEventFormData) => {
    createEventMutation.mutate(data);
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
