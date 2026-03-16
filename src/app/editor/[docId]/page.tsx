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
import { usePageVisibility } from "@/hooks/use-page-visibility";
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
  toEditorDocFilename,
  type EditorVersion,
} from "@/lib/editor-api";
import {
  approve,
  createApprovalReviewThread,
  getApprovalPanelState,
  listApprovalTemplates,
  reject,
  reopenApprovalReviewThread,
  replyToApprovalReviewThread,
  resolveApprovalReviewThread,
  submitApproval,
  cancel as cancelApproval,
  type ApprovalAction,
  type ApprovalReviewPermissions,
  type ApprovalReviewThread,
  type ApprovalStageSummary,
  type ApprovalTemplate,
  type MyQueueItem,
} from "@/lib/approval-api";
import { apiFetch, getApiContext } from "@/lib/api";
import { recordDocumentRecent } from "@/lib/documents-home-api";
import { extractTextFromTiptap } from "@/lib/tiptap-text";
import {
  TipTapEditor,
  type TipTapEditorValue,
} from "@/components/editor/tiptap-editor";
import { AiSidebar } from "@/components/editor/ai-sidebar";
import { ApprovalReviewThreads } from "@/components/editor/approval-review-threads";
import { DiffManagerProvider, useDiffManager } from "@/components/editor/diff/diff-manager";
import { generateTextDiff } from "@/components/editor/diff/diff-utils";
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
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Trash2,
  Check,
  Folder,
  MoreHorizontal,
  PanelRightOpen,
  Pin,
  Pencil,
  FolderOpen,
  Copy,
  Share,
  Download,
  Info,
  GripVertical,
} from "lucide-react";
import { cn, formatAppDateTime } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LockState =
  | { state: "idle" }
  | { state: "acquiring" }
  | { state: "locked"; activeSession: any }
  | { state: "active"; sessionId: string };

type ReviewThreadMutationState =
  | { threadId: null; kind: null }
  | { threadId: string; kind: "reply" | "resolve" | "reopen" };

type DesktopRailTab = "ai" | "discuss" | "workflow";

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
  if (mapped && String(mapped).trim() && String(mapped).trim() !== raw) return String(mapped).trim();
  return raw.length > 12 ? `${raw.slice(0, 8)}...` : raw;
}

function getRequestErrorMessage(error: any): string {
  return String(error?.data?.message || error?.data?.error || error?.message || "").trim();
}

function isRevokedOrExpiredEditSessionError(error: any): boolean {
  if (error?.status !== 409) return false;
  const message = getRequestErrorMessage(error).toLowerCase();
  return message.includes("session revoked") || message.includes("session expired");
}

export default function EditorDocPage() {
  const { hasPermission, bootstrapData } = useAuth();
  const features = getOrgFeatures(bootstrapData?.orgSettings);
  const editorEnabled = features.editorEnabled;
  const approvalsUsable = features.approvalsUsable;
  const ready = Boolean(bootstrapData);
  const orgId = getApiContext().orgId || bootstrapData?.selectedOrgId || "";

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
    <DiffManagerProvider editor={null}>
      <EditorDocPageInner
        ready={ready}
        orgId={orgId}
        approvalsUsable={approvalsUsable}
        canEdit={canEdit}
        canCreate={canCreate}
        canDelete={canDelete}
        canSubmitApproval={canSubmitApproval}
        currentUserId={currentUserId}
      />
    </DiffManagerProvider>
  );
}

