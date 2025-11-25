"use client";

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes } from '@/lib/utils';

type CsvPreviewProps = {
  fileName: string;
  fileSize?: number;
  preview?: {
    type: 'csv';
    loading: boolean;
    headers?: string[];
    rows?: string[][];
    truncated?: boolean;
    error?: string;
  };
  maxRows?: number;
};

const DEFAULT_MAX_ROWS = 30;

export default function CsvPreview({ fileName, fileSize, preview, maxRows = DEFAULT_MAX_ROWS }: CsvPreviewProps) {
  if (!preview || preview.loading) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="text-xs text-muted-foreground font-medium">Generating CSV preview…</div>
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (preview.error) {
    return (
      <Alert variant="destructive" className="rounded-lg">
        <AlertDescription className="text-xs sm:text-sm">
          {preview.error || 'Unable to render CSV preview.'}
        </AlertDescription>
      </Alert>
    );
  }

  const headers = preview.headers || [];
  const rows = (preview.rows || []).slice(0, maxRows);
  const hasData = headers.length || rows.length;

  if (!hasData) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
        No tabular rows detected in {fileName}.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] sm:text-xs text-muted-foreground">
        <span className="font-medium">{fileName}</span>
        {typeof fileSize === 'number' && <span>{formatBytes(fileSize)}</span>}
      </div>
      <div className="rounded-lg border bg-background overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full text-xs sm:text-sm">
            <thead className="bg-muted/40">
              <tr>
                {headers.map((header, idx) => (
                  <th key={`${header}-${idx}`} className="px-3 py-2 text-left font-medium text-muted-foreground border-b">
                    {header || `Column ${idx + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={headers.length || 1} className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No rows available.
                  </td>
                </tr>
              )}
              {rows.map((row, rowIdx) => (
                <tr key={`row-${rowIdx}`} className="odd:bg-muted/10">
                  {(headers.length ? headers : row).map((_, colIdx) => (
                    <td key={`cell-${rowIdx}-${colIdx}`} className="px-3 py-2 border-b align-top">
                      <span className="whitespace-pre-wrap break-words text-[11px] sm:text-xs">
                        {row[colIdx]?.toString().slice(0, 240) || ''}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {preview.truncated && (
        <div className="text-[11px] sm:text-xs text-muted-foreground">
          Showing first {maxRows} rows from an initial sample. Upload to view the full sheet.
        </div>
      )}
    </div>
  );
}

