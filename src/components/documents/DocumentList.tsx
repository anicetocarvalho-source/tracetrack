import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import {
  FileText,
  Download,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const canManage = role === 'SUPERVISOR' || role === 'MANAGER';

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

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ docId, visible }: { docId: string; visible: boolean }) => {
      const { error } = await supabase
        .from('shipment_documents')
        .update({ visible_to_client: visible })
        .eq('id', docId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment-documents', shipmentId] });
      toast({ title: t('documents.visibilityUpdated') });
    },
    onError: () => {
      toast({ title: t('documents.visibilityError'), variant: 'destructive' });
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
        <DocumentUploadDialog shipmentId={shipmentId} isCustomer={isCustomer} />
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
                {!isCustomer && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      toggleVisibilityMutation.mutate({
                        docId: doc.id,
                        visible: !doc.visible_to_client,
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
