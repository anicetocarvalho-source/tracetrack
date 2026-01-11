import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sparkles, RefreshCw, Loader2, AlertCircle, ChevronDown, ChevronUp, Mail, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TimelineSummaryProps {
  shipmentId: string;
  mode: 'internal' | 'customer';
  compact?: boolean;
  clientEmails?: string[];
}

export function TimelineSummary({ shipmentId, mode, compact = false, clientEmails = [] }: TimelineSummaryProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(!compact);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>(clientEmails);
  const [isSending, setIsSending] = useState(false);

  const {
    data: summaryData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['timeline-summary', shipmentId, mode],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-timeline-summary', {
        body: { shipment_id: shipmentId, mode },
      });

      if (error) {
        console.error('Summary generation error:', error);
        throw new Error(error.message || 'Failed to generate summary');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data as {
        summary: string;
        mode: string;
        generated_at: string;
        data_points: {
          events_count: number;
          exceptions_count: number;
          sla_breaches_count: number;
        };
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (previously cacheTime)
    retry: 1,
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: t('summary.refreshed'),
        description: t('summary.refreshedDesc'),
      });
    } catch {
      toast({
        title: t('summary.refreshError'),
        variant: 'destructive',
      });
    }
  };

  const handleAddEmail = () => {
    const email = emailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email) return;
    
    if (!emailRegex.test(email)) {
      toast({
        title: t('summary.invalidEmail'),
        variant: 'destructive',
      });
      return;
    }
    
    if (recipients.includes(email)) {
      toast({
        title: t('summary.emailExists'),
        variant: 'destructive',
      });
      return;
    }
    
    setRecipients([...recipients, email]);
    setEmailInput('');
  };

  const handleRemoveEmail = (email: string) => {
    setRecipients(recipients.filter((r) => r !== email));
  };

  const handleSendEmail = async () => {
    if (recipients.length === 0) {
      toast({
        title: t('summary.noRecipients'),
        variant: 'destructive',
      });
      return;
    }

    if (!summaryData?.summary) {
      toast({
        title: t('summary.noSummary'),
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-summary-email', {
        body: {
          shipment_id: shipmentId,
          summary: summaryData.summary,
          recipient_emails: recipients,
          mode,
        },
      });

      if (error) {
        console.error('Email send error:', error);
        throw new Error(error.message || 'Failed to send email');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: t('summary.emailSent'),
        description: t('summary.emailSentDesc', { count: recipients.length }),
      });
      
      setEmailDialogOpen(false);
    } catch (err) {
      console.error('Error sending email:', err);
      toast({
        title: t('summary.emailError'),
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    }
  };

  if (isLoading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            {t('summary.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isRateLimit = errorMessage.includes('Rate limit') || errorMessage.includes('429');
    const isCredits = errorMessage.includes('credits') || errorMessage.includes('402');

    return (
      <Card className="border-destructive/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            {t('summary.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {isRateLimit
                ? t('summary.rateLimitError')
                : isCredits
                ? t('summary.creditsError')
                : t('summary.generationError')}
            </AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {t('summary.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!summaryData) return null;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            {t('summary.title')}
            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {t('summary.aiPowered')}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  disabled={!summaryData}
                >
                  <Mail className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5" />
                    {t('summary.sendEmail')}
                  </DialogTitle>
                  <DialogDescription>
                    {t('summary.sendEmailDesc')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('summary.addRecipient')}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="email"
                        type="email"
                        placeholder="email@example.com"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                      />
                      <Button type="button" variant="secondary" onClick={handleAddEmail}>
                        {t('common.add')}
                      </Button>
                    </div>
                  </div>
                  
                  {recipients.length > 0 && (
                    <div className="space-y-2">
                      <Label>{t('summary.recipients')}</Label>
                      <div className="flex flex-wrap gap-2">
                        {recipients.map((email) => (
                          <Badge
                            key={email}
                            variant="secondary"
                            className="flex items-center gap-1 pr-1"
                          >
                            {email}
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(email)}
                              className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label>{t('summary.preview')}</Label>
                    <div className="rounded-md border bg-muted/50 p-3 text-sm max-h-32 overflow-y-auto">
                      {summaryData.summary}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setEmailDialogOpen(false)}
                    disabled={isSending}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleSendEmail} disabled={isSending || recipients.length === 0}>
                    {isSending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    {t('summary.send')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
              className="h-8 px-2"
            >
              {isFetching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
            {compact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="h-8 px-2"
              >
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{summaryData.summary}</p>
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <span>
              {t('summary.basedOn', {
                events: summaryData.data_points.events_count,
              })}
            </span>
            {mode === 'internal' && summaryData.data_points.exceptions_count > 0 && (
              <span className="text-yellow-600">
                {t('summary.exceptionsCount', {
                  count: summaryData.data_points.exceptions_count,
                })}
              </span>
            )}
            {mode === 'internal' && summaryData.data_points.sla_breaches_count > 0 && (
              <span className="text-destructive">
                {t('summary.breachesCount', {
                  count: summaryData.data_points.sla_breaches_count,
                })}
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
