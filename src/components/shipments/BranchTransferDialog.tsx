import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Building2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { useToast } from '@/hooks/use-toast';
import { Branch } from '@/types/database';

interface BranchTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  shipmentRef: string;
  currentBranchId: string | null;
}

export function BranchTransferDialog({
  open,
  onOpenChange,
  shipmentId,
  shipmentRef,
  currentBranchId,
}: BranchTransferDialogProps) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const { currentBranch } = useBranch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [targetBranchId, setTargetBranchId] = useState<string>('');
  const [reason, setReason] = useState('');

  // Fetch all branches the user can transfer to
  const { data: branches = [], isLoading: loadingBranches } = useQuery({
    queryKey: ['all-branches-for-transfer'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select(`
          *,
          country:countries(id, name, code)
        `)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data as (Branch & { country: { id: string; name: string; code: string } })[];
    },
    enabled: open,
  });

  // Get current branch info
  const currentBranchInfo = branches.find(b => b.id === currentBranchId);
  const targetBranchInfo = branches.find(b => b.id === targetBranchId);
  const availableBranches = branches.filter(b => b.id !== currentBranchId);

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!targetBranchId || !reason.trim()) {
        throw new Error('Missing required fields');
      }

      // Update shipment branch
      const { error: updateError } = await supabase
        .from('shipments')
        .update({
          branch_id: targetBranchId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shipmentId);

      if (updateError) throw updateError;

      // Create audit log entry for the transfer
      const { error: auditError } = await supabase
        .from('audit_log')
        .insert({
          entity_type: 'SHIPMENT',
          entity_id: shipmentId,
          action: 'BRANCH_TRANSFER',
          actor_user_id: user?.id,
          branch_id: currentBranchId,
          country_id: currentBranchInfo?.country_id || null,
          metadata_json: {
            shipment_ref: shipmentRef,
            from_branch_id: currentBranchId,
            from_branch_name: currentBranchInfo?.name || 'Unknown',
            from_branch_code: currentBranchInfo?.code || 'Unknown',
            from_country: currentBranchInfo?.country?.name || 'Unknown',
            to_branch_id: targetBranchId,
            to_branch_name: targetBranchInfo?.name || 'Unknown',
            to_branch_code: targetBranchInfo?.code || 'Unknown',
            to_country: targetBranchInfo?.country?.name || 'Unknown',
            transfer_reason: reason.trim(),
            transferred_by: profile?.name || user?.email,
            transferred_at: new Date().toISOString(),
            cross_country: currentBranchInfo?.country_id !== targetBranchInfo?.country_id,
          },
        });

      if (auditError) throw auditError;

      // Create a tracking event to record the transfer
      const { error: eventError } = await supabase
        .from('tracking_events')
        .insert({
          shipment_id: shipmentId,
          status: 'REGISTERED', // Keep current status, just log the transfer
          note: t('branchTransfer.trackingNote', {
            from: currentBranchInfo?.name || 'Unknown',
            to: targetBranchInfo?.name || 'Unknown',
            reason: reason.trim(),
          }),
          location: targetBranchInfo?.name || '',
          visible_to_client: false,
          notify_client: false,
          created_by: user?.id,
        });

      if (eventError) {
        console.error('Failed to create tracking event:', eventError);
        // Don't throw - the transfer was successful
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-events', shipmentId] });
      toast({
        title: t('branchTransfer.success'),
        description: t('branchTransfer.successDescription', {
          shipmentRef,
          branch: targetBranchInfo?.name,
        }),
      });
      handleClose();
    },
    onError: (error) => {
      console.error('Transfer error:', error);
      toast({
        title: t('branchTransfer.error'),
        description: t('branchTransfer.errorDescription'),
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    setTargetBranchId('');
    setReason('');
    onOpenChange(false);
  };

  const handleTransfer = () => {
    if (!targetBranchId || !reason.trim()) return;
    transferMutation.mutate();
  };

  const isCrossCountry = currentBranchInfo?.country_id !== targetBranchInfo?.country_id;
  const canTransfer = targetBranchId && reason.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            {t('branchTransfer.title')}
          </DialogTitle>
          <DialogDescription>
            {t('branchTransfer.description', { shipmentRef })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Branch */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('branchTransfer.currentBranch')}</Label>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">
                {currentBranchInfo?.name || t('common.notAssigned')}
              </span>
              {currentBranchInfo?.country && (
                <span className="text-muted-foreground text-sm">
                  ({currentBranchInfo.country.name})
                </span>
              )}
            </div>
          </div>

          {/* Target Branch */}
          <div className="space-y-2">
            <Label htmlFor="target-branch">{t('branchTransfer.targetBranch')} *</Label>
            <Select value={targetBranchId} onValueChange={setTargetBranchId}>
              <SelectTrigger id="target-branch">
                <SelectValue placeholder={t('branchTransfer.selectBranch')} />
              </SelectTrigger>
              <SelectContent>
                {availableBranches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    <div className="flex items-center gap-2">
                      <span>{branch.name}</span>
                      {branch.country && (
                        <span className="text-muted-foreground text-xs">
                          ({branch.country.code})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cross-country warning */}
          {/* Cross-country warning */}
          {isCrossCountry && targetBranchId && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {t('branchTransfer.crossCountryWarning')}
              </p>
            </div>
          )}

          {/* Transfer Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              {t('branchTransfer.reason')} *
              <span className="text-xs text-muted-foreground ml-2">
                ({t('common.minCharacters', { count: 10 })})
              </span>
            </Label>
            <Textarea
              id="reason"
              placeholder={t('branchTransfer.reasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {t('branchTransfer.auditNote')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!canTransfer || transferMutation.isPending}
            className="gap-2"
          >
            <ArrowRightLeft className="w-4 h-4" />
            {transferMutation.isPending
              ? t('common.processing')
              : t('branchTransfer.transfer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
