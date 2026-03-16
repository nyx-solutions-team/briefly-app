'use client';

import { type CSSProperties, type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, AlertCircle, X, FileText, Globe, Eye, Layers, Quote, File, Pin, ChevronRight, ChevronLeft, Download, GripVertical } from 'lucide-react';
import FilePreview from '@/components/file-preview';
import { DoclingPreview } from '@/components/docling-preview';
import { HtmlDocumentPreview } from '@/components/html-document-preview';
import ReactMarkdown from 'react-markdown';
import { useDocuments } from '@/hooks/use-documents';
import { apiFetch, getApiContext } from '@/lib/api';
import type { StoredDocument } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import SaveGeneratedDocumentDialog from '@/components/chat/save-generated-document-dialog';
import SaveGeneratedFileDialog from '@/components/chat/save-generated-file-dialog';
import { ActionCenterEmptyState } from '@/components/action-center-empty-state';

export type CitationMeta = {
    docId?: string | null;
    citationId?: string;
    docName?: string;
    title?: string;
    snippet?: string;
    url?: string;
    sourceType?: 'document' | 'web' | string;
    fields?: Record<string, any>;
    folderPath?: string[];
    page?: number | null;
    page_number?: number | null;
    bbox?: number[] | null;
    bbox_origin?: string | null;
    page_width?: number | null;
    page_height?: number | null;
    chunkIndex?: number | null;
    chunkId?: string | null;
    evidenceIds?: string[];
    primaryEvidenceId?: string | null;
    anchorStatus?: 'resolved' | 'partial' | 'unresolved' | string;
    anchorIds?: string[];
};

export type ActionCenterTab = 'sources' | 'preview' | 'json';

export type ActionCenterCanvas = {
    id: string;
    title: string;
    content: string;
    kind?: 'text' | 'markdown';
    sourceMessageId?: string | null;
    updatedAt?: number | null;
};

export type ActionCenterJsonArtifact = {
    id: string;
    title: string;
    data: any;
    documentType?: string | null;
    schemaVersion?: string | null;
    persistedArtifactId?: string | null;
    expiresAt?: string | null;
    sourceMessageId?: string | null;
    updatedAt?: number | null;
};

export type GeneratedPdfPreview = {
    title?: string;
    fileName?: string;
    previewUrl: string;
    downloadUrl?: string;
    expiresAt?: string;
    mimeType?: string;
    format?: string;
    textPreview?: string;
};

type ActionCenterProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isPinned?: boolean;
    onPinnedChange?: (pinned: boolean) => void;
    panelWidth?: number;
    onPanelWidthChange?: (width: number) => void;
    onResizeStateChange?: (isResizing: boolean) => void;
    activeDocumentId: string | null;
    activeDocumentPage?: number | null;
    onSelectDocument: (docId: string) => void;
    onSelectCitation?: (citation: CitationMeta) => void;
    activeCitation?: CitationMeta | null;
    memoryDocIds: string[];
    canvas?: ActionCenterCanvas | null;
    jsonArtifact?: ActionCenterJsonArtifact | null;
    citations: CitationMeta[];
    citationsMode: 'global' | 'message';
    onCitationsModeChange: (mode: 'global' | 'message') => void;
    hasMessageScopedCitations: boolean;
    allDocuments: StoredDocument[];
    allFolders?: string[][];
    generatedPdfPreview?: GeneratedPdfPreview | null;
    onClearGeneratedPdfPreview?: () => void;
    activeTab: ActionCenterTab;
    onTabChange: (tab: ActionCenterTab) => void;
};

