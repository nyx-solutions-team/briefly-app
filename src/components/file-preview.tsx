"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Image, Download, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface FilePreviewProps {
  documentId: string;
  mimeType?: string;
  extractedContent?: string;
  className?: string;
  showTitle?: boolean;
  showMetaInfo?: boolean;
  initialPage?: number | null;
}

interface FileMetadata {
  url: string;
  mimeType: string;
  filename: string;
  expires: string;
}

export default function FilePreview({
  documentId,
  mimeType,
  extractedContent,
  className = "",
  showTitle = true,
  showMetaInfo = true,
  initialPage = null,
}: FilePreviewProps) {
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Start with file preview for previewable files, extracted content for others
  const isPreviewable = mimeType === 'application/pdf' || mimeType?.startsWith('image/');
  const [showExtracted, setShowExtracted] = useState(!isPreviewable);
  const [previewError, setPreviewError] = useState(false);
  const { toast } = useToast();

  const loadFileMetadata = async () => {
    setLoading(true);
    setError(null);
    try {
      const { orgId } = getApiContext();
      const data = await apiFetch(`/orgs/${orgId}/documents/${documentId}/file`) as FileMetadata;
      setFileMetadata(data);
    } catch (err: any) {
      console.error('Failed to load file metadata:', err);
      setError(err.message || 'Failed to load file preview');
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async () => {
    if (!fileMetadata) return;
    
    try {
      // Use the signed URL to download
      const response = await fetch(fileMetadata.url);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileMetadata.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: 'Download started', description: `Downloading ${fileMetadata.filename}` });
    } catch (err) {
      console.error('Download error:', err);
      toast({ title: 'Download failed', description: 'Failed to download file', variant: 'destructive' });
    }
  };

  const isPDF = fileMetadata?.mimeType === 'application/pdf' || mimeType === 'application/pdf';
  const isImage = fileMetadata?.mimeType?.startsWith('image/') || mimeType?.startsWith('image/');
  const canPreview = isPDF || isImage;

  // Auto-load file metadata for previewable files
  useEffect(() => {
    if (canPreview && !fileMetadata && !loading && !error) {
      loadFileMetadata();
    }
  }, [canPreview, fileMetadata, loading, error]);

  // Show extracted content by default if no file preview available
  useEffect(() => {
    if (!canPreview && extractedContent) {
      setShowExtracted(true);
    }
  }, [canPreview, extractedContent]);

  const normalizedPage = typeof initialPage === 'number' && initialPage > 0 ? Math.floor(initialPage) : null;

  const renderFilePreview = () => {
    if (!fileMetadata || previewError) return null;

    if (isPDF) {
      const baseUrl = fileMetadata.url.split('#')[0];
      const pdfUrl = normalizedPage ? `${baseUrl}#page=${normalizedPage}` : fileMetadata.url;
      return (
        <div className="w-full h-[70vh] border rounded-md overflow-hidden">
          <iframe
            key={pdfUrl}
            src={pdfUrl}
            className="w-full h-full"
            title="PDF Preview"
            onError={() => setPreviewError(true)}
          />
        </div>
      );
    }

    if (isImage) {
      return (
        <div className="w-full border rounded-md overflow-hidden bg-gray-50 flex items-center justify-center">
          <img
            src={fileMetadata.url}
            alt="Document preview"
            className="max-w-full max-h-[70vh] object-contain"
            onError={() => setPreviewError(true)}
            onLoad={() => setPreviewError(false)}
          />
        </div>
      );
    }

    return null;
  };

  const formatExtractedContent = (content: string) => {
    const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
    const formatted: React.ReactNode[] = [];
    
    lines.forEach((line, index) => {
      // Skip empty lines
      if (!line) return;
      
      // Main headings (numbered or all caps)
      if (line.match(/^\d+\)\s+/) || (line.length < 100 && line === line.toUpperCase() && line.includes(' '))) {
        formatted.push(
          <h3 key={index} className="text-lg font-semibold mt-6 mb-3 text-foreground border-b pb-1">
            {line.replace(/^\d+\)\s*/, '')}
          </h3>
        );
      }
      // Sub-headings (letters or mixed case titles)
      else if (line.match(/^[A-Z]\.\s+/) || (line.endsWith(':') && line.length < 80)) {
        formatted.push(
          <h4 key={index} className="text-base font-medium mt-4 mb-2 text-foreground">
            {line.replace(/^[A-Z]\.\s*/, '').replace(/:$/, '')}
          </h4>
        );
      }
      // Bullet points (• or - or *)
      else if (line.match(/^[•\-\*]\s+/)) {
        formatted.push(
          <div key={index} className="flex items-start gap-2 mb-2 ml-4">
            <span className="text-primary mt-1.5 flex-shrink-0">•</span>
            <span className="text-sm leading-relaxed">{line.replace(/^[•\-\*]\s+/, '')}</span>
          </div>
        );
      }
      // Numbered lists
      else if (line.match(/^\d+[\.\)]\s+/)) {
        const match = line.match(/^(\d+[\.\)])\s+(.+)/);
        if (match) {
          formatted.push(
            <div key={index} className="flex items-start gap-2 mb-2 ml-4">
              <span className="text-primary font-medium flex-shrink-0">{match[1]}</span>
              <span className="text-sm leading-relaxed">{match[2]}</span>
            </div>
          );
        }
      }
      // Special markers and section dividers
      else if (line.match(/^(Flow|Categories|Roles|Features|Modules|Security|About|Deliverables|Core|Authentication|Services|DMS|Notifications|Languages):/i)) {
        formatted.push(
          <div key={index} className="mt-4 mb-2">
            <span className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
              {line}
            </span>
          </div>
        );
      }
      // Parenthetical items like (iOS & Android)
      else if (line.match(/^\([^)]+\)/) || line.match(/^[A-Z]+\s*\([^)]+\)/)) {
        formatted.push(
          <div key={index} className="text-sm text-muted-foreground mb-2 ml-6 italic">
            {line}
          </div>
        );
      }
      // Regular paragraphs
      else {
        formatted.push(
          <p key={index} className="text-sm leading-relaxed mb-3 text-muted-foreground">
            {line}
          </p>
        );
      }
    });
    
    return formatted;
  };

  const renderExtractedContent = () => {
    if (!extractedContent) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No extracted content available</p>
        </div>
      );
    }

    return (
      <div className="max-w-none max-h-[70vh] overflow-y-auto">
        <div className="space-y-1 pr-2">
          {formatExtractedContent(extractedContent)}
        </div>
      </div>
    );
  };

  return (
    <Card className={className}>
      {(showTitle || canPreview || (!fileMetadata && !loading && !canPreview)) && (
        <CardHeader>
          <div className="flex items-center justify-between">
            {showTitle && (
              <CardTitle className="text-lg flex items-center gap-2">
                {canPreview ? <Eye className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                Content Preview
              </CardTitle>
            )}
            <div className="flex items-center gap-2">
              {/* Toggle between file and extracted content */}
              {canPreview && extractedContent && (
                <div className="flex items-center rounded-md border">
                  <Button
                    size="sm"
                    variant={!showExtracted ? 'default' : 'ghost'}
                    onClick={() => setShowExtracted(false)}
                    className="rounded-r-none"
                    disabled={loading}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Original
                  </Button>
                  <Button
                    size="sm"
                    variant={showExtracted ? 'default' : 'ghost'}
                    onClick={() => setShowExtracted(true)}
                    className="rounded-l-none border-l"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Extracted
                  </Button>
                </div>
              )}

              {/* Manual load button for non-auto-loading cases */}
              {!fileMetadata && !loading && !canPreview && (
                <Button size="sm" onClick={loadFileMetadata} variant="outline">
                  <Eye className="h-4 w-4 mr-1" />
                  Load File
                </Button>
              )}
            </div>
          </div>

          {/* File info */}
          {fileMetadata && showMetaInfo && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                {fileMetadata.filename} • {fileMetadata.mimeType}
              </div>
              {canPreview && !showExtracted && (
                <div className="text-blue-600">
                  Live preview (expires {new Date(fileMetadata.expires).toLocaleTimeString()})
                </div>
              )}
            </div>
          )}
        </CardHeader>
      )}
      
      <CardContent className="p-4">
        {loading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
              Loading file preview...
            </div>
            <Skeleton className="h-[60vh] w-full" />
          </div>
        )}
        
        {error && (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 text-destructive" />
            <p className="text-sm text-destructive mb-4">{error}</p>
            <Button size="sm" onClick={loadFileMetadata} variant="outline">
              Try Again
            </Button>
          </div>
        )}
        
        {!loading && !error && (
          <>
            {/* Show file preview or extracted content based on toggle */}
            {!showExtracted && fileMetadata && canPreview ? (
              <>
                {previewError ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-4">
                      Unable to display file preview. The file might be corrupted or unsupported.
                    </p>
                    <div className="flex gap-2 justify-center">
                      <Button size="sm" onClick={() => setShowExtracted(true)} variant="outline">
                        View Extracted Text
                      </Button>
                      <Button size="sm" onClick={downloadFile} variant="outline">
                        Download File
                      </Button>
                    </div>
                  </div>
                ) : (
                  renderFilePreview()
                )}
              </>
            ) : (
              renderExtractedContent()
            )}
            
            {/* Show file type info if no preview available */}
            {!canPreview && !loading && !fileMetadata && (
              <div className="text-center py-8 text-muted-foreground">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <FileText className="h-8 w-8" />
                  <div>
                    <p className="font-medium">File preview not available</p>
                    <p className="text-xs">
                      {mimeType ? `File type: ${mimeType}` : 'Preview only available for PDFs and images'}
                    </p>
                  </div>
                </div>
                <Button size="sm" onClick={loadFileMetadata} variant="outline">
                  <Download className="h-4 w-4 mr-1" />
                  Download Original File
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}