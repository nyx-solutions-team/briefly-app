"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Check,
    MessageSquare,
    X,
    Minimize2,
    Loader2,
    ShieldCheck,
    Clock,
    ChevronRight,
    CircleDot,
    Sparkles
} from "lucide-react";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatAppDateTime } from "@/lib/utils";

interface ApprovalThreadedCardProps {
    reviewerName: string;
    stageName: string;
    stageOrder?: number;
    submissionMessage?: string;
    submittedAt?: string;
    submittedBy?: string;
    reviewerMessage: string;
    onMessageChange: (msg: string) => void;
    onAction: (kind: "approve" | "reject" | "comment") => void;
    actionInProgress: "approve" | "reject" | "comment" | null;
    comments: Array<{
        id: string;
        message: string;
        userLabel: string;
        createdAt: string;
        type: string;
    }>;
    isReviewMode?: boolean;
    onReviewModeToggle?: (enabled: boolean) => void;
    reviewDiffLoading?: boolean;
    className?: string;
}

export function ApprovalThreadedCard({
    stageName,
    stageOrder,
    submissionMessage,
    submittedAt,
    submittedBy,
    reviewerMessage,
    onMessageChange,
    onAction,
    actionInProgress,
    comments,
    isReviewMode,
    onReviewModeToggle,
    reviewDiffLoading,
    className
}: ApprovalThreadedCardProps) {
    const [expanded, setExpanded] = React.useState(true);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // Auto scroll to bottom when new comments come in
    React.useEffect(() => {
        if (expanded && scrollRef.current) {
            const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }, [expanded, comments.length]);

    if (!expanded) {
        return (
            <div className={cn("fixed bottom-8 right-8 z-50 transition-all duration-300 transform scale-100 hover:scale-105 active:scale-95", className)}>
                <Button
                    onClick={() => setExpanded(true)}
                    className="h-14 w-14 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] bg-indigo-600 text-white hover:bg-indigo-700 p-0 relative border-4 border-white dark:border-gray-900 overflow-visible"
                >
                    <ShieldCheck className="h-7 w-7" />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500 border-2 border-white dark:border-gray-900"></span>
                    </span>
                </Button>
            </div>
        );
    }

    return (
        <Card className={cn(
            "fixed bottom-8 right-8 z-50 w-[400px] max-h-[640px] flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.15)] border-0 bg-white dark:bg-gray-950 ring-1 ring-black/5 rounded-3xl overflow-hidden animate-in slide-in-from-bottom-8 fade-in duration-500 ease-out",
            className
        )}>
            {/* Header with improved hierarchy */}
            <CardHeader className="px-6 py-5 flex flex-row items-center justify-between space-y-0 bg-indigo-50/40 dark:bg-indigo-900/10 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
                        <ShieldCheck className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <CardTitle className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-tight">Review workflow</CardTitle>
                        <div className="flex items-center gap-2 text-[11px] font-semibold">
                            <span className="text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 bg-indigo-100/50 dark:bg-indigo-400/10 rounded-md uppercase tracking-wider">{stageName}</span>
                            {stageOrder && <span className="text-gray-300">•</span>}
                            {stageOrder && <span className="text-gray-500">Stage {stageOrder}</span>}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {onReviewModeToggle && (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={reviewDiffLoading}
                            className={cn(
                                "h-8 px-2.5 rounded-lg text-[11px] font-bold transition-all gap-1.5",
                                isReviewMode
                                    ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white shadow-sm"
                                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                            )}
                            onClick={() => onReviewModeToggle(!isReviewMode)}
                        >
                            {reviewDiffLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Sparkles className={cn("h-3.5 w-3.5", isReviewMode ? "animate-pulse" : "")} />
                            )}
                            {isReviewMode ? "Reviewing" : "Review"}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        onClick={() => setExpanded(false)}
                    >
                        <Minimize2 className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            {/* Conversation Thread - using standard scroll for reliability in flexbox */}
            <div className="flex-1 min-h-0 overflow-y-auto scroll-smooth bg-white dark:bg-gray-950 px-6 py-6" ref={scrollRef}>
                <div className="pb-24 space-y-8">
                    {/* Submission Info (Thread Start) */}
                    {(submissionMessage || submittedBy) && (
                        <div className="relative pl-12">
                            {comments.length > 0 && (
                                <div className="absolute left-4 top-10 bottom-0 w-[2px] bg-indigo-50 dark:bg-indigo-900/20" />
                            )}
                            <div className="absolute left-0 top-0">
                                <div className="h-9 w-9 rounded-full border-2 border-white dark:border-gray-900 shadow-sm bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[11px] font-bold text-white uppercase ring-2 ring-indigo-50 dark:ring-indigo-900/20">
                                    {submittedBy?.slice(0, 2).toUpperCase() || "S"}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100">{submittedBy || "Submitter"}</span>
                                    <Badge variant="secondary" className="text-[9px] h-4 bg-indigo-100/50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-0 uppercase tracking-tighter">Owner</Badge>
                                </div>
                                <div className="text-[13px] text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50/50 dark:bg-gray-900/40 px-4 py-3 rounded-2xl rounded-tl-none border border-gray-100 dark:border-gray-800 shadow-sm">
                                    {submissionMessage || "Document submitted for your review."}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium pl-1">
                                    <Clock className="h-3 w-3" />
                                    <span>{submittedAt ? formatAppDateTime(submittedAt) : "Just now"}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Activity Timeline */}
                    {comments.map((comment, idx) => (
                        <div key={comment.id} className="relative pl-12 animate-in fade-in slide-in-from-bottom-2 duration-400">
                            {idx !== comments.length - 1 && (
                                <div className="absolute left-4 top-10 bottom-0 w-[2px] bg-indigo-50 dark:bg-indigo-900/20" />
                            )}
                            <div className="absolute left-0 top-0">
                                <div className={cn(
                                    "h-9 w-9 rounded-full border-2 border-white dark:border-gray-900 shadow-sm flex items-center justify-center text-[11px] font-bold text-white uppercase ring-2 transition-all",
                                    comment.type === "approve" ? "bg-emerald-500 ring-emerald-50 dark:ring-emerald-900/20" :
                                        comment.type === "reject" ? "bg-rose-500 ring-rose-50 dark:ring-rose-900/20" :
                                            "bg-slate-600 ring-slate-50 dark:ring-slate-900/20"
                                )}>
                                    {comment.type === "approve" ? <Check className="h-5 w-5" /> :
                                        comment.type === "reject" ? <X className="h-5 w-5" /> :
                                            comment.userLabel.slice(0, 2)}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100">{comment.userLabel}</span>
                                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                                        <Clock className="h-3 w-3" />
                                        <span>{formatAppDateTime(comment.createdAt)}</span>
                                    </div>
                                </div>

                                <div className={cn(
                                    "text-[13px] leading-relaxed px-4 py-3 rounded-2xl rounded-tl-none border shadow-sm transition-all",
                                    comment.type === "approve" ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-300" :
                                        comment.type === "reject" ? "bg-rose-50/50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-300" :
                                            "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300"
                                )}>
                                    {comment.type === "approve" && <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase mb-1 tracking-wider text-emerald-600 dark:text-emerald-400"><CircleDot className="h-2 w-2 fill-current" />Approved snapshot</div>}
                                    {comment.type === "reject" && <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase mb-1 tracking-wider text-rose-600 dark:text-rose-400"><CircleDot className="h-2 w-2 fill-current" />Changes requested</div>}
                                    {comment.message}
                                </div>
                            </div>
                        </div>
                    ))}
                    {/* Spacer div to prevent "coinciding" with input area */}
                    <div className="h-8" />
                </div>
            </div>

            {/* Action Input Area - Added shadow and distinct border to separate from timeline */}
            <div className="relative px-6 py-6 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-[0_-12px_30px_rgba(0,0,0,0.06)] z-10">
                <div className="relative">
                    <Textarea
                        value={reviewerMessage}
                        onChange={(e) => onMessageChange(e.target.value)}
                        placeholder="Write a reply..."
                        className="min-h-[100px] w-full resize-none border-0 p-0 focus-visible:ring-0 text-[13px] placeholder:text-gray-400 dark:placeholder:text-gray-600 bg-transparent"
                        disabled={Boolean(actionInProgress)}
                    />
                    <div className="flex items-center justify-between mt-4">
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9 rounded-xl px-4 text-[11px] font-bold border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 gap-2 transition-all active:scale-95 shadow-sm"
                                onClick={() => onAction("comment")}
                                disabled={Boolean(actionInProgress) || !reviewerMessage.trim()}
                            >
                                {actionInProgress === "comment" ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                                Comment
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9 rounded-xl px-4 text-[11px] font-bold border-rose-100 dark:border-rose-900/30 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-700 gap-2 transition-all active:scale-95 shadow-sm"
                                onClick={() => onAction("reject")}
                                disabled={Boolean(actionInProgress) || !reviewerMessage.trim()}
                            >
                                {actionInProgress === "reject" ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                Reject
                            </Button>
                        </div>
                        <Button
                            size="sm"
                            className="h-9 rounded-xl px-5 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-100 dark:shadow-none"
                            onClick={() => onAction("approve")}
                            disabled={Boolean(actionInProgress)}
                        >
                            {actionInProgress === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Approve
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
}
