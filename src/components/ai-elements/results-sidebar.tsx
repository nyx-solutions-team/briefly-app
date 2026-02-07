'use client';

import React from 'react';
import Link from 'next/link';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ResultsSidebarProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    columns: string[];
    rows: Array<Record<string, any>>;
    totalCount?: number | null;
    docType?: string | null;
    className?: string;
};

// Custom column labels for cleaner display
const COLUMN_LABELS: Record<string, string> = {
    'file_name': 'File Name',
    'upload_timestamp': 'Date Uploaded',
    'file_size_bytes': 'Size',
    'doc_id': 'Action',
};

function formatColumnLabel(name: string) {
    if (COLUMN_LABELS[name]) return COLUMN_LABELS[name];
    return (name || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatCellValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        return value.filter((v) => v !== null && v !== undefined).join(', ');
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

export function ResultsSidebar({
    open,
    onOpenChange,
    columns,
    rows,
    totalCount,
    docType,
    className
}: ResultsSidebarProps) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const derivedColumns = Array.isArray(columns) && columns.length > 0
        ? columns
        : (safeRows[0] ? Object.keys(safeRows[0]) : []);

    const displayTotal = typeof totalCount === 'number' ? totalCount : safeRows.length;
    const docTypeLabel = docType
        ? docType.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
        : 'Documents';

    const handleExportCSV = () => {
        if (safeRows.length === 0) return;

        // Export only file_name, upload_timestamp, file_size_bytes (not doc_id)
        const exportColumns = derivedColumns.filter(c => c !== 'doc_id');
        const headers = exportColumns.map(c => formatColumnLabel(c)).join(',');
        const csvRows = safeRows.map(row =>
            exportColumns.map(col => {
                const val = formatCellValue(row[col]);
                if (val.includes(',') || val.includes('"')) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(',')
        );
        const csv = [headers, ...csvRows].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docType || 'documents'}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Render cell based on column type
    const renderCell = (col: string, value: any, row: Record<string, any>) => {
        // For doc_id column, render as "Open" link
        if (col === 'doc_id' && value) {
            return (
                <Link
                    href={`/documents/${value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-medium"
                >
                    Open
                    <ExternalLink className="h-3 w-3" />
                </Link>
            );
        }

        // Default text rendering
        return (
            <span className="block max-w-[220px] truncate" title={formatCellValue(value)}>
                {formatCellValue(value)}
            </span>
        );
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className={cn(
                    "w-[95vw] sm:w-[80vw] md:w-[70vw] lg:w-[60vw] max-w-none sm:max-w-none p-0 flex flex-col",
                    className
                )}
            >
                {/* Header - Fixed */}
                <SheetHeader className="px-4 sm:px-6 py-4 border-b border-border/40 bg-gradient-to-r from-card to-card/80 flex-shrink-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <SheetTitle className="text-lg font-semibold">
                                    All {docTypeLabel}
                                </SheetTitle>
                                <SheetDescription className="text-xs">
                                    {displayTotal} {displayTotal === 1 ? 'result' : 'results'} found
                                </SheetDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                                {safeRows.length} loaded
                            </Badge>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportCSV}
                                className="gap-1.5 text-xs"
                                disabled={safeRows.length === 0}
                            >
                                <Download className="h-3.5 w-3.5" />
                                Export
                            </Button>
                        </div>
                    </div>
                </SheetHeader>

                {/* Table Content - Scrollable both ways */}
                <div className="flex-1 overflow-auto p-4 sm:p-6">
                    <div className="rounded-xl border border-border/40 bg-card/60">
                        {/* Horizontal scroll container */}
                        <div className="w-full overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {derivedColumns.map((col) => (
                                            <TableHead key={col} className="text-[11px] sm:text-xs whitespace-nowrap font-semibold">
                                                {formatColumnLabel(col)}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {safeRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={Math.max(derivedColumns.length, 1)} className="text-center text-xs text-muted-foreground py-8">
                                                No results found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        safeRows.map((row, idx) => (
                                            <TableRow key={row.doc_id || row.file_name || idx} className="hover:bg-accent/30">
                                                {derivedColumns.map((col) => (
                                                    <TableCell key={`${col}-${idx}`} className="text-[11px] sm:text-xs align-middle py-2.5">
                                                        {renderCell(col, row[col], row)}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>

                {/* Footer - Fixed */}
                <div className="px-4 sm:px-6 py-3 border-t border-border/40 bg-muted/20 text-xs text-muted-foreground flex-shrink-0">
                    Showing {safeRows.length} of {displayTotal} {docTypeLabel.toLowerCase()}
                </div>
            </SheetContent>
        </Sheet>
    );
}
