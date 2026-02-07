"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext } from '@/lib/api';

export type FolderNode = {
  name: string;
  fullPath: string[];
  id?: string;
  departmentId?: string | null;
  departmentName?: string | null;
  title?: string | null;
};

/**
 * Lazy folder loader using backend endpoint GET /orgs/:orgId/folders
 * Pass a path like ["Finance","2024"] to list immediate children under it.
 */
export function useFolders() {
  const { orgId } = getApiContext();
  const [cache, setCache] = useState<Map<string, FolderNode[]>>(new Map());
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keyFor = (path: string[]) => (path || []).join('/') || '__root__';

  const load = useCallback(async (path: string[] = []) => {
    if (!orgId) return [] as FolderNode[];
    const key = keyFor(path);
    if (cache.has(key)) return cache.get(key)!;
    setLoadingKey(key);
    setError(null);
    try {
      const q = path.length ? `?path=${encodeURIComponent(path.join('/'))}` : '';
      const rows = await apiFetch<FolderNode[]>(`/orgs/${orgId}/folders${q}`);
      const map = new Map(cache);
      map.set(key, rows || []);
      setCache(map);
      return rows || [];
    } catch (e: any) {
      setError(e?.message || 'Failed to load folders');
      return [];
    } finally {
      setLoadingKey(null);
    }
  }, [orgId, cache]);

  // Ensure root is cached on mount for quick UX
  useEffect(() => { void load([]); }, [load]);

  const getChildren = useCallback((path: string[] = []) => {
    const key = keyFor(path);
    return cache.get(key) || [];
  }, [cache]);

  return useMemo(() => ({
    getChildren,
    load,
    loading: loadingKey,
    error,
  }), [getChildren, load, loadingKey, error]);
}

