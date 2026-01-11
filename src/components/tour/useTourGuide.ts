import { useCallback, useEffect, useState } from 'react';
import { useTour } from '@reactour/tour';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface UseTourGuideOptions {
  tourId: string;
  steps: any[];
  enabled?: boolean;
}

export function useTourGuide({ tourId, steps, enabled = true }: UseTourGuideOptions) {
  const { user } = useAuth();
  const { setIsOpen, setSteps, setCurrentStep } = useTour();
  const [hasSeenTour, setHasSeenTour] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user has seen this tour
  useEffect(() => {
    async function checkTourStatus() {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('preferences')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error checking tour status:', error);
          setIsLoading(false);
          return;
        }

        const preferences = data?.preferences as Record<string, any> || {};
        const completedTours = preferences.completedTours || [];
        setHasSeenTour(completedTours.includes(tourId));
      } catch (err) {
        console.error('Error checking tour status:', err);
      } finally {
        setIsLoading(false);
      }
    }

    checkTourStatus();
  }, [user?.id, tourId]);

  // Mark tour as completed
  const completeTour = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', user.id)
        .single();

      const preferences = (data?.preferences as Record<string, any>) || {};
      const completedTours = preferences.completedTours || [];
      
      if (!completedTours.includes(tourId)) {
        completedTours.push(tourId);
      }

      await supabase
        .from('profiles')
        .update({ 
          preferences: { 
            ...preferences, 
            completedTours 
          } 
        })
        .eq('id', user.id);

      setHasSeenTour(true);
    } catch (err) {
      console.error('Error completing tour:', err);
    }
  }, [user?.id, tourId]);

  // Start tour
  const startTour = useCallback(() => {
    setSteps(steps);
    setCurrentStep(0);
    setIsOpen(true);
  }, [setIsOpen, setSteps, setCurrentStep, steps]);

  // Auto-start tour for first-time users
  useEffect(() => {
    if (!isLoading && enabled && hasSeenTour === false && steps.length > 0) {
      // Delay to ensure page is fully rendered
      const timer = setTimeout(() => {
        startTour();
        completeTour();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, enabled, hasSeenTour, startTour, completeTour, steps.length]);

  // Reset tour (for testing or user preference)
  const resetTour = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', user.id)
        .single();

      const preferences = (data?.preferences as Record<string, any>) || {};
      const completedTours = (preferences.completedTours || []).filter(
        (id: string) => id !== tourId
      );

      await supabase
        .from('profiles')
        .update({ 
          preferences: { 
            ...preferences, 
            completedTours 
          } 
        })
        .eq('id', user.id);

      setHasSeenTour(false);
    } catch (err) {
      console.error('Error resetting tour:', err);
    }
  }, [user?.id, tourId]);

  return {
    hasSeenTour,
    isLoading,
    startTour,
    completeTour,
    resetTour,
  };
}
