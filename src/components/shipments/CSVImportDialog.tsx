import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedShipment {
  client_name: string;
  client_ref: string;
  shipment_ref: string;
  shipping_line: string;
  bl_reference: string;
  file_number?: string;
  assigned_operator?: string;
  container_numbers?: string;
  container_types?: string;
  forecast_shipping_line?: string;
  forecast_terminal?: string;
  discharge_date?: string;
  service_request_date?: string;
  docs_received_date?: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

const REQUIRED_COLUMNS = ['client_name', 'client_ref', 'shipment_ref', 'shipping_line', 'bl_reference'];

const TEMPLATE_HEADERS = [
  'client_name',
  'client_ref', 
  'shipment_ref',
  'shipping_line',
  'bl_reference',
  'file_number',
  'assigned_operator',
  'container_numbers',
  'container_types',
  'forecast_shipping_line',
  'forecast_terminal',
  'discharge_date',
  'service_request_date',
  'docs_received_date'
];

export function CSVImportDialog({ open, onOpenChange }: CSVImportDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedShipment[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  const resetState = () => {
    setFile(null);
    setParsedData([]);
    setErrors([]);
    setIsValidating(false);
    setIsImporting(false);
    setImportProgress(0);
    setImportResult(null);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const csvContent = TEMPLATE_HEADERS.join(',') + '\n' +
      'Acme Corp,AC-2024-001,SHP-001,Maersk,MSKU1234567,FILE-001,John Doe,"MSKU1234567,MSKU1234568","40HC,20GP",2024-01-15,2024-01-20,2024-01-25,2024-01-10,2024-01-08';
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shipment_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseDate = (dateStr: string | undefined): string | null => {
    if (!dateStr || dateStr.trim() === '') return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  };

  const validateData = async (data: ParsedShipment[]): Promise<ValidationError[]> => {
    const validationErrors: ValidationError[] = [];

    // Fetch all clients to validate client names
    const { data: clients } = await supabase.from('clients').select('id, name');
    const clientMap = new Map(clients?.map(c => [c.name.toLowerCase(), c.id]) || []);

    data.forEach((row, index) => {
      const rowNum = index + 2; // +2 because of header row and 0-index

      // Check required fields
      REQUIRED_COLUMNS.forEach(col => {
        if (!row[col as keyof ParsedShipment] || String(row[col as keyof ParsedShipment]).trim() === '') {
          validationErrors.push({ row: rowNum, field: col, message: `${col} is required` });
        }
      });

      // Validate client exists
      if (row.client_name && !clientMap.has(row.client_name.toLowerCase())) {
        validationErrors.push({ row: rowNum, field: 'client_name', message: `Client "${row.client_name}" not found` });
      }

      // Validate dates if provided
      const dateFields = ['forecast_shipping_line', 'forecast_terminal', 'discharge_date', 'service_request_date', 'docs_received_date'];
      dateFields.forEach(field => {
        const value = row[field as keyof ParsedShipment];
        if (value && value.trim() !== '' && !parseDate(value)) {
          validationErrors.push({ row: rowNum, field, message: `Invalid date format for ${field}` });
        }
      });

      // Validate container numbers and types match
      const containerNumbers = row.container_numbers?.split(',').filter(c => c.trim()) || [];
      const containerTypes = row.container_types?.split(',').filter(c => c.trim()) || [];
      if (containerNumbers.length > 0 && containerTypes.length > 0 && containerNumbers.length !== containerTypes.length) {
        validationErrors.push({ row: rowNum, field: 'containers', message: 'Container numbers and types count must match' });
      }
    });

    return validationErrors;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsValidating(true);
    setErrors([]);
    setParsedData([]);
    setImportResult(null);

    Papa.parse<ParsedShipment>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data;
        setParsedData(data);
        
        const validationErrors = await validateData(data);
        setErrors(validationErrors);
        setIsValidating(false);
      },
      error: (error) => {
        toast.error('Failed to parse CSV file');
        console.error('CSV parse error:', error);
        setIsValidating(false);
      }
    });
  };

  const handleImport = async () => {
    if (!user) {
      toast.error('You must be logged in to import shipments');
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    // Fetch clients for mapping
    const { data: clients } = await supabase.from('clients').select('id, name');
    const clientMap = new Map(clients?.map(c => [c.name.toLowerCase(), c.id]) || []);

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < parsedData.length; i++) {
      const row = parsedData[i];
      const clientId = clientMap.get(row.client_name.toLowerCase());

      if (!clientId) {
        failedCount++;
        continue;
      }

      try {
        // Insert shipment
        const { data: shipment, error: shipmentError } = await supabase
          .from('shipments')
          .insert({
            client_id: clientId,
            client_ref: row.client_ref,
            shipment_ref: row.shipment_ref,
            shipping_line: row.shipping_line,
            bl_reference: row.bl_reference,
            file_number: row.file_number || null,
            assigned_operator: row.assigned_operator || null,
            forecast_shipping_line: parseDate(row.forecast_shipping_line),
            forecast_terminal: parseDate(row.forecast_terminal),
            discharge_date: parseDate(row.discharge_date),
            service_request_date: parseDate(row.service_request_date),
            docs_received_date: parseDate(row.docs_received_date),
            created_by: user.id,
          })
          .select()
          .single();

        if (shipmentError) throw shipmentError;

        // Insert containers if provided
        const containerNumbers = row.container_numbers?.split(',').map(c => c.trim()).filter(Boolean) || [];
        const containerTypes = row.container_types?.split(',').map(c => c.trim()).filter(Boolean) || [];

        if (containerNumbers.length > 0 && shipment) {
          const containers = containerNumbers.map((num, idx) => ({
            shipment_id: shipment.id,
            container_number: num,
            container_type: containerTypes[idx] || '40HC', // Default type if not specified
          }));

          const { error: containerError } = await supabase
            .from('shipment_containers')
            .insert(containers);

          if (containerError) {
            console.error('Container insert error:', containerError);
          }
        }

        successCount++;
      } catch (error) {
        console.error('Import error for row:', i + 2, error);
        failedCount++;
      }

      setImportProgress(Math.round(((i + 1) / parsedData.length) * 100));
    }

    setImportResult({ success: successCount, failed: failedCount });
    setIsImporting(false);
    
    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      toast.success(`Successfully imported ${successCount} shipment(s)`);
    }
    
    if (failedCount > 0) {
      toast.error(`Failed to import ${failedCount} shipment(s)`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import Shipments from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk import shipments. Download the template for the correct format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <Button variant="outline" onClick={downloadTemplate} className="w-full">
            <Download className="w-4 h-4 mr-2" />
            Download CSV Template
          </Button>

          {/* File Upload */}
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            {file ? (
              <p className="font-medium">{file.name}</p>
            ) : (
              <p className="text-muted-foreground">Click to select a CSV file or drag and drop</p>
            )}
          </div>

          {/* Validation Status */}
          {isValidating && (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>Validating CSV data...</AlertDescription>
            </Alert>
          )}

          {/* Validation Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                <p className="font-medium mb-2">{errors.length} validation error(s) found:</p>
                <ScrollArea className="h-32">
                  <ul className="text-sm space-y-1">
                    {errors.slice(0, 10).map((error, idx) => (
                      <li key={idx}>
                        Row {error.row}: {error.message}
                      </li>
                    ))}
                    {errors.length > 10 && (
                      <li className="text-muted-foreground">...and {errors.length - 10} more errors</li>
                    )}
                  </ul>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {/* Ready to Import */}
          {parsedData.length > 0 && errors.length === 0 && !importResult && (
            <Alert className="border-green-500/50 bg-green-500/10">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <AlertDescription className="text-green-700 dark:text-green-400">
                {parsedData.length} shipment(s) ready to import
              </AlertDescription>
            </Alert>
          )}

          {/* Import Progress */}
          {isImporting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Importing shipments...</span>
                <span>{importProgress}%</span>
              </div>
              <Progress value={importProgress} />
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <Alert className={importResult.failed === 0 ? 'border-green-500/50 bg-green-500/10' : 'border-yellow-500/50 bg-yellow-500/10'}>
              <CheckCircle2 className="w-4 h-4" />
              <AlertDescription>
                Import complete: {importResult.success} succeeded, {importResult.failed} failed
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              {importResult ? 'Close' : 'Cancel'}
            </Button>
            {!importResult && (
              <Button
                onClick={handleImport}
                disabled={parsedData.length === 0 || errors.length > 0 || isImporting || isValidating}
              >
                {isImporting ? 'Importing...' : `Import ${parsedData.length} Shipment(s)`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
