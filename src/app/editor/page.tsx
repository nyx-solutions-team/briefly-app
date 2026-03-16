"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/app-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader as UiDialogHeader, DialogTitle as UiDialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { AccessDenied } from "@/components/access-denied";
import { createEditorDoc, createEditorDocShell, listEditorDocs, type EditorDocListItem } from "@/lib/editor-api";
import { getEffectiveTemplateRegistryTemplate, listTemplateRegistryTemplates, type TemplateRegistryListItem } from "@/lib/template-registry";
import { FolderPickerDialog } from "@/components/folder-picker-dialog";
import { StudioModuleNav } from "@/components/editor/studio-module-nav";
import { FileText, FolderOpen, Plus, LayoutDashboard, Search, RefreshCw } from "lucide-react";
import { formatAppDateTime, cn } from "@/lib/utils";
import { getOrgFeatures } from "@/lib/org-features";
import { apiFetch, getApiContext } from "@/lib/api";

const GENERAL_DEPARTMENT_VALUE = "__general__";
const EDITOR_TEMPLATE_CREATE_ENABLED = (process.env.NEXT_PUBLIC_EDITOR_TEMPLATE_CREATE_ENABLED || "0").trim().toLowerCase() !== "0";

function _buildEditorTemplateSeed(title: string, effective: any, templateName?: string | null) {
  const safeTitle = String(title || "Untitled").trim() || "Untitled";
  const schema = effective && typeof effective === "object" && effective.schema && typeof effective.schema === "object"
    ? effective.schema
    : {};
  const uiSchema = effective && typeof effective === "object" && effective.ui_schema && typeof effective.ui_schema === "object"
    ? effective.ui_schema
    : {};
  const fieldsRaw = (schema as any).fields;
  const fieldEntries: Array<{ key: string; label: string; value: string; help?: string | null }> = [];
  if (fieldsRaw && typeof fieldsRaw === "object" && !Array.isArray(fieldsRaw)) {
    for (const [key, raw] of Object.entries(fieldsRaw as Record<string, any>)) {
      const label = typeof raw?.label === "string" && raw.label.trim() ? raw.label.trim() : String(key);
      const defVal = raw?.default;
      const help = typeof raw?.help === "string"
        ? raw.help.trim()
        : (typeof raw?.help_text === "string" ? raw.help_text.trim() : "");
      fieldEntries.push({
        key: String(key),
        label,
        value: defVal == null ? "" : String(defVal),
        help: help || null,
      });
    }
  } else if (Array.isArray(fieldsRaw)) {
    for (const raw of fieldsRaw) {
      const key = String(raw?.id || raw?.key || raw?.name || "").trim();
      if (!key) continue;
      const label = typeof raw?.label === "string" && raw.label.trim() ? raw.label.trim() : key;
      const defVal = raw?.default;
      const help = typeof raw?.help === "string"
        ? raw.help.trim()
        : (typeof raw?.help_text === "string" ? raw.help_text.trim() : "");
      fieldEntries.push({ key, label, value: defVal == null ? "" : String(defVal), help: help || null });
    }
  }
  const fieldByKey = new Map(fieldEntries.map((f) => [f.key, f]));
  const usedKeys = new Set<string>();
  const sections: Array<{ title: string; fields: Array<{ key: string; label: string; value: string; help?: string | null }> }> = [];
  const uiSections = Array.isArray((uiSchema as any)?.sections) ? (uiSchema as any).sections as any[] : [];
  for (const rawSection of uiSections) {
    if (!rawSection || typeof rawSection !== "object") continue;
    const titleCandidate = String(rawSection.title || rawSection.label || rawSection.name || "").trim();
    const refs = Array.isArray(rawSection.fields) ? rawSection.fields : [];
    const fields: Array<{ key: string; label: string; value: string; help?: string | null }> = [];
    for (const ref of refs) {
      const key = typeof ref === "string"
        ? ref.trim()
        : String(ref?.field || ref?.field_id || ref?.key || ref?.id || "").trim();
      if (!key || usedKeys.has(key)) continue;
      const entry = fieldByKey.get(key);
      if (!entry) continue;
      usedKeys.add(key);
      fields.push(entry);
    }
    if (fields.length) {
      sections.push({ title: titleCandidate || "Section", fields });
    }
  }
  const remainingFields = fieldEntries.filter((f) => !usedKeys.has(f.key));
  if (remainingFields.length) {
    sections.push({
      title: sections.length ? "Additional Fields" : "Fields",
      fields: remainingFields,
    });
  }
  const flattenedFields = sections.flatMap((s) => s.fields).slice(0, 40);
  const visibleSections: Array<{ title: string; fields: typeof flattenedFields }> = [];
  let remaining = 40;
  for (const section of sections) {
    if (remaining <= 0) break;
    const take = section.fields.slice(0, remaining);
    if (!take.length) continue;
    visibleSections.push({ title: section.title, fields: take });
    remaining -= take.length;
  }
  const textLines: string[] = [safeTitle];
  if (templateName) textLines.push(`Template: ${templateName}`);
  if (typeof (schema as any)?.document_type === "string" && (schema as any).document_type.trim()) {
    textLines.push(`Document Type: ${(schema as any).document_type.trim()}`);
  }
  textLines.push("");
  if (!flattenedFields.length) {
    textLines.push("Start writing here...");
  } else {
    for (const section of visibleSections) {
      if (section.title) {
        textLines.push(section.title);
      }
      for (const f of section.fields) {
        textLines.push(`${f.label}: ${f.value}`);
        if (f.help) textLines.push(`  (${f.help})`);
      }
      textLines.push("");
    }
    while (textLines.length && textLines[textLines.length - 1] === "") textLines.pop();
  }
  const contentNodes: any[] = [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: safeTitle }] },
  ];
  if (templateName) {
    contentNodes.push({ type: "paragraph", content: [{ type: "text", text: `Template: ${templateName}` }] });
  }
  if (typeof (schema as any)?.document_type === "string" && (schema as any).document_type.trim()) {
    contentNodes.push({ type: "paragraph", content: [{ type: "text", text: `Document Type: ${(schema as any).document_type.trim()}` }] });
  }
  if (!flattenedFields.length) {
    contentNodes.push({ type: "paragraph", content: [{ type: "text", text: "Start writing here..." }] });
  } else {
    for (const section of visibleSections) {
      if (section.title) {
        contentNodes.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: section.title }] });
      }
      for (const f of section.fields) {
        const text = `${f.label}: ${f.value}`;
        contentNodes.push({ type: "paragraph", content: [{ type: "text", text }] });
        if (f.help) {
          contentNodes.push({ type: "paragraph", content: [{ type: "text", text: `Hint: ${f.help}` }] });
        }
      }
    }
  }
  return {
    content: { type: "doc", content: contentNodes },
    contentText: textLines.join("\n").trim(),
  };
}

