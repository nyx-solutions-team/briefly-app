"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Image,
  Download,
  AlertCircle,
  Eye,
  FileType,
  Clock,
  Loader2,
  RefreshCw,
  Maximize2,
  Copy,
  Check,
} from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import TabularPreview from '@/components/tabular-preview';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FilePreviewProps {
  documentId: string;
  mimeType?: string;
  filename?: string;
  extractedContent?: string;
  className?: string;
  showTitle?: boolean;
  showMetaInfo?: boolean;
  initialPage?: number | null;
  hideToolbar?: boolean;
  /** When true, renders only the raw PDF/image without any wrapper UI (header, padding, etc.) */
  embedded?: boolean;
  isMobile?: boolean;
}

interface FileMetadata {
  url: string;
  mimeType: string;
  filename: string;
  expires: string;
}

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'log', 'xml', 'yaml', 'yml']);
const TABULAR_EXTENSIONS = new Set(['csv', 'xls', 'xlsx']);

function getFileExtension(filename?: string) {
  if (!filename) return '';
  const index = filename.lastIndexOf('.');
  if (index < 0) return '';
  return filename.slice(index + 1).toLowerCase();
}

function isTextLikeMime(mimeType?: string) {
  const value = (mimeType || '').toLowerCase();
  if (value.includes('csv')) return false;
  return (
    value.startsWith('text/') ||
    value.includes('markdown') ||
    value === 'application/json' ||
    value === 'application/xml' ||
    value === 'application/x-yaml'
  );
}

function isTextLikeFile(mimeType?: string, filename?: string) {
  if (isTextLikeMime(mimeType)) return true;
  return TEXT_EXTENSIONS.has(getFileExtension(filename));
}

function isTabularMime(mimeType?: string) {
  const value = (mimeType || '').toLowerCase();
  return (
    value.includes('csv') ||
    value.includes('spreadsheetml') ||
    value.includes('application/vnd.ms-excel')
  );
}

function isTabularFile(mimeType?: string, filename?: string) {
  if (isTabularMime(mimeType)) return true;
  return TABULAR_EXTENSIONS.has(getFileExtension(filename));
}

