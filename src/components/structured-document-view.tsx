'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut,
    Maximize2,
    Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BoundingBox {
    l: number;
    t: number;
    r: number;
    b: number;
    coord_origin?: string; // e.g. "BOTTOMLEFT" | "TOPLEFT"
    page_no?: number;
}

interface Coordinate {
    page?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    orig?: string;
    text?: string;
    label?: string;
    prov?: Array<{ page_no: number; bbox: BoundingBox }>;
    isTable?: boolean;
    tableIndex?: number;
}

interface PageMeta {
    pageNo: number;
    width: number;
    height: number;
    rotation: 0 | 90 | 180 | 270;
}

interface StructuredDocumentViewProps {
    coordinates: Coordinate[];
    tables?: any[];
    pages?: any[];
    onElementClick?: (index: number) => void;
    highlightedIndex?: number | null;
    currentPage?: number; // external page number (usually 1-based)
    onPageChange?: (page: number) => void;
}

type Rect = { left: number; top: number; width: number; height: number };
type IndexedCoordinate = Coordinate & { originalIndex: number; originalIndices?: number[]; mergedRect?: Rect };

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const safeNum = (v: any, fallback: number) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
};

const getCoordText = (coord: Coordinate) => coord.text ?? coord.orig ?? '';
const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeRotation = (r: any): 0 | 90 | 180 | 270 => {
    const n = Math.round(safeNum(r, 0));
    const normalized = ((n % 360) + 360) % 360;
    if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
    return 0;
};

const normalizeBBox = (bbox: BoundingBox) => {
    const x0 = Math.min(bbox.l, bbox.r);
    const x1 = Math.max(bbox.l, bbox.r);
    const y0 = Math.min(bbox.t, bbox.b);
    const y1 = Math.max(bbox.t, bbox.b);
    const origin = (bbox.coord_origin || '').toUpperCase();
    const isBottomLeft = origin === 'BOTTOMLEFT' || origin === 'BOTTOM_LEFT' || origin === 'BL';
    return { x0, x1, y0, y1, isBottomLeft };
};

const rectOutOfBoundsScore = (rect: Rect, pageW: number, pageH: number) => {
    // Lower is better. 0 means fully inside.
    const l = rect.left;
    const t = rect.top;
    const r = rect.left + rect.width;
    const b = rect.top + rect.height;

    const overLeft = Math.max(0, -l);
    const overTop = Math.max(0, -t);
    const overRight = Math.max(0, r - pageW);
    const overBottom = Math.max(0, b - pageH);

    // Weighted: area-ish + edge penalty
    const edgePenalty = overLeft + overTop + overRight + overBottom;
    const areaPenalty = (overLeft + overRight) * rect.height + (overTop + overBottom) * rect.width;
    return areaPenalty + edgePenalty * 5;
};

const rotateRect = (
    rect: Rect,
    pageW: number,
    pageH: number,
    rotation: 0 | 90 | 180 | 270
): { rect: Rect; rotatedPageW: number; rotatedPageH: number } => {
    if (rotation === 0) return { rect, rotatedPageW: pageW, rotatedPageH: pageH };

    // Rotate the four corners, then take bounding box
    const corners = [
        { x: rect.left, y: rect.top },
        { x: rect.left + rect.width, y: rect.top },
        { x: rect.left, y: rect.top + rect.height },
        { x: rect.left + rect.width, y: rect.top + rect.height },
    ];

    const rotPoint = (x: number, y: number) => {
        // We assume top-left origin with y down.
        if (rotation === 90) return { x: pageH - y, y: x };
        if (rotation === 180) return { x: pageW - x, y: pageH - y };
        // 270
        return { x: y, y: pageW - x };
    };

    const rotated = corners.map((p) => rotPoint(p.x, p.y));
    const xs = rotated.map((p) => p.x);
    const ys = rotated.map((p) => p.y);

    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);

    const rotatedPageW = rotation === 90 || rotation === 270 ? pageH : pageW;
    const rotatedPageH = rotation === 90 || rotation === 270 ? pageW : pageH;

    return {
        rect: { left: x0, top: y0, width: x1 - x0, height: y1 - y0 },
        rotatedPageW,
        rotatedPageH,
    };
};

const getMeasureCtx = (() => {
    let ctx: CanvasRenderingContext2D | null = null;
    return () => {
        if (ctx) return ctx;
        const canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d');
        return ctx;
    };
})();

const toText = (cell: any) => {
    if (cell == null) return '';
    if (typeof cell === 'string') return cell;
    if (typeof cell === 'number') return String(cell);
    if (typeof cell?.text === 'string') return cell.text;
    if (typeof cell?.value === 'string' || typeof cell?.value === 'number') return String(cell.value);
    if (typeof cell?.display === 'string') return cell.display;
    if (typeof cell?.key === 'string') return cell.key;
    return '';
};

const normalizeHeaderStrings = (arr: string[]) =>
    arr.map((s) => s.trim().replace(/\s+/g, ' ').toLowerCase());

const arraysRoughlyEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const na = normalizeHeaderStrings(a);
    const nb = normalizeHeaderStrings(b);
    let same = 0;
    for (let i = 0; i < na.length; i++) if (na[i] === nb[i] && na[i].length > 0) same++;
    // Allow some differences but require majority
    return same >= Math.max(1, Math.floor(a.length * 0.6));
};

