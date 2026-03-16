"use client";

import * as React from "react";
import { MessageSquare, Quote, CheckCircle2, RotateCcw, Loader2, ChevronLeft, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { type ApprovalReviewThread } from "@/lib/approval-api";
import { cn, formatAppDateTime } from "@/lib/utils";

function formatUserLabel(userId: string | null, currentUserId: string | null, userLabels?: Record<string, string>): string {
  const raw = String(userId || "").trim();
  if (!raw) return "Unknown";
  if (currentUserId && raw === String(currentUserId)) return "You";
  const mapped = userLabels?.[raw];
  if (mapped && String(mapped).trim() && String(mapped).trim() !== raw) return String(mapped).trim();
  return raw.length > 12 ? `${raw.slice(0, 8)}...` : raw;
}

type ThreadMutationState =
  | { threadId: null; kind: null }
  | { threadId: string; kind: "reply" | "resolve" | "reopen" };

type ThreadStageMeta = {
  label: string;
  order?: number | null;
};

type Props = {
  threads: ApprovalReviewThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  currentUserId: string | null;
  userLabels?: Record<string, string>;
  canCreateThreads?: boolean;
  canComment?: boolean;
  canResolve?: boolean;
  pendingSelection?: { from: number; to: number; quote: string } | null;
  onCreateSelectionThread?: () => void;
  onSubmitGeneralThread?: (message: string) => Promise<void> | void;
  isSubmittingGeneralThread?: boolean;
  onReply: (threadId: string, message: string) => Promise<void> | void;
  onResolve: (threadId: string) => Promise<void> | void;
  onReopen: (threadId: string) => Promise<void> | void;
  mutationState?: ThreadMutationState;
  stageMetaById?: Record<string, ThreadStageMeta>;
  className?: string;
  emptyMessage?: string;
};

export function ApprovalReviewThreads({
  threads,
  activeThreadId,
  onSelectThread,
  currentUserId,
  userLabels,
  canCreateThreads = false,
  canComment = false,
  canResolve = false,
  pendingSelection,
  onCreateSelectionThread,
  onSubmitGeneralThread,
  isSubmittingGeneralThread = false,
  onReply,
  onResolve,
  onReopen,
  mutationState = { threadId: null, kind: null },
  stageMetaById,
  className,
  emptyMessage,
}: Props) {
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});
  const [generalThreadDraft, setGeneralThreadDraft] = React.useState("");

  const activeThread = React.useMemo(() => {
    if (!threads.length) return null;
    const match = activeThreadId ? threads.find((thread) => String(thread.id) === String(activeThreadId)) : null;
    return match || threads[0] || null;
  }, [activeThreadId, threads]);

  const setReplyDraft = React.useCallback((threadId: string, value: string) => {
    setReplyDrafts((prev) => ({ ...prev, [threadId]: value }));
  }, []);

  const getThreadStageMeta = React.useCallback((thread: ApprovalReviewThread) => {
    const stageKey = String(thread.stage_instance_id || "").trim();
    if (!stageKey) return null;
    return stageMetaById?.[stageKey] || null;
  }, [stageMetaById]);

  const getOpeningComment = React.useCallback((thread: ApprovalReviewThread) => {
    return (thread.comments || []).find((comment) => comment.comment_type === "comment") || thread.comments?.[0] || null;
  }, []);

  const getReplyCount = React.useCallback((thread: ApprovalReviewThread) => {
    const humanCommentCount = (thread.comments || []).filter((comment) => comment.comment_type === "comment").length;
    return Math.max(0, humanCommentCount - 1);
  }, []);

  const getLastActivityLabel = React.useCallback((thread: ApprovalReviewThread) => {
    const ts = thread.last_commented_at || thread.created_at;
    return ts ? formatAppDateTime(ts) : null;
  }, []);

  return (
    <div className={cn("flex flex-col h-full w-full", className)}>
      {!activeThreadId ? (
        <>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-3 pb-6">
              {threads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-6 text-center shadow-sm">
                  <div className="text-[13px] font-medium text-foreground">{emptyMessage || "No threads yet"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {canCreateThreads
                      ? "Select text or leave a general note to start a discussion."
                      : "There are no visible review threads for this document yet."}
                  </div>
                </div>
              ) : null}
              <div className="divide-y divide-border/30">
                {threads.map((thread, i) => {
                  const stageMeta = getThreadStageMeta(thread);
                  const openingComment = getOpeningComment(thread);
                  const replyCount = getReplyCount(thread);
                  const lastActivityLabel = getLastActivityLabel(thread);
                  return (
                    <div
                      key={thread.id}
                      className="group relative px-5 py-5 hover:bg-muted/20 transition-all duration-200 cursor-pointer text-left w-full border-b border-border/20 last:border-0"
                      onClick={() => onSelectThread(thread.id)}
                    >
                      <div className="flex gap-4">
                        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-[10px] font-bold text-muted-foreground uppercase select-none border border-border/50 transition-colors group-hover:bg-primary/5 group-hover:text-primary">
                          {formatUserLabel(thread.created_by, currentUserId, userLabels).substring(0, 2)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] font-bold text-foreground">
                                {formatUserLabel(thread.created_by, currentUserId, userLabels)}
                              </span>
                              <span className={cn(
                                "text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded",
                                thread.status === "resolved" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                              )}>
                                {thread.status === "resolved" ? "RESOLVED" : "OPEN"}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground/40 tabular-nums whitespace-nowrap">
                              {lastActivityLabel}
                            </span>
                          </div>

                          {openingComment?.message && (
                            <div className="text-[13px] text-foreground/80 line-clamp-2 leading-relaxed mb-3">
                              {openingComment.message}
                            </div>
                          )}

                          {thread.quote && (
                            <div className="pl-3 border-l-2 border-border/40 mb-3 ml-0.5">
                              <div className="text-[12px] italic text-muted-foreground/60 line-clamp-1">
                                "{thread.quote}"
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                              {thread.thread_type === "selection" ? (
                                <Quote className="h-3 w-3" />
                              ) : (
                                <MessageSquare className="h-3 w-3" />
                              )}
                              {thread.thread_type}
                            </div>

                            {stageMeta && (
                              <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest bg-muted/30 px-2 py-0.5 rounded-full">
                                {stageMeta.label}
                              </div>
                            )}

                            {replyCount > 0 && (
                              <div className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-primary opacity-60 group-hover:opacity-100 transition-all">
                                <MessageSquare className="h-3.5 w-3.5 fill-primary/10" />
                                {replyCount}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>

          {(canCreateThreads && (pendingSelection || onSubmitGeneralThread)) && (
            <div className="border-t border-border/40 bg-card p-5 shrink-0 z-10 w-full relative">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 pl-0.5">
                New Thread
              </div>

              {pendingSelection ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-primary/[0.03] border border-primary/10 p-3.5 text-[13px] leading-relaxed text-foreground/80 italic relative overflow-hidden group">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/40" />
                    <Quote className="absolute top-2 right-2 h-10 w-10 text-primary/5 -rotate-12 group-hover:rotate-0 transition-transform" />
                    "{pendingSelection.quote.length > 200 ? `${pendingSelection.quote.slice(0, 197)}...` : pendingSelection.quote}"
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="h-8 gap-2 px-6 text-[12px] font-bold bg-[#5865F2] hover:bg-[#4752C4] shadow-sm rounded-lg"
                      onClick={onCreateSelectionThread}
                    >
                      <Quote className="h-3.5 w-3.5" />
                      Comment on selection
                    </Button>
                  </div>
                </div>
              ) : (
                onSubmitGeneralThread && (
                  <div className="flex flex-col border border-border/60 bg-background rounded-xl focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary/30 transition-all overflow-hidden shadow-sm">
                    <Textarea
                      value={generalThreadDraft}
                      onChange={(e) => setGeneralThreadDraft(e.target.value)}
                      placeholder="Leave a general comment or request..."
                      className="min-h-[80px] max-h-[250px] border-0 focus-visible:ring-0 resize-none text-[13px] bg-transparent p-4 text-foreground font-medium placeholder:text-muted-foreground/40"
                      disabled={isSubmittingGeneralThread}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          const msg = generalThreadDraft.trim();
                          if (msg && !isSubmittingGeneralThread) {
                            Promise.resolve(onSubmitGeneralThread(msg)).then(() => setGeneralThreadDraft(""));
                          }
                        }
                      }}
                    />
                    <div className="flex items-center justify-between bg-muted/20 px-4 py-2 border-t border-border/20">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 font-medium">
                        <span className="bg-muted px-1 rounded border border-border/40 text-[9px]">Cmd</span>
                        <span>+</span>
                        <span className="bg-muted px-1 rounded border border-border/40 text-[9px]">Enter</span>
                        <span className="ml-1 hidden sm:inline">to post</span>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 px-4 text-[11px] font-bold bg-[#5865F2] hover:bg-[#4752C4] shadow-sm rounded-lg"
                        disabled={!generalThreadDraft.trim() || isSubmittingGeneralThread}
                        onClick={async () => {
                          await onSubmitGeneralThread(generalThreadDraft);
                          setGeneralThreadDraft("");
                        }}
                      >
                        {isSubmittingGeneralThread ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5 mr-1.5 fill-current/10" />
                        )}
                        Post Thread
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </>
      ) : activeThread ? (
        <div className="flex flex-col h-full w-full">
          <div className="px-4 py-3 shrink-0 z-10 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md border-b border-border/40">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground text-[11px] font-bold uppercase tracking-widest gap-2"
              onClick={() => onSelectThread("")}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Threads
            </Button>
            {getThreadStageMeta(activeThread) && (
              <div className="text-[9px] font-black tracking-widest bg-muted/50 px-2 py-1 rounded text-muted-foreground uppercase">
                {getThreadStageMeta(activeThread)?.label}
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0 bg-background/30">
            <div className="p-4 space-y-5 pb-6">
              {/* Thread Header / Context */}
              <div className="px-1 pb-4 border-b border-border/40">
                <div className="flex gap-3">
                  <div className="mt-0.5 shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-gradient-to-br from-primary/10 to-primary/5 text-[11px] font-bold text-primary uppercase select-none shadow-sm border border-primary/20">
                    {formatUserLabel(activeThread.created_by, currentUserId, userLabels).substring(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[13px] font-bold text-foreground">
                        {formatUserLabel(activeThread.created_by, currentUserId, userLabels)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70 font-medium tracking-wide">
                        {formatAppDateTime(activeThread.created_at)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 px-2 text-[9px] uppercase tracking-wide",
                          activeThread.status === "resolved"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                            : "border-amber-500/20 bg-amber-500/10 text-amber-700"
                        )}
                      >
                        {activeThread.status === "resolved" ? "Resolved" : "Open"}
                      </Badge>
                      <Badge variant="outline" className="h-5 px-2 text-[9px] uppercase tracking-wide bg-muted/30 text-muted-foreground font-semibold border-border/40">
                        {activeThread.thread_type === "selection" ? "Selection" : "General"}
                      </Badge>
                    </div>

                    {activeThread.quote ? (
                      <div className="mt-2 text-[13px] leading-relaxed text-foreground/90 pl-3 border-l-[3px] border-primary/30 italic">
                        "{activeThread.quote}"
                      </div>
                    ) : null}

                    {activeThread.status === "resolved" ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium text-emerald-700 bg-emerald-500/10 w-fit px-2 py-1 rounded border border-emerald-500/20">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Resolved</span>
                        {activeThread.resolved_at ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700/80">
                            <Clock3 className="h-3 w-3" />
                            {formatAppDateTime(activeThread.resolved_at)}
                          </span>
                        ) : null}
                        {activeThread.resolved_by ? (
                          <span className="text-emerald-700/80">
                            by {formatUserLabel(activeThread.resolved_by, currentUserId, userLabels)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Comments List */}
              {activeThread.comments.length > 0 && (
                <div className="space-y-4 px-1">
                  {activeThread.comments.map((comment) => {
                    const isSystem = comment.comment_type === "system";
                    if (isSystem) {
                      return (
                        <div key={comment.id} className="flex items-center gap-3 text-[11px] text-muted-foreground/60 px-2 py-1 ml-10 border-l-2 border-border/10 italic">
                          <span>{comment.message}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={comment.id} className="flex gap-3 px-2 py-2 rounded-lg transition-colors group">
                        <div className="mt-0.5 shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-[10px] font-bold text-muted-foreground uppercase select-none border border-border/40">
                          {formatUserLabel(comment.actor_user_id, currentUserId, userLabels).substring(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-0.5">
                            <span className="text-[13px] font-bold text-foreground">
                              {formatUserLabel(comment.actor_user_id, currentUserId, userLabels)}
                            </span>
                            <span className="text-[9px] text-muted-foreground/40 font-bold tracking-tight uppercase tabular-nums">
                              {formatAppDateTime(comment.created_at)}
                            </span>
                          </div>
                          <div className="text-[13.5px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
                            {comment.message}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Reply Input Area */}
          <div className="border-t border-border/40 bg-card p-4 shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.03)] z-10 w-full relative">
            {activeThread.status === "open" && canComment ? (
              <div className="flex flex-col border border-border/60 bg-background rounded-lg focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all overflow-hidden shadow-sm">
                <Textarea
                  value={replyDrafts[activeThread.id] || ""}
                  onChange={(e) => setReplyDraft(activeThread.id, e.target.value)}
                  placeholder="Reply..."
                  className="min-h-[60px] max-h-[250px] border-0 focus-visible:ring-0 resize-none text-[13px] bg-transparent p-3 text-foreground font-medium"
                  disabled={mutationState.threadId === activeThread.id && mutationState.kind === "reply"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      const msg = String(replyDrafts[activeThread.id] || "").trim();
                      if (msg) {
                        Promise.resolve(onReply(activeThread.id, msg)).then(() => setReplyDraft(activeThread.id, ""));
                      }
                    }
                  }}
                />
                <div className="flex items-center justify-between bg-muted/30 px-3 py-2 border-t border-border/30">
                  {canResolve ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-[11px] gap-1.5 text-muted-foreground font-semibold hover:text-emerald-700 hover:bg-emerald-500/10"
                      onClick={() => void onResolve(activeThread.id)}
                      disabled={mutationState.threadId === activeThread.id && mutationState.kind === "resolve"}
                    >
                      {mutationState.threadId === activeThread.id && mutationState.kind === "resolve" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Resolve Issue
                    </Button>
                  ) : <div />}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground hidden sm:inline-block">Cmd + Enter to send</span>
                    <Button
                      size="sm"
                      className="h-7 px-4 text-[11px] font-bold gap-1.5"
                      disabled={!String(replyDrafts[activeThread.id] || "").trim() || (mutationState.threadId === activeThread.id && mutationState.kind === "reply")}
                      onClick={() => {
                        const msg = String(replyDrafts[activeThread.id] || "").trim();
                        if (msg) {
                          Promise.resolve(onReply(activeThread.id, msg)).then(() => setReplyDraft(activeThread.id, ""));
                        }
                      }}
                    >
                      {mutationState.threadId === activeThread.id && mutationState.kind === "reply" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            ) : activeThread.status === "resolved" && canResolve ? (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-4 text-[11px] text-muted-foreground hover:text-foreground font-semibold"
                  onClick={() => void onReopen(activeThread.id)}
                  disabled={mutationState.threadId === activeThread.id && mutationState.kind === "reopen"}
                >
                  {mutationState.threadId === activeThread.id && mutationState.kind === "reopen" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Reopen thread
                </Button>
              </div>
            ) : (
              <div className="text-[12px] font-medium text-muted-foreground text-center py-2 opacity-70 bg-background rounded-lg border border-border/50">
                {activeThread.status === "resolved" ? "This thread is resolved." : "You do not have permission to comment."}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
