import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { RequestType, REQUEST_TYPE_LABELS } from '@/types/documents';
import { AIClassificationSuggestion, AIClassification } from '@/components/shipments/AIClassificationSuggestion';
import { useAIClassification } from '@/hooks/useAIClassification';

interface SubmitRequestDialogProps {
  shipmentId: string;
}

export function SubmitRequestDialog({
  shipmentId,
}: SubmitRequestDialogProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [requestType, setRequestType] = useState<RequestType>('UPDATE_REQUEST');
  const [message, setMessage] = useState('');
  
  // Classification state
  const [incidentCategory, setIncidentCategory] = useState<string | undefined>();
  const [incidentSeverity, setIncidentSeverity] = useState<'P1' | 'P2' | 'P3' | undefined>();
  const [incidentCause, setIncidentCause] = useState<string | undefined>();

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
    entityType: 'customer_request',
    entityId: shipmentId,
    autoClassify: true,
    debounceMs: 1500,
    minTextLength: 20,
  });

  // Auto-classify when message changes
  useEffect(() => {
    if (open && message.trim().length >= 20 && !wasAccepted) {
      autoClassifyText(message, `Request Type: ${requestType}`);
    }
  }, [message, requestType, open, wasAccepted, autoClassifyText]);

  // Reset classification when dialog closes
  useEffect(() => {
    if (!open) {
      resetClassification();
      setIncidentCategory(undefined);
      setIncidentSeverity(undefined);
      setIncidentCause(undefined);
    }
  }, [open, resetClassification]);

  const handleAcceptClassification = async (cls: AIClassification) => {
    await acceptClassification(cls);
    setIncidentCategory(cls.category);
    setIncidentSeverity(cls.severity);
    setIncidentCause(cls.likely_cause);
    toast({ title: t('classification.accepted', 'Classification accepted') });
  };

  const handleDismissClassification = async () => {
    await dismissClassification();
    setIncidentCategory(undefined);
    setIncidentSeverity(undefined);
    setIncidentCause(undefined);
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'P1': return 'bg-destructive text-destructive-foreground';
      case 'P2': return 'bg-orange-500 text-white';
      case 'P3': return 'bg-yellow-500 text-black';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // First, insert the request
      const { data: insertedRequest, error } = await supabase
        .from('customer_requests')
        .insert({
          shipment_id: shipmentId,
          request_type: requestType,
          message: message.trim(),
          created_by: user.id,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Log classification if present
      if (incidentCategory || incidentSeverity || incidentCause) {
        await supabase.from('audit_log').insert([{
          entity_type: 'customer_request',
          entity_id: insertedRequest.id,
          action: 'CREATE_WITH_CLASSIFICATION',
          actor_user_id: user.id,
          metadata_json: {
            request_type: requestType,
            classification: {
              category: incidentCategory || null,
              severity: incidentSeverity || null,
              cause: incidentCause || null,
              was_ai_assisted: wasAccepted,
            },
          },
        }]);
      }

      // Fetch shipment and client info for the notification
      const { data: shipmentData } = await supabase
        .from('shipments')
        .select('shipment_ref, client:clients(name)')
        .eq('id', shipmentId)
        .single();

      // Fetch user profile for the requester name
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', user.id)
        .single();

      // Send notification email (fire and forget - don't block on failure)
      try {
        await supabase.functions.invoke('notify-new-request', {
          body: {
            request_id: insertedRequest.id,
            shipment_id: shipmentId,
            shipment_ref: shipmentData?.shipment_ref || 'Unknown',
            client_name: shipmentData?.client?.name || 'Unknown Client',
            request_type: requestType,
            message: message.trim(),
            requester_name: profileData?.name || 'Customer',
            requester_email: profileData?.email || user.email || '',
            classification: (incidentCategory || incidentSeverity || incidentCause) ? {
              category: incidentCategory,
              severity: incidentSeverity,
              cause: incidentCause,
            } : null,
          },
        });
        console.log('Notification email sent successfully');
      } catch (notifyError) {
        console.error('Failed to send notification email:', notifyError);
        // Don't throw - the request was still created successfully
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-requests', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['portal-my-requests', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['all-customer-requests'] });
      toast({ title: t('requests.requestSubmitted') });
      setOpen(false);
      setMessage('');
      setRequestType('UPDATE_REQUEST');
      setIncidentCategory(undefined);
      setIncidentSeverity(undefined);
      setIncidentCause(undefined);
      resetClassification();
    },
    onError: (error) => {
      console.error('Submit error:', error);
      toast({
        title: t('requests.submitError'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      submitMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-2" />
          {t('requests.submitRequest')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('requests.submitRequest')}</DialogTitle>
          <DialogDescription>
            {t('requests.submitDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('requests.requestType')}</Label>
            <Select
              value={requestType}
              onValueChange={(v) => setRequestType(v as RequestType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">{t('requests.message')}</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('requests.messagePlaceholder')}
              rows={4}
              required
            />
          </div>

          {/* AI Classification Section */}
          <AIClassificationSuggestion
            classification={classification}
            isLoading={isClassifying}
            error={classificationError}
            onAccept={handleAcceptClassification}
            onDismiss={handleDismissClassification}
            hasText={message.trim().length > 0}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!message.trim() || submitMutation.isPending}>
              {submitMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {t('requests.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
