import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Clock, CheckCircle, Eye, MessageSquare, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCountry } from '@/hooks/useCountry';
import { useToast } from '@/hooks/use-toast';
import { SEVERITY_LABELS, SEVERITY_CLASSES, EXCEPTION_STATUS_LABELS } from '@/lib/constants';
import type { ShipmentException } from '@/types/database';
import type { ExceptionSeverity, ExceptionStatus } from '@/lib/constants';

export default function ActionRequired() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role: userRole, profile, isAdmin, isCountryAdmin } = useAuth();
  const { currentCountry } = useCountry();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get branch IDs for the selected country
  const { data: countryBranchIds = [] } = useQuery({
    queryKey: ['country-branches', currentCountry?.id],
    queryFn: async () => {
      if (!currentCountry) return [];
      const { data, error } = await supabase
        .from('branches')
        .select('id')
        .eq('country_id', currentCountry.id)
        .eq('is_active', true);
      if (error) throw error;
      return data.map(b => b.id);
    },
    enabled: !!currentCountry && (isAdmin || isCountryAdmin),
  });

  // Initialize filters from URL params
  const [severityFilter, setSeverityFilter] = useState<string>(searchParams.get('severity') || 'all');
  const [clientFilter, setClientFilter] = useState<string>(searchParams.get('client') || 'all');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'OPEN');

  // Sync URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (severityFilter !== 'all') params.set('severity', severityFilter);
    if (clientFilter !== 'all') params.set('client', clientFilter);
    if (statusFilter !== 'OPEN') params.set('status', statusFilter);
    setSearchParams(params, { replace: true });
  }, [severityFilter, clientFilter, statusFilter, setSearchParams]);
  
  const [resolveDialog, setResolveDialog] = useState<{ open: boolean; exception: ShipmentException | null }>({
    open: false,
    exception: null,
  });
  const [resolutionNote, setResolutionNote] = useState('');

  // Fetch exceptions
  const shouldFilterByCountry = (isAdmin || isCountryAdmin) && currentCountry && countryBranchIds.length > 0;

  const { data: exceptions, isLoading } = useQuery({
    queryKey: ['shipment-exceptions', severityFilter, clientFilter, statusFilter, currentCountry?.id, countryBranchIds],
    queryFn: async () => {
      let query = supabase
        .from('shipment_exceptions')
        .select(`
          *,
          shipment:shipments(id, shipment_ref, client_ref, current_status, branch_id, client:clients(id, name, branch_id)),
          exception_rule:exception_rules(id, name, description, max_hours_in_status)
        `)
        .order('detected_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as ExceptionStatus);
      }
      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter as ExceptionSeverity);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter by country (branch) if applicable
      let filtered = data || [];
      if (shouldFilterByCountry) {
        filtered = filtered.filter((e: any) => 
          e.shipment?.branch_id && countryBranchIds.includes(e.shipment.branch_id)
        );
      }

      // Client filter needs to be applied after join
      if (clientFilter !== 'all') {
        filtered = filtered.filter((e: any) => e.shipment?.client?.id === clientFilter);
      }

      return filtered as ShipmentException[];
    },
  });

  // Fetch clients for filter (filtered by country)
  const { data: clients } = useQuery({
    queryKey: ['clients-filter', currentCountry?.id, countryBranchIds],
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('id, name, branch_id')
        .order('name');
      
      if (shouldFilterByCountry) {
        query = query.in('branch_id', countryBranchIds);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
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
          shipment_ref: (exception?.shipment as any)?.shipment_ref,
          rule_name: (exception?.exception_rule as any)?.name,
          severity: exception?.severity,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment-exceptions'] });
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
          shipment_ref: (exception?.shipment as any)?.shipment_ref,
          rule_name: (exception?.exception_rule as any)?.name,
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
              shipment_ref: (exception?.shipment as any)?.shipment_ref || 'Unknown',
              client_name: (exception?.shipment as any)?.client?.name || 'Unknown Client',
              rule_name: (exception?.exception_rule as any)?.name || 'Unknown Rule',
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
      queryClient.invalidateQueries({ queryKey: ['shipment-exceptions'] });
      setResolveDialog({ open: false, exception: null });
      setResolutionNote('');
      toast({ title: t('exceptions.resolved') });
    },
    onError: () => {
      toast({ title: t('exceptions.failedToResolve'), variant: 'destructive' });
    },
  });

  const canResolve = userRole === 'SUPERVISOR' || userRole === 'MANAGER';

  // Run detection mutation
  const runDetectionMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('detect-exceptions');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shipment-exceptions'] });
      toast({ 
        title: t('exceptions.detectionComplete'),
        description: t('exceptions.exceptionsCreated', { count: data?.exceptions_created || 0 }),
      });
    },
    onError: () => {
      toast({ title: t('exceptions.detectionFailed'), variant: 'destructive' });
    },
  });

  const getTimeOverdue = (exception: ShipmentException) => {
    const rule = exception.exception_rule as any;
    if (!rule) return null;
    
    const detectedAt = new Date(exception.detected_at);
    return formatDistanceToNow(detectedAt, { addSuffix: true });
  };

  const openCount = exceptions?.filter(e => e.status === 'OPEN').length || 0;
  const acknowledgedCount = exceptions?.filter(e => e.status === 'ACKNOWLEDGED').length || 0;

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              {t('exceptions.title')}
            </h1>
            <p className="text-muted-foreground">{t('exceptions.subtitle')}</p>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => runDetectionMutation.mutate()}
              disabled={runDetectionMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${runDetectionMutation.isPending ? 'animate-spin' : ''}`} />
              {runDetectionMutation.isPending ? t('exceptions.runningDetection') : t('exceptions.runDetection')}
            </Button>
            <Badge variant="destructive" className="text-sm px-3 py-1">
              {openCount} {t('exceptions.open')}
            </Badge>
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {acknowledgedCount} {t('exceptions.acknowledgedCount')}
            </Badge>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Label>{t('common.status')}:</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    <SelectItem value="OPEN">{EXCEPTION_STATUS_LABELS.OPEN}</SelectItem>
                    <SelectItem value="ACKNOWLEDGED">{EXCEPTION_STATUS_LABELS.ACKNOWLEDGED}</SelectItem>
                    <SelectItem value="RESOLVED">{EXCEPTION_STATUS_LABELS.RESOLVED}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label>{t('exceptions.severity')}:</Label>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    <SelectItem value="P1">{SEVERITY_LABELS.P1}</SelectItem>
                    <SelectItem value="P2">{SEVERITY_LABELS.P2}</SelectItem>
                    <SelectItem value="P3">{SEVERITY_LABELS.P3}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label>{t('shipments.client')}:</Label>
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Exceptions Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('exceptions.openExceptions')}</CardTitle>
            <CardDescription>{t('exceptions.openExceptionsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
            ) : !exceptions?.length ? (
              <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p>{t('exceptions.noExceptions')}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('exceptions.severity')}</TableHead>
                    <TableHead>{t('shipments.shipmentRef')}</TableHead>
                    <TableHead>{t('shipments.client')}</TableHead>
                    <TableHead>{t('shipments.status')}</TableHead>
                    <TableHead>{t('exceptions.exceptionName')}</TableHead>
                    <TableHead>{t('exceptions.timeOverdue')}</TableHead>
                    <TableHead>{t('exceptions.exceptionStatus')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.map((exception) => {
                    const shipment = exception.shipment as any;
                    const rule = exception.exception_rule as any;
                    
                    return (
                      <TableRow 
                        key={exception.id}
                        className={exception.severity === 'P1' ? 'bg-destructive/5' : ''}
                      >
                        <TableCell>
                          <Badge className={SEVERITY_CLASSES[exception.severity as ExceptionSeverity]}>
                            {SEVERITY_LABELS[exception.severity as ExceptionSeverity]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {shipment?.shipment_ref}
                        </TableCell>
                        <TableCell>{shipment?.client?.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {t(`status.${shipment?.current_status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{rule?.name}</span>
                          {rule?.description && (
                            <p className="text-xs text-muted-foreground">{rule.description}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-orange-600">
                            <Clock className="h-4 w-4" />
                            {getTimeOverdue(exception)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={exception.status === 'OPEN' ? 'destructive' : exception.status === 'ACKNOWLEDGED' ? 'secondary' : 'default'}>
                            {EXCEPTION_STATUS_LABELS[exception.status as ExceptionStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/backoffice/shipments/${shipment?.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            
                            {exception.status === 'OPEN' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => acknowledgeMutation.mutate(exception.id)}
                                disabled={acknowledgeMutation.isPending}
                              >
                                {t('exceptions.acknowledge')}
                              </Button>
                            )}
                            
                            {(exception.status === 'OPEN' || exception.status === 'ACKNOWLEDGED') && canResolve && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => setResolveDialog({ open: true, exception })}
                              >
                                <MessageSquare className="h-4 w-4 mr-1" />
                                {t('exceptions.resolve')}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialog.open} onOpenChange={(open) => setResolveDialog({ open, exception: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('exceptions.resolveException')}</DialogTitle>
            <DialogDescription>
              {t('exceptions.resolveExceptionDesc')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>{t('shipments.shipmentRef')}:</strong>{' '}
                {(resolveDialog.exception?.shipment as any)?.shipment_ref}
              </p>
              <p className="text-sm">
                <strong>{t('exceptions.exceptionName')}:</strong>{' '}
                {(resolveDialog.exception?.exception_rule as any)?.name}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="resolution-note">{t('exceptions.resolutionNote')} *</Label>
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
              onClick={() => {
                if (resolveDialog.exception && resolutionNote.trim().length >= 10) {
                  resolveMutation.mutate({ exceptionId: resolveDialog.exception.id, note: resolutionNote });
                }
              }}
              disabled={resolutionNote.trim().length < 10 || resolveMutation.isPending}
            >
              {resolveMutation.isPending ? t('common.saving') : t('exceptions.resolve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
