"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

const LS_KEY_PREFIX = 'briefly_selected_department_id_v1';

function getScopedStorageKey(orgId: string) {
  return orgId ? `${LS_KEY_PREFIX}:${orgId}` : LS_KEY_PREFIX;
}

function normalizeBootstrapDepartments(list?: Department[] | null): Department[] {
  const departments = Array.isArray(list) ? list : [];
  if (departments.length === 0) return [];
  const mine = departments.filter((department) => department?.is_member || department?.is_lead);
  return mine.length > 0 ? mine : departments;
}

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
  const selectedDepartmentIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedDepartmentIdRef.current = selectedDepartmentId;
  }, [selectedDepartmentId]);

  const refresh = useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) {
      setDepartments([]);
      setSelectedDepartmentId(null);
      return;
    }
    setLoading(true);
    const storageKey = getScopedStorageKey(orgId);
    try {
      const bootstrapList = normalizeBootstrapDepartments(bootstrapData?.departments);
      if (bootstrapList.length > 0) {
        setDepartments(bootstrapList);
      }

      // The departments endpoint is the authoritative membership-scoped source.
      // Bootstrap can include non-member departments for navigation and summaries.
      const fetchedList = await apiFetch<Department[]>(
        `/orgs/${orgId}/departments?includeMine=1`,
        { skipCache: true }
      );
      const list = Array.isArray(fetchedList) && fetchedList.length > 0
        ? fetchedList
        : bootstrapList;

      setDepartments(list || []);

      // Initialize selection from localStorage only (don't auto-select)
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;

      // Only auto-select if no department is currently selected
      const currentSelectedDepartmentId = selectedDepartmentIdRef.current;
      if (!currentSelectedDepartmentId) {
        if (saved && (list || []).some(d => d.id === saved)) {
          // Restore saved selection from localStorage
          setSelectedDepartmentId(saved);
        }
        // Don't auto-select departments - let user choose explicitly
        // This prevents unwanted filtering on the documents page
      } else {
        // Validate existing selection is still valid
        if (!(list || []).some(d => d.id === currentSelectedDepartmentId)) {
          // Clear invalid selection
          setSelectedDepartmentId(null);
        }
      }
    } catch (error) {
      const bootstrapList = normalizeBootstrapDepartments(bootstrapData?.departments);
      setDepartments(bootstrapList);
    } finally {
      setLoading(false);
    }
  }, [bootstrapData]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const cleanup = onApiContextChange(() => { void refresh(); });
    return () => { cleanup(); };
  }, [refresh]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storageKey = getScopedStorageKey(getApiContext().orgId || '');
      if (selectedDepartmentId) {
        window.localStorage.setItem(storageKey, selectedDepartmentId);
      } else {
        // Clear from localStorage when "All Departments" is selected
        window.localStorage.removeItem(storageKey);
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
