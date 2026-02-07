"use client";

import React, { useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Database, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Search,
  RefreshCw,
  Copy,
  ExternalLink
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { H1, Muted } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatAppDateTime } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

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

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail';
  message?: string;
  error?: string;
}

interface VespaHealth {
  healthy: boolean;
  endpoint: string;
  timestamp: string;
  checks?: HealthCheck[];
  vespa_info?: any;
  error?: string;
}

export default function VespaCheckPage() {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState('');
  const [docId, setDocId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VespaDocumentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthCheck, setHealthCheck] = useState<VespaHealth | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const handleHealthCheck = async () => {
    if (!orgId.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter Organization ID',
        variant: 'destructive',
      });
      return;
    }

    setCheckingHealth(true);
    setHealthCheck(null);

    try {
      const response = await apiFetch(`/orgs/${orgId.trim()}/vespa/health`);
      setHealthCheck(response);
      toast({
        title: response.healthy ? 'Vespa is Healthy' : 'Vespa Health Check Failed',
        description: response.healthy 
          ? `Connected to ${response.endpoint}` 
          : response.error || 'Vespa is not responding',
        variant: response.healthy ? 'default' : 'destructive',
      });
    } catch (err: any) {
      console.error('Failed to check Vespa health:', err);
      setHealthCheck({
        healthy: false,
        endpoint: 'unknown',
        timestamp: new Date().toISOString(),
        error: err.message || 'Failed to check Vespa health',
      });
      toast({
        title: 'Health Check Failed',
        description: err.message || 'Failed to check Vespa health',
        variant: 'destructive',
      });
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleSearch = async () => {
    if (!orgId.trim() || !docId.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both Organization ID and Document ID',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await apiFetch(`/orgs/${orgId.trim()}/vespa/documents/${docId.trim()}`);
      setData(response);
      toast({
        title: 'Success',
        description: `Found ${response.total_chunks} chunks in Vespa`,
      });
    } catch (err: any) {
      console.error('Failed to fetch Vespa data:', err);
      if (err.status === 404) {
        setError('Document not found in Vespa. It may not have been indexed yet.');
      } else if (err.status === 403) {
        setError('Vespa is not enabled for this organization or you do not have access.');
      } else {
        setError(err.message || 'Failed to fetch Vespa data');
      }
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch Vespa data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSearch();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Copied to clipboard',
    });
  };

  return (
    <AppLayout>
      <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
        <PageHeader 
          title="Vespa Data Checker"
          subtitle="Enter Organization ID and Document ID to view Vespa indexing data"
        />

        <div className="px-1 sm:px-4 md:px-6 space-y-6">
          {/* Search Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Vespa Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orgId">Organization ID</Label>
                  <Input
                    id="orgId"
                    placeholder="Enter organization ID (UUID)"
                    value={orgId}
                    onChange={(e) => setOrgId(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="docId">Document ID</Label>
                  <Input
                    id="docId"
                    placeholder="Enter document ID (UUID)"
                    value={docId}
                    onChange={(e) => setDocId(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={loading}
                  />
                </div>
              </div>
              <Button 
                onClick={handleSearch} 
                disabled={loading || !orgId.trim() || !docId.trim()}
                className="w-full md:w-auto"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search Vespa Data
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Health Check Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Vespa Health Check
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="healthOrgId">Organization ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="healthOrgId"
                    placeholder="Enter organization ID (UUID)"
                    value={orgId}
                    onChange={(e) => setOrgId(e.target.value)}
                    disabled={checkingHealth}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleHealthCheck} 
                    disabled={checkingHealth || !orgId.trim()}
                    variant="outline"
                  >
                    {checkingHealth ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Check Health
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {healthCheck && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    {healthCheck.healthy ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="font-medium text-green-700 dark:text-green-400">
                          Vespa is Healthy
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-red-500" />
                        <span className="font-medium text-red-700 dark:text-red-400">
                          Vespa is Unhealthy
                        </span>
                      </>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-muted-foreground">Endpoint</p>
                      <p className="font-mono">{healthCheck.endpoint}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">Last Checked</p>
                      <p>{formatAppDateTime(new Date(healthCheck.timestamp))}</p>
                    </div>
                  </div>

                  {/* Health Check Results */}
                  {healthCheck.checks && healthCheck.checks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Health Checks</p>
                      <div className="space-y-2">
                        {healthCheck.checks.map((check, index) => (
                          <div
                            key={index}
                            className={`flex items-start gap-2 p-2 rounded-md ${
                              check.status === 'pass'
                                ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800'
                                : 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800'
                            }`}
                          >
                            {check.status === 'pass' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{check.name}</p>
                              {check.message && (
                                <p className="text-xs text-muted-foreground">{check.message}</p>
                              )}
                              {check.error && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
                                  {check.error}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {healthCheck.error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{healthCheck.error}</AlertDescription>
                    </Alert>
                  )}

                  {healthCheck.vespa_info && (
                    <details className="group">
                      <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
                        View Vespa Status Details
                      </summary>
                      <div className="bg-muted p-3 rounded-md mt-2">
                        <ScrollArea className="h-48">
                          <pre className="text-xs overflow-auto">
                            {JSON.stringify(healthCheck.vespa_info, null, 2)}
                          </pre>
                        </ScrollArea>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          )}

          {/* Results */}
          {data && !loading && (
            <div className="space-y-6">
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
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Document ID</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono">{data.document.id}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(data.document.id)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {data.document.extracted_metadata && Object.keys(data.document.extracted_metadata).length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">Extracted Metadata</p>
                      <div className="bg-muted p-3 rounded-md">
                        <ScrollArea className="h-48">
                          <pre className="text-xs overflow-auto">
                            {JSON.stringify(data.document.extracted_metadata, null, 2)}
                          </pre>
                        </ScrollArea>
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
                    <Alert variant="destructive">
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
                          ? formatAppDateTime(new Date(data.document.vespa_indexed_at))
                          : 'Not set'}
                      </p>
                    </div>
                  </div>

                  {data.document.vespa_status && (
                    <div className="border-t pt-4">
                      <p className="text-sm font-medium text-muted-foreground mb-2">Metadata Status</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span>Status:</span>
                          <Badge variant="outline">{data.document.vespa_status.status || 'unknown'}</Badge>
                        </div>
                        {data.document.vespa_status.last_indexed_at && (
                          <p>Last Indexed: {formatAppDateTime(new Date(data.document.vespa_status.last_indexed_at))}</p>
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
                  <div className="flex justify-end mb-3">
                    <Button variant="outline" size="sm" onClick={() => setShowRaw(prev => !prev)}>
                      {showRaw ? 'Hide Raw Vespa Data' : 'Show Raw Vespa Data'}
                    </Button>
                  </div>

                  {showRaw && (
                    <div className="mb-4 border rounded-md">
                      <ScrollArea className="h-64">
                        <pre className="text-xs p-3 whitespace-pre-wrap break-words">
{`${JSON.stringify(
  {
    document: data.document,
    total_chunks: data.total_chunks,
    chunks: data.chunks,
  },
  null,
  2
)}`}
                        </pre>
                      </ScrollArea>
                    </div>
                  )}

                  {data.chunks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No chunks found in Vespa for this document</p>
                    </div>
                  ) : (
                    <Tabs defaultValue="overview" className="w-full">
                      <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="chunks">All Chunks ({data.chunks.length})</TabsTrigger>
                      </TabsList>
                      <TabsContent value="overview" className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground">Total Chunks</p>
                            <p className="text-2xl font-bold">{data.total_chunks}</p>
                          </div>
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground">Classified Chunks</p>
                            <p className="text-2xl font-bold">
                              {data.chunks.filter(c => c.fields.doc_type_key).length}
                            </p>
                          </div>
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground">Avg Confidence</p>
                            <p className="text-2xl font-bold">
                              {(() => {
                                const confidences = data.chunks
                                  .map(c => c.fields.doc_type_confidence)
                                  .filter((c): c is number => typeof c === 'number');
                                if (confidences.length === 0) return 'N/A';
                                const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
                                return `${Math.round(avg * 100)}%`;
                              })()}
                            </p>
                          </div>
                        </div>
                      </TabsContent>
                      <TabsContent value="chunks" className="space-y-4">
                        <ScrollArea className="h-[600px]">
                          {data.chunks.map((chunk, index) => (
                            <Card key={chunk.chunk_id || index} className="mb-4">
                              <CardHeader>
                                <div className="flex items-center justify-between">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Database className="h-4 w-4" />
                                    Chunk {index + 1}
                                  </CardTitle>
                                  <div className="flex items-center gap-2">
                                    {chunk.relevance !== undefined && (
                                      <Badge variant="outline">
                                        Relevance: {chunk.relevance.toFixed(4)}
                                      </Badge>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(JSON.stringify(chunk.fields, null, 2))}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {chunk.chunk_id}
                                </p>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {chunk.fields.doc_type_key && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground">Document Type</p>
                                    <div className="flex items-center gap-2">
                                      <Badge>{chunk.fields.doc_type_key}</Badge>
                                      {chunk.fields.doc_type_confidence && (
                                        <span className="text-xs text-muted-foreground">
                                          ({Math.round(chunk.fields.doc_type_confidence * 100)}%)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {chunk.fields.extracted_metadata && Object.keys(chunk.fields.extracted_metadata).length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Extracted Metadata</p>
                                    <ScrollArea className="h-32 border rounded p-2 bg-muted">
                                      <pre className="text-xs">
                                        {JSON.stringify(chunk.fields.extracted_metadata, null, 2)}
                                      </pre>
                                    </ScrollArea>
                                  </div>
                                )}
                                {chunk.fields.content && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Content Preview</p>
                                    <ScrollArea className="h-24 border rounded p-2 bg-muted">
                                      <p className="text-xs">{chunk.fields.content.substring(0, 500)}...</p>
                                    </ScrollArea>
                                  </div>
                                )}
                                <details className="text-xs">
                                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                    View Full Chunk Data
                                  </summary>
                                  <ScrollArea className="h-64 border rounded p-2 bg-muted mt-2">
                                    <pre className="text-xs">
                                      {JSON.stringify(chunk.fields, null, 2)}
                                    </pre>
                                  </ScrollArea>
                                </details>
                              </CardContent>
                            </Card>
                          ))}
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

