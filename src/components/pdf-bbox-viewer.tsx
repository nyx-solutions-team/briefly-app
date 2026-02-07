'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface BoundingBox {
    l: number;  // left
    t: number;  // top (in PDF coordinates)
    r: number;  // right
    b: number;  // bottom (in PDF coordinates)
    coord_origin: string; // 'BOTTOMLEFT' or 'TOPLEFT'
}

interface Coordinate {
    // Old format: prov array with bbox
    prov?: Array<{
        page_no: number;
        bbox: BoundingBox;
    }>;
    // New format: extracted coordinates
    page?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    orig?: string;
    text?: string;
    label?: string;
}

// Custom highlight coordinate for table cells
interface CustomHighlight {
    page: number;
    bbox: BoundingBox;
    label?: string;
    text?: string;
}

// Docling page dimension info from extraction
interface DoclingPage {
    page_number: number;
    width: number;
    height: number;
}

interface PdfBboxViewerProps {
    pdfUrl: string;
    coordinates: Coordinate[];
    highlightedIndex: number | null;
    onCoordinateHover?: (index: number | null) => void;
    onCoordinateClick?: (index: number) => void;
    initialPage?: number;
    onPageChange?: (page: number) => void;
    className?: string;
    customHighlight?: CustomHighlight | null;  // For highlighting table cells
    doclingPages?: DoclingPage[];  // Docling-extracted page dimensions for coordinate mapping
}

