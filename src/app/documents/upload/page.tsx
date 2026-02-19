"use client";

import React, { useEffect, useMemo, useRef, useState, Suspense, useCallback } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Check, UploadCloud, X, FileText, User, UserCheck, Calendar, Tag, FolderOpen, MessageSquare, Hash, Bookmark, Link as LinkIcon, Loader2, Database, CheckCircle2, Clock, AlertCircle, Sparkles, Eye, ChevronLeft, ChevronRight, LayoutGrid, List, Save } from 'lucide-react';
import { AccessDenied } from '@/components/access-denied';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import type { Document, StoredDocument } from '@/lib/types';
import type { ExtractDocumentMetadataOutput } from '@/ai/flows/extract-document-metadata';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
// Calls will be proxied via backend: sign upload, finalize, analyze
import { apiFetch, getApiContext } from '@/lib/api';
import { useDocuments } from '@/hooks/use-documents';
import { useFolders as useFolderExplorer } from '@/hooks/use-folders';
import { useDepartments } from '@/hooks/use-departments';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { cn, computeContentHash, formatBytes } from '@/lib/utils';
import { useCategories } from '@/hooks/use-categories';
import { useUserDepartmentCategories } from '@/hooks/use-department-categories';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import UploadFilePreview from '@/components/upload-file-preview';
import FilePreview from '@/components/file-preview';
import TabularPreview from '@/components/tabular-preview';
import JSZip from 'jszip';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { FolderPickerDialog, FolderOption } from '@/components/folder-picker-dialog';
import { VersionLinkPickerDialog } from '@/components/version-link-picker-dialog';

const toDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

type Extracted = {
  ocrText: string;
  metadata: ExtractDocumentMetadataOutput;
  docling?: {
    coordinates?: any[];
    tables?: any[];
    pages?: any[];
    metadata?: any;
  } | null;
};

type FormData = {
  title: string;
  filename: string;
  sender: string;
  receiver: string;
  documentDate: string;
  documentType: string;
  folder: string;
  subject: string;
  description: string;
  category: string;
  keywords: string;
  tags: string;
};

type QueueDocumentPrefill = {
  docId?: string;
  title?: string;
  filename?: string;
  sender?: string;
  receiver?: string;
  documentDate?: string;
  subject?: string;
  description?: string;
  category?: string;
  keywords?: string[] | string;
  tags?: string[] | string;
  folderPath?: string[];
  storageKey?: string;
  mimeType?: string;
  extractedMetadata?: ExtractDocumentMetadataOutput;
  queueStatus?: 'ready' | 'error' | 'processing' | 'pending';
  queueNote?: string;
  failureReason?: string;
};

type IngestionStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'saving' | 'success' | 'error';

type TabularSheetPreview = {
  name: string;
  headers: string[];
  rows: string[][];
};

type TabularPreviewPayload = {
  format: 'csv' | 'excel';
  sheets: TabularSheetPreview[];
  rowCount: number;
  indexedRowCount: number;
  isSampled: boolean;
};

type TabularPreviewState =
  | {
    loading: true;
  }
  | {
    loading: false;
    data: TabularPreviewPayload;
  }
  | {
    loading: false;
    error: string;
  };

type UploadQueueItem = {
  file: File;
  progress: number;
  status: IngestionStatus;
  note?: string;
  hash?: string;
  extracted?: Extracted;
  form?: FormData;
  locked?: boolean;
  previewUrl?: string;
  rotation?: number;
  linkMode?: 'new' | 'version';
  baseId?: string;
  candidates?: { id: string; label: string }[];
  senderOptions?: string[];
  receiverOptions?: string[];
  storageKey?: string;
  geminiFile?: { fileId: string; fileUri: string; mimeType?: string };
  docId?: string;
  ingestionJob?: any;
  ingestionStatus?: string;
  folderPathOverride?: string[];
  prefilledFromQueue?: boolean;
  tabularPreview?: TabularPreviewState;
};

const BULK_UPLOAD_LIMIT = Number(process.env.NEXT_PUBLIC_BULK_UPLOAD_MAX_FILES || 200);
const BULK_UPLOAD_MAX_FILE_MB = Number(process.env.NEXT_PUBLIC_BULK_UPLOAD_MAX_FILE_MB || 50);

type ExtendedFile = File & { webkitRelativePath?: string };
type FileSystemEntry = { isDirectory: boolean };

const isZipFile = (file: File | ExtendedFile) => {
  const name = file.name?.toLowerCase() || '';
  const type = (file.type || '').toLowerCase();
  return name.endsWith('.zip') || type === 'application/zip' || type === 'application/x-zip-compressed';
};

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.markdown',
  '.jpg',
  '.jpeg',
  '.png',
  '.csv',
  '.xls',
  '.xlsx',
  '.docx',
  '.doc',
  '.dwg',
  '.dxf',
]);
const SYSTEM_FILE_PATTERNS = [/^__MACOSX\//i, /\.DS_Store$/i];
const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.csv': 'text/csv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.dwg': 'application/octet-stream',
  '.dxf': 'application/octet-stream',
};

const normalizeSegment = (segment: string) => {
  const trimmed = segment.trim();
  if (!trimmed) return 'Folder';
  return trimmed.replace(/[<>:"/\\|?*]/g, '-').replace(/-+/g, '-');
};

const getExtension = (filename: string) => {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
};

const isSupportedFile = (filename: string) => {
  const ext = getExtension(filename);
  return SUPPORTED_EXTENSIONS.has(ext);
};

const guessMimeFromName = (filename: string) => {
  const ext = getExtension(filename);
  return MIME_MAP[ext] || 'application/octet-stream';
};

const shouldSkipPath = (path: string) => {
  return SYSTEM_FILE_PATTERNS.some((pattern) => pattern.test(path));
};

const splitRelativePath = (relativePath: string) => {
  const sanitizedPath = relativePath.replace(/\\/g, '/');
  const parts = sanitizedPath.split('/').filter(Boolean);
  const fileName = parts.pop() || '';
  const folderSegments = parts.map(normalizeSegment);
  return { folderSegments, fileName };
};

const extractDirectorySegments = (relativePath: string) => {
  const sanitized = relativePath.replace(/\\/g, '/');
  return sanitized.split('/').filter(Boolean).map(normalizeSegment);
};

const isCsvFile = (file: File) => {
  const name = file.name?.toLowerCase() || '';
  const mime = file.type?.toLowerCase() || '';
  return name.endsWith('.csv') || mime === 'text/csv' || mime === 'application/csv';
};

const isXlsxFile = (file: File) => {
  const name = file.name?.toLowerCase() || '';
  const mime = file.type?.toLowerCase() || '';
  return (
    name.endsWith('.xlsx') ||
    mime.includes('spreadsheetml')
  );
};

const isExcelFile = (file: File) => {
  const name = file.name?.toLowerCase() || '';
  const mime = file.type?.toLowerCase() || '';
  return (
    name.endsWith('.xls') ||
    name.endsWith('.xlsx') ||
    mime.includes('spreadsheetml') ||
    mime.includes('application/vnd.ms-excel')
  );
};

const detectCsvDelimiter = (text: string) => {
  const firstLine = (text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) || '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
};

const parseDelimitedText = (input: string, delimiter: string) => {
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
    const nextChar = input[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      pushCell();
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      pushCell();
      pushRow();
      continue;
    }

    currentCell += char;
  }

  pushCell();
  if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
    pushRow();
  }

  return rows;
};

const buildHeaders = (row: string[]) =>
  row.map((value, idx) => {
    const trimmed = String(value || '').trim();
    return trimmed || `Column ${idx + 1}`;
  });

const normalizeTableRows = (rows: string[][], width: number) =>
  rows.map((row) => Array.from({ length: width }, (_, idx) => String(row?.[idx] ?? '')));

const buildCsvTabularPayload = (text: string): TabularPreviewPayload => {
  const normalizedText = (text || '').replace(/^\uFEFF/, '');
  const delimiter = detectCsvDelimiter(normalizedText);
  const parsedRows = parseDelimitedText(normalizedText, delimiter);

  if (!parsedRows.length) {
    return {
      format: 'csv',
      sheets: [{ name: 'CSV', headers: [], rows: [] }],
      rowCount: 0,
      indexedRowCount: 0,
      isSampled: false,
    };
  }

  const firstRow = parsedRows[0] || [];
  const maxCols = parsedRows.reduce((max, row) => Math.max(max, row.length), firstRow.length);
  const headerSeed = firstRow.length ? firstRow : Array.from({ length: maxCols }, (_, idx) => `Column ${idx + 1}`);
  const headers = buildHeaders(headerSeed);
  const dataRows = parsedRows.slice(1);
  const normalizedRows = normalizeTableRows(dataRows, headers.length || maxCols);

  return {
    format: 'csv',
    sheets: [{ name: 'CSV', headers, rows: normalizedRows }],
    rowCount: normalizedRows.length,
    indexedRowCount: normalizedRows.length,
    isSampled: false,
  };
};

const getColumnIndexFromRef = (ref: string) => {
  const letters = (ref.match(/[A-Z]+/i)?.[0] || '').toUpperCase();
  if (!letters) return 0;
  let index = 0;
  for (let i = 0; i < letters.length; i += 1) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, index - 1);
};

const extractNodeText = (node: Element | null | undefined) => {
  if (!node) return '';
  return Array.from(node.childNodes)
    .map((child: any) => child?.textContent || '')
    .join('');
};

const parseXlsxPreview = async (file: File): Promise<TabularPreviewPayload> => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbookXml || !workbookRelsXml) {
    throw new Error('Unsupported Excel file format');
  }

  const parser = new DOMParser();
  const workbookDoc = parser.parseFromString(workbookXml, 'application/xml');
  const workbookRelsDoc = parser.parseFromString(workbookRelsXml, 'application/xml');

  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings: string[] = [];
  if (sharedStringsXml) {
    const sharedDoc = parser.parseFromString(sharedStringsXml, 'application/xml');
    const siNodes = Array.from(sharedDoc.getElementsByTagName('si'));
    for (const siNode of siNodes) {
      const richTextNodes = Array.from(siNode.getElementsByTagName('t'));
      if (richTextNodes.length > 0) {
        sharedStrings.push(richTextNodes.map((entry) => entry.textContent || '').join(''));
      } else {
        sharedStrings.push(siNode.textContent || '');
      }
    }
  }

  const relById = new Map<string, string>();
  const relationNodes = Array.from(workbookRelsDoc.getElementsByTagName('Relationship'));
  for (const relation of relationNodes) {
    const id = relation.getAttribute('Id') || '';
    const target = relation.getAttribute('Target') || '';
    if (id && target) relById.set(id, target);
  }

  const sheetNodes = Array.from(workbookDoc.getElementsByTagName('sheet'));
  const sheets: TabularSheetPreview[] = [];
  let totalRows = 0;

  for (const sheetNode of sheetNodes) {
    const relId = sheetNode.getAttribute('r:id') || sheetNode.getAttribute('id') || '';
    const sheetName = sheetNode.getAttribute('name') || `Sheet ${sheets.length + 1}`;
    const rawTarget = relById.get(relId);
    if (!rawTarget) continue;

    const targetPath = rawTarget.startsWith('/')
      ? rawTarget.replace(/^\/+/, '')
      : `xl/${rawTarget.replace(/^\.?\/+/, '')}`;

    const worksheetXml = await zip.file(targetPath)?.async('string');
    if (!worksheetXml) continue;

    const worksheetDoc = parser.parseFromString(worksheetXml, 'application/xml');
    const rowNodes = Array.from(worksheetDoc.getElementsByTagName('row'));

    const parsedRows: string[][] = [];
    let maxCols = 0;

    for (const rowNode of rowNodes) {
      const cellNodes = Array.from(rowNode.getElementsByTagName('c'));
      if (!cellNodes.length) continue;

      const sparseRow: string[] = [];
      for (const cellNode of cellNodes) {
        const ref = cellNode.getAttribute('r') || '';
        const type = (cellNode.getAttribute('t') || '').toLowerCase();
        const valueNode = cellNode.getElementsByTagName('v')[0];
        const inlineNode = cellNode.getElementsByTagName('is')[0];
        const rawValue = valueNode?.textContent || '';
        let value = '';

        if (type === 's') {
          const sharedIdx = Number(rawValue);
          value = Number.isFinite(sharedIdx) ? (sharedStrings[sharedIdx] || '') : '';
        } else if (type === 'inlinestr') {
          value = extractNodeText(inlineNode);
        } else if (type === 'b') {
          value = rawValue === '1' ? 'TRUE' : 'FALSE';
        } else {
          value = rawValue;
        }

        const colIndex = getColumnIndexFromRef(ref);
        sparseRow[colIndex] = String(value || '');
      }

      const normalizedRow = sparseRow.map((cell) => String(cell ?? ''));
      const hasValue = normalizedRow.some((cell) => cell.trim().length > 0);
      if (!hasValue) continue;
      parsedRows.push(normalizedRow);
      maxCols = Math.max(maxCols, normalizedRow.length);
    }

    if (!parsedRows.length) continue;

    const headerSeed = parsedRows[0]?.length ? parsedRows[0] : Array.from({ length: maxCols }, (_, idx) => `Column ${idx + 1}`);
    const headers = buildHeaders(headerSeed);
    const dataRows = normalizeTableRows(parsedRows.slice(1), Math.max(headers.length, maxCols));
    totalRows += dataRows.length;
    sheets.push({ name: sheetName, headers, rows: dataRows });
  }

  return {
    format: 'excel',
    sheets,
    rowCount: totalRows,
    indexedRowCount: totalRows,
    isSampled: false,
  };
};

const generateTabularPreview = async (file: File): Promise<TabularPreviewPayload> => {
  if (isCsvFile(file)) {
    return buildCsvTabularPayload(await file.text());
  }
  if (isXlsxFile(file)) {
    return parseXlsxPreview(file);
  }
  throw new Error('Local preview is supported for CSV and .xlsx files.');
};

const GB_BYTES = 1024 ** 3;
const SUPPORT_CONTACT = 'mailto:support@brieflydocs.com?subject=Plan%20upgrade';

