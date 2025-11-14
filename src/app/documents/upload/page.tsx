 "use client";

import React, { useEffect, useMemo, useRef, useState, Suspense, useCallback } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Check, UploadCloud, X, FileText, User, UserCheck, Calendar, Tag, FolderOpen, MessageSquare, Hash, Bookmark, Link as LinkIcon, Loader2 } from 'lucide-react';
import { AccessDenied } from '@/components/access-denied';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
 
import type { Document, StoredDocument } from '@/lib/types';
import type { ExtractDocumentMetadataOutput } from '@/ai/flows/extract-document-metadata';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select';
// Calls will be proxied via backend: sign upload, finalize, analyze
import { apiFetch, getApiContext } from '@/lib/api';
import { useDocuments } from '@/hooks/use-documents';
import { useDepartments } from '@/hooks/use-departments';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { computeContentHash } from '@/lib/utils';
import { useCategories } from '@/hooks/use-categories';
import { useUserDepartmentCategories } from '@/hooks/use-department-categories';
import UploadFilePreview from '@/components/upload-file-preview';
import FilePreview from '@/components/file-preview';
import JSZip from 'jszip';

const toDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

type Extracted = {
  ocrText: string;
  metadata: ExtractDocumentMetadataOutput;
};

type FormData = {
  title: string;
  filename: string;
  sender: string;
  receiver: string;
  documentDate: string;
  documentType: string;
  folder: string;
  subject: string;
  description: string;
  category: string;
  keywords: string;
  tags: string;
};

type QueueDocumentPrefill = {
  docId?: string;
  title?: string;
  filename?: string;
  sender?: string;
  receiver?: string;
  documentDate?: string;
  subject?: string;
  description?: string;
  category?: string;
  keywords?: string[] | string;
  tags?: string[] | string;
  folderPath?: string[];
  storageKey?: string;
  mimeType?: string;
  extractedMetadata?: ExtractDocumentMetadataOutput;
  failureReason?: string;
};

const BULK_UPLOAD_LIMIT = Number(process.env.NEXT_PUBLIC_BULK_UPLOAD_MAX_FILES || 10);
const BULK_UPLOAD_MAX_FILE_MB = Number(process.env.NEXT_PUBLIC_BULK_UPLOAD_MAX_FILE_MB || 25);

type ExtendedFile = File & { webkitRelativePath?: string };
type FileSystemEntry = { isDirectory: boolean };

