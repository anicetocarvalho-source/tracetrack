import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Shipment, Client } from '@/types/database';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

const editShipmentSchema = z.object({
  client_ref: z.string().min(1, 'Client reference is required').max(50),
  file_number: z.string().max(50).optional(),
  client_id: z.string().uuid('Please select a client'),
  assigned_operator: z.string().max(100).optional(),
  shipping_line: z.string().min(1, 'Shipping line is required').max(100),
  bl_reference: z.string().min(1, 'BL reference is required').max(100),
  forecast_shipping_line: z.string().optional(),
  forecast_terminal: z.string().optional(),
  discharge_date: z.string().optional(),
  service_request_date: z.string().optional(),
  docs_received_date: z.string().optional(),
  justification: z.string().min(10, 'Justification must be at least 10 characters').max(500),
});

type EditShipmentFormData = z.infer<typeof editShipmentSchema>;

interface EditShipmentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: Shipment & { client: { id: string; name: string } };
}

// Fields that are considered sensitive and require supervisor/manager to edit
const SENSITIVE_FIELDS = ['client_id', 'bl_reference', 'shipping_line'];

function computeDiff(
  original: Record<string, unknown>,
  updated: Record<string, unknown>,
  fields: string[]
): { field: string; before: unknown; after: unknown }[] {
  const changes: { field: string; before: unknown; after: unknown }[] = [];
  
  for (const field of fields) {
    const originalValue = original[field] ?? null;
    const updatedValue = updated[field] ?? null;
    
    // Normalize empty strings to null for comparison
    const normalizedOriginal = originalValue === '' ? null : originalValue;
    const normalizedUpdated = updatedValue === '' ? null : updatedValue;
    
    if (normalizedOriginal !== normalizedUpdated) {
      changes.push({
        field,
        before: normalizedOriginal,
        after: normalizedUpdated,
      });
    }
  }
  
  return changes;
}

