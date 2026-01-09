import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Plus, Trash2, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormDescription,
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
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CONTAINER_TYPES } from '@/lib/constants';
import { Client } from '@/types/database';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const containerSchema = z.object({
  container_number: z.string().min(1, 'Container number is required').max(20),
  container_type: z.string().min(1, 'Container type is required'),
});

const shipmentSchema = z.object({
  // Step 1: Identification
  shipment_ref: z.string().min(1, 'Shipment reference is required').max(50),
  client_ref: z.string().min(1, 'Client reference is required').max(50),
  file_number: z.string().max(50).optional(),
  // Step 2: Client & Responsible
  client_id: z.string().uuid('Please select a client'),
  assigned_operator: z.string().max(100).optional(),
  // Step 3: Transport
  shipping_line: z.string().min(1, 'Shipping line is required').max(100),
  bl_reference: z.string().min(1, 'BL reference is required').max(100),
  // Step 4: Containers
  containers: z.array(containerSchema).min(1, 'At least one container is required'),
  // Step 5: Dates
  forecast_shipping_line: z.string().optional(),
  forecast_terminal: z.string().optional(),
  discharge_date: z.string().optional(),
  service_request_date: z.string().optional(),
  docs_received_date: z.string().optional(),
  // Step 6: Initial note
  initial_note: z.string().max(2000).optional(),
  visible_to_client: z.boolean(),
  notify_client: z.boolean(),
});

type ShipmentFormData = z.infer<typeof shipmentSchema>;

const steps = [
  { id: 1, title: 'Identification', description: 'Reference numbers' },
  { id: 2, title: 'Client', description: 'Client & operator' },
  { id: 3, title: 'Transport', description: 'Shipping details' },
  { id: 4, title: 'Containers', description: 'Container list' },
  { id: 5, title: 'Dates', description: 'Forecasts & dates' },
  { id: 6, title: 'Notes', description: 'Initial event' },
];

