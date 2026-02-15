"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { Editor as TipTapEditorInstance } from "@tiptap/react";
import AppLayout from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useDocuments } from "@/hooks/use-documents";
import { AccessDenied } from "@/components/access-denied";
import { getOrgFeatures } from "@/lib/org-features";
import {
  createEditSession,
  getEditorDocumentMeta,
  getEditorLatest,
  getEditorVersion,
  getEditorDraft,
  listEditorVersions,
  revokeEditSession,
  heartbeatEditSession,
  saveEditorVersion,
  saveEditorDraft,
  restoreEditorVersion,
  type EditorVersion,
} from "@/lib/editor-api";
import {
  approve,
  comment,
  getMyApprovalQueue,
  getCurrentApproval,
  getApprovalActions,
  listApprovalTemplates,
  reject,
  submitApproval,
  cancel as cancelApproval,
  type ApprovalAction,
  type ApprovalTemplate,
  type MyQueueItem,
} from "@/lib/approval-api";
import { apiFetch, getApiContext } from "@/lib/api";
import { extractTextFromTiptap } from "@/lib/tiptap-text";
import {
  TipTapEditor,
  type TipTapEditorValue,
} from "@/components/editor/tiptap-editor";
import { AiSidebar } from "@/components/editor/ai-sidebar";
import {
  ArrowLeft,
  AlertTriangle,
  Clock,
  Eye,
  FileText,
  History,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { cn, formatAppDateTime } from "@/lib/utils";

type LockState =
  | { state: "idle" }
  | { state: "acquiring" }
  | { state: "locked"; activeSession: any }
  | { state: "active"; sessionId: string };

const EMPTY_EDITOR_DOC: TipTapEditorValue = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function formatTimeHHMM(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTimeAgoShort(value?: string | null): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;

  const diffMs = Date.now() - time;
  const inFuture = diffMs < 0;
  const minutes = Math.floor(Math.abs(diffMs) / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return inFuture
    ? `in ${minutes} min${minutes === 1 ? "" : "s"}`
    : `${minutes} min${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return inFuture
    ? `in ${hours} hr${hours === 1 ? "" : "s"}`
    : `${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return inFuture
    ? `in ${days} day${days === 1 ? "" : "s"}`
    : `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatUserLabel(userId: unknown, currentUserId: string | null, userLabels?: Record<string, string>): string {
  const raw = String(userId || "").trim();
  if (!raw) return "another user";
  if (currentUserId && raw === String(currentUserId)) return "you";
  const mapped = userLabels?.[raw];
  if (mapped) return mapped;
  return raw.length > 12 ? `${raw.slice(0, 8)}...` : raw;
}

export default function EditorDocPage() {
  const { hasPermission, bootstrapData } = useAuth();
  const features = getOrgFeatures(bootstrapData?.orgSettings);
  const editorEnabled = features.editorEnabled;
  const approvalsUsable = features.approvalsUsable;
  const ready = Boolean(bootstrapData);

  const canEdit = hasPermission("documents.update");
  const canCreate = hasPermission("documents.create");
  const canDelete = hasPermission("documents.delete");
  const canSubmitApproval = hasPermission("documents.version.manage") && approvalsUsable;
  const currentUserId = bootstrapData?.user?.id || null;

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

  return (
    <EditorDocPageInner
      ready={ready}
      approvalsUsable={approvalsUsable}
      canEdit={canEdit}
      canCreate={canCreate}
      canDelete={canDelete}
      canSubmitApproval={canSubmitApproval}
      currentUserId={currentUserId}
    />
  );
}

function EditorDocPageInner({
  ready,
  approvalsUsable,
  canEdit,
  canCreate,
  canDelete,
  canSubmitApproval,
  currentUserId,
}: {
  ready: boolean;
  approvalsUsable: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canSubmitApproval: boolean;
  currentUserId: string | null;
}) {
  const { toast } = useToast();
  const params = useParams();
  const router = useRouter();
  const { updateDocument, removeDocument } = useDocuments();
  const searchParams = useSearchParams();
  const docId = String((params as any)?.docId || "");

  const viewVersion = React.useMemo(() => {
    const raw = searchParams.get("version");
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
    return n;
  }, [searchParams]);

  const isViewingFixedVersion = viewVersion !== null;

  const [loading, setLoading] = React.useState(true);
  const [title, setTitle] = React.useState("Untitled");
  const [titleInput, setTitleInput] = React.useState("Untitled");
  const [titleSaving, setTitleSaving] = React.useState(false);
  const [docFolderPath, setDocFolderPath] = React.useState<string[]>([]);
  const [headVersion, setHeadVersion] = React.useState<number>(0);
  const [doc, setDoc] = React.useState<TipTapEditorValue | undefined>(undefined);
  const [versions, setVersions] = React.useState<EditorVersion[]>([]);
  const [lockState, setLockState] = React.useState<LockState>({ state: "idle" });
  const heartbeatRef = React.useRef<number | null>(null);
  const activeSessionIdRef = React.useRef<string | null>(null);

  const [latestVersionCreatedAt, setLatestVersionCreatedAt] = React.useState<string | null>(null);
  const savedVersionContentRef = React.useRef<TipTapEditorValue | undefined>(undefined);
  const savedVersionJsonRef = React.useRef<string | null>(null);

  const autosaveTimerRef = React.useRef<number | null>(null);
  const lastAutosavedJsonRef = React.useRef<string | null>(null);
  const lastAutosaveSentAtRef = React.useRef<number>(0);

  const [autosaveStatus, setAutosaveStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [autosavedAt, setAutosavedAt] = React.useState<string | null>(null);
  const [draftBanner, setDraftBanner] = React.useState<{ updatedAt: string } | null>(null);
  const recoverableDraftRef = React.useRef<TipTapEditorValue | null>(null);
  const [recoverableDraftMeta, setRecoverableDraftMeta] = React.useState<{ capturedAt: string; label: string } | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [commitMessage, setCommitMessage] = React.useState("");

  const [approvalLoading, setApprovalLoading] = React.useState(false);
  const [approval, setApproval] = React.useState<any | null>(null);
  const [approvalStages, setApprovalStages] = React.useState<any[]>([]);
  const [approvalActions, setApprovalActions] = React.useState<ApprovalAction[]>([]);
  const [myApprovalQueue, setMyApprovalQueue] = React.useState<MyQueueItem[]>([]);
  const [approvalTemplates, setApprovalTemplates] = React.useState<ApprovalTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("");
  const [submitMessage, setSubmitMessage] = React.useState("");
  const [reviewerMessage, setReviewerMessage] = React.useState("");
  const [reviewerAction, setReviewerAction] = React.useState<"approve" | "reject" | "comment" | null>(null);

  const [approvalLoaded, setApprovalLoaded] = React.useState(false);
  const [orgUserLabels, setOrgUserLabels] = React.useState<Record<string, string>>({});

  // Edit sessions
  // - When false, we won't auto-acquire a lock (view-only).
  // - When true, we attempt to acquire and keep an edit session alive.
  const [editRequested, setEditRequested] = React.useState(true);

  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [inspectorTab, setInspectorTab] = React.useState<"versions" | "approval">("versions");
  const [approvalPanelTab, setApprovalPanelTab] = React.useState<"overview" | "comments" | "timeline">("overview");

  const [tiptapInstance, setTiptapInstance] = React.useState<TipTapEditorInstance | null>(null);

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewVersionNumber, setPreviewVersionNumber] = React.useState<number | null>(null);
  const [previewVersion, setPreviewVersion] = React.useState<EditorVersion | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const [restoreConfirmOpen, setRestoreConfirmOpen] = React.useState(false);
  const [restoreTargetVersion, setRestoreTargetVersion] = React.useState<number | null>(null);

  const [submitGuardOpen, setSubmitGuardOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const isSubmitter = Boolean(approvalsUsable && approval?.submitted_by && currentUserId && String(approval.submitted_by) === String(currentUserId));
  const canCancelThisApproval = Boolean(
    approvalsUsable &&
    approval &&
    isSubmitter &&
    canSubmitApproval &&
    (approval.status === "in_progress" || approval.status === "draft")
  );
  const canResubmitApproval = Boolean(
    approvalsUsable &&
    approval &&
    isSubmitter &&
    canSubmitApproval &&
    (approval.status === "rejected" || approval.status === "cancelled")
  );

  const reviewerQueueItem = React.useMemo(() => {
    if (!approval) return null;
    return (myApprovalQueue || []).find((item) => String(item.approval.id) === String(approval.id)) || null;
  }, [approval, myApprovalQueue]);

  const canActAsReviewer = Boolean(
    approvalsUsable &&
    approval &&
    approval.status === "in_progress" &&
    reviewerQueueItem
  );

  const commentActions = React.useMemo(
    () => (approvalActions || []).filter((a) => String(a.action_type || "").toLowerCase() === "comment"),
    [approvalActions]
  );

  const nonCommentActions = React.useMemo(
    () => (approvalActions || []).filter((a) => String(a.action_type || "").toLowerCase() !== "comment"),
    [approvalActions]
  );

  const appliedTemplate = React.useMemo(() => {
    if (!approval?.workflow_template_id) return null;
    return approvalTemplates.find((t) => String(t.id) === String(approval.workflow_template_id)) || null;
  }, [approval?.workflow_template_id, approvalTemplates]);

  const isApprovalActive = approvalsUsable && Boolean(approval && (approval.status === "draft" || approval.status === "in_progress"));
  const isEditingDisabledByApproval = approvalsUsable && isApprovalActive;
  const editorEditable = editRequested && !isViewingFixedVersion && !isEditingDisabledByApproval && canEdit && lockState.state === "active";

  const docJson = React.useMemo(() => (doc ? JSON.stringify(doc) : null), [doc]);
  const isDraftDirty = Boolean(docJson && savedVersionJsonRef.current && docJson !== savedVersionJsonRef.current);

  const stopHeartbeat = React.useCallback(() => {
    if (heartbeatRef.current) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startHeartbeat = React.useCallback((sessionId: string) => {
    stopHeartbeat();
    heartbeatRef.current = window.setInterval(() => {
      void heartbeatEditSession(sessionId, 120).catch(() => {
        // ignore; next user action will surface errors
      });
    }, 25_000);
  }, [stopHeartbeat]);

  const clearAutosaveTimer = React.useCallback(() => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const refreshApprovalState = React.useCallback(async () => {
    if (!approvalsUsable) {
      setApproval(null);
      setApprovalStages([]);
      setApprovalActions([]);
      setMyApprovalQueue([]);
      return;
    }

    try {
      const cur = await getCurrentApproval(docId);
      setApproval(cur.approval);
      setApprovalStages(cur.stages || []);

      try {
        const acts = await getApprovalActions(cur.approval.id);
        setApprovalActions(acts.actions || []);
      } catch {
        setApprovalActions([]);
      }
    } catch (e: any) {
      if (e?.status === 404) {
        setApproval(null);
        setApprovalStages([]);
        setApprovalActions([]);
      } else {
        throw e;
      }
    }

    try {
      const queue = await getMyApprovalQueue();
      setMyApprovalQueue(queue.items || []);
    } catch {
      setMyApprovalQueue([]);
    }
  }, [approvalsUsable, docId]);

  const load = React.useCallback(async () => {
    if (!ready) return;
    if (!docId) return;
    setLoading(true);
    setApprovalLoaded(false);
    try {
      const [latest, v, docMeta] = await Promise.all([
        getEditorLatest(docId),
        listEditorVersions(docId, 50),
        getEditorDocumentMeta(docId).catch(() => null),
      ]);

      let displayVersion: EditorVersion | null = latest.version || null;
      if (viewVersion) {
        displayVersion = await getEditorVersion(docId, viewVersion);
      }

      const rawFolderPath = Array.isArray(docMeta?.folderPath)
        ? docMeta.folderPath
        : Array.isArray(docMeta?.folder_path)
          ? docMeta.folder_path
          : [];
      const nextFolderPath = rawFolderPath
        .map((segment) => String(segment || "").trim())
        .filter(Boolean);

      const nextDoc: TipTapEditorValue | undefined = displayVersion?.content
        ? (displayVersion.content as any)
        : (JSON.parse(JSON.stringify(EMPTY_EDITOR_DOC)) as TipTapEditorValue);

      setHeadVersion(latest.head.current_version_number);
      setDoc(nextDoc);
      const nextTitle = docMeta?.title || displayVersion?.commit_message || "Untitled";
      setTitle(nextTitle);
      setTitleInput(nextTitle);
      setDocFolderPath(nextFolderPath);
      setVersions(v.versions || []);
      setLatestVersionCreatedAt(displayVersion?.created_at || null);

      savedVersionContentRef.current = nextDoc;
      savedVersionJsonRef.current = nextDoc ? JSON.stringify(nextDoc) : null;
      lastAutosavedJsonRef.current = savedVersionJsonRef.current;
      setDraftBanner(null);
      setAutosaveStatus("idle");
      setAutosavedAt(null);

      await refreshApprovalState();
    } finally {
      setApprovalLoaded(true);
      setLoading(false);
    }
  }, [docId, ready, refreshApprovalState, viewVersion]);

  const maybeRestoreDraft = React.useCallback(async () => {
    if (!canEdit) return;
    if (isViewingFixedVersion) return;
    if (isApprovalActive) return;
    if (loading) return;
    if (!docId) return;

    try {
      const res = await getEditorDraft(docId);
      const draft = res?.draft;
      if (!draft?.content) return;
      if (draft.base_version_number !== headVersion) return;
      if (!draft.updated_at || !latestVersionCreatedAt) return;
      if (new Date(draft.updated_at).getTime() <= new Date(latestVersionCreatedAt).getTime()) return;

      const draftJson = JSON.stringify(draft.content);
      const versionJson = savedVersionJsonRef.current;
      if (versionJson && draftJson === versionJson) return;

      setDoc(draft.content as any);
      lastAutosavedJsonRef.current = draftJson;
      setAutosaveStatus("saved");
      setAutosavedAt(draft.updated_at);
      setDraftBanner({ updatedAt: draft.updated_at });
    } catch (e: any) {
      if (e?.status === 404) return;
      // ignore draft restore errors
    }
  }, [canEdit, docId, headVersion, isApprovalActive, isViewingFixedVersion, latestVersionCreatedAt, loading]);

  const acquireLock = React.useCallback(async (): Promise<{ status: "active"; sessionId: string } | { status: "locked"; activeSession: any | null }> => {
    if (!canEdit) return { status: "locked", activeSession: null };
    if (isViewingFixedVersion) return { status: "locked", activeSession: null };
    if (isApprovalActive) return { status: "locked", activeSession: null };
    setLockState({ state: "acquiring" });
    try {
      const res = await createEditSession(docId, 120);
      setLockState({ state: "active", sessionId: res.id });
      startHeartbeat(res.id);
      return { status: "active", sessionId: res.id };
    } catch (e: any) {
      const status = e?.status;
      const data = e?.data;
      if (status === 409) {
        const activeSession = data?.activeSession || null;
        setLockState({ state: "locked", activeSession });
        return { status: "locked", activeSession };
      }
      setLockState({ state: "idle" });
      throw e;
    }
  }, [canEdit, docId, isApprovalActive, isViewingFixedVersion, startHeartbeat]);

  React.useEffect(() => {
    if (!ready) return;
    void load().catch((e) => {
      toast({ title: "Failed to load document", description: e?.message || "Unknown error", variant: "destructive" });
    });
  }, [load, ready, toast]);

  React.useEffect(() => {
    void maybeRestoreDraft();
  }, [maybeRestoreDraft]);

  React.useEffect(() => {
    if (lockState.state === "active") activeSessionIdRef.current = lockState.sessionId;
    else activeSessionIdRef.current = null;
  }, [lockState]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stopHeartbeat();
      clearAutosaveTimer();
      const s = activeSessionIdRef.current;
      if (s) void revokeEditSession(s).catch(() => { });
    };
  }, [clearAutosaveTimer, stopHeartbeat]);

  // Release the lock when entering read-only modes
  React.useEffect(() => {
    if (!(isViewingFixedVersion || isApprovalActive)) return;
    if (lockState.state !== "active") return;
    const sid = lockState.sessionId;
    stopHeartbeat();
    clearAutosaveTimer();
    setEditRequested(false);
    setLockState({ state: "idle" });
    void revokeEditSession(sid).catch(() => { });
  }, [clearAutosaveTimer, isApprovalActive, isViewingFixedVersion, lockState, stopHeartbeat]);

  // Acquire a lock when editing is allowed
  React.useEffect(() => {
    if (!canEdit) return;
    if (!editRequested) return;
    if (isViewingFixedVersion) return;
    if (isApprovalActive) return;
    if (!approvalLoaded) return;
    if (lockState.state === "active" || lockState.state === "acquiring" || lockState.state === "locked") return;

    void acquireLock().catch((e) => {
      toast({ title: "Could not acquire edit lock", description: e?.message || "Unknown error", variant: "destructive" });
    });
  }, [acquireLock, approvalLoaded, canEdit, editRequested, isApprovalActive, isViewingFixedVersion, lockState.state, toast]);

  React.useEffect(() => {
    if (!canEdit) return;
    if (isViewingFixedVersion) return;
    if (isApprovalActive) return;
    if (!approvalLoaded) return;
    if (!editRequested) setEditRequested(true);
  }, [approvalLoaded, canEdit, editRequested, isApprovalActive, isViewingFixedVersion]);

  React.useEffect(() => {
    if (canActAsReviewer) return;
    setReviewerMessage("");
    setReviewerAction(null);
  }, [canActAsReviewer]);

  const flushAutosave = React.useCallback(async (opts?: { force?: boolean }) => {
    if (!canEdit) return;
    if (isViewingFixedVersion) return;
    if (isApprovalActive) return;
    if (lockState.state !== "active") return;
    if (!doc) return;

    const nextJson = JSON.stringify(doc);
    if (lastAutosavedJsonRef.current === nextJson) return;

    if (!opts?.force) {
      const now = Date.now();
      const minIntervalMs = 10_000;
      if (now - lastAutosaveSentAtRef.current < minIntervalMs) {
        const wait = minIntervalMs - (now - lastAutosaveSentAtRef.current);
        clearAutosaveTimer();
        autosaveTimerRef.current = window.setTimeout(() => {
          void flushAutosave();
        }, wait);
        return;
      }
    }

    setAutosaveStatus("saving");
    try {
      const contentText = extractTextFromTiptap(doc);
      const res = await saveEditorDraft(docId, {
        sessionId: lockState.sessionId,
        baseVersionNumber: headVersion,
        content: doc,
        contentText,
      });
      lastAutosavedJsonRef.current = nextJson;
      lastAutosaveSentAtRef.current = Date.now();
      setAutosaveStatus("saved");
      setAutosavedAt(res?.draft?.updated_at || new Date().toISOString());
    } catch {
      setAutosaveStatus("error");
      try {
        window.localStorage.setItem(
          `briefly.editor.draft.${docId}`,
          JSON.stringify({ updatedAt: new Date().toISOString(), baseVersionNumber: headVersion, content: doc })
        );
      } catch { }
    }
  }, [canEdit, clearAutosaveTimer, doc, docId, headVersion, isApprovalActive, isViewingFixedVersion, lockState]);

  const requestEditMode = React.useCallback(async () => {
    setEditRequested(true);
    if (!canEdit) return;
    if (isViewingFixedVersion) return;
    if (isApprovalActive) return;
    if (lockState.state === "active" || lockState.state === "acquiring") return;
    try {
      const result = await acquireLock();
      if (result?.status === "locked") {
        const owner = formatUserLabel(result.activeSession?.editor_user_id, currentUserId, orgUserLabels);
        const since = formatTimeAgoShort(result.activeSession?.created_at);
        toast({
          title: "Still read-only",
          description: since
            ? `Currently locked by ${owner} (${since}).`
            : `Currently locked by ${owner}.`,
        });
      }
    } catch (e: any) {
      toast({ title: "Could not acquire edit lock", description: e?.message || "Unknown error", variant: "destructive" });
    }
  }, [acquireLock, canEdit, currentUserId, isApprovalActive, isViewingFixedVersion, lockState.state, orgUserLabels, toast]);

  React.useEffect(() => {
    if (!canEdit) return;
    if (isViewingFixedVersion) return;
    if (isApprovalActive) return;
    if (lockState.state !== "active") return;
    if (!doc) return;

    clearAutosaveTimer();
    autosaveTimerRef.current = window.setTimeout(() => {
      void flushAutosave();
    }, 1200);

    return () => {
      clearAutosaveTimer();
    };
  }, [canEdit, clearAutosaveTimer, doc, flushAutosave, isApprovalActive, isViewingFixedVersion, lockState]);

  React.useEffect(() => {
    // Load templates lazily (needed for submit UI)
    if (!canSubmitApproval) return;
    void (async () => {
      try {
        const res = await listApprovalTemplates();
        const list = res.templates || [];
        setApprovalTemplates(list);
        const def = list.find((t) => t.is_default) || list[0];
        if (def) setSelectedTemplateId(def.id);
      } catch {
        // ignore
      }
    })();
  }, [canSubmitApproval]);

  React.useEffect(() => {
    let active = true;

    const loadOrgUsers = async () => {
      if (!ready) return;
      const orgId = getApiContext().orgId;
      if (!orgId) return;

      try {
        const users = await apiFetch<any[]>(`/orgs/${orgId}/users`);
        if (!active || !Array.isArray(users)) return;

        const nextMap: Record<string, string> = {};
        for (const u of users) {
          const id = String(u?.userId || u?.id || u?.username || "").trim();
          if (!id) continue;

          const label = String(u?.displayName || u?.app_users?.display_name || u?.email || id).trim() || id;
          nextMap[id] = label;
        }

        setOrgUserLabels(nextMap);
      } catch {
        // ignore; fall back to user id labels
      }
    };

    void loadOrgUsers();

    return () => {
      active = false;
    };
  }, [ready]);

  React.useEffect(() => {
    if (!previewOpen || !previewVersionNumber) return;
    setPreviewLoading(true);
    setPreviewVersion(null);
    void (async () => {
      try {
        const v = await getEditorVersion(docId, previewVersionNumber);
        setPreviewVersion(v);
      } catch (e: any) {
        toast({ title: "Failed to load version", description: e?.message || "Unknown error", variant: "destructive" });
        setPreviewOpen(false);
      } finally {
        setPreviewLoading(false);
      }
    })();
  }, [docId, previewOpen, previewVersionNumber, toast]);

  // Lightweight polling while an approval is active (keeps status/timeline fresh)
  React.useEffect(() => {
    if (!approvalsUsable) return;
    if (!approval || approval.status !== "in_progress") return;

    const interval = window.setInterval(() => {
      void refreshApprovalState().catch(() => {
        // ignore polling failures
      });
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [approval?.id, approval?.status, approvalsUsable, refreshApprovalState]);

  const createVersionFromCurrentDoc = React.useCallback(async (opts?: { commitMessageOverride?: string }) => {
    if (!canEdit) throw new Error("Forbidden");
    if (isViewingFixedVersion) throw new Error("Read-only view");
    if (isApprovalActive) throw new Error("Editing is disabled while this document is under approval");
    if (lockState.state !== "active") throw new Error("Locked");
    if (!doc) throw new Error("Nothing to save");

    const contentText = extractTextFromTiptap(doc);
    const res = await saveEditorVersion(docId, {
      sessionId: lockState.sessionId,
      expectedCurrentVersion: headVersion,
      commitMessage: opts?.commitMessageOverride ?? (commitMessage.trim() || undefined),
      content: doc,
      contentText,
    });

    setHeadVersion(res.head.current_version_number);
    setLatestVersionCreatedAt(res.version.created_at);
    savedVersionContentRef.current = doc;
    savedVersionJsonRef.current = JSON.stringify(doc);
    lastAutosavedJsonRef.current = savedVersionJsonRef.current;
    setDraftBanner(null);
    setCommitMessage("");

    const v = await listEditorVersions(docId, 50);
    setVersions(v.versions || []);

    return res.version;
  }, [canEdit, commitMessage, doc, docId, headVersion, isApprovalActive, isViewingFixedVersion, lockState.state]);

  const doSave = React.useCallback(async () => {
    if (!canEdit) return;
    if (isViewingFixedVersion) {
      toast({ title: "Read-only view", description: "You're viewing a fixed version.", variant: "destructive" });
      return;
    }
    if (isApprovalActive) {
      toast({ title: "In approval", description: "Editing is disabled while this document is under approval.", variant: "destructive" });
      return;
    }
    if (!isDraftDirty) {
      toast({ title: "No changes", description: "Make a small edit before saving a new version." });
      return;
    }

    setSaving(true);
    try {
      const v = await createVersionFromCurrentDoc();
      toast({ title: "Saved", description: `Version ${v.version_number} created.` });
    } catch (e: any) {
      const msg = e?.message || "Unknown error";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [canEdit, createVersionFromCurrentDoc, isApprovalActive, isDraftDirty, isViewingFixedVersion, toast]);

  const revertToSavedVersion = React.useCallback(async () => {
    const saved = savedVersionContentRef.current;
    if (!saved) return;

    setDoc(saved);
    setDraftBanner(null);

    const json = savedVersionJsonRef.current || JSON.stringify(saved);
    savedVersionJsonRef.current = json;
    lastAutosavedJsonRef.current = json;

    if (!canEdit) return;
    if (isViewingFixedVersion) return;
    if (isApprovalActive) return;
    if (lockState.state !== "active") return;

    try {
      setAutosaveStatus("saving");
      const contentText = extractTextFromTiptap(saved);
      const res = await saveEditorDraft(docId, {
        sessionId: lockState.sessionId,
        baseVersionNumber: headVersion,
        content: saved,
        contentText,
      });
      setAutosaveStatus("saved");
      setAutosavedAt(res?.draft?.updated_at || new Date().toISOString());
    } catch {
      setAutosaveStatus("error");
    }
  }, [canEdit, docId, headVersion, isApprovalActive, isViewingFixedVersion, lockState]);

  const doRestore = async (target: number) => {
    if (!canEdit) return;
    if (isViewingFixedVersion) {
      toast({ title: "Read-only view", description: "You're viewing a fixed version.", variant: "destructive" });
      return;
    }
    if (isApprovalActive) {
      toast({ title: "In approval", description: "Editing is disabled while this document is under approval.", variant: "destructive" });
      return;
    }
    if (lockState.state !== "active") {
      toast({ title: "Locked", description: "You don't have an active edit session.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await restoreEditorVersion(docId, {
        sessionId: lockState.sessionId,
        expectedCurrentVersion: headVersion,
        targetVersionNumber: target,
        commitMessage: `Restore v${target}`,
      });
      setHeadVersion(res.head.current_version_number);
      toast({ title: "Restored", description: `Created version ${res.head.current_version_number} from v${target}.` });
      await load();
    } catch (e: any) {
      toast({ title: "Restore failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const doSubmitApproval = React.useCallback(async (opts?: { versionNumber?: number }) => {
    if (!canSubmitApproval) return;
    setApprovalLoading(true);
    try {
      await submitApproval(docId, {
        templateId: selectedTemplateId || undefined,
        versionNumber: opts?.versionNumber,
        message: submitMessage.trim() || undefined,
      });
      await refreshApprovalState();
      toast({ title: "Submitted", description: "Approval workflow started." });
      window.dispatchEvent(new Event("approvalUpdated"));
    } catch (e: any) {
      toast({ title: "Submit failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setApprovalLoading(false);
    }
  }, [canSubmitApproval, docId, refreshApprovalState, selectedTemplateId, submitMessage, toast]);

  const doCancelApproval = async () => {
    if (!approval) return;
    if (!canSubmitApproval) return;
    setApprovalLoading(true);
    try {
      await cancelApproval(approval.id);
      toast({ title: "Cancelled", description: "Approval request cancelled." });
      await refreshApprovalState();
      window.dispatchEvent(new Event("approvalUpdated"));
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setApprovalLoading(false);
    }
  };

  const doReviewerAction = React.useCallback(async (kind: "approve" | "reject" | "comment") => {
    if (!approval) return;
    if (!canActAsReviewer) return;

    const message = reviewerMessage.trim();
    if ((kind === "reject" || kind === "comment") && !message) {
      toast({
        title: kind === "reject" ? "Reason required" : "Message required",
        description: kind === "reject" ? "Add a rejection reason." : "Add a comment.",
        variant: "destructive",
      });
      return;
    }

    setReviewerAction(kind);
    try {
      if (kind === "approve") {
        await approve(approval.id, message || undefined);
        toast({ title: "Approved", description: "Your approval was recorded." });
      } else if (kind === "reject") {
        await reject(approval.id, message);
        toast({ title: "Rejected", description: "Your rejection was recorded." });
      } else {
        await comment(approval.id, message);
        toast({ title: "Commented", description: "Comment added." });
      }

      setReviewerMessage("");
      await refreshApprovalState();
      window.dispatchEvent(new Event("approvalUpdated"));
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setReviewerAction(null);
    }
  }, [approval, canActAsReviewer, refreshApprovalState, reviewerMessage, toast]);

  const openVersionPreview = React.useCallback((versionNumber: number) => {
    setPreviewVersionNumber(versionNumber);
    setPreviewOpen(true);
  }, []);

  const requestRestoreVersion = React.useCallback((versionNumber: number) => {
    setRestoreTargetVersion(versionNumber);
    setRestoreConfirmOpen(true);
  }, []);

  const openInspector = React.useCallback((tab: "versions" | "approval") => {
    setInspectorTab(tab);
    if (tab === "approval") setApprovalPanelTab("overview");
    setInspectorOpen(true);
  }, []);

  const loadRecoverableDraft = React.useCallback(() => {
    const content = recoverableDraftRef.current;
    if (!content) return;
    setDoc(content);
    setRecoverableDraftMeta(null);
    toast({ title: "Draft loaded", description: "Loaded the previous draft (not a version)." });
  }, [toast]);

  const handleSubmitApprovalClick = React.useCallback(() => {
    if (!canSubmitApproval) return;
    if (isDraftDirty && canEdit) {
      setSubmitGuardOpen(true);
      return;
    }
    void doSubmitApproval();
  }, [canEdit, canSubmitApproval, doSubmitApproval, isDraftDirty]);

  const saveAndSubmitApproval = React.useCallback(async () => {
    setSubmitGuardOpen(false);

    setSaving(true);
    try {
      const v = await createVersionFromCurrentDoc({
        commitMessageOverride: commitMessage.trim() || "Submit for approval",
      });
      await doSubmitApproval({ versionNumber: v.version_number });
    } catch (e: any) {
      toast({ title: "Save & submit failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [commitMessage, createVersionFromCurrentDoc, doSubmitApproval, toast]);

  const commitTitleRename = React.useCallback(async (candidate?: string) => {
    if (!canEdit) return;

    const currentTitle = (title || "Untitled").trim();
    const nextTitle = String(candidate ?? titleInput ?? "").trim();

    if (!nextTitle) {
      setTitleInput(currentTitle);
      return;
    }
    if (nextTitle === currentTitle) {
      setTitleInput(nextTitle);
      return;
    }

    setTitleSaving(true);
    try {
      const updated = await updateDocument(docId, { title: nextTitle } as any);
      const savedTitle = String((updated as any)?.title || nextTitle).trim() || "Untitled";
      setTitle(savedTitle);
      setTitleInput(savedTitle);
    } catch (e: any) {
      setTitleInput(currentTitle);
      toast({ title: "Rename failed", description: e?.message || "Could not rename document.", variant: "destructive" });
    } finally {
      setTitleSaving(false);
    }
  }, [canEdit, docId, title, titleInput, toast, updateDocument]);

  const confirmDeleteDocument = React.useCallback(async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      if (lockState.state === "active") {
        stopHeartbeat();
        clearAutosaveTimer();
        const sid = lockState.sessionId;
        setLockState({ state: "idle" });
        await revokeEditSession(sid).catch(() => { });
      }

      await removeDocument(docId);
      toast({ title: "Document deleted", description: "The document has been moved to the recycle bin." });
      router.push("/editor");
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message || "Could not delete document.", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }, [canDelete, clearAutosaveTimer, docId, lockState, removeDocument, router, stopHeartbeat, toast]);

  // Ctrl/Cmd+S saves current draft immediately
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = String(e.key || "").toLowerCase();
      if (key !== "s") return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.repeat) return;

      e.preventDefault();
      if (!editorEditable) return;
      if (saving) return;
      void flushAutosave({ force: true });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorEditable, flushAutosave, saving]);

  const activeLockSession = lockState.state === "locked" ? lockState.activeSession : null;
  const lockOwnerLabel = formatUserLabel(activeLockSession?.editor_user_id, currentUserId, orgUserLabels);
  const lockSinceLabel = activeLockSession?.created_at ? formatAppDateTime(activeLockSession.created_at) : null;
  const lockSinceAgo = formatTimeAgoShort(activeLockSession?.created_at);
  const lockExpiresLabel = activeLockSession?.expires_at ? formatAppDateTime(activeLockSession.expires_at) : null;
  const lockExpiresAgo = formatTimeAgoShort(activeLockSession?.expires_at);

  const lockBadge = (() => {
    if (isViewingFixedVersion) return <Badge variant="outline">Read-only</Badge>;
    if (!canEdit) return <Badge variant="outline">Read-only</Badge>;
    if (isApprovalActive || !editRequested) return <Badge variant="outline">Read-only</Badge>;
    if (lockState.state === "active") return <Badge className="bg-green-500/10 text-green-700 border-green-200">Editing</Badge>;
    if (lockState.state === "acquiring") return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Connecting</Badge>;
    if (lockState.state === "locked") return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 gap-1"><Lock className="h-3 w-3" />Read-only</Badge>;
    return <Badge variant="outline">Read-only</Badge>;
  })();

  const docStatusBadge = (() => {
    if (loading || isViewingFixedVersion) return null;

    const status = String(approval?.status || "").toLowerCase();

    if (status === "approved") {
      return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">🟢 Approved</Badge>;
    }

    if (canActAsReviewer || status === "in_progress" || status === "draft") {
      return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">🔵 In Review</Badge>;
    }

    if (status === "rejected") {
      return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">🟡 Needs changes</Badge>;
    }

    if (status === "cancelled") {
      return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">🟡 Approval cancelled</Badge>;
    }

    if (isDraftDirty || autosaveStatus === "saving" || autosaveStatus === "error") {
      return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">🟡 Draft</Badge>;
    }

    return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">🟢 Saved</Badge>;
  })();

  const draftStatusLine = (() => {
    if (!canEdit || isViewingFixedVersion || isApprovalActive) return null;

    if (autosaveStatus === "saving") {
      return {
        text: "Saving draft...",
        className: "text-muted-foreground",
        state: "saving" as const,
      };
    }

    if (autosaveStatus === "error") {
      return {
        text: "Draft sync failed. Local backup kept.",
        className: "text-destructive",
        state: "error" as const,
      };
    }

    if (isDraftDirty) {
      return {
        text: "Unsaved draft changes",
        className: "text-amber-700",
        state: "dirty" as const,
      };
    }

    const savedAt = formatTimeHHMM(autosavedAt);
    if (savedAt) {
      return {
        text: `Draft saved at ${savedAt}`,
        className: "text-muted-foreground",
        state: "saved" as const,
      };
    }

    return {
      text: "Draft is up to date",
      className: "text-muted-foreground",
      state: "idle" as const,
    };
  })();

  return (
    <AppLayout>
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-4 md:px-6 py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => router.push("/editor")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  {loading ? (
                    <h1 className="text-sm md:text-base font-semibold text-foreground truncate tracking-tight">
                      Document Studio
                    </h1>
                  ) : canEdit ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={titleInput}
                        onChange={(e) => setTitleInput(e.target.value)}
                        onBlur={() => void commitTitleRename()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setTitleInput(title || "Untitled");
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        disabled={titleSaving}
                        className="h-7 md:h-8 w-[120px] sm:w-[220px] md:w-[420px] max-w-full border-transparent bg-transparent px-1 -ml-1 text-sm md:text-base font-semibold tracking-tight shadow-none focus-visible:border-border/40 focus-visible:ring-0"
                        aria-label="Document title"
                      />
                      {titleSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                    </div>
                  ) : (
                    <h1 className="text-sm md:text-base font-semibold text-foreground truncate tracking-tight">
                      {title}
                    </h1>
                  )}
                  <p className="text-[11px] md:text-xs text-muted-foreground truncate mt-0.5 opacity-60">
                    {loading ? "..." : `/${docFolderPath.length ? docFolderPath.join("/") : "Root"}`}
                  </p>
                </div>
                <div className="ml-1 hidden sm:flex items-center gap-2">
                  {lockBadge}
                  {docStatusBadge}
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <Button
                  variant={inspectorOpen && inspectorTab === "versions" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground transition-all"
                  onClick={() => openInspector("versions")}
                  title="History"
                >
                  <History className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">History</span>
                </Button>

                <Button
                  variant={inspectorOpen && inspectorTab === "approval" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground transition-all"
                  onClick={() => openInspector("approval")}
                  title="Approval"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Approval</span>
                </Button>

                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={deleting || loading}
                  >
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    <span className="hidden md:inline">Delete</span>
                  </Button>
                )}

                <Button
                  size="sm"
                  className="h-8 gap-1.5 px-2 sm:px-3"
                  onClick={() => void doSave()}
                  disabled={!editorEditable || saving || !isDraftDirty}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Save version</span>
                  <span className="sm:hidden">Save</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        {lockState.state === "locked" && !isViewingFixedVersion && !isApprovalActive && (
          <div className="sticky top-[72px] z-20 border-b border-amber-200/50 bg-amber-50/10 backdrop-blur-sm">
            <div className="mx-auto max-w-7xl px-4 md:px-6 py-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-2 text-sm">
                <Lock className="mt-0.5 h-4 w-4 text-amber-700" />
                <div>
                  <div className="font-medium text-amber-800">Read-only: locked by {lockOwnerLabel}</div>
                  <div className="text-xs text-amber-700/90">
                    {lockSinceAgo
                      ? `Locked ${lockSinceAgo}`
                      : lockSinceLabel
                        ? `Locked at ${lockSinceLabel}`
                        : "Another editor currently has write access."}
                    {lockExpiresAgo ? ` • lock refresh ${lockExpiresAgo}` : ""}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => void requestEditMode()}
                >
                  Request edit access
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => void load()}
                  disabled={loading}
                >
                  Refresh lock status
                </Button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 px-4 md:px-6 py-6 lg:pr-[480px]">
          <div className="mx-auto max-w-6xl">

            <div className="space-y-4">

              {loading ? (
                <Card className="border-border/40 bg-card/50">
                  <CardContent className="p-6">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="mt-3 h-64 w-full" />
                  </CardContent>
                </Card>
              ) : (
                <>
                  {canActAsReviewer && (
                    <div className="rounded-lg border border-primary/25 bg-primary/[0.05] px-3 py-3 space-y-2">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">Review pending for you</div>
                          <div className="text-xs text-muted-foreground">
                            {reviewerQueueItem?.stage
                              ? `Stage ${reviewerQueueItem.stage.stage_order}: ${reviewerQueueItem.stage.stage_id}`
                              : "You are assigned as an approver for this document."}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => openInspector("approval")}
                          >
                            Open review panel
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Textarea
                          value={reviewerMessage}
                          onChange={(e) => setReviewerMessage(e.target.value)}
                          placeholder="Comment (required for reject/comment, optional for approve)"
                          className="min-h-[72px] bg-background"
                          disabled={Boolean(reviewerAction)}
                        />
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            size="sm"
                            className="h-8 gap-1.5 min-w-[92px]"
                            onClick={() => void doReviewerAction("approve")}
                            disabled={Boolean(reviewerAction)}
                          >
                            {reviewerAction === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 min-w-[92px]"
                            onClick={() => void doReviewerAction("comment")}
                            disabled={Boolean(reviewerAction)}
                          >
                            {reviewerAction === "comment" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Comment
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 min-w-[92px]"
                            onClick={() => void doReviewerAction("reject")}
                            disabled={Boolean(reviewerAction)}
                          >
                            {reviewerAction === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isApprovalActive && (
                    <div className="rounded-lg border border-amber-200/50 bg-amber-50/10 px-3 py-2 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div>
                          <div className="text-sm font-medium">This document is under approval.</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {isViewingFixedVersion
                              ? "You are reviewing a submitted snapshot. Open versions to switch context."
                              : "Editing is disabled until the workflow completes or is cancelled."}
                          </div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="h-8" onClick={() => router.push("/approvals")}>Open approvals</Button>
                    </div>
                  )}

                  <TipTapEditor
                    value={doc}
                    onChange={(next) => setDoc(next)}
                    onEditorReady={setTiptapInstance}
                    placeholder="Type and format like Notion..."
                    editable={editorEditable}
                    showToolbar={editorEditable}
                    showBubbleMenu={editorEditable}
                    toolbarStickyOffset={88}
                  />
                </>
              )}

              {/* Mobile fallback: show AI panel below editor */}
              <div className="mt-6 lg:hidden">
                <AiSidebar editor={tiptapInstance} />
              </div>

            </div>
          </div>
        </main>

        {/* Fixed AI panel (desktop): flush to the right edge */}
        <div
          className="hidden lg:block fixed right-0 top-[72px] z-10 h-[calc(100svh-72px)] w-[420px]"
        >
          <AiSidebar
            editor={tiptapInstance}
            className="h-full rounded-none border-0 border-l border-border/40 bg-background/95"
          />
        </div>

        <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
          <SheetContent side="right" className="w-full max-w-full sm:max-w-xl p-0">
            <div className="h-full flex flex-col">
              <SheetHeader className="px-4 py-4 border-b border-border/40">
                <SheetTitle>{inspectorTab === "versions" ? "Versions" : "Approval"}</SheetTitle>
                <SheetDescription>
                  {inspectorTab === "versions"
                    ? "Version history and restore controls."
                    : "Approval status, timeline, and submission controls."}
                </SheetDescription>
              </SheetHeader>

              <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
                <Button
                  size="sm"
                  variant={inspectorTab === "versions" ? "default" : "outline"}
                  className="h-8 gap-1.5"
                  onClick={() => setInspectorTab("versions")}
                >
                  <History className="h-3.5 w-3.5" />
                  Versions
                </Button>
                <Button
                  size="sm"
                  variant={inspectorTab === "approval" ? "default" : "outline"}
                  className="h-8 gap-1.5"
                  onClick={() => {
                    setInspectorTab("approval");
                    setApprovalPanelTab("overview");
                  }}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Approval
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {inspectorTab === "versions" ? (
                    <>
                      <Card className="border-border/40 bg-card/50">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <RotateCcw className="h-4 w-4" />
                            Restore Center
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-3">
                          {recoverableDraftMeta ? (
                            <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2 space-y-2">
                              <div className="text-xs text-muted-foreground">
                                {recoverableDraftMeta.label} ({formatAppDateTime(recoverableDraftMeta.capturedAt)}).
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={loadRecoverableDraft}
                                disabled={!editorEditable || saving}
                              >
                                Load previous draft
                              </Button>
                            </div>
                          ) : null}

                          {draftBanner ? (
                            <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2 space-y-2">
                              <div className="text-xs text-muted-foreground">
                                Restored autosaved draft ({formatAppDateTime(draftBanner.updatedAt)}).
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => void revertToSavedVersion()}
                                disabled={saving || lockState.state !== "active"}
                              >
                                Revert to saved version
                              </Button>
                            </div>
                          ) : null}

                          {!recoverableDraftMeta && !draftBanner ? (
                            <div className="text-sm text-muted-foreground">No restore actions right now.</div>
                          ) : null}
                        </CardContent>
                      </Card>

                      <Card className="border-border/40 bg-card/50">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <History className="h-4 w-4" />
                            Versions
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            {versions.length === 0 ? (
                              <div className="text-sm text-muted-foreground">No versions</div>
                            ) : (
                              versions.map((v) => (
                                <div
                                  key={v.id}
                                  role="button"
                                  tabIndex={0}
                                  className={cn(
                                    "rounded-md border border-border/40 bg-background/40 px-3 py-2 cursor-pointer hover:bg-muted/20 transition-colors",
                                    v.version_number === headVersion && "border-primary/40"
                                  )}
                                  onClick={() => openVersionPreview(v.version_number)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      openVersionPreview(v.version_number);
                                    }
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <div className="text-sm font-medium">v{v.version_number}</div>
                                        {v.version_number === headVersion && (
                                          <Badge variant="outline" className="text-[10px] h-5">Head</Badge>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground truncate">
                                        {v.commit_message || "(no message)"}
                                      </div>
                                      <div className="mt-1 text-[11px] text-muted-foreground truncate">
                                        {formatAppDateTime(v.created_at)}
                                        {v.created_by ? ` | ${String(v.created_by) === String(currentUserId) ? "You" : String(v.created_by).slice(0, 8)}` : ""}
                                      </div>
                                    </div>
                                    {canEdit && !isViewingFixedVersion && !isApprovalActive && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1.5"
                                        disabled={saving || lockState.state !== "active" || v.version_number === headVersion}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          requestRestoreVersion(v.version_number);
                                        }}
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        Restore
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    <Card className="border-border/40 bg-card/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" />
                          Approval
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        {!approvalsUsable ? (
                          <div className="text-sm text-muted-foreground">
                            Approvals are not enabled for this organization.
                          </div>
                        ) : approval ? (
                          <div className="space-y-3">
                            <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 min-w-0">
                                  <Badge variant="outline" className="capitalize">{approval.status.replace("_", " ")}</Badge>
                                  <Badge variant="outline">v{approval.submitted_version_number}</Badge>
                                  <Badge variant="outline" className="max-w-[240px] truncate">
                                    {appliedTemplate?.name ? `Template: ${appliedTemplate.name}` : "Template: Default"}
                                  </Badge>
                                </div>
                                {canCancelThisApproval && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => void doCancelApproval()}
                                    disabled={approvalLoading}
                                  >
                                    Cancel request
                                  </Button>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Submitted {formatAppDateTime(approval.submitted_at)}
                              </div>
                            </div>

                            <Tabs
                              value={approvalPanelTab}
                              onValueChange={(v) => setApprovalPanelTab(v as "overview" | "comments" | "timeline")}
                              className="w-full"
                            >
                              <TabsList className="h-8 inline-flex justify-start">
                                <TabsTrigger value="overview" className="h-7 text-xs">Overview</TabsTrigger>
                                <TabsTrigger value="comments" className="h-7 text-xs gap-1.5">
                                  <MessageSquare className="h-3 w-3" />
                                  Comments
                                  <span className="rounded-full bg-muted px-1.5 py-0 text-[10px]">{commentActions.length}</span>
                                </TabsTrigger>
                                <TabsTrigger value="timeline" className="h-7 text-xs gap-1.5">
                                  <Clock className="h-3 w-3" />
                                  Requests
                                  <span className="rounded-full bg-muted px-1.5 py-0 text-[10px]">{nonCommentActions.length}</span>
                                </TabsTrigger>
                              </TabsList>

                              <TabsContent value="overview" className="mt-3 space-y-3">
                                {canActAsReviewer && (
                                  <div className="space-y-2 rounded-md border border-border/40 bg-background/40 px-3 py-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs font-medium text-muted-foreground">Your review actions</div>
                                      {reviewerQueueItem?.stage && (
                                        <Badge variant="outline" className="text-[10px]">
                                          Stage {reviewerQueueItem.stage.stage_order}
                                        </Badge>
                                      )}
                                    </div>
                                    <Textarea
                                      value={reviewerMessage}
                                      onChange={(e) => setReviewerMessage(e.target.value)}
                                      placeholder="Comment (required for reject/comment, optional for approve)"
                                      className="min-h-[78px]"
                                      disabled={Boolean(reviewerAction)}
                                    />
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      <Button
                                        size="sm"
                                        className="h-8 gap-1.5"
                                        onClick={() => void doReviewerAction("approve")}
                                        disabled={Boolean(reviewerAction)}
                                      >
                                        {reviewerAction === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                        Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1.5"
                                        onClick={() => void doReviewerAction("comment")}
                                        disabled={Boolean(reviewerAction)}
                                      >
                                        {reviewerAction === "comment" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                        Comment
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1.5"
                                        onClick={() => void doReviewerAction("reject")}
                                        disabled={Boolean(reviewerAction)}
                                      >
                                        {reviewerAction === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                        Reject
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {approval.status === "rejected" && approval.rejection_reason && (
                                  <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
                                    <div className="text-xs font-medium">Rejected</div>
                                    <div className="text-xs text-muted-foreground mt-1">{approval.rejection_reason}</div>
                                  </div>
                                )}

                                <Separator />
                                <div className="space-y-2">
                                  <div className="text-xs font-medium text-muted-foreground">Stages</div>
                                  <div className="rounded-md border border-border/40 bg-background/40 divide-y divide-border/30">
                                    {approvalStages.map((s: any) => (
                                      <div key={s.id} className="flex items-center justify-between text-sm px-3 py-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-muted-foreground">{s.stage_order}.</span>
                                          <span className="truncate">{s.stage_id}</span>
                                        </div>
                                        <Badge variant="outline" className="capitalize">{String(s.status).replace("_", " ")}</Badge>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {canResubmitApproval && (
                                  <>
                                    <Separator />
                                    <div className="space-y-2">
                                      <div className="text-xs font-medium text-muted-foreground">Resubmit for approval</div>
                                      {approvalTemplates.length > 0 ? (
                                        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={!canSubmitApproval || approvalLoading}>
                                          <SelectTrigger className="h-8">
                                            <SelectValue placeholder="Select approval template" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {approvalTemplates.map((t) => (
                                              <SelectItem key={t.id} value={t.id}>
                                                {t.name}{t.is_default ? " (Default)" : ""}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <Input value={""} placeholder="No templates found (server default)" className="h-8" disabled />
                                      )}
                                      <Textarea
                                        value={submitMessage}
                                        onChange={(e) => setSubmitMessage(e.target.value)}
                                        placeholder="Message to reviewers (optional)"
                                        className="min-h-[80px]"
                                        disabled={!canSubmitApproval || approvalLoading}
                                      />
                                      <Button
                                        size="sm"
                                        className="h-8 gap-1.5"
                                        onClick={handleSubmitApprovalClick}
                                        disabled={!canSubmitApproval || approvalLoading}
                                      >
                                        {approvalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                        Resubmit
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </TabsContent>

                              <TabsContent value="comments" className="mt-3 space-y-3">
                                {canActAsReviewer && (
                                  <div className="space-y-2">
                                    <div className="text-xs font-medium text-muted-foreground">Add comment</div>
                                    <Textarea
                                      value={reviewerMessage}
                                      onChange={(e) => setReviewerMessage(e.target.value)}
                                      placeholder="Write a review comment"
                                      className="min-h-[78px]"
                                      disabled={Boolean(reviewerAction)}
                                    />
                                    <div className="flex justify-end">
                                      <Button
                                        size="sm"
                                        className="h-8 gap-1.5"
                                        onClick={() => void doReviewerAction("comment")}
                                        disabled={Boolean(reviewerAction)}
                                      >
                                        {reviewerAction === "comment" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                                        Add comment
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-2 max-h-[360px] overflow-auto pr-2">
                                  {commentActions.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">No comments yet.</div>
                                  ) : (
                                    commentActions.map((a) => (
                                      <div key={a.id} className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="text-xs font-medium">Comment</div>
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {formatAppDateTime(a.created_at)}
                                          </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1 break-words">{a.message || "(empty comment)"}</div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </TabsContent>

                              <TabsContent value="timeline" className="mt-3 space-y-3">
                                <div className="text-xs font-medium text-muted-foreground">Request timeline</div>
                                <div className="space-y-2 max-h-[420px] overflow-auto pr-2">
                                  {nonCommentActions.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">No requests yet.</div>
                                  ) : (
                                    nonCommentActions.map((a) => (
                                      <div key={a.id} className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-xs font-medium capitalize">{String(a.action_type).replace("_", " ")}</span>
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {formatAppDateTime(a.created_at)}
                                          </span>
                                        </div>
                                        {a.message && <div className="text-xs text-muted-foreground mt-1 break-words">{a.message}</div>}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </TabsContent>
                            </Tabs>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="text-sm text-muted-foreground">No approval workflow running for this doc.</div>
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-muted-foreground">Submit for approval</div>
                              {approvalTemplates.length > 0 ? (
                                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={!canSubmitApproval || approvalLoading}>
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Select approval template" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {approvalTemplates.map((t) => (
                                      <SelectItem key={t.id} value={t.id}>
                                        {t.name}{t.is_default ? " (Default)" : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  value={""}
                                  placeholder="No templates found (server default)"
                                  className="h-8"
                                  disabled
                                />
                              )}
                              <Textarea
                                value={submitMessage}
                                onChange={(e) => setSubmitMessage(e.target.value)}
                                placeholder="Message to reviewers (optional)"
                                className="min-h-[80px]"
                                disabled={!canSubmitApproval || approvalLoading}
                              />
                              <Button
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={handleSubmitApprovalClick}
                                disabled={!canSubmitApproval || approvalLoading}
                              >
                                {approvalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                Submit
                              </Button>
                              {!canSubmitApproval && (
                                <div className="text-xs text-muted-foreground">You don't have permission to submit for approval.</div>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>

        {/* Version preview */}
        <Dialog
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) {
              setPreviewVersionNumber(null);
              setPreviewVersion(null);
            }
          }}
        >
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                Version {previewVersionNumber ? `v${previewVersionNumber}` : ""}
              </DialogTitle>
              <DialogDescription>
                Read-only snapshot of this version.
              </DialogDescription>
            </DialogHeader>

            {previewLoading || !previewVersion ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-72" />
                <Skeleton className="h-[360px] w-full" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="text-sm font-medium truncate">{previewVersion.commit_message || "(no message)"}</div>
                  <div className="text-xs text-muted-foreground">
                    {previewVersion.created_at ? formatAppDateTime(previewVersion.created_at) : ""}
                    {previewVersion.created_by
                      ? ` | ${String(previewVersion.created_by) === String(currentUserId) ? "You" : String(previewVersion.created_by).slice(0, 8)}`
                      : ""}
                  </div>
                </div>

                <ScrollArea className="h-[420px] pr-3">
                  <TipTapEditor
                    value={(previewVersion.content as any) || undefined}
                    editable={false}
                    showToolbar={false}
                    showBubbleMenu={false}
                    className="bg-background/40"
                  />
                </ScrollArea>
              </div>
            )}

            <DialogFooter>
              <div className="flex items-center justify-between w-full gap-2">
                <Button
                  variant="outline"
                  className="h-9 gap-1.5"
                  onClick={() => {
                    if (!previewVersionNumber) return;
                    router.push(`/editor/${docId}?version=${previewVersionNumber}`);
                    setPreviewOpen(false);
                    setPreviewVersionNumber(null);
                    setPreviewVersion(null);
                  }}
                >
                  <Eye className="h-4 w-4" />
                  Open full view
                </Button>

                <div className="flex items-center gap-2">
                  {canEdit && !isApprovalActive && !isViewingFixedVersion && previewVersionNumber !== null && (
                    <Button
                      variant="outline"
                      className="h-9 gap-1.5"
                      onClick={() => {
                        requestRestoreVersion(previewVersionNumber);
                        setPreviewOpen(false);
                        setPreviewVersionNumber(null);
                        setPreviewVersion(null);
                      }}
                      disabled={saving || lockState.state !== "active" || previewVersionNumber === headVersion}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore
                    </Button>
                  )}
                  <Button
                    className="h-9"
                    onClick={() => {
                      setPreviewOpen(false);
                      setPreviewVersionNumber(null);
                      setPreviewVersion(null);
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Restore confirmation */}
        <AlertDialog
          open={restoreConfirmOpen}
          onOpenChange={(open) => {
            setRestoreConfirmOpen(open);
            if (!open) setRestoreTargetVersion(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Restore {restoreTargetVersion ? `v${restoreTargetVersion}` : "version"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This creates a new version from the selected snapshot and loads it into the editor. Your current draft will be replaced in the editor, but we'll keep a copy so you can load it back.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={saving || !restoreTargetVersion}
                onClick={() => {
                  const target = restoreTargetVersion;
                  setRestoreConfirmOpen(false);
                  setRestoreTargetVersion(null);
                  if (!target) return;
                  if (doc) {
                    recoverableDraftRef.current = doc;
                    setRecoverableDraftMeta({ capturedAt: new Date().toISOString(), label: "Saved your draft before restore" });
                  }
                  setInspectorTab("versions");
                  setInspectorOpen(true);
                  void doRestore(target);
                }}
              >
                Restore
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
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
                    Are you sure you want to delete "{title}"? This will move it to the recycle bin.
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
              <AlertDialogCancel className="text-sm" disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void confirmDeleteDocument()}
                className="bg-red-500 hover:bg-red-600 text-white text-sm"
                disabled={deleting || !canDelete}
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Submit guardrails */}
        <AlertDialog open={submitGuardOpen} onOpenChange={setSubmitGuardOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved draft changes</AlertDialogTitle>
              <AlertDialogDescription>
                You have draft changes that are autosaved (not a version). Submitting for approval needs a version. Choose "Save & submit" to create a new version from your draft and submit it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving || approvalLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={saving || approvalLoading || !editorEditable} onClick={() => void saveAndSubmitApproval()}>
                Save & submit
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
