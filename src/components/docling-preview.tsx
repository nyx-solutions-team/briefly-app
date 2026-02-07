'use client';

import { useEffect, useState } from 'react';
import { PdfBboxViewer } from '@/components/pdf-bbox-viewer';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';

interface Coordinate {
  // Old format: prov array with bbox
  prov?: Array<{
    page_no: number;
    bbox: {
      l: number;
      t: number;
      r: number;
      b: number;
      coord_origin: string;
    };
  }>;
  // New format: extracted coordinates
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  label?: string;
}

// Custom highlight for table cells (direct bbox instead of coordinates array index)
interface CustomHighlight {
  page: number;
  bbox: {
    l: number;
    t: number;
    r: number;
    b: number;
    coord_origin: string;
  };
  label?: string;
  text?: string;
}

interface DoclingPreviewProps {
  documentId: string;
  mimeType?: string;
  coordinates: Coordinate[];
  pages?: any;
  hoveredIndex: number | null;
  onCoordinateHover: (index: number | null) => void;
  onCoordinateClick?: (index: number) => void;
  activePage?: number | null;
  onPageChange?: (page: number) => void;
  hideToolbar?: boolean;
  customHighlight?: CustomHighlight | null;  // For table cell highlighting
}

export function DoclingPreview({
  documentId,
  mimeType,
  coordinates,
  pages,
  hoveredIndex,
  onCoordinateHover,
  onCoordinateClick,
  activePage = null,
  onPageChange,
  hideToolbar = false,
  customHighlight = null,
}: DoclingPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derive the current page: prefer activePage prop if provided, otherwise selection
  const hoveredCoordinate = hoveredIndex !== null ? coordinates[hoveredIndex] : null;
  const derivedPage =
    activePage
    ?? hoveredCoordinate?.page
    ?? hoveredCoordinate?.prov?.[0]?.page_no
    ?? 1;

  // Fetch PDF URL
  useEffect(() => {
    const fetchPdfUrl = async () => {
      try {
        setLoading(true);
        setError(null);
        const { orgId } = getApiContext();
        const data = await apiFetch<{ url: string }>(`/orgs/${orgId}/documents/${documentId}/file`);
        setPdfUrl(data.url);
      } catch (err: any) {
        console.error('Failed to load PDF URL:', err);
        setError(err.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    if (documentId) {
      fetchPdfUrl();
    }
  }, [documentId]);

  // Check if this is a PDF
  if (mimeType && mimeType !== 'application/pdf') {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Not Supported</AlertTitle>
        <AlertDescription>
          Bounding box preview is only available for PDF documents. Current type: {mimeType}
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-t-md" />
        <Skeleton className="h-[500px] w-full rounded-b-md" />
      </div>
    );
  }

  if (error || !pdfUrl) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error || 'Unable to load document preview'}</AlertDescription>
      </Alert>
    );
  }

  return (
    <PdfBboxViewer
      pdfUrl={pdfUrl}
      coordinates={coordinates}
      highlightedIndex={hoveredIndex}
      onCoordinateHover={onCoordinateHover}
      onCoordinateClick={onCoordinateClick}
      initialPage={derivedPage}
      onPageChange={onPageChange}
      className="w-full h-full"
      customHighlight={customHighlight}
      doclingPages={pages}
    />
  );
}

export default DoclingPreview;
