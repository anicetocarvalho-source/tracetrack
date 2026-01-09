import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, ChevronDown, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { SHIPMENT_STATUSES, STATUS_LABELS, ShipmentStatus } from '@/lib/constants';
import { format } from 'date-fns';
import { CSVImportDialog } from '@/components/shipments/CSVImportDialog';

export default function Shipments() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showImportDialog, setShowImportDialog] = useState(false);

  const { data: shipments, isLoading } = useQuery({
    queryKey: ['shipments', search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('shipments')
        .select(`
          *,
          client:clients(id, name),
          containers:shipment_containers(id, container_number)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('current_status', statusFilter as ShipmentStatus);
      }

      if (search) {
        query = query.or(`shipment_ref.ilike.%${search}%,client_ref.ilike.%${search}%,bl_reference.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Shipments</h1>
            <p className="text-muted-foreground">Manage and track all shipments</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Import CSV
            </Button>
            <Button onClick={() => navigate('/backoffice/shipments/new')}>
              <Plus className="w-4 h-4 mr-2" />
              New Shipment
            </Button>
          </div>
        </div>

        <CSVImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} />

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by reference, BL, client..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {SHIPMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Shipping Line</TableHead>
                    <TableHead>BL Reference</TableHead>
                    <TableHead>Containers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Loading shipments...
                      </TableCell>
                    </TableRow>
                  ) : shipments?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No shipments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    shipments?.map((shipment: any) => (
                      <TableRow 
                        key={shipment.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/backoffice/shipments/${shipment.id}`)}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{shipment.shipment_ref}</p>
                            <p className="text-sm text-muted-foreground">{shipment.client_ref}</p>
                          </div>
                        </TableCell>
                        <TableCell>{shipment.client?.name}</TableCell>
                        <TableCell>{shipment.shipping_line}</TableCell>
                        <TableCell className="font-mono text-sm">{shipment.bl_reference}</TableCell>
                        <TableCell>{shipment.containers?.length || 0}</TableCell>
                        <TableCell>
                          <StatusBadge status={shipment.current_status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(shipment.created_at), 'MMM d, yyyy')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </BackofficeLayout>
  );
}
