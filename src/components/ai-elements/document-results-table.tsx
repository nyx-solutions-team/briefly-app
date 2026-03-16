import React from 'react';
import Link from 'next/link';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

type DocumentResultsTableProps = {
  columns: string[];
  rows: Array<Record<string, any>>;
  hasMore?: boolean;
  totalCount?: number | null;
  isLoadingMore?: boolean;
  onViewMore?: () => void;
  /** Limit rows shown inline (e.g., 10). If set, shows "View All" button. */
  previewLimit?: number;
  /** Callback when user wants to view all results in sidebar */
  onViewAllInSidebar?: () => void;
  className?: string;
};

// Custom column labels - match ResultsSidebar
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

export function DocumentResultsTable({
  columns,
  rows,
  hasMore,
  totalCount,
  isLoadingMore,
  onViewMore,
  previewLimit = 10,
  onViewAllInSidebar,
  className
}: DocumentResultsTableProps) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const derivedColumns = Array.isArray(columns) && columns.length > 0
    ? columns.filter(col => col !== 'doc_type') // Filter out doc_type column
    : (safeRows[0] ? Object.keys(safeRows[0]).filter(col => col !== 'doc_type') : []);

  // Apply preview limit for inline display
  const displayRows = previewLimit && safeRows.length > previewLimit
    ? safeRows.slice(0, previewLimit)
    : safeRows;

  const totalResults = typeof totalCount === 'number' ? totalCount : safeRows.length;
  const hiddenCount = safeRows.length - displayRows.length;
  const hasHiddenRows = hiddenCount > 0 || (totalCount && totalCount > safeRows.length);

  const summaryText = totalResults > displayRows.length
    ? `Showing ${displayRows.length} of ${totalResults} results`
    : `Showing ${displayRows.length} result${displayRows.length === 1 ? '' : 's'}`;

  // Render cell based on column type - match ResultsSidebar
  const renderCell = (col: string, value: any) => {
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
    <div className={cn('rounded-xl border border-border/40 bg-card/60', className)}>
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/30">
        <div className="text-[11px] sm:text-xs text-muted-foreground">
          {summaryText}
        </div>
        <div className="flex items-center gap-2">
          {/* View All in Sidebar button - shown when there are more results */}
          {hasHiddenRows && onViewAllInSidebar && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-3 text-[11px] gap-1.5"
              onClick={onViewAllInSidebar}
            >
              <ExternalLink className="h-3 w-3" />
              View All {totalResults}
            </Button>
          )}
          {/* Legacy "View more" for pagination (if needed) */}
          {hasMore && onViewMore && !hasHiddenRows && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={onViewMore}
              disabled={Boolean(isLoadingMore)}
            >
              {isLoadingMore ? 'Loading…' : 'View more'}
            </Button>
          )}
        </div>
      </div>
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
            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Math.max(derivedColumns.length, 1)} className="text-center text-xs text-muted-foreground py-4">
                  No results found.
                </TableCell>
              </TableRow>
            ) : (
              displayRows.map((row, idx) => (
                <TableRow key={row.doc_id || row.file_name || idx} className="hover:bg-accent/30">
                  {derivedColumns.map((col) => (
                    <TableCell key={`${col}-${idx}`} className="text-[11px] sm:text-xs align-middle py-2.5">
                      {renderCell(col, row[col])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
