import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  notifications?: {
    enableBrowserNotifications?: boolean;
    notifyOnCritical?: boolean;
    notifyOnWarning?: boolean;
    notifyOnBreach?: boolean;
    enableAudioAlerts?: boolean;
    soundType?: string;
    volume?: number;
  };
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'light',
  language: 'en',
  notifications: {
    enableBrowserNotifications: false,
    notifyOnCritical: true,
    notifyOnWarning: true,
    notifyOnBreach: true,
    enableAudioAlerts: false,
    soundType: 'beep',
    volume: 50,
  },
};

export function useUserPreferences() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const { i18n } = useTranslation();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load preferences from database
  useEffect(() => {
    async function loadPreferences() {
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
          console.error('Error loading preferences:', error);
          setIsLoading(false);
          return;
        }

        if (data?.preferences && typeof data.preferences === 'object') {
          const loadedPrefs = {
            ...DEFAULT_PREFERENCES,
            ...(data.preferences as UserPreferences),
            notifications: {
              ...DEFAULT_PREFERENCES.notifications,
              ...((data.preferences as UserPreferences).notifications || {}),
            },
          };
          setPreferences(loadedPrefs);

          // Apply theme preference
          if (loadedPrefs.theme) {
            setTheme(loadedPrefs.theme);
          }

          // Apply language preference
          if (loadedPrefs.language && loadedPrefs.language !== i18n.language) {
            i18n.changeLanguage(loadedPrefs.language);
          }
        }
      } catch (err) {
        console.error('Error loading preferences:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadPreferences();
  }, [user?.id, setTheme, i18n]);

  // Save preferences to database
  const savePreferences = useCallback(
    async (newPreferences: Partial<UserPreferences>) => {
      if (!user?.id) return false;

      setIsSaving(true);
      const updatedPreferences = {
        ...preferences,
        ...newPreferences,
        notifications: {
          ...preferences.notifications,
          ...(newPreferences.notifications || {}),
        },
      };

      try {
        const { error } = await supabase
          .from('profiles')
          .update({ preferences: updatedPreferences })
          .eq('id', user.id);

        if (error) {
          console.error('Error saving preferences:', error);
          return false;
        }

        setPreferences(updatedPreferences);
        return true;
      } catch (err) {
        console.error('Error saving preferences:', err);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [user?.id, preferences]
  );

  // Update theme and persist
  const updateTheme = useCallback(
    async (theme: 'light' | 'dark' | 'system') => {
      setTheme(theme);
      await savePreferences({ theme });
    },
    [setTheme, savePreferences]
  );

  // Update language and persist
  const updateLanguage = useCallback(
    async (language: string) => {
      await i18n.changeLanguage(language);
      await savePreferences({ language });
    },
    [i18n, savePreferences]
  );

  // Update notification settings and persist
  const updateNotificationSettings = useCallback(
    async (notifications: Partial<UserPreferences['notifications']>) => {
      await savePreferences({ notifications });
    },
    [savePreferences]
  );

  return {
    preferences,
    isLoading,
    isSaving,
    savePreferences,
    updateTheme,
    updateLanguage,
    updateNotificationSettings,
  };
}
