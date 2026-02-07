"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { useAudit } from './use-audit';
import { useDepartments } from './use-departments';
import { useAuth } from './use-auth';
import type { StoredDocument } from '@/lib/types';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { parseFlexibleDate } from '@/lib/utils';

// Backend-powered documents provider with a backward-compatible API

type DocumentsContextValue = {
  documents: StoredDocument[];
  folders: string[][];
  isLoading: boolean;
  hasLoadedAll: boolean;
  refresh: () => Promise<void>;
  loadAllDocuments: () => Promise<void>;
  addDocument: (doc: Partial<StoredDocument>) => Promise<StoredDocument>;
  removeDocument: (id: string) => Promise<void>;
  removeDocuments: (ids: string[]) => Promise<{ deleted: number; storage_cleaned: number }>;
  updateDocument: (
    id: string,
    patchOrUpdater: Partial<StoredDocument> | ((prev: StoredDocument) => Partial<StoredDocument>)
  ) => Promise<StoredDocument>;
  getDocumentById: (id: string) => StoredDocument | undefined;
  clearAll: () => void;
  // folders
  createFolder: (parentPath: string[], name: string) => Promise<any>;
  deleteFolder: (path: string[], mode?: 'move_to_root' | 'delete_all') => Promise<any>;
  listFolders: (path: string[]) => string[][];
  getFolderMetadata: (path: string[]) => { departmentId?: string; departmentName?: string; id?: string; title?: string } | undefined;
  getDocumentsInPath: (path: string[]) => StoredDocument[];
  moveDocumentsToPath: (ids: string[], destPath: string[]) => Promise<void>;
  // versioning
  linkAsNewVersion: (baseId: string, draft: Partial<StoredDocument>) => Promise<StoredDocument>;
  unlinkFromVersionGroup: (id: string) => Promise<void>;
  setCurrentVersion: (id: string) => Promise<void>;
  ensureFolderMetadata: (path: string[]) => Promise<void>;
};

