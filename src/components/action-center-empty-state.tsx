'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
    Quote,
    FileSearch,
    Layers,
    Sparkles,
    Info,
    ArrowRight
} from 'lucide-react';

interface ActionCenterEmptyStateProps {
    type: 'sources' | 'preview' | 'artifact';
    className?: string;
}

export function ActionCenterEmptyState({ type, className }: ActionCenterEmptyStateProps) {
    const content = {
        sources: {
            icon: Quote,
            title: "Knowledge Catalog",
            description: "Ask a question and I'll cite the exact documents and web sources used to build your answer here.",
            accent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
            bgGradient: "from-blue-500/5 via-transparent to-transparent"
        },
        preview: {
            icon: FileSearch,
            title: "Document Insights",
            description: "Select any cited document or folder to preview its contents, metadata, and AI-generated summaries.",
            accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            bgGradient: "from-amber-500/5 via-transparent to-transparent"
        },
        artifact: {
            icon: Layers,
            title: "Structured Artifacts",
            description: "Generated invoices, reports, and data visualizations will be presented here for export and saving.",
            accent: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
            bgGradient: "from-purple-500/5 via-transparent to-transparent"
        }
    }[type];

    const Icon = content.icon;

    return (
        <div className={cn(
            "flex h-full flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700",
            className
        )}>
            {/* Visual Illustration */}
            <div className="relative mb-8">
                {/* Background glow */}
                <div className={cn(
                    "absolute -inset-10 rounded-full blur-3xl opacity-20",
                    content.bgGradient
                )} />

                {/* Main Icon Circle */}
                <div className={cn(
                    "relative flex h-20 w-20 items-center justify-center rounded-3xl shadow-xl transition-transform duration-500 hover:scale-110 hover:rotate-3",
                    "bg-background border border-border/50"
                )}>
                    <div className={cn("rounded-2xl p-4", content.accent)}>
                        <Icon className="h-8 w-8" />
                    </div>

                    {/* Subtle sparkles decoration */}
                    <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border/50 shadow-sm animate-bounce [animation-duration:3s]">
                        <Sparkles className="h-3 w-3 text-amber-500" />
                    </div>
                </div>
            </div>

            {/* Copy */}
            <div className="max-w-[280px] space-y-4">
                <div className="space-y-1">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">
                        {content.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-muted-foreground/80 font-medium">
                        {content.description}
                    </p>
                </div>

                {/* Action hint */}
                <div className="flex items-center justify-center gap-2 pt-2 grayscale opacity-50 group">
                    <Info className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">
                        Waiting for input
                    </span>
                    <ArrowRight className="h-3 w-3 animate-pulse" />
                </div>
            </div>
        </div>
    );
}
