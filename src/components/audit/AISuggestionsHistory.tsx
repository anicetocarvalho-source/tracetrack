import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Brain, CheckCircle, XCircle, Eye, ChevronLeft, ChevronRight, Sparkles, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { safeFormatDate } from '@/lib/utils';
import type { AuditLog, Profile } from '@/types/database';

const AI_ACTIONS = [
  'AI_SUGGESTION_ACCEPTED',
  'AI_SUGGESTION_DISMISSED',
  'AI_CLASSIFICATION_ACCEPTED',
  'AI_CLASSIFICATION_DISMISSED',
];

const PAGE_SIZE = 20;

const AISuggestionsHistory = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['ai-suggestions-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email')
        .order('name');
      if (error) throw error;
      return data as Profile[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['ai-suggestions-history', page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .in('action', AI_ACTIONS)
        .order('timestamp', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      return { logs: data as AuditLog[], totalCount: count || 0 };
    },
  });

  const logs = data?.logs || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['ai-suggestions-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('action')
        .in('action', AI_ACTIONS);

      if (error) throw error;

      const accepted = data.filter(
        (log) => log.action === 'AI_SUGGESTION_ACCEPTED' || log.action === 'AI_CLASSIFICATION_ACCEPTED'
      ).length;
      const dismissed = data.filter(
        (log) => log.action === 'AI_SUGGESTION_DISMISSED' || log.action === 'AI_CLASSIFICATION_DISMISSED'
      ).length;
      const total = accepted + dismissed;
      const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

      return { accepted, dismissed, total, acceptanceRate };
    },
  });

  const getUserName = (userId: string | null) => {
    if (!userId) return t('common.system');
    const user = users.find((u) => u.id === userId);
    return user?.name || user?.email || t('common.unknown');
  };

  const getActionIcon = (action: string) => {
    if (action.includes('ACCEPTED')) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  const getActionBadge = (action: string) => {
    const isAccepted = action.includes('ACCEPTED');
    const isClassification = action.includes('CLASSIFICATION');
    
    return (
      <Badge variant={isAccepted ? 'default' : 'secondary'} className="gap-1">
        {getActionIcon(action)}
        {isClassification 
          ? (isAccepted ? t('aiHistory.classificationAccepted') : t('aiHistory.classificationDismissed'))
          : (isAccepted ? t('aiHistory.suggestionAccepted') : t('aiHistory.suggestionDismissed'))
        }
      </Badge>
    );
  };

  const getSuggestionType = (action: string) => {
    return action.includes('CLASSIFICATION') ? t('aiHistory.typeClassification') : t('aiHistory.typeSuggestion');
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              {t('aiHistory.totalSuggestions')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.total || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('aiHistory.accepted')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{stats?.accepted || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              {t('aiHistory.dismissed')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{stats?.dismissed || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              {t('aiHistory.acceptanceRate')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{stats?.acceptanceRate || 0}%</p>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('aiHistory.timestamp')}</TableHead>
              <TableHead>{t('aiHistory.type')}</TableHead>
              <TableHead>{t('aiHistory.decision')}</TableHead>
              <TableHead>{t('aiHistory.user')}</TableHead>
              <TableHead>{t('aiHistory.shipment')}</TableHead>
              <TableHead className="w-[80px]">{t('common.details')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <Brain className="h-5 w-5 animate-pulse" />
                    <span>{t('common.loading')}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
                    <span>{t('aiHistory.noHistory')}</span>
                    <span className="text-sm">{t('aiHistory.noHistoryDesc')}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const metadata = log.metadata_json as Record<string, unknown>;
                const shipmentRef = metadata?.shipment_ref || metadata?.shipmentRef || '-';
                
                return (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      {safeFormatDate(log.timestamp, 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Brain className="h-3 w-3" />
                        {getSuggestionType(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell>{getUserName(log.actor_user_id)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {String(shipmentRef)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              {t('common.showing')} {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} {t('common.of')} {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={!hasPrevPage}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNextPage}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              {t('aiHistory.detailsTitle')}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('aiHistory.timestamp')}</p>
                  <p className="font-mono">{safeFormatDate(selectedLog.timestamp, 'PPpp')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('aiHistory.user')}</p>
                  <p>{getUserName(selectedLog.actor_user_id)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('aiHistory.type')}</p>
                  <Badge variant="outline" className="gap-1">
                    <Brain className="h-3 w-3" />
                    {getSuggestionType(selectedLog.action)}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('aiHistory.decision')}</p>
                  {getActionBadge(selectedLog.action)}
                </div>
              </div>

              {selectedLog.metadata_json && Object.keys(selectedLog.metadata_json).length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2">{t('aiHistory.suggestionDetails')}</p>
                  <div className="bg-muted p-4 rounded-lg space-y-3">
                    {(() => {
                      const metadata = selectedLog.metadata_json as Record<string, unknown>;
                      return (
                        <>
                          {metadata.suggested_action && (
                            <div>
                              <p className="text-xs text-muted-foreground">{t('aiHistory.suggestedAction')}</p>
                              <p className="font-medium">{String(metadata.suggested_action)}</p>
                            </div>
                          )}
                          {metadata.suggested_status && (
                            <div>
                              <p className="text-xs text-muted-foreground">{t('aiHistory.suggestedStatus')}</p>
                              <Badge>{String(metadata.suggested_status)}</Badge>
                            </div>
                          )}
                          {metadata.reason && (
                            <div>
                              <p className="text-xs text-muted-foreground">{t('aiHistory.reason')}</p>
                              <p className="text-sm">{String(metadata.reason)}</p>
                            </div>
                          )}
                          {metadata.priority && (
                            <div>
                              <p className="text-xs text-muted-foreground">{t('aiHistory.priority')}</p>
                              <Badge variant="outline">{String(metadata.priority)}</Badge>
                            </div>
                          )}
                          {metadata.shipment_id && (
                            <div>
                              <p className="text-xs text-muted-foreground">{t('aiHistory.shipmentId')}</p>
                              <p className="font-mono text-xs">{String(metadata.shipment_id)}</p>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              <div>
                <p className="text-muted-foreground mb-2">{t('aiHistory.rawMetadata')}</p>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
                  {JSON.stringify(selectedLog.metadata_json, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AISuggestionsHistory;
