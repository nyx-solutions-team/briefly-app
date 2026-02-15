"use client";

import type { StoredDocument } from '@/lib/types';
import AppLayout from '@/components/layout/app-layout';
import { useParams, useRouter } from 'next/navigation';
import { format as formatDateFns } from 'date-fns';
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
  Zap,
  MessageCircle,
  Maximize2,
} from 'lucide-react';
import { ViewAccessDenied } from '@/components/access-denied';
import { useDocuments } from '@/hooks/use-documents';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { apiFetch, getApiContext } from '@/lib/api';
import { formatAppDateTime, formatAppDate } from '@/lib/utils';
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

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
  isMobile?: boolean;
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
          "flex items-center justify-between py-3 px-4 sm:px-5",
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
        <div className="px-4 sm:px-5 py-4">
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

type DocumentShareRow = {
  id: string;
  expires_at: string | null;
  revoked_at: string | null;
  max_views: number | null;
  views_count: number | null;
  allow_download: boolean;
  allow_preview: boolean;
  requires_password: boolean;
  created_at: string;
  last_accessed_at?: string | null;
};

function isDocumentShareActive(share: DocumentShareRow) {
  if (share.revoked_at) return false;
  if (!share.expires_at) return true;
  return new Date(share.expires_at).getTime() > Date.now();
}

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

const ACCESS_EXPLAIN_PERMS = [
  { value: 'documents.read', label: 'Read documents' },
  { value: 'documents.update', label: 'Edit documents' },
  { value: 'documents.delete', label: 'Delete documents' },
  { value: 'documents.share', label: 'Share documents' },
];

