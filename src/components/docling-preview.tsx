'use client';

import { useEffect, useRef, useState } from 'react';
import FilePreview from '@/components/file-preview';
import { Skeleton } from '@/components/ui/skeleton';

interface Coordinate {
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
  text?: string;
  label?: string;
}

interface DoclingPreviewProps {
  documentId: string;
  mimeType?: string;
  coordinates: Coordinate[];
  pages?: any;
  hoveredIndex: number | null;
  onCoordinateHover: (index: number | null) => void;
}

export function DoclingPreview({
  documentId,
  mimeType,
  coordinates,
  pages,
  hoveredIndex,
  onCoordinateHover,
}: DoclingPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [calibrationOffset, setCalibrationOffset] = useState({ x: 0, y: 0, scale: 1 });

  // Get page dimensions from Docling metadata
  useEffect(() => {
    if (pages && typeof pages === 'object') {
      // Try different possible structures
      let pageData: any = null;
      
      // Structure 1: pages is an object with page numbers as keys
      if (pages['1'] || pages[1]) {
        pageData = pages['1'] || pages[1];
      }
      // Structure 2: pages is an array
      else if (Array.isArray(pages) && pages.length > 0) {
        pageData = pages[0];
      }
      // Structure 3: pages is the page data itself
      else if (pages.size || pages.width || pages.height) {
        pageData = pages;
      }
      // Structure 4: Try to get first value
      else {
        const values = Object.values(pages);
        if (values.length > 0) {
          pageData = values[0];
        }
      }
      
      if (pageData) {
        const width = pageData.size?.width || pageData.width || pageData.size?.w || pageData.w || 595;
        const height = pageData.size?.height || pageData.height || pageData.size?.h || pageData.h || 842;
        setPageDimensions({ width, height });
        console.log('Extracted page dimensions:', { width, height, from: pageData });
      } else {
        // Default to A4 if no dimensions found
        setPageDimensions({ width: 595, height: 842 });
        console.warn('Could not extract page dimensions, using default A4');
      }
    } else {
      // Default to A4
      setPageDimensions({ width: 595, height: 842 });
      console.warn('No pages data available, using default A4');
    }
  }, [pages]);

  // Draw bounding boxes on canvas overlay
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || !pageDimensions || !previewReady) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const width = containerSize.width || container.getBoundingClientRect().width;
    const height = containerSize.height || container.getBoundingClientRect().height;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scale factor (PDF points to screen pixels)
    // PDF.js viewer adds a toolbar (~40-50px) and padding around the PDF content
    // We need to account for these to get the actual PDF rendering area
    
    const pdfAspectRatio = pageDimensions.width / pageDimensions.height;
    
    // PDF.js viewer typically has:
    // - Toolbar at top: ~40-50px (download, print, zoom controls)
    // - Padding around PDF: ~8-10px on each side
    // - The PDF content is centered within the remaining space
    const toolbarHeight = 50; // Approximate PDF.js toolbar height
    const viewerPadding = 10; // Padding around PDF content
    const effectiveHeight = height - toolbarHeight - (viewerPadding * 2);
    const effectiveWidth = width - (viewerPadding * 2);
    const effectiveAspectRatio = effectiveWidth / effectiveHeight;
    
    let scaleX: number, scaleY: number;
    let offsetX = 0, offsetY = 0;
    
    // Calculate how PDF fits in the available space
    if (effectiveAspectRatio > pdfAspectRatio) {
      // Available space is wider - PDF fits to height (centered horizontally)
      scaleY = effectiveHeight / pageDimensions.height;
      scaleX = scaleY; // Maintain aspect ratio
      const pdfRenderedWidth = pageDimensions.width * scaleX;
      offsetX = viewerPadding + (effectiveWidth - pdfRenderedWidth) / 2;
      offsetY = toolbarHeight + viewerPadding;
    } else {
      // Available space is taller - PDF fits to width (centered vertically)
      scaleX = effectiveWidth / pageDimensions.width;
      scaleY = scaleX; // Maintain aspect ratio
      const pdfRenderedHeight = pageDimensions.height * scaleY;
      offsetX = viewerPadding;
      offsetY = toolbarHeight + viewerPadding + (effectiveHeight - pdfRenderedHeight) / 2;
    }

    // Draw bounding boxes for hovered coordinate
    if (hoveredIndex !== null && coordinates[hoveredIndex]) {
      const coord = coordinates[hoveredIndex];
      if (coord.prov && coord.prov.length > 0) {
        coord.prov.forEach((prov) => {
          if (prov.page_no === 1) { // Only show boxes for first page for now
            const bbox = prov.bbox;
            const coordOrigin = bbox.coord_origin || 'BOTTOMLEFT';
            
            // Convert from Docling coordinates to canvas coordinates
            // In BOTTOMLEFT: Y=0 at bottom, Y increases upward
            //   - t (top) has larger Y value than b (bottom)
            //   - So: t > b (e.g., t=757, b=744 means t is higher up)
            // In TOPLEFT (canvas): Y=0 at top, Y increases downward
            //   - We need to flip: y_canvas = pageHeight - y_bottomleft
            
            let x, y, boxWidth, boxHeight;
            
            if (coordOrigin === 'BOTTOMLEFT' || coordOrigin === 'BOTTOM_LEFT') {
              // BOTTOMLEFT origin: t is top (larger Y), b is bottom (smaller Y)
              // Convert to TOPLEFT: top edge = pageHeight - t, bottom edge = pageHeight - b
              const topY = pageDimensions.height - bbox.t;
              const bottomY = pageDimensions.height - bbox.b;
              
              // Apply calibration adjustments
              const adjustedScaleX = scaleX * calibrationOffset.scale;
              const adjustedScaleY = scaleY * calibrationOffset.scale;
              
              x = bbox.l * adjustedScaleX + offsetX + calibrationOffset.x;
              y = topY * adjustedScaleY + offsetY + calibrationOffset.y; // Top edge in canvas coordinates
              boxWidth = (bbox.r - bbox.l) * adjustedScaleX;
              boxHeight = (bottomY - topY) * adjustedScaleY; // Height is positive (bottomY > topY)
            } else {
              // Assume TOPLEFT or unknown - use as-is
              const adjustedScaleX = scaleX * calibrationOffset.scale;
              const adjustedScaleY = scaleY * calibrationOffset.scale;
              
              x = bbox.l * adjustedScaleX + offsetX + calibrationOffset.x;
              y = bbox.t * adjustedScaleY + offsetY + calibrationOffset.y;
              boxWidth = (bbox.r - bbox.l) * adjustedScaleX;
              boxHeight = (bbox.b - bbox.t) * adjustedScaleY;
            }

            // Validate coordinate values
            const isValid = (
              bbox.l >= 0 && bbox.l < pageDimensions.width &&
              bbox.r > bbox.l && bbox.r <= pageDimensions.width &&
              bbox.t >= 0 && bbox.t <= pageDimensions.height &&
              bbox.b >= 0 && bbox.b <= pageDimensions.height &&
              (coordOrigin === 'BOTTOMLEFT' ? bbox.t > bbox.b : bbox.b > bbox.t) // In BOTTOMLEFT, t > b; in TOPLEFT, b > t
            );

            if (!isValid) {
              console.warn('Invalid bounding box coordinates:', {
                bbox: { l: bbox.l, t: bbox.t, r: bbox.r, b: bbox.b },
                coordOrigin,
                pageDimensions,
                text: coord.text?.substring(0, 30)
              });
            }

            // Enhanced debug logging
            if (hoveredIndex === hoveredIndex) {
              const convertedCoords = coordOrigin === 'BOTTOMLEFT' 
                ? {
                    topY: pageDimensions.height - bbox.t,
                    bottomY: pageDimensions.height - bbox.b,
                    explanation: `BOTTOMLEFT: t=${bbox.t} (${pageDimensions.height - bbox.t} from top), b=${bbox.b} (${pageDimensions.height - bbox.b} from top)`
                  }
                : {
                    topY: bbox.t,
                    bottomY: bbox.b,
                    explanation: `TOPLEFT: t=${bbox.t}, b=${bbox.b}`
                  };

              console.log('Bounding box calculation:', {
                raw: { l: bbox.l, t: bbox.t, r: bbox.r, b: bbox.b },
                coordOrigin,
                converted: convertedCoords,
                pageDimensions,
                scale: { scaleX: scaleX.toFixed(3), scaleY: scaleY.toFixed(3) },
                offset: { offsetX: offsetX.toFixed(1), offsetY: offsetY.toFixed(1) },
                canvas: { 
                  x: x.toFixed(1), 
                  y: y.toFixed(1), 
                  width: boxWidth.toFixed(1), 
                  height: boxHeight.toFixed(1) 
                },
                container: { width, height },
                isValid,
                text: coord.text?.substring(0, 50)
              });
            }

            // Draw highlight rectangle
            ctx.strokeStyle = '#3b82f6'; // Blue
            ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'; // Light blue fill
            ctx.lineWidth = 2;
            ctx.fillRect(x, y, boxWidth, boxHeight);
            ctx.strokeRect(x, y, boxWidth, boxHeight);

            // Draw label if available
            if (coord.label || coord.text) {
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#3b82f6';
              ctx.lineWidth = 3;
              ctx.font = 'bold 11px sans-serif';
              const labelText = coord.label || coord.text?.substring(0, 25) || 'Element';
              const textMetrics = ctx.measureText(labelText);
              const labelWidth = textMetrics.width + 8;
              const labelHeight = 16;
              
              // Draw label background
              ctx.fillStyle = '#3b82f6';
              ctx.fillRect(x, Math.max(0, y - labelHeight - 2), labelWidth, labelHeight);
              
              // Draw label text
              ctx.fillStyle = '#ffffff';
              ctx.fillText(labelText, x + 4, Math.max(labelHeight, y - 6));
            }

            // Draw coordinate info (for debugging) - shows raw bbox values
            if (process.env.NODE_ENV === 'development') {
              ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
              ctx.font = '9px monospace';
              const coordInfo = `(${bbox.l.toFixed(0)},${bbox.t.toFixed(0)})-(${bbox.r.toFixed(0)},${bbox.b.toFixed(0)})`;
              ctx.fillText(coordInfo, x, y + boxHeight + 12);
            }
          }
        });
      }
    }
  }, [hoveredIndex, coordinates, pageDimensions, previewReady, containerSize, calibrationOffset]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Handle iframe load to know when PDF is ready
  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewReady(true);
    }, 1500); // Give PDF time to load

    return () => clearTimeout(timer);
  }, []);

  if (!mimeType || (mimeType !== 'application/pdf' && !mimeType.startsWith('image/'))) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Preview with bounding boxes is only available for PDF and image documents.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div 
        ref={containerRef}
        className="relative w-full border rounded-md overflow-hidden bg-gray-50"
        style={{ minHeight: '600px' }}
      >
        {/* Document Preview */}
        <div className="absolute inset-0">
          <FilePreview
            documentId={documentId}
            mimeType={mimeType}
            className="w-full h-full"
            showTitle={false}
            showMetaInfo={false}
          />
        </div>
        
        {/* Canvas Overlay for Bounding Boxes */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none z-10"
          style={{ imageRendering: 'crisp-edges' }}
        />
        
        {!previewReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <Skeleton className="w-full h-full" />
          </div>
        )}
        
        {/* Calibration Controls - Temporary for debugging alignment */}
        {process.env.NODE_ENV === 'development' && (
          <div className="absolute bottom-2 left-2 bg-black/80 text-white p-2 rounded text-xs z-20">
            <div className="mb-1 font-semibold">Calibration (Dev Only):</div>
            <div className="flex gap-2 items-center flex-wrap">
              <label className="flex items-center gap-1">
                X: <input
                  type="number"
                  value={calibrationOffset.x}
                  onChange={(e) => setCalibrationOffset({ ...calibrationOffset, x: parseFloat(e.target.value) || 0 })}
                  className="w-16 px-1 text-black text-xs rounded"
                  step="1"
                />
              </label>
              <label className="flex items-center gap-1">
                Y: <input
                  type="number"
                  value={calibrationOffset.y}
                  onChange={(e) => setCalibrationOffset({ ...calibrationOffset, y: parseFloat(e.target.value) || 0 })}
                  className="w-16 px-1 text-black text-xs rounded"
                  step="1"
                />
              </label>
              <label className="flex items-center gap-1">
                Scale: <input
                  type="number"
                  value={calibrationOffset.scale.toFixed(2)}
                  onChange={(e) => setCalibrationOffset({ ...calibrationOffset, scale: parseFloat(e.target.value) || 1 })}
                  className="w-16 px-1 text-black text-xs rounded"
                  step="0.01"
                  min="0.5"
                  max="2"
                />
              </label>
              <button
                onClick={() => setCalibrationOffset({ x: 0, y: 0, scale: 1 })}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
      
      {hoveredIndex !== null && coordinates[hoveredIndex] && (
        <div className="text-xs text-muted-foreground bg-muted p-2 rounded border">
          <strong>Highlighted:</strong> {coordinates[hoveredIndex].text || coordinates[hoveredIndex].label || `Element #${hoveredIndex + 1}`}
        </div>
      )}
    </div>
  );
}

