import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Package, Search } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export default function MyShipments() {
  const [search, setSearch] = useState('');

  const { data: shipments, isLoading } = useQuery({
    queryKey: ['customer-shipments', search],
    queryFn: async () => {
      let query = supabase
        .from('shipments')
        .select(`*, client:clients(name), containers:shipment_containers(id)`)
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`shipment_ref.ilike.%${search}%,client_ref.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Shipments</h1>
          <p className="text-muted-foreground">Track your shipments</p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search shipments..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <p className="text-muted-foreground col-span-full">Loading...</p>
          ) : shipments?.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No shipments found</p>
              </CardContent>
            </Card>
          ) : (
            shipments?.map((shipment: any) => (
              <Link key={shipment.id} to={`/portal/track/${shipment.id}`}>
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
                      <p>{shipment.containers?.length || 0} containers</p>
                      <p>{format(new Date(shipment.created_at), 'MMM d, yyyy')}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </CustomerLayout>
  );
}
