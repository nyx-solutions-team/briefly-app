"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { AccessDenied } from "@/components/access-denied";
import { approve, comment, getMyApprovalQueue, reject, type MyQueueItem } from "@/lib/approval-api";
import {
  Check,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  X,
  Search,
  Filter,
  ChevronRight,
  FileText,
  Clock,
  AlertCircle,
  MoreVertical,
  ExternalLink,
  ChevronDown,
  LayoutList,
  Columns
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getOrgFeatures } from "@/lib/org-features";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ActionDialogState =
  | { open: false }
  | { open: true; kind: "approve"; approvalId: string; title: string }
  | { open: true; kind: "reject"; approvalId: string; title: string }
  | { open: true; kind: "comment"; approvalId: string; title: string };

export default function ApprovalsPage() {
  const { toast } = useToast();
  const { hasPermission, bootstrapData } = useAuth();
  const { approvalsUsable } = getOrgFeatures(bootstrapData?.orgSettings);
  const canRead = hasPermission("documents.read");
  const ready = Boolean(bootstrapData);

  if (bootstrapData && (!approvalsUsable || !canRead)) {
    return (
      <AppLayout>
        <AccessDenied
          title={!canRead ? "Access Not Allowed" : "Approvals Not Enabled"}
          message={!canRead
            ? "You don't have permission to view approvals."
            : "Approvals are not enabled for this organization."}
        />
      </AppLayout>
    );
  }

  return <ApprovalsPageInner toast={toast} ready={ready} />;
}

function ApprovalsPageInner({
  toast,
  ready,
}: {
  toast: (args: any) => void;
  ready: boolean;
}) {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<MyQueueItem[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [actionDialog, setActionDialog] = React.useState<ActionDialogState>({ open: false });
  const [actionText, setActionText] = React.useState("");
  const [acting, setActing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyApprovalQueue();
      setItems(res.items || []);
    } catch (e: any) {
      toast({ title: "Failed to load queue", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (!ready) return;
    void load();
  }, [load, ready]);

  const openDialog = (kind: "approve" | "reject" | "comment", item: MyQueueItem) => {
    const title = item.doc?.title || item.doc?.filename || item.approval.doc_id;
    setActionText("");
    setActionDialog({ open: true, kind, approvalId: item.approval.id, title });
  };

  const runAction = async () => {
    if (!actionDialog.open) return;

    if (actionDialog.kind === "reject" && !actionText.trim()) {
      toast({ title: "Reason required", description: "Add a rejection reason.", variant: "destructive" });
      return;
    }
    if (actionDialog.kind === "comment" && !actionText.trim()) {
      toast({ title: "Message required", description: "Add a comment.", variant: "destructive" });
      return;
    }

    setActing(true);
    try {
      if (actionDialog.kind === "approve") {
        await approve(actionDialog.approvalId, actionText.trim() || undefined);
        toast({ title: "Approved", description: "Your approval was recorded." });
      } else if (actionDialog.kind === "reject") {
        await reject(actionDialog.approvalId, actionText.trim());
        toast({ title: "Rejected", description: "Your rejection was recorded." });
      } else if (actionDialog.kind === "comment") {
        await comment(actionDialog.approvalId, actionText.trim());
        toast({ title: "Commented", description: "Comment added." });
      }

      setActionDialog({ open: false });
      setActionText("");
      window.dispatchEvent(new Event("approvalUpdated"));
      await load();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const filteredItems = items.filter(it => {
    const search = searchQuery.toLowerCase();
    const title = (it.doc?.title || it.doc?.filename || "").toLowerCase();
    return title.includes(search);
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800';
      case 'in_progress':
      case 'reviewing': return 'bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800';
      case 'approved':
      case 'completed': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800';
      case 'rejected': return 'bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-800';
      default: return 'bg-slate-500/10 text-slate-600 border-slate-200 dark:border-slate-800';
    }
  };

  const getStatusIndicator = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-blue-500';
      case 'in_progress':
      case 'reviewing': return 'bg-amber-500';
      case 'approved':
      case 'completed': return 'bg-emerald-500';
      case 'rejected': return 'bg-rose-500';
      default: return 'bg-slate-400';
    }
  };

  return (
    <AppLayout flush>
      <div className="flex flex-col h-full bg-background overflow-hidden">
        {/* ClickUp Style Header */}
        <header className="border-b border-border/40 bg-card/30 px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Workflow Center</span>
                <ChevronRight className="h-3 w-3" />
                <span>Approvals</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">Pending Approvals</h1>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold bg-primary/5 text-primary border-primary/20">
                  {items.length}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search approvals..."
                  className="pl-9 h-9 bg-background/50 border-border/60 focus:ring-1 ring-primary/20"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border/60" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-6 text-[13px] font-medium border-t border-border/20 pt-4">
            <div className="flex items-center gap-2 text-primary border-b-2 border-primary pb-3 -mb-[17px]">
              <LayoutList className="h-4 w-4" />
              <span>List View</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground/60 hover:text-muted-foreground cursor-not-allowed pb-3 -mb-[17px] transition-colors">
              <Columns className="h-4 w-4" />
              <span>Board</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground/60 hover:text-muted-foreground cursor-not-allowed pb-3 -mb-[17px] transition-colors">
              <Clock className="h-4 w-4" />
              <span>History</span>
            </div>
          </div>
        </header>

        {/* Main Table Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center p-20 text-center"
              >
                <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Queue is empty</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {searchQuery
                    ? `No approvals found matching "${searchQuery}"`
                    : "You're all caught up! No documents are waiting for your review."}
                </p>
                {searchQuery && (
                  <Button variant="link" onClick={() => setSearchQuery("")} className="mt-2 text-primary">
                    Clear search
                  </Button>
                )}
              </motion.div>
            ) : (
              <Table className="w-full">
                <TableHeader className="bg-muted/30 sticky top-0 z-10 backdrop-blur-md">
                  <TableRow className="hover:bg-transparent border-b border-border/40">
                    <TableHead className="w-[45%] font-bold text-xs uppercase tracking-wider py-3">Document</TableHead>
                    <TableHead className="w-[15%] font-bold text-xs uppercase tracking-wider py-3">Status</TableHead>
                    <TableHead className="w-[15%] font-bold text-xs uppercase tracking-wider py-3">Stage</TableHead>
                    <TableHead className="w-[15%] font-bold text-xs uppercase tracking-wider py-3">Assigned</TableHead>
                    <TableHead className="w-[10%] text-right font-bold text-xs uppercase tracking-wider py-3">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {filteredItems.map((it, idx) => {
                      const title = it.doc?.title || it.doc?.filename || it.approval.doc_id;
                      const stageLabel = `Stage ${it.stage.stage_order}`;
                      const stageStatus = String(it.stage.status).replace("_", " ");
                      const approvalStatus = String(it.approval.status).replace("_", " ");
                      const assignedDate = new Date(it.assignment.assigned_at);

                      return (
                        <motion.tr
                          key={it.assignment.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="group border-b border-border/30 hover:bg-muted/20 transition-all cursor-default"
                        >
                          <TableCell className="relative py-4">
                            <div className={cn(
                              "absolute left-0 top-0 bottom-0 w-1",
                              getStatusIndicator(it.approval.status)
                            )} />
                            <div className="flex items-center gap-3 ml-1">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-200">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/editor/${it.approval.doc_id}?version=${it.approval.submitted_version_number}`}
                                  className="text-sm font-semibold hover:text-primary transition-colors truncate block"
                                >
                                  {title}
                                </Link>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] text-muted-foreground/60 font-medium">v{it.approval.submitted_version_number}</span>
                                  <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/30" />
                                  <span className="text-[10px] text-muted-foreground/60 font-medium truncate">ID: {it.approval.doc_id.slice(0, 8)}...</span>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize h-5 px-2 text-[10px] font-bold border rounded-full",
                                getStatusColor(it.approval.status)
                              )}
                            >
                              {approvalStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] font-bold text-foreground/80">{stageLabel}</span>
                              <span className="text-[10px] text-muted-foreground font-medium capitalize">{stageStatus}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] font-medium text-foreground/80">
                                {assignedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{assignedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground/60 hover:text-primary hover:bg-primary/5"
                                asChild
                              >
                                <Link href={`/editor/${it.approval.doc_id}?version=${it.approval.submitted_version_number}`}>
                                  <ExternalLink className="h-4 w-4" />
                                </Link>
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/60 hover:text-primary hover:bg-primary/5">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 p-1.5">
                                  <DropdownMenuItem
                                    onClick={() => openDialog("approve", it)}
                                    className="gap-2 focus:bg-emerald-50 focus:text-emerald-600 cursor-pointer"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    <span>Approve</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openDialog("reject", it)}
                                    className="gap-2 focus:bg-rose-50 focus:text-rose-600 cursor-pointer"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                    <span>Reject</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openDialog("comment", it)}
                                    className="gap-2 cursor-pointer"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    <span>Add Comment</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>

                              <Button
                                size="sm"
                                className="ml-2 h-7 px-2.5 text-[11px] font-bold shadow-none"
                                onClick={() => openDialog("approve", it)}
                                disabled={acting}
                              >
                                Review
                              </Button>
                            </div>
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            )}
          </div>
        </main>

        {/* Floating Action Modal */}
        <Dialog open={actionDialog.open} onOpenChange={(open) => {
          if (!open) setActionDialog({ open: false });
        }}>
          <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden gap-0 border-0 shadow-2xl">
            <div className={cn(
              "p-6 h-2",
              actionDialog.open && (
                actionDialog.kind === "approve" ? "bg-emerald-500" :
                  actionDialog.kind === "reject" ? "bg-rose-500" : "bg-primary"
              )
            )} />
            <div className="p-6 pt-4">
              <DialogHeader className="mb-4">
                <DialogTitle className="text-xl flex items-center gap-2">
                  {actionDialog.open && (
                    <>
                      {actionDialog.kind === "approve" && <Check className="h-5 w-5 text-emerald-500" />}
                      {actionDialog.kind === "reject" && <X className="h-5 w-5 text-rose-500" />}
                      {actionDialog.kind === "comment" && <MessageSquare className="h-5 w-5 text-primary" />}
                      <span className="capitalize">{actionDialog.kind}</span>
                    </>
                  )}
                </DialogTitle>
                <div className="text-sm font-medium text-muted-foreground mt-1 truncate">
                  {actionDialog.open ? actionDialog.title : ""}
                </div>
              </DialogHeader>

              {actionDialog.open && (
                <div className="space-y-4">
                  {actionDialog.kind === "approve" ? (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Message (Optional)</label>
                      <Input
                        value={actionText}
                        onChange={(e) => setActionText(e.target.value)}
                        placeholder="Add a congratulatory note or feedback..."
                        className="bg-muted/30 border-border/60"
                        autoFocus
                      />
                    </div>
                  ) : actionDialog.kind === "reject" ? (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        Reason for Rejection
                        <span className="text-rose-500">*</span>
                      </label>
                      <Textarea
                        value={actionText}
                        onChange={(e) => setActionText(e.target.value)}
                        placeholder="What needs to be changed? Please be specific."
                        className="min-h-[120px] bg-muted/30 border-border/60 resize-none"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Comment</label>
                      <Textarea
                        value={actionText}
                        onChange={(e) => setActionText(e.target.value)}
                        placeholder="Ask a question or provide feedback..."
                        className="min-h-[120px] bg-muted/30 border-border/60 resize-none"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="mt-8 flex gap-3 h-10">
                <Button variant="ghost" onClick={() => setActionDialog({ open: false })} disabled={acting} className="flex-1 font-bold">
                  Cancel
                </Button>
                <Button
                  onClick={() => void runAction()}
                  disabled={acting}
                  className={cn(
                    "flex-[2] font-bold shadow-none",
                    actionDialog.open && (
                      actionDialog.kind === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" :
                        actionDialog.kind === "reject" ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-primary"
                    )
                  )}
                >
                  {acting ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : actionDialog.open ? (
                    actionDialog.kind === "approve" ? "Confirm Approval" :
                      actionDialog.kind === "reject" ? "Reject Document" : "Post Comment"
                  ) : ""}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
