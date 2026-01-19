"use client";

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Database, FileText, CheckCircle2, XCircle, AlertCircle, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatAppDateTime } from '@/lib/utils';

interface VespaChunk {
  chunk_id: string;
  relevance?: number;
  fields: {
    doc_id: string;
    org_id: string;
    doc_type_key?: string;
    doc_type_id?: string;
    doc_type_confidence?: number;
    extracted_metadata?: Record<string, any>;
    content?: string;
    page?: number;
    chunk_index?: number;
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
      const response = await apiFetch(`/orgs/${orgId}/vespa/documents/${docId}`);
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
          <PageHeader>
            <H1>Vespa Data Viewer</H1>
          </PageHeader>
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
          <PageHeader>
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <H1>Vespa Data Viewer</H1>
            </div>
          </PageHeader>
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

  return (
    <AppLayout>
      <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
        <PageHeader>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <H1>Vespa Data Viewer</H1>
            <Button onClick={handleRefresh} variant="outline" size="sm" disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </PageHeader>

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Title</p>
                  <p className="text-sm">{data.document.title || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Filename</p>
                  <p className="text-sm">{data.document.filename || 'N/A'}</p>
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
              </div>

              {data.document.extracted_metadata && Object.keys(data.document.extracted_metadata).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Extracted Metadata</p>
                  <div className="bg-muted p-3 rounded-md">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(data.document.extracted_metadata, null, 2)}
                    </pre>
                  </div>
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
                <Alert variant="warning">
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
                  <p className="text-2xl font-bold">{data.total_chunks}</p>
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
                    <p>Status: <Badge variant="outline">{data.document.vespa_status.status || 'unknown'}</Badge></p>
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
              <CardTitle>Vespa Chunks ({data.chunks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {data.chunks.length === 0 ? (
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
                          <p className="text-2xl font-bold">{data.chunks.length}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm font-medium text-muted-foreground">Classified Chunks</p>
                          <p className="text-2xl font-bold">
                            {data.chunks.filter(c => c.fields.doc_type_key).length}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm font-medium text-muted-foreground">Avg Confidence</p>
                          <p className="text-2xl font-bold">
                            {data.chunks
                              .filter(c => c.fields.doc_type_confidence)
                              .reduce((acc, c) => acc + (c.fields.doc_type_confidence || 0), 0) /
                              data.chunks.filter(c => c.fields.doc_type_confidence).length || 0
                              ? Math.round(
                                  (data.chunks
                                    .filter(c => c.fields.doc_type_confidence)
                                    .reduce((acc, c) => acc + (c.fields.doc_type_confidence || 0), 0) /
                                    data.chunks.filter(c => c.fields.doc_type_confidence).length) *
                                    100
                                )
                              : 'N/A'}
                            {data.chunks.filter(c => c.fields.doc_type_confidence).length > 0 ? '%' : ''}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="chunks" className="space-y-4">
                    {data.chunks.map((chunk, index) => (
                      <Card key={chunk.chunk_id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">
                              Chunk {index + 1} - {chunk.chunk_id}
                            </CardTitle>
                            <div className="flex items-center gap-2">
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
                            {chunk.fields.doc_type_key && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Document Type</p>
                                <Badge variant="outline">{chunk.fields.doc_type_key}</Badge>
                              </div>
                            )}
                            {chunk.fields.doc_type_confidence && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Confidence</p>
                                <p className="text-sm">
                                  {Math.round(chunk.fields.doc_type_confidence * 100)}%
                                </p>
                              </div>
                            )}
                            {chunk.fields.page !== undefined && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Page</p>
                                <p className="text-sm">{chunk.fields.page}</p>
                              </div>
                            )}
                            {chunk.fields.chunk_index !== undefined && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Chunk Index</p>
                                <p className="text-sm">{chunk.fields.chunk_index}</p>
                              </div>
                            )}
                          </div>

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

