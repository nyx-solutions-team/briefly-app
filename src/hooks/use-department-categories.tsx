import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { apiFetch, getApiContext } from '../lib/api';
import { useAuth } from './use-auth';

type DepartmentCategoriesContextValue = {
  categories: string[];
  isLoading: boolean;
  updateCategories: (categories: string[]) => Promise<void>;
  refreshCategories: () => Promise<void>;
};

const DEFAULT_CATEGORIES = [
  'General', 'Legal', 'Financial', 'HR', 'Marketing', 
  'Technical', 'Invoice', 'Contract', 'Report', 'Correspondence'
];

const DepartmentCategoriesContext = createContext<DepartmentCategoriesContextValue | undefined>(undefined);

export function DepartmentCategoriesProvider({
  children,
  departmentId
}: {
  children: React.ReactNode;
  departmentId?: string;
}) {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [isLoading, setIsLoading] = useState(false);
  const { hasPermission } = useAuth();

  const loadCategories = useCallback(async () => {
    if (!departmentId) {
      setCategories(DEFAULT_CATEGORIES);
      return;
    }

    setIsLoading(true);
    try {
      const orgId = getApiContext().orgId;
      if (!orgId) {
        setCategories(DEFAULT_CATEGORIES);
        return;
      }

      const response = await apiFetch<{ categories: string[] }>(
        `/orgs/${orgId}/departments/${departmentId}/categories`
      );
      setCategories(response.categories || DEFAULT_CATEGORIES);
    } catch (error) {
      console.warn('Failed to load department categories:', error);
      setCategories(DEFAULT_CATEGORIES);
    } finally {
      setIsLoading(false);
    }
  }, [departmentId]);

  const updateCategories = useCallback(async (newCategories: string[]) => {
    if (!departmentId) {
      throw new Error('No department selected');
    }

    // Only admins can update categories
    if (!hasPermission('org.update_settings')) {
      throw new Error('Only administrators can manage department categories');
    }

    const orgId = getApiContext().orgId;
    if (!orgId) {
      throw new Error('No organization selected');
    }

    await apiFetch(`/orgs/${orgId}/departments/${departmentId}/categories`, {
      method: 'PUT',
      body: { categories: newCategories }
    });

    setCategories(newCategories);
  }, [departmentId, hasPermission]);

  const refreshCategories = useCallback(async () => {
    await loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const value = useMemo(() => ({
    categories,
    isLoading,
    updateCategories,
    refreshCategories
  }), [categories, isLoading, updateCategories, refreshCategories]);

  return (
    <DepartmentCategoriesContext.Provider value={value}>
      {children}
    </DepartmentCategoriesContext.Provider>
  );
}

export function useDepartmentCategories() {
  const context = useContext(DepartmentCategoriesContext);
  if (context === undefined) {
    throw new Error('useDepartmentCategories must be used within a DepartmentCategoriesProvider');
  }
  return context;
}

// Hook to get categories for a specific department without provider
export function useDepartmentCategoriesById(departmentId?: string) {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [isLoading, setIsLoading] = useState(false);
  const { bootstrapData } = useAuth();

  const loadCategories = useCallback(async () => {
    if (!departmentId) {
      setCategories(DEFAULT_CATEGORIES);
      return;
    }

    // Try to get from bootstrap data first
    const department = bootstrapData?.departments?.find(d => d.id === departmentId);
    if (department && 'categories' in department && department.categories) {
      setCategories(department.categories as string[]);
      return;
    }

    setIsLoading(true);
    try {
      const orgId = getApiContext().orgId;
      if (!orgId) {
        setCategories(DEFAULT_CATEGORIES);
        return;
      }

      const response = await apiFetch<{ categories: string[] }>(
        `/orgs/${orgId}/departments/${departmentId}/categories`
      );
      setCategories(response.categories || DEFAULT_CATEGORIES);
    } catch (error) {
      console.warn('Failed to load department categories:', error);
      setCategories(DEFAULT_CATEGORIES);
    } finally {
      setIsLoading(false);
    }
  }, [departmentId, bootstrapData]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  return { categories, isLoading, refreshCategories: loadCategories };
}

// Helper hook to get categories for user's departments
export function useUserDepartmentCategories() {
  const { bootstrapData } = useAuth();
  
  const departmentCategories = useMemo(() => {
    if (!bootstrapData?.departments) return {};
    
    return bootstrapData.departments.reduce((acc, dept) => {
      acc[dept.id] = ('categories' in dept && dept.categories) ? dept.categories as string[] : DEFAULT_CATEGORIES;
      return acc;
    }, {} as Record<string, string[]>);
  }, [bootstrapData]);

  const getCategoriesForDepartment = useCallback((departmentId: string) => {
    return departmentCategories[departmentId] || DEFAULT_CATEGORIES;
  }, [departmentCategories]);

  return { departmentCategories, getCategoriesForDepartment };
}
