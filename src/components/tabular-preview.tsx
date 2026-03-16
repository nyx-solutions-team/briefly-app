"use client";

import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type TabularPreviewProps = {
  tabular?: any | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
};

type SheetData = {
  name: string;
  headers: string[];
  rows: string[][];
};

type NormalizedTabular = {
  format: string;
  rowCount: number;
  indexedRowCount: number;
  isSampled: boolean;
  sheets: SheetData[];
};

function toCellString(value: any) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return ''; }
  }
  return String(value);
}

function normalizeFromSheetsPayload(tabular: any): NormalizedTabular | null {
  if (!tabular || !Array.isArray(tabular.sheets)) return null;

  const sheets: SheetData[] = tabular.sheets
    .filter((sheet: any) => sheet && typeof sheet === 'object')
    .map((sheet: any, index: number) => {
      const rawRows = Array.isArray(sheet.rows) ? sheet.rows : [];
      const normalizedRows: string[][] = rawRows.map((row: any) =>
        Array.isArray(row) ? row.map((v: any) => toCellString(v)) : [toCellString(row)]
      );

      let headers: string[] = Array.isArray(sheet.headers)
        ? sheet.headers.map((h: any, idx: number) => toCellString(h) || `Column ${idx + 1}`)
        : [];

      if (headers.length === 0) {
        const maxCols = normalizedRows.reduce((m, row) => Math.max(m, row.length), 0);
        headers = Array.from({ length: maxCols }).map((_, i) => `Column ${i + 1}`);
      }

      const alignedRows = normalizedRows.map((row) =>
        headers.map((_, idx) => row[idx] ?? '')
      );

      return {
        name: toCellString(sheet.name) || `Sheet ${index + 1}`,
        headers,
        rows: alignedRows,
      };
    })
    .filter((sheet: SheetData) => sheet.headers.length > 0 || sheet.rows.length > 0);

  if (sheets.length === 0) return null;

  const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  const format = toCellString(tabular.format || 'tabular').toUpperCase();

  return {
    format,
    rowCount: Number(tabular.rowCount || totalRows || 0),
    indexedRowCount: Number(tabular.indexedRowCount || totalRows || 0),
    isSampled: Boolean(tabular.isSampled),
    sheets,
  };
}

function normalizeFromLegacySampleRows(tabular: any): NormalizedTabular | null {
  const sampleRows = Array.isArray(tabular?.sampleRows) ? tabular.sampleRows : [];
  if (sampleRows.length === 0) return null;

  const grouped = new Map<string, Record<string, any>[]>();
  for (const entry of sampleRows) {
    if (!entry || typeof entry !== 'object') continue;

    const sheetName = toCellString(entry.sheet || entry.Sheet || 'Data');
    const rowObj = (entry.row && typeof entry.row === 'object' && !Array.isArray(entry.row))
      ? entry.row
      : entry;

    const normalized = { ...rowObj };
    delete (normalized as any).row;
    delete (normalized as any).sheet;
    delete (normalized as any).table;
    delete (normalized as any).section;
    delete (normalized as any).Sheet;
    delete (normalized as any).Table;
    delete (normalized as any).Section;

    if (!grouped.has(sheetName)) grouped.set(sheetName, []);
    grouped.get(sheetName)!.push({
      ...(entry.sheet || entry.Sheet ? { Sheet: sheetName } : {}),
      ...(entry.table || entry.Table ? { Table: toCellString(entry.table || entry.Table) } : {}),
      ...(entry.section || entry.Section ? { Section: toCellString(entry.section || entry.Section) } : {}),
      ...normalized,
    });
  }

  const sheets: SheetData[] = [];
  for (const [sheetName, rowsObj] of grouped.entries()) {
    if (!rowsObj.length) continue;
    const first = rowsObj[0] || {};
    const headers = Object.keys(first);
    const rows = rowsObj.map((row) => headers.map((h) => toCellString(row[h])));
    sheets.push({ name: sheetName, headers, rows });
  }

  if (sheets.length === 0) return null;

  const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  return {
    format: toCellString(tabular?.format || 'tabular').toUpperCase(),
    rowCount: Number(tabular?.rowCount || totalRows || 0),
    indexedRowCount: Number(tabular?.indexedRowCount || totalRows || 0),
    isSampled: Boolean(tabular?.isSampled ?? true),
    sheets,
  };
}

function normalizeTabular(tabular: any): NormalizedTabular | null {
  return normalizeFromSheetsPayload(tabular) || normalizeFromLegacySampleRows(tabular);
}

export default function TabularPreview({
  tabular,
  loading = false,
  error = null,
  className = '',
}: TabularPreviewProps) {
  const normalized = React.useMemo(() => normalizeTabular(tabular), [tabular]);
  const [activeSheetIndex, setActiveSheetIndex] = React.useState(0);

  React.useEffect(() => {
    setActiveSheetIndex(0);
  }, [tabular]);

  if (loading) {
    return (
      <div className={`space-y-3 ${className}`.trim()}>
        <div className="text-xs text-muted-foreground font-medium">Loading tabular preview…</div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertDescription className="text-sm">{error}</AlertDescription>
      </Alert>
    );
  }

  if (!normalized) {
    return (
      <div className={`rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground ${className}`.trim()}>
        No tabular data available yet.
      </div>
    );
  }

  const activeSheet = normalized.sheets[Math.max(0, Math.min(activeSheetIndex, normalized.sheets.length - 1))];

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="text-[10px] font-semibold">{normalized.format}</Badge>
        <span>{normalized.sheets.length} sheet{normalized.sheets.length === 1 ? '' : 's'}</span>
        {normalized.rowCount > 0 && <span>{normalized.rowCount} rows total</span>}
        {normalized.indexedRowCount > 0 && <span>{normalized.indexedRowCount} indexed</span>}
      </div>

      {normalized.sheets.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/10 p-1">
          {normalized.sheets.map((sheet, idx) => {
            const isActive = idx === activeSheetIndex;
            return (
              <button
                key={`${sheet.name}-${idx}`}
                type="button"
                className={cn(
                  'max-w-[220px] truncate rounded-md px-2.5 py-1.5 text-xs border transition-colors',
                  isActive
                    ? 'bg-background border-border text-foreground shadow-sm'
                    : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                )}
                title={`${sheet.name} (${sheet.rows.length} rows)`}
                onClick={() => setActiveSheetIndex(idx)}
              >
                {sheet.name} ({sheet.rows.length})
              </button>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border bg-background overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full text-xs sm:text-sm">
            <thead className="bg-muted/40 sticky top-0 z-[1]">
              <tr>
                {activeSheet.headers.map((header, idx) => (
                  <th key={`${header}-${idx}`} className="px-3 py-2 text-left font-medium text-muted-foreground border-b whitespace-nowrap">
                    {header || `Column ${idx + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeSheet.rows.length === 0 && (
                <tr>
                  <td colSpan={Math.max(1, activeSheet.headers.length)} className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No rows in this sheet.
                  </td>
                </tr>
              )}
              {activeSheet.rows.map((row, rowIdx) => (
                <tr key={`row-${rowIdx}`} className="odd:bg-muted/10">
                  {activeSheet.headers.map((_, colIdx) => (
                    <td key={`cell-${rowIdx}-${colIdx}`} className="px-3 py-2 border-b align-top">
                      <span className="whitespace-pre-wrap break-words text-[11px] sm:text-xs">{row[colIdx] ?? ''}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {normalized.isSampled && (
        <div className="text-[11px] text-muted-foreground">
          Showing sampled rows.
        </div>
      )}
    </div>
  );
}