const extractTable = (tableData: any) => {
    const rawHeaders =
        (Array.isArray(tableData?.headers) ? tableData.headers : []) ||
        (Array.isArray(tableData?.header) ? tableData.header : []);

    const headers = rawHeaders.map((h: any) => toText(h)).filter((s: string) => s.length > 0);

    // Try many shapes for grid
    const grid =
        tableData?.grid ??
        tableData?.data ??
        tableData?.rows ??
        tableData?.table ??
        tableData?.cells ??
        [];

    const matrix: string[][] = Array.isArray(grid)
        ? grid
            .filter((r: any) => Array.isArray(r) || typeof r === 'object')
            .map((row: any) => (Array.isArray(row) ? row.map((c) => toText(c)) : []))
        : [];

    // Decide if first row is header row
    let dataStart = 0;
    let finalHeaders = headers;

    if (finalHeaders.length === 0 && matrix.length > 0) {
        // No explicit headers: cautiously use first row as headers if it looks header-like
        const first = matrix[0] || [];
        const second = matrix[1] || [];
        const looksTabular = first.length > 0 && (second.length === 0 || second.length === first.length);
        if (looksTabular) {
            finalHeaders = first.map((s) => s || '').map((s) => s.trim());
            dataStart = 1;
        }
    } else if (finalHeaders.length > 0 && matrix.length > 0) {
        const first = matrix[0] || [];
        if (first.length === finalHeaders.length && arraysRoughlyEqual(first, finalHeaders)) {
            dataStart = 1; // grid includes header row
        } else {
            dataStart = 0; // grid is data-only
        }
    }

    const colCount = Math.max(
        finalHeaders.length,
        ...matrix.map((r) => (Array.isArray(r) ? r.length : 0)),
        1
    );

    const normalizedHeaders =
        finalHeaders.length > 0
            ? [...finalHeaders, ...new Array(Math.max(0, colCount - finalHeaders.length)).fill('')].slice(
                0,
                colCount
            )
            : new Array(colCount).fill('');

    const rows = matrix
        .slice(dataStart)
        .map((r) => [...r, ...new Array(Math.max(0, colCount - r.length)).fill('')].slice(0, colCount));

    return { headers: normalizedHeaders, rows, colCount };
};

const getTextStyling = (label?: string) => {
    const l = (label || '').toLowerCase();
    const isTitle = l === 'title';
    const isSectionHeader = l === 'section_header' || l === 'section-header' || l.includes('header');
    const isFootnote = l === 'footnote' || l === 'caption';

    const fontWeight: React.CSSProperties['fontWeight'] = isTitle || isSectionHeader ? 700 : 400;
    const textAlign: React.CSSProperties['textAlign'] = isTitle || isSectionHeader ? 'center' : 'left';
    const alignItems: React.CSSProperties['alignItems'] = 'flex-start';
    const justifyContent: React.CSSProperties['justifyContent'] = isTitle || isSectionHeader ? 'center' : 'flex-start';
    const padding = isTitle || isSectionHeader ? 0 : 1;

    const family =
        isTitle || isSectionHeader
            ? 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'
            : 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

    const semanticScale = isTitle ? 1.15 : isSectionHeader ? 1.05 : isFootnote ? 0.9 : 1;

    return { fontWeight, textAlign, alignItems, justifyContent, padding, family, semanticScale };
};

const wrapTextToLines = (
    text: string,
    maxWidth: number,
    ctx: CanvasRenderingContext2D
) => {
    if (!text) return [''];
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return text.split('\n');

    const lines: string[] = [];
    const paragraphs = text.split('\n');

    const measure = (value: string) => ctx.measureText(value).width;

    const pushWord = (word: string, current: { value: string }) => {
        if (!word) return;
        const value = current.value;
        if (!value) {
            if (measure(word) <= maxWidth) {
                current.value = word;
                return;
            }
            let fragment = '';
            for (const char of word) {
                const next = fragment + char;
                if (measure(next) <= maxWidth || fragment.length === 0) {
                    fragment = next;
                } else {
                    lines.push(fragment);
                    fragment = char;
                }
            }
            current.value = fragment;
            return;
        }

        const combined = `${value} ${word}`;
        if (measure(combined) <= maxWidth) {
            current.value = combined;
            return;
        }
        lines.push(value);
        current.value = '';
        pushWord(word, current);
    };

    for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            lines.push('');
            continue;
        }

        const current = { value: '' };
        for (const word of words) {
            pushWord(word, current);
        }
        if (current.value.length > 0) {
            lines.push(current.value);
        }
    }

    return lines.length > 0 ? lines : [''];
};

