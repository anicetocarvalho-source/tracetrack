
-- Create enums for document types and request types
CREATE TYPE public.document_type AS ENUM ('POD', 'BL', 'INVOICE', 'OTHER');
CREATE TYPE public.request_type AS ENUM ('UPDATE_REQUEST', 'DOC_UPLOAD', 'INSTRUCTION_CHANGE');
CREATE TYPE public.request_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- Create shipment_documents table
CREATE TABLE public.shipment_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  document_type document_type NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  visible_to_client BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create customer_requests table
CREATE TABLE public.customer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  request_type request_type NOT NULL,
  message TEXT NOT NULL,
  status request_status NOT NULL DEFAULT 'OPEN',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_note TEXT
);

-- Enable RLS
ALTER TABLE public.shipment_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shipment_documents
CREATE POLICY "Internal users can manage all documents"
ON public.shipment_documents
FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Customers can view visible documents for their shipments"
ON public.shipment_documents
FOR SELECT
USING (
  has_role(auth.uid(), 'CUSTOMER') 
  AND visible_to_client = true 
  AND EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE s.id = shipment_documents.shipment_id
    AND s.client_id = get_user_client_id(auth.uid())
  )
);

CREATE POLICY "Customers can upload documents for their shipments"
ON public.shipment_documents
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'CUSTOMER')
  AND uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE s.id = shipment_documents.shipment_id
    AND s.client_id = get_user_client_id(auth.uid())
  )
);

-- RLS Policies for customer_requests
CREATE POLICY "Internal users can manage all requests"
ON public.customer_requests
FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Customers can view their own requests"
ON public.customer_requests
FOR SELECT
USING (
  has_role(auth.uid(), 'CUSTOMER')
  AND EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE s.id = customer_requests.shipment_id
    AND s.client_id = get_user_client_id(auth.uid())
  )
);

CREATE POLICY "Customers can create requests for their shipments"
ON public.customer_requests
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'CUSTOMER')
  AND created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE s.id = customer_requests.shipment_id
    AND s.client_id = get_user_client_id(auth.uid())
  )
);

-- Create storage bucket for shipment documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shipment-documents',
  'shipment-documents',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
);

-- Storage policies
CREATE POLICY "Internal users can manage all document files"
ON storage.objects
FOR ALL
USING (bucket_id = 'shipment-documents' AND is_internal_user(auth.uid()))
WITH CHECK (bucket_id = 'shipment-documents' AND is_internal_user(auth.uid()));

CREATE POLICY "Customers can upload document files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'shipment-documents'
  AND has_role(auth.uid(), 'CUSTOMER')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Customers can view their uploaded files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'shipment-documents'
  AND has_role(auth.uid(), 'CUSTOMER')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Audit trigger for document uploads
CREATE OR REPLACE FUNCTION public.log_document_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (entity_type, entity_id, action, actor_user_id, metadata_json)
    VALUES (
      'shipment_document',
      NEW.id,
      'DOCUMENT_UPLOADED',
      NEW.uploaded_by,
      jsonb_build_object(
        'shipment_id', NEW.shipment_id,
        'document_type', NEW.document_type,
        'filename', NEW.filename,
        'visible_to_client', NEW.visible_to_client
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.visible_to_client IS DISTINCT FROM NEW.visible_to_client THEN
      INSERT INTO public.audit_log (entity_type, entity_id, action, actor_user_id, metadata_json)
      VALUES (
        'shipment_document',
        NEW.id,
        'DOCUMENT_VISIBILITY_CHANGED',
        auth.uid(),
        jsonb_build_object(
          'shipment_id', NEW.shipment_id,
          'filename', NEW.filename,
          'old_visibility', OLD.visible_to_client,
          'new_visibility', NEW.visible_to_client
        )
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (entity_type, entity_id, action, actor_user_id, metadata_json)
    VALUES (
      'shipment_document',
      OLD.id,
      'DOCUMENT_DELETED',
      auth.uid(),
      jsonb_build_object(
        'shipment_id', OLD.shipment_id,
        'filename', OLD.filename
      )
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER log_document_changes
AFTER INSERT OR UPDATE OR DELETE ON public.shipment_documents
FOR EACH ROW EXECUTE FUNCTION public.log_document_action();

-- Audit trigger for customer requests
CREATE OR REPLACE FUNCTION public.log_request_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (entity_type, entity_id, action, actor_user_id, metadata_json)
    VALUES (
      'customer_request',
      NEW.id,
      'REQUEST_CREATED',
      NEW.created_by,
      jsonb_build_object(
        'shipment_id', NEW.shipment_id,
        'request_type', NEW.request_type,
        'message', NEW.message
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.audit_log (entity_type, entity_id, action, actor_user_id, metadata_json)
      VALUES (
        'customer_request',
        NEW.id,
        CASE NEW.status
          WHEN 'IN_PROGRESS' THEN 'REQUEST_IN_PROGRESS'
          WHEN 'RESOLVED' THEN 'REQUEST_RESOLVED'
          ELSE 'REQUEST_STATUS_CHANGED'
        END,
        COALESCE(NEW.resolved_by, auth.uid()),
        jsonb_build_object(
          'shipment_id', NEW.shipment_id,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'resolution_note', NEW.resolution_note
        )
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER log_request_changes
AFTER INSERT OR UPDATE ON public.customer_requests
FOR EACH ROW EXECUTE FUNCTION public.log_request_action();

-- Create indexes for performance
CREATE INDEX idx_shipment_documents_shipment_id ON public.shipment_documents(shipment_id);
CREATE INDEX idx_shipment_documents_uploaded_by ON public.shipment_documents(uploaded_by);
CREATE INDEX idx_customer_requests_shipment_id ON public.customer_requests(shipment_id);
CREATE INDEX idx_customer_requests_status ON public.customer_requests(status);
CREATE INDEX idx_customer_requests_created_by ON public.customer_requests(created_by);
