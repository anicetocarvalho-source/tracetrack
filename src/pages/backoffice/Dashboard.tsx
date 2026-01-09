import { useQuery } from '@tanstack/react-query';
import { Package, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { ShipmentStatus, STATUS_LABELS } from '@/lib/constants';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  REGISTERED: '#6b7280',
  RECEIVED: '#3b82f6',
  PROCESSING: '#8b5cf6',
  IN_TRANSIT: '#0ea5e9',
  AT_TERMINAL: '#f59e0b',
  CUSTOMS_CLEARANCE: '#ec4899',
  OUT_FOR_DELIVERY: '#14b8a6',
  DELIVERED: '#22c55e',
  ON_HOLD_INCIDENT: '#ef4444',
  CANCELLED: '#71717a',
};

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Get all shipments with dates
      const { data: shipments } = await supabase
        .from('shipments')
        .select('id, current_status, created_at, client_id');

      const statusCounts: Record<string, number> = {};
      shipments?.forEach(s => {
        statusCounts[s.current_status] = (statusCounts[s.current_status] || 0) + 1;
      });

      const totalShipments = shipments?.length || 0;
      const activeShipments = shipments?.filter(s => 
        !['DELIVERED', 'CANCELLED'].includes(s.current_status)
      ).length || 0;
      const onHoldCount = statusCounts['ON_HOLD_INCIDENT'] || 0;
      const deliveredCount = statusCounts['DELIVERED'] || 0;

      // Get recent shipments
      const { data: recentShipments } = await supabase
        .from('shipments')
        .select('id, shipment_ref, client_ref, current_status, created_at, client:clients(name)')
        .order('created_at', { ascending: false })
        .limit(5);

      // Calculate shipments over last 30 days
      const last30Days = eachDayOfInterval({
        start: subDays(new Date(), 29),
        end: new Date(),
      });

      const shipmentsOverTime = last30Days.map(day => {
        const dayStart = startOfDay(day);
        const count = shipments?.filter(s => {
          const createdDate = startOfDay(new Date(s.created_at));
          return createdDate.getTime() === dayStart.getTime();
        }).length || 0;

        return {
          date: format(day, 'MMM dd'),
          shipments: count,
        };
      });

      // Get clients with shipment counts
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name');

      const clientShipmentCounts = clients?.map(client => ({
        name: client.name.length > 15 ? client.name.slice(0, 15) + '...' : client.name,
        shipments: shipments?.filter(s => s.client_id === client.id).length || 0,
      })).filter(c => c.shipments > 0).sort((a, b) => b.shipments - a.shipments).slice(0, 8) || [];

      // Prepare pie chart data
      const pieData = Object.entries(statusCounts).map(([status, count]) => ({
        name: STATUS_LABELS[status as ShipmentStatus] || status,
        value: count,
        status,
      }));

      return {
        totalShipments,
        activeShipments,
        onHoldCount,
        deliveredCount,
        statusCounts,
        recentShipments,
        shipmentsOverTime,
        clientShipmentCounts,
        pieData,
      };
    },
  });

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your shipment operations</p>
        </div>

        {/* Stats cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Shipments</CardTitle>
              <Package className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? '...' : stats?.totalShipments}
              </div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Shipments</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? '...' : stats?.activeShipments}
              </div>
              <p className="text-xs text-muted-foreground">In progress</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">On Hold</CardTitle>
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {isLoading ? '...' : stats?.onHoldCount}
              </div>
              <p className="text-xs text-muted-foreground">Require attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Delivered</CardTitle>
              <CheckCircle className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {isLoading ? '...' : stats?.deliveredCount}
              </div>
              <p className="text-xs text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Shipments over time */}
          <Card>
            <CardHeader>
              <CardTitle>Shipments Over Time</CardTitle>
              <CardDescription>New shipments created in the last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Loading chart...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats?.shipmentsOverTime}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
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
                      />
                      <Line 
                        type="monotone" 
                        dataKey="shipments" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status distribution pie chart */}
          <Card>
            <CardHeader>
              <CardTitle>Status Distribution</CardTitle>
              <CardDescription>Current shipment status breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Loading chart...
                  </div>
                ) : stats?.pieData?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {stats.pieData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={STATUS_COLORS[entry.status] || '#6b7280'} 
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
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Client shipments bar chart */}
        <Card>
          <CardHeader>
            <CardTitle>Shipments by Client</CardTitle>
            <CardDescription>Top clients by shipment volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Loading chart...
                </div>
              ) : stats?.clientShipmentCounts?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.clientShipmentCounts} layout="vertical">
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
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={120}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar 
                      dataKey="shipments" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No client data yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent shipments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Shipments</CardTitle>
              <CardDescription>Latest shipments in the system</CardDescription>
            </div>
            <Link 
              to="/backoffice/shipments" 
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.recentShipments?.map((shipment: any) => (
                <Link
                  key={shipment.id}
                  to={`/backoffice/shipments/${shipment.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{shipment.shipment_ref}</p>
                    <p className="text-sm text-muted-foreground">
                      {shipment.client?.name} · {shipment.client_ref}
                    </p>
                  </div>
                  <StatusBadge status={shipment.current_status} />
                </Link>
              ))}
              {isLoading && <p className="text-muted-foreground">Loading...</p>}
              {!isLoading && !stats?.recentShipments?.length && (
                <p className="text-muted-foreground">No shipments yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </BackofficeLayout>
  );
}
