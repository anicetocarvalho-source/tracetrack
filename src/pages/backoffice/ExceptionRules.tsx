import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Settings2, Plus, Pencil, Trash2 } from 'lucide-react';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { SHIPMENT_STATUSES, SEVERITY_LABELS, SEVERITY_CLASSES, EXCEPTION_SEVERITIES } from '@/lib/constants';
import type { ExceptionRule } from '@/types/database';
import type { ExceptionSeverity, ShipmentStatus } from '@/lib/constants';

export default function ExceptionRules() {
  const { t } = useTranslation();
  const { user, role: userRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editDialog, setEditDialog] = useState<{ open: boolean; rule: ExceptionRule | null }>({
    open: false,
    rule: null,
  });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status_trigger: '' as ShipmentStatus | '',
    max_hours_in_status: 24,
    applies_to_client_id: '',
    severity: 'P3' as ExceptionSeverity,
    is_active: true,
  });

  const { data: rules, isLoading } = useQuery({
    queryKey: ['exception-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exception_rules')
        .select('*, client:clients(id, name)')
        .order('severity')
        .order('name');
      if (error) throw error;
      return data as ExceptionRule[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      if (!data.status_trigger) {
        throw new Error('Status trigger is required');
      }
      
      const payload = {
        name: data.name,
        description: data.description || null,
        status_trigger: data.status_trigger as ShipmentStatus,
        max_hours_in_status: data.max_hours_in_status,
        applies_to_client_id: data.applies_to_client_id || null,
        severity: data.severity,
        is_active: data.is_active,
      };

      if (data.id) {
        const { error } = await supabase
          .from('exception_rules')
          .update(payload)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('exception_rules')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exception-rules'] });
      setEditDialog({ open: false, rule: null });
      toast({ title: t('exceptions.ruleSaved') });
    },
    onError: () => {
      toast({ title: t('exceptions.failedToSaveRule'), variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('exception_rules')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exception-rules'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('exception_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exception-rules'] });
      toast({ title: t('exceptions.ruleDeleted') });
    },
    onError: () => {
      toast({ title: t('exceptions.failedToDeleteRule'), variant: 'destructive' });
    },
  });

  const openCreateDialog = () => {
    setFormData({
      name: '',
      description: '',
      status_trigger: '',
      max_hours_in_status: 24,
      applies_to_client_id: '',
      severity: 'P3',
      is_active: true,
    });
    setEditDialog({ open: true, rule: null });
  };

  const openEditDialog = (rule: ExceptionRule) => {
    setFormData({
      name: rule.name,
      description: rule.description || '',
      status_trigger: rule.status_trigger,
      max_hours_in_status: rule.max_hours_in_status,
      applies_to_client_id: rule.applies_to_client_id || '',
      severity: rule.severity,
      is_active: rule.is_active,
    });
    setEditDialog({ open: true, rule });
  };

  const isManager = userRole === 'MANAGER';

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings2 className="h-6 w-6" />
              {t('exceptions.rulesTitle')}
            </h1>
            <p className="text-muted-foreground">{t('exceptions.rulesSubtitle')}</p>
          </div>

          {isManager && (
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              {t('exceptions.addRule')}
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('exceptions.activeRules')}</CardTitle>
            <CardDescription>{t('exceptions.activeRulesDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
            ) : !rules?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('exceptions.noRules')}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.active')}</TableHead>
                    <TableHead>{t('exceptions.severity')}</TableHead>
                    <TableHead>{t('common.name')}</TableHead>
                    <TableHead>{t('exceptions.statusTrigger')}</TableHead>
                    <TableHead>{t('exceptions.maxHours')}</TableHead>
                    <TableHead>{t('exceptions.appliesTo')}</TableHead>
                    {isManager && <TableHead className="text-right">{t('common.actions')}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id} className={!rule.is_active ? 'opacity-50' : ''}>
                      <TableCell>
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, is_active: checked })}
                          disabled={!isManager}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge className={SEVERITY_CLASSES[rule.severity]}>
                          {SEVERITY_LABELS[rule.severity]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{rule.name}</span>
                        {rule.description && (
                          <p className="text-xs text-muted-foreground">{rule.description}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{t(`status.${rule.status_trigger}`)}</Badge>
                      </TableCell>
                      <TableCell>{rule.max_hours_in_status}h</TableCell>
                      <TableCell>
                        {(rule as any).client?.name || t('exceptions.allClients')}
                      </TableCell>
                      {isManager && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(rule)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(t('exceptions.confirmDeleteRule'))) {
                                  deleteMutation.mutate(rule.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog({ open, rule: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editDialog.rule ? t('exceptions.editRule') : t('exceptions.addRule')}
            </DialogTitle>
            <DialogDescription>
              {t('exceptions.ruleFormDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('common.name')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('common.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('exceptions.statusTrigger')} *</Label>
                <Select
                  value={formData.status_trigger}
                  onValueChange={(v) => setFormData({ ...formData, status_trigger: v as ShipmentStatus })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('tracking.selectStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIPMENT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`status.${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('exceptions.severity')} *</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(v) => setFormData({ ...formData, severity: v as ExceptionSeverity })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCEPTION_SEVERITIES.map((sev) => (
                      <SelectItem key={sev} value={sev}>
                        {SEVERITY_LABELS[sev]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-hours">{t('exceptions.maxHours')} *</Label>
              <Input
                id="max-hours"
                type="number"
                min={1}
                value={formData.max_hours_in_status}
                onChange={(e) => setFormData({ ...formData, max_hours_in_status: parseInt(e.target.value) || 1 })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('exceptions.appliesTo')}</Label>
              <Select
                value={formData.applies_to_client_id}
                onValueChange={(v) => setFormData({ ...formData, applies_to_client_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('exceptions.allClients')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('exceptions.allClients')}</SelectItem>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label>{t('common.active')}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, rule: null })}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (formData.name && formData.status_trigger) {
                  saveMutation.mutate({ ...formData, id: editDialog.rule?.id });
                }
              }}
              disabled={!formData.name || !formData.status_trigger || saveMutation.isPending}
            >
              {saveMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