export function EditShipmentDrawer({ open, onOpenChange, shipment }: EditShipmentDrawerProps) {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canEdit = role === 'SUPERVISOR' || role === 'MANAGER';

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*');
      if (error) throw error;
      const settingsMap: Record<string, string[]> = {};
      data.forEach((s) => {
        settingsMap[s.key] = Array.isArray(s.value) ? s.value : JSON.parse(s.value as string);
      });
      return settingsMap;
    },
  });

  const shippingLines = settings?.shipping_lines || [];
  const operators = settings?.operators || [];

  const form = useForm<EditShipmentFormData>({
    resolver: zodResolver(editShipmentSchema),
    defaultValues: {
      client_ref: shipment.client_ref,
      file_number: shipment.file_number || '',
      client_id: shipment.client_id,
      assigned_operator: shipment.assigned_operator || '',
      shipping_line: shipment.shipping_line,
      bl_reference: shipment.bl_reference,
      forecast_shipping_line: shipment.forecast_shipping_line || '',
      forecast_terminal: shipment.forecast_terminal || '',
      discharge_date: shipment.discharge_date || '',
      service_request_date: shipment.service_request_date || '',
      docs_received_date: shipment.docs_received_date || '',
      justification: '',
    },
  });

  // Reset form when shipment changes
  useEffect(() => {
    if (shipment) {
      form.reset({
        client_ref: shipment.client_ref,
        file_number: shipment.file_number || '',
        client_id: shipment.client_id,
        assigned_operator: shipment.assigned_operator || '',
        shipping_line: shipment.shipping_line,
        bl_reference: shipment.bl_reference,
        forecast_shipping_line: shipment.forecast_shipping_line || '',
        forecast_terminal: shipment.forecast_terminal || '',
        discharge_date: shipment.discharge_date || '',
        service_request_date: shipment.service_request_date || '',
        docs_received_date: shipment.docs_received_date || '',
        justification: '',
      });
    }
  }, [shipment, form]);

  const updateShipmentMutation = useMutation({
    mutationFn: async (data: EditShipmentFormData) => {
      const { justification, ...updateData } = data;
      
      // Compute diff between original and updated values
      const originalData = {
        client_ref: shipment.client_ref,
        file_number: shipment.file_number,
        client_id: shipment.client_id,
        assigned_operator: shipment.assigned_operator,
        shipping_line: shipment.shipping_line,
        bl_reference: shipment.bl_reference,
        forecast_shipping_line: shipment.forecast_shipping_line,
        forecast_terminal: shipment.forecast_terminal,
        discharge_date: shipment.discharge_date,
        service_request_date: shipment.service_request_date,
        docs_received_date: shipment.docs_received_date,
      };

      const fieldsToCheck = Object.keys(originalData);
      const changes = computeDiff(originalData, updateData, fieldsToCheck);
      
      if (changes.length === 0) {
        throw new Error(t('editShipment.noChanges'));
      }

      // Check if any sensitive fields were changed
      const sensitiveChanges = changes.filter(c => SENSITIVE_FIELDS.includes(c.field));
      const hasSensitiveChanges = sensitiveChanges.length > 0;

      // Update shipment
      const { error: updateError } = await supabase
        .from('shipments')
        .update({
          ...updateData,
          file_number: updateData.file_number || null,
          assigned_operator: updateData.assigned_operator || null,
          forecast_shipping_line: updateData.forecast_shipping_line || null,
          forecast_terminal: updateData.forecast_terminal || null,
          discharge_date: updateData.discharge_date || null,
          service_request_date: updateData.service_request_date || null,
          docs_received_date: updateData.docs_received_date || null,
        })
        .eq('id', shipment.id);

      if (updateError) throw updateError;

      // Create audit log with before/after diff
      const metadataJson: Json = {
        shipment_ref: shipment.shipment_ref,
        justification,
        changes: changes.map(c => ({
          field: c.field,
          before: c.before !== null && c.before !== undefined ? String(c.before) : null,
          after: c.after !== null && c.after !== undefined ? String(c.after) : null,
        })),
        sensitive_fields_changed: sensitiveChanges.map(c => c.field),
      };

      await supabase.from('audit_log').insert([{
        entity_type: 'shipment',
        entity_id: shipment.id,
        action: hasSensitiveChanges ? 'UPDATE_SENSITIVE' : 'UPDATE',
        actor_user_id: user!.id,
        metadata_json: metadataJson,
      }]);

      return { changes, hasSensitiveChanges };
    },
    onSuccess: () => {
      toast.success(t('editShipment.shipmentUpdated'));
      queryClient.invalidateQueries({ queryKey: ['shipment', shipment.id] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = async (data: EditShipmentFormData) => {
    setIsSubmitting(true);
    try {
      await updateShipmentMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canEdit) {
    return null;
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>{t('editShipment.title')}</DrawerTitle>
          <DrawerDescription>
            {t('editShipment.description')} <strong>{shipment.shipment_ref}</strong>
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="px-4 overflow-y-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Client Reference */}
                <FormField
                  control={form.control}
                  name="client_ref"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('createShipment.clientReference')} *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* File Number */}
                <FormField
                  control={form.control}
                  name="file_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('createShipment.fileNumber')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Client (Sensitive) */}
                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        {t('shipments.client')} *
                        <span className="text-xs text-destructive">({t('editShipment.sensitiveField')})</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('createShipment.selectClient')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients?.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Assigned Operator */}
                <FormField
                  control={form.control}
                  name="assigned_operator"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('shipments.assignedOperator')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('createShipment.selectOperator')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">—</SelectItem>
                          {operators.map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Shipping Line (Sensitive) */}
                <FormField
                  control={form.control}
                  name="shipping_line"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        {t('shipments.shippingLine')} *
                        <span className="text-xs text-destructive">({t('editShipment.sensitiveField')})</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('createShipment.selectShippingLine')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {shippingLines.map((line) => (
                            <SelectItem key={line} value={line}>
                              {line}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* BL Reference (Sensitive) */}
                <FormField
                  control={form.control}
                  name="bl_reference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        {t('createShipment.billOfLading')} *
                        <span className="text-xs text-destructive">({t('editShipment.sensitiveField')})</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Dates */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField
                  control={form.control}
                  name="forecast_shipping_line"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('createShipment.forecastShippingLine')}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="forecast_terminal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('createShipment.forecastTerminal')}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="discharge_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('createShipment.dischargeDate')}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="service_request_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('createShipment.serviceRequestDate')}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="docs_received_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('createShipment.docsReceivedDate')}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Justification (Required) */}
              <FormField
                control={form.control}
                name="justification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('editShipment.justification')} *</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={t('editShipment.justificationPlaceholder')}
                        className="min-h-[80px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <DrawerFooter>
          <Button 
            onClick={form.handleSubmit(onSubmit)} 
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('editShipment.saveChanges')}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">{t('common.cancel')}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