export default function CreateShipment() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);

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

  const form = useForm<ShipmentFormData>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: {
      shipment_ref: '',
      client_ref: '',
      file_number: '',
      client_id: '',
      assigned_operator: '',
      shipping_line: '',
      bl_reference: '',
      containers: [{ container_number: '', container_type: '' }],
      forecast_shipping_line: '',
      forecast_terminal: '',
      discharge_date: '',
      service_request_date: '',
      docs_received_date: '',
      initial_note: '',
      visible_to_client: false,
      notify_client: true,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'containers',
  });

  const createShipmentMutation = useMutation({
    mutationFn: async (data: ShipmentFormData) => {
      // Create shipment
      const { data: shipment, error: shipmentError } = await supabase
        .from('shipments')
        .insert({
          shipment_ref: data.shipment_ref,
          client_ref: data.client_ref,
          file_number: data.file_number || null,
          client_id: data.client_id,
          assigned_operator: data.assigned_operator || null,
          shipping_line: data.shipping_line,
          bl_reference: data.bl_reference,
          forecast_shipping_line: data.forecast_shipping_line || null,
          forecast_terminal: data.forecast_terminal || null,
          discharge_date: data.discharge_date || null,
          service_request_date: data.service_request_date || null,
          docs_received_date: data.docs_received_date || null,
          current_status: 'REGISTERED',
          created_by: user!.id,
        })
        .select()
        .single();

      if (shipmentError) throw shipmentError;

      // Create containers
      const containersToInsert = data.containers.map((c) => ({
        shipment_id: shipment.id,
        container_number: c.container_number,
        container_type: c.container_type,
      }));

      const { error: containerError } = await supabase
        .from('shipment_containers')
        .insert(containersToInsert);

      if (containerError) throw containerError;

      // Create initial tracking event
      const { error: eventError } = await supabase.from('tracking_events').insert({
        shipment_id: shipment.id,
        status: 'REGISTERED',
        note: data.initial_note || 'Shipment registered',
        visible_to_client: data.visible_to_client,
        notify_client: data.notify_client,
        created_by: user!.id,
      });

      if (eventError) throw eventError;

      // Create audit log
      await supabase.from('audit_log').insert({
        entity_type: 'shipment',
        entity_id: shipment.id,
        action: 'CREATE',
        actor_user_id: user!.id,
        metadata_json: {
          shipment_ref: data.shipment_ref,
          client_id: data.client_id,
          containers_count: data.containers.length,
        },
      });

      return shipment;
    },
    onSuccess: (shipment) => {
      toast.success('Shipment created successfully');
      navigate(`/backoffice/shipments/${shipment.id}`);
    },
    onError: (error) => {
      toast.error('Failed to create shipment: ' + error.message);
    },
  });

  const validateCurrentStep = async () => {
    const fieldsToValidate: (keyof ShipmentFormData)[][] = [
      ['shipment_ref', 'client_ref', 'file_number'],
      ['client_id', 'assigned_operator'],
      ['shipping_line', 'bl_reference'],
      ['containers'],
      ['forecast_shipping_line', 'forecast_terminal', 'discharge_date', 'service_request_date', 'docs_received_date'],
      ['initial_note', 'visible_to_client', 'notify_client'],
    ];

    const result = await form.trigger(fieldsToValidate[currentStep - 1]);
    return result;
  };

  const handleNext = async () => {
    const isValid = await validateCurrentStep();
    if (isValid && currentStep < 6) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = (data: ShipmentFormData) => {
    createShipmentMutation.mutate(data);
  };

  return (
    <BackofficeLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/backoffice/shipments')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Shipment</h1>
            <p className="text-muted-foreground">Add a new shipment to the system</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between overflow-x-auto pb-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                  currentStep === step.id
                    ? 'bg-primary text-primary-foreground'
                    : currentStep > step.id
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
                onClick={() => {
                  if (step.id < currentStep) setCurrentStep(step.id);
                }}
              >
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                    currentStep > step.id ? 'bg-primary text-primary-foreground' : 'bg-background'
                  )}
                >
                  {currentStep > step.id ? <Check className="w-3 h-3" /> : step.id}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium">{step.title}</p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'w-8 h-0.5 mx-1',
                    currentStep > step.id ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card>
              <CardHeader>
                <CardTitle>{steps[currentStep - 1].title}</CardTitle>
                <CardDescription>{steps[currentStep - 1].description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Step 1: Identification */}
                {currentStep === 1 && (
                  <>
                    <FormField
                      control={form.control}
                      name="shipment_ref"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shipment Reference *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., SH-2025-001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="client_ref"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Reference *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., CI-001234" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="file_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>File Number</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., FILE-2025-001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Step 2: Client & Responsible */}
                {currentStep === 2 && (
                  <>
                    <FormField
                      control={form.control}
                      name="client_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a client" />
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
                    <FormField
                      control={form.control}
                      name="assigned_operator"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assigned Operator</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., John Smith" {...field} />
                          </FormControl>
                          <FormDescription>Internal operator handling this shipment</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Step 3: Transport */}
                {currentStep === 3 && (
                  <>
                    <FormField
                      control={form.control}
                      name="shipping_line"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shipping Line *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Maersk, MSC, CMA CGM" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bl_reference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bill of Lading Reference *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., MSKU1234567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Step 4: Containers */}
                {currentStep === 4 && (
                  <div className="space-y-4">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex gap-3 items-start">
                        <div className="flex-1 grid gap-3 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name={`containers.${index}.container_number`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className={index > 0 ? 'sr-only' : ''}>
                                  Container Number *
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g., MSKU1234567" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`containers.${index}.container_type`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className={index > 0 ? 'sr-only' : ''}>
                                  Container Type *
                                </FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {CONTAINER_TYPES.map((type) => (
                                      <SelectItem key={type} value={type}>
                                        {type}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mt-8"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => append({ container_number: '', container_type: '' })}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Container
                    </Button>
                  </div>
                )}

                {/* Step 5: Dates */}
                {currentStep === 5 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="forecast_shipping_line"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Forecast Shipping Line</FormLabel>
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
                          <FormLabel>Forecast Terminal</FormLabel>
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
                          <FormLabel>Discharge Date</FormLabel>
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
                          <FormLabel>Service Request Date</FormLabel>
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
                          <FormLabel>Docs Received Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormDescription>Internal only</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* Step 6: Initial Note */}
                {currentStep === 6 && (
                  <>
                    <FormField
                      control={form.control}
                      name="initial_note"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Initial Note</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Optional note for the initial tracking event..."
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            This will be added to the first tracking event (status: Registered)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="space-y-4 pt-4 border-t">
                      <FormField
                        control={form.control}
                        name="visible_to_client"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">Visible to Client</FormLabel>
                              <FormDescription>
                                Customer can see this event in their portal
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="notify_client"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">Notify Client</FormLabel>
                              <FormDescription>
                                Send email notification to client
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              {currentStep < 6 ? (
                <Button type="button" onClick={handleNext}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button type="submit" disabled={createShipmentMutation.isPending}>
                  {createShipmentMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Create Shipment
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </BackofficeLayout>
  );
}
