-- Create request_comments table for follow-ups on customer requests
CREATE TABLE public.request_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.customer_requests(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.request_comments ENABLE ROW LEVEL SECURITY;

-- Customers can view comments on their own requests
CREATE POLICY "Customers can view comments on their requests"
ON public.request_comments
FOR SELECT
USING (
  has_role(auth.uid(), 'CUSTOMER'::app_role) AND
  EXISTS (
    SELECT 1 FROM customer_requests cr
    JOIN shipments s ON s.id = cr.shipment_id
    WHERE cr.id = request_comments.request_id
    AND s.client_id = get_user_client_id(auth.uid())
  )
);

-- Customers can add comments to their own open/in-progress requests
CREATE POLICY "Customers can add comments to their open requests"
ON public.request_comments
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'CUSTOMER'::app_role) AND
  created_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM customer_requests cr
    JOIN shipments s ON s.id = cr.shipment_id
    WHERE cr.id = request_comments.request_id
    AND s.client_id = get_user_client_id(auth.uid())
    AND cr.status IN ('OPEN', 'IN_PROGRESS')
  )
);

-- Internal users can manage all comments
CREATE POLICY "Internal users can manage comments"
ON public.request_comments
FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.request_comments;