// Status Badge Component - Linear-inspired design
function StatusBadge({ status, note, ingestionStatus }: { status: IngestionStatus; note?: string; ingestionStatus?: string }) {
  const statusConfig: Record<IngestionStatus, { icon: React.ElementType; label: string; className: string }> = {
    idle: {
      icon: Clock,
      label: 'Queued',
      className: 'bg-muted/50 text-muted-foreground border-muted-foreground/30',
    },
    uploading: {
      icon: Loader2,
      label: 'Uploading',
      className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    },
    processing: {
      icon: Sparkles,
      label: 'Analyzing',
      className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
    },
    ready: {
      icon: CheckCircle2,
      label: ingestionStatus === 'processing' || ingestionStatus === 'pending' ? 'Indexing' : 'Ready',
      className: ingestionStatus === 'processing' || ingestionStatus === 'pending'
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    },
    saving: {
      icon: Loader2,
      label: 'Saving',
      className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    },
    success: {
      icon: CheckCircle2,
      label: 'Saved',
      className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    },
    error: {
      icon: AlertCircle,
      label: 'Failed',
      className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
    },
  };

  const config = statusConfig[status] || statusConfig.idle;
  const Icon = config.icon;
  const isAnimated = status === 'uploading' || status === 'processing' || status === 'saving' || (status === 'ready' && (ingestionStatus === 'processing' || ingestionStatus === 'pending'));

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 text-xs font-medium border px-2 py-0.5 transition-all',
        config.className
      )}
      title={note || config.label}
    >
      <Icon className={cn('h-3 w-3', isAnimated && 'animate-spin')} />
      <span>{config.label}</span>
    </Badge>
  );
}

// Form Section Header Component
function FormSectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-3 border-b border-border/40">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div>
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