const ACCESS_REASON_LABELS: Record<string, string> = {
  membership: 'Not an active org member',
  explicit_deny: 'Explicit deny override',
  permission: 'Missing required permission',
  share: 'Granted by share',
  department_grant: 'Granted by team access',
  admin: 'Organization admin access',
  department: 'Department member access',
  folder_access: 'Folder share/access',
  scope: 'Outside allowed scope',
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

function ShareContent({
  expiresInDays,
  setExpiresInDays,
  shareTab,
  setShareTab,
  sharePassword,
  setSharePassword,
  createShareLink,
  refreshActiveShareLinks,
  activeShareLinks,
  activeShareLinksLoading,
  activeShareLinksError,
  revokeActiveShareLink,
  revokingShareId,
  shareLoading,
  shareError,
  shareUrl,
  shareExpiresAt,
  copyShareLink,
  shareCopied,
  shareOnWhatsApp,
  onClose,
  isMobile
}: {
  expiresInDays: string;
  setExpiresInDays: (v: string) => void;
  shareTab: 'create' | 'active';
  setShareTab: (v: 'create' | 'active') => void;
  sharePassword: string;
  setSharePassword: (v: string) => void;
  createShareLink: () => void;
  refreshActiveShareLinks: () => void;
  activeShareLinks: DocumentShareRow[];
  activeShareLinksLoading: boolean;
  activeShareLinksError: string | null;
  revokeActiveShareLink: (shareId: string) => void;
  revokingShareId: string | null;
  shareLoading: boolean;
  shareError: string | null;
  shareUrl: string | null;
  shareExpiresAt: string | null;
  copyShareLink: () => void;
  shareCopied: boolean;
  shareOnWhatsApp: () => void;
  onClose: () => void;
  isMobile: boolean;
}) {
  return (
    <div className="space-y-6">
      <Tabs value={shareTab} onValueChange={(value) => setShareTab(value as 'create' | 'active')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">Create link</TabsTrigger>
          <TabsTrigger value="active">Active links</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Expires in</label>
            <Select value={expiresInDays} onValueChange={setExpiresInDays}>
              <SelectTrigger className={cn("w-full h-11", isMobile ? "rounded-xl" : "")}>
                <SelectValue placeholder="Select expiry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Password (optional)</label>
            <Input
              type="password"
              placeholder="Add a password for this link"
              value={sharePassword}
              onChange={(e) => setSharePassword(e.target.value)}
              className={cn("h-11", isMobile ? "rounded-xl" : "")}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={createShareLink} disabled={shareLoading} className={cn("h-11 font-semibold", isMobile ? "rounded-xl w-full" : "w-fit")}>
              {shareLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4 mr-2" />
                  Create link
                </>
              )}
            </Button>
            {shareError && (
              <span className="text-sm text-destructive">{shareError}</span>
            )}
          </div>

          {shareUrl && (
            <div className={cn("space-y-4 rounded-2xl border border-border/40 bg-muted/20 p-4", isMobile ? "mt-2" : "")}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Share link</div>
                  {shareExpiresAt && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Expires {formatAppDateTime(new Date(shareExpiresAt))}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={copyShareLink} className="h-8 w-8 rounded-full">
                  {shareCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Input readOnly value={shareUrl} className={cn("h-10 text-xs bg-muted/30", isMobile ? "rounded-xl" : "")} />
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={shareOnWhatsApp} className={cn("flex-1 h-10 gap-2 font-medium text-xs", isMobile ? "rounded-xl" : "")}>
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500/20" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  className={cn("flex-1 h-10 gap-2 font-medium text-xs", isMobile ? "rounded-xl" : "")}
                  onClick={() => {
                    if (typeof window !== 'undefined') window.open(shareUrl, '_blank', 'noopener');
                  }}
                >
                  Open link
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Active document links</p>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshActiveShareLinks}
              disabled={activeShareLinksLoading}
            >
              {activeShareLinksLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>

          {activeShareLinksError ? (
            <p className="text-sm text-destructive">{activeShareLinksError}</p>
          ) : activeShareLinksLoading ? (
            <p className="text-sm text-muted-foreground">Loading active links...</p>
          ) : activeShareLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active links for this document.</p>
          ) : (
            <div className="space-y-2">
              {activeShareLinks.map((link) => (
                <div key={link.id} className="rounded-xl border border-border/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {link.requires_password && (
                          <Badge variant="outline" className="text-[10px]">Password</Badge>
                        )}
                        {link.allow_download && (
                          <Badge variant="outline" className="text-[10px]">Download</Badge>
                        )}
                        {link.allow_preview && (
                          <Badge variant="outline" className="text-[10px]">Preview</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Created {formatAppDateTime(link.created_at)}
                        {link.expires_at ? ` • Expires ${formatAppDateTime(link.expires_at)}` : ''}
                        {typeof link.views_count === 'number' ? ` • ${link.views_count} views` : ''}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revokeActiveShareLink(link.id)}
                      disabled={revokingShareId === link.id}
                    >
                      {revokingShareId === link.id ? 'Revoking...' : 'Revoke'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      {!isMobile && (
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl h-10 px-6">Done</Button>
        </div>
      )}
    </div>
  );
}

function ShareModal({
  open,
  onOpenChange,
  isMobile,
  ...props
}: any) {
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-[32px] px-6 pb-12 pt-6">
          <SheetHeader className="text-left">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted" />
            <SheetTitle className="text-2xl font-bold tracking-tight">Share document</SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Create and manage external links for this document.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-8">
            <ShareContent
              {...props}
              isMobile={true}
              onClose={() => onOpenChange(false)}
            />
          </div>
          <div className="mt-8">
            <Button className="w-full h-12 text-base font-bold rounded-2xl" variant="secondary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl p-8 border-border/40 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">Share document</DialogTitle>
        </DialogHeader>
        <ShareContent
          {...props}
          isMobile={false}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getDocumentById, removeDocument, setCurrentVersion, unlinkFromVersionGroup, refresh } = useDocuments();
  const { hasPermission, isLoading: authLoading, user } = useAuth();
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
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; title?: string } | null>(null);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareTab, setShareTab] = useState<'create' | 'active'>('create');
  const [sharePassword, setSharePassword] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [activeShareLinks, setActiveShareLinks] = useState<DocumentShareRow[]>([]);
  const [activeShareLinksLoading, setActiveShareLinksLoading] = useState(false);
  const [activeShareLinksError, setActiveShareLinksError] = useState<string | null>(null);
  const [revokingShareId, setRevokingShareId] = useState<string | null>(null);
  const [accessExplainOpen, setAccessExplainOpen] = useState(false);
  const [accessExplainLoading, setAccessExplainLoading] = useState(false);
  const [accessExplainError, setAccessExplainError] = useState<string | null>(null);
  const [accessExplainData, setAccessExplainData] = useState<any | null>(null);
  const [accessExplainPerm, setAccessExplainPerm] = useState('documents.read');
  const isMobile = useIsMobile();
  const [viewportReady, setViewportReady] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [isFullscreenPreviewOpen, setIsFullscreenPreviewOpen] = useState(false);

  useEffect(() => {
    setViewportReady(true);
  }, []);

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
  const [useHistoryBack, setUseHistoryBack] = useState(false);
  const [backLabel, setBackLabel] = useState('Back');
  const loadAttempted = useRef<Set<string>>(new Set());

  // Relationships state
  const [relationships, setRelationships] = useState<{
    linked: any[];
    versions: any[];
    incoming: any[];
    outgoing: any[];
  }>({ linked: [], versions: [], incoming: [], outgoing: [] });
  const [relLoading, setRelLoading] = useState(false);

  const normalizeDoc = useCallback((raw: any): StoredDocument => ({
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
    // Vespa status
    vespaSyncStatus: raw.vespaSyncStatus ?? raw.vespa_sync_status ?? null,
    vespaIndexedAt: raw.vespaIndexedAt ?? raw.vespa_indexed_at ?? null,
    // Document Type & Metadata (V2)
    docTypeKey: raw.docTypeKey ?? raw.doc_type_key ?? null,
    docTypeConfidence: raw.docTypeConfidence ?? raw.doc_type_confidence ?? null,
    extractedMetadata: raw.extractedMetadata ?? raw.extracted_metadata ?? null,
  }), []);

  // Load relationships
  const loadRelationships = useCallback(async () => {
    if (!params.id) return;
    try {
      setRelLoading(true);
      const { orgId } = getApiContext();
      const data = await apiFetch(`/orgs/${orgId}/documents/${params.id}/relationships`, { skipCache: true });
      setRelationships(data || { linked: [], versions: [], incoming: [], outgoing: [] });
    } catch (error) {
      console.error('Failed to load relationships:', error);
    } finally {
      setRelLoading(false);
    }
  }, [params.id]);

  const reloadDoc = useCallback(async () => {
    const { orgId } = getApiContext();
    if (!orgId || !params.id) return;
    try {
      const data: any = await apiFetch(`/orgs/${orgId}/documents/${params.id}`, { skipCache: true });
      setFetchedDoc(normalizeDoc(data));
    } catch (e) {
      console.warn('Failed to refresh document after version change', e);
    }
  }, [params.id, normalizeDoc]);

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
  }, [authLoading, doc, params.id, normalizeDoc]);

  // Set referrer on mount for smart back navigation
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setReferrer(document.referrer);
    }
  }, []);

  // Prefer history back when coming from within the app
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const origin = window.location.origin;
    const ref = referrer || '';
    const sameOrigin = ref ? ref.startsWith(origin) : false;
    const hasHistory = window.history.length > 1;
    setUseHistoryBack(hasHistory && (sameOrigin || !ref));
    if (sameOrigin) {
      const refPath = new URL(ref).pathname;
      if (refPath.startsWith('/audit')) {
        setBackLabel('Back to Activity');
      } else if (refPath.startsWith('/recycle-bin')) {
        setBackLabel('Back to Recycle Bin');
      } else if (refPath.startsWith('/documents')) {
        setBackLabel('Back to Documents');
      } else {
        setBackLabel('Back');
      }
    } else {
      setBackLabel('Back');
    }
  }, [referrer]);

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
      setShareTab('create');
      setSharePassword('');
      setExpiresInDays('7');
      setActiveShareLinks([]);
      setActiveShareLinksError(null);
      setRevokingShareId(null);
    }
  }, [shareOpen, doc?.id]);

  const loadAccessExplain = useCallback(async () => {
    if (!doc?.id) return;
    const { orgId } = getApiContext();
    if (!orgId) return;
    setAccessExplainLoading(true);
    setAccessExplainError(null);
    try {
      const data: any = await apiFetch(`/orgs/${orgId}/access/explain?docId=${doc.id}&permKey=${encodeURIComponent(accessExplainPerm)}`);
      setAccessExplainData(data);
    } catch (err: any) {
      setAccessExplainError(err?.message || 'Failed to load access explanation');
      setAccessExplainData(null);
    } finally {
      setAccessExplainLoading(false);
    }
  }, [doc?.id, accessExplainPerm]);

  useEffect(() => {
    if (accessExplainOpen) {
      void loadAccessExplain();
    }
  }, [accessExplainOpen, loadAccessExplain]);

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
              <Button variant="outline" onClick={() => (useHistoryBack ? router.back() : router.push('/documents'))}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {useHistoryBack ? backLabel : 'Back to Documents'}
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
            <Button variant="outline" onClick={() => (useHistoryBack ? router.back() : router.push('/documents'))}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {useHistoryBack ? backLabel : 'Back to Documents'}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!doc) return null;

  if (!viewportReady) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Preparing layout...</span>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Determine permissions
  const folderPath = doc.folderPath || (doc as any).folder_path || [];
  const myDeptIds = new Set((departments || []).map((d: any) => d.id));
  const docDeptId = (doc as any).departmentId || (doc as any).department_id || null;
  const departmentAccess = (doc as any).departmentAccess || null;
  const ownerDepartmentId = departmentAccess?.ownerDepartmentId || docDeptId || null;
  const departmentMetaMap = new Map<string, { id: string; name: string; color: string | null }>();
  (departments || []).forEach((dept: any) => {
    if (!dept?.id) return;
    departmentMetaMap.set(dept.id, {
      id: dept.id,
      name: dept.name || 'Unknown team',
      color: dept.color || null,
    });
  });
  if (Array.isArray(departmentAccess?.departments)) {
    for (const dept of departmentAccess.departments) {
      if (!dept?.id) continue;
      departmentMetaMap.set(dept.id, {
        id: dept.id,
        name: dept.name || departmentMetaMap.get(dept.id)?.name || 'Unknown team',
        color: dept.color ?? departmentMetaMap.get(dept.id)?.color ?? null,
      });
    }
  }
  const rawSharedDepartmentIds: string[] = Array.isArray(departmentAccess?.sharedDepartmentIds)
    ? departmentAccess.sharedDepartmentIds.map((deptId: any) => String(deptId)).filter(Boolean)
    : [];
  const sharedDepartmentIds = Array.from(new Set(rawSharedDepartmentIds)).filter((deptId) => deptId !== ownerDepartmentId);
  const getDepartmentLabel = (deptId: string) => departmentMetaMap.get(deptId)?.name || `Team ${String(deptId).slice(0, 8)}`;
  const deletedAt = doc.deletedAt || (doc as any).deleted_at || null;
  const isDeleted = Boolean(deletedAt);
  const deletedAtDate = deletedAt ? new Date(deletedAt) : null;
  const deletedAtLabel = deletedAtDate && !Number.isNaN(deletedAtDate.getTime())
    ? formatAppDateTime(deletedAtDate)
    : null;
  const createdBy = doc.createdBy || null;
  const updatedBy = doc.updatedBy || null;
  const isAdmin = hasPermission('org.manage_members');
  const canEdit = canUpdateDocuments && (isAdmin || (docDeptId && myDeptIds.has(docDeptId))) && !isDeleted;
  const canDelete = canDeleteDocuments && (isAdmin || (docDeptId && myDeptIds.has(docDeptId))) && !isDeleted;
  const canShare = canShareDocuments && !isDeleted;

  // Determine back navigation
  let backHref = '/documents';
  if (folderPath.length > 0) {
    backHref = `/documents?path=${encodeURIComponent(folderPath.join('/'))}`;
  }
  const fallbackBackLabel = folderPath.length > 0 ? 'Back to folder' : 'Back to Documents';
  const effectiveBackLabel = useHistoryBack ? backLabel : fallbackBackLabel;

  const handleBack = () => {
    if (useHistoryBack) {
      router.back();
      return;
    }
    router.push(backHref);
  };

  // Check permissions
  if (!canReadDocuments) {
    return (
      <AppLayout>
        <ViewAccessDenied />
      </AppLayout>
    );
  }

  const displaySummary = (doc.summary || extractionSummary || doc.description || '').trim();
  const showClassificationAndExtraction = false;

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

  const loadActiveShareLinks = async () => {
    if (!doc?.id) return;
    const { orgId } = getApiContext();
    if (!orgId) return;
    setActiveShareLinksLoading(true);
    setActiveShareLinksError(null);
    try {
      const rows = await apiFetch<DocumentShareRow[]>(`/orgs/${orgId}/documents/${doc.id}/shares`, { skipCache: true });
      const activeRows = Array.isArray(rows) ? rows.filter(isDocumentShareActive) : [];
      setActiveShareLinks(activeRows);
    } catch (error: any) {
      setActiveShareLinks([]);
      setActiveShareLinksError(error?.message || 'Failed to load active links');
    } finally {
      setActiveShareLinksLoading(false);
    }
  };

  const revokeActiveShareLink = async (shareId: string) => {
    if (!doc?.id || !shareId) return;
    const { orgId } = getApiContext();
    if (!orgId) return;
    setRevokingShareId(shareId);
    setActiveShareLinksError(null);
    try {
      await apiFetch(`/orgs/${orgId}/documents/${doc.id}/shares/${shareId}`, {
        method: 'DELETE',
      });
      await loadActiveShareLinks();
    } catch (error: any) {
      setActiveShareLinksError(error?.message || 'Failed to revoke link');
    } finally {
      setRevokingShareId(null);
    }
  };

  const openShareModal = () => {
    setShareTab('create');
    setShareOpen(true);
    void loadActiveShareLinks();
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
        allowDownload: true,
        allowPreview: true,
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
      setShareTab('active');
      void loadActiveShareLinks();
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
      <div className="min-h-screen bg-background/30 flex flex-col">
        {/* Mobile Floating Actions */}
        {isMobile && (
          <div className="fixed top-0 left-0 right-0 z-50 p-6 flex justify-between items-center pointer-events-none">
            <button
              onClick={handleBack}
              className="pointer-events-auto h-11 w-11 flex items-center justify-center rounded-full bg-background/90 backdrop-blur-xl border border-border/60 text-foreground shadow-xl active:scale-95 transition-all"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <DropdownMenu open={mobileActionsOpen} onOpenChange={setMobileActionsOpen}>
              <DropdownMenuTrigger asChild>
                <button className="pointer-events-auto h-11 w-11 flex items-center justify-center rounded-full bg-background/90 backdrop-blur-xl border border-border/60 text-foreground shadow-xl active:scale-95 transition-all">
                  <MoreHorizontal className="h-6 w-6" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 rounded-2xl p-2 shadow-2xl border-border/60 bg-popover/95 backdrop-blur-xl">
                {canEdit && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setMobileActionsOpen(false);
                      window.setTimeout(() => router.push(`/documents/${doc.id}/edit`), 0);
                    }}
                    className="rounded-xl h-11 focus:bg-accent"
                  >
                    <Pencil className="h-4 w-4 mr-3" />
                    Edit Document
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => {
                    setMobileActionsOpen(false);
                    window.setTimeout(() => { void downloadContent(); }, 0);
                  }}
                  className="rounded-xl h-11 focus:bg-accent"
                >
                  <Download className="h-4 w-4 mr-3" />
                  Download File
                </DropdownMenuItem>
                {canShare && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setMobileActionsOpen(false);
                      window.setTimeout(() => openShareModal(), 0);
                    }}
                    className="rounded-xl h-11 focus:bg-accent"
                  >
                    <Share2 className="h-4 w-4 mr-3" />
                    Share Link
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => {
                    setMobileActionsOpen(false);
                    window.setTimeout(() => setAccessExplainOpen(true), 0);
                  }}
                  className="rounded-xl h-11 focus:bg-accent"
                >
                  <Info className="h-4 w-4 mr-3" />
                  Access Info
                </DropdownMenuItem>
                {canDelete && (
                  <>
                    <div className="my-1.5 h-px bg-border/60" />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-xl h-11"
                      onSelect={() => {
                        setMobileActionsOpen(false);
                        window.setTimeout(() => setConfirmDeleteOpen(true), 0);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-3" />
                      Delete Document
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Desktop Header */}
        {!isMobile && (
          <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/40 shrink-0">
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
                          onClick={handleBack}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {effectiveBackLabel}
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
                      {doc.vespaSyncStatus && (
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] uppercase tracking-wider font-bold h-5 px-1.5 gap-1 border-dashed",
                                  doc.vespaSyncStatus === 'synced' ? "border-blue-400/50 text-blue-600 bg-blue-500/5" :
                                    doc.vespaSyncStatus === 'syncing' ? "border-amber-400/50 text-amber-600 bg-amber-500/5" :
                                      doc.vespaSyncStatus === 'failed' ? "border-red-400/50 text-red-600 bg-red-500/5" :
                                        "border-muted text-muted-foreground"
                                )}
                              >
                                <Zap className={cn("h-2.5 w-2.5", doc.vespaSyncStatus === 'syncing' && "animate-pulse fill-amber-500")} />
                                {doc.vespaSyncStatus === 'synced' ? 'Chat ready' :
                                  doc.vespaSyncStatus === 'syncing' ? 'Chat is getting ready' :
                                    doc.vespaSyncStatus === 'failed' ? 'Chat failed' :
                                      'Chat status'}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                              {doc.vespaSyncStatus === 'synced' ? 'Chat is ready for this document.' :
                                doc.vespaSyncStatus === 'syncing' ? 'Chat is getting ready for this document.' :
                                  doc.vespaSyncStatus === 'failed' ? 'Chat failed for this document.' :
                                    'Chat status is currently unavailable.'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                            onClick={openShareModal}
                          >
                            <Share2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Share</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setAccessExplainOpen(true)}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">Explain access</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

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
        )}

        {isDeleted && (
          <div className="px-4 sm:px-6 py-3 border-b border-border/40 bg-amber-50/60 dark:bg-amber-950/20">
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

        {/* Content Structure */}
        {isMobile ? (
          <main className="flex-1 flex flex-col min-h-0 bg-background pb-20">
            {/* Top Preview - Extra large for visibility */}
            <div className="w-full bg-muted/20 p-4 pt-20">
              <div className="relative group rounded-2xl overflow-hidden shadow-2xl border border-border/40 bg-card h-[42svh] min-h-[260px] max-h-[420px]">
                <FilePreview
                  documentId={doc.id}
                  mimeType={doc.mimeType}
                  filename={doc.filename}
                  extractedContent={doc.content || ocrText || undefined}
                  isMobile={true}
                  embedded={true}
                />

                {/* Fullscreen Overlay Button */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 pointer-events-none">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="pointer-events-auto rounded-full bg-white text-black hover:bg-white/90 font-bold px-5 h-9 shadow-xl"
                    onClick={() => setIsFullscreenPreviewOpen(true)}
                  >
                    <Maximize2 className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                </div>

                {/* Mobile Specific - Always show preview button overlay at bottom right for better UX */}
                <div className="absolute bottom-4 right-4">
                  <Button
                    size="icon"
                    className="h-10 w-10 rounded-full bg-orange-500 hover:bg-orange-600 text-white shadow-lg active:scale-95 transition-all"
                    onClick={() => setIsFullscreenPreviewOpen(true)}
                  >
                    <Maximize2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Document Identity Area */}
            <div className="px-5 pt-8 pb-4">
              <h1 className="text-2xl font-bold text-foreground tracking-tight leading-tight">
                {doc.title || doc.name}
              </h1>
              <div className="flex items-center gap-2 mt-2 text-muted-foreground font-medium text-[13px]">
                <span className="uppercase tracking-wide">
                  {(doc.mimeType?.split('/')[1] || 'DOC').toUpperCase()}
                </span>
                <span>·</span>
                <span>{formatSize(doc.fileSizeBytes)}</span>
                <span>·</span>
                <span>Modified {formatDateFns(doc.uploadedAt, 'MMM d, yyyy')}</span>
              </div>
            </div>

            {/* Tabs System */}
            <Tabs defaultValue="overview" className="flex-1 flex flex-col">
              <div className="sticky top-0 z-20 bg-background px-2 border-b border-border/40">
                <TabsList className="w-full h-12 bg-transparent justify-start gap-6 p-0 px-3 overflow-x-auto no-scrollbar">
                  <TabsTrigger
                    value="overview"
                    className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-3 text-[14px] font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground transition-all"
                  >
                    Overview
                  </TabsTrigger>
                  <TabsTrigger
                    value="info"
                    className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-3 text-[14px] font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground transition-all"
                  >
                    File Info
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-3 text-[14px] font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground transition-all"
                  >
                    History
                  </TabsTrigger>
                  <TabsTrigger
                    value="ocr"
                    className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-3 text-[14px] font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground transition-all"
                  >
                    OCR
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                {/* Overview TabContent */}
                <TabsContent value="overview" className="mt-0 space-y-4 focus-visible:outline-none focus:outline-none">
                  <Section icon={MapPin} title="Location" variant="default" className="bg-card/50 border-border/40 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                        <FolderOpen className="h-5 w-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">Root</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {folderPath.length > 0 ? (
                            folderPath.map((seg: string, i: number) => (
                              <React.Fragment key={i}>
                                <span className="text-foreground text-sm font-medium">{seg}</span>
                                {i < folderPath.length - 1 && <span className="text-muted-foreground/70">/</span>}
                              </React.Fragment>
                            ))
                          ) : (
                            <span className="text-foreground text-sm font-medium">Root</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Section>

                  {displaySummary && (
                    <Section icon={Sparkles} title="AI Summary" variant="accent" className="bg-card/50 border-border/40 rounded-2xl">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {displaySummary}
                      </p>
                    </Section>
                  )}

                  <Section icon={Tag} title="Metadata & Tags" className="bg-card/50 border-border/40 rounded-2xl">
                    <div className="space-y-6">
                      {doc.aiPurpose && (
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Purpose</div>
                          <p className="text-sm text-foreground">{doc.aiPurpose}</p>
                        </div>
                      )}
                      {((doc.aiKeywords && doc.aiKeywords.length > 0) || (doc.tags && doc.tags.length > 0)) && (
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Keywords & Tags</div>
                          <div className="flex flex-wrap gap-2">
                            {doc.aiKeywords?.map((k: string) => (
                              <Badge key={k} variant="outline" className="bg-muted/30 border-border/60 text-foreground font-normal py-1 px-3 rounded-lg">{k}</Badge>
                            ))}
                            {doc.tags?.map((k: string) => (
                              <Badge key={k} variant="secondary" className="bg-orange-500/10 border-orange-500/20 text-orange-500 font-normal py-1 px-3 rounded-lg">{k}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Section>
                </TabsContent>

                {/* File Info TabContent */}
                <TabsContent value="info" className="mt-0 space-y-4 focus-visible:outline-none focus:outline-none">
                  <Section icon={Info} title="Details" className="bg-card/50 border-border/40 rounded-2xl">
                    <div className="grid grid-cols-1 gap-5">
                      <DetailRow icon={User} label="Sender" value={doc.sender || 'Unknown'} className="border-b border-border/30 pb-4" />
                      <DetailRow icon={UserCheck} label="Receiver" value={doc.receiver || '—'} className="border-b border-border/30 pb-4" />
                      <DetailRow icon={MessageSquare} label="Subject" value={doc.subject || '—'} />
                    </div>
                  </Section>

                  {showClassificationAndExtraction && (
                    <Section icon={FileType} title="Classification" className="bg-card/50 border-border/40 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">Document Type</span>
                          <span className="text-foreground text-lg font-bold mt-1">{(doc.docTypeKey || 'Other').replace(/_/g, ' ')}</span>
                        </div>
                        {doc.docTypeConfidence && (
                          <div className="h-12 w-12 rounded-full border-4 border-orange-500/20 flex items-center justify-center relative">
                            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                              <circle
                                cx="28" cy="28" r="24"
                                fill="none" stroke="currentColor" strokeWidth="4"
                                className="text-orange-500"
                                strokeDasharray={`${doc.docTypeConfidence * 150} 150`}
                              />
                            </svg>
                            <span className="text-[10px] font-bold text-foreground">{Math.round(doc.docTypeConfidence * 100)}%</span>
                          </div>
                        )}
                      </div>
                    </Section>
                  )}

                  <Section icon={FileTextIcon} title="Properties" className="bg-card/50 border-border/40 rounded-2xl">
                    <div className="space-y-4">
                      <DetailRow label="Filename" value={doc.filename} className="border-b border-border/30 pb-4" />
                      <DetailRow label="Size" value={formatSize(doc.fileSizeBytes)} className="border-b border-border/30 pb-4" />
                      <DetailRow label="Added" value={formatAppDateTime(doc.uploadedAt)} />
                    </div>
                  </Section>
                </TabsContent>

                {/* History TabContent */}
                <TabsContent value="history" className="mt-0 focus-visible:outline-none focus:outline-none">
                  <Section icon={GitBranch} title="Version History" className="bg-card/50 border-border/40 rounded-2xl">
                    <div className="space-y-4">
                      {versions.map((v: any) => (
                        <div key={v.id} className={cn(
                          "flex items-center justify-between p-4 rounded-xl border",
                          v.id === doc.id ? "bg-orange-500/5 border-orange-500/20" : "bg-muted/20 border-border/40"
                        )}>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-10 w-10 flex items-center justify-center rounded-lg font-bold text-sm",
                              v.id === doc.id ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"
                            )}>
                              v{v.versionNumber}
                            </div>
                            <div className="flex flex-col">
                              <span className={cn("text-sm font-bold", v.id === doc.id ? "text-foreground" : "text-foreground")}>{v.title || 'Untitled'}</span>
                              <span className="text-[11px] text-muted-foreground mt-0.5">{formatAppDate(v.uploadedAt)}</span>
                            </div>
                          </div>
                          {v.id !== doc.id && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-orange-500 hover:bg-orange-500/10" asChild>
                              <Link href={`/documents/${v.id}`}>View</Link>
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                </TabsContent>

                {/* OCR TabContent */}
                <TabsContent value="ocr" className="mt-0 focus-visible:outline-none focus:outline-none">
                  <div className="bg-card/50 border border-border/40 rounded-2xl p-4 overflow-hidden">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/30">
                      <div className="flex items-center gap-2">
                        <FileTextIcon className="h-4 w-4 text-orange-500" />
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Extracted Text Content</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          const content = doc.content || ocrText;
                          if (content) {
                            navigator.clipboard.writeText(content);
                            toast({ title: 'Copied to clipboard' });
                          }
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto text-sm text-foreground font-mono whitespace-pre-wrap leading-relaxed select-text no-scrollbar">
                      {doc.content || ocrText || 'No text extracted for this document.'}
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </main>
        ) : (
          <main className={cn(
            "flex-1 flex flex-col min-h-0",
            "p-6"
          )}>
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
              {/* Left column - 60% */}
              <div className="xl:col-span-3 space-y-6">
                {/* Location Section */}
                <Section icon={MapPin} title="Location" isMobile={isMobile}>
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
                <Section icon={Info} title="Details" isMobile={isMobile}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DetailRow icon={MessageSquare} label="Subject" value={doc.subject} />
                    <DetailRow icon={Calendar} label="Uploaded" value={formatAppDateTime(doc.uploadedAt)} />
                    <DetailRow icon={User} label="Sender" value={doc.sender || 'N/A'} />
                    <DetailRow icon={UserCheck} label="Receiver" value={doc.receiver} />
                  </div>
                </Section>

                {/* Classification & Extraction Section */}
                {showClassificationAndExtraction && (doc.docTypeKey || (doc.extractedMetadata && Object.keys(doc.extractedMetadata).length > 0)) && (
                  <Section icon={FileType} title="Classification & Extraction" variant="default" isMobile={isMobile}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                      {doc.docTypeKey && (
                        <DetailRow
                          label="Type"
                          value={
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary uppercase text-[10px] tracking-wider font-bold">
                                {doc.docTypeKey.replace(/_/g, ' ')}
                              </Badge>
                              {doc.docTypeConfidence && (
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  {Math.round(doc.docTypeConfidence * 100)}%
                                </span>
                              )}
                            </div>
                          }
                        />
                      )}
                      {doc.extractedMetadata && Object.entries(doc.extractedMetadata).map(([key, value]) => {
                        // Skip internal processing markers
                        if (key.startsWith('tabular_') || key.startsWith('csv_')) return null;

                        return (
                          <DetailRow
                            key={key}
                            label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            value={
                              typeof value === 'object'
                                ? (value === null ? 'N/A' : JSON.stringify(value))
                                : String(value)
                            }
                          />
                        );
                      })}
                    </div>
                  </Section>
                )}

                {/* AI Summary Section */}
                {displaySummary && (
                  <Section icon={Sparkles} title="AI Summary" variant="accent" isMobile={isMobile}>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {displaySummary}
                    </p>
                  </Section>
                )}

                {/* Metadata & Tags Section */}
                <Section icon={Tag} title="Metadata & Tags" isMobile={isMobile}>
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
                  isMobile={isMobile}
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
                        Upload new version (becomes current)
                      </Link>
                    </Button>
                  }
                >
                  <div className="text-xs text-muted-foreground mb-4">
                    Current marks the primary version. Ordered by version number (highest first). Use the arrows to change version numbers.
                  </div>
                  {relLoading ? (
                    <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading versions...</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className={cn(
                        "rounded-lg border border-border/40 bg-background/50 divide-y divide-border/30 overflow-hidden",
                        isMobile && "overflow-x-auto"
                      )}>

                        {versions.map((v: any) => {
                          const isActive = v.id === doc.id;
                          const fromNum = Number(v.versionNumber);
                          // List is sorted by version number desc, so "move up" means increase version number.
                          const canMoveUp = Number.isFinite(fromNum) && fromNum < maxVersion;
                          const canMoveDown = Number.isFinite(fromNum) && fromNum > 1;
                          const upVersion = canMoveUp ? fromNum + 1 : null;
                          const downVersion = canMoveDown ? fromNum - 1 : null;
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
                                      <span className="text-xs text-muted-foreground">Viewing</span>
                                    )}
                                  </div>
                                  {v.uploadedAt && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatAppDateTime(v.uploadedAt)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className={cn(
                                "flex items-center shrink-0",
                                isMobile ? "gap-0.5" : "gap-1"
                              )}>
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
                                        disabled={!canMoveUp}
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
                                            await reloadDoc();
                                          } catch (e) { console.error(e); }
                                        }}
                                      >
                                        <ArrowUp className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      {canMoveUp ? `Move up to v${upVersion}` : 'Move up'}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>

                                <TooltipProvider delayDuration={300}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                        disabled={!canMoveDown}
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
                                            await reloadDoc();
                                          } catch (e) { console.error(e); }
                                        }}
                                      >
                                        <ArrowDown className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      {canMoveDown ? `Move down to v${downVersion}` : 'Move down'}
                                    </TooltipContent>
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
                                              await reloadDoc();
                                            } catch (e) { console.error(e); }
                                          }}
                                        >
                                          <Check className="h-3 w-3 mr-1" />
                                          Set current
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
                                            setUnlinkTarget({ id: v.id, title: v.title || 'Untitled' });
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
                      {versions.length <= 1 && (
                        <div className="text-xs text-muted-foreground">
                          No other versions yet. Upload a new version to create a chain.
                        </div>
                      )}
                    </div>
                  )}
                </Section>

                {/* File Info Section */}
                <Section icon={FileTextIcon} title="File Info" isMobile={isMobile}>
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
                    <DetailRow
                      icon={MapPin}
                      label="Team Access"
                      className="sm:col-span-2"
                      value={(
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ownerDepartmentId && (
                            <Badge variant="outline" className="text-xs border-amber-300/50 bg-amber-500/10 text-amber-700 gap-1">
                              <Crown className="h-3 w-3" />
                              {getDepartmentLabel(ownerDepartmentId)}
                            </Badge>
                          )}
                          {sharedDepartmentIds.map((deptId) => (
                            <Badge key={deptId} variant="outline" className="text-xs gap-1">
                              <Share2 className="h-3 w-3" />
                              {getDepartmentLabel(deptId)}
                            </Badge>
                          ))}
                          {!ownerDepartmentId && sharedDepartmentIds.length === 0 && (
                            <span className="text-muted-foreground">No team access data</span>
                          )}
                        </div>
                      )}
                    />
                  </div>
                </Section>
              </div>

              {/* Right column - File Preview - 40% */}
              <div className={cn(
                "xl:col-span-2",
                !isMobile && "xl:sticky xl:top-24"
              )}>
                <FilePreview
                  documentId={doc.id}
                  mimeType={doc.mimeType}
                  filename={doc.filename}
                  extractedContent={doc.content || ocrText || undefined}
                  isMobile={isMobile}
                />
              </div>
            </div>
          </main>
        )}
      </div>

      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        isMobile={isMobile}
        expiresInDays={expiresInDays}
        setExpiresInDays={setExpiresInDays}
        shareTab={shareTab}
        setShareTab={setShareTab}
        sharePassword={sharePassword}
        setSharePassword={setSharePassword}
        createShareLink={createShareLink}
        refreshActiveShareLinks={loadActiveShareLinks}
        activeShareLinks={activeShareLinks}
        activeShareLinksLoading={activeShareLinksLoading}
        activeShareLinksError={activeShareLinksError}
        revokeActiveShareLink={revokeActiveShareLink}
        revokingShareId={revokingShareId}
        shareLoading={shareLoading}
        shareError={shareError}
        shareUrl={shareUrl}
        shareExpiresAt={shareExpiresAt}
        copyShareLink={copyShareLink}
        shareCopied={shareCopied}
        shareOnWhatsApp={shareOnWhatsApp}
      />


      <Dialog open={accessExplainOpen} onOpenChange={setAccessExplainOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Access explanation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Permission</label>
              <Select value={accessExplainPerm} onValueChange={setAccessExplainPerm}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select permission" />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_EXPLAIN_PERMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {accessExplainLoading && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading access explanation...
              </div>
            )}
            {accessExplainError && (
              <div className="text-sm text-destructive">{accessExplainError}</div>
            )}

            {accessExplainData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
                  <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">Decision</div>
                  <div className={`text-sm font-semibold ${accessExplainData.allowed ? 'text-emerald-600' : 'text-red-500'}`}>
                    {accessExplainData.allowed ? 'Allowed' : 'Denied'}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {ACCESS_REASON_LABELS[accessExplainData.reason] || accessExplainData.reason || 'Unknown'}
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
                  <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">Role & Team</div>
                  <div className="text-sm font-medium">
                    {formatRoleLabel(accessExplainData.role) || '—'}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    Team member: {accessExplainData.departmentAccess?.isMember ? 'Yes' : 'No'}
                    {accessExplainData.departmentAccess?.isLead ? ' · Lead' : ''}
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
                  <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">Overrides</div>
                  <div className="text-[12px] text-muted-foreground">
                    Org override: {accessExplainData.overrides?.org?.active ? 'Active' : 'None'}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    Team override: {accessExplainData.overrides?.department?.active ? 'Active' : 'None'}
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
                  <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">Share</div>
                  {accessExplainData.share ? (
                    <>
                      <div className="text-[12px] text-muted-foreground">
                        Type: {accessExplainData.share.type}
                      </div>
                      {accessExplainData.share.grant?.expires_at && (
                        <div className="text-[12px] text-muted-foreground">
                          Expires {formatAppDateTime(accessExplainData.share.grant.expires_at)}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[12px] text-muted-foreground">No share grant</div>
                  )}
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1 md:col-span-2">
                  <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">Scope</div>
                  <div className="text-[12px] text-muted-foreground">
                    Department: {accessExplainData.scope?.departmentId || '—'}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    Folder path: {(accessExplainData.scope?.folderPath || []).join(' / ') || '—'}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setAccessExplainOpen(false)}>Close</Button>
            <Button onClick={loadAccessExplain} disabled={accessExplainLoading}>Refresh</Button>
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

      {/* Remove From Version Chain Dialog */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(open) => { if (!open) setUnlinkTarget(null); }}>
        <AlertDialogContent className="max-w-md border-border/40">
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <AlertDialogTitle className="text-base font-semibold text-foreground">
                  Remove from version chain?
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
                  This will unlink “{unlinkTarget?.title || 'Untitled'}” from the version chain. The document will still exist.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
            <AlertDialogCancel className="text-sm" disabled={unlinkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!unlinkTarget) return;
                try {
                  setUnlinkLoading(true);
                  const { orgId } = getApiContext();
                  await apiFetch(`/orgs/${orgId}/documents/${unlinkTarget.id}/unlink`, { method: 'POST' });
                  await refresh();
                  await loadRelationships();
                  await reloadDoc();
                  setUnlinkTarget(null);
                } catch (e) {
                  console.error(e);
                  toast({
                    title: 'Unlink failed',
                    description: 'Could not remove this document from the chain.',
                    variant: 'destructive',
                  });
                } finally {
                  setUnlinkLoading(false);
                }
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm"
              disabled={unlinkLoading}
            >
              {unlinkLoading ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fullscreen Preview Dialog */}
      <Dialog open={isFullscreenPreviewOpen} onOpenChange={setIsFullscreenPreviewOpen}>
        <DialogContent className="max-w-none w-screen h-[100dvh] p-0 border-none bg-black/95 gap-0">
          <DialogTitle className="sr-only">Document Preview</DialogTitle>
          <DialogDescription className="sr-only">Fullscreen view of {doc.title || doc.filename || 'the document'}</DialogDescription>
          <div className="relative w-full h-full flex flex-col">
            <div className="absolute top-6 left-6 z-50">
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md text-white border border-white/10 hover:bg-white/20 transition-all"
                onClick={() => setIsFullscreenPreviewOpen(false)}
              >
                <X className="h-6 w-6" />
              </Button>
            </div>
            <div className="flex-1 w-full h-full">
              <FilePreview
                documentId={doc.id}
                mimeType={doc.mimeType}
                filename={doc.filename}
                extractedContent={doc.content || ocrText || undefined}
                isMobile={true}
                embedded={true}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
