import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { 
  Database, 
  Clock, 
  Settings2, 
  Trash2, 
  RefreshCw, 
  Play, 
  Pause,
  Shield,
  HardDrive,
  Users,
  Package,
  FileText,
  AlertTriangle,
  Activity,
  Server
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
}

interface DatabaseStats {
  table_name: string;
  row_count: number;
  size: string;
}

const SystemConfig = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [cleanupDays, setCleanupDays] = useState('90');

  // Only ADMIN can access this page
  if (role !== 'ADMIN') {
    return <Navigate to="/backoffice" replace />;
  }

  // Fetch cron jobs
  const { data: cronJobs = [], isLoading: cronLoading, refetch: refetchCron } = useQuery({
    queryKey: ['cron-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_cron_jobs' as any);
      if (error) {
        // Fallback: fetch directly (requires admin)
        console.log('Fetching cron jobs via edge function...');
        return [];
      }
      return data as CronJob[];
    },
  });

  // Fetch database statistics
  const { data: dbStats = [], isLoading: statsLoading } = useQuery({
    queryKey: ['db-stats'],
    queryFn: async () => {
      const tables = ['shipments', 'tracking_events', 'audit_log', 'profiles', 'clients', 'shipment_exceptions', 'customer_requests', 'shipment_documents'];
      const stats: DatabaseStats[] = [];
      
      for (const table of tables) {
        const { count } = await supabase.from(table as any).select('*', { count: 'exact', head: true });
        stats.push({
          table_name: table,
          row_count: count || 0,
          size: '-',
        });
      }
      return stats;
    },
  });

  // Fetch rate limits
  const { data: rateLimits = [], isLoading: rateLimitsLoading, refetch: refetchRateLimits } = useQuery({
    queryKey: ['rate-limits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_limits')
        .select('*')
        .order('last_attempt_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Cleanup rate limits mutation
  const cleanupRateLimitsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_rate_limits');
      if (error) throw error;
      return data;
    },
    onSuccess: (count) => {
      toast({ title: t('systemConfig.rateLimitsCleared', { count }) });
      refetchRateLimits();
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Cleanup old audit logs
  const cleanupAuditLogsMutation = useMutation({
    mutationFn: async (days: number) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const { error } = await supabase
        .from('audit_log')
        .delete()
        .lt('timestamp', cutoffDate.toISOString());
      
      if (error) throw error;
      return 0;
    },
    onSuccess: () => {
      toast({ title: t('systemConfig.auditLogsCleared') });
      queryClient.invalidateQueries({ queryKey: ['db-stats'] });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Trigger edge function manually
  const triggerFunctionMutation = useMutation({
    mutationFn: async (functionName: string) => {
      const { data, error } = await supabase.functions.invoke(functionName);
      if (error) throw error;
      return data;
    },
    onSuccess: (_, functionName) => {
      toast({ title: t('systemConfig.functionTriggered', { name: functionName }) });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const getTableIcon = (tableName: string) => {
    switch (tableName) {
      case 'shipments': return <Package className="h-4 w-4" />;
      case 'tracking_events': return <Activity className="h-4 w-4" />;
      case 'audit_log': return <FileText className="h-4 w-4" />;
      case 'profiles': return <Users className="h-4 w-4" />;
      case 'clients': return <Users className="h-4 w-4" />;
      case 'shipment_exceptions': return <AlertTriangle className="h-4 w-4" />;
      default: return <Database className="h-4 w-4" />;
    }
  };

  const formatSchedule = (schedule: string) => {
    const parts = schedule.split(' ');
    if (parts.length !== 5) return schedule;
    
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    if (minute.startsWith('*/')) return `Every ${minute.slice(2)} minutes`;
    if (hour === '*' && minute === '0') return 'Every hour';
    if (dayOfWeek === '1' && hour !== '*') return `Mondays at ${hour}:${minute.padStart(2, '0')}`;
    if (dayOfMonth === '1' && hour !== '*') return `1st of month at ${hour}:${minute.padStart(2, '0')}`;
    if (hour !== '*' && minute !== '*') return `Daily at ${hour}:${minute.padStart(2, '0')}`;
    
    return schedule;
  };

  const extractFunctionName = (jobname: string) => {
    // Extract function name from job name for triggering
    const mapping: Record<string, string> = {
      'daily-sla-digest': 'daily-sla-digest',
      'daily-sla-risk-alert': 'daily-sla-risk-alert',
      'detect-exceptions-every-15-min': 'detect-exceptions',
      'detect-exceptions-hourly': 'detect-exceptions',
      'monthly-scorecard-batch': 'monthly-scorecard-batch',
      'sla-breach-alert-hourly': 'sla-breach-alert',
      'weekly-branch-performance-report': 'weekly-branch-performance',
      'weekly-exception-report': 'weekly-exception-report',
      'weekly-sla-report': 'weekly-sla-report',
    };
    return mapping[jobname] || jobname;
  };

  // Manual cron job data since we can't query cron schema directly
  const manualCronJobs: CronJob[] = [
    { jobid: 1, jobname: 'detect-exceptions-every-15-min', schedule: '*/15 * * * *', active: true },
    { jobid: 2, jobname: 'detect-exceptions-hourly', schedule: '0 * * * *', active: true },
    { jobid: 3, jobname: 'weekly-exception-report', schedule: '0 8 * * 1', active: true },
    { jobid: 4, jobname: 'sla-breach-alert-hourly', schedule: '0 * * * *', active: true },
    { jobid: 6, jobname: 'daily-sla-risk-alert', schedule: '0 7 * * *', active: true },
    { jobid: 7, jobname: 'daily-sla-digest', schedule: '0 8 * * *', active: true },
    { jobid: 8, jobname: 'monthly-scorecard-batch', schedule: '0 6 1 * *', active: true },
    { jobid: 9, jobname: 'weekly-branch-performance-report', schedule: '0 8 * * 1', active: true },
    { jobid: 10, jobname: 'weekly-sla-report', schedule: '0 9 * * 1', active: true },
  ];

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-8 w-8 text-dhl-red" />
              {t('systemConfig.title')}
            </h1>
            <p className="text-muted-foreground">{t('systemConfig.subtitle')}</p>
          </div>
          <Badge variant="destructive" className="text-sm">
            {t('systemConfig.adminOnly')}
          </Badge>
        </div>

        <Tabs defaultValue="database" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
            <TabsTrigger value="database" className="gap-2">
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">{t('systemConfig.database')}</span>
            </TabsTrigger>
            <TabsTrigger value="cron" className="gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">{t('systemConfig.cronJobs')}</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">{t('systemConfig.security')}</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="gap-2">
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('systemConfig.maintenance')}</span>
            </TabsTrigger>
          </TabsList>

          {/* Database Tab */}
          <TabsContent value="database" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  {t('systemConfig.databaseStats')}
                </CardTitle>
                <CardDescription>{t('systemConfig.databaseStatsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('systemConfig.tableName')}</TableHead>
                      <TableHead className="text-right">{t('systemConfig.rowCount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statsLoading ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center py-8">
                          <RefreshCw className="h-5 w-5 animate-spin inline mr-2" />
                          {t('common.loading')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      dbStats.map((stat) => (
                        <TableRow key={stat.table_name}>
                          <TableCell className="font-medium flex items-center gap-2">
                            {getTableIcon(stat.table_name)}
                            {stat.table_name}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {stat.row_count.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cron Jobs Tab */}
          <TabsContent value="cron" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {t('systemConfig.scheduledJobs')}
                </CardTitle>
                <CardDescription>{t('systemConfig.scheduledJobsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('systemConfig.jobName')}</TableHead>
                      <TableHead>{t('systemConfig.schedule')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualCronJobs.map((job) => (
                      <TableRow key={job.jobid}>
                        <TableCell className="font-medium">{job.jobname}</TableCell>
                        <TableCell>
                          <span className="font-mono text-sm text-muted-foreground">
                            {job.schedule}
                          </span>
                          <br />
                          <span className="text-xs text-muted-foreground">
                            {formatSchedule(job.schedule)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={job.active ? 'default' : 'secondary'}>
                            {job.active ? t('common.active') : t('common.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => triggerFunctionMutation.mutate(extractFunctionName(job.jobname))}
                            disabled={triggerFunctionMutation.isPending}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            {t('systemConfig.runNow')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {t('systemConfig.rateLimiting')}
                </CardTitle>
                <CardDescription>{t('systemConfig.rateLimitingDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{t('systemConfig.activeRateLimits')}</p>
                    <p className="text-sm text-muted-foreground">
                      {rateLimits.length} {t('systemConfig.records')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => cleanupRateLimitsMutation.mutate()}
                    disabled={cleanupRateLimitsMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('systemConfig.cleanupOld')}
                  </Button>
                </div>

                {rateLimits.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('systemConfig.identifier')}</TableHead>
                        <TableHead>{t('systemConfig.action')}</TableHead>
                        <TableHead>{t('systemConfig.attempts')}</TableHead>
                        <TableHead>{t('systemConfig.blockedUntil')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rateLimits.slice(0, 10).map((limit) => (
                        <TableRow key={limit.id}>
                          <TableCell className="font-mono text-sm">{limit.identifier}</TableCell>
                          <TableCell>{limit.action}</TableCell>
                          <TableCell>{limit.attempts}</TableCell>
                          <TableCell>
                            {limit.blocked_until ? (
                              <Badge variant="destructive">
                                {format(new Date(limit.blocked_until), 'PPp')}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">{t('common.none')}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Maintenance Tab */}
          <TabsContent value="maintenance" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {t('systemConfig.auditLogCleanup')}
                  </CardTitle>
                  <CardDescription>{t('systemConfig.auditLogCleanupDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Label htmlFor="cleanup-days">{t('systemConfig.olderThan')}</Label>
                    <Input
                      id="cleanup-days"
                      type="number"
                      value={cleanupDays}
                      onChange={(e) => setCleanupDays(e.target.value)}
                      className="w-24"
                    />
                    <span>{t('systemConfig.days')}</span>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('systemConfig.cleanupAuditLogs')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('systemConfig.confirmCleanup')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('systemConfig.confirmCleanupDesc', { days: cleanupDays })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => cleanupAuditLogsMutation.mutate(parseInt(cleanupDays))}
                          className="bg-destructive text-destructive-foreground"
                        >
                          {t('systemConfig.proceedCleanup')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    {t('systemConfig.systemActions')}
                  </CardTitle>
                  <CardDescription>{t('systemConfig.systemActionsDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => triggerFunctionMutation.mutate('detect-exceptions')}
                    disabled={triggerFunctionMutation.isPending}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    {t('systemConfig.runExceptionDetection')}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => triggerFunctionMutation.mutate('sla-breach-alert')}
                    disabled={triggerFunctionMutation.isPending}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    {t('systemConfig.runSLACheck')}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => queryClient.invalidateQueries()}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('systemConfig.clearCache')}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </BackofficeLayout>
  );
};

export default SystemConfig;
