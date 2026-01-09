import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { SHIPMENT_STATUSES, ShipmentStatus } from '@/lib/constants';
import { format } from 'date-fns';
import { CSVImportDialog } from '@/components/shipments/CSVImportDialog';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 20;

export default function Shipments() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['shipments', search, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('shipments')
        .select(`
          *,
          client:clients(id, name),
          containers:shipment_containers(id, container_number)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('current_status', statusFilter as ShipmentStatus);
      }

      if (search) {
        query = query.or(`shipment_ref.ilike.%${search}%,client_ref.ilike.%${search}%,bl_reference.ilike.%${search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { shipments: data, totalCount: count || 0 };
    },
  });

  const shipments = data?.shipments || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t('shipments.title')}</h1>
            <p className="text-muted-foreground">{t('shipments.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="w-4 h-4 mr-2" />
              {t('shipments.importCSV')}
            </Button>
            <Button onClick={() => navigate('/backoffice/shipments/new')}>
              <Plus className="w-4 h-4 mr-2" />
              {t('shipments.newShipment')}
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
                  placeholder={t('shipments.searchPlaceholder')}
                  className="pl-10"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <Select 
                value={statusFilter} 
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder={t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {SHIPMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`status.${status}`)}
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
                    <TableHead>{t('shipments.shipmentRef')}</TableHead>
                    <TableHead>{t('shipments.client')}</TableHead>
                    <TableHead>{t('shipments.shippingLine')}</TableHead>
                    <TableHead>{t('shipments.blReference')}</TableHead>
                    <TableHead>{t('shipments.containers')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('shipments.createdAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        {t('common.loading')}
                      </TableCell>
                    </TableRow>
                  ) : shipments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {t('shipments.noShipments')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    shipments.map((shipment: any) => (
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
                    onClick={() => setPage(p => p - 1)}
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
                    onClick={() => setPage(p => p + 1)}
                    disabled={!hasNextPage}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BackofficeLayout>
  );
}