const calculateFontSizeMeasured = (
    boxWidth: number,
    boxHeight: number,
    text: string,
    label?: string
) => {
    const MIN_FONT_SIZE = 1;
    const MAX_FONT_SIZE = 256;

    if (!text || boxWidth <= 0 || boxHeight <= 0) {
        return { fontSize: 12, lines: text ? text.split('\n') : [''] };
    }

    const { fontWeight, family, semanticScale } = getTextStyling(label);

    const lineHeight = 1.18;
    const ctx = getMeasureCtx();
    const baseSize = 10;
    let lines = String(text).split('\n');
    let maxWidthAtBase = 0;

    if (ctx) {
        ctx.font = `${fontWeight} ${baseSize}px ${family}`;
        lines = wrapTextToLines(String(text), boxWidth, ctx);
        maxWidthAtBase = Math.max(...lines.map((ln) => ctx.measureText(ln).width), 0);
    }

    const lineCount = Math.max(1, lines.length);

    // Height-based max
    let maxByHeight = boxHeight / (lineCount * lineHeight);
    maxByHeight = maxByHeight * semanticScale;

    let maxByWidth = maxByHeight;
    if (maxWidthAtBase > 0) {
        maxByWidth = (boxWidth * baseSize) / maxWidthAtBase;
    }

    // Safety: do not exceed 92% of box height for single-line
    const hardCap = lineCount === 1 ? boxHeight * 0.92 : boxHeight * 0.88;
    const candidate = Math.min(maxByHeight, maxByWidth, hardCap);

    return { fontSize: clamp(candidate, MIN_FONT_SIZE, MAX_FONT_SIZE), lines };
};

