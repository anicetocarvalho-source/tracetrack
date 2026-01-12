-- Add ADMIN to the app_role enum (must be in its own transaction)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ADMIN' BEFORE 'TECHNICIAN';