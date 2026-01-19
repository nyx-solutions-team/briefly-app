"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';

export type DashboardStats = {
  documents: {
    total: number;
    storageBytes: number;
    recentUploads: number;
    typeBreakdown: Record<string, number>;
  };
  users: {
    total: number;
    active: number;
    temporary: number;
    roleBreakdown: Record<string, number>;
    topUploaders: [string, number][];
  };
  activity: {
    recentEvents: any[];
    count: number;
    chatSessions: number;
  };
  period: {
    sevenDaysAgo: string;
    thirtyDaysAgo: string;
  };
};

type DashboardStatsContextValue = {
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

const DashboardStatsContext = createContext<DashboardStatsContextValue | undefined>(undefined);

export function DashboardStatsProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number>(0);

  const fetchStats = useCallback(async (force = false) => {
    try {
      const { orgId } = getApiContext();
      if (!orgId) return;

      const now = Date.now();
      const cacheDuration = 10 * 60 * 1000; // 10 minutes cache (increased from 5)

      // Skip if recently fetched and not forced
      if (!force && now - lastFetched < cacheDuration && stats) {
        return;
      }

      setIsLoading(true);
      setError(null);
      const data = await apiFetch<DashboardStats>(`/orgs/${orgId}/dashboard/stats`);
      setStats(data);
      setLastFetched(now);
    } catch (e) {
      setError((e as Error).message || 'Failed to load stats');
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, [stats, lastFetched]);

  const refetch = useCallback(() => fetchStats(true), [fetchStats]);

  useEffect(() => {
    // Initial load immediately (request deduplication will handle duplicates)
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    const cleanup = onApiContextChange(() => { void fetchStats(); });
    return () => { cleanup(); };
  }, [fetchStats]);

  const value = useMemo(() => ({ stats, isLoading, error, refetch }), [stats, isLoading, error, refetch]);
  return <DashboardStatsContext.Provider value={value}>{children}</DashboardStatsContext.Provider>;
}

export function useDashboardStats() {
  const ctx = useContext(DashboardStatsContext);
  if (!ctx) throw new Error('useDashboardStats must be used within a DashboardStatsProvider');
  return ctx;
} 