export function StructuredDocumentView({
    coordinates,
    tables = [],
    pages = [],
    onElementClick,
    highlightedIndex = null,
    currentPage = 1,
    onPageChange,
}: StructuredDocumentViewProps) {
    const [scale, setScale] = useState(0.6);
    const [fitMode, setFitMode] = useState<'none' | 'width' | 'page'>('none');

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const pageWrapperRef = useRef<HTMLDivElement | null>(null);

    // Normalize page list
    const normalizedPages: PageMeta[] = useMemo(() => {
        const out: PageMeta[] = [];

        if (Array.isArray(pages) && pages.length > 0) {
            for (let i = 0; i < pages.length; i++) {
                const p = pages[i];
                const pageNo = safeNum(p?.page_number ?? p?.page_no ?? p?.page ?? i + 1, i + 1);
                const width = safeNum(p?.width ?? p?.page_width ?? p?.w ?? 595, 595);
                const height = safeNum(p?.height ?? p?.page_height ?? p?.h ?? 841, 841);
                const rotation = normalizeRotation(p?.rotation ?? p?.rotate ?? p?.page_rotation ?? 0);
                out.push({ pageNo, width, height, rotation });
            }
            return out.sort((a, b) => a.pageNo - b.pageNo);
        }

        // Fallback from coordinates
        const pageSet = new Set<number>();
        for (const c of coordinates) {
            const p = c.page ?? c.prov?.[0]?.page_no;
            if (typeof p === 'number' && Number.isFinite(p)) pageSet.add(p);
        }
        const pageNos = Array.from(pageSet).sort((a, b) => a - b);
        const inferred = pageNos.length > 0 ? pageNos : [1];
        return inferred.map((pageNo) => ({ pageNo, width: 595, height: 841, rotation: 0 }));
    }, [pages, coordinates]);

    const pageSet = useMemo(() => new Set(normalizedPages.map((p) => p.pageNo)), [normalizedPages]);

    // Detect external page numbering (1-based UI but data may be 0-based)
    const pageNumbering = useMemo(() => {
        const min = Math.min(...normalizedPages.map((p) => p.pageNo));
        const max = Math.max(...normalizedPages.map((p) => p.pageNo));
        const hasZero = pageSet.has(0);
        const hasOne = pageSet.has(1);
        const likelyZeroBased = hasZero && !hasOne && min === 0;
        return { min, max, likelyZeroBased };
    }, [normalizedPages, pageSet]);

    const externalToInternalPage = (external: number) => {
        if (pageSet.has(external)) return external;
        if (pageNumbering.likelyZeroBased && pageSet.has(external - 1)) return external - 1;
        // fallback: clamp to nearest existing page
        const sorted = normalizedPages.map((p) => p.pageNo).sort((a, b) => a - b);
        const clamped = clamp(external, sorted[0], sorted[sorted.length - 1]);
        // pick closest
        let best = sorted[0];
        let bestDist = Math.abs(sorted[0] - clamped);
        for (const p of sorted) {
            const d = Math.abs(p - clamped);
            if (d < bestDist) {
                best = p;
                bestDist = d;
            }
        }
        return best;
    };

    const internalToExternalPage = (internal: number) => {
        if (pageNumbering.likelyZeroBased) return internal + 1;
        return internal;
    };

    const internalCurrentPage = useMemo(
        () => externalToInternalPage(currentPage),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [currentPage, pageSet, pageNumbering.likelyZeroBased, normalizedPages]
    );

    const numPages = normalizedPages.length;

    const currentPageInfo = useMemo(() => {
        const found = normalizedPages.find((p) => p.pageNo === internalCurrentPage);
        return found || { pageNo: internalCurrentPage, width: 595, height: 841, rotation: 0 as const };
    }, [normalizedPages, internalCurrentPage]);

    // Build per-page index once (performance)
    const pageIndex = useMemo(() => {
        const map = new Map<number, Array<IndexedCoordinate>>();
        for (let i = 0; i < coordinates.length; i++) {
            const c = coordinates[i];
            const p = (typeof c.page === 'number' ? c.page : undefined) ?? c.prov?.[0]?.page_no ?? internalCurrentPage;
            const list = map.get(p) || [];
            list.push({ ...c, originalIndex: i });
            map.set(p, list);
        }
        return map;
    }, [coordinates, internalCurrentPage]);

    const currentItems = useMemo(() => {
        return pageIndex.get(internalCurrentPage) || [];
    }, [pageIndex, internalCurrentPage]);

    // Compute a coordinate transform for "new format" (x,y,width,height) per page
    const newFormatTransformByPage = useMemo(() => {
        const byPage = new Map<
            number,
            {
                mode: 'points' | 'normalized' | 'pixels';
                sx: number;
                sy: number;
            }
        >();

        for (const p of normalizedPages) {
            const items = pageIndex.get(p.pageNo) || [];
            const nf = items.filter(
                (c) =>
                    c.x !== undefined &&
                    c.y !== undefined &&
                    c.width !== undefined &&
                    c.height !== undefined &&
                    Number.isFinite(c.x) &&
                    Number.isFinite(c.y) &&
                    Number.isFinite(c.width) &&
                    Number.isFinite(c.height)
            ) as Array<IndexedCoordinate>;

            if (nf.length === 0) {
                byPage.set(p.pageNo, { mode: 'points', sx: 1, sy: 1 });
                continue;
            }

            let maxX = 0;
            let maxY = 0;
            let minX = Infinity;
            let minY = Infinity;

            for (const c of nf) {
                const x = safeNum(c.x, 0);
                const y = safeNum(c.y, 0);
                const w = safeNum(c.width, 0);
                const h = safeNum(c.height, 0);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w);
                maxY = Math.max(maxY, y + h);
            }

            // Determine mode by scale of coordinates
            const looksNormalized = maxX <= 1.5 && maxY <= 1.5 && minX >= -0.1 && minY >= -0.1;
            if (looksNormalized) {
                byPage.set(p.pageNo, { mode: 'normalized', sx: p.width, sy: p.height });
                continue;
            }

            const withinPointsX = maxX <= p.width * 1.25 && maxX >= p.width * 0.5;
            const withinPointsY = maxY <= p.height * 1.25 && maxY >= p.height * 0.5;

            if (withinPointsX && withinPointsY) {
                byPage.set(p.pageNo, { mode: 'points', sx: 1, sy: 1 });
                continue;
            }

            // Treat as pixels (or some other units) and fit to page
            const sx = maxX > 0 ? p.width / maxX : 1;
            const sy = maxY > 0 ? p.height / maxY : 1;
            byPage.set(p.pageNo, { mode: 'pixels', sx, sy });
        }

        return byPage;
    }, [normalizedPages, pageIndex]);

    // Determine best rotation for current page based on bounds (auto-fix rotated pages)
    const effectiveRotationByPage = useMemo(() => {
        const map = new Map<number, 0 | 90 | 180 | 270>();

        for (const p of normalizedPages) {
            const items = pageIndex.get(p.pageNo) || [];
            const pageW = p.width;
            const pageH = p.height;

            const toBaseRect = (coord: IndexedCoordinate): Rect | null => {
                // Use prov if available for this page, else use new format
                const provForPage = coord.prov?.find((pr) => pr?.page_no === p.pageNo)?.bbox ?? coord.prov?.[0]?.bbox;
                if (provForPage && typeof provForPage.l === 'number') {
                    const nb = normalizeBBox(provForPage);
                    const left = nb.x0;
                    const top = nb.isBottomLeft ? pageH - nb.y1 : nb.y0;
                    const width = nb.x1 - nb.x0;
                    const height = nb.y1 - nb.y0;
                    if (!Number.isFinite(left + top + width + height)) return null;
                    return { left, top, width, height };
                }

                if (
                    coord.x !== undefined &&
                    coord.y !== undefined &&
                    coord.width !== undefined &&
                    coord.height !== undefined
                ) {
                    const tf = newFormatTransformByPage.get(p.pageNo) || { mode: 'points', sx: 1, sy: 1 };
                    const left = safeNum(coord.x, 0) * tf.sx;
                    const top = safeNum(coord.y, 0) * tf.sy;
                    const width = safeNum(coord.width, 0) * tf.sx;
                    const height = safeNum(coord.height, 0) * tf.sy;
                    if (!Number.isFinite(left + top + width + height)) return null;
                    return { left, top, width, height };
                }

                return null;
            };

            const sample = items.slice(0, 250).map(toBaseRect).filter(Boolean) as Rect[];
            if (sample.length === 0) {
                map.set(p.pageNo, p.rotation);
                continue;
            }

            const candidates: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
            let bestRot: 0 | 90 | 180 | 270 = p.rotation;
            let bestScore = Number.POSITIVE_INFINITY;

            for (const rot of candidates) {
                let score = 0;
                for (const r of sample) {
                    const { rect: rr, rotatedPageW, rotatedPageH } = rotateRect(r, pageW, pageH, rot);
                    score += rectOutOfBoundsScore(rr, rotatedPageW, rotatedPageH);
                }
                // Prefer page-declared rotation if ties
                const tieBreaker = rot === p.rotation ? -0.0001 : 0;
                const total = score + tieBreaker;
                if (total < bestScore) {
                    bestScore = total;
                    bestRot = rot;
                }
            }

            map.set(p.pageNo, bestRot);
        }

        return map;
    }, [normalizedPages, pageIndex, newFormatTransformByPage]);

    const effectiveRotation = effectiveRotationByPage.get(currentPageInfo.pageNo) || currentPageInfo.rotation;

    const rotatedPageDims = useMemo(() => {
        const w = currentPageInfo.width;
        const h = currentPageInfo.height;
        if (effectiveRotation === 90 || effectiveRotation === 270) return { width: h, height: w };
        return { width: w, height: h };
    }, [currentPageInfo.width, currentPageInfo.height, effectiveRotation]);

    // Convert a coordinate to page-space rect (unscaled)
    const toPageRect = (coord: IndexedCoordinate, page: PageMeta): Rect | null => {
        const pageW = page.width;
        const pageH = page.height;

        // Find best prov bbox for this page
        const provForPage = coord.prov?.find((pr) => pr?.page_no === page.pageNo)?.bbox ?? coord.prov?.[0]?.bbox;

        let baseRect: Rect | null = null;

        if (provForPage && typeof provForPage.l === 'number') {
            const nb = normalizeBBox(provForPage);
            const left = nb.x0;
            const top = nb.isBottomLeft ? pageH - nb.y1 : nb.y0;
            const width = nb.x1 - nb.x0;
            const height = nb.y1 - nb.y0;
            if (Number.isFinite(left + top + width + height) && width >= 0 && height >= 0) {
                baseRect = { left, top, width, height };
            }
        } else if (
            coord.x !== undefined &&
            coord.y !== undefined &&
            coord.width !== undefined &&
            coord.height !== undefined
        ) {
            const tf = newFormatTransformByPage.get(page.pageNo) || { mode: 'points', sx: 1, sy: 1 };
            const x = safeNum(coord.x, 0);
            const y = safeNum(coord.y, 0);
            const w = safeNum(coord.width, 0);
            const h = safeNum(coord.height, 0);

            // Normalize negatives / swapped
            const x0 = Math.min(x, x + w);
            const x1 = Math.max(x, x + w);
            const y0 = Math.min(y, y + h);
            const y1 = Math.max(y, y + h);

            const left = x0 * tf.sx;
            const top = y0 * tf.sy;
            const width = (x1 - x0) * tf.sx;
            const height = (y1 - y0) * tf.sy;

            if (Number.isFinite(left + top + width + height) && width >= 0 && height >= 0) {
                baseRect = { left, top, width, height };
            }
        }

        if (!baseRect) return null;

        const rot = effectiveRotationByPage.get(page.pageNo) || page.rotation;
        const { rect: rr } = rotateRect(baseRect, pageW, pageH, rot);
        return rr;
    };

    const mergeTextBoxesForPage = useCallback(
        (items: IndexedCoordinate[], page: PageMeta): IndexedCoordinate[] => {
            const candidates = items
                .map((coord) => {
                    const rawText = getCoordText(coord).trim();
                    if (!rawText) return null;
                    const rect = toPageRect(coord, page);
                    if (!rect) return null;
                    const label = (coord.label || 'text').toLowerCase();
                    return {
                        coord,
                        rect,
                        rawText,
                        mergeText: normalizeWhitespace(rawText),
                        label,
                        midY: rect.top + rect.height / 2,
                    };
                })
                .filter(Boolean) as Array<{
                    coord: IndexedCoordinate;
                    rect: Rect;
                    rawText: string;
                    mergeText: string;
                    label: string;
                    midY: number;
                }>;

            if (candidates.length <= 1) {
                return candidates.map((item) => ({
                    ...item.coord,
                    text: item.rawText,
                    originalIndices: item.coord.originalIndices ?? [item.coord.originalIndex],
                }));
            }

            candidates.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

            const lineGroups: Array<{
                items: typeof candidates;
                midY: number;
                avgHeight: number;
                label: string;
            }> = [];

            for (const item of candidates) {
                let placed = false;
                for (const group of lineGroups) {
                    const yTolerance = Math.max(4, Math.min(item.rect.height, group.avgHeight) * 0.6);
                    if (item.label === group.label && Math.abs(item.midY - group.midY) <= yTolerance) {
                        group.items.push(item);
                        const count = group.items.length;
                        group.midY = (group.midY * (count - 1) + item.midY) / count;
                        group.avgHeight = (group.avgHeight * (count - 1) + item.rect.height) / count;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    lineGroups.push({
                        items: [item],
                        midY: item.midY,
                        avgHeight: item.rect.height,
                        label: item.label,
                    });
                }
            }

            const merged: IndexedCoordinate[] = [];

            const mergeGroup = (groupItems: typeof candidates) => {
                const sorted = [...groupItems].sort((a, b) => a.rect.left - b.rect.left);
                let current = sorted[0];
                let currentRect = { ...current.rect };
                let currentText = current.rawText;
                let currentIndices = [...(current.coord.originalIndices ?? [current.coord.originalIndex])];

                const flush = () => {
                    const uniqueIndices = Array.from(new Set(currentIndices));
                    merged.push({
                        ...current.coord,
                        text: currentText,
                        originalIndex: uniqueIndices[0],
                        originalIndices: uniqueIndices,
                        mergedRect: { ...currentRect },
                    });
                };

                for (const item of sorted.slice(1)) {
                    const gap = item.rect.left - (currentRect.left + currentRect.width);
                    const gapThreshold = Math.max(4, Math.min(currentRect.height, item.rect.height) * 0.45);
                    if (gap <= gapThreshold) {
                        const normalizedCurrent = normalizeWhitespace(currentText);
                        currentText = `${normalizedCurrent} ${item.mergeText}`.trim();
                        const left = Math.min(currentRect.left, item.rect.left);
                        const top = Math.min(currentRect.top, item.rect.top);
                        const right = Math.max(currentRect.left + currentRect.width, item.rect.left + item.rect.width);
                        const bottom = Math.max(currentRect.top + currentRect.height, item.rect.top + item.rect.height);
                        currentRect = {
                            left,
                            top,
                            width: right - left,
                            height: bottom - top,
                        };
                        currentIndices = currentIndices.concat(
                            item.coord.originalIndices ?? [item.coord.originalIndex]
                        );
                    } else {
                        flush();
                        current = item;
                        currentRect = { ...item.rect };
                        currentText = item.rawText;
                        currentIndices = item.coord.originalIndices ?? [item.coord.originalIndex];
                    }
                }

                flush();
            };

            for (const group of lineGroups) {
                mergeGroup(group.items);
            }

            return merged;
        },
        [toPageRect]
    );

    const currentPageTables = useMemo(() => currentItems.filter((c) => c.isTable), [currentItems]);

    const currentPageElements = useMemo(() => {
        const items = currentItems.filter((c) => !c.isTable);
        if (items.length === 0) return [];
        return mergeTextBoxesForPage(items, currentPageInfo);
    }, [currentItems, currentPageInfo, mergeTextBoxesForPage]);

    const highlightedElementId = useMemo(() => {
        if (highlightedIndex == null) return null;
        const match = currentPageElements.find(
            (coord) =>
                coord.originalIndex === highlightedIndex ||
                coord.originalIndices?.includes(highlightedIndex)
        );
        return match ? `sdv-el-${match.originalIndex}` : `sdv-el-${highlightedIndex}`;
    }, [highlightedIndex, currentPageElements]);

    const handlePageChange = (externalPage: number) => {
        const internal = externalToInternalPage(externalPage);
        const out = internalToExternalPage(internal);
        onPageChange?.(out);
    };

    const goToPrevPage = () => {
        const sorted = normalizedPages.map((p) => p.pageNo).sort((a, b) => a - b);
        const idx = sorted.indexOf(internalCurrentPage);
        const prevInternal = idx > 0 ? sorted[idx - 1] : sorted[0];
        onPageChange?.(internalToExternalPage(prevInternal));
    };

    const goToNextPage = () => {
        const sorted = normalizedPages.map((p) => p.pageNo).sort((a, b) => a - b);
        const idx = sorted.indexOf(internalCurrentPage);
        const nextInternal = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : sorted[sorted.length - 1];
        onPageChange?.(internalToExternalPage(nextInternal));
    };

    const zoomIn = () => setScale((s) => clamp(Number((s + 0.1).toFixed(2)), 0.2, 2.5));
    const zoomOut = () => setScale((s) => clamp(Number((s - 0.1).toFixed(2)), 0.2, 2.5));

    // Fit modes recalc
    useEffect(() => {
        if (fitMode === 'none') return;
        const scroller = scrollRef.current;
        if (!scroller) return;

        const padding = 96; // match p-12 around page, plus breathing room
        const availableW = Math.max(200, scroller.clientWidth - padding);
        const availableH = Math.max(200, scroller.clientHeight - padding);

        const pageW = rotatedPageDims.width;
        const pageH = rotatedPageDims.height;

        if (fitMode === 'width') {
            const s = availableW / pageW;
            setScale(clamp(s, 0.2, 2.5));
        } else if (fitMode === 'page') {
            const s = Math.min(availableW / pageW, availableH / pageH);
            setScale(clamp(s, 0.2, 2.5));
        }
    }, [fitMode, rotatedPageDims.width, rotatedPageDims.height]);

    // If highlighted index is on a different page, switch pages
    useEffect(() => {
        if (highlightedIndex == null) return;
        const coord = coordinates[highlightedIndex];
        if (!coord) return;
        const p = coord.page ?? coord.prov?.[0]?.page_no;
        if (typeof p !== 'number') return;

        if (p !== internalCurrentPage) {
            onPageChange?.(internalToExternalPage(p));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlightedIndex]);

    // Auto-scroll highlight into view
    useEffect(() => {
        if (!highlightedElementId) return;
        const el = document.getElementById(highlightedElementId);
        const scroller = scrollRef.current;
        if (!el || !scroller) return;

        // Only scroll if element is significantly out of view
        const elRect = el.getBoundingClientRect();
        const scRect = scroller.getBoundingClientRect();

        const outTop = elRect.top < scRect.top + 60;
        const outBottom = elRect.bottom > scRect.bottom - 60;
        const outLeft = elRect.left < scRect.left + 40;
        const outRight = elRect.right > scRect.right - 40;

        if (outTop || outBottom || outLeft || outRight) {
            el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        }
    }, [highlightedElementId, internalCurrentPage, scale]);

    const externalPageDisplay = internalToExternalPage(internalCurrentPage);

    // For transform-based scaling: wrapper uses scaled dims, inner uses page dims and transform.
    const pageScaledW = rotatedPageDims.width * scale;
    const pageScaledH = rotatedPageDims.height * scale;

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 px-4 py-2 bg-background/95 backdrop-blur border-b border-border/40 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-muted/30 rounded-md border border-border/50 p-0.5">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={goToPrevPage}
                            disabled={numPages <= 1}
                            aria-label="Previous page"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>

                        <div className="px-2 flex items-center gap-1 min-w-[6rem] justify-center">
                            <span className="text-[11px] font-bold font-mono text-foreground">{externalPageDisplay}</span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">/</span>
                            <span className="text-[11px] font-bold font-mono text-muted-foreground">
                                {pageNumbering.likelyZeroBased ? numPages : numPages}
                            </span>
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={goToNextPage}
                            disabled={numPages <= 1}
                            aria-label="Next page"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="hidden sm:flex items-center bg-muted/30 rounded-md border border-border/50 p-0.5">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${fitMode === 'width' ? 'text-foreground' : 'text-muted-foreground'} hover:text-foreground`}
                            onClick={() => setFitMode((m) => (m === 'width' ? 'none' : 'width'))}
                            aria-label="Fit to width"
                            title="Fit to width"
                        >
                            <Maximize2 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${fitMode === 'page' ? 'text-foreground' : 'text-muted-foreground'} hover:text-foreground`}
                            onClick={() => setFitMode((m) => (m === 'page' ? 'none' : 'page'))}
                            aria-label="Fit to page"
                            title="Fit to page"
                        >
                            <Minimize2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-muted/30 rounded-md border border-border/50 p-0.5">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                                setFitMode('none');
                                zoomOut();
                            }}
                            aria-label="Zoom out"
                        >
                            <ZoomOut className="h-4 w-4" />
                        </Button>

                        <span className="px-2 text-[10px] font-bold font-mono min-w-[3.75rem] text-center text-muted-foreground uppercase">
                            {Math.round(scale * 100)}%
                        </span>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                                setFitMode('none');
                                zoomIn();
                            }}
                            aria-label="Zoom in"
                        >
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Document Canvas */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-auto bg-[#18181b] bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px]"
            >
                <div className="flex justify-center items-start p-12" style={{ minWidth: 'fit-content', minHeight: '100%' }}>
                    {/* Wrapper defines scaled scroll area */}
                    <div
                        ref={pageWrapperRef}
                        className="relative"
                        style={{
                            width: pageScaledW,
                            height: pageScaledH,
                            minWidth: pageScaledW,
                            minHeight: pageScaledH,
                            flexShrink: 0,
                        }}
                    >
                        {/* Inner is unscaled page; we transform scale for performance */}
                        <div
                            className="absolute left-0 top-0 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)] rounded-sm border border-white/5 ring-1 ring-white/10 bg-white"
                            style={{
                                width: rotatedPageDims.width,
                                height: rotatedPageDims.height,
                                transform: `scale(${scale})`,
                                transformOrigin: 'top left',
                            }}
                        >
                            {/* Render text elements */}
                            {currentPageElements.map((coord) => {
                                const pos = coord.mergedRect ?? toPageRect(coord, currentPageInfo);
                                if (!pos) return null;

                                const rawText = getCoordText(coord);
                                const displayText = rawText.trim();
                                if (!displayText) return null;

                                // Ignore obviously invalid rectangles
                                if (pos.width <= 0 || pos.height <= 0) return null;

                                const isHighlighted =
                                    coord.originalIndex === highlightedIndex ||
                                    coord.originalIndices?.includes(highlightedIndex ?? -1);

                                const { fontWeight, textAlign, alignItems, justifyContent, padding, family } = getTextStyling(coord.label);

                                // Slightly inset padding while keeping within bbox
                                const pad = clamp(padding, 0, 4);
                                const innerW = Math.max(0, pos.width - pad * 2);
                                const innerH = Math.max(0, pos.height - pad * 2);

                                const { fontSize, lines } = calculateFontSizeMeasured(innerW, innerH, displayText, coord.label);
                                const renderedText = lines.join('\n');

                                return (
                                    <div
                                        key={coord.originalIndex}
                                        id={`sdv-el-${coord.originalIndex}`}
                                        role="button"
                                        tabIndex={0}
                                        className={`absolute overflow-hidden cursor-pointer transition-all duration-150 ${isHighlighted
                                                ? 'bg-primary/15 ring-1 ring-primary shadow-[0_0_15px_rgba(59,130,246,0.25)] z-10'
                                                : 'hover:bg-primary/5 hover:ring-1 hover:ring-primary/25'
                                            }`}
                                        style={{
                                            left: pos.left,
                                            top: pos.top,
                                            width: pos.width,
                                            height: pos.height,
                                            color: isHighlighted ? 'hsl(var(--primary))' : '#000000',
                                            fontFamily: family,
                                            fontWeight,
                                            fontSize: `${fontSize}px`,
                                            lineHeight: 1.18,
                                            padding: `${pad}px`,
                                            display: 'flex',
                                            alignItems,
                                            justifyContent,
                                            textAlign,
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                        }}
                                        onClick={() => onElementClick?.(coord.originalIndex)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onElementClick?.(coord.originalIndex);
                                            }
                                        }}
                                        title={displayText ? `${coord.label || 'text'}: ${displayText}` : coord.label || 'text'}
                                    >
                                        <div style={{ width: innerW, height: innerH, overflow: 'hidden' }}>{renderedText}</div>
                                    </div>
                                );
                            })}

                            {/* Render tables */}
                            {currentPageTables.map((tableCoord) => {
                                const pos = toPageRect(tableCoord, currentPageInfo);
                                if (!pos) return null;
                                if (pos.width <= 0 || pos.height <= 0) return null;

                                const tableIndex = tableCoord.tableIndex ?? 0;
                                const tableData = tables?.[tableIndex];
                                const isHighlighted =
                                    tableCoord.originalIndex === highlightedIndex ||
                                    tableCoord.originalIndices?.includes(highlightedIndex ?? -1);

                                const { headers, rows, colCount } = extractTable(tableData);

                                const totalRows = Math.max(1, rows.length + (headers.some((h) => h.trim().length > 0) ? 1 : 0));
                                const rowH = pos.height / totalRows;

                                const baseFont = clamp(rowH * 0.55, 1, 14);
                                const headerFont = clamp(baseFont * 1.08, 1, 16);

                                const headerExists = headers.some((h) => h.trim().length > 0);

                                // Fixed layout with equal column widths
                                const colWidth = colCount > 0 ? `${100 / colCount}%` : 'auto';

                                return (
                                    <div
                                        key={tableCoord.originalIndex}
                                        id={`sdv-el-${tableCoord.originalIndex}`}
                                        role="button"
                                        tabIndex={0}
                                        className={`absolute overflow-auto cursor-pointer border border-slate-200/70 transition-all duration-150 ${isHighlighted
                                                ? 'ring-2 ring-primary shadow-[0_0_18px_rgba(59,130,246,0.18)] z-10'
                                                : 'hover:ring-1 hover:ring-primary/35'
                                            }`}
                                        style={{
                                            left: pos.left,
                                            top: pos.top,
                                            width: pos.width,
                                            height: pos.height,
                                            backgroundColor: '#ffffff',
                                        }}
                                        onClick={() => onElementClick?.(tableCoord.originalIndex)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onElementClick?.(tableCoord.originalIndex);
                                            }
                                        }}
                                        title={`table: ${tableIndex + 1}`}
                                    >
                                        {rows.length > 0 || headerExists ? (
                                            <table
                                                className="w-full border-collapse"
                                                style={{
                                                    tableLayout: 'fixed',
                                                    fontSize: `${baseFont}px`,
                                                    color: '#0b1220',
                                                    backgroundColor: '#ffffff',
                                                }}
                                            >
                                                <colgroup>
                                                    {new Array(colCount).fill(0).map((_, i) => (
                                                        <col key={i} style={{ width: colWidth }} />
                                                    ))}
                                                </colgroup>

                                                {headerExists && (
                                                    <thead style={{ backgroundColor: '#f3f4f6' }}>
                                                        <tr>
                                                            {headers.map((h, idx) => (
                                                                <th
                                                                    key={idx}
                                                                    style={{
                                                                        border: '1px solid #cbd5e1',
                                                                        padding: `${clamp(baseFont * 0.25, 1, 6)}px ${clamp(baseFont * 0.35, 2, 8)}px`,
                                                                        textAlign: 'left',
                                                                        fontWeight: 700,
                                                                        fontSize: `${headerFont}px`,
                                                                        color: '#0b1220',
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                    }}
                                                                >
                                                                    {h}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                )}

                                                <tbody>
                                                    {rows.map((row, rowIdx) => (
                                                        <tr
                                                            key={rowIdx}
                                                            style={{
                                                                backgroundColor: rowIdx % 2 === 0 ? '#ffffff' : '#f9fafb',
                                                            }}
                                                        >
                                                            {row.map((cell, cellIdx) => (
                                                                <td
                                                                    key={cellIdx}
                                                                    style={{
                                                                        border: '1px solid #e2e8f0',
                                                                        padding: `${clamp(baseFont * 0.28, 1, 6)}px ${clamp(baseFont * 0.38, 2, 10)}px`,
                                                                        fontSize: `${baseFont}px`,
                                                                        color: '#0f172a',
                                                                        verticalAlign: 'top',
                                                                        lineHeight: 1.25,
                                                                        wordBreak: 'break-word',
                                                                        overflow: 'hidden',
                                                                    }}
                                                                    title={cell}
                                                                >
                                                                    {cell}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    height: '100%',
                                                    color: '#6b7280',
                                                    fontSize: '12px',
                                                }}
                                            >
                                                Table {tableIndex + 1} (no data)
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default StructuredDocumentView;
