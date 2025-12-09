"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type CategoriesContextValue = {
  categories: string[];
  isLoading: boolean;
  refreshCategories: () => Promise<void>;
};

const DEFAULT_CATEGORIES = [
  'General', 'Legal', 'Financial', 'HR', 'Marketing',
  'Technical', 'Invoice', 'Contract', 'Report', 'Correspondence'
];

const CategoriesContext = createContext<CategoriesContextValue | undefined>(undefined);

export function CategoriesProvider({
  children,
  bootstrapData
}: {
  children: React.ReactNode;
  bootstrapData?: { orgSettings: { categories: string[] } }
}) {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [isLoading, setIsLoading] = useState(false);
  const initializedRef = useRef(false);

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      // Use bootstrap data if available, otherwise fall back to API call
      if (bootstrapData?.orgSettings?.categories) {
        setCategories(bootstrapData.orgSettings.categories);
      } else {
        // Guard: require a session before calling
        const sess = await supabase.auth.getSession();
        if (!sess.data.session) {
          setCategories(DEFAULT_CATEGORIES);
          return;
        }

        const orgId = getApiContext().orgId;
        if (!orgId) {
          setCategories(DEFAULT_CATEGORIES);
          return;
        }

        const orgSettings = await apiFetch<any>(`/orgs/${orgId}/settings`);
        setCategories(orgSettings.categories || DEFAULT_CATEGORIES);
      }
    } catch (error) {
      console.warn('Failed to load categories, using defaults:', error);
      setCategories(DEFAULT_CATEGORIES);
    } finally {
      setIsLoading(false);
    }
  }, [bootstrapData]);

  // Initialize with bootstrap data or fetch if needed
  useEffect(() => {
    if (initializedRef.current) return;

    // If we have bootstrap data with categories, use it immediately
    if (bootstrapData?.orgSettings?.categories) {
      initializedRef.current = true;
      setCategories(bootstrapData.orgSettings.categories);
      return;
    }

    // If bootstrapData is undefined, wait for it (auth still loading)
    if (bootstrapData === undefined) {
      return;
    }

    // bootstrapData is null or has no categories - need to fetch
    initializedRef.current = true;
    void loadCategories();
  }, [loadCategories, bootstrapData]);

  // Only listen for org context changes if we don't have bootstrap data
  useEffect(() => {
    if (bootstrapData?.orgSettings?.categories) {
      return; // Bootstrap data available, no need to listen
    }
    const off = onApiContextChange(() => {
      void loadCategories();
    });
    return () => { off(); };
  }, [loadCategories, bootstrapData]);

  const refreshCategories = useCallback(async () => {
    await loadCategories();
  }, [loadCategories]);

  const value = useMemo(() => ({
    categories,
    isLoading,
    refreshCategories
  }), [categories, isLoading, refreshCategories]);

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) {
    throw new Error('useCategories must be used within a CategoriesProvider');
  }
  return ctx;
}