export function PdfBboxViewer({
    pdfUrl,
    coordinates,
    highlightedIndex,
    onCoordinateHover,
    onCoordinateClick,
    initialPage = 1,
    onPageChange,
    className = '',
    customHighlight = null,
    doclingPages = [],
}: PdfBboxViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [scale, setScale] = useState(1);
    const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Calculate display width based on container
    useEffect(() => {
        if (!containerRef.current) return;

        let lastWidth = 0;
        let lastHeight = 0;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                const newWidth = entry.contentRect.width;
                const newHeight = entry.contentRect.height;

                // Only update if changed by more than 5px to prevent loops
                if (Math.abs(newWidth - lastWidth) > 5) {
                    lastWidth = newWidth;
                    setContainerWidth(newWidth);
                }
                if (Math.abs(newHeight - lastHeight) > 5) {
                    lastHeight = newHeight;
                    setContainerHeight(newHeight);
                }
            }
        });

        observer.observe(containerRef.current);
        const rect = containerRef.current.getBoundingClientRect();
        lastWidth = rect.width;
        lastHeight = rect.height;
        setContainerWidth(rect.width);
        setContainerHeight(rect.height);

        return () => observer.disconnect();
    }, []);

    // Update current page when initialPage changes
    useEffect(() => {
        if (initialPage && initialPage !== currentPage) {
            setCurrentPage(initialPage);
        }
    }, [initialPage]);

    const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setLoading(false);
        setError(null);
    }, []);

    const onDocumentLoadError = useCallback((err: Error) => {
        console.error('PDF load error:', err);
        setError('Failed to load PDF');
        setLoading(false);
    }, []);

    const onPageLoadSuccess = useCallback((page: { width: number; height: number }) => {
        setPageSize({ width: page.width, height: page.height });
    }, []);

    // Calculate the actual rendered size to fit within container
    const displayWidth = useMemo(() => {
        // Available height for PDF (container minus toolbar ~50px and padding ~32px)
        const availableHeight = containerHeight - 82;
        const availableWidth = containerWidth - 40;

        if (!pageSize || availableHeight <= 0 || availableWidth <= 0) {
            return Math.min(containerWidth - 20, 600) * scale;
        }

        // Calculate aspect ratio of the page
        const pageAspectRatio = pageSize.width / pageSize.height;

        // Calculate width based on fitting height
        const widthFromHeight = availableHeight * pageAspectRatio;

        // Use the smaller of width-constrained or height-constrained size
        const baseWidth = Math.min(widthFromHeight, availableWidth, 800);

        return baseWidth * scale;
    }, [containerWidth, containerHeight, pageSize, scale]);

    // Get bounding boxes for current page
    const currentPageBoxes = useMemo(() => {
        const boxes: Array<{ bbox: BoundingBox; label?: string; text?: string; isCustom?: boolean }> = [];

        // First, check for custom highlight (table cells) - prioritize this
        if (customHighlight && customHighlight.page === currentPage) {
            boxes.push({
                bbox: customHighlight.bbox,
                label: customHighlight.label,
                text: customHighlight.text,
                isCustom: true,  // Mark as custom for different styling
            });
        }

        // If no custom highlight, check for highlighted index
        if (highlightedIndex !== null && !customHighlight) {
            const coord = coordinates[highlightedIndex];
            if (coord) {
                // New format: extracted coordinates with {page, x, y, width, height}
                if (coord.page !== undefined && coord.x !== undefined && coord.y !== undefined) {
                    // Check if this coordinate is for the current page
                    if (coord.page === currentPage) {
                        // Convert new format to BoundingBox format
                        boxes.push({
                            bbox: {
                                l: coord.x,
                                t: coord.y,
                                r: coord.x + (coord.width || 0),
                                b: coord.y + (coord.height || 0),
                                coord_origin: 'TOPLEFT',
                            },
                            label: coord.label,
                            text: coord.text,
                        });
                    }
                }
                // Old format: prov array with bbox
                else if (coord.prov && Array.isArray(coord.prov)) {
                    coord.prov
                        .filter((p) => p.page_no === currentPage)
                        .forEach((p) => {
                            boxes.push({
                                bbox: p.bbox,
                                label: coord.label,
                                text: coord.text,
                            });
                        });
                }
            }
        }

        return boxes;
    }, [coordinates, highlightedIndex, currentPage, customHighlight]);

    // Get the Docling page dimensions for the current page (source page dimensions)
    // Support both 'page_number' and 'page_no' field names
    const doclingPageDimensions = useMemo(() => {
        if (!doclingPages || doclingPages.length === 0) return null;

        const doclingPage = doclingPages.find((p: any) =>
            p.page_number === currentPage || p.page_no === currentPage
        );

        if (doclingPage && doclingPage.width && doclingPage.height) {
            return { width: doclingPage.width, height: doclingPage.height };
        }
        return null;
    }, [doclingPages, currentPage]);

    // Convert Docling coordinates to screen coordinates
    // Key insight: Docling extracts coordinates based on its own measurement of page size,
    // which may differ from react-pdf's reported page size. We need to:
    // 1. Use Docling's page dimensions as the source (if available)
    // 2. Scale from source dimensions to the displayed width
    const convertBboxToScreen = useCallback(
        (bbox: BoundingBox) => {
            if (!pageSize) return null;

            // Use Docling's page dimensions if available, otherwise fall back to react-pdf's dimensions
            const sourceWidth = doclingPageDimensions?.width || pageSize.width;
            const sourceHeight = doclingPageDimensions?.height || pageSize.height;

            const coordOrigin = bbox.coord_origin || 'BOTTOMLEFT';

            // Scale ratio: from source (Docling) coordinates to display pixels
            const scaleRatio = displayWidth / sourceWidth;

            let screenTop: number;
            let screenBottom: number;

            if (coordOrigin === 'BOTTOMLEFT' || coordOrigin === 'BOTTOM_LEFT') {
                // In BOTTOMLEFT: Y=0 at bottom, Y increases upward
                // t > b (t is top of element, b is bottom)
                // Convert to screen: top = pageHeight - t, bottom = pageHeight - b
                screenTop = (sourceHeight - bbox.t) * scaleRatio;
                screenBottom = (sourceHeight - bbox.b) * scaleRatio;
            } else {
                // TOPLEFT: use as-is
                screenTop = bbox.t * scaleRatio;
                screenBottom = bbox.b * scaleRatio;
            }

            return {
                left: bbox.l * scaleRatio,
                top: screenTop,
                width: (bbox.r - bbox.l) * scaleRatio,
                height: Math.abs(screenBottom - screenTop),
            };
        },
        [pageSize, displayWidth, doclingPageDimensions]
    );

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        onPageChange?.(newPage);
    };

    const goToPrevPage = () => handlePageChange(Math.max(1, currentPage - 1));
    const goToNextPage = () => handlePageChange(Math.min(numPages || 1, currentPage + 1));
    const zoomIn = () => setScale((s) => Math.min(2, s + 0.25));
    const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.25));

    return (
        <div ref={containerRef} className={`relative flex flex-col h-full ${className}`}>
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-t-md border border-b-0 border-border/40">
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={goToPrevPage}
                        disabled={currentPage <= 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground min-w-[80px] text-center">
                        {currentPage} / {numPages || '?'}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={goToNextPage}
                        disabled={currentPage >= (numPages || 1)}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={zoomOut}
                        disabled={scale <= 0.5}
                    >
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground min-w-[50px] text-center">
                        {Math.round(scale * 100)}%
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={zoomIn}
                        disabled={scale >= 2}
                    >
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* PDF Viewer */}
            <div className="relative overflow-auto bg-gray-100 dark:bg-gray-900 border border-border/40 rounded-b-md flex-1">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                        <Skeleton className="w-full h-[400px]" />
                    </div>
                )}

                {error && (
                    <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                        {error}
                    </div>
                )}

                <Document
                    file={pdfUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading={null}
                    className="flex justify-center py-4"
                >
                    <div className="relative inline-block">
                        <Page
                            pageNumber={currentPage}
                            width={displayWidth}
                            onLoadSuccess={onPageLoadSuccess}
                            loading={null}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                        />

                        {/* Bounding Box Overlay */}
                        {coordinates.map((coord, idx) => {
                            const contentText = (coord.text ?? coord.orig ?? '').trim();
                            if (!contentText && highlightedIndex !== idx) return null;
                            let bbox: BoundingBox | null = null;

                            // New format selection
                            if (coord.page !== undefined && coord.x !== undefined && coord.y !== undefined) {
                                if (coord.page === currentPage) {
                                    bbox = {
                                        l: coord.x,
                                        t: coord.y,
                                        r: coord.x + (coord.width || 0),
                                        b: coord.y + (coord.height || 0),
                                        coord_origin: 'TOPLEFT',
                                    };
                                }
                            }
                            // Old format selection
                            else if (coord.prov && Array.isArray(coord.prov)) {
                                const prov = coord.prov.find(p => p.page_no === currentPage);
                                if (prov) bbox = prov.bbox;
                            }

                            if (!bbox) return null;
                            const screenBox = convertBboxToScreen(bbox);
                            if (!screenBox) return null;

                            const isHighlighted = highlightedIndex === idx;
                            const borderColor = isHighlighted ? 'border-primary' : 'border-primary/20 hover:border-primary/50';
                            const bgColor = isHighlighted ? 'bg-primary/20' : 'bg-primary/5 hover:bg-primary/10';
                            const zIndex = isHighlighted ? 20 : 10;

                            return (
                                <div
                                    key={idx}
                                    className={`absolute border-2 ${borderColor} ${bgColor} transition-all cursor-pointer`}
                                    style={{
                                        left: screenBox.left,
                                        top: screenBox.top,
                                        width: screenBox.width,
                                        height: screenBox.height,
                                        zIndex,
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCoordinateClick?.(idx);
                                    }}
                                    onMouseEnter={() => onCoordinateHover?.(idx)}
                                    onMouseLeave={() => onCoordinateHover?.(null)}
                                >
                                    {isHighlighted && coord.label && (
                                        <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-primary text-white text-[10px] font-bold rounded whitespace-nowrap shadow-sm">
                                            {coord.label}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Custom Highlights (Table Cells) */}
                        {customHighlight && customHighlight.page === currentPage && (() => {
                            const screenBox = convertBboxToScreen(customHighlight.bbox);
                            if (!screenBox) return null;
                            return (
                                <div
                                    className="absolute border-2 border-emerald-500 bg-emerald-500/20 z-30 pointer-events-none"
                                    style={{
                                        left: screenBox.left,
                                        top: screenBox.top,
                                        width: screenBox.width,
                                        height: screenBox.height,
                                    }}
                                >
                                    {customHighlight.label && (
                                        <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded whitespace-nowrap shadow-sm">
                                            {customHighlight.label}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </Document>
            </div>
        </div>
    );
}

export default PdfBboxViewer;
