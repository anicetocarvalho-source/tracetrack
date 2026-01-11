import { useEffect } from 'react';
import { useUserPreferences } from '@/hooks/useUserPreferences';

/**
 * This component loads user preferences from the database on app initialization.
 * It should be placed high in the component tree, after the auth context is available.
 */
export function PreferencesLoader({ children }: { children: React.ReactNode }) {
  const { isLoading } = useUserPreferences();

  // The hook automatically loads and applies preferences (theme, language)
  // when mounted, so we just need to render children

  return <>{children}</>;
}
