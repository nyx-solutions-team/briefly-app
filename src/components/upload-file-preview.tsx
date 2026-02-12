"use client";

import React from 'react';
import { cn } from '@/lib/utils';

interface UploadFilePreviewProps {
  file: File;
  previewUrl?: string;
  className?: string;
  height?: number | string;
}

type CsvParseResult = {
  headers: string[];
  rows: string[][];
};

function parseCsvText(input: string): CsvParseResult {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const pushCell = () => {
    currentRow.push(currentCell);
    currentCell = '';
  };

  const pushRow = () => {
    rows.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === ',' || char === ';' || char === '\t')) {
      pushCell();
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      pushCell();
      pushRow();
      continue;
    }

    currentCell += char;
  }

  pushCell();
  if (currentRow.length) pushRow();

  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows };
}

export default function UploadFilePreview({ 
  file, 
  previewUrl, 
  className,
  height = '60vh' 
}: UploadFilePreviewProps) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const isPdf = extension === 'pdf';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension);
  const isCsv = extension === 'csv' || file.type.toLowerCase().includes('csv');
  const isTextLike = (
    (file.type.startsWith('text/') && !isCsv) ||
    file.type === 'application/json' ||
    ['txt', 'md', 'markdown', 'json', 'log', 'xml', 'yaml', 'yml'].includes(extension)
  );

  const [localUrl, setLocalUrl] = React.useState<string | null>(null);
  const [textContent, setTextContent] = React.useState('');
  const [textError, setTextError] = React.useState<string | null>(null);
  const [csvPreview, setCsvPreview] = React.useState<CsvParseResult | null>(null);

  React.useEffect(() => {
    if (previewUrl || (!isPdf && !isImage)) {
      setLocalUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setLocalUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, previewUrl, isPdf, isImage]);

  React.useEffect(() => {
    let cancelled = false;
    const readPreviewData = async () => {
      if (!isTextLike && !isCsv) {
        setTextContent('');
        setTextError(null);
        setCsvPreview(null);
        return;
      }
      try {
        const content = await file.text();
        if (!cancelled) {
          if (isCsv) {
            setCsvPreview(parseCsvText(content || ''));
            setTextContent('');
          } else {
            setTextContent(content || '');
            setCsvPreview(null);
          }
          setTextError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setTextContent('');
          setCsvPreview(null);
          setTextError(error?.message || 'Unable to preview this text file');
        }
      }
    };
    void readPreviewData();
    return () => { cancelled = true; };
  }, [file, isTextLike, isCsv]);

  const src = previewUrl || localUrl || undefined;

  return (
    <div className={cn("w-full bg-muted/30 rounded-lg overflow-hidden", className)}>
      {isPdf && src ? (
        <div className="w-full" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
          <iframe
            src={src}
            className="w-full h-full border-0"
            title="PDF Preview"
            style={{ minHeight: typeof height === 'number' ? `${height}px` : height }}
          />
        </div>
      ) : isImage && src ? (
        <div className="w-full flex items-center justify-center" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
          <img
            src={src}
            alt="Document preview"
            className="max-w-full max-h-full object-contain"
            style={{ maxHeight: typeof height === 'number' ? `${height}px` : height }}
          />
        </div>
      ) : isCsv ? (
        <div
          className="w-full overflow-auto bg-background p-4"
          style={{ height: typeof height === 'number' ? `${height}px` : height }}
        >
          {textError ? (
            <div className="text-sm text-destructive">{textError}</div>
          ) : !csvPreview ? (
            <div className="text-sm text-muted-foreground">Loading CSV preview...</div>
          ) : (
            <div className="rounded-lg border bg-background overflow-hidden">
              <div className="max-h-full overflow-auto">
                <table className="min-w-full text-xs sm:text-sm">
                  <thead className="bg-muted/40 sticky top-0 z-[1]">
                    <tr>
                      {csvPreview.headers.map((header, idx) => (
                        <th key={`${header}-${idx}`} className="px-3 py-2 text-left font-medium text-muted-foreground border-b">
                          {header || `Column ${idx + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.rows.map((row, rowIdx) => (
                      <tr key={`row-${rowIdx}`} className="odd:bg-muted/10">
                        {(csvPreview.headers.length ? csvPreview.headers : row).map((_, colIdx) => (
                          <td key={`cell-${rowIdx}-${colIdx}`} className="px-3 py-2 border-b align-top">
                            <span className="whitespace-pre-wrap break-words text-[11px] sm:text-xs">
                              {row[colIdx]?.toString() || ''}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : isTextLike ? (
        <div
          className="w-full overflow-auto bg-background p-4"
          style={{ height: typeof height === 'number' ? `${height}px` : height }}
        >
          {textError ? (
            <div className="text-sm text-destructive">{textError}</div>
          ) : textContent ? (
            <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-mono text-foreground">
              {textContent}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">This file is empty.</div>
          )}
        </div>
      ) : (
        <div 
          className="w-full flex items-center justify-center text-muted-foreground"
          style={{ height: typeof height === 'number' ? `${height}px` : height }}
        >
          <div className="text-center">
            <div className="text-4xl mb-2">📄</div>
            <div className="text-sm font-medium">{file.name}</div>
            <div className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
