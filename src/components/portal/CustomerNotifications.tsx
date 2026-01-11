import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Bell, FileText, Package, MessageSquare, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface Notification {
  id: string;
  type: 'document' | 'request' | 'tracking';
  title: string;
  message: string;
  shipmentRef?: string;
  shipmentId?: string;
  timestamp: string;
  read: boolean;
}

export function CustomerNotifications() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set());

  // Fetch recent documents made visible to client
  const { data: recentDocuments } = useQuery({
    queryKey: ['customer-notifications-documents', profile?.client_id],
    queryFn: async () => {
      if (!profile?.client_id) return [];

      const { data, error } = await supabase
        .from('shipment_documents')
        .select(`
          id,
          filename,
          document_type,
          uploaded_at,
          shipment_id,
          shipments!inner (
            shipment_ref,
            client_id
          )
        `)
        .eq('visible_to_client', true)
        .eq('shipments.client_id', profile.client_id)
        .gte('uploaded_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('uploaded_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.client_id,
  });

  // Fetch recent request updates
  const { data: recentRequests } = useQuery({
    queryKey: ['customer-notifications-requests', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase
        .from('customer_requests')
        .select(`
          id,
          request_type,
          status,
          resolved_at,
          created_at,
          shipment_id,
          shipments!inner (
            shipment_ref
          )
        `)
        .eq('created_by', profile.id)
        .eq('status', 'RESOLVED')
        .gte('resolved_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('resolved_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Fetch recent tracking events
  const { data: recentEvents } = useQuery({
    queryKey: ['customer-notifications-events', profile?.client_id],
    queryFn: async () => {
      if (!profile?.client_id) return [];

      const { data, error } = await supabase
        .from('tracking_events')
        .select(`
          id,
          status,
          note,
          event_datetime,
          shipment_id,
          shipments!inner (
            shipment_ref,
            client_id
          )
        `)
        .eq('visible_to_client', true)
        .eq('shipments.client_id', profile.client_id)
        .gte('event_datetime', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
        .order('event_datetime', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.client_id,
  });

  // Set up real-time subscriptions
  useEffect(() => {
    if (!profile?.client_id) return;

    const channel = supabase
      .channel('customer-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'shipment_documents',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['customer-notifications-documents'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shipment_documents',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['customer-notifications-documents'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'customer_requests',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['customer-notifications-requests'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tracking_events',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['customer-notifications-events'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.client_id, queryClient]);

  // Load read notifications from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('customer-read-notifications');
    if (stored) {
      setReadNotifications(new Set(JSON.parse(stored)));
    }
  }, []);

  // Build notifications list
  const notifications: Notification[] = [
    ...(recentDocuments?.map((doc: any) => ({
      id: `doc-${doc.id}`,
      type: 'document' as const,
      title: t('notifications.newDocument'),
      message: doc.filename,
      shipmentRef: doc.shipments?.shipment_ref,
      shipmentId: doc.shipment_id,
      timestamp: doc.uploaded_at,
      read: readNotifications.has(`doc-${doc.id}`),
    })) || []),
    ...(recentRequests?.map((req: any) => ({
      id: `req-${req.id}`,
      type: 'request' as const,
      title: t('notifications.requestResolved'),
      message: t(`requests.types.${req.request_type}`),
      shipmentRef: req.shipments?.shipment_ref,
      shipmentId: req.shipment_id,
      timestamp: req.resolved_at,
      read: readNotifications.has(`req-${req.id}`),
    })) || []),
    ...(recentEvents?.map((evt: any) => ({
      id: `evt-${evt.id}`,
      type: 'tracking' as const,
      title: t('notifications.trackingUpdate'),
      message: evt.note || t(`shipments.statuses.${evt.status}`),
      shipmentRef: evt.shipments?.shipment_ref,
      shipmentId: evt.shipment_id,
      timestamp: evt.event_datetime,
      read: readNotifications.has(`evt-${evt.id}`),
    })) || []),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    const newRead = new Set(readNotifications);
    newRead.add(id);
    setReadNotifications(newRead);
    localStorage.setItem('customer-read-notifications', JSON.stringify([...newRead]));
  };

  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    const newRead = new Set([...readNotifications, ...allIds]);
    setReadNotifications(newRead);
    localStorage.setItem('customer-read-notifications', JSON.stringify([...newRead]));
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'document':
        return <FileText className="w-4 h-4 text-blue-500" />;
      case 'request':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'tracking':
        return <Package className="w-4 h-4 text-orange-500" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold text-sm">{t('notifications.title')}</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto py-1"
              onClick={markAllAsRead}
            >
              {t('notifications.markAllRead')}
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">{t('notifications.noNotifications')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 20).map((notification) => (
                <Link
                  key={notification.id}
                  to={notification.shipmentId ? `/portal/tracking/${notification.shipmentId}` : '/portal'}
                  onClick={() => {
                    markAsRead(notification.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors",
                    !notification.read && "bg-primary/5"
                  )}
                >
                  <div className="mt-0.5">{getIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "text-sm truncate",
                        !notification.read && "font-medium"
                      )}>
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {notification.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {notification.shipmentRef && (
                        <Badge variant="outline" className="text-xs py-0">
                          {notification.shipmentRef}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
