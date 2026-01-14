import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Upload, Loader2, Plus, X, FileText, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DocumentType, DOCUMENT_TYPE_LABELS } from '@/types/documents';
import { cn } from '@/lib/utils';

interface DocumentUploadDialogProps {
  shipmentId: string;
  isCustomer?: boolean;
}

interface FileToUpload {
  file: File;
  documentType: DocumentType;
  id: string;
}

const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function DocumentUploadDialog({
  shipmentId,
  isCustomer = false,
}: DocumentUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileToUpload[]>([]);
  const [visibleToClient, setVisibleToClient] = useState(isCustomer);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const detectDocumentType = (filename: string): DocumentType => {
    const lower = filename.toLowerCase();
    if (lower.includes('pod') || lower.includes('proof') || lower.includes('delivery')) {
      return 'POD';
    }
    if (lower.includes('bl') || lower.includes('bill') || lower.includes('lading')) {
      return 'BL';
    }
    if (lower.includes('invoice') || lower.includes('factura') || lower.includes('fatura')) {
      return 'INVOICE';
    }
    return 'OTHER';
  };

  const validateFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return t('documents.invalidFormat');
    }
    if (file.size > MAX_FILE_SIZE) {
      return t('documents.fileTooLarge');
    }
    return null;
  };

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const filesToAdd: FileToUpload[] = [];
    const errors: string[] = [];

    Array.from(newFiles).forEach((file) => {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        // Check for duplicates
        const isDuplicate = files.some((f) => f.file.name === file.name);
        if (!isDuplicate) {
          filesToAdd.push({
            file,
            documentType: detectDocumentType(file.name),
            id: crypto.randomUUID(),
          });
        }
      }
    });

    if (errors.length > 0) {
      toast({
        title: t('documents.validationErrors'),
        description: errors.join('\n'),
        variant: 'destructive',
      });
    }

    if (filesToAdd.length > 0) {
      setFiles((prev) => [...prev, ...filesToAdd]);
    }
  }, [files, t, toast]);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFileType = (id: string, type: DocumentType) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, documentType: type } : f))
    );
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    [addFiles]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (files.length === 0 || !user) throw new Error('No files selected');

      let uploaded = 0;
      setUploadProgress(0);

      for (const fileToUpload of files) {
        const { file, documentType } = fileToUpload;
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${shipmentId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('shipment-documents')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

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
          await supabase.storage.from('shipment-documents').remove([fileName]);
          throw insertError;
        }

        uploaded++;
        setUploadProgress(Math.round((uploaded / files.length) * 100));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment-documents', shipmentId] });
      toast({
        title: t('documents.uploadSuccess'),
        description: t('documents.uploadedCount', { count: files.length }),
      });
      handleClose();
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

  const handleClose = () => {
    setOpen(false);
    setFiles([]);
    setVisibleToClient(isCustomer);
    setUploadProgress(0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length > 0) {
      uploadMutation.mutate();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-2" />
          {t('documents.upload')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('documents.uploadDocument')}</DialogTitle>
          <DialogDescription>
            {t('documents.uploadDescriptionMultiple')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Drop Zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer',
              isDragging
                ? 'border-primary bg-primary/5 scale-[1.02]'
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
              uploadMutation.isPending && 'pointer-events-none opacity-50'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
              disabled={uploadMutation.isPending}
            />
            <CloudUpload className={cn(
              'w-12 h-12 mx-auto mb-3 transition-colors',
              isDragging ? 'text-primary' : 'text-muted-foreground'
            )} />
            <p className="text-sm font-medium mb-1">
              {isDragging ? t('documents.dropHere') : t('documents.dragDropOrClick')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('documents.allowedFormats')} • Max 10MB
            </p>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t('documents.selectedFiles')} ({files.length})
              </Label>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {files.map((fileItem) => (
                  <div
                    key={fileItem.id}
                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border"
                  >
                    <FileText className="w-8 h-8 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{fileItem.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(fileItem.file.size)}
                      </p>
                    </div>
                    <Select
                      value={fileItem.documentType}
                      onValueChange={(v) => updateFileType(fileItem.id, v as DocumentType)}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
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
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => removeFile(fileItem.id)}
                      disabled={uploadMutation.isPending}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isCustomer && files.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="visible" className="text-sm">{t('documents.visibleToClient')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('documents.visibilityDescription')}
                </p>
              </div>
              <Switch
                id="visible"
                checked={visibleToClient}
                onCheckedChange={setVisibleToClient}
                disabled={uploadMutation.isPending}
              />
            </div>
          )}

          {/* Progress */}
          {uploadMutation.isPending && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{t('documents.uploading')}</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
              disabled={uploadMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={files.length === 0 || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {t('documents.uploadCount', { count: files.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
