import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface UnreadCount {
  requestId: string;
  unreadCount: number;
}

export function useUnreadComments(requestIds: string[]) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: unreadCounts = {}, isLoading } = useQuery({
    queryKey: ['unread-comments', requestIds, user?.id],
    queryFn: async () => {
      if (!user || requestIds.length === 0) return {};

      // Get all comments for these requests
      const { data: comments, error: commentsError } = await supabase
        .from('request_comments')
        .select('id, request_id, created_at, created_by')
        .in('request_id', requestIds)
        .neq('created_by', user.id); // Exclude own comments

      if (commentsError) throw commentsError;

      // Get user's last read timestamps for these requests
      const { data: reads, error: readsError } = await supabase
        .from('request_comment_reads')
        .select('request_id, last_read_at')
        .eq('user_id', user.id)
        .in('request_id', requestIds);

      if (readsError) throw readsError;

      // Create a map of last read times
      const lastReadMap = new Map<string, Date>();
      (reads || []).forEach((r) => {
        lastReadMap.set(r.request_id, new Date(r.last_read_at));
      });

      // Count unread comments per request
      const counts: Record<string, number> = {};
      (comments || []).forEach((comment) => {
        const lastRead = lastReadMap.get(comment.request_id);
        const commentDate = new Date(comment.created_at);
        
        if (!lastRead || commentDate > lastRead) {
          counts[comment.request_id] = (counts[comment.request_id] || 0) + 1;
        }
      });

      return counts;
    },
    enabled: !!user && requestIds.length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (requestId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('request_comment_reads')
        .upsert(
          {
            request_id: requestId,
            user_id: user.id,
            last_read_at: new Date().toISOString(),
          },
          {
            onConflict: 'request_id,user_id',
          }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unread-comments'] });
    },
  });

  const getUnreadCount = (requestId: string): number => {
    return unreadCounts[requestId] || 0;
  };

  const markAsRead = (requestId: string) => {
    if (getUnreadCount(requestId) > 0) {
      markAsReadMutation.mutate(requestId);
    }
  };

  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  return {
    unreadCounts,
    getUnreadCount,
    markAsRead,
    totalUnread,
    isLoading,
  };
}
