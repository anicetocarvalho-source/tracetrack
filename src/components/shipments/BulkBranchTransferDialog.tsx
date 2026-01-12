import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Building2, AlertTriangle, Package } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Branch } from '@/types/database';

interface BulkBranchTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentIds: string[];
  onSuccess?: () => void;
}

interface ShipmentInfo {
  id: string;
  shipment_ref: string;
  branch_id: string | null;
  branch?: { id: string; name: string; country_id: string } | null;
}

export function BulkBranchTransferDialog({
  open,
  onOpenChange,
  shipmentIds,
  onSuccess,
}: BulkBranchTransferDialogProps) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  
  const [targetBranchId, setTargetBranchId] = useState<string>('');
  const [reason, setReason] = useState('');

  // Fetch shipment details
  const { data: shipments = [], isLoading: loadingShipments } = useQuery({
    queryKey: ['bulk-transfer-shipments', shipmentIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipments')
        .select(`
          id,
          shipment_ref,
          branch_id,
          branch:branches(id, name, country_id)
        `)
        .in('id', shipmentIds);
      
      if (error) throw error;
      return data as ShipmentInfo[];
    },
    enabled: open && shipmentIds.length > 0,
  });

  // Fetch all branches
  const { data: branches = [], isLoading: loadingBranches } = useQuery({
    queryKey: ['all-branches-for-bulk-transfer'],
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

  const targetBranchInfo = branches.find(b => b.id === targetBranchId);

  // Group shipments by current branch
  const shipmentsByBranch = shipments.reduce((acc, s) => {
    const branchName = s.branch?.name || t('common.notAssigned');
    if (!acc[branchName]) {
      acc[branchName] = [];
    }
    acc[branchName].push(s);
    return acc;
  }, {} as Record<string, ShipmentInfo[]>);

  // Check for cross-country transfers
  const hasCrossCountryTransfers = shipments.some(
    s => s.branch?.country_id && s.branch.country_id !== targetBranchInfo?.country_id
  );

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!targetBranchId || !reason.trim()) {
        throw new Error('Missing required fields');
      }

      const now = new Date().toISOString();
      const results: { success: string[]; failed: string[] } = { success: [], failed: [] };

      // Process each shipment
      for (const shipment of shipments) {
        try {
          const currentBranchInfo = branches.find(b => b.id === shipment.branch_id);
          
          // Update shipment branch
          const { error: updateError } = await supabase
            .from('shipments')
            .update({
              branch_id: targetBranchId,
              updated_at: now,
            })
            .eq('id', shipment.id);

          if (updateError) throw updateError;

          // Create audit log entry
          await supabase
            .from('audit_log')
            .insert({
              entity_type: 'SHIPMENT',
              entity_id: shipment.id,
              action: 'BULK_BRANCH_TRANSFER',
              actor_user_id: user?.id,
              branch_id: shipment.branch_id,
              country_id: currentBranchInfo?.country_id || null,
              metadata_json: {
                shipment_ref: shipment.shipment_ref,
                from_branch_id: shipment.branch_id,
                from_branch_name: currentBranchInfo?.name || 'Unknown',
                from_branch_code: currentBranchInfo?.code || 'Unknown',
                from_country: currentBranchInfo?.country?.name || 'Unknown',
                to_branch_id: targetBranchId,
                to_branch_name: targetBranchInfo?.name || 'Unknown',
                to_branch_code: targetBranchInfo?.code || 'Unknown',
                to_country: targetBranchInfo?.country?.name || 'Unknown',
                transfer_reason: reason.trim(),
                transferred_by: profile?.name || user?.email,
                transferred_at: now,
                cross_country: currentBranchInfo?.country_id !== targetBranchInfo?.country_id,
                bulk_transfer: true,
                total_in_batch: shipments.length,
              },
            });

          // Create tracking event
          await supabase
            .from('tracking_events')
            .insert({
              shipment_id: shipment.id,
              status: 'REGISTERED',
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

          results.success.push(shipment.shipment_ref);
        } catch (error) {
          console.error(`Failed to transfer ${shipment.shipment_ref}:`, error);
          results.failed.push(shipment.shipment_ref);
        }
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipments-stats'] });
      
      if (results.failed.length === 0) {
        toast.success(t('branchTransfer.bulkSuccess', { 
          count: results.success.length,
          branch: targetBranchInfo?.name,
        }));
      } else if (results.success.length > 0) {
        toast.warning(t('branchTransfer.bulkPartial', {
          success: results.success.length,
          failed: results.failed.length,
        }));
      } else {
        toast.error(t('branchTransfer.bulkError'));
      }
      
      handleClose();
      onSuccess?.();
    },
    onError: (error) => {
      console.error('Bulk transfer error:', error);
      toast.error(t('branchTransfer.bulkError'));
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

  const canTransfer = targetBranchId && reason.trim().length >= 10;
  const isLoading = loadingShipments || loadingBranches;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            {t('branchTransfer.bulkTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('branchTransfer.bulkDescription', { count: shipmentIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Shipments Summary */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('branchTransfer.shipmentsToTransfer')}</Label>
            <ScrollArea className="h-[120px] rounded-lg border p-3">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(shipmentsByBranch).map(([branchName, branchShipments]) => (
                    <div key={branchName}>
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{branchName}</span>
                        <Badge variant="secondary" className="text-xs">
                          {branchShipments.length}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 ml-5">
                        {branchShipments.map(s => (
                          <Badge key={s.id} variant="outline" className="text-xs">
                            <Package className="w-3 h-3 mr-1" />
                            {s.shipment_ref}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Target Branch */}
          <div className="space-y-2">
            <Label htmlFor="target-branch">{t('branchTransfer.targetBranch')} *</Label>
            <Select value={targetBranchId} onValueChange={setTargetBranchId}>
              <SelectTrigger id="target-branch">
                <SelectValue placeholder={t('branchTransfer.selectBranch')} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
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
          {hasCrossCountryTransfers && targetBranchId && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {t('branchTransfer.bulkCrossCountryWarning')}
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
              placeholder={t('branchTransfer.bulkReasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {t('branchTransfer.bulkAuditNote')}
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
              ? t('branchTransfer.transferring', { count: shipmentIds.length })
              : t('branchTransfer.transferCount', { count: shipmentIds.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
