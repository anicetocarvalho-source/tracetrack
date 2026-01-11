import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, MessageCircle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { pt, enUS, fr } from 'date-fns/locale';
import { RequestStatus } from '@/types/documents';

const getLocale = (lang: string) => {
  switch (lang) {
    case 'pt': return pt;
    case 'fr': return fr;
    default: return enUS;
  }
};

interface RequestComment {
  id: string;
  request_id: string;
  message: string;
  created_by: string;
  created_at: string;
  creator?: { id: string; name: string };
}

interface RequestCommentsProps {
  requestId: string;
  requestStatus: RequestStatus;
  shipmentRef?: string;
  clientName?: string;
  requestType?: string;
}

export function RequestComments({ 
  requestId, 
  requestStatus,
  shipmentRef,
  clientName,
  requestType 
}: RequestCommentsProps) {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const locale = getLocale(i18n.language);
  
  const [newComment, setNewComment] = useState('');
  const canAddComment = requestStatus !== 'RESOLVED';

  // Fetch comments
  const { data: comments, isLoading } = useQuery({
    queryKey: ['request-comments', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('request_comments')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch creator names
      const creatorIds = [...new Set((data || []).map(c => c.created_by))];
      let creatorMap: Record<string, string> = {};
      
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', creatorIds);
        
        creatorMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.name;
          return acc;
        }, {} as Record<string, string>);
      }

      return (data || []).map(c => ({
        ...c,
        creator: { id: c.created_by, name: creatorMap[c.created_by] || 'Unknown' }
      })) as RequestComment[];
    },
  });

  // Real-time subscription for new comments
  useEffect(() => {
    const channel = supabase
      .channel(`request-comments-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'request_comments',
          filter: `request_id=eq.${requestId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['request-comments', requestId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, queryClient]);

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('request_comments')
        .insert({
          request_id: requestId,
          message: newComment.trim(),
          created_by: user.id,
        });

      if (error) throw error;

      // Send notification email to backoffice (fire and forget)
      if (shipmentRef && clientName && requestType) {
        try {
          await supabase.functions.invoke('notify-new-comment', {
            body: {
              request_id: requestId,
              shipment_ref: shipmentRef,
              client_name: clientName,
              request_type: requestType,
              comment_message: newComment.trim(),
              commenter_name: profile?.name || 'Customer',
              commenter_email: profile?.email || user.email || '',
            },
          });
          console.log('Comment notification sent successfully');
        } catch (notifyError) {
          console.error('Failed to send comment notification:', notifyError);
          // Don't throw - the comment was still created successfully
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request-comments', requestId] });
      setNewComment('');
      toast({ title: t('requests.commentAdded') });
    },
    onError: (error) => {
      console.error('Add comment error:', error);
      toast({
        title: t('requests.commentError'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      addCommentMutation.mutate();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <MessageCircle className="w-4 h-4" />
        {t('requests.comments')} ({comments?.length || 0})
      </div>

      {/* Comments list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : comments && comments.length > 0 ? (
          comments.map((comment) => (
            <div
              key={comment.id}
              className={`p-3 rounded-lg ${
                comment.created_by === user?.id
                  ? 'bg-primary/10 ml-4'
                  : 'bg-muted mr-4'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <User className="w-3 h-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {comment.creator?.name}
                      {comment.created_by === user?.id && (
                        <span className="text-muted-foreground ml-1">({t('common.you')})</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {comment.message}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('requests.noComments')}
          </p>
        )}
      </div>

      {/* Add comment form */}
      {canAddComment && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t('requests.addCommentPlaceholder')}
            rows={2}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!newComment.trim() || addCommentMutation.isPending}
            >
              {addCommentMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {t('requests.sendComment')}
            </Button>
          </div>
        </form>
      )}

      {!canAddComment && (
        <p className="text-sm text-muted-foreground text-center py-2">
          {t('requests.cannotCommentResolved')}
        </p>
      )}
    </div>
  );
}