const DocumentsContext = createContext<DocumentsContextValue | undefined>(undefined);

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [folders, setFolders] = useState<string[][]>([]);
  const [folderMetadata, setFolderMetadata] = useState<Map<string, { departmentId?: string; departmentName?: string; id?: string; title?: string }>>(new Map());
  const { user, isAuthenticated } = useAuth();
  const { log } = useAudit();
  const { selectedDepartmentId } = useDepartments();

  // Removed console.log to prevent performance issues on every render

  const getOrgId = () => {
    const apiContext = getApiContext();
    return apiContext.orgId || '';
  };

  const deriveFolders = useCallback((docs: StoredDocument[], prevFolders: string[][]) => {
    const derived = new Set<string>(prevFolders.map(p => p.join('/')));
    // Only derive folders from non-folder documents
    for (const d of docs) {
      if (d.type === 'folder') continue; // Skip folder placeholder documents
      const p = (d.folderPath || (d as any).folder_path || []) as string[];
      for (let i = 1; i <= p.length; i++) derived.add(p.slice(0, i).join('/'));
    }
    return Array.from(derived).filter(Boolean).map(s => s.split('/'));
  }, []);

  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedAll, setHasLoadedAll] = useState(false);
  const loadingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingFolderFetchesRef = useRef<Set<string>>(new Set());
  const fetchedFolderPathsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const orgId = getOrgId();

    if (!orgId) {
      return;
    }

    // Abort any previous pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear caches
    fetchedFolderPathsRef.current.clear();
    pendingFolderFetchesRef.current.clear();
    setFolderMetadata(new Map());

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Set loading state
    loadingRef.current = true;
    setIsLoading(true);

    try {
      // Include department filter if user has selected a specific department
      const deptParam = selectedDepartmentId ? `?departmentId=${selectedDepartmentId}` : '';
      const response = await apiFetch<any>(`/orgs/${orgId}/documents${deptParam}`, {
        signal: abortControllerRef.current.signal
      });

      // Handle error responses
      if (response && typeof response === 'object' && 'error' in response) {
        console.error('Documents API error:', response.error);
        throw new Error(response.error || 'Failed to fetch documents');
      }

      // Ensure we have an array to work with
      const list = Array.isArray(response) ? response : (response && typeof response === 'object' && Array.isArray((response as any).items) ? (response as any).items : []);


      const revived = list.map((d: any) => ({
        ...d,
        uploadedAt: new Date(d.uploadedAt || d.uploaded_at),
        // Ensure both departmentId and department_id are available for lookup
        departmentId: d.departmentId || d.department_id,
        department_id: d.department_id || d.departmentId,
      })) as StoredDocument[];



      // Extra safety: ensure no folder documents are included
      const filteredRevived = revived.filter(d => d.type !== 'folder');
      setDocuments(filteredRevived);
      // Merge derived folders from docs with persisted folder placeholders from server (root path)
      let nextFolders = deriveFolders(filteredRevived, []);
      try {
        const root = await apiFetch<{ name: string; fullPath: string[]; departmentId?: string; departmentName?: string; id?: string; title?: string }[]>(`/orgs/${orgId}/folders?path=`);

        // Store folder metadata
        setFolderMetadata(prev => {
          const newMap = new Map(prev);
          (root || []).forEach(folder => {
            const pathKey = folder.fullPath.join('/');
            newMap.set(pathKey, {
              departmentId: folder.departmentId,
              departmentName: folder.departmentName,
              id: folder.id,
              title: folder.title
            });
          });
          return newMap;
        });
        fetchedFolderPathsRef.current.add('__root__');
        fetchedFolderPathsRef.current.add('__root__');

        const persisted = (root || []).map(r => r.fullPath);
        const merged = new Set(nextFolders.map(p => p.join('/')));
        for (const p of persisted) merged.add(p.join('/'));
        nextFolders = Array.from(merged).map(s => s.split('/')).filter(arr => arr.filter(Boolean).length > 0);
      } catch (error) {
        console.error('❌ [REFRESH] Failed to fetch folders:', error);
      }
      setFolders(prev => {
        const set = new Set(prev.map(p => p.join('/')));
        for (const p of nextFolders) set.add(p.join('/'));
        return Array.from(set).map(s => s.split('/'));
      });
      setHasLoadedAll(false);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.debug('Documents load aborted');
      } else {
        console.error('Failed to load documents:', error);
      }
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [selectedDepartmentId]); // Remove deriveFolders dependency to prevent infinite loops

  // Cleanup effect to abort pending requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const loadAllDocuments = useCallback(async () => {
    const orgId = getOrgId();
    if (!orgId || hasLoadedAll) return;

    // Abort any previous pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    loadingRef.current = true;

    try {
      // Include department filter when loading all documents
      const deptParam = selectedDepartmentId ? `?departmentId=${selectedDepartmentId}` : '';
      const response = await apiFetch<any>(`/orgs/${orgId}/documents${deptParam}`, {
        signal: abortControllerRef.current.signal
      });
      const list = Array.isArray(response) ? response : (response && typeof response === 'object' && Array.isArray((response as any).items) ? (response as any).items : []);
      const revived = list.map((d: any) => ({
        ...d,
        uploadedAt: new Date(d.uploadedAt || d.uploaded_at),
      })) as StoredDocument[];
      // Extra safety: ensure no folder documents are included
      const filteredRevived = revived.filter(d => d.type !== 'folder');
      setDocuments(filteredRevived);
      // Merge derived folders with persisted root placeholders
      let nextFolders = deriveFolders(filteredRevived, []);
      try {
        const root = await apiFetch<{ name: string; fullPath: string[]; departmentId?: string; departmentName?: string; id?: string; title?: string }[]>(`/orgs/${orgId}/folders?path=`);

        // Store folder metadata
        setFolderMetadata(prev => {
          const newMap = new Map(prev);
          (root || []).forEach(folder => {
            const pathKey = folder.fullPath.join('/');
            newMap.set(pathKey, {
              departmentId: folder.departmentId,
              departmentName: folder.departmentName,
              id: folder.id,
              title: folder.title
            });
          });
          return newMap;
        });

        const persisted = (root || []).map(r => r.fullPath);
        const merged = new Set(nextFolders.map(p => p.join('/')));
        for (const p of persisted) merged.add(p.join('/'));
        nextFolders = Array.from(merged).map(s => s.split('/')).filter(arr => arr.filter(Boolean).length > 0);
      } catch (error) {
        console.error('❌ [LOAD_ALL] Failed to fetch folders:', error);
      }
      setFolders(prev => {
        const set = new Set(prev.map(p => p.join('/')));
        for (const p of nextFolders) set.add(p.join('/'));
        return Array.from(set).map(s => s.split('/'));
      });
      setHasLoadedAll(true);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.debug('Load-all aborted');
      } else {
        console.error('Failed to load all documents:', error);
      }
    } finally {
      loadingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [hasLoadedAll, selectedDepartmentId]); // Remove deriveFolders dependency

  // Load documents on mount - but only once
  useEffect(() => {
    if (documents.length === 0 && !loadingRef.current) {
      void refresh();
    }
  }, []); // Remove refresh dependency to prevent infinite loops

  // Load documents when org context changes
  useEffect(() => {
    const off = onApiContextChange(() => {
      // Reset state for new org
      setHasLoadedAll(false);
      setDocuments([]);
      setFolders([]);
      loadingRef.current = false;

      // Only refresh if we have a valid org context
      const orgId = getOrgId();
      if (orgId && !loadingRef.current) {
        void refresh();
      }
    });

    return () => { off(); };
  }, []); // Remove refresh dependency to prevent infinite loops

  // Refresh documents when selected department changes
  useEffect(() => {
    if (selectedDepartmentId !== undefined && documents.length > 0) {
      // Reset state and refresh with new department
      setHasLoadedAll(false);
      setDocuments([]);
      setFolders([]);
      void refresh();
    }
  }, [selectedDepartmentId, refresh]);

  const addDocument = useCallback(async (doc: Partial<StoredDocument>) => {
    const orgId = getOrgId();
    if (!orgId) throw new Error('No organization selected');
    const created: any = await apiFetch(`/orgs/${orgId}/documents`, { method: 'POST', body: doc });
    const revived = {
      ...created,
      uploadedAt: new Date(created.uploadedAt || created.uploaded_at || Date.now()),
    } as StoredDocument;
    setDocuments(prev => [revived, ...prev]);
    setFolders(prev => deriveFolders([revived], prev));
    try { log({ actor: user?.username || 'system', type: 'create', docId: created.id, title: created.title || created.name, note: 'uploaded' }); } catch { }
    return revived;
  }, [user, log, deriveFolders]);

  const removeDocument = useCallback(async (id: string) => {
    const orgId = getOrgId();
    if (!orgId) throw new Error('No organization selected');
    const response = await apiFetch(`/orgs/${orgId}/documents/${id}`, { method: 'DELETE' });
    setDocuments(prev => prev.filter(d => d.id !== id));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('documentDeleted', { detail: { id, response } }));
    }

    return response;
  }, []);

  const removeDocuments = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return { deleted: 0, storage_cleaned: 0 };
    if (ids.length === 1) {
      await removeDocument(ids[0]);
      return { deleted: 1, storage_cleaned: 0 }; // Single deletion doesn't return storage info
    }

    const orgId = getOrgId();
    if (!orgId) throw new Error('No organization selected');

    const result = await apiFetch(`/orgs/${orgId}/documents`, {
      method: 'DELETE',
      body: { ids }
    });

    setDocuments(prev => prev.filter(d => !ids.includes(d.id)));
    return result;
  }, [removeDocument]);

  const updateDocument = useCallback(async (id: string, patchOrUpdater: Partial<StoredDocument> | ((prev: StoredDocument) => Partial<StoredDocument>)) => {
    const orgId = getOrgId();
    if (!orgId) throw new Error('No organization selected');
    const current = documents.find(d => d.id === id);
    const patch = typeof patchOrUpdater === 'function' && current ? (patchOrUpdater as any)(current) : patchOrUpdater;
    // Transform client fields to API/DB fields and omit empty strings
    const body: any = {};
    const put = (k: string, v: any) => { if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) body[k] = v; };
    put('title', (patch as any).title);
    put('filename', (patch as any).filename);
    put('type', (patch as any).documentType || (patch as any).type);
    put('subject', (patch as any).subject);
    put('description', (patch as any).description);
    put('category', (patch as any).category);
    if (Array.isArray((patch as any).tags)) body.tags = (patch as any).tags;
    if (Array.isArray((patch as any).keywords)) body.keywords = (patch as any).keywords;
    put('sender', (patch as any).sender);
    put('receiver', (patch as any).receiver);
    if ((patch as any).documentDate !== undefined) {
      const raw = (patch as any).documentDate as string;
      const dt = parseFlexibleDate(raw);
      if (dt) {
        // yyyy-MM-dd
        const iso = dt.toISOString().slice(0, 10);
        body.document_date = iso;
      }
    }
    if (Array.isArray((patch as any).folderPath)) body.folder_path = (patch as any).folderPath;
    if ((patch as any).isCurrentVersion !== undefined) body.is_current_version = (patch as any).isCurrentVersion;

    if (Object.keys(body).length === 0) {
      // nothing to update; return current state
      return current as any;
    }

    const updated: any = await apiFetch(`/orgs/${orgId}/documents/${id}`, { method: 'PATCH', body });
    const mappedUpdated = {
      ...updated,
      uploadedAt: new Date(updated.uploadedAt || updated.uploaded_at || Date.now()),
    };
    setDocuments(prev => prev.map(d => d.id === id ? ({ ...d, ...mappedUpdated } as any) : d));
    return mappedUpdated as StoredDocument;
  }, [documents]);

  const getDocumentById = useCallback((id: string) => documents.find(d => d.id === id), [documents]);

  const clearAll = useCallback(() => {
    setDocuments([]);
    setFolders([]);
    setFolderMetadata(new Map());
    fetchedFolderPathsRef.current.clear();
    pendingFolderFetchesRef.current.clear();
  }, []);

  const listFolders = useCallback((path: string[]) => folders.filter(p => p.length === path.length + 1 && path.every((seg, i) => seg === p[i])), [folders]);

  const getFolderMetadata = useCallback((path: string[]) => {
    const pathKey = path.join('/');
    return folderMetadata.get(pathKey);
  }, [folderMetadata]);

  const ensureFolderMetadata = useCallback(async (path: string[] = []) => {
    const orgId = getOrgId();
    if (!orgId) return;

    const key = path.length > 0 ? path.join('/') : '__root__';
    if (fetchedFolderPathsRef.current.has(key) || pendingFolderFetchesRef.current.has(key)) {
      return;
    }

    pendingFolderFetchesRef.current.add(key);
    try {
      const query = path.length > 0 ? `?path=${encodeURIComponent(path.join('/'))}` : '?path=';
      const rows = await apiFetch<{ name: string; fullPath: string[]; departmentId?: string; departmentName?: string; id?: string; title?: string }[]>(`/orgs/${orgId}/folders${query}`);

      // IMPORTANT: Persisted folders can exist without any documents inside them.
      // Our UI folder listing is driven by `folders` state (not just metadata),
      // so we must merge the fetched folder placeholders into `folders`.
      setFolders(prev => {
        const set = new Set(prev.map(p => p.join('/')));
        for (const f of (rows || [])) {
          if (Array.isArray(f.fullPath) && f.fullPath.length > 0) {
            set.add(f.fullPath.join('/'));
          }
        }
        return Array.from(set)
          .filter(Boolean)
          .map(s => s.split('/'))
          .filter(arr => arr.filter(Boolean).length > 0);
      });

      setFolderMetadata(prev => {
        const newMap = new Map(prev);
        (rows || []).forEach(folder => {
          const childKey = folder.fullPath.join('/');
          newMap.set(childKey, {
            departmentId: folder.departmentId,
            departmentName: folder.departmentName,
            id: folder.id,
            title: folder.title
          });
        });
        return newMap;
      });
      fetchedFolderPathsRef.current.add(key);
    } catch (error) {
      console.error('Failed to load folder metadata for path', path.join('/'), error);
    } finally {
      pendingFolderFetchesRef.current.delete(key);
    }
  }, [getOrgId]);

  const createFolder = useCallback(async (parentPath: string[], name: string) => {
    const clean = name.trim();
    if (!clean) throw new Error('Folder name cannot be empty');
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');

    try {
      const body: any = { parentPath, name: clean };
      if (selectedDepartmentId) {
        body.departmentId = selectedDepartmentId;
        console.log(`Creating folder with explicit department: ${selectedDepartmentId}`);
      } else {
        console.log('Creating folder without explicit department - backend will determine');
      }

      const result = await apiFetch(`/orgs/${orgId}/folders`, {
        method: 'POST',
        body
      });

      const newPath = result.fullPath;
      setFolders(prev => (prev.some(p => JSON.stringify(p) === JSON.stringify(newPath)) ? prev : [...prev, newPath]));

      const parentKey = parentPath.length > 0 ? parentPath.join('/') : '__root__';
      fetchedFolderPathsRef.current.delete(parentKey);
      pendingFolderFetchesRef.current.delete(parentKey);
      await ensureFolderMetadata(parentPath);

      return result;
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }, [getOrgId, selectedDepartmentId, ensureFolderMetadata]);

  const deleteFolder = useCallback(async (path: string[], mode: 'move_to_root' | 'delete_all' = 'move_to_root') => {
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');

    try {
      const result = await apiFetch(`/orgs/${orgId}/folders`, {
        method: 'DELETE',
        body: { path, mode }
      });

      // Update local state - remove the folder and any subfolders
      setFolders(prev => prev.filter(p => {
        // Remove the exact path and any paths that start with it
        return !(p.length >= path.length && path.every((seg, i) => seg === p[i]));
      }));

      const pathKey = path.length > 0 ? path.join('/') : '__root__';
      fetchedFolderPathsRef.current.delete(pathKey);

      const parentPath = path.slice(0, -1);
      const parentKey = parentPath.length > 0 ? parentPath.join('/') : '__root__';
      fetchedFolderPathsRef.current.delete(parentKey);
      pendingFolderFetchesRef.current.delete(parentKey);

      // If documents were moved to root, refresh to update their paths
      if (mode === 'move_to_root' && result.documentsHandled > 0) {
        void refresh();
      } else if (mode === 'delete_all') {
        // Remove deleted documents from local state
        const docsInFolder = documents.filter(d =>
          JSON.stringify(d.folderPath || []) === JSON.stringify(path)
        );
        setDocuments(prev => prev.filter(d =>
          JSON.stringify(d.folderPath || []) !== JSON.stringify(path)
        ));
      }

      await ensureFolderMetadata(parentPath);

      return result;
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw error;
    }
  }, [getOrgId, refresh, documents, ensureFolderMetadata]);

  const getDocumentsInPath = useCallback((path: string[]) => documents.filter(d =>
    JSON.stringify(d.folderPath || []) === JSON.stringify(path) && d.type !== 'folder'
  ), [documents]);

  const moveDocumentsToPath = useCallback(async (ids: string[], destPath: string[]) => {
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');
    await apiFetch(`/orgs/${orgId}/documents/move`, { method: 'POST', body: { ids, destPath } });
    setDocuments(prev => prev.map(d => ids.includes(d.id) ? { ...d, folderPath: destPath } : d));
    setFolders(prev => (prev.some(p => JSON.stringify(p) === JSON.stringify(destPath)) || destPath.length === 0) ? prev : [...prev, destPath]);
  }, []);

  const linkAsNewVersion = useCallback(async (baseId: string, draft: Partial<StoredDocument>) => {
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');
    const created: any = await apiFetch(`/orgs/${orgId}/documents/${baseId}/version`, { method: 'POST', body: { draft } });
    const mappedCreated = {
      ...created,
      uploadedAt: new Date(created.uploadedAt || created.uploaded_at || Date.now()),
    };
    setDocuments(prev => prev.map(d => ((d as any).version_group_id || (d as any).versionGroupId || d.id) === ((created as any).version_group_id || created.id) ? { ...d, isCurrentVersion: false } : d).concat(mappedCreated as any));
    return mappedCreated as StoredDocument;
  }, []);

  const unlinkFromVersionGroup = useCallback(async (id: string) => {
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');
    await apiFetch(`/orgs/${orgId}/documents/${id}/unlink`, { method: 'POST' });
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, versionGroupId: d.id, versionNumber: 1, isCurrentVersion: true, supersedesId: undefined } : d));
  }, []);

  const setCurrentVersion = useCallback(async (id: string) => {
    const orgId = getOrgId(); if (!orgId) throw new Error('No organization selected');
    await apiFetch(`/orgs/${orgId}/documents/${id}/set-current`, { method: 'POST' });
    setDocuments(prev => {
      const target = prev.find(d => d.id === id); if (!target) return prev;
      const groupId = (target as any).version_group_id || (target as any).versionGroupId || target.id;
      return prev.map(d => (((d as any).version_group_id || (d as any).versionGroupId) === groupId) ? { ...d, isCurrentVersion: d.id === id } : d);
    });
  }, []);

  const value = useMemo(() => ({
    documents,
    folders,
    isLoading,
    hasLoadedAll,
    refresh,
    loadAllDocuments,
    addDocument,
    removeDocument,
    removeDocuments,
    updateDocument,
    getDocumentById,
    clearAll,
    createFolder,
    deleteFolder,
    listFolders,
    getFolderMetadata,
    getDocumentsInPath,
    moveDocumentsToPath,
    linkAsNewVersion,
    unlinkFromVersionGroup,
    setCurrentVersion,
    ensureFolderMetadata,
  }), [documents, folders, folderMetadata, isLoading, hasLoadedAll, refresh, loadAllDocuments, addDocument, removeDocument, removeDocuments, updateDocument, getDocumentById, clearAll, createFolder, deleteFolder, listFolders, getFolderMetadata, getDocumentsInPath, moveDocumentsToPath, linkAsNewVersion, unlinkFromVersionGroup, setCurrentVersion, ensureFolderMetadata]);

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error('useDocuments must be used within a DocumentsProvider');
  return ctx;
}
