"use client";

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
    CheckCircle2,
    XCircle,
    Loader2,
    Clock,
    SkipForward,
    RefreshCw,
    AlertTriangle,
    Zap,
    Layers,
} from 'lucide-react';

export interface IngestionStep {
    id?: string;
    job_id: string;
    step_key: string;
    lane: 'fast' | 'deep';
    step_sequence: number;
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
    started_at?: string | null;
    ended_at?: string | null;
    error_message?: string | null;
    error_details?: Record<string, any> | null;
    retry_count?: number;
    updated_at?: string;
}

export interface IngestionJob {
    id: string;
    org_id: string;
    doc_id: string;
    status: 'queued' | 'running' | 'review_ready' | 'completed' | 'failed';
    processing_owner?: string | null;
    lease_expires_at?: string | null;
    created_at: string;
    updated_at?: string;
    review_ready_at?: string | null;
    completed_at?: string | null;
    failed_at?: string | null;
    last_error?: string | null;
}

interface Props {
    job: IngestionJob | null;
    steps: IngestionStep[];
    onRetry?: (stepKey?: string) => void;
    isRetrying?: boolean;
    className?: string;
}

const STEP_LABELS: Record<string, string> = {
    ocr: 'OCR',
    summary: 'Summary',
    metadata: 'Metadata',
    supabase_chunks: 'Chunks',
    docling: 'Docling',
    doc_type: 'Classify',
    type_specific: 'Extract',
    vespa: 'Index',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
    ocr: 'Extract text from document using AI vision',
    summary: 'Generate document summary',
    metadata: 'Extract document metadata',
    supabase_chunks: 'Create searchable text chunks',
    docling: 'Extract document structure & tables',
    doc_type: 'Classify document type',
    type_specific: 'Extract type-specific fields',
    vespa: 'Index in vector database',
};

function getStepIcon(status: IngestionStep['status'], className?: string) {
    const baseClass = cn('h-2.5 w-2.5 rounded-full', className);
    switch (status) {
        case 'succeeded':
            return <div className={cn(baseClass, 'bg-emerald-500')} />;
        case 'failed':
            return <div className={cn(baseClass, 'bg-red-500')} />;
        case 'running':
            return <div className={cn(baseClass, 'bg-amber-500 animate-pulse')} />;
        case 'skipped':
            return <div className={cn(baseClass, 'bg-muted-foreground/30')} />;
        default:
            return <div className={cn(baseClass, 'bg-muted border border-border')} />;
    }
}


