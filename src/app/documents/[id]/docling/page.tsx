'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { PageHeader } from '@/components/page-header';
import { H1 } from '@/components/typography';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Database, Copy, Check, Download, Eye, EyeOff } from 'lucide-react';
import { getApiContext, apiFetch } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DoclingPreview } from '@/components/docling-preview';

interface DoclingData {
  coordinates?: Array<{
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
      charspan: [number, number];
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
  }>;
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

export default function DoclingViewerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [doclingData, setDoclingData] = useState<DoclingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [hoveredCoordinateIndex, setHoveredCoordinateIndex] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [documentInfo, setDocumentInfo] = useState<{ mimeType?: string } | null>(null);

  const docId = params.id;

  const fetchDoclingData = async () => {
    try {
      setLoading(true);
      setError(null);
      const { orgId } = getApiContext();
      const extractionData: any = await apiFetch(`/orgs/${orgId}/documents/${docId}/extraction`);
      
      if (extractionData?.docling) {
        setDoclingData(extractionData.docling);
      } else {
        setError('No Docling data found for this document. The document may have been processed before Docling integration.');
      }

      // Also fetch document info for preview
      try {
        const docInfo: any = await apiFetch(`/orgs/${orgId}/documents/${docId}`);
        setDocumentInfo({ mimeType: docInfo.mimeType || docInfo.mime_type });
      } catch (e) {
        console.warn('Could not fetch document info:', e);
      }
    } catch (err: any) {
      console.error('Failed to fetch Docling data:', err);
      if (err.status === 404) {
        setError('Document extraction not found. The document may not have been processed yet.');
      } else {
        setError(err.message || 'Failed to fetch Docling data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDoclingData();
    setRefreshing(false);
    toast({
      title: 'Refreshed',
      description: 'Docling data refreshed successfully',
    });
  };

  useEffect(() => {
    if (docId) {
      fetchDoclingData();
    }
  }, [docId]);

  const copyToClipboard = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
    toast({
      title: 'Copied',
      description: 'Copied to clipboard',
    });
  };

  const downloadJson = () => {
    if (!doclingData) return;
    const dataStr = JSON.stringify(doclingData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `docling-data-${docId}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Downloaded',
      description: 'Docling data downloaded as JSON',
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
          <PageHeader title="Docling Structure Data" />
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
          <PageHeader title="Docling Structure Data" />
          <div className="px-1 sm:px-4 md:px-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <div className="text-lg font-medium text-destructive mb-2">Error</div>
                  <div className="text-sm text-muted-foreground mb-4">{error}</div>
                  <Button onClick={handleRefresh} disabled={refreshing}>
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!doclingData) {
    return (
      <AppLayout>
        <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
          <PageHeader title="Docling Structure Data" />
          <div className="px-1 sm:px-4 md:px-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <div className="text-lg font-medium text-muted-foreground mb-2">No Docling Data</div>
                  <div className="text-sm text-muted-foreground mb-4">
                    This document does not have Docling structure data available.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6">
        <PageHeader
          title="Docling Structure Data"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={downloadJson}>
                <Download className="h-4 w-4 mr-2" />
                Download JSON
              </Button>
            </div>
          }
        />

        <div className="px-1 sm:px-4 md:px-6 space-y-4">

          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">Text Elements</span>
                  <span className="font-semibold text-lg">{doclingData.coordinates?.length || 0}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">Tables</span>
                  <span className="font-semibold text-lg">{doclingData.tables?.length || 0}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">Pages</span>
                  <span className="font-semibold text-lg">
                    {doclingData.metadata?.num_pages || (doclingData.pages ? Object.keys(doclingData.pages).length : 0)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">Processing Time</span>
                  <span className="font-semibold text-lg">
                    {doclingData.metadata?.processing_time_ms 
                      ? `${(doclingData.metadata.processing_time_ms / 1000).toFixed(2)}s`
                      : '—'}
                  </span>
                </div>
              </div>
              {doclingData.metadata && (
                <div className="mt-4 pt-4 border-t space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Method: {doclingData.metadata.method_used || 'docling'}</Badge>
                    {doclingData.metadata.cached && <Badge variant="secondary">Cached</Badge>}
                    {doclingData.metadata.has_coordinates && <Badge variant="secondary">Has Coordinates</Badge>}
                  </div>
                  {doclingData.metadata.filename && (
                    <div className="text-xs text-muted-foreground">
                      File: {doclingData.metadata.filename}
                    </div>
                  )}
                  {doclingData.metadata.file_hash && (
                    <div className="text-xs text-muted-foreground font-mono">
                      Hash: {doclingData.metadata.file_hash.substring(0, 16)}...
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detailed Data Tabs */}
          <Tabs defaultValue="coordinates" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="coordinates">
                Coordinates ({doclingData.coordinates?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="tables">
                Tables ({doclingData.tables?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            </TabsList>

            {/* Coordinates Tab */}
            <TabsContent value="coordinates" className="space-y-4">
              {doclingData && documentInfo ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Document Preview - Left Side */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <Eye className="h-5 w-5" />
                          Document Preview
                        </CardTitle>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowPreview(!showPreview)}
                        >
                          {showPreview ? (
                            <>
                              <EyeOff className="h-4 w-4 mr-2" />
                              Hide
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4 mr-2" />
                              Show
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    {showPreview && (
                      <CardContent>
                        <DoclingPreview
                          documentId={docId}
                          mimeType={documentInfo.mimeType}
                          coordinates={doclingData.coordinates || []}
                          pages={doclingData.pages}
                          hoveredIndex={hoveredCoordinateIndex}
                          onCoordinateHover={setHoveredCoordinateIndex}
                        />
                      </CardContent>
                    )}
                    {!showPreview && (
                      <CardContent>
                        <div className="text-center py-8 text-muted-foreground">
                          Click "Show" to display the document preview with bounding boxes
                        </div>
                      </CardContent>
                    )}
                  </Card>

                  {/* Coordinate List - Right Side */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Text Elements with Coordinates</CardTitle>
                      <p className="text-sm text-muted-foreground mt-2">
                        Hover over items to see bounding boxes on the preview
                      </p>
                    </CardHeader>
                    <CardContent>
                      {doclingData.coordinates && doclingData.coordinates.length > 0 ? (
                        <div className="space-y-3 max-h-[600px] overflow-y-auto">
                          {doclingData.coordinates.map((coord, index) => (
                        <Card 
                          key={index} 
                          className={`border transition-colors ${
                            hoveredCoordinateIndex === index 
                              ? 'border-primary bg-primary/5 shadow-md' 
                              : ''
                          }`}
                          onMouseEnter={() => setHoveredCoordinateIndex(index)}
                          onMouseLeave={() => setHoveredCoordinateIndex(null)}
                        >
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">#{index + 1}</Badge>
                                  {coord.label && (
                                    <Badge variant="secondary">{coord.label}</Badge>
                                  )}
                                  {coord.level && (
                                    <Badge variant="outline">Level {coord.level}</Badge>
                                  )}
                                </div>
                                {coord.text && (
                                  <div className="text-sm font-medium">{coord.text}</div>
                                )}
                                {coord.orig && coord.orig !== coord.text && (
                                  <div className="text-xs text-muted-foreground italic">
                                    Original: {coord.orig}
                                  </div>
                                )}
                                {coord.prov && coord.prov.length > 0 && (
                                  <div className="text-xs text-muted-foreground space-y-1">
                                    {coord.prov.map((prov, provIndex) => (
                                      <div key={provIndex} className="font-mono">
                                        Page {prov.page_no} | BBox: ({prov.bbox.l}, {prov.bbox.t}) to ({prov.bbox.r}, {prov.bbox.b}) | 
                                        Chars: [{prov.charspan[0]}, {prov.charspan[1]}]
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {coord.content_layer && (
                                  <div className="text-xs text-muted-foreground">
                                    Layer: {coord.content_layer}
                                  </div>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(JSON.stringify(coord, null, 2), index)}
                              >
                                {copiedIndex === index ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No coordinates found
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Text Elements with Coordinates</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {doclingData.coordinates && doclingData.coordinates.length > 0 ? (
                      <div className="space-y-3 max-h-[600px] overflow-y-auto">
                        {doclingData.coordinates.map((coord, index) => (
                          <Card 
                            key={index} 
                            className={`border transition-colors ${
                              hoveredCoordinateIndex === index 
                                ? 'border-primary bg-primary/5 shadow-md' 
                                : ''
                            }`}
                            onMouseEnter={() => setHoveredCoordinateIndex(index)}
                            onMouseLeave={() => setHoveredCoordinateIndex(null)}
                          >
                            <CardContent className="pt-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">#{index + 1}</Badge>
                                    {coord.label && (
                                      <Badge variant="secondary">{coord.label}</Badge>
                                    )}
                                    {coord.level && (
                                      <Badge variant="outline">Level {coord.level}</Badge>
                                    )}
                                  </div>
                                  {coord.text && (
                                    <div className="text-sm font-medium">{coord.text}</div>
                                  )}
                                  {coord.orig && coord.orig !== coord.text && (
                                    <div className="text-xs text-muted-foreground italic">
                                      Original: {coord.orig}
                                    </div>
                                  )}
                                  {coord.prov && coord.prov.length > 0 && (
                                    <div className="text-xs text-muted-foreground space-y-1">
                                      {coord.prov.map((prov, provIndex) => (
                                        <div key={provIndex} className="font-mono">
                                          Page {prov.page_no} | BBox: ({prov.bbox.l}, {prov.bbox.t}) to ({prov.bbox.r}, {prov.bbox.b}) | 
                                          Chars: [{prov.charspan[0]}, {prov.charspan[1]}]
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {coord.content_layer && (
                                    <div className="text-xs text-muted-foreground">
                                      Layer: {coord.content_layer}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(JSON.stringify(coord, null, 2), index)}
                                >
                                  {copiedIndex === index ? (
                                    <Check className="h-4 w-4" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No coordinates found
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tables Tab */}
            <TabsContent value="tables" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Extracted Tables</CardTitle>
                </CardHeader>
                <CardContent>
                  {doclingData.tables && doclingData.tables.length > 0 ? (
                    <div className="space-y-4">
                      {doclingData.tables.map((table, index) => (
                        <Card key={index} className="border">
                          <CardHeader>
                            <CardTitle className="text-sm">Table #{index + 1}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="bg-muted p-3 rounded-md mb-3">
                              <pre className="text-xs overflow-auto">
                                {JSON.stringify(table, null, 2)}
                              </pre>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(JSON.stringify(table, null, 2))}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Table Data
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No tables found in this document
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Metadata Tab */}
            <TabsContent value="metadata" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Processing Metadata</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-md">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(doclingData.metadata || {}, null, 2)}
                    </pre>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => copyToClipboard(JSON.stringify(doclingData.metadata || {}, null, 2))}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Metadata
                  </Button>
                </CardContent>
              </Card>

              {doclingData.pages && (
                <Card>
                  <CardHeader>
                    <CardTitle>Page Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-4 rounded-md">
                      <pre className="text-xs overflow-auto">
                        {JSON.stringify(doclingData.pages, null, 2)}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Full Docling Data (JSON)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-md max-h-[600px] overflow-auto">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(doclingData, null, 2)}
                    </pre>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => copyToClipboard(JSON.stringify(doclingData, null, 2))}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Full JSON
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}

