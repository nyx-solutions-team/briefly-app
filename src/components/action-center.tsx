'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, AlertCircle, X, FileText, Globe, Eye, Layers, Quote, File } from 'lucide-react';
import FilePreview from '@/components/file-preview';
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
};

export type ActionCenterTab = 'sources' | 'preview' | 'context';

type ActionCenterProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeDocumentId: string | null;
    onSelectDocument: (docId: string) => void;
    memoryDocIds: string[];
    citations: CitationMeta[];
    citationsMode: 'global' | 'message';
    onCitationsModeChange: (mode: 'global' | 'message') => void;
    hasMessageScopedCitations: boolean;
    allDocuments: StoredDocument[];
    activeTab: ActionCenterTab;
    onTabChange: (tab: ActionCenterTab) => void;
};

export function ActionCenter({
    open,
    onOpenChange,
    activeDocumentId,
    onSelectDocument,
    memoryDocIds,
    citations,
    citationsMode,
    onCitationsModeChange,
    hasMessageScopedCitations,
    allDocuments,
    activeTab,
    onTabChange,
}: ActionCenterProps) {
    const { getDocumentById } = useDocuments();
    const [docRecord, setDocRecord] = useState<StoredDocument | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const lastPreviewDocId = useRef<string | null>(null);

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
                        <div className="min-w-0 space-y-1">
                            <h2 className="text-base sm:text-lg font-semibold text-foreground break-words">{primaryTitle}</h2>
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
                    <FilePreview
                        documentId={docRecord.id}
                        mimeType={(docRecord as any).mimeType}
                        extractedContent={docRecord.content || (docRecord as any).extractedContent}
                        className="border-0 shadow-none"
                        showTitle={false}
                        showMetaInfo={false}
                    />
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
                                    <div className="space-y-1 overflow-hidden">
                                        <p className="font-medium leading-none truncate">{title}</p>
                                        <p className="text-muted-foreground truncate">
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
        const uniqueCitations = citations.filter((c, index, self) =>
            index === self.findIndex((t) => (
                (t.docId && t.docId === c.docId) ||
                (t.url && t.url === c.url)
            ))
        );
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
                <div className="grid gap-3">
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

                        return (
                            <Card
                                key={`${citation.docId || citation.url}-${idx}`}
                                className="cursor-pointer transition-all hover:bg-accent/40 rounded-xl"
                                onClick={() => {
                                    if (isDoc && citation.docId) {
                                        onSelectDocument(citation.docId);
                                    } else if (citation.url) {
                                        window.open(citation.url, '_blank');
                                    }
                                }}
                            >
                                <CardContent className="p-3 sm:p-4 flex items-start gap-3 text-xs sm:text-sm">
                                    <div className="mt-1 rounded-md bg-muted p-2 text-muted-foreground">
                                        {isDoc ? <FileText className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                                    </div>
                                    <div className="space-y-1 overflow-hidden">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium leading-none truncate">{title}</p>
                                            {!isDoc && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                                        </div>
                                        {snippet && (
                                            <p className="text-muted-foreground line-clamp-2">
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
                'pointer-events-none fixed inset-y-0 right-0 z-50 flex max-w-full transition-all duration-300'
            )}
            aria-hidden={!open}
        >
            <div
                className={cn(
                    'pointer-events-auto flex h-full w-full max-w-full flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-in-out sm:max-w-[420px] lg:w-[clamp(360px,40vw,560px)]',
                    open ? 'translate-x-0' : 'translate-x-full'
                )}
            >
                <div className="flex items-center justify-between border-b px-3 sm:px-4 py-3 text-sm">
                    <p className="font-medium text-muted-foreground">Action Center</p>
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

    return createPortal(panel, document.body);
}
