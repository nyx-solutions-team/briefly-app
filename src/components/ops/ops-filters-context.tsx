"use client";

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

type SimpleOrg = { id: string; name: string };
type TimeRange = '7d' | '30d' | '90d';

type OpsFiltersContextValue = {
  orgId: string;
  orgName: string;
  setOrgId: (value: string) => void;
  orgs: SimpleOrg[];
  orgsLoading: boolean;
  timeRange: TimeRange;
  setTimeRange: (value: TimeRange) => void;
};

const OpsFiltersContext = createContext<OpsFiltersContextValue | undefined>(undefined);

const ORG_STORAGE_KEY = 'ops:selected-org';
const RANGE_STORAGE_KEY = 'ops:time-range';

export function OpsFiltersProvider({ children }: { children: React.ReactNode }) {
  const [orgs, setOrgs] = useState<SimpleOrg[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgId, setOrgId] = useState('');
  const [timeRange, setTimeRangeState] = useState<TimeRange>('7d');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedOrg = window.localStorage.getItem(ORG_STORAGE_KEY);
    const storedRange = window.localStorage.getItem(RANGE_STORAGE_KEY) as TimeRange | null;
    if (storedOrg) setOrgId(storedOrg);
    if (storedRange && ['7d', '30d', '90d'].includes(storedRange)) {
      setTimeRangeState(storedRange);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOrgs() {
      setOrgsLoading(true);
      try {
        const response = await apiFetch<SimpleOrg[]>('/ops/simple-orgs', { skipCache: true });
        if (!cancelled) {
          setOrgs(response || []);
        }
      } catch (err) {
        console.error('Failed to load org list', err);
        if (!cancelled) setOrgs([]);
      } finally {
        if (!cancelled) setOrgsLoading(false);
      }
    }
    void loadOrgs();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ORG_STORAGE_KEY, orgId);
  }, [orgId]);

  const setTimeRange = (value: TimeRange) => {
    setTimeRangeState(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RANGE_STORAGE_KEY, value);
    }
  };

  const orgName = useMemo(() => {
    if (!orgId) return 'All organizations';
    return orgs.find((org) => org.id === orgId)?.name || 'Selected organization';
  }, [orgId, orgs]);

  const value: OpsFiltersContextValue = {
    orgId,
    orgName,
    setOrgId,
    orgs,
    orgsLoading,
    timeRange,
    setTimeRange,
  };

  return <OpsFiltersContext.Provider value={value}>{children}</OpsFiltersContext.Provider>;
}

export function useOpsFilters() {
  const context = useContext(OpsFiltersContext);
  if (!context) {
    throw new Error('useOpsFilters must be used within OpsFiltersProvider');
  }
  return context;
}
