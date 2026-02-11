"use client";

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Database, FileText, CheckCircle2, XCircle, AlertCircle, RefreshCw, Copy } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatAppDateTime } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

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
    doc_type_key?: string;
    doc_type?: string;
    doc_type_id?: string;
    doc_type_confidence?: number;
    extracted_metadata?: Record<string, any>;
    content?: string;
    page?: number;
    page_number?: number;
    chunk_index?: number;
    chunk_sequence?: number;
    chunk_level?: number;
    chunk_type?: string;
    is_leaf?: boolean;
    embedding?: VespaEmbedding;
    embedding_model?: string | null;
    bbox_x?: number | null;
    bbox_y?: number | null;
    bbox_width?: number | null;
    bbox_height?: number | null;
    bbox_normalized?: number[] | null;
    element_type?: string | null;
    reading_order?: number | null;
    icp_type?: string;
    [key: string]: any;
  };
}

interface VespaDocumentData {
  document: {
    id: string;
    title: string;
    filename: string;
    doc_type_key?: string;
    doc_type_id?: string;
    doc_type_confidence?: number;
    extracted_metadata?: Record<string, any>;
    vespa_indexed_at?: string;
    vespa_status?: {
      status?: string;
      last_indexed_at?: string;
      chunk_count?: number;
      success_count?: number;
      error_count?: number;
    };
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

export default function VespaViewerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VespaDocumentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const docId = params.id;

  const fetchVespaData = async () => {
    try {
      setLoading(true);
      setError(null);
      const { orgId } = getApiContext();
      const response = await apiFetch(`/orgs/${orgId}/vespa/documents/${docId}?include_embeddings=true`);
      setData(response);
    } catch (err: any) {
      console.error('Failed to fetch Vespa data:', err);
      if (err.status === 404) {
        setError('Document not found in Vespa. It may not have been indexed yet.');
      } else if (err.status === 403) {
        setError('Vespa is not enabled for this organization.');
      } else {
        setError(err.message || 'Failed to fetch Vespa data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchVespaData();
    setRefreshing(false);
    toast({
      title: 'Refreshed',
      description: 'Vespa data refreshed successfully',
    });
  };

  useEffect(() => {
    if (docId) {
      fetchVespaData();
    }
  }, [docId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Copied to clipboard',
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
          <PageHeader title="Vespa Data Viewer" />
          <div className="px-1 sm:px-4 md:px-6 space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
          <PageHeader title="Vespa Data Viewer" backHref={`/documents/${docId}`} />
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

  if (!data) {
    return null;
  }

  const chunks = data.chunks || [];
  const totalChunks = data.total_chunks || chunks.length;
  const hasEmbedding = (embedding: VespaEmbedding | undefined | null) => {
    if (Array.isArray(embedding) && embedding.length > 0) return true;
    if (embedding && typeof embedding === 'object') {
      const obj: any = embedding;
      if (Array.isArray(obj.values) && obj.values.length > 0) return true;
      if (Array.isArray(obj.cells) && obj.cells.length > 0) return true;
    }
    return false;
  };
  const embeddingDim = (embedding: VespaEmbedding | undefined | null) => {
    if (Array.isArray(embedding)) return embedding.length;
    if (embedding && typeof embedding === 'object') {
      const obj: any = embedding;
      if (Array.isArray(obj.values)) return obj.values.length;
      if (Array.isArray(obj.cells)) return obj.cells.length;
    }
    return 0;
  };
  const hasLayout = (fields: VespaChunk['fields']) =>
    fields.bbox_x !== null && fields.bbox_x !== undefined
    && fields.bbox_y !== null && fields.bbox_y !== undefined;
  const embeddableChunks = chunks.filter(chunk => (chunk.fields.is_leaf ?? (chunk.fields.chunk_level ?? 0) > 0));
  const embeddedChunks = embeddableChunks.filter(chunk => hasEmbedding(chunk.fields.embedding));
  const embeddingCoverage = embeddableChunks.length
    ? Math.round((embeddedChunks.length / embeddableChunks.length) * 100)
    : 0;
  const doclingChunks = chunks.filter(chunk => hasLayout(chunk.fields));
  const doclingCoverage = totalChunks
    ? Math.round((doclingChunks.length / totalChunks) * 100)
    : 0;
  const sampleEmbedding = embeddedChunks.find(chunk => hasEmbedding(chunk.fields.embedding));
  const sampleDocling = doclingChunks[0];
  const metadataEntries = Object.entries(data.document.extracted_metadata || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 16);
  const baseFieldKeys = new Set([
    'chunk_id',
    'doc_id',
    'org_id',
    'doc_type',
    'doc_type_key',
    'doc_type_id',
    'doc_type_confidence',
    'file_name',
    'file_extension',
    'file_size_bytes',
    'upload_timestamp',
    'process_timestamp',
    'chunk_type',
    'chunk_sequence',
    'global_sequence',
    'chunk_level',
    'parent_chunk_id',
    'heading_text',
    'heading_path',
    'content',
    'content_clean',
    'content_length',
    'word_count',
    'sentence_count',
    'embedding',
    'embedding_model',
    'page_number',
    'page',
    'page_width',
    'page_height',
    'bbox_x',
    'bbox_y',
    'bbox_width',
    'bbox_height',
    'bbox_normalized',
    'element_type',
    'reading_order',
    'is_table',
    'is_leaf',
    'relevance',
    'fields',
  ]);
  const vespaMetadataEntries = chunks.reduce<Record<string, string | number | boolean>>((acc, chunk) => {
    Object.entries(chunk.fields || {}).forEach(([key, value]) => {
      if (baseFieldKeys.has(key) || key.startsWith('_')) return;
      if (value === null || value === undefined || value === '') return;
      if (typeof value === 'object') return;
      if (acc[key] === undefined) acc[key] = value as string | number | boolean;
    });
    return acc;
  }, {});
  const vespaMetadataList = Object.entries(vespaMetadataEntries).slice(0, 16);

  return (
    <AppLayout>
      <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
        <PageHeader
          title="Vespa Data Viewer"
          backHref={`/documents/${docId}`}
          actions={(
            <Button onClick={handleRefresh} variant="outline" size="sm" disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}
        />

        <div className="px-1 sm:px-4 md:px-6 space-y-6">
          {/* Document Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Document Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Title</p>
                  <p className="text-sm">{data.document.title || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Filename</p>
                  <p className="text-sm">{data.document.filename || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Document ID</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono break-all">{data.document.id}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyToClipboard(data.document.id)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Document Type</p>
                  <div className="flex items-center gap-2">
                    {data.document.doc_type_key ? (
                      <>
                        <Badge variant="outline">{data.document.doc_type_key}</Badge>
                        {data.document.doc_type_confidence && (
                          <span className="text-xs text-muted-foreground">
                            ({Math.round(data.document.doc_type_confidence * 100)}%)
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not classified</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Embedding Model</p>
                  <p className="text-sm">
                    {sampleEmbedding?.fields.embedding_model || (sampleEmbedding ? 'text-embedding-3-small' : 'Not available')}
                  </p>
                </div>
              </div>

              {(metadataEntries.length > 0 || vespaMetadataList.length > 0) && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">Indexed Metadata</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-md border bg-muted/40 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Document Metadata</p>
                      {metadataEntries.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No extracted metadata stored.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {metadataEntries.map(([key, value]) => (
                            <Badge key={key} variant="secondary" className="gap-1">
                              <span className="text-[11px] uppercase tracking-wide">{key}</span>
                              <span className="text-xs font-normal">{String(value)}</span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-md border bg-muted/40 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Vespa Fields</p>
                      {vespaMetadataList.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No Vespa field values detected yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {vespaMetadataList.map(([key, value]) => (
                            <Badge key={key} variant="outline" className="gap-1">
                              <span className="text-[11px] uppercase tracking-wide">{key}</span>
                              <span className="text-xs font-normal">{String(value)}</span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Index Signals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Embedding Coverage</span>
                    <span className="font-medium">{embeddedChunks.length}/{embeddableChunks.length || totalChunks}</span>
                  </div>
                  <Progress value={embeddingCoverage} />
                  <p className="text-xs text-muted-foreground">
                    {embeddingCoverage}% of embeddable chunks include vectors{sampleEmbedding ? ` • ${embeddingDim(sampleEmbedding.fields.embedding)} dim` : ''}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Docling Layout Coverage</span>
                    <span className="font-medium">{doclingChunks.length}/{totalChunks}</span>
                  </div>
                  <Progress value={doclingCoverage} />
                  <p className="text-xs text-muted-foreground">
                    {doclingCoverage}% of chunks include layout coordinates
                  </p>
                </div>
              </div>
              {sampleDocling ? (
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Docling Layout Sample</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-[11px] uppercase text-muted-foreground">Page</p>
                      <p>{sampleDocling.fields.page_number ?? sampleDocling.fields.page ?? 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase text-muted-foreground">Element Type</p>
                      <p>{sampleDocling.fields.element_type || 'text'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase text-muted-foreground">BBox</p>
                      <p>
                        {sampleDocling.fields.bbox_x?.toFixed?.(1)}, {sampleDocling.fields.bbox_y?.toFixed?.(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase text-muted-foreground">Size</p>
                      <p>
                        {sampleDocling.fields.bbox_width?.toFixed?.(1)} × {sampleDocling.fields.bbox_height?.toFixed?.(1)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No Docling layout fields detected in Vespa chunks yet.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vespa Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Vespa Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                {data.vespa_enabled ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-sm">Vespa is enabled</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="text-sm">Vespa is not enabled</span>
                  </>
                )}
              </div>

              {/* Sync Status Warning */}
              {data.sync_status && !data.sync_status.in_sync && (
                <Alert
                  variant="default"
                  className="border-amber-500/30 [&>svg]:text-amber-600"
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Sync Mismatch Detected</AlertTitle>
                  <AlertDescription>
                    <div className="space-y-1 text-sm">
                      <p>• Vespa has data: {data.sync_status.has_vespa_data ? 'Yes' : 'No'}</p>
                      <p>• Database vespa_indexed_at: {data.sync_status.db_indexed ? 'Set' : 'NULL'}</p>
                      <p>• Metadata vespa.status: {data.sync_status.metadata_indexed ? 'indexed' : 'Not set'}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        This indicates Vespa ingestion succeeded but the database wasn't updated. The document is indexed in Vespa.
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Chunks in Vespa</p>
                  <p className="text-2xl font-bold">{totalChunks}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Database Indexed At</p>
                  <p className="text-sm">
                    {data.document.vespa_indexed_at
                      ? formatAppDateTime(data.document.vespa_indexed_at)
                      : 'Not set'}
                  </p>
                </div>
              </div>

              {data.document.vespa_status && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Metadata Status</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">Status: <Badge variant="outline">{data.document.vespa_status.status || 'unknown'}</Badge></div>
                    {data.document.vespa_status.last_indexed_at && (
                      <p>Last Indexed: {formatAppDateTime(data.document.vespa_status.last_indexed_at)}</p>
                    )}
                    {data.document.vespa_status.chunk_count !== undefined && (
                      <p>Chunk Count: {data.document.vespa_status.chunk_count}</p>
                    )}
                    {data.document.vespa_status.success_count !== undefined && (
                      <p>Success Count: {data.document.vespa_status.success_count}</p>
                    )}
                    {data.document.vespa_status.error_count !== undefined && data.document.vespa_status.error_count > 0 && (
                      <p className="text-destructive">Error Count: {data.document.vespa_status.error_count}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vespa Chunks */}
          <Card>
            <CardHeader>
              <CardTitle>Vespa Chunks ({chunks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {chunks.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No Chunks Found</AlertTitle>
                  <AlertDescription>
                    This document has not been indexed to Vespa yet. Chunks will appear here after ingestion.
                  </AlertDescription>
                </Alert>
              ) : (
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="chunks">All Chunks</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm font-medium text-muted-foreground">Total Chunks</p>
                          <p className="text-2xl font-bold">{chunks.length}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm font-medium text-muted-foreground">Classified Chunks</p>
                          <p className="text-2xl font-bold">
                            {chunks.filter(c => c.fields.doc_type_key || c.fields.doc_type).length}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm font-medium text-muted-foreground">Avg Confidence</p>
                          <p className="text-2xl font-bold">
                            {chunks
                              .filter(c => c.fields.doc_type_confidence)
                              .reduce((acc, c) => acc + (c.fields.doc_type_confidence || 0), 0) /
                              chunks.filter(c => c.fields.doc_type_confidence).length || 0
                              ? Math.round(
                                (chunks
                                  .filter(c => c.fields.doc_type_confidence)
                                  .reduce((acc, c) => acc + (c.fields.doc_type_confidence || 0), 0) /
                                  chunks.filter(c => c.fields.doc_type_confidence).length) *
                                100
                              )
                              : 'N/A'}
                            {chunks.filter(c => c.fields.doc_type_confidence).length > 0 ? '%' : ''}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardContent className="pt-6 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Embedding Coverage</span>
                            <span className="font-medium">{embeddedChunks.length}/{embeddableChunks.length || totalChunks}</span>
                          </div>
                          <Progress value={embeddingCoverage} />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Docling Layout Coverage</span>
                            <span className="font-medium">{doclingChunks.length}/{totalChunks}</span>
                          </div>
                          <Progress value={doclingCoverage} />
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="chunks" className="space-y-4">
                    {chunks.map((chunk, index) => (
                      <Card key={chunk.chunk_id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">
                              Chunk {index + 1} - {chunk.chunk_id}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              <Badge variant={hasEmbedding(chunk.fields.embedding) ? 'default' : 'outline'}>
                                {hasEmbedding(chunk.fields.embedding) ? 'Embedding' : 'No Embedding'}
                              </Badge>
                              <Badge variant={hasLayout(chunk.fields) ? 'default' : 'outline'}>
                                {hasLayout(chunk.fields) ? 'Docling' : 'No Layout'}
                              </Badge>
                              {chunk.relevance && (
                                <Badge variant="outline">Relevance: {chunk.relevance.toFixed(3)}</Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(JSON.stringify(chunk, null, 2))}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(chunk.fields.doc_type_key || chunk.fields.doc_type) && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Document Type</p>
                                <Badge variant="outline">{chunk.fields.doc_type_key || chunk.fields.doc_type}</Badge>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Embedding</p>
                              <div className="flex items-center gap-2 text-sm">
                                {hasEmbedding(chunk.fields.embedding) ? (
                                  <>
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    <span>{embeddingDim(chunk.fields.embedding)} dim</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">Missing</span>
                                  </>
                                )}
                              </div>
                            </div>
                            {chunk.fields.doc_type_confidence && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Confidence</p>
                                <p className="text-sm">
                                  {Math.round(chunk.fields.doc_type_confidence * 100)}%
                                </p>
                              </div>
                            )}
                            {(chunk.fields.page_number !== undefined || chunk.fields.page !== undefined) && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Page</p>
                                <p className="text-sm">{chunk.fields.page_number ?? chunk.fields.page}</p>
                              </div>
                            )}
                            {(chunk.fields.chunk_sequence !== undefined || chunk.fields.chunk_index !== undefined) && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Chunk Index</p>
                                <p className="text-sm">{chunk.fields.chunk_sequence ?? chunk.fields.chunk_index}</p>
                              </div>
                            )}
                          </div>

                          {hasLayout(chunk.fields) && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Docling Layout</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div>
                                  <p className="text-[11px] uppercase text-muted-foreground">Element</p>
                                  <p>{chunk.fields.element_type || 'text'}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase text-muted-foreground">Reading Order</p>
                                  <p>{chunk.fields.reading_order ?? 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase text-muted-foreground">BBox</p>
                                  <p>
                                    {chunk.fields.bbox_x?.toFixed?.(1)}, {chunk.fields.bbox_y?.toFixed?.(1)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase text-muted-foreground">Size</p>
                                  <p>
                                    {chunk.fields.bbox_width?.toFixed?.(1)} × {chunk.fields.bbox_height?.toFixed?.(1)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {chunk.fields.extracted_metadata &&
                            Object.keys(chunk.fields.extracted_metadata).length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  Extracted Metadata
                                </p>
                                <div className="bg-muted p-2 rounded-md">
                                  <pre className="text-xs overflow-auto">
                                    {JSON.stringify(chunk.fields.extracted_metadata, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}

                          {chunk.fields.content && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Content Preview</p>
                              <div className="bg-muted p-3 rounded-md">
                                <p className="text-xs line-clamp-4">{chunk.fields.content}</p>
                              </div>
                            </div>
                          )}

                          <details className="mt-2">
                            <summary className="text-xs font-medium text-muted-foreground cursor-pointer">
                              View Full Chunk Data
                            </summary>
                            <div className="mt-2 bg-muted p-3 rounded-md">
                              <pre className="text-xs overflow-auto">
                                {JSON.stringify(chunk, null, 2)}
                              </pre>
                            </div>
                          </details>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
