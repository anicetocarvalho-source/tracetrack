-- Fix: Add SELECT policy for customers to view countries (for language/timezone)
CREATE POLICY "Customers can view countries"
  ON public.countries FOR SELECT
  USING (has_role(auth.uid(), 'CUSTOMER'));