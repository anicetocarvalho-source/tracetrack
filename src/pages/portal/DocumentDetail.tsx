import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  Package, 
  Calendar, 
  Ship, 
  Eye,
  Loader2,
  ExternalLink,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { DocumentType } from '@/types/documents';
import { ShipmentStatus } from '@/lib/constants';

const DOCUMENT_TYPE_COLORS: Record<DocumentType, string> = {
  POD: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  BL: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  INVOICE: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  OTHER: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

const DOCUMENT_TYPE_DESCRIPTIONS: Record<DocumentType, string> = {
  POD: 'Proof of Delivery - Confirms successful delivery of goods',
  BL: 'Bill of Lading - Contract between shipper and carrier',
  INVOICE: 'Commercial Invoice - Details of goods and payment terms',
  OTHER: 'Other document type',
};

export default function DocumentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();

  const { data: document, isLoading } = useQuery({
    queryKey: ['document-detail', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('shipment_documents')
        .select(`
          id,
          shipment_id,
          document_type,
          filename,
          storage_path,
          uploaded_at,
          visible_to_client,
          created_at,
          shipment:shipments!inner (
            id,
            shipment_ref,
            client_ref,
            current_status,
            shipping_line,
            bl_reference,
            client_id,
            created_at,
            client:clients(name)
          )
        `)
        .eq('id', id)
        .eq('visible_to_client', true)
        .maybeSingle();

      if (error) throw error;
      
      // Verify client access
      if (data && data.shipment?.client_id !== profile?.client_id) {
        return null;
      }
      
      return data;
    },
    enabled: !!id && !!profile?.client_id,
  });

  // Get other documents from the same shipment
  const { data: relatedDocuments } = useQuery({
    queryKey: ['related-documents', document?.shipment_id],
    queryFn: async () => {
      if (!document?.shipment_id) return [];

      const { data, error } = await supabase
        .from('shipment_documents')
        .select('id, filename, document_type, uploaded_at')
        .eq('shipment_id', document.shipment_id)
        .eq('visible_to_client', true)
        .neq('id', id!)
        .order('uploaded_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data || [];
    },
    enabled: !!document?.shipment_id,
  });

  const handleDownload = async () => {
    if (!document) return;

    try {
      const { data, error } = await supabase.storage
        .from('shipment-documents')
        .download(document.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.filename;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: t('documents.downloadSuccess'),
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: t('documents.downloadError'),
        variant: 'destructive',
      });
    }
  };

  const { data: previewUrl } = useQuery({
    queryKey: ['document-preview-url', document?.storage_path],
    queryFn: async () => {
      if (!document?.storage_path) return null;

      const { data, error } = await supabase.storage
        .from('shipment-documents')
        .createSignedUrl(document.storage_path, 3600);

      if (error) throw error;
      return data?.signedUrl || null;
    },
    enabled: !!document?.storage_path,
  });

  const isPDF = document?.filename?.toLowerCase().endsWith('.pdf');
  const isImage = document?.filename?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);

  if (isLoading) {
    return (
      <CustomerLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-8 w-64" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </CustomerLayout>
    );
  }

  if (!document) {
    return (
      <CustomerLayout>
        <div className="text-center py-12">
          <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">{t('documents.documentNotFound')}</h2>
          <p className="text-muted-foreground mb-4">{t('documents.documentNotFoundDesc')}</p>
          <Button variant="outline" onClick={() => navigate('/portal/documents')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('documents.backToDocuments')}
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/portal/documents')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold truncate max-w-[300px] sm:max-w-none" title={document.filename}>
                  {document.filename}
                </h1>
                <Badge className={DOCUMENT_TYPE_COLORS[document.document_type as DocumentType]}>
                  {t(`documents.types.${document.document_type}`)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t('documents.uploadedAgo', { time: formatDistanceToNow(new Date(document.uploaded_at), { addSuffix: true }) })}
              </p>
            </div>
          </div>
          <Button onClick={handleDownload} className="shrink-0">
            <Download className="w-4 h-4 mr-2" />
            {t('common.download')}
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content - Preview */}
          <div className="lg:col-span-2 space-y-6">
            {/* Document Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  {t('documents.preview')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {previewUrl ? (
                  <div className="rounded-lg border bg-muted/30 overflow-hidden">
                    {isPDF ? (
                      <iframe
                        src={previewUrl}
                        className="w-full h-[500px]"
                        title={document.filename}
                      />
                    ) : isImage ? (
                      <div className="flex items-center justify-center p-4">
                        <img
                          src={previewUrl}
                          alt={document.filename}
                          className="max-w-full max-h-[500px] object-contain rounded"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <FileText className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-center mb-4">{t('documents.previewNotSupported')}</p>
                        <Button variant="outline" onClick={handleDownload}>
                          <Download className="w-4 h-4 mr-2" />
                          {t('documents.downloadToView')}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Document Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  {t('documents.documentInfo')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('documents.filename')}</p>
                    <p className="font-medium break-all">{document.filename}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('documents.documentType')}</p>
                    <div className="flex items-center gap-2">
                      <Badge className={DOCUMENT_TYPE_COLORS[document.document_type as DocumentType]}>
                        {t(`documents.types.${document.document_type}`)}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('documents.uploadedAt')}</p>
                    <p className="font-medium">{format(new Date(document.uploaded_at), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('documents.documentTypeDescription')}</p>
                    <p className="text-sm text-muted-foreground italic">
                      {DOCUMENT_TYPE_DESCRIPTIONS[document.document_type as DocumentType]}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Associated Shipment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {t('documents.associatedShipment')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{document.shipment?.shipment_ref}</p>
                    <p className="text-sm text-muted-foreground">{document.shipment?.client_ref}</p>
                  </div>
                  <StatusBadge status={document.shipment?.current_status as ShipmentStatus} />
                </div>
                
                <Separator />
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Ship className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('shipments.shippingLine')}:</span>
                    <span className="font-medium">{document.shipment?.shipping_line}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('shipments.blReference')}:</span>
                    <span className="font-medium font-mono">{document.shipment?.bl_reference}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('common.createdAt')}:</span>
                    <span className="font-medium">
                      {format(new Date(document.shipment?.created_at || ''), 'dd/MM/yyyy')}
                    </span>
                  </div>
                </div>
                
                <Button variant="outline" className="w-full" asChild>
                  <Link to={`/portal/shipments/${document.shipment_id}`}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {t('documents.viewShipment')}
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Related Documents */}
            {relatedDocuments && relatedDocuments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    {t('documents.otherDocuments')}
                  </CardTitle>
                  <CardDescription>
                    {t('documents.otherDocumentsDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {relatedDocuments.map((doc) => (
                      <Link
                        key={doc.id}
                        to={`/portal/documents/${doc.id}`}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(doc.uploaded_at), 'dd/MM/yyyy')}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {doc.document_type}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
