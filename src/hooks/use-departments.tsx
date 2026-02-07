"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';

export type Department = {
  id: string;
  org_id: string;
  name: string;
  lead_user_id?: string | null;
  color?: string | null;
  created_at?: string;
  updated_at?: string;
  // Bootstrap endpoint includes these membership flags
  is_member?: boolean;
  is_lead?: boolean;
};

type Ctx = {
  departments: Department[];
  loading: boolean;
  selectedDepartmentId: string | null;
  setSelectedDepartmentId: (id: string | null) => void;
  refresh: () => Promise<void>;
};

const DepartmentsContext = createContext<Ctx | undefined>(undefined);

const LS_KEY = 'briefly_selected_department_id_v1';

export function DepartmentsProvider({
  children,
  bootstrapData
}: {
  children: React.ReactNode;
  bootstrapData?: { departments: Department[] }
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setLoading(true);
    try {
      // Use bootstrap data if available, otherwise fetch from API with includeMine=1
      let list: Department[];
      if (bootstrapData?.departments) {
        list = bootstrapData.departments;
        // Removed console.log to prevent performance issues
      } else {
        list = await apiFetch<Department[]>(`/orgs/${orgId}/departments?includeMine=1`);
        // Removed console.log to prevent performance issues
      }
      setDepartments(list || []);

      // Initialize selection from localStorage only (don't auto-select)
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LS_KEY) : null;

      // Only auto-select if no department is currently selected
      if (!selectedDepartmentId) {
        if (saved && (list || []).some(d => d.id === saved)) {
          // Restore saved selection from localStorage
          setSelectedDepartmentId(saved);
        }
        // Don't auto-select departments - let user choose explicitly
        // This prevents unwanted filtering on the documents page
      } else {
        // Validate existing selection is still valid
        if (selectedDepartmentId && !(list || []).some(d => d.id === selectedDepartmentId)) {
          // Clear invalid selection
          setSelectedDepartmentId(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [bootstrapData]);

  useEffect(() => { void refresh(); }, []); // Remove refresh dependency to prevent infinite loops
  useEffect(() => {
    const cleanup = onApiContextChange(() => { void refresh(); });
    return () => { cleanup(); };
  }, []); // Remove refresh dependency

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (selectedDepartmentId) {
        window.localStorage.setItem(LS_KEY, selectedDepartmentId);
      } else {
        // Clear from localStorage when "All Departments" is selected
        window.localStorage.removeItem(LS_KEY);
      }
    }
  }, [selectedDepartmentId]);

  const value = useMemo(() => ({ departments, loading, selectedDepartmentId, setSelectedDepartmentId, refresh }), [departments, loading, selectedDepartmentId]);
  return <DepartmentsContext.Provider value={value}>{children}</DepartmentsContext.Provider>;
}

export function useDepartments() {
  const ctx = useContext(DepartmentsContext);
  if (!ctx) throw new Error('useDepartments must be used within a DepartmentsProvider');
  return ctx;
}
