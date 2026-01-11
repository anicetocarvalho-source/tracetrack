import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { AIClassification } from '@/components/shipments/AIClassificationSuggestion';
import type { Json } from '@/integrations/supabase/types';

interface UseAIClassificationOptions {
  entityType: 'tracking_event' | 'customer_request';
  entityId?: string;
  autoClassify?: boolean;
  debounceMs?: number;
  minTextLength?: number;
}

export function useAIClassification({ 
  entityType, 
  entityId,
  autoClassify = true,
  debounceMs = 1500,
  minTextLength = 20,
}: UseAIClassificationOptions) {
  const { user } = useAuth();
  const [classification, setClassification] = useState<AIClassification | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasAccepted, setWasAccepted] = useState(false);
  const [lastClassifiedText, setLastClassifiedText] = useState<string>('');
  
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const classifyText = useCallback(async (text: string, context?: string) => {
    if (!text.trim()) {
      setError('No text to classify');
      return null;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

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
        setLastClassifiedText(text);
        return data.classification as AIClassification;
      }

      setError('No classification result received');
      return null;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return null;
      }
      console.error('Classification error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-classify with debouncing
  const autoClassifyText = useCallback((text: string, context?: string) => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Don't classify if already accepted, text too short, or same text
    if (wasAccepted || text.trim().length < minTextLength) {
      return;
    }

    // Don't re-classify the same text
    if (text.trim() === lastClassifiedText.trim()) {
      return;
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      classifyText(text, context);
    }, debounceMs);
  }, [wasAccepted, minTextLength, lastClassifiedText, debounceMs, classifyText]);

  // Cancel pending auto-classification
  const cancelAutoClassify = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
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
        action: 'AI_CLASSIFICATION_ACCEPTED',
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
    setLastClassifiedText('');
  }, [classification, user, entityType, entityId]);

  const reset = useCallback(() => {
    cancelAutoClassify();
    setClassification(null);
    setError(null);
    setIsLoading(false);
    setWasAccepted(false);
    setLastClassifiedText('');
  }, [cancelAutoClassify]);

  return {
    classification,
    isLoading,
    error,
    wasAccepted,
    classifyText,
    autoClassifyText,
    cancelAutoClassify,
    acceptClassification,
    dismissClassification,
    reset,
  };
}
