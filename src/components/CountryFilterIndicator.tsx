import { Globe, Filter, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCountry } from '@/hooks/useCountry';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CountryFilterIndicatorProps {
  showClearButton?: boolean;
  className?: string;
}

export function CountryFilterIndicator({ showClearButton = true, className }: CountryFilterIndicatorProps) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { currentCountry, hasMultipleCountries, switchCountry } = useCountry();

  // Only show for COUNTRY_ADMIN or ADMIN roles with multiple countries
  if (role !== 'COUNTRY_ADMIN' && role !== 'ADMIN') {
    return null;
  }

  // Don't show if there's only one country available
  if (!hasMultipleCountries) {
    return null;
  }

  const isFiltered = currentCountry !== null;
  const isAdmin = role === 'ADMIN';

  const handleClearFilter = () => {
    if (isAdmin) {
      switchCountry('');
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={isFiltered ? "default" : "secondary"}
            className={cn(
              "gap-1.5 py-1.5 px-3 text-xs font-medium transition-colors",
              isFiltered 
                ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                : "bg-muted text-muted-foreground"
            )}
          >
            {isFiltered ? (
              <>
                <Filter className="h-3 w-3" />
                <span className="hidden sm:inline">
                  {t('country.filteringBy', 'Filtering by')}: 
                </span>
                <span className="font-semibold">{currentCountry.name}</span>
                {showClearButton && isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 p-0 ml-1 hover:bg-primary-foreground/20 rounded-full"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleClearFilter();
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </>
            ) : (
              <>
                <Globe className="h-3 w-3" />
                <span>{t('country.allCountries', 'All Countries')}</span>
              </>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {isFiltered ? (
            <div className="space-y-1">
              <p className="font-medium">
                {t('country.currentlyFiltering', 'Currently filtering data by')}:
              </p>
              <p className="text-sm">
                <span className="font-semibold">{currentCountry.name}</span> ({currentCountry.code})
              </p>
              {currentCountry.timezone && (
                <p className="text-xs text-muted-foreground">
                  {t('country.timezone', 'Timezone')}: {currentCountry.timezone}
                </p>
              )}
              {isAdmin && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t('country.clickToRemoveFilter', 'Click X to show all countries')}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-medium">
                {t('country.showingAllData', 'Showing data from all countries')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('country.useDropdownToFilter', 'Use the country selector to filter by specific country')}
              </p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
