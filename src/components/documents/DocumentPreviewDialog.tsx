import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Download, X, FileText, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { ShipmentDocument } from '@/types/documents';

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ShipmentDocument | null;
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  document,
}: DocumentPreviewDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  const fileExtension = document?.filename.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension);
  const isPdf = fileExtension === 'pdf';
  const isPreviewable = isImage || isPdf;

  useEffect(() => {
    if (open && document && isPreviewable) {
      loadPreview();
    }
    
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    };
  }, [open, document?.id]);

  const loadPreview = async () => {
    if (!document) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: downloadError } = await supabase.storage
        .from('shipment-documents')
        .download(document.storage_path);

      if (downloadError) throw downloadError;

      const url = URL.createObjectURL(data);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Failed to load preview:', err);
      setError(t('documents.previewError'));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!previewUrl || !document) return;
    
    const a = window.document.createElement('a');
    a.href = previewUrl;
    a.download = document.filename;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  };

  const handleClose = () => {
    setZoom(100);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="truncate pr-4">
              {document?.filename}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {isImage && previewUrl && (
                <>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setZoom(Math.max(25, zoom - 25))}
                    disabled={zoom <= 25}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground w-12 text-center">
                    {zoom}%
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setZoom(Math.min(200, zoom + 25))}
                    disabled={zoom >= 200}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
                disabled={!previewUrl}
              >
                <Download className="w-4 h-4 mr-2" />
                {t('documents.download')}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/50 p-4">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="w-16 h-16 mb-4 opacity-50" />
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && previewUrl && (
            <>
              {isImage && (
                <div className="flex items-center justify-center min-h-full">
                  <img
                    src={previewUrl}
                    alt={document?.filename}
                    className="max-w-full h-auto rounded-lg shadow-lg transition-transform"
                    style={{ transform: `scale(${zoom / 100})` }}
                  />
                </div>
              )}

              {isPdf && (
                <iframe
                  src={previewUrl}
                  className="w-full h-full rounded-lg border"
                  title={document?.filename}
                />
              )}
            </>
          )}

          {!loading && !error && !isPreviewable && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="w-16 h-16 mb-4 opacity-50" />
              <p className="mb-4">{t('documents.previewNotSupported')}</p>
              <Button onClick={handleDownload} disabled={!previewUrl}>
                <Download className="w-4 h-4 mr-2" />
                {t('documents.download')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
