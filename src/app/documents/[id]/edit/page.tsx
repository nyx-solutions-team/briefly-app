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
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  const isMobile = useIsMobile();
  const [saving, setSaving] = React.useState(false);
  const { load: loadFolderChildren } = useFolderExplorer();
  const [folderCommandOpen, setFolderCommandOpen] = React.useState(false);
  const [addToChainOpen, setAddToChainOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [unlinkTarget, setUnlinkTarget] = React.useState<{ id: string; title?: string } | null>(null);
  const [unlinkLoading, setUnlinkLoading] = React.useState(false);
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
      const data = await apiFetch(`/orgs/${orgId}/documents/${doc.id}/relationships`, { skipCache: true });
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
        {/* Mobile Header - Floating Buttons */}
        {isMobile && (
          <div className="fixed top-0 left-0 right-0 z-50 p-6 flex justify-between items-center pointer-events-none">
            <button
              onClick={() => router.push(backHref)}
              className="pointer-events-auto h-11 w-11 flex items-center justify-center rounded-full bg-zinc-900/60 backdrop-blur-xl border border-white/10 text-white shadow-2xl active:scale-95 transition-all"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2 pointer-events-auto">
              <Button
                size="sm"
                onClick={onSave}
                disabled={saving || !doc}
                className="h-11 px-6 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-lg active:scale-95 transition-all border-none"
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5 mr-2" />
                )}
                {saving ? 'Saving' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {/* Desktop Header */}
        {!isMobile ? (
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
        ) : null}

        {/* Main Content */}
        <main className={cn("flex-1", isMobile ? "bg-zinc-950 px-4 pb-20 pt-24" : "px-6 py-6")}>
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
          ) : isMobile ? (
            /* Mobile View Content */
            <div className="flex flex-col gap-6">
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold text-white leading-tight">Edit details</h1>
                <p className="text-zinc-500 text-sm mt-1 truncate">{doc.title || doc.filename}</p>
              </div>

              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="w-full h-12 bg-zinc-900/60 border border-white/5 rounded-2xl p-1 mb-6">
                  <TabsTrigger value="overview" className="flex-1 rounded-xl data-[state=active]:bg-orange-500 data-[state=active]:text-white text-zinc-400 font-bold transition-all">
                    Form
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1 rounded-xl data-[state=active]:bg-orange-500 data-[state=active]:text-white text-zinc-400 font-bold transition-all">
                    History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-0 space-y-6 focus-visible:outline-none focus:outline-none">
                  <Section icon={FileText} title="Document Basics" className="bg-zinc-900/60 border-white/5 rounded-2xl p-6">
                    <div className="space-y-5">
                      <FormField label="Title">
                        <Input
                          value={form.title}
                          onChange={(e) => updateForm({ title: e.target.value })}
                          placeholder="Document title"
                          className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </FormField>

                      <FormField label="Filename">
                        <Input
                          value={form.filename}
                          onChange={(e) => updateForm({ filename: e.target.value })}
                          placeholder="original-filename.pdf"
                          className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </FormField>

                      <FormField label="Folder">
                        <div className="flex flex-col gap-2">
                          <Input
                            value={form.folderPath}
                            onChange={(e) => updateForm({ folderPath: e.target.value })}
                            placeholder="Root (no folder)"
                            className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                          />
                          <Button
                            variant="outline"
                            onClick={() => setFolderCommandOpen(true)}
                            className="h-12 rounded-xl border-white/10 bg-white/5 text-white font-semibold"
                          >
                            <FolderOpen className="h-4 w-4 mr-2" />
                            Browse Folders
                          </Button>
                        </div>
                      </FormField>
                    </div>
                  </Section>

                  <Section icon={User} title="People & Context" className="bg-zinc-900/60 border-white/5 rounded-2xl p-6">
                    <div className="space-y-5">
                      <FormField label="Subject">
                        <Input
                          value={form.subject}
                          onChange={(e) => updateForm({ subject: e.target.value })}
                          placeholder="What is this about?"
                          className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </FormField>

                      <FormField label="Sender">
                        <Input
                          value={form.sender}
                          onChange={(e) => updateForm({ sender: e.target.value })}
                          placeholder="From..."
                          className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </FormField>

                      <FormField label="Receiver">
                        <Input
                          value={form.receiver}
                          onChange={(e) => updateForm({ receiver: e.target.value })}
                          placeholder="To..."
                          className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </FormField>

                      <FormField label="Document Date">
                        <Input
                          value={form.documentDate}
                          onChange={(e) => updateForm({ documentDate: e.target.value })}
                          placeholder="YYYY-MM-DD"
                          className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </FormField>
                    </div>
                  </Section>

                  <Section icon={Tag} title="Categorization" className="bg-zinc-900/60 border-white/5 rounded-2xl p-6">
                    <div className="space-y-5">
                      <FormField label="Document Type">
                        <Input
                          value={form.documentType}
                          onChange={(e) => updateForm({ documentType: e.target.value })}
                          placeholder="Invoice, Contract..."
                          className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </FormField>

                      <FormField label="Category">
                        <UiSelect value={form.category || 'General'} onValueChange={(value) => updateForm({ category: value })}>
                          <UiSelectTrigger className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white focus:border-orange-500/50">
                            <UiSelectValue placeholder="Select category..." />
                          </UiSelectTrigger>
                          <UiSelectContent className="bg-zinc-900 border-white/10 rounded-2xl shadow-2xl">
                            {categories.map((category) => (
                              <UiSelectItem key={category} value={category} className="rounded-xl h-11 focus:bg-white/10 text-white">
                                {category}
                              </UiSelectItem>
                            ))}
                          </UiSelectContent>
                        </UiSelect>
                      </FormField>

                      <FormField label="Keywords">
                        <Input
                          value={form.keywords}
                          onChange={(e) => updateForm({ keywords: e.target.value })}
                          placeholder="Separate with commas"
                          className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </FormField>

                      <FormField label="Tags">
                        <Input
                          value={form.tags}
                          onChange={(e) => updateForm({ tags: e.target.value })}
                          placeholder="Separate with commas"
                          className="h-12 bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </FormField>
                    </div>
                  </Section>

                  <Section icon={Sparkles} title="AI Insight" variant="accent" className="bg-zinc-900/60 border-orange-500/20 rounded-2xl p-6">
                    <FormField label="Summary & Description">
                      <Textarea
                        rows={10}
                        value={form.description}
                        onChange={(e) => updateForm({ description: e.target.value })}
                        placeholder="Detailed document summary..."
                        className="bg-zinc-800/50 border-white/5 rounded-xl text-white placeholder:text-zinc-600 focus:border-orange-500/50 resize-none leading-relaxed"
                      />
                    </FormField>
                  </Section>

                  <div className="pt-4 pb-12">
                    <Button
                      variant="outline"
                      className="w-full h-14 rounded-2xl border-red-500/30 bg-red-500/5 text-red-500 font-bold active:bg-red-500/10 transition-colors"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-5 w-5 mr-3" />
                      Delete Document
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0 focus-visible:outline-none focus:outline-none pb-12">
                  <Section icon={GitBranch} title="Version Control" className="bg-zinc-900/60 border-white/5 rounded-2xl p-6">
                    <div className="flex flex-col gap-4">
                      <Button
                        variant="outline"
                        onClick={() => setAddToChainOpen(true)}
                        className="h-12 rounded-xl border-orange-500/20 bg-orange-500/5 text-orange-500 font-bold"
                      >
                        <Plus className="h-5 w-5 mr-2" />
                        Add New Version
                      </Button>

                      {relLoading ? (
                        <div className="flex flex-col items-center py-10 gap-3">
                          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                          <span className="text-zinc-500 text-sm">Fetching document links...</span>
                        </div>
                      ) : (
                        <div className="space-y-4 pt-2">
                          {versions.map((v: any) => {
                            const fromNum = Number(v.versionNumber);
                            const canMoveUp = Number.isFinite(fromNum) && fromNum < maxVersion;
                            const canMoveDown = Number.isFinite(fromNum) && fromNum > 1;

                            return (
                              <div key={v.id} className="bg-zinc-800/40 border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 font-bold text-sm">
                                      v{v.versionNumber || '—'}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-white font-bold text-sm truncate max-w-[140px]">{v.title || 'Untitled'}</span>
                                      {v.isCurrentVersion && (
                                        <span className="flex items-center gap-1 text-[10px] text-orange-400 font-bold uppercase tracking-wider mt-0.5">
                                          <Crown className="h-2.5 w-2.5" />
                                          Current Head
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-zinc-400 hover:text-white" asChild>
                                      <Link href={`/documents/${v.id}`} target="_blank">
                                        <ExternalLink className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-9 w-9 rounded-full text-red-500/70 hover:text-red-500 hover:bg-red-500/10"
                                      onClick={() => setUnlinkTarget({ id: v.id, title: v.title || 'Untitled' })}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <Button
                                    variant="secondary"
                                    className="h-10 rounded-xl bg-zinc-700/50 text-zinc-300 font-bold text-xs"
                                    disabled={!canMoveUp}
                                    onClick={async () => {
                                      const from = Number(v.versionNumber);
                                      try {
                                        const { orgId } = getApiContext();
                                        await apiFetch(`/orgs/${orgId}/documents/${v.id}/move-version`, { method: 'POST', body: { fromVersion: from, toVersion: from + 1 } });
                                        await refresh();
                                        await loadRelationships();
                                      } catch (e) { console.error(e); }
                                    }}
                                  >
                                    <ArrowUp className="h-3 w-3 mr-2" />
                                    Raise version
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    className="h-10 rounded-xl bg-zinc-700/50 text-zinc-300 font-bold text-xs"
                                    disabled={!canMoveDown}
                                    onClick={async () => {
                                      const from = Number(v.versionNumber);
                                      try {
                                        const { orgId } = getApiContext();
                                        await apiFetch(`/orgs/${orgId}/documents/${v.id}/move-version`, { method: 'POST', body: { fromVersion: from, toVersion: from - 1 } });
                                        await refresh();
                                        await loadRelationships();
                                      } catch (e) { console.error(e); }
                                    }}
                                  >
                                    <ArrowDown className="h-3 w-3 mr-2" />
                                    Lower version
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </Section>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            /* Desktop View Content */
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
                      Ordered by version number (highest first). Use the arrows to change version numbers.
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
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border/40 bg-background/50 divide-y divide-border/30">
                        {versions.map((v: any, idx: number) => {
                          const fromNum = Number(v.versionNumber);
                          const canMoveUp = Number.isFinite(fromNum) && fromNum < maxVersion;
                          const canMoveDown = Number.isFinite(fromNum) && fromNum > 1;
                          const upVersion = canMoveUp ? fromNum + 1 : null;
                          const downVersion = canMoveDown ? fromNum - 1 : null;
                          return (
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
                                        disabled={!canMoveUp}
                                        onClick={async () => {
                                          const from = Number(v.versionNumber);
                                          if (!Number.isFinite(from) || from >= maxVersion) return;
                                          try {
                                            const { orgId } = getApiContext();
                                            await apiFetch(`/orgs/${orgId}/documents/${v.id}/move-version`, { method: 'POST', body: { fromVersion: from, toVersion: from + 1 } });
                                            await refresh();
                                            await loadRelationships();
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
                                            await apiFetch(`/orgs/${orgId}/documents/${v.id}/move-version`, { method: 'POST', body: { fromVersion: from, toVersion: from - 1 } });
                                            await refresh();
                                            await loadRelationships();
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
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {versions.length <= 1 && (
                        <div className="text-xs text-muted-foreground">
                          No other versions yet. Add documents to create a chain.
                        </div>
                      )}
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
        <AlertDialogContent className={cn("max-w-md border-border/40", isMobile && "w-[90vw] rounded-3xl p-6 bg-zinc-900 border-white/10")}>
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
                  This will move the document to the recycle bin. You can restore it within 30 days before it&apos;s permanently deleted.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
            <AlertDialogCancel className="text-sm rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-red-500 hover:bg-red-600 text-white text-sm rounded-xl"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove From Version Chain Dialog */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(open) => { if (!open) setUnlinkTarget(null); }}>
        <AlertDialogContent className={cn("max-w-md border-border/40", isMobile && "w-[90vw] rounded-3xl p-6 bg-zinc-900 border-white/10")}>
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
            <AlertDialogCancel className="text-sm rounded-xl" disabled={unlinkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!unlinkTarget) return;
                try {
                  setUnlinkLoading(true);
                  const { orgId } = getApiContext();
                  await apiFetch(`/orgs/${orgId}/documents/${unlinkTarget.id}/unlink`, { method: 'POST' });
                  await refresh();
                  await loadRelationships();
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
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-xl"
              disabled={unlinkLoading}
            >
              {unlinkLoading ? 'Removing...' : 'Remove'}
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
