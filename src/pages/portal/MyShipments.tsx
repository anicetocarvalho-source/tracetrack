import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Package, Search, ChevronLeft, ChevronRight, Ship, Calendar, Hash, ArrowRight, ArrowUpDown } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { safeFormatDate } from '@/lib/utils';
import { ShipmentStatus } from '@/lib/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PAGE_SIZE = 12;

type SortOption = 'date_desc' | 'date_asc' | 'status' | 'reference';

// Status color mapping for prominent display
const getStatusAccentColor = (status: ShipmentStatus): string => {
  switch (status) {
    case 'DELIVERED':
      return 'border-l-green-500 bg-green-500/5';
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return 'border-l-blue-500 bg-blue-500/5';
    case 'ON_HOLD_INCIDENT':
      return 'border-l-destructive bg-destructive/5';
    case 'CANCELLED':
      return 'border-l-muted-foreground bg-muted/50';
    case 'CLEARANCE':
    case 'AT_TERMINAL':
      return 'border-l-orange-500 bg-orange-500/5';
    default:
      return 'border-l-primary bg-primary/5';
  }
};

export default function MyShipments() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');

  const { data, isLoading } = useQuery({
    queryKey: ['customer-shipments', search, page, sortBy],
    queryFn: async () => {
      // Only select fields that CUSTOMER is allowed to see (exclude internal fields)
      let query = supabase
        .from('shipments')
        .select(`
          id,
          shipment_ref,
          client_ref,
          bl_reference,
          shipping_line,
          current_status,
          forecast_shipping_line,
          forecast_terminal,
          discharge_date,
          created_at,
          client:clients(name),
          containers:shipment_containers(id)
        `, { count: 'exact' });

      // Apply sorting
      switch (sortBy) {
        case 'date_desc':
          query = query.order('created_at', { ascending: false });
          break;
        case 'date_asc':
          query = query.order('created_at', { ascending: true });
          break;
        case 'status':
          query = query.order('current_status', { ascending: true });
          break;
        case 'reference':
          query = query.order('shipment_ref', { ascending: true });
          break;
      }

      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) {
        query = query.or(`shipment_ref.ilike.%${search}%,client_ref.ilike.%${search}%`);
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

  const handleSortChange = (value: SortOption) => {
    setSortBy(value);
    setPage(0);
  };

  return (
    <CustomerLayout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('nav.myShipments')}</h1>
            <p className="text-muted-foreground mt-1">{t('portal.trackShipments')}</p>
          </div>
          
          {/* Search & Sort Controls */}
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Sort Select */}
            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger className="w-full sm:w-48">
                <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder={t('shipments.sortBy')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_desc">{t('shipments.sortDateDesc')}</SelectItem>
                <SelectItem value="date_asc">{t('shipments.sortDateAsc')}</SelectItem>
                <SelectItem value="status">{t('shipments.sortStatus')}</SelectItem>
                <SelectItem value="reference">{t('shipments.sortReference')}</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Search */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                className="pl-10"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        {!isLoading && shipments.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {t('common.showing')} {shipments.length} {t('common.of')} {totalCount} {t('shipments.shipments').toLowerCase()}
          </div>
        )}

        {/* Shipments Grid */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                {t('common.loading')}
              </div>
            </div>
          ) : shipments.length === 0 ? (
            <Card className="col-span-full border-dashed">
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Package className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">{t('shipments.noShipments')}</h3>
                <p className="text-sm text-muted-foreground">{t('shipments.noShipmentsDesc')}</p>
              </CardContent>
            </Card>
          ) : (
            shipments.map((shipment: any) => (
              <Link key={shipment.id} to={`/portal/shipments/${shipment.id}`}>
                <Card className={`group h-full border-l-4 transition-all hover:shadow-md hover:border-primary/50 ${getStatusAccentColor(shipment.current_status)}`}>
                  <CardContent className="p-5">
                    {/* Status Badge - Prominent at Top */}
                    <div className="mb-4">
                      <StatusBadge 
                        status={shipment.current_status} 
                        className="text-sm px-3 py-1.5 font-medium"
                      />
                    </div>
                    
                    {/* Shipment Reference - Primary Info */}
                    <div className="mb-4">
                      <h3 className="text-lg font-bold tracking-tight group-hover:text-primary transition-colors">
                        {shipment.shipment_ref}
                      </h3>
                      {shipment.client_ref && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {shipment.client_ref}
                        </p>
                      )}
                    </div>
                    
                    {/* Details Grid */}
                    <div className="space-y-2.5 text-sm">
                      <div className="flex items-center gap-2.5 text-muted-foreground">
                        <Hash className="w-4 h-4 shrink-0" />
                        <span className="truncate">BL: {shipment.bl_reference}</span>
                      </div>
                      
                      <div className="flex items-center gap-2.5 text-muted-foreground">
                        <Ship className="w-4 h-4 shrink-0" />
                        <span>{shipment.shipping_line}</span>
                      </div>
                      
                      <div className="flex items-center gap-2.5 text-muted-foreground">
                        <Package className="w-4 h-4 shrink-0" />
                        <span>{shipment.containers?.length || 0} {t('shipments.containers').toLowerCase()}</span>
                      </div>
                      
                      <div className="flex items-center gap-2.5 text-muted-foreground">
                        <Calendar className="w-4 h-4 shrink-0" />
                        <span>{safeFormatDate(shipment.created_at, 'dd MMM yyyy')}</span>
                      </div>
                    </div>
                    
                    {/* View Details Link */}
                    <div className="mt-4 pt-4 border-t flex items-center justify-end text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      {t('common.viewDetails')}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={!hasPrevPage}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('common.previous')}
            </Button>
            <span className="text-sm font-medium">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={!hasNextPage}
            >
              {t('common.next')}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
