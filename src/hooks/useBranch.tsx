import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Branch, Country } from '@/types/database';

interface BranchContextType {
  currentBranch: Branch | null;
  availableBranches: Branch[];
  countries: Country[];
  isMultiBranch: boolean;
  isLoading: boolean;
  switchBranch: (branchId: string) => void;
  getBranchTimezone: () => string;
  getBranchLanguage: () => string;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

const BRANCH_STORAGE_KEY = 'selected_branch_id';

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user, profile, role } = useAuth();
  const queryClient = useQueryClient();
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(() => {
    return localStorage.getItem(BRANCH_STORAGE_KEY);
  });

  // Fetch countries
  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('countries')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Country[];
    },
    enabled: !!user,
  });

  // Fetch available branches for the user
  const { data: branchesData, isLoading: branchesLoading } = useQuery({
    queryKey: ['user-branches', user?.id, profile?.branch_id, profile?.allowed_branch_ids],
    queryFn: async () => {
      if (!profile) return { branches: [], isMultiBranch: false };

      // Get user's branch and allowed branches
      const branchIds: string[] = [];
      if (profile.branch_id) {
        branchIds.push(profile.branch_id);
      }
      if (profile.allowed_branch_ids && profile.allowed_branch_ids.length > 0) {
        branchIds.push(...profile.allowed_branch_ids);
      }

      if (branchIds.length === 0) {
        return { branches: [], isMultiBranch: false };
      }

      // For managers with multi-branch access, fetch all allowed branches
      const uniqueBranchIds = [...new Set(branchIds)];
      
      const { data, error } = await supabase
        .from('branches')
        .select(`
          *,
          country:countries(*)
        `)
        .in('id', uniqueBranchIds)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const branches = data as (Branch & { country: Country })[];
      const isMultiBranch = branches.length > 1 && (role === 'ADMIN' || role === 'MANAGER' || role === 'SUPERVISOR');

      return { branches, isMultiBranch };
    },
    enabled: !!user && !!profile,
  });

  const availableBranches = branchesData?.branches || [];
  const isMultiBranch = branchesData?.isMultiBranch || false;

  // Determine current branch
  const currentBranch = (() => {
    if (availableBranches.length === 0) return null;
    
    // If a branch is selected and it's in the available list, use it
    if (selectedBranchId) {
      const selected = availableBranches.find(b => b.id === selectedBranchId);
      if (selected) return selected;
    }
    
    // Default to user's primary branch or first available
    if (profile?.branch_id) {
      const primary = availableBranches.find(b => b.id === profile.branch_id);
      if (primary) return primary;
    }
    
    return availableBranches[0];
  })();

  // Persist branch selection
  useEffect(() => {
    if (currentBranch) {
      localStorage.setItem(BRANCH_STORAGE_KEY, currentBranch.id);
    }
  }, [currentBranch?.id]);

  const switchBranch = useCallback((branchId: string) => {
    const branch = availableBranches.find(b => b.id === branchId);
    if (branch) {
      setSelectedBranchId(branchId);
      localStorage.setItem(BRANCH_STORAGE_KEY, branchId);
      
      // Invalidate all branch-specific queries to force refetch with new branch
      queryClient.invalidateQueries({ queryKey: ['branch-dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['branch-exception-counts'] });
      queryClient.invalidateQueries({ queryKey: ['branch-exception-trends'] });
      queryClient.invalidateQueries({ queryKey: ['branch-sla-targets'] });
      queryClient.invalidateQueries({ queryKey: ['branch-sla-compliance'] });
      queryClient.invalidateQueries({ queryKey: ['branch-at-risk-shipments'] });
    }
  }, [availableBranches, queryClient]);

  const getBranchTimezone = (): string => {
    if (!currentBranch) return 'UTC';
    return currentBranch.timezone || currentBranch.country?.timezone || 'UTC';
  };

  const getBranchLanguage = (): string => {
    if (!currentBranch) return 'en';
    return currentBranch.default_language || currentBranch.country?.default_language || 'en';
  };

  return (
    <BranchContext.Provider
      value={{
        currentBranch,
        availableBranches,
        countries,
        isMultiBranch,
        isLoading: branchesLoading,
        switchBranch,
        getBranchTimezone,
        getBranchLanguage,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}
