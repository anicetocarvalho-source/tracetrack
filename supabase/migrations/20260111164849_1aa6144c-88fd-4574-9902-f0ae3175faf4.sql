-- Create table to track last read comment timestamp per request per user
CREATE TABLE public.request_comment_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.customer_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(request_id, user_id)
);

-- Enable RLS
ALTER TABLE public.request_comment_reads ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own read status
CREATE POLICY "Users can view their own read status"
ON public.request_comment_reads
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own read status
CREATE POLICY "Users can insert their own read status"
ON public.request_comment_reads
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own read status
CREATE POLICY "Users can update their own read status"
ON public.request_comment_reads
FOR UPDATE
USING (auth.uid() = user_id);

-- Enable realtime for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.request_comment_reads;