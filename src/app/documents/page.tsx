"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useDocuments } from '@/hooks/use-documents';
import { useAuth } from '@/hooks/use-auth';
import { useSettings } from '@/hooks/use-settings';
import type { StoredDocument } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Grid2X2, List, Grid3X3, Folder as FolderIcon, FileText, Trash2, ArrowLeft, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { Dialog as UiDialog, DialogContent as UiDialogContent, DialogFooter as UiDialogFooter, DialogHeader as UiDialogHeader, DialogTitle as UiDialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { apiFetch, getApiContext } from '@/lib/api';
import { MobileFilterButton, FilterSection } from '@/components/mobile-filter-button';
import { Plus, Upload } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type ViewMode = 'grid' | 'list' | 'cards';

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

function DocumentsPageContent() {
  const { documents, folders, listFolders, getFolderMetadata, getDocumentsInPath, createFolder, deleteFolder, removeDocument, updateDocument, moveDocumentsToPath, isLoading, loadAllDocuments, refresh, ensureFolderMetadata } = useDocuments();
  const { departments, selectedDepartmentId, setSelectedDepartmentId, loading: departmentsLoading } = useDepartments();
  const { hasRoleAtLeast, hasPermission, isLoading: authLoading, bootstrapData } = useAuth();
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
  
  // Prevent loading documents if user doesn't have access
  React.useEffect(() => {
    if (!authLoading && !hasAccess) {
      console.log('User does not have access to documents page, skipping document load');
      return;
    }
  }, [authLoading, hasAccess]);
  
  // Global debug: Log when departments vs documents are loaded
  React.useEffect(() => {
    console.log('DocumentsPageContent state:', {
      departmentsCount: departments.length,
      documentsCount: documents.length,
      departmentsLoading,
      documentsLoading: isLoading,
      selectedDepartmentId,
      canReadDocuments,
      canCreateDocuments,
      canUpdateDocuments,
      canDeleteDocuments
    });
  }, [departments.length, documents.length, departmentsLoading, isLoading, selectedDepartmentId, canReadDocuments, canCreateDocuments, canUpdateDocuments, canDeleteDocuments]);
  
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
  const { toast } = useToast();

  const currentFolders = listFolders(path);
  const currentDocs = getDocumentsInPath(path);
  const [query, setQuery] = useState('');
  const [field, setField] = useState<'all' | 'title' | 'subject' | 'sender' | 'receiver' | 'keywords' | 'doctype'>('all');
  const effectiveView: ViewMode = isMobile && view === 'list' ? 'grid' : view;
  const mobileFilterCount =
    (query.trim() ? 1 : 0) +
    (field !== 'all' ? 1 : 0) +
    (selectedDepartmentId ? 1 : 0);


  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [movePathInput, setMovePathInput] = useState('');
  const [dragOverFolderIdx, setDragOverFolderIdx] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePath, setSharePath] = useState<string[]>([]);
  const [shareDeptIds, setShareDeptIds] = useState<string[]>([]);
  const [folderAccess, setFolderAccess] = useState<Record<string, string[]>>({});
  const isAdmin = hasRoleAtLeast('systemAdmin');
  const canShare = hasRoleAtLeast('teamLead');
  
  useEffect(() => {
    if (!canShare) return;
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    const missing = currentFolders
      .map(p => p.filter(Boolean))
      .filter(p => p.length > 0)
      .filter(p => !folderAccess[p.join('/')]);
    if (missing.length === 0) return;
    (async () => {
      try {
        const res = await apiFetch<{ results: Record<string, string[]> }>(`/orgs/${orgId}/folder-access/batch`, {
          method: 'POST',
          body: { paths: missing },
        });
        const map = res?.results || {};
        setFolderAccess(prev => ({ ...prev, ...map }));
      } catch {}
    })();
  }, [currentFolders, canShare, folderAccess]);

  const renderDepartmentBadge = useCallback((deptId: string | null | undefined) => {
    const id = deptId || null;
    if (!id) {
      return (
        <span className="rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color="default">
          General
        </span>
      );
    }
    const dept = departments.find(d => d.id === id);
    if (dept) {
      return (
        <span className="rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color={dept.color || 'default'}>
          {dept.name}
        </span>
      );
    }
    return (
      <span className="rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color="default">
        Team unavailable
      </span>
    );
  }, [departments]);
  const bulkTagInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  
  // Folder deletion dialog state
  const [folderToDelete, setFolderToDelete] = useState<string[] | null>(null);
  const [deletionMode, setDeletionMode] = useState<'move_to_root' | 'delete_all'>('move_to_root');
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Bulk delete confirmation dialog state
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  
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

  // Load all documents when searching (progressive), debounced to reduce churn
  useEffect(() => {
    if (!query.trim()) return;
    const tid = setTimeout(() => { void loadAllDocuments(); }, 250);
    return () => clearTimeout(tid);
  }, [query, loadAllDocuments]);

  const filteredDocs = useMemo(() => {
    // Show all documents without current version filtering
    const allDocs = documents.filter(d => d.type !== 'folder'); // Exclude folder placeholders

    // When searching, always search all documents globally
    const base = query.trim() ? allDocs : currentDocs.filter(d => d.type !== 'folder');

    if (!query.trim()) return base;

    const q = query.toLowerCase();
    const searchResults = base.filter(d => {
      // Final safety check: ensure we never return folders in search results
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

    // SUPER SIMPLE: Just filter out any remaining folders
    const finalResults = searchResults.filter(d => d.type !== 'folder');
    return finalResults;
  }, [query, field, currentDocs, documents]);

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

  const bulkDelete = () => {
    selectedIds.forEach(id => removeDocument(id));
    setSelectedIds(new Set());
    setSelectAll(false);
    setConfirmBulkDeleteOpen(false);
    // Refresh the documents list to ensure UI updates immediately
    setTimeout(() => refresh(), 100);
  };

  const handleSingleDelete = () => {
    if (documentToDelete) {
      removeDocument(documentToDelete.id);
      setDocumentToDelete(null);
      setConfirmDeleteOpen(false);
      // Refresh the documents list to ensure UI updates immediately
      setTimeout(() => refresh(), 100);
    }
  };

  const bulkAddTag = () => {
    const tag = bulkTag.trim();
    if (!tag) return;
    selectedIds.forEach(id => updateDocument(id, prev => ({
      ...prev,
      tags: Array.from(new Set([...(prev.tags || []), tag]))
    })));
    setBulkTag('');
  };

  const onBulkMove = () => {
    const dest = movePathInput.split('/').filter(Boolean);
    if (dest.length === 0) { toast({ title: 'Enter destination path', variant: 'destructive' }); return; }
    // ensure folders exist
    for (let i = 0; i < dest.length; i++) {
      const slice = dest.slice(0, i + 1);
      createFolder(slice.slice(0, -1), slice[slice.length - 1]);
    }
    moveDocumentsToPath(Array.from(selectedIds), dest);
    setSelectedIds(new Set());
    setMoveOpen(false);
    setMovePathInput('');
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
      } else if (e.key.toLowerCase() === 't') {
        bulkTagInputRef.current?.focus();
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
    } catch {}
    setDragOverFolderIdx(null);
  };

  const openShare = async (pathArr: string[]) => {
    setSharePath(pathArr);
    setShareOpen(true);
    try {
      const orgId = getApiContext().orgId || '';
      const params = new URLSearchParams();
      params.set('path', pathArr.join('/'));
      const data = await apiFetch<{ path: string[]; departments: string[] }>(`/orgs/${orgId}/folder-access?${params.toString()}`);
      setShareDeptIds(data.departments || []);
    } catch {
      setShareDeptIds([]);
    }
  };
  const toggleShareDept = (id: string, checked: boolean) => {
    setShareDeptIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };
  const saveShare = async () => {
    try {
      const orgId = getApiContext().orgId || '';
      await apiFetch(`/orgs/${orgId}/folder-access`, { method: 'PUT', body: { path: sharePath, departmentIds: shareDeptIds } });
      setShareOpen(false);
    } catch {}
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

  return (
    <AppLayout>
      <div className="px-3 pt-2 pb-24 md:px-6 md:pb-6 space-y-5 md:space-y-6">
        {/* Navigation Header with Back Button */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {path.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPath(path.slice(0, -1))}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <div className="text-xs text-muted-foreground sm:text-sm">
            <button className="text-primary hover:underline" onClick={() => setPath([])}>Root</button>
            {path.map((seg, i) => (
              <span key={i} className="ml-2">/ <button className="hover:underline" onClick={() => setPath(path.slice(0, i + 1))}>{seg}</button></span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {hasRoleAtLeast('member') && canCreateDocuments && (
            <div className="hidden md:flex items-center gap-2">
              <Button asChild className="gap-2">
                <Link href={`/documents/upload${path.length ? `?path=${encodeURIComponent(path.join('/'))}` : ''}`}>
                  <Upload className="h-4 w-4" />
                  Upload
                </Link>
              </Button>
              <Button onClick={() => setNewFolderOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Folder
              </Button>
            </div>
          )}
          {/* Department Filter - Always visible for admins */}
          {hasRoleAtLeast('systemAdmin') && (
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
                {isLoading ? (
                  <div className="flex items-center gap-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                    Loading all documents for search...
                  </div>
                ) : (
                  <>
                    🔍 Searching all folders ({filteredDocs.length} results)
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
              <Input ref={bulkTagInputRef} placeholder={`Add tag to ${selectedIds.size} selected`} value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} className="w-full sm:w-56" />
              {hasRoleAtLeast('member') && (
                <Button variant="outline" onClick={bulkAddTag}>Add Tag</Button>
              )}
              {hasRoleAtLeast('member') && (
                <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">Move…</Button>
                  </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Move {selectedIds.size} documents</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Destination path</label>
                    <Input value={movePathInput} onChange={(e) => setMovePathInput(e.target.value)} placeholder="e.g., Finance/2025/Q1" />
                    <p className="text-xs text-muted-foreground">New folders will be created automatically.</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
                    <Button onClick={onBulkMove}>Move</Button>
                  </DialogFooter>
                </DialogContent>
                </Dialog>
              )}
              {hasPermission('documents.delete') && (
                <Button variant="destructive" onClick={() => setConfirmBulkDeleteOpen(true)}>Delete</Button>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-1">
              <Button variant={effectiveView === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setView('grid')}><Grid2X2 className="h-4 w-4" /></Button>
              <Button variant={view === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setView('list')} className="hidden sm:inline-flex"><List className="h-4 w-4" /></Button>
              <Button variant={effectiveView === 'cards' ? 'default' : 'outline'} size="icon" onClick={() => setView('cards')}><Grid3X3 className="h-4 w-4" /></Button>
            </div>
          </div>
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

              {hasRoleAtLeast('systemAdmin') && (
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
          {hasRoleAtLeast('member') && canCreateDocuments && (
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
          {hasRoleAtLeast('member') && canCreateDocuments && (
            <Sheet open={fabOpen} onOpenChange={setFabOpen}>
              <SheetContent side="bottom" className="rounded-t-[32px] border-none pb-12 pt-6">
                <SheetHeader>
                  <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
                  <SheetTitle className="text-base font-semibold text-center">
                    Quick Actions
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-3">
                  <Button
                    className="w-full justify-between"
                    onClick={() => {
                      setFabOpen(false);
                      window.location.href = `/documents/upload${path.length ? `?path=${encodeURIComponent(path.join('/'))}` : ''}`;
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload Document
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {path.length ? `/${path.join('/')}` : '/'}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => {
                      setFabOpen(false);
                      setNewFolderOpen(true);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      New Folder
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {path.length ? `/${path.join('/')}` : '/'}
                    </span>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>

        {/* Folders section (cards)*/}
        {effectiveView !== 'list' && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground mb-2 sm:text-sm">Folders</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {currentFolders.map((p, idx) => (
                <Card
                  key={idx}
                  className={`group hover:shadow-sm cursor-pointer ${dragOverFolderIdx === idx ? 'ring-1 ring-primary' : ''}`}
                  onClick={() => setPath(p)}
                  onDragOver={onFolderDragOver}
                  onDragEnter={() => setDragOverFolderIdx(idx)}
                  onDragLeave={() => setDragOverFolderIdx(null)}
                  onDrop={onFolderDrop(p, idx)}
                >
                  <CardContent className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
                    <ThemeIcon icon={FolderIcon} className="h-7 w-7 sm:h-8 sm:w-8" />
                    <div className="flex-1">
                      <div className="font-medium text-sm sm:text-base">{p[p.length - 1]}</div>
                      <div className="text-[11px] text-muted-foreground mb-2">
                        {getDocumentsInPath(p).length} items
                      </div>
                      {/* Department/Team Badge */}
                      <div className="flex items-center gap-2">
                        {hasRoleAtLeast('teamLead') ? (
                          (() => {
                            const folderMetadata = getFolderMetadata(p);
                            if (folderMetadata?.departmentName) {
                              return (
                                <span className="rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color="default">
                                  {folderMetadata.departmentName}
                                </span>
                              );
                            }

                            const key = p.join('/');
                            const ids = folderAccess[key] || [];
                            if (ids.length === 0) return (
                              <span className="rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color="default">General</span>
                            );
                            const first = departments.find(d => d.id === ids[0]);
                            const rest = ids.length - 1;
                            return (
                              <span className="inline-flex items-center gap-1">
                                <span className="rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color={first?.color || 'default'}>{first?.name || '—'}</span>
                                {rest > 0 && <span className="text-xs text-muted-foreground">+{rest}</span>}
                              </span>
                            );
                          })()
                        ) : null}
                      </div>
                    </div>
                    {hasPermission('documents.delete') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderToDelete(p);
                          setDeletionMode('move_to_root'); // Reset to default
                        }}
                        title="Delete folder"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              {currentFolders.length === 0 && (
                <div className="text-sm text-muted-foreground">No folders</div>
              )}
            </div>
          </div>
        )}

        {/* Documents */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-muted-foreground sm:text-sm">Documents</h2>
              <span className="text-[11px] text-muted-foreground sm:text-xs">
                ({filteredDocs.length} {query.trim() ? 'found' : 'in current folder'})
              </span>
            </div>
            {selectedDepartmentId && hasRoleAtLeast('systemAdmin') && (
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
            <div className="overflow-x-auto rounded-md border text-xs sm:text-sm">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="whitespace-nowrap">
                    <th className="p-2 sm:p-3 w-10 text-center"><input type="checkbox" checked={selectAll} onChange={toggleAll} aria-label="Select all" /></th>
                    <th className="text-left p-2 sm:p-3">Name</th>
                    <th className="text-left p-2 sm:p-3">Type</th>
                    <th className="text-left p-2 sm:p-3">Category</th>
                    <th className="text-left p-2 sm:p-3">Sender</th>
                    <th className="text-left p-2 sm:p-3">Team</th>
                    <th className="text-left p-2 sm:p-3">Date</th>
                    <th className="p-2 sm:p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Folders as table rows */}
                  {/* Only show folders when NOT searching */}
                  {!query.trim() && currentFolders.map((p, idx) => (
                    <tr
                      key={`folder-${p.join('/')}`}
                      className="border-t hover:bg-accent/40 cursor-pointer"
                      onClick={() => setPath(p)}
                      onDragOver={onFolderDragOver}
                      onDrop={onFolderDrop(p, idx)}
                    >
                      <td className="p-2 sm:p-3 text-center">
                        <input type="checkbox" disabled aria-label={`Folder ${p[p.length-1]}`} />
                      </td>
                      <td className="p-2 sm:p-3">
                        <div className="flex items-center gap-2">
                          <ThemeIcon icon={FolderIcon} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span className="font-medium text-xs sm:text-sm">{p[p.length - 1]}</span>
                        </div>
                      </td>
                      <td className="p-2 sm:p-3 lowercase">
                        <span className="rounded-md border px-2 py-0.5 text-[9px] sm:text-[10px] uppercase tracking-wide">FOLDER</span>
                      </td>
                      <td className="p-2 sm:p-3">—</td>
                      <td className="p-2 sm:p-3">—</td>
                      <td className="p-2 sm:p-3">
                        {hasRoleAtLeast('teamLead') ? (
                          (() => {
                            const folderMetadata = getFolderMetadata(p);
                            if (folderMetadata?.departmentName) {
                              return (
                                <span className="rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color="default">
                                  {folderMetadata.departmentName}
                                </span>
                              );
                            }

                            const key = p.join('/');
                            const ids = folderAccess[key] || [];
                            if (ids.length === 0) return (
                              <span className="rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color="default">General</span>
                            );
                            const first = departments.find(d => d.id === ids[0]);
                            const rest = ids.length - 1;
                            return (
                              <span className="inline-flex items-center gap-1">
                                <span className="rounded-md border px-2 py-0.5 text-[10px] capitalize" data-color={first?.color || 'default'}>{first?.name || '—'}</span>
                                {rest > 0 && <span className="text-xs text-muted-foreground">+{rest}</span>}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="text-muted-foreground">{getDocumentsInPath(p).length} items</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-3 text-right flex items-center justify-end gap-2 sm:gap-3">
                        {/* Open and Share buttons removed */}
                      </td>
                    </tr>
                  ))}
                  {filteredDocs.map(d => (
                    <tr key={d.id} className="border-t" draggable onDragStart={onDocDragStart} data-id={d.id}>
                      <td className="p-2 sm:p-3 text-center"><input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleOne(d.id)} aria-label={`Select ${d.title || d.name}`} /></td>
                      <td className="p-2 sm:p-3">
                        <Popover>
                          <PopoverTrigger asChild>
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
                              <Link href={`/documents/${d.id}`} className="flex items-center gap-2 hover:underline" onDoubleClick={hasRoleAtLeast('member') && canUpdateDocuments ? (e) => { e.preventDefault(); startEdit(d); } : undefined}><ThemeIcon icon={FileText} className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="line-clamp-2">{d.title || d.name}</span></Link>
                            )}
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-96 p-4">
                            <div className="space-y-2">
                              <div className="font-semibold">{d.title || d.name}</div>
                              <p className="text-xs text-muted-foreground line-clamp-5">{d.summary || d.aiPurpose || d.description}</p>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </td>
                      <td className="p-2 sm:p-3 lowercase">
                        <span className="rounded-md border px-2 py-0.5 text-[9px] sm:text-[10px] uppercase tracking-wide">{getExt(d)}</span>
                      </td>
                      <td className="p-2 sm:p-3">{d.category || '—'}</td>
                      <td className="p-2 sm:p-3">{d.sender || '—'}</td>
                      <td className="p-2 sm:p-3">
                        {hasRoleAtLeast('systemAdmin') ? (
                          renderDepartmentBadge((d as any).departmentId || (d as any).department_id || null)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-3">{formatNiceDate(d)}</td>
                      <td className="p-2 sm:p-3 text-right flex items-center justify-end gap-2 sm:gap-3">
                        {d.versionNumber && (
                          <span className="rounded-md border px-2 py-0.5 text-[9px] sm:text-[10px]">v{d.versionNumber}{d.isCurrentVersion ? ' · current' : ''}</span>
                        )}
                        {Array.isArray(d.linkedDocumentIds) && d.linkedDocumentIds.length > 0 && (
                          <Link href={`/documents/${d.id}#linked`} className="text-[11px] rounded-md border px-2 py-0.5" title={`${d.linkedDocumentIds.length} linked`}>
                            {d.linkedDocumentIds.length} linked
                          </Link>
                        )}
                        <Link href={`/documents/${d.id}`} className="text-primary hover:underline">View</Link>
                        {hasPermission('documents.delete') && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-600 hover:text-red-700 h-auto p-1"
                            onClick={() => {
                              setDocumentToDelete(d);
                              setConfirmDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {currentDocs.length === 0 && (
                    <tr><td className="p-3 text-sm text-muted-foreground" colSpan={8}>No documents</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : effectiveView === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {filteredDocs.map(d => (
                <Popover key={d.id}>
                  <PopoverTrigger asChild>
                    <Card className="hover:shadow-sm" draggable onDragStart={onDocDragStart} data-id={d.id}>
                      <CardContent className="p-4 sm:p-5">
                        <Link href={`/documents/${d.id}`} className="flex flex-col gap-2.5 sm:gap-3">
                          <div className="flex items-center justify-between">
                            <ThemeIcon icon={FileText} className="h-7 w-7 sm:h-8 sm:w-8" />
                            <div className="flex items-center gap-2">
                              {hasRoleAtLeast('systemAdmin') && renderDepartmentBadge((d as any).departmentId || (d as any).department_id || null)}
                              <span className="rounded-md border px-2 py-0.5 text-[9px] sm:text-[10px] uppercase tracking-wide">{(d.documentType || d.type)}</span>
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
                            <div className="font-medium text-sm sm:text-base line-clamp-2" onDoubleClick={hasRoleAtLeast('member') && canUpdateDocuments ? (e) => { e.preventDefault(); startEdit(d); } : undefined}>{d.title || d.name}</div>
                          )}
                        </Link>
                      </CardContent>
                    </Card>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-4">
                    <div className="space-y-2">
                      <div className="font-semibold">{d.title || d.name}</div>
                      {d.aiPurpose && <p className="text-xs text-muted-foreground line-clamp-4">{d.aiPurpose}</p>}
                      <div className="text-[10px] text-muted-foreground flex gap-3"><span>{formatNiceDate(d)}</span><span>{d.fileSizeBytes ? `${(d.fileSizeBytes/1024).toFixed(2)} KB` : ''}</span></div>
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDocs.map(d => (
                <Card key={d.id} className="hover:shadow-sm">
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-violet-100 text-violet-700 flex items-center justify-center"><span className="text-[11px] font-bold sm:text-xs">{(d.documentType || d.type).slice(0,3).toUpperCase()}</span></div>
                      <div className="flex-1">
                        <div className="font-semibold text-sm sm:text-base">{d.title || d.name}</div>
                        {d.aiPurpose && (
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">Purpose: {d.aiPurpose}</p>
                        )}
                      </div>
                      {hasRoleAtLeast('systemAdmin') && renderDepartmentBadge((d as any).departmentId || (d as any).department_id || null)}
                    </div>
                    <div className="rounded-md border p-3 text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-2 sm:gap-4">
                      <span>From <span className="text-foreground">{d.sender || '—'}</span> → To <span className="text-foreground">{d.receiver || '—'}</span></span>
                       <span className="sm:ml-auto text-right">{formatNiceDate(d)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{d.fileSizeBytes ? `${(d.fileSizeBytes/1024).toFixed(2)} KB` : ''}</span>
                      <span className="rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide">{(d.documentType || d.type)}</span>
                    </div>
                    <div className="text-right"><Link href={`/documents/${d.id}`} className="text-primary hover:underline">View</Link></div>
                  </CardContent>
                </Card>
              ))}
              {currentDocs.length === 0 && (
                <div className="text-sm text-muted-foreground">No documents</div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {hasRoleAtLeast('member') && canCreateDocuments && (
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
              <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
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
                }
              }}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Folder Deletion Confirmation Dialog */}
      <UiDialog open={shareOpen} onOpenChange={setShareOpen}>
        <UiDialogContent>
          <UiDialogHeader>
            <UiDialogTitle>Share folder {sharePath.join(' / ') || '/'}</UiDialogTitle>
          </UiDialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Select teams that should access this folder and its subfolders.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {departments.map(d => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={shareDeptIds.includes(d.id)} onCheckedChange={(v:any)=>toggleShareDept(d.id, !!v)} />
                  <span className="capitalize" data-color={d.color || 'default'}>{d.name}</span>
                </label>
              ))}
            </div>
          </div>
          <UiDialogFooter>
            <Button variant="outline" onClick={()=>setShareOpen(false)}>Cancel</Button>
            <Button onClick={saveShare}>Save</Button>
          </UiDialogFooter>
        </UiDialogContent>
      </UiDialog>

      <Dialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
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
