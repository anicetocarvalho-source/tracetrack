-- Step 1: Add COUNTRY_ADMIN to the app_role enum and add country_id column
-- (This must be committed before using the new enum value)

-- Add COUNTRY_ADMIN to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'COUNTRY_ADMIN';

-- Add country_id to profiles table for country-level assignment
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES public.countries(id);