"use client";

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { PageHeader } from '@/components/page-header';
import { H1 } from '@/components/typography';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { DoclingPreview } from '@/components/docling-preview';
import { StructuredDocumentView } from '@/components/structured-document-view';
import { IngestionPipelineProgress as PipelineProgress, type IngestionJob, type IngestionStep } from "@/components/ingestion-pipeline-progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from '@/hooks/use-toast';
import { apiFetch, getApiContext } from '@/lib/api';
import { formatAppDateTime } from '@/lib/utils';
import {
  ArrowLeft,
  Database,
  FileText,
  RefreshCw,
  Copy,
  AlertCircle,
  Search,
} from 'lucide-react';

interface DoclingCoordinate {
  // Old format: prov array with bbox
  self_ref?: string;
  parent?: any;
  children?: any[];
  content_layer?: string;
  label?: string;
  prov?: Array<{
    page_no: number;
    bbox: {
      l: number;
      t: number;
      r: number;
      b: number;
      coord_origin: string;
    };
    charspan?: [number, number];
  }>;
  orig?: string;
  text?: string;
  level?: number;
  // New format: extracted coordinates
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // Table-specific fields
  isTable?: boolean;
  tableIndex?: number;
}

interface DoclingData {
  coordinates?: DoclingCoordinate[];
  tables?: any[];
  pages?: any;
  metadata?: {
    filename?: string;
    num_pages?: number;
    method_used?: string;
    processing_time_ms?: number;
    has_coordinates?: boolean;
    text_elements?: number;
    tables?: number;
    file_hash?: string;
    cached?: boolean;
  };
}

interface EvidenceSpan {
  page: number;
  text?: string;
  score?: number;
  element_type?: string | null;
  bbox?: { x?: number; y?: number; width?: number; height?: number };
}

interface EvidenceSpanEntry {
  chunk_id: string;
  spans: EvidenceSpan[];
}

interface EvidenceSpansPayload {
  source?: string;
  version?: number;
  generated_at?: string;
  total_chunks?: number;
  total_spans?: number;
  spans?: EvidenceSpanEntry[];
}

interface ExtractionData {
  ocrText?: string;
  pages?: Array<{ page: number; text: string }>;
  status?: string;
  docling?: DoclingData;
  evidence_spans?: EvidenceSpansPayload;
}

type VespaEmbedding =
  | number[]
  | { values?: number[]; cells?: { address: Record<string, number>; value: number }[]; type?: string }
  | null;

interface VespaChunk {
  chunk_id: string;
  relevance?: number;
  fields: {
    doc_id: string;
    org_id: string;
    doc_type?: string;
    doc_type_key?: string;
    doc_type_confidence?: number;
    extracted_metadata?: Record<string, any>;
    content?: string;
    chunk_type?: string;
    chunk_level?: number;
    chunk_sequence?: number;
    is_leaf?: boolean;
    embedding?: VespaEmbedding;
    embedding_model?: string | null;
    page_number?: number;
    bbox_x?: number | null;
    bbox_y?: number | null;
    bbox_width?: number | null;
    bbox_height?: number | null;
    element_type?: string | null;
    [key: string]: any;
  };
}

interface VespaDocumentData {
  document: {
    id: string;
    title: string;
    filename: string;
    doc_type?: string;
    doc_type_key?: string;
    doc_type_confidence?: number;
    extracted_metadata?: Record<string, any>;
    vespa_indexed_at?: string;
  };
  chunks: VespaChunk[];
  total_chunks: number;
  vespa_enabled: boolean;
  sync_status?: {
    has_vespa_data: boolean;
    db_indexed: boolean;
    metadata_indexed: boolean;
    in_sync: boolean;
  };
}

