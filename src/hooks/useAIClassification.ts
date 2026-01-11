import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { AIClassification } from '@/components/shipments/AIClassificationSuggestion';
import type { Json } from '@/integrations/supabase/types';

interface UseAIClassificationOptions {
  entityType: 'tracking_event' | 'customer_request';
  entityId?: string;
}

export function useAIClassification({ entityType, entityId }: UseAIClassificationOptions) {
  const { user } = useAuth();
  const [classification, setClassification] = useState<AIClassification | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasAccepted, setWasAccepted] = useState(false);

  const classifyText = useCallback(async (text: string, context?: string) => {
    if (!text.trim()) {
      setError('No text to classify');
      return null;
    }

    setIsLoading(true);
    setError(null);
    setClassification(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('classify-incident', {
        body: { text, context }
      });

      if (fnError) {
        console.error('Classification function error:', fnError);
        setError(fnError.message || 'Failed to classify incident');
        return null;
      }

      if (data?.error) {
        setError(data.error);
        return null;
      }

      if (data?.classification) {
        setClassification(data.classification);
        return data.classification as AIClassification;
      }

      setError('No classification result received');
      return null;
    } catch (err) {
      console.error('Classification error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logClassificationDecision = useCallback(async (
    aiSuggestion: AIClassification,
    finalDecision: AIClassification,
    wasModified: boolean
  ) => {
    if (!user) return;

    const toJson = (obj: AIClassification): Json => ({
      category: obj.category,
      severity: obj.severity,
      likely_cause: obj.likely_cause,
      confidence: obj.confidence,
      reasoning: obj.reasoning,
    });

    try {
      await supabase.from('audit_log').insert([{
        entity_type: entityType,
        entity_id: entityId || null,
        action: 'AI_CLASSIFICATION',
        actor_user_id: user.id,
        metadata_json: {
          ai_suggestion: toJson(aiSuggestion),
          final_decision: toJson(finalDecision),
          was_modified: wasModified,
          accepted_at: new Date().toISOString(),
        },
      }]);
    } catch (err) {
      console.error('Failed to log classification decision:', err);
    }
  }, [user, entityType, entityId]);

  const acceptClassification = useCallback(async (
    finalClassification: AIClassification
  ) => {
    if (!classification) return;

    const wasModified = 
      classification.category !== finalClassification.category ||
      classification.severity !== finalClassification.severity ||
      classification.likely_cause !== finalClassification.likely_cause;

    await logClassificationDecision(classification, finalClassification, wasModified);
    setWasAccepted(true);
    
    return finalClassification;
  }, [classification, logClassificationDecision]);

  const dismissClassification = useCallback(async () => {
    if (classification && user) {
      const toJson = (obj: AIClassification): Json => ({
        category: obj.category,
        severity: obj.severity,
        likely_cause: obj.likely_cause,
        confidence: obj.confidence,
        reasoning: obj.reasoning,
      });
      
      // Log that the suggestion was dismissed
      try {
        await supabase.from('audit_log').insert([{
          entity_type: entityType,
          entity_id: entityId || null,
          action: 'AI_CLASSIFICATION_DISMISSED',
          actor_user_id: user.id,
          metadata_json: {
            ai_suggestion: toJson(classification),
            dismissed_at: new Date().toISOString(),
          },
        }]);
      } catch (err) {
        console.error('Failed to log dismissed classification:', err);
      }
    }
    
    setClassification(null);
    setError(null);
    setWasAccepted(false);
  }, [classification, user, entityType, entityId]);

  const reset = useCallback(() => {
    setClassification(null);
    setError(null);
    setIsLoading(false);
    setWasAccepted(false);
  }, []);

  return {
    classification,
    isLoading,
    error,
    wasAccepted,
    classifyText,
    acceptClassification,
    dismissClassification,
    reset,
  };
}
