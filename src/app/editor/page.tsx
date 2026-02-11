"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { useDocuments } from "@/hooks/use-documents";
import { AccessDenied } from "@/components/access-denied";
import { createEditorDoc, listEditorDocs, type EditorDocListItem } from "@/lib/editor-api";
import { extractTextFromTiptap } from "@/lib/tiptap-text";
import type { TipTapEditorValue } from "@/components/editor/tiptap-editor";
import { FileText, Plus, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOrgFeatures } from "@/lib/org-features";

function buildInitialDoc(title: string): TipTapEditorValue {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: title || "Untitled" }],
      },
      { type: "paragraph" },
    ],
  } as any;
}

const GENERAL_DEPARTMENT_VALUE = "__general__";
const FOLDER_ROOT_VALUE = "__root__";
const FOLDER_CUSTOM_VALUE = "__custom__";

export default function EditorPage() {
  const { bootstrapData } = useAuth();
  const { editorEnabled } = getOrgFeatures(bootstrapData?.orgSettings);

  if (bootstrapData && !editorEnabled) {
    return (
      <AppLayout>
        <AccessDenied
          title="Controlled Docs Not Enabled"
          message="The Editor feature is not enabled for this organization."
        />
      </AppLayout>
    );
  }

  return <EditorPageInner />;
}

function EditorPageInner() {
  const { toast } = useToast();
  const router = useRouter();
  const { hasPermission, bootstrapData } = useAuth();
  const { folders: documentFolders } = useDocuments();

  const canRead = hasPermission("documents.read");
  const canCreate = hasPermission("documents.create");

  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [docs, setDocs] = React.useState<EditorDocListItem[]>([]);
  const [query, setQuery] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);

  const [newTitle, setNewTitle] = React.useState("Untitled");
  const [newFolderPath, setNewFolderPath] = React.useState("");
  const [newDepartmentId, setNewDepartmentId] = React.useState<string>(GENERAL_DEPARTMENT_VALUE);
  const [newIsDraft, setNewIsDraft] = React.useState(true);

  const rbacMode = String(bootstrapData?.orgSettings?.rbac_mode || "legacy");
  const requiresExplicitDepartment = rbacMode !== "legacy";

  const departmentOptions = React.useMemo(() => {
    const list = Array.isArray(bootstrapData?.departments) ? bootstrapData?.departments : [];
    // Prefer departments where the user is a member (if that flag exists), else show all.
    const mine = list.filter((d: any) => d?.is_member);
    return (mine.length ? mine : list).filter(Boolean);
  }, [bootstrapData?.departments]);

  React.useEffect(() => {
    if (!requiresExplicitDepartment) return;
    if (newDepartmentId !== GENERAL_DEPARTMENT_VALUE) return;
    const first = departmentOptions[0];
    if (first?.id) setNewDepartmentId(String(first.id));
  }, [departmentOptions, newDepartmentId, requiresExplicitDepartment]);

  const folderOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of documentFolders || []) {
      const s = (p || []).filter(Boolean).join("/");
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [documentFolders]);

  const folderOptionsSet = React.useMemo(() => new Set(folderOptions), [folderOptions]);

  const folderSelectValue = React.useMemo(() => {
    const raw = newFolderPath.trim();
    if (!raw) return FOLDER_ROOT_VALUE;
    return folderOptionsSet.has(raw) ? raw : FOLDER_CUSTOM_VALUE;
  }, [newFolderPath, folderOptionsSet]);

  const load = React.useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const res = await listEditorDocs({ q: query.trim() || undefined, limit: 50 });
      setDocs(res.docs || []);
    } catch (e: any) {
      toast({ title: "Failed to load docs", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [canRead, query, toast]);

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
      const content = buildInitialDoc(newTitle.trim() || "Untitled");
      const folderPath = newFolderPath
        .split("/")
        .map((p) => p.trim())
        .filter(Boolean);
      const contentText = extractTextFromTiptap(content);

      const res = await createEditorDoc({
        title: newTitle.trim() || "Untitled",
        folderPath: folderPath.length ? folderPath : undefined,
        departmentId: newDepartmentId !== GENERAL_DEPARTMENT_VALUE ? newDepartmentId : undefined,
        isDraft: newIsDraft,
        content,
        contentText,
        commitMessage: "Create doc",
      });

      setCreateOpen(false);
      toast({ title: "Created", description: "Document created." });
      router.push(`/editor/${res.doc.id}`);
    } catch (e: any) {
      toast({ title: "Create failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-4 md:px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-foreground truncate">Editor</h1>
                  <p className="text-xs text-muted-foreground truncate">Create and edit documents with version history.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()} disabled={!canRead || loading}>
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  Refresh
                </Button>
                <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateOpen(true)} disabled={!canCreate}>
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-6 py-6">
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search docs"
                  className="h-10 pl-9"
                  disabled={!canRead}
                />
              </div>
              {!canRead && (
                <div className="text-sm text-muted-foreground">You don't have permission to view documents.</div>
              )}
            </div>

            <Card className="border-border/40 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Recent docs</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : docs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No docs yet.</div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {docs.map((d) => {
                      const displayTitle = d.title || d.filename || d.id;
                      const v = d.head?.current_version_number ?? 0;
                      const deptName = d.department_id
                        ? (bootstrapData?.departments || []).find((x: any) => x.id === d.department_id)?.name
                        : null;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          className="w-full text-left py-3 px-2 rounded-md hover:bg-muted/20 transition-colors"
                          onClick={() => router.push(`/editor/${d.id}`)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{displayTitle}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground truncate">
                                {deptName ? `${deptName} • ` : ""}v{v}
                              </div>
                            </div>
                            <div className="text-[11px] text-muted-foreground">{new Date(d.uploaded_at).toLocaleString()}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Select
                    value={folderSelectValue}
                    onValueChange={(v) => {
                      if (v === FOLDER_ROOT_VALUE) setNewFolderPath("");
                      else if (v === FOLDER_CUSTOM_VALUE) return;
                      else setNewFolderPath(v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={newFolderPath ? `/${newFolderPath}` : "Root folder"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FOLDER_ROOT_VALUE}>Root</SelectItem>
                      <SelectItem value={FOLDER_CUSTOM_VALUE}>Custom path...</SelectItem>
                      {folderOptions.map((p) => (
                        <SelectItem key={p} value={p}>
                          /{p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    id="new-folder"
                    value={newFolderPath}
                    onChange={(e) => setNewFolderPath(e.target.value.replace(/\\/g, "/"))}
                    placeholder="Custom path e.g., Policies/HR"
                  />
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
                  <div className="text-xs text-muted-foreground">Drafts can be submitted for approval later.</div>
                </div>
                <Switch checked={newIsDraft} onCheckedChange={setNewIsDraft} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button
                onClick={() => void onCreate()}
                disabled={creating || !canCreate || (requiresExplicitDepartment && newDepartmentId === GENERAL_DEPARTMENT_VALUE)}
              >
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