export function ActionCenter({
    open,
    onOpenChange,
    isPinned = false,
    onPinnedChange,
    panelWidth = 560,
    onPanelWidthChange,
    onResizeStateChange,
    activeDocumentId,
    activeDocumentPage = null,
    onSelectDocument,
    onSelectCitation,
    activeCitation = null,
    memoryDocIds,
    canvas = null,
    jsonArtifact = null,
    citations,
    citationsMode,
    onCitationsModeChange,
    hasMessageScopedCitations,
    allDocuments,
    allFolders = [],
    generatedPdfPreview = null,
    onClearGeneratedPdfPreview,
    activeTab,
    onTabChange,
}: ActionCenterProps) {
    const panelWidthClassName = 'w-screen max-w-full sm:w-[420px] lg:w-[var(--action-center-width)]';
    const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
    const [isResizingPanel, setIsResizingPanel] = useState(false);
    const highlightEnabled = true;
    const { getDocumentById } = useDocuments();
    const [docRecord, setDocRecord] = useState<StoredDocument | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const lastPreviewDocId = useRef<string | null>(null);
    const [highlightSpan, setHighlightSpan] = useState<{
        page: number;
        bbox: { l: number; t: number; r: number; b: number; coord_origin: string };
        text?: string;
    } | null>(null);
    const [highlightMessage, setHighlightMessage] = useState<string | null>(null);
    const [doclingPages, setDoclingPages] = useState<any[] | null>(null);
    const [invoicePage, setInvoicePage] = useState(0);
    const [saveGeneratedDialogOpen, setSaveGeneratedDialogOpen] = useState(false);
    const [saveGeneratedFileDialogOpen, setSaveGeneratedFileDialogOpen] = useState(false);
    const [artifactPreviewZoom, setArtifactPreviewZoom] = useState(0.6);
    const panelStyle = useMemo<CSSProperties>(
        () => ({ '--action-center-width': `${Math.round(panelWidth)}px` } as CSSProperties),
        [panelWidth]
    );
    const startResizing = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
        if (!onPanelWidthChange) return;
        event.preventDefault();
        resizeDragRef.current = {
            startX: event.clientX,
            startWidth: panelWidth,
        };
        setIsResizingPanel(true);
    }, [onPanelWidthChange, panelWidth]);
    const stopResizing = useCallback(() => {
        resizeDragRef.current = null;
        setIsResizingPanel(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);
    const resizePanel = useCallback((event: MouseEvent) => {
        if (!onPanelWidthChange) return;
        const dragState = resizeDragRef.current;
        if (!dragState) return;
        const delta = dragState.startX - event.clientX;
        const maxWidth = Math.min(760, Math.max(420, Math.floor(window.innerWidth * 0.55)));
        const nextWidth = Math.max(360, Math.min(maxWidth, dragState.startWidth + delta));
        onPanelWidthChange(nextWidth);
    }, [onPanelWidthChange]);

    const activeCitationDocId = activeCitation?.docId || null;
    const activeCitationChunkId =
        activeCitation?.chunkId ||
        (activeCitation?.fields ? activeCitation.fields.chunk_id || activeCitation.fields.chunkId : null) ||
        null;
    const activeCitationPage =
        typeof activeCitation?.page === 'number'
            ? activeCitation.page
            : typeof activeCitation?.fields?.page === 'number'
                ? activeCitation.fields.page
                : typeof activeCitation?.fields?.page_number === 'number'
                    ? activeCitation.fields.page_number
                    : null;
    const activeCitationBboxOriginRaw =
        activeCitation?.fields?.bbox_origin ||
        activeCitation?.fields?.bboxOrigin ||
        (activeCitation as any)?.bbox_origin ||
        (activeCitation as any)?.bboxOrigin ||
        null;
    const activeCitationBboxOrigin =
        typeof activeCitationBboxOriginRaw === 'string' && activeCitationBboxOriginRaw.trim().length
            ? activeCitationBboxOriginRaw.toUpperCase()
            : null;

    const getCitationKey = (citation: CitationMeta) => {
        if (!citation) return '';
        const chunkKey = citation.chunkId || citation.fields?.chunk_id || citation.fields?.chunkId || '';
        const pageKey = citation.page ?? citation.fields?.page_number ?? citation.fields?.page ?? '';
        if (citation.docId) return `doc:${citation.docId}:${chunkKey}:${pageKey}`;
        if (citation.url) return `url:${citation.url}`;
        return `text:${citation.docName || citation.title || citation.snippet || ''}`;
    };

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    useEffect(() => {
        onResizeStateChange?.(isResizingPanel);
    }, [isResizingPanel, onResizeStateChange]);

    useEffect(() => {
        return () => onResizeStateChange?.(false);
    }, [onResizeStateChange]);

    useEffect(() => {
        if (!isResizingPanel) return undefined;
        window.addEventListener('mousemove', resizePanel);
        window.addEventListener('mouseup', stopResizing);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        return () => {
            window.removeEventListener('mousemove', resizePanel);
            window.removeEventListener('mouseup', stopResizing);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizingPanel, resizePanel, stopResizing]);

    // Switch to preview tab when a new document is selected
    useEffect(() => {
        if (activeDocumentId) {
            if (lastPreviewDocId.current !== activeDocumentId) {
                lastPreviewDocId.current = activeDocumentId;
                onTabChange('preview');
            }
        } else {
            lastPreviewDocId.current = null;
        }
    }, [activeDocumentId, onTabChange]);

    // Fetch document details when activeDocumentId changes
    useEffect(() => {
        let active = true;
        const reset = () => {
            if (!active) return;
            setDocRecord(null);
            setError(null);
            setLoading(false);
        };

        if (!open) {
            // Don't reset immediately to avoid flicker if quickly toggled
            // but we can reset if we want fresh state on open
        }

        if (!activeDocumentId) {
            reset();
            return () => { active = false; };
        }

        const localDoc = getDocumentById(activeDocumentId);
        if (localDoc) {
            setLoading(false);
            setDocRecord(localDoc);
            setError(null);
            return () => { active = false; };
        }

        setLoading(true);
        setError(null);
        (async () => {
            try {
                const { orgId } = getApiContext();
                if (!orgId) throw new Error('No organization selected');
                const fetched = await apiFetch<StoredDocument>(`/orgs/${orgId}/documents/${activeDocumentId}`);
                if (!active) return;
                const enriched = {
                    ...(fetched as any),
                    uploadedAt: new Date(
                        (fetched as any).uploadedAt || (fetched as any).uploaded_at || Date.now()
                    ),
                } as StoredDocument;
                setDocRecord(enriched);
                setError(null);
            } catch (err: any) {
                if (!active) return;
                setError(err?.message || 'Unable to load document');
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => { active = false; };
    }, [activeDocumentId, getDocumentById, open]);

    // Load extraction evidence to highlight citation spans
    useEffect(() => {
        let active = true;

        const reset = () => {
            if (!active) return;
            setHighlightSpan(null);
            setHighlightMessage(null);
            setDoclingPages(null);
        };

        if (!highlightEnabled) {
            reset();
            return () => { active = false; };
        }

        if (!activeCitationDocId) {
            reset();
            return () => { active = false; };
        }

        (async () => {
            try {
                const metaBbox = activeCitation?.bbox || activeCitation?.fields?.bbox;
                const metaPage =
                    typeof activeCitationPage === 'number'
                        ? activeCitationPage
                        : typeof activeDocumentPage === 'number'
                            ? activeDocumentPage
                            : null;
                const directOrigin =
                    activeCitationBboxOrigin ||
                    (activeCitation?.fields?.bbox_origin || activeCitation?.fields?.bboxOrigin) ||
                    (activeCitation as any)?.bbox_origin ||
                    (activeCitation as any)?.bboxOrigin ||
                    'BOTTOMLEFT';
                if (metaPage !== null && Array.isArray(metaBbox) && metaBbox.length === 4) {
                    const [vx, vy, vw, vh] = metaBbox.map(Number);
                    if ([vx, vy, vw, vh].every(Number.isFinite)) {
                        const origin = String(directOrigin).toUpperCase();
                        const top = origin.startsWith('BOTTOM') ? vy + vh : vy;
                        const bottom = origin.startsWith('BOTTOM') ? vy : vy + vh;
                        setHighlightSpan({
                            page: metaPage,
                            bbox: { l: vx, t: top, r: vx + vw, b: bottom, coord_origin: origin },
                            text: activeCitation?.snippet || undefined,
                        });
                        setHighlightMessage('Highlighted from citation metadata');
                        setDoclingPages(null);
                        return;
                    }
                }

                const { orgId } = getApiContext();
                if (!orgId) throw new Error('No organization selected');
                console.debug('[ActionCenter] Fetching extraction for citation highlight', {
                    orgId,
                    docId: activeCitationDocId,
                    chunkId: activeCitationChunkId,
                });
                const extraction = await apiFetch<any>(`/orgs/${orgId}/documents/${activeCitationDocId}/extraction`);
                if (!active) return;
                const spans = extraction?.evidence_spans?.spans || [];
                const pages = Array.isArray(extraction?.docling?.pages)
                    ? extraction.docling.pages
                    : extraction?.docling?.pages && typeof extraction.docling.pages === 'object'
                        ? Object.values(extraction.docling.pages)
                        : null;
                setDoclingPages(pages || null);
                const match = activeCitationChunkId
                    ? spans.find((entry: any) => entry?.chunk_id === activeCitationChunkId)
                    : null;
                const pageHint = activeCitationPage;
                const snippet = typeof activeCitation?.snippet === 'string' ? activeCitation.snippet : '';

                const snippetTokens = new Set(
                    snippet
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, ' ')
                        .split(' ')
                        .filter(token => token.length >= 3)
                );
                const coordTextTokens = (text: string) =>
                    new Set(
                        text
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, ' ')
                            .split(' ')
                            .filter(token => token.length >= 3)
                    );
                const pickBestSpan = (items: any[]) => {
                    if (!Array.isArray(items) || items.length === 0) return null;
                    if (snippetTokens.size === 0) {
                        return items[0];
                    }
                    let best = items[0];
                    let bestScore = -1;
                    for (const span of items) {
                        const text = String(span?.text || '').toLowerCase();
                        if (!text) continue;
                        const textTokens = new Set(
                            text.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(token => token.length >= 3)
                        );
                        let overlap = 0;
                        snippetTokens.forEach(token => {
                            if (textTokens.has(token)) overlap += 1;
                        });
                        const score = overlap / Math.max(1, snippetTokens.size);
                        if (score > bestScore) {
                            bestScore = score;
                            best = span;
                        }
                    }
                    return best;
                };
                const candidate = pickBestSpan(match?.spans || []);

                const buildHighlightFromDocling = () => {
                    const coordinates = Array.isArray(extraction?.docling?.coordinates)
                        ? extraction.docling.coordinates
                        : [];
                    if (!coordinates.length || snippetTokens.size === 0) return null;
                    const candidates = coordinates.filter((coord: any) => {
                        const coordPage = coord?.page ?? coord?.page_number ?? coord?.prov?.[0]?.page_no ?? null;
                        if (typeof pageHint === 'number' && typeof coordPage === 'number') {
                            return coordPage === pageHint;
                        }
                        return true;
                    });
                    let bestMatches: Array<{ coord: any; score: number }> = [];
                    for (const coord of candidates) {
                        const text = String(coord?.text || coord?.content || coord?.orig || '').trim();
                        if (!text) continue;
                        const tokens = coordTextTokens(text);
                        let overlap = 0;
                        snippetTokens.forEach(token => {
                            if (tokens.has(token)) overlap += 1;
                        });
                        const score = overlap / Math.max(1, snippetTokens.size);
                        if (score >= 0.2) {
                            bestMatches.push({ coord, score });
                        }
                    }
                    if (!bestMatches.length) return null;
                    bestMatches.sort((a, b) => b.score - a.score);

                    // If we have a very strong match, use only that. Otherwise cluster top few.
                    const top = bestMatches[0].score > 0.8
                        ? [bestMatches[0].coord]
                        : bestMatches.slice(0, 3).map(entry => entry.coord);

                    let minX = Infinity;
                    let minY = Infinity;
                    let maxX = -Infinity;
                    let maxY = -Infinity;
                    let page = null;
                    let sampleOrigin = 'TOPLEFT';

                    for (const coord of top) {
                        const x = coord?.x ?? coord?.bbox?.l ?? coord?.bbox?.x ?? null;
                        const y = coord?.y ?? coord?.bbox?.t ?? coord?.bbox?.y ?? null;
                        const width = coord?.width ?? coord?.bbox?.width ?? null;
                        const height = coord?.height ?? coord?.bbox?.height ?? null;

                        if ([x, y, width, height].some((v: any) => typeof v !== 'number')) {
                            continue;
                        }

                        // Track origin if provided
                        const origin = coord?.coord_origin || coord?.bbox?.coord_origin;
                        if (origin) sampleOrigin = origin;

                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x + width);
                        maxY = Math.max(maxY, y + height);

                        const coordPage = coord?.page ?? coord?.page_number ?? coord?.prov?.[0]?.page_no ?? null;
                        if (page === null && typeof coordPage === 'number') {
                            page = coordPage;
                        }
                    }

                    const finalPage = typeof page === 'number' ? page : (typeof pageHint === 'number' ? pageHint : null);
                    if (finalPage === null) return null;

                    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
                        return null;
                    }

                    return {
                        page: finalPage,
                        bbox: { l: minX, t: minY, r: maxX, b: maxY, coord_origin: sampleOrigin },
                        text: snippet || undefined,
                    };
                };

                const buildHighlightFromMetaBbox = () => {
                    const metaBbox = activeCitation?.bbox || activeCitation?.fields?.bbox;
                    if (!metaBbox || !Array.isArray(metaBbox) || metaBbox.length !== 4) return null;
                    const [vx, vy, vw, vh] = metaBbox.map(Number);
                    if (![vx, vy, vw, vh].every(Number.isFinite)) return null;
                    const origin = activeCitationBboxOrigin || 'BOTTOMLEFT';
                    const top = origin.startsWith('BOTTOM') ? vy + vh : vy;
                    const bottom = origin.startsWith('BOTTOM') ? vy : vy + vh;
                    const finalPage = typeof pageHint === 'number' ? pageHint : 1;
                    return {
                        page: finalPage,
                        bbox: { l: vx, t: top, r: vx + vw, b: bottom, coord_origin: origin },
                        text: snippet || undefined,
                    };
                };
                console.debug('[ActionCenter] Evidence lookup result', {
                    docId: activeCitationDocId,
                    chunkId: activeCitationChunkId,
                    spansCount: spans.length,
                    hasMatch: Boolean(match),
                    hasCandidate: Boolean(candidate),
                });
                if (candidate?.bbox && typeof candidate?.page === 'number') {
                    const rawOrigin =
                        candidate.bbox.coord_origin ||
                        activeCitationBboxOrigin ||
                        'BOTTOMLEFT';
                    const origin = String(rawOrigin).toUpperCase();
                    const x = candidate.bbox.x ?? candidate.bbox.l;
                    const y = candidate.bbox.y ?? candidate.bbox.t;
                    const width = candidate.bbox.width ?? (candidate.bbox.r != null && candidate.bbox.l != null ? candidate.bbox.r - candidate.bbox.l : null);
                    const height = candidate.bbox.height ?? (candidate.bbox.b != null && candidate.bbox.t != null ? candidate.bbox.b - candidate.bbox.t : null);
                    if ([x, y, width, height].some((v: any) => typeof v !== 'number')) {
                        const fallback = buildHighlightFromDocling();
                        if (fallback) {
                            setHighlightSpan(fallback);
                            setHighlightMessage('Highlighted from citation');
                            return;
                        }
                        const meta = buildHighlightFromMetaBbox();
                        if (meta) {
                            setHighlightSpan(meta);
                            setHighlightMessage('Highlighted from citation metadata');
                            return;
                        }
                        setHighlightSpan(null);
                        setHighlightMessage('Evidence span is missing bounding box data');
                        return;
                    }
                    const top = origin.startsWith('BOTTOM') ? y + height : y;
                    const bottom = origin.startsWith('BOTTOM') ? y : y + height;
                    const l = Number(x);
                    const r = l + Number(width);
                    console.debug('[ActionCenter] Highlighting from evidence span', {
                        docId: activeCitationDocId,
                        chunkId: activeCitationChunkId,
                        page: candidate.page,
                        origin,
                        bbox: { x, y, width, height },
                    });
                    setHighlightSpan({
                        page: candidate.page,
                        bbox: { l, t: top, r, b: bottom, coord_origin: origin },
                        text: candidate.text || activeCitation?.snippet || undefined,
                    });
                    setHighlightMessage('Highlighted from citation');
                    return;
                }

                const fallback = buildHighlightFromDocling();
                if (fallback) {
                    setHighlightSpan(fallback);
                    setHighlightMessage('Highlighted from citation');
                    return;
                }

                const meta = buildHighlightFromMetaBbox();
                if (meta) {
                    console.debug('[ActionCenter] Highlighting from citation metadata', {
                        docId: activeCitationDocId,
                        chunkId: activeCitationChunkId,
                        page: meta.page,
                        origin: meta.bbox.coord_origin,
                        bbox: meta.bbox,
                    });
                    setHighlightSpan(meta);
                    setHighlightMessage('Highlighted from citation metadata');
                    return;
                }

                setHighlightSpan(null);
                setHighlightMessage('No evidence span found for this citation');
            } catch {
                reset();
            }
        })();

        return () => { active = false; };
    }, [highlightEnabled, activeCitationDocId, activeCitationChunkId, activeCitation?.snippet, activeCitationPage, activeCitationBboxOrigin, activeDocumentPage]);

    const metadata = useMemo(() => {
        if (!docRecord) return [];
        return [
            { label: 'Type', value: docRecord.documentType },
            { label: 'Category', value: docRecord.category },
            { label: 'Version', value: docRecord.versionNumber ? `v${docRecord.versionNumber}` : undefined },
            { label: 'Date', value: docRecord.documentDate },
            { label: 'Sender', value: docRecord.sender },
            { label: 'Receiver', value: docRecord.receiver },
            {
                label: 'Folder',
                value: docRecord.folderPath?.length ? docRecord.folderPath.join(' / ') : undefined,
            },
            { label: 'Subject', value: docRecord.subject },
        ].filter((entry) => Boolean(entry.value));
    }, [docRecord]);

    // --- Render Helpers ---

    const renderPreviewTab = () => {
        if (generatedPdfPreview?.previewUrl) {
            const generatedFormat = String(generatedPdfPreview.format || '').toLowerCase();
            const generatedMime = String(generatedPdfPreview.mimeType || '').toLowerCase();
            const canInlineGeneratedPreview =
                generatedFormat === 'pdf' ||
                generatedMime.includes('pdf');
            return (
                <div className="space-y-4 pb-6 text-sm">
                    <section className="space-y-3 rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                                <h2 className="text-base sm:text-lg font-semibold text-foreground break-all">
                                    {generatedPdfPreview.title || 'Generated PDF Draft'}
                                </h2>
                                {generatedPdfPreview.fileName ? (
                                    <p className="text-xs text-muted-foreground break-all">{generatedPdfPreview.fileName}</p>
                                ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                                {generatedPdfPreview.downloadUrl ? (
                                    <Button asChild variant="secondary" size="sm" className="h-8">
                                        <a href={generatedPdfPreview.downloadUrl}>Download</a>
                                    </Button>
                                ) : null}
                                <Button variant="secondary" size="sm" className="h-8" onClick={() => setSaveGeneratedFileDialogOpen(true)}>
                                    Save
                                </Button>
                                {onClearGeneratedPdfPreview ? (
                                    <Button variant="outline" size="sm" className="h-8" onClick={onClearGeneratedPdfPreview}>
                                        Back To Docs
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </section>
                    {canInlineGeneratedPreview ? (
                        <section className="rounded-lg border border-border/50 bg-card/60 p-0 shadow-sm overflow-auto">
                            <iframe
                                src={generatedPdfPreview.previewUrl}
                                title={generatedPdfPreview.title || 'Generated File Preview'}
                                className="h-[70vh] w-full border-0"
                            />
                        </section>
                    ) : (
                        <section className="space-y-3 rounded-lg border border-border/50 bg-card/60 p-4 shadow-sm">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 rounded-md border border-border/60 bg-background/80 p-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-medium text-foreground">
                                        Preview is limited for this file type
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {generatedFormat ? `${generatedFormat.toUpperCase()} files` : 'This file type'} may not preview inline in the browser. You can download it or save it to Documents.
                                    </p>
                                </div>
                            </div>
                            {generatedPdfPreview.textPreview ? (
                                <div className="rounded-md border border-border/50 bg-background/70 p-3">
                                    <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Content Preview</div>
                                    <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground font-mono max-h-[50vh] overflow-auto">
                                        {generatedPdfPreview.textPreview}
                                    </pre>
                                </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                                <Button asChild variant="secondary" size="sm">
                                    <a href={generatedPdfPreview.downloadUrl || generatedPdfPreview.previewUrl}>
                                        <Download className="mr-2 h-4 w-4" />
                                        Download
                                    </a>
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setSaveGeneratedFileDialogOpen(true)}>
                                    Save To Documents
                                </Button>
                            </div>
                        </section>
                    )}
                    <SaveGeneratedFileDialog
                        open={saveGeneratedFileDialogOpen}
                        onOpenChange={setSaveGeneratedFileDialogOpen}
                        fileUrl={generatedPdfPreview.downloadUrl || generatedPdfPreview.previewUrl}
                        fileName={generatedPdfPreview.fileName || 'generated-document'}
                        mimeType={generatedPdfPreview.mimeType}
                        title={generatedPdfPreview.title}
                        textPreview={generatedPdfPreview.textPreview || null}
                        allDocuments={allDocuments}
                        allFolders={allFolders}
                    />
                </div>
            );
        }

        if (!activeDocumentId) {
            return <ActionCenterEmptyState type="preview" />;
        }

        if (loading) {
            return (
                <div className="flex h-full items-center justify-center gap-2 px-6 py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading document…
                </div>
            );
        }

        if (error) {
            return (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                    <p className="text-sm text-muted-foreground">{error}</p>
                    <Button variant="outline" onClick={() => setError(null)}>Dismiss</Button>
                </div>
            );
        }

        if (!docRecord) {
            return (
                <div className="flex h-full items-center justify-center px-6 py-8 text-muted-foreground">
                    Document not found.
                </div>
            );
        }

        const primaryTitle = docRecord.title || docRecord.name || docRecord.filename || 'Untitled document';
        const secondaryTitle = docRecord.filename && docRecord.filename !== docRecord.title ? docRecord.filename : null;

        const previewPage = highlightSpan?.page ?? activeDocumentPage;
        const canShowHighlight = Boolean(highlightEnabled && highlightSpan && (docRecord as any)?.mimeType === 'application/pdf');

        return (
            <div className="space-y-5 pb-6 text-sm">
                <section className="space-y-3 rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span className="font-semibold text-foreground/70">Document</span>
                        {docRecord.category && (
                            <Badge variant="outline" className="rounded-full text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                                {docRecord.category}
                            </Badge>
                        )}
                        {docRecord.documentType && (
                            <Badge variant="outline" className="rounded-full text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/30">
                                {docRecord.documentType}
                            </Badge>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                            <h2 className="text-base sm:text-lg font-semibold text-foreground break-all">{primaryTitle}</h2>
                            {secondaryTitle && (
                                <p className="text-xs text-muted-foreground break-all">{secondaryTitle}</p>
                            )}
                        </div>
                        <Button asChild variant="secondary" size="sm" className="ml-auto">
                            <Link href={`/documents/${docRecord.id}`} className="inline-flex items-center gap-2 text-xs sm:text-sm">
                                <ExternalLink className="h-4 w-4" />
                                <span className="hidden sm:inline">Open</span>
                            </Link>
                        </Button>
                    </div>
                </section>

                <section className="rounded-lg border border-border/50 bg-card/60 p-0 shadow-sm overflow-auto">
                    {typeof previewPage === 'number' && previewPage > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/20">
                            <span>Showing page {previewPage}</span>
                            <span className="text-[10px] normal-case text-muted-foreground/70">
                                {highlightMessage || 'From citation'}
                            </span>
                        </div>
                    )}
                    {canShowHighlight ? (
                        <div className="h-[70vh]">
                            <DoclingPreview
                                documentId={docRecord.id}
                                mimeType={(docRecord as any).mimeType}
                                coordinates={[]}
                                pages={doclingPages || undefined}
                                hoveredIndex={null}
                                onCoordinateHover={() => undefined}
                                activePage={previewPage}
                                hideToolbar
                                customHighlight={highlightSpan}
                            />
                        </div>
                    ) : (
                        <FilePreview
                            documentId={docRecord.id}
                            mimeType={(docRecord as any).mimeType}
                            filename={(docRecord as any).filename}
                            extractedContent={docRecord.content || (docRecord as any).extractedContent}
                            className="border-0 shadow-none"
                            showTitle={false}
                            showMetaInfo={false}
                            initialPage={previewPage}
                        />
                    )}
                </section>

                <section className="rounded-xl border border-border/60 bg-muted/10 p-3 sm:p-4 shadow-sm space-y-3">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                        AI Summary
                    </div>
                    {docRecord.description ? (
                        <div className="prose prose-sm text-muted-foreground dark:prose-invert max-w-none">
                            <ReactMarkdown>{docRecord.description}</ReactMarkdown>
                        </div>
                    ) : (
                        <p className="text-muted-foreground/80">No AI summary available yet.</p>
                    )}
                </section>

                <section className="rounded-xl border border-border/60 bg-card/70 p-3 sm:p-4 shadow-sm space-y-3">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Details
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs sm:text-sm">
                        {metadata.map(({ label, value }) => (
                            <div key={label} className="space-y-0.5 break-words">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                                <p className="text-foreground">{value}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        );
    };

    const renderCanvasTab = () => {
        const canvasContent = String(canvas?.content || '').trim();
        if (!canvas || !canvasContent) {
            return <ActionCenterEmptyState type="artifact" />;
        }

        const kind = canvas.kind || 'markdown';
        const updatedAtLabel =
            typeof canvas.updatedAt === 'number' && Number.isFinite(canvas.updatedAt)
                ? new Date(canvas.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : null;

        return (
            <div className="space-y-4 text-xs sm:text-sm">
                <div className="relative overflow-auto rounded-2xl border border-border/40 bg-gradient-to-br from-card to-muted/30 p-5 shadow-lg">
                    {/* Decorative bubble */}
                    <div className="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl pointer-events-none" />

                    <div className="relative flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
                                <Layers className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Draft Canvas</p>
                                <p className="text-sm font-bold text-foreground truncate" title={canvas.title}>
                                    {canvas.title}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="h-4 px-1.5 text-[9px] bg-background/50 border-border/40 font-bold uppercase">
                                        {kind}
                                    </Badge>
                                    {updatedAtLabel && (
                                        <span className="text-[10px] text-muted-foreground font-medium">
                                            Saved at {updatedAtLabel}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-8 rounded-full px-3 text-[11px] font-bold shadow-sm"
                                onClick={async () => {
                                    try {
                                        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                                            await navigator.clipboard.writeText(canvasContent);
                                        }
                                    } catch { }
                                }}
                            >
                                Copy
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-full px-3 text-[11px] font-bold bg-background/50"
                                onClick={() => {
                                    if (typeof window === 'undefined') return;
                                    const blob = new Blob([canvasContent], {
                                        type: kind === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
                                    });
                                    const url = URL.createObjectURL(blob);
                                    const anchor = document.createElement('a');
                                    anchor.href = url;
                                    anchor.download = `${canvas.title || 'canvas'}.${kind === 'markdown' ? 'md' : 'txt'}`;
                                    document.body.appendChild(anchor);
                                    anchor.click();
                                    anchor.remove();
                                    URL.revokeObjectURL(url);
                                }}
                            >
                                Export
                            </Button>
                        </div>
                    </div>
                </div>

                <section className="rounded-2xl border border-border/40 bg-card/40 p-5 sm:p-6 shadow-sm overflow-auto min-h-[400px]">
                    {kind === 'text' ? (
                        <pre className="whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed text-foreground font-mono">
                            {canvasContent}
                        </pre>
                    ) : (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-p:leading-relaxed prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/40">
                            <ReactMarkdown>{canvasContent}</ReactMarkdown>
                        </div>
                    )}
                </section>
                {canvas.sourceMessageId ? (
                    <div className="flex items-center gap-2 px-2 opacity-60">
                        <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                        <p className="text-[10px] font-medium text-muted-foreground">
                            Origin Reference: <span className="font-mono bg-muted px-1 rounded">{canvas.sourceMessageId}</span>
                        </p>
                    </div>
                ) : null}
            </div>
        );
    };

    const renderJsonTab = () => {
        const artifact = jsonArtifact;
        const hasData = artifact && artifact.data !== undefined && artifact.data !== null;
        if (!artifact || !hasData) {
            return <ActionCenterEmptyState type="artifact" />;
        }

        const jsonText = JSON.stringify(artifact.data, null, 2);
        const updatedAtLabel =
            typeof artifact.updatedAt === 'number' && Number.isFinite(artifact.updatedAt)
                ? new Date(artifact.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : null;

        const artifactDataObject =
            artifact.data && typeof artifact.data === 'object' && !Array.isArray(artifact.data)
                ? artifact.data as any
                : null;
        const inferredDocType =
            typeof artifactDataObject?.document_type === 'string' && artifactDataObject.document_type.trim()
                ? artifactDataObject.document_type.trim().toLowerCase()
                : typeof artifactDataObject?.doc_type === 'string' && artifactDataObject.doc_type.trim()
                    ? artifactDataObject.doc_type.trim().toLowerCase()
                    : typeof artifactDataObject?.template_id === 'string' && artifactDataObject.template_id.trim()
                        ? artifactDataObject.template_id.trim().toLowerCase()
                        : (
                            artifactDataObject &&
                            typeof artifactDataObject.invoice_number === 'string' &&
                            Array.isArray(artifactDataObject.items) &&
                            artifactDataObject.totals &&
                            typeof artifactDataObject.totals === 'object'
                        ) ? 'invoice'
                            : artifactDataObject?.po_number ? 'purchase_order'
                                : artifactDataObject?.receipt_number ? 'receipt'
                                    : artifactDataObject?.quote_number ? 'quotation'
                                        : artifactDataObject?.delivery_note_number ? 'delivery_note'
                                            : '';
        const docType = String(artifact.documentType || inferredDocType || '').trim().toLowerCase();
        const schemaVersion = String(
            artifact.schemaVersion ||
            artifactDataObject?.schema_version ||
            artifactDataObject?.template_version ||
            ''
        ).trim();

         const generationContext = artifactDataObject ? artifactDataObject._briefly_generation_context : null;
 const effectiveTemplate = generationContext && typeof generationContext === 'object' ? generationContext.effective_template : null;
 const templateCapabilities =
 effectiveTemplate && typeof effectiveTemplate === 'object' && effectiveTemplate.capabilities && typeof effectiveTemplate.capabilities === 'object'
 ? effectiveTemplate.capabilities
 : null;
 const capabilityTemplateKey =
 templateCapabilities && typeof templateCapabilities.template_key === 'string'
 ? String(templateCapabilities.template_key).trim().toLowerCase()
 : '';
 const supportsExportFromCapabilities =
 templateCapabilities && typeof templateCapabilities.supports_export === 'boolean'
 ? Boolean(templateCapabilities.supports_export)
 : false;
 const fallbackTemplateType = docType ? docType : inferredDocType;
 const exportableType = artifactDataObject ? (capabilityTemplateKey ? capabilityTemplateKey : fallbackTemplateType) : null;
 let exportableData: any = null;
 if (exportableType && artifactDataObject) {
 if (supportsExportFromCapabilities) exportableData = artifactDataObject;
 else if (docType) exportableData = artifactDataObject;
 }



        return (
            <div className="space-y-4 text-xs sm:text-sm">
                <div className="rounded-xl border border-border/60 bg-card/70 p-3 sm:p-4 shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">JSON Artifact</p>
                            <p className="text-sm font-semibold text-foreground truncate" title={artifact.title}>
                                {artifact.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                {docType ? `${docType}` : 'json'}
                                {schemaVersion ? ` · v${schemaVersion}` : ''}
                                {updatedAtLabel ? ` · Updated ${updatedAtLabel}` : ''}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {exportableData && exportableType && (
                                <>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        className="h-8 rounded-full px-3 text-[11px] gap-1"
                                        onClick={() => setSaveGeneratedDialogOpen(true)}
                                    >
                                        <File className="h-3 w-3" /> Save
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 rounded-full px-3 text-[11px] gap-1"
                                        onClick={async () => {
                                            try {
                                                // Use /document/pdf/v2 (backend HTML renderer)
                                                // Renderer may be browser_api/weasyprint/xhtml2pdf based on pyserver config
                                                const { downloadDocumentPdfV2 } = await import('@/lib/invoice-export');
                                                const rendering = (exportableData as any)?._briefly_generation_context?.effective_template?.rendering;
                                                await downloadDocumentPdfV2({
                                                    templateType: exportableType,
                                                    data: exportableData,
                                                    htmlTemplate: rendering?.html_template ?? null,
                                                    css: rendering?.css ?? null,
                                                    branding: rendering?.branding ?? null,
                                                });
                                            } catch (e) {
                                                console.error('PDF export failed:', e);
                                            }
                                        }}
                                    >
                                        <Download className="h-3 w-3" /> PDF
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 rounded-full px-3 text-[11px] gap-1"
                                        onClick={async () => {
                                            try {
                                                const { downloadDocumentDocx } = await import('@/lib/document-export');
                                                await downloadDocumentDocx(exportableType, exportableData);
                                            } catch (e) {
                                                console.error('DOCX export failed:', e);
                                            }
                                        }}
                                    >
                                        <Download className="h-3 w-3" /> DOCX
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {exportableData && exportableType && (() => {
                    const rendering = (exportableData as any)?._briefly_generation_context?.effective_template?.rendering;
                    const htmlTemplate =
                        typeof rendering?.html_template === 'string' && rendering.html_template.trim()
                            ? rendering.html_template
                            : '';
                    const renderingMetaTruncated =
                        !!rendering?._truncated ||
                        !!rendering?._html_template_truncated;

                    return (
                        <div className="space-y-2">
                            {renderingMetaTruncated ? (
                                <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                                    This artifact contains truncated template metadata, so the preview is using the generic pyserver fallback.
                                </div>
                            ) : null}
                            {!htmlTemplate && !renderingMetaTruncated ? (
                                <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                                    Using the generic template preview because this artifact has no stored HTML template yet.
                                </div>
                            ) : null}
                            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                                <div className="text-[11px] text-muted-foreground">
                                    Preview scale: {Math.round(artifactPreviewZoom * 100)}%
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setArtifactPreviewZoom((current) => Math.max(0.45, Number((current - 0.1).toFixed(2))))}>
                                        -
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setArtifactPreviewZoom(0.6)}>
                                        Reset
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setArtifactPreviewZoom((current) => Math.min(1.4, Number((current + 0.1).toFixed(2))))}>
                                        +
                                    </Button>
                                </div>
                            </div>
                            <div className="rounded-lg border border-border/50 bg-card/60 shadow-sm overflow-auto">
                                <div className="origin-top-left" style={{ zoom: artifactPreviewZoom }}>
                                    <HtmlDocumentPreview
                                        templateType={exportableType}
                                        htmlTemplate={htmlTemplate}
                                        css={rendering?.css ?? null}
                                        data={exportableData}
                                        branding={rendering?.branding ?? null}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* 
                <section className="rounded-xl border border-border/60 bg-muted/10 p-3 sm:p-4 shadow-sm">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Raw JSON</div>
                    <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground font-mono overflow-x-auto">
                        {jsonText}
                    </pre>
                </section>
                */}

                {artifact.sourceMessageId ? (
                    <p className="px-1 text-[11px] text-muted-foreground">
                        Linked to response <span className="font-mono">{artifact.sourceMessageId}</span>
                    </p>
                ) : null}

                {exportableData && exportableType ? (
                    <SaveGeneratedDocumentDialog
                        open={saveGeneratedDialogOpen}
                        onOpenChange={setSaveGeneratedDialogOpen}
                        templateType={exportableType}
                        data={exportableData}
                        artifactTitle={artifact.title}
                        ephemeralArtifactId={artifact.persistedArtifactId || null}
                        allDocuments={allDocuments}
                        allFolders={allFolders}
                    />
                ) : null}
            </div>
        );
    };

    const renderSourcesTab = () => {
        // Deduplicate citations based on URL or DocID
        const uniqueCitations = citations.filter((c, index, self) => {
            const key = getCitationKey(c);
            if (!key) return false;
            return index === self.findIndex((t) => getCitationKey(t) === key);
        });
        const scopeLabel = citationsMode === 'message'
            ? 'Sources referenced in this answer.'
            : 'Sources referenced across this conversation.';
        if (uniqueCitations.length === 0) {
            return <ActionCenterEmptyState type="sources" />;
        }

        return (
            <div className="space-y-4 text-xs sm:text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                    <div className="space-y-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-foreground">Reference Catalog</p>
                        <p className="text-[11px] text-muted-foreground font-medium">
                            {scopeLabel}
                        </p>
                    </div>
                    <div className="inline-flex rounded-full bg-muted/60 p-1 border border-border/40">
                        <button
                            type="button"
                            className={cn(
                                "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all duration-200",
                                citationsMode === 'message'
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground/60 hover:text-muted-foreground"
                            )}
                            onClick={() => hasMessageScopedCitations && onCitationsModeChange('message')}
                            disabled={!hasMessageScopedCitations}
                            aria-pressed={citationsMode === 'message'}
                        >
                            Active
                        </button>
                        <button
                            type="button"
                            className={cn(
                                "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all duration-200",
                                citationsMode === 'global'
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground/60 hover:text-muted-foreground"
                            )}
                            onClick={() => onCitationsModeChange('global')}
                            aria-pressed={citationsMode === 'global'}
                        >
                            Full History
                        </button>
                    </div>
                </div>
                <div className="grid gap-3">
                    {uniqueCitations.map((citation, idx) => {
                        const isDoc = !!citation.docId;
                        let title = citation.title || citation.docName;
                        if (!title && citation.url) {
                            try { title = new URL(citation.url).hostname.replace(/^www\./, ''); } catch { title = citation.url; }
                        }
                        if (!title && citation.fields) {
                            title = citation.fields.title || citation.fields.subject || citation.fields.name || citation.fields.file_name;
                        }
                        // filename from pyserver source (e.g. 'researchpaper1.pdf')
                        if (!title) {
                            title = ((citation as any).filename) || (citation.docId ? `Doc Reference` : 'External Source');
                        }
                        const snippet = citation.snippet || citation.fields?.description;
                        const anchorStatus = String(citation.anchorStatus || '').toLowerCase();
                        const statusBadge =
                            anchorStatus === 'unresolved'
                                ? { label: 'Unlinked', className: 'bg-rose-500/10 text-rose-700 border-rose-500/20' }
                                : anchorStatus === 'partial'
                                    ? { label: 'Incomplete', className: 'bg-amber-500/10 text-amber-700 border-amber-500/20' }
                                    : anchorStatus === 'resolved'
                                        ? { label: 'Verified', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' }
                                        : null;

                        return (
                            <div
                                key={`${getCitationKey(citation)}-${idx}`}
                                className="group relative cursor-pointer overflow-auto rounded-2xl border border-border/40 bg-card/40 p-4 transition-all duration-300 hover:border-primary/30 hover:bg-card hover:shadow-md active:scale-[0.98]"
                                onClick={() => {
                                    if (isDoc && citation.docId) {
                                        onSelectCitation?.(citation);
                                        onSelectDocument(citation.docId);
                                    } else if (citation.url) {
                                        window.open(citation.url, '_blank');
                                    }
                                }}
                            >
                                <div className="absolute right-0 top-0 p-3 opacity-0 transition-opacity group-hover:opacity-100">
                                    <ChevronRight className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex items-start gap-4">
                                    <div className="mt-0.5 rounded-xl bg-muted p-2.5 text-muted-foreground shadow-inner transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                                        {isDoc ? <FileText className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                                    </div>
                                    <div className="flex-1 space-y-1.5 min-w-0 pr-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-bold text-[13px] leading-tight text-foreground truncate max-w-full" title={title}>
                                                {title}
                                            </p>
                                            {statusBadge && (
                                                <Badge variant="outline" className={cn("h-4 rounded-full text-[8px] font-black uppercase tracking-tighter px-1.5 border-none", statusBadge.className)}>
                                                    {statusBadge.label}
                                                </Badge>
                                            )}
                                        </div>
                                        {snippet && (
                                            <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2 break-words">
                                                {snippet}
                                            </p>
                                        )}
                                        {!isDoc && citation.url && (
                                            <p className="text-[10px] text-primary/70 font-medium truncate pt-1 flex items-center gap-1">
                                                <ExternalLink className="h-2.5 w-2.5" />
                                                {citation.url}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (!mounted) return null;

    const panel = (
        <div
            className={cn(
                'flex max-w-full min-h-0',
                isPinned
                    ? `pointer-events-auto relative z-0 h-[100dvh] md:h-svh self-stretch overflow-hidden flex-none shrink-0 ${panelWidthClassName}` // Keep pinned mode on its own scroll root
                    : 'pointer-events-none fixed inset-y-0 right-0 z-40' // Keep below app dialogs (z-50) so modals open above Action Center
            )}
            style={panelStyle}
            aria-hidden={!open}
        >
            <div
                className={cn(
                    `pointer-events-auto relative flex h-full min-h-0 flex-none shrink-0 ${panelWidthClassName} flex-col overflow-hidden border-l border-border bg-background shadow-2xl`,
                    !isResizingPanel && 'transition-[transform,width] duration-300 ease-in-out',
                    isPinned
                        ? 'translate-x-0' // When pinned, always visible
                        : (open ? 'translate-x-0' : 'translate-x-full') // When overlay, slide based on open state
                )}
            >
                {onPanelWidthChange ? (
                    <div
                        className="group absolute bottom-0 left-0 top-0 z-20 hidden w-3 cursor-col-resize items-center lg:flex"
                        onMouseDown={startResizing}
                        title="Drag to resize"
                    >
                        <div
                            className={cn(
                                'absolute inset-y-0 left-0 w-[3px] transition-colors',
                                isResizingPanel ? 'bg-primary/60' : 'bg-transparent group-hover:bg-primary/30'
                            )}
                        />
                        <div
                            className={cn(
                                'relative -left-1.5 flex h-8 w-5 items-center justify-center rounded-md border border-border/60 bg-background shadow-sm transition-all',
                                isResizingPanel
                                    ? 'opacity-100 border-primary/40 bg-primary/5'
                                    : 'opacity-0 group-hover:opacity-100'
                            )}
                        >
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                    </div>
                ) : null}
                <div className="flex items-center justify-between border-b px-3 sm:px-4 py-3 text-sm">
                    <p className="font-medium text-muted-foreground">Action Center</p>
                    <div className="flex items-center gap-1">
                        {onPinnedChange && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-7 w-7",
                                    isPinned && "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                                )}
                                onClick={() => onPinnedChange(!isPinned)}
                                title={isPinned ? "Unpin panel" : "Pin panel"}
                            >
                                <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current")} />
                                <span className="sr-only">{isPinned ? "Unpin" : "Pin"} panel</span>
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onOpenChange(false)}
                        >
                            <X className="h-3.5 w-3.5" />
                            <span className="sr-only">Close panel</span>
                        </Button>
                    </div>
                </div>

                <Tabs
                    value={activeTab}
                    onValueChange={(val) => onTabChange(val as ActionCenterTab)}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                    <div className="px-4 py-3 border-b bg-muted/5 flex items-center justify-center">
                        <TabsList className="flex w-full items-center justify-between rounded-2xl bg-muted/40 p-1 border border-border/20 shadow-inner max-w-sm">
                            <TabsTrigger value="sources" className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground transition-all">Sources</TabsTrigger>
                            <TabsTrigger value="preview" className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground transition-all">Preview</TabsTrigger>
                            <TabsTrigger value="json" className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground transition-all">Artifact</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="relative flex-1 min-h-0 overflow-hidden">

                        <TabsContent value="json" className="m-0 h-full min-h-0">
                            <ScrollArea className="h-full min-h-0">
                                <div className="p-3 sm:p-4 space-y-4 text-xs sm:text-sm">
                                    {renderJsonTab()}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="sources" className="m-0 h-full min-h-0">
                            <ScrollArea className="h-full min-h-0">
                                <div className="p-3 sm:p-4 space-y-4 text-xs sm:text-sm">
                                    {renderSourcesTab()}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="preview" className="m-0 h-full min-h-0">
                            <ScrollArea className="h-full min-h-0">
                                <div className="p-3 sm:p-4 space-y-4 text-xs sm:text-sm">
                                    {renderPreviewTab()}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                    </div>
                </Tabs>
            </div>
        </div>
    );

    // Only use portal for overlay mode, render inline when pinned
    if (isPinned) {
        return panel;
    }

    return createPortal(panel, document.body);
}

