-- Add preferences column to profiles table for storing user settings
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.preferences IS 'User preferences including theme, language, and notification settings';