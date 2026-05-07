"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';

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

  const keyFor = (path: string[]) => `${orgId || '__no_org__'}:${(path || []).join('/') || '__root__'}`;

  const invalidate = useCallback((path?: string[]) => {
    if (!path) {
      setCache(new Map());
      return;
    }
    const key = keyFor(path);
    setCache((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, [orgId]);

  const load = useCallback(async (path: string[] = [], options: { force?: boolean } = {}) => {
    if (!orgId) return [] as FolderNode[];
    const key = keyFor(path);
    if (!options.force && cache.has(key)) return cache.get(key)!;
    setLoadingKey(key);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (path.length) params.set('path', path.join('/'));
      if (options.force) params.set('force', '1');
      const qs = params.toString();
      const rows = await apiFetch<FolderNode[]>(`/orgs/${orgId}/folders${qs ? `?${qs}` : ''}`, {
        skipCache: options.force,
      });
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

  useEffect(() => {
    const off = onApiContextChange(() => setCache(new Map()));
    return () => { off(); };
  }, []);

  useEffect(() => {
    const handleInvalidated = (event: Event) => {
      const detailOrgId = (event as CustomEvent<{ orgId?: string }>).detail?.orgId;
      if (!detailOrgId || detailOrgId === orgId) setCache(new Map());
    };
    window.addEventListener('briefly:api-cache-invalidated', handleInvalidated);
    return () => window.removeEventListener('briefly:api-cache-invalidated', handleInvalidated);
  }, [orgId]);

  // Ensure root is cached on mount for quick UX
  useEffect(() => { void load([]); }, [load]);

  const getChildren = useCallback((path: string[] = []) => {
    const key = keyFor(path);
    return cache.get(key) || [];
  }, [cache]);

  return useMemo(() => ({
    getChildren,
    invalidate,
    load,
    loading: loadingKey,
    error,
  }), [getChildren, invalidate, load, loadingKey, error]);
}
