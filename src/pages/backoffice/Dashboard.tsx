import { useQuery } from '@tanstack/react-query';
import { Package, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { ShipmentStatus, STATUS_LABELS } from '@/lib/constants';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Get shipment counts by status
      const { data: shipments } = await supabase
        .from('shipments')
        .select('current_status');

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

      return {
        totalShipments,
        activeShipments,
        onHoldCount,
        deliveredCount,
        statusCounts,
        recentShipments,
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

        {/* Status distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Shipments by Status</CardTitle>
            <CardDescription>Distribution of shipments across different statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats?.statusCounts || {}).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2 bg-muted px-3 py-2 rounded-lg">
                  <StatusBadge status={status as ShipmentStatus} />
                  <span className="font-semibold">{count as number}</span>
                </div>
              ))}
              {isLoading && <span className="text-muted-foreground">Loading...</span>}
              {!isLoading && Object.keys(stats?.statusCounts || {}).length === 0 && (
                <span className="text-muted-foreground">No shipments yet</span>
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
