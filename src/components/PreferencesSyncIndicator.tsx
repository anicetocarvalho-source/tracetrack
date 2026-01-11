import { useUserPreferences } from '@/hooks/useUserPreferences';
import { Cloud, CloudOff, Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function PreferencesSyncIndicator() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isLoading, isSaving } = useUserPreferences();

  // Don't show indicator if not logged in
  if (!user) {
    return null;
  }

  const getStatus = () => {
    if (isLoading) {
      return {
        icon: Loader2,
        label: t('preferences.loading', 'Loading preferences...'),
        className: 'text-muted-foreground animate-spin',
      };
    }
    if (isSaving) {
      return {
        icon: Cloud,
        label: t('preferences.saving', 'Saving preferences...'),
        className: 'text-primary animate-pulse',
      };
    }
    return {
      icon: Check,
      label: t('preferences.synced', 'Preferences synced'),
      className: 'text-green-500',
    };
  };

  const status = getStatus();
  const Icon = status.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-md transition-all duration-300',
              'hover:bg-accent cursor-default'
            )}
          >
            <Icon className={cn('h-4 w-4 transition-all', status.className)} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">{status.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