// Form Field Component for consistent styling
function FormField({
  label,
  icon: Icon,
  children,
  className,
  required,
}: {
  label: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={className}>
      <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium mb-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// ===== DOCUMENT SCANNING OVERLAY - Clean Dramatic Effect =====
function ScanningOverlay({ isScanning, status }: { isScanning: boolean; status: string }) {
  const statusText = status === 'uploading'
    ? 'UPLOADING DOCUMENT...'
    : status === 'processing'
      ? 'SCANNING SECTORS...'
      : 'AWAITING INPUT';

  return (
    <>
      {/* Status Indicator - Above the preview */}
      <div className="flex items-center gap-2 mb-3">
        <div className={cn(
          "status-dot",
          isScanning && "active"
        )} />
        <span className={cn(
          "status-text text-muted-foreground",
          isScanning && "active"
        )}>
          {statusText}
        </span>
      </div>

      {/* The scanning effects are applied via CSS class 'scanning' on parent container */}
    </>
  );
}

// Wrapper component for the document preview with scanning effect
function ScanningDocumentPreview({
  isScanning,
  status,
  children
}: {
  isScanning: boolean;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <ScanningOverlay isScanning={isScanning} status={status} />

      {/* Document container with scanning effect */}
      <div className={cn(
        "relative rounded-xl border border-border/60 overflow-hidden transition-all duration-300",
        isScanning && "scanning"
      )}>
        {/* Scan beam */}
        <div className="scan-beam" />

        {/* Overlay dimming */}
        <div className="scan-overlay" />

        {/* Actual content */}
        <div className={cn(
          "transition-opacity duration-300",
          isScanning && "opacity-80"
        )}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ===== STEP PROGRESS INDICATOR =====
type StepStatus = 'pending' | 'active' | 'completed';
type Step = { id: string; label: string; icon: React.ElementType };

function StepProgress({ currentStatus, ingestionStatus }: { currentStatus: IngestionStatus; ingestionStatus?: string }) {
  const steps: Step[] = [
    { id: 'upload', label: 'Upload', icon: UploadCloud },
    { id: 'analyze', label: 'Analyze', icon: Sparkles },
    { id: 'review', label: 'Review', icon: Eye },
    { id: 'save', label: 'Save', icon: CheckCircle2 },
  ];

  const getStepStatus = (stepId: string): StepStatus => {
    const statusMap: Record<IngestionStatus, number> = {
      idle: 0,
      uploading: 1,
      processing: 2,
      ready: 3,
      saving: 4,
      success: 5,
      error: 3,
    };

    const stepIndex = steps.findIndex(s => s.id === stepId);
    const currentIndex = statusMap[currentStatus] || 0;

    // Special case: if ready but still indexing, show review as active
    if (stepId === 'review' && currentStatus === 'ready' && (ingestionStatus === 'processing' || ingestionStatus === 'pending')) {
      return 'active';
    }

    if (stepId === 'upload') {
      return currentIndex >= 1 ? 'completed' : currentIndex === 0 ? 'pending' : 'active';
    }
    if (stepId === 'analyze') {
      if (currentIndex === 2) return 'active';
      return currentIndex > 2 ? 'completed' : 'pending';
    }
    if (stepId === 'review') {
      if (currentIndex === 3 || currentStatus === 'error') return 'active';
      return currentIndex > 3 ? 'completed' : 'pending';
    }
    if (stepId === 'save') {
      if (currentIndex === 4) return 'active';
      return currentIndex === 5 ? 'completed' : 'pending';
    }
    return 'pending';
  };

  return (
    <div className="flex items-center justify-between w-full max-w-lg mx-auto px-4 py-3">
      {steps.map((step, idx) => {
        const status = getStepStatus(step.id);
        const Icon = step.icon;
        const isLast = idx === steps.length - 1;

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300',
                  status === 'completed' && 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30',
                  status === 'active' && 'bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-lg shadow-primary/30',
                  status === 'pending' && 'bg-muted text-muted-foreground'
                )}
              >
                {status === 'completed' ? (
                  <Check className="h-4 w-4" />
                ) : status === 'active' ? (
                  <Icon className={cn('h-4 w-4', (currentStatus === 'processing' || currentStatus === 'uploading' || currentStatus === 'saving') && 'animate-pulse')} />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span className={cn(
                'text-[10px] font-medium transition-colors',
                status === 'completed' && 'text-emerald-600 dark:text-emerald-400',
                status === 'active' && 'text-primary',
                status === 'pending' && 'text-muted-foreground'
              )}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2 transition-all duration-500 rounded-full',
                  getStepStatus(steps[idx + 1].id) !== 'pending' || status === 'completed'
                    ? 'bg-gradient-to-r from-emerald-500 to-primary'
                    : status === 'active'
                      ? 'bg-gradient-to-r from-primary/50 to-muted'
                      : 'bg-muted'
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function UploadContent() {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [pickerOpenIndex, setPickerOpenIndex] = useState<number | null>(null);
  // (removed) pickerQuery: Version picker now uses VersionLinkPickerDialog which manages its own search state
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [showAllSkipped, setShowAllSkipped] = useState(false);
  const [skipDetails, setSkipDetails] = useState<{ path: string; reason: string }[] | null>(null);
  const [lastBulkSummary, setLastBulkSummary] = useState<{ count: number; path: string[] } | null>(null);
  const [recentSavePath, setRecentSavePath] = useState<string[] | null>(null);
  const [shareTeamsOpen, setShareTeamsOpen] = useState(false);
  const [additionalDepartmentIds, setAdditionalDepartmentIds] = useState<string[]>([]);
  const { toast } = useToast();
  const { departments, selectedDepartmentId, setSelectedDepartmentId } = useDepartments();
  const router = useRouter();
  const { categories } = useCategories();
  const { getCategoriesForDepartment } = useUserDepartmentCategories();
  const { documents, folders: documentFolders, createFolder, refresh, loadAllDocuments, hasLoadedAll } = useDocuments();
  const { load: loadFolderChildren } = useFolderExplorer();
  const { hasPermission, bootstrapData } = useAuth();
  const isAdmin = hasPermission('org.manage_members');
  const canShareDocuments = hasPermission('documents.share');
  const planInfo = bootstrapData?.plan;
  const planExpired = !!planInfo?.expired;
  const planStorageFull = !!planInfo?.storageFull;
  const planWithinGrace = !!planInfo?.withinGrace;
  const planBlocked = planExpired || planStorageFull;
  const planLimitBytes = Number(planInfo?.storageLimitBytes || 0);
  const planUsageBytes = Number(planInfo?.storageUsedBytes || 0);
  const planUsagePercent = planLimitBytes > 0 ? Math.min(1, planUsageBytes / planLimitBytes) : 0;
  const safeFormatBytes = (value?: number | null) => {
    try {
      return formatBytes(value || 0);
    } catch {
      if (!value || value <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let idx = 0;
      let current = value;
      while (current >= 1024 && idx < units.length - 1) {
        current /= 1024;
        idx++;
      }
      const decimals = current >= 10 ? 1 : 2;
      return `${current.toFixed(decimals)} ${units[idx]}`;
    }
  };
  const planEndsDisplay = planInfo?.planEndsAt ? new Date(planInfo.planEndsAt).toLocaleDateString() : null;
  const planBlockingMessage = planBlocked
    ? planExpired
      ? `Your plan expired${planEndsDisplay ? ` on ${planEndsDisplay}` : ''}.`
      : planLimitBytes > 0
        ? `Storage limit reached (${safeFormatBytes(planUsageBytes)} of ${safeFormatBytes(planLimitBytes)} used).`
        : `Storage limit reached (${safeFormatBytes(planUsageBytes)} used).`
    : '';

  // Ensure the version-link picker can browse/search the full document list.
  useEffect(() => {
    if (typeof pickerOpenIndex !== 'number') return;
    if (hasLoadedAll) return;
    void loadAllDocuments();
  }, [pickerOpenIndex, hasLoadedAll, loadAllDocuments]);
  const planGraceMessage = !planBlocked && planWithinGrace
    ? `Your plan term ended${planEndsDisplay ? ` on ${planEndsDisplay}` : ''}. Please contact us to keep processing documents.`
    : '';
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const [folderCommandOpen, setFolderCommandOpen] = useState(false);
  const [folderOptions, setFolderOptions] = useState<{ id: string; path: string[]; label: string }[]>([]);
  const [cameFromQueue, setCameFromQueue] = useState(false);
  const effectiveAdditionalDepartmentIds = useMemo<string[]>(() => {
    const valid = new Set((departments || []).map((dept) => dept.id));
    return Array.from(new Set(additionalDepartmentIds))
      .filter((deptId) => !!deptId && deptId !== selectedDepartmentId && valid.has(deptId));
  }, [additionalDepartmentIds, departments, selectedDepartmentId]);

  useEffect(() => {
    setAdditionalDepartmentIds((prev) => {
      const valid = new Set((departments || []).map((dept) => dept.id));
      return prev.filter((deptId) => !!deptId && deptId !== selectedDepartmentId && valid.has(deptId));
    });
  }, [departments, selectedDepartmentId]);

  const toggleAdditionalDepartment = useCallback((deptId: string, checked: boolean) => {
    setAdditionalDepartmentIds((prev) => {
      if (checked) return Array.from(new Set([...prev, deptId]));
      return prev.filter((id) => id !== deptId);
    });
  }, []);

  useEffect(() => {
    const dedup = new Map<string, { id: string; path: string[]; label: string }>();
    (documentFolders || []).forEach((segmentsRaw) => {
      const segments = (segmentsRaw || []).filter(Boolean);
      if (segments.length === 0) return;
      const id = segments.join('/');
      dedup.set(id, { id, path: segments, label: `/${segments.join('/')}` });
    });
    setFolderOptions(Array.from(dedup.values()).sort((a, b) => a.label.localeCompare(b.label)));
  }, [documentFolders]);

  // Loading state for folder picker (simple toggle, no recursive API calls)
  const [folderPickerLoading, setFolderPickerLoading] = useState(false);

  // Load root folders when dialog opens (single API call instead of recursive)
  useEffect(() => {
    if (!folderCommandOpen) return;
    let cancelled = false;

    const loadRootFolders = async () => {
      setFolderPickerLoading(true);
      try {
        // Single API call to get root folders
        const rootFolders = await loadFolderChildren([]);
        if (cancelled) return;

        const dedup = new Map<string, { id: string; path: string[]; label: string }>();

        // Helper to add all parent paths too (ensures /A, /A/B, /A/B/C are all present)
        const addWithParents = (segments: string[]) => {
          for (let i = 1; i <= segments.length; i++) {
            const slice = segments.slice(0, i);
            const id = slice.join('/');
            if (!dedup.has(id)) {
              dedup.set(id, { id, path: slice, label: `/${slice.join('/')}` });
            }
          }
        };

        // Add existing folders from documents (with all parent paths)
        (documentFolders || []).forEach((segmentsRaw) => {
          const segments = (segmentsRaw || []).filter(Boolean);
          if (segments.length === 0) return;
          addWithParents(segments);
        });

        // Add root-level folders from API
        for (const folder of rootFolders || []) {
          const childPath = folder.fullPath && folder.fullPath.length > 0
            ? folder.fullPath
            : [folder.name].filter(Boolean);
          if (!childPath.length) continue;
          addWithParents(childPath);
        }

        setFolderOptions(Array.from(dedup.values()).sort((a, b) => a.label.localeCompare(b.label)));
      } catch (error) {
        console.warn('Failed to load folders:', error);
      } finally {
        if (!cancelled) {
          setFolderPickerLoading(false);
        }
      }
    };

    loadRootFolders();
    return () => { cancelled = true; };
  }, [folderCommandOpen, loadFolderChildren, documentFolders]);
  const searchParams = useSearchParams();
  const ensureBulkPrereqs = useCallback(() => {
    if (isAdmin && folderPath.length === 0 && !selectedDepartmentId) {
      toast({
        title: 'Department required',
        description: 'Please select a department or target folder before running a bulk upload.',
        variant: 'destructive',
      });
      return false;
    }
    if (!getApiContext().orgId) {
      toast({
        title: 'Organization missing',
        description: 'Select an organization before uploading.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  }, [folderPath, isAdmin, selectedDepartmentId, toast]);
  const handleClearBulkSummary = useCallback(() => {
    setLastBulkSummary(null);
    setSkipDetails(null);
    setShowAllSkipped(false);
  }, []);
  const ensureFolderStructure = useCallback(async (paths: string[][]) => {
    if (!paths || paths.length === 0) return;
    const dedup = new Map<string, string[]>();
    for (const segments of paths) {
      const clean = segments.filter(Boolean);
      if (!clean.length) continue;
      dedup.set(clean.join('\u0000'), clean);
    }
    const ordered = Array.from(dedup.values()).sort((a, b) => a.length - b.length);
    for (const segs of ordered) {
      if (!segs.length) continue;
      const parent = segs.slice(0, -1);
      const name = segs[segs.length - 1];
      try {
        await createFolder(parent, name, effectiveAdditionalDepartmentIds);
      } catch {
        // Folder likely exists; ignore errors
      }
    }
  }, [createFolder, effectiveAdditionalDepartmentIds]);
  const enqueueFiles = useCallback(async (items: { file: File; folderPathOverride?: string[] }[]) => {
    if (items.length === 0) return { added: 0, skipped: [] as { path: string; reason: string }[] };
    const MAX_FILES = BULK_UPLOAD_LIMIT;
    const maxSizeBytes = 50 * 1024 * 1024;
    const skipped: { path: string; reason: string }[] = [];
    const currentQueueLength = queue.length;
    const availableSlots = MAX_FILES - currentQueueLength;
    if (availableSlots <= 0) {
      skipped.push(...items.map(({ file }) => ({ path: file.name, reason: `Upload queue full (${MAX_FILES} files max)` })));
      toast({
        title: 'Upload queue full',
        description: 'Process or remove existing files before adding more.',
        variant: 'destructive',
      });
      return { added: 0, skipped };
    }
    const allowed: { file: File; folderPathOverride?: string[] }[] = [];
    for (const item of items) {
      if (item.file.size > maxSizeBytes) {
        skipped.push({ path: item.file.name, reason: `File exceeds ${BULK_UPLOAD_MAX_FILE_MB}MB limit` });
        continue;
      }
      if (!isSupportedFile(item.file.name)) {
        skipped.push({ path: item.file.name, reason: 'Unsupported file type' });
        continue;
      }
      allowed.push(item);
    }
    let limited = allowed;
    if (allowed.length > availableSlots) {
      skipped.push(...allowed.slice(availableSlots).map(({ file }) => ({
        path: file.name,
        reason: `Upload queue full (${MAX_FILES} files max)`,
      })));
      limited = allowed.slice(0, availableSlots);
      toast({
        title: 'Upload limit reached',
        description: `Only ${availableSlots} more file(s) can be queued right now.`,
      });
    }
    const queueHashes = new Set(queue.map((q) => q.hash).filter(Boolean));
    const entries = await Promise.all(limited.map(async ({ file, folderPathOverride }) => {
      const wantsTabularPreview = isCsvFile(file) || isXlsxFile(file);
      return {
        file,
        folderPathOverride,
        progress: 0,
        status: 'idle' as const,
        hash: await computeContentHash(file),
        previewUrl: URL.createObjectURL(file),
        rotation: 0,
        linkMode: 'new' as const,
        tabularPreview: wantsTabularPreview ? { loading: true } : undefined,
      } as UploadQueueItem;
    }));
    const deduped: typeof entries = [];
    for (const entry of entries) {
      if (entry.hash && queueHashes.has(entry.hash)) {
        skipped.push({ path: entry.file.name, reason: 'Duplicate file already in queue' });
        continue;
      }
      if (entry.hash) queueHashes.add(entry.hash);
      deduped.push(entry);
    }
    if (deduped.length) {
      setQueue((prev) => [...prev, ...deduped]);
      deduped.forEach((entry) => {
        if (entry.tabularPreview?.loading) {
          const targetHash = entry.hash;
          const matcher = (item: UploadQueueItem) =>
            (targetHash ? item.hash === targetHash : item === entry);
          generateTabularPreview(entry.file)
            .then((preview) => {
              setQueue((prev) =>
                prev.map((item) =>
                  matcher(item) ? { ...item, tabularPreview: { loading: false, data: preview } } : item,
                ),
              );
            })
            .catch((error) => {
              setQueue((prev) =>
                prev.map((item) =>
                  matcher(item)
                    ? { ...item, tabularPreview: { loading: false, error: error.message || 'Unable to build preview' } }
                    : item,
                ),
              );
            });
        }
      });
    }
    return { added: deduped.length, skipped };
  }, [queue, toast]);

  const processZipFile = useCallback(async (zipFile: File) => {
    if (!ensureBulkPrereqs()) {
      if (zipInputRef.current) zipInputRef.current.value = '';
      return;
    }
    try {
      const basePath = folderPath.slice();
      const skipList: { path: string; reason: string }[] = [];
      const filesToQueue: { file: File; folderPathOverride?: string[] }[] = [];
      const folderMap = new Map<string, string[]>();
      const recordFolder = (segments: string[]) => {
        const clean = segments.filter(Boolean);
        if (!clean.length) return;
        folderMap.set(clean.join('\u0000'), clean);
      };
      if (basePath.length) recordFolder(basePath);
      const zip = await JSZip.loadAsync(zipFile);
      const entries = Object.values(zip.files || {});
      for (const entry of entries) {
        if (entry.dir) {
          const dirSegments = extractDirectorySegments(entry.name || '');
          recordFolder([...basePath, ...dirSegments]);
          continue;
        }
        const relativePath = entry.name || '';
        if (shouldSkipPath(relativePath)) {
          skipList.push({ path: relativePath, reason: 'System file skipped' });
          continue;
        }
        const { folderSegments, fileName } = splitRelativePath(relativePath);
        recordFolder([...basePath, ...folderSegments]);
        if (!fileName) continue;
        if (!isSupportedFile(fileName)) {
          skipList.push({ path: relativePath, reason: 'Unsupported file type' });
          continue;
        }
        const blob = await entry.async('blob');
        const inferredType = blob.type && blob.type !== 'application/octet-stream'
          ? blob.type
          : guessMimeFromName(fileName);
        const newFile = new File([blob], fileName, { type: inferredType, lastModified: zipFile.lastModified || Date.now() });
        filesToQueue.push({ file: newFile, folderPathOverride: [...basePath, ...folderSegments] });
      }
      await ensureFolderStructure(Array.from(folderMap.values()));
      const result = await enqueueFiles(filesToQueue);
      const combinedSkips = [...skipList, ...((result && result.skipped) || [])];
      setSkipDetails(combinedSkips.length ? combinedSkips : null);
      if (combinedSkips.length) setShowAllSkipped(false);
      if (result?.added) {
        setLastBulkSummary({ count: result.added, path: basePath.slice() });
        toast({ title: 'Files queued', description: `Added ${result.added} file(s) from archive.` });
      } else {
        setLastBulkSummary(null);
        if (!combinedSkips.length) {
          toast({ title: 'No files added', description: 'Archive did not contain supported files.', variant: 'destructive' });
        }
      }
    } catch (error) {
      toast({
        title: 'ZIP processing failed',
        description: error instanceof Error ? error.message : 'Unable to read archive.',
        variant: 'destructive',
      });
    } finally {
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  }, [enqueueFiles, ensureBulkPrereqs, folderPath, toast]);

  const processFolderSelection = useCallback(async (files: FileList) => {
    if (!ensureBulkPrereqs()) {
      if (folderInputRef.current) folderInputRef.current.value = '';
      return;
    }
    const basePath = folderPath.slice();
    const entries = Array.from(files || []) as ExtendedFile[];
    if (entries.length === 0) {
      toast({
        title: 'No files detected',
        description: 'The selected folder does not contain any files.',
        variant: 'destructive',
      });
      return;
    }
    const prepared: { file: File; folderPathOverride?: string[] }[] = [];
    const folderMap = new Map<string, string[]>();
    const recordFolder = (segments: string[]) => {
      const clean = segments.filter(Boolean);
      if (!clean.length) return;
      folderMap.set(clean.join('\u0000'), clean);
    };
    if (basePath.length) recordFolder(basePath);
    const skipList: { path: string; reason: string }[] = [];
    for (const entry of entries) {
      const relative = entry.webkitRelativePath || entry.name;
      if (!relative) continue;
      const { folderSegments, fileName } = splitRelativePath(relative);
      recordFolder([...basePath, ...folderSegments]);
      if (shouldSkipPath(relative)) {
        skipList.push({ path: relative, reason: 'System file skipped' });
        continue;
      }
      if (!fileName) continue;
      if (!isSupportedFile(fileName)) {
        skipList.push({ path: relative, reason: 'Unsupported file type' });
        continue;
      }
      const needsRetype = !entry.type || entry.type === 'application/octet-stream';
      const typedFile = needsRetype
        ? new File([entry], entry.name, { type: guessMimeFromName(entry.name), lastModified: entry.lastModified })
        : entry;
      prepared.push({ file: typedFile, folderPathOverride: [...basePath, ...folderSegments] });
    }
    await ensureFolderStructure(Array.from(folderMap.values()));
    if (prepared.length === 0) {
      setSkipDetails(skipList.length ? skipList : null);
      if (skipList.length) setShowAllSkipped(false);
      if (!skipList.length) {
        toast({
          title: 'No supported files',
          description: 'This folder does not contain supported files.',
          variant: 'destructive',
        });
      }
      if (folderInputRef.current) folderInputRef.current.value = '';
      return;
    }
    const result = await enqueueFiles(prepared);
    const combinedSkips = [...skipList, ...((result && result.skipped) || [])];
    setSkipDetails(combinedSkips.length ? combinedSkips : null);
    if (combinedSkips.length) setShowAllSkipped(false);
    if (result?.added) {
      setLastBulkSummary({ count: result.added, path: basePath.slice() });
      toast({ title: 'Files queued', description: `Added ${result.added} file(s) from folder.` });
    } else {
      setLastBulkSummary(null);
    }
    if (folderInputRef.current) folderInputRef.current.value = '';
  }, [enqueueFiles, ensureBulkPrereqs, folderPath, toast]);

  const navigateToFolder = (segments?: string[] | null) => {
    const cleaned = Array.isArray(segments) ? segments.map((s) => String(s).trim()).filter(Boolean) : [];
    const dest = cleaned.length ? `?path=${encodeURIComponent(cleaned.join('/'))}` : '';
    router.push(`/documents${dest}`);
  };

  // Get categories for the selected department, fallback to org categories
  const availableCategories = useMemo(() => {
    if (selectedDepartmentId) {
      return getCategoriesForDepartment(selectedDepartmentId);
    }
    return categories;
  }, [selectedDepartmentId, getCategoriesForDepartment, categories]);

  const saveAllReady = async () => {
    if (planBlocked) {
      toast({
        title: 'Plan limit reached',
        description: planBlockingMessage || 'Please contact support to continue.',
        variant: 'destructive',
      });
      return;
    }
    if (isSavingAll) return;
    const readyEntries = queue
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.status === 'ready' && !item.locked);

    if (readyEntries.length === 0) {
      toast({ title: 'No items to save', description: 'All ready items are already saved or being processed.' });
      return;
    }

    setIsSavingAll(true);
    let lastPath: string[] | null = null;

    try {
      // ── Pre-hoist folder creation: build all needed folder paths once ──
      const allFolderPaths: string[][] = [];
      for (const { item } of readyEntries) {
        const targetPath = item.folderPathOverride?.length ? item.folderPathOverride : folderPath;
        if (targetPath.length > 0) {
          for (let i = 1; i <= targetPath.length; i++) {
            allFolderPaths.push(targetPath.slice(0, i));
          }
        }
      }
      if (allFolderPaths.length > 0) {
        await ensureFolderStructure(allFolderPaths);
      }

      // ── Parallel save with concurrency limit of 3 ──
      const CONCURRENCY = 3;
      const results: ({ path: string[]; hasMoreReady: boolean } | null)[] = [];
      const pending = [...readyEntries];

      const runNext = async (): Promise<void> => {
        const entry = pending.shift();
        if (!entry) return;
        try {
          const result = await onDone(entry.index);
          results.push(result);
          if (result) lastPath = result.path;
        } catch (error) {
          console.error('Error saving item:', error);
          results.push(null);
        }
        await runNext();
      };

      // Launch up to CONCURRENCY workers
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, readyEntries.length) }, runNext));

      // ── Single document list refresh after all saves complete ──
      try {
        await loadAllDocuments();
      } catch (e) {
        console.warn('Failed to refresh documents after bulk save:', e);
      }

      const savedCount = results.filter(Boolean).length;
      if (savedCount > 0 && lastPath) {
        setRecentSavePath(lastPath);
        toast({
          title: 'Documents saved',
          description: `Saved ${savedCount} document${savedCount === 1 ? '' : 's'}. Use "View folder" when ready.`,
        });
      }
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleSave = async (index: number) => {
    const item = queue[index];
    // Pre-create folder structure for single saves
    if (item) {
      const targetPath = item.folderPathOverride?.length ? item.folderPathOverride : folderPath;
      if (targetPath.length > 0) {
        const paths: string[][] = [];
        for (let i = 1; i <= targetPath.length; i++) paths.push(targetPath.slice(0, i));
        await ensureFolderStructure(paths);
      }
    }
    const result = await onDone(index);
    if (!result) return;
    setRecentSavePath(result.path);
    // Refresh document list once after single save
    try { await loadAllDocuments(); } catch (e) { console.warn('Failed to refresh after save', e); }
    toast({
      title: 'Document saved',
      description: result.hasMoreReady
        ? 'Continue reviewing remaining files or view the folder when ready.'
        : 'All documents saved. Use "View folder" to open the destination.',
    });
  };

  const handleReject = async (index: number) => {
    const item = queue[index];
    if (!item) return;
    const orgId = getApiContext().orgId || '';
    if (!orgId) {
      toast({
        title: 'No organization selected',
        description: 'Select an organization before rejecting documents.',
        variant: 'destructive',
      });
      return;
    }
    setQueue((prev) =>
      prev.map((q, i) =>
        i === index ? { ...q, locked: true, note: 'Rejecting…' } : q
      )
    );
    try {
      if (item.docId) {
        let rejected = false;
        try {
          await apiFetch(`/orgs/${orgId}/ingestion-jobs/${item.docId}/reject`, {
            method: 'POST',
            body: { reason: 'Discarded before saving' },
          });
          rejected = true;
        } catch (err: any) {
          // Check status from error object or error data
          const status = err?.status || err?.statusCode || err?.data?.statusCode;
          // Handle cases where job is already processed (404), forbidden (403), or wrong status (409)
          if (status !== 404 && status !== 403 && status !== 409) {
            throw err;
          }
          // If job is already in a different state (409), treat as success and remove from queue
          if (status === 409) {
            rejected = true;
          }
        }
        if (!rejected) {
          await apiFetch(`/orgs/${orgId}/documents/${item.docId}/draft`, { method: 'DELETE' });
        }
      }
      setQueue((prev) => {
        const next = prev.filter((_, i) => i !== index);
        if (next.length === 0) {
          setActiveIndex(null);
        } else if (activeIndex !== null && index === activeIndex) {
          setActiveIndex(Math.min(activeIndex, next.length - 1));
        }
        return next;
      });
      toast({
        title: 'Rejected',
        description: `${item.file.name} was discarded.`,
      });
    } catch (error: any) {
      console.error('Reject failed:', error);
      toast({
        title: 'Reject failed',
        description: error?.message || 'Unable to reject document. Please try again.',
        variant: 'destructive',
      });
      setQueue((prev) =>
        prev.map((q, i) =>
          i === index ? { ...q, locked: false, status: 'ready', note: 'Reject failed. Try again.' } : q
        )
      );
    }
  };
  const removeQueueItem = async (index: number) => {
    const item = queue[index];
    if (!item) return;
    const orgId = getApiContext().orgId || '';
    if (orgId && item.docId && item.status !== 'success') {
      try {
        await apiFetch(`/orgs/${orgId}/documents/${item.docId}/draft`, { method: 'DELETE' });
      } catch (error) {
        console.warn('Failed to discard draft document', error);
      }
    }
    setQueue(prev => {
      const next = prev.filter((_, idx) => idx !== index);
      const newLen = next.length;
      if (newLen === 0) setActiveIndex(null);
      else setActiveIndex((prevIdx) => {
        if (prevIdx === null) return 0;
        return Math.min(index, newLen - 1);
      });
      return next;
    });
  };
  const [docType, setDocType] = useState<Document['type']>('PDF');
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [preferredBaseId, setPreferredBaseId] = useState<string | null>(null);

  // Check page permission with fallback to functional permission for backward compatibility
  const permissions = bootstrapData?.permissions || {};
  const canAccessUploadPage = permissions['pages.upload'] !== false; // Default true if not set
  const hasCreatePermission = hasPermission('documents.create');
  const hasAccess = canAccessUploadPage || hasCreatePermission;

  // Redirect if no access
  useEffect(() => {
    if (bootstrapData && !hasAccess) {
      router.push('/documents');
    }
  }, [hasAccess, bootstrapData, router]);

  if (bootstrapData && !hasAccess) {
    return <AccessDenied message="You don't have permission to access the upload page." />;
  }

  // Auto-select the first available department when none is selected (legacy behavior).
  useEffect(() => {
    if (!selectedDepartmentId && departments.length > 0) {
      setSelectedDepartmentId(departments[0].id);
    }
  }, [departments, selectedDepartmentId, setSelectedDepartmentId]);

  useEffect(() => {
    const p = searchParams?.get('path');
    const v = searchParams?.get('version');
    if (p && p.trim()) {
      const pathArray = p.split('/').filter(Boolean);
      setFolderPath(pathArray);
      console.log('Upload page initialized with folder path:', pathArray);
    } else {
      setFolderPath([]);
      console.log('Upload page initialized in root folder');
    }
    if (v && v.trim()) {
      setPreferredBaseId(v);
    } else {
      setPreferredBaseId(null);
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromQueue = searchParams?.get('fromQueue');
    if (fromQueue !== 'true') return;

    // Track that we came from the queue for back navigation
    setCameFromQueue(true);

    const storedStateRaw = window.sessionStorage?.getItem('queueDocumentState');
    if (!storedStateRaw) return;

    window.sessionStorage.removeItem('queueDocumentState');
    try {
      const parsed: QueueDocumentPrefill = JSON.parse(storedStateRaw) || {};
      const {
        docId,
        title,
        filename,
        sender,
        receiver,
        documentDate,
        subject,
        description,
        category,
        keywords,
        tags,
        folderPath: storedFolderPath,
        storageKey,
        mimeType,
        extractedMetadata,
        queueStatus,
        queueNote,
        failureReason,
      } = parsed;

      const folderPathFromState = Array.isArray(storedFolderPath)
        ? storedFolderPath.filter((segment) => typeof segment === 'string' && segment.trim().length > 0)
        : [];
      if (folderPathFromState.length) {
        setFolderPath(folderPathFromState);
      }

      const placeholderName = filename || title || 'Document.pdf';
      const placeholderMime = mimeType || 'application/pdf';
      const placeholderFile = new File([], placeholderName, { type: placeholderMime });
      const metadata = (extractedMetadata ||
      {
        title,
        subject,
        description,
        category,
        keywords,
        tags,
        sender,
        receiver,
        documentDate,
      }) as Partial<ExtractDocumentMetadataOutput> & {
        summary?: string;
        senderOptions?: string[];
        receiverOptions?: string[];
      };

      const keywordsString = Array.isArray(keywords)
        ? keywords.join(', ')
        : typeof keywords === 'string'
          ? keywords
          : '';
      const tagsString = Array.isArray(tags)
        ? tags.join(', ')
        : typeof tags === 'string'
          ? tags
          : '';

      const resolvedKeywords = Array.isArray(metadata.keywords)
        ? metadata.keywords.map((kw) => String(kw)).join(', ')
        : keywordsString;
      const resolvedTags = Array.isArray(metadata.tags)
        ? metadata.tags.map((tag) => String(tag)).join(', ')
        : tagsString;
      const senderOptions = Array.isArray(metadata.senderOptions) ? metadata.senderOptions : [];
      const receiverOptions = Array.isArray(metadata.receiverOptions) ? metadata.receiverOptions : [];

      const form: FormData = {
        title: metadata.title || placeholderName,
        filename: placeholderName,
        sender: metadata.sender || '',
        receiver: metadata.receiver || '',
        documentDate: metadata.documentDate || '',
        documentType: metadata.documentType || 'General Document',
        folder: folderPathFromState.length ? folderPathFromState.join('/') : 'Root',
        subject: metadata.subject || '',
        description: metadata.description || metadata.summary || description || '',
        category: metadata.category || category || 'General',
        keywords: resolvedKeywords,
        tags: resolvedTags,
      };

      const extractedMetadataPayload = metadata as ExtractDocumentMetadataOutput;

      const restoredStatus: IngestionStatus =
        queueStatus === 'error'
          ? 'error'
          : (queueStatus === 'processing' || queueStatus === 'pending')
            ? 'processing'
            : 'ready';

      setQueue([
        {
          file: placeholderFile,
          progress: 100,
          status: restoredStatus,
          note: queueNote || failureReason || undefined,
          hash: '',
          extracted: { ocrText: '', metadata: extractedMetadataPayload },
          form,
          locked: false,
          previewUrl: undefined,
          rotation: 0,
          linkMode: 'new',
          baseId: undefined,
          candidates: [],
          senderOptions,
          receiverOptions,
          storageKey,
          geminiFile: undefined,
          docId,
          ingestionJob: undefined,
          folderPathOverride: folderPathFromState,
          prefilledFromQueue: true,
        },
      ]);
      setActiveIndex(0);
    } catch (error) {
      console.error('Failed to restore queued document state', error);
    }
  }, [searchParams]);



  const onSelect = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;

    const zipCandidates = arr.filter(isZipFile);
    for (const zip of zipCandidates) {
      await processZipFile(zip);
    }

    const normalFiles = arr.filter((file) => !isZipFile(file));
    if (normalFiles.length === 0) return;

    const result = await enqueueFiles(normalFiles.map((file) => ({ file })));
    if (result?.skipped?.length) {
      setSkipDetails(result.skipped);
      setShowAllSkipped(false);
    } else if (!zipCandidates.length) {
      setSkipDetails(null);
    }
    if (result?.added) {
      setLastBulkSummary({ count: result.added, path: folderPath.slice() });
    }
  };

  const onBrowse = () => {
    // Clear the input value to allow selecting the same file again
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    const { items, files } = e.dataTransfer;
    const extended = Array.from(files || []) as ExtendedFile[];

    if (!extended.length) return;

    const hasRelativePaths = extended.some((file) => Boolean((file.webkitRelativePath || '').includes('/')));
    if (hasRelativePaths) {
      await processFolderSelection(files);
      return;
    }

    const zipFiles = extended.filter(isZipFile);
    if (zipFiles.length > 0) {
      for (const zip of zipFiles) {
        await processZipFile(zip);
      }
      const remaining = extended.filter((file) => !isZipFile(file));
      if (remaining.length === 0) return;
      await onSelect(remaining);
      return;
    }

    if (items && items.length) {
      const dirEntries = Array.from(items).map((item) => (item as any).webkitGetAsEntry?.()).filter(Boolean);
      const hasDirectoryEntry = dirEntries.some((entry: FileSystemEntry) => entry.isDirectory);
      if (hasDirectoryEntry) {
        await processFolderSelection(files);
        return;
      }
    }

    await onSelect(files);
  };

  type AnalyzeSuccessResponse = {
    ocrText: string;
    metadata: any;
    geminiFile?: { fileId: string; fileUri: string; mimeType?: string };
  };

  type AnalyzeJobQueuedResponse = {
    jobId: string;
    status: string;
    expiresAt?: number;
  };

  type UploadAnalysisJobStatus = {
    jobId: string;
    status: 'queued' | 'processing' | 'succeeded' | 'failed';
    result?: AnalyzeSuccessResponse;
    error?: string;
    fallback?: { ocrText: string; metadata: any } | null;
    httpStatus?: number;
    createdAt?: number;
    updatedAt?: number;
  };

  type IngestionJobRecord = {
    doc_id?: string;
    docId?: string;
    status?: string;
    failure_reason?: string;
    extraction_key?: string;
    extracted_metadata?: Record<string, any> | null;
  };

  const fetchIngestionJobForDoc = async (orgId: string, docId: string): Promise<IngestionJobRecord | null> => {
    try {
      return await apiFetch<IngestionJobRecord>(`/orgs/${orgId}/ingestion-jobs/${docId}`, { skipCache: true });
    } catch (error: any) {
      if (error?.status !== 404) {
        console.warn('Failed to load ingestion job', error);
      }
      return null;
    }
  };

  const waitForIngestionJobReady = async (orgId: string, docId: string, initialJob?: IngestionJobRecord | null) => {
    const maxWaitMs = 6 * 60 * 1000;
    const start = Date.now();
    let attempt = 0;
    let job: IngestionJobRecord | null | undefined = initialJob;

    while (true) {
      if (!job) {
        job = await fetchIngestionJobForDoc(orgId, docId);
        if (!job) return null; // Already accepted/cleaned up.
      }

      const status = String(job.status || '').toLowerCase();
      if (status === 'needs_review') {
        return job;
      }
      if (status === 'failed') {
        const err: any = new Error(job.failure_reason || 'Ingestion job failed');
        err.job = job;
        throw err;
      }

      if (Date.now() - start > maxWaitMs) {
        const timeoutErr: any = new Error('Timed out waiting for ingestion to finish');
        timeoutErr.job = job;
        throw timeoutErr;
      }

      attempt += 1;
      const delayMs = Math.min(1500 * Math.pow(1.5, attempt), 8000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      job = await fetchIngestionJobForDoc(orgId, docId);
    }
  };

  const waitForAnalysisJob = async (orgId: string, jobId: string): Promise<AnalyzeSuccessResponse> => {
    const maxWaitMs = 5 * 60 * 1000;
    const initialPollIntervalMs = 1500;
    const maxPollIntervalMs = 10000; // Cap at 10 seconds
    const started = Date.now();
    let pollCount = 0;

    while (true) {
      const job = await apiFetch<UploadAnalysisJobStatus>(`/orgs/${orgId}/uploads/analyze/${jobId}`, { skipCache: true });

      if (job.status === 'succeeded' && job.result) {
        return job.result;
      }

      if (job.status === 'failed') {
        const err: any = new Error(job.error || 'AI analysis failed');
        err.status = job.httpStatus || 500;
        if (job.fallback) {
          err.data = { fallback: job.fallback };
        }
        throw err;
      }

      if (Date.now() - started > maxWaitMs) {
        const timeoutErr: any = new Error('AI analysis timed out');
        timeoutErr.status = 503;
        throw timeoutErr;
      }

      // Exponential backoff: start at 1.5s, double every 5 polls, cap at 10s
      pollCount++;
      const backoffMultiplier = Math.min(Math.floor(pollCount / 5), 3); // Max 3x multiplier (8x total)
      const currentInterval = Math.min(initialPollIntervalMs * Math.pow(2, backoffMultiplier), maxPollIntervalMs);

      await new Promise((resolve) => setTimeout(resolve, currentInterval));
    }
  };

  const handleZipInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void processZipFile(file);
    }
  };
  const handleFolderInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (list && list.length) {
      void processFolderSelection(list);
    }
  };
  const processItem = async (index: number) => {
    const item = queue[index];
    if (!item || item.locked || item.status === 'processing' || item.status === 'uploading' || item.status === 'success' || item.status === 'ready') return;
    if (planBlocked) {
      toast({
        title: 'Plan limit reached',
        description: planBlockingMessage || 'Please contact support to continue.',
        variant: 'destructive',
      });
      return;
    }
    // lock row to avoid duplicate processing
    setQueue(prev => prev.map((q, i) => i === index ? { ...q, locked: true } : q));
    setActiveIndex(index);
    // infer type
    const ext = item.file.name.split('.').pop()?.toLowerCase();
    let inferred: Document['type'] = 'PDF';
    if (['png', 'jpg', 'jpeg'].includes(ext || '')) inferred = 'Image';
    setDocType(inferred);

    // simulate upload progress while reading
    setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'uploading', progress: 10 } : q));
    const timer = setInterval(() => setQueue(prev => prev.map((q, i) => i === index ? { ...q, progress: Math.min(q.progress + 8, 90) } : q)), 150);
    try {
      let dataUri: string;
      const isImage = ['png', 'jpg', 'jpeg'].includes(ext || '');
      if (isImage && (item.rotation || 0) % 360 !== 0) {
        dataUri = await rotateImageFileToDataUri(item.file, item.rotation || 0);
      } else {
        dataUri = await toDataUri(item.file);
      }
      clearInterval(timer);
      setQueue(prev => prev.map((q, i) => i === index ? { ...q, progress: 100, status: 'processing' } : q));

      // 1) Upload file to Supabase Storage
      const uploadResult = await uploadFile(item.file, (progress) => {
        setQueue(prev => prev.map((q, i) => i === index ? { ...q, progress: Math.min(progress, 90) } : q));
      });
      const storageKey = uploadResult.storageKey;

      // 2) Finalize DB row immediately so background ingestion can start
      const orgId = getApiContext().orgId || '';
      if (!orgId) throw new Error('No organization set');

      let docId = item.docId;
      let ingestionJob = item.ingestionJob;
      if (!docId) {
        // Validate department is selected before creating document
        if (!selectedDepartmentId) {
          toast({
            title: 'Team Required',
            description: 'Please select a team before uploading documents.',
            variant: 'destructive',
          });
          setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'error', error: 'No team selected' } : q));
          return;
        }

        const initialFolderPath = item.folderPathOverride && item.folderPathOverride.length > 0
          ? [...item.folderPathOverride]
          : folderPath.slice();
        const initialDraftPayload: any = {
          title: item.file.name,
          filename: item.file.name,
          type: inferred,
          folderPath: initialFolderPath,
          subject: '',
          description: '',
          category: 'General',
          tags: [],
          keywords: [],
          sender: '',
          receiver: '',
          documentDate: '',
          departmentId: selectedDepartmentId,
          additionalDepartmentIds: effectiveAdditionalDepartmentIds,
          isDraft: true,
        };
        const createdDraft = await apiFetch<StoredDocument>(`/orgs/${orgId}/documents`, { method: 'POST', body: initialDraftPayload });
        if (!createdDraft?.id) throw new Error('Failed to create draft document');
        docId = createdDraft.id;
      }

      const finalizeResp = await apiFetch(`/orgs/${orgId}/uploads/finalize`, {
        method: 'POST',
        body: {
          documentId: docId,
          storageKey,
          fileSizeBytes: item.file.size,
          mimeType: item.file.type || 'application/octet-stream',
          contentHash: item.hash,
        }
      });
      ingestionJob = finalizeResp?.ingestionJob || ingestionJob;

      // Always start V2 ingestion job so /ingestion-jobs/:docId works correctly
      apiFetch(`/orgs/${orgId}/ingestion-v2/start`, {
        method: 'POST',
        body: {
          docId,
          storageKey,
          mimeType: item.file.type || 'application/octet-stream',
        },
      }).catch((error: any) => {
        console.warn('Failed to start ingestion v2 job', error);
      });

      setQueue(prev => prev.map((q, i) => i === index ? { ...q, docId, ingestionJob, ingestionStatus: ingestionJob?.status || 'pending', storageKey } : q));
      toast({
        title: 'Processing in background',
        description: 'Document queued for ingestion. You can leave this page while AI completes.',
      });

      // 3) Ask backend AI to analyze from signed Storage URL
      let analyzeResp: AnalyzeSuccessResponse;
      try {
        const analyzeInitiated = await apiFetch<AnalyzeSuccessResponse | AnalyzeJobQueuedResponse>(`/orgs/${orgId}/uploads/analyze`, {
          method: 'POST',
          body: { storageKey: storageKey, mimeType: item.file.type || 'application/octet-stream' },
        });

        if ('jobId' in analyzeInitiated) {
          analyzeResp = await waitForAnalysisJob(orgId, analyzeInitiated.jobId);
        } else {
          analyzeResp = analyzeInitiated;
        }
      } catch (e: any) {
        // Gracefully accept server fallback when AI is unavailable (HTTP 503 or 413)
        const status = (e && e.status) || 0;
        const fallback = (e && e.data && e.data.fallback) || null;

        if ((status === 503 || status === 413) && fallback && (typeof fallback === 'object')) {
          analyzeResp = fallback as { ocrText: string; metadata: any };

          // Determine the appropriate message based on status
          let toastTitle = 'AI processing limited';
          let toastDescription = 'Metadata was prefilled from filename. You can edit before saving.';

          if (status === 503) {
            if (e.data?.error?.includes('timeout')) {
              toastTitle = 'AI processing timeout';
              toastDescription = 'Document took too long to process. Basic metadata was generated. You can edit details before saving.';
            } else {
              toastTitle = 'AI service busy';
              toastDescription = 'AI is temporarily unavailable. Basic metadata was generated from filename. You can edit before saving.';
            }
          }

          toast({
            title: toastTitle,
            description: toastDescription,
          });
        } else {
          throw e;
        }
      }
      const ocrResult = { extractedText: analyzeResp.ocrText } as any;
      const metadataResult = analyzeResp.metadata as any;

      let ingestionReadyJob = ingestionJob;
      if (docId) {
        setQueue(prev => prev.map((q, i) => i === index ? { ...q, note: 'Finishing ingestion…', ingestionStatus: ingestionJob?.status || 'processing' } : q));
        try {
          ingestionReadyJob = await waitForIngestionJobReady(orgId, docId, ingestionJob);
        } catch (ingestionError: any) {
          const message = ingestionError?.message || 'Ingestion job failed';
          console.error('Ingestion job wait error:', ingestionError);
          setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'error', note: message, locked: false } : q));
          toast({
            title: 'Ingestion failed',
            description: message,
            variant: 'destructive',
          });
          return;
        }
      }
      ingestionJob = ingestionReadyJob || ingestionJob;

      let extractionData: {
        metadata?: Record<string, any>;
        ocrText?: string;
        docling?: {
          coordinates?: any[];
          tables?: any[];
          pages?: any[];
          metadata?: any;
        };
      } | null = null;
      if (docId) {
        try {
          extractionData = await apiFetch<{
            metadata?: Record<string, any>;
            ocrText?: string;
            docling?: {
              coordinates?: any[];
              tables?: any[];
              pages?: any[];
              metadata?: any;
            };
          }>(
            `/orgs/${orgId}/documents/${docId}/extraction`,
            { skipCache: true }
          );
        } catch (extractionError) {
          console.warn('Failed to load extraction payload:', extractionError);
        }
      }

      const mergedMetadata = extractionData?.metadata
        ? { ...metadataResult, ...extractionData.metadata }
        : metadataResult;
      const finalOcrText =
        typeof extractionData?.ocrText === 'string' && extractionData.ocrText.length > 0
          ? extractionData.ocrText
          : (ocrResult.extractedText || '');

      // Use the original summary without padding extra content
      const summary = (metadataResult.summary || '').trim();

      // Prefill form for the active item
      const updatedForm = {
        title: mergedMetadata.title || item.file.name,
        filename: mergedMetadata.filename || item.file.name,
        sender: mergedMetadata.sender || '',
        receiver: mergedMetadata.receiver || '',
        documentDate: mergedMetadata.documentDate || '',
        documentType: mergedMetadata.documentType || 'General Document',
        folder: 'No folder (Root)',
        subject: mergedMetadata.subject || '',
        description: mergedMetadata.description || mergedMetadata.summary || '',
        category: mergedMetadata.category || 'General',
        keywords: (mergedMetadata.keywords || []).join(', '),
        tags: (mergedMetadata.tags || []).join(', '),
      };

      // Store multiple options for UI selection
      const senderOptions = mergedMetadata.senderOptions || metadataResult.senderOptions || [];
      const receiverOptions = mergedMetadata.receiverOptions || metadataResult.receiverOptions || [];
      console.log('Extracted sender options:', senderOptions, 'receiver options:', receiverOptions);

      // Find version candidates (same hash or similar name)
      const candidates = findVersionCandidates(item.hash, item.file.name, documents, folderPath)
        .map(d => ({
          id: d.id,
          label: `${d.title || d.name || 'Untitled'} (v${d.versionNumber || d.version || 1})`
        }));

      console.log('Found version candidates:', candidates.length, 'for file:', item.file.name, 'in folder:', folderPath);

      console.log(`Setting item ${index} status to 'ready'`);
      setQueue(prev => prev.map((q, i) => i === index ? {
        ...q,
        status: 'ready',
        extracted: {
          ocrText: finalOcrText,
          metadata: mergedMetadata,
          docling: extractionData?.docling || null,
        },
        form: updatedForm,
        locked: false,
        candidates,
        progress: 100,
        senderOptions,
        receiverOptions,
        linkMode: preferredBaseId ? 'version' : (candidates.length > 0 ? 'version' : 'new'),
        baseId: preferredBaseId || candidates[0]?.id,
        storageKey: storageKey,
        geminiFile: analyzeResp.geminiFile,
        docId,
        ingestionJob,
        ingestionStatus: ingestionJob?.status || 'needs_review',
        note: undefined,
      } : q));
      toast({ title: 'Processed', description: `${item.file.name} analyzed by AI.` });
    } catch (e) {
      clearInterval(timer);
      console.error('Upload processing error:', e);

      // Provide specific error messages based on the type of failure
      let errorMessage = 'Processing failed';
      if (e instanceof Error) {
        if (e.message.includes('Upload failed')) {
          errorMessage = 'File upload failed. Please try again.';
        } else if (e.message.includes('analyze')) {
          errorMessage = 'AI analysis failed. Please try again.';
        } else if (e.message.includes('sign')) {
          errorMessage = 'Upload preparation failed. Please try again.';
        } else {
          errorMessage = e.message;
        }
      }
      const status = (e as any)?.status;
      const planCode = (e as any)?.data?.code;
      if (status === 402 && typeof planCode === 'string' && planCode.startsWith('plan.')) {
        toast({
          title: 'Plan limit reached',
          description: (e as any)?.data?.error || 'Your plan no longer allows uploads. Please contact support.',
          variant: 'destructive',
        });
      }

      setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'error', note: errorMessage, locked: false } : q));
      toast({
        title: 'Processing failed',
        description: `${item.file.name}: ${errorMessage}`,
        variant: 'destructive'
      });
    }
  };

  async function rotateImageFileToDataUri(file: File, rotationDeg: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const radians = (rotationDeg % 360) * Math.PI / 180;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(toDataUri(file)); return; }
        const w = img.width;
        const h = img.height;
        const sin = Math.abs(Math.sin(radians));
        const cos = Math.abs(Math.cos(radians));
        canvas.width = Math.floor(w * cos + h * sin);
        canvas.height = Math.floor(w * sin + h * cos);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(radians);
        ctx.drawImage(img, -w / 2, -h / 2);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function findVersionCandidates(hash: string | undefined, filename: string, all: StoredDocument[], currentPath: string[]): StoredDocument[] {
    const byHash = hash ? all.filter(d => d.contentHash === hash) : [];
    if (byHash.length) return byHash;
    // Fallback heuristic: same base name (strip timestamps) and same folder
    const base = filename.toLowerCase().replace(/\s+/g, ' ').replace(/\d{4}-\d{2}-\d{2}.*/, '').trim();
    return all.filter(d => {
      const docPath = (d.folderPath || []).join('/');
      const currentPathStr = currentPath.join('/');
      const docName = (d.filename || d.name || '').toLowerCase();
      return docPath === currentPathStr && docName.includes(base);
    });
  }

  async function uploadToSignedUrl(signedUrl: string, file: File, retries = 3, onProgress?: (progress: number) => void) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // ✅ OPTIMIZED: Use XMLHttpRequest for progress tracking
        const response = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          // Track upload progress
          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && onProgress) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              onProgress(percentComplete);
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({ ok: true, status: xhr.status, statusText: xhr.statusText });
            } else {
              reject(new Error(`Upload failed with status: ${xhr.status} ${xhr.statusText}`));
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Upload failed'));
          });

          xhr.open('PUT', signedUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.send(file);
        });

        return; // Success
      } catch (error) {
        console.error(`Upload attempt ${attempt} failed:`, error);

        if (attempt === retries) {
          throw new Error(`Upload failed after ${retries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async function uploadFile(file: File, onProgress?: (progress: number) => void): Promise<{ storageKey: string }> {
    const orgId = getApiContext().orgId || '';

    const signResp = await apiFetch<{
      signedUrl: string;
      storageKey: string;
    }>(`/orgs/${orgId}/uploads/sign`, {
      method: 'POST',
      body: {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
      },
    });

    if (!signResp.signedUrl || !signResp.storageKey) {
      throw new Error('Failed to obtain signed upload URL');
    }

    await uploadToSignedUrl(signResp.signedUrl, file, 3, onProgress);
    return { storageKey: signResp.storageKey };
  }

  // Ensure we have a focused item when entering queue view or when items change
  useEffect(() => {
    if (queue.length > 0 && (activeIndex === null || activeIndex >= queue.length)) {
      setActiveIndex(0);
    }
    if (queue.length === 0) setActiveIndex(null);
  }, [queue.length]);

  const readyCount = useMemo(() => queue.filter(q => q.status === 'ready').length, [queue]);
  const hasSuccess = useMemo(() => queue.some(q => q.status === 'success'), [queue]);
  const hasProcessable = useMemo(() => queue.some(q => q.status === 'idle'), [queue]);
  const allSaved = useMemo(() => queue.length > 0 && queue.every(q => q.status === 'success'), [queue]);

  // Status counts for bulk upload display
  const statusCounts = useMemo(() => {
    const total = queue.length;
    const processing = queue.filter(q => q.status === 'uploading' || q.status === 'processing').length;
    const pending = queue.filter(q => q.status === 'idle' || q.status === 'ready').length;
    const completed = queue.filter(q => q.status === 'success').length;
    const errors = queue.filter(q => q.status === 'error').length;
    const saving = queue.filter(q => q.status === 'saving').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, processing, pending, completed, errors, saving, progress };
  }, [queue]);
  const hasExistingDocs = useMemo(() => documents.length > 0, [documents.length]);

  // Continue polling ingestion job status for items that are 'ready' but still processing (Vespa not done)
  useEffect(() => {
    const itemsToWatch = queue.filter(
      item => item.status === 'ready' &&
        item.docId &&
        (item.ingestionStatus === 'processing' || item.ingestionStatus === 'pending')
    );

    if (itemsToWatch.length === 0) return;

    const orgId = getApiContext().orgId;
    if (!orgId) return;

    const pollInterval = setInterval(async () => {
      for (const item of itemsToWatch) {
        if (!item.docId) continue;
        try {
          const job = await fetchIngestionJobForDoc(orgId, item.docId);
          const newStatus = job?.status?.toLowerCase() || item.ingestionStatus;

          if (newStatus !== item.ingestionStatus) {
            setQueue(prev => prev.map(q =>
              q.docId === item.docId
                ? { ...q, ingestionStatus: newStatus, note: newStatus === 'needs_review' ? undefined : q.note }
                : q
            ));
          }
        } catch (err) {
          console.warn('Failed to poll ingestion status for', item.docId, err);
        }
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [queue.map(q => `${q.docId}|${q.status}|${q.ingestionStatus}`).join(',')]); // Re-run when queue items change


  const resetLocalState = () => {
    setQueue([]);
    setActiveIndex(null);
    setExtracted(null);
    setLastBulkSummary(null);
    setSkipDetails(null);
    setShowAllSkipped(false);
    setRecentSavePath(null);
    inputRef.current && (inputRef.current.value = '');
  };

  const clearAll = async () => {
    if (isClearingAll) return;

    const snapshot = queue.slice();
    const orgId = getApiContext().orgId || '';
    if (!orgId) {
      resetLocalState();
      return;
    }

    // If items have no docId, they're local-only and safe to discard immediately.
    const serverCandidates = snapshot.filter((q) => !!q.docId && q.status !== 'success');
    if (serverCandidates.length === 0) {
      resetLocalState();
      return;
    }

    setIsClearingAll(true);
    try {
      // Mark UI as busy so we don't allow interacting while discard is running.
      setQueue((prev) =>
        prev.map((q) =>
          q.status === 'success'
            ? q
            : { ...q, locked: true, note: q.docId ? 'Discarding…' : q.note }
        )
      );

      const results = await Promise.all(
        serverCandidates.map(async (item) => {
          const docId = item.docId as string;
          // Best-effort cleanup strategy:
          // 1) Try draft delete (cleans storage_key + extraction + usage for drafts).
          // 2) If not a draft, and ingestion job is rejectable, try reject (handles Vespa when enabled).
          try {
            await apiFetch(`/orgs/${orgId}/documents/${docId}/draft`, { method: 'DELETE' });
            return { docId, ok: true as const };
          } catch (err: any) {
            const status = err?.status || err?.statusCode || err?.data?.statusCode;
            // Only proceed to reject on expected "not a draft" or forbidden cases.
            if (status && status !== 404 && status !== 403) {
              return { docId, ok: false as const, error: err?.message || 'Draft delete failed' };
            }
          }

          const isRejectable = item.ingestionStatus === 'needs_review' || item.ingestionStatus === 'failed';
          if (!isRejectable) {
            return { docId, ok: false as const, error: 'Not discardable (job still running). Try again later.' };
          }

          try {
            await apiFetch(`/orgs/${orgId}/ingestion-jobs/${docId}/reject`, {
              method: 'POST',
              body: { reason: 'Discarded (Discard all)' },
            });
            return { docId, ok: true as const };
          } catch (err: any) {
            return { docId, ok: false as const, error: err?.message || 'Reject failed' };
          }
        })
      );

      const okIds = new Set(results.filter((r) => r.ok).map((r) => r.docId));
      const failed = results.filter((r) => !r.ok);

      // Remove cleaned items (and any local-only items). Keep failed ones so user can retry.
      const remaining = snapshot
        .filter((q) => q.status !== 'success')
        .filter((q) => {
          if (!q.docId) return false; // local-only: always remove
          return !okIds.has(q.docId);
        })
        .map((q) => {
          const r = failed.find((f) => f.docId === q.docId);
          return {
            ...q,
            locked: false,
            status: 'error' as const,
            note: r?.error || 'Discard failed. Try again.',
          };
        });

      if (remaining.length === 0) {
        toast({
          title: 'Discarded',
          description: `Discarded ${okIds.size} item(s).`,
        });
        resetLocalState();
        return;
      }

      toast({
        title: 'Partial discard',
        description: `Discarded ${okIds.size} item(s). ${remaining.length} item(s) could not be discarded.`,
        variant: 'destructive',
      });

      setQueue(remaining);
      setActiveIndex(0);
      setExtracted(null);
      setLastBulkSummary(null);
      setSkipDetails(null);
      setShowAllSkipped(false);
      setRecentSavePath(null);
    } finally {
      setIsClearingAll(false);
    }
  };

  const onDone = async (index: number): Promise<{ path: string[]; hasMoreReady: boolean } | null> => {
    const item = queue[index];
    if (!item || !item.extracted || !item.form || item.status === 'success' || item.locked) return null;
    if (planBlocked) {
      toast({
        title: 'Plan limit reached',
        description: planBlockingMessage || 'Please contact support to continue.',
        variant: 'destructive',
      });
      return null;
    }

    if (isAdmin && folderPath.length === 0 && !selectedDepartmentId) {
      toast({
        title: 'Department selection required',
        description: 'Please select a department before uploading documents.',
        variant: 'destructive'
      });
      return null;
    }

    const currentFolderPath = folderPath.slice();
    const targetFolderPath = item.folderPathOverride && item.folderPathOverride.length > 0
      ? item.folderPathOverride
      : currentFolderPath;

    setQueue(prev => prev.map((q, i) => i === index ? { ...q, locked: true, status: 'saving', note: 'Saving…' } : q));

    try {
      const summary = (item.extracted.metadata.summary || '').trim();
      const keywordsArray = (item.form.keywords || '')
        .split(',')
        .map((k: string) => k.trim())
        .filter(Boolean);
      const tagsArray = (item.form.tags || '')
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean);

      const docTitle = item.form.title || item.extracted.metadata.title || item.file.name;

      if (!docTitle) {
        toast({
          title: 'Missing required fields',
          description: 'Title is required. Please fill it before saving.',
          variant: 'destructive'
        });
        setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'ready', locked: false } : q));
        return null;
      }

      if (!item.docId) {
        toast({
          title: 'Draft missing',
          description: 'Please re-process this file before saving.',
          variant: 'destructive'
        });
        setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'ready', locked: false } : q));
        return null;
      }

      // Folder structure is pre-created by saveAllReady (or by the caller for single saves)
      // No per-document folder creation needed here.

      if (item.linkMode === 'version' && !item.baseId) {
        toast({
          title: 'Version linking error',
          description: 'Please select a document to link this as a new version, or choose "New Document".',
          variant: 'destructive'
        });
        setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'ready', locked: false } : q));
        return null;
      }

      const finalKeywords = (keywordsArray.length ? keywordsArray : (item.extracted.metadata.keywords || [])).filter(Boolean);
      const finalTags = (tagsArray.length ? tagsArray : (item.extracted.metadata.tags || [])).filter(Boolean);
      const docSubject = item.form.subject || item.extracted.metadata.subject || (item.extracted.metadata.title || '');
      const docDescription = item.form.description || item.extracted.metadata.description || summary;
      const documentDateValue = item.form.documentDate || item.extracted.metadata.documentDate || '';

      const versionDraft = {
        title: docTitle,
        filename: item.form.filename || item.file.name,
        type: docType,
        folderPath: [...targetFolderPath],
        subject: docSubject,
        description: docDescription,
        category: item.form.category || item.extracted.metadata.category,
        tags: finalTags,
        keywords: finalKeywords,
        sender: item.form.sender || item.extracted.metadata.sender,
        receiver: item.form.receiver || item.extracted.metadata.receiver,
        documentDate: documentDateValue,
        departmentId: selectedDepartmentId || undefined,
        additionalDepartmentIds: effectiveAdditionalDepartmentIds,
        isDraft: false,
      };

      const patchPayload: any = {
        title: versionDraft.title,
        filename: versionDraft.filename,
        type: versionDraft.type,
        folder_path: targetFolderPath,
        subject: versionDraft.subject,
        description: versionDraft.description,
        category: versionDraft.category,
        tags: versionDraft.tags,
        keywords: versionDraft.keywords,
        sender: versionDraft.sender,
        receiver: versionDraft.receiver,
        document_date: documentDateValue,
        department_id: selectedDepartmentId || null,
        additionalDepartmentIds: effectiveAdditionalDepartmentIds,
        is_draft: false,
      };

      let savedDoc: StoredDocument | null = null;
      const orgId = getApiContext().orgId || '';
      if (!orgId) throw new Error('No organization set');

      if (item.linkMode === 'version' && item.baseId) {
        console.log('🔍 Linking existing draft to version group:', item.baseId);
        const created = await apiFetch<StoredDocument>(`/orgs/${orgId}/documents/${item.baseId}/version`, {
          method: 'POST',
          body: { draft: versionDraft, draftId: item.docId },
        });
        savedDoc = created;
      } else {
        console.log('🔍 Finalizing draft document:', item.docId);
        const updated = await apiFetch<StoredDocument>(`/orgs/${orgId}/documents/${item.docId}`, {
          method: 'PATCH',
          body: patchPayload,
        });
        savedDoc = updated;
      }

      try {
        await apiFetch(`/orgs/${orgId}/documents/${item.docId}/extraction`, {
          method: 'POST',
          body: { ocrText: item.extracted?.ocrText || '', metadata: item.extracted?.metadata || {} },
        });
      } catch (extractionError) {
        console.warn('Failed to save extraction data (non-critical):', extractionError);
      }

      // ── Optimistically accept the ingestion job (no polling) ──
      // If the job is still processing, the API returns 409 — we surface it
      // as a soft "still indexing" note on the item rather than blocking.
      try {
        await apiFetch(`/orgs/${orgId}/ingestion-jobs/${item.docId}/accept`, {
          method: 'POST',
          body: {},
        });
      } catch (acceptError: any) {
        if (acceptError?.status === 409) {
          // Job not yet in needs_review — mark saved anyway, worker will finish
          console.warn('Accept 409: job still processing, marking saved optimistically');
        } else if (acceptError?.status !== 404 && acceptError?.status !== 403) {
          console.warn('Failed to mark ingestion job accepted:', acceptError);
        }
      }

      let nextQueueSnapshot: typeof queue = [];
      setQueue(prev => {
        nextQueueSnapshot = prev.map((q, i) => i === index ? { ...q, status: 'success', locked: true, note: 'Saved' } : q);
        return nextQueueSnapshot;
      });
      // loadAllDocuments is deferred to once after all saves complete in saveAllReady
      // (for single saves via handleSave, we call it explicitly below)

      const remainingReady = nextQueueSnapshot.some(q => q.status === 'ready' && !q.locked);
      const effectivePath = Array.isArray(savedDoc?.folderPath) && savedDoc.folderPath.length > 0
        ? savedDoc.folderPath.filter(Boolean)
        : targetFolderPath.filter(Boolean);

      return { path: effectivePath, hasMoreReady: remainingReady };
    } catch (error) {
      console.error('Document save error:', error);
      setQueue(prev => prev.map((q, i) => i === index ? { ...q, status: 'error', note: 'Save failed', locked: false } : q));
      const status = (error as any)?.status;
      const planCode = (error as any)?.data?.code;
      if (status === 402 && typeof planCode === 'string' && planCode.startsWith('plan.')) {
        toast({
          title: 'Plan limit reached',
          description: (error as any)?.data?.error || 'Your plan no longer allows uploads. Please contact support.',
          variant: 'destructive',
        });
      }
      toast({
        title: 'Save Failed',
        description: `Failed to save ${item.file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive'
      });
      return null;
    }
  };

  // Check if user has permission to create documents
  // Use the hasAccess check from above (which includes page permission and functional permission)

  // Show access restricted message if user doesn't have upload permission
  if (!hasAccess) {
    return (
      <AppLayout>
        <AccessDenied
          title="Upload Permission Required"
          message="You don't have permission to upload documents. Please contact your administrator if you believe this is an error."
          backHref="/documents"
          backLabel="Back to Documents"
          icon={<UploadCloud className="h-8 w-8 text-muted-foreground" />}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-4 md:space-y-6">
        {planBlocked && (
          <Alert variant="destructive" className="mx-1 sm:mx-4 md:mx-6">
            <AlertTitle className="text-sm sm:text-base">{planExpired ? 'Plan expired' : 'Storage limit reached'}</AlertTitle>
            <AlertDescription className="text-xs sm:text-sm">
              {planBlockingMessage} <a className="underline" href={SUPPORT_CONTACT}>Contact support</a> to continue.
              {planLimitBytes > 0 && (
                <div className="mt-3">
                  <Progress value={planUsagePercent * 100} />
                  <p className="text-xs text-muted-foreground mt-1">
                    {safeFormatBytes(planUsageBytes)} / {safeFormatBytes(planLimitBytes)} used
                  </p>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
        {!planBlocked && planGraceMessage && (
          <Alert className="border-yellow-400/70 bg-yellow-50 text-yellow-900 mx-1 sm:mx-4 md:mx-6">
            <AlertTitle className="text-sm sm:text-base">Plan term reached</AlertTitle>
            <AlertDescription className="text-xs sm:text-sm">
              {planGraceMessage} <a className="underline" href={SUPPORT_CONTACT}>Contact support</a>.
            </AlertDescription>
          </Alert>
        )}
        {/* Header - Linear style */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-4 sm:px-6 py-3 sm:py-4">
            <div className="max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(cameFromQueue ? '/queue' : '/documents')}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground flex-shrink-0"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                    <UploadCloud className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-semibold text-foreground truncate">
                      {cameFromQueue
                        ? "Review Document"
                        : folderPath.length
                          ? `Upload to /${folderPath.join('/')}`
                          : "Upload Documents"}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                      {cameFromQueue
                        ? "Review and save this document from the ingestion queue."
                        : folderPath.length
                          ? `Add files to the ${folderPath[folderPath.length - 1]} folder.`
                          : "Add files and we'll analyze them for you."
                      }
                    </p>
                  </div>
                </div>
                {departments.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                    <span className="text-xs text-muted-foreground font-medium hidden sm:inline">Team</span>
                    <UiSelect value={selectedDepartmentId || undefined as any} onValueChange={(v) => setSelectedDepartmentId(v)}>
                      <UiSelectTrigger className="w-full sm:w-[180px] h-8 text-sm bg-muted/30 border-border/40">
                        <UiSelectValue placeholder="Select team" />
                      </UiSelectTrigger>
                      <UiSelectContent>
                        {departments.map(d => (<UiSelectItem key={d.id} value={d.id}>{d.name}</UiSelectItem>))}
                      </UiSelectContent>
                    </UiSelect>
                    {canShareDocuments && departments.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setShareTeamsOpen(true)}
                      >
                        Share with teams
                        {effectiveAdditionalDepartmentIds.length > 0 && (
                          <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {effectiveAdditionalDepartmentIds.length}
                          </span>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        {!hasCreatePermission && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:p-4 mx-1 sm:mx-4 md:mx-6">
            <div className="font-semibold text-destructive text-sm sm:text-base">Uploading is restricted</div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Your role does not include upload permissions. Please contact an administrator to request <span className="font-medium">Content Manager</span> access or share files with someone who can upload on your behalf.</p>
          </div>
        )}

        {hasCreatePermission && queue.length === 0 && (
          <div className="px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
              <div
                role="button"
                tabIndex={0}
                aria-describedby="upload-help"
                className={cn(
                  "relative rounded-2xl border-2 border-dashed text-center p-8 sm:p-12 md:p-16",
                  "transition-all duration-300 cursor-pointer",
                  "bg-gradient-to-br from-muted/5 via-background to-muted/10",
                  dragOver
                    ? "border-primary bg-primary/5 scale-[1.02] shadow-lg shadow-primary/5"
                    : "border-border/40 hover:border-primary/50 hover:shadow-md hover:shadow-primary/5"
                )}
                onClick={onBrowse}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onBrowse(); }}
                onDragEnter={() => setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDrop={(e) => { setDragOver(false); onDrop(e); }}
              >
                {/* Animated upload icon */}
                <div className="mb-8">
                  <div className={cn(
                    "flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-2xl mx-auto",
                    "bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20",
                    "transition-transform duration-300",
                    dragOver && "scale-110"
                  )}>
                    <UploadCloud className={cn(
                      "h-10 w-10 sm:h-12 sm:w-12 text-primary transition-transform duration-300",
                      dragOver && "animate-bounce"
                    )} />
                  </div>
                </div>

                {/* Main messaging */}
                <div className="space-y-3 mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
                    {dragOver ? 'Drop to upload' : 'Drag & drop files here'}
                  </h2>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    or <span className="text-primary font-medium">click to browse</span> your computer
                  </p>
                </div>

                {/* Supported file types */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
                  {[
                    { type: 'PDF', color: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30' },
                    { type: 'TXT', color: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30' },
                    { type: 'MD', color: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30' },
                    { type: 'CSV', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
                    { type: 'XLS', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
                    { type: 'XLSX', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
                    { type: 'JPG', color: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30' },
                    { type: 'PNG', color: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30' },
                    { type: 'DOCX', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' },
                    { type: 'DWG', color: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30' },
                  ].map(({ type, color }) => (
                    <span key={type} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${color}`}>
                      {type}
                    </span>
                  ))}
                </div>

                {/* Helper text */}
                <div id="upload-help" className="space-y-2">
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                    <Database className="h-3 w-3" />
                    AI-powered metadata extraction & summary generation
                  </p>
                  <p className="text-xs text-muted-foreground/70 hidden sm:block">
                    Supports ZIP archives and folder uploads for batch processing
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".pdf,.txt,.md,.markdown,.jpg,.jpeg,.png,.csv,.xls,.xlsx,.docx,.doc,.dwg,.dxf"
                    className="hidden"
                    onChange={(e) => e.target.files && onSelect(e.target.files)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    onClick={(e) => { e.stopPropagation(); onBrowse(); }}
                    className="gap-2"
                  >
                    <UploadCloud className="h-4 w-4" />
                    Browse Files
                  </Button>
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={handleZipInputChange}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={(e) => { e.stopPropagation(); zipInputRef.current?.click(); }}
                  >
                    <UploadCloud className="h-4 w-4" />
                    Upload ZIP
                  </Button>
                  <input
                    ref={(el) => {
                      folderInputRef.current = el;
                      if (el) {
                        el.setAttribute('webkitdirectory', 'true');
                        el.setAttribute('directory', 'true');
                        el.multiple = true;
                      }
                    }}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFolderInputChange}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Upload Folder
                  </Button>
                </div>
                <p className="mt-6 text-xs text-muted-foreground">
                  Supports up to {BULK_UPLOAD_LIMIT} files per bulk upload (PDF, TXT/MD, CSV/XLS/XLSX, JPG, PNG, DOCX, DWG). Individual files must be under {BULK_UPLOAD_MAX_FILE_MB}MB.
                </p>
                {/* Upload Status Summary */}
                {queue.length > 0 && (
                  <div className="mt-4 w-full rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Upload Progress</h3>
                        <Badge variant="outline" className="text-xs">
                          {statusCounts.total} file{statusCounts.total !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <div className="text-xs font-medium text-muted-foreground">
                        {statusCounts.progress}% Complete
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full">
                      <Progress value={statusCounts.progress} className="h-2" />
                    </div>

                    {/* Status Breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-foreground">{statusCounts.processing + statusCounts.saving}</span>
                          <span className="text-[10px] text-muted-foreground">Processing</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-amber-500" />
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-foreground">{statusCounts.pending}</span>
                          <span className="text-[10px] text-muted-foreground">Pending</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-foreground">{statusCounts.completed}</span>
                          <span className="text-[10px] text-muted-foreground">Completed</span>
                        </div>
                      </div>
                      {statusCounts.errors > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-red-500" />
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-foreground">{statusCounts.errors}</span>
                            <span className="text-[10px] text-muted-foreground">Errors</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(lastBulkSummary || skipDetails) && (
                  <div className="mt-4 w-full rounded-md border bg-muted/30 p-3 text-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-foreground">
                        {lastBulkSummary
                          ? `Queued ${lastBulkSummary.count} file${lastBulkSummary.count === 1 ? '' : 's'} to /${lastBulkSummary.path.length ? lastBulkSummary.path.join('/') : 'Root'}`
                          : 'Upload summary'}
                      </div>
                      <div className="flex items-center gap-2">
                        {lastBulkSummary && (
                          <Button size="sm" variant="outline" onClick={() => navigateToFolder(lastBulkSummary.path)}>
                            View folder
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={handleClearBulkSummary}>
                          Dismiss
                        </Button>
                      </div>
                    </div>
                    {skipDetails && skipDetails.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-destructive">Skipped {skipDetails.length} file{skipDetails.length === 1 ? '' : 's'}</div>
                          {skipDetails.length > 5 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowAllSkipped((prev) => !prev)}
                            >
                              {showAllSkipped ? 'Show less' : 'Show all'}
                            </Button>
                          )}
                        </div>
                        <ul className="list-disc pl-5 space-y-1 text-destructive/90">
                          {(showAllSkipped ? skipDetails : skipDetails.slice(0, 5)).map((item, idx) => (
                            <li key={`${item.path}-${idx}`}>{item.path}: {item.reason}</li>
                          ))}
                          {!showAllSkipped && skipDetails.length > 5 && (
                            <li className="text-muted-foreground">…and {skipDetails.length - 5} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                    {!skipDetails && lastBulkSummary && (
                      <div className="text-muted-foreground">
                        Review each file below to add metadata before saving.
                      </div>
                    )}
                  </div>
                )}
                {recentSavePath && (
                  <div className="mt-4 w-full rounded-md border bg-muted/30 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="text-foreground">
                      Recently saved to{' '}
                      <span className="font-medium">
                        /{recentSavePath.length ? recentSavePath.join('/') : 'Root'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigateToFolder(recentSavePath);
                          setRecentSavePath(null);
                        }}
                      >
                        View folder
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRecentSavePath(null)}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {hasCreatePermission && queue.length > 0 && (() => {
          // Check if this is a single document review from the queue
          const isSingleDocFromQueue = queue.length === 1 && queue[0]?.prefilledFromQueue;
          return (
            <>
              <div className="px-4 sm:px-6">
                <div className="max-w-6xl mx-auto">
                  {/* Queue Content */}
                  <div className="space-y-4">
                    {typeof activeIndex === 'number' && queue[activeIndex] ? (
                      <div
                        className={cn(
                          "grid grid-cols-1 gap-4",
                          queue.length > 1 && "lg:grid-cols-[280px_1fr]"
                        )}
                      >
                        {/* Left rail: file navigator (when multiple files) */}
                        {queue.length > 1 && (
                          <aside className="lg:sticky lg:top-28 h-fit">
                            <div className="pr-4">
                              <div className="px-3 py-2 mb-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Files
                                  </div>
                                  <div className="text-xs text-muted-foreground tabular-nums">
                                    {activeIndex + 1}/{queue.length}
                                  </div>
                                </div>
                              </div>
                              <div className="max-h-[520px] overflow-y-auto space-y-0.5">
                                {queue.map((q, idx) => {
                                  const isActive = idx === activeIndex;
                                  const isBusy = q.status === 'processing' || q.status === 'uploading' || q.status === 'saving';
                                  return (
                                    <button
                                      key={`${q.file.name}-${idx}`}
                                      type="button"
                                      onClick={() => setActiveIndex(idx)}
                                      className={cn(
                                        "w-full text-left px-3 py-2 rounded-md transition-colors",
                                        "hover:bg-muted/30",
                                        isActive && "bg-primary/5"
                                      )}
                                    >
                                      <div className="flex items-start gap-2.5">
                                        <div className={cn(
                                          "mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border",
                                          q.status === 'ready' && "bg-primary/10 border-primary/20",
                                          q.status === 'success' && "bg-emerald-500/10 border-emerald-500/20",
                                          q.status === 'error' && "bg-red-500/10 border-red-500/20",
                                          (q.status === 'processing' || q.status === 'uploading') && "bg-purple-500/10 border-purple-500/20",
                                          q.status === 'saving' && "bg-blue-500/10 border-blue-500/20",
                                          q.status === 'idle' && "bg-muted/30 border-border/40"
                                        )}>
                                          {isBusy ? (
                                            <Loader2 className="h-3.5 w-3.5 text-muted-foreground" />
                                          ) : (
                                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className={cn(
                                              "truncate text-[13px] font-medium",
                                              isActive ? "text-foreground" : "text-foreground/80"
                                            )}>
                                              {q.form?.title || q.file.name}
                                            </div>
                                          </div>
                                          <div className="mt-1">
                                            <StatusBadge status={q.status} note={q.note} ingestionStatus={q.ingestionStatus} />
                                          </div>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                              {/* Bottom actions - fixed at bottom of sidebar */}
                              <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                                <div className="flex items-center justify-end gap-2">
                                  {!allSaved && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => void clearAll()}
                                      disabled={isClearingAll}
                                      className="h-7 text-xs gap-1.5"
                                    >
                                      {isClearingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                      <span>Discard all</span>
                                    </Button>
                                  )}
                                  {hasProcessable && queue.length > 1 && (
                                    <Button
                                      size="sm"
                                      onClick={async () => {
                                        setIsProcessingAll(true);
                                        try {
                                          const indicesToProcess = queue.map((q, i) => (q.status === 'idle' || q.status === 'error') ? i : -1).filter(i => i >= 0);

                                          // Process files in parallel batches for better performance
                                          const BATCH_SIZE = 10; // Process 10 files simultaneously (max allowed)
                                          const batches = [];
                                          for (let i = 0; i < indicesToProcess.length; i += BATCH_SIZE) {
                                            batches.push(indicesToProcess.slice(i, i + BATCH_SIZE));
                                          }

                                          for (const batch of batches) {
                                            // Process each batch in parallel
                                            await Promise.allSettled(
                                              batch.map(i => processItem(i).catch(error => {
                                                console.error(`Failed to process item ${i}:`, error);
                                                // Update queue to show error status
                                                setQueue(prev => prev.map((q, idx) =>
                                                  idx === i ? { ...q, status: 'error', note: error.message } : q
                                                ));
                                              }))
                                            );

                                            // Small delay between batches to prevent overwhelming the system
                                            if (batches.indexOf(batch) < batches.length - 1) {
                                              await new Promise(resolve => setTimeout(resolve, 1000));
                                            }
                                          }
                                        } finally {
                                          setIsProcessingAll(false);
                                        }
                                      }}
                                      disabled={isProcessingAll || planBlocked}
                                      className="h-7 gap-1.5 text-xs"
                                    >
                                      {isProcessingAll ? (
                                        <>
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                          <span>Processing…</span>
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="h-3 w-3" />
                                          <span>Process All</span>
                                        </>
                                      )}
                                    </Button>
                                  )}
                                  {readyCount > 0 && (
                                    <Button
                                      size="sm"
                                      onClick={saveAllReady}
                                      disabled={isSavingAll || planBlocked}
                                      className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                                    >
                                      {isSavingAll ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Save className="h-3 w-3" />
                                      )}
                                      <span>Save All</span>
                                    </Button>
                                  )}
                                </div>
                                {(hasSuccess || readyCount > 0) && (
                                  <div className="flex items-center justify-end gap-3 text-[10px] text-muted-foreground">
                                    {hasSuccess && <span>Saved: {queue.filter(q => q.status === 'success').length}</span>}
                                    {readyCount > 0 && <span>Ready: {readyCount}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          </aside>
                        )}

                        {/* Right: active file editor */}
                        {(() => {
                          const item = queue[activeIndex]!;
                          const i = activeIndex!;
                          const targetFolderPath = item.folderPathOverride && item.folderPathOverride.length > 0
                            ? item.folderPathOverride
                            : folderPath;
                          const shouldUseRemotePreview = Boolean(item.docId) && (
                            !item.previewUrl ||
                            item.prefilledFromQueue ||
                            isExcelFile(item.file)
                          );
                          const useLocalTabularPreview = !shouldUseRemotePreview && (isCsvFile(item.file) || isXlsxFile(item.file));

                          return (
                            <div className="space-y-6">
                              {/* Header with file info and actions */}
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-border/30">
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 shrink-0">
                                    <FileText className="h-5 w-5 text-primary" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h3 className="truncate font-semibold text-base sm:text-lg max-w-[280px] sm:max-w-[400px] md:max-w-[500px]" title={item.file.name}>
                                        {item.form?.title || item.file.name}
                                      </h3>
                                      <StatusBadge status={item.status} note={item.note} ingestionStatus={item.ingestionStatus} />
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <FolderOpen className="h-3 w-3" />
                                        <span className="truncate max-w-[200px]" title={`/${targetFolderPath.length ? targetFolderPath.join('/') : 'Root'}`}>
                                          /{targetFolderPath.length ? targetFolderPath.join('/') : 'Root'}
                                        </span>
                                      </span>
                                      {item.file.size > 0 && (
                                        <>
                                          <span className="text-border">•</span>
                                          <span>{(item.file.size / 1024).toFixed(1)} KB</span>
                                        </>
                                      )}
                                    </div>
                                    {/* Progress bar for non-ready states */}
                                    {item.status !== 'ready' && item.status !== 'success' && item.status !== 'error' && (
                                      <div className="mt-2 max-w-xs">
                                        <Progress value={item.progress} className="h-1.5" />
                                        {item.note && (
                                          <span className="text-[10px] text-muted-foreground mt-1 block">{item.note}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                  {item.status === 'idle' && !isProcessingAll && (
                                    <Button
                                      size="sm"
                                      onClick={() => processItem(i)}
                                      disabled={planBlocked || !!item.locked}
                                      className="gap-1.5"
                                    >
                                      <Sparkles className="h-3.5 w-3.5" />
                                      Analyze
                                    </Button>
                                  )}
                                  {item.status === 'ready' && (
                                    <>
                                      {!(item.prefilledFromQueue && item.note) && (
                                        <Button
                                          size="sm"
                                          onClick={() => handleSave(i)}
                                          disabled={planBlocked || item.locked}
                                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                        >
                                          {(item.ingestionStatus === 'processing' || item.ingestionStatus === 'pending') ? (
                                            <>
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              Indexing...
                                            </>
                                          ) : (
                                            <>
                                              <Save className="h-3.5 w-3.5" />
                                              Save
                                            </>
                                          )}
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleReject(i)}
                                        disabled={item.locked}
                                        className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                        Reject
                                      </Button>
                                    </>
                                  )}
                                  {item.status === 'saving' && (
                                    <Button size="sm" variant="outline" disabled className="gap-1.5">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      {item.note || 'Saving…'}
                                    </Button>
                                  )}
                                  {item.status === 'error' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => void removeQueueItem(i)}
                                      className="gap-1.5"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                      Remove
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {/* Master detail: Metadata + Preview */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                                {/* Left: metadata editor */}
                                <div className="space-y-4">
                                  {item.status === 'ready' && item.form && (
                                    <div className="space-y-4">
                                      {/* Save mode */}
                                      <div className="space-y-2">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                          Save mode
                                        </div>
                                        <div className="mt-2">
                                          <RadioGroup
                                            value={item.linkMode}
                                            onValueChange={(v) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, linkMode: v as any, baseId: v === 'new' ? undefined : q.baseId } : q))}
                                            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6"
                                          >
                                            <label className="flex items-center gap-2 text-sm">
                                              <RadioGroupItem value="new" />
                                              <span className="font-medium">New document</span>
                                            </label>
                                            <label className={cn("flex items-center gap-2 text-sm", !hasExistingDocs && "opacity-60")}>
                                              <RadioGroupItem value="version" disabled={!hasExistingDocs} />
                                              <span className="font-medium">Link as new version</span>
                                            </label>
                                          </RadioGroup>

                                          {item.linkMode === 'version' && hasExistingDocs && (
                                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                              {(() => {
                                                const baseDoc = item.baseId ? documents.find(d => d.id === item.baseId) : undefined;
                                                const title = baseDoc?.title || baseDoc?.name || 'Selected document';
                                                const basePath = ((baseDoc as any)?.folderPath || (baseDoc as any)?.folder_path || []) as string[];
                                                const baseVer = (baseDoc as any)?.versionNumber || (baseDoc as any)?.version || 1;

                                                return (
                                                  <>
                                                    <div className={cn(
                                                      "flex-1 rounded-lg border bg-muted/20 px-3 py-2 min-w-0",
                                                      !item.baseId && "border-dashed bg-transparent"
                                                    )}>
                                                      {item.baseId ? (
                                                        <div className="flex items-center justify-between gap-2">
                                                          <div className="min-w-0">
                                                            <div className="text-sm font-medium truncate">{title}</div>
                                                            <div className="text-[11px] text-muted-foreground/70 truncate">
                                                              /{basePath.length ? basePath.join('/') : 'Root'} • v{baseVer}
                                                            </div>
                                                          </div>
                                                          <Badge variant="secondary" className="shrink-0 text-[10px]">Version</Badge>
                                                        </div>
                                                      ) : (
                                                        <div className="text-sm text-muted-foreground">
                                                          Select a base document to link into.
                                                        </div>
                                                      )}
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                      <Button size="sm" variant="outline" onClick={() => setPickerOpenIndex(i)}>
                                                        {item.baseId ? 'Change…' : 'Select…'}
                                                      </Button>
                                                      {item.baseId && (
                                                        <Button
                                                          size="sm"
                                                          variant="ghost"
                                                          className="text-muted-foreground hover:text-foreground"
                                                          onClick={() => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, baseId: undefined } : q))}
                                                        >
                                                          Remove
                                                        </Button>
                                                      )}
                                                    </div>
                                                  </>
                                                );
                                              })()}
                                            </div>
                                          )}

                                          {!hasExistingDocs && (
                                            <div className="mt-2 text-xs text-muted-foreground">
                                              No documents available yet to link as a version.
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Basics */}
                                      <div className="space-y-3 pt-4 border-t border-border/30">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                          Basics
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          <div>
                                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                              <FileText className="h-3.5 w-3.5" />
                                              Title
                                            </label>
                                            <input
                                              className="mt-1.5 h-9 rounded-md border border-border/60 bg-background px-3 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all w-full"
                                              value={item.form.title}
                                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, title: e.target.value } } : q))}
                                            />
                                          </div>
                                          <div>
                                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                              <FileText className="h-3.5 w-3.5" />
                                              Filename
                                            </label>
                                            <input
                                              className="mt-1.5 h-9 rounded-md border border-border/60 bg-background px-3 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all w-full"
                                              value={item.form.filename}
                                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, filename: e.target.value } } : q))}
                                            />
                                          </div>
                                          <div className="md:col-span-2">
                                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                              <MessageSquare className="h-3.5 w-3.5" />
                                              Subject
                                            </label>
                                            <input
                                              className="mt-1.5 h-9 rounded-md border border-border/60 bg-background px-3 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all w-full"
                                              value={item.form.subject}
                                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, subject: e.target.value } } : q))}
                                            />
                                          </div>
                                        </div>
                                      </div>

                                      {/* People & date */}
                                      <div className="space-y-3 pt-4 border-t border-border/30">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                          People & date
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          <div>
                                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                              <User className="h-3.5 w-3.5" />
                                              Sender
                                            </label>
                                            <input
                                              className="mt-1.5 h-9 rounded-md border border-border/60 bg-background px-3 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all w-full"
                                              value={item.form.sender}
                                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, sender: e.target.value } } : q))}
                                            />
                                          </div>
                                          <div>
                                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                              <UserCheck className="h-3.5 w-3.5" />
                                              Receiver
                                            </label>
                                            <input
                                              className="mt-1.5 h-9 rounded-md border border-border/60 bg-background px-3 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all w-full"
                                              value={item.form.receiver}
                                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, receiver: e.target.value } } : q))}
                                            />
                                          </div>
                                          <div>
                                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                              <Calendar className="h-3.5 w-3.5" />
                                              Document date
                                            </label>
                                            <input
                                              className="mt-1.5 h-9 rounded-md border border-border/60 bg-background px-3 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all w-full"
                                              value={item.form.documentDate}
                                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, documentDate: e.target.value } } : q))}
                                            />
                                          </div>
                                        </div>
                                      </div>

                                      {/* AI summary */}
                                      <div className="space-y-2 pt-4 border-t border-border/30">
                                        <div className="flex items-center justify-between">
                                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                            AI summary
                                          </div>
                                          <span className="text-[11px] text-muted-foreground/70">Editable</span>
                                        </div>
                                        <textarea
                                          rows={8}
                                          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                                          value={item.form.description}
                                          onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, description: e.target.value } } : q))}
                                        />
                                      </div>

                                      {/* Classification */}
                                      <div className="space-y-3 pt-4 border-t border-border/30">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                          Classification
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          <div>
                                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                              <Bookmark className="h-3.5 w-3.5" />
                                              Category
                                            </label>
                                            <UiSelect
                                              value={item.form?.category || 'General'}
                                              onValueChange={(value) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, category: value } } : q))}
                                            >
                                              <UiSelectTrigger className="mt-1.5 w-full h-9 text-sm bg-muted/30 border-border/40">
                                                <UiSelectValue placeholder="Select category..." />
                                              </UiSelectTrigger>
                                              <UiSelectContent>
                                                {availableCategories.map((category) => (
                                                  <UiSelectItem key={category} value={category}>
                                                    {category}
                                                  </UiSelectItem>
                                                ))}
                                              </UiSelectContent>
                                            </UiSelect>
                                          </div>
                                          <div>
                                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                              <Hash className="h-3.5 w-3.5" />
                                              Keywords (comma)
                                            </label>
                                            <input
                                              className="mt-1.5 h-9 rounded-md border border-border/60 bg-background px-3 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all w-full"
                                              value={item.form.keywords}
                                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, keywords: e.target.value } } : q))}
                                            />
                                          </div>
                                          <div className="md:col-span-2">
                                            <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                              <Tag className="h-3.5 w-3.5" />
                                              Tags (comma)
                                            </label>
                                            <input
                                              className="mt-1.5 h-9 rounded-md border border-border/60 bg-background px-3 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all w-full"
                                              placeholder="tag1, tag2, tag3"
                                              value={item.form.tags}
                                              onChange={(e) => setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, form: { ...q.form!, tags: e.target.value } } : q))}
                                            />
                                          </div>
                                        </div>
                                      </div>

                                      {/* Destination */}
                                      <div className="space-y-2 pt-4 border-t border-border/30">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                          Destination
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <input
                                            className="flex-1 h-9 rounded-md border border-border/60 bg-background px-3 text-sm"
                                            value={`/${folderPath.join('/')}`}
                                            readOnly
                                          />
                                          <Button variant="outline" size="sm" onClick={() => setFolderCommandOpen(true)} className="h-9">
                                            Browse…
                                          </Button>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                          Uploading to <span className="font-medium">/{folderPath.join('/') || 'Root'}</span>.
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Right: preview */}
                                <div className="lg:sticky lg:top-24 lg:h-fit lg:self-start space-y-4">
                                  <ScanningDocumentPreview
                                    isScanning={item.status === 'processing' || item.status === 'uploading'}
                                    status={item.status}
                                  >
                                    {shouldUseRemotePreview ? (
                                      <FilePreview
                                        documentId={item.docId as string}
                                        mimeType={item.file.type || guessMimeFromName(item.file.name)}
                                        filename={item.file.name}
                                        extractedContent={item.extracted?.ocrText}
                                      />
                                    ) : useLocalTabularPreview ? (
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between text-[11px] sm:text-xs text-muted-foreground">
                                          <span className="font-medium truncate max-w-[70%]" title={item.file.name}>{item.file.name}</span>
                                          <span>{formatBytes(item.file.size)}</span>
                                        </div>
                                        <TabularPreview
                                          tabular={item.tabularPreview && 'data' in item.tabularPreview ? item.tabularPreview.data : null}
                                          loading={Boolean(item.tabularPreview?.loading)}
                                          error={item.tabularPreview && 'error' in item.tabularPreview ? item.tabularPreview.error : null}
                                        />
                                      </div>
                                    ) : (
                                      <UploadFilePreview
                                        file={item.file}
                                        previewUrl={item.previewUrl}
                                        height="500px"
                                      />
                                    )}
                                  </ScanningDocumentPreview>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div >
            </>
          );
        })()}

        {canShareDocuments && (
          <Dialog open={shareTeamsOpen} onOpenChange={setShareTeamsOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Share upload access with teams</DialogTitle>
                <DialogDescription>
                  Select additional teams that should get read, edit, and share access for uploaded content.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Selected teams get read, edit, and share access. Primary owner team remains unchanged.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {departments
                    .filter((dept) => dept.id !== selectedDepartmentId)
                    .map((dept) => {
                      const checked = effectiveAdditionalDepartmentIds.includes(dept.id);
                      return (
                        <label key={dept.id} className="flex items-center gap-2 text-sm rounded-md border border-border/50 px-3 py-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value: any) => toggleAdditionalDepartment(dept.id, !!value)}
                          />
                          <span className="truncate">{dept.name}</span>
                        </label>
                      );
                    })}
                </div>
                {effectiveAdditionalDepartmentIds.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {effectiveAdditionalDepartmentIds.length} additional team{effectiveAdditionalDepartmentIds.length === 1 ? '' : 's'} selected.
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShareTeamsOpen(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Version link picker dialog (Linear-style, browse + search) */}
        {typeof pickerOpenIndex === 'number' && queue[pickerOpenIndex] && (
          <VersionLinkPickerDialog
            open
            onOpenChange={(open) => setPickerOpenIndex(open ? pickerOpenIndex : null)}
            title="Select document to link as new version"
            documents={documents}
            folders={documentFolders}
            initialPath={folderPath}
            selectedId={queue[pickerOpenIndex]?.baseId || null}
            onSelect={(docId) => {
              setQueue(prev => prev.map((q, idx) => idx === pickerOpenIndex ? { ...q, baseId: docId, linkMode: 'version' } : q));
              setPickerOpenIndex(null);
            }}
          />
        )}
      </div>
      {/* Linear-style Folder Picker Dialog */}
      <FolderPickerDialog
        open={folderCommandOpen}
        onOpenChange={setFolderCommandOpen}
        folders={folderOptions.map(opt => ({
          id: opt.id,
          path: opt.path,
          label: opt.label,
          name: opt.path[opt.path.length - 1] || 'Root',
        }))}
        currentPath={folderPath}
        onSelect={(path) => {
          setFolderPath(path);
        }}
        onCreateFolder={async (parentPath, name) => {
          await createFolder(parentPath, name, effectiveAdditionalDepartmentIds);
          await loadAllDocuments(); // Use loadAllDocuments to ensure folders are loaded
        }}
        onLoadChildren={loadFolderChildren}
        loading={folderPickerLoading}
        title="Select Folder"
      />
    </AppLayout >
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <UploadContent />
    </Suspense>
  );
}
