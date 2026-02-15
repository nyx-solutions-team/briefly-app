"use client";

import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, ChevronRight, FileText, Folder, Search } from 'lucide-react';
import { useFolders, type FolderNode } from '@/hooks/use-folders';
import type { StoredDocument } from '@/lib/types';
import { cn } from '@/lib/utils';
import { apiFetch, getApiContext } from '@/lib/api';

type Mode = 'folder' | 'doc';
type DocSource = 'documents' | 'editor';
type DocListFilter = 'all' | 'folders' | 'files';
type PickerItem =
  | { kind: 'folder'; id: string; name: string; path: string[] }
  | { kind: 'doc'; id: string; filename: string; title: string; folderPath: string[]; doc: StoredDocument };

const EMPTY_PATH: string[] = [];
const EMPTY_DOC_IDS: string[] = [];
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 120;
const PATH_DOCS_LIMIT = 250;

function sameStringArray(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizePath(path?: string[]) {
  return (path || []).filter(Boolean);
}

function pathStartsWith(path: string[], prefix: string[]) {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}

function folderPathFromNode(node: FolderNode, parentPath: string[]) {
  if (Array.isArray(node.fullPath) && node.fullPath.length > 0) {
    return node.fullPath.filter(Boolean);
  }
  return [...parentPath, node.name].filter(Boolean);
}

function docFolderPath(doc: StoredDocument) {
  return ((doc.folderPath || (doc as any).folder_path || []) as string[]).filter(Boolean);
}

function pathKey(path: string[]) {
  return path.join('/') || '__root__';
}

function docFilename(doc?: Partial<StoredDocument> | null) {
  return String(doc?.filename || doc?.name || doc?.title || 'Untitled');
}

function docTitle(doc?: Partial<StoredDocument> | null) {
  if (!doc?.title) return '';
  const title = String(doc.title).trim();
  const filename = docFilename(doc).trim();
  if (!title) return '';
  if (title.toLowerCase() === filename.toLowerCase()) return '';
  return title;
}

function folderName(path: string[]) {
  if (!Array.isArray(path) || path.length === 0) return 'Root';
  return path[path.length - 1] || 'Root';
}

function compactText(value: string, max = 30) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

function normalizeDocument(raw: any): StoredDocument {
  return {
    ...raw,
    uploadedAt: new Date(raw?.uploadedAt || raw?.uploaded_at || Date.now()),
    departmentId: raw?.departmentId || raw?.department_id,
    department_id: raw?.department_id || raw?.departmentId,
  } as StoredDocument;
}

function normalizeEditorListDocument(raw: any): StoredDocument {
  const folderPath = normalizePath(raw?.folderPath || raw?.folder_path);
  const filename = String(raw?.filename || raw?.title || 'Untitled.md');
  const mime = String(raw?.mimeType || raw?.mime_type || 'text/markdown');
  const uploadedAt = raw?.uploadedAt || raw?.uploaded_at || Date.now();

  return normalizeDocument({
    ...raw,
    filename,
    name: String(raw?.name || filename),
    type: raw?.type || 'editor',
    folderPath,
    folder_path: folderPath,
    mimeType: mime,
    mime_type: mime,
    uploadedAt,
    uploaded_at: uploadedAt,
    isDraft: Boolean(raw?.isDraft ?? raw?.is_draft),
    is_draft: Boolean(raw?.is_draft ?? raw?.isDraft),
  });
}

function PickerListSkeleton({ mode }: { mode: Mode }) {
  if (mode === 'folder') {
    return (
      <div className="p-2 space-y-1.5">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div key={`folder-skeleton-${idx}`} className="flex items-center justify-between rounded-md px-2.5 py-2 border border-transparent bg-amber-500/[0.06]">
            <div className="flex items-center gap-2.5 min-w-0">
              <Skeleton className="h-[18px] w-[18px] rounded-sm" />
              <div className="space-y-1 min-w-0">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-12" />
              </div>
            </div>
            <Skeleton className="h-3 w-3 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1.5">
      <div className="px-2 py-1">
        <Skeleton className="h-3 w-14" />
      </div>
      {Array.from({ length: 3 }).map((_, idx) => (
        <div key={`doc-folder-skeleton-${idx}`} className="flex items-center justify-between rounded-md px-2.5 py-2 border border-transparent bg-amber-500/[0.06]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Skeleton className="h-[18px] w-[18px] rounded-sm" />
            <div className="space-y-1 min-w-0">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-11" />
            </div>
          </div>
          <Skeleton className="h-3 w-3 rounded" />
        </div>
      ))}

      <div className="mt-2 px-2 py-1">
        <Skeleton className="h-3 w-10" />
      </div>
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={`file-skeleton-${idx}`} className="flex items-center justify-between rounded-md px-2.5 py-2 border border-transparent">
          <div className="flex items-center gap-2.5 min-w-0">
            <Skeleton className="h-[18px] w-[18px] rounded-sm" />
            <div className="space-y-1 min-w-0">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="h-4 w-16 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-3.5 w-3.5 rounded" />
        </div>
      ))}
    </div>
  );
}

