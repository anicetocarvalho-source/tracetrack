import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  AlertTriangle,
  FileText,
  Users,
  Search,
  Clock,
  TrendingUp,
  X,
  Check,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { ShipmentStatus, STATUS_LABELS } from '@/lib/constants';

interface AINextActionSuggestionProps {
  shipmentId: string;
  shipmentRef: string;
  currentStatus: ShipmentStatus;
  clientName: string;
  clientRef: string;
  shippingLine: string;
  blReference: string;
  createdAt: string;
  lastEvent?: {
    status: ShipmentStatus;
    note: string;
    event_datetime: string;
    location?: string;
  };
  openExceptions: Array<{
    rule_name: string;
    severity: string;
    detected_at: string;
    status: string;
  }>;
  slaInfo?: {
    current_status: string;
    entered_at: string;
    max_hours?: number;
    elapsed_hours?: number;
    breached?: boolean;
  };
  onApplySuggestion: (status: ShipmentStatus | null, note: string) => void;
}

interface Suggestion {
  recommended_status: string | null;
  recommended_action: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  action_type: 'status_change' | 'escalate' | 'request_docs' | 'inform_client' | 'investigate' | 'wait';
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  status_change: ArrowRight,
  escalate: AlertTriangle,
  request_docs: FileText,
  inform_client: Users,
  investigate: Search,
  wait: Clock,
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
  medium: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
  low: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
};

export function AINextActionSuggestion({
  shipmentId,
  shipmentRef,
  currentStatus,
  clientName,
  clientRef,
  shippingLine,
  blReference,
  createdAt,
  lastEvent,
  openExceptions,
  slaInfo,
  onApplySuggestion,
}: AINextActionSuggestionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDismissed, setIsDismissed] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['ai-suggestion', shipmentId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('suggest-next-action', {
        body: {
          shipment_data: {
            shipment_ref: shipmentRef,
            client_ref: clientRef,
            current_status: currentStatus,
            client_name: clientName,
            shipping_line: shippingLine,
            bl_reference: blReference,
            created_at: createdAt,
            last_event: lastEvent ? {
              status: lastEvent.status,
              note: lastEvent.note,
              event_datetime: lastEvent.event_datetime,
              location: lastEvent.location,
            } : undefined,
            open_exceptions: openExceptions.map(e => ({
              rule_name: e.rule_name,
              severity: e.severity,
              detected_at: e.detected_at,
              status: e.status,
            })),
            sla_info: slaInfo,
          }
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data as { suggestion: Suggestion; generated_at: string };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    enabled: !isDismissed,
  });

  // Mutation for logging acceptance
  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!data?.suggestion) return;

      // Log to audit
      const metadata = {
        shipment_ref: shipmentRef,
        suggestion: {
          recommended_status: data.suggestion.recommended_status,
          recommended_action: data.suggestion.recommended_action,
          reason: data.suggestion.reason,
          priority: data.suggestion.priority,
          action_type: data.suggestion.action_type,
        },
        generated_at: data.generated_at,
      };
      
      await supabase.from('audit_log').insert({
        entity_type: 'AI_SUGGESTION',
        entity_id: shipmentId,
        action: 'AI_SUGGESTION_ACCEPTED',
        actor_user_id: user?.id,
        metadata_json: metadata,
      });

      // Call the parent handler to apply the suggestion
      onApplySuggestion(
        data.suggestion.recommended_status as ShipmentStatus | null,
        `[AI Suggestion] ${data.suggestion.recommended_action}`
      );
    },
    onSuccess: () => {
      toast({ title: t('aiSuggestion.applied') });
      queryClient.invalidateQueries({ queryKey: ['ai-suggestion', shipmentId] });
    },
    onError: () => {
      toast({ title: t('aiSuggestion.applyError'), variant: 'destructive' });
    },
  });

  // Mutation for logging dismissal
  const dismissMutation = useMutation({
    mutationFn: async () => {
      if (!data?.suggestion) return;

      // Log to audit
      const metadata = {
        shipment_ref: shipmentRef,
        suggestion: {
          recommended_status: data.suggestion.recommended_status,
          recommended_action: data.suggestion.recommended_action,
          reason: data.suggestion.reason,
          priority: data.suggestion.priority,
          action_type: data.suggestion.action_type,
        },
        generated_at: data.generated_at,
      };

      await supabase.from('audit_log').insert({
        entity_type: 'AI_SUGGESTION',
        entity_id: shipmentId,
        action: 'AI_SUGGESTION_DISMISSED',
        actor_user_id: user?.id,
        metadata_json: metadata,
      });
    },
    onSuccess: () => {
      setIsDismissed(true);
    },
  });

  if (isDismissed) {
    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        className="flex items-center justify-center py-3"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsDismissed(false);
            refetch();
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {t('aiSuggestion.showAgain')}
        </Button>
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 animate-pulse">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm font-medium">{t('aiSuggestion.analyzing')}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('aiSuggestion.analyzingDesc')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.suggestion) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Sparkles className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t('aiSuggestion.unavailable')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {error?.message || t('aiSuggestion.tryAgain')}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const suggestion = data.suggestion;
  const ActionIcon = ACTION_ICONS[suggestion.action_type] || TrendingUp;
  const priorityStyle = PRIORITY_STYLES[suggestion.priority] || PRIORITY_STYLES.medium;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <Card className={cn(
          "relative overflow-hidden border-2",
          priorityStyle.border,
          priorityStyle.bg
        )}>
          {/* Gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/50 to-transparent" />
          
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={cn("p-2.5 rounded-xl", priorityStyle.bg)}>
                    <Sparkles className={cn("w-5 h-5", priorityStyle.text)} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold">{t('aiSuggestion.title')}</h4>
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs", priorityStyle.text, priorityStyle.border)}
                      >
                        {t(`aiSuggestion.priority.${suggestion.priority}`)}
                      </Badge>
                      <Badge 
                        variant="secondary" 
                        className="text-xs gap-1"
                      >
                        <ActionIcon className="w-3 h-3" />
                        {t(`aiSuggestion.actionType.${suggestion.action_type}`)}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => refetch()}
                    disabled={isFetching}
                  >
                    <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => dismissMutation.mutate()}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Action Recommendation */}
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <ActionIcon className={cn("w-4 h-4 mt-0.5 shrink-0", priorityStyle.text)} />
                  <p className="text-sm font-medium leading-relaxed">
                    {suggestion.recommended_action}
                  </p>
                </div>
                
                {suggestion.recommended_status && (
                  <div className="flex items-center gap-2 pl-6">
                    <span className="text-xs text-muted-foreground">{t('aiSuggestion.recommendedStatus')}:</span>
                    <Badge variant="outline" className="text-xs">
                      {STATUS_LABELS[suggestion.recommended_status as ShipmentStatus] || suggestion.recommended_status}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Reason */}
              <div className="pl-6 text-xs text-muted-foreground bg-background/50 rounded-lg p-3 border border-border/50">
                <span className="font-medium text-foreground">{t('aiSuggestion.reason')}:</span>{' '}
                {suggestion.reason}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dismissMutation.mutate()}
                  disabled={dismissMutation.isPending}
                >
                  <X className="w-4 h-4 mr-1" />
                  {t('aiSuggestion.dismiss')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending}
                  className="shadow-md"
                >
                  {acceptMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-1" />
                  )}
                  {t('aiSuggestion.apply')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}