"use client";

import * as React from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Check, MessageSquare, RefreshCw, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOrgFeatures } from "@/lib/org-features";

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

  return (
    <AppLayout>
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-4 md:px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-foreground truncate">Approvals</h1>
                  <p className="text-xs text-muted-foreground truncate">Your review queue (in-progress stages only).</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-6 py-6">
          <div className="mx-auto max-w-6xl space-y-4">
            <Card className="border-border/40 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">My queue</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nothing to review right now.</div>
                ) : (
                  <div className="space-y-3">
                    {items.map((it) => {
                      const title = it.doc?.title || it.doc?.filename || it.approval.doc_id;
                      const stageLabel = `Stage ${it.stage.stage_order}`;
                      const stageStatus = String(it.stage.status).replace("_", " ");
                      const approvalStatus = String(it.approval.status).replace("_", " ");

                      return (
                        <div key={it.assignment.id} className="rounded-lg border border-border/40 bg-background/40 p-4">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{title}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="capitalize">{approvalStatus}</Badge>
                                <Badge variant="outline" className="capitalize">{stageLabel}: {stageStatus}</Badge>
                                <span className="text-xs text-muted-foreground">v{it.approval.submitted_version_number}</span>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                Assigned: {new Date(it.assignment.assigned_at).toLocaleString()}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button asChild variant="outline" size="sm" className="h-8">
                                <Link href={`/editor/${it.approval.doc_id}?version=${it.approval.submitted_version_number}`}>Open doc</Link>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={() => openDialog("comment", it)}
                                disabled={acting}
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                Comment
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={() => openDialog("reject", it)}
                                disabled={acting}
                              >
                                <X className="h-3.5 w-3.5" />
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={() => openDialog("approve", it)}
                                disabled={acting}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>

        <Dialog open={actionDialog.open} onOpenChange={(open) => {
          if (!open) setActionDialog({ open: false });
        }}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>
                {actionDialog.open ? (
                  actionDialog.kind === "approve" ? "Approve" : actionDialog.kind === "reject" ? "Reject" : "Comment"
                ) : (
                  ""
                )}
              </DialogTitle>
            </DialogHeader>

            {actionDialog.open && (
              <div className="space-y-3">
                <div className="text-sm font-medium">{actionDialog.title}</div>
                {actionDialog.kind === "approve" ? (
                  <Input value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="Message (optional)" />
                ) : actionDialog.kind === "reject" ? (
                  <Textarea value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="Rejection reason" className="min-h-[110px]" />
                ) : (
                  <Textarea value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="Comment" className="min-h-[110px]" />
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog({ open: false })} disabled={acting}>
                Cancel
              </Button>
              <Button onClick={() => void runAction()} disabled={acting}>
                {acting ? "Working..." : actionDialog.open ? (actionDialog.kind === "approve" ? "Approve" : actionDialog.kind === "reject" ? "Reject" : "Post") : ""}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
