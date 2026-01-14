import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Country {
  id: string;
  name: string;
  code: string;
  timezone: string;
  default_language: string;
  is_active: boolean;
}

interface CountryContextType {
  currentCountry: Country | null;
  availableCountries: Country[];
  isLoading: boolean;
  switchCountry: (countryId: string) => void;
  hasMultipleCountries: boolean;
}

const CountryContext = createContext<CountryContextType | undefined>(undefined);

const COUNTRY_STORAGE_KEY = 'selected-country-id';

export function CountryProvider({ children }: { children: ReactNode }) {
  const { user, profile, isCountryAdmin, role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(() => {
    return localStorage.getItem(COUNTRY_STORAGE_KEY);
  });

  // Fetch countries for COUNTRY_ADMIN users (only their assigned country)
  // or all countries for ADMINs
  const { data: countries = [], isLoading } = useQuery({
    queryKey: ['countries', user?.id, isCountryAdmin, isAdmin, profile?.country_id],
    queryFn: async () => {
      if (!user) return [];

      // Get user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      const userRole = roleData?.role;

      let query = supabase
        .from('countries')
        .select('*')
        .eq('is_active', true)
        .order('name');

      // COUNTRY_ADMIN can only see their assigned country
      if (userRole === 'COUNTRY_ADMIN' && profile?.country_id) {
        query = query.eq('id', profile.country_id);
      }
      // ADMINs can see all countries (no filter needed)
      // Other roles don't need country selector

      const { data, error } = await query;
      if (error) throw error;
      return data as Country[];
    },
    enabled: !!user && (isAdmin || isCountryAdmin || profile?.country_id !== undefined),
  });

  // Determine current country
  // For ADMIN: null selectedCountryId means "All Countries" (currentCountry = null)
  // For COUNTRY_ADMIN or others: default to first available country
  const currentCountry = (() => {
    if (selectedCountryId) {
      return countries.find(c => c.id === selectedCountryId) || countries[0] || null;
    }
    // If no country selected
    if (isAdmin && countries.length > 1) {
      // ADMIN with "All Countries" selected - return null to show all
      return null;
    }
    // For others, default to first country
    return countries[0] || null;
  })();

  // Persist selected country to localStorage
  useEffect(() => {
    if (currentCountry?.id) {
      localStorage.setItem(COUNTRY_STORAGE_KEY, currentCountry.id);
    }
  }, [currentCountry?.id]);

  const switchCountry = (countryId: string) => {
    if (countryId === '') {
      setSelectedCountryId(null);
      localStorage.removeItem(COUNTRY_STORAGE_KEY);
    } else {
      setSelectedCountryId(countryId);
    }
  };

  const value: CountryContextType = {
    currentCountry,
    availableCountries: countries,
    isLoading,
    switchCountry,
    hasMultipleCountries: countries.length > 1,
  };

  return (
    <CountryContext.Provider value={value}>
      {children}
    </CountryContext.Provider>
  );
}

export function useCountry() {
  const context = useContext(CountryContext);
  if (context === undefined) {
    throw new Error('useCountry must be used within a CountryProvider');
  }
  return context;
}
