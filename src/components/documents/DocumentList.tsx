import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow, format } from 'date-fns';
import {
  FileText,
  Download,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  Search,
  Archive,
  Bell,
  Mail,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DocumentUploadDialog } from './DocumentUploadDialog';
import { DocumentPreviewDialog } from './DocumentPreviewDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ShipmentDocument, DOCUMENT_TYPE_LABELS, DocumentType } from '@/types/documents';

interface DocumentListProps {
  shipmentId: string;
  isCustomer?: boolean;
}

export function DocumentList({ shipmentId, isCustomer = false }: DocumentListProps) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; doc: ShipmentDocument | null }>({
    open: false,
    doc: null,
  });
  const [previewDialog, setPreviewDialog] = useState<{ open: boolean; doc: ShipmentDocument | null }>({
    open: false,
    doc: null,
  });

  const canManage = role === 'SUPERVISOR' || role === 'MANAGER';
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isNotificationHistoryOpen, setIsNotificationHistoryOpen] = useState(false);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['shipment-documents', shipmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipment_documents')
        .select('*')
        .eq('shipment_id', shipmentId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      // Fetch uploader names
      const uploaderIds = [...new Set(data?.map((d) => d.uploaded_by) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', uploaderIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return data?.map((d) => ({
        ...d,
        uploader: profileMap.get(d.uploaded_by) || null,
      })) as ShipmentDocument[];
    },
  });

  // Fetch notification history for this shipment's documents
  const { data: notificationHistory } = useQuery({
    queryKey: ['document-notifications', shipmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('entity_type', 'shipment_document')
        .eq('action', 'DOCUMENT_NOTIFICATION_SENT')
        .order('timestamp', { ascending: false });

      if (error) throw error;

      // Filter by shipment_id in metadata
      const filtered = data?.filter((log) => {
        const metadata = log.metadata_json as { shipment_id?: string } | null;
        return metadata?.shipment_id === shipmentId;
      }) || [];

      // Get actor names
      const actorIds = [...new Set(filtered.map((log) => log.actor_user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', actorIds as string[]);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return filtered.map((log) => ({
        ...log,
        actor: log.actor_user_id ? profileMap.get(log.actor_user_id) : null,
      }));
    },
    enabled: !isCustomer,
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ docId, visible, filename, documentType }: { docId: string; visible: boolean; filename: string; documentType: string }) => {
      const { error } = await supabase
        .from('shipment_documents')
        .update({ visible_to_client: visible })
        .eq('id', docId);

      if (error) throw error;

      // If making visible to client, send notification
      if (visible) {
        try {
          const { error: notifyError } = await supabase.functions.invoke('notify-document-available', {
            body: {
              documentId: docId,
              shipmentId,
              filename,
              documentType,
            },
          });

          if (notifyError) {
            console.error('Error sending document notification:', notifyError);
          }
        } catch (err) {
          console.error('Failed to send document notification:', err);
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shipment-documents', shipmentId] });
      toast({ 
        title: variables.visible 
          ? t('documents.visibilityUpdatedNotified') 
          : t('documents.visibilityUpdated') 
      });
    },
    onError: () => {
      toast({ title: t('documents.visibilityError'), variant: 'destructive' });
    },
  });

  const resendNotificationMutation = useMutation({
    mutationFn: async ({ doc }: { doc: ShipmentDocument }) => {
      const { error } = await supabase.functions.invoke('notify-document-available', {
        body: {
          documentId: doc.id,
          shipmentId,
          filename: doc.filename,
          documentType: doc.document_type,
        },
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-notifications', shipmentId] });
      toast({ title: t('documents.notificationResent') });
    },
    onError: () => {
      toast({ title: t('documents.notificationResendError'), variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: ShipmentDocument) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('shipment-documents')
        .remove([doc.storage_path]);

      if (storageError) throw storageError;

      // Delete record
      const { error } = await supabase
        .from('shipment_documents')
        .delete()
        .eq('id', doc.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment-documents', shipmentId] });
      toast({ title: t('documents.deleted') });
      setDeleteDialog({ open: false, doc: null });
    },
    onError: () => {
      toast({ title: t('documents.deleteError'), variant: 'destructive' });
    },
  });

  const handleDownload = async (doc: ShipmentDocument) => {
    const { data, error } = await supabase.storage
      .from('shipment-documents')
      .download(doc.storage_path);

    if (error) {
      toast({ title: t('documents.downloadError'), variant: 'destructive' });
      return;
    }

    // Create download link
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBulkDownload = async () => {
    setIsDownloadingZip(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        toast({ title: t('common.unauthorized'), variant: 'destructive' });
        return;
      }

      const response = await supabase.functions.invoke('bulk-download-documents', {
        body: { shipmentId },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Download failed');
      }

      // The response data is the ZIP blob
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shipment_documents.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: t('documents.bulkDownloadSuccess') });
    } catch (error) {
      console.error('Bulk download error:', error);
      toast({ title: t('documents.bulkDownloadError'), variant: 'destructive' });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {documents?.length || 0} {t('documents.documentsCount')}
        </p>
        <div className="flex items-center gap-2">
          {documents && documents.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkDownload}
              disabled={isDownloadingZip}
            >
              {isDownloadingZip ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Archive className="w-4 h-4 mr-2" />
              )}
              {t('documents.downloadAll')}
            </Button>
          )}
          <DocumentUploadDialog shipmentId={shipmentId} isCustomer={isCustomer} />
        </div>
      </div>

      {!documents || documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('documents.noDocuments')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-8 h-8 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{doc.filename}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {DOCUMENT_TYPE_LABELS[doc.document_type as DocumentType]}
                    </Badge>
                    <span>•</span>
                    <span>
                      {doc.uploader?.name || t('common.unknown')}
                    </span>
                    <span>•</span>
                    <span>
                      {formatDistanceToNow(new Date(doc.uploaded_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setPreviewDialog({ open: true, doc })}
                  title={t('documents.preview')}
                >
                  <Search className="w-4 h-4" />
                </Button>
                {!isCustomer && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      toggleVisibilityMutation.mutate({
                        docId: doc.id,
                        visible: !doc.visible_to_client,
                        filename: doc.filename,
                        documentType: doc.document_type,
                      })
                    }
                    disabled={toggleVisibilityMutation.isPending}
                    title={doc.visible_to_client ? t('documents.hideFromClient') : t('documents.showToClient')}
                  >
                    {doc.visible_to_client ? (
                      <Eye className="w-4 h-4 text-green-600" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                )}
                {!isCustomer && doc.visible_to_client && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => resendNotificationMutation.mutate({ doc })}
                    disabled={resendNotificationMutation.isPending}
                    title={t('documents.resendNotification')}
                  >
                    {resendNotificationMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-primary" />
                    )}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDownload(doc)}
                  title={t('documents.download')}
                >
                  <Download className="w-4 h-4" />
                </Button>
                {canManage && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDeleteDialog({ open: true, doc })}
                    title={t('documents.delete')}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notification History Section */}
      {!isCustomer && notificationHistory && notificationHistory.length > 0 && (
        <Collapsible
          open={isNotificationHistoryOpen}
          onOpenChange={setIsNotificationHistoryOpen}
          className="mt-6"
        >
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                <span>{t('documents.notificationHistory')}</span>
                <Badge variant="secondary">{notificationHistory.length}</Badge>
              </div>
              {isNotificationHistoryOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="border rounded-lg divide-y">
              {notificationHistory.map((notification) => {
                const metadata = notification.metadata_json as {
                  filename?: string;
                  document_type?: string;
                  recipients_count?: number;
                  recipients?: string[];
                } | null;

                return (
                  <div
                    key={notification.id}
                    className="p-3 flex items-start gap-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {metadata?.filename || t('documents.unknownDocument')}
                        </span>
                        {metadata?.document_type && (
                          <Badge variant="outline" className="text-xs">
                            {metadata.document_type}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <span>
                          {t('documents.notificationSentTo', {
                            count: metadata?.recipients_count || 0,
                          })}
                        </span>
                        {metadata?.recipients && metadata.recipients.length > 0 && (
                          <span className="ml-1">
                            ({metadata.recipients.slice(0, 3).join(', ')}
                            {metadata.recipients.length > 3 && ` +${metadata.recipients.length - 3}`})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <span>
                          {format(new Date(notification.timestamp), 'dd/MM/yyyy HH:mm')}
                        </span>
                        {notification.actor && (
                          <span className="ml-2">
                            • {t('documents.sentBy')} {notification.actor.name || notification.actor.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <DocumentPreviewDialog
        open={previewDialog.open}
        onOpenChange={(open) => setPreviewDialog({ open, doc: open ? previewDialog.doc : null })}
        document={previewDialog.doc}
      />

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, doc: open ? deleteDialog.doc : null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documents.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.deleteConfirmDescription', { filename: deleteDialog.doc?.filename })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog.doc && deleteMutation.mutate(deleteDialog.doc)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
