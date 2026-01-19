"use client";

import * as React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useDocuments } from '@/hooks/use-documents';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select';
import { formatAppDateTime } from '@/lib/utils';
import { useCategories } from '@/hooks/use-categories';
import {
  FileText,
  User,
  UserCheck,
  Calendar,
  Tag,
  MessageSquare,
  Hash,
  Bookmark,
  FolderOpen,
  Link as LinkIcon,
  ArrowUp,
  ArrowDown,
  Crown,
  Edit3,
  ChevronLeft,
  Save,
  Trash2,
  X,
  Loader2,
  AlertTriangle,
  GitBranch,
  Plus,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { FolderPickerDialog } from '@/components/folder-picker-dialog';
import { useFolders as useFolderExplorer } from '@/hooks/use-folders';
import { VersionLinkPickerDialog } from '@/components/version-link-picker-dialog';
import { useToast } from '@/hooks/use-toast';
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
import { cn } from '@/lib/utils';

// Linear-style section component
function Section({
  icon: Icon,
  title,
  description,
  children,
  className,
  variant = 'default',
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'accent';
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-5",
        variant === 'default'
          ? "bg-card/50 border-border/40"
          : "bg-gradient-to-br from-primary/5 via-primary/8 to-primary/5 border-primary/20",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
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
        </div>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

// Linear-style form field component
function FormField({
  icon: Icon,
  label,
  children,
  hint,
  className,
}: {
  icon?: React.ElementType;
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-muted-foreground/70">{hint}</p>
      )}
    </div>
  );
}

// Linear-style skeleton for loading state
function FieldSkeleton() {
  return (
    <div className="space-y-1.5 animate-pulse">
      <div className="h-3 w-16 bg-muted/40 rounded" />
      <div className="h-9 w-full bg-muted/40 rounded-md" />
    </div>
  );
}

export default function EditDocumentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getDocumentById, updateDocument, removeDocument, createFolder, documents, folders, refresh, loadAllDocuments, hasLoadedAll } = useDocuments();
  const { categories } = useCategories();
  const doc = getDocumentById(params.id);
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const { load: loadFolderChildren } = useFolderExplorer();
  const [folderCommandOpen, setFolderCommandOpen] = React.useState(false);
  const [addToChainOpen, setAddToChainOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);

  const [form, setForm] = React.useState({
    title: doc?.title || '',
    filename: doc?.filename || doc?.name || '',
    subject: doc?.subject || '',
    sender: doc?.sender || '',
    receiver: doc?.receiver || '',
    documentDate: (doc as any)?.documentDate || '',
    documentType: (doc as any)?.documentType || (doc as any)?.type || '',
    category: (doc as any)?.category || '',
    keywords: ((doc as any)?.keywords || []).join(', '),
    tags: ((doc as any)?.tags || []).join(', '),
    description: (doc as any)?.description || '',
    folderPath: ((doc as any)?.folderPath || []).join('/'),
  });
  const [relationships, setRelationships] = React.useState<{ linked: any[]; incoming: any[]; outgoing: any[]; versions: any[] }>({ linked: [], incoming: [], outgoing: [], versions: [] });
  const [relLoading, setRelLoading] = React.useState(false);

  const loadRelationships = React.useCallback(async () => {
    if (!doc) return;
    try {
      setRelLoading(true);
      const { orgId } = getApiContext();
      const data = await apiFetch(`/orgs/${orgId}/documents/${doc.id}/relationships`);
      setRelationships(data || { linked: [], incoming: [], outgoing: [], versions: [] });
    } catch (e) {
      console.error('Failed to load relationships in edit page:', e);
    } finally {
      setRelLoading(false);
    }
  }, [doc?.id]);

  React.useEffect(() => { loadRelationships(); }, [loadRelationships]);

  // Keep form in sync when doc loads/changes (prevents empty initial state when doc arrives async)
  React.useEffect(() => {
    if (!doc) return;
    setForm({
      title: doc?.title || '',
      filename: doc?.filename || doc?.name || '',
      subject: doc?.subject || '',
      sender: doc?.sender || '',
      receiver: doc?.receiver || '',
      documentDate: (doc as any)?.documentDate || '',
      documentType: (doc as any)?.documentType || (doc as any)?.type || '',
      category: (doc as any)?.category || '',
      keywords: ((doc as any)?.keywords || []).join(', '),
      tags: ((doc as any)?.tags || []).join(', '),
      description: (doc as any)?.description || '',
      folderPath: (((doc as any)?.folderPath || []) as string[]).join('/'),
    });
    setHasChanges(false);
  }, [doc?.id]);

  // Track changes
  const updateForm = (updates: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  // Ensure we can search the full org when adding to chain
  React.useEffect(() => {
    if (!addToChainOpen) return;
    if (hasLoadedAll) return;
    void loadAllDocuments();
  }, [addToChainOpen, hasLoadedAll, loadAllDocuments]);

  const addDocToThisChain = React.useCallback(async (draftId: string) => {
    if (!doc?.id) return;
    if (draftId === doc.id) {
      toast({ title: 'Pick a different document', description: "You can't add a document as a version of itself.", variant: 'destructive' });
      return;
    }
    try {
      const currentHeadId =
        (Array.isArray(relationships.versions) ? relationships.versions : []).find((v: any) => v?.isCurrentVersion)?.id
        || ((doc as any)?.isCurrentVersion ? doc.id : doc.id);

      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${currentHeadId}/version`, {
        method: 'POST',
        body: { draftId },
      });
      toast({ title: 'Added to chain', description: 'Document added as the next version (and set as current).' });
      setAddToChainOpen(false);
      await refresh();
      await loadRelationships();
    } catch (e: any) {
      console.error('Failed to add doc to chain:', e);
      toast({
        title: 'Add to chain failed',
        description: e?.message || 'Could not add document to the version chain.',
        variant: 'destructive',
      });
    }
  }, [doc?.id, relationships.versions, refresh, loadRelationships, toast]);

  const versionChainIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (doc?.id) ids.add(doc.id);
    const raw = Array.isArray(relationships.versions) ? relationships.versions : [];
    for (const v of raw) {
      if (v?.id) ids.add(String(v.id));
    }
    return ids;
  }, [doc?.id, relationships.versions]);

  const onSave = async () => {
    setSaving(true);
    // ensure new folders exist
    const newPathArr = form.folderPath.split('/').filter(Boolean);
    for (let i = 0; i < newPathArr.length; i++) {
      const slice = newPathArr.slice(0, i + 1);
      const parent = slice.slice(0, -1);
      const name = slice[slice.length - 1];
      createFolder(parent, name);
    }

    if (!doc) { setSaving(false); return; }
    updateDocument(doc.id, {
      title: form.title,
      filename: form.filename,
      subject: form.subject,
      sender: form.sender,
      receiver: form.receiver,
      documentDate: form.documentDate,
      documentType: form.documentType || (doc as any).documentType,
      category: form.category,
      keywords: form.keywords.split(',').map((s: string) => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map((s: string) => s.trim()).filter(Boolean),
      description: form.description,
      folderPath: newPathArr,
    });
    toast({ title: 'Document updated', description: 'Your changes have been saved.' });
    setSaving(false);
    router.push(`/documents/${doc.id}`);
  };

  const onDelete = async () => {
    if (!doc) return;
    removeDocument(doc.id);
    toast({ title: 'Document deleted', description: 'The document has been moved to the recycle bin.' });
    router.push('/documents');
  };

  const backHref = `/documents/${doc?.id ?? ''}`;

  // Version chain data
  const versions = React.useMemo(() => {
    const rawVersions = Array.isArray(relationships.versions) ? relationships.versions : [];
    const combined: any[] = [];
    if (doc?.id) {
      combined.push({
        id: doc.id,
        title: doc.title || doc.filename || doc.name || 'Untitled',
        versionNumber: (doc as any).versionNumber || 1,
        isCurrentVersion: (doc as any).isCurrentVersion || false,
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
                      Back to document
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Edit3 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">Edit Document</h1>
                  <p className="text-sm text-muted-foreground truncate max-w-[300px] sm:max-w-[400px]">
                    {doc?.title || doc?.filename || doc?.name || 'Loading...'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {hasChanges && (
                  <Badge variant="outline" className="text-xs border-amber-200/50 text-amber-600 bg-amber-500/10">
                    Unsaved changes
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(backHref)}
                  className="h-8 gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cancel</span>
                </Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={saving || !doc}
                  className="h-8 gap-1.5 text-sm"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="hidden sm:inline">Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Save</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-6 py-6">
          {!doc ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
                <FileText className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">Document not found</h3>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                The document you're looking for doesn't exist or has been deleted.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => router.push('/documents')}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Documents
              </Button>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Row 1: Basics & People */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Basics Section */}
                <Section icon={FileText} title="Basics">
                  <FormField icon={FileText} label="Title">
                    <Input
                      value={form.title}
                      onChange={(e) => updateForm({ title: e.target.value })}
                      placeholder="Document title"
                      className="h-9 bg-background/50 border-border/50 focus:border-primary/50"
                    />
                  </FormField>

                  <FormField icon={FileText} label="Filename">
                    <Input
                      value={form.filename}
                      onChange={(e) => updateForm({ filename: e.target.value })}
                      placeholder="original-filename.pdf"
                      className="h-9 bg-background/50 border-border/50 focus:border-primary/50"
                    />
                  </FormField>

                  <FormField icon={FolderOpen} label="Folder" hint="Use Browse for navigation, or type a path like Finance/2025/Q1">
                    <div className="flex items-center gap-2">
                      <Input
                        value={form.folderPath}
                        onChange={(e) => updateForm({ folderPath: e.target.value })}
                        placeholder="Root (no folder)"
                        className="h-9 bg-background/50 border-border/50 focus:border-primary/50"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFolderCommandOpen(true)}
                        className="h-9 px-3 shrink-0"
                      >
                        <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                        Browse
                      </Button>
                    </div>
                  </FormField>
                </Section>

                {/* People & Dates Section */}
                <Section icon={User} title="People & Dates">
                  <FormField icon={MessageSquare} label="Subject">
                    <Input
                      value={form.subject}
                      onChange={(e) => updateForm({ subject: e.target.value })}
                      placeholder="Document subject"
                      className="h-9 bg-background/50 border-border/50 focus:border-primary/50"
                    />
                  </FormField>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField icon={User} label="Sender">
                      <Input
                        value={form.sender}
                        onChange={(e) => updateForm({ sender: e.target.value })}
                        placeholder="From..."
                        className="h-9 bg-background/50 border-border/50 focus:border-primary/50"
                      />
                    </FormField>

                    <FormField icon={UserCheck} label="Receiver">
                      <Input
                        value={form.receiver}
                        onChange={(e) => updateForm({ receiver: e.target.value })}
                        placeholder="To..."
                        className="h-9 bg-background/50 border-border/50 focus:border-primary/50"
                      />
                    </FormField>
                  </div>

                  <FormField icon={Calendar} label="Document Date">
                    <Input
                      value={form.documentDate}
                      onChange={(e) => updateForm({ documentDate: e.target.value })}
                      placeholder="YYYY-MM-DD"
                      className="h-9 bg-background/50 border-border/50 focus:border-primary/50"
                    />
                  </FormField>
                </Section>
              </div>

              {/* Row 2: Classification & AI Summary */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Classification Section */}
                <Section icon={Tag} title="Classification">
                  <FormField icon={Tag} label="Document Type">
                    <Input
                      value={form.documentType}
                      onChange={(e) => updateForm({ documentType: e.target.value })}
                      placeholder="Invoice, Contract, Memo..."
                      className="h-9 bg-background/50 border-border/50 focus:border-primary/50"
                    />
                  </FormField>

                  <FormField icon={Bookmark} label="Category">
                    <UiSelect value={form.category || 'General'} onValueChange={(value) => updateForm({ category: value })}>
                      <UiSelectTrigger className="h-9 bg-background/50 border-border/50">
                        <UiSelectValue placeholder="Select category..." />
                      </UiSelectTrigger>
                      <UiSelectContent>
                        {categories.map((category) => (
                          <UiSelectItem key={category} value={category}>
                            {category}
                          </UiSelectItem>
                        ))}
                      </UiSelectContent>
                    </UiSelect>
                  </FormField>

                  <FormField icon={Hash} label="Keywords" hint="Comma separated">
                    <Input
                      value={form.keywords}
                      onChange={(e) => updateForm({ keywords: e.target.value })}
                      placeholder="finance, q1, audit"
                      className="h-9 bg-background/50 border-border/50 focus:border-primary/50"
                    />
                  </FormField>

                  <FormField icon={Tag} label="Tags" hint="Comma separated">
                    <Input
                      value={form.tags}
                      onChange={(e) => updateForm({ tags: e.target.value })}
                      placeholder="urgent, vendor, internal"
                      className="h-9 bg-background/50 border-border/50 focus:border-primary/50"
                    />
                  </FormField>
                </Section>

                {/* AI Summary Section */}
                <Section icon={Sparkles} title="AI Summary" description="~15 lines recommended" variant="accent">
                  <Textarea
                    rows={12}
                    value={form.description}
                    onChange={(e) => updateForm({ description: e.target.value })}
                    placeholder="Summarize the document in plain language so anyone can grasp the essentials..."
                    className="leading-relaxed bg-background/70 border-border/50 focus:border-primary/50 resize-none"
                  />
                </Section>
              </div>

              {/* Version Chain Section */}
              <Section icon={GitBranch} title="Version Chain" description="Manage document versions">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      Link documents together to track different versions of the same content.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddToChainOpen(true)}
                      className="h-8 gap-1.5 shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add to chain
                    </Button>
                  </div>

                  {relLoading ? (
                    <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading versions...</span>
                    </div>
                  ) : versions.length <= 1 ? (
                    <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-dashed border-border/50 bg-muted/10">
                      <GitBranch className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No version chain linked yet</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Add documents to track version history</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/40 bg-background/50 divide-y divide-border/30">
                      {versions.map((v: any, idx: number) => (
                        <div
                          key={v.id}
                          className={cn(
                            "flex items-center justify-between gap-3 px-4 py-3",
                            "hover:bg-muted/30 transition-colors"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 text-xs font-medium text-muted-foreground tabular-nums">
                              v{v.versionNumber || '—'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground truncate">
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
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    asChild
                                  >
                                    <Link href={`/documents/${v.id}`} target="_blank">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Link>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">View</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

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
                                        await apiFetch(`/orgs/${orgId}/documents/${v.id}/move-version`, { method: 'POST', body: { fromVersion: from, toVersion: from - 1 } });
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
                                        await apiFetch(`/orgs/${orgId}/documents/${v.id}/move-version`, { method: 'POST', body: { fromVersion: from, toVersion: from + 1 } });
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
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              {/* Delete Section */}
              <div className="pt-4 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Delete this document permanently
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Document
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
                  This will move the document to the recycle bin. You can restore it within 30 days before it's permanently deleted.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
            <AlertDialogCancel className="text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-red-500 hover:bg-red-600 text-white text-sm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Folder Picker Dialog */}
      <FolderPickerDialog
        open={folderCommandOpen}
        onOpenChange={setFolderCommandOpen}
        folders={(folders || []).map((p) => ({
          id: p.join('/'),
          path: p,
          label: `/${p.join('/')}`,
          name: p[p.length - 1] || 'Folder',
        }))}
        currentPath={form.folderPath.split('/').filter(Boolean)}
        onSelect={(path) => updateForm({ folderPath: path.join('/') })}
        onCreateFolder={async (parentPath, name) => {
          await createFolder(parentPath, name);
          await refresh();
        }}
        onLoadChildren={loadFolderChildren}
        loading={false}
        title="Select Folder"
      />

      {/* Version Link Picker Dialog */}
      <VersionLinkPickerDialog
        open={addToChainOpen}
        onOpenChange={setAddToChainOpen}
        title="Add existing document to this version chain…"
        documents={documents.filter(d => d.id !== doc?.id && !versionChainIds.has(d.id))}
        folders={folders}
        initialPath={form.folderPath.split('/').filter(Boolean)}
        selectedId={null}
        onSelect={(draftId) => { void addDocToThisChain(draftId); }}
      />
    </AppLayout>
  );
}