export default function FilePreview({
  documentId,
  mimeType,
  filename,
  extractedContent,
  className = "",
  showTitle = true,
  showMetaInfo = true,
  initialPage = null,
  hideToolbar = false,
  embedded = false,
  isMobile = false,
}: FilePreviewProps) {
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawTextContent, setRawTextContent] = useState('');
  const [rawTextLoading, setRawTextLoading] = useState(false);
  const [rawTextError, setRawTextError] = useState<string | null>(null);
  const [tabularData, setTabularData] = useState<any | null>(null);
  const [tabularLoading, setTabularLoading] = useState(false);
  const [tabularError, setTabularError] = useState<string | null>(null);
  const [tabularLoadAttempted, setTabularLoadAttempted] = useState(false);
  const isPreviewable = (
    mimeType === 'application/pdf' ||
    mimeType?.startsWith('image/') ||
    isTabularFile(mimeType, filename)
  );
  const [showExtracted, setShowExtracted] = useState(!isPreviewable);
  const [previewError, setPreviewError] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setShowExtracted(!isPreviewable);
  }, [documentId, isPreviewable]);

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

  const copyExtractedContent = async () => {
    const content = (extractedContent && extractedContent.trim()) ? extractedContent : rawTextContent;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Copied', description: 'Content copied to clipboard' });
    } catch (err) {
      toast({ title: 'Copy failed', description: 'Failed to copy content', variant: 'destructive' });
    }
  };

  const resolvedMime = fileMetadata?.mimeType || mimeType;
  const resolvedFilename = fileMetadata?.filename || filename;
  const isPDF = resolvedMime === 'application/pdf';
  const isImage = Boolean(resolvedMime?.startsWith('image/'));
  const isTabular = isTabularFile(resolvedMime, resolvedFilename);
  const isTextFile = isTextLikeFile(resolvedMime, resolvedFilename);
  const canPreview = isPDF || isImage;
  const canRichPreview = canPreview || isTabular;
  const textContent = (extractedContent && extractedContent.trim()) ? extractedContent : rawTextContent;
  const shouldLoadMetadata = canRichPreview || isTextFile;

  useEffect(() => {
    if (shouldLoadMetadata && !fileMetadata && !loading && !error) {
      loadFileMetadata();
    }
  }, [shouldLoadMetadata, fileMetadata, loading, error]);

  useEffect(() => {
    if (!canRichPreview && textContent) {
      setShowExtracted(true);
    }
  }, [canRichPreview, textContent]);

  useEffect(() => {
    setTabularData(null);
    setTabularError(null);
    setTabularLoading(false);
    setTabularLoadAttempted(false);
  }, [documentId]);

  useEffect(() => {
    let isCancelled = false;

    const loadRawText = async () => {
      if (!isTextFile || !fileMetadata?.url || textContent) return;
      setRawTextLoading(true);
      setRawTextError(null);
      try {
        const response = await fetch(fileMetadata.url);
        if (!response.ok) throw new Error('Failed to fetch text content');
        const raw = await response.text();
        if (!isCancelled) setRawTextContent(raw || '');
      } catch (err: any) {
        if (!isCancelled) {
          setRawTextError(err?.message || 'Failed to load text preview');
        }
      } finally {
        if (!isCancelled) setRawTextLoading(false);
      }
    };

    void loadRawText();
    return () => { isCancelled = true; };
  }, [isTextFile, fileMetadata?.url, textContent]);

  useEffect(() => {
    let isCancelled = false;

    const loadTabularData = async () => {
      if (!isTabular || tabularData || tabularLoading || tabularLoadAttempted) return;

      setTabularLoading(true);
      setTabularLoadAttempted(true);
      setTabularError(null);
      try {
        const { orgId } = getApiContext();
        if (!orgId) return;

        let nextTabular: any = null;

        try {
          const preview = await apiFetch<any>(`/orgs/${orgId}/documents/${documentId}/tabular-preview`);
          if (preview && Array.isArray(preview.sheets)) {
            nextTabular = preview;
          }
        } catch { }

        if (!nextTabular) {
          try {
            const extraction = await apiFetch<any>(`/orgs/${orgId}/documents/${documentId}/extraction`);
            nextTabular = extraction?.tabular || null;
          } catch { }
        }

        if (!isCancelled) {
          setTabularData(nextTabular);
          if (!nextTabular) {
            setTabularError(null);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          if (err?.status === 404) {
            setTabularData(null);
            setTabularError(null);
          } else {
            setTabularError(err?.message || 'Failed to load tabular preview');
          }
        }
      } finally {
        if (!isCancelled) setTabularLoading(false);
      }
    };

    void loadTabularData();
    return () => { isCancelled = true; };
  }, [isTabular, documentId]);

  const normalizedPage = typeof initialPage === 'number' && initialPage > 0 ? Math.floor(initialPage) : null;

  const renderFilePreview = () => {
    if (!fileMetadata || previewError) return null;

    if (isPDF) {
      if (!fileMetadata) {
        return (
          <div className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}>
            Unable to load preview
          </div>
        );
      }
      const baseUrl = fileMetadata.url.split('#')[0];
      const hashParts = [] as string[];
      if (normalizedPage) hashParts.push(`page=${normalizedPage}`);
      if (hideToolbar) hashParts.push('toolbar=0', 'navpanes=0', 'scrollbar=0');
      const pdfUrl = hashParts.length > 0 ? `${baseUrl}#${hashParts.join('&')}` : fileMetadata.url;
      return (
        <div className={cn(
          "relative w-full rounded-lg overflow-hidden bg-muted/20 border border-border/30",
          isMobile ? "h-[50vh]" : "h-[70vh]"
        )}>
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
        <div className="relative w-full rounded-lg overflow-hidden bg-muted/20 border border-border/30 flex items-center justify-center min-h-[200px]">
          <img
            src={fileMetadata.url}
            alt="Document preview"
            className={cn(
              "max-w-full object-contain",
              isMobile ? "max-h-[50vh]" : "max-h-[70vh]"
            )}
            onError={() => setPreviewError(true)}
            onLoad={() => setPreviewError(false)}
          />
        </div>
      );
    }

    return null;
  };

  const renderTabularContent = () => {
    if (!tabularData && !tabularLoading && !tabularError && textContent) {
      return renderExtractedContent();
    }
    return (
      <TabularPreview
        tabular={tabularData}
        loading={tabularLoading}
        error={tabularError}
      />
    );
  };

  const formatExtractedContent = (content: string) => {
    const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
    const formatted: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      if (!line) return;

      // Main headings (numbered or all caps)
      if (line.match(/^\d+\)\s+/) || (line.length < 100 && line === line.toUpperCase() && line.includes(' '))) {
        formatted.push(
          <h3 key={index} className="text-base font-semibold mt-6 mb-3 text-foreground border-b border-border/40 pb-2 first:mt-0">
            {line.replace(/^\d+\)\s*/, '')}
          </h3>
        );
      }
      // Sub-headings (letters or mixed case titles)
      else if (line.match(/^[A-Z]\.\s+/) || (line.endsWith(':') && line.length < 80)) {
        formatted.push(
          <h4 key={index} className="text-sm font-semibold mt-5 mb-2 text-foreground">
            {line.replace(/^[A-Z]\.\s*/, '').replace(/:$/, '')}
          </h4>
        );
      }
      // Bullet points (• or - or *)
      else if (line.match(/^[•\-\*]\s+/)) {
        formatted.push(
          <div key={index} className="flex items-start gap-2.5 mb-2 ml-1">
            <span className="text-primary mt-1 flex-shrink-0 text-xs">●</span>
            <span className="text-sm leading-relaxed text-foreground/80">{line.replace(/^[•\-\*]\s+/, '')}</span>
          </div>
        );
      }
      // Numbered lists
      else if (line.match(/^\d+[\.]\s+/)) {
        const match = line.match(/^(\d+[\.])\s+(.+)/);
        if (match) {
          formatted.push(
            <div key={index} className="flex items-start gap-2.5 mb-2 ml-1">
              <span className="text-primary font-medium flex-shrink-0 text-sm tabular-nums min-w-[1.5rem]">{match[1]}</span>
              <span className="text-sm leading-relaxed text-foreground/80">{match[2]}</span>
            </div>
          );
        }
      }
      // Special markers and section dividers
      else if (line.match(/^(Flow|Categories|Roles|Features|Modules|Security|About|Deliverables|Core|Authentication|Services|DMS|Notifications|Languages):/i)) {
        formatted.push(
          <div key={index} className="mt-5 mb-3">
            <Badge variant="outline" className="text-xs font-medium bg-primary/5 text-primary border-primary/20">
              {line}
            </Badge>
          </div>
        );
      }
      // Parenthetical items like (iOS & Android)
      else if (line.match(/^\([^)]+\)/) || line.match(/^[A-Z]+\s*\([^)]+\)/)) {
        formatted.push(
          <p key={index} className="text-xs text-muted-foreground mb-2 ml-4 italic">
            {line}
          </p>
        );
      }
      // Regular paragraphs
      else {
        formatted.push(
          <p key={index} className="text-sm leading-[1.7] mb-3 text-foreground/80">
            {line}
          </p>
        );
      }
    });

    return formatted;
  };

  const renderExtractedContent = () => {
    if (rawTextLoading && !textContent) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading text preview...
          </div>
          <Skeleton className="h-[50vh] w-full rounded-lg" />
        </div>
      );
    }

    if (!textContent) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
            <FileText className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No extracted content</p>
          <p className="text-xs text-muted-foreground">
            {rawTextError || 'Content extraction may not be available for this file type'}
          </p>
        </div>
      );
    }

    return (
      <div className="relative">
        <div className={cn(
          "overflow-y-auto pr-3 scrollbar-thin",
          isMobile ? "max-h-[50vh]" : "max-h-[70vh]"
        )}>
          <div className="prose-preview">
            {formatExtractedContent(textContent)}
          </div>
        </div>
        {/* Fade overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-3 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      </div>
    );
  };

  // Embedded mode: render just the raw preview without any wrapper UI
  if (embedded) {
    if (loading && !textContent) {
      return <Skeleton className={cn("w-full h-full", className)} />;
    }
    if (error && !textContent) {
      return (
        <div className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}>
          {error}
        </div>
      );
    }
    if (isPDF) {
      if (!fileMetadata) {
        return (
          <div className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}>
            Unable to load preview
          </div>
        );
      }
      const baseUrl = fileMetadata.url.split('#')[0];
      const hashParts = [] as string[];
      if (normalizedPage) hashParts.push(`page=${normalizedPage}`);
      if (hideToolbar) hashParts.push('toolbar=0', 'navpanes=0', 'scrollbar=0');
      const pdfUrl = hashParts.length > 0 ? `${baseUrl}#${hashParts.join('&')}` : fileMetadata.url;
      return (
        <iframe
          key={pdfUrl}
          src={pdfUrl}
          className={cn("w-full h-full border-0", className)}
          title="PDF Preview"
          onError={() => setPreviewError(true)}
        />
      );
    }
    if (isImage) {
      if (!fileMetadata) {
        return (
          <div className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}>
            Unable to load preview
          </div>
        );
      }
      return (
        <img
          src={fileMetadata.url}
          alt="Document preview"
          className={cn("w-full h-full object-contain", className)}
          onError={() => setPreviewError(true)}
        />
      );
    }
    if (isTabular) {
      return (
        <div className={cn("w-full h-full overflow-auto p-3 bg-background", className)}>
          <TabularPreview
            tabular={tabularData}
            loading={tabularLoading}
            error={tabularError}
            className="h-full"
          />
        </div>
      );
    }
    if (isTextFile) {
      if (!textContent && rawTextLoading) {
        return <Skeleton className={cn("w-full h-full", className)} />;
      }
      if (!textContent) {
        return (
          <div className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}>
            {rawTextError || 'No text preview available'}
          </div>
        );
      }
      return (
        <div className={cn("w-full h-full overflow-auto p-4 bg-background text-foreground", className)}>
          <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-mono">{textContent}</pre>
        </div>
      );
    }
    return (
      <div className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}>
        Unable to load preview
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border/40 bg-card/50", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/50">
            {canRichPreview ? (
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <span className="text-sm font-semibold text-foreground">Preview</span>
          {fileMetadata && (
            <Badge variant="outline" className="text-xs font-normal ml-1">
              {isPDF ? 'PDF' : isImage ? 'Image' : isTabular ? 'TABLE' : fileMetadata.mimeType.split('/')[1]?.toUpperCase()}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Toggle between file and extracted content */}
          {canRichPreview && textContent && (
            <div className="flex items-center p-0.5 rounded-lg bg-muted/30 mr-2">
              <button
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                  !showExtracted ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setShowExtracted(false)}
                disabled={loading}
              >
                <Eye className="h-3 w-3" />
                {isTabular ? 'Table' : 'Original'}
              </button>
              <button
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                  showExtracted ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setShowExtracted(true)}
              >
                <FileText className="h-3 w-3" />
                Text
              </button>
            </div>
          )}

          {/* Copy button for extracted content */}
          {showExtracted && textContent && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={copyExtractedContent}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Copy text</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Download button */}
          {fileMetadata && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={downloadFile}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Download</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Reload button */}
          {error && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={loadFileMetadata}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Retry</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* File metadata bar */}
      {fileMetadata && showMetaInfo && !showExtracted && (
        <div className="flex items-center gap-3 px-5 py-2 border-b border-border/20 bg-muted/10 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FileType className="h-3 w-3" />
            {fileMetadata.filename}
          </span>
          <span className="text-border">•</span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Expires {new Date(fileMetadata.expires).toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {loading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading preview...
            </div>
            <Skeleton className="h-[50vh] w-full rounded-lg" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/10 mb-4">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Failed to load preview</p>
            <p className="text-xs text-muted-foreground mb-4">{error}</p>
            <Button size="sm" onClick={loadFileMetadata} variant="outline" className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </Button>
          </div>
        )}

        {!loading && !error && (
          <>
            {!showExtracted && isTabular ? (
              renderTabularContent()
            ) : !showExtracted && fileMetadata && canPreview ? (
              <>
                {previewError ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
                      <AlertCircle className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">Preview unavailable</p>
                    <p className="text-xs text-muted-foreground mb-4">Unable to display this file type</p>
                    <div className="flex gap-2">
                      {textContent && (
                        <Button size="sm" onClick={() => setShowExtracted(true)} variant="outline" className="gap-1.5">
                          <FileText className="h-3.5 w-3.5" />
                          View Text
                        </Button>
                      )}
                      <Button size="sm" onClick={downloadFile} variant="outline" className="gap-1.5">
                        <Download className="h-3.5 w-3.5" />
                        Download
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

            {/* No preview available state */}
            {!canRichPreview && !loading && !fileMetadata && !textContent && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
                  <FileType className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">Preview not available</p>
                <p className="text-xs text-muted-foreground mb-4">
                  {mimeType ? `File type: ${mimeType}` : 'Only PDFs, images, CSV, and Excel can be previewed'}
                </p>
                <Button size="sm" onClick={loadFileMetadata} variant="outline" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Download File
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
