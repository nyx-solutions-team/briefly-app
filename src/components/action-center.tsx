'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, AlertCircle, X, FileText, Globe, Eye, Layers, Quote, File, Pin } from 'lucide-react';
import FilePreview from '@/components/file-preview';
import { DoclingPreview } from '@/components/docling-preview';
import ReactMarkdown from 'react-markdown';
import { useDocuments } from '@/hooks/use-documents';
import { apiFetch, getApiContext } from '@/lib/api';
import type { StoredDocument } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';

export type CitationMeta = {
    docId?: string | null;
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

export type ActionCenterTab = 'sources' | 'preview' | 'context';

export type GeneratedPdfPreview = {
    title?: string;
    fileName?: string;
    previewUrl: string;
    downloadUrl?: string;
    expiresAt?: string;
};

type ActionCenterProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isPinned?: boolean;
    onPinnedChange?: (pinned: boolean) => void;
    activeDocumentId: string | null;
    activeDocumentPage?: number | null;
    onSelectDocument: (docId: string) => void;
    onSelectCitation?: (citation: CitationMeta) => void;
    activeCitation?: CitationMeta | null;
    memoryDocIds: string[];
    citations: CitationMeta[];
    citationsMode: 'global' | 'message';
    onCitationsModeChange: (mode: 'global' | 'message') => void;
    hasMessageScopedCitations: boolean;
    allDocuments: StoredDocument[];
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
    activeDocumentId,
    activeDocumentPage = null,
    onSelectDocument,
    onSelectCitation,
    activeCitation = null,
    memoryDocIds,
    citations,
    citationsMode,
    onCitationsModeChange,
    hasMessageScopedCitations,
    allDocuments,
    generatedPdfPreview = null,
    onClearGeneratedPdfPreview,
    activeTab,
    onTabChange,
}: ActionCenterProps) {
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
                                {onClearGeneratedPdfPreview ? (
                                    <Button variant="outline" size="sm" className="h-8" onClick={onClearGeneratedPdfPreview}>
                                        Back To Docs
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </section>
                    <section className="rounded-lg border border-border/50 bg-card/60 p-0 shadow-sm overflow-hidden">
                        <iframe
                            src={generatedPdfPreview.previewUrl}
                            title={generatedPdfPreview.title || 'Generated PDF Preview'}
                            className="h-[70vh] w-full border-0"
                        />
                    </section>
                </div>
            );
        }

        if (!activeDocumentId) {
            return (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 opacity-20" />
                    <p>Select a document to preview</p>
                </div>
            );
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

                <section className="rounded-lg border border-border/50 bg-card/60 p-0 shadow-sm overflow-hidden">
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

    const renderContextTab = () => {
        if (memoryDocIds.length === 0) {
            return (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-muted-foreground text-center">
                    <Layers className="h-10 w-10 opacity-20" />
                    <p>No documents in active memory.</p>
                    <p className="text-xs">Documents you discuss will appear here.</p>
                </div>
            );
        }

        return (
            <div className="space-y-4 text-xs sm:text-sm">
                <p className="text-[11px] text-muted-foreground px-1">
                    These documents are currently in the AI's short-term memory.
                </p>
                <div className="grid gap-3">
                    {memoryDocIds.map((id) => {
                        const doc = allDocuments.find(d => d.id === id);
                        const title = doc?.title || doc?.name || 'Unknown Document';
                        const isActive = id === activeDocumentId;

                        return (
                            <Card
                                key={id}
                                className={cn(
                                    "cursor-pointer transition-all hover:bg-accent/40 rounded-xl",
                                    isActive && "border-primary/50 bg-accent/30"
                                )}
                                onClick={() => onSelectDocument(id)}
                            >
                                <CardContent className="p-3 sm:p-4 flex items-start gap-3 text-xs sm:text-sm">
                                    <div className="mt-1 rounded-md bg-primary/10 p-2 text-primary">
                                        <FileText className="h-4 w-4" />
                                    </div>
                                    <div className="space-y-1 overflow-hidden flex-1 min-w-0">
                                        <p className="font-medium leading-snug line-clamp-2 break-all">{title}</p>
                                        <p className="text-muted-foreground line-clamp-1 break-all text-xs">
                                            {doc?.filename || id.slice(0, 8)}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
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
            return (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-muted-foreground text-center">
                    <Quote className="h-10 w-10 opacity-20" />
                    <p>No sources cited yet.</p>
                    <p className="text-xs">Citations from the AI's responses will appear here.</p>
                </div>
            );
        }

        return (
            <div className="space-y-4 text-xs sm:text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground px-1">
                        {scopeLabel}
                    </p>
                    <div className="inline-flex rounded-full bg-muted/50 p-0.5">
                        <button
                            type="button"
                            className={cn(
                                "px-2.5 py-1 text-[11px] rounded-full transition",
                                citationsMode === 'message'
                                    ? "bg-background shadow text-foreground"
                                    : "text-muted-foreground/80"
                            )}
                            onClick={() => hasMessageScopedCitations && onCitationsModeChange('message')}
                            disabled={!hasMessageScopedCitations}
                            aria-pressed={citationsMode === 'message'}
                            aria-label="Show sources for this answer"
                            title={
                                hasMessageScopedCitations
                                    ? "Show sources for this answer"
                                    : "Open a message with citations to enable"
                            }
                        >
                            This answer
                        </button>
                        <button
                            type="button"
                            className={cn(
                                "px-2.5 py-1 text-[11px] rounded-full transition",
                                citationsMode === 'global'
                                    ? "bg-background shadow text-foreground"
                                    : "text-muted-foreground/80"
                            )}
                            onClick={() => onCitationsModeChange('global')}
                            aria-pressed={citationsMode === 'global'}
                            aria-label="Show sources for entire conversation"
                        >
                            Conversation
                        </button>
                    </div>
                </div>
                <div className="flex flex-col gap-3">
                    {uniqueCitations.map((citation, idx) => {
                        const isDoc = !!citation.docId;
                        // Enhanced title extraction logic
                        let title = citation.title || citation.docName;

                        if (!title && citation.url) {
                            try {
                                title = new URL(citation.url).hostname.replace(/^www\./, '');
                            } catch {
                                title = citation.url;
                            }
                        }

                        if (!title && citation.fields) {
                            title = citation.fields.title || citation.fields.subject || citation.fields.name;
                        }

                        if (!title) {
                            title = citation.docId ? `Document ${citation.docId.slice(0, 8)}` : 'Source';
                        }
                        const snippet = citation.snippet || citation.fields?.description;
                        const anchorStatus = String(citation.anchorStatus || '').toLowerCase();
                        const statusBadge =
                            anchorStatus === 'unresolved'
                                ? { label: 'Unresolved', className: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300' }
                                : anchorStatus === 'partial'
                                    ? { label: 'Partial', className: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300' }
                                    : anchorStatus === 'resolved'
                                        ? { label: 'Resolved', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300' }
                                        : null;

                        return (
                            <Card
                                key={`${getCitationKey(citation)}-${idx}`}
                                className="cursor-pointer transition-all hover:bg-accent/40 rounded-xl overflow-hidden min-w-0"
                                onClick={() => {
                                    if (isDoc && citation.docId) {
                                        onSelectCitation?.(citation);
                                        onSelectDocument(citation.docId);
                                    } else if (citation.url) {
                                        window.open(citation.url, '_blank');
                                    }
                                }}
                            >
                                <CardContent className="p-3 sm:p-4 flex items-start gap-3 text-xs sm:text-sm">
                                    <div className="mt-1 rounded-md bg-muted p-2 text-muted-foreground shrink-0">
                                        {isDoc ? <FileText className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                                    </div>
                                    <div className="flex-1 space-y-1 min-w-0">
                                        <div className="flex items-start gap-2 w-full">
                                            <p className="font-medium leading-snug line-clamp-2 flex-1 min-w-0 break-all text-sm" title={title}>{title}</p>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {statusBadge && (
                                                    <Badge variant="outline" className={cn("rounded-full text-[10px] px-2 py-0.5 h-5", statusBadge.className)}>
                                                        {statusBadge.label}
                                                    </Badge>
                                                )}
                                                {!isDoc && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                                            </div>
                                        </div>
                                        {snippet && (
                                            <p className="text-muted-foreground line-clamp-2 text-xs break-words">
                                                {snippet}
                                            </p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
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
                'flex max-w-full transition-all duration-300',
                isPinned
                    ? 'pointer-events-auto relative z-0' // When pinned, static positioned
                    : 'pointer-events-none fixed inset-y-0 right-0 z-[9999]' // When overlay, fixed positioned with highest z-index
            )}
            aria-hidden={!open}
        >
            <div
                className={cn(
                    'pointer-events-auto flex h-full w-full max-w-full flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-in-out sm:max-w-[420px] lg:w-[clamp(360px,40vw,560px)]',
                    isPinned
                        ? 'translate-x-0' // When pinned, always visible
                        : (open ? 'translate-x-0' : 'translate-x-full') // When overlay, slide based on open state
                )}
            >
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
                    className="flex-1 flex flex-col overflow-hidden"
                >
                    <div className="px-3 sm:px-4 py-2 border-b bg-muted/10">
                        <TabsList className="grid w-full grid-cols-3 rounded-full bg-muted/30 text-xs sm:text-[13px]">
                            <TabsTrigger value="sources" className="py-1.5 rounded-full">Sources</TabsTrigger>
                            <TabsTrigger value="preview" className="py-1.5 rounded-full">Preview</TabsTrigger>
                            <TabsTrigger value="context" className="py-1.5 rounded-full">Agent Memory</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-hidden relative">
                        <TabsContent value="context" className="h-full m-0">
                            <ScrollArea className="h-full">
                                <div className="p-3 sm:p-4 space-y-4 text-xs sm:text-sm">
                                    {renderContextTab()}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="sources" className="h-full m-0">
                            <ScrollArea className="h-full">
                                <div className="p-3 sm:p-4 space-y-4 text-xs sm:text-sm">
                                    {renderSourcesTab()}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="preview" className="h-full m-0">
                            <ScrollArea className="h-full">
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
