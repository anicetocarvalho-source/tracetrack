import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Search, Package, Filter, Eye, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { DocumentPreviewDialog } from '@/components/documents/DocumentPreviewDialog';
import type { DocumentType } from '@/types/documents';

interface DocumentWithShipment {
  id: string;
  shipment_id: string;
  document_type: DocumentType;
  filename: string;
  storage_path: string;
  uploaded_at: string;
  visible_to_client: boolean;
  shipment: {
    shipment_ref: string;
    client_ref: string;
    current_status: string;
    shipping_line: string;
  } | null;
}

const DOCUMENT_TYPE_COLORS: Record<DocumentType, string> = {
  POD: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  BL: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  INVOICE: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  OTHER: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

export default function MyDocuments() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [previewDocument, setPreviewDocument] = useState<DocumentWithShipment | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['customer-documents', profile?.client_id],
    queryFn: async () => {
      if (!profile?.client_id) return [];

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
          shipment:shipments!inner (
            shipment_ref,
            client_ref,
            current_status,
            shipping_line,
            client_id
          )
        `)
        .eq('visible_to_client', true)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      // Filter by client_id on client side since we can't do nested filters
      return (data || []).filter((doc: any) => 
        doc.shipment?.client_id === profile.client_id
      ) as DocumentWithShipment[];
    },
    enabled: !!profile?.client_id,
  });

  const handleDownload = async (doc: DocumentWithShipment) => {
    try {
      const { data, error } = await supabase.storage
        .from('shipment-documents')
        .download(doc.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: t('documents.downloadError'),
        variant: 'destructive',
      });
    }
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = 
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.shipment?.shipment_ref.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.shipment?.client_ref.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === 'all' || doc.document_type === typeFilter;

    return matchesSearch && matchesType;
  });

  const documentCounts = {
    total: documents.length,
    POD: documents.filter(d => d.document_type === 'POD').length,
    BL: documents.filter(d => d.document_type === 'BL').length,
    INVOICE: documents.filter(d => d.document_type === 'INVOICE').length,
    OTHER: documents.filter(d => d.document_type === 'OTHER').length,
  };

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('documents.myDocuments')}</h1>
          <p className="text-muted-foreground">{t('documents.myDocumentsDesc')}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="text-2xl font-bold">{documentCounts.total}</div>
            <div className="text-sm text-muted-foreground">{t('documents.totalDocuments')}</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">{documentCounts.POD}</div>
            <div className="text-sm text-muted-foreground">{t('documents.types.POD')}</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-blue-600">{documentCounts.BL}</div>
            <div className="text-sm text-muted-foreground">{t('documents.types.BL')}</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-amber-600">{documentCounts.INVOICE}</div>
            <div className="text-sm text-muted-foreground">{t('documents.types.INVOICE')}</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-gray-600">{documentCounts.OTHER}</div>
            <div className="text-sm text-muted-foreground">{t('documents.types.OTHER')}</div>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              {t('common.filters')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('documents.searchDocuments')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder={t('documents.filterByType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="POD">{t('documents.types.POD')}</SelectItem>
                  <SelectItem value="BL">{t('documents.types.BL')}</SelectItem>
                  <SelectItem value="INVOICE">{t('documents.types.INVOICE')}</SelectItem>
                  <SelectItem value="OTHER">{t('documents.types.OTHER')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('documents.documentsList')}
            </CardTitle>
            <CardDescription>
              {t('documents.showingCount', { count: filteredDocuments.length, total: documents.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('documents.noDocuments')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('documents.filename')}</TableHead>
                      <TableHead>{t('documents.documentType')}</TableHead>
                      <TableHead>{t('documents.shipment')}</TableHead>
                      <TableHead>{t('documents.clientRef')}</TableHead>
                      <TableHead>{t('documents.uploadedAt')}</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((doc) => (
                      <TableRow key={doc.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate max-w-[200px]" title={doc.filename}>
                              {doc.filename}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={DOCUMENT_TYPE_COLORS[doc.document_type]}>
                            {t(`documents.types.${doc.document_type}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link 
                            to={`/portal/shipments/${doc.shipment_id}`}
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Package className="h-3 w-3" />
                            {doc.shipment?.shipment_ref || '-'}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {doc.shipment?.client_ref || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(doc.uploaded_at), 'dd/MM/yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPreviewDocument(doc)}
                              title={t('documents.preview')}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(doc)}
                              title={t('common.download')}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview Dialog */}
      {previewDocument && (
        <DocumentPreviewDialog
          open={!!previewDocument}
          onOpenChange={(open) => !open && setPreviewDocument(null)}
          document={{
            id: previewDocument.id,
            filename: previewDocument.filename,
            storage_path: previewDocument.storage_path,
            document_type: previewDocument.document_type,
            uploaded_at: previewDocument.uploaded_at,
            shipment_id: previewDocument.shipment_id,
            uploaded_by: '',
            visible_to_client: true,
            created_at: previewDocument.uploaded_at,
          }}
        />
      )}
    </CustomerLayout>
  );
}
