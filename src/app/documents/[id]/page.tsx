"use client";

import type { StoredDocument } from '@/lib/types';
import AppLayout from '@/components/layout/app-layout';
import { useParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  Download,
  Pencil,
  Trash2,
  FileText as FileTextIcon,
  User,
  UserCheck,
  Calendar,
  Tag,
  MessageSquare,
  Hash,
  FolderOpen,
  MapPin,
  Info,
  FileType,
  HardDrive,
  GitBranch,
  Crown,
  ExternalLink,
  Plus,
  ArrowUp,
  ArrowDown,
  X,
  Loader2,
  AlertTriangle,
  Sparkles,
  MoreHorizontal,
  Share2,
  Copy,
  Check,
  MessageCircle,
} from 'lucide-react';
import { ViewAccessDenied } from '@/components/access-denied';
import { useDocuments } from '@/hooks/use-documents';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { apiFetch, getApiContext } from '@/lib/api';
import { formatAppDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useDepartments } from '@/hooks/use-departments';
import { useToast } from '@/hooks/use-toast';
import FilePreview from '@/components/file-preview';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

// Linear-style section component
function Section({
  icon: Icon,
  title,
  description,
  children,
  className,
  action,
  variant = 'default',
  collapsible = false,
  defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  variant?: 'default' | 'accent';
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "rounded-lg border",
        variant === 'default'
          ? "bg-card/50 border-border/40"
          : "bg-gradient-to-br from-primary/5 via-primary/8 to-primary/5 border-primary/20",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-5 py-3",
          collapsible && "cursor-pointer hover:bg-muted/20 transition-colors",
          isOpen && "border-b border-border/30"
        )}
        onClick={collapsible ? () => setIsOpen(!isOpen) : undefined}
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md",
            variant === 'default' ? "bg-muted/50" : "bg-primary/10"
          )}>
            <Icon className={cn(
              "h-3.5 w-3.5",
              variant === 'default' ? "text-muted-foreground" : "text-primary"
            )} />
          </div>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {description && (
            <span className="text-xs text-muted-foreground hidden sm:inline">· {description}</span>
          )}
        </div>
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      {isOpen && (
        <div className="px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

// Linear-style detail row
function DetailRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon?: React.ElementType;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="text-sm font-medium text-foreground break-words">
        {value || '—'}
      </div>
    </div>
  );
}

type DocumentActor = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  systemadmin: 'Admin',
  orgadmin: 'Admin',
  teamlead: 'Team Lead',
  contentmanager: 'Manager',
  contentviewer: 'Viewer',
  member: 'Member',
  guest: 'Guest',
  admin: 'Admin',
  manager: 'Manager',
  viewer: 'Viewer',
};

function formatRoleLabel(role?: string | null) {
  if (!role) return '';
  const key = String(role).toLowerCase();
  return ROLE_LABELS[key] || role;
}

function getInitials(label: string) {
  const base = label.split('@')[0];
  const parts = base.split(' ').filter(Boolean);
  const initials = parts.map((part) => part[0]).join('');
  return initials.slice(0, 2).toUpperCase() || 'U';
}

