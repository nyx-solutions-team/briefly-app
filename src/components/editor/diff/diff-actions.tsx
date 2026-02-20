"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DiffActionsProps = {
    diffId: string;
    onAccept: (diffId: string) => void;
    onReject: (diffId: string) => void;
    className?: string;
};

export function DiffActions({ diffId, onAccept, onReject, className }: DiffActionsProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-border/40 bg-background/95 p-1 shadow-lg backdrop-blur-sm animate-in fade-in zoom-in-95",
                className
            )}
            contentEditable={false}
        >
            <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 rounded-md bg-green-50 px-2 text-xs font-semibold text-green-700 hover:bg-green-100 hover:text-green-800 transition-colors"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAccept(diffId);
                }}
            >
                <Check className="h-3.5 w-3.5" />
                Accept
            </Button>
            <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 rounded-md bg-red-50 px-2 text-xs font-semibold text-red-700 hover:bg-red-100 hover:text-red-800 transition-colors"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onReject(diffId);
                }}
            >
                <X className="h-3.5 w-3.5" />
                Reject
            </Button>
        </div>
    );
}