function DocRowSkeleton() {
  return (
    <div className="px-5 py-3 border-b border-border/20">
      <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_120px] md:gap-4 md:items-center">
        <div className="flex items-center gap-3 min-w-0">
          <Skeleton className="h-4 w-4 rounded-sm" />
          <div className="min-w-0 space-y-1.5 flex flex-col justify-center">
            <Skeleton className="h-3.5 w-48" />
          </div>
        </div>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24 justify-self-end" />
      </div>
    </div>
  );
}

export default function EditorPage() {
  const { bootstrapData } = useAuth();
  const { editorEnabled } = getOrgFeatures(bootstrapData?.orgSettings);

  if (bootstrapData && !editorEnabled) {
    return (
      <AppLayout>
        <AccessDenied
          title="Controlled Docs Not Enabled"
          message="The Document Studio feature is not enabled for this organization."
        />
      </AppLayout>
    );
  }

  return <EditorPageInner />;
}

function EditorPageInner() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission, bootstrapData } = useAuth();
  const orgId = getApiContext().orgId;

  const canRead = hasPermission("documents.read");
  const canCreate = hasPermission("documents.create");

  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [docs, setDocs] = React.useState<EditorDocListItem[]>([]);
  const [searchQuery, setSearchQuery] = React.useState(searchParams.get("q") || "");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [folderCommandOpen, setFolderCommandOpen] = React.useState(false);

  const [newTitle, setNewTitle] = React.useState("Untitled");
  const [newFolderPath, setNewFolderPath] = React.useState("");
  const [newDepartmentId, setNewDepartmentId] = React.useState<string>(GENERAL_DEPARTMENT_VALUE);
  const [newIsDraft, setNewIsDraft] = React.useState(false);
  const [useTemplateCreate, setUseTemplateCreate] = React.useState(false);
  const [templateLoading, setTemplateLoading] = React.useState(false);
  const [templateOptions, setTemplateOptions] = React.useState<TemplateRegistryListItem[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = React.useState<string>("");

  const rbacMode = String(bootstrapData?.orgSettings?.rbac_mode || "legacy");
  const requiresExplicitDepartment = rbacMode !== "legacy";

  const departmentOptions = React.useMemo(() => {
    const list = Array.isArray(bootstrapData?.departments) ? bootstrapData?.departments : [];
    // Prefer departments where the user is a member (if that flag exists), else show all.
    const mine = list.filter((d: any) => d?.is_member);
    return (mine.length ? mine : list).filter(Boolean);
  }, [bootstrapData?.departments]);

  React.useEffect(() => {
    const q = searchParams.get("q") || "";
    setSearchQuery((prev) => (prev === q ? prev : q));
  }, [searchParams]);

  React.useEffect(() => {
    if (!requiresExplicitDepartment) return;
    if (newDepartmentId !== GENERAL_DEPARTMENT_VALUE) return;
    const first = departmentOptions[0];
    if (first?.id) setNewDepartmentId(String(first.id));
  }, [departmentOptions, newDepartmentId, requiresExplicitDepartment]);

  React.useEffect(() => {
    if (!EDITOR_TEMPLATE_CREATE_ENABLED) return;
    if (!createOpen || !useTemplateCreate) return;
    if (!canRead) return;
    let cancelled = false;
    (async () => {
      setTemplateLoading(true);
      try {
        const res = await listTemplateRegistryTemplates({ supports: "editor", activeOnly: true, includeSystem: true, limit: 100 });
        const next = Array.isArray(res?.templates) ? res.templates : [];
        if (cancelled) return;
        setTemplateOptions(next);
        setSelectedTemplateKey((prev) => {
          if (prev && next.some((t) => t.template_key === prev)) return prev;
          return next[0]?.template_key || "";
        });
      } catch (e: any) {
        if (!cancelled) {
          setTemplateOptions([]);
          setSelectedTemplateKey("");
          toast({ title: "Failed to load templates", description: e?.message || "Unknown error", variant: "destructive" });
        }
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createOpen, useTemplateCreate, canRead, toast]);

  const folderOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const d of docs) {
      const path = Array.isArray(d.folder_path) ? d.folder_path.filter(Boolean) : [];
      for (let i = 1; i <= path.length; i += 1) {
        const s = path.slice(0, i).join("/");
        if (s) set.add(s);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [docs]);

  const loadFolderChildren = React.useCallback(async (path: string[] = []) => {
    if (!orgId) return [];
    const query = path.length ? `?path=${encodeURIComponent(path.join("/"))}` : "";
    return apiFetch(`/orgs/${orgId}/folders${query}`, { skipCache: true });
  }, [orgId]);

  const createFolder = React.useCallback(async (parentPath: string[], name: string) => {
    if (!orgId) throw new Error("No org selected");
    await apiFetch(`/orgs/${orgId}/folders`, {
      method: "POST",
      body: {
        parentPath,
        name,
      },
      skipCache: true,
    });
  }, [orgId]);

  const currentFolderPath = React.useMemo(
    () => newFolderPath.split("/").map((p) => p.trim()).filter(Boolean),
    [newFolderPath]
  );

  const load = React.useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const res = await listEditorDocs({ limit: 100, q: searchQuery.trim() || undefined });
      setDocs(res.docs || []);
    } catch (e: any) {
      toast({ title: "Failed to load docs", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [canRead, searchQuery, toast]);

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 200);
    return () => window.clearTimeout(t);
  }, [load]);

  const onCreate = async () => {
    if (!canCreate) return;
    if (requiresExplicitDepartment && newDepartmentId === GENERAL_DEPARTMENT_VALUE) {
      toast({
        title: "Team required",
        description: "Select a team to create a document in this organization.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const folderPath = newFolderPath
        .split("/")
        .map((p) => p.trim())
        .filter(Boolean);

      if (EDITOR_TEMPLATE_CREATE_ENABLED && useTemplateCreate) {
        if (!selectedTemplateKey) {
          throw new Error("Select a template first");
        }
        const departmentId = newDepartmentId !== GENERAL_DEPARTMENT_VALUE ? newDepartmentId : undefined;
        const eff = await getEffectiveTemplateRegistryTemplate(selectedTemplateKey, {
          departmentId,
          mode: "fallback",
        });
        const seed = _buildEditorTemplateSeed(
          newTitle.trim() || "Untitled",
          eff?.effective_definition || {},
          eff?.template_definition?.name || selectedTemplateKey
        );
        const layers = Array.isArray(eff?.provenance?.layers_applied) ? eff.provenance.layers_applied : [];
        const lastApplied = [...layers].reverse().find((l: any) => l?.version_id) || null;
        if (!lastApplied?.version_id) {
          throw new Error("Selected template has no effective published version");
        }
        const created = await createEditorDoc({
          title: newTitle.trim() || "Untitled",
          folderPath: folderPath.length ? folderPath : undefined,
          departmentId,
          isDraft: newIsDraft,
          content: seed.content,
          contentText: seed.contentText,
          commitMessage: `Create from template: ${eff?.template_definition?.name || selectedTemplateKey}`,
          templateProvenance: {
            template_definition_id: eff.provenance.template_definition_id,
            template_version_id: String(lastApplied.version_id),
            template_scope_type: lastApplied.scope_type,
            template_department_id: eff.provenance.department_id || null,
            template_origin: "editor",
          },
        });
        setCreateOpen(false);
        toast({
          title: "Created from template",
          description: `Document created using ${eff?.template_definition?.name || selectedTemplateKey}.`,
        });
        router.push(`/editor/${created?.doc?.id}`);
        return;
      }

      const res = await createEditorDocShell({
        title: newTitle.trim() || "Untitled",
        folderPath: folderPath.length ? folderPath : undefined,
        departmentId: newDepartmentId !== GENERAL_DEPARTMENT_VALUE ? newDepartmentId : undefined,
        isDraft: newIsDraft,
      });

      setCreateOpen(false);
      toast({
        title: "Created",
        description: newIsDraft
          ? "Draft document created. It is visible in Document Studio and hidden from Folders/Documents list."
          : "Document created.",
      });
      router.push(`/editor/${res.id}`);
    } catch (e: any) {
      toast({ title: "Create failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppLayout flush>
      <div className="min-h-screen flex flex-col bg-background">

        {/* Header - Linear style */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <LayoutDashboard className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">
                    Document Studio
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {loading ? (
                      <span className="inline-block w-48 h-4 bg-muted/30 rounded animate-pulse" />
                    ) : (
                      "Central library for controlled documents and drafts"
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" className="h-8 gap-1.5 font-semibold text-xs" onClick={() => setCreateOpen(true)} disabled={!canCreate}>
                  <Plus className="h-3.5 w-3.5" />
                  New doc
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Search & Actions Toolbar */}
        <div className="px-6 py-3 border-b border-border/30 bg-background/50">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-1 max-w-xs min-w-[200px]">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const trimmed = searchQuery.trim();
                    router.push(trimmed ? `/editor?q=${encodeURIComponent(trimmed)}` : '/editor');
                  }}
                >
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-9 h-8 bg-muted/30 border-border/40 text-sm placeholder:text-muted-foreground/50 w-full"
                    placeholder="Search documents..."
                  />
                </form>
              </div>

              {/* Module Nav */}
              <StudioModuleNav />
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-auto px-6 py-6 md:px-8 max-w-[1400px]">
          <div className="space-y-4 max-w-5xl">
            {!canRead && (
              <div className="text-sm text-muted-foreground">You don't have permission to view documents.</div>
            )}

            <div className="flex flex-col">
              <div className="hidden md:flex items-center justify-between pb-3 mb-2 border-b border-border/40">
                <div className="text-[13px] font-bold text-foreground">Library</div>
                <div className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider">{docs.length} Documents</div>
              </div>

              {loading ? (
                <div className="flex flex-col divide-y divide-border/20 border-t border-border/10">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <DocRowSkeleton key={`doc-row-skeleton-${idx}`} />
                  ))}
                </div>
              ) : docs.length === 0 ? (
                <div className="py-24 px-6 text-center border rounded-xl border-dashed border-border/40 mt-6">
                  <div className="text-sm font-medium text-foreground">{searchQuery.trim() ? "No matching docs." : "No docs yet."}</div>
                  <div className="mt-1 text-[13px] text-muted-foreground">
                    {searchQuery.trim() ? "Try a different search or open Studio Home." : "Create your first document to get started."}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  {docs.map((d) => {
                    const displayTitle = d.title || d.filename || d.id;
                    const v = d.head?.current_version_number ?? 0;
                    const deptName = d.department_id
                      ? (bootstrapData?.departments || []).find((x: any) => x.id === d.department_id)?.name
                      : null;
                    const folderPath = Array.isArray(d.folder_path) && d.folder_path.length > 0
                      ? `/${d.folder_path.join(" / ")}`
                      : "/Root";
                    const updatedText = formatAppDateTime(d.uploaded_at);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className="group w-full text-left px-3 py-3 rounded-lg hover:bg-muted/40 transition-colors"
                        onClick={() => router.push(`/editor/${d.id}`)}
                      >
                        <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_120px] md:gap-4 md:items-center">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="h-[16px] w-[16px] text-primary/70 group-hover:text-primary transition-colors shrink-0" />
                            <div className="text-[13px] font-bold text-foreground group-hover:text-primary transition-colors truncate">
                              {displayTitle}
                            </div>
                          </div>

                          <div className="text-[12px] text-muted-foreground truncate flex items-center gap-1.5">
                            <FolderOpen className="h-3 w-3 opacity-50" /> {folderPath}
                          </div>

                          <div className="text-[11px] font-medium text-muted-foreground/80 justify-self-end text-right">
                            {deptName ? `${deptName} • ` : ""}v{v} • {updatedText}
                          </div>
                        </div>

                        {/* Mobile Layout */}
                        <div className="md:hidden flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                            <span className="text-[13px] font-bold text-foreground truncate">{displayTitle}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground flex gap-1 items-center">
                            {folderPath} • v{v} • {updatedText}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </main>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <UiDialogHeader>
              <UiDialogTitle>Create document</UiDialogTitle>
            </UiDialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-title">Title</Label>
                <Input id="new-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Untitled" />
              </div>

              <div className="space-y-2">
                <Label>Folder path</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="new-folder"
                    value={newFolderPath}
                    onChange={(e) => setNewFolderPath(e.target.value.replace(/\\/g, "/"))}
                    placeholder="Root (no folder)"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0 gap-1.5"
                    onClick={() => setFolderCommandOpen(true)}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Browse
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Creating in: <span className="font-medium">/{newFolderPath || "Root"}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={newDepartmentId} onValueChange={setNewDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="General" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GENERAL_DEPARTMENT_VALUE} disabled={requiresExplicitDepartment}>
                      General
                    </SelectItem>
                    {departmentOptions.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {requiresExplicitDepartment && newDepartmentId === GENERAL_DEPARTMENT_VALUE && (
                  <div className="text-xs text-destructive">
                    Select a team to create a document.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-2">
                <div>
                  <div className="text-sm font-medium">Draft</div>
                  <div className="text-xs text-muted-foreground">
                    Drafts can be submitted for approval later. Draft docs are hidden from the Folders/Documents list.
                  </div>
                </div>
                <Switch checked={newIsDraft} onCheckedChange={setNewIsDraft} />
              </div>

              {EDITOR_TEMPLATE_CREATE_ENABLED && (
                <div className="space-y-3 rounded-md border border-border/40 bg-background/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Create from shared template</div>
                      <div className="text-xs text-muted-foreground">
                        Optional path. Keeps the normal document creation flow unchanged.
                      </div>
                    </div>
                    <Switch checked={useTemplateCreate} onCheckedChange={setUseTemplateCreate} />
                  </div>
                  {useTemplateCreate && (
                    <div className="space-y-2">
                      <Label>Template</Label>
                      <Select
                        value={selectedTemplateKey || undefined}
                        onValueChange={setSelectedTemplateKey}
                        disabled={templateLoading || templateOptions.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={templateLoading ? "Loading templates..." : "Select a template"} />
                        </SelectTrigger>
                        <SelectContent>
                          {templateOptions.map((tpl) => (
                            <SelectItem key={tpl.id} value={tpl.template_key}>
                              {tpl.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {useTemplateCreate && !templateLoading && templateOptions.length === 0 && (
                        <div className="text-xs text-muted-foreground">
                          No shared templates available for editor use.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button
                onClick={() => void onCreate()}
                disabled={
                  creating
                  || !canCreate
                  || (requiresExplicitDepartment && newDepartmentId === GENERAL_DEPARTMENT_VALUE)
                  || (EDITOR_TEMPLATE_CREATE_ENABLED && useTemplateCreate && (!selectedTemplateKey || templateLoading))
                }
              >
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <FolderPickerDialog
          open={folderCommandOpen}
          onOpenChange={setFolderCommandOpen}
          folders={folderOptions.map((value) => {
            const path = value.split("/").filter(Boolean);
            return {
              id: value,
              path,
              label: `/${value}`,
              name: path[path.length - 1] || "Folder",
            };
          })}
          currentPath={currentFolderPath}
          onSelect={(path) => setNewFolderPath(path.join("/"))}
          onCreateFolder={async (parentPath, name) => {
            await createFolder(parentPath, name);
          }}
          onLoadChildren={loadFolderChildren}
          loading={false}
          title="Select Folder"
        />
      </div>
    </AppLayout>
  );
}
