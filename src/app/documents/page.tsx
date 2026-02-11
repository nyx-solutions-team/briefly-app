"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useDocuments } from '@/hooks/use-documents';
import { useAuth } from '@/hooks/use-auth';
import { useSettings } from '@/hooks/use-settings';
import type { StoredDocument } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Grid2X2, List, Grid3X3, Folder as FolderIcon, FileText, Trash2, ArrowLeft, X, FileImage, FileSpreadsheet, FileType, File, Home, ChevronRight, Share2, Copy, Check, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { formatAppDateTime } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useDepartments } from '@/hooks/use-departments';
import { Badge } from '@/components/ui/badge';
import { Dialog as UiDialog, DialogContent as UiDialogContent, DialogDescription as UiDialogDescription, DialogFooter as UiDialogFooter, DialogHeader as UiDialogHeader, DialogTitle as UiDialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { apiFetch, getApiContext } from '@/lib/api';
import { MobileFilterButton, FilterSection } from '@/components/mobile-filter-button';
import { FolderPickerDialog } from '@/components/folder-picker-dialog';
import { useFolders as useFolderExplorer } from '@/hooks/use-folders';
import { Plus, Upload } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ViewMode = 'grid' | 'list' | 'cards';
type FolderShareRow = {
  id: string;
  folder_path: string[];
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  views_count: number | null;
  allow_download: boolean;
  allow_zip_download: boolean;
  requires_password: boolean;
  last_accessed_at?: string | null;
};

function isFolderShareLinkActive(link: FolderShareRow) {
  if (link.revoked_at) return false;
  if (!link.expires_at) return true;
  return new Date(link.expires_at).getTime() > Date.now();
}

// Helper to get file type icon and color based on mime type or filename
function getFileTypeIcon(mimeType?: string, filename?: string): { icon: React.ElementType; color: string; bg: string } {
  const mime = (mimeType || "").toLowerCase();
  const ext = filename?.split(".").pop()?.toLowerCase() || "";

  // PDF
  if (mime.includes("pdf") || ext === "pdf") {
    return { icon: FileText, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30" };
  }

  // Images
  if (mime.includes("image") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
    return { icon: FileImage, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" };
  }

  // Excel / Spreadsheets
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime.includes("csv") ||
    ["xlsx", "xls", "csv", "ods"].includes(ext)
  ) {
    return { icon: FileSpreadsheet, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30" };
  }

  // Word documents
  if (
    mime.includes("word") ||
    mime.includes("document") ||
    ["doc", "docx", "odt", "rtf"].includes(ext)
  ) {
    return { icon: FileType, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" };
  }

  // Plain text / Markdown
  if (mime.includes("text") || ["txt", "md", "markdown"].includes(ext)) {
    return { icon: FileText, color: "text-gray-600", bg: "bg-gray-100 dark:bg-gray-800" };
  }

  // Default
  return { icon: File, color: "text-primary", bg: "bg-primary/10" };
}

function getThemeIconColor(accentColor: string) {
  const colorMap: Record<string, string> = {
    default: 'text-blue-600 dark:text-blue-400',
    red: 'text-red-600 dark:text-red-400',
    rose: 'text-rose-600 dark:text-rose-400',
    orange: 'text-orange-600 dark:text-orange-400',
    amber: 'text-amber-600 dark:text-amber-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    lime: 'text-lime-600 dark:text-lime-400',
    green: 'text-green-600 dark:text-green-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    teal: 'text-teal-600 dark:text-teal-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
    sky: 'text-sky-600 dark:text-sky-400',
    blue: 'text-blue-600 dark:text-blue-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    violet: 'text-violet-600 dark:text-violet-400',
    purple: 'text-purple-600 dark:text-purple-400',
    fuchsia: 'text-fuchsia-600 dark:text-fuchsia-400',
    pink: 'text-pink-600 dark:text-pink-400',
  };
  return colorMap[accentColor] || colorMap.default;
}

function ThemeIcon({ icon: Icon, className = '' }: { icon: any; className?: string }) {
  const { settings } = useSettings();
  const themeColor = getThemeIconColor(settings.accent_color);

  return <Icon className={`${themeColor} ${className}`} />;
}

function toSentenceCase(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  const lower = raw.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function getVersionMeta(d: any) {
  const num = Number(d?.versionNumber ?? d?.version_number ?? d?.version ?? 1);
  const versionNumber = Number.isFinite(num) && num > 0 ? num : 1;
  const isCurrentVersion = Boolean(d?.isCurrentVersion ?? d?.is_current_version);
  return { versionNumber, isCurrentVersion };
}

function DocumentsPageContent() {
  const { documents, folders, listFolders, getFolderMetadata, getDocumentsInPath, createFolder, deleteFolder, removeDocument, removeDocuments, updateDocument, moveDocumentsToPath, isLoading, loadAllDocuments, refresh, ensureFolderMetadata } = useDocuments();
  const { load: loadFolderChildren } = useFolderExplorer();
  const { departments, selectedDepartmentId, setSelectedDepartmentId, loading: departmentsLoading } = useDepartments();
  const { hasPermission, isLoading: authLoading, bootstrapData } = useAuth();
  const searchParams = useSearchParams();

  // Check page permission with fallback to functional permission for backward compatibility
  const permissions = bootstrapData?.permissions || {};
  const canAccessDocumentsPage = permissions['pages.documents'] !== false; // Default true if not set
  const canReadDocuments = hasPermission('documents.read');
  const hasAccess = canAccessDocumentsPage || canReadDocuments;

  // Check other permissions
  const canCreateDocuments = hasPermission('documents.create');
  const canUpdateDocuments = hasPermission('documents.update');
  const canDeleteDocuments = hasPermission('documents.delete');
  const canMoveDocuments = hasPermission('documents.move') || canUpdateDocuments;

  // Prevent loading documents if user doesn't have access
  React.useEffect(() => {
    if (!authLoading && !hasAccess) {
      console.log('User does not have access to documents page, skipping document load');
      return;
    }
  }, [authLoading, hasAccess]);

  // Debug logging removed for performance - was causing overhead on every state change

  // Listen for document deletion events and refresh the list
  useEffect(() => {
    const handleDocumentsChanged = () => {
      // Refresh the documents list when a document changes in recycle bin or elsewhere
      refresh();
    };

    window.addEventListener('documentDeleted', handleDocumentsChanged);
    window.addEventListener('documentRestored', handleDocumentsChanged);
    window.addEventListener('documentPurged', handleDocumentsChanged);

    return () => {
      window.removeEventListener('documentDeleted', handleDocumentsChanged);
      window.removeEventListener('documentRestored', handleDocumentsChanged);
      window.removeEventListener('documentPurged', handleDocumentsChanged);
    };
  }, [refresh]);

  const [path, setPath] = useState<string[]>([]);
  const [folderContents, setFolderContents] = useState<{
    pathKey: string;
    folders: Array<{
      name: string;
      fullPath: string[];
      departmentId?: string | null;
      departmentName?: string | null;
      id?: string | null;
      title?: string | null;
      docCount?: number | null;
      folderCount?: number | null;
      itemsCount?: number | null;
    }>;
    documents: StoredDocument[];
  } | null>(null);
  const folderContentsAbortRef = useRef<AbortController | null>(null);

  // Initialize path from URL parameters on mount
  useEffect(() => {
    const pathParam = searchParams.get('path');
    if (pathParam) {
      const pathArray = pathParam.split('/').filter(Boolean);
      setPath(pathArray);
    }
  }, [searchParams]);

  useEffect(() => {
    void ensureFolderMetadata([]);
  }, [ensureFolderMetadata]);

  useEffect(() => {
    void ensureFolderMetadata(path);
  }, [path, ensureFolderMetadata]);
  const [view, setView] = useState<ViewMode>('list');
  const [isMobile, setIsMobile] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setIsMobile(window.innerWidth < 640);
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    if (isMobile && view === 'list') {
      setView('grid');
    }
  }, [isMobile, view]);

  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [field, setField] = useState<'all' | 'title' | 'subject' | 'sender' | 'receiver' | 'keywords' | 'doctype'>('all');
  const [searchState, setSearchState] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; items: StoredDocument[]; query: string }>({
    status: 'idle',
    items: [],
    query: '',
  });
  const searchAbortRef = useRef<AbortController | null>(null);

  const pathKey = useMemo(() => path.join('/'), [path]);

  useEffect(() => {
    if (authLoading || !hasAccess) return;
    if (query.trim()) return;

    const orgId = getApiContext().orgId || '';
    if (!orgId) return;

    if (folderContentsAbortRef.current) {
      folderContentsAbortRef.current.abort();
    }
    const controller = new AbortController();
    folderContentsAbortRef.current = controller;

    const params = new URLSearchParams();
    if (pathKey) params.set('path', pathKey);
    if (selectedDepartmentId) params.set('departmentId', selectedDepartmentId);
    const qs = params.toString();

    (async () => {
      try {
        const data = await apiFetch<{
          path: string[];
          folders: Array<{
            name: string;
            fullPath: string[];
            departmentId?: string | null;
            departmentName?: string | null;
            id?: string | null;
            title?: string | null;
            docCount?: number | null;
            folderCount?: number | null;
            itemsCount?: number | null;
          }>;
          documents: StoredDocument[];
        }>(`/orgs/${orgId}/folder-contents${qs ? `?${qs}` : ''}`, {
          signal: controller.signal,
          skipCache: true,
        });
        if (controller.signal.aborted) return;
        if (data && Array.isArray(data.folders) && Array.isArray(data.documents)) {
          const normalizedDocs = (data.documents || []).map((d: any) => ({
            ...d,
            uploadedAt: new Date(d.uploadedAt || d.uploaded_at || Date.now()),
            departmentId: d.departmentId || d.department_id,
            department_id: d.department_id || d.departmentId,
          })) as StoredDocument[];
          setFolderContents({
            pathKey,
            folders: data.folders,
            documents: normalizedDocs,
          });
        } else {
          setFolderContents(null);
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        setFolderContents(null);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [authLoading, hasAccess, pathKey, query, selectedDepartmentId]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchState({ status: 'idle', items: [], query: '' });
      return;
    }

    const orgId = getApiContext().orgId || '';
    if (!orgId) return;

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearchState((prev) => ({ status: 'loading', items: prev.items, query: q }));

    const params = new URLSearchParams();
    params.set('q', q);
    if (selectedDepartmentId) params.set('departmentId', selectedDepartmentId);
    if (field && field !== 'all') params.set('field', field);

    (async () => {
      try {
        const data = await apiFetch<{ items?: StoredDocument[] }>(
          `/orgs/${orgId}/documents/search-v2?${params.toString()}`,
          { signal: controller.signal, skipCache: true }
        );
        if (controller.signal.aborted) return;

        const rawItems = Array.isArray((data as any)?.items) ? (data as any).items : (Array.isArray(data as any) ? (data as any) : []);
        const normalized = rawItems.map((d: any) => ({
          ...d,
          uploadedAt: new Date(d.uploadedAt || d.uploaded_at || Date.now()),
          departmentId: d.departmentId || d.department_id,
          department_id: d.department_id || d.departmentId,
        })) as StoredDocument[];

        setSearchState({ status: 'ok', items: normalized, query: q });
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        setSearchState({ status: 'error', items: [], query: q });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [query, field, selectedDepartmentId]);

  const folderMetadataMap = useMemo(() => {
    if (!folderContents || folderContents.pathKey !== pathKey) return null;
    const map = new Map<string, { departmentId?: string; departmentName?: string; id?: string; title?: string }>();
    for (const f of folderContents.folders) {
      const key = (f.fullPath || []).join('/');
      map.set(key, {
        departmentId: f.departmentId ?? undefined,
        departmentName: f.departmentName ?? undefined,
        id: f.id ?? undefined,
        title: f.title ?? undefined,
      });
    }
    return map;
  }, [folderContents, pathKey]);

  const getFolderMetadataSafe = useCallback((p: string[]) => {
    const key = p.join('/');
    return folderMetadataMap?.get(key) || getFolderMetadata(p);
  }, [folderMetadataMap, getFolderMetadata]);

  const getFolderItemCount = useCallback((p: string[]) => {
    const key = p.join('/');
    if (folderContents && folderContents.pathKey === pathKey) {
      const match = folderContents.folders.find((f) => (f.fullPath || []).join('/') === key);
      if (match) {
        const docCount = Number(match.docCount ?? 0);
        const folderCount = Number(match.folderCount ?? 0);
        const itemsCount = match.itemsCount;
        if (typeof itemsCount === 'number') return itemsCount;
        return docCount + folderCount;
      }
    }
    return getDocumentsInPath(p).length + listFolders(p).length;
  }, [folderContents, pathKey, getDocumentsInPath, listFolders]);

  // Memoize folder and document lists to avoid recalculation on every render
  const currentFolders = useMemo(() => {
    const source = (!query.trim() && folderContents && folderContents.pathKey === pathKey)
      ? folderContents.folders.map((f) => f.fullPath || [])
      : listFolders(path);
    const deduped = new Map<string, string[]>();
    for (const p of source) {
      const key = (p || []).join('/');
      if (!key) continue;
      if (!deduped.has(key)) {
        deduped.set(key, p);
      }
    }
    return Array.from(deduped.values());
  }, [folderContents, pathKey, listFolders, path, query]);

  const currentDocs = useMemo(() => {
    if (!query.trim() && folderContents && folderContents.pathKey === pathKey) {
      return folderContents.documents;
    }
    return getDocumentsInPath(path);
  }, [folderContents, pathKey, getDocumentsInPath, path, query]);
  const effectiveView: ViewMode = isMobile && view === 'list' ? 'grid' : view;
  const mobileFilterCount =
    (query.trim() ? 1 : 0) +
    (field !== 'all' ? 1 : 0) +
    (selectedDepartmentId ? 1 : 0);


  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [dragOverFolderIdx, setDragOverFolderIdx] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePath, setSharePath] = useState<string[]>([]);
  const [shareModalTab, setShareModalTab] = useState<'internal' | 'external'>('internal');
  const [shareDeptIds, setShareDeptIds] = useState<string[]>([]);
  const [ownerShareDeptId, setOwnerShareDeptId] = useState<string | null>(null);
  const [folderLinkExpiresInDays, setFolderLinkExpiresInDays] = useState('7');
  const [folderLinkPassword, setFolderLinkPassword] = useState('');
  const [folderLinkAllowZip, setFolderLinkAllowZip] = useState(true);
  const [folderLinkLoading, setFolderLinkLoading] = useState(false);
  const [folderLinkError, setFolderLinkError] = useState<string | null>(null);
  const [folderLinkUrl, setFolderLinkUrl] = useState<string | null>(null);
  const [folderLinkCopied, setFolderLinkCopied] = useState(false);
  const [folderShareLinks, setFolderShareLinks] = useState<FolderShareRow[]>([]);
  const [folderShareLinksLoading, setFolderShareLinksLoading] = useState(false);
  const [folderShareLinksError, setFolderShareLinksError] = useState<string | null>(null);
  const [revokingShareId, setRevokingShareId] = useState<string | null>(null);
  const [folderAccess, setFolderAccess] = useState<Record<string, string[]>>({});
  const [externalFolderShares, setExternalFolderShares] = useState<Record<string, { count: number; requiresPassword: boolean }>>({});
  const isAdmin = hasPermission('org.manage_members');
  const canShare = hasPermission('documents.share');

  // Track which folder paths have been fetched to avoid re-fetching
  const fetchedFolderPathsRef = useRef<Set<string>>(new Set());
  const fetchedExternalFolderPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!canShare) return;
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;

    const pathsToInspect = [
      ...currentFolders,
      ...(path.length > 0 ? [path] : []),
    ];

    const missing = pathsToInspect
      .map(p => p.filter(Boolean))
      .filter(p => p.length > 0)
      .filter(p => {
        const key = p.join('/');
        return !fetchedFolderPathsRef.current.has(key);
      });

    if (missing.length === 0) return;

    // Mark these paths as being fetched
    missing.forEach(p => fetchedFolderPathsRef.current.add(p.join('/')));

    (async () => {
      try {
        const res = await apiFetch<{ results: Record<string, string[]> }>(`/orgs/${orgId}/folder-access/batch`, {
          method: 'POST',
          body: { paths: missing },
        });
        const map = res?.results || {};
        setFolderAccess(prev => ({ ...prev, ...map }));
      } catch { }
    })();
  }, [currentFolders, path, canShare]);

  useEffect(() => {
    if (!canShare || !isAdmin) return;
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;

    const pathsToInspect = [
      ...currentFolders,
      ...(path.length > 0 ? [path] : []),
    ];
    const missing = pathsToInspect
      .map((p) => p.filter(Boolean))
      .filter((p) => p.length > 0)
      .filter((p) => {
        const key = p.join('/');
        return !fetchedExternalFolderPathsRef.current.has(key);
      });

    if (missing.length === 0) return;
    missing.forEach((p) => fetchedExternalFolderPathsRef.current.add(p.join('/')));

    (async () => {
      try {
        const rows = await apiFetch<any[]>(`/orgs/${orgId}/folder-shares`, { skipCache: true });
        const missingSet = new Set(missing.map((p) => p.join('/')));
        const patch: Record<string, { count: number; requiresPassword: boolean }> = {};
        for (const key of missingSet) patch[key] = { count: 0, requiresPassword: false };
        for (const row of rows || []) {
          const pathArr = Array.isArray(row?.folder_path) ? row.folder_path : [];
          const key = pathArr.join('/');
          if (!missingSet.has(key)) continue;
          const prev = patch[key] || { count: 0, requiresPassword: false };
          patch[key] = {
            count: prev.count + 1,
            requiresPassword: prev.requiresPassword || row?.requires_password === true,
          };
        }
        setExternalFolderShares((prev) => ({ ...prev, ...patch }));
      } catch {
        missing.forEach((p) => fetchedExternalFolderPathsRef.current.delete(p.join('/')));
      }
    })();
  }, [currentFolders, path, canShare, isAdmin]);

  const renderDepartmentBadge = useCallback((deptId: string | null | undefined) => {
    const id = deptId || null;
    if (!id) {
      return (
        <span className="inline-block max-w-[100px] truncate rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color="default" title="General">
          General
        </span>
      );
    }
    const dept = departments.find(d => d.id === id);
    if (dept) {
      return (
        <span className="inline-block max-w-[100px] truncate rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color={dept.color || 'default'} title={dept.name}>
          {dept.name}
        </span>
      );
    }
    return (
      <span className="inline-block max-w-[100px] truncate rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color="default" title="Team unavailable">
        Team unavailable
      </span>
    );
  }, [departments]);

  const getFolderShareSummary = useCallback((folderPath: string[]) => {
    const key = folderPath.join('/');
    const accessIds = folderAccess[key] || [];
    const internalTeams = Math.max(0, accessIds.length - 1);
    const external = externalFolderShares[key] || { count: 0, requiresPassword: false };
    return {
      internalTeams,
      externalCount: external.count,
      externalPasswordProtected: external.requiresPassword,
    };
  }, [folderAccess, externalFolderShares]);

  // Helper to get the display name for a document
  // Prioritizes: filename → name → title → subject
  const getDisplayTitle = useCallback((d: StoredDocument) => {
    const filename = d.filename || d.name;
    if (filename && String(filename).trim()) return String(filename).trim();
    if (d.title && d.title.trim()) return d.title;
    if (d.subject && d.subject.trim()) return d.subject;
    return 'Untitled';
  }, []);

  const router = useRouter();

  // Folder deletion dialog state
  const [folderToDelete, setFolderToDelete] = useState<string[] | null>(null);
  const [deletionMode, setDeletionMode] = useState<'move_to_root' | 'delete_all'>('move_to_root');
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk delete confirmation dialog state
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [isDeletingDocuments, setIsDeletingDocuments] = useState(false);

  // Individual delete confirmation dialog state  
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<StoredDocument | null>(null);

  const handleFolderDeletion = async () => {
    if (!folderToDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteFolder(folderToDelete, deletionMode);

      let message = `Folder "${folderToDelete[folderToDelete.length - 1]}" deleted successfully`;
      if (result.documentsHandled > 0) {
        if (deletionMode === 'move_to_root') {
          message += `. ${result.documentsHandled} document(s) moved to parent folder.`;
        } else {
          message += `. ${result.documentsHandled} document(s) deleted.`;
        }
      }

      toast({ title: 'Success', description: message });
      setFolderToDelete(null);
    } catch (error: any) {
      console.error('Failed to delete folder:', error);
      toast({
        title: 'Failed to delete folder',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Load all documents only if server-side search fails (fallback)
  useEffect(() => {
    if (!query.trim()) return;
    if (searchState.status !== 'error') return;
    const tid = setTimeout(() => { void loadAllDocuments(); }, 250);
    return () => clearTimeout(tid);
  }, [query, loadAllDocuments, searchState.status]);

  const filteredDocs = useMemo(() => {
    // Show all documents without current version filtering
    const allDocs = documents.filter(d => d.type !== 'folder'); // Exclude folder placeholders

    // When searching, prefer server-side results
    if (query.trim()) {
      if (searchState.status === 'ok') {
        return searchState.items.filter(d => d.type !== 'folder');
      }
      if (searchState.status === 'loading' && searchState.items.length > 0) {
        return searchState.items.filter(d => d.type !== 'folder');
      }
    }

    // Fallback to client-side search
    const base = query.trim() ? allDocs : currentDocs.filter(d => d.type !== 'folder');
    if (!query.trim()) return base;

    const q = query.toLowerCase();
    const searchResults = base.filter(d => {
      if (d.type === 'folder') return false;

      const inArr = (arr?: string[]) => (arr || []).some(v => v.toLowerCase().includes(q));
      switch (field) {
        case 'title':
          return (d.title || d.name).toLowerCase().includes(q);
        case 'subject':
          return (d.subject || '').toLowerCase().includes(q);
        case 'sender':
          return (d.sender || '').toLowerCase().includes(q);
        case 'receiver':
          return (d.receiver || '').toLowerCase().includes(q);
        case 'keywords':
          return inArr(d.keywords) || inArr(d.aiKeywords);
        case 'doctype':
          return (d.documentType || d.type).toLowerCase().includes(q);
        case 'all':
        default:
          return [d.title, d.name, d.subject, d.sender, d.receiver, d.description]
            .filter(Boolean)
            .some(v => (v as string).toLowerCase().includes(q))
            || inArr(d.keywords) || inArr(d.aiKeywords) || inArr(d.tags);
      }
    });

    return searchResults.filter(d => d.type !== 'folder');
  }, [query, field, currentDocs, documents, searchState.status, searchState.items]);

  // Update URL when path changes (for navigation)
  useEffect(() => {
    const newUrl = path.length > 0
      ? `/documents?path=${encodeURIComponent(path.join('/'))}`
      : '/documents';

    // Update URL without triggering navigation
    window.history.replaceState({}, '', newUrl);
  }, [path]);

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAll(false);
  }, [path]);

  const getExt = (d: StoredDocument) => {
    const source = d.filename || d.name;
    const idx = source.lastIndexOf('.');
    if (idx > -1 && idx < source.length - 1) return source.slice(idx + 1).toLowerCase();
    return (d.type || 'doc').toLowerCase();
  };

  const parseDocDate = (d: StoredDocument): Date | null => d.uploadedAt || null;

  const formatNiceDate = (d: StoredDocument) => {
    const dt = parseDocDate(d);
    if (!dt) return '—';
    return formatAppDateTime(dt);
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(filteredDocs.map(d => d.id)));
      setSelectAll(true);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsDeletingDocuments(true);
    try {
      // Use the efficient bulk delete endpoint (single API call instead of N)
      const result = await removeDocuments(Array.from(selectedIds));

      toast({
        title: 'Documents Deleted',
        description: `${result.deleted || selectedIds.size} document(s) moved to recycle bin`,
      });

      setSelectedIds(new Set());
      setSelectAll(false);
      setConfirmBulkDeleteOpen(false);
    } catch (error) {
      console.error('Bulk delete failed:', error);
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete documents',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingDocuments(false);
    }
  };

  const handleSingleDelete = async () => {
    if (!documentToDelete) return;

    setIsDeletingDocuments(true);
    try {
      await removeDocument(documentToDelete.id);

      toast({
        title: 'Document Deleted',
        description: `"${documentToDelete.title || documentToDelete.filename}" moved to recycle bin`,
      });

      setDocumentToDelete(null);
      setConfirmDeleteOpen(false);
    } catch (error) {
      console.error('Delete failed:', error);
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingDocuments(false);
    }
  };

  const onBulkMoveSelect = async (dest: string[]) => {
    if (selectedIds.size === 0) {
      setMoveOpen(false);
      return;
    }
    await moveDocumentsToPath(Array.from(selectedIds), dest);
    setSelectedIds(new Set());
    setMoveOpen(false);
    toast({ title: 'Moved', description: 'Documents moved successfully' });
  };

  const getDraggedIds = (id: string) => (selectedIds.has(id) ? Array.from(selectedIds) : [id]);
  const onDocDragStart: React.DragEventHandler<HTMLElement> = (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.id;
    if (!id) return;
    const ids = getDraggedIds(id);
    e.dataTransfer.setData('application/x-doc-ids', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };

  // Inline rename handlers
  const startEdit = (d: StoredDocument) => {
    setEditingId(d.id);
    setEditingTitle(d.title || d.name);
  };
  const commitEdit = (id: string) => {
    const title = editingTitle.trim();
    if (title) updateDocument(id, prev => ({ ...prev, title }));
    setEditingId(null);
    setEditingTitle('');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/input|textarea/i)) return;
      if (e.key.toLowerCase() === 'a') {
        router.push(`/documents/upload${path.length ? `?path=${encodeURIComponent(path.join('/'))}` : ''}`);
      } else if (e.key.toLowerCase() === 'm') {
        setMoveOpen(true);
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [path]);
  const onFolderDragOver: React.DragEventHandler<HTMLElement> = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onFolderDrop = (folderPathArr: string[], idx: number): React.DragEventHandler<HTMLElement> => (e) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData('application/x-doc-ids');
      if (!raw) return;
      const ids: string[] = JSON.parse(raw);
      moveDocumentsToPath(ids, folderPathArr);
      setSelectedIds(new Set());
      toast({ title: 'Moved', description: `${ids.length} document(s) moved` });
    } catch { }
    setDragOverFolderIdx(null);
  };

  const loadFolderShareLinks = useCallback(async (pathArr: string[]) => {
    if (!isAdmin) {
      setFolderShareLinks([]);
      setFolderShareLinksError(null);
      return;
    }
    const orgId = getApiContext().orgId || '';
    if (!orgId || pathArr.length === 0) {
      setFolderShareLinks([]);
      setFolderShareLinksError(null);
      return;
    }
    setFolderShareLinksLoading(true);
    setFolderShareLinksError(null);
    try {
      const params = new URLSearchParams();
      params.set('path', pathArr.join('/'));
      const rows = await apiFetch<FolderShareRow[]>(`/orgs/${orgId}/folder-shares?${params.toString()}`, { skipCache: true });
      const activeRows = Array.isArray(rows) ? rows.filter(isFolderShareLinkActive) : [];
      setFolderShareLinks(activeRows);
    } catch (error: any) {
      setFolderShareLinks([]);
      setFolderShareLinksError(error?.message || 'Unable to load existing external links');
    } finally {
      setFolderShareLinksLoading(false);
    }
  }, [isAdmin]);

  const revokeFolderShareLink = useCallback(async (shareId: string) => {
    const orgId = getApiContext().orgId || '';
    if (!orgId || !shareId) return;
    setRevokingShareId(shareId);
    setFolderLinkError(null);
    try {
      await apiFetch(`/orgs/${orgId}/folder-shares/${shareId}`, { method: 'DELETE' });
      await loadFolderShareLinks(sharePath);
      const folderKey = sharePath.join('/');
      if (folderKey) {
        setExternalFolderShares((prev) => {
          const current = prev[folderKey];
          if (!current) return prev;
          const nextCount = Math.max(0, current.count - 1);
          return {
            ...prev,
            [folderKey]: {
              count: nextCount,
              requiresPassword: nextCount > 0 ? current.requiresPassword : false,
            },
          };
        });
      }
    } catch (error: any) {
      setFolderLinkError(error?.message || 'Failed to revoke link');
    } finally {
      setRevokingShareId(null);
    }
  }, [sharePath, loadFolderShareLinks]);

  const openShare = async (pathArr: string[]) => {
    setSharePath(pathArr);
    setShareOpen(true);
    setShareModalTab('internal');
    setFolderLinkError(null);
    setFolderLinkUrl(null);
    setFolderLinkCopied(false);
    setFolderLinkPassword('');
    setFolderLinkExpiresInDays('7');
    setFolderLinkAllowZip(true);
    setOwnerShareDeptId(null);
    setFolderShareLinks([]);
    setFolderShareLinksError(null);
    setRevokingShareId(null);
    void loadFolderShareLinks(pathArr);
    try {
      const orgId = getApiContext().orgId || '';
      const params = new URLSearchParams();
      params.set('path', pathArr.join('/'));
      const data = await apiFetch<{ path: string[]; ownerDepartmentId?: string | null; departments: string[] }>(`/orgs/${orgId}/folder-access?${params.toString()}`);
      const ownerDeptId = data.ownerDepartmentId || null;
      setOwnerShareDeptId(ownerDeptId);
      const uniqueDepts = Array.from(new Set([
        ...(data.departments || []),
        ...(ownerDeptId ? [ownerDeptId] : []),
      ]));
      setShareDeptIds(uniqueDepts);
    } catch {
      setOwnerShareDeptId(null);
      setShareDeptIds([]);
    }
  };
  const toggleShareDept = (id: string, checked: boolean) => {
    if (ownerShareDeptId && id === ownerShareDeptId) return;
    setShareDeptIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };
  const saveShare = async () => {
    try {
      const orgId = getApiContext().orgId || '';
      const finalDepartmentIds = Array.from(new Set([
        ...shareDeptIds,
        ...(ownerShareDeptId ? [ownerShareDeptId] : []),
      ]));
      await apiFetch(`/orgs/${orgId}/folder-access`, { method: 'PUT', body: { path: sharePath, departmentIds: finalDepartmentIds } });
      setShareOpen(false);
    } catch { }
  };
  const createFolderShareLink = async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId || sharePath.length === 0) return;
    setFolderLinkLoading(true);
    setFolderLinkError(null);
    try {
      const payload: any = {
        folderPath: sharePath,
        expiresInDays: Math.max(1, Number(folderLinkExpiresInDays) || 7),
        allowDownload: true,
        allowZipDownload: folderLinkAllowZip,
      };
      if (folderLinkPassword.trim()) payload.password = folderLinkPassword.trim();
      const data: any = await apiFetch(`/orgs/${orgId}/folder-shares`, {
        method: 'POST',
        body: payload,
      });
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = origin ? `${origin}/folder-share/${data.token}` : `/folder-share/${data.token}`;
      setFolderLinkUrl(url);
      const folderKey = sharePath.join('/');
      if (folderKey) {
        setExternalFolderShares((prev) => {
          const current = prev[folderKey] || { count: 0, requiresPassword: false };
          return {
            ...prev,
            [folderKey]: {
              count: current.count + 1,
              requiresPassword: current.requiresPassword || !!payload.password,
            },
          };
        });
        fetchedExternalFolderPathsRef.current.add(folderKey);
      }
      await loadFolderShareLinks(sharePath);
      setFolderLinkPassword('');
    } catch (error: any) {
      setFolderLinkError(error?.message || 'Failed to create folder link');
    } finally {
      setFolderLinkLoading(false);
    }
  };
  const copyFolderShareLink = async () => {
    if (!folderLinkUrl) return;
    try {
      await navigator.clipboard.writeText(folderLinkUrl);
      setFolderLinkCopied(true);
      setTimeout(() => setFolderLinkCopied(false), 1500);
    } catch {
      setFolderLinkError('Failed to copy link');
    }
  };

  if (isLoading || authLoading) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6 space-y-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  // Check if user has permission to read documents
  if (!canReadDocuments) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6 space-y-6">
          <div className="text-center py-12">
            <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
              <FileText className="w-12 h-12 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground mb-4">
              You don't have permission to view documents. Please contact your administrator if you believe this is an error.
            </p>
            <Button asChild variant="outline">
              <Link href="/">Go to Dashboard</Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const currentFolderShare = path.length > 0
    ? getFolderShareSummary(path)
    : { internalTeams: 0, externalCount: 0, externalPasswordProtected: false };
  const sharePathSummary = sharePath.length > 0
    ? getFolderShareSummary(sharePath)
    : { internalTeams: 0, externalCount: 0, externalPasswordProtected: false };

  return (
    <AppLayout>
      <div className="min-h-screen flex flex-col">
        {/* Linear-style Header */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-4 md:px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <FolderIcon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">Documents</h1>
                  {/* Breadcrumb Navigation */}
                  <nav className="flex items-center gap-1 text-xs text-muted-foreground">
                    <button
                      className="hover:text-foreground transition-colors"
                      onClick={() => setPath([])}
                    >
                      Root
                    </button>
                    {path.map((seg, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="text-muted-foreground/50">/</span>
                        <button
                          className="hover:text-foreground transition-colors"
                          onClick={() => setPath(path.slice(0, i + 1))}
                        >
                          {seg}
                        </button>
                      </span>
                    ))}
                  </nav>
                  {path.length > 0 && canShare && (currentFolderShare.internalTeams > 0 || currentFolderShare.externalCount > 0) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {currentFolderShare.internalTeams > 0 && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Shared with {currentFolderShare.internalTeams} team{currentFolderShare.internalTeams === 1 ? '' : 's'}
                        </Badge>
                      )}
                      {currentFolderShare.externalCount > 0 && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {currentFolderShare.externalCount} external link{currentFolderShare.externalCount === 1 ? '' : 's'}
                          {currentFolderShare.externalPasswordProtected ? ' (password)' : ''}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-px border border-border/50 rounded-lg p-0.5 bg-muted/20">
                  <Button variant={effectiveView === 'grid' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('grid')} className="h-7 w-7 rounded-md"><Grid2X2 className="h-3.5 w-3.5" /></Button>
                  <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('list')} className="h-7 w-7 rounded-md"><List className="h-3.5 w-3.5" /></Button>
                  <Button variant={effectiveView === 'cards' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('cards')} className="h-7 w-7 rounded-md"><Grid3X3 className="h-3.5 w-3.5" /></Button>
                </div>
                {/* Mobile View Toggle */}
                <div className="sm:hidden flex items-center gap-px border border-border/50 rounded-lg p-0.5 bg-muted/20">
                  <Button variant={effectiveView === 'grid' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('grid')} className="h-7 w-7 rounded-md"><Grid2X2 className="h-3.5 w-3.5" /></Button>
                  <Button variant={effectiveView === 'cards' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('cards')} className="h-7 w-7 rounded-md"><Grid3X3 className="h-3.5 w-3.5" /></Button>
                </div>
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {currentFolders.length} folder{currentFolders.length !== 1 ? 's' : ''} • {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
                </span>
                {canCreateDocuments && (
                  <div className="hidden md:flex items-center gap-2">
                    {canShare && path.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { void openShare(path); }}
                        className="h-8 gap-1.5"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">Share Folder</span>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setNewFolderOpen(true)} className="h-8 gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">Folder</span>
                    </Button>
                    <Button size="sm" asChild className="h-8 gap-1.5">
                      <Link href={`/documents/upload${path.length ? `?path=${encodeURIComponent(path.join('/'))}` : ''}`}>
                        <Upload className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">Upload</span>
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-4 md:px-6 py-6 space-y-6">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Department Filter - Always visible for admins */}
            {isAdmin && (
              <Select
                value={selectedDepartmentId || '__all__'}
                onValueChange={(v) => setSelectedDepartmentId(v === '__all__' ? null : v)}
              >
                <SelectTrigger className="hidden md:flex w-full sm:w-48">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Departments</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      <span className="capitalize">{d.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="relative flex-1 min-w-[220px] hidden md:block">
              <Input placeholder="Search documents..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full" />
              {query.trim() && (
                <div className="absolute top-full left-0 mt-1 px-2 py-1 bg-accent text-accent-foreground text-xs rounded-md">
                  {searchState.status === 'loading' ? (
                    <div className="flex items-center gap-1">
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                      Searching documents...
                    </div>
                  ) : searchState.status === 'error' ? (
                    <>Search unavailable, showing current results</>
                  ) : (
                    <>
                      🔍 Search results ({filteredDocs.length})
                    </>
                  )}
                </div>
              )}
            </div>
            <Select value={field} onValueChange={(v) => setField(v as any)} >
              <SelectTrigger className="hidden md:flex w-full sm:w-40"><SelectValue placeholder="All Fields" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fields</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="subject">Subject</SelectItem>
                <SelectItem value="sender">Sender</SelectItem>
                <SelectItem value="receiver">Receiver</SelectItem>
                <SelectItem value="keywords">Keywords</SelectItem>
                <SelectItem value="doctype">Doc Type</SelectItem>
              </SelectContent>
            </Select>


            {selectedIds.size > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-2 w-full lg:w-auto">
                {canMoveDocuments && (
                  <Button variant="outline" onClick={() => setMoveOpen(true)}>Move…</Button>
                )}
                {hasPermission('documents.delete') && (
                  <Button variant="destructive" onClick={() => setConfirmBulkDeleteOpen(true)}>Delete</Button>
                )}
              </div>
            )}

          </div>

          <div className="w-full md:hidden">
            <MobileFilterButton
              title="Filter documents"
              description="Search and departments"
              activeCount={mobileFilterCount}
            >
              <div className="space-y-2">
                <FilterSection title="Search" badge={query.trim() ? 1 : 0} defaultOpen>
                  <div className="space-y-2">
                    <Input
                      placeholder="Search documents..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <Select value={field} onValueChange={(v) => setField(v as any)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Fields" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Fields</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                        <SelectItem value="subject">Subject</SelectItem>
                        <SelectItem value="sender">Sender</SelectItem>
                        <SelectItem value="receiver">Receiver</SelectItem>
                        <SelectItem value="keywords">Keywords</SelectItem>
                        <SelectItem value="doctype">Doc Type</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </FilterSection>

                {isAdmin && (
                  <FilterSection
                    title="Departments"
                    badge={selectedDepartmentId ? 1 : 0}
                    defaultOpen={!!selectedDepartmentId}
                  >
                    <Select
                      value={selectedDepartmentId || '__all__'}
                      onValueChange={(v) => setSelectedDepartmentId(v === '__all__' ? null : v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Departments</SelectItem>
                        {departments.map(d => (
                          <SelectItem key={d.id} value={d.id}>
                            <span className="capitalize">{d.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterSection>
                )}
              </div>
            </MobileFilterButton>
            {canCreateDocuments && (
              <Button
                type="button"
                onClick={() => setFabOpen(true)}
                className="fixed bottom-20 right-4 z-40 h-12 w-12 rounded-full shadow-lg md:hidden"
                size="icon"
              >
                <Plus className="h-5 w-5" />
                <span className="sr-only">Quick actions</span>
              </Button>
            )}
            {canCreateDocuments && (
              <Sheet open={fabOpen} onOpenChange={setFabOpen}>
                <SheetContent side="bottom" className="rounded-t-[32px] border-none pb-12 pt-6">
                  <SheetHeader>
                    <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
                    <SheetTitle className="text-base font-semibold text-center">
                      Quick Actions
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-8 grid grid-cols-2 gap-4">
                    <button
                      onClick={() => {
                        setFabOpen(false);
                        router.push(`/documents/upload${path.length ? `?path=${encodeURIComponent(path.join('/'))}` : ''}`);
                      }}
                      className="group relative overflow-hidden rounded-[2rem] p-5 text-left transition-all active:scale-95 bg-[#F2F0EB] dark:bg-[#1E1C1A] border border-border/10 shadow-sm"
                    >
                      <Upload className="absolute -bottom-4 -right-4 h-24 w-24 -rotate-12 opacity-[0.05] dark:opacity-[0.03]" />
                      <div className="relative z-10">
                        <div className="h-10 w-10 rounded-full bg-white/80 dark:bg-black/20 flex items-center justify-center mb-6 shadow-sm">
                          <Upload className="h-5 w-5 text-foreground/70" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Add New</p>
                          <h3 className="text-base font-bold text-foreground">Document</h3>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setFabOpen(false);
                        setNewFolderOpen(true);
                      }}
                      className="group relative overflow-hidden rounded-[2rem] p-5 text-left transition-all active:scale-95 bg-[#F0E4E4] dark:bg-[#2A2020] border border-border/10 shadow-sm"
                    >
                      <FolderIcon className="absolute -bottom-4 -right-4 h-24 w-24 -rotate-12 opacity-[0.05] dark:opacity-[0.03]" />
                      <div className="relative z-10">
                        <div className="h-10 w-10 rounded-full bg-white/80 dark:bg-black/20 flex items-center justify-center mb-6 shadow-sm">
                          <Plus className="h-5 w-5 text-foreground/70" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Create</p>
                          <h3 className="text-base font-bold text-foreground">Folder</h3>
                        </div>
                      </div>
                    </button>
                    {canShare && path.length > 0 && (
                      <button
                        onClick={() => {
                          setFabOpen(false);
                          void openShare(path);
                        }}
                        className="group relative overflow-hidden rounded-[2rem] p-5 text-left transition-all active:scale-95 bg-[#E8EEF8] dark:bg-[#1A222D] border border-border/10 shadow-sm col-span-2"
                      >
                        <Share2 className="absolute -bottom-4 -right-4 h-24 w-24 -rotate-12 opacity-[0.05] dark:opacity-[0.03]" />
                        <div className="relative z-10">
                          <div className="h-10 w-10 rounded-full bg-white/80 dark:bg-black/20 flex items-center justify-center mb-6 shadow-sm">
                            <Share2 className="h-5 w-5 text-foreground/70" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Manage Access</p>
                            <h3 className="text-base font-bold text-foreground">Share This Folder</h3>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                  <div className="mt-6 text-center">
                    <p className="text-[11px] text-muted-foreground font-medium">
                      Current location: <span className="text-foreground">{path.length ? `/${path.join('/')}` : '/root'}</span>
                    </p>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>

          {/* Folders section (cards)*/}
          {effectiveView !== 'list' && (
            <div>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Folders</h2>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {currentFolders.map((p, idx) => {
                  // Get department info for this folder
                  const folderMetadata = getFolderMetadataSafe(p);
                  const folderKey = p.join('/');
                  const accessIds = folderAccess[folderKey] || [];
                  const firstDept = accessIds.length > 0 ? departments.find(d => d.id === accessIds[0]) : null;
                  const deptName = folderMetadata?.departmentName || firstDept?.name || (accessIds.length === 0 ? 'General' : null);
                  const extraDepts = accessIds.length > 1 ? accessIds.length - 1 : 0;
                  const externalShare = externalFolderShares[folderKey] || { count: 0, requiresPassword: false };

                  return (
                    <Card
                      key={idx}
                      className={`group bg-background/50 hover:bg-muted/30 hover:border-border/60 cursor-pointer transition-all ${dragOverFolderIdx === idx ? 'ring-1 ring-primary' : ''}`}
                      onClick={() => setPath(p)}
                      onDragOver={onFolderDragOver}
                      onDragEnter={() => setDragOverFolderIdx(idx)}
                      onDragLeave={() => setDragOverFolderIdx(null)}
                      onDrop={onFolderDrop(p, idx)}
                    >
                      <CardContent className="p-4">
                        {/* Top row: Icon + Department */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors shrink-0">
                            <ThemeIcon icon={FolderIcon} className="h-5 w-5" />
                          </div>
                          {/* Department Badge - Top Right */}
                          {canShare && deptName && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span
                                className="inline-block max-w-[80px] truncate rounded-md border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground capitalize"
                                title={deptName}
                              >
                                {deptName}
                              </span>
                              {extraDepts > 0 && (
                                <span className="text-[10px] text-muted-foreground/60">+{extraDepts}</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Folder name and item count */}
                        <div className="min-w-0">
                          <div
                            className="font-medium text-sm text-foreground truncate mb-0.5"
                            title={p[p.length - 1]}
                          >
                            {p[p.length - 1]}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getFolderItemCount(p)} items
                          </div>
                          {canShare && (extraDepts > 0 || externalShare.count > 0) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {extraDepts > 0 && (
                                <Badge variant="outline" className="px-1.5 py-0 text-[9px] font-normal">
                                  +{extraDepts} team{extraDepts === 1 ? '' : 's'}
                                </Badge>
                              )}
                              {externalShare.count > 0 && (
                                <Badge variant="outline" className="px-1.5 py-0 text-[9px] font-normal">
                                  {externalShare.count} external
                                  {externalShare.requiresPassword ? ' (pwd)' : ''}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Delete button - bottom right on hover */}
                        {(canShare || hasPermission('documents.delete')) && (
                          <div className="flex justify-end mt-2 -mb-1">
                            {canShare && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openShare(p);
                                }}
                                title="Share folder access"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFolderToDelete(p);
                                setDeletionMode('move_to_root');
                              }}
                              title="Delete folder"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {currentFolders.length === 0 && (
                  <div className="text-sm text-muted-foreground col-span-full">No folders</div>
                )}
              </div>
            </div>
          )}

          {/* Documents */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-medium text-muted-foreground">Documents</h2>
                <span className="text-[10px] text-muted-foreground">
                  ({filteredDocs.length} {query.trim() ? 'found' : 'in current folder'})
                </span>
              </div>
              {selectedDepartmentId && isAdmin && (
                <Badge variant="secondary" className="gap-1 text-[11px]">
                  Filtered by: {departments.find(d => d.id === selectedDepartmentId)?.name}
                  <button
                    onClick={() => setSelectedDepartmentId(null)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                    title="Clear department filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
            {effectiveView === 'list' ? (
              <div className="rounded-lg border border-border/40 bg-card/50 overflow-hidden">
                {/* List Header */}
                <div className="px-4 py-2.5 border-b border-border/30 bg-muted/20">
                  <div className="flex items-center gap-4">
                    <div className="w-5">
                      <input type="checkbox" checked={selectAll} onChange={toggleAll} aria-label="Select all" className="rounded h-3.5 w-3.5" />
                    </div>
                    <div className="w-8" /> {/* Icon spacer */}
                    <div className="flex-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</span>
                    </div>
                    <div className="hidden sm:block w-16">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</span>
                    </div>
                    <div className="hidden md:block w-24">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</span>
                    </div>
                    <div className="hidden lg:block w-28">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sender</span>
                    </div>
                    <div className="w-20">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</span>
                    </div>
                    <div className="w-20">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right block">Actions</span>
                    </div>
                  </div>
                </div>

                {/* List Content */}
                <div>
                  {/* Folders */}
                  {!query.trim() && currentFolders.map((p, idx) => {
                    const folderKey = p.join('/');
                    const shareSummary = getFolderShareSummary(p);
                    return (
                    <div
                      key={`folder-${folderKey}`}
                      className="group flex items-center gap-4 px-4 py-3 border-b border-border/20 bg-muted/10 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setPath(p)}
                      onDragOver={onFolderDragOver}
                      onDrop={onFolderDrop(p, idx)}
                    >
                      {/* Checkbox */}
                      <div className="w-5">
                        <input type="checkbox" disabled aria-label={`Folder ${p[p.length - 1]}`} className="rounded h-3.5 w-3.5 opacity-50" />
                      </div>

                      {/* Icon */}
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 group-hover:bg-primary/15 transition-colors">
                        <ThemeIcon icon={FolderIcon} className="h-4 w-4" />
                      </div>

                      {/* Folder Info */}
                      <div className="flex-1 w-0 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate" title={p[p.length - 1]}>{p[p.length - 1]}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal shrink-0">
                            {getFolderItemCount(p)} items
                          </Badge>
                          {canShare && shareSummary.internalTeams > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal shrink-0">
                              +{shareSummary.internalTeams} team{shareSummary.internalTeams === 1 ? '' : 's'}
                            </Badge>
                          )}
                          {canShare && shareSummary.externalCount > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal shrink-0">
                              {shareSummary.externalCount} external{shareSummary.externalPasswordProtected ? ' (pwd)' : ''}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="hidden sm:block w-16">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide font-normal">Folder</Badge>
                      </div>

                      <div className="hidden md:block w-24">
                        <span className="text-sm text-muted-foreground/50">—</span>
                      </div>

                      <div className="hidden lg:block w-28">
                        <span className="text-sm text-muted-foreground/50">—</span>
                      </div>

                      <div className="w-20">
                        <span className="text-sm text-muted-foreground/50">—</span>
                      </div>

                      {/* Actions */}
                      <div className="w-20 flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                          onClick={(e) => { e.stopPropagation(); setPath(p); }}
                        >
                          Open
                        </Button>
                        {canShare && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openShare(p);
                            }}
                            title="Share folder access"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {hasPermission('documents.delete') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFolderToDelete(p);
                              setDeletionMode('move_to_root');
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    );
                  })}

                  {/* Separator between folders and documents */}
                  {!query.trim() && currentFolders.length > 0 && filteredDocs.length > 0 && (
                    <div className="h-px bg-border/50" />
                  )}

                  {/* Documents */}
                  {filteredDocs.map(d => {
                    const { icon: DocIcon, color: iconColor, bg: iconBg } = getFileTypeIcon((d as any).mimeType, d.filename || d.name);
                    const isSelected = selectedIds.has(d.id);
                    const senderLabel = toSentenceCase(d.sender);
                    const { versionNumber } = getVersionMeta(d);
                    return (
                      <div
                        key={d.id}
                        className={`group flex items-center gap-4 px-4 py-3 border-b border-border/20 hover:bg-muted/30 transition-colors overflow-hidden ${isSelected ? 'bg-primary/5' : ''}`}
                        draggable
                        onDragStart={onDocDragStart}
                        data-id={d.id}
                      >
                        {/* Checkbox */}
                        <div className="w-5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(d.id)}
                            aria-label={`Select ${getDisplayTitle(d)}`}
                            className="rounded h-3.5 w-3.5"
                          />
                        </div>

                        {/* Icon */}
                        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBg} group-hover:opacity-80 transition-opacity shrink-0`}>
                          <DocIcon className={`h-4 w-4 ${iconColor}`} />
                        </div>

                        {/* Document Info */}
                        <div className="flex-1 w-0 min-w-0 overflow-hidden">
                          <Link
                            href={`/documents/${d.id}`}
                            className="block group/link overflow-hidden"
                            onDoubleClick={canUpdateDocuments ? (e) => { e.preventDefault(); startEdit(d); } : undefined}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="text-sm font-medium text-foreground group-hover/link:text-primary truncate block"
                                title={getDisplayTitle(d)}
                              >
                                {getDisplayTitle(d)}
                              </span>
                              <span className="text-[10px] text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded shrink-0">
                                v{versionNumber}
                              </span>
                            </div>
                            {d.sender && (
                              <span className="text-xs text-muted-foreground truncate block" title={`From ${senderLabel || d.sender}`}>
                                From {senderLabel || d.sender}
                              </span>
                            )}
                          </Link>
                        </div>

                        {/* Type */}
                        <div className="hidden sm:block w-16">
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide font-normal">{getExt(d)}</Badge>
                        </div>

                        {/* Category */}
                        <div className="hidden md:block w-24 overflow-hidden">
                          <span className="text-sm text-muted-foreground truncate block" title={d.category || undefined}>{d.category || '—'}</span>
                        </div>

                        {/* Sender */}
                        <div className="hidden lg:block w-28 overflow-hidden">
                          <span className="text-sm text-muted-foreground truncate block" title={senderLabel || d.sender || undefined}>{senderLabel || '—'}</span>
                        </div>

                        {/* Date */}
                        <div className="w-20">
                          <span className="text-xs text-muted-foreground">{formatNiceDate(d)}</span>
                        </div>

                        {/* Actions */}
                        <div className="w-20 flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10"
                          >
                            <Link href={`/documents/${d.id}`}>View</Link>
                          </Button>
                          {hasPermission('documents.delete') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                setDocumentToDelete(d);
                                setConfirmDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty State */}
                  {currentDocs.length === 0 && currentFolders.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 px-6">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
                        <FileText className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                      <h3 className="text-base font-medium text-foreground mb-1">No documents</h3>
                      <p className="text-sm text-muted-foreground text-center max-w-xs">
                        Upload documents or create folders to get started
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : effectiveView === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {filteredDocs.map(d => {
                  const { icon: DocIcon, color: iconColor, bg: iconBg } = getFileTypeIcon((d as any).mimeType, d.filename || d.name);
                  const { versionNumber } = getVersionMeta(d);
                  return (
                    <Popover key={d.id}>
                      <PopoverTrigger asChild>
                        <Card className="bg-background/50 hover:bg-muted/30 hover:border-border/60 transition-all" draggable onDragStart={onDocDragStart} data-id={d.id}>
                          <CardContent className="p-3 sm:p-4">
                            <Link href={`/documents/${d.id}`} className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <div className={`h-8 w-8 rounded-md ${iconBg} ${iconColor} flex items-center justify-center`}>
                                  <DocIcon className="h-4 w-4" />
                                </div>
                                <div className="flex items-center gap-2">
                                  {isAdmin && renderDepartmentBadge((d as any).departmentId || (d as any).department_id || null)}
                                  <span className="rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    v{versionNumber}
                                  </span>
                                  <span className="rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{(d.documentType || d.type)}</span>
                                </div>
                              </div>
                              {editingId === d.id ? (
                                <input
                                  className="border rounded px-2 py-1 text-xs sm:text-sm w-full"
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  onBlur={() => commitEdit(d.id)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(d.id); if (e.key === 'Escape') { setEditingId(null); setEditingTitle(''); } }}
                                  autoFocus
                                />
                              ) : (
                                <div className="font-medium text-sm line-clamp-2" onDoubleClick={canUpdateDocuments ? (e) => { e.preventDefault(); startEdit(d); } : undefined}>{getDisplayTitle(d)}</div>
                              )}
                            </Link>
                          </CardContent>
                        </Card>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-80 p-4">
                        <div className="space-y-2">
                          <div className="font-semibold">{getDisplayTitle(d)}</div>
                          {d.aiPurpose && <p className="text-xs text-muted-foreground line-clamp-4">{d.aiPurpose}</p>}
                          <div className="text-[10px] text-muted-foreground flex gap-3"><span>{formatNiceDate(d)}</span><span>{d.fileSizeBytes ? `${(d.fileSizeBytes / 1024).toFixed(2)} KB` : ''}</span></div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {filteredDocs.map(d => {
                  const { icon: DocIcon, color: iconColor, bg: iconBg } = getFileTypeIcon((d as any).mimeType, d.filename || d.name);
                  const senderLabel = toSentenceCase(d.sender);
                  const { versionNumber } = getVersionMeta(d);
                  return (
                    <Card key={d.id} className="group relative bg-background/50 hover:bg-muted/30 hover:border-border/60 transition-all overflow-hidden flex flex-col">
                      <CardContent className="p-3 flex flex-col h-full space-y-2">
                        {/* Top: Icon + Badge */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className={`h-7 w-7 rounded-md ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}>
                            <DocIcon className="h-3.5 w-3.5" />
                          </div>
                          {isAdmin && renderDepartmentBadge((d as any).departmentId || (d as any).department_id || null)}
                        </div>

                        {/* Title */}
                        <div className="flex-1 min-w-0">
                          <Link href={`/documents/${d.id}`} className="block">
                            <h3 className="font-medium text-[13px] leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors" title={getDisplayTitle(d)}>
                              {getDisplayTitle(d)}
                            </h3>
                          </Link>
                        </div>

                        {/* Metadata Box */}
                        <div className="pt-2 mt-auto border-t border-border/40 flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="font-medium bg-muted/50 px-1 rounded">v{versionNumber}</span>
                            <span className="truncate max-w-[60%]">{formatNiceDate(d)}</span>
                          </div>
                          {senderLabel && (
                            <p className="text-[10px] text-muted-foreground truncate" title={`From ${senderLabel}`}>
                              {senderLabel}
                            </p>
                          )}
                        </div>

                        <Link href={`/documents/${d.id}`} className="absolute inset-0 z-0">
                          <span className="sr-only">View Details</span>
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
                {currentDocs.length === 0 && (
                  <div className="text-sm text-muted-foreground col-span-full">No documents</div>
                )}
              </div>
            )}
          </div>
        </main>

        <FolderPickerDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          folders={(folders || []).map((p) => ({
            id: p.join('/'),
            path: p,
            label: `/${p.join('/')}`,
            name: p[p.length - 1] || 'Folder',
          }))}
          currentPath={path}
          onSelect={onBulkMoveSelect}
          onCreateFolder={async (parentPath, name) => {
            await createFolder(parentPath, name);
            await refresh();
          }}
          onLoadChildren={loadFolderChildren}
          loading={false}
          title={`Move ${selectedIds.size} documents`}
        />

        {
          canCreateDocuments && (
            <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a new folder</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Folder name</label>
                  <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="e.g., Q3 Reports" />
                  <p className="text-xs text-muted-foreground">It will be created under: /{path.join('/')}</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewFolderOpen(false)} disabled={creatingFolder}>Cancel</Button>
                  <Button
                    disabled={creatingFolder}
                    onClick={async () => {
                      const name = newFolderName.trim();
                      if (!name) { toast({ title: 'Please enter a folder name', variant: 'destructive' }); return; }
                      if (name.includes('/')) { toast({ title: 'Folder name cannot contain /', variant: 'destructive' }); return; }
                      if (name.length > 100) { toast({ title: 'Folder name too long (max 100 characters)', variant: 'destructive' }); return; }
                      const existingFolders = listFolders(path);
                      const normalizedName = name.toLowerCase().trim();
                      const exists = existingFolders.some(p => (p[p.length - 1] || '').toLowerCase().trim() === normalizedName);
                      if (exists) {
                        toast({
                          title: 'Folder already exists',
                          description: `A folder named "${name}" already exists in this location.`,
                          variant: 'destructive'
                        });
                        return;
                      }
                      setCreatingFolder(true);
                      try {
                        await createFolder(path, name);
                        setPath([...path, name]);
                        setNewFolderName('');
                        setNewFolderOpen(false);
                        toast({ title: 'Folder created' });
                      } catch (error: any) {
                        let errorMessage = 'Unknown error occurred';
                        if (error?.data?.message) {
                          errorMessage = error.data.message;
                        } else if (error?.data?.error) {
                          errorMessage = error.data.error;
                        } else if (error instanceof Error) {
                          errorMessage = error.message;
                        }
                        if (error?.status === 409 || errorMessage.includes('already exists')) {
                          errorMessage = `Folder "${name}" already exists in this location.`;
                        }
                        toast({
                          title: 'Failed to create folder',
                          description: errorMessage,
                          variant: 'destructive'
                        });
                      } finally {
                        setCreatingFolder(false);
                      }
                    }}
                  >
                    {creatingFolder ? (
                      <>
                        <span className="animate-spin mr-2">⟳</span>
                        Creating...
                      </>
                    ) : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }

        {/* Folder Deletion Confirmation Dialog */}
        <UiDialog
          open={shareOpen}
          onOpenChange={(open) => {
            setShareOpen(open);
            if (!open) setShareModalTab('internal');
          }}
        >
          <UiDialogContent>
            <UiDialogHeader>
              <UiDialogTitle>Share folder {sharePath.join(' / ') || '/'}</UiDialogTitle>
              <UiDialogDescription>
                Configure internal team access and optional external read/download link for this folder.
              </UiDialogDescription>
            </UiDialogHeader>
            <div className="space-y-5">
              {sharePath.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {sharePathSummary.internalTeams > 0 ? (
                    <Badge variant="outline" className="text-[11px] font-normal">
                      Shared with {sharePathSummary.internalTeams} team{sharePathSummary.internalTeams === 1 ? '' : 's'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] font-normal">Not shared with other teams</Badge>
                  )}
                  {sharePathSummary.externalCount > 0 ? (
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {sharePathSummary.externalCount} external link{sharePathSummary.externalCount === 1 ? '' : 's'}
                      {sharePathSummary.externalPasswordProtected ? ' (password)' : ''}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] font-normal">No external links</Badge>
                  )}
                </div>
              )}
              <Tabs value={shareModalTab} onValueChange={(value) => setShareModalTab(value as 'internal' | 'external')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="internal">Internal</TabsTrigger>
                  <TabsTrigger value="external">External</TabsTrigger>
                </TabsList>

                <TabsContent value="internal" className="mt-4 space-y-2">
                  <p className="text-sm text-muted-foreground">Select teams that should access this folder and its subfolders.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {departments.map(d => {
                      const isOwnerDept = ownerShareDeptId === d.id;
                      const isChecked = isOwnerDept || shareDeptIds.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center gap-2 text-sm ${isOwnerDept ? 'opacity-90' : ''}`}
                        >
                          <Checkbox
                            checked={isChecked}
                            disabled={isOwnerDept}
                            onCheckedChange={(v: any) => toggleShareDept(d.id, !!v)}
                          />
                          <span className="capitalize" data-color={d.color || 'default'}>{d.name}</span>
                          {isOwnerDept && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Lock className="h-3 w-3" />
                              Owner
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="external" className="mt-4 space-y-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Create external folder link</p>
                      <p className="text-xs text-muted-foreground">Read and download access only.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Expires in</label>
                        <Select value={folderLinkExpiresInDays} onValueChange={setFolderLinkExpiresInDays}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select expiry" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 day</SelectItem>
                            <SelectItem value="7">7 days</SelectItem>
                            <SelectItem value="30">30 days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Password (optional)</label>
                        <Input
                          type="password"
                          value={folderLinkPassword}
                          onChange={(e) => setFolderLinkPassword(e.target.value)}
                          placeholder="Add password"
                        />
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <Checkbox checked={folderLinkAllowZip} onCheckedChange={(v: any) => setFolderLinkAllowZip(!!v)} />
                      <span>Allow zip download</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <Button onClick={createFolderShareLink} disabled={folderLinkLoading || sharePath.length === 0}>
                        {folderLinkLoading ? 'Creating...' : 'Create link'}
                      </Button>
                      {folderLinkUrl && (
                        <Button variant="outline" onClick={copyFolderShareLink} className="gap-1.5">
                          {folderLinkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {folderLinkCopied ? 'Copied' : 'Copy'}
                        </Button>
                      )}
                    </div>
                    {folderLinkError && (
                      <p className="text-xs text-destructive">{folderLinkError}</p>
                    )}
                    {folderLinkUrl && (
                      <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs break-all">
                        {folderLinkUrl}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border/40 pt-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Active external links</p>
                      {isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { void loadFolderShareLinks(sharePath); }}
                          disabled={folderShareLinksLoading}
                        >
                          {folderShareLinksLoading ? 'Loading...' : 'Refresh'}
                        </Button>
                      )}
                    </div>
                    {!isAdmin ? (
                      <p className="text-xs text-muted-foreground">Only org admins can view active external links.</p>
                    ) : folderShareLinksError ? (
                      <p className="text-xs text-destructive">{folderShareLinksError}</p>
                    ) : folderShareLinksLoading ? (
                      <p className="text-xs text-muted-foreground">Loading external links...</p>
                    ) : folderShareLinks.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No active external links found for this folder.</p>
                    ) : (
                      <div className="space-y-2">
                        {folderShareLinks.map((link) => (
                          <div key={link.id} className="rounded-md border border-border/50 px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {link.requires_password && (
                                    <Badge variant="outline" className="text-[10px]">Password</Badge>
                                  )}
                                  {link.allow_zip_download && (
                                    <Badge variant="outline" className="text-[10px]">ZIP</Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  Created {formatAppDateTime(link.created_at)}
                                  {link.expires_at ? ` • Expires ${formatAppDateTime(link.expires_at)}` : ''}
                                  {link.views_count ? ` • ${link.views_count} views` : ''}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { void revokeFolderShareLink(link.id); }}
                                disabled={revokingShareId === link.id}
                              >
                                {revokingShareId === link.id ? 'Revoking...' : 'Revoke'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            <UiDialogFooter>
              <Button variant="outline" onClick={() => setShareOpen(false)}>Cancel</Button>
              <Button onClick={saveShare}>Save</Button>
            </UiDialogFooter>
          </UiDialogContent>
        </UiDialog>

        <Dialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Folder</DialogTitle>
              <DialogDescription>
                Choose how to handle documents currently inside this folder.
              </DialogDescription>
            </DialogHeader>

            {folderToDelete && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You are about to delete the folder <span className="font-medium">"{folderToDelete[folderToDelete.length - 1]}"</span>.
                </p>

                {getDocumentsInPath(folderToDelete).length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">
                      This folder contains {getDocumentsInPath(folderToDelete).length} document(s). What would you like to do?
                    </p>

                    <RadioGroup value={deletionMode} onValueChange={(value: 'move_to_root' | 'delete_all') => setDeletionMode(value)}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="move_to_root" id="move" />
                        <label htmlFor="move" className="text-sm">
                          <span className="font-medium">Move documents to parent folder</span>
                          <br />
                          <span className="text-muted-foreground">Documents will be preserved and moved one level up</span>
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="delete_all" id="delete" />
                        <label htmlFor="delete" className="text-sm">
                          <span className="font-medium text-destructive">Delete all documents</span>
                          <br />
                          <span className="text-muted-foreground">All documents and their files will be permanently deleted</span>
                        </label>
                      </div>
                    </RadioGroup>
                  </div>
                )}

                {getDocumentsInPath(folderToDelete).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    This folder is empty and will be deleted immediately.
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setFolderToDelete(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button
                variant={deletionMode === 'delete_all' ? 'destructive' : 'default'}
                onClick={handleFolderDeletion}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : (
                  deletionMode === 'delete_all' ? 'Delete All' : 'Delete Folder'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Confirmation Dialog */}
        <Dialog open={confirmBulkDeleteOpen} onOpenChange={setConfirmBulkDeleteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Documents</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete <span className="font-medium">{selectedIds.size} document(s)</span>?
                This action cannot be undone.
              </p>

              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm text-destructive font-medium">
                  ⚠️ Warning: This will permanently delete the selected documents and their files.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmBulkDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={bulkDelete}
              >
                Delete {selectedIds.size} Document{selectedIds.size === 1 ? '' : 's'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Individual Delete Confirmation Dialog */}
        <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Document</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete <span className="font-medium">"{documentToDelete?.title || documentToDelete?.name}"</span>?
                This action cannot be undone.
              </p>

              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm text-destructive font-medium">
                  ⚠️ Warning: This will permanently delete the document and its files.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleSingleDelete}
              >
                Delete Document
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

// Wrap in Suspense for useSearchParams
export default function DocumentsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DocumentsPageContent />
    </Suspense>
  );
}
