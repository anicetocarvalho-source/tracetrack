import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Package, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 12;

export default function MyShipments() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-shipments', search, page],
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
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

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

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.myShipments')}</h1>
          <p className="text-muted-foreground">{t('portal.trackShipments')}</p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            className="pl-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0); // Reset to first page on search
            }}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <p className="text-muted-foreground col-span-full">{t('common.loading')}</p>
          ) : shipments.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">{t('shipments.noShipments')}</p>
              </CardContent>
            </Card>
          ) : (
            shipments.map((shipment: any) => (
              <Link key={shipment.id} to={`/portal/shipments/${shipment.id}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold">{shipment.shipment_ref}</p>
                        <p className="text-sm text-muted-foreground">{shipment.client_ref}</p>
                      </div>
                      <StatusBadge status={shipment.current_status} />
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>BL: {shipment.bl_reference}</p>
                      <p>{shipment.containers?.length || 0} {t('shipments.containers').toLowerCase()}</p>
                      <p>{format(new Date(shipment.created_at), 'MMM d, yyyy')}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={!hasPrevPage}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('common.previous')}
            </Button>
            <span className="text-sm text-muted-foreground">
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
