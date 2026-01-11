import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DocumentType, DOCUMENT_TYPE_LABELS } from '@/types/documents';

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  isCustomer?: boolean;
}

export function DocumentUploadDialog({
  open,
  onOpenChange,
  shipmentId,
  isCustomer = false,
}: DocumentUploadDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>('OTHER');
  const [visibleToClient, setVisibleToClient] = useState(isCustomer);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !user) throw new Error('No file selected');

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${shipmentId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('shipment-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create document record
      const { error: insertError } = await supabase
        .from('shipment_documents')
        .insert({
          shipment_id: shipmentId,
          document_type: documentType,
          filename: file.name,
          storage_path: fileName,
          uploaded_by: user.id,
          visible_to_client: isCustomer ? true : visibleToClient,
        });

      if (insertError) {
        // Cleanup uploaded file on error
        await supabase.storage.from('shipment-documents').remove([fileName]);
        throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment-documents', shipmentId] });
      toast({ title: t('documents.uploadSuccess') });
      onOpenChange(false);
      setFile(null);
      setDocumentType('OTHER');
      setVisibleToClient(isCustomer);
    },
    onError: (error) => {
      console.error('Upload error:', error);
      toast({
        title: t('documents.uploadError'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      uploadMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('documents.uploadDocument')}</DialogTitle>
          <DialogDescription>
            {t('documents.uploadDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">{t('documents.selectFile')}</Label>
            <Input
              id="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t('documents.allowedFormats')}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t('documents.documentType')}</Label>
            <Select
              value={documentType}
              onValueChange={(v) => setDocumentType(v as DocumentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isCustomer && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="visible">{t('documents.visibleToClient')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('documents.visibilityDescription')}
                </p>
              </div>
              <Switch
                id="visible"
                checked={visibleToClient}
                onCheckedChange={setVisibleToClient}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!file || uploadMutation.isPending}>
              {uploadMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {t('documents.upload')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