function getStepDuration(step: IngestionStep): string | null {
    if (!step.started_at) return null;
    const start = new Date(step.started_at).getTime();
    const end = step.ended_at ? new Date(step.ended_at).getTime() : Date.now();
    const ms = end - start;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function getJobStatusBadge(status: IngestionJob['status']) {
    switch (status) {
        case 'queued':
            return <Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Clock className="h-3 w-3 mr-1" />Queued</Badge>;
        case 'running':
            return <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
        case 'review_ready':
            return <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200"><AlertTriangle className="h-3 w-3 mr-1" />Review Ready</Badge>;
        case 'completed':
            return <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
        case 'failed':
            return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
        default:
            return <Badge variant="outline">{status}</Badge>;
    }
}

export function IngestionPipelineProgress({ job, steps, onRetry, isRetrying, className }: Props) {
    const sortedSteps = useMemo(() => {
        return [...steps].sort((a, b) => a.step_sequence - b.step_sequence);
    }, [steps]);

    const fastLaneSteps = useMemo(() => sortedSteps.filter(s => s.lane === 'fast'), [sortedSteps]);
    const deepLaneSteps = useMemo(() => sortedSteps.filter(s => s.lane === 'deep'), [sortedSteps]);

    const stats = useMemo(() => {
        const total = steps.length;
        const completed = steps.filter(s => s.status === 'succeeded' || s.status === 'skipped').length;
        const failed = steps.filter(s => s.status === 'failed').length;
        const running = steps.filter(s => s.status === 'running').length;
        const pending = steps.filter(s => s.status === 'pending').length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        // Calculate total time
        let totalMs = 0;
        for (const step of steps) {
            if (step.started_at) {
                const start = new Date(step.started_at).getTime();
                const end = step.ended_at ? new Date(step.ended_at).getTime() : (step.status === 'running' ? Date.now() : start);
                totalMs += (end - start);
            }
        }
        const totalTime = totalMs > 0 ? `${(totalMs / 1000).toFixed(1)}s` : null;

        return { total, completed, failed, running, pending, progress, totalTime };
    }, [steps]);

    const failedStep = useMemo(() => steps.find(s => s.status === 'failed'), [steps]);

    if (!job) {
        return (
            <Card className={className}>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Ingestion Pipeline
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">No ingestion job found for this document.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className={cn("space-y-6", className)}>
            <div className="flex flex-col gap-6">
                {/* Unified Pipeline Flow */}
                <div className="space-y-4">
                    {/* Header with Stats */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Execution Flow</span>
                            <div className="h-1 w-1 rounded-full bg-border" />
                            <span className="text-[11px] font-mono text-muted-foreground">{stats.completed}/{stats.total} stages</span>
                        </div>
                        {failedStep && onRetry && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[10px] font-bold uppercase tracking-tight text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => onRetry()}
                                disabled={isRetrying}
                            >
                                <RefreshCw className={cn("h-3 w-3 mr-1.5", isRetrying && "animate-spin")} />
                                Retry Pipeline
                            </Button>
                        )}
                    </div>

                    <div className="space-y-8">
                        {/* Fast Lane - Horizontal */}
                        <div className="relative">
                            <div className="absolute top-3 left-0 right-0 h-px bg-border/40 -z-10" />
                            <div className="flex items-start justify-between">
                                <TooltipProvider>
                                    {fastLaneSteps.map((step, index) => {
                                        const duration = getStepDuration(step);
                                        return (
                                            <div key={step.step_key} className="flex flex-col items-center gap-3">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            className="relative group outline-none"
                                                            onClick={() => step.status === 'failed' && onRetry?.(step.step_key)}
                                                        >
                                                            <div className={cn(
                                                                "h-6 w-6 rounded-full flex items-center justify-center bg-background border ring-offset-background transition-all",
                                                                step.status === 'succeeded' && "border-emerald-500/50 bg-emerald-500/5",
                                                                step.status === 'failed' && "border-red-500/50 bg-red-500/5",
                                                                step.status === 'running' && "border-amber-500/50 ring-2 ring-amber-500/10",
                                                                step.status === 'pending' && "border-border"
                                                            )}>
                                                                {getStepIcon(step.status)}
                                                            </div>
                                                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                                                <span className={cn(
                                                                    "text-[10px] font-bold uppercase tracking-tighter transition-colors",
                                                                    step.status === 'succeeded' ? "text-emerald-600" :
                                                                        step.status === 'failed' ? "text-red-500" :
                                                                            step.status === 'running' ? "text-amber-600" : "text-muted-foreground/60"
                                                                )}>
                                                                    {STEP_LABELS[step.step_key] || step.step_key}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="bottom" className="text-[11px] p-2">
                                                        <p className="font-bold">{STEP_LABELS[step.step_key] || step.step_key}</p>
                                                        <p className="text-muted-foreground opacity-80">{STEP_DESCRIPTIONS[step.step_key]}</p>
                                                        {duration && <p className="mt-1 font-mono text-primary">{duration}</p>}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        );
                                    })}
                                </TooltipProvider>
                            </div>
                        </div>

                        {/* Deep Lane - High Density */}
                        <div className="pt-2">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">Background Indexing</span>
                                <div className="h-px flex-1 bg-border/20" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <TooltipProvider>
                                    {deepLaneSteps.map((step) => {
                                        const duration = getStepDuration(step);
                                        return (
                                            <Tooltip key={step.step_key}>
                                                <TooltipTrigger asChild>
                                                    <div className={cn(
                                                        "flex items-center gap-2 px-2.5 py-1 rounded-md border text-[10px] font-medium transition-all",
                                                        step.status === 'succeeded' && "bg-emerald-500/5 border-emerald-500/20 text-emerald-700",
                                                        step.status === 'failed' && "bg-red-500/5 border-red-500/20 text-red-700",
                                                        step.status === 'running' && "bg-amber-500/5 border-amber-500/20 text-amber-700",
                                                        step.status === 'pending' && "bg-muted/30 border-border/40 text-muted-foreground/50",
                                                        step.status === 'skipped' && "bg-muted/10 border-border/20 text-muted-foreground/30 opacity-50"
                                                    )}>
                                                        {getStepIcon(step.status)}
                                                        <span className="uppercase tracking-tight">{STEP_LABELS[step.step_key] || step.step_key}</span>
                                                        {duration && step.status === 'succeeded' && <span className="opacity-40 font-mono">{duration}</span>}
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent className="text-[10px]">
                                                    {STEP_DESCRIPTIONS[step.step_key]}
                                                </TooltipContent>
                                            </Tooltip>
                                        );
                                    })}
                                </TooltipProvider>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error Console */}
                {failedStep && (
                    <div className="rounded border border-red-200/50 bg-red-50/30 p-3">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-red-600 mb-1">
                            <AlertTriangle className="h-3 w-3" />
                            Fault in {STEP_LABELS[failedStep.step_key] || failedStep.step_key}
                        </div>
                        <p className="text-[11px] text-red-700 font-mono leading-relaxed">
                            {failedStep.error_message || "Unknown execution error occurred."}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