function renderActor(actor?: DocumentActor | null) {
  if (!actor) return null;
  const label = actor.name || actor.email || (actor.id ? `User ${actor.id.slice(0, 8)}` : 'Unknown');
  const roleLabel = formatRoleLabel(actor.role);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar className="h-5 w-5">
        <AvatarFallback className="text-[9px] font-semibold">
          {getInitials(label)}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {roleLabel && (
        <span className="text-[10px] text-muted-foreground">({roleLabel})</span>
      )}
    </span>
  );
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getDocumentById, removeDocument, setCurrentVersion, unlinkFromVersionGroup, refresh } = useDocuments();
  const { hasRoleAtLeast, hasPermission, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();

  // Check document permissions
  const canReadDocuments = hasPermission('documents.read');
  const canUpdateDocuments = hasPermission('documents.update');
  const canDeleteDocuments = hasPermission('documents.delete');
  const canShareDocuments = hasPermission('documents.share');
  const { departments } = useDepartments();
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [sharePassword, setSharePassword] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState('7');

  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const docFromList = getDocumentById(params.id);
  const [fetchedDoc, setFetchedDoc] = useState<StoredDocument | null>(null);
  const doc = fetchedDoc || docFromList;
  const [ocrText, setOcrText] = useState<string>('');
  const [extractionSummary, setExtractionSummary] = useState<string>('');
  const [loadingExtraction, setLoadingExtraction] = useState<boolean>(false);
  const [referrer, setReferrer] = useState<string | null>(null);
  const loadAttempted = useRef<Set<string>>(new Set());

  // Relationships state
  const [relationships, setRelationships] = useState<{
    linked: any[];
    versions: any[];
    incoming: any[];
    outgoing: any[];
  }>({ linked: [], versions: [], incoming: [], outgoing: [] });
  const [relLoading, setRelLoading] = useState(false);

  // Load relationships
  const loadRelationships = useCallback(async () => {
    if (!params.id) return;
    try {
      setRelLoading(true);
      const { orgId } = getApiContext();
      const data = await apiFetch(`/orgs/${orgId}/documents/${params.id}/relationships`);
      setRelationships(data || { linked: [], versions: [], incoming: [], outgoing: [] });
    } catch (error) {
      console.error('Failed to load relationships:', error);
    } finally {
      setRelLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadAttempted.current.clear();
    setFetchedDoc(null);
    setLoadError(null);
    setDocumentsLoaded(false);
    setInitialLoading(true);
  }, [params.id]);

  // Track when documents are loaded
  useEffect(() => {
    if (authLoading) return;

    const hasDoc = Boolean(doc);
    if (hasDoc) {
      setDocumentsLoaded(true);
      setInitialLoading(false);
      setLoadError(null);
    }

    const { orgId } = getApiContext();
    if (!orgId || !params.id) return;

    if (loadAttempted.current.has(params.id)) return;
    loadAttempted.current.add(params.id);

    const normalizeDoc = (raw: any): StoredDocument => ({
      ...raw,
      name: raw.name || raw.title || raw.filename || 'Untitled',
      uploadedAt: new Date(raw.uploadedAt || raw.uploaded_at || Date.now()),
      folderPath: raw.folderPath || raw.folder_path || [],
      fileSizeBytes: raw.fileSizeBytes ?? raw.file_size_bytes,
      mimeType: raw.mimeType || raw.mime_type,
      contentHash: raw.contentHash || raw.content_hash,
      departmentId: raw.departmentId ?? raw.department_id ?? null,
      versionGroupId: raw.versionGroupId || raw.version_group_id,
      versionNumber: raw.versionNumber || raw.version_number,
      isCurrentVersion: raw.isCurrentVersion ?? raw.is_current_version,
      supersedesId: raw.supersedesId || raw.supersedes_id,
      documentDate: raw.documentDate || raw.document_date,
      linkedDocumentIds: raw.linkedDocumentIds || raw.linked_document_ids || [],
      version: raw.version || raw.version_number || 1,
      content: raw.content ?? null,
      summary: raw.summary ?? '',
      keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      isDraft: raw.isDraft ?? raw.is_draft ?? false,
      semanticReady: Boolean(raw.semanticReady ?? raw.semantic_ready),
      deletedAt: raw.deletedAt ?? raw.deleted_at ?? null,
      purgeAfter: raw.purgeAfter ?? raw.purge_after ?? null,
    });

    const fetchDoc = async () => {
      try {
        if (!hasDoc) setInitialLoading(true);
        const data: any = await apiFetch(`/orgs/${orgId}/documents/${params.id}`, { skipCache: true });
        setFetchedDoc(normalizeDoc(data));
        setDocumentsLoaded(true);
        setInitialLoading(false);
      } catch (error: any) {
        if (!hasDoc) {
          if (error?.status === 404) {
            setLoadError('Document not found');
          } else {
            setLoadError('Failed to load document');
          }
          setDocumentsLoaded(true);
          setInitialLoading(false);
        }
      }
    };

    void fetchDoc();
  }, [authLoading, doc, params.id]);

  // Set referrer on mount for smart back navigation
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setReferrer(document.referrer);
    }
  }, []);

  // Load relationships when doc is available
  useEffect(() => {
    if (doc) {
      loadRelationships();
    }
  }, [doc?.id, loadRelationships]);

  // Auto-load extraction content on page load
  useEffect(() => {
    const { orgId } = getApiContext();
    if (doc && !doc.content && !ocrText && !loadingExtraction && orgId && !loadAttempted.current.has(`extraction-${doc.id}`)) {
      loadAttempted.current.add(`extraction-${doc.id}`);

      const loadExtraction = async () => {
        try {
          setLoadingExtraction(true);
          const data: any = await apiFetch(`/orgs/${orgId}/documents/${doc.id}/extraction`);
          setOcrText(String(data.ocrText || ''));
          try {
            const sum = String(data?.metadata?.summary || '').trim();
            if (sum) setExtractionSummary(sum);
          } catch { }
        } catch (error) {
          console.log('No extraction found:', error);
        }
        setLoadingExtraction(false);
      };
      loadExtraction();
    }
  }, [doc?.id]);

  useEffect(() => {
    if (!shareOpen) {
      setShareError(null);
      setShareUrl(null);
      setShareExpiresAt(null);
      setShareCopied(false);
      setSharePassword('');
      setAllowDownload(true);
      setExpiresInDays('7');
    }
  }, [shareOpen, doc?.id]);

  // Calculate versions
  const versions = React.useMemo(() => {
    const rawVersions = Array.isArray(relationships.versions) ? relationships.versions : [];
    const combined: any[] = [];
    if (doc?.id) {
      combined.push({
        id: doc.id,
        title: doc.title || doc.filename || doc.name || 'Untitled',
        versionNumber: (doc as any).versionNumber || 1,
        isCurrentVersion: (doc as any).isCurrentVersion || false,
        uploadedAt: doc.uploadedAt,
      });
    }
    combined.push(...rawVersions);
    const seen = new Set<string>();
    return combined
      .filter((v: any) => {
        if (!v?.id) return false;
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      })
      .sort((a: any, b: any) => Number(b.versionNumber || 0) - Number(a.versionNumber || 0));
  }, [doc, relationships.versions]);

  const maxVersion = React.useMemo(() => {
    const nums = versions.map((v: any) => Number(v.versionNumber || 0)).filter(n => Number.isFinite(n) && n > 0);
    return nums.length ? Math.max(...nums) : 1;
  }, [versions]);

  // Show loading skeleton
  if (!documentsLoaded) {
    return (
      <AppLayout>
        <div className="min-h-screen">
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            </div>
          </header>
          <main className="px-6 py-6">
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              <div className="xl:col-span-3 space-y-6">
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-48 w-full rounded-lg" />
                <Skeleton className="h-40 w-full rounded-lg" />
              </div>
              <div className="xl:col-span-2">
                <Skeleton className="h-96 w-full rounded-lg" />
              </div>
            </div>
          </main>
        </div>
      </AppLayout>
    );
  }

  // Show loading states
  if (authLoading || initialLoading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {authLoading ? 'Authenticating...' : 'Loading document...'}
            </span>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Show error state
  if (loadError) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-sm text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/10">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-1">{loadError}</h3>
              <p className="text-sm text-muted-foreground">
                {loadError === 'Document not found'
                  ? "The document you're looking for might have been deleted or moved."
                  : 'There was a problem loading the document. Please try again.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push('/documents')}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Documents
              </Button>
              {loadError !== 'Document not found' && (
                <Button onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              )}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Document not found
  if (documentsLoaded && !doc) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-sm text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30">
              <FileTextIcon className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-1">Document not found</h3>
              <p className="text-sm text-muted-foreground">
                The document you're looking for might have been deleted or moved.
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push('/documents')}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Documents
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!doc) return null;

  // Determine permissions
  const folderPath = doc.folderPath || (doc as any).folder_path || [];
  const myDeptIds = new Set((departments || []).map((d: any) => d.id));
  const docDeptId = (doc as any).departmentId || (doc as any).department_id || null;
  const deletedAt = doc.deletedAt || (doc as any).deleted_at || null;
  const isDeleted = Boolean(deletedAt);
  const deletedAtDate = deletedAt ? new Date(deletedAt) : null;
  const deletedAtLabel = deletedAtDate && !Number.isNaN(deletedAtDate.getTime())
    ? formatAppDateTime(deletedAtDate)
    : null;
  const createdBy = doc.createdBy || null;
  const updatedBy = doc.updatedBy || null;
  const isAdmin = user?.role === 'systemAdmin';
  const canEdit = hasRoleAtLeast('member') && (isAdmin || (docDeptId && myDeptIds.has(docDeptId))) && canUpdateDocuments && !isDeleted;
  const canDelete = hasRoleAtLeast('member') && (isAdmin || (docDeptId && myDeptIds.has(docDeptId))) && canDeleteDocuments && !isDeleted;
  const canShare = canShareDocuments && !isDeleted;

  // Determine back navigation
  let backHref = '/documents';
  if (folderPath.length > 0) {
    backHref = `/documents?path=${encodeURIComponent(folderPath.join('/'))}`;
  }

  // Check permissions
  if (!canReadDocuments) {
    return (
      <AppLayout>
        <ViewAccessDenied />
      </AppLayout>
    );
  }

  const displaySummary = (doc.summary || extractionSummary || doc.description || '').trim();

  const handleDelete = () => {
    removeDocument(doc.id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('documentDeleted', { detail: { id: doc.id } }));
    }
    toast({ title: 'Document deleted', description: 'The document has been moved to the recycle bin.' });
    router.push('/documents');
  };

  const downloadContent = async () => {
    try {
      const { orgId } = getApiContext();
      if (!orgId) return;
      const response = await apiFetch(`/orgs/${orgId}/documents/${doc.id}/file`);
      if (response.url) {
        const a = document.createElement('a');
        a.href = response.url;
        a.download = response.filename || doc.filename || doc.name || 'document';
        a.target = '_blank';
        a.click();
      } else {
        const blob = new Blob([doc.content || doc.summary || ''], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (doc.filename || doc.name || 'document') + '.txt';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      const blob = new Blob([doc.content || doc.summary || extractionSummary || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (doc.filename || doc.name || 'document') + '.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const createShareLink = async () => {
    if (!doc) return;
    setShareLoading(true);
    setShareError(null);
    try {
      const { orgId } = getApiContext();
      if (!orgId) {
        setShareError('No organization selected');
        setShareLoading(false);
        return;
      }
      const days = Math.max(1, Number(expiresInDays) || 7);
      const payload: any = {
        expiresInDays: days,
        allowDownload,
        allowPreview: allowDownload,
      };
      if (sharePassword.trim()) payload.password = sharePassword.trim();
      const data: any = await apiFetch(`/orgs/${orgId}/documents/${doc.id}/shares`, {
        method: 'POST',
        body: payload,
      });
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = origin ? `${origin}/share/${data.token}` : `/share/${data.token}`;
      setShareUrl(url);
      setShareExpiresAt(data.expiresAt || null);
      setSharePassword('');
    } catch (error: any) {
      setShareError(error?.message || 'Failed to create share link');
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setShareError('Failed to copy link');
    }
  };

  const shareOnWhatsApp = () => {
    if (!shareUrl) return;
    const title = doc.title || doc.filename || doc.name || 'document';
    const message = `Shared document: ${title}\n${shareUrl}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    if (typeof window !== 'undefined') {
      window.open(whatsappUrl, '_blank', 'noopener');
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen flex flex-col">
        {/* Header - Linear style */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Back button */}
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => router.push(backHref)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Back to folder
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <FileTextIcon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold text-foreground truncate max-w-[300px] sm:max-w-[400px] md:max-w-[500px]">
                      {doc.title || doc.name}
                    </h1>
                    {doc.versionGroupId && (
                      <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
                        v{doc.versionNumber || 1}
                        {doc.isCurrentVersion && ' · Current'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Link href="/documents" className="hover:text-foreground transition-colors">
                      Documents
                    </Link>
                    {folderPath.map((folder: string, index: number) => (
                      <React.Fragment key={index}>
                        <span className="text-muted-foreground/50">/</span>
                        <Link
                          href={`/documents?path=${encodeURIComponent(folderPath.slice(0, index + 1).join('/'))}`}
                          className="hover:text-foreground transition-colors"
                        >
                          {folder}
                        </Link>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={downloadContent}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Download</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {canShare && (
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setShareOpen(true)}
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">Share</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => router.push(`/documents/${doc.id}/edit`)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                )}

                {canDelete && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setConfirmDeleteOpen(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Document
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        </header>

        {isDeleted && (
          <div className="px-6 py-3 border-b border-border/40 bg-amber-50/60 dark:bg-amber-950/20">
            <div className="flex flex-wrap items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
              <Trash2 className="h-4 w-4" />
              <span>Deleted document — this item is in the recycle bin.</span>
              {deletedAtLabel && (
                <span className="text-xs text-amber-700/80 dark:text-amber-200/60">
                  Deleted {deletedAtLabel}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 px-6 py-6">
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
            {/* Left column - 60% */}
            <div className="xl:col-span-3 space-y-6">
              {/* Location Section */}
              <Section icon={MapPin} title="Location">
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <Link href="/documents" className="text-primary hover:underline">Root</Link>
                  {folderPath.map((seg: string, i: number) => (
                    <React.Fragment key={i}>
                      <span className="text-muted-foreground">/</span>
                      <Link
                        href={`/documents?path=${encodeURIComponent(folderPath.slice(0, i + 1).join('/'))}`}
                        className="text-foreground hover:text-primary transition-colors"
                      >
                        {seg}
                      </Link>
                    </React.Fragment>
                  ))}
                </div>
              </Section>

              {/* Details Section */}
              <Section icon={Info} title="Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DetailRow icon={MessageSquare} label="Subject" value={doc.subject} />
                  <DetailRow icon={Calendar} label="Uploaded" value={formatAppDateTime(doc.uploadedAt)} />
                  <DetailRow icon={User} label="Sender" value={doc.sender || 'N/A'} />
                  <DetailRow icon={UserCheck} label="Receiver" value={doc.receiver} />
                </div>
              </Section>

              {/* AI Summary Section */}
              {displaySummary && (
                <Section icon={Sparkles} title="AI Summary" variant="accent">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {displaySummary}
                  </p>
                </Section>
              )}

              {/* Metadata & Tags Section */}
              <Section icon={Tag} title="Metadata & Tags">
                <div className="space-y-4">
                  {(doc.aiPurpose || (doc.aiKeyPoints && doc.aiKeyPoints.length) || doc.aiContext || doc.aiOutcome) && (
                    <div className="space-y-3 pb-4 border-b border-border/30">
                      {doc.aiPurpose && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Purpose</div>
                          <p className="text-sm">{doc.aiPurpose}</p>
                        </div>
                      )}
                      {doc.aiKeyPoints && doc.aiKeyPoints.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Key Points</div>
                          <ul className="list-disc pl-5 space-y-1 text-sm">
                            {doc.aiKeyPoints.map((p: string, i: number) => <li key={i}>{p}</li>)}
                          </ul>
                        </div>
                      )}
                      {doc.aiContext && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Context</div>
                          <p className="text-sm">{doc.aiContext}</p>
                        </div>
                      )}
                      {doc.aiOutcome && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Outcome/Action</div>
                          <p className="text-sm">{doc.aiOutcome}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {doc.aiKeywords && doc.aiKeywords.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">AI Keywords</div>
                      <div className="flex flex-wrap gap-1.5">
                        {doc.aiKeywords.map((k: string) => (
                          <Badge key={k} variant="outline" className="text-xs font-normal">{k}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {(doc as any).keywords && (doc as any).keywords.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        Keywords
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(doc as any).keywords.map((k: string) => (
                          <Badge key={k} variant="outline" className="text-xs font-normal bg-muted/30">{k}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {doc.tags && doc.tags.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        Tags
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {doc.tags.map((k: string) => (
                          <Badge key={k} variant="secondary" className="text-xs font-normal">{k}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {(!doc.aiKeywords || doc.aiKeywords.length === 0) && (!(doc as any).keywords || (doc as any).keywords.length === 0) && (!doc.tags || doc.tags.length === 0) && !doc.aiPurpose && (
                    <p className="text-sm text-muted-foreground">No metadata or tags available</p>
                  )}
                </div>
              </Section>

              {/* Version Chain Section */}
              <Section
                icon={GitBranch}
                title="Version Chain"
                description={`${versions.length} version${versions.length !== 1 ? 's' : ''}`}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    asChild
                  >
                    <Link href={`/documents/upload?path=${encodeURIComponent(folderPath.join('/') || '')}&version=${doc.id}`}>
                      <Plus className="h-3 w-3" />
                      New Version
                    </Link>
                  </Button>
                }
              >
                {relLoading ? (
                  <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading versions...</span>
                  </div>
                ) : versions.length <= 1 && !doc.versionGroupId ? (
                  <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-dashed border-border/50 bg-muted/10">
                    <GitBranch className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No version chain linked yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Upload a new version to create a chain</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border/40 bg-background/50 divide-y divide-border/30">
                      {versions.map((v: any) => {
                        const isActive = v.id === doc.id;
                        return (
                          <div
                            key={v.id}
                            className={cn(
                              "flex items-center justify-between gap-3 px-4 py-3",
                              "transition-colors",
                              isActive ? "bg-primary/5" : "hover:bg-muted/30"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium tabular-nums",
                                isActive ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"
                              )}>
                                v{v.versionNumber || '—'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "text-sm font-medium truncate",
                                    isActive ? "text-primary" : "text-foreground"
                                  )}>
                                    {v.title || 'Untitled'}
                                  </span>
                                  {v.isCurrentVersion && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs border-green-200/50 text-green-600 bg-green-500/10 gap-1"
                                    >
                                      <Crown className="h-2.5 w-2.5" />
                                      Current
                                    </Badge>
                                  )}
                                  {isActive && !v.isCurrentVersion && (
                                    <Badge variant="outline" className="text-xs">
                                      Viewing
                                    </Badge>
                                  )}
                                </div>
                                {v.uploadedAt && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatAppDateTime(v.uploadedAt)}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {!isActive && (
                                <TooltipProvider delayDuration={300}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                        asChild
                                      >
                                        <Link href={`/documents/${v.id}`}>
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </Link>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">View</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      disabled={!Number.isFinite(Number(v.versionNumber)) || Number(v.versionNumber) <= 1}
                                      onClick={async () => {
                                        const from = Number(v.versionNumber);
                                        if (!Number.isFinite(from) || from <= 1) return;
                                        try {
                                          const { orgId } = getApiContext();
                                          await apiFetch(`/orgs/${orgId}/documents/${v.id}/move-version`, {
                                            method: 'POST',
                                            body: { fromVersion: from, toVersion: from - 1 }
                                          });
                                          await loadRelationships();
                                        } catch (e) { console.error(e); }
                                      }}
                                    >
                                      <ArrowUp className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">Move earlier</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      disabled={!Number.isFinite(Number(v.versionNumber)) || Number(v.versionNumber) >= maxVersion}
                                      onClick={async () => {
                                        const from = Number(v.versionNumber);
                                        if (!Number.isFinite(from) || from >= maxVersion) return;
                                        try {
                                          const { orgId } = getApiContext();
                                          await apiFetch(`/orgs/${orgId}/documents/${v.id}/move-version`, {
                                            method: 'POST',
                                            body: { fromVersion: from, toVersion: from + 1 }
                                          });
                                          await loadRelationships();
                                        } catch (e) { console.error(e); }
                                      }}
                                    >
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">Move later</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {!v.isCurrentVersion && (
                                <TooltipProvider delayDuration={300}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                                        onClick={async () => {
                                          try {
                                            const { orgId } = getApiContext();
                                            await apiFetch(`/orgs/${orgId}/documents/${v.id}/set-current`, { method: 'POST' });
                                            await refresh();
                                            await loadRelationships();
                                          } catch (e) { console.error(e); }
                                        }}
                                      >
                                        <Crown className="h-3 w-3 mr-1" />
                                        Set Current
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Make this the current version</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {versions.length > 1 && (
                                <TooltipProvider delayDuration={300}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                        onClick={async () => {
                                          if (!confirm('Remove this document from the version chain?')) return;
                                          try {
                                            const { orgId } = getApiContext();
                                            await apiFetch(`/orgs/${orgId}/documents/${v.id}/unlink`, { method: 'POST' });
                                            await refresh();
                                            await loadRelationships();
                                          } catch (e) { console.error(e); }
                                        }}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Remove from chain</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {versions.length > 1 && (
                      <div className="pt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (unlinkFromVersionGroup) {
                              unlinkFromVersionGroup(doc.id);
                              loadRelationships();
                            }
                          }}
                        >
                          Unlink this document from group
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {/* File Info Section */}
              <Section icon={FileTextIcon} title="File Info">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {doc.filename && (
                    <DetailRow icon={FileTextIcon} label="Filename" value={doc.filename} className="sm:col-span-2" />
                  )}
                  <DetailRow icon={Calendar} label="Created" value={formatAppDateTime(doc.uploadedAt)} />
                  {createdBy && <DetailRow icon={User} label="Created By" value={renderActor(createdBy)} />}
                  {doc.fileSizeBytes !== undefined && (
                    <DetailRow icon={HardDrive} label="File Size" value={formatSize(doc.fileSizeBytes)} />
                  )}
                  <DetailRow icon={Tag} label="Type" value={doc.documentType || doc.type} />
                </div>
              </Section>
            </div>

            {/* Right column - File Preview - 40% */}
            <div className="xl:col-span-2 xl:sticky xl:top-24">
              <FilePreview
                documentId={doc.id}
                mimeType={doc.mimeType}
                extractedContent={doc.content || ocrText || undefined}
              />
            </div>
          </div>
        </main>
      </div>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Expires in</label>
              <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select expiry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border/40 p-3">
              <div>
                <div className="text-sm font-medium text-foreground">Allow download</div>
                <div className="text-xs text-muted-foreground">Recipients can download the file</div>
              </div>
              <Switch checked={allowDownload} onCheckedChange={setAllowDownload} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Password (optional)</label>
              <Input
                type="password"
                placeholder="Add a password for this link"
                value={sharePassword}
                onChange={(e) => setSharePassword(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={createShareLink} disabled={shareLoading}>
                {shareLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" />
                    Create link
                  </>
                )}
              </Button>
              {shareError && (
                <span className="text-sm text-destructive">{shareError}</span>
              )}
            </div>

            {shareUrl && (
              <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Share link</div>
                    {shareExpiresAt && (
                      <div className="text-xs text-muted-foreground">
                        Expires {formatAppDateTime(new Date(shareExpiresAt))}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={copyShareLink} className="h-7 w-7">
                    {shareCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Input readOnly value={shareUrl} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={shareOnWhatsApp} className="gap-2">
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (typeof window !== 'undefined') window.open(shareUrl, '_blank', 'noopener');
                    }}
                  >
                    Open link
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="max-w-md border-border/40">
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <AlertDialogTitle className="text-base font-semibold text-foreground">
                  Delete document?
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
                  Are you sure you want to delete "{doc.title || doc.filename || doc.name}"? This will move it to the recycle bin.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
            <AlertDialogCancel className="text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600 text-white text-sm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