export default function VespaOCRMapPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionData | null>(null);
  const [doclingData, setDoclingData] = useState<DoclingData | null>(null);
  const [vespaData, setVespaData] = useState<VespaDocumentData | null>(null);
  const [documentInfo, setDocumentInfo] = useState<{ mimeType?: string; title?: string } | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [filterText, setFilterText] = useState('');
  const [showPipeline, setShowPipeline] = useState(false);
  // State for table cell hovering - stores the cell's bbox for PDF overlay

  const [hoveredCell, setHoveredCell] = useState<{
    page: number;
    bbox: { l: number; t: number; r: number; b: number; coord_origin: string };
    label?: string;
    text?: string;
  } | null>(null);

  // V2 Pipeline State
  const [v2Job, setV2Job] = useState<IngestionJob | null>(null);
  const [v2Steps, setV2Steps] = useState<IngestionStep[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const docId = params.id;

  // Fetch V2 job data (separate from main data to allow independent polling)
  const fetchV2JobData = useCallback(async () => {
    try {
      const { orgId } = getApiContext();
      const v2Data = await apiFetch(`/orgs/${orgId}/documents/${docId}/ingestion-v2`);
      if (v2Data?.hasJob && v2Data.job) {
        setV2Job(v2Data.job);
        setV2Steps(v2Data.steps || []);
        return v2Data.job;
      }
    } catch (err) {
      console.warn('Failed to fetch V2 job data:', err);
    }
    return null;
  }, [docId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const { orgId } = getApiContext();
      if (!orgId || String(orgId).toLowerCase() === 'undefined') {
        throw new Error('No organization selected (missing orgId). Try refreshing, signing in again, or re-selecting your org.');
      }

      const [extractionData, vespaResponse, docInfo] = await Promise.all([
        apiFetch(`/orgs/${orgId}/documents/${docId}/extraction`),
        apiFetch(`/orgs/${orgId}/vespa/documents/${docId}?include_embeddings=true`),
        apiFetch(`/orgs/${orgId}/documents/${docId}`),
      ]);
      // Fetch V2 job data opportunistically (non-blocking for rendering).
      // This avoids failing the whole page if ingestion-v2 endpoint is unavailable.
      fetchV2JobData().catch(() => {});

      if (!extractionData) {
        throw new Error('Extraction endpoint returned an empty response.');
      }
      if (!vespaResponse) {
        throw new Error('Vespa endpoint returned an empty response.');
      }
      if (!docInfo) {
        throw new Error('Document endpoint returned an empty response.');
      }

      setExtraction(extractionData);
      setDoclingData(extractionData?.docling || null);
      setVespaData(vespaResponse);
      setDocumentInfo({
        mimeType: docInfo?.mimeType || docInfo?.mime_type,
        title: docInfo?.title,
      });
    } catch (err: any) {
      console.error('Failed to load Vespa OCR map data:', err);
      if (err.status === 404) {
        setError('Document data not found. It may not have been processed yet.');
      } else {
        setError(err.message || 'Failed to load Vespa OCR map data');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (docId) {
      fetchData();
    }
  }, [docId]);

  // Auto-refresh V2 job when running
  useEffect(() => {
    if (v2Job?.status === 'running' || v2Job?.status === 'queued') {
      autoRefreshRef.current = setInterval(async () => {
        const updatedJob = await fetchV2JobData();
        // If job completed, also refresh main data
        if (updatedJob && (updatedJob.status === 'completed' || updatedJob.status === 'review_ready')) {
          fetchData();
        }
      }, 2000);
    } else if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [v2Job?.status, fetchV2JobData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast({ title: 'Refreshed', description: 'Vespa OCR map data refreshed.' });
  };

  const handleRetryJob = async (stepKey?: string) => {
    if (!v2Job) return;
    setIsRetrying(true);
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/ingestion-v2/${v2Job.id}/retry`, {
        method: 'POST',
        body: JSON.stringify(stepKey ? { stepKey } : {}),
      });
      toast({
        title: 'Retry queued',
        description: stepKey ? `Step "${stepKey}" will be retried` : 'Job will be retried'
      });
      // Refresh to show new status
      await fetchV2JobData();
    } catch (err: any) {
      toast({
        title: 'Retry failed',
        description: err.message || 'Failed to queue retry',
        variant: 'destructive'
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const coordinates = doclingData?.coordinates || [];
  const ocrText = extraction?.ocrText || '';
  const evidencePayload = extraction?.evidence_spans;
  const evidenceEntries = evidencePayload?.spans || [];
  const evidenceTotal = evidencePayload?.total_spans || 0;
  const evidenceGeneratedAt = evidencePayload?.generated_at || null;

  const chunkById = useMemo(() => {
    const map = new Map<string, VespaChunk>();
    (vespaData?.chunks || []).forEach((chunk) => {
      if (chunk?.chunk_id) map.set(chunk.chunk_id, chunk);
    });
    return map;
  }, [vespaData]);

  const filteredOcrText = useMemo(() => {
    if (!filterText) return ocrText;
    const lines = ocrText.split('\n');
    return lines
      .filter(line => line.toLowerCase().includes(filterText.toLowerCase()))
      .join('\n');
  }, [ocrText, filterText]);

  // Create synthetic coordinates for tables from their cell bboxes
  const tableCoordinates = useMemo(() => {
    if (!doclingData?.tables) return [];

    return doclingData.tables.map((table: any, tableIndex: number): DoclingCoordinate | null => {
      // Calculate table bounding box from all cells in the grid
      // Tables have grid: [[cell, cell, ...], [cell, cell, ...], ...]
      const grid = table.grid || [];
      const allCells = grid.flat().filter((cell: any) => cell?.bbox);

      if (allCells.length === 0) {
        // Fallback: try to use old cells format
        const oldCells = table.cells || [];
        if (oldCells.length === 0) return null;
        allCells.push(...oldCells.filter((cell: any) => cell?.bbox));
        if (allCells.length === 0) return null;
      }

      // Find min/max coordinates
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let page: number | null = null;

      allCells.forEach((cell: any) => {
        const bbox = cell.bbox;
        if (bbox?.l !== undefined && bbox.l < minX) minX = bbox.l;
        if (bbox?.t !== undefined && bbox.t < minY) minY = bbox.t;
        if (bbox?.r !== undefined && bbox.r > maxX) maxX = bbox.r;
        if (bbox?.b !== undefined && bbox.b > maxY) maxY = bbox.b;
        if (bbox?.page_no !== undefined && page === null) page = bbox.page_no;
      });

      if (minX === Infinity || minY === Infinity) return null;

      // Convert to TOPLEFT if needed (assuming bbox is in same format as coordinates)
      const pageHeight = doclingData.pages?.find((p: any) => p.page_number === page)?.height;
      let y = minY;
      if (pageHeight && allCells[0]?.bbox?.coord_origin === 'BOTTOMLEFT') {
        y = pageHeight - maxY; // Convert from bottom-left to top-left
      }

      // Build display text showing table headers
      const headerTexts = table.headers?.map((h: any) => h.display || h.key || '').filter(Boolean).join(', ');
      const displayText = headerTexts
        ? `Table ${tableIndex + 1}: ${headerTexts}`
        : `Table ${tableIndex + 1}: ${table.rows || 0} rows × ${table.cols || 0} cols`;

      return {
        page: page || 1,
        x: minX,
        y: y,
        width: maxX - minX,
        height: Math.abs(maxY - minY),
        text: displayText,
        label: 'table',
        tableIndex: tableIndex,
        isTable: true
      };
    }).filter((coord): coord is DoclingCoordinate => coord !== null);
  }, [doclingData]);

  // Combine coordinates and table coordinates, sorted by page then by Y position
  const allElements = useMemo(() => {
    const combined = [...coordinates, ...tableCoordinates];

    // Sort by page first, then by Y coordinate (top to bottom)
    return combined.sort((a, b) => {
      // Get page numbers
      const pageA = ('prov' in a && a.prov?.[0]?.page_no) || a.page || 1;
      const pageB = ('prov' in b && b.prov?.[0]?.page_no) || b.page || 1;

      if (pageA !== pageB) {
        return pageA - pageB; // Sort by page first
      }

      // Then sort by Y coordinate (top to bottom)
      const yA = ('prov' in a && a.prov?.[0]?.bbox?.t) || a.y || 0;
      const yB = ('prov' in b && b.prov?.[0]?.bbox?.t) || b.y || 0;
      return yA - yB;
    });
  }, [coordinates, tableCoordinates]);

  const activeIndex = pinnedIndex ?? hoveredIndex;
  const activeCoordinate = activeIndex !== null ? allElements[activeIndex] : null;

  // Sync currentPage with active selection - only when coordinate changes
  useEffect(() => {
    const selectionPage = (activeCoordinate && 'prov' in activeCoordinate && activeCoordinate.prov?.[0]?.page_no) || activeCoordinate?.page || null;
    if (selectionPage && selectionPage !== currentPage) {
      setCurrentPage(selectionPage);
    }
  }, [activeCoordinate]); // removed currentPage dependency to allow manual page flipping

  const normalizeText = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

  const findCoordinateIndex = (text: string) => {
    const normalized = normalizeText(text);
    if (normalized.length < 4) return null;
    let bestIndex: number | null = null;
    let bestScore = 0;

    for (let i = 0; i < allElements.length; i += 1) {
      const element = allElements[i];
      if (!element) continue;
      const coordText = normalizeText(element.text || ('orig' in element ? element.orig : '') || '');
      if (!coordText) continue;
      const isMatch = coordText.includes(normalized) || normalized.includes(coordText);
      if (!isMatch) continue;
      const score = Math.min(coordText.length, normalized.length) / Math.max(coordText.length, normalized.length);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestScore >= 0.3 ? bestIndex : null;
  };

  const handleOcrSelection = () => {
    if (!doclingData) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    if (!text || text.length < 4) return;
    setSelectedText(text);
    const index = findCoordinateIndex(text);
    setPinnedIndex(index);
  };

  const highlightEvidenceSpan = (span: EvidenceSpan | null) => {
    if (!span?.bbox) return;
    const { x, y, width, height } = span.bbox;
    if ([x, y, width, height].some(v => typeof v !== 'number')) return;
    const l = Number(x);
    const t = Number(y);
    const w = Number(width);
    const h = Number(height);
    setHoveredCell({
      page: span.page,
      bbox: {
        l,
        t,
        r: l + w,
        b: t + h,
        coord_origin: 'TOPLEFT',
      },
      label: 'evidence',
      text: span.text,
    });
    if (span.page && span.page !== currentPage) {
      setCurrentPage(span.page);
    }
  };

  const filteredElements = useMemo(() => {
    if (!filterText) return allElements;
    const normalized = normalizeText(filterText);
    return allElements.filter(element => {
      if (!element) return false;
      const text = normalizeText(element.text || ('orig' in element ? element.orig : '') || '');
      const label = normalizeText(element.label || '');
      return text.includes(normalized) || label.includes(normalized);
    });
  }, [allElements, filterText]);

  const hasEmbedding = (embedding: VespaEmbedding | undefined | null) => {
    if (Array.isArray(embedding) && embedding.length > 0) return true;
    if (embedding && typeof embedding === 'object' && !Array.isArray(embedding)) {
      if ('values' in embedding && Array.isArray(embedding.values) && embedding.values.length > 0) return true;
      if ('cells' in embedding && Array.isArray(embedding.cells) && embedding.cells.length > 0) return true;
    }
    return false;
  };

  const embeddingDim = (embedding: VespaEmbedding | undefined | null) => {
    if (Array.isArray(embedding)) return embedding.length;
    if (embedding && typeof embedding === 'object' && !Array.isArray(embedding)) {
      if ('values' in embedding && Array.isArray(embedding.values)) return embedding.values.length;
      if ('cells' in embedding && Array.isArray(embedding.cells)) return embedding.cells.length;
    }
    return 0;
  };

  const chunks = vespaData?.chunks || [];
  const totalChunks = vespaData?.total_chunks || chunks.length;
  const embeddableChunks = chunks.filter(chunk => (chunk.fields.is_leaf ?? (chunk.fields.chunk_level ?? 0) > 0));
  const embeddedChunks = embeddableChunks.filter(chunk => hasEmbedding(chunk.fields.embedding));
  const embeddingCoverage = embeddableChunks.length
    ? Math.round((embeddedChunks.length / embeddableChunks.length) * 100)
    : 0;
  const doclingChunks = chunks.filter(chunk =>
    chunk.fields.bbox_x !== null && chunk.fields.bbox_x !== undefined
  );
  const doclingCoverage = totalChunks
    ? Math.round((doclingChunks.length / totalChunks) * 100)
    : 0;

  const sampleEmbedding = embeddedChunks.find(chunk => hasEmbedding(chunk.fields.embedding));
  const docTypeLabel = vespaData?.document?.doc_type_key || vespaData?.document?.doc_type || 'Not classified';

  const metadataEntries = Object.entries(vespaData?.document?.extracted_metadata || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 12);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'Copied to clipboard' });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
          <PageHeader title="Vespa OCR Map" />
          <div className="px-1 sm:px-4 md:px-6 space-y-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-[60vh] w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
          <PageHeader title="Vespa OCR Map" />
          <div className="px-1 sm:px-4 md:px-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4">
              <Button onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!vespaData || !extraction) {
    return (
      <AppLayout>
        <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
          <PageHeader title="Vespa OCR Map" />
          <div className="px-1 sm:px-4 md:px-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Missing data</AlertTitle>
              <AlertDescription>
                {`The page loaded, but required data is missing: ${!extraction ? 'extraction ' : ''}${!vespaData ? 'vespa ' : ''}`.trim()}
              </AlertDescription>
            </Alert>
            <div className="mt-4">
              <Button onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden bg-background">
        {/* Unified Header - Linear Style */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20">
          <Sheet>
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 -ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => router.back()}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm font-semibold tracking-tight truncate">
                      {documentInfo?.title || vespaData.document.filename || 'Vespa OCR Map'}
                    </h1>
                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-muted/50 border border-border/50">
                      <Database className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Vespa Map</span>
                    </div>
                  </div>

                  <SheetTrigger asChild>
                    <button className="flex items-center gap-4 mt-0.5 hover:bg-muted/30 px-2 py-0.5 -ml-2 rounded transition-colors text-left group">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-tight group-hover:text-foreground">Type</span>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-bold bg-primary/10 text-primary border-none">
                          {docTypeLabel}
                        </Badge>
                      </div>
                      <div className="h-3 w-px bg-border/60" />
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2" title="Embedding Coverage">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-tight group-hover:text-foreground">Vector</span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden shrink-0">
                              <div className="h-full bg-primary" style={{ width: `${embeddingCoverage}%` }} />
                            </div>
                            <span className="text-[11px] font-bold font-mono group-hover:text-primary transition-colors">{embeddingCoverage}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2" title="Layout Coverage">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-tight group-hover:text-foreground">Layout</span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden shrink-0">
                              <div className="h-full bg-emerald-500" style={{ width: `${doclingCoverage}%` }} />
                            </div>
                            <span className="text-[11px] font-bold font-mono group-hover:text-emerald-500 transition-colors">{doclingCoverage}%</span>
                          </div>
                        </div>
                      </div>
                      {vespaData.document.vespa_indexed_at && (
                        <>
                          <div className="h-3 w-px bg-border/60" />
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-tight group-hover:text-foreground">Indexed</span>
                            <span className="text-[11px] font-bold">{formatAppDateTime(vespaData.document.vespa_indexed_at)}</span>
                          </div>
                        </>
                      )}
                    </button>
                  </SheetTrigger>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {v2Job && (
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 gap-2 rounded-full border border-transparent hover:bg-muted text-muted-foreground transition-all"
                    >
                      <div className={`h-1.5 w-1.5 rounded-full ${v2Job.status === 'completed' ? 'bg-emerald-500' :
                        v2Job.status === 'failed' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'
                        }`} />
                      <span className="text-[11px] font-bold uppercase tracking-wider">
                        {v2Job.status.replace('_', ' ')}
                      </span>
                      <div className="h-3.5 w-px bg-border/50 mx-0.5" />
                      <span className="text-[10px] font-mono opacity-80">
                        {v2Steps.filter(s => s.status === 'succeeded').length}/{v2Steps.length}
                      </span>
                    </Button>
                  </SheetTrigger>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs font-medium rounded-full"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Sync
                </Button>
              </div>
            </div>

            <SheetContent className="sm:max-w-md p-0 overflow-hidden flex flex-col border-l border-border/40 shadow-2xl">
              <SheetHeader className="p-6 border-b bg-muted/5">
                <SheetTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground text-left">
                  <div className="p-1 rounded bg-primary/10 text-primary">
                    <Database className="h-4 w-4" />
                  </div>
                  System Insights
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-6 bg-background space-y-8">
                {v2Job && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ingestion Pipeline</span>
                    </div>
                    <PipelineProgress
                      job={v2Job}
                      steps={v2Steps}
                      onRetry={handleRetryJob}
                      isRetrying={isRetrying}
                      className="border-none bg-transparent p-0 shadow-none"
                    />
                  </div>
                )}

                {metadataEntries.length > 0 && (
                  <div className="pt-6 border-t border-border/40">
                    <div className="flex items-center gap-2 mb-4">
                      <Database className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Document Attributes</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {metadataEntries.map(([key, value]) => {
                        const isPrimary = ['doc_type_key', 'vespa_chunks_total', 'file_extension'].includes(key);
                        return (
                          <div
                            key={key}
                            className={`flex flex-col gap-1 px-2.5 py-2 rounded border transition-colors ${isPrimary
                              ? 'border-primary/20 bg-primary/5 shadow-sm'
                              : 'border-border/50 bg-muted/20 hover:bg-muted/30'
                              }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-tighter truncate">
                                {key.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <span className={`text-[10px] font-medium font-mono truncate ${isPrimary ? 'text-primary' : 'text-foreground/90'
                              }`}>
                              {String(value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>


        {/* Main Workspace */}
        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,1.2fr)] h-full divide-x">
            {/* Left Panel: Data & Maps */}
            <div className="flex flex-col h-full min-w-0 bg-muted/5">


              <Tabs defaultValue="intelligence" className="flex flex-col h-full overflow-hidden">
                <div className="border-b bg-background/50 px-4 py-2 flex items-center justify-between h-11 shrink-0">
                  <div className="flex items-center gap-4">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Data Explorer</span>
                    {activeCoordinate && (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-primary/5 px-2 py-0.5 rounded border border-primary/10 animate-in fade-in slide-in-from-left-2">
                        <span className="font-medium">Active:</span>
                        <span>{activeCoordinate.label || 'element'}</span>
                        {currentPage && <span>• Page {currentPage}</span>}
                      </div>
                    )}
                  </div>

                  <TabsList className="h-8 bg-muted/40 p-0.5 border border-border/50 rounded-md">
                    <TabsTrigger
                      value="intelligence"
                      className="text-[10px] font-bold uppercase tracking-tight px-3 h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      Intelligence
                    </TabsTrigger>
                    <TabsTrigger
                      value="raw"
                      className="text-[10px] font-bold uppercase tracking-tight px-3 h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      Raw Text
                    </TabsTrigger>
                    <TabsTrigger
                      value="evidence"
                      className="text-[10px] font-bold uppercase tracking-tight px-3 h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      Evidence
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-hidden p-4">

                  <TabsContent value="intelligence" className="flex-1 mt-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="h-full flex flex-col gap-4">
                      <div className="flex-1 border rounded-xl overflow-hidden bg-background shadow-inner ring-1 ring-border/20">
                        {allElements.length > 0 ? (
                          <StructuredDocumentView
                            coordinates={allElements.filter((e): e is DoclingCoordinate => e !== null)}
                            tables={doclingData?.tables}
                            pages={doclingData?.pages}
                            highlightedIndex={activeIndex}
                            currentPage={currentPage}
                            onPageChange={setCurrentPage}
                            onElementClick={(index) => {
                              setHoveredIndex(index);
                              setPinnedIndex(index);
                              const element = allElements[index];
                              if (element) {
                                setSelectedText(element.text || ('orig' in element ? element.orig : '') || '');
                              }
                            }}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-6">
                            <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
                            <p className="text-sm font-medium">No intelligence data available.</p>
                            <p className="text-xs text-muted-foreground/60 max-w-[260px] text-center">
                              Structure (coordinates, tables) comes from the extraction. If you reingested, refresh the page—the API merges v2 docling when legacy is empty. If it still fails, docling may not have run for this document.
                            </p>
                          </div>
                        )}
                      </div>

                    </div>
                  </TabsContent>

                  <TabsContent value="raw" className="flex-1 mt-0">
                    <div className="h-full relative overflow-hidden flex flex-col gap-3">
                      <div className="shrink-0 relative">
                        <Input
                          value={filterText}
                          onChange={(event) => setFilterText(event.target.value)}
                          placeholder="Filter OCR text..."
                          className="h-9 text-xs pl-9 bg-muted/20 border-none rounded-lg ring-1 ring-border/40 focus:ring-primary/40 transition-all"
                        />
                        <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground/60" />
                      </div>
                      <div
                        className="flex-1 rounded-xl border border-border/40 bg-background/50 p-6 font-mono text-[13px] leading-relaxed overflow-auto scrollbar-thin select-text selection:bg-primary/20 shadow-inner"
                        onMouseUp={handleOcrSelection}
                      >
                        {filteredOcrText || <div className="flex items-center justify-center h-full text-muted-foreground/50 italic font-sans text-sm">No raw OCR text available.</div>}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="evidence" className="flex-1 mt-0">
                    <div className="h-full flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="font-semibold uppercase tracking-wider">Evidence Spans</span>
                          <Badge variant="secondary" className="text-[10px]">{evidenceTotal}</Badge>
                        </div>
                        {evidenceGeneratedAt && (
                          <span className="text-[10px] text-muted-foreground/70">
                            {formatAppDateTime(new Date(evidenceGeneratedAt))}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 rounded-xl border border-border/40 bg-background/50 p-4 overflow-auto">
                        {evidenceEntries.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 text-sm gap-2 p-6 text-center max-w-[280px]">
                            <p>No evidence spans available yet.</p>
                            <p className="text-xs">Evidence is generated when the document is indexed in Vespa (vespa-ingest step). If you reingested, ensure Vespa ingestion has completed.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {evidenceEntries.slice(0, 40).map((entry) => {
                              const chunk = chunkById.get(entry.chunk_id);
                              const chunkPreview = chunk?.fields?.content?.slice(0, 160) || '';
                              return (
                                <div key={entry.chunk_id} className="border border-border/40 rounded-lg p-3 bg-background">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Chunk</span>
                                    <span className="text-[9px] font-mono text-muted-foreground/70">{entry.chunk_id}</span>
                                  </div>
                                  {chunkPreview && (
                                    <div className="mt-2 text-xs text-muted-foreground">
                                      {chunkPreview}
                                    </div>
                                  )}
                                  <div className="mt-3 space-y-2">
                                    {entry.spans.slice(0, 8).map((span, idx) => (
                                      <button
                                        key={`${entry.chunk_id}-${idx}`}
                                        className="w-full text-left text-xs border border-border/40 rounded-md px-2.5 py-2 hover:bg-muted/40 transition-colors"
                                        onClick={() => highlightEvidenceSpan(span)}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-medium text-foreground/90">
                                            {span.text || '(no text)'}
                                          </span>
                                          <span className="text-[10px] text-muted-foreground">
                                            p.{span.page} • {span.score ?? '—'}
                                          </span>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            {/* Right Panel: Live Preview */}
            <div className="h-full flex flex-col min-w-0">
              <div className="border-b bg-background/50 px-4 py-2 flex items-center justify-between h-11 shrink-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Spatial View</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/5 border border-primary/10 text-[10px] font-bold font-mono text-primary">
                    PAGE {currentPage}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                    <div className={`h-2 w-2 rounded-full ${allElements.length > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {allElements.length > 0 ? 'Live Coordinates' : 'No Data'}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-hidden p-4">
                <div className="h-full border rounded-xl overflow-hidden bg-background shadow-inner ring-1 ring-border/20">
                  {allElements.length > 0 ? (
                    <DoclingPreview
                      documentId={docId}
                      mimeType={documentInfo?.mimeType}
                      coordinates={allElements.filter((e): e is DoclingCoordinate => e !== null)}
                      pages={doclingData?.pages}
                      hoveredIndex={activeIndex}
                      onCoordinateHover={setHoveredIndex}
                      onCoordinateClick={(index) => {
                        const element = allElements.filter((e): e is DoclingCoordinate => e !== null)[index];
                        if (!element) return;
                        setPinnedIndex(index);
                        setSelectedText(element.text || ('orig' in element ? element.orig : '') || '');
                      }}
                      activePage={hoveredCell?.page || currentPage}
                      onPageChange={setCurrentPage}
                      hideToolbar
                      customHighlight={hoveredCell}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
                      <div className="p-4 rounded-full bg-muted">
                        <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">No Layout Data</p>
                        <p className="text-xs text-muted-foreground max-w-[200px]">
                          Layout coordinates are being generated or are unavailable for this document.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