function EditorDocPageInner({
  ready,
  orgId,
  approvalsUsable,
  canEdit,
  canCreate,
  canDelete,
  canSubmitApproval,
  currentUserId,
}: {
  ready: boolean;
  orgId: string;
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
  const isPageVisible = usePageVisibility();

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
  const [versionsLoaded, setVersionsLoaded] = React.useState(false);
  const [versionsLoading, setVersionsLoading] = React.useState(false);
  const [versionsLoadAttempted, setVersionsLoadAttempted] = React.useState(false);
  const [lockState, setLockState] = React.useState<LockState>({ state: "idle" });
  const heartbeatRef = React.useRef<number | null>(null);
  const activeSessionIdRef = React.useRef<string | null>(null);
  const approvalRefreshInFlightRef = React.useRef<Promise<void> | null>(null);
  const approvalRefreshLastCompletedAtRef = React.useRef<number>(0);
  const recentInteractionRef = React.useRef<string | null>(null);

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
  const [approvalReviewThreads, setApprovalReviewThreads] = React.useState<ApprovalReviewThread[]>([]);
  const [approvalStageSummaries, setApprovalStageSummaries] = React.useState<ApprovalStageSummary[]>([]);
  const [approvalReviewPermissions, setApprovalReviewPermissions] = React.useState<ApprovalReviewPermissions | null>(null);
  const [myApprovalQueue, setMyApprovalQueue] = React.useState<MyQueueItem[]>([]);
  const [approvalTemplates, setApprovalTemplates] = React.useState<ApprovalTemplate[]>([]);
  const [approvalTemplatesLoading, setApprovalTemplatesLoading] = React.useState(false);
  const [approvalTemplatesLoadAttempted, setApprovalTemplatesLoadAttempted] = React.useState(false);
  const [approvalTemplatesLoadError, setApprovalTemplatesLoadError] = React.useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("");
  const [submitMessage, setSubmitMessage] = React.useState("");
  const [reviewerMessage, setReviewerMessage] = React.useState("");
  const [reviewerAction, setReviewerAction] = React.useState<"approve" | "reject" | null>(null);
  const [activeReviewThreadId, setActiveReviewThreadId] = React.useState<string | null>(null);
  const [reviewSelection, setReviewSelection] = React.useState<{ from: number; to: number; quote: string } | null>(null);
  const [reviewThreadDialog, setReviewThreadDialog] = React.useState<{ open: boolean; kind: "selection" | "general" }>({ open: false, kind: "selection" });
  const [reviewThreadDraft, setReviewThreadDraft] = React.useState("");
  const [creatingReviewThread, setCreatingReviewThread] = React.useState(false);
  const [reviewThreadMutation, setReviewThreadMutation] = React.useState<ReviewThreadMutationState>({ threadId: null, kind: null });

  const [approvalLoaded, setApprovalLoaded] = React.useState(false);
  const [orgUserLabels, setOrgUserLabels] = React.useState<Record<string, string>>({});

  // Edit sessions
  // - When false, we won't auto-acquire a lock (view-only).
  // - When true, we attempt to acquire and keep an edit session alive.
  const [editRequested, setEditRequested] = React.useState(true);

  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [inspectorTab, setInspectorTab] = React.useState<"versions" | "approval">("versions");
  const [approvalPanelTab, setApprovalPanelTab] = React.useState<"overview" | "comments" | "timeline">("overview");
  const [desktopRailTab, setDesktopRailTab] = React.useState<DesktopRailTab>("ai");
  const [isRightBarOpen, setIsRightBarOpen] = React.useState(true);
  const [rightBarWidth, setRightBarWidth] = React.useState(400);
  const rightBarDragRef = React.useRef<{ startX: number; startWidth: number } | null>(null);
  const [isResizingRightBar, setIsResizingRightBar] = React.useState(false);
  const [desktopHistoryOpen, setDesktopHistoryOpen] = React.useState(false);
  const [threadFilter, setThreadFilter] = React.useState<"open" | "resolved" | "all">("open");

  const onRightBarResizeStart = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightBarWidth;
    rightBarDragRef.current = { startX, startWidth };
    setIsResizingRightBar(true);

    const onMouseMove = (ev: MouseEvent) => {
      const ref = rightBarDragRef.current;
      if (!ref) return;
      const delta = ref.startX - ev.clientX;
      const maxW = Math.floor(window.innerWidth / 2);
      const next = Math.max(320, Math.min(maxW, ref.startWidth + delta));
      setRightBarWidth(next);
    };

    const onMouseUp = () => {
      rightBarDragRef.current = null;
      setIsResizingRightBar(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [rightBarWidth]);

  const [tiptapInstance, setTiptapInstance] = React.useState<TipTapEditorInstance | null>(null);
  const [isReviewModeOn, setIsReviewModeOn] = React.useState(false);
  const [reviewDiffLoading, setReviewDiffLoading] = React.useState(false);

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
  const { setEditor: setDiffEditor, clearAllDiffs, addDiff } = useDiffManager();

  React.useEffect(() => {
    if (tiptapInstance) {
      setDiffEditor(tiptapInstance);
    }
  }, [setDiffEditor, tiptapInstance]);

  React.useEffect(() => {
    if (!isReviewModeOn) {
      clearAllDiffs();
      return;
    }

    if (!approval || !tiptapInstance) return;

    const runReviewDiff = async () => {
      setReviewDiffLoading(true);
      try {
        const submittedVersion = Number(approval.submitted_version_number || 0);
        if (!Number.isInteger(submittedVersion) || submittedVersion < 1) return;

        const [current, previous] = await Promise.all([
          getEditorVersion(docId, submittedVersion),
          submittedVersion > 1 ? getEditorVersion(docId, submittedVersion - 1) : Promise.resolve(null),
        ]);

        if (!current?.content) return;

        const baseContent = previous?.content || { type: "doc", content: [] };
        const baseBlocks = Array.isArray(baseContent?.content) ? baseContent.content : [];
        const baseItems = baseBlocks.map((block: any, index: number) => ({
          type: block?.type,
          text: extractTextFromTiptap(block),
          json: block,
          index,
          used: false,
        }));

        clearAllDiffs();

        tiptapInstance.state.doc.content.forEach((node, offset) => {
          const pos = offset + 1;
          const nodeJson = node.toJSON();
          const headText = extractTextFromTiptap(nodeJson);
          const headType = node.type.name;

          if (!headText.trim()) return;

          let matchIdx = baseItems.findIndex((item: any) =>
            !item.used &&
            item.type === headType &&
            item.text === headText
          );

          if (matchIdx !== -1) {
            baseItems[matchIdx].used = true;
            return;
          }

          matchIdx = baseItems.findIndex((item: any) => !item.used && item.type === headType);

          if (matchIdx !== -1) {
            const match = baseItems[matchIdx];
            match.used = true;
            addDiff({
              rawFrom: pos,
              rawTo: pos + node.nodeSize,
              normalizedFrom: pos,
              normalizedTo: pos + node.nodeSize,
              originalContent: match.json,
              suggestedContent: nodeJson,
              previewKind: "range_replace",
              diff: generateTextDiff(match.text, headText),
            });
            return;
          }

          addDiff({
            rawFrom: pos,
            rawTo: pos + node.nodeSize,
            normalizedFrom: pos,
            normalizedTo: pos + node.nodeSize,
            originalContent: { type: "paragraph", content: [] },
            suggestedContent: nodeJson,
            previewKind: "range_replace",
            diff: [{ type: "insert", text: headText }],
          });
        });
      } catch (error) {
        console.error("Failed to run review diff:", error);
      } finally {
        setReviewDiffLoading(false);
      }
    };

    void runReviewDiff();
  }, [addDiff, approval, clearAllDiffs, docId, isReviewModeOn, tiptapInstance]);
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

  const canCreateReviewThreads = Boolean(
    approvalsUsable
    && approval
    && approval.status === "in_progress"
    && approvalReviewPermissions?.canCreateThreads
  );

  const canCommentInReview = Boolean(
    approvalsUsable
    && approval
    && approval.status === "in_progress"
    && approvalReviewPermissions?.canComment
  );

  const canResolveReviewThreads = Boolean(
    approvalsUsable
    && approval
    && approval.status === "in_progress"
    && approvalReviewPermissions?.canResolve
  );

  const recentInteractionKind = React.useMemo<"read" | "edit" | "review" | null>(() => {
    if (!docId || loading || !approvalLoaded) return null;
    if (approval && approval.status === "in_progress" && (canActAsReviewer || approvalReviewPermissions?.canViewThreads)) {
      return "review";
    }
    if (canEdit && !isViewingFixedVersion && !(approvalsUsable && approval && (approval.status === "draft" || approval.status === "in_progress"))) {
      return "edit";
    }
    return "read";
  }, [
    approval,
    approvalLoaded,
    approvalReviewPermissions?.canViewThreads,
    approvalsUsable,
    canActAsReviewer,
    canEdit,
    docId,
    isViewingFixedVersion,
    loading,
  ]);

  React.useEffect(() => {
    if (!docId || !recentInteractionKind) return;
    const key = `${docId}:${recentInteractionKind}`;
    if (recentInteractionRef.current === key) return;
    recentInteractionRef.current = key;
    void recordDocumentRecent(docId, recentInteractionKind).catch(() => { });
  }, [docId, recentInteractionKind]);

  const currentApprovalStage = React.useMemo(
    () => (approvalStages || []).find((stage: any) => String(stage?.status || "").toLowerCase() === "in_progress") || null,
    [approvalStages]
  );

  const appliedTemplate = React.useMemo(() => {
    if (!approval?.workflow_template_id) return null;
    return approvalTemplates.find((t) => String(t.id) === String(approval.workflow_template_id)) || null;
  }, [approval?.workflow_template_id, approvalTemplates]);

  const selectedApprovalTemplate = React.useMemo(() => {
    const selected = selectedTemplateId
      ? approvalTemplates.find((template) => String(template.id) === String(selectedTemplateId))
      : null;
    return selected || approvalTemplates.find((template) => template.is_default) || approvalTemplates[0] || null;
  }, [approvalTemplates, selectedTemplateId]);

  const templateStageNameById = React.useMemo(() => {
    const stages = Array.isArray(appliedTemplate?.config?.stages) ? appliedTemplate.config.stages : [];
    const map = new Map<string, string>();
    for (const stage of stages) {
      const key = String(stage?.id || "").trim();
      if (!key) continue;
      const label = String(stage?.name || "").trim() || key;
      map.set(key, label);
    }
    return map;
  }, [appliedTemplate?.config]);

  const formatApprovalStageLabel = React.useCallback((stage: any) => {
    const technicalId = String(stage?.stage_id || "").trim();
    const named = technicalId ? templateStageNameById.get(technicalId) : null;
    if (named) return named;
    if (technicalId) {
      const humanized = technicalId.replace(/_/g, " ").trim();
      return humanized.charAt(0).toUpperCase() + humanized.slice(1);
    }
    const stageOrder = Number(stage?.stage_order || 0);
    return stageOrder > 0 ? `Stage ${stageOrder}` : "Approval stage";
  }, [templateStageNameById]);

  const reviewThreadStageMetaById = React.useMemo(() => {
    const map: Record<string, { label: string; order?: number | null }> = {};
    for (const stage of approvalStages || []) {
      const key = String(stage?.id || "").trim();
      if (!key) continue;
      map[key] = {
        label: formatApprovalStageLabel(stage),
        order: Number(stage?.stage_order || 0) || null,
      };
    }
    return map;
  }, [approvalStages, formatApprovalStageLabel]);

  const approvalStageSummaryById = React.useMemo(() => {
    const map = new Map<string, ApprovalStageSummary>();
    for (const summary of approvalStageSummaries || []) {
      const key = String(summary?.stageInstanceId || "").trim();
      if (!key) continue;
      map.set(key, summary);
    }
    return map;
  }, [approvalStageSummaries]);

  const showReviewWorkspace = Boolean(
    approvalsUsable
    && approval
    && (canActAsReviewer || isSubmitter || approvalReviewPermissions?.canViewThreads)
  );

  const isApprovalActive = approvalsUsable && Boolean(approval && (approval.status === "draft" || approval.status === "in_progress"));
  const isEditingDisabledByApproval = approvalsUsable && isApprovalActive;

  const approvalBannerCta = React.useMemo(() => {
    if (!isApprovalActive) return null;
    if (canActAsReviewer) {
      return {
        label: "Open review",
        mobileTab: "comments" as const,
      };
    }
    if (isSubmitter) {
      return {
        label: "View workflow",
        mobileTab: "overview" as const,
      };
    }
    if (approvalReviewPermissions?.canViewThreads) {
      return {
        label: "View review",
        mobileTab: "comments" as const,
      };
    }
    return {
      label: "View approval status",
      mobileTab: "overview" as const,
    };
  }, [approvalReviewPermissions?.canViewThreads, canActAsReviewer, isApprovalActive, isSubmitter]);

  const approvalBannerTitle = React.useMemo(() => {
    if (!approval || String(approval.status || "").toLowerCase() !== "draft") {
      return "This document is under approval.";
    }
    return "Approval request is being prepared.";
  }, [approval]);

  const approvalBannerDescription = React.useMemo(() => {
    if (isViewingFixedVersion) {
      return "You are reviewing a submitted snapshot. Open versions to switch context.";
    }
    if (approval && String(approval.status || "").toLowerCase() === "draft") {
      return "The workflow is being created. Editing will stay locked once the request becomes active.";
    }
    return "Editing is disabled until the workflow completes or is cancelled.";
  }, [approval, isViewingFixedVersion]);

  const approvalStatusSummary = React.useMemo(() => {
    if (!approval) return approvalsUsable ? "No active approval" : "Approvals disabled";
    const parts: string[] = [];
    const statusLabel = String(approval.status || "").replace(/_/g, " ");
    parts.push(statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1));
    if (currentApprovalStage?.stage_order) {
      parts.push(`Stage ${currentApprovalStage.stage_order}`);
    }
    if (approval.submitted_version_number) {
      parts.push(`v${approval.submitted_version_number}`);
    }
    return parts.join(" • ");
  }, [approval, approvalsUsable, currentApprovalStage?.stage_order]);

  const reviewCommentAnchors = React.useMemo(
    () => (approvalReviewThreads || [])
      .filter((thread) => (
        thread.thread_type === "selection"
        && Number(thread.anchor_from || 0) > 0
        && Number(thread.anchor_to || 0) > Number(thread.anchor_from || 0)
      ))
      .map((thread) => ({
        id: thread.id,
        from: Number(thread.anchor_from),
        to: Number(thread.anchor_to),
        quote: thread.quote || undefined,
        message: thread.comments?.[0]?.message || undefined,
        userLabel: formatUserLabel(thread.created_by, currentUserId, orgUserLabels),
        createdAt: thread.created_at,
      })),
    [approvalReviewThreads, currentUserId, orgUserLabels]
  );

  const activeReviewThread = React.useMemo(
    () => (approvalReviewThreads || []).find((thread) => String(thread.id) === String(activeReviewThreadId)) || null,
    [activeReviewThreadId, approvalReviewThreads]
  );

  const pendingReviewSelection = React.useMemo(() => {
    if (!reviewSelection) return null;
    if (
      activeReviewThread
      && activeReviewThread.thread_type === "selection"
      && Number(activeReviewThread.anchor_from || 0) === Number(reviewSelection.from)
      && Number(activeReviewThread.anchor_to || 0) === Number(reviewSelection.to)
    ) {
      return null;
    }
    return reviewSelection;
  }, [activeReviewThread, reviewSelection]);

  const threadActions = React.useMemo(
    () => (approvalActions || [])
      .filter((action) => {
        const type = String(action.action_type || "").toLowerCase();
        return type !== "comment" && type !== "submit" && (Boolean(action.message) || ["approve", "reject"].includes(type));
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((action) => ({
        id: String(action.id),
        message: action.message || (
          action.action_type === "approve"
            ? "Approved the document."
            : action.action_type === "reject"
              ? "Rejected the document."
              : ""
        ),
        userLabel: formatUserLabel(action.actor_user_id, currentUserId, orgUserLabels),
        createdAt: action.created_at,
        type: String(action.action_type || "").toLowerCase(),
      })),
    [approvalActions, currentUserId, orgUserLabels]
  );

  const submissionMsg = React.useMemo(() => {
    const submitAction = (approvalActions || []).find((action) => String(action.action_type || "").toLowerCase() === "submit");
    return submitAction?.message || approval?.message || "";
  }, [approval, approvalActions]);

  const nonCommentActions = React.useMemo(
    () => (approvalActions || []).filter((a) => String(a.action_type || "").toLowerCase() !== "comment"),
    [approvalActions]
  );

  const activityActions = React.useMemo(
    () => [...(nonCommentActions || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [nonCommentActions]
  );

  const openReviewThreadCount = React.useMemo(
    () => (approvalReviewThreads || []).filter((thread) => String(thread.status || "").toLowerCase() !== "resolved").length,
    [approvalReviewThreads]
  );

  const resolvedReviewThreadCount = Math.max(0, approvalReviewThreads.length - openReviewThreadCount);

  const filteredReviewThreads = React.useMemo(() => {
    if (threadFilter === "all") return approvalReviewThreads;
    const expectedStatus = threadFilter === "resolved" ? "resolved" : "open";
    return approvalReviewThreads.filter((thread) => String(thread.status || "").toLowerCase() === expectedStatus);
  }, [approvalReviewThreads, threadFilter]);

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
    const heartbeatIntervalMs = isPageVisible ? 25_000 : 55_000;
    heartbeatRef.current = window.setInterval(() => {
      void heartbeatEditSession(sessionId, 120).catch((error: any) => {
        if (!isRevokedOrExpiredEditSessionError(error)) return;
        stopHeartbeat();
        setLockState((current) => {
          if (current.state !== "active") return current;
          if (current.sessionId !== sessionId) return current;
          return { state: "idle" };
        });
      });
    }, heartbeatIntervalMs);
  }, [isPageVisible, stopHeartbeat]);

  const clearAutosaveTimer = React.useCallback(() => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const loadVersions = React.useCallback(async (opts?: { force?: boolean; silent?: boolean }) => {
    if (!docId) return;
    if (!opts?.force && (versionsLoaded || versionsLoading || versionsLoadAttempted)) return;

    setVersionsLoading(true);
    setVersionsLoadAttempted(true);
    try {
      const v = await listEditorVersions(docId, 50);
      setVersions(v.versions || []);
      setVersionsLoaded(true);
    } catch (e: any) {
      if (!opts?.silent) {
        toast({ title: "Failed to load versions", description: e?.message || "Unknown error", variant: "destructive" });
      }
    } finally {
      setVersionsLoading(false);
    }
  }, [docId, toast, versionsLoadAttempted, versionsLoaded, versionsLoading]);

  const refreshApprovalState = React.useCallback(async () => {
    if (!approvalsUsable) {
      setApproval(null);
      setApprovalStages([]);
      setApprovalStageSummaries([]);
      setApprovalActions([]);
      setApprovalReviewThreads([]);
      setApprovalReviewPermissions(null);
      setMyApprovalQueue([]);
      return;
    }

    // Coalesce overlapping triggers (interval + visibility resume + user actions)
    // to avoid request bursts for the same data.
    if (approvalRefreshInFlightRef.current) {
      await approvalRefreshInFlightRef.current;
      return;
    }
    if (Date.now() - approvalRefreshLastCompletedAtRef.current < 500) {
      return;
    }

    const task = (async () => {
      try {
        const panel = await getApprovalPanelState(docId);
        setApproval(panel.approval);
        setApprovalStages(panel.stages || []);
        setApprovalStageSummaries(panel.stageSummaries || []);
        setApprovalActions(panel.actions || []);
        setApprovalReviewThreads(panel.reviewThreads || []);
        setApprovalReviewPermissions(panel.reviewPermissions || null);
        setMyApprovalQueue(panel.myQueueItems || []);
        if (panel.userLabels && typeof panel.userLabels === "object") {
          setOrgUserLabels((prev) => ({ ...prev, ...panel.userLabels }));
        }
      } catch (e: any) {
        if (e?.status === 404) {
          setApproval(null);
          setApprovalStages([]);
          setApprovalStageSummaries([]);
          setApprovalActions([]);
          setApprovalReviewThreads([]);
          setApprovalReviewPermissions(null);
          setMyApprovalQueue([]);
        } else {
          throw e;
        }
      } finally {
        approvalRefreshLastCompletedAtRef.current = Date.now();
      }
    })();

    approvalRefreshInFlightRef.current = task;
    try {
      await task;
    } finally {
      if (approvalRefreshInFlightRef.current === task) {
        approvalRefreshInFlightRef.current = null;
      }
    }
  }, [approvalsUsable, docId]);

  const load = React.useCallback(async () => {
    if (!ready) return;
    if (!docId) return;
    setLoading(true);
    setApprovalLoaded(false);
    try {
      const latest = await getEditorLatest(docId);
      const docMeta = latest?.doc || null;

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
      setVersions([]);
      setVersionsLoaded(false);
      setVersionsLoading(false);
      setVersionsLoadAttempted(false);
      setLatestVersionCreatedAt(displayVersion?.created_at || null);

      savedVersionContentRef.current = nextDoc;
      savedVersionJsonRef.current = nextDoc ? JSON.stringify(nextDoc) : null;
      lastAutosavedJsonRef.current = savedVersionJsonRef.current;
      setDraftBanner(null);
      setAutosaveStatus("idle");
      setAutosavedAt(null);
    }
    finally {
      setLoading(false);
    }

    void refreshApprovalState()
      .catch((e: any) => {
        toast({
          title: "Approval status unavailable",
          description: e?.message || "Could not load approval state.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setApprovalLoaded(true);
      });
  }, [docId, ready, refreshApprovalState, toast, viewVersion]);

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

  React.useEffect(() => {
    if (lockState.state !== "active") return;
    startHeartbeat(lockState.sessionId);
  }, [isPageVisible, lockState, startHeartbeat]);

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

  React.useEffect(() => {
    if (canActAsReviewer) return;
    setIsReviewModeOn(false);
  }, [canActAsReviewer]);

  React.useEffect(() => {
    if (!approvalReviewThreads.length) {
      setActiveReviewThreadId(null);
      return;
    }
    if (!activeReviewThreadId) {
      return;
    }
    if (approvalReviewThreads.some((thread) => String(thread.id) === String(activeReviewThreadId))) {
      return;
    }
    setActiveReviewThreadId(null);
  }, [activeReviewThreadId, approvalReviewThreads]);

  React.useEffect(() => {
    if (!activeReviewThreadId) return;
    if (filteredReviewThreads.some((thread) => String(thread.id) === String(activeReviewThreadId))) return;
    setActiveReviewThreadId(null);
  }, [activeReviewThreadId, filteredReviewThreads]);

  React.useEffect(() => {
    if (canCreateReviewThreads) return;
    setReviewSelection(null);
    setReviewThreadDialog({ open: false, kind: "selection" });
    setReviewThreadDraft("");
    setReviewThreadMutation({ threadId: null, kind: null });
  }, [canCreateReviewThreads]);

  React.useEffect(() => {
    if (approval) {
      setDesktopRailTab((prev) => {
        return prev === "ai" || prev === "workflow" || prev === "discuss" ? prev : "ai";
      });
      return;
    }
    setDesktopRailTab((prev) => (prev === "ai" || prev === "workflow" || prev === "discuss" ? prev : "ai"));
  }, [approval, isViewingFixedVersion]);

  React.useEffect(() => {
    if (isViewingFixedVersion) {
      setDesktopHistoryOpen(true);
    }
  }, [isViewingFixedVersion]);

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

  const reacquireLockAfterSessionLoss = React.useCallback(async (): Promise<string> => {
    stopHeartbeat();
    clearAutosaveTimer();
    setLockState({ state: "idle" });

    const result = await acquireLock();
    if (result.status === "active") {
      return result.sessionId;
    }

    const owner = formatUserLabel(result.activeSession?.editor_user_id, currentUserId, orgUserLabels);
    const since = formatTimeAgoShort(result.activeSession?.created_at);
    throw new Error(
      since
        ? `Your editing session expired and the document is now locked by ${owner} (${since}).`
        : `Your editing session expired and the document is now locked by ${owner}.`
    );
  }, [acquireLock, clearAutosaveTimer, currentUserId, orgUserLabels, stopHeartbeat]);

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
    if (!(desktopHistoryOpen || (inspectorOpen && inspectorTab === "versions"))) return;
    void loadVersions({ silent: true });
  }, [desktopHistoryOpen, inspectorOpen, inspectorTab, loadVersions]);

  React.useEffect(() => {
    setApprovalTemplates([]);
    setApprovalTemplatesLoading(false);
    setApprovalTemplatesLoadAttempted(false);
    setApprovalTemplatesLoadError(null);
    setSelectedTemplateId("");
  }, [orgId]);

  const loadApprovalTemplates = React.useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!ready || !canSubmitApproval || !orgId) return;
    if (approvalTemplatesLoading && !force) return;

    setApprovalTemplatesLoading(true);
    setApprovalTemplatesLoadAttempted(true);
    setApprovalTemplatesLoadError(null);

    try {
      const res = await listApprovalTemplates({ orgId });
      const list = Array.isArray(res.templates) ? res.templates : [];
      setApprovalTemplates(list);
      setSelectedTemplateId((current) => {
        if (current && list.some((template) => String(template.id) === String(current))) {
          return current;
        }
        const def = list.find((template) => template.is_default) || list[0];
        return def ? String(def.id) : "";
      });
    } catch (e: any) {
      setApprovalTemplates([]);
      setSelectedTemplateId("");
      setApprovalTemplatesLoadError(e?.message || "Could not load approval templates.");
    } finally {
      setApprovalTemplatesLoading(false);
    }
  }, [approvalTemplatesLoading, canSubmitApproval, orgId, ready]);

  const renderApprovalTemplatePicker = React.useCallback(() => {
    if (approvalTemplates.length > 0) {
      return (
        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={!canSubmitApproval || approvalLoading}>
          <SelectTrigger className="h-10 rounded-xl border-border/20 bg-background/30 px-3 text-[12.5px] font-medium transition-all hover:bg-background/50 hover:border-border/40 focus:ring-1 focus:ring-primary/20">
            <SelectValue placeholder="Select approval template" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border/40 shadow-xl overflow-hidden">
            {approvalTemplates.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-[12.5px] py-2.5 focus:bg-muted/50 cursor-pointer">
                {t.name}{t.is_default ? " (Default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (approvalTemplatesLoading) {
      return (
        <Input
          value={""}
          placeholder="Loading approval templates..."
          className="h-8"
          disabled
        />
      );
    }

    if (approvalTemplatesLoadError) {
      return (
        <div className="flex items-center gap-2">
          <Input
            value={""}
            placeholder={approvalTemplatesLoadError}
            className="h-8"
            disabled
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => void loadApprovalTemplates({ force: true })}
            disabled={approvalTemplatesLoading}
          >
            Retry
          </Button>
        </div>
      );
    }

    if (approvalTemplatesLoadAttempted) {
      return (
        <Input
          value={""}
          placeholder="No active approval templates found"
          className="h-8"
          disabled
        />
      );
    }

    return (
      <Input
        value={""}
        placeholder="Approval templates will load here"
        className="h-8"
        disabled
      />
    );
  }, [
    approvalLoading,
    approvalTemplates,
    approvalTemplatesLoadAttempted,
    approvalTemplatesLoadError,
    approvalTemplatesLoading,
    canSubmitApproval,
    loadApprovalTemplates,
    selectedTemplateId,
  ]);

  React.useEffect(() => {
    // Load templates lazily (needed for submit UI)
    if (!ready || !orgId) return;
    if (!canSubmitApproval) return;
    if (!(desktopRailTab === "discuss" || desktopRailTab === "workflow" || (inspectorOpen && inspectorTab === "approval"))) return;
    if (approvalTemplatesLoading || approvalTemplatesLoadAttempted) return;

    void loadApprovalTemplates();
  }, [
    approvalTemplatesLoadAttempted,
    approvalTemplatesLoading,
    canSubmitApproval,
    desktopRailTab,
    inspectorOpen,
    inspectorTab,
    loadApprovalTemplates,
    orgId,
    ready,
  ]);

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
    if (!isPageVisible) return;
    const approvalPanelFocused = desktopRailTab === "discuss" || desktopRailTab === "workflow" || (inspectorOpen && inspectorTab === "approval");
    const approvalPollIntervalMs = approvalPanelFocused ? 10_000 : 30_000;

    const interval = window.setInterval(() => {
      void refreshApprovalState().catch(() => {
        // ignore polling failures
      });
    }, approvalPollIntervalMs);

    return () => window.clearInterval(interval);
  }, [approval?.id, approval?.status, approvalsUsable, desktopRailTab, refreshApprovalState, isPageVisible, inspectorOpen, inspectorTab]);

  React.useEffect(() => {
    if (!approvalsUsable) return;
    if (!approval || approval.status !== "in_progress") return;
    if (!isPageVisible) return;

    void refreshApprovalState().catch(() => {
      // ignore refresh failures on visibility resume
    });
  }, [approval?.id, approval?.status, approvalsUsable, isPageVisible, refreshApprovalState]);

  const createVersionFromCurrentDoc = React.useCallback(async (opts?: { commitMessageOverride?: string }) => {
    if (!canEdit) throw new Error("Forbidden");
    if (isViewingFixedVersion) throw new Error("Read-only view");
    if (isApprovalActive) throw new Error("Editing is disabled while this document is under approval");
    if (lockState.state !== "active") throw new Error("Locked");
    if (!doc) throw new Error("Nothing to save");

    const contentText = extractTextFromTiptap(doc);
    const saveVersionForSession = (sessionId: string) => saveEditorVersion(docId, {
      sessionId,
      expectedCurrentVersion: headVersion,
      commitMessage: opts?.commitMessageOverride ?? (commitMessage.trim() || undefined),
      content: doc,
      contentText,
    });

    let res;
    try {
      res = await saveVersionForSession(lockState.sessionId);
    } catch (error: any) {
      if (!isRevokedOrExpiredEditSessionError(error)) {
        throw error;
      }
      const nextSessionId = await reacquireLockAfterSessionLoss();
      res = await saveVersionForSession(nextSessionId);
    }

    setHeadVersion(res.head.current_version_number);
    setLatestVersionCreatedAt(res.version.created_at);
    savedVersionContentRef.current = doc;
    savedVersionJsonRef.current = JSON.stringify(doc);
    lastAutosavedJsonRef.current = savedVersionJsonRef.current;
    setDraftBanner(null);
    setCommitMessage("");

    await loadVersions({ force: true, silent: true });

    return res.version;
  }, [canEdit, commitMessage, doc, docId, headVersion, isApprovalActive, isViewingFixedVersion, loadVersions, lockState, reacquireLockAfterSessionLoss]);

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

  const doReviewerAction = React.useCallback(async (kind: "approve" | "reject") => {
    if (!approval) return;
    if (!canActAsReviewer) return;

    const message = reviewerMessage.trim();
    if (kind === "approve" && openReviewThreadCount > 0) {
      toast({
        title: "Resolve open threads first",
        description: "Close or reopen the remaining review threads before approving this document.",
        variant: "destructive",
      });
      return;
    }
    if (kind === "reject" && !message) {
      toast({
        title: "Reason required",
        description: "Add a rejection reason.",
        variant: "destructive",
      });
      return;
    }

    setReviewerAction(kind);
    try {
      if (kind === "approve") {
        await approve(approval.id, message || undefined);
        toast({ title: "Approved", description: "Your approval was recorded." });
      } else {
        await reject(approval.id, message);
        toast({ title: "Rejected", description: "Your rejection was recorded." });
      }

      setReviewerMessage("");
      await refreshApprovalState();
      window.dispatchEvent(new Event("approvalUpdated"));
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setReviewerAction(null);
    }
  }, [approval, canActAsReviewer, openReviewThreadCount, refreshApprovalState, reviewerMessage, toast]);

  const selectReviewThread = React.useCallback((threadId: string) => {
    setActiveReviewThreadId(threadId);
    const thread = approvalReviewThreads.find((entry) => String(entry.id) === String(threadId));
    if (!thread || !tiptapInstance || !thread.anchor_from || !thread.anchor_to) return;
    try {
      tiptapInstance.chain().focus().setTextSelection({ from: Number(thread.anchor_from), to: Number(thread.anchor_to) }).run();
    } catch {
      // ignore selection sync failures
    }
  }, [approvalReviewThreads, tiptapInstance]);

  const openCreateReviewThreadDialog = React.useCallback((kind: "selection" | "general") => {
    if (kind === "selection" && !pendingReviewSelection) {
      toast({ title: "Select text first", description: "Highlight a passage to start an anchored review thread.", variant: "destructive" });
      return;
    }
    if (!canCreateReviewThreads) {
      toast({ title: "Review is read-only", description: "You can't start new review threads right now.", variant: "destructive" });
      return;
    }
    setReviewThreadDraft("");
    setReviewThreadDialog({ open: true, kind });
  }, [canCreateReviewThreads, pendingReviewSelection, toast]);

  const doCreateInlineGeneralThread = React.useCallback(async (message: string) => {
    if (!approval) return;
    if (!message.trim()) {
      toast({ title: "Message required", description: "Add a review message to start the thread.", variant: "destructive" });
      return;
    }
    setCreatingReviewThread(true);
    try {
      const result = await createApprovalReviewThread(approval.id, {
        message: message.trim(),
        threadType: "general",
      });
      setApprovalReviewThreads((prev) => [result.thread, ...prev]);
      setActiveReviewThreadId(result.thread.id);
      toast({ title: "Thread created", description: "Review thread added to this approval." });
      window.setTimeout(() => {
        void refreshApprovalState();
      }, 1600);
    } catch (e: any) {
      toast({ title: "Could not create thread", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setCreatingReviewThread(false);
    }
  }, [approval, refreshApprovalState, toast]);

  const createReviewThreadFromDialog = React.useCallback(async () => {
    if (!approval) return;
    const message = reviewThreadDraft.trim();
    if (!message) {
      toast({ title: "Message required", description: "Add a review message to start the thread.", variant: "destructive" });
      return;
    }
    if (reviewThreadDialog.kind === "selection" && !pendingReviewSelection) {
      toast({ title: "Selection missing", description: "Select text again and retry.", variant: "destructive" });
      return;
    }

    setCreatingReviewThread(true);
    try {
      const result = await createApprovalReviewThread(approval.id, {
        message,
        threadType: reviewThreadDialog.kind,
        anchor: reviewThreadDialog.kind === "selection" && pendingReviewSelection
          ? {
            from: pendingReviewSelection.from,
            to: pendingReviewSelection.to,
            quote: pendingReviewSelection.quote,
          }
          : undefined,
      });
      setReviewThreadDraft("");
      setReviewThreadDialog({ open: false, kind: "selection" });
      setReviewSelection(null);
      setApprovalReviewThreads((prev) => [result.thread, ...prev]);
      setActiveReviewThreadId(result.thread.id);
      toast({ title: "Thread created", description: "Review thread added to this approval." });
      window.setTimeout(() => {
        void refreshApprovalState();
      }, 1600);
    } catch (e: any) {
      toast({ title: "Could not create thread", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setCreatingReviewThread(false);
    }
  }, [approval, pendingReviewSelection, refreshApprovalState, reviewThreadDialog.kind, reviewThreadDraft, toast]);

  const replyToReviewThread = React.useCallback(async (threadId: string, message: string) => {
    if (!approval) return;
    setReviewThreadMutation({ threadId, kind: "reply" });
    try {
      const result = await replyToApprovalReviewThread(approval.id, threadId, message);
      setApprovalReviewThreads((prev) => prev.map((thread) => (
        String(thread.id) === String(threadId)
          ? {
            ...thread,
            last_commented_at: result.comment.created_at,
            comments: [...(thread.comments || []), result.comment],
          }
          : thread
      )));
      window.setTimeout(() => {
        void refreshApprovalState();
      }, 1600);
    } catch (e: any) {
      toast({ title: "Reply failed", description: e?.message || "Unknown error", variant: "destructive" });
      throw e;
    } finally {
      setReviewThreadMutation({ threadId: null, kind: null });
    }
  }, [approval, refreshApprovalState, toast]);

  const resolveReviewThread = React.useCallback(async (threadId: string) => {
    if (!approval) return;
    setReviewThreadMutation({ threadId, kind: "resolve" });
    try {
      const result = await resolveApprovalReviewThread(approval.id, threadId);
      setApprovalReviewThreads((prev) => prev.map((thread) => (
        String(thread.id) === String(threadId)
          ? {
            ...thread,
            ...result.thread,
            comments: [...(thread.comments || []), ...(result.thread.comments || [])],
          }
          : thread
      )));
      window.setTimeout(() => {
        void refreshApprovalState();
      }, 1600);
    } catch (e: any) {
      toast({ title: "Resolve failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setReviewThreadMutation({ threadId: null, kind: null });
    }
  }, [approval, refreshApprovalState, toast]);

  const reopenReviewThread = React.useCallback(async (threadId: string) => {
    if (!approval) return;
    setReviewThreadMutation({ threadId, kind: "reopen" });
    try {
      const result = await reopenApprovalReviewThread(approval.id, threadId);
      setApprovalReviewThreads((prev) => prev.map((thread) => (
        String(thread.id) === String(threadId)
          ? {
            ...thread,
            ...result.thread,
            comments: [...(thread.comments || []), ...(result.thread.comments || [])],
          }
          : thread
      )));
      window.setTimeout(() => {
        void refreshApprovalState();
      }, 1600);
    } catch (e: any) {
      toast({ title: "Reopen failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setReviewThreadMutation({ threadId: null, kind: null });
    }
  }, [approval, refreshApprovalState, toast]);

  const openVersionPreview = React.useCallback((versionNumber: number) => {
    setPreviewVersionNumber(versionNumber);
    setPreviewOpen(true);
  }, []);

  const openVersionInCanvas = React.useCallback((versionNumber: number) => {
    if (versionNumber === headVersion) {
      router.push(`/editor/${docId}`);
      return;
    }
    router.push(`/editor/${docId}?version=${versionNumber}`);
  }, [docId, headVersion, router]);

  const restoreCurrentCanvasVersion = React.useCallback(() => {
    router.push(`/editor/${docId}`);
  }, [docId, router]);

  const requestRestoreVersion = React.useCallback((versionNumber: number) => {
    setRestoreTargetVersion(versionNumber);
    setRestoreConfirmOpen(true);
  }, []);

  const focusDesktopRail = React.useCallback((tab: DesktopRailTab) => {
    setDesktopRailTab(tab);
    setIsRightBarOpen(true);
  }, []);

  const openInspector = React.useCallback((tab: "versions" | "approval") => {
    setInspectorTab(tab);
    if (tab === "approval") setApprovalPanelTab("overview");
    setInspectorOpen(true);
  }, []);

  const openSideSurface = React.useCallback((target: "versions" | "review" | "activity" | "ai") => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      if (target === "versions") {
        setDesktopHistoryOpen(true);
      } else if (target === "activity") {
        focusDesktopRail("workflow");
      } else if (target === "ai") {
        focusDesktopRail("ai");
      } else {
        focusDesktopRail("discuss");
      }
      return;
    }

    if (target === "versions") {
      openInspector("versions");
      return;
    }

    openInspector("approval");
    if (target === "activity") {
      setApprovalPanelTab("timeline");
    } else {
      setApprovalPanelTab("comments");
    }
  }, [focusDesktopRail, openInspector]);

  const openCurrentApprovalSurface = React.useCallback(() => {
    if (!approvalBannerCta) return;

    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      focusDesktopRail(approvalBannerCta.mobileTab === "overview" ? "workflow" : "discuss");
      return;
    }

    openInspector("approval");
    setApprovalPanelTab(approvalBannerCta.mobileTab);
  }, [approvalBannerCta, focusDesktopRail, openInspector]);

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
      const updated = await updateDocument(docId, {
        title: nextTitle,
        filename: toEditorDocFilename(nextTitle),
      } as any);
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
    if (isViewingFixedVersion) return <Badge variant="secondary" className="rounded-full px-3 py-0.5 text-[11px] font-medium bg-muted/40 text-muted-foreground border-transparent">Read-only</Badge>;
    if (!canEdit) return <Badge variant="secondary" className="rounded-full px-3 py-0.5 text-[11px] font-medium bg-muted/40 text-muted-foreground border-transparent">Read-only</Badge>;
    if (isApprovalActive || !editRequested) return <Badge variant="secondary" className="rounded-full px-3 py-0.5 text-[11px] font-medium bg-muted/40 text-muted-foreground border-transparent">Read-only</Badge>;
    if (lockState.state === "active") return <Badge className="rounded-full px-3 py-0.5 text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border-transparent flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Editing</Badge>;
    if (lockState.state === "acquiring") return <Badge variant="outline" className="rounded-full gap-1 px-3 py-0.5 text-[11px] font-medium"><Loader2 className="h-3 w-3 animate-spin" />Connecting</Badge>;
    if (lockState.state === "locked") return <Badge className="rounded-full px-3 py-0.5 text-[11px] font-medium bg-muted/40 text-muted-foreground border-transparent flex items-center gap-1.5"><Lock className="h-3 w-3" />Read-only</Badge>;
    return <Badge variant="secondary" className="rounded-full px-3 py-0.5 text-[11px] font-medium bg-muted/40 text-muted-foreground border-transparent">Read-only</Badge>;
  })();

  const docStatusBadge = (() => {
    if (loading || isViewingFixedVersion) return null;

    const status = String(approval?.status || "").toLowerCase();

    if (status === "approved") {
      return <Badge className="rounded-full px-3 py-0.5 text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border-transparent flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Approved</Badge>;
    }

    if (canActAsReviewer || status === "in_progress" || status === "draft") {
      return <Badge className="rounded-full px-3 py-0.5 text-[11px] font-bold bg-blue-500/10 text-blue-600 border-transparent flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />In Review</Badge>;
    }

    if (status === "rejected") {
      return <Badge className="rounded-full px-3 py-0.5 text-[11px] font-bold bg-amber-500/10 text-amber-600 border-transparent flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Needs changes</Badge>;
    }

    if (status === "cancelled") {
      return <Badge className="rounded-full px-3 py-0.5 text-[11px] font-bold bg-muted/60 text-muted-foreground border-transparent flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />Cancelled</Badge>;
    }

    if (isDraftDirty || autosaveStatus === "saving" || autosaveStatus === "error") {
      return <Badge className="rounded-full px-3 py-0.5 text-[11px] font-bold bg-amber-500/10 text-amber-600 border-transparent flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Draft</Badge>;
    }

    return null;
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

  const activeVersionNumber = isViewingFixedVersion && viewVersion ? viewVersion : headVersion;
  const activeVersionMeta = versions.find((entry) => entry.version_number === activeVersionNumber) || null;

  return (
    <AppLayout collapseSidebar>
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
        <header className="sticky top-0 z-50 w-full bg-background border-b border-border/40">
          <div className="mx-auto max-w-full">
            <div className="flex h-12 items-center justify-between px-2 md:px-4">
              <div className="flex items-center gap-1.5 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => router.push("/editor")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-2 min-w-0 ml-1">
                  <span className="text-[13px] text-muted-foreground font-medium shrink-0 flex items-center gap-1.5 hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded-md hover:bg-muted/50">
                    <div className="flex h-4 w-4 items-center justify-center rounded-[4px] bg-orange-500/10 border border-orange-500/20">
                      <Folder className="h-2.5 w-2.5 text-orange-600 dark:text-orange-400" />
                    </div>
                    {docFolderPath.length ? docFolderPath.join("/") : "Untitled Project"}
                  </span>

                  <span className="text-muted-foreground/30 font-light text-sm">/</span>

                  <div className="flex h-4 w-4 items-center justify-center rounded-[4px] bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                    <FileText className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                  </div>

                  {loading ? (
                    <span className="text-[13px] font-semibold text-foreground">Loading...</span>
                  ) : canEdit ? (
                    <div className="flex items-center">
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
                        className="h-7 w-[100px] sm:w-[200px] md:w-[350px] lg:w-[450px] border-transparent bg-transparent px-1 text-[13px] font-semibold tracking-tight shadow-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-0 truncate transition-colors rounded-md"
                        aria-label="Document title"
                      />
                      {titleSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-2 shrink-0" />}
                    </div>
                  ) : (
                    <span className="text-[13px] font-semibold text-foreground truncate px-1">{title}</span>
                  )}
                </div>

                <div className="hidden sm:flex items-center gap-2 px-2 border-l border-border/20 ml-1">
                  {lockBadge}
                  {docStatusBadge}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 pr-1">
                {saving ? (
                  <span className="text-[12px] text-muted-foreground hidden md:inline-block mr-3">Saving...</span>
                ) : (
                  <span className="text-[12px] text-muted-foreground hidden md:inline-block mr-3">
                    Edited {formatTimeAgoShort(latestVersionCreatedAt) || "just now"}
                  </span>
                )}

                <div className="flex items-center gap-0.5 ml-1 mr-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8 transition-all duration-200 rounded-lg",
                      isRightBarOpen && desktopRailTab === "ai"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)]"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                    onClick={() => {
                      if (isRightBarOpen && desktopRailTab === "ai") {
                        setIsRightBarOpen(false);
                      } else {
                        setDesktopRailTab("ai");
                        setIsRightBarOpen(true);
                      }
                    }}
                  >
                    <Sparkles className={cn("h-4 w-4", isRightBarOpen && desktopRailTab === "ai" && "fill-emerald-500/20")} />
                  </Button>
                </div>

                <Button
                  size="sm"
                  className="h-7 gap-1.5 px-3 text-[12px] font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm ml-1 rounded-md"
                  onClick={() => void doSave()}
                  disabled={!editorEditable || saving || !isDraftDirty}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  <span>Save</span>
                </Button>

                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ml-1">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl border-border/40 shadow-lg p-1 bg-background">
                    <DropdownMenuItem className="text-[13px] gap-2 cursor-pointer font-medium py-2 focus:bg-muted/50">
                      <Sparkles className="h-4 w-4 text-muted-foreground/80" />
                      <span>Ask AI</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border/40 my-1" />
                    <DropdownMenuItem
                      className="text-[13px] gap-2 cursor-pointer font-medium py-2 focus:bg-muted/50"
                      onClick={() => { if (canEdit) setTitleInput(title || "Untitled") }}
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground/80" />
                      <span>Rename</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[13px] gap-2 cursor-pointer font-medium py-2 focus:bg-muted/50">
                      <FolderOpen className="h-4 w-4 text-muted-foreground/80" />
                      <span>Move to</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[13px] gap-2 cursor-pointer font-medium py-2 focus:bg-muted/50">
                      <Copy className="h-4 w-4 text-muted-foreground/80" />
                      <span>Duplicate</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[13px] gap-2 cursor-pointer font-medium py-2 focus:bg-muted/50">
                      <Download className="h-4 w-4 text-muted-foreground/80" />
                      <span>Download</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border/40 my-1" />
                    <DropdownMenuItem className="text-[13px] gap-2 cursor-pointer font-medium py-2 focus:bg-muted/50 justify-between">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-muted-foreground/80" />
                        <span>Information</span>
                      </div>
                      <span className="text-muted-foreground/60 scale-125 leading-none mr-1">›</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[13px] gap-2 cursor-pointer font-medium py-2 focus:bg-muted/50"
                      onClick={() => setDesktopHistoryOpen((open) => !open)}
                    >
                      <History className="h-4 w-4 text-muted-foreground/80" />
                      <span>{desktopHistoryOpen ? "Hide history" : "View history"}</span>
                    </DropdownMenuItem>
                    {canDelete && (
                      <DropdownMenuItem
                        className="text-[13px] gap-2 cursor-pointer font-medium py-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                        onClick={() => setDeleteConfirmOpen(true)}
                        disabled={deleting || loading}
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin text-destructive/80" /> : <Trash2 className="h-4 w-4 text-destructive/80" />}
                        <span>Delete</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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

        <main
          className={cn(
            "flex-1 px-4 md:px-6 py-6",
            !isResizingRightBar && "transition-[padding] duration-300 ease-in-out",
            !isRightBarOpen && "lg:pr-0"
          )}
          style={isRightBarOpen ? { paddingRight: `${rightBarWidth + 40}px` } : undefined}
        >
          <div className="mx-auto max-w-[1480px] lg:flex lg:items-start lg:gap-6">
            <aside
              className={cn(
                "hidden lg:flex sticky top-[96px] h-[calc(100svh-120px)] shrink-0 flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/35 backdrop-blur transition-[width,opacity,margin] duration-200",
                desktopHistoryOpen ? "w-[260px] opacity-100" : "w-0 opacity-0 -ml-6 pointer-events-none"
              )}
            >
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Version History</div>
                {isViewingFixedVersion ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 text-[11px]"
                    onClick={restoreCurrentCanvasVersion}
                  >
                    Current
                  </Button>
                ) : null}
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-1 p-2">
                  {versionsLoading && versions.length === 0 ? (
                    <>
                      <Skeleton className="h-20 rounded-xl" />
                      <Skeleton className="h-20 rounded-xl" />
                      <Skeleton className="h-20 rounded-xl" />
                    </>
                  ) : versions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/50 px-4 py-6 text-[12px] text-muted-foreground">
                      No versions yet.
                    </div>
                  ) : (
                    versions.map((version) => {
                      const isActiveVersion = version.version_number === activeVersionNumber;
                      const isHeadVersion = version.version_number === headVersion;
                      return (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() => openVersionInCanvas(version.version_number)}
                          className={cn(
                            "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                            isActiveVersion
                              ? "border-primary/30 bg-primary/[0.08]"
                              : "border-transparent hover:border-border/50 hover:bg-muted/40"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-mono text-[11px] font-medium text-foreground">v{version.version_number}</div>
                            {isHeadVersion && !isViewingFixedVersion ? (
                              <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
                                Current
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">{formatAppDateTime(version.created_at)}</span>
                            )}
                          </div>
                          <div className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                            {version.commit_message || "(no message)"}
                          </div>
                          <div className="mt-2 text-[10px] text-muted-foreground">
                            {version.created_by ? formatUserLabel(version.created_by, currentUserId, orgUserLabels) : "Unknown"}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </aside>

            <div className="min-w-0 flex-1">
              <div className="mx-auto max-w-[860px] space-y-4">
                {loading ? (
                  <div className="rounded-lg border border-border/40 bg-card/50 overflow-hidden">
                    {/* Toolbar skeleton */}
                    <div className="border-b border-border/40 bg-muted/10 px-3 py-2.5 flex items-center gap-2">
                      <Skeleton className="h-5 w-5 rounded" />
                      <Skeleton className="h-5 w-5 rounded" />
                      <Skeleton className="h-5 w-5 rounded" />
                      <Skeleton className="h-5 w-5 rounded" />
                      <div className="mx-1 h-4 w-px bg-border/50" />
                      <Skeleton className="h-5 w-5 rounded" />
                      <Skeleton className="h-5 w-5 rounded" />
                      <div className="mx-1 h-4 w-px bg-border/50" />
                      <Skeleton className="h-5 w-5 rounded" />
                      <Skeleton className="h-5 w-5 rounded" />
                      <Skeleton className="h-5 w-5 rounded" />
                    </div>
                    {/* Hint bar skeleton */}
                    <div className="border-b border-border/30 px-4 py-2">
                      <Skeleton className="h-3 w-64" />
                    </div>
                    {/* Document body skeleton */}
                    <div className="px-6 py-8 space-y-5">
                      {/* H1 heading */}
                      <Skeleton className="h-8 w-72" />
                      {/* Paragraph lines */}
                      <div className="space-y-2.5">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[90%]" />
                        <Skeleton className="h-4 w-[75%]" />
                      </div>
                      {/* Spacing / second block */}
                      <div className="space-y-2.5 pt-1">
                        <Skeleton className="h-5 w-56" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[85%]" />
                        <Skeleton className="h-4 w-[60%]" />
                      </div>
                      {/* Third block */}
                      <div className="space-y-2.5 pt-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[95%]" />
                        <Skeleton className="h-4 w-[70%]" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {canActAsReviewer && (
                      <div className="rounded-lg border border-primary/25 bg-primary/[0.05] px-3 py-3 space-y-2 lg:hidden">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">Review pending for you</div>
                            <div className="text-xs text-muted-foreground">
                              {reviewerQueueItem?.stage
                                ? `Stage ${reviewerQueueItem.stage.stage_order}: ${formatApprovalStageLabel(reviewerQueueItem.stage)}`
                                : "You are assigned as an approver for this document."}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => openSideSurface("review")}
                            >
                              Open review panel
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Textarea
                            value={reviewerMessage}
                            onChange={(e) => setReviewerMessage(e.target.value)}
                            placeholder="Final note for approve or request changes"
                            className="min-h-[72px] bg-background"
                            disabled={Boolean(reviewerAction)}
                          />
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {openReviewThreadCount > 0 ? (
                              <div className="w-full text-right text-[11px] font-medium text-amber-700">
                                Resolve open threads before approving.
                              </div>
                            ) : null}
                            <Button
                              size="sm"
                              className="h-8 gap-1.5 min-w-[92px]"
                              onClick={() => void doReviewerAction("approve")}
                              disabled={Boolean(reviewerAction) || openReviewThreadCount > 0}
                            >
                              {reviewerAction === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                              Approve
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

                    {isViewingFixedVersion ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/40 bg-amber-50/10 px-4 py-3 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium text-amber-700">
                            Viewing {activeVersionMeta ? `v${activeVersionMeta.version_number}` : `v${viewVersion}`}
                          </div>
                          <div className="mt-1 text-xs text-amber-700/80">
                            {activeVersionMeta?.created_at ? formatAppDateTime(activeVersionMeta.created_at) : "Snapshot view"}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={restoreCurrentCanvasVersion}>
                          Back to current
                        </Button>
                      </div>
                    ) : null}

                    {isApprovalActive && (
                      <div className="rounded-lg border border-amber-200/50 bg-amber-50/10 px-3 py-2 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                          <div>
                            <div className="text-sm font-medium">{approvalBannerTitle}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{approvalBannerDescription}</div>
                          </div>
                        </div>
                        {approvalBannerCta ? (
                          <Button variant="outline" size="sm" className="h-8" onClick={openCurrentApprovalSurface}>
                            {approvalBannerCta.label}
                          </Button>
                        ) : null}
                      </div>
                    )}

                    {canCreateReviewThreads && pendingReviewSelection && (
                      <div className="rounded-lg border border-primary/25 bg-primary/[0.05] px-3 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between lg:hidden">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">Selection ready for review thread</div>
                          <div className="mt-1 text-xs text-muted-foreground break-words">
                            {pendingReviewSelection.quote.length > 220 ? `${pendingReviewSelection.quote.slice(0, 217)}...` : pendingReviewSelection.quote}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-8"
                            onClick={() => openCreateReviewThreadDialog("selection")}
                          >
                            Start thread
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setReviewSelection(null)}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    )}

                    <TipTapEditor
                      value={doc}
                      onChange={(next) => setDoc(next)}
                      onEditorReady={setTiptapInstance}
                      onSelectionRangeChange={(selection) => setReviewSelection(selection)}
                      placeholder="Type and format like Notion..."
                      surfaceVariant="plain"
                      editable={editorEditable}
                      showToolbar={editorEditable}
                      showBubbleMenu={editorEditable}
                      toolbarStickyOffset={88}
                      approvalComments={reviewCommentAnchors}
                      activeApprovalCommentId={activeReviewThread?.id || null}
                      className={cn(
                        "border-0 bg-transparent shadow-none",
                        isViewingFixedVersion && "opacity-80"
                      )}
                      onApprovalCommentSelect={(threadId) => {
                        if (!threadId) return;
                        selectReviewThread(threadId);
                        openSideSurface("review");
                      }}
                    />
                  </>
                )}

                {!isApprovalActive && (
                  <div className="mt-6 lg:hidden">
                    <AiSidebar
                      editor={tiptapInstance}
                      docId={docId}
                      versionId={(viewVersion ?? headVersion) || 1}
                      sessionId={lockState.state === "active" ? lockState.sessionId : undefined}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        <aside
          className={cn(
            "hidden lg:flex fixed right-0 top-[72px] z-10 h-[calc(100svh-72px)] flex-col border-l border-border/50 bg-background backdrop-blur",
            !isResizingRightBar && "transition-all duration-300 ease-in-out",
            isRightBarOpen ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
          )}
          style={{ width: rightBarWidth }}
        >
          {/* Drag handle */}
          <div
            className="absolute left-0 top-0 bottom-0 z-20 w-3 cursor-col-resize group flex items-center"
            onMouseDown={onRightBarResizeStart}
            title="Drag to resize"
          >
            <div className={cn(
              "absolute inset-y-0 left-0 w-[3px] transition-colors",
              isResizingRightBar ? "bg-primary/60" : "bg-transparent group-hover:bg-primary/30"
            )} />
            <div className={cn(
              "relative -left-1.5 flex h-8 w-5 items-center justify-center rounded-md border border-border/60 bg-background shadow-sm transition-all",
              isResizingRightBar
                ? "opacity-100 border-primary/40 bg-primary/5"
                : "opacity-0 group-hover:opacity-100"
            )}>
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          <div className="flex border-b border-border/40 bg-card/30 shrink-0">
            <button
              type="button"
              onClick={() => focusDesktopRail("ai")}
              className={cn(
                "flex-1 basis-0 min-w-0 flex items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] transition-all duration-200",
                desktopRailTab === "ai" ? "border-primary text-foreground" : "border-transparent text-muted-foreground/60 hover:text-foreground/80 hover:bg-muted/30"
              )}
            >
              Assistant
            </button>
            <button
              type="button"
              onClick={() => focusDesktopRail("workflow")}
              className={cn(
                "flex-1 basis-0 min-w-0 flex items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] transition-all duration-200",
                desktopRailTab === "workflow" ? "border-primary text-foreground" : "border-transparent text-muted-foreground/60 hover:text-foreground/80 hover:bg-muted/30"
              )}
            >
              Approval
            </button>
            <button
              type="button"
              onClick={() => focusDesktopRail("discuss")}
              className={cn(
                "flex-1 basis-0 min-w-0 flex items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] transition-all duration-200",
                desktopRailTab === "discuss" ? "border-primary text-foreground" : "border-transparent text-muted-foreground/60 hover:text-foreground/80 hover:bg-muted/30"
              )}
            >
              Discussion
              {openReviewThreadCount > 0 ? (
                <span className="rounded-full bg-amber-500 text-white px-1.5 py-0.5 text-[9px] font-bold shadow-sm">
                  {openReviewThreadCount}
                </span>
              ) : null}
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            {desktopRailTab === "ai" ? (
              <div className="min-h-0 flex-1 h-full">
                <AiSidebar
                  editor={tiptapInstance}
                  docId={docId}
                  versionId={(viewVersion ?? headVersion) || 1}
                  sessionId={lockState.state === "active" ? lockState.sessionId : undefined}
                  className="h-full rounded-none border-0 bg-transparent px-4 py-4"
                />
              </div>
            ) : desktopRailTab === "workflow" ? (
              <ScrollArea className="h-full bg-background/50">
                <div className="p-4 space-y-8">
                  <div className="space-y-10">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 pl-1">Approval Pipeline</div>
                    <div className="flex flex-col pl-1">
                      {!approval && selectedApprovalTemplate?.config?.stages ? (
                        <div className="flex flex-col pl-1">
                          {selectedApprovalTemplate.config.stages.map((stage: any, i: number) => {
                            const isFirst = i === 0;
                            const isLast = i === selectedApprovalTemplate.config.stages.length - 1;

                            return (
                              <div key={stage.id || i} className="relative pb-8 last:pb-0">
                                {/* Pipeline Line */}
                                {!isLast && (
                                  <div className="absolute left-[6px] top-4 w-[2px] bottom-0 -mb-2 bg-border/20 transition-colors" />
                                )}

                                {/* Stage Header */}
                                <div className="flex items-center gap-4 relative z-10">
                                  <div className={cn(
                                    "w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/20 bg-background transition-all duration-300"
                                  )} />
                                  <div className="flex flex-col">
                                    <h3 className="text-[12px] font-bold text-foreground/80 lowercase">
                                      {stage.name || `Stage ${i + 1}`}
                                    </h3>
                                    <div className="text-[10px] text-muted-foreground/50 font-medium tabular-nums tracking-tight">
                                      {stage.id || `step_${i + 1}`}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : !approval ? (
                        <div className="rounded-xl border border-dashed border-border/60 bg-background/50 px-4 py-8 text-center text-[12px] text-muted-foreground">
                          Workflow steps will appear here.
                        </div>
                      ) : approvalStages.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/60 bg-background/50 px-4 py-8 text-center text-[12px] text-muted-foreground">
                          Workflow steps will appear here.
                        </div>
                      ) : (
                        approvalStages.map((stage: any, i: number) => {
                          const status = String(stage.status || "").toLowerCase();
                          const stageSummary = approvalStageSummaryById.get(String(stage.id));
                          const isActive = status === "in_progress";
                          const isApproved = status === "approved";
                          const isRejected = status === "rejected";

                          const approvers = [
                            ...(stageSummary?.actedLabels || []).map(name => ({ name, acted: true })),
                            ...(stageSummary?.pendingLabels || []).map(name => ({ name, acted: false })),
                          ];

                          return (
                            <div key={stage.id} className="relative pb-10 last:pb-0">
                              {/* Pipeline Line */}
                              {i < approvalStages.length - 1 && (
                                <div className={cn(
                                  "absolute left-[6px] top-4 w-[2px] bottom-0 -mb-4 transition-colors duration-500",
                                  isApproved ? "bg-emerald-500/30" : "bg-border/30"
                                )} />
                              )}

                              {/* Stage Header */}
                              <div className="flex items-center justify-between gap-4 mb-2 relative z-10">
                                <div className="flex items-center gap-4">
                                  <div className={cn(
                                    "w-3.5 h-3.5 rounded-full border-2 transition-all duration-300",
                                    isActive ? "bg-primary border-primary shadow-[0_0_0_4px_rgba(124,111,247,0.1)]" :
                                      isApproved ? "bg-emerald-500 border-emerald-500" :
                                        isRejected ? "bg-rose-500 border-rose-500" :
                                          "border-muted-foreground/30 bg-background"
                                  )} />
                                  <div className="flex flex-col">
                                    <h3 className="text-[13.5px] font-bold text-foreground">
                                      Stage {stage.stage_order}: {formatApprovalStageLabel(stage)}
                                    </h3>
                                    <div className="text-[11px] text-muted-foreground/60 font-medium lowercase">
                                      Requires {stage.mode === 'sequential' ? 'single' : 'all'} approver{stage.mode === 'sequential' ? '' : 's'}
                                    </div>
                                  </div>
                                </div>
                                <div className={cn(
                                  "text-[9px] font-black tracking-widest px-2.5 py-1 rounded bg-muted/40 text-muted-foreground uppercase",
                                  isActive && "bg-primary/10 text-primary",
                                  isApproved && "bg-emerald-500/10 text-emerald-600",
                                  isRejected && "bg-rose-500/10 text-rose-600"
                                )}>
                                  {status.replace(/_/g, " ")}
                                </div>
                              </div>

                              {/* Approvers List */}
                              {approvers.length > 0 && (
                                <div className="mt-6 space-y-2.5 pl-7">
                                  {approvers.map((appr, idx) => (
                                    <div
                                      key={`${stage.id}-${appr.name}-${idx}`}
                                      className="flex items-center justify-between py-1.5 group transition-colors hover:bg-muted/10 rounded-lg px-2 -mx-2"
                                    >
                                      <div className="flex items-center gap-2.5">
                                        <div className={cn(
                                          "w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold text-white shadow-sm transition-transform",
                                          appr.acted ? "bg-emerald-500" : "bg-muted-foreground/30"
                                        )}>
                                          {appr.name.slice(0, 2).toUpperCase()}
                                        </div>
                                        <span className={cn(
                                          "text-[12.5px] font-medium",
                                          appr.acted ? "text-foreground" : "text-muted-foreground/70"
                                        )}>
                                          {appr.name}
                                        </span>
                                      </div>
                                      {appr.acted ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[3]" />
                                      ) : (
                                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20 mr-1" />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {canActAsReviewer && approval?.status === "in_progress" ? (
                    <div className="group rounded-xl border border-border/30 bg-background/30 p-1 transition-all hover:bg-background/50 hover:border-border/60">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-border/10">
                        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Your Decision</div>
                        {reviewerQueueItem?.stage && (
                          <div className="text-[9px] bg-primary/10 px-2 py-0.5 rounded-full font-bold text-primary">Stage {reviewerQueueItem.stage.stage_order}</div>
                        )}
                      </div>
                      <div className="p-2">
                        <Textarea
                          value={reviewerMessage}
                          onChange={(e) => setReviewerMessage(e.target.value)}
                          placeholder="Explain the decision..."
                          className="min-h-[80px] w-full resize-none border-0 p-1 text-[12.5px] bg-transparent focus-visible:ring-0 placeholder:text-muted-foreground/40 leading-relaxed"
                          disabled={Boolean(reviewerAction)}
                        />
                      </div>
                    </div>
                  ) : null}

                  {(canResubmitApproval || (!approval && canSubmitApproval)) ? (
                    <div className="space-y-6 pt-4">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 pl-1">Configuration</label>
                          {renderApprovalTemplatePicker()}
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 pl-1">Message</label>
                          <Textarea
                            value={submitMessage}
                            onChange={(e) => setSubmitMessage(e.target.value)}
                            placeholder={approval ? "Explain changes..." : "What should reviewers focus on?"}
                            className="min-h-[100px] w-full resize-none border border-border/20 p-3 text-[12.5px] bg-background/30 focus-visible:ring-1 focus-visible:ring-primary/20 placeholder:text-muted-foreground/30 leading-relaxed rounded-xl transition-all hover:border-border/40"
                            disabled={!canSubmitApproval || approvalLoading}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {activityActions.length > 0 && (
                    <div className="pt-6 border-t border-border/40 mt-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 mb-5 pl-1 flex items-center gap-2">
                        <Clock className="w-3 h-3" /> Recent Activity
                      </div>
                      <div className="flex flex-col gap-0.5 relative">
                        {activityActions.slice(0, 5).map((action) => (
                          <div key={action.id} className="group relative pl-4 py-3 hover:bg-muted/10 rounded-lg transition-colors border-l-2 border-transparent hover:border-primary/30">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[12px] leading-relaxed text-foreground/90 flex items-baseline gap-1.5 flex-wrap">
                                  <span className="font-bold text-foreground">{formatUserLabel(action.actor_user_id, currentUserId, orgUserLabels)}</span>
                                  <span className="text-muted-foreground text-[11px] font-medium lowercase italic">
                                    {String(action.action_type || "").replace(/_/g, " ")}
                                  </span>
                                </div>
                                {action.message && (
                                  <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80 line-clamp-2">
                                    {action.message}
                                  </div>
                                )}
                              </div>
                              <div className="text-[9px] font-medium text-muted-foreground/40 tabular-nums shrink-0 pt-1 uppercase">
                                {formatAppDateTime(action.created_at)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex h-full flex-col bg-background/50">
                <div className="px-4 py-4 flex items-center justify-between sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/40">
                  <div className="flex items-center gap-1.5 bg-muted/40 p-0.5 rounded-lg border border-border/20">
                    {([
                      { key: "open", label: `Open` },
                      { key: "resolved", label: `Resolved` },
                      { key: "all", label: `All` },
                    ] as const).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setThreadFilter(item.key)}
                        className={cn(
                          "rounded-full px-3 py-1 text-[11px] font-semibold transition-all duration-200",
                          threadFilter === item.key
                            ? "bg-background shadow-sm text-foreground"
                            : "bg-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {approval && openReviewThreadCount > 0 ? (
                    <Badge variant="outline" className="h-[22px] px-2 text-[10px] tracking-wide bg-amber-500/10 text-amber-600 border-amber-500/20 font-bold">
                      {openReviewThreadCount} OPEN
                    </Badge>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 flex flex-col bg-background/50">
                  {showReviewWorkspace ? (
                    <ApprovalReviewThreads
                      threads={filteredReviewThreads}
                      activeThreadId={activeReviewThreadId}
                      onSelectThread={selectReviewThread}
                      currentUserId={currentUserId}
                      userLabels={orgUserLabels}
                      canCreateThreads={canCreateReviewThreads}
                      canComment={canCommentInReview}
                      canResolve={canResolveReviewThreads}
                      pendingSelection={pendingReviewSelection}
                      onCreateSelectionThread={() => openCreateReviewThreadDialog("selection")}
                      onSubmitGeneralThread={doCreateInlineGeneralThread}
                      isSubmittingGeneralThread={creatingReviewThread}
                      onReply={replyToReviewThread}
                      onResolve={resolveReviewThread}
                      onReopen={reopenReviewThread}
                      mutationState={reviewThreadMutation}
                      stageMetaById={reviewThreadStageMetaById}
                      emptyMessage={approvalReviewThreads.length > 0 ? "No matching threads" : undefined}
                      className="flex-1"
                    />
                  ) : !approval ? (
                    <div className="m-4 rounded-xl border border-dashed border-border/60 bg-background/50 px-4 py-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-foreground">Discussion opens after submit</div>
                          <div className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                            Anchored comments and review threads will appear here once the document is in approval.
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 h-8"
                            onClick={() => focusDesktopRail("workflow")}
                          >
                            Open approval
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="m-4 rounded-xl border border-dashed border-border/60 bg-card p-6 text-center shadow-sm">
                      <div className="text-[13px] font-medium text-foreground">Not in review</div>
                      <div className="text-[11px] text-muted-foreground mt-1">Submit the document to start discussing.</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {desktopRailTab === "workflow" && canActAsReviewer && approval?.status === "in_progress" ? (
            <div className="border-t border-border/50 bg-background/95 px-4 py-4">
              {openReviewThreadCount > 0 ? (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200/50 bg-amber-50/40 px-3 py-2 text-[11px] font-medium text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Resolve review threads before final approval.
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Decision actions</div>
                {canCancelThisApproval ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-[11px]"
                    onClick={() => void doCancelApproval()}
                    disabled={approvalLoading}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-4"
                  onClick={() => void doReviewerAction("reject")}
                  disabled={Boolean(reviewerAction)}
                >
                  {reviewerAction === "reject" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Request changes
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-4"
                  onClick={() => void doReviewerAction("approve")}
                  disabled={Boolean(reviewerAction) || openReviewThreadCount > 0}
                >
                  {reviewerAction === "approve" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Approve
                </Button>
              </div>
            </div>
          ) : desktopRailTab === "workflow" && (canResubmitApproval || (!approval && canSubmitApproval)) ? (
            <div className="border-t border-border/50 bg-background/95 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {isDraftDirty && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest whitespace-nowrap">Unsaved edits</span>
                    </div>
                  )}
                  {canCancelThisApproval && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-foreground"
                      onClick={() => void doCancelApproval()}
                      disabled={approvalLoading}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
                <div className="flex-1 flex justify-end">
                  <Button
                    size="sm"
                    className="h-8 gap-2 px-4 text-[11px] font-bold uppercase tracking-[0.15em] shadow-lg shadow-primary/20"
                    onClick={handleSubmitApprovalClick}
                    disabled={!canSubmitApproval || approvalLoading}
                  >
                    {approvalLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    {approval ? "Resubmit" : "Submit for approval"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </aside>

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
                                        {v.created_by ? ` | ${formatUserLabel(v.created_by, currentUserId, orgUserLabels)}` : ""}
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
                                  <span className="rounded-full bg-muted px-1.5 py-0 text-[10px]">{approvalReviewThreads.length}</span>
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
                                          {formatApprovalStageLabel(reviewerQueueItem.stage)}
                                        </Badge>
                                      )}
                                    </div>
                                    <Textarea
                                      value={reviewerMessage}
                                      onChange={(e) => setReviewerMessage(e.target.value)}
                                      placeholder="Final note for approve or request changes"
                                      className="min-h-[78px]"
                                      disabled={Boolean(reviewerAction)}
                                    />
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      {openReviewThreadCount > 0 ? (
                                        <div className="w-full text-right text-[11px] font-medium text-amber-700">
                                          Resolve open threads before approving.
                                        </div>
                                      ) : null}
                                      <Button
                                        size="sm"
                                        className="h-8 gap-1.5"
                                        onClick={() => void doReviewerAction("approve")}
                                        disabled={Boolean(reviewerAction) || openReviewThreadCount > 0}
                                      >
                                        {reviewerAction === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                        Approve
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
                                    {approvalStages.map((s: any) => {
                                      const stageSummary = approvalStageSummaryById.get(String(s.id));
                                      return (
                                        <div key={s.id} className="px-3 py-2.5">
                                          <div className="flex items-center justify-between gap-3 text-sm">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="text-muted-foreground">{s.stage_order}.</span>
                                              <span className="truncate">{formatApprovalStageLabel(s)}</span>
                                            </div>
                                            <Badge variant="outline" className="capitalize">{String(s.status).replace("_", " ")}</Badge>
                                          </div>
                                          {stageSummary?.selectorLabel ? (
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                              {stageSummary.selectorLabel}
                                            </div>
                                          ) : null}
                                          {stageSummary?.statusDetail ? (
                                            <div className="mt-0.5 text-[11px] text-foreground/80">
                                              {stageSummary.statusDetail}
                                            </div>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {canResubmitApproval && (
                                  <>
                                    <Separator />
                                    <div className="space-y-2">
                                      <div className="text-xs font-medium text-muted-foreground">Resubmit for approval</div>
                                      {renderApprovalTemplatePicker()}
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
                                <ApprovalReviewThreads
                                  threads={approvalReviewThreads}
                                  activeThreadId={activeReviewThreadId}
                                  onSelectThread={selectReviewThread}
                                  currentUserId={currentUserId}
                                  userLabels={orgUserLabels}
                                  canCreateThreads={canCreateReviewThreads}
                                  canComment={canCommentInReview}
                                  canResolve={canResolveReviewThreads}
                                  pendingSelection={pendingReviewSelection}
                                  onCreateSelectionThread={() => openCreateReviewThreadDialog("selection")}
                                  onSubmitGeneralThread={doCreateInlineGeneralThread}
                                  isSubmittingGeneralThread={creatingReviewThread}
                                  onReply={replyToReviewThread}
                                  onResolve={resolveReviewThread}
                                  onReopen={reopenReviewThread}
                                  mutationState={reviewThreadMutation}
                                  stageMetaById={reviewThreadStageMetaById}
                                />
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
                              {renderApprovalTemplatePicker()}
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
                  <div className="text-sm font-medium truncate">{previewVersion?.commit_message || "(no message)"}</div>
                  <div className="text-xs text-muted-foreground">
                    {previewVersion?.created_at ? formatAppDateTime(previewVersion.created_at) : ""}
                    {previewVersion?.created_by
                      ? ` | ${formatUserLabel(previewVersion.created_by, currentUserId, orgUserLabels)}`
                      : ""}
                  </div>
                </div>

                <ScrollArea className="h-[420px] pr-3">
                  <TipTapEditor
                    value={(previewVersion?.content as any) || undefined}
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

        <Dialog
          open={reviewThreadDialog.open}
          onOpenChange={(open) => {
            setReviewThreadDialog((prev) => ({ ...prev, open }));
            if (!open) setReviewThreadDraft("");
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {reviewThreadDialog.kind === "selection" ? "Start review thread" : "Add general review note"}
              </DialogTitle>
              <DialogDescription>
                {reviewThreadDialog.kind === "selection"
                  ? "This thread will stay anchored to the selected passage on the submitted version."
                  : "Use this for review feedback that applies to the whole submission."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {reviewThreadDialog.kind === "selection" && pendingReviewSelection ? (
                <div className="rounded-lg border border-primary/10 bg-primary/[0.03] px-3 py-3 text-sm text-muted-foreground">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary/60">Selected text</div>
                  <div className="mt-2 text-foreground/90 italic">
                    "{pendingReviewSelection?.quote}"
                  </div>
                </div>
              ) : null}

              <Textarea
                value={reviewThreadDraft}
                onChange={(event) => setReviewThreadDraft(event.target.value)}
                placeholder={reviewThreadDialog.kind === "selection" ? "Describe the requested change or ask a question" : "Add your general review note"}
                className="min-h-[140px]"
                disabled={creatingReviewThread}
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReviewThreadDialog((prev) => ({ ...prev, open: false }));
                  setReviewThreadDraft("");
                }}
                disabled={creatingReviewThread}
              >
                Cancel
              </Button>
              <Button onClick={() => void createReviewThreadFromDialog()} disabled={creatingReviewThread || !reviewThreadDraft.trim()}>
                {creatingReviewThread ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create thread
              </Button>
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
