import { Globe, ChevronDown, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCountry } from '@/hooks/useCountry';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CountrySelectorProps {
  compact?: boolean;
}

export function CountrySelector({ compact = false }: CountrySelectorProps) {
  const { t } = useTranslation();
  const { isCountryAdmin, role } = useAuth();
  const { currentCountry, availableCountries, hasMultipleCountries, isLoading, switchCountry } = useCountry();

  // Only show for COUNTRY_ADMIN or ADMIN roles
  if (role !== 'COUNTRY_ADMIN' && role !== 'ADMIN') {
    return null;
  }

  // If COUNTRY_ADMIN with only one country, show as badge
  if (!hasMultipleCountries) {
    if (currentCountry && !compact) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1.5 py-1 px-2 bg-primary/10 border-primary/20">
              <Globe className="h-3 w-3" />
              <span className="hidden sm:inline">{currentCountry.name}</span>
              <span className="sm:hidden">{currentCountry.code}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('country.currentCountry', 'Current Country')}: {currentCountry.name}</p>
            <p className="text-xs text-muted-foreground">
              {t('country.timezone', 'Timezone')}: {currentCountry.timezone}
            </p>
          </TooltipContent>
        </Tooltip>
      );
    }
    return null;
  }

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1.5 py-1 px-2 animate-pulse">
        <Globe className="h-3 w-3" />
        <span>...</span>
      </Badge>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size={compact ? "icon" : "sm"}
              className={cn(
                "gap-1.5 border-primary/20 bg-primary/5 hover:bg-primary/10",
                compact && "h-9 w-9"
              )}
            >
              <Globe className="h-4 w-4 text-primary" />
              {!compact && (
                <>
                  <span className="hidden sm:inline max-w-[100px] truncate">
                    {currentCountry?.name || t('country.select', 'Select Country')}
                  </span>
                  <span className="sm:hidden">
                    {currentCountry?.code || '...'}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('country.switchCountry', 'Switch Country')}</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          {t('country.selectCountry', 'Select Country')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableCountries.map((country) => (
          <DropdownMenuItem
            key={country.id}
            onClick={() => switchCountry(country.id)}
            className={cn(
              "cursor-pointer",
              currentCountry?.id === country.id && "bg-accent"
            )}
          >
            <MapPin className="mr-2 h-4 w-4" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{country.name}</p>
              <p className="text-xs text-muted-foreground">{country.code}</p>
            </div>
            {currentCountry?.id === country.id && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {t('country.current', 'Current')}
              </Badge>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
