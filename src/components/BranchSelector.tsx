import { Building2, ChevronDown, Globe, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBranch } from '@/hooks/useBranch';
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

interface BranchSelectorProps {
  compact?: boolean;
}

export function BranchSelector({ compact = false }: BranchSelectorProps) {
  const { t } = useTranslation();
  const { currentBranch, availableBranches, isMultiBranch, isLoading, switchBranch } = useBranch();

  // Don't render if user only has access to one branch
  if (!isMultiBranch || availableBranches.length <= 1) {
    // Still show current branch as a badge if available
    if (currentBranch && !compact) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1.5 py-1 px-2">
              <Building2 className="h-3 w-3" />
              <span className="hidden sm:inline">{currentBranch.name}</span>
              <span className="sm:hidden">{currentBranch.code}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('branch.currentBranch', 'Current Branch')}: {currentBranch.name}</p>
            {currentBranch.country && (
              <p className="text-xs text-muted-foreground">
                {currentBranch.country.name}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }
    return null;
  }

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1.5 py-1 px-2 animate-pulse">
        <Building2 className="h-3 w-3" />
        <span>...</span>
      </Badge>
    );
  }

  // Group branches by country
  const branchesByCountry = availableBranches.reduce((acc, branch) => {
    const countryName = branch.country?.name || t('branch.noCountry', 'No Country');
    if (!acc[countryName]) {
      acc[countryName] = [];
    }
    acc[countryName].push(branch);
    return acc;
  }, {} as Record<string, typeof availableBranches>);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size={compact ? "icon" : "sm"}
              className={cn(
                "gap-1.5",
                compact && "h-9 w-9"
              )}
            >
              <Building2 className="h-4 w-4" />
              {!compact && (
                <>
                  <span className="hidden sm:inline max-w-[100px] truncate">
                    {currentBranch?.name || t('branch.select', 'Select Branch')}
                  </span>
                  <span className="sm:hidden">
                    {currentBranch?.code || '...'}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('branch.switchBranch', 'Switch Branch')}</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          {t('branch.selectBranch', 'Select Branch')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(branchesByCountry).map(([countryName, branches]) => (
          <div key={countryName}>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              {countryName}
            </div>
            {branches.map((branch) => (
              <DropdownMenuItem
                key={branch.id}
                onClick={() => switchBranch(branch.id)}
                className={cn(
                  "ml-4 cursor-pointer",
                  currentBranch?.id === branch.id && "bg-accent"
                )}
              >
                <Building2 className="mr-2 h-4 w-4" />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{branch.name}</p>
                  <p className="text-xs text-muted-foreground">{branch.code}</p>
                </div>
                {currentBranch?.id === branch.id && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {t('branch.current', 'Current')}
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
