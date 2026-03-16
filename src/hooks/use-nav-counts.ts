"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch, getApiContext } from "@/lib/api";
import { usePageVisibility } from "@/hooks/use-page-visibility";
import { dedupRequest } from "@/lib/request-dedup";

type NavCountsSnapshot = {
  queueCount: number;
  recycleCount: number;
  loaded: boolean;
  updatedAt: number;
};

type UseNavCountsOptions = {
  enabled?: boolean;
  canViewQueue?: boolean;
  canViewRecycleBin?: boolean;
};

const NAV_COUNTS_TTL_MS = 30_000;
const EMPTY_SNAPSHOT: NavCountsSnapshot = {
  queueCount: 0,
  recycleCount: 0,
  loaded: false,
  updatedAt: 0,
};

const navCountsCache = new Map<string, NavCountsSnapshot>();
const navCountsSubscribers = new Map<string, Set<(snapshot: NavCountsSnapshot) => void>>();

function buildNavCountsKey(orgId: string, canViewQueue: boolean, canViewRecycleBin: boolean) {
  return `${orgId}:${canViewQueue ? "1" : "0"}:${canViewRecycleBin ? "1" : "0"}`;
}

function readSnapshot(key: string | null) {
  if (!key) return EMPTY_SNAPSHOT;
  return navCountsCache.get(key) || EMPTY_SNAPSHOT;
}

function publishSnapshot(key: string, snapshot: NavCountsSnapshot) {
  navCountsCache.set(key, snapshot);
  const listeners = navCountsSubscribers.get(key);
  if (!listeners) return;
  for (const listener of listeners) listener(snapshot);
}

function subscribeSnapshot(key: string, listener: (snapshot: NavCountsSnapshot) => void) {
  const listeners = navCountsSubscribers.get(key) || new Set<(snapshot: NavCountsSnapshot) => void>();
  listeners.add(listener);
  navCountsSubscribers.set(key, listeners);
  return () => {
    const current = navCountsSubscribers.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) navCountsSubscribers.delete(key);
  };
}

function getQueueCount(payload: any) {
  if (typeof payload?.queueCount === "number") return payload.queueCount;
  if (typeof payload?.queue_count === "number") return payload.queue_count;
  const counts = payload?.statusCounts || payload?.status_counts || {};
  return (counts.pending || 0) + (counts.processing || 0) + (counts.needs_review || 0);
}

function getRecycleCount(payload: any) {
  if (typeof payload?.recycleCount === "number") return payload.recycleCount;
  if (typeof payload?.recycle_count === "number") return payload.recycle_count;
  if (typeof payload?.total === "number") return payload.total;
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(payload?.items)) {
    return typeof payload.total === "number" ? payload.total : payload.items.length;
  }
  return 0;
}

async function loadNavCounts(params: {
  orgId: string;
  key: string;
  canViewQueue: boolean;
  canViewRecycleBin: boolean;
  force?: boolean;
}) {
  const { orgId, key, canViewQueue, canViewRecycleBin, force = false } = params;
  const cached = readSnapshot(key);

  if (!force && cached.loaded && Date.now() - cached.updatedAt < NAV_COUNTS_TTL_MS) {
    return cached;
  }

  return dedupRequest(`nav-counts:${key}`, async () => {
    let queueCount = canViewQueue ? cached.queueCount : 0;
    let recycleCount = canViewRecycleBin ? cached.recycleCount : 0;
    const suffix = force ? '?force=1' : '';
    const payload = await apiFetch<any>(`/orgs/${orgId}/nav-summary${suffix}`, { skipCache: true });
    if (canViewQueue) {
      queueCount = getQueueCount(payload);
    }
    if (canViewRecycleBin) {
      recycleCount = getRecycleCount(payload);
    }

    const snapshot: NavCountsSnapshot = {
      queueCount,
      recycleCount,
      loaded: true,
      updatedAt: Date.now(),
    };
    publishSnapshot(key, snapshot);
    return snapshot;
  });
}

export function useNavCounts(options: UseNavCountsOptions = {}) {
  const {
    enabled = true,
    canViewQueue = false,
    canViewRecycleBin = false,
  } = options;
  const { orgId } = getApiContext();
  const isPageVisible = usePageVisibility();
  const key = useMemo(() => {
    if (!enabled || !orgId) return null;
    return buildNavCountsKey(orgId, canViewQueue, canViewRecycleBin);
  }, [enabled, orgId, canViewQueue, canViewRecycleBin]);
  const [snapshot, setSnapshot] = useState<NavCountsSnapshot>(() => readSnapshot(key));

  useEffect(() => {
    setSnapshot(readSnapshot(key));
  }, [key]);

  useEffect(() => {
    if (!key) return undefined;
    return subscribeSnapshot(key, setSnapshot);
  }, [key]);

  const refreshCounts = useCallback(
    (force = false) => {
      if (!enabled || !isPageVisible || !orgId || !key) return;
      void loadNavCounts({
        orgId,
        key,
        canViewQueue,
        canViewRecycleBin,
        force,
      }).catch((error) => {
        console.error("Failed to fetch nav counts", error);
      });
    },
    [enabled, isPageVisible, orgId, key, canViewQueue, canViewRecycleBin]
  );

  useEffect(() => {
    refreshCounts(false);
  }, [refreshCounts]);

  useEffect(() => {
    if (!enabled || !isPageVisible || !orgId || !key) return undefined;
    const handleUpdate = () => refreshCounts(true);
    window.addEventListener("documentDeleted", handleUpdate);
    window.addEventListener("documentRestored", handleUpdate);
    window.addEventListener("documentPurged", handleUpdate);
    window.addEventListener("ingestionJobUpdated", handleUpdate);
    return () => {
      window.removeEventListener("documentDeleted", handleUpdate);
      window.removeEventListener("documentRestored", handleUpdate);
      window.removeEventListener("documentPurged", handleUpdate);
      window.removeEventListener("ingestionJobUpdated", handleUpdate);
    };
  }, [enabled, isPageVisible, orgId, key, refreshCounts]);

  return {
    queueCount: canViewQueue ? snapshot.queueCount : 0,
    recycleCount: canViewRecycleBin ? snapshot.recycleCount : 0,
    countsLoaded: snapshot.loaded,
    refreshCounts,
  };
}