export function FinderPicker({
  open,
  onOpenChange,
  mode,
  maxDocs = 1,
  initialPath = EMPTY_PATH,
  initialSelectedDocIds = EMPTY_DOC_IDS,
  docSource = 'documents',
  docTypeFilter,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  maxDocs?: number;
  initialPath?: string[];
  initialSelectedDocIds?: string[];
  docSource?: DocSource;
  docTypeFilter?: string[];
  onConfirm: (payload: { path?: string[]; docs?: StoredDocument[] }) => void;
}) {
  const { orgId } = getApiContext();
  const folderExplorer = useFolders();

  const [query, setQuery] = useState('');
  const [viewingPath, setViewingPath] = useState<string[]>(normalizePath(initialPath));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(
    (initialSelectedDocIds || []).filter(Boolean).slice(0, Math.max(1, maxDocs))
  );
  const [listFilter, setListFilter] = useState<DocListFilter>('all');
  const [pathDocuments, setPathDocuments] = useState<StoredDocument[]>([]);
  const [searchDocuments, setSearchDocuments] = useState<StoredDocument[]>([]);
  const [pathLoading, setPathLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [editorDocsLoading, setEditorDocsLoading] = useState(false);
  const [allEditorDocs, setAllEditorDocs] = useState<StoredDocument[] | null>(null);
  const [selectedDocsById, setSelectedDocsById] = useState<Map<string, StoredDocument>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);
  const loadFoldersRef = useRef(folderExplorer.load);
  const docsCacheRef = useRef<Map<string, StoredDocument[]>>(new Map());
  const normalizedDocTypeFilter = useMemo(
    () =>
      Array.isArray(docTypeFilter)
        ? docTypeFilter.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
        : [],
    [docTypeFilter]
  );
  const hasDocTypeFilter = normalizedDocTypeFilter.length > 0;

  const matchesDocTypeFilter = React.useCallback(
    (doc: StoredDocument) => {
      if (!hasDocTypeFilter) return true;

      const raw: any = doc as any;
      const type = String(raw?.type || "").trim().toLowerCase();
      const mime = String(raw?.mimeType || raw?.mime_type || "").trim().toLowerCase();
      const filename = String(raw?.filename || raw?.name || "").trim().toLowerCase();
      const docTypeKey = String(raw?.docTypeKey || raw?.doc_type_key || "").trim().toLowerCase();
      const kind = String(raw?.kind || "").trim().toLowerCase();
      const isEditorFlag = raw?.is_editor === true || raw?.editor === true || raw?.isEditor === true;
      const hasEditorHead = Boolean(raw?.head);

      const candidates = [type, mime, docTypeKey, kind].filter(Boolean);
      const hasMarkdownMime = mime.includes("markdown") || mime.includes("md");
      const isMarkdownFile = filename.endsWith(".md") || filename.endsWith(".markdown");

      // Special handling for editor docs because different endpoints return different shapes.
      if (normalizedDocTypeFilter.includes("editor")) {
        if (type === "editor") return true;
        if (docTypeKey === "editor") return true;
        if (isEditorFlag || hasEditorHead) return true;
        if (hasMarkdownMime || isMarkdownFile) return true;
      }

      return normalizedDocTypeFilter.some((allowed) => {
        if (!allowed) return false;
        return candidates.some((value) => value === allowed || value.includes(allowed));
      });
    },
    [hasDocTypeFilter, normalizedDocTypeFilter]
  );

  useEffect(() => {
    loadFoldersRef.current = folderExplorer.load;
  }, [folderExplorer.load]);

  const navigateToPath = React.useCallback(
    (targetPath: string[]) => {
      setQuery('');
      setViewingPath(targetPath);
      setSelectedIndex(0);
      if (!(mode === 'doc' && docSource === 'editor')) {
        void loadFoldersRef.current(targetPath);
      }
    },
    [docSource, mode]
  );

  useEffect(() => {
    if (!open) return;
    const normalizedPath = normalizePath(initialPath);
    const normalizedSelectedDocIds = (initialSelectedDocIds || [])
      .filter(Boolean)
      .slice(0, Math.max(1, maxDocs));

    setQuery('');
    setSelectedIndex(0);
    setSearchDocuments([]);
    setListFilter('all');
    setViewingPath((prev) => (sameStringArray(prev, normalizedPath) ? prev : normalizedPath));
    setSelectedDocIds((prev) =>
      sameStringArray(prev, normalizedSelectedDocIds) ? prev : normalizedSelectedDocIds
    );

    if (!(mode === 'doc' && docSource === 'editor')) {
      void loadFoldersRef.current([]);
      void loadFoldersRef.current(normalizedPath);
    }
  }, [open, initialPath, initialSelectedDocIds, maxDocs, mode, docSource]);

  useEffect(() => {
    if (!open || mode !== 'doc' || docSource !== 'editor') return;
    if (!orgId) {
      setAllEditorDocs([]);
      return;
    }

    let cancelled = false;
    setEditorDocsLoading(true);

    (async () => {
      try {
        const data = await apiFetch<{ docs?: any[] }>(
          `/orgs/${orgId}/editor/docs?limit=500`,
          { skipCache: true }
        );
        if (cancelled) return;
        const docs = Array.isArray(data?.docs) ? data.docs.map(normalizeEditorListDocument) : [];
        setAllEditorDocs(docs);
        setSelectedDocsById((prev) => {
          const next = new Map(prev);
          for (const d of docs) next.set(d.id, d);
          return next;
        });
      } catch {
        if (!cancelled) setAllEditorDocs([]);
      } finally {
        if (!cancelled) setEditorDocsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, mode, docSource, orgId]);

  const loadPathDocuments = React.useCallback(async (targetPath: string[]) => {
    if (mode !== 'doc' || docSource !== 'documents') return;
    if (!orgId) {
      setPathDocuments([]);
      return;
    }
    const key = pathKey(targetPath);
    const cached = docsCacheRef.current.get(key);
    if (cached) {
      setPathDocuments(cached);
      return;
    }

    setPathLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PATH_DOCS_LIMIT));
      if (targetPath.length > 0) params.set('path', targetPath.join('/'));

      const data = await apiFetch<{ documents?: any[] }>(
        `/orgs/${orgId}/folder-contents?${params.toString()}`,
        { skipCache: true }
      );
      const docs = Array.isArray(data?.documents) ? data.documents.map(normalizeDocument) : [];
      docsCacheRef.current.set(key, docs);
      setPathDocuments(docs);
      setSelectedDocsById((prev) => {
        const next = new Map(prev);
        for (const d of docs) next.set(d.id, d);
        return next;
      });
    } catch {
      setPathDocuments([]);
    } finally {
      setPathLoading(false);
    }
  }, [mode, docSource, orgId]);

  useEffect(() => {
    if (!open || mode !== 'doc' || docSource !== 'editor') return;
    const docs = Array.isArray(allEditorDocs) ? allEditorDocs : [];
    const inPath = docs.filter((doc) => sameStringArray(docFolderPath(doc), viewingPath));
    setPathDocuments(inPath);
  }, [open, mode, docSource, allEditorDocs, viewingPath]);

  useEffect(() => {
    if (!open || mode !== 'doc') return;
    if (query.trim()) return;
    if (docSource === 'editor') return;
    void loadPathDocuments(viewingPath);
  }, [open, mode, query, viewingPath, loadPathDocuments, docSource]);

  useEffect(() => {
    if (!open || mode !== 'doc') return;

    const q = query.trim();
    if (!q) {
      setSearchDocuments([]);
      setSearchLoading(false);
      return;
    }

    if (docSource === 'editor') {
      const docs = Array.isArray(allEditorDocs) ? allEditorDocs : [];
      const lower = q.toLowerCase();
      setSearchLoading(true);
      const items = docs.filter((doc) => {
        const folderPath = docFolderPath(doc);
        const inScope = viewingPath.length === 0 || pathStartsWith(folderPath, viewingPath);
        if (!inScope) return false;
        const haystack = [
          docFilename(doc),
          docTitle(doc),
          String((doc as any)?.subject || ''),
          String((doc as any)?.description || ''),
          folderPath.join('/'),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(lower);
      });
      setSearchDocuments(items);
      setSearchLoading(false);
      return;
    }

    if (!orgId) return;

    setSearchLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set('q', q);
        params.set('limit', String(SEARCH_LIMIT));
        params.set('field', 'all'); // includes filename + title and related metadata
        params.set('includeSubfolders', '1');
        if (viewingPath.length > 0) {
          params.set('path', viewingPath.join('/'));
        }

        const data = await apiFetch<{ items?: any[] }>(
          `/orgs/${orgId}/documents/search-v2?${params.toString()}`,
          { signal: controller.signal, skipCache: true }
        );
        if (controller.signal.aborted) return;
        const docs = Array.isArray(data?.items) ? data.items.map(normalizeDocument) : [];
        setSearchDocuments(docs);
        setSelectedDocsById((prev) => {
          const next = new Map(prev);
          for (const d of docs) next.set(d.id, d);
          return next;
        });
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        setSearchDocuments([]);
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [open, mode, orgId, query, viewingPath, docSource, allEditorDocs]);

  useEffect(() => {
    if (!open || mode !== 'doc') return;
    if (!orgId) return;
    const missingIds = selectedDocIds.filter((id) => !selectedDocsById.has(id));
    if (missingIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(missingIds.map(async (id) => {
        try {
          const raw = await apiFetch<any>(`/orgs/${orgId}/documents/${id}`, { skipCache: true });
          return normalizeDocument(raw);
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      setSelectedDocsById((prev) => {
        let next: Map<string, StoredDocument> | null = null;
        for (const d of results) {
          if (!d?.id || prev.has(d.id)) continue;
          if (!next) next = new Map(prev);
          next.set(d.id, d);
        }
        return next ?? prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, mode, orgId, selectedDocIds, selectedDocsById]);

  const currentFolders = useMemo(() => {
    if (mode === 'doc' && docSource === 'editor') {
      const docs = Array.isArray(allEditorDocs) ? allEditorDocs : [];
      const seen = new Set<string>();
      const folders: Array<{ kind: 'folder'; id: string; name: string; path: string[] }> = [];

      for (const doc of docs) {
        const fPath = docFolderPath(doc);
        if (!pathStartsWith(fPath, viewingPath)) continue;
        if (fPath.length <= viewingPath.length) continue;
        const childPath = fPath.slice(0, viewingPath.length + 1);
        const key = childPath.join('/');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        folders.push({
          kind: 'folder',
          id: `editor|${key}`,
          name: childPath[childPath.length - 1] || 'Folder',
          path: childPath,
        });
      }

      folders.sort((a, b) => a.name.localeCompare(b.name));
      return folders;
    }

    const seen = new Set<string>();
    const nodes = folderExplorer.getChildren(viewingPath) || [];
    const mapped = nodes
      .map((node) => {
        const path = folderPathFromNode(node, viewingPath);
        return {
          kind: 'folder' as const,
          id: `${node.id || ''}|${path.join('/')}`,
          name: node.name || path[path.length - 1] || 'Folder',
          path,
        };
      })
      .filter((item) => {
        const key = item.path.join('/');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return mapped;
  }, [mode, docSource, allEditorDocs, folderExplorer, viewingPath]);

  const docsInCurrentPath = useMemo(
    () =>
      pathDocuments
        .filter((doc) => doc.type !== 'folder' && matchesDocTypeFilter(doc))
        .map((doc) => ({
          kind: 'doc' as const,
          id: doc.id,
          filename: docFilename(doc),
          title: docTitle(doc),
          folderPath: docFolderPath(doc),
          doc,
        }))
        .sort((a, b) => a.filename.localeCompare(b.filename)),
    [pathDocuments, matchesDocTypeFilter]
  );

  const docsFromSearch = useMemo(
    () =>
      searchDocuments
        .filter((doc) => doc.type !== 'folder' && matchesDocTypeFilter(doc))
        .map((doc) => ({
          kind: 'doc' as const,
          id: doc.id,
          filename: docFilename(doc),
          title: docTitle(doc),
          folderPath: docFolderPath(doc),
          doc,
        }))
        .sort((a, b) => a.filename.localeCompare(b.filename)),
    [searchDocuments, matchesDocTypeFilter]
  );

  const availableFolderItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return currentFolders;
    return currentFolders.filter((item) =>
      item.name.toLowerCase().includes(q) || item.path.join('/').toLowerCase().includes(q)
    );
  }, [currentFolders, query]);

  const availableDocItems = useMemo(
    () => (query.trim() ? docsFromSearch : docsInCurrentPath),
    [query, docsFromSearch, docsInCurrentPath]
  );

  const visibleFolders = useMemo(() => {
    if (mode !== 'doc') return availableFolderItems;
    if (listFilter === 'files') return [];
    return availableFolderItems;
  }, [mode, listFilter, availableFolderItems]);

  const visibleDocs = useMemo(() => {
    if (mode !== 'doc') return [];
    if (listFilter === 'folders') return [];
    return availableDocItems;
  }, [mode, listFilter, availableDocItems]);

  const visibleItems = useMemo<PickerItem[]>(
    () => (mode !== 'doc' ? visibleFolders : [...visibleFolders, ...visibleDocs]),
    [mode, visibleFolders, visibleDocs]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, viewingPath, visibleItems.length]);

  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const visibleDocsById = useMemo(() => {
    const map = new Map<string, StoredDocument>();
    for (const item of docsInCurrentPath) map.set(item.id, item.doc);
    for (const item of docsFromSearch) map.set(item.id, item.doc);
    return map;
  }, [docsInCurrentPath, docsFromSearch]);

  const selectedDocs = useMemo(
    () => selectedDocIds.map((id) => selectedDocsById.get(id) || visibleDocsById.get(id)).filter(Boolean) as StoredDocument[],
    [selectedDocIds, selectedDocsById, visibleDocsById]
  );

  const toggleDoc = React.useCallback(
    (docId: string, doc?: StoredDocument) => {
      if (doc) {
        setSelectedDocsById((prev) => {
          const next = new Map(prev);
          next.set(docId, doc);
          return next;
        });
      }
      setSelectedDocIds((prev) => {
        if (prev.includes(docId)) return prev.filter((id) => id !== docId);
        if (prev.length >= Math.max(1, maxDocs)) return prev;
        return [...prev, docId];
      });
    },
    [maxDocs]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(visibleItems.length - 1, 0)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Backspace' && !query && viewingPath.length > 0) {
        e.preventDefault();
        navigateToPath(viewingPath.slice(0, -1));
        return;
      }
      if (e.key === 'Enter') {
        const item = visibleItems[selectedIndex];
        if (!item) return;
        e.preventDefault();
        if (item.kind === 'folder') {
          navigateToPath(item.path);
          return;
        }
        if (mode === 'doc') {
          toggleDoc(item.id, item.doc);
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, visibleItems, selectedIndex, query, viewingPath, navigateToPath, mode, toggleDoc]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [{ name: 'Workspace', path: [] as string[] }];
    viewingPath.forEach((segment, index) => {
      crumbs.push({ name: segment, path: viewingPath.slice(0, index + 1) });
    });
    return crumbs;
  }, [viewingPath]);

  const handleChoose = () => {
    if (mode === 'folder') {
      onConfirm({ path: viewingPath });
      onOpenChange(false);
      return;
    }
    const docsForConfirm = selectedDocIds
      .map((id) => selectedDocsById.get(id) || visibleDocsById.get(id) || ({ id } as StoredDocument))
      .filter((doc) => matchesDocTypeFilter(doc as StoredDocument));
    onConfirm({ docs: docsForConfirm });
    onOpenChange(false);
  };

  const selectedSummary =
    selectedDocIds.length === 0
      ? 'None'
      : selectedDocIds
          .map((id) => compactText(docFilename(selectedDocsById.get(id) || visibleDocsById.get(id)), 28))
          .slice(0, 1)
          .join(', ');

  const maxSelectable = Math.max(1, maxDocs);
  const folderLoadingForCurrentPath =
    mode === 'doc' && docSource === 'editor'
      ? false
      : folderExplorer.loading === pathKey(viewingPath);
  const isBusy =
    mode === 'doc'
      ? (docSource === 'editor'
          ? editorDocsLoading || (query.trim() ? searchLoading : false)
          : folderLoadingForCurrentPath || (query.trim() ? searchLoading : pathLoading))
      : folderLoadingForCurrentPath;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {mode === 'folder' ? 'Select Folder' : 'Select Files'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Browse folders and choose files for chat context.
        </DialogDescription>

        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 h-12">
          <div className="flex items-center gap-1.5 text-sm overflow-x-auto flex-1 min-w-0">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb.path.join('/')}|${index}`}>
                {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                <button
                  onClick={() => navigateToPath(crumb.path)}
                  className={cn(
                    'px-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors shrink-0 text-sm leading-5',
                    index === breadcrumbs.length - 1
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-4 py-2 border-b border-border/40">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder={mode === 'doc' ? 'Search folders and files...' : 'Filter folders...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 h-8 p-0 bg-transparent focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
          />
          <div className="text-[11px] text-muted-foreground/60 border border-border/60 rounded px-1.5 py-0.5 shrink-0 hidden sm:block">
            ↵ to select
          </div>
        </div>

        {mode === 'doc' ? (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/10">
            <Button
              type="button"
              variant={listFilter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setListFilter('all')}
            >
              All ({availableFolderItems.length + availableDocItems.length})
            </Button>
            <Button
              type="button"
              variant={listFilter === 'folders' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setListFilter('folders')}
            >
              Folders ({availableFolderItems.length})
            </Button>
            <Button
              type="button"
              variant={listFilter === 'files' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setListFilter('files')}
            >
              Files ({availableDocItems.length})
            </Button>
          </div>
        ) : null}

        <div ref={listRef} className="h-[360px] overflow-y-auto">
          {isBusy ? (
            <PickerListSkeleton mode={mode} />
          ) : visibleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Folder className="h-10 w-10 mb-3 opacity-30" />
              <span className="text-sm">
                {query.trim()
                  ? `No matches for "${query.trim()}"`
                  : mode === 'doc'
                    ? 'No folders or files here'
                    : 'No subfolders'}
              </span>
            </div>
          ) : (
            <ul className="p-1.5 space-y-0.5">
              {mode === 'doc' && visibleFolders.length > 0 ? (
                <li className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Folders
                </li>
              ) : null}
              {visibleFolders.map((item, index) => {
                const isFocused = selectedIndex === index;
                return (
                  <li
                    key={`folder-${item.id}`}
                    data-index={index}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => navigateToPath(item.path)}
                    className={cn(
                      'flex items-center justify-between rounded-md px-2.5 py-2 text-sm leading-5 select-none transition-colors',
                      'cursor-pointer border border-transparent bg-amber-500/[0.06]',
                      isFocused && 'bg-amber-500/[0.14] border-amber-500/20'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-[18px] w-[18px] rounded-sm bg-amber-500/20 flex items-center justify-center shrink-0">
                        <Folder className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">Folder</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  </li>
                );
              })}

              {mode === 'doc' && visibleDocs.length > 0 ? (
                <li className="mt-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Files
                </li>
              ) : null}
              {visibleDocs.map((item, offset) => {
                const index = visibleFolders.length + offset;
                const isFocused = selectedIndex === index;
                const isSelected = selectedDocIds.includes(item.id);
                const isAtLimit = !isSelected && selectedDocIds.length >= maxSelectable;
                return (
                  <li
                    key={`doc-${item.id}`}
                    data-index={index}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => {
                      if (mode !== 'doc' || isAtLimit) return;
                      toggleDoc(item.id, item.doc);
                    }}
                    className={cn(
                      'flex items-center justify-between rounded-md px-2.5 py-2 text-sm leading-5 select-none transition-colors',
                      'border border-transparent',
                      mode === 'doc' && !isAtLimit ? 'cursor-pointer' : 'cursor-default',
                      isFocused && 'bg-muted/60 border-border/60',
                      isSelected && 'bg-primary/5 border-primary/30',
                      isAtLimit && 'opacity-45'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-[18px] w-[18px] rounded-sm bg-blue-500/15 flex items-center justify-center shrink-0">
                        <FileText className="h-3.5 w-3.5 text-blue-700 dark:text-blue-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.filename}</div>
                        {item.title ? (
                          <div className="text-xs text-muted-foreground truncate leading-4">{item.title}</div>
                        ) : null}
                        <div className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          <Folder className="h-2.5 w-2.5" />
                          <span className="truncate">{folderName(item.folderPath)}</span>
                        </div>
                      </div>
                    </div>
                    {isSelected ? <Check className="h-4 w-4 text-primary shrink-0" /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-muted/20">
          <div className="min-w-0 flex-1 pr-3 text-xs text-muted-foreground/80 overflow-hidden text-ellipsis whitespace-nowrap">
            {mode === 'folder' ? (
              <>Selected: {viewingPath.length ? compactText(`/${viewingPath.join('/')}`, 36) : 'Root'}</>
            ) : (
              <>
                Selected {selectedDocIds.length}/{maxSelectable} files
                {selectedSummary !== 'None' ? ` • ${selectedSummary}${selectedDocIds.length > 1 ? '…' : ''}` : ''}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={mode === 'doc' && selectedDocIds.length === 0}
              onClick={handleChoose}
            >
              Choose
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