const isZipFile = (file: File | ExtendedFile) => {
  const name = file.name?.toLowerCase() || '';
  const type = (file.type || '').toLowerCase();
  return name.endsWith('.zip') || type === 'application/zip' || type === 'application/x-zip-compressed';
};

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.markdown', '.jpg', '.jpeg', '.png']);
const SYSTEM_FILE_PATTERNS = [/^__MACOSX\//i, /\.DS_Store$/i];
const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

const normalizeSegment = (segment: string) => {
  const trimmed = segment.trim();
  if (!trimmed) return 'Folder';
  return trimmed.replace(/[<>:"/\\|?*]/g, '-').replace(/-+/g, '-');
};

const getExtension = (filename: string) => {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
};

const isSupportedFile = (filename: string) => {
  const ext = getExtension(filename);
  return SUPPORTED_EXTENSIONS.has(ext);
};

const guessMimeFromName = (filename: string) => {
  const ext = getExtension(filename);
  return MIME_MAP[ext] || 'application/octet-stream';
};

const shouldSkipPath = (path: string) => {
  return SYSTEM_FILE_PATTERNS.some((pattern) => pattern.test(path));
};

const splitRelativePath = (relativePath: string) => {
  const sanitizedPath = relativePath.replace(/\\/g, '/');
  const parts = sanitizedPath.split('/').filter(Boolean);
  const fileName = parts.pop() || '';
  const folderSegments = parts.map(normalizeSegment);
  return { folderSegments, fileName };
};

const extractDirectorySegments = (relativePath: string) => {
  const sanitized = relativePath.replace(/\\/g, '/');
  return sanitized.split('/').filter(Boolean).map(normalizeSegment);
};

function UploadContent() {
  const [queue, setQueue] = useState<{ file: File; progress: number; status: 'idle' | 'uploading' | 'processing' | 'ready' | 'saving' | 'success' | 'error'; note?: string; hash?: string; extracted?: Extracted; form?: FormData; locked?: boolean; previewUrl?: string; rotation?: number; linkMode?: 'new' | 'version'; baseId?: string; candidates?: { id: string; label: string }[]; senderOptions?: string[]; receiverOptions?: string[]; storageKey?: string; geminiFile?: { fileId: string; fileUri: string; mimeType?: string }; docId?: string; ingestionJob?: any; folderPathOverride?: string[]; prefilledFromQueue?: boolean }[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [carouselMode, setCarouselMode] = useState<boolean>(true);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [pickerOpenIndex, setPickerOpenIndex] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [showAllSkipped, setShowAllSkipped] = useState(false);
  const [skipDetails, setSkipDetails] = useState<{ path: string; reason: string }[] | null>(null);
  const [lastBulkSummary, setLastBulkSummary] = useState<{ count: number; path: string[] } | null>(null);
  const [recentSavePath, setRecentSavePath] = useState<string[] | null>(null);
  const { toast } = useToast();
  const { departments, selectedDepartmentId, setSelectedDepartmentId } = useDepartments();
  const router = useRouter();
  const { categories } = useCategories();
  const { getCategoriesForDepartment } = useUserDepartmentCategories();
  const { documents, folders, createFolder, refresh } = useDocuments();
  const { hasRoleAtLeast, hasPermission, bootstrapData } = useAuth();
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const searchParams = useSearchParams();
const ensureBulkPrereqs = useCallback(() => {
  if (hasRoleAtLeast('systemAdmin') && folderPath.length === 0 && !selectedDepartmentId) {
    toast({
      title: 'Department required',
      description: 'Please select a department or target folder before running a bulk upload.',
        variant: 'destructive',
      });
      return false;
    }
    if (!getApiContext().orgId) {
      toast({
        title: 'Organization missing',
        description: 'Select an organization before uploading.',
        variant: 'destructive',
      });
      return false;
  }
  return true;
}, [folderPath, hasRoleAtLeast, selectedDepartmentId, toast]);
const handleClearBulkSummary = useCallback(() => {
  setLastBulkSummary(null);
  setSkipDetails(null);
  setShowAllSkipped(false);
}, []);
const ensureFolderStructure = useCallback(async (paths: string[][]) => {
  if (!paths || paths.length === 0) return;
  const dedup = new Map<string, string[]>();
  for (const segments of paths) {
    const clean = segments.filter(Boolean);
    if (!clean.length) continue;
    dedup.set(clean.join('\u0000'), clean);
  }
  const ordered = Array.from(dedup.values()).sort((a, b) => a.length - b.length);
  for (const segs of ordered) {
    if (!segs.length) continue;
    const parent = segs.slice(0, -1);
    const name = segs[segs.length - 1];
    try {
      await createFolder(parent, name);
    } catch {
      // Folder likely exists; ignore errors
    }
  }
}, [createFolder]);
  const enqueueFiles = useCallback(async (items: { file: File; folderPathOverride?: string[] }[]) => {
    if (items.length === 0) return { added: 0, skipped: [] as { path: string; reason: string }[] };
    const MAX_FILES = 10;
    const maxSizeBytes = 50 * 1024 * 1024;
    const skipped: { path: string; reason: string }[] = [];
    const currentQueueLength = queue.length;
    const availableSlots = MAX_FILES - currentQueueLength;
    if (availableSlots <= 0) {
      skipped.push(...items.map(({ file }) => ({ path: file.name, reason: 'Upload queue full (10 files max)' })));
      toast({
        title: 'Upload queue full',
        description: 'Process or remove existing files before adding more.',
        variant: 'destructive',
      });
      return { added: 0, skipped };
    }
    const allowed: { file: File; folderPathOverride?: string[] }[] = [];
    for (const item of items) {
      if (item.file.size > maxSizeBytes) {
        skipped.push({ path: item.file.name, reason: `File exceeds ${BULK_UPLOAD_MAX_FILE_MB}MB limit` });
        continue;
      }
      if (!isSupportedFile(item.file.name)) {
        skipped.push({ path: item.file.name, reason: 'Unsupported file type' });
        continue;
      }
      allowed.push(item);
    }
    let limited = allowed;
    if (allowed.length > availableSlots) {
      skipped.push(...allowed.slice(availableSlots).map(({ file }) => ({
        path: file.name,
        reason: 'Upload queue full (10 files max)',
      })));
      limited = allowed.slice(0, availableSlots);
      toast({
        title: 'Upload limit reached',
        description: `Only ${availableSlots} more file(s) can be queued right now.`,
      });
    }
    const queueHashes = new Set(queue.map((q) => q.hash).filter(Boolean));
    const entries = await Promise.all(limited.map(async ({ file, folderPathOverride }) => ({
      file,
      folderPathOverride,
      progress: 0,
      status: 'idle' as const,
      hash: await computeContentHash(file),
      previewUrl: URL.createObjectURL(file),
      rotation: 0,
      linkMode: 'new' as const,
    })));
    const deduped: typeof entries = [];
    for (const entry of entries) {
      if (entry.hash && queueHashes.has(entry.hash)) {
        skipped.push({ path: entry.file.name, reason: 'Duplicate file already in queue' });
        continue;
      }
      if (entry.hash) queueHashes.add(entry.hash);
      deduped.push(entry);
    }
    if (deduped.length) {
      setQueue((prev) => [...prev, ...deduped]);
    }
    return { added: deduped.length, skipped };
  }, [queue, toast]);

  const processZipFile = useCallback(async (zipFile: File) => {
    if (!ensureBulkPrereqs()) {
      if (zipInputRef.current) zipInputRef.current.value = '';
      return;
    }
    try {
      const basePath = folderPath.slice();
      const skipList: { path: string; reason: string }[] = [];
      const filesToQueue: { file: File; folderPathOverride?: string[] }[] = [];
      const folderMap = new Map<string, string[]>();
      const recordFolder = (segments: string[]) => {
        const clean = segments.filter(Boolean);
        if (!clean.length) return;
        folderMap.set(clean.join('\u0000'), clean);
      };
      if (basePath.length) recordFolder(basePath);
      const zip = await JSZip.loadAsync(zipFile);
      const entries = Object.values(zip.files || {});
      for (const entry of entries) {
        if (entry.dir) {
          const dirSegments = extractDirectorySegments(entry.name || '');
          recordFolder([...basePath, ...dirSegments]);
          continue;
        }
        const relativePath = entry.name || '';
        if (shouldSkipPath(relativePath)) {
          skipList.push({ path: relativePath, reason: 'System file skipped' });
          continue;
        }
        const { folderSegments, fileName } = splitRelativePath(relativePath);
        recordFolder([...basePath, ...folderSegments]);
        if (!fileName) continue;
        if (!isSupportedFile(fileName)) {
          skipList.push({ path: relativePath, reason: 'Unsupported file type' });
          continue;
        }
        const blob = await entry.async('blob');
        const inferredType = blob.type && blob.type !== 'application/octet-stream'
          ? blob.type
          : guessMimeFromName(fileName);
        const newFile = new File([blob], fileName, { type: inferredType, lastModified: zipFile.lastModified || Date.now() });
        filesToQueue.push({ file: newFile, folderPathOverride: [...basePath, ...folderSegments] });
      }
      await ensureFolderStructure(Array.from(folderMap.values()));
      const result = await enqueueFiles(filesToQueue);
      const combinedSkips = [...skipList, ...((result && result.skipped) || [])];
      setSkipDetails(combinedSkips.length ? combinedSkips : null);
      if (combinedSkips.length) setShowAllSkipped(false);
      if (result?.added) {
        setLastBulkSummary({ count: result.added, path: basePath.slice() });
        toast({ title: 'Files queued', description: `Added ${result.added} file(s) from archive.` });
      } else {
        setLastBulkSummary(null);
        if (!combinedSkips.length) {
          toast({ title: 'No files added', description: 'Archive did not contain supported files.', variant: 'destructive' });
        }
      }
    } catch (error) {
      toast({
        title: 'ZIP processing failed',
        description: error instanceof Error ? error.message : 'Unable to read archive.',
        variant: 'destructive',
      });
    } finally {
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  }, [enqueueFiles, ensureBulkPrereqs, folderPath, toast]);

  const processFolderSelection = useCallback(async (files: FileList) => {
    if (!ensureBulkPrereqs()) {
      if (folderInputRef.current) folderInputRef.current.value = '';
      return;
    }
    const basePath = folderPath.slice();
    const entries = Array.from(files || []) as ExtendedFile[];
    if (entries.length === 0) {
      toast({
        title: 'No files detected',
        description: 'The selected folder does not contain any files.',
        variant: 'destructive',
      });
      return;
    }
    const prepared: { file: File; folderPathOverride?: string[] }[] = [];
    const folderMap = new Map<string, string[]>();
    const recordFolder = (segments: string[]) => {
      const clean = segments.filter(Boolean);
      if (!clean.length) return;
      folderMap.set(clean.join('\u0000'), clean);
    };
    if (basePath.length) recordFolder(basePath);
    const skipList: { path: string; reason: string }[] = [];
    for (const entry of entries) {
      const relative = entry.webkitRelativePath || entry.name;
      if (!relative) continue;
      const { folderSegments, fileName } = splitRelativePath(relative);
      recordFolder([...basePath, ...folderSegments]);
      if (shouldSkipPath(relative)) {
        skipList.push({ path: relative, reason: 'System file skipped' });
        continue;
      }
      if (!fileName) continue;
      if (!isSupportedFile(fileName)) {
        skipList.push({ path: relative, reason: 'Unsupported file type' });
        continue;
      }
      const needsRetype = !entry.type || entry.type === 'application/octet-stream';
      const typedFile = needsRetype
        ? new File([entry], entry.name, { type: guessMimeFromName(entry.name), lastModified: entry.lastModified })
        : entry;
      prepared.push({ file: typedFile, folderPathOverride: [...basePath, ...folderSegments] });
    }
    await ensureFolderStructure(Array.from(folderMap.values()));
    if (prepared.length === 0) {
      setSkipDetails(skipList.length ? skipList : null);
      if (skipList.length) setShowAllSkipped(false);
      if (!skipList.length) {
        toast({
          title: 'No supported files',
          description: 'This folder does not contain supported files.',
          variant: 'destructive',
        });
      }
      if (folderInputRef.current) folderInputRef.current.value = '';
      return;
    }
    const result = await enqueueFiles(prepared);
    const combinedSkips = [...skipList, ...((result && result.skipped) || [])];
    setSkipDetails(combinedSkips.length ? combinedSkips : null);
    if (combinedSkips.length) setShowAllSkipped(false);
    if (result?.added) {
      setLastBulkSummary({ count: result.added, path: basePath.slice() });
      toast({ title: 'Files queued', description: `Added ${result.added} file(s) from folder.` });
    } else {
      setLastBulkSummary(null);
    }
    if (folderInputRef.current) folderInputRef.current.value = '';
  }, [enqueueFiles, ensureBulkPrereqs, folderPath, toast]);
  
  const navigateToFolder = (segments?: string[] | null) => {
    const cleaned = Array.isArray(segments) ? segments.map((s) => String(s).trim()).filter(Boolean) : [];
    const dest = cleaned.length ? `?path=${encodeURIComponent(cleaned.join('/'))}` : '';
    router.push(`/documents${dest}`);
  };
  
  // Get categories for the selected department, fallback to org categories
  const availableCategories = useMemo(() => {
    if (selectedDepartmentId) {
      return getCategoriesForDepartment(selectedDepartmentId);
    }
    return categories;
  }, [selectedDepartmentId, getCategoriesForDepartment, categories]);
  
  const saveAllReady = async () => {
    if (isSavingAll) return;
    const readyEntries = queue
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.status === 'ready' && !item.locked);

    if (readyEntries.length === 0) {
      toast({ title: 'No items to save', description: 'All ready items are already saved or being processed.' });
      return;
    }

    setIsSavingAll(true);
    let lastPath: string[] | null = null;

    try {
      for (const { index } of readyEntries) {
        try {
          const result = await onDone(index);
          if (result) lastPath = result.path;
        } catch (error) {
          console.error('Error saving item:', error);
        }
      }

      if (lastPath) {
        setRecentSavePath(lastPath);
        toast({
          title: 'Documents saved',
          description: `Saved ${readyEntries.length} document${readyEntries.length === 1 ? '' : 's'}. Use "View folder" when ready.`,
        });
      }
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleSave = async (index: number) => {
    const result = await onDone(index);
    if (!result) return;
    setRecentSavePath(result.path);
    toast({
      title: 'Document saved',
      description: result.hasMoreReady
        ? 'Continue reviewing remaining files or view the folder when ready.'
        : 'All documents saved. Use "View folder" to open the destination.',
    });
  };

  const handleReject = async (index: number) => {
    const item = queue[index];
    if (!item) return;
    const orgId = getApiContext().orgId || '';
    if (!orgId) {
      toast({
        title: 'No organization selected',
        description: 'Select an organization before rejecting documents.',
        variant: 'destructive',
      });
      return;
    }
    setQueue((prev) =>
      prev.map((q, i) =>
        i === index ? { ...q, locked: true, note: 'Rejecting…', status: q.status === 'ready' ? 'saving' : q.status } : q
      )
    );
    try {
      if (item.docId) {
        let rejected = false;
        try {
          await apiFetch(`/orgs/${orgId}/ingestion-jobs/${item.docId}/reject`, {
            method: 'POST',
            body: { reason: 'Discarded before saving' },
          });
          rejected = true;
        } catch (err: any) {
          if (err?.status !== 404 && err?.status !== 403) {
            throw err;
          }
        }
        if (!rejected) {
          await apiFetch(`/orgs/${orgId}/documents/${item.docId}/draft`, { method: 'DELETE' });
        }
      }
      setQueue((prev) => {
        const next = prev.filter((_, i) => i !== index);
        if (next.length === 0) {
          setActiveIndex(null);
        } else if (activeIndex !== null && index === activeIndex) {
          setActiveIndex(Math.min(activeIndex, next.length - 1));
        }
        return next;
      });
      toast({
        title: 'Rejected',
        description: `${item.file.name} was discarded.`,
      });
    } catch (error: any) {
      console.error('Reject failed:', error);
      toast({
        title: 'Reject failed',
        description: error?.message || 'Unable to reject document. Please try again.',
        variant: 'destructive',
      });
      setQueue((prev) =>
        prev.map((q, i) =>
          i === index ? { ...q, locked: false, status: 'ready', note: 'Reject failed. Try again.' } : q
        )
      );
    }
  };
  const removeQueueItem = async (index: number) => {
    const item = queue[index];
    if (!item) return;
    const orgId = getApiContext().orgId || '';
    if (orgId && item.docId && item.status !== 'success') {
      try {
        await apiFetch(`/orgs/${orgId}/documents/${item.docId}/draft`, { method: 'DELETE' });
      } catch (error) {
        console.warn('Failed to discard draft document', error);
      }
    }
    setQueue(prev => {
      const next = prev.filter((_, idx) => idx !== index);
      const newLen = next.length;
      if (newLen === 0) setActiveIndex(null);
      else setActiveIndex((prevIdx) => {
        if (prevIdx === null) return 0;
        return Math.min(index, newLen - 1);
      });
      return next;
    });
  };
  const [docType, setDocType] = useState<Document['type']>('PDF');
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [preferredBaseId, setPreferredBaseId] = useState<string | null>(null);
  
  // Check page permission with fallback to functional permission for backward compatibility
  const permissions = bootstrapData?.permissions || {};
  const canAccessUploadPage = permissions['pages.upload'] !== false; // Default true if not set
  const hasCreatePermission = hasPermission('documents.create');
  const hasAccess = canAccessUploadPage || hasCreatePermission;
  
  // Redirect if no access
  useEffect(() => {
    if (bootstrapData && !hasAccess) {
      router.push('/documents');
    }
  }, [hasAccess, bootstrapData, router]);
  
  if (bootstrapData && !hasAccess) {
    return <AccessDenied message="You don't have permission to access the upload page." />;
  }

  // Auto-select first department for system admins when no department is selected
  React.useEffect(() => {
    if (hasRoleAtLeast('systemAdmin') && !selectedDepartmentId && departments.length > 0) {
      setSelectedDepartmentId(departments[0].id);
    }
  }, [hasRoleAtLeast, selectedDepartmentId, departments, setSelectedDepartmentId]);
  
  useEffect(() => {
    const p = searchParams?.get('path');
    const v = searchParams?.get('version');
    if (p && p.trim()) {
      const pathArray = p.split('/').filter(Boolean);
      setFolderPath(pathArray);
      console.log('Upload page initialized with folder path:', pathArray);
    } else {
      setFolderPath([]);
      console.log('Upload page initialized in root folder');
    }
    if (v && v.trim()) {
      setPreferredBaseId(v);
    } else {
      setPreferredBaseId(null);
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromQueue = searchParams?.get('fromQueue');
    if (fromQueue !== 'true') return;

    const storedStateRaw = window.sessionStorage?.getItem('queueDocumentState');
    if (!storedStateRaw) return;

    window.sessionStorage.removeItem('queueDocumentState');
    try {
      const parsed: QueueDocumentPrefill = JSON.parse(storedStateRaw) || {};
      const {
        docId,
        title,
        filename,
        sender,
        receiver,
        documentDate,
        subject,
        description,
        category,
        keywords,
        tags,
        folderPath: storedFolderPath,
        storageKey,
        mimeType,
        extractedMetadata,
        failureReason,
      } = parsed;

      const folderPathFromState = Array.isArray(storedFolderPath)
        ? storedFolderPath.filter((segment) => typeof segment === 'string' && segment.trim().length > 0)
        : [];
      if (folderPathFromState.length) {
        setFolderPath(folderPathFromState);
      }

      const placeholderName = filename || title || 'Document.pdf';
      const placeholderMime = mimeType || 'application/pdf';
      const placeholderFile = new File([], placeholderName, { type: placeholderMime });
      const metadata = (extractedMetadata ||
        {
          title,
          subject,
          description,
          category,
          keywords,
          tags,
          sender,
          receiver,
          documentDate,
        }) as Partial<ExtractDocumentMetadataOutput> & {
        summary?: string;
        senderOptions?: string[];
        receiverOptions?: string[];
      };

      const keywordsString = Array.isArray(keywords)
        ? keywords.join(', ')
        : typeof keywords === 'string'
        ? keywords
        : '';
      const tagsString = Array.isArray(tags)
        ? tags.join(', ')
        : typeof tags === 'string'
        ? tags
        : '';

      const resolvedKeywords = Array.isArray(metadata.keywords)
        ? metadata.keywords.map((kw) => String(kw)).join(', ')
        : keywordsString;
      const resolvedTags = Array.isArray(metadata.tags)
        ? metadata.tags.map((tag) => String(tag)).join(', ')
        : tagsString;
      const senderOptions = Array.isArray(metadata.senderOptions) ? metadata.senderOptions : [];
      const receiverOptions = Array.isArray(metadata.receiverOptions) ? metadata.receiverOptions : [];

      const form: FormData = {
        title: metadata.title || placeholderName,
        filename: placeholderName,
        sender: metadata.sender || '',
        receiver: metadata.receiver || '',
        documentDate: metadata.documentDate || '',
        documentType: metadata.documentType || 'General Document',
        folder: folderPathFromState.length ? folderPathFromState.join('/') : 'Root',
        subject: metadata.subject || '',
        description: metadata.description || metadata.summary || description || '',
        category: metadata.category || category || 'General',
        keywords: resolvedKeywords,
        tags: resolvedTags,
      };

      const extractedMetadataPayload = metadata as ExtractDocumentMetadataOutput;

      setQueue([
        {
          file: placeholderFile,
          progress: 100,
          status: 'ready',
          note: failureReason,
          hash: '',
          extracted: { ocrText: '', metadata: extractedMetadataPayload },
          form,
          locked: false,
          previewUrl: undefined,
          rotation: 0,
          linkMode: 'new',
          baseId: undefined,
          candidates: [],
          senderOptions,
          receiverOptions,
          storageKey,
          geminiFile: undefined,
          docId,
          ingestionJob: undefined,
          folderPathOverride: folderPathFromState,
          prefilledFromQueue: true,
        },
      ]);
      setActiveIndex(0);
    } catch (error) {
      console.error('Failed to restore queued document state', error);
    }
  }, [searchParams]);



  const onSelect = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;

    const zipCandidates = arr.filter(isZipFile);
    for (const zip of zipCandidates) {
      await processZipFile(zip);
    }

    const normalFiles = arr.filter((file) => !isZipFile(file));
    if (normalFiles.length === 0) return;

    const result = await enqueueFiles(normalFiles.map((file) => ({ file })));
    if (result?.skipped?.length) {
      setSkipDetails(result.skipped);
      setShowAllSkipped(false);
    } else if (!zipCandidates.length) {
      setSkipDetails(null);
    }
    if (result?.added) {
      setLastBulkSummary({ count: result.added, path: folderPath.slice() });
    }
  };

  const onBrowse = () => {
    // Clear the input value to allow selecting the same file again
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    const { items, files } = e.dataTransfer;
    const extended = Array.from(files || []) as ExtendedFile[];

    if (!extended.length) return;

    const hasRelativePaths = extended.some((file) => Boolean((file.webkitRelativePath || '').includes('/')));
    if (hasRelativePaths) {
      await processFolderSelection(files);
      return;
    }

    const zipFiles = extended.filter(isZipFile);
    if (zipFiles.length > 0) {
      for (const zip of zipFiles) {
        await processZipFile(zip);
      }
      const remaining = extended.filter((file) => !isZipFile(file));
      if (remaining.length === 0) return;
      await onSelect(remaining);
      return;
    }

    if (items && items.length) {
      const dirEntries = Array.from(items).map((item) => (item as any).webkitGetAsEntry?.()).filter(Boolean);
      const hasDirectoryEntry = dirEntries.some((entry: FileSystemEntry) => entry.isDirectory);
      if (hasDirectoryEntry) {
        await processFolderSelection(files);
        return;
      }
    }

    await onSelect(files);
  };

  type AnalyzeSuccessResponse = {
    ocrText: string;
    metadata: any;
    geminiFile?: { fileId: string; fileUri: string; mimeType?: string };
  };

  type AnalyzeJobQueuedResponse = {
    jobId: string;
    status: string;
    expiresAt?: number;
  };

  type UploadAnalysisJobStatus = {
    jobId: string;
    status: 'queued' | 'processing' | 'succeeded' | 'failed';
    result?: AnalyzeSuccessResponse;
    error?: string;
    fallback?: { ocrText: string; metadata: any } | null;
    httpStatus?: number;
    createdAt?: number;
    updatedAt?: number;
  };

  const waitForAnalysisJob = async (orgId: string, jobId: string): Promise<AnalyzeSuccessResponse> => {
    const maxWaitMs = 5 * 60 * 1000;
    const pollIntervalMs = 1500;
    const started = Date.now();

    while (true) {
      const job = await apiFetch<UploadAnalysisJobStatus>(`/orgs/${orgId}/uploads/analyze/${jobId}`, { skipCache: true });

      if (job.status === 'succeeded' && job.result) {
        return job.result;
      }

      if (job.status === 'failed') {
        const err: any = new Error(job.error || 'AI analysis failed');
        err.status = job.httpStatus || 500;
        if (job.fallback) {
          err.data = { fallback: job.fallback };
        }
        throw err;
      }

      if (Date.now() - started > maxWaitMs) {
        const timeoutErr: any = new Error('AI analysis timed out');
        timeoutErr.status = 503;
        throw timeoutErr;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  };

  const handleZipInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void processZipFile(file);
    }
  };
  const handleFolderInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (list && list.length) {
      void processFolderSelection(list);
    }
  };
  const processItem = async (index: number) => {
    const item = queue[index];
    if (!item || item.locked || item.status === 'processing' || item.status === 'uploading' || item.status === 'success' || item.status === 'ready') return;
    // lock row to avoid duplicate processing
    setQueue(prev => prev.map((q, i) => i === index ? { ...q, locked: true } : q));
    setActiveIndex(index);
    // infer type
    const ext = item.file.name.split('.').pop()?.toLowerCase();
    let inferred: Document['type'] = 'PDF';
    if (['png', 'jpg', 'jpeg'].includes(ext || '')) inferred = 'Image';
    setDocType(inferred);

    // simulate upload progress while reading
    setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'uploading', progress: 10 } : q));
    const timer = setInterval(() => setQueue(prev => prev.map((q, i) => i === index ? { ...q, progress: Math.min(q.progress + 8, 90) } : q)), 150);
    try {
      let dataUri: string;
      const isImage = ['png','jpg','jpeg'].includes(ext || '');
      if (isImage && (item.rotation || 0) % 360 !== 0) {
        dataUri = await rotateImageFileToDataUri(item.file, item.rotation || 0);
      } else {
        dataUri = await toDataUri(item.file);
      }
      clearInterval(timer);
      setQueue(prev => prev.map((q, i) => i === index ? { ...q, progress: 100, status: 'processing' } : q));

      // 1) Upload file to Supabase Storage
      const uploadResult = await uploadFile(item.file, (progress) => {
        setQueue(prev => prev.map((q, i) => i === index ? { ...q, progress: Math.min(progress, 90) } : q));
      });
      const storageKey = uploadResult.storageKey;

      // 2) Finalize DB row if already created, else we will create on Save
      const orgId = getApiContext().orgId || '';
      if (!orgId) throw new Error('No organization set');

      // 3) Ask backend AI to analyze from signed Storage URL
      let analyzeResp: AnalyzeSuccessResponse;
      try {
        const analyzeInitiated = await apiFetch<AnalyzeSuccessResponse | AnalyzeJobQueuedResponse>(`/orgs/${orgId}/uploads/analyze`, {
          method: 'POST',
          body: { storageKey: storageKey, mimeType: item.file.type || 'application/octet-stream' },
        });

        if ('jobId' in analyzeInitiated) {
          analyzeResp = await waitForAnalysisJob(orgId, analyzeInitiated.jobId);
        } else {
          analyzeResp = analyzeInitiated;
        }
      } catch (e: any) {
        // Gracefully accept server fallback when AI is unavailable (HTTP 503 or 413)
        const status = (e && e.status) || 0;
        const fallback = (e && e.data && e.data.fallback) || null;

        if ((status === 503 || status === 413) && fallback && (typeof fallback === 'object')) {
          analyzeResp = fallback as { ocrText: string; metadata: any };

          // Determine the appropriate message based on status
          let toastTitle = 'AI processing limited';
          let toastDescription = 'Metadata was prefilled from filename. You can edit before saving.';

          if (status === 503) {
            if (e.data?.error?.includes('timeout')) {
              toastTitle = 'AI processing timeout';
              toastDescription = 'Document took too long to process. Basic metadata was generated. You can edit details before saving.';
            } else {
              toastTitle = 'AI service busy';
              toastDescription = 'AI is temporarily unavailable. Basic metadata was generated from filename. You can edit before saving.';
            }
          }

          toast({
            title: toastTitle,
            description: toastDescription,
          });
        } else {
          throw e;
        }
      }
      const ocrResult = { extractedText: analyzeResp.ocrText } as any;
      const metadataResult = analyzeResp.metadata as any;

      // Create or reuse a draft document so background ingestion can start immediately
      let docId = item.docId;
      let ingestionJob = item.ingestionJob;
      const draftPayload: any = {
        title: metadataResult.title || item.file.name,
        filename: metadataResult.filename || item.file.name,
        type: inferred,
        subject: metadataResult.subject || '',
        description: metadataResult.description || metadataResult.summary || '',
        category: metadataResult.category || 'General',
        tags: (metadataResult.tags || []).filter(Boolean),
        keywords: (metadataResult.keywords || []).filter(Boolean),
        sender: metadataResult.sender || '',
        receiver: metadataResult.receiver || '',
        documentDate: metadataResult.documentDate || '',
        folderPath: folderPath.slice(),
        departmentId: selectedDepartmentId || undefined,
        isDraft: true,
      };
      if (!docId) {
        const createdDraft = await apiFetch<StoredDocument>(`/orgs/${orgId}/documents`, { method: 'POST', body: draftPayload });
        if (!createdDraft?.id) throw new Error('Failed to create draft document');
        docId = createdDraft.id;
      }
      const finalizeResp = await apiFetch(`/orgs/${orgId}/uploads/finalize`, {
        method: 'POST',
        body: {
          documentId: docId,
          storageKey,
          fileSizeBytes: item.file.size,
          mimeType: item.file.type || 'application/octet-stream',
          contentHash: item.hash,
          geminiFileId: analyzeResp.geminiFile?.fileId,
          geminiFileUri: analyzeResp.geminiFile?.fileUri,
          geminiFileMimeType: analyzeResp.geminiFile?.mimeType,
        }
      });
      ingestionJob = finalizeResp?.ingestionJob || ingestionJob;

      // Use the original summary without padding extra content
      const summary = (metadataResult.summary || '').trim();

      // Prefill form for the active item
      const updatedForm = {
        title: metadataResult.title || item.file.name,
        filename: metadataResult.filename || item.file.name,
        sender: metadataResult.sender || '',
        receiver: metadataResult.receiver || '',
        documentDate: metadataResult.documentDate || '',
        documentType: metadataResult.documentType || 'General Document',
        folder: 'No folder (Root)',
        subject: metadataResult.subject || '',
        description: metadataResult.description || metadataResult.summary || '',
        category: metadataResult.category || 'General',
        keywords: (metadataResult.keywords || []).join(', '),
        tags: (metadataResult.tags || []).join(', '),
      };

      // Store multiple options for UI selection
      const senderOptions = metadataResult.senderOptions || [];
      const receiverOptions = metadataResult.receiverOptions || [];
      console.log('Extracted sender options:', senderOptions, 'receiver options:', receiverOptions);

      // Find version candidates (same hash or similar name)
      const candidates = findVersionCandidates(item.hash, item.file.name, documents, folderPath)
        .map(d => ({ 
          id: d.id, 
          label: `${d.title || d.name || 'Untitled'} (v${d.versionNumber || d.version || 1})` 
        }));
      
      console.log('Found version candidates:', candidates.length, 'for file:', item.file.name, 'in folder:', folderPath);
      
      console.log(`Setting item ${index} status to 'ready'`);
      setQueue(prev => prev.map((q, i) => i === index ? { 
        ...q, 
        status: 'ready', 
        extracted: { ocrText: ocrResult.extractedText, metadata: metadataResult }, 
        form: updatedForm, 
        locked: false, 
        candidates,
        progress: 100,
        senderOptions,
        receiverOptions,
        linkMode: preferredBaseId ? 'version' : (candidates.length > 0 ? 'version' : 'new'), 
        baseId: preferredBaseId || candidates[0]?.id, 
        storageKey: storageKey,
        geminiFile: analyzeResp.geminiFile,
        docId,
        ingestionJob,
      } : q));
      toast({ title: 'Processed', description: `${item.file.name} analyzed by AI.` });
    } catch (e) {
      clearInterval(timer);
      console.error('Upload processing error:', e);
      
      // Provide specific error messages based on the type of failure
      let errorMessage = 'Processing failed';
      if (e instanceof Error) {
        if (e.message.includes('Upload failed')) {
          errorMessage = 'File upload failed. Please try again.';
        } else if (e.message.includes('analyze')) {
          errorMessage = 'AI analysis failed. Please try again.';
        } else if (e.message.includes('sign')) {
          errorMessage = 'Upload preparation failed. Please try again.';
        } else {
          errorMessage = e.message;
        }
      }
      
      setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'error', note: errorMessage, locked: false } : q));
      toast({ 
        title: 'Processing failed', 
        description: `${item.file.name}: ${errorMessage}`, 
        variant: 'destructive' 
      });
    }
  };

  async function rotateImageFileToDataUri(file: File, rotationDeg: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const radians = (rotationDeg % 360) * Math.PI / 180;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(toDataUri(file)); return; }
        const w = img.width;
        const h = img.height;
        const sin = Math.abs(Math.sin(radians));
        const cos = Math.abs(Math.cos(radians));
        canvas.width = Math.floor(w * cos + h * sin);
        canvas.height = Math.floor(w * sin + h * cos);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(radians);
        ctx.drawImage(img, -w / 2, -h / 2);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function findVersionCandidates(hash: string | undefined, filename: string, all: StoredDocument[], currentPath: string[]): StoredDocument[] {
    const byHash = hash ? all.filter(d => d.contentHash === hash) : [];
    if (byHash.length) return byHash;
    // Fallback heuristic: same base name (strip timestamps) and same folder
    const base = filename.toLowerCase().replace(/\s+/g, ' ').replace(/\d{4}-\d{2}-\d{2}.*/,'').trim();
    return all.filter(d => {
      const docPath = (d.folderPath || []).join('/');
      const currentPathStr = currentPath.join('/');
      const docName = (d.filename || d.name || '').toLowerCase();
      return docPath === currentPathStr && docName.includes(base);
    });
  }

  async function uploadToSignedUrl(signedUrl: string, file: File, retries = 3, onProgress?: (progress: number) => void) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // ✅ OPTIMIZED: Use XMLHttpRequest for progress tracking
        const response = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          // Track upload progress
          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && onProgress) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              onProgress(percentComplete);
            }
          });
          
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({ ok: true, status: xhr.status, statusText: xhr.statusText });
            } else {
              reject(new Error(`Upload failed with status: ${xhr.status} ${xhr.statusText}`));
            }
          });
          
          xhr.addEventListener('error', () => {
            reject(new Error('Upload failed'));
          });
          
          xhr.open('PUT', signedUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.send(file);
        });
        
        return; // Success
      } catch (error) {
        console.error(`Upload attempt ${attempt} failed:`, error);
        
        if (attempt === retries) {
          throw new Error(`Upload failed after ${retries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async function uploadFile(file: File, onProgress?: (progress: number) => void): Promise<{ storageKey: string }> {
    const orgId = getApiContext().orgId || '';

    const signResp = await apiFetch<{
      signedUrl: string;
      storageKey: string;
    }>(`/orgs/${orgId}/uploads/sign`, {
      method: 'POST',
      body: {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
      },
    });

    if (!signResp.signedUrl || !signResp.storageKey) {
      throw new Error('Failed to obtain signed upload URL');
    }

    await uploadToSignedUrl(signResp.signedUrl, file, 3, onProgress);
    return { storageKey: signResp.storageKey };
  }

  // Ensure we have a focused item when entering queue view or when items change
  useEffect(() => {
    if (queue.length > 0 && (activeIndex === null || activeIndex >= queue.length)) {
      setActiveIndex(0);
    }
    if (queue.length === 0) setActiveIndex(null);
  }, [queue.length]);

  const readyCount = useMemo(() => queue.filter(q => q.status === 'ready').length, [queue]);
  const hasSuccess = useMemo(() => queue.some(q => q.status === 'success'), [queue]);
  const hasProcessable = useMemo(() => queue.some(q => q.status === 'idle' || q.status === 'error'), [queue]);
  const hasExistingDocs = useMemo(() => documents.length > 0, [documents.length]);

  const onReset = () => {
    setQueue([]);
    setActiveIndex(null);
    setExtracted(null);
    inputRef.current && (inputRef.current.value = '');
  };

  const onDone = async (index: number): Promise<{ path: string[]; hasMoreReady: boolean } | null> => {
    const item = queue[index];
    if (!item || !item.extracted || !item.form || item.status === 'success' || item.locked) return null;

    if (hasRoleAtLeast('systemAdmin') && folderPath.length === 0 && !selectedDepartmentId) {
      toast({
        title: 'Department selection required',
        description: 'Please select a department before uploading documents.',
        variant: 'destructive'
      });
      return null;
    }

    const currentFolderPath = folderPath.slice();
    const targetFolderPath = item.folderPathOverride && item.folderPathOverride.length > 0
      ? item.folderPathOverride
      : currentFolderPath;

    setQueue(prev => prev.map((q, i) => i === index ? { ...q, locked: true, status: 'saving', note: 'Saving…' } : q));

    try {
      const summary = (item.extracted.metadata.summary || '').trim();
      const keywordsArray = (item.form.keywords || '')
        .split(',')
        .map((k: string) => k.trim())
        .filter(Boolean);
      const tagsArray = (item.form.tags || '')
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean);

      const docTitle = item.form.title || item.extracted.metadata.title || item.file.name;

      if (!docTitle) {
        toast({
          title: 'Missing required fields',
          description: 'Title is required. Please fill it before saving.',
          variant: 'destructive'
        });
        setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'ready', locked: false } : q));
        return null;
      }

      if (!item.docId) {
        toast({
          title: 'Draft missing',
          description: 'Please re-process this file before saving.',
          variant: 'destructive'
        });
        setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'ready', locked: false } : q));
        return null;
      }

      console.log('Creating document with folderPath:', targetFolderPath, 'Type:', typeof targetFolderPath, 'Is Array:', Array.isArray(targetFolderPath));
      console.log('🔍 Creating folder structure for path:', targetFolderPath);
      try {
        for (let i = 0; i < targetFolderPath.length; i++) {
          const slice = targetFolderPath.slice(0, i + 1);
          const parentPath = slice.slice(0, -1);
          const folderName = slice[slice.length - 1];

          console.log(`🔍 Level ${i + 1}: Creating folder "${folderName}" with parent path:`, parentPath);

          const existing = folders.find(f => JSON.stringify(f) === JSON.stringify(slice));
          if (!existing) {
            console.log(`🔍 Folder "${folderName}" doesn't exist, creating...`);
            const result = await createFolder(parentPath, folderName);
            console.log(`🔍 Folder creation result:`, result);
          } else {
            console.log(`🔍 Folder "${folderName}" already exists, skipping creation`);
          }
        }
        console.log('✅ Folder structure creation completed successfully');
      } catch (error) {
        console.error('❌ Failed to create folder structure:', error);
        toast({
          title: 'Folder creation failed',
          description: `Could not create folder structure: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'destructive'
        });
      }

      if (item.linkMode === 'version' && !item.baseId) {
        toast({
          title: 'Version linking error',
          description: 'Please select a document to link this as a new version, or choose "New Document".',
          variant: 'destructive'
        });
        setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'ready', locked: false } : q));
        return null;
      }

      const finalKeywords = (keywordsArray.length ? keywordsArray : (item.extracted.metadata.keywords || [])).filter(Boolean);
      const finalTags = (tagsArray.length ? tagsArray : (item.extracted.metadata.tags || [])).filter(Boolean);
      const docSubject = item.form.subject || item.extracted.metadata.subject || (item.extracted.metadata.title || '');
      const docDescription = item.form.description || item.extracted.metadata.description || summary;
      const documentDateValue = item.form.documentDate || item.extracted.metadata.documentDate || '';

      const versionDraft = {
        title: docTitle,
        filename: item.form.filename || item.file.name,
        type: docType,
        folderPath: [...targetFolderPath],
        subject: docSubject,
        description: docDescription,
        category: item.form.category || item.extracted.metadata.category,
        tags: finalTags,
        keywords: finalKeywords,
        sender: item.form.sender || item.extracted.metadata.sender,
        receiver: item.form.receiver || item.extracted.metadata.receiver,
        documentDate: documentDateValue,
        departmentId: selectedDepartmentId || undefined,
        isDraft: false,
      };

      const patchPayload: any = {
        title: versionDraft.title,
        filename: versionDraft.filename,
        type: versionDraft.type,
        folder_path: targetFolderPath,
        subject: versionDraft.subject,
        description: versionDraft.description,
        category: versionDraft.category,
        tags: versionDraft.tags,
        keywords: versionDraft.keywords,
        sender: versionDraft.sender,
        receiver: versionDraft.receiver,
        document_date: documentDateValue,
        department_id: selectedDepartmentId || null,
        is_draft: false,
      };

      let savedDoc: StoredDocument | null = null;
      const orgId = getApiContext().orgId || '';
      if (!orgId) throw new Error('No organization set');

      if (item.linkMode === 'version' && item.baseId) {
        console.log('🔍 Linking existing draft to version group:', item.baseId);
        const created = await apiFetch<StoredDocument>(`/orgs/${orgId}/documents/${item.baseId}/version`, {
          method: 'POST',
          body: { draft: versionDraft, draftId: item.docId },
        });
        savedDoc = created;
      } else {
        console.log('🔍 Finalizing draft document:', item.docId);
        const updated = await apiFetch<StoredDocument>(`/orgs/${orgId}/documents/${item.docId}`, {
          method: 'PATCH',
          body: patchPayload,
        });
        savedDoc = updated;
      }

      try {
        await apiFetch(`/orgs/${orgId}/documents/${item.docId}/extraction`, {
          method: 'POST',
          body: { ocrText: item.extracted?.ocrText || '', metadata: item.extracted?.metadata || {} },
        });
      } catch (extractionError) {
        console.warn('Failed to save extraction data (non-critical):', extractionError);
      }

      let nextQueueSnapshot: typeof queue = [];
      setQueue(prev => {
        nextQueueSnapshot = prev.map((q, i) => i === index ? { ...q, status: 'success', locked: true, note: 'Saved' } : q);
        return nextQueueSnapshot;
      });
      toast({ title: 'Saved', description: `${item.file.name} stored.` });

      try {
        await refresh();
      } catch (error) {
        console.warn('Failed to refresh documents after save:', error);
      }

      const remainingReady = nextQueueSnapshot.some(q => q.status === 'ready' && !q.locked);
      const effectivePath = Array.isArray(savedDoc?.folderPath) && savedDoc.folderPath.length > 0
        ? savedDoc.folderPath.filter(Boolean)
        : targetFolderPath.filter(Boolean);

      return { path: effectivePath, hasMoreReady: remainingReady };
    } catch (error) {
      console.error('Document save error:', error);
      setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'error', note: 'Save failed', locked: false } : q));
      toast({
        title: 'Save Failed',
        description: `Failed to save ${item.file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive'
      });
      return null;
    }
  };

  // Check if user has permission to create documents
  // Use the hasAccess check from above (which includes page permission and functional permission)
  
  // Show access restricted message if user doesn't have upload permission
  if (!hasAccess) {
    return (
      <AppLayout>
        <AccessDenied
          title="Upload Permission Required"
          message="You don't have permission to upload documents. Please contact your administrator if you believe this is an error."
          backHref="/documents"
          backLabel="Back to Documents"
          icon={<UploadCloud className="h-8 w-8 text-muted-foreground" />}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-0 md:p-0 space-y-6">
        <div className="bg-card/50 border-b border-border/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-4 md:px-6 py-3">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/documents')}
                    className="hover-premium focus-premium p-2 h-8"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-lg font-semibold text-foreground truncate">
                      {folderPath.length ? `Upload to /${folderPath.join('/')}` : "Upload Documents"}
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {folderPath.length ?
                        `Add files to the ${folderPath[folderPath.length - 1]} folder. We'll analyze, organize, and prepare smart metadata for you.` :
                        "Add files and we'll analyze, organize, and prepare smart metadata for you."
                      }
                    </p>
                  </div>
                </div>
                {hasRoleAtLeast('systemAdmin') && folderPath.length === 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground font-medium">Department</span>
                    <UiSelect value={selectedDepartmentId || undefined as any} onValueChange={(v) => setSelectedDepartmentId(v)}>
                      <UiSelectTrigger className="w-[180px] h-8 text-xs">
                        <UiSelectValue placeholder="Select department" />
                      </UiSelectTrigger>
                      <UiSelectContent>
                        {departments.map(d => (<UiSelectItem key={d.id} value={d.id}>{d.name}</UiSelectItem>))}
                      </UiSelectContent>
                    </UiSelect>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {!hasRoleAtLeast('member') && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <div className="font-semibold text-destructive">Uploading is restricted</div>
            <p className="text-sm text-muted-foreground mt-1">Your role does not include upload permissions. Please contact an administrator to request <span className="font-medium">Content Manager</span> access or share files with someone who can upload on your behalf.</p>
          </div>
        )}

        {hasRoleAtLeast('member') && queue.length === 0 && (
          <Card className="rounded-xl border-2 border-dashed border-border/50 bg-card card-premium hover-premium">
            <CardContent className="py-12">
              <div
                role="button"
                tabIndex={0}
                aria-describedby="upload-help"
                className={`mx-auto max-w-2xl border-2 border-dashed rounded-xl bg-secondary/30 text-center p-12 transition-all duration-200 ${dragOver ? 'border-primary/50 bg-accent/20 scale-[1.01]' : 'hover:bg-accent/15 hover:border-primary/30 hover:shadow-lg'}`}
                onClick={onBrowse}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onBrowse(); }}
                onDragEnter={() => setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDrop={(e) => { setDragOver(false); onDrop(e); }}
              >
                <div className="mb-6">
                  <UploadCloud className="h-16 w-16 mx-auto text-primary mb-4 drop-shadow-sm" />
                </div>
                <div className="space-y-2 mb-6">
                  <div className="text-xl font-semibold text-foreground">Drag & drop files here</div>
                  <div className="text-sm text-muted-foreground">or click to browse your computer</div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {[
                    { type: 'PDF', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
                    { type: 'TXT', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
                    { type: 'MD', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
                    { type: 'JPG', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
                    { type: 'PNG', color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20' }
                  ].map(({ type, color }) => (
                    <span key={type} className={`rounded-full border px-3 py-1 text-xs font-medium ${color} transition-colors`}>
                      {type}
                    </span>
                  ))}
                </div>
                <div id="upload-help" className="mt-4 text-xs text-muted-foreground text-center space-y-1">
                  <div>We'll automatically extract metadata and generate a summary for you</div>
                  <div>Need nested folders? Drop a .zip or use the buttons above to upload a folder.</div>
                </div>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".pdf,.txt,.md,.jpg,.jpeg,.png,application/pdf,text/plain,text/markdown,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => e.target.files && onSelect(e.target.files)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button 
                    onClick={(e) => { e.stopPropagation(); onBrowse(); }} 
                    className="gap-2 hover-premium focus-premium px-6 py-2"
                    size="sm"
                  >
                    <UploadCloud className="h-4 w-4" /> 
                    Browse Files
                  </Button>
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={handleZipInputChange}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={(e) => { e.stopPropagation(); zipInputRef.current?.click(); }}
                  >
                    <UploadCloud className="h-4 w-4" />
                    Upload ZIP
                  </Button>
                  <input
                    ref={(el) => {
                      folderInputRef.current = el;
                      if (el) {
                        el.setAttribute('webkitdirectory', 'true');
                        el.setAttribute('directory', 'true');
                        el.multiple = true;
                      }
                    }}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFolderInputChange}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Upload Folder
                  </Button>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Supports up to {BULK_UPLOAD_LIMIT} files per bulk upload (PDF, TXT/MD, JPG, PNG). Individual files must be under {BULK_UPLOAD_MAX_FILE_MB}MB.
                </p>
                {(lastBulkSummary || skipDetails) && (
                  <div className="mt-4 w-full rounded-md border bg-muted/30 p-3 text-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-foreground">
                        {lastBulkSummary
                          ? `Queued ${lastBulkSummary.count} file${lastBulkSummary.count === 1 ? '' : 's'} to /${lastBulkSummary.path.length ? lastBulkSummary.path.join('/') : 'Root'}`
                          : 'Upload summary'}
                      </div>
                      <div className="flex items-center gap-2">
                        {lastBulkSummary && (
                          <Button size="sm" variant="outline" onClick={() => navigateToFolder(lastBulkSummary.path)}>
                            View folder
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={handleClearBulkSummary}>
                          Dismiss
                        </Button>
                      </div>
                    </div>
                    {skipDetails && skipDetails.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-destructive">Skipped {skipDetails.length} file{skipDetails.length === 1 ? '' : 's'}</div>
                          {skipDetails.length > 5 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowAllSkipped((prev) => !prev)}
                            >
                              {showAllSkipped ? 'Show less' : 'Show all'}
                            </Button>
                          )}
                        </div>
                        <ul className="list-disc pl-5 space-y-1 text-destructive/90">
                          {(showAllSkipped ? skipDetails : skipDetails.slice(0, 5)).map((item, idx) => (
                            <li key={`${item.path}-${idx}`}>{item.path}: {item.reason}</li>
                          ))}
                          {!showAllSkipped && skipDetails.length > 5 && (
                            <li className="text-muted-foreground">…and {skipDetails.length - 5} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                    {!skipDetails && lastBulkSummary && (
                      <div className="text-muted-foreground">
                        Review each file below to add metadata before saving.
                      </div>
                    )}
                  </div>
                )}
                {recentSavePath && (
                  <div className="mt-4 w-full rounded-md border bg-muted/30 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="text-foreground">
                      Recently saved to{' '}
                      <span className="font-medium">
                        /{recentSavePath.length ? recentSavePath.join('/') : 'Root'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigateToFolder(recentSavePath);
                          setRecentSavePath(null);
                        }}
                      >
                        View folder
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRecentSavePath(null)}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {hasRoleAtLeast('member') && queue.length > 0 && (
          <>
            <Card className="rounded-xl card-premium">
              <CardHeader className="flex flex-col gap-3 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                      <UploadCloud className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-semibold">Upload Queue</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {queue.filter(item => item.status === 'ready').length} of {queue.length}/10 files ready to save
                      </p>
                    </div>
                  </div>
                    <div className="flex items-center gap-2">
                    {queue.filter(item => item.status === 'ready' && !item.locked).length > 1 && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={saveAllReady}
                        className="gap-2 hover-premium focus-premium"
                      >
                        <Check className="h-3 w-3" />
                        Save All ({queue.filter(item => item.status === 'ready' && !item.locked).length})
                      </Button>
                    )}
                    {carouselMode && queue.length > 1 && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveIndex((prev) => {
                        const i = (prev ?? 0) - 1;
                        return i < 0 ? queue.length - 1 : i;
                          })}
                          className="hover-premium focus-premium"
                        >
                          Prev
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveIndex((prev) => {
                        const i = (prev ?? 0) + 1;
                        return i >= queue.length ? 0 : i;
                          })}
                          className="hover-premium focus-premium"
                        >
                          Next
                        </Button>
                      </>
                    )}
                    {queue.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCarouselMode(m => !m)}
                        className="hover-premium focus-premium"
                      >
                        {carouselMode ? 'List' : 'Carousel'}
                      </Button>
                    )}
                  </div>
                </div>
                {typeof activeIndex === 'number' && queue[activeIndex] && (
                  <div className="text-xs text-muted-foreground">Viewing {activeIndex + 1} of {queue.length}</div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {carouselMode && typeof activeIndex === 'number' && queue[activeIndex] ? (
                  (() => {
                    const item = queue[activeIndex]!;
                    const i = activeIndex!;
                    const targetFolderPath = item.folderPathOverride && item.folderPathOverride.length > 0
                      ? item.folderPathOverride
                      : folderPath;
                    const shouldUseRemotePreview = Boolean(item.docId) && (!item.previewUrl || item.prefilledFromQueue);
                    return (
                      <div className={`rounded-lg border p-6 ring-1 ring-primary`}>
                        {/* Header with file info and actions */}
                        <div className="flex items-center justify-between gap-3 mb-6">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-lg" title={item.file.name}>{item.file.name}</div>
                            <div className="text-xs text-muted-foreground truncate">/{targetFolderPath.length ? targetFolderPath.join('/') : 'Root'}</div>
                            <div className="text-sm text-muted-foreground capitalize">{item.status}</div>
                          </div>
                          <div className="w-40 flex flex-col items-end gap-1">
                            <Progress value={item.progress} />
                            {item.note && (
                              <span className="text-xs text-muted-foreground text-right">{item.note}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {item.status === 'idle' && !isProcessingAll && <Button size="sm" onClick={() => processItem(i)} disabled={!!item.locked}>Process</Button>}
                            {item.status === 'ready' && (
                              <>
                                <Button size="sm" onClick={() => handleSave(i)} disabled={item.locked}>
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleReject(i)}
                                  disabled={item.locked}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {item.status === 'saving' && (
                              <Button size="sm" variant="outline" disabled className="gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {item.note || 'Saving…'}
                              </Button>
                            )}
                            {(item.status === 'success' || item.status === 'error') && <Button size="sm" variant="outline" onClick={() => void removeQueueItem(i)}>Remove</Button>}
                          </div>
                        </div>

                        {/* Enhanced layout: Left side - Form, Right side - Preview */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Left side - Form data */}
                          <div className="space-y-4">
                      {item.status === 'ready' && item.form && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Link as version vs new */}
                            <div className="md:col-span-2">
                              <label className="text-sm">Save mode</label>
                              <div className="mt-2 flex items-center gap-4">
                                <label className="flex items-center gap-2 text-sm">
                                  <input type="radio" checked={item.linkMode === 'new'} onChange={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, linkMode: 'new' } : q))} /> New Document
                                </label>
                                <label className={"flex items-center gap-2 text-sm " + (!hasExistingDocs ? 'opacity-60' : '')}>
                                  <input type="radio" disabled={!hasExistingDocs} checked={item.linkMode === 'version'} onChange={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, linkMode: 'version' } : q))} /> Link as New Version
                              </label>
                                {item.linkMode === 'version' && hasExistingDocs && item.candidates && item.candidates.length > 0 && (
                                  <select
                                    className="border rounded-md p-1 text-sm"
                                    value={item.baseId}
                                    onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, baseId: e.target.value } : q))}
                                  >
                                    {item.candidates.map(c => (
                                      <option key={c.id} value={c.id}>{c.label}</option>
                                    ))}
                                  </select>
                                )}
                                {item.linkMode === 'version' && hasExistingDocs && (
                                  <Button size="sm" variant="outline" onClick={() => setPickerOpenIndex(i)}>Choose…</Button>
                                )}
                                {!hasExistingDocs && (
                                  <span className="text-xs text-muted-foreground">No documents yet to link.</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                Title
                              </label>
                              <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.title} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, title: e.target.value } } : q))} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                Filename
                              </label>
                              <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.filename} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, filename: e.target.value } } : q))} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Sender
                              </label>
                              <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.sender} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, sender: e.target.value } } : q))} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <UserCheck className="h-3 w-3" />
                                Receiver
                              </label>
                              <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.receiver} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, receiver: e.target.value } } : q))} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Document Date
                              </label>
                              <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.documentDate} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, documentDate: e.target.value } } : q))} />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                Subject
                              </label>
                              <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.subject} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, subject: e.target.value } } : q))} />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                <MessageSquare className="h-3.5 w-3.5" />
                                Description
                              </label>
                              <textarea rows={3} className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm resize-none" value={item.form.description} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, description: e.target.value } } : q))} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                <Bookmark className="h-3.5 w-3.5" />
                                Category
                              </label>
                              <UiSelect value={item.form?.category || 'General'} onValueChange={(value) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, category: value } } : q))}>
                                <UiSelectTrigger className="mt-1 w-full">
                                  <UiSelectValue placeholder="Select category..." />
                                </UiSelectTrigger>
                                <UiSelectContent>
                                  {availableCategories.map((category) => (
                                    <UiSelectItem key={category} value={category}>
                                      {category}
                                    </UiSelectItem>
                                  ))}
                                </UiSelectContent>
                              </UiSelect>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                <Hash className="h-3.5 w-3.5" />
                                Keywords (comma)
                              </label>
                              <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.keywords} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, keywords: e.target.value } } : q))} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                <Tag className="h-3.5 w-3.5" />
                                Tags
                              </label>
                              <input 
                                className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" 
                                placeholder="Enter tags separated by commas (e.g., invoice, payment, 2024)"
                                value={item.form.tags} 
                                onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, tags: e.target.value } } : q))} 
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                <FolderOpen className="h-3.5 w-3.5" />
                                Upload Destination
                                {folderPath.length > 0 && (
                                  <span className="ml-2 text-primary font-medium">
                                    /{folderPath.join('/')}
                                  </span>
                                )}
                              </label>
                              <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                                <UiSelect value={folderPath.length ? folderPath.join('/') : '__root__'} onValueChange={(v) => {
                                  if (v === '__root__') setFolderPath([]); else setFolderPath(v.split('/').filter(Boolean));
                                }}>
                                  <UiSelectTrigger className="w-full">
                                    <UiSelectValue placeholder={folderPath.length ? `/${folderPath.join('/')}` : "Root folder"} />
                                  </UiSelectTrigger>
                                  <UiSelectContent>
                                    <UiSelectItem value="__root__">📁 Root</UiSelectItem>
                                    {folders.map((p, idx) => (
                                      <UiSelectItem key={idx} value={p.join('/')}>📁 {p.join('/')}</UiSelectItem>
                                    ))}
                                  </UiSelectContent>
                                </UiSelect>
                                <input 
                                  className="rounded-md border bg-background p-2" 
                                  placeholder="Custom path e.g., Finance/2025/Q1" 
                                  value={folderPath.join('/')} 
                                  onChange={(e) => setFolderPath(e.target.value.split('/').filter(Boolean))} 
                                />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Documents will be uploaded to: <span className="font-medium">/{folderPath.join('/') || 'Root'}</span>
                                <br />
                                New folders will be created automatically if they don't exist.
                              </p>
                            </div>
                          </div>
                        )}
                          </div>

                          {/* Right side - Enhanced file preview */}
                          <div className="space-y-4">
                            <div>
                              <h3 className="text-sm font-medium mb-3">Document Preview</h3>
                              {shouldUseRemotePreview ? (
                                <FilePreview
                                  documentId={item.docId as string}
                                  mimeType={item.file.type || 'application/pdf'}
                                  extractedContent={item.extracted?.ocrText}
                                />
                              ) : (
                                <UploadFilePreview file={item.file} previewUrl={item.previewUrl} height="75vh" />
                              )}
                            </div>
                            
                            {/* Image rotation controls */}
                            {!shouldUseRemotePreview && !item.file.name.toLowerCase().endsWith('.pdf') && (
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, rotation: ((q.rotation || 0) - 90 + 360) % 360 } : q))}>Rotate Left</Button>
                                <Button size="sm" variant="outline" onClick={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, rotation: ((q.rotation || 0) + 90) % 360 } : q))}>Rotate Right</Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  queue.map((item, i) => (
                    <div key={i} className={`rounded-lg border p-3 ${activeIndex === i ? 'ring-1 ring-primary' : ''}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium" title={item.file.name}>{item.file.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{item.status}</div>
                        </div>
                        <div className="w-40 flex flex-col items-end gap-1">
                          <Progress value={item.progress} />
                          {item.note && (
                            <span className="text-xs text-muted-foreground text-right">{item.note}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {item.status === 'idle' && !isProcessingAll && <Button size="sm" onClick={() => processItem(i)} disabled={!!item.locked}>Process</Button>}
                          {item.status === 'ready' && (
                            <>
                              <Button size="sm" onClick={() => handleSave(i)} disabled={item.locked}>
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReject(i)}
                                disabled={item.locked}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {item.status === 'saving' && (
                            <Button size="sm" variant="outline" disabled className="gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {item.note || 'Saving…'}
                            </Button>
                          )}
                          {(item.status === 'success' || item.status === 'error') && <Button size="sm" variant="outline" onClick={() => setQueue(prev => prev.filter((_, idx) => idx !== i))}>Remove</Button>}
                        </div>
                      </div>
                      {item.status === 'ready' && item.form && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                              <FileText className="h-3.5 w-3.5" />
                              Title
                            </label>
                            <input
                              className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                              value={item.form.title}
                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, title: e.target.value } } : q))}
                              placeholder="Enter document title..."
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                              <FileText className="h-3.5 w-3.5" />
                              Filename
                            </label>
                            <input
                              className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                              value={item.form.filename}
                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, filename: e.target.value } } : q))}
                              placeholder="Enter filename..."
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                              <User className="h-3.5 w-3.5" />
                              Sender
                            </label>
                            <input
                              className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                              value={item.form.sender}
                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, sender: e.target.value } } : q))}
                              placeholder="Who sent this document?"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <UserCheck className="h-3 w-3" />
                              Receiver
                            </label>
                            <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.receiver} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, receiver: e.target.value } } : q))} />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Document Date
                            </label>
                            <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.documentDate} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, documentDate: e.target.value } } : q))} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                            Subject
                          </label>
                            <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.subject} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, subject: e.target.value } } : q))} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                            Description
                          </label>
                            <textarea rows={3} className="mt-1 rounded-md border bg-background p-2 w-full" value={item.form.description} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, description: e.target.value } } : q))} />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Bookmark className="h-3 w-3" />
                            Category
                          </label>
                          <UiSelect value={item.form?.category || 'General'} onValueChange={(value) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, category: value } } : q))}>
                              <UiSelectTrigger className="mt-1 w-full">
                              <UiSelectValue placeholder="Select category..." />
                            </UiSelectTrigger>
                            <UiSelectContent>
                              {availableCategories.map((category) => (
                                <UiSelectItem key={category} value={category}>
                                  {category}
                                </UiSelectItem>
                              ))}
                            </UiSelectContent>
                          </UiSelect>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Keywords (comma)</label>
                            <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.keywords} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, keywords: e.target.value } } : q))} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground">Tags (comma)</label>
                            <input className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm" value={item.form.tags} onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, tags: e.target.value } } : q))} />
                        </div>

                        {/* Linking Options */}
                        <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <LinkIcon className="h-3 w-3" />
                            Document Relationship
                          </label>
                            <div className="mt-2 flex items-center gap-4">
                              <label className="flex items-center gap-2 text-sm">
                              <input
                                type="radio"
                                checked={item.linkMode === 'new'}
                                onChange={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, linkMode: 'new' } : q))}
                              />
                              New Document
                            </label>
                              <label className={`flex items-center gap-2 text-sm ${documents.length === 0 ? 'opacity-50' : ''}`}>
                              <input
                                type="radio"
                                disabled={documents.length === 0}
                                checked={item.linkMode === 'version'}
                                onChange={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, linkMode: 'version' } : q))}
                              />
                              Link as New Version
                            </label>
                            {item.linkMode === 'version' && documents.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPickerOpenIndex(i)}
                                  className="text-xs h-7"
                              >
                                {item.baseId ?
                                  `Selected: ${documents.find(d => d.id === item.baseId)?.title || documents.find(d => d.id === item.baseId)?.name || 'Unknown'}` :
                                  'Select Document'
                                }
                              </Button>
                            )}
                          </div>
                          {item.linkMode === 'version' && !item.baseId && (
                            <div className="mt-1 text-xs text-destructive">
                              Please select a document to link this as a new version.
                            </div>
                          )}
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground">
                            Upload Destination
                            {folderPath.length > 0 && (
                              <span className="ml-2 text-primary font-medium">
                                /{folderPath.join('/')}
                              </span>
                            )}
                          </label>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Documents will be uploaded to: <span className="font-medium">/{folderPath.join('/') || 'Root'}</span>
                            <br />
                              Folder path is set from the main form above.
                          </div>
                        </div>
                      </div>
                      )}
                    </div>
                  ))
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={onReset}>Clear</Button>
                    {hasSuccess && <span className="text-xs text-muted-foreground">Saved: {queue.filter(q => q.status === 'success').length}</span>}
                    {readyCount > 0 && <span className="text-xs text-muted-foreground">Ready: {readyCount}</span>}
                  </div>
                  <div className="flex gap-2">
                    {hasProcessable && queue.length > 1 && (
                    <Button onClick={async () => {
                      setIsProcessingAll(true);
                      try {
                        const indicesToProcess = queue.map((q, i) => (q.status === 'idle' || q.status === 'error') ? i : -1).filter(i => i >= 0);
                        
                        // Process files in parallel batches for better performance
                        const BATCH_SIZE = 10; // Process 10 files simultaneously (max allowed)
                        const batches = [];
                        for (let i = 0; i < indicesToProcess.length; i += BATCH_SIZE) {
                          batches.push(indicesToProcess.slice(i, i + BATCH_SIZE));
                        }
                        
                        for (const batch of batches) {
                          // Process each batch in parallel
                          await Promise.allSettled(
                            batch.map(i => processItem(i).catch(error => {
                              console.error(`Failed to process item ${i}:`, error);
                              // Update queue to show error status
                              setQueue(prev => prev.map((q, idx) => 
                                idx === i ? { ...q, status: 'error', note: error.message } : q
                              ));
                            }))
                          );
                          
                          // Small delay between batches to prevent overwhelming the system
                          if (batches.indexOf(batch) < batches.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                          }
                        }
                      } finally {
                        setIsProcessingAll(false);
                      }
                    }} disabled={isProcessingAll} className="gap-2">
                      {isProcessingAll ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing…
                        </>
                      ) : (
                        'Process All'
                      )}
                    </Button>
                    )}
                    {readyCount > 0 && (
                      <Button onClick={saveAllReady} disabled={isSavingAll} className="gap-2">
                        {isSavingAll ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving all…
                          </>
                        ) : (
                          'Save All'
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Version picker dialog */}
        {typeof pickerOpenIndex === 'number' && queue[pickerOpenIndex] && (
          <Dialog open onOpenChange={(open) => setPickerOpenIndex(open ? pickerOpenIndex : null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Select document to link as new version</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <input
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="Search by name…"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                />
                <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
                  {documents
                    .filter(d => (d.title || d.name || '').toLowerCase().includes(pickerQuery.toLowerCase()))
                    .slice(0, 50)
                    .map(d => (
                      <button
                        key={d.id}
                        onClick={() => {
                          setQueue(prev => prev.map((q, idx) => idx === pickerOpenIndex ? { ...q, baseId: d.id, linkMode: 'version' } : q));
                          setPickerOpenIndex(null);
                        }}
                        className="w-full text-left rounded-md px-2 py-1 hover:bg-accent text-sm"
                      >
                        {(d.title || d.name || 'Untitled')} <span className="ml-2 text-muted-foreground">v{d.versionNumber || d.version || 1}</span>
                      </button>
                    ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPickerOpenIndex(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AppLayout>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <UploadContent />
    </Suspense>
  );
}
