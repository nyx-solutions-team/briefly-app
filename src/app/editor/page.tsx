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
import { AccessDenied } from "@/components/access-denied";
import { createEditorDocShell, listEditorDocs, type EditorDocListItem } from "@/lib/editor-api";
import { FolderPickerDialog } from "@/components/folder-picker-dialog";
import { FileText, FolderOpen, Plus } from "lucide-react";
import { formatAppDateTime } from "@/lib/utils";
import { getOrgFeatures } from "@/lib/org-features";
import { apiFetch, getApiContext } from "@/lib/api";

const GENERAL_DEPARTMENT_VALUE = "__general__";

function DocRowSkeleton() {
  return (
    <div className="px-4 md:px-6 py-3 border-b border-border/20">
      <div className="hidden md:grid md:grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_90px_140px] md:gap-4 md:items-center">
        <div className="flex items-center gap-3 min-w-0">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="md:hidden space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-3 w-32" />
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
  const { hasPermission, bootstrapData } = useAuth();
  const orgId = getApiContext().orgId;

  const canRead = hasPermission("documents.read");
  const canCreate = hasPermission("documents.create");

  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [docs, setDocs] = React.useState<EditorDocListItem[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [folderCommandOpen, setFolderCommandOpen] = React.useState(false);

  const [newTitle, setNewTitle] = React.useState("Untitled");
  const [newFolderPath, setNewFolderPath] = React.useState("");
  const [newDepartmentId, setNewDepartmentId] = React.useState<string>(GENERAL_DEPARTMENT_VALUE);
  const [newIsDraft, setNewIsDraft] = React.useState(false);

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
      const res = await listEditorDocs({ limit: 50 });
      setDocs(res.docs || []);
    } catch (e: any) {
      toast({ title: "Failed to load docs", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [canRead, toast]);

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
                  <h1 className="text-xl font-semibold text-foreground truncate">Document Studio</h1>
                  <p className="text-xs text-muted-foreground truncate">Create and edit documents with version history.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateOpen(true)} disabled={!canCreate}>
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-6 py-6">
          <div className="space-y-4">
            {!canRead && (
              <div className="text-sm text-muted-foreground">You don't have permission to view documents.</div>
            )}

            <Card className="border-border/40 bg-card/50 overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Recent docs</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-0">
                <div className="hidden md:grid md:grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_90px_140px] md:gap-4 md:items-center px-6 py-2 border-b border-border/30 bg-muted/20">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Document</span>
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Folder</span>
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Version</span>
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Updated</span>
                </div>
                {loading ? (
                  <div>
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <DocRowSkeleton key={`doc-row-skeleton-${idx}`} />
                    ))}
                  </div>
                ) : docs.length === 0 ? (
                  <div className="py-16 px-6 text-center">
                    <div className="text-sm font-medium text-foreground">No docs yet.</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Create your first document to get started.
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20">
                    {docs.map((d) => {
                      const displayTitle = d.title || d.filename || d.id;
                      const displayFileName = d.filename || "Untitled.md";
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
                          className="group w-full text-left px-4 md:px-6 py-3 hover:bg-muted/30 transition-colors"
                          onClick={() => router.push(`/editor/${d.id}`)}
                        >
                          <div className="md:hidden space-y-1.5">
                            <div className="flex items-start gap-2 min-w-0">
                              <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                                <FileText className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{displayTitle}</div>
                                <div className="text-xs text-muted-foreground truncate">{displayFileName}</div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{folderPath}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {deptName ? `${deptName} • ` : ""}v{v} • {updatedText}
                            </div>
                          </div>

                          <div className="hidden md:grid md:grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_90px_140px] md:gap-4 md:items-center">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{displayTitle}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {deptName ? `${deptName} • ` : ""}{displayFileName}
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{folderPath}</div>
                            <div className="text-xs text-muted-foreground">v{v}</div>
                            <div className="text-xs text-muted-foreground">{updatedText}</div>
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
