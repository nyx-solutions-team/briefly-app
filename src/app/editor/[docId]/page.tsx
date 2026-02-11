"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
import { AccessDenied } from "@/components/access-denied";
import { getOrgFeatures } from "@/lib/org-features";
import {
  createEditSession,
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
  getCurrentApproval,
  getApprovalActions,
  listApprovalTemplates,
  submitApproval,
  cancel as cancelApproval,
  type ApprovalAction,
  type ApprovalTemplate,
} from "@/lib/approval-api";
import { extractTextFromTiptap } from "@/lib/tiptap-text";
import { TipTapEditor, type TipTapEditorValue } from "@/components/editor/tiptap-editor";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  History,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LockState =
  | { state: "idle" }
  | { state: "acquiring" }
  | { state: "locked"; activeSession: any }
  | { state: "active"; sessionId: string };

export default function EditorDocPage() {
  const { hasPermission, bootstrapData } = useAuth();
  const features = getOrgFeatures(bootstrapData?.orgSettings);
  const editorEnabled = features.editorEnabled;
  const approvalsUsable = features.approvalsUsable;
  const ready = Boolean(bootstrapData);

  const canEdit = hasPermission("documents.update");
  const canCreate = hasPermission("documents.create");
  const canSubmitApproval = hasPermission("documents.version.manage") && approvalsUsable;
  const currentUserId = bootstrapData?.user?.id || null;

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

  return (
    <EditorDocPageInner
      ready={ready}
      approvalsUsable={approvalsUsable}
      canEdit={canEdit}
      canCreate={canCreate}
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
  canSubmitApproval,
  currentUserId,
}: {
  ready: boolean;
  approvalsUsable: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canSubmitApproval: boolean;
  currentUserId: string | null;
}) {
  const { toast } = useToast();
  const params = useParams();
  const router = useRouter();
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
  const [approvalTemplates, setApprovalTemplates] = React.useState<ApprovalTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("");
  const [submitMessage, setSubmitMessage] = React.useState("");

  const [approvalLoaded, setApprovalLoaded] = React.useState(false);

  // Edit sessions
  // - When false, we won't auto-acquire a lock (view-only).
  // - When true, we attempt to acquire and keep an edit session alive.
  const [editRequested, setEditRequested] = React.useState(false);

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewVersionNumber, setPreviewVersionNumber] = React.useState<number | null>(null);
  const [previewVersion, setPreviewVersion] = React.useState<EditorVersion | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const [restoreConfirmOpen, setRestoreConfirmOpen] = React.useState(false);
  const [restoreTargetVersion, setRestoreTargetVersion] = React.useState<number | null>(null);

  const [submitGuardOpen, setSubmitGuardOpen] = React.useState(false);

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

  const isApprovalActive = approvalsUsable && Boolean(approval && (approval.status === "draft" || approval.status === "in_progress"));
  const isEditingDisabledByApproval = approvalsUsable && isApprovalActive;
  const editorEditable = editRequested && !isViewingFixedVersion && !isEditingDisabledByApproval && canEdit && lockState.state === "active";

  const docJson = React.useMemo(() => (doc ? JSON.stringify(doc) : null), [doc]);
  const isDraftDirty = Boolean(docJson && savedVersionJsonRef.current && docJson !== savedVersionJsonRef.current);

  const formatTime = React.useCallback((iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, []);

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

  const load = React.useCallback(async () => {
    if (!ready) return;
    if (!docId) return;
    setLoading(true);
    setApprovalLoaded(false);
    try {
      const latest = await getEditorLatest(docId);
      const v = await listEditorVersions(docId, 50);

      let displayVersion: EditorVersion | null = latest.version || null;
      if (viewVersion) {
        displayVersion = await getEditorVersion(docId, viewVersion);
      }

      setHeadVersion(latest.head.current_version_number);
      const nextDoc = (displayVersion?.content as any) || undefined;
      setDoc(nextDoc);
      setTitle((displayVersion?.content_text || "")?.split("\n")[0] || displayVersion?.commit_message || "Untitled");
      setVersions(v.versions || []);
      setLatestVersionCreatedAt(displayVersion?.created_at || null);

      savedVersionContentRef.current = nextDoc;
      savedVersionJsonRef.current = nextDoc ? JSON.stringify(nextDoc) : null;
      lastAutosavedJsonRef.current = savedVersionJsonRef.current;
      setDraftBanner(null);
      setAutosaveStatus("idle");
      setAutosavedAt(null);

      // Approval status (only if enabled for org)
      if (approvalsUsable) {
        try {
          const cur = await getCurrentApproval(docId);
          setApproval(cur.approval);
          setApprovalStages(cur.stages || []);
          const acts = await getApprovalActions(cur.approval.id);
          setApprovalActions(acts.actions || []);
        } catch (e: any) {
          if (e?.status === 404) {
            setApproval(null);
            setApprovalStages([]);
            setApprovalActions([]);
          } else {
            throw e;
          }
        }
      } else {
        setApproval(null);
        setApprovalStages([]);
        setApprovalActions([]);
      }
    } finally {
      setApprovalLoaded(true);
      setLoading(false);
    }
  }, [approvalsUsable, docId, ready, viewVersion]);

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

  const acquireLock = React.useCallback(async () => {
    if (!canEdit) return;
    if (isViewingFixedVersion) return;
    if (isApprovalActive) return;
    setLockState({ state: "acquiring" });
    try {
      const res = await createEditSession(docId, 120);
      setLockState({ state: "active", sessionId: res.id });
      startHeartbeat(res.id);
    } catch (e: any) {
      const status = e?.status;
      const data = e?.data;
      if (status === 409) {
        setLockState({ state: "locked", activeSession: data?.activeSession || null });
        return;
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
      if (s) void revokeEditSession(s).catch(() => {});
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
    void revokeEditSession(sid).catch(() => {});
  }, [clearAutosaveTimer, isApprovalActive, isViewingFixedVersion, lockState, stopHeartbeat]);

  // Release the lock when user exits edit mode
  React.useEffect(() => {
    if (editRequested) return;
    if (lockState.state !== "active") return;
    const sid = lockState.sessionId;
    stopHeartbeat();
    clearAutosaveTimer();
    setLockState({ state: "idle" });
    void revokeEditSession(sid).catch(() => {});
  }, [clearAutosaveTimer, editRequested, lockState, stopHeartbeat]);

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

  const flushAutosave = React.useCallback(async () => {
    if (!canEdit) return;
    if (isViewingFixedVersion) return;
    if (isApprovalActive) return;
    if (lockState.state !== "active") return;
    if (!doc) return;

    const nextJson = JSON.stringify(doc);
    if (lastAutosavedJsonRef.current === nextJson) return;

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
      } catch {}
    }
  }, [canEdit, clearAutosaveTimer, doc, docId, headVersion, isApprovalActive, isViewingFixedVersion, lockState]);

  const exitEditMode = React.useCallback(async () => {
    if (lockState.state === "active") {
      try {
        await flushAutosave();
      } catch {
        // ignore
      }
    }
    setEditRequested(false);
    toast({ title: "Viewing", description: "Edit session released." });
  }, [flushAutosave, lockState, toast]);

  const requestEditMode = React.useCallback(async () => {
    setEditRequested(true);
    if (!canEdit) return;
    if (isViewingFixedVersion) return;
    if (isApprovalActive) return;
    if (lockState.state === "active" || lockState.state === "acquiring") return;
    try {
      await acquireLock();
    } catch (e: any) {
      toast({ title: "Could not acquire edit lock", description: e?.message || "Unknown error", variant: "destructive" });
    }
  }, [acquireLock, canEdit, isApprovalActive, isViewingFixedVersion, lockState.state, toast]);

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
      void (async () => {
        try {
          const cur = await getCurrentApproval(docId);
          setApproval(cur.approval);
          setApprovalStages(cur.stages || []);
          const acts = await getApprovalActions(cur.approval.id);
          setApprovalActions(acts.actions || []);
        } catch {
          // ignore
        }
      })();
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [approval?.id, approval?.status, approvalsUsable, docId]);

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
  }, [canEdit, createVersionFromCurrentDoc, isApprovalActive, isViewingFixedVersion, toast]);

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
      const res = await submitApproval(docId, {
        templateId: selectedTemplateId || undefined,
        versionNumber: opts?.versionNumber,
        message: submitMessage.trim() || undefined,
      });
      setApproval(res.approval);
      setApprovalStages(res.stages || []);
      const acts = await getApprovalActions(res.approval.id);
      setApprovalActions(acts.actions || []);
      toast({ title: "Submitted", description: "Approval workflow started." });
      window.dispatchEvent(new Event("approvalUpdated"));
    } catch (e: any) {
      toast({ title: "Submit failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setApprovalLoading(false);
    }
  }, [canSubmitApproval, docId, selectedTemplateId, submitMessage, toast]);

  const doCancelApproval = async () => {
    if (!approval) return;
    if (!canSubmitApproval) return;
    setApprovalLoading(true);
    try {
      const res = await cancelApproval(approval.id);
      toast({ title: "Cancelled", description: "Approval request cancelled." });
      setApproval(res.approval || null);
      try {
        if (approvalsUsable) {
          const cur = await getCurrentApproval(docId);
          setApproval(cur.approval);
          setApprovalStages(cur.stages || []);
          const acts = await getApprovalActions(cur.approval.id);
          setApprovalActions(acts.actions || []);
        }
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event("approvalUpdated"));
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setApprovalLoading(false);
    }
  };

  const openVersionPreview = React.useCallback((versionNumber: number) => {
    setPreviewVersionNumber(versionNumber);
    setPreviewOpen(true);
  }, []);

  const requestRestoreVersion = React.useCallback((versionNumber: number) => {
    setRestoreTargetVersion(versionNumber);
    setRestoreConfirmOpen(true);
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

  // Ctrl/Cmd+S creates a new version (not autosave)
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = String(e.key || "").toLowerCase();
      if (key !== "s") return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.repeat) return;

      e.preventDefault();
      if (!editorEditable) return;
      if (saving) return;
      void doSave();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doSave, editorEditable, saving]);

  const lockBadge = (() => {
    if (isViewingFixedVersion) return <Badge variant="outline">Viewing v{viewVersion}</Badge>;
    if (!canEdit) return <Badge variant="outline">Read-only</Badge>;
    if (lockState.state === "active") return <Badge className="bg-green-500/10 text-green-700 border-green-200">Editing</Badge>;
    if (lockState.state === "acquiring") return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Locking</Badge>;
    if (lockState.state === "locked") return <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />Locked</Badge>;
    if (!editRequested) return <Badge variant="outline">Viewing</Badge>;
    return <Badge variant="outline">Idle</Badge>;
  })();

  const docStatusBadge = (() => {
    if (loading) return null;
    if (isViewingFixedVersion) return null;

    const status = approval?.status as string | undefined;
    if (status === "approved") {
      return (
        <Badge className="bg-green-500/10 text-green-700 border-green-200 gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Approved
        </Badge>
      );
    }
    if (status === "rejected") {
      return (
        <Badge className="bg-red-500/10 text-red-700 border-red-200">Rejected</Badge>
      );
    }
    if (status === "cancelled") {
      return <Badge variant="outline">Cancelled</Badge>;
    }
    if (isApprovalActive) {
      return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">In approval</Badge>;
    }
    if (isDraftDirty) {
      return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">Draft</Badge>;
    }
    return <Badge variant="outline">Saved v{headVersion}</Badge>;
  })();

  return (
    <AppLayout>
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-4 md:px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => router.push("/editor")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-foreground truncate">Editor</h1>
                  <p className="text-xs text-muted-foreground truncate">Doc: {docId}</p>
                </div>
                <div className="ml-2 flex items-center gap-2">
                  {lockBadge}
                  {docStatusBadge}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  Refresh
                </Button>

                {canEdit && !isViewingFixedVersion && !isApprovalActive && (
                  editRequested ? (
                    lockState.state === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => void exitEditMode()}
                        disabled={saving}
                      >
                        Done
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => void requestEditMode()}
                        disabled={lockState.state === "acquiring"}
                      >
                        {lockState.state === "acquiring" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Request edit
                      </Button>
                    )
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => void requestEditMode()}
                      disabled={lockState.state === "acquiring"}
                    >
                      Request edit
                    </Button>
                  )
                )}

                <Button size="sm" className="h-8 gap-1.5" onClick={() => void doSave()} disabled={!editorEditable || saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save version
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-6 py-6">
          <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[1fr,360px]">
            <div className="space-y-4">
              <div className="rounded-xl border bg-card/60 border-border/40 px-4 py-4">
                <div className="flex items-center gap-3">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-12 flex-1 bg-transparent border-0 px-0 text-2xl font-semibold tracking-tight focus-visible:ring-0"
                    placeholder="Untitled"
                    disabled
                  />
                  <div className="flex items-center gap-2">
                    {isDraftDirty && !isApprovalActive && !isViewingFixedVersion && (
                      <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">Draft</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex flex-col md:flex-row md:items-start gap-2">
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                    <span>Head version: {headVersion}</span>
                    {canEdit && !isViewingFixedVersion && !isApprovalActive && (isDraftDirty || autosaveStatus === "saving" || autosaveStatus === "error") && (
                      <span
                        className={cn(
                          "",
                          autosaveStatus === "error" && "text-destructive",
                          autosaveStatus === "saving" && "text-muted-foreground"
                        )}
                      >
                        {autosaveStatus === "saving"
                          ? "Draft autosaving... (not a version)"
                          : autosaveStatus === "saved" && autosavedAt
                            ? `Draft autosaved at ${formatTime(autosavedAt)} (not a version)`
                            : autosaveStatus === "error"
                              ? "Draft autosave failed (saved locally)"
                              : "Draft changes (not a version)"}
                      </span>
                    )}
                  </div>

                  {canEdit && editRequested && !isViewingFixedVersion && !isApprovalActive && (
                    <div className="flex-1 md:max-w-sm">
                      <Input
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        className="h-8"
                        placeholder="Commit message (optional)"
                        disabled={!editorEditable}
                      />
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Save version creates a permanent checkpoint visible in history and approvals. Shortcut: Ctrl/Cmd+S.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {loading ? (
                <Card className="border-border/40 bg-card/50">
                  <CardContent className="p-6">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="mt-3 h-64 w-full" />
                  </CardContent>
                </Card>
              ) : (
                <>
                  {isApprovalActive && (
                    <div className="rounded-lg border border-amber-200/50 bg-amber-50/10 px-3 py-2 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div>
                          <div className="text-sm font-medium">This document is under approval.</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Editing is disabled until the workflow completes or is cancelled.</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="h-8" onClick={() => router.push("/approvals")}>Open approvals</Button>
                    </div>
                  )}

                  {recoverableDraftMeta && (
                    <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div className="text-muted-foreground">
                        {recoverableDraftMeta.label} ({new Date(recoverableDraftMeta.capturedAt).toLocaleString()}).
                      </div>
                      <Button variant="outline" size="sm" className="h-8" onClick={loadRecoverableDraft} disabled={!editorEditable || saving}>
                        Load previous draft
                      </Button>
                    </div>
                  )}

                  {draftBanner && (
                    <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div className="text-muted-foreground">
                        Restored autosaved draft ({new Date(draftBanner.updatedAt).toLocaleString()}).
                      </div>
                      <Button variant="outline" size="sm" className="h-8" onClick={() => void revertToSavedVersion()} disabled={saving || lockState.state !== "active"}>
                        Revert to saved version
                      </Button>
                    </div>
                  )}
                  <TipTapEditor
                    value={doc}
                    onChange={(next) => setDoc(next)}
                    placeholder="Type and format like Notion..."
                    editable={editorEditable}
                    showToolbar={editorEditable}
                    showBubbleMenu={editorEditable}
                  />
                </>
              )}

              {lockState.state === "locked" && (
                <Card className="border-border/40 bg-card/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Document locked
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-muted-foreground space-y-2">
                    <p>Another user has an active edit session. You can still view this document.</p>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => void requestEditMode()}>Try again</Button>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-4">
              <Card className="border-border/40 bg-card/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Versions
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-[340px]">
                    <div className="space-y-2 pr-3">
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
                                  {new Date(v.created_at).toLocaleString()}
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
                  </ScrollArea>
                </CardContent>
              </Card>

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
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="capitalize">{approval.status.replace("_", " ")}</Badge>
                        <div className="flex items-center gap-2">
                          {canCancelThisApproval && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => void doCancelApproval()}
                              disabled={approvalLoading}
                            >
                              Cancel
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-8" onClick={() => router.push("/approvals")}>Open queue</Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">Submitted v{approval.submitted_version_number}</div>

                      {approval.status === "rejected" && approval.rejection_reason && (
                        <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
                          <div className="text-xs font-medium">Rejected</div>
                          <div className="text-xs text-muted-foreground mt-1">{approval.rejection_reason}</div>
                        </div>
                      )}

                      <Separator />
                      <div className="space-y-2">
                        {approvalStages.map((s: any) => (
                          <div key={s.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-muted-foreground">{s.stage_order}.</span>
                              <span className="truncate">{s.stage_id}</span>
                            </div>
                            <Badge variant="outline" className="capitalize">{String(s.status).replace("_", " ")}</Badge>
                          </div>
                        ))}
                      </div>
                      <Separator />
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">Timeline</div>
                        <div className="space-y-2 max-h-[200px] overflow-auto pr-2">
                          {approvalActions.map((a) => (
                            <div key={a.id} className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium">{a.action_type}</span>
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(a.created_at).toLocaleString()}
                                </span>
                              </div>
                              {a.message && <div className="text-xs text-muted-foreground mt-1">{a.message}</div>}
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
            </div>
          </div>
        </main>

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
                    {previewVersion.created_at ? new Date(previewVersion.created_at).toLocaleString() : ""}
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
                  void doRestore(target);
                }}
              >
                Restore
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
