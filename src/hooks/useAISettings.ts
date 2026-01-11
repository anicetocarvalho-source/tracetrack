import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export interface AIClassificationConfig {
  debounce_ms: number;
  min_text_length: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: AIClassificationConfig = {
  debounce_ms: 1500,
  min_text_length: 20,
  enabled: true,
};

export function useAISettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: config = DEFAULT_CONFIG, isLoading } = useQuery({
    queryKey: ['ai-classification-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'ai_classification_config')
        .single();

      if (error) {
        // If not found, return defaults
        if (error.code === 'PGRST116') {
          return DEFAULT_CONFIG;
        }
        console.error('Error loading AI settings:', error);
        return DEFAULT_CONFIG;
      }

      if (data?.value && typeof data.value === 'object') {
        return {
          ...DEFAULT_CONFIG,
          ...(data.value as Partial<AIClassificationConfig>),
        };
      }

      return DEFAULT_CONFIG;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const updateMutation = useMutation({
    mutationFn: async (newConfig: Partial<AIClassificationConfig>) => {
      const updatedConfig = { ...config, ...newConfig };
      
      // Try to update first
      const { data: existing, error: selectError } = await supabase
        .from('system_settings')
        .select('id')
        .eq('key', 'ai_classification_config')
        .single();

      if (selectError?.code === 'PGRST116') {
        // Doesn't exist, insert
        const { error: insertError } = await supabase
          .from('system_settings')
          .insert({
            key: 'ai_classification_config',
            value: updatedConfig as unknown as string,
            description: 'AI Classification auto-analysis settings',
            updated_by: user?.id,
          });
        if (insertError) throw insertError;
      } else if (selectError) {
        throw selectError;
      } else {
        // Exists, update
        const { error: updateError } = await supabase
          .from('system_settings')
          .update({ 
            value: updatedConfig as unknown as string, 
            updated_by: user?.id 
          })
          .eq('key', 'ai_classification_config');
        if (updateError) throw updateError;
      }
      
      return updatedConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-classification-config'] });
      toast({ title: t('settings.aiSettingsUpdated') });
    },
    onError: (error: Error) => {
      toast({ 
        title: t('settings.errorUpdatingAISettings'), 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  return {
    config,
    isLoading,
    isUpdating: updateMutation.isPending,
    updateConfig: updateMutation.mutate,
  };
}
