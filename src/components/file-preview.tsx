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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FilePreviewProps {
  documentId: string;
  mimeType?: string;
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

export default function FilePreview({
  documentId,
  mimeType,
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
  const isPreviewable = mimeType === 'application/pdf' || mimeType?.startsWith('image/');
  const [showExtracted, setShowExtracted] = useState(!isPreviewable);
  const [previewError, setPreviewError] = useState(false);
  const [copied, setCopied] = useState(false);
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
    if (!extractedContent) return;
    try {
      await navigator.clipboard.writeText(extractedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Copied', description: 'Content copied to clipboard' });
    } catch (err) {
      toast({ title: 'Copy failed', description: 'Failed to copy content', variant: 'destructive' });
    }
  };

  const isPDF = fileMetadata?.mimeType === 'application/pdf' || mimeType === 'application/pdf';
  const isImage = fileMetadata?.mimeType?.startsWith('image/') || mimeType?.startsWith('image/');
  const canPreview = isPDF || isImage;

  useEffect(() => {
    if (canPreview && !fileMetadata && !loading && !error) {
      loadFileMetadata();
    }
  }, [canPreview, fileMetadata, loading, error]);

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
    if (!extractedContent) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
            <FileText className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No extracted content</p>
          <p className="text-xs text-muted-foreground">Content extraction may not be available for this file type</p>
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
            {formatExtractedContent(extractedContent)}
          </div>
        </div>
        {/* Fade overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-3 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      </div>
    );
  };

  // Embedded mode: render just the raw preview without any wrapper UI
  if (embedded) {
    if (loading) {
      return <Skeleton className={cn("w-full h-full", className)} />;
    }
    if (error || !fileMetadata) {
      return (
        <div className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}>
          {error || 'Unable to load preview'}
        </div>
      );
    }
    if (isPDF) {
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
      return (
        <img
          src={fileMetadata.url}
          alt="Document preview"
          className={cn("w-full h-full object-contain", className)}
          onError={() => setPreviewError(true)}
        />
      );
    }
    return null;
  }

  return (
    <div className={cn("rounded-lg border border-border/40 bg-card/50", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/50">
            {canPreview ? (
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <span className="text-sm font-semibold text-foreground">Preview</span>
          {fileMetadata && (
            <Badge variant="outline" className="text-xs font-normal ml-1">
              {isPDF ? 'PDF' : isImage ? 'Image' : fileMetadata.mimeType.split('/')[1]?.toUpperCase()}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Toggle between file and extracted content */}
          {canPreview && extractedContent && (
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
                Original
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
          {showExtracted && extractedContent && (
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
            {!showExtracted && fileMetadata && canPreview ? (
              <>
                {previewError ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
                      <AlertCircle className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">Preview unavailable</p>
                    <p className="text-xs text-muted-foreground mb-4">Unable to display this file type</p>
                    <div className="flex gap-2">
                      {extractedContent && (
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
            {!canPreview && !loading && !fileMetadata && !extractedContent && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
                  <FileType className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">Preview not available</p>
                <p className="text-xs text-muted-foreground mb-4">
                  {mimeType ? `File type: ${mimeType}` : 'Only PDFs and images can be previewed'}
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
