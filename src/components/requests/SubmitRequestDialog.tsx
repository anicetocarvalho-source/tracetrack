import { useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { RequestType, REQUEST_TYPE_LABELS } from '@/types/documents';

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

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('customer_requests').insert({
        shipment_id: shipmentId,
        request_type: requestType,
        message: message.trim(),
        created_by: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-requests', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['portal-my-requests', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['all-customer-requests'] });
      toast({ title: t('requests.requestSubmitted') });
      setOpen(false);
      setMessage('');
      setRequestType('UPDATE_REQUEST');
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
      <DialogContent>
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
