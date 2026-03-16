"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/app-layout";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  cancel as cancelApproval,
  getApprovalsWorkspace,
  type ApprovalUserLabels,
  type ApprovalWorkspaceItem,
} from "@/lib/approval-api";
import { getOrgFeatures } from "@/lib/org-features";
import { cn, formatAppDateTime } from "@/lib/utils";
import { StudioModuleNav } from "@/components/editor/studio-module-nav";
import {
  Ban,
  CheckCircle2,
  Columns3,
  ExternalLink,
  FileText,
  LayoutList,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

type WorkspaceTab = "needs-review" | "submitted" | "history";
type WorkspaceView = "list" | "board";

type ActionDialogState =
  | { open: false }
  | { open: true; kind: "cancel"; item: ApprovalWorkspaceItem };

type BoardColumn = {
  key: string;
  label: string;
  items: ApprovalWorkspaceItem[];
};

const WORKSPACE_TABS: WorkspaceTab[] = ["needs-review", "submitted", "history"];

function parseWorkspaceTab(value: string | null | undefined): WorkspaceTab {
  const raw = String(value || "").trim().toLowerCase();
  return WORKSPACE_TABS.includes(raw as WorkspaceTab) ? (raw as WorkspaceTab) : "needs-review";
}

function formatUserLabel(userId: string | null, currentUserId: string | null, userLabels?: ApprovalUserLabels): string {
  const raw = String(userId || "").trim();
  if (!raw) return "Unknown";
  if (currentUserId && raw === String(currentUserId)) return "You";
  const mapped = userLabels?.[raw];
  if (mapped && String(mapped).trim() && String(mapped).trim() !== raw) return String(mapped).trim();
  return raw.length > 12 ? `${raw.slice(0, 8)}...` : raw;
}

function humanizeWord(value: string | null | undefined, fallback = "Unknown"): string {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const normalized = raw.replace(/[_-]+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getApprovalStatusTone(status: string): string {
  switch (String(status || "").toLowerCase()) {
    case "draft":
      return "border-transparent bg-slate-500/10 text-slate-700 dark:text-slate-400";
    case "in_progress":
      return "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-500";
    case "approved":
      return "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-500";
    case "rejected":
      return "border-transparent bg-rose-500/10 text-rose-700 dark:text-rose-500";
    case "cancelled":
      return "border-transparent bg-zinc-500/10 text-zinc-700 dark:text-zinc-400";
    default:
      return "border-transparent bg-muted/50 text-muted-foreground";
  }
}

function getItemStageLabel(item: ApprovalWorkspaceItem): string {
  return item.currentStageSummary?.stageLabel
    || (item.currentStage?.stage_order ? `Stage ${item.currentStage.stage_order}` : "No active stage");
}

function getItemPrimaryHref(item: ApprovalWorkspaceItem): string {
  return `/editor/${item.approval.doc_id}?version=${item.approval.submitted_version_number}`;
}

function buildBoardColumns(tab: WorkspaceTab, items: ApprovalWorkspaceItem[]): BoardColumn[] {
  const preferredOrder = tab === "submitted"
    ? ["in_progress", "draft", "rejected", "approved", "cancelled"]
    : ["approved", "rejected", "cancelled"];

  const groups = new Map<string, ApprovalWorkspaceItem[]>();
  for (const item of items) {
    const statusKey = String(item.approval.status || "").toLowerCase();
    const list = groups.get(statusKey) || [];
    list.push(item);
    groups.set(statusKey, list);
  }

  return preferredOrder
    .filter((key) => groups.has(key))
    .map((key) => ({
      key,
      label: tab === "submitted"
        ? key === "in_progress"
          ? "In Review"
          : key === "draft"
            ? "Starting"
            : key === "rejected"
              ? "Changes Requested"
              : key === "approved"
                ? "Approved"
                : "Cancelled"
        : key === "rejected"
          ? "Changes Requested"
          : humanizeWord(key),
      items: groups.get(key) || [],
    }));
}

export default function ApprovalsPage() {
  const { toast } = useToast();
  const { hasPermission, bootstrapData } = useAuth();
  const { approvalsUsable } = getOrgFeatures(bootstrapData?.orgSettings);
  const ready = Boolean(bootstrapData);
  const canRead = hasPermission("documents.read");
  const canManageApproval = hasPermission("documents.version.manage");
  const currentUserId = bootstrapData?.user?.id || null;

  if (bootstrapData && (!approvalsUsable || !canRead)) {
    return (
      <AppLayout>
        <AccessDenied
          title={!canRead ? "Access Not Allowed" : "Approvals Not Enabled"}
          message={!canRead ? "You don't have permission to view approvals." : "Approvals are not enabled for this organization."}
        />
      </AppLayout>
    );
  }

  return (
    <ApprovalsPageInner
      ready={ready}
      toast={toast}
      canManageApproval={canManageApproval}
      currentUserId={currentUserId}
    />
  );
}

function ApprovalsPageInner({
  ready,
  toast,
  canManageApproval,
  currentUserId,
}: {
  ready: boolean;
  toast: (args: any) => void;
  canManageApproval: boolean;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = React.useMemo(() => parseWorkspaceTab(searchParams?.get("tab")), [searchParams]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedTab, setSelectedTab] = React.useState<WorkspaceTab>(urlTab);
  const [view, setView] = React.useState<WorkspaceView>("list");
  const [needsReview, setNeedsReview] = React.useState<ApprovalWorkspaceItem[]>([]);
  const [submittedByMe, setSubmittedByMe] = React.useState<ApprovalWorkspaceItem[]>([]);
  const [historyItems, setHistoryItems] = React.useState<ApprovalWorkspaceItem[]>([]);
  const [userLabels, setUserLabels] = React.useState<ApprovalUserLabels>({});
  const [actionDialog, setActionDialog] = React.useState<ActionDialogState>({ open: false });
  const [acting, setActing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getApprovalsWorkspace();
      setNeedsReview(data.needsReview || []);
      setSubmittedByMe(data.submittedByMe || []);
      setHistoryItems(data.history || []);
      setUserLabels(data.userLabels || {});
    } catch (e: any) {
      toast({ title: "Failed to load approvals", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (!ready) return;
    void load();
  }, [load, ready]);

  React.useEffect(() => {
    if (selectedTab !== urlTab) {
      setSelectedTab(urlTab);
    }
  }, [selectedTab, urlTab]);

  React.useEffect(() => {
    if (selectedTab === "needs-review" && view === "board") {
      setView("list");
    }
  }, [selectedTab, view]);

  const counts = React.useMemo(() => ({
    needsReview: needsReview.length,
    submitted: submittedByMe.length,
    history: historyItems.length,
  }), [historyItems.length, needsReview.length, submittedByMe.length]);

  const activeItems = React.useMemo(() => {
    if (selectedTab === "submitted") return submittedByMe;
    if (selectedTab === "history") return historyItems;
    return needsReview;
  }, [historyItems, needsReview, selectedTab, submittedByMe]);

  const filteredItems = React.useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return activeItems;
    return activeItems.filter((item) => {
      const haystack = [
        item.doc?.title,
        item.doc?.filename,
        item.currentStageSummary?.stageLabel,
        item.currentStageSummary?.selectorLabel,
        item.currentStageSummary?.statusDetail,
        item.latestAction?.message,
        item.latestAction?.action_type,
        item.approval.status,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(needle);
    });
  }, [activeItems, searchQuery]);

  const boardColumns = React.useMemo(
    () => selectedTab === "needs-review" ? [] : buildBoardColumns(selectedTab, filteredItems),
    [filteredItems, selectedTab]
  );

  const openDialog = React.useCallback((kind: "cancel", item: ApprovalWorkspaceItem) => {
    setActionDialog({ open: true, kind, item });
  }, []);

  const runAction = React.useCallback(async () => {
    if (!actionDialog.open) return;

    setActing(true);
    try {
      await cancelApproval(actionDialog.item.approval.id);
      toast({ title: "Cancelled", description: "Approval request cancelled." });

      setActionDialog({ open: false });
      window.dispatchEvent(new Event("approvalUpdated"));
      await load();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setActing(false);
    }
  }, [actionDialog, load, toast]);

  const dialogTitle = actionDialog.open
    ? (actionDialog.item.doc?.title || actionDialog.item.doc?.filename || actionDialog.item.approval.doc_id)
    : "";

  const updateSelectedTab = React.useCallback((nextTab: WorkspaceTab) => {
    setSelectedTab(nextTab);
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("tab", nextTab);
    const nextHref = `${pathname}?${params.toString()}`;
    router.replace(nextHref, { scroll: false });
  }, [pathname, router, searchParams]);

  const boardAllowed = selectedTab !== "needs-review";
  const boardEmptyCopy = selectedTab === "submitted"
    ? "Use the board to track active requests, changes requested, and completed sign-offs."
    : "Use the board to scan completed outcomes at a glance.";
  const tabIntro = selectedTab === "needs-review"
    ? "Use this as a review queue. Open the document and complete the review inside the editor."
    : selectedTab === "submitted"
      ? "Track every request you started, what stage it is in, and who it is waiting on."
      : "Look back at completed approval outcomes and recent workflow decisions.";

  const canCancelItem = React.useCallback((item: ApprovalWorkspaceItem) => (
    canManageApproval
    && currentUserId
    && String(item.approval.submitted_by || "") === String(currentUserId)
    && ["draft", "in_progress"].includes(String(item.approval.status || "").toLowerCase())
  ), [canManageApproval, currentUserId]);

  const renderActions = React.useCallback((item: ApprovalWorkspaceItem, compact = false) => {
    const canCancel = selectedTab === "submitted" && canCancelItem(item);
    const openLabel = selectedTab === "needs-review" ? "Open review" : "View workflow";

    return (
      <div className={cn("flex items-center justify-end gap-1", compact && "flex-wrap")}>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted/50">
                <Link href={getItemPrimaryHref(item)}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {openLabel}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {canCancel && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                  onClick={() => openDialog("cancel", item)}
                  disabled={acting}
                >
                  <Ban className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Cancel request
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  }, [acting, canCancelItem, openDialog, selectedTab]);

  const renderListCard = React.useCallback((item: ApprovalWorkspaceItem) => (
    <div key={`${selectedTab}-${item.approval.id}`} className="group px-4 md:px-6 py-3 border-b border-border/20 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/40 group-hover:bg-muted/60 transition-colors">
          <FileText className="h-4 w-4 text-muted-foreground/70" />
        </div>

        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={getItemPrimaryHref(item)}
                className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate"
              >
                {item.doc?.title || item.doc?.filename || item.approval.doc_id}
              </Link>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">v{item.approval.submitted_version_number}</span>
              <span className="text-muted-foreground/30 flex-shrink-0">·</span>
              <span className="text-xs text-muted-foreground">
                Submitted {formatAppDateTime(item.approval.submitted_at)}
              </span>
              {(item.currentStageSummary?.statusDetail || item.currentStageSummary?.selectorLabel) && (
                <>
                  <span className="text-muted-foreground/30 flex-shrink-0">·</span>
                  <span className="text-xs text-muted-foreground truncate">
                    Waiting on {item.currentStageSummary?.selectorLabel || item.currentStageSummary?.statusDetail}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {item.currentStageSummary?.stageLabel || item.currentStage ? (
              <Badge variant="outline" className="text-xs font-normal border-border/50 text-muted-foreground bg-muted/30">
                {getItemStageLabel(item)}
              </Badge>
            ) : null}
            <Badge variant="outline" className={cn("text-xs font-normal px-2 py-0 border-transparent", getApprovalStatusTone(item.approval.status))}>
              {humanizeWord(item.approval.status)}
            </Badge>
            <div className="w-16 flex justify-end">
              {renderActions(item)}
            </div>
          </div>
        </div>
      </div>
    </div>
  ), [renderActions, selectedTab]);

  const renderBoardCard = React.useCallback((item: ApprovalWorkspaceItem) => (
    <div key={`${selectedTab}-board-${item.approval.id}`} className="flex flex-col gap-3 p-4 rounded-xl border border-border/30 bg-card shadow-sm hover:border-border/50 transition-colors mb-4">
      <Link href={getItemPrimaryHref(item)} className="block text-sm font-medium leading-snug text-foreground hover:text-primary transition-colors">
        {item.doc?.title || item.doc?.filename || item.approval.doc_id}
      </Link>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn("text-[11px] font-normal border-transparent", getApprovalStatusTone(item.approval.status))}>
          {humanizeWord(item.approval.status)}
        </Badge>
      </div>
      <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
        <span>v{item.approval.submitted_version_number}</span>
        <span>{formatAppDateTime(item.approval.submitted_at)}</span>
      </div>
    </div>
  ), [selectedTab]);

  const emptyCopy = selectedTab === "needs-review"
    ? "Nothing is waiting for your review right now."
    : selectedTab === "submitted"
      ? "You haven't submitted any approval requests yet."
      : "No completed approvals match this view yet.";

  return (
    <AppLayout flush>
      <div className="min-h-screen flex flex-col bg-background">
        {/* Header - Linear style */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">
                    Approvals
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {loading ? (
                      <span className="inline-block w-32 h-4 bg-muted/30 rounded animate-pulse" />
                    ) : (
                      `${counts.needsReview} needs review · ${counts.submitted} submitted · ${counts.history} history`
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
              </div>
            </div>
          </div>
        </header>

        {/* Search & Filters Toolbar */}
        <div className="px-6 py-3 border-b border-border/30 bg-background/50">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-1 max-w-xs min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  placeholder="Search approvals..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 bg-muted/30 border-border/40 text-sm placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Module Nav */}
              <StudioModuleNav />

              {/* Internal Workspace Tabs */}
              <div className="flex items-center p-0.5 bg-muted/30 border border-border/40 rounded-lg">
                {[
                  { id: "needs-review", label: "Needs Review", count: counts.needsReview },
                  { id: "submitted", label: "Submitted", count: counts.submitted },
                  { id: "history", label: "History", count: counts.history },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => updateSelectedTab(tab.id as WorkspaceTab)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors",
                      selectedTab === tab.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <Badge variant="outline" className={cn(
                        "px-1 h-4 min-w-[16px] flex items-center justify-center text-[10px] border-transparent font-semibold shadow-none",
                        selectedTab === tab.id ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"
                      )}>
                        {tab.count}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* View Toggle */}
            <div className="flex items-center p-0.5 bg-muted/30 border border-border/40 rounded-lg self-start md:self-center">
              <button
                onClick={() => setView("list")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  view === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => boardAllowed && setView("board")}
                disabled={!boardAllowed}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  view === "board" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  !boardAllowed && "opacity-50 cursor-not-allowed"
                )}
              >
                <Columns3 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-auto">
          {loading ? (
            <div className="w-full">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4 px-6 py-3 border-b border-border/20 animate-pulse">
                  <div className="h-8 w-8 bg-muted/40 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-muted/40 rounded" />
                    <div className="h-3 w-32 bg-muted/40 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
                <CheckCircle2 className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">
                Nothing here right now
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                {searchQuery ? `No approvals match "${searchQuery}".` : emptyCopy}
              </p>
            </div>
          ) : view === "list" ? (
            <div className="w-full pb-16">
              {filteredItems.map(renderListCard)}
            </div>
          ) : (
            <div className="flex gap-4 p-6 overflow-x-auto w-max">
              {boardColumns.map((column) => (
                <div key={column.key} className="flex w-[320px] shrink-0 flex-col mr-1">
                  <div className="flex items-center gap-2 px-1 py-1 mb-3">
                    <div className="text-[12px] font-bold text-muted-foreground">{column.label}</div>
                    <Badge variant="outline" className="bg-muted/30 border-border/40 text-muted-foreground/80 px-1.5 py-0 text-[10px] rounded">
                      {column.items.length}
                    </Badge>
                  </div>
                  <div className="space-y-0">
                    {column.items.map(renderBoardCard)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <Dialog
          open={actionDialog.open}
          onOpenChange={(open) => {
            if (!acting && !open) setActionDialog({ open: false });
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionDialog.open
                  ? `Cancel ${dialogTitle}`
                  : "Approval action"}
              </DialogTitle>
            </DialogHeader>

            {actionDialog.open ? (
              <div className="text-sm text-muted-foreground">
                This will cancel the current approval workflow and remove it from reviewers&apos; queues.
              </div>
            ) : null}

            <DialogFooter className="sm:justify-end">
              <Button variant="outline" onClick={() => setActionDialog({ open: false })} disabled={acting}>
                Close
              </Button>
              <Button
                onClick={() => void runAction()}
                disabled={acting}
                variant="default"
              >
                {acting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                {actionDialog.open
                  ? "Cancel request"
                  : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
