import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Building2, Mail, TrendingUp, Users } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export function ClientStatsCharts() {
  const { t } = useTranslation();

  // Fetch clients with shipment counts and stats
  const { data: clientStats, isLoading } = useQuery({
    queryKey: ['dashboard-client-stats'],
    queryFn: async () => {
      // Fetch clients
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name, notification_emails, created_at');

      // Fetch all shipments with client info
      const { data: shipments } = await supabase
        .from('shipments')
        .select('id, client_id, current_status, created_at');

      // Calculate client stats
      const clientData = clients?.map(client => {
        const clientShipments = shipments?.filter(s => s.client_id === client.id) || [];
        const deliveredCount = clientShipments.filter(s => s.current_status === 'DELIVERED').length;
        const activeCount = clientShipments.filter(s => !['DELIVERED', 'CANCELLED'].includes(s.current_status)).length;
        const issuesCount = clientShipments.filter(s => s.current_status === 'ON_HOLD_INCIDENT').length;
        
        return {
          id: client.id,
          name: client.name.length > 20 ? client.name.slice(0, 20) + '...' : client.name,
          fullName: client.name,
          hasEmails: client.notification_emails && client.notification_emails.length > 0,
          emailCount: client.notification_emails?.length || 0,
          shipmentCount: clientShipments.length,
          deliveredCount,
          activeCount,
          issuesCount,
          createdAt: client.created_at,
        };
      }).sort((a, b) => b.shipmentCount - a.shipmentCount) || [];

      // Email configuration distribution
      const withEmails = clientData.filter(c => c.hasEmails).length;
      const withoutEmails = clientData.filter(c => !c.hasEmails).length;

      // Clients added per month (last 6 months)
      const sixMonthsAgo = subMonths(new Date(), 5);
      const monthlyData: { month: string; count: number }[] = [];
      
      for (let i = 0; i < 6; i++) {
        const monthStart = startOfMonth(subMonths(new Date(), 5 - i));
        const monthEnd = endOfMonth(monthStart);
        const count = clients?.filter(c => {
          const createdDate = new Date(c.created_at);
          return isWithinInterval(createdDate, { start: monthStart, end: monthEnd });
        }).length || 0;
        
        monthlyData.push({
          month: format(monthStart, 'MMM'),
          count,
        });
      }

      // Top clients by shipment volume
      const topClients = clientData.slice(0, 8);

      // Delivery rate by client
      const deliveryRateData = clientData
        .filter(c => c.shipmentCount > 0)
        .map(c => ({
          name: c.name,
          rate: Math.round((c.deliveredCount / c.shipmentCount) * 100),
          delivered: c.deliveredCount,
          total: c.shipmentCount,
        }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 8);

      return {
        totalClients: clients?.length || 0,
        withEmails,
        withoutEmails,
        emailDistribution: [
          { name: t('clients.withEmails'), value: withEmails },
          { name: t('clients.withoutEmails'), value: withoutEmails },
        ],
        monthlyData,
        topClients,
        deliveryRateData,
        clientData,
      };
    },
  });

  const statsCards = [
    {
      label: t('clients.totalClients'),
      value: clientStats?.totalClients || 0,
      icon: Building2,
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-500/20',
    },
    {
      label: t('clients.withEmails'),
      value: clientStats?.withEmails || 0,
      icon: Mail,
      color: 'bg-green-500/10 text-green-600 dark:text-green-400',
      iconBg: 'bg-green-500/20',
    },
    {
      label: t('clients.withoutEmails'),
      value: clientStats?.withoutEmails || 0,
      icon: Users,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-500/20',
    },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4" />
            <p>{t('common.loading')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded-lg">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t('dashboard.clientStatistics')}</h2>
          <p className="text-sm text-muted-foreground">{t('dashboard.clientStatisticsDesc')}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statsCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className={`${stat.color} border-0`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-80">{stat.label}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`${stat.iconBg} p-3 rounded-xl`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Email Configuration Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              {t('dashboard.emailConfigDistribution')}
            </CardTitle>
            <CardDescription>{t('dashboard.emailConfigDistributionDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {clientStats?.emailDistribution?.some(d => d.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clientStats.emailDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {clientStats.emailDistribution.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={index === 0 ? '#22c55e' : '#f59e0b'} 
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('clients.noClients')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Clients Added Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              {t('dashboard.clientsOverTime')}
            </CardTitle>
            <CardDescription>{t('dashboard.clientsOverTimeDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {clientStats?.monthlyData?.some(d => d.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientStats.monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [value, t('dashboard.newClients')]}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('clients.noClients')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Clients by Shipment Volume */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {t('dashboard.topClientsByVolume')}
            </CardTitle>
            <CardDescription>{t('dashboard.topClientsByVolumeDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {clientStats?.topClients?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientStats.topClients} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis 
                      type="number"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <YAxis 
                      type="category"
                      dataKey="name" 
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={100}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number, name: string, props: any) => {
                        const item = props.payload;
                        return [
                          `${value} (${item.deliveredCount} ${t('shipments.delivered').toLowerCase()}, ${item.activeCount} ${t('dashboard.active').toLowerCase()})`,
                          t('dashboard.shipments')
                        ];
                      }}
                      labelFormatter={(label) => clientStats.topClients?.find(c => c.name === label)?.fullName || label}
                    />
                    <Bar 
                      dataKey="shipmentCount" 
                      radius={[0, 4, 4, 0]}
                    >
                      {clientStats.topClients.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('clients.noClients')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Delivery Rate by Client */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              {t('dashboard.deliveryRateByClient')}
            </CardTitle>
            <CardDescription>{t('dashboard.deliveryRateByClientDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {clientStats?.deliveryRateData?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientStats.deliveryRateData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis 
                      type="number"
                      domain={[0, 100]}
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <YAxis 
                      type="category"
                      dataKey="name" 
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={100}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number, name: string, props: any) => {
                        const item = props.payload;
                        return [`${value}% (${item.delivered}/${item.total})`, t('dashboard.deliveryRate')];
                      }}
                    />
                    <Bar 
                      dataKey="rate" 
                      radius={[0, 4, 4, 0]}
                    >
                      {clientStats.deliveryRateData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.rate >= 80 ? '#22c55e' : entry.rate >= 50 ? '#f59e0b' : '#ef4444'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('clients.noClients')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
