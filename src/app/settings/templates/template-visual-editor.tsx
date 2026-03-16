"use client";

import * as React from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Calculator,
  CheckCircle2,
  Circle,
  Code2,
  Copy,
  Eye,
  FileText,
  GripVertical,
  Heading,
  LayoutTemplate,
  List,
  ListOrdered,
  ListTree,
  MapPin,
  MessageSquareWarning,
  Minus,
  Palette,
  PenTool,
  Plus,
  Scissors,
  Settings2,
  Type,
  X,
  ZoomIn,
  ZoomOut,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type BlockType =
  | "header"
  | "heading"
  | "text"
  | "table"
  | "columns"
  | "spacer"
  | "signature"
  | "divider"
  | "totals"
  | "key_value"
  | "terms"
  | "html"
  | "page_break"
  | "callout"
  | "address"
  | "list_loop";

export interface VisualBlock {
  id: string;
  type: BlockType;
  content?: string;
  props?: Record<string, any>;
}

export type TemplateVisualSnapshot = {
  html: string;
  css: string;
  blocks: VisualBlock[];
};

export type TemplatePathSuggestion = {
  path: string;
  type?: string;
  required?: boolean;
  description?: string;
  constraints?: string[];
  source?: "schema" | "sample";
};

type ResolvedPathSuggestion = {
  path: string;
  type: string;
  required: boolean;
  description: string;
  constraints: string[];
  source: "schema" | "sample" | "custom";
};

type ThemeConfig = {
  fontFamily: string;
  background: string;
  textColor: string;
};

type CanvasMode = "preview" | "fields";

type TableColumnConfig = {
  id: string;
  header: string;
  field: string;
  align: "left" | "center" | "right";
};

type KeyValueRowConfig = {
  id: string;
  label: string;
  value: string;
};

type TotalRowConfig = {
  id: string;
  label: string;
  valuePath: string;
  emphasis: boolean;
};

type BlockLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

type ActiveBindingTarget = {
  kind: "content" | "prop" | "table_column_field" | "key_value_value" | "total_row_path";
  key?: string;
  columnId?: string;
  rowId?: string;
  label: string;
  mode: "template" | "path" | "expression" | "raw";
  multiline?: boolean;
};

type FieldPickerBehavior = "insert" | "replace";

interface TemplateVisualEditorProps {
  initialHtml: string;
  initialCss: string;
  initialBlocks?: VisualBlock[] | null;
  pathSuggestions?: Array<string | TemplatePathSuggestion>;
  previewData?: Record<string, any> | null;
  readOnly?: boolean;
  readOnlyReason?: string;
  onSnapshotChange?: (snapshot: TemplateVisualSnapshot) => void;
  onRegisterSnapshot?: (fn: () => TemplateVisualSnapshot) => void;
}

type SimpleRndPosition = { x: number; y: number };
type SimpleRndSize = { width: number; height: number };
type SimpleRndDragData = { x: number; y: number };
type SimpleRndResizeDelta = { width: number; height: number };
type SimpleRndResizeDirection =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

type SimpleRndProps = {
  size: SimpleRndSize;
  position: SimpleRndPosition;
  bounds?: "parent";
  scale?: number;
  dragHandleClassName?: string;
  dragGrid?: [number, number];
  resizeGrid?: [number, number];
  cancel?: string;
  minWidth?: number;
  minHeight?: number;
  enableResizing?: boolean;
  disableDragging?: boolean;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onDragStart?: (event: PointerEvent) => void;
  onDragStop?: (event: PointerEvent, data: SimpleRndDragData) => void;
  onResizeStop?: (
    event: PointerEvent,
    direction: SimpleRndResizeDirection,
    ref: HTMLDivElement,
    delta: SimpleRndResizeDelta,
    position: SimpleRndPosition
  ) => void;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
};

function snapToGrid(value: number, grid?: number) {
  const safeGrid = Number(grid);
  if (!Number.isFinite(safeGrid) || safeGrid <= 1) return value;
  return Math.round(value / safeGrid) * safeGrid;
}

function matchesSelector(target: EventTarget | null, selector?: string) {
  if (!selector || !(target instanceof Element)) return false;
  try {
    return Boolean(target.closest(selector));
  } catch {
    return false;
  }
}

const SimpleRnd = React.forwardRef<HTMLDivElement, SimpleRndProps>(function SimpleRnd(
  {
    size,
    position,
    bounds,
    scale = 1,
    dragHandleClassName,
    dragGrid,
    resizeGrid,
    cancel,
    minWidth = 0,
    minHeight = 0,
    enableResizing = true,
    disableDragging = false,
    onMouseDown,
    onDragStart,
    onDragStop,
    onResizeStop,
    style,
    className,
    children,
  },
  forwardedRef
) {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const interactionRef = React.useRef<{
    type: "drag" | "resize";
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origin: { x: number; y: number; width: number; height: number };
    direction?: SimpleRndResizeDirection;
    parentWidth: number;
    parentHeight: number;
  } | null>(null);
  const [preview, setPreview] = React.useState(() => ({
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  }));

  React.useImperativeHandle(forwardedRef, () => wrapperRef.current as HTMLDivElement, []);

  React.useEffect(() => {
    if (interactionRef.current) return;
    setPreview({
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    });
  }, [position.x, position.y, size.height, size.width]);

  const clampRectToParent = React.useCallback((next: { x: number; y: number; width: number; height: number }) => {
    if (bounds !== "parent") return next;
    const interaction = interactionRef.current;
    if (!interaction) return next;
    const maxX = Math.max(0, interaction.parentWidth - next.width);
    const maxY = Math.max(0, interaction.parentHeight - next.height);
    return {
      ...next,
      x: clamp(next.x, 0, maxX),
      y: clamp(next.y, 0, maxY),
    };
  }, [bounds]);

  const finishInteraction = React.useCallback((event: PointerEvent) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    interactionRef.current = null;

    if (interaction.type === "drag") {
      onDragStop?.(event, { x: preview.x, y: preview.y });
      return;
    }

    if (interaction.type === "resize" && wrapperRef.current) {
      onResizeStop?.(
        event,
        interaction.direction || "bottomRight",
        wrapperRef.current,
        {
          width: preview.width - interaction.origin.width,
          height: preview.height - interaction.origin.height,
        },
        { x: preview.x, y: preview.y }
      );
    }
  }, [onDragStop, onResizeStop, preview.height, preview.width, preview.x, preview.y]);

  React.useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const dx = (event.clientX - interaction.startClientX) / Math.max(scale, 0.0001);
      const dy = (event.clientY - interaction.startClientY) / Math.max(scale, 0.0001);

      if (interaction.type === "drag") {
        const next = clampRectToParent({
          ...preview,
          x: snapToGrid(interaction.origin.x + dx, dragGrid?.[0]),
          y: snapToGrid(interaction.origin.y + dy, dragGrid?.[1]),
          width: interaction.origin.width,
          height: interaction.origin.height,
        });
        setPreview(next);
        return;
      }

      let nextX = interaction.origin.x;
      let nextY = interaction.origin.y;
      let nextWidth = interaction.origin.width;
      let nextHeight = interaction.origin.height;
      const direction = interaction.direction || "bottomRight";
      const directionKey = direction.toLowerCase();

      if (directionKey.includes("right")) {
        nextWidth = Math.max(minWidth, snapToGrid(interaction.origin.width + dx, resizeGrid?.[0]));
      }
      if (directionKey.includes("left")) {
        const rawWidth = Math.max(minWidth, snapToGrid(interaction.origin.width - dx, resizeGrid?.[0]));
        nextX = interaction.origin.x + (interaction.origin.width - rawWidth);
        nextWidth = rawWidth;
      }
      if (directionKey.includes("bottom")) {
        nextHeight = Math.max(minHeight, snapToGrid(interaction.origin.height + dy, resizeGrid?.[1]));
      }
      if (directionKey.includes("top")) {
        const rawHeight = Math.max(minHeight, snapToGrid(interaction.origin.height - dy, resizeGrid?.[1]));
        nextY = interaction.origin.y + (interaction.origin.height - rawHeight);
        nextHeight = rawHeight;
      }

      if (bounds === "parent") {
        if (directionKey.includes("left") && nextX < 0) {
          nextWidth += nextX;
          nextX = 0;
        }
        if (directionKey.includes("top") && nextY < 0) {
          nextHeight += nextY;
          nextY = 0;
        }
        nextWidth = Math.min(nextWidth, interaction.parentWidth - nextX);
        nextHeight = Math.min(nextHeight, interaction.parentHeight - nextY);
      }

      setPreview({
        x: nextX,
        y: nextY,
        width: Math.max(minWidth, nextWidth),
        height: Math.max(minHeight, nextHeight),
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      finishInteraction(event);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [
    bounds,
    clampRectToParent,
    dragGrid,
    finishInteraction,
    minHeight,
    minWidth,
    preview,
    resizeGrid,
    scale,
  ]);

  const startInteraction = React.useCallback((event: React.PointerEvent<HTMLDivElement>, type: "drag" | "resize", direction?: SimpleRndResizeDirection) => {
    if (!wrapperRef.current) return;
    const parent = wrapperRef.current.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    interactionRef.current = {
      type,
      direction,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: {
        x: preview.x,
        y: preview.y,
        width: preview.width,
        height: preview.height,
      },
      parentWidth: parentRect ? parentRect.width / Math.max(scale, 0.0001) : Number.MAX_SAFE_INTEGER,
      parentHeight: parentRect ? parentRect.height / Math.max(scale, 0.0001) : Number.MAX_SAFE_INTEGER,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [preview.height, preview.width, preview.x, preview.y, scale]);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (disableDragging) return;
    if (matchesSelector(event.target, cancel)) return;
    if (dragHandleClassName && !matchesSelector(event.target, `.${dragHandleClassName}`)) return;

    onDragStart?.(event.nativeEvent);
    startInteraction(event, "drag");
  }, [cancel, disableDragging, dragHandleClassName, onDragStart, startInteraction]);

  const resizeHandles: Array<{ direction: SimpleRndResizeDirection; className: string }> = [
    { direction: "top", className: "left-3 right-3 top-0 h-2 -translate-y-1/2 cursor-ns-resize" },
    { direction: "right", className: "right-0 top-3 bottom-3 w-2 translate-x-1/2 cursor-ew-resize" },
    { direction: "bottom", className: "left-3 right-3 bottom-0 h-2 translate-y-1/2 cursor-ns-resize" },
    { direction: "left", className: "left-0 top-3 bottom-3 w-2 -translate-x-1/2 cursor-ew-resize" },
    { direction: "topLeft", className: "left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
    { direction: "topRight", className: "right-0 top-0 h-3 w-3 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
    { direction: "bottomLeft", className: "left-0 bottom-0 h-3 w-3 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
    { direction: "bottomRight", className: "right-0 bottom-0 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
  ];

  return (
    <div
      ref={wrapperRef}
      className={cn("absolute", className)}
      style={{
        ...style,
        left: preview.x,
        top: preview.y,
        width: preview.width,
        height: preview.height,
      }}
      onMouseDown={onMouseDown}
      onPointerDown={handlePointerDown}
    >
      {children}

      {enableResizing !== false ? resizeHandles.map((handle) => (
        <div
          key={handle.direction}
          className={cn("absolute z-30 rounded-full bg-transparent", handle.className)}
          onPointerDown={(event) => {
            event.stopPropagation();
            startInteraction(event, "resize", handle.direction);
          }}
        />
      )) : null}
    </div>
  );
});

const Rnd = SimpleRnd;

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_MARGIN = 32;
const GRID_SIZE = 8;
const MIN_BLOCK_WIDTH = 96;
const MIN_BLOCK_HEIGHT = 32;

const VISUAL_THEME_PREFIX = "/* VISUAL_EDITOR_THEME ";
const VISUAL_THEME_SUFFIX = " */";
const VISUAL_BASE_START = "/* VISUAL_EDITOR_BASE_START */";
const VISUAL_BASE_END = "/* VISUAL_EDITOR_BASE_END */";
const TEMPLATE_VISUAL_CANVAS_SCOPE = ".template-visual-canvas";
const TEMPLATE_VISUAL_HTML_HELPERS = `
.template-visual-canvas .canvas-html-block {
  white-space: normal;
  line-height: 1.6;
}

.template-visual-canvas .builder-field-chip {
  display: inline-flex;
  align-items: center;
  margin: 0 2px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #bae6fd;
  background: #eff6ff;
  color: #0369a1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  vertical-align: middle;
}

.template-visual-canvas .builder-template-tag {
  display: inline-flex;
  align-items: center;
  margin: 0 4px 4px 0;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px dashed #cbd5e1;
  background: rgba(248, 250, 252, 0.96);
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  vertical-align: middle;
}
`.trim();

const DEFAULT_THEME: ThemeConfig = {
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  background: "#ffffff",
  textColor: "#0f172a",
};

const PANEL_CLASS = "rounded-xl border border-border/60 bg-card/80 shadow-sm";

const AVAILABLE_BLOCKS: Array<{ type: BlockType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { type: "header", label: "Document Header", icon: LayoutTemplate },
  { type: "heading", label: "Heading", icon: Heading },
  { type: "text", label: "Text", icon: Type },
  { type: "callout", label: "Callout", icon: MessageSquareWarning },
  { type: "address", label: "Address", icon: MapPin },
  { type: "columns", label: "Columns", icon: AlignLeft },
  { type: "key_value", label: "Key Value", icon: ListTree },
  { type: "table", label: "Table", icon: List },
  { type: "totals", label: "Totals", icon: Calculator },
  { type: "list_loop", label: "Repeater List", icon: ListOrdered },
  { type: "terms", label: "Terms", icon: FileText },
  { type: "signature", label: "Signature", icon: PenTool },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: Type },
  { type: "page_break", label: "Page Break", icon: Scissors },
  { type: "html", label: "Custom HTML", icon: Code2 },
];

const BLOCK_LABELS = new Map(AVAILABLE_BLOCKS.map((item) => [item.type, item.label]));

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function selectClassName() {
  return "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";
}

function snap(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function coerceNumber(value: any, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stripTemplateDelimiters(value: string) {
  return String(value || "")
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .trim();
}

function parseCsv(value: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function alignValue(value: any): "left" | "center" | "right" {
  return value === "center" || value === "right" ? value : "left";
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeTheme(value: any): ThemeConfig {
  const source = value && typeof value === "object" ? value : {};
  return {
    fontFamily: typeof source.fontFamily === "string" && source.fontFamily.trim() ? source.fontFamily.trim() : DEFAULT_THEME.fontFamily,
    background: typeof source.background === "string" && source.background.trim() ? source.background.trim() : DEFAULT_THEME.background,
    textColor: typeof source.textColor === "string" && source.textColor.trim() ? source.textColor.trim() : DEFAULT_THEME.textColor,
  };
}

function extractThemeFromCss(initialCss: string): ThemeConfig {
  const match = String(initialCss || "").match(/\/\* VISUAL_EDITOR_THEME ([\s\S]*?) \*\//);
  if (!match) return DEFAULT_THEME;
  try {
    return normalizeTheme(JSON.parse(match[1]));
  } catch {
    return DEFAULT_THEME;
  }
}

function stripGeneratedBaseCss(initialCss: string) {
  return String(initialCss || "")
    .replace(/\/\* VISUAL_EDITOR_THEME [\s\S]*? \*\/\s*/g, "")
    .replace(/\/\* VISUAL_EDITOR_BASE_START \*\/[\s\S]*?\/\* VISUAL_EDITOR_BASE_END \*\/\s*/g, "")
    .trim();
}

function defaultBlockDimensions(type: BlockType) {
  switch (type) {
    case "header":
      return { width: PAGE_WIDTH - PAGE_MARGIN * 2, height: 112 };
    case "heading":
      return { width: 360, height: 80 };
    case "text":
      return { width: 360, height: 140 };
    case "callout":
      return { width: 360, height: 120 };
    case "address":
    case "columns":
      return { width: PAGE_WIDTH - PAGE_MARGIN * 2, height: 128 };
    case "table":
      return { width: PAGE_WIDTH - PAGE_MARGIN * 2, height: 260 };
    case "totals":
      return { width: 320, height: 148 };
    case "key_value":
      return { width: 320, height: 140 };
    case "list_loop":
      return { width: 360, height: 140 };
    case "terms":
      return { width: PAGE_WIDTH - PAGE_MARGIN * 2, height: 140 };
    case "signature":
      return { width: 260, height: 96 };
    case "divider":
      return { width: PAGE_WIDTH - PAGE_MARGIN * 2, height: 16 };
    case "spacer":
      return { width: PAGE_WIDTH - PAGE_MARGIN * 2, height: 48 };
    case "page_break":
      return { width: PAGE_WIDTH - PAGE_MARGIN * 2, height: 40 };
    case "html":
      return { width: 360, height: 160 };
    default:
      return { width: 320, height: 120 };
  }
}

function defaultLayoutForType(type: BlockType, index: number): BlockLayout {
  const dims = defaultBlockDimensions(type);
  const x = PAGE_MARGIN;
  const y = snap(clamp(PAGE_MARGIN + index * 88, 0, PAGE_HEIGHT - dims.height));
  return {
    x,
    y,
    width: dims.width,
    height: dims.height,
    zIndex: index + 1,
  };
}

function normalizeBlockLayout(value: any, fallback: BlockLayout): BlockLayout {
  const width = snap(clamp(coerceNumber(value?.width, fallback.width), MIN_BLOCK_WIDTH, PAGE_WIDTH));
  const height = snap(clamp(coerceNumber(value?.height, fallback.height), MIN_BLOCK_HEIGHT, PAGE_HEIGHT));
  const x = snap(clamp(coerceNumber(value?.x, fallback.x), 0, PAGE_WIDTH - width));
  const y = snap(clamp(coerceNumber(value?.y, fallback.y), 0, PAGE_HEIGHT - height));
  const zIndex = Math.max(1, Math.trunc(coerceNumber(value?.zIndex, fallback.zIndex)));
  return { x, y, width, height, zIndex };
}

function getBlockLayout(block: VisualBlock, index: number) {
  return normalizeBlockLayout(block?.props?.layout, defaultLayoutForType(block.type, index));
}

function defaultBlockStyle(type: BlockType) {
  if (type === "callout") {
    return {
      padding: "16px",
      backgroundColor: "#eef2ff",
      textAlign: "left",
      borderRadius: "14px",
      borderColor: "#c7d2fe",
      borderWidth: "1px",
      borderStyle: "solid",
      color: "#0f172a",
      fontSize: "14px",
      fontWeight: "400",
    };
  }

  if (type === "divider" || type === "spacer" || type === "page_break") {
    return {
      padding: "0px",
      backgroundColor: "transparent",
      textAlign: "left",
      borderRadius: "0px",
      borderColor: "transparent",
      borderWidth: "0px",
      borderStyle: "solid",
      color: "#0f172a",
      fontSize: "14px",
      fontWeight: "400",
    };
  }

  return {
    padding: "12px",
    backgroundColor: "#ffffff",
    textAlign: "left",
    borderRadius: "0px",
    borderColor: "transparent",
    borderWidth: "0px",
    borderStyle: "solid",
    color: "#0f172a",
    fontSize: "14px",
    fontWeight: "400",
  };
}

function normalizeBlockStyle(type: BlockType, value: any) {
  const fallback = defaultBlockStyle(type);
  const source = value && typeof value === "object" ? value : {};
  return {
    padding: typeof source.padding === "string" && source.padding.trim() ? source.padding : fallback.padding,
    backgroundColor:
      typeof source.backgroundColor === "string" && source.backgroundColor.trim() ? source.backgroundColor : fallback.backgroundColor,
    textAlign: typeof source.textAlign === "string" && source.textAlign.trim() ? source.textAlign : fallback.textAlign,
    borderRadius: typeof source.borderRadius === "string" && source.borderRadius.trim() ? source.borderRadius : fallback.borderRadius,
    borderColor: typeof source.borderColor === "string" && source.borderColor.trim() ? source.borderColor : fallback.borderColor,
    borderWidth: typeof source.borderWidth === "string" && source.borderWidth.trim() ? source.borderWidth : fallback.borderWidth,
    borderStyle: typeof source.borderStyle === "string" && source.borderStyle.trim() ? source.borderStyle : fallback.borderStyle,
    color: typeof source.color === "string" && source.color.trim() ? source.color : fallback.color,
    fontSize: typeof source.fontSize === "string" && source.fontSize.trim() ? source.fontSize : fallback.fontSize,
    fontWeight: typeof source.fontWeight === "string" && source.fontWeight.trim() ? source.fontWeight : fallback.fontWeight,
  };
}

function reindexBlockLayouts(blocks: VisualBlock[]) {
  return blocks.map((block, index) => ({
    ...block,
    props: {
      ...(block.props || {}),
      style: normalizeBlockStyle(block.type, block?.props?.style),
      layout: {
        ...getBlockLayout(block, index),
        zIndex: index + 1,
      },
    },
  }));
}

function normalizeIncomingBlocks(value: VisualBlock[] | null | undefined) {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const type = typeof item.type === "string" ? (item.type as BlockType) : "text";
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : makeId(`blk_${index + 1}`),
        type,
        content: typeof item.content === "string" ? item.content : "",
        props: {
          ...(item.props && typeof item.props === "object" && !Array.isArray(item.props) ? item.props : {}),
          style: normalizeBlockStyle(type, item?.props?.style),
          layout: normalizeBlockLayout(item?.props?.layout, defaultLayoutForType(type, index)),
        },
      };
    });
  return reindexBlockLayouts(normalized);
}

function defaultBlockContent(type: BlockType) {
  switch (type) {
    case "heading":
      return "Document Title";
    case "text":
      return "Add a descriptive paragraph here.\nUse {{ field_name }} tokens or click fields on the left.";
    case "callout":
      return "Highlight an important message here.";
    case "terms":
      return "Add terms and conditions here.";
    case "signature":
      return "Authorized Signature";
    case "html":
      return "<div>{{ field_name }}</div>";
    default:
      return "";
  }
}

function normalizeTableColumns(value: any) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : `col_${index + 1}`,
      header: String(item.header || "").trim(),
      field: String(item.field || "").trim(),
      align: alignValue(item.align),
    }));
}

function normalizeTableColumnField(value: any, itemsPath: any) {
  let raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("{%")) return raw;
  if (raw.startsWith("{{") && raw.endsWith("}}")) {
    raw = stripTemplateDelimiters(raw);
  }

  const resolvedItemsPath = normalizeExpressionPath(String(itemsPath ?? "items"));
  const collection = resolvedItemsPath ? resolvedItemsPath : "items";
  if (raw === "item") return raw;
  if (raw.startsWith("item.")) return raw.slice(5);
  if (raw.startsWith(collection + "[].")) return raw.slice(collection.length + 3);
  if (raw.startsWith(collection + ".")) return raw.slice(collection.length + 1);
  return raw;
}

function getTableColumns(props: Record<string, any>) {
  const itemsPath = String(props?.itemsPath ?? "items");
  if (Array.isArray(props?.columnDefs)) {
    const normalizedColumns = normalizeTableColumns(props.columnDefs);
    for (const column of normalizedColumns) {
      column.field = normalizeTableColumnField(column.field, itemsPath);
    }
    return normalizedColumns;
  }
  const columnDefs = normalizeTableColumns(props?.columnDefs);
  if (columnDefs.length > 0) {
    for (const column of columnDefs) {
      column.field = normalizeTableColumnField(column.field, itemsPath);
    }
    return columnDefs;
  }

  const headers = parseCsv(String(props?.columns ?? ""));
  const fields = parseCsv(String(props?.dataKeys ?? ""));
  const count = Math.max(headers.length, fields.length);
  const columns: TableColumnConfig[] = [];
  for (let index = 0; index < count; index += 1) {
    const header = headers[index] ? headers[index] : "Column " + (index + 1);
    const field = normalizeTableColumnField(fields[index] ? fields[index] : "", itemsPath);
    if (!header && !field) continue;
    columns.push({
      id: "legacy_col_" + (index + 1),
      header,
      field,
      align: "left",
    });
  }
  return columns;
}

function syncTableColumnsProps(props: Record<string, any>, columns: TableColumnConfig[]) {
  const normalized = normalizeTableColumns(columns);
  const nextProps = { ...props };
  delete nextProps.columns;
  delete nextProps.dataKeys;
  return {
    ...nextProps,
    columnDefs: normalized,
  };
}

function normalizeKeyValueRows(value: any) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : `kv_${index + 1}`,
      label: String(item.label || "").trim(),
      value: String(item.value || ""),
    }));
}

function getKeyValueRows(block: VisualBlock) {
  const props = block.props && typeof block.props === "object" ? block.props : {};
  if (Array.isArray(props.rows)) {
    return normalizeKeyValueRows(props.rows);
  }
  const propRows = normalizeKeyValueRows(props.rows);
  if (propRows.length > 0) return propRows;
  return renderKeyValueRows(String(block.content || "")).map((row, index) => ({
    id: `legacy_kv_${index + 1}`,
    label: row.label,
    value: row.value,
  }));
}

function serializeKeyValueRows(rows: KeyValueRowConfig[]) {
  return rows
    .map((row) => `${String(row.label || "").trim()}: ${String(row.value || "").trim()}`.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeTotalRows(value: any) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : `total_${index + 1}`,
      label: String(item.label || "").trim(),
      valuePath: String(item.valuePath || "").trim(),
      emphasis: Boolean(item.emphasis),
    }));
}

function getTotalRows(props: Record<string, any>) {
  if (Array.isArray(props?.rows)) {
    return normalizeTotalRows(props.rows);
  }
  const rows = normalizeTotalRows(props?.rows);
  if (rows.length > 0) return rows;
  return [
    { id: "legacy_total_subtotal", label: "Subtotal", valuePath: String(props?.subtotalPath || "{{ subtotal }}"), emphasis: false },
    { id: "legacy_total_tax", label: "Tax", valuePath: String(props?.taxPath || "{{ tax_amount }}"), emphasis: false },
    { id: "legacy_total_total", label: "Total", valuePath: String(props?.totalPath || "{{ total_amount }}"), emphasis: true },
  ];
}

function syncTotalRowsProps(props: Record<string, any>, rows: TotalRowConfig[]) {
  const normalized = normalizeTotalRows(rows);
  const findByLabel = (label: string) => normalized.find((row) => row.label.trim().toLowerCase() === label)?.valuePath;
  return {
    ...props,
    rows: normalized,
    subtotalPath: findByLabel("subtotal") || props.subtotalPath,
    taxPath: findByLabel("tax") || props.taxPath,
    totalPath: findByLabel("total") || props.totalPath,
  };
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

function createBlock(type: BlockType, index: number): VisualBlock {
  const layout = defaultLayoutForType(type, index);
  const style = normalizeBlockStyle(type, {});

  switch (type) {
    case "header":
      return {
        id: makeId("header"),
        type,
        props: {
          logoUrl: "",
          contentPath: "{{ seller_name }}\n{{ seller_address }}\n{{ seller_email }}",
          style: { ...style, padding: "8px", backgroundColor: "transparent" },
          layout,
        },
      };
    case "address":
      return {
        id: makeId("address"),
        type,
        props: {
          leftTitle: "Billed To",
          leftPath: "{{ buyer_address }}",
          rightTitle: "Shipped To",
          rightPath: "{{ shipping_address }}",
          style,
          layout,
        },
      };
    case "columns":
      return {
        id: makeId("columns"),
        type,
        props: {
          leftTitle: "Left Column",
          leftPath: "{{ left_content }}",
          rightTitle: "Right Column",
          rightPath: "{{ right_content }}",
          style,
          layout,
        },
      };
    case "table":
      return {
        id: makeId("table"),
        type,
        props: {
          itemsPath: "items",
          columnDefs: [
            { id: makeId("col_desc"), header: "Description", field: "description", align: "left" },
            { id: makeId("col_qty"), header: "Quantity", field: "quantity", align: "center" },
            { id: makeId("col_price"), header: "Unit Price", field: "unit_price", align: "right" },
            { id: makeId("col_total"), header: "Line Total", field: "line_total", align: "right" },
          ],
          style,
          layout,
        },
      };
    case "totals":
      return {
        id: makeId("totals"),
        type,
        props: {
          rows: [
            { id: makeId("subtotal"), label: "Subtotal", valuePath: "{{ subtotal }}", emphasis: false },
            { id: makeId("tax"), label: "Tax", valuePath: "{{ tax_amount }}", emphasis: false },
            { id: makeId("total"), label: "Total", valuePath: "{{ total_amount }}", emphasis: true },
          ],
          subtotalPath: "{{ subtotal }}",
          taxPath: "{{ tax_amount }}",
          totalPath: "{{ total_amount }}",
          style,
          layout,
        },
      };
    case "key_value":
      return {
        id: makeId("kv"),
        type,
        content: "Document Number: {{ document_number }}\nDate: {{ date }}",
        props: {
          rows: [
            { id: makeId("doc_number"), label: "Document Number", value: "{{ document_number }}" },
            { id: makeId("date"), label: "Date", value: "{{ date }}" },
          ],
          style,
          layout,
        },
      };
    case "list_loop":
      return {
        id: makeId("list"),
        type,
        props: {
          itemsPath: "items",
          listType: "disc",
          itemTemplate: "{{ item }}",
          style,
          layout,
        },
      };
    case "spacer":
      return {
        id: makeId("spacer"),
        type,
        props: {
          heightLabel: "32px",
          style,
          layout,
        },
      };
    case "divider":
      return {
        id: makeId("divider"),
        type,
        props: {
          style,
          layout,
        },
      };
    case "page_break":
      return {
        id: makeId("page_break"),
        type,
        props: {
          style,
          layout,
        },
      };
    default:
      return {
        id: makeId(type),
        type,
        content: defaultBlockContent(type),
        props: { style, layout },
      };
  }
}

function createLegacyHtmlBlock(initialHtml: string) {
  const block = createBlock("html", 0);
  return {
    ...block,
    content: initialHtml,
    props: {
      ...(block.props || {}),
      style: {
        ...normalizeBlockStyle("html", block?.props?.style),
        padding: "0px",
        backgroundColor: "#ffffff",
      },
      layout: {
        x: PAGE_MARGIN,
        y: PAGE_MARGIN,
        width: PAGE_WIDTH - PAGE_MARGIN * 2,
        height: PAGE_HEIGHT - PAGE_MARGIN * 2,
        zIndex: 1,
      },
    },
  } satisfies VisualBlock;
}

function toResolvedSuggestion(value: string | TemplatePathSuggestion): ResolvedPathSuggestion | null {
  if (typeof value === "string") {
    const path = value.trim();
    if (!path) return null;
    return { path, type: "any", required: false, description: "", constraints: [], source: "sample" };
  }

  const path = String(value?.path || "").trim();
  if (!path) return null;
  return {
    path,
    type: String(value?.type || "any").trim() || "any",
    required: Boolean(value?.required),
    description: String(value?.description || "").trim(),
    constraints: Array.isArray(value?.constraints)
      ? value.constraints.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    source: value?.source === "schema" ? "schema" : "sample",
  };
}

function normalizePathSuggestions(values?: Array<string | TemplatePathSuggestion>) {
  const dedup = new Map<string, ResolvedPathSuggestion>();
  for (const value of values || []) {
    const resolved = toResolvedSuggestion(value);
    if (!resolved) continue;
    const previous = dedup.get(resolved.path);
    if (!previous) {
      dedup.set(resolved.path, resolved);
      continue;
    }
    dedup.set(resolved.path, {
      ...previous,
      required: previous.required || resolved.required,
      description: previous.description || resolved.description,
      constraints: previous.constraints.length > 0 ? previous.constraints : resolved.constraints,
      source: previous.source === "schema" ? "schema" : resolved.source,
      type: previous.type !== "any" ? previous.type : resolved.type,
    });
  }

  return Array.from(dedup.values()).sort((left, right) => {
    if (left.required !== right.required) return left.required ? -1 : 1;
    return left.path.localeCompare(right.path);
  });
}

function incrementFieldUsage(counts: Map<string, number>, path: string, amount = 1) {
  const normalized = String(path || "").trim();
  if (!normalized) return;
  counts.set(normalized, (counts.get(normalized) || 0) + amount);
}

function normalizeExpressionPath(value: string) {
  const raw = stripTemplateDelimiters(String(value || ""));
  if (!raw) return "";
  return raw.split("|")[0].trim();
}

function addPathInputUsage(
  counts: Map<string, number>,
  rawValue: any,
  options?: { collectionPath?: string; collectionOnly?: boolean },
) {
  const base = normalizeExpressionPath(String(rawValue || ""));
  if (!base) return;

  if (options?.collectionOnly) {
    incrementFieldUsage(counts, base);
    if (!base.endsWith("[]")) incrementFieldUsage(counts, `${base}[]`);
    return;
  }

  if (base === "item" && options?.collectionPath) {
    const collection = normalizeExpressionPath(options.collectionPath);
    if (!collection) return;
    incrementFieldUsage(counts, collection);
    incrementFieldUsage(counts, `${collection}[]`);
    return;
  }

  if (base.startsWith("item.") && options?.collectionPath) {
    const collection = normalizeExpressionPath(options.collectionPath);
    if (!collection) return;
    incrementFieldUsage(counts, `${collection}[].${base.slice(5)}`);
    return;
  }

  incrementFieldUsage(counts, base);
}

function addTemplateTextUsage(
  counts: Map<string, number>,
  value: any,
  options?: { collectionPath?: string },
) {
  const raw = String(value ?? "");
  if (!raw.trim()) return;
  raw.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expression) => {
    addPathInputUsage(counts, expression, options);
    return "";
  });
}

function buildFieldUsageMap(blocks: VisualBlock[]) {
  const counts = new Map<string, number>();

  for (const block of blocks || []) {
    const props = block.props && typeof block.props === "object" ? block.props : {};

    switch (block.type) {
      case "header":
        addTemplateTextUsage(counts, props.contentPath);
        break;
      case "address":
      case "columns":
        addPathInputUsage(counts, props.leftPath);
        addPathInputUsage(counts, props.rightPath);
        break;
      case "table": {
        const itemsPath = String(props.itemsPath || "").trim();
        addPathInputUsage(counts, itemsPath, { collectionOnly: true });
        const collection = normalizeExpressionPath(itemsPath);
        for (const column of getTableColumns(props)) {
          const template = getTableColumnTemplate(column.field, itemsPath);
          if (!template) continue;
          addTemplateTextUsage(counts, template, { collectionPath: collection });
        }
        break;
      }
      case "totals":
        for (const row of getTotalRows(props)) {
          addTemplateTextUsage(counts, row.valuePath);
        }
        break;
      case "list_loop":
        addPathInputUsage(counts, props.itemsPath, { collectionOnly: true });
        addTemplateTextUsage(counts, props.itemTemplate, { collectionPath: String(props.itemsPath || "") });
        break;
      case "key_value": {
        const rows = getKeyValueRows(block);
        for (const row of rows) {
          addTemplateTextUsage(counts, row.value);
        }
        break;
      }
      default:
        addTemplateTextUsage(counts, block.content);
        break;
    }
  }

  return counts;
}

function getValueByPath(source: any, rawPath: string): any {
  const cleanPath = stripTemplateDelimiters(String(rawPath || "")).replace(/\[\]/g, "");
  if (!cleanPath) return undefined;
  const parts = cleanPath.match(/[^.[\]]+/g) || [];
  let current = source;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function formatDisplayValue(value: any): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ");
  }
  if (typeof value === "object") {
    if (typeof value.name === "string" && value.name.trim()) return value.name.trim();
    if (typeof value.address === "string" && value.address.trim()) return value.address.trim();
    return JSON.stringify(value);
  }
  return String(value);
}

function parseNumericDisplayValue(value: any): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replaceAll(",", "").replaceAll("₹", "").replace(/\bINR\b/gi, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMoneyDisplay(value: any, currency?: any): string {
  const parsed = parseNumericDisplayValue(value);
  if (parsed == null) return formatDisplayValue(value);
  const normalizedCurrency = String(currency ?? "").trim().toUpperCase();
  if (normalizedCurrency === "INR" || normalizedCurrency === "₹") {
    return `₹${new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(parsed)}`;
  }
  if (normalizedCurrency) {
    return `${normalizedCurrency} ${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(parsed)}`;
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function resolveExpression(expression: string, data: Record<string, any>, scope?: Record<string, any>) {
  const trimmed = String(expression || "").trim();
  if (!trimmed) return "";
  const [baseExpression, ...filters] = trimmed.split("|").map((part) => part.trim()).filter(Boolean);
  const base = baseExpression || "";

  let resolved: any;
  if (base === "item") resolved = scope?.item;
  else if (base.startsWith("item.")) resolved = getValueByPath(scope?.item ?? {}, base.slice(5));
  else if (base === "loop") resolved = scope?.loop;
  else if (base.startsWith("loop.")) resolved = getValueByPath(scope?.loop ?? {}, base.slice(5));
  else if (base === "branding") resolved = data?.branding || data?.rendering_options?.branding || {};
  else if (base.startsWith("branding.")) resolved = getValueByPath(data?.branding || data?.rendering_options?.branding || {}, base.slice(9));
  else resolved = getValueByPath(data, base);

  for (const filter of filters) {
    const defaultMatch = filter.match(/^default\s*\(\s*(.*?)\s*\)$/);
    if (defaultMatch) {
      if (resolved == null || resolved === "") {
        const fallbackRaw = String(defaultMatch[1] || "").trim();
        const quotedFallback = fallbackRaw.match(/^(['"])(.*)\1$/);
        if (quotedFallback) {
          resolved = quotedFallback[2];
        } else if (/^-?\d+(?:\.\d+)?$/.test(fallbackRaw)) {
          resolved = Number(fallbackRaw);
        } else {
          resolved = resolveExpression(fallbackRaw, data, scope);
        }
      }
      continue;
    }

    const moneyMatch = filter.match(/^money\s*\(\s*(.*?)\s*\)$/);
    if (moneyMatch) {
      const currencyExpr = String(moneyMatch[1] || "").trim();
      const currencyValue = currencyExpr ? resolveExpression(currencyExpr, data, scope) : undefined;
      resolved = formatMoneyDisplay(resolved, currencyValue);
      continue;
    }
  }

  return resolved;
}

function resolveBoundText(value: any, data: Record<string, any>, scope?: Record<string, any>) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";
  if (raw.includes("{{")) {
    return raw.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expression) => {
      return formatDisplayValue(resolveExpression(expression, data, scope));
    });
  }
  const resolved = resolveExpression(raw, data, scope);
  const text = formatDisplayValue(resolved);
  return text || raw;
}

function resolveItems(rawPath: any, data: Record<string, any>) {
  const direct = getValueByPath(data, String(rawPath || "items"));
  if (Array.isArray(direct)) return direct;
  const resolved = resolveExpression(String(rawPath || "items"), data);
  return Array.isArray(resolved) ? resolved : [];
}

function getTableColumnTemplate(field: any, itemsPath: any) {
  const raw = String(field || "").trim();
  if (!raw) return "";
  if (raw.includes("{{") || raw.includes("{%")) return raw;

  const collection = normalizeExpressionPath(String(itemsPath || "items")) || "items";
  if (raw === "item" || raw.startsWith("item.")) return `{{ ${raw} }}`;
  if (raw.startsWith(`${collection}[].`)) return `{{ item.${raw.slice(collection.length + 3)} }}`;
  if (raw.startsWith(`${collection}.`)) return `{{ item.${raw.slice(collection.length + 1)} }}`;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return `{{ item.${raw} }}`;
  if (/^[A-Za-z_][A-Za-z0-9_.[\]]*$/.test(raw)) return `{{ ${raw} }}`;
  return raw;
}

function looksLikeDataPath(value: any) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (trimmed.includes("{{") || trimmed.includes("{%")) return false;
  if (/\s/.test(trimmed)) return false;
  return /^(item(?:\.[A-Za-z0-9_[\].]+)?|branding(?:\.[A-Za-z0-9_[\].]+)?|[A-Za-z_][A-Za-z0-9_.[\]]*)$/.test(trimmed);
}

function normalizeExpressionLabel(expression: string, options?: { collectionPath?: string }) {
  const base = String(expression || "")
    .trim()
    .split("|")[0]
    .trim();
  if (!base) return "";

  const collectionPath = String(options?.collectionPath || "").trim() || "items";
  if (base === "item") return `${collectionPath}[]`;
  if (base.startsWith("item.")) return `${collectionPath}[].${base.slice(5)}`;
  return base;
}

function replaceBindingsWithFieldLabels(value: any, options?: { collectionPath?: string }) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";
  if (raw.includes("{{")) {
    return raw.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expression) => {
      const label = normalizeExpressionLabel(expression, options);
      return label ? `[${label}]` : "";
    });
  }
  if (looksLikeDataPath(raw)) {
    const label = normalizeExpressionLabel(raw, options);
    return label ? `[${label}]` : raw;
  }
  return raw;
}

function scopeCssToCanvas(css: string, scopeSelector: string) {
  const raw = String(css || "").trim();
  if (!raw) return "";
  return raw.replace(/(^|})\s*([^@{}][^{}]*)\{/g, (_match, boundary, selectors) => {
    const scopedSelectors = String(selectors)
      .split(",")
      .map((selector) => {
        const trimmed = selector.trim();
        if (!trimmed) return trimmed;
        if (trimmed.startsWith(scopeSelector)) return trimmed;
        if (trimmed === ":root") return scopeSelector;
        return `${scopeSelector} ${trimmed}`;
      })
      .join(", ");
    return `${boundary}\n${scopedSelectors} {`;
  });
}

function renderFieldModeHtml(value: any, options?: { collectionPath?: string }) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";

  const html = /<\/?[A-Za-z][^>]*>/.test(raw) ? raw : escapeHtml(raw).replace(/\n/g, "<br />");
  const withBindings = html.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expression) => {
    const label = normalizeExpressionLabel(expression, options) || String(expression).trim();
    return `<span class="builder-field-chip">[${escapeHtml(label)}]</span>`;
  });

  return withBindings.replace(/\{%\s*([^%]+?)\s*%\}/g, (_match, expression) => {
    const label = String(expression || "").trim();
    return label ? `<span class="builder-template-tag">{% ${escapeHtml(label)} %}</span>` : "";
  });
}

function FieldChip({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[11px] text-sky-700 align-middle">
      [{label}]
    </span>
  );
}

function renderFieldModeText(value: any, options?: { collectionPath?: string }) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";

  const parts: React.ReactNode[] = [];
  const pattern = /\{\{\s*([^}]+)\s*\}\}/g;
  let hasBinding = false;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(raw))) {
    hasBinding = true;
    if (match.index > lastIndex) {
      parts.push(raw.slice(lastIndex, match.index));
    }

    const label = normalizeExpressionLabel(match[1], options);
    parts.push(<FieldChip key={`${label || match[1]}_${match.index}`} label={label || String(match[1]).trim()} />);
    lastIndex = pattern.lastIndex;
  }

  if (hasBinding) {
    if (lastIndex < raw.length) {
      parts.push(raw.slice(lastIndex));
    }
    return <>{parts}</>;
  }

  if (looksLikeDataPath(raw)) {
    const label = normalizeExpressionLabel(raw, options);
    return <FieldChip label={label || raw} />;
  }

  return raw;
}

function renderCanvasText(
  value: any,
  data: Record<string, any>,
  mode: CanvasMode,
  options?: { scope?: Record<string, any>; collectionPath?: string },
) {
  if (mode === "preview") {
    return resolveBoundText(value, data, options?.scope);
  }
  return renderFieldModeText(value, { collectionPath: options?.collectionPath });
}

function ensureTemplateExpression(value: string, fallback: string) {
  const raw = String(value || "").trim();
  if (!raw) return `{{ ${fallback} }}`;
  if (raw.includes("{{") || raw.includes("{%")) return raw;
  if (/^[A-Za-z_][A-Za-z0-9_.[\]]*$/.test(raw)) return `{{ ${raw} }}`;
  return raw;
}

function styleRulesToCss(style: Record<string, any> | undefined, type: BlockType) {
  const source = normalizeBlockStyle(type, style);
  const rules: string[] = [
    `padding:${source.padding}`,
    `text-align:${source.textAlign}`,
    `background:${source.backgroundColor}`,
    `border-radius:${source.borderRadius}`,
    `border-color:${source.borderColor}`,
    `border-width:${source.borderWidth}`,
    `border-style:${source.borderStyle}`,
    `color:${source.color}`,
    `font-size:${source.fontSize}`,
    `font-weight:${source.fontWeight}`,
    "box-sizing:border-box",
  ];
  return ` style="${rules.join(";")}"`;
}

function blockLayoutToCss(layout: BlockLayout) {
  return ` style="left:${layout.x}px;top:${layout.y}px;width:${layout.width}px;height:${layout.height}px;z-index:${layout.zIndex}"`;
}

function renderKeyValueRows(content: string) {
  return String(content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) return { label: line, value: "" };
      return {
        label: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      };
    });
}

function renderBlockInnerHtml(block: VisualBlock) {
  const props = block.props && typeof block.props === "object" ? block.props : {};
  const style = styleRulesToCss(props.style, block.type);

  switch (block.type) {
    case "header":
      return `<div class="block block-header"${style}>
  <div class="header-logo">${props.logoUrl ? `<img src="${escapeHtml(String(props.logoUrl))}" alt="logo" />` : "{{ branding.logo_url and '<img src=\"' ~ branding.logo_url ~ '\" alt=\"logo\" />' or '' }}"}</div>
  <div class="header-content">${String(props.contentPath || "")
          .split("\n")
          .map((line: string) => `<div>${escapeHtml(line)}</div>`)
          .join("")}</div>
</div>`;
    case "heading":
      return `<h1 class="block block-heading"${style}>${escapeHtml(block.content || "Heading")}</h1>`;
    case "text":
      return `<div class="block block-text"${style}>${escapeHtml(block.content || "")}</div>`;
    case "callout":
      return `<div class="block block-callout"${style}>${escapeHtml(block.content || "")}</div>`;
    case "address":
      return `<div class="block block-address"${style}>
  <div><div class="label">${escapeHtml(String(props.leftTitle || "Left"))}</div><div>${ensureTemplateExpression(String(props.leftPath || ""), "left_address")}</div></div>
  <div><div class="label">${escapeHtml(String(props.rightTitle || "Right"))}</div><div>${ensureTemplateExpression(String(props.rightPath || ""), "right_address")}</div></div>
</div>`;
    case "columns":
      return `<div class="block block-columns"${style}>
  <div><div class="label">${escapeHtml(String(props.leftTitle || "Left Column"))}</div><div>${ensureTemplateExpression(String(props.leftPath || ""), "left_content")}</div></div>
  <div><div class="label">${escapeHtml(String(props.rightTitle || "Right Column"))}</div><div>${ensureTemplateExpression(String(props.rightPath || ""), "right_content")}</div></div>
</div>`;
    case "key_value": {
      const body = getKeyValueRows(block)
        .map((row) => {
          return `<div class="kv-row"><span class="kv-label">${escapeHtml(row.label)}</span><span class="kv-value">${escapeHtml(row.value)}</span></div>`;
        })
        .join("");
      return `<div class="block block-key-value"${style}>${body}</div>`;
    }
    case "table": {
      const columns = getTableColumns(props);
      const itemsPath = String(props.itemsPath || "items").trim() || "items";
      const head = columns
        .map((column) => `<th style="text-align:${column.align}">${escapeHtml(column.header || "Column")}</th>`)
        .join("");
      const row = columns
        .map((column) => `<td style="text-align:${column.align}">${getTableColumnTemplate(column.field, itemsPath)}</td>`)
        .join("");
      return `<table class="block block-table"${style}>
  <thead><tr>${head}</tr></thead>
  <tbody>{% for item in ${itemsPath} %}<tr>${row}</tr>{% endfor %}</tbody>
</table>`;
    }
    case "totals": {
      const rows = getTotalRows(props)
        .map((row) => {
          const tag = row.emphasis ? "strong" : "span";
          return `<div class="${row.emphasis ? "is-emphasis" : ""}"><${tag}>${escapeHtml(row.label || "Label")}</${tag}><${tag}>${ensureTemplateExpression(String(row.valuePath || ""), "total_amount")}</${tag}></div>`;
        })
        .join("");
      return `<div class="block block-totals"${style}>
  ${rows}
</div>`;
    }
    case "divider":
      return `<div class="block block-divider-wrap"${style}><hr class="block block-divider" /></div>`;
    case "spacer":
      return `<div class="block block-spacer"${style}></div>`;
    case "page_break":
      return `<div class="block block-page-break"${style}><span>Page Break</span></div>`;
    case "signature":
      return `<div class="block block-signature"${style}>
  <div class="signature-line"></div>
  <div>${escapeHtml(block.content || "Signature")}</div>
</div>`;
    case "terms":
      return `<div class="block block-terms"${style}>${escapeHtml(block.content || "")}</div>`;
    case "html":
      return `<div class="block block-html"${style}>${block.content || ""}</div>`;
    case "list_loop": {
      const itemsPath = String(props.itemsPath || "items").trim() || "items";
      const itemTemplate = String(props.itemTemplate || "{{ item }}");
      const listTag = props.listType === "decimal" ? "ol" : "ul";
      const listStyle = props.listType === "none" ? ' style="list-style:none;padding-left:0"' : "";
      return `<${listTag} class="block block-list"${style}${listStyle}>{% for item in ${itemsPath} %}<li>${itemTemplate}</li>{% endfor %}</${listTag}>`;
    }
    default:
      return `<div class="block"${style}>${escapeHtml(block.content || "")}</div>`;
  }
}

function renderBlockHtml(block: VisualBlock, index: number) {
  const props = block.props && typeof block.props === "object" ? block.props : {};
  const layout = getBlockLayout(block, index);
  const condition =
    typeof props.conditionPath === "string" && props.conditionPath.trim()
      ? `{% if ${props.conditionPath.trim()} %}`
      : "";
  const conditionClose = condition ? "{% endif %}" : "";

  return `${condition}<div class="canvas-block canvas-block-${block.type}" data-block-id="${escapeHtml(block.id)}"${blockLayoutToCss(layout)}>${renderBlockInnerHtml(block)}</div>${conditionClose}`;
}

function buildHtml(blocks: VisualBlock[]) {
  const body = blocks.map((block, index) => renderBlockHtml(block, index)).join("\n");
  return `<div class="document-container">\n  <div class="document-page">\n${body}\n  </div>\n</div>`;
}

function buildBaseCss(theme: ThemeConfig) {
  return `
@page {
  size: A4;
  margin: 0;
}

body {
  margin: 0;
  background: #f8fafc;
}

.document-container {
  padding: 24px;
  background: #f8fafc;
}

.document-page {
  position: relative;
  width: ${PAGE_WIDTH}px;
  min-height: ${PAGE_HEIGHT}px;
  margin: 0 auto;
  background: ${theme.background};
  color: ${theme.textColor};
  font-family: ${theme.fontFamily};
  overflow: hidden;
}

.canvas-block {
  position: absolute;
  box-sizing: border-box;
}

.canvas-block > .block {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.block {
  box-sizing: border-box;
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.block-header img {
  max-height: 80px;
  max-width: 180px;
  object-fit: contain;
}

.header-content {
  flex: 1;
  text-align: right;
  display: grid;
  gap: 4px;
}

.block-address,
.block-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #64748b;
  font-weight: 700;
  margin-bottom: 6px;
}

.block-heading {
  font-size: 32px;
  line-height: 1.15;
  margin: 0;
}

.block-text,
.block-callout,
.block-terms,
.block-html {
  white-space: pre-wrap;
  line-height: 1.6;
}

.block-callout {
  border-left: 4px solid #6366f1;
}

.block-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.block-table th,
.block-table td {
  border: 1px solid #e2e8f0;
  padding: 8px 10px;
  vertical-align: top;
  text-align: left;
  word-break: break-word;
}

.block-table th {
  background: #f8fafc;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.block-totals {
  display: grid;
  gap: 8px;
}

.block-totals > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.block-divider-wrap {
  display: flex;
  align-items: center;
}

.block-divider {
  width: 100%;
  border: 0;
  border-top: 1px solid #cbd5e1;
}

.block-spacer {
  min-height: 100%;
  border: 1px dashed rgba(148, 163, 184, 0.45);
  background: rgba(241, 245, 249, 0.45);
}

.block-page-break {
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 2px dashed #cbd5e1;
  color: #64748b;
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.block-signature {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  text-align: center;
}

.signature-line {
  height: 36px;
  border-bottom: 1px solid currentColor;
  margin-bottom: 8px;
}

.kv-row {
  display: grid;
  grid-template-columns: minmax(0, 160px) minmax(0, 1fr);
  gap: 12px;
  padding: 4px 0;
}

.kv-label {
  font-weight: 600;
}

.block-list {
  margin: 0;
  padding-left: 18px;
}
`.trim();
}

function buildCss(theme: ThemeConfig, userCss: string) {
  const themeComment = `${VISUAL_THEME_PREFIX}${JSON.stringify(theme)}${VISUAL_THEME_SUFFIX}`;
  const baseCss = buildBaseCss(theme);
  const extra = String(userCss || "").trim();
  return [themeComment, VISUAL_BASE_START, baseCss, VISUAL_BASE_END, extra].filter(Boolean).join("\n\n");
}

function updateBlockAtIndex(
  blocks: VisualBlock[],
  index: number,
  updater: (block: VisualBlock, index: number) => VisualBlock,
) {
  if (index < 0 || index >= blocks.length) return blocks;
  return reindexBlockLayouts(blocks.map((block, currentIndex) => (currentIndex === index ? updater(block, currentIndex) : block)));
}

function moveBlock(blocks: VisualBlock[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return blocks;
  const next = [...blocks];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return reindexBlockLayouts(next);
}

function duplicateBlock(blocks: VisualBlock[], index: number) {
  if (index < 0 || index >= blocks.length) return blocks;
  const current = blocks[index];
  const layout = getBlockLayout(current, index);
  const clone: VisualBlock = {
    ...current,
    id: makeId(current.type),
    props: {
      ...(current.props || {}),
      style: normalizeBlockStyle(current.type, current?.props?.style),
      layout: {
        ...layout,
        x: snap(clamp(layout.x + 16, 0, PAGE_WIDTH - layout.width)),
        y: snap(clamp(layout.y + 16, 0, PAGE_HEIGHT - layout.height)),
        zIndex: layout.zIndex + 1,
      },
    },
  };
  const next = [...blocks];
  next.splice(index + 1, 0, clone);
  return reindexBlockLayouts(next);
}

function formatToken(path: string, mode: ActiveBindingTarget["mode"]) {
  if (mode === "template") return `{{ ${path} }}`;
  return path;
}

function appendToken(existing: string, token: string, multiline = false) {
  const current = String(existing || "");
  if (!current.trim()) return token;
  if (current.includes(token)) return current;
  return multiline ? `${current}${current.endsWith("\n") ? "" : "\n"}${token}` : `${current}${current.endsWith(" ") ? "" : " "}${token}`;
}

function normalizePreviewData(value: Record<string, any> | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function describeBlock(block: VisualBlock) {
  const props = block.props && typeof block.props === "object" ? block.props : {};
  switch (block.type) {
    case "header":
      return "Branding and sender details";
    case "heading":
      return String(block.content || "Document title").trim() || "Document title";
    case "text":
    case "callout":
    case "terms":
      return String(block.content || "Text content").trim() || "Text content";
    case "address":
      return `${String(props.leftTitle || "Left")} / ${String(props.rightTitle || "Right")}`;
    case "columns":
      return `${String(props.leftTitle || "Left Column")} + ${String(props.rightTitle || "Right Column")}`;
    case "table":
      return String(props.itemsPath || "items").trim() || "items";
    case "totals":
      return "Subtotal, tax, and total";
    case "key_value":
      return "Structured facts";
    case "list_loop":
      return String(props.itemsPath || "items").trim() || "items";
    case "signature":
      return String(block.content || "Signature line").trim() || "Signature line";
    case "html":
      return "Custom HTML block";
    case "page_break":
      return "Manual page break marker";
    case "spacer":
      return `Spacer ${String(props.heightLabel || "32px")}`;
    default:
      return BLOCK_LABELS.get(block.type) || block.type;
  }
}

function blockPreviewStyle(block: VisualBlock): React.CSSProperties {
  const style = normalizeBlockStyle(block.type, block?.props?.style);
  return {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    padding: style.padding,
    textAlign: style.textAlign as React.CSSProperties["textAlign"],
    background: style.backgroundColor,
    borderRadius: style.borderRadius,
    color: style.color,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight as React.CSSProperties["fontWeight"],
    borderColor: style.borderColor,
    borderWidth: style.borderWidth,
    borderStyle: style.borderStyle as React.CSSProperties["borderStyle"],
    overflow: "hidden",
  };
}

function renderCanvasBlockContent(block: VisualBlock, data: Record<string, any>, mode: CanvasMode) {
  const props = block.props && typeof block.props === "object" ? block.props : {};
  const style = blockPreviewStyle(block);

  if (block.type === "header") {
    const logoUrl = String(props.logoUrl || data?.branding?.logo_url || data?.rendering_options?.branding?.logo_url || "").trim();
    const lines = String(props.contentPath || "")
      .split("\n")
      .filter((line) => String(line).trim())
      .map((line, index) => ({
        key: `${block.id}_header_${index}`,
        node: renderCanvasText(line, data, mode),
      }));

    return (
      <div style={style} className="flex h-full items-start justify-between gap-5">
        <div className="flex h-full min-w-[140px] items-start justify-start">
          {logoUrl && (mode === "preview" || String(props.logoUrl || "").trim()) ? (
            <img src={logoUrl} alt="logo" className="max-h-[80px] max-w-[180px] object-contain" />
          ) : (
            <div className="flex h-[64px] w-[140px] items-center justify-center rounded-md border border-dashed border-slate-300 text-[11px] uppercase tracking-wide text-slate-400">
              {mode === "fields" ? <FieldChip label="branding.logo_url" /> : "Logo"}
            </div>
          )}
        </div>
        <div className="grid flex-1 gap-1 text-right text-sm">
          {lines.length > 0 ? lines.map((line) => <div key={line.key}>{line.node}</div>) : (
            <div className="text-slate-400">Header content</div>
          )}
        </div>
      </div>
    );
  }

  if (block.type === "heading") {
    return (
      <h1 style={{ ...style, margin: 0, fontSize: style.fontSize || 32, lineHeight: 1.15 }}>
        {renderCanvasText(block.content || "Heading", data, mode)}
      </h1>
    );
  }

  if (block.type === "text") {
    return <div style={{ ...style, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{renderCanvasText(block.content || "", data, mode)}</div>;
  }

  if (block.type === "callout") {
    return (
      <div style={{ ...style, borderLeft: "4px solid #6366f1", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {renderCanvasText(block.content || "", data, mode)}
      </div>
    );
  }

  if (block.type === "address" || block.type === "columns") {
    const leftTitle = String(props.leftTitle || (block.type === "address" ? "Left" : "Left Column"));
    const rightTitle = String(props.rightTitle || (block.type === "address" ? "Right" : "Right Column"));
    return (
      <div style={style} className="grid h-full grid-cols-2 gap-4">
        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{leftTitle}</div>
          <div className="whitespace-pre-wrap text-sm leading-6">{renderCanvasText(props.leftPath || "", data, mode) || "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â"}</div>
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{rightTitle}</div>
          <div className="whitespace-pre-wrap text-sm leading-6">{renderCanvasText(props.rightPath || "", data, mode) || "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â"}</div>
        </div>
      </div>
    );
  }

  if (block.type === "key_value") {
    const rows = getKeyValueRows(block);
    return (
      <div style={style} className="grid gap-2">
        {rows.length > 0 ? rows.map((row, index) => (
          <div key={`${block.id}_kv_${index}`} className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)] gap-3 text-sm">
            <div className="font-semibold">{row.label}</div>
            <div className="truncate">{renderCanvasText(row.value, data, mode) || "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â"}</div>
          </div>
        )) : <div className="text-sm text-slate-400">Add rows like Label: [value]</div>}
      </div>
    );
  }

  if (block.type === "table") {
    const itemsPath = String(props.itemsPath || "items").trim() || "items";
    const collectionPath = normalizeExpressionLabel(itemsPath) || "items";
    const columns = getTableColumns(props);
    const footerRows = Array.isArray(props.footerRows)
      ? props.footerRows.filter((row: any) => Array.isArray(row?.cells) && row.cells.length > 0)
      : [];
    const items = mode === "preview" ? resolveItems(props.itemsPath, data).slice(0, 6) : [];
    const safeItems = items.length > 0 ? items : [{}];
    return (
      <div style={style} className="h-full overflow-hidden">
        {columns.length > 0 ? (
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={`${block.id}_${column.id}`}
                    className="border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] uppercase tracking-wide text-slate-500"
                    style={{ textAlign: column.align }}
                  >
                    {column.header || "Column"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(mode === "fields" ? [null] : safeItems).map((item, rowIndex) => (
                <tr key={`${block.id}_row_${rowIndex}`}>
                  {columns.map((column, columnIndex) => (
                    <td key={`${block.id}_${rowIndex}_${columnIndex}`} className="border border-slate-200 px-2 py-2 align-top" style={{ textAlign: column.align }}>
                      {mode === "preview"
                        ? resolveBoundText(getTableColumnTemplate(column.field, itemsPath), data, { item, loop: { index: rowIndex + 1 } }) || "Preview"
                        : renderFieldModeText(getTableColumnTemplate(column.field, itemsPath), { collectionPath }) || <FieldChip label={`${collectionPath}[]`} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {footerRows.length > 0 ? (
              <tfoot>
                {footerRows.map((row: any, rowIndex: number) => (
                  <tr key={`${block.id}_footer_${row.id || rowIndex}`}>
                    {row.cells.map((cell: any, cellIndex: number) => {
                      const colSpan = Math.max(1, Number(cell?.colSpan) || 1);
                      const align = String(cell?.align || "left") as React.CSSProperties["textAlign"];
                      const rawValue = String(cell?.value || "");
                      const cellContent = mode === "preview"
                        ? resolveBoundText(rawValue, data) || "Preview"
                        : renderFieldModeText(rawValue, { collectionPath }) || <FieldChip label={collectionPath} />;
                      return (
                        <td
                          key={`${block.id}_footer_${rowIndex}_${cellIndex}`}
                          colSpan={colSpan}
                          className={cn(
                            "border border-slate-200 bg-slate-50 px-2 py-2 align-top",
                            cell?.emphasis ? "font-semibold text-slate-900" : "text-slate-700",
                          )}
                          style={{ textAlign: align }}
                        >
                          {cellContent}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tfoot>
            ) : null}
          </table>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 px-4 text-center text-sm text-slate-400">
            Add columns in settings to build this table.
          </div>
        )}
      </div>
    );
  }

  if (block.type === "totals") {
    const rows = getTotalRows(props);
    return (
      <div style={style} className="grid h-full gap-2 text-sm">
        {rows.length > 0 ? rows.map((row) => (
          <div key={row.id} className={cn("flex items-center justify-between gap-3", row.emphasis ? "text-base font-semibold" : "")}>
            <span>{row.label || "Label"}</span>
            <span>{renderCanvasText(row.valuePath || "", data, mode) || "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â"}</span>
          </div>
        )) : <div className="text-slate-400">Add summary rows in settings.</div>}
      </div>
    );
  }

  if (block.type === "divider") {
    return (
      <div style={{ ...style, padding: 0, background: "transparent", border: "none" }} className="flex h-full items-center">
        <div className="h-px w-full bg-slate-300" />
      </div>
    );
  }

  if (block.type === "spacer") {
    return (
      <div style={{ ...style, background: "rgba(241,245,249,.65)", border: "1px dashed rgba(148,163,184,.55)" }} className="flex h-full items-center justify-center text-[11px] uppercase tracking-[0.16em] text-slate-400">
        Spacer
      </div>
    );
  }

  if (block.type === "page_break") {
    return (
      <div style={{ ...style, background: "transparent", border: "none", padding: 0 }} className="flex h-full items-center justify-center border-t-2 border-dashed border-slate-300 text-[11px] uppercase tracking-[0.16em] text-slate-500">
        Page Break
      </div>
    );
  }

  if (block.type === "signature") {
    return (
      <div style={style} className="flex h-full flex-col justify-end text-center">
        <div className="mb-2 h-8 border-b border-current" />
        <div className="text-sm">{renderCanvasText(block.content || "Signature", data, mode)}</div>
      </div>
    );
  }

  if (block.type === "terms") {
    return <div style={{ ...style, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{renderCanvasText(block.content || "", data, mode)}</div>;
  }

  if (block.type === "html") {
    const html = mode === "preview" ? resolveBoundText(block.content || "", data) : renderFieldModeHtml(block.content || "");
    return (
      <div
        className="canvas-html-block"
        style={{ ...style, whiteSpace: "normal", lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (block.type === "list_loop") {
    const itemsPath = String(props.itemsPath || "items").trim() || "items";
    const collectionPath = normalizeExpressionLabel(itemsPath) || "items";
    const items = mode === "preview" ? resolveItems(props.itemsPath, data).slice(0, 8) : [];
    const isOrdered = String(props.listType || "disc") === "decimal";
    const ListTag = isOrdered ? "ol" : "ul";
    const listStyleType = String(props.listType || "disc") === "none" ? "none" : undefined;
    return (
      <div style={style}>
        <ListTag className="h-full pl-5 text-sm" style={{ listStyleType }}>
          {(mode === "fields" ? [null] : (items.length > 0 ? items : [""])).map((item, index) => (
            <li key={`${block.id}_item_${index}`} className="mb-1">
              {mode === "preview"
                ? resolveBoundText(String(props.itemTemplate || "{{ item }}"), data, { item })
                : renderFieldModeText(String(props.itemTemplate || "{{ item }}"), { collectionPath }) || <FieldChip label={`${collectionPath}[]`} />}
            </li>
          ))}
        </ListTag>
      </div>
    );
  }

  return <div style={style}>{renderCanvasText(block.content || "", data, mode)}</div>;
}

function FieldLabel({ children, onActionClick, pathSuggestions, onSelectField }: { children: React.ReactNode; onActionClick?: () => void; pathSuggestions?: ResolvedPathSuggestion[]; onSelectField?: (path: string) => void }) {
  if (pathSuggestions && pathSuggestions.length > 0 && onSelectField) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[11px] font-medium text-foreground hover:text-primary hover:underline group text-left transition-colors"
            title="View available fields"
          >
            <span>{children}</span>
            <ListTree className="h-3 w-3 opacity-50 group-hover:opacity-100" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[300px] w-[240px] overflow-y-auto">
          {pathSuggestions.map((s) => (
            <DropdownMenuItem
              key={s.path}
              onSelect={() => onSelectField(s.path)}
              className="flex items-center gap-2"
            >
              <div className="flex-1 truncate text-xs font-mono">{s.path}</div>
              <div className="text-[10px] text-muted-foreground uppercase opacity-50">{s.source}</div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (onActionClick) {
    return (
      <button
        type="button"
        onClick={onActionClick}
        className="flex items-center gap-1.5 text-[11px] font-medium text-foreground hover:text-primary hover:underline group text-left transition-colors"
        title="View available fields"
      >
        <span>{children}</span>
        <ListTree className="h-3 w-3 opacity-50 group-hover:opacity-100" />
      </button>
    );
  }
  return <label className="text-[11px] font-medium text-muted-foreground">{children}</label>;
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string }) {
  return (
    <div className="border-b border-border/50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{title}</span>
      </div>
      {subtitle ? <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function PathTokenButton({
  suggestion,
  onInsert,
  usageCount = 0,
}: {
  suggestion: ResolvedPathSuggestion;
  onInsert: (path: string) => void;
  usageCount?: number;
}) {
  const isUsed = usageCount > 0;
  return (
    <button
      type="button"
      onClick={() => onInsert(suggestion.path)}
      className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-left transition-colors hover:bg-muted/50"
      title={suggestion.description || suggestion.path}
    >
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{suggestion.path}</code>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
            isUsed ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
          )}
        >
          {isUsed ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
          {usageCount}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{suggestion.type}</span>
        {suggestion.required ? (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">required</span>
        ) : null}
      </div>
      {suggestion.description ? <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{suggestion.description}</div> : null}
    </button>
  );
}

function updateLayoutPatch(layout: BlockLayout, patch: Partial<BlockLayout>) {
  return normalizeBlockLayout({ ...layout, ...patch }, layout);
}

/**
 * SmartFieldInput — a text input that:
 * - Renders a clickable "bound" pill when value is {{ ... }}, opening a field-picker dropdown
 * - In normal text mode, shows an @ key hint and opens the picker when `@` is typed
 */
function SmartFieldInput({
  value,
  onChange,
  disabled,
  placeholder,
  className,
  pathSuggestions,
  multiline = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  pathSuggestions?: ResolvedPathSuggestion[];
  multiline?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [atPrefix, setAtPrefix] = React.useState(""); // text before the @ trigger
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const isBound = value.trim().startsWith("{{") && value.trim().endsWith("}}");
  const hasSuggestions = pathSuggestions && pathSuggestions.length > 0;

  const filtered = React.useMemo(() => {
    if (!pathSuggestions) return [];
    const q = filter.toLowerCase();
    if (!q) return pathSuggestions;
    return pathSuggestions.filter((s) => s.path.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
  }, [pathSuggestions, filter]);

  const handleSelect = (path: string) => {
    if (atPrefix !== null && !isBound) {
      // @ mode: substitute @ and whatever was typed after it
      onChange(`${atPrefix}{{ ${path} }}`);
    } else {
      onChange(`{{ ${path} }}`);
    }
    setOpen(false);
    setFilter("");
    setAtPrefix("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = e.target.value;
    // detect @ trigger
    if (hasSuggestions && next.endsWith("@")) {
      setAtPrefix(next.slice(0, -1));
      setFilter("");
      setOpen(true);
      return;
    }
    // if open (@ mode), update filter with chars typed after @
    if (open) {
      const idx = next.lastIndexOf("@");
      if (idx >= 0) {
        setFilter(next.slice(idx + 1));
      } else {
        // @ removed, close
        setOpen(false);
        setFilter("");
        setAtPrefix("");
      }
    }
    onChange(next);
  };

  // Bound pill: click to open picker
  if (isBound && hasSuggestions) {
    const label = value.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => { setFilter(""); setOpen(true); }}
          disabled={disabled}
          className={cn(
            "flex h-8 w-full items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/60 px-2.5 text-[12px] font-mono text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-400 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          title="Click to change field"
        >
          <ListTree className="h-3 w-3 flex-shrink-0 opacity-60" />
          <span className="flex-1 truncate text-left">{label}</span>
          <X
            className="h-3 w-3 flex-shrink-0 opacity-40 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
          />
        </button>
        <PopoverContent align="start" className="p-0 w-[260px]" sideOffset={4}>
          <div className="p-2 border-b border-border/50">
            <Input
              autoFocus
              placeholder="Search fields…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-7 text-[12px] shadow-none"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1">
            {filtered.length > 0 ? filtered.map((s) => (
              <button
                key={s.path}
                type="button"
                onClick={() => handleSelect(s.path)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent transition-colors"
              >
                <code className="flex-1 truncate text-[11px] font-mono">{s.path}</code>
                <span className="text-[10px] text-muted-foreground uppercase opacity-50">{s.type}</span>
              </button>
            )) : (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">No fields match</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Normal mode input with @ trigger
  const sharedClassName = cn(
    "text-[12px] shadow-none transition-colors",
    className
  );

  if (multiline) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative">
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={handleInputChange}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(sharedClassName, "min-h-[72px] resize-none leading-relaxed")}
          />
          {hasSuggestions && !open && (
            <span className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/50 pointer-events-none select-none">@ for fields</span>
          )}
        </div>
        {open && (
          <PopoverContent align="start" className="p-0 w-[260px]" sideOffset={4}>
            <div className="p-2 border-b border-border/50">
              <Input
                autoFocus
                placeholder="Search fields…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-7 text-[12px] shadow-none"
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto p-1">
              {filtered.length > 0 ? filtered.map((s) => (
                <button
                  key={s.path}
                  type="button"
                  onClick={() => handleSelect(s.path)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent transition-colors"
                >
                  <code className="flex-1 truncate text-[11px] font-mono">{s.path}</code>
                  <span className="text-[10px] text-muted-foreground uppercase opacity-50">{s.type}</span>
                </button>
              )) : (
                <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">No fields match</div>
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={value}
          onChange={handleInputChange}
          disabled={disabled}
          placeholder={placeholder}
          className={cn("h-8", sharedClassName)}
        />
        {hasSuggestions && !open && (
          <span className="absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground/40 pointer-events-none select-none">@</span>
        )}
      </div>
      {open && (
        <PopoverContent align="start" className="p-0 w-[260px]" sideOffset={4}>
          <div className="p-2 border-b border-border/50">
            <Input
              autoFocus
              placeholder="Search fields…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-7 text-[12px] shadow-none"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1">
            {filtered.length > 0 ? filtered.map((s) => (
              <button
                key={s.path}
                type="button"
                onClick={() => handleSelect(s.path)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent transition-colors"
              >
                <code className="flex-1 truncate text-[11px] font-mono">{s.path}</code>
                <span className="text-[10px] text-muted-foreground uppercase opacity-50">{s.type}</span>
              </button>
            )) : (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">No fields match</div>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

function StringField({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  onFocus,
  pathSuggestions,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
  placeholder?: string;
  onFocus?: () => void;
  pathSuggestions?: ResolvedPathSuggestion[];
}) {
  const isBound = value.trim().startsWith("{{") && value.trim().endsWith("}}");
  return (
    <div className="space-y-1.5">
      <FieldLabel
        pathSuggestions={pathSuggestions}
        onSelectField={(p) => {
          if (!value || isBound) onChange(`{{ ${p} }}`);
          else onChange(`${value} {{ ${p} }}`);
        }}
        onActionClick={onFocus}
      >{label}</FieldLabel>
      <SmartFieldInput
        value={value}
        onChange={onChange}
        disabled={readOnly}
        placeholder={placeholder}
        pathSuggestions={pathSuggestions}
      />
    </div>
  );
}

function StringAreaField({
  label,
  value,
  onChange,
  readOnly,
  className,
  placeholder,
  onFocus,
  pathSuggestions,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
  className?: string;
  placeholder?: string;
  onFocus?: () => void;
  pathSuggestions?: ResolvedPathSuggestion[];
}) {
  const isBound = value.trim().startsWith("{{") && value.trim().endsWith("}}");
  return (
    <div className="space-y-1.5">
      <FieldLabel
        pathSuggestions={pathSuggestions}
        onSelectField={(p) => {
          if (!value || isBound) onChange(`{{ ${p} }}`);
          else onChange(`${value} {{ ${p} }}`);
        }}
        onActionClick={onFocus}
      >{label}</FieldLabel>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={readOnly}
        className={cn(
          "text-[12px] shadow-none leading-relaxed transition-colors",
          className,
          isBound ? "text-blue-600 border-blue-200 bg-blue-50/50 font-mono dark:text-blue-400 dark:border-blue-800/50 dark:bg-blue-900/20" : ""
        )}
        placeholder={placeholder}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}) {
  // Derive a hex string safe for the native picker. Falls back to #ffffff for non-hex values.
  const safeHex = /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : "#ffffff";
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-shrink-0">
          <div
            className="h-9 w-9 rounded-md border border-input shadow-sm cursor-pointer overflow-hidden"
            style={{ backgroundColor: safeHex }}
          >
            <input
              type="color"
              value={safeHex}
              onChange={(e) => onChange(e.target.value)}
              disabled={readOnly}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              title="Pick colour"
            />
          </div>
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          placeholder="#ffffff"
          className="flex-1 font-mono text-[12px] h-8 shadow-none"
        />
      </div>
    </div>
  );
}

function PaddingField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}) {
  const parts = value.split(" ").filter(Boolean);
  const top = parts[0] || "12px";
  const right = parts[1] || top;
  const bottom = parts[2] || top;
  const left = parts[3] || right;

  const updatePart = (index: number, next: string) => {
    const nextParts = [top, right, bottom, left];
    nextParts[index] = next || "0px";
    onChange(nextParts.join(" "));
  };

  return (
    <div className="space-y-2 col-span-1 md:col-span-2">
      <FieldLabel>{label}</FieldLabel>
      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col gap-1">
          <Input value={top} onChange={(e) => updatePart(0, e.target.value)} disabled={readOnly} className="h-8 text-[11px] text-center px-1 shadow-none font-mono" />
          <span className="text-[9px] text-muted-foreground uppercase text-center">Top</span>
        </div>
        <div className="flex flex-col gap-1">
          <Input value={right} onChange={(e) => updatePart(1, e.target.value)} disabled={readOnly} className="h-8 text-[11px] text-center px-1 shadow-none font-mono" />
          <span className="text-[9px] text-muted-foreground uppercase text-center">Right</span>
        </div>
        <div className="flex flex-col gap-1">
          <Input value={bottom} onChange={(e) => updatePart(2, e.target.value)} disabled={readOnly} className="h-8 text-[11px] text-center px-1 shadow-none font-mono" />
          <span className="text-[9px] text-muted-foreground uppercase text-center">Bottom</span>
        </div>
        <div className="flex flex-col gap-1">
          <Input value={left} onChange={(e) => updatePart(3, e.target.value)} disabled={readOnly} className="h-8 text-[11px] text-center px-1 shadow-none font-mono" />
          <span className="text-[9px] text-muted-foreground uppercase text-center">Left</span>
        </div>
      </div>
    </div>
  );
}

/** Parse "{{ path | default('val') }}" or "{{ path }}" into { path, defaultVal }. */
function parseTemplateDefault(raw: string): { path: string; defaultVal: string } {
  const inner = raw.trim().replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
  const match = inner.match(/^([^|]+?)\s*\|\s*default\s*\(\s*['"]?(.*?)['"]?\s*\)\s*$/);
  if (match) return { path: `{{ ${match[1].trim()} }}`, defaultVal: match[2] };
  return { path: raw, defaultVal: "" };
}

function buildTemplateWithDefault(path: string, defaultVal: string) {
  const trimmedDefault = defaultVal.trim();
  const inner = path.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
  if (!inner) return path;
  if (!trimmedDefault) return `{{ ${inner} }}`;
  return `{{ ${inner} | default('${trimmedDefault}') }}`;
}

function SplitValueField({
  label,
  value,
  onChange,
  readOnly,
  onFocus,
  pathPlaceholder = "{{ field }}",
  pathSuggestions,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
  onFocus?: () => void;
  pathPlaceholder?: string;
  pathSuggestions?: ResolvedPathSuggestion[];
}) {
  const { path, defaultVal } = parseTemplateDefault(value);
  const isBound = path.trim().startsWith("{{") && path.trim().endsWith("}}");
  return (
    <div className="space-y-2">
      <FieldLabel
        pathSuggestions={pathSuggestions}
        onSelectField={(p) => onChange(buildTemplateWithDefault(`{{ ${p} }}`, defaultVal))}
        onActionClick={onFocus}
      >{label}</FieldLabel>
      <div className="space-y-1.5">
        <SmartFieldInput
          value={path}
          onChange={(next) => onChange(buildTemplateWithDefault(next, defaultVal))}
          disabled={readOnly}
          placeholder={pathPlaceholder}
          pathSuggestions={pathSuggestions}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Default:</span>
          <Input
            value={defaultVal}
            onChange={(e) => onChange(buildTemplateWithDefault(path, e.target.value))}
            disabled={readOnly}
            placeholder="0"
            className="font-mono text-[12px] h-7 shadow-none"
          />
        </div>
      </div>
    </div>
  );
}

function CanvasInlineIconButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function CanvasInlineInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...props}
      className={cn(
        "h-8 border-border/60 bg-background/90 text-[12px] shadow-none",
        props.className,
      )}
    />
  );
}

function CanvasInlineTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Textarea
      {...props}
      className={cn(
        "min-h-[72px] border-border/60 bg-background/90 text-[12px] leading-5 shadow-none resize-none",
        props.className,
      )}
    />
  );
}

function BlockInspector({
  block,
  index,
  setBlocks,
  readOnly,
  activeBinding,
  onActivateBinding,
  onDuplicate,
  pathSuggestions,
}: {
  block: VisualBlock;
  index: number;
  setBlocks: React.Dispatch<React.SetStateAction<VisualBlock[]>>;
  readOnly: boolean;
  activeBinding: ActiveBindingTarget | null;
  onActivateBinding: (target: ActiveBindingTarget) => void;
  onDuplicate: () => void;
  pathSuggestions?: ResolvedPathSuggestion[];
}) {
  const props = block.props && typeof block.props === "object" ? block.props : {};
  const style = normalizeBlockStyle(block.type, props.style);
  const Icon = AVAILABLE_BLOCKS.find((item) => item.type === block.type)?.icon || FileText;
  const title = BLOCK_LABELS.get(block.type) || block.type;

  const update = React.useCallback(
    (updater: (current: VisualBlock) => VisualBlock) => {
      setBlocks((current) => updateBlockAtIndex(current, index, (blockValue) => updater(blockValue)));
    },
    [index, setBlocks],
  );

  const updateProps = React.useCallback(
    (patch: Record<string, any>) => {
      update((current) => ({
        ...current,
        props: {
          ...(current.props || {}),
          ...patch,
        },
      }));
    },
    [update],
  );

  const updateStyle = React.useCallback(
    (patch: Record<string, any>) => {
      updateProps({ style: { ...style, ...patch } });
    },
    [style, updateProps],
  );

  const activateContent = React.useCallback(
    (label = "Content", multiline = true) => {
      onActivateBinding({ kind: "content", label, mode: "template", multiline });
    },
    [onActivateBinding],
  );

  const activateProp = React.useCallback(
    (key: string, label: string, mode: ActiveBindingTarget["mode"], multiline = false) => {
      onActivateBinding({ kind: "prop", key, label, mode, multiline });
    },
    [onActivateBinding],
  );

  const tableColumns = React.useMemo(() => getTableColumns(props), [props]);
  const keyValueRows = React.useMemo(() => getKeyValueRows(block), [block]);
  const totalRows = React.useMemo(() => getTotalRows(props), [props]);

  const setTableColumns = React.useCallback(
    (nextColumns: TableColumnConfig[]) => {
      updateProps(syncTableColumnsProps(props, nextColumns));
    },
    [props, updateProps],
  );

  const setKeyValueRows = React.useCallback(
    (nextRows: KeyValueRowConfig[]) => {
      update((current) => {
        const currentProps = current.props && typeof current.props === "object" ? current.props : {};
        return {
          ...current,
          content: serializeKeyValueRows(nextRows),
          props: {
            ...currentProps,
            rows: normalizeKeyValueRows(nextRows),
          },
        };
      });
    },
    [update],
  );

  const setTotalRows = React.useCallback(
    (nextRows: TotalRowConfig[]) => {
      updateProps(syncTotalRowsProps(props, nextRows));
    },
    [props, updateProps],
  );

  const showContentEditor = ["heading", "text", "callout", "terms", "signature", "html"].includes(block.type);

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-start justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold mb-1 text-foreground">
            <Palette className="h-4 w-4 text-muted-foreground"
            />
            <span>{BLOCK_LABELS.get(block.type) || block.type} Settings</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Target: <span className="font-medium text-foreground">{activeBinding?.label || "selected content"}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={readOnly}>
                <MoreHorizontal className="h-4 w-4 text-muted-foreground"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={onDuplicate} disabled={readOnly} className="text-xs">
                <Copy className="mr-2 h-3.5 w-3.5"
                />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setBlocks((current) => current.filter((item) => item.id !== block.id))}
                disabled={readOnly}
                className="text-xs text-destructive focus:text-destructive"
              >
                <X className="mr-2 h-3.5 w-3.5"
                />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-6">
        {showContentEditor ? (
          <div className="space-y-3 pt-2">
            <StringAreaField
              label="Content"
              value={String(block.content || "")}
              onChange={(next) => update((current) => ({ ...current, content: next }))}
              readOnly={readOnly}
              className={cn("min-h-[140px]", block.type === "html" ? "font-mono text-xs" : "")}
              onFocus={() => activateContent("Content", true)}
              pathSuggestions={pathSuggestions}
            />
          </div>
        ) : null}

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="appearance" className="border-b border-border/50">
            <AccordionTrigger className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline py-3">Appearance</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 pt-2 md:grid-cols-2 pb-3">
                <PaddingField label="Padding" value={String(style.padding || "")} onChange={(next) => updateStyle({ padding: next })} readOnly={readOnly}
                />
                <div className="space-y-1.5">
                  <FieldLabel>Text Align</FieldLabel>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant={String(style.textAlign || "left") === "left" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-9 flex-1 gap-1.5 rounded-xl border border-slate-200 bg-white px-0 shadow-none text-muted-foreground focus:text-foreground hover:text-foreground"
                      onClick={() => updateStyle({ textAlign: "left" })}
                      disabled={readOnly}
                      title="Align Left"
                    >
                      <><AlignLeft className="h-3.5 w-3.5" /><span className="text-[11px]">Left</span></>
                    </Button>
                    <Button
                      type="button"
                      variant={String(style.textAlign || "left") === "center" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-9 flex-1 gap-1.5 rounded-xl border border-slate-200 bg-white px-0 shadow-none text-muted-foreground focus:text-foreground hover:text-foreground"
                      onClick={() => updateStyle({ textAlign: "center" })}
                      disabled={readOnly}
                      title="Align Center"
                    >
                      <><AlignCenter className="h-3.5 w-3.5" /><span className="text-[11px]">Center</span></>
                    </Button>
                    <Button
                      type="button"
                      variant={String(style.textAlign || "left") === "right" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-9 flex-1 gap-1.5 rounded-xl border border-slate-200 bg-white px-0 shadow-none text-muted-foreground focus:text-foreground hover:text-foreground"
                      onClick={() => updateStyle({ textAlign: "right" })}
                      disabled={readOnly}
                      title="Align Right"
                    >
                      <><AlignRight className="h-3.5 w-3.5" /><span className="text-[11px]">Right</span></>
                    </Button>
                  </div>
                </div>
                <ColorField label="Background" value={String(style.backgroundColor || "")} onChange={(next) => updateStyle({ backgroundColor: next })} readOnly={readOnly}
                />
                <StringField label="Font Size" value={String(style.fontSize || "")} onChange={(next) => updateStyle({ fontSize: next })} readOnly={readOnly} placeholder="14px"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {block.type === "header" ? (
          <div className="grid gap-3">
            <StringField label="Logo URL" value={String(props.logoUrl || "")} onChange={(next) => updateProps({ logoUrl: next })} readOnly={readOnly} placeholder="https://..." pathSuggestions={pathSuggestions}
            />
            <StringAreaField
              label="Header Content"
              value={String(props.contentPath || "")}
              onChange={(next) => updateProps({ contentPath: next })}
              readOnly={readOnly}
              className="min-h-[110px] font-mono text-xs"
              onFocus={() => activateProp("contentPath", "Header content", "template", true)}
              pathSuggestions={pathSuggestions}
            />
          </div>
        ) : null}

        {block.type === "address" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <StringField label="Left Title" value={String(props.leftTitle || "")} onChange={(next) => updateProps({ leftTitle: next })} readOnly={readOnly} pathSuggestions={pathSuggestions}
            />
            <StringField label="Left Path" value={String(props.leftPath || "")} onChange={(next) => updateProps({ leftPath: next })} readOnly={readOnly} onFocus={() => activateProp("leftPath", "Left path", "template")} pathSuggestions={pathSuggestions}
            />
            <StringField label="Right Title" value={String(props.rightTitle || "")} onChange={(next) => updateProps({ rightTitle: next })} readOnly={readOnly} pathSuggestions={pathSuggestions}
            />
            <StringField label="Right Path" value={String(props.rightPath || "")} onChange={(next) => updateProps({ rightPath: next })} readOnly={readOnly} onFocus={() => activateProp("rightPath", "Right path", "template")} pathSuggestions={pathSuggestions}
            />
          </div>
        ) : null}

        {block.type === "columns" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <StringField label="Left Title" value={String(props.leftTitle || "")} onChange={(next) => updateProps({ leftTitle: next })} readOnly={readOnly} pathSuggestions={pathSuggestions}
            />
            <StringField label="Left Path" value={String(props.leftPath || "")} onChange={(next) => updateProps({ leftPath: next })} readOnly={readOnly} onFocus={() => activateProp("leftPath", "Left path", "template")} pathSuggestions={pathSuggestions}
            />
            <StringField label="Right Title" value={String(props.rightTitle || "")} onChange={(next) => updateProps({ rightTitle: next })} readOnly={readOnly} pathSuggestions={pathSuggestions}
            />
            <StringField label="Right Path" value={String(props.rightPath || "")} onChange={(next) => updateProps({ rightPath: next })} readOnly={readOnly} onFocus={() => activateProp("rightPath", "Right path", "template")} pathSuggestions={pathSuggestions}
            />
          </div>
        ) : null}

        {block.type === "table" ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-3">
              <div className="border-b border-border/50 pb-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Repeat Rows From</div>
              </div>
              <div>
                <StringField
                  label="Repeat Rows From"
                  value={String(props.itemsPath || "")}
                  onChange={(next) => updateProps({ itemsPath: next })}
                  readOnly={readOnly}
                  placeholder="items"
                  onFocus={() => activateProp("itemsPath", "Table row list", "path")}
                  pathSuggestions={pathSuggestions}
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">Pick the list this table repeats over, usually items.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Columns</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-slate-200 bg-white px-3 text-[11px] gap-1.5 shadow-none"
                  disabled={readOnly}
                  onClick={() =>
                    setTableColumns([
                      ...tableColumns,
                      { id: makeId("col"), header: `Column ${tableColumns.length + 1}`, field: "", align: "left" },
                    ])
                  }
                >
                  <Plus className="h-3 w-3"
                  />
                  Add Column
                </Button>
              </div>

              <div className="space-y-3">
                {tableColumns.length > 0 ? (
                  tableColumns.map((column, columnIndex) => (
                    <div key={column.id} className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-foreground">{column.header || `Column ${columnIndex + 1}`}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {column.field || "Choose a value for this column"}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-full p-0"
                            disabled={readOnly || columnIndex === 0}
                            onClick={() => setTableColumns(moveItem(tableColumns, columnIndex, -1))}
                          >
                            <ArrowUp className="h-3.5 w-3.5"
                            />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-full p-0"
                            disabled={readOnly || columnIndex === tableColumns.length - 1}
                            onClick={() => setTableColumns(moveItem(tableColumns, columnIndex, 1))}
                          >
                            <ArrowDown className="h-3.5 w-3.5"
                            />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-full p-0 text-destructive"
                            disabled={readOnly}
                            onClick={() => setTableColumns(tableColumns.filter((item) => item.id !== column.id))}
                          >
                            <X className="h-3.5 w-3.5"
                            />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <StringField
                          label="What users see"
                          value={column.header}
                          onChange={(next) => setTableColumns(tableColumns.map((item) => (item.id === column.id ? { ...item, header: next } : item)))}
                          readOnly={readOnly}
                          placeholder="Description"
                          pathSuggestions={pathSuggestions}
                        />
                        <StringField
                          label="Value from data"
                          value={column.field}
                          onChange={(next) => setTableColumns(tableColumns.map((item) => (item.id === column.id ? { ...item, field: normalizeTableColumnField(next, props.itemsPath) } : item)))}
                          readOnly={readOnly}
                          placeholder="description"
                          onFocus={() =>
                            onActivateBinding({
                              kind: "table_column_field",
                              columnId: column.id,
                              label: column.header ? column.header + " value" : "Column value",
                              mode: "path",
                            })
                          }
                          pathSuggestions={pathSuggestions}
                        />
                        <div className="space-y-1.5">
                          <FieldLabel>Cell Alignment</FieldLabel>
                          <div className="grid grid-cols-3 gap-2">
                            <Button
                              type="button"
                              variant={column.align === "left" ? "secondary" : "ghost"}
                              size="sm"
                              className="h-9 flex-1 gap-1.5 rounded-xl border border-slate-200 bg-white px-0 shadow-none text-muted-foreground focus:text-foreground hover:text-foreground"
                              onClick={() => setTableColumns(tableColumns.map((item) => (item.id === column.id ? { ...item, align: "left" } : item)))}
                              disabled={readOnly}
                              title="Align Left"
                            >
                              <><AlignLeft className="h-3.5 w-3.5" /><span className="text-[11px]">Left</span></>
                            </Button>
                            <Button
                              type="button"
                              variant={column.align === "center" ? "secondary" : "ghost"}
                              size="sm"
                              className="h-9 flex-1 gap-1.5 rounded-xl border border-slate-200 bg-white px-0 shadow-none text-muted-foreground focus:text-foreground hover:text-foreground"
                              onClick={() => setTableColumns(tableColumns.map((item) => (item.id === column.id ? { ...item, align: "center" } : item)))}
                              disabled={readOnly}
                              title="Align Center"
                            >
                              <><AlignCenter className="h-3.5 w-3.5" /><span className="text-[11px]">Center</span></>
                            </Button>
                            <Button
                              type="button"
                              variant={column.align === "right" ? "secondary" : "ghost"}
                              size="sm"
                              className="h-9 flex-1 gap-1.5 rounded-xl border border-slate-200 bg-white px-0 shadow-none text-muted-foreground focus:text-foreground hover:text-foreground"
                              onClick={() => setTableColumns(tableColumns.map((item) => (item.id === column.id ? { ...item, align: "right" } : item)))}
                              disabled={readOnly}
                              title="Align Right"
                            >
                              <><AlignRight className="h-3.5 w-3.5" /><span className="text-[11px]">Right</span></>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-muted-foreground">
                    Add your first column to define what this table should show.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {block.type === "totals" ? (
          <div className="space-y-3 pt-2">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Rows</div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-slate-200 bg-white px-3 text-[11px] gap-1.5 shadow-none"
                disabled={readOnly}
                onClick={() =>
                  setTotalRows([
                    ...totalRows,
                    { id: makeId("total_row"), label: `Row ${totalRows.length + 1}`, valuePath: "", emphasis: false },
                  ])
                }
              >
                <Plus className="h-3 w-3"
                />
                Add Row
              </Button>
            </div>

            <div className="space-y-3">
              {totalRows.map((row, rowIndex) => (
                <div key={row.id} className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="text-xs font-semibold text-foreground">{row.label || `Row ${rowIndex + 1}`}</div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-full p-0"
                        disabled={readOnly || rowIndex === 0}
                        onClick={() => setTotalRows(moveItem(totalRows, rowIndex, -1))}
                      >
                        <ArrowUp className="h-3.5 w-3.5"
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-full p-0"
                        disabled={readOnly || rowIndex === totalRows.length - 1}
                        onClick={() => setTotalRows(moveItem(totalRows, rowIndex, 1))}
                      >
                        <ArrowDown className="h-3.5 w-3.5"
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-full p-0 text-destructive"
                        disabled={readOnly}
                        onClick={() => setTotalRows(totalRows.filter((item) => item.id !== row.id))}
                      >
                        <X className="h-3.5 w-3.5"
                        />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <StringField
                      label="Label"
                      value={row.label}
                      onChange={(next) => setTotalRows(totalRows.map((item) => (item.id === row.id ? { ...item, label: next } : item)))}
                      readOnly={readOnly}
                      placeholder="Subtotal"
                      pathSuggestions={pathSuggestions}
                    />
                    <SplitValueField
                      label="Value"
                      value={row.valuePath}
                      onChange={(next) => setTotalRows(totalRows.map((item) => (item.id === row.id ? { ...item, valuePath: next } : item)))}
                      readOnly={readOnly}
                      pathPlaceholder="{{ total_amount }}"
                      onFocus={() =>
                        onActivateBinding({
                          kind: "total_row_path",
                          rowId: row.id,
                          label: `${row.label || `Row ${rowIndex + 1}`} value`,
                          mode: "template",
                        })
                      }
                      pathSuggestions={pathSuggestions}
                    />
                  </div>

                  <label className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={row.emphasis}
                      onChange={(event) =>
                        setTotalRows(totalRows.map((item) => (item.id === row.id ? { ...item, emphasis: event.target.checked } : item)))
                      }
                      disabled={readOnly}
                    />
                    Highlight this row as an emphasized total
                  </label>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {block.type === "list_loop" ? (
          <div className="grid gap-3">
            <StringField label="Items Path" value={String(props.itemsPath || "")} onChange={(next) => updateProps({ itemsPath: next })} readOnly={readOnly} onFocus={() => activateProp("itemsPath", "List items path", "path")} pathSuggestions={pathSuggestions}
            />
            <div className="space-y-1.5">
              <FieldLabel>List Type</FieldLabel>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={String(props.listType || "disc")}
                onChange={(event) => updateProps({ listType: event.target.value })}
                disabled={readOnly}
              >
                <option value="disc">Bullets</option>
                <option value="decimal">Numbers</option>
                <option value="none">None</option>
              </select>
            </div>
            <StringAreaField
              label="Item Template"
              value={String(props.itemTemplate || "")}
              onChange={(next) => updateProps({ itemTemplate: next })}
              readOnly={readOnly}
              className="min-h-[90px] font-mono text-xs"
              onFocus={() => activateProp("itemTemplate", "Item template", "template", true)}
              pathSuggestions={pathSuggestions}
            />
          </div>
        ) : null}

        {block.type === "key_value" ? (
          <div className="space-y-3 pt-2">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rows</div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-slate-200 bg-white px-3 text-[11px] gap-1.5 shadow-none"
                disabled={readOnly}
                onClick={() =>
                  setKeyValueRows([
                    ...keyValueRows,
                    { id: makeId("kv_row"), label: `Label ${keyValueRows.length + 1}`, value: "" },
                  ])
                }
              >
                <Plus className="h-3 w-3"
                />
                Add Row
              </Button>
            </div>

            <div className="space-y-3">
              {keyValueRows.map((row, rowIndex) => (
                <div key={row.id} className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="text-xs font-semibold text-foreground">{row.label || `Row ${rowIndex + 1}`}</div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-full p-0"
                        disabled={readOnly || rowIndex === 0}
                        onClick={() => setKeyValueRows(moveItem(keyValueRows, rowIndex, -1))}
                      >
                        <ArrowUp className="h-3.5 w-3.5"
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-full p-0"
                        disabled={readOnly || rowIndex === keyValueRows.length - 1}
                        onClick={() => setKeyValueRows(moveItem(keyValueRows, rowIndex, 1))}
                      >
                        <ArrowDown className="h-3.5 w-3.5"
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-full p-0 text-destructive"
                        disabled={readOnly}
                        onClick={() => setKeyValueRows(keyValueRows.filter((item) => item.id !== row.id))}
                      >
                        <X className="h-3.5 w-3.5"
                        />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <StringField
                      label="Label"
                      value={row.label}
                      onChange={(next) => setKeyValueRows(keyValueRows.map((item) => (item.id === row.id ? { ...item, label: next } : item)))}
                      readOnly={readOnly}
                      placeholder="Document Number"
                      pathSuggestions={pathSuggestions}
                    />
                    <SplitValueField
                      label="Value"
                      value={row.value}
                      onChange={(next) => setKeyValueRows(keyValueRows.map((item) => (item.id === row.id ? { ...item, value: next } : item)))}
                      readOnly={readOnly}
                      pathPlaceholder="{{ document_number }}"
                      onFocus={() =>
                        onActivateBinding({
                          kind: "key_value_value",
                          rowId: row.id,
                          label: `${row.label || `Row ${rowIndex + 1}`} value`,
                          mode: "template",
                        })
                      }
                      pathSuggestions={pathSuggestions}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}

function CanvasBlock({
  block,
  index,
  previewData,
  canvasMode,
  zoom,
  readOnly,
  selected,
  onSelect,
  onLayoutChange,
  onOpenSettings,
  onClearSelection,
  onMutateBlock,
  onActivateBinding,
}: {
  block: VisualBlock;
  index: number;
  previewData: Record<string, any>;
  canvasMode: CanvasMode;
  zoom: number;
  readOnly: boolean;
  selected: boolean;
  onSelect: () => void;
  onLayoutChange: (patch: Partial<BlockLayout>) => void;
  onOpenSettings: () => void;
  onClearSelection: () => void;
  onMutateBlock: (updater: (block: VisualBlock) => VisualBlock) => void;
  onActivateBinding: (target: ActiveBindingTarget) => void;
}) {
  const layout = getBlockLayout(block, index);
  const props = block.props && typeof block.props === "object" ? block.props : {};
  const isInlineTextBlock = ["heading", "text", "callout", "terms", "signature"].includes(block.type);
  const tableColumns = React.useMemo(() => getTableColumns(props), [props]);
  const keyValueRows = React.useMemo(() => getKeyValueRows(block), [block]);
  const totalRows = React.useMemo(() => getTotalRows(props), [props]);
  const itemsPath = String(props.itemsPath || "items").trim() || "items";

  const updateProps = React.useCallback(
    (patch: Record<string, any>) => {
      onMutateBlock((current) => ({
        ...current,
        props: {
          ...(current.props || {}),
          ...patch,
        },
      }));
    },
    [onMutateBlock],
  );

  const setContent = React.useCallback(
    (next: string) => {
      onMutateBlock((current) => ({ ...current, content: next }));
    },
    [onMutateBlock],
  );

  const setTableColumns = React.useCallback(
    (nextColumns: TableColumnConfig[]) => {
      updateProps(syncTableColumnsProps(props, nextColumns));
    },
    [props, updateProps],
  );

  const setKeyValueRows = React.useCallback(
    (nextRows: KeyValueRowConfig[]) => {
      onMutateBlock((current) => {
        const currentProps = current.props && typeof current.props === "object" ? current.props : {};
        return {
          ...current,
          content: serializeKeyValueRows(nextRows),
          props: {
            ...currentProps,
            rows: normalizeKeyValueRows(nextRows),
          },
        };
      });
    },
    [onMutateBlock],
  );

  const setTotalRows = React.useCallback(
    (nextRows: TotalRowConfig[]) => {
      updateProps(syncTotalRowsProps(props, nextRows));
    },
    [props, updateProps],
  );

  const renderEditableCanvasContent = React.useCallback(() => {
    if (isInlineTextBlock) {
      return (
        <div className="canvas-block-editor flex h-full flex-col justify-center gap-2 p-1" onMouseDown={(event) => event.stopPropagation()}>
          {block.type === "heading" ? (
            <CanvasInlineInput
              value={String(block.content || "")}
              onChange={(event) => setContent(event.target.value)}
              onFocus={() => onActivateBinding({ kind: "content", label: "Content", mode: "template", multiline: false })}
              placeholder="Type heading"
              className="h-11 text-lg font-semibold"
            />
          ) : (
            <CanvasInlineTextarea
              value={String(block.content || "")}
              onChange={(event) => setContent(event.target.value)}
              onFocus={() => onActivateBinding({ kind: "content", label: "Content", mode: "template", multiline: true })}
              placeholder="Type fixed text here, then add fields from the left."
              className={cn(block.type === "signature" ? "min-h-[52px] text-center" : "min-h-[96px]")}
            />
          )}
          <div className="text-[11px] text-muted-foreground">
            Type fixed text here. Click a field on the left to insert it into this block.
          </div>
        </div>
      );
    }

    if (block.type === "header") {
      return (
        <div className="canvas-block-editor grid h-full gap-3 p-1.5 md:grid-cols-[140px_minmax(0,1fr)]" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-medium text-muted-foreground">Logo</div>
            <CanvasInlineInput
              value={String(props.logoUrl || "")}
              onChange={(event) => updateProps({ logoUrl: event.target.value })}
              placeholder="https://logo-url"
            />
            <div className="flex min-h-[72px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-background/70 px-2 text-center text-[11px] text-slate-400">
              {String(props.logoUrl || "").trim() ? "Logo source set" : "Leave empty to use brand logo"}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-medium text-muted-foreground">Header Content</div>
            <CanvasInlineTextarea
              value={String(props.contentPath || "")}
              onChange={(event) => updateProps({ contentPath: event.target.value })}
              onFocus={() => onActivateBinding({ kind: "prop", key: "contentPath", label: "Header content", mode: "template", multiline: true })}
              placeholder={"{{ seller_name }}\n{{ seller_address }}"}
              className="min-h-[110px]"
            />
            <div className="text-[11px] text-muted-foreground">
              Type fixed lines here and click fields on the left to insert company details.
            </div>
          </div>
        </div>
      );
    }

    if (block.type === "address" || block.type === "columns") {
      return (
        <div className="canvas-block-editor grid h-full grid-cols-2 gap-3 p-1.5" onMouseDown={(event) => event.stopPropagation()}>
          {[
            {
              key: "left",
              titleValue: String(props.leftTitle || (block.type === "address" ? "Billed To" : "Left Column")),
              pathValue: String(props.leftPath || ""),
              titleLabel: "Left Title",
              pathLabel: "Left Value",
            },
            {
              key: "right",
              titleValue: String(props.rightTitle || (block.type === "address" ? "Shipped To" : "Right Column")),
              pathValue: String(props.rightPath || ""),
              titleLabel: "Right Title",
              pathLabel: "Right Value",
            },
          ].map((side) => (
            <div key={side.key} className="rounded-lg border border-border/60 bg-background/70 p-2">
              <div className="space-y-2">
                <CanvasInlineInput
                  value={side.titleValue}
                  onChange={(event) =>
                    updateProps({
                      [side.key === "left" ? "leftTitle" : "rightTitle"]: event.target.value,
                    })
                  }
                  placeholder={side.titleLabel}
                  className="h-8 text-[11px] font-semibold uppercase tracking-[0.12em]"
                />
                <CanvasInlineTextarea
                  value={side.pathValue}
                  onChange={(event) =>
                    updateProps({
                      [side.key === "left" ? "leftPath" : "rightPath"]: event.target.value,
                    })
                  }
                  onFocus={() =>
                    onActivateBinding({
                      kind: "prop",
                      key: side.key === "left" ? "leftPath" : "rightPath",
                      label: side.pathLabel,
                      mode: "template",
                      multiline: true,
                    })
                  }
                  placeholder={"{{ buyer_address }}"}
                  className="min-h-[84px]"
                />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (block.type === "key_value") {
      return (
        <div className="canvas-block-editor flex h-full flex-col gap-2 overflow-auto p-1.5" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-muted-foreground">Rows</div>
            <div className="flex items-center gap-1">
              <CanvasInlineIconButton
                disabled={false}
                title="Add row"
                onClick={() =>
                  setKeyValueRows([
                    ...keyValueRows,
                    { id: makeId("kv_row"), label: `Label ${keyValueRows.length + 1}`, value: "" },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
              </CanvasInlineIconButton>
            </div>
          </div>

          {keyValueRows.length > 0 ? keyValueRows.map((row, rowIndex) => (
            <div key={row.id} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] gap-2">
              <CanvasInlineInput
                value={row.label}
                onChange={(event) => setKeyValueRows(keyValueRows.map((item) => (item.id === row.id ? { ...item, label: event.target.value } : item)))}
                placeholder="Label"
              />
              <CanvasInlineInput
                value={row.value}
                onChange={(event) => setKeyValueRows(keyValueRows.map((item) => (item.id === row.id ? { ...item, value: event.target.value } : item)))}
                onFocus={() =>
                  onActivateBinding({
                    kind: "key_value_value",
                    rowId: row.id,
                    label: `${row.label || `Row ${rowIndex + 1}`} value`,
                    mode: "template",
                  })
                }
                placeholder="{{ document_number }}"
              />
              <div className="flex items-center gap-1">
                <CanvasInlineIconButton
                  disabled={rowIndex === 0}
                  title="Move up"
                  onClick={() => setKeyValueRows(moveItem(keyValueRows, rowIndex, -1))}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </CanvasInlineIconButton>
                <CanvasInlineIconButton
                  disabled={rowIndex === keyValueRows.length - 1}
                  title="Move down"
                  onClick={() => setKeyValueRows(moveItem(keyValueRows, rowIndex, 1))}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </CanvasInlineIconButton>
                <CanvasInlineIconButton
                  className="text-destructive hover:text-destructive"
                  title="Remove row"
                  onClick={() => setKeyValueRows(keyValueRows.filter((item) => item.id !== row.id))}
                >
                  <X className="h-3.5 w-3.5" />
                </CanvasInlineIconButton>
              </div>
            </div>
          )) : (
            <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
              Add facts like Document Number, Date, or Owner directly here.
            </div>
          )}
        </div>
      );
    }

    if (block.type === "list_loop") {
      return (
        <div className="canvas-block-editor flex h-full flex-col gap-2 p-1.5" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Rows</span>
            <CanvasInlineInput
              value={itemsPath}
              onChange={(event) => updateProps({ itemsPath: event.target.value })}
              onFocus={() => onActivateBinding({ kind: "prop", key: "itemsPath", label: "List rows source", mode: "path" })}
              placeholder="items"
              className="h-7 w-[140px]"
            />
            <select
              className={cn(selectClassName(), "h-7 min-w-[96px] bg-background/90 px-2 text-[12px]")}
              value={String(props.listType || "disc")}
              onChange={(event) => updateProps({ listType: event.target.value })}
            >
              <option value="disc">Bullets</option>
              <option value="decimal">Numbers</option>
              <option value="none">Plain</option>
            </select>
          </div>
          <CanvasInlineTextarea
            value={String(props.itemTemplate || "{{ item }}")}
            onChange={(event) => updateProps({ itemTemplate: event.target.value })}
            onFocus={() => onActivateBinding({ kind: "prop", key: "itemTemplate", label: "List item template", mode: "template", multiline: true })}
            placeholder="{{ item }}"
            className="min-h-[96px]"
          />
          <div className="text-[11px] text-muted-foreground">
            Write the row template here and insert fields from the left to shape each repeated item.
          </div>
        </div>
      );
    }

    if (block.type === "totals") {
      return (
        <div className="canvas-block-editor flex h-full flex-col gap-2 overflow-auto p-1.5" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-muted-foreground">Summary Rows</div>
            <CanvasInlineIconButton
              title="Add total row"
              onClick={() =>
                setTotalRows([
                  ...totalRows,
                  { id: makeId("total_row"), label: `Row ${totalRows.length + 1}`, valuePath: "", emphasis: false },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
            </CanvasInlineIconButton>
          </div>

          {totalRows.length > 0 ? totalRows.map((row, rowIndex) => (
            <div key={row.id} className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_auto] gap-2">
              <CanvasInlineInput
                value={row.label}
                onChange={(event) => setTotalRows(totalRows.map((item) => (item.id === row.id ? { ...item, label: event.target.value } : item)))}
                placeholder="Label"
                className={cn(row.emphasis ? "font-semibold" : "")}
              />
              <CanvasInlineInput
                value={row.valuePath}
                onChange={(event) => setTotalRows(totalRows.map((item) => (item.id === row.id ? { ...item, valuePath: event.target.value } : item)))}
                onFocus={() =>
                  onActivateBinding({
                    kind: "total_row_path",
                    rowId: row.id,
                    label: `${row.label || `Row ${rowIndex + 1}`} value`,
                    mode: "template",
                  })
                }
                placeholder="{{ total_amount }}"
                className={cn(row.emphasis ? "font-semibold" : "")}
              />
              <div className="flex items-center gap-1">
                <CanvasInlineIconButton
                  className={cn(row.emphasis ? "text-primary" : "")}
                  title="Toggle emphasis"
                  onClick={() => setTotalRows(totalRows.map((item) => (item.id === row.id ? { ...item, emphasis: !item.emphasis } : item)))}
                >
                  <Type className="h-3.5 w-3.5" />
                </CanvasInlineIconButton>
                <CanvasInlineIconButton
                  disabled={rowIndex === 0}
                  title="Move up"
                  onClick={() => setTotalRows(moveItem(totalRows, rowIndex, -1))}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </CanvasInlineIconButton>
                <CanvasInlineIconButton
                  disabled={rowIndex === totalRows.length - 1}
                  title="Move down"
                  onClick={() => setTotalRows(moveItem(totalRows, rowIndex, 1))}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </CanvasInlineIconButton>
                <CanvasInlineIconButton
                  className="text-destructive hover:text-destructive"
                  title="Remove row"
                  onClick={() => setTotalRows(totalRows.filter((item) => item.id !== row.id))}
                >
                  <X className="h-3.5 w-3.5" />
                </CanvasInlineIconButton>
              </div>
            </div>
          )) : (
            <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
              Add summary rows like Subtotal, Discount, Tax, and Total directly here.
            </div>
          )}
        </div>
      );
    }

    if (block.type === "table") {
      const previewItems = resolveItems(props.itemsPath, previewData).slice(0, 2);
      const safeItems = previewItems.length > 0 ? previewItems : [{}];
      return (
        <div className="canvas-block-editor flex h-full flex-col gap-2 overflow-auto p-1.5" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Rows</span>
              <CanvasInlineInput
                value={itemsPath}
                onChange={(event) => updateProps({ itemsPath: event.target.value })}
                onFocus={() => onActivateBinding({ kind: "prop", key: "itemsPath", label: "Table rows source", mode: "path" })}
                placeholder="items"
                className="h-7 w-[140px]"
              />
            </div>
            <CanvasInlineIconButton
              title="Add column"
              onClick={() =>
                setTableColumns([
                  ...tableColumns,
                  { id: makeId("col"), header: `Column ${tableColumns.length + 1}`, field: "", align: "left" },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
            </CanvasInlineIconButton>
          </div>

          {tableColumns.length > 0 ? (
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr>
                    {tableColumns.map((column, columnIndex) => (
                      <th key={column.id} className="border border-slate-200 bg-slate-50 p-2 align-top">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-1">
                            <CanvasInlineInput
                              value={column.header}
                              onChange={(event) =>
                                setTableColumns(tableColumns.map((item) => (item.id === column.id ? { ...item, header: event.target.value } : item)))
                              }
                              placeholder="Header"
                              className="h-7"
                            />
                            <CanvasInlineIconButton
                              disabled={columnIndex === 0}
                              title="Move left"
                              onClick={() => setTableColumns(moveItem(tableColumns, columnIndex, -1))}
                            >
                              <ArrowUp className="h-3.5 w-3.5 rotate-[-90deg]" />
                            </CanvasInlineIconButton>
                            <CanvasInlineIconButton
                              disabled={columnIndex === tableColumns.length - 1}
                              title="Move right"
                              onClick={() => setTableColumns(moveItem(tableColumns, columnIndex, 1))}
                            >
                              <ArrowDown className="h-3.5 w-3.5 rotate-[-90deg]" />
                            </CanvasInlineIconButton>
                            <CanvasInlineIconButton
                              className="text-destructive hover:text-destructive"
                              title="Remove column"
                              onClick={() => setTableColumns(tableColumns.filter((item) => item.id !== column.id))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </CanvasInlineIconButton>
                          </div>
                          <div className="flex items-center gap-2">
                            <CanvasInlineInput
                              value={column.field}
                              onChange={(event) =>
                                setTableColumns(tableColumns.map((item) => (item.id === column.id ? { ...item, field: event.target.value } : item)))
                              }
                              onFocus={() =>
                                onActivateBinding({
                                  kind: "table_column_field",
                                  columnId: column.id,
                                  label: `${column.header || `Column ${columnIndex + 1}`} field`,
                                  mode: "path",
                                })
                              }
                              placeholder="items[].description"
                              className="h-7"
                            />
                            <select
                              className={cn(selectClassName(), "h-7 min-w-[78px] bg-background/90 px-2 text-[12px]")}
                              value={column.align}
                              onChange={(event) =>
                                setTableColumns(tableColumns.map((item) => (item.id === column.id ? { ...item, align: alignValue(event.target.value) } : item)))
                              }
                            >
                              <option value="left">Left</option>
                              <option value="center">Center</option>
                              <option value="right">Right</option>
                            </select>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {safeItems.map((item, rowIndex) => (
                    <tr key={`${block.id}_inline_row_${rowIndex}`}>
                      {tableColumns.map((column) => (
                        <td key={`${column.id}_${rowIndex}`} className="border border-slate-200 px-2 py-2 align-top" style={{ textAlign: column.align }}>
                          {resolveBoundText(getTableColumnTemplate(column.field, itemsPath), previewData, { item, loop: { index: rowIndex + 1 } }) || (
                            <span className="text-slate-400">Preview</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
              Add your first column right here, then bind it to a field from the left.
            </div>
          )}
        </div>
      );
    }

    return null;
  }, [
    block,
    isInlineTextBlock,
    keyValueRows,
    onActivateBinding,
    previewData,
    props,
    setContent,
    setKeyValueRows,
    setTableColumns,
    setTotalRows,
    tableColumns,
    totalRows,
    updateProps,
    itemsPath,
  ]);

  const editableCanvasContent = null;

  return (
    <Rnd
      size={{ width: layout.width, height: layout.height }}
      position={{ x: layout.x, y: layout.y }}
      bounds="parent"
      scale={zoom}
      dragHandleClassName={selected && !readOnly ? "canvas-block-drag-handle" : undefined}
      dragGrid={[GRID_SIZE, GRID_SIZE]}
      resizeGrid={[GRID_SIZE, GRID_SIZE]}
      cancel=".canvas-block-toolbar, .canvas-block-toolbar *, .canvas-block-editor, .canvas-block-editor *, input, textarea, select, button"
      minWidth={MIN_BLOCK_WIDTH}
      minHeight={MIN_BLOCK_HEIGHT}
      enableResizing={readOnly ? false : undefined}
      disableDragging={readOnly}
      onMouseDown={onSelect}
      onDragStart={onSelect}
      onDragStop={(_event, data) => onLayoutChange({ x: snap(data.x), y: snap(data.y) })}
      onResizeStop={(_event, _direction, ref, _delta, position) => {
        onLayoutChange({
          x: snap(position.x),
          y: snap(position.y),
          width: snap(parseFloat(ref.style.width)),
          height: snap(parseFloat(ref.style.height)),
        });
      }}
      style={{ zIndex: layout.zIndex }}
      className="group"
    >
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-xl border bg-white transition-all",
          selected ? "border-primary/50 ring-2 ring-primary/20 shadow-xl" : "border-border/60 shadow-sm hover:shadow-md",
        )}
      >
        {selected && !readOnly ? (
          <div
            className="canvas-block-drag-handle absolute left-2 top-2 z-20 flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-border/60 bg-background/95 text-muted-foreground shadow-sm active:cursor-grabbing"
            aria-label="Move block"
            title="Move"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        ) : null}

        {selected && !readOnly ? (
          <div className="canvas-block-toolbar absolute right-2 top-2 z-20 flex items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 w-7 rounded-md bg-background/95 p-0 shadow-sm"
              aria-label="Open element settings"
              title="Settings"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onOpenSettings();
              }}
            >
              <Settings2 className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 w-7 rounded-md bg-background/95 p-0 shadow-sm"
              aria-label="Clear selection"
              title="Close"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onClearSelection();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : null}

        <div className="h-full w-full overflow-hidden">
          {editableCanvasContent || renderCanvasBlockContent(block, previewData, canvasMode)}
        </div>
      </div>
    </Rnd>
  );
}

export default function TemplateVisualEditor({
  initialHtml,
  initialCss,
  initialBlocks,
  pathSuggestions,
  previewData,
  readOnly = false,
  readOnlyReason,
  onSnapshotChange,
  onRegisterSnapshot,
}: TemplateVisualEditorProps) {
  const [blocks, setBlocks] = React.useState<VisualBlock[]>(() => normalizeIncomingBlocks(initialBlocks));
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [theme, setTheme] = React.useState<ThemeConfig>(() => extractThemeFromCss(initialCss));
  const [userCss, setUserCss] = React.useState<string>(() => stripGeneratedBaseCss(initialCss));
  const [zoom, setZoom] = React.useState(0.85);
  const [showCode, setShowCode] = React.useState(false);
  const [canvasMode, setCanvasMode] = React.useState<CanvasMode>("preview");
  const [activeBinding, setActiveBinding] = React.useState<ActiveBindingTarget | null>(null);
  const [settingsDrawerMode, setSettingsDrawerMode] = React.useState<"document" | "element">("document");

  React.useEffect(() => {
    setBlocks(normalizeIncomingBlocks(initialBlocks));
  }, [initialBlocks]);

  React.useEffect(() => {
    setTheme(extractThemeFromCss(initialCss));
    setUserCss(stripGeneratedBaseCss(initialCss));
  }, [initialCss]);

  React.useEffect(() => {
    if (blocks.length === 0) {
      setSelectedBlockId(null);
      return;
    }
    if (!selectedBlockId || !blocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(blocks[blocks.length - 1]?.id || null);
    }
  }, [blocks, selectedBlockId]);

  React.useEffect(() => {
    if (!activeBinding && selectedBlockId) {
      setActiveBinding({ kind: "content", label: "Content", mode: "template", multiline: true });
    }
  }, [activeBinding, selectedBlockId]);

  const suggestions = React.useMemo(() => normalizePathSuggestions(pathSuggestions), [pathSuggestions]);
  const safePreviewData = React.useMemo(() => normalizePreviewData(previewData), [previewData]);
  const fieldUsageMap = React.useMemo(() => buildFieldUsageMap(blocks), [blocks]);
  const generatedHtml = React.useMemo(() => buildHtml(blocks), [blocks]);
  const generatedCss = React.useMemo(() => buildCss(theme, userCss), [theme, userCss]);
  const scopedCanvasCss = React.useMemo(
    () => [scopeCssToCanvas(userCss, TEMPLATE_VISUAL_CANVAS_SCOPE), TEMPLATE_VISUAL_HTML_HELPERS].filter(Boolean).join("\n\n"),
    [userCss],
  );
  const currentSnapshot = React.useMemo<TemplateVisualSnapshot>(
    () => ({ html: generatedHtml, css: generatedCss, blocks }),
    [blocks, generatedCss, generatedHtml],
  );
  const selectedIndex = React.useMemo(() => blocks.findIndex((block) => block.id === selectedBlockId), [blocks, selectedBlockId]);
  const selectedBlock = selectedIndex >= 0 ? blocks[selectedIndex] : null;
  const scaledWidth = PAGE_WIDTH * zoom;
  const hasLegacyHtml = String(initialHtml || "").trim().length > 0;

  const getSnapshot = React.useCallback(() => currentSnapshot, [currentSnapshot]);

  React.useEffect(() => {
    if (onRegisterSnapshot) onRegisterSnapshot(getSnapshot);
  }, [getSnapshot, onRegisterSnapshot]);

  React.useEffect(() => {
    if (onSnapshotChange) onSnapshotChange(currentSnapshot);
  }, [currentSnapshot, onSnapshotChange]);

  React.useEffect(() => {
    if (settingsDrawerMode === "element" && !selectedBlock) {
      setSettingsDrawerMode("document");
    }
  }, [selectedBlock, settingsDrawerMode]);

  const handleAddBlock = React.useCallback(
    (type: BlockType) => {
      if (readOnly) return;
      const nextBlock = createBlock(type, blocks.length);
      setBlocks((current) => reindexBlockLayouts([...current, nextBlock]));
      setSelectedBlockId(nextBlock.id);
      setActiveBinding({ kind: "content", label: "Content", mode: "template", multiline: true });
    },
    [blocks.length, readOnly],
  );

  const handleInsertSuggestion = React.useCallback(
    (path: string) => {
      if (readOnly || !selectedBlock) return;
      const target = activeBinding || { kind: "content", label: "Content", mode: "template", multiline: true };
      const token = formatToken(path, target.mode);

      setBlocks((current) =>
        updateBlockAtIndex(current, selectedIndex, (block) => {
          if (target.kind === "table_column_field" && target.columnId) {
            const props = block.props && typeof block.props === "object" ? block.props : {};
            const nextColumns = getTableColumns(props).map((column) =>
              column.id === target.columnId ? { ...column, field: normalizeTableColumnField(path, props.itemsPath) } : column,
            );
            return {
              ...block,
              props: syncTableColumnsProps(props, nextColumns),
            };
          }

          if (target.kind === "key_value_value" && target.rowId) {
            const props = block.props && typeof block.props === "object" ? block.props : {};
            const nextRows = getKeyValueRows(block).map((row) =>
              row.id === target.rowId ? { ...row, value: appendToken(String(row.value || ""), token, target.multiline) } : row,
            );
            return {
              ...block,
              content: serializeKeyValueRows(nextRows),
              props: {
                ...props,
                rows: nextRows,
              },
            };
          }

          if (target.kind === "total_row_path" && target.rowId) {
            const props = block.props && typeof block.props === "object" ? block.props : {};
            const nextRows = getTotalRows(props).map((row) =>
              row.id === target.rowId ? { ...row, valuePath: formatToken(path, "template") } : row,
            );
            return {
              ...block,
              props: syncTotalRowsProps(props, nextRows),
            };
          }

          if (target.kind === "prop" && target.key) {
            const props = block.props && typeof block.props === "object" ? block.props : {};
            return {
              ...block,
              props: {
                ...props,
                [target.key]: appendToken(String(props[target.key] || ""), token, target.multiline),
              },
            };
          }

          return {
            ...block,
            content: appendToken(String(block.content || ""), token, target.multiline),
          };
        }),
      );
    },
    [activeBinding, readOnly, selectedBlock, selectedIndex],
  );

  const handleSeedFromLegacyHtml = React.useCallback(() => {
    if (readOnly || !hasLegacyHtml) return;
    const block = createLegacyHtmlBlock(initialHtml);
    setBlocks(reindexBlockLayouts([block]));
    setSelectedBlockId(block.id);
    setActiveBinding({ kind: "content", label: "Content", mode: "raw", multiline: true });
  }, [hasLegacyHtml, initialHtml, readOnly]);

  const updateSelectedLayout = React.useCallback(
    (blockId: string, patch: Partial<BlockLayout>) => {
      setBlocks((current) => {
        const index = current.findIndex((item) => item.id === blockId);
        return updateBlockAtIndex(current, index, (block) => ({
          ...block,
          props: {
            ...(block.props || {}),
            layout: updateLayoutPatch(getBlockLayout(block, index), patch),
          },
        }));
      });
    },
    [],
  );

  const mutateBlockById = React.useCallback((blockId: string, updater: (block: VisualBlock) => VisualBlock) => {
    setBlocks((current) => {
      const index = current.findIndex((item) => item.id === blockId);
      return updateBlockAtIndex(current, index, (block) => updater(block));
    });
  }, []);

  const handleDuplicateSelected = React.useCallback(() => {
    if (readOnly || selectedIndex < 0) return;
    setBlocks((current) => duplicateBlock(current, selectedIndex));
  }, [readOnly, selectedIndex]);

  const openDocumentSettings = React.useCallback(() => {
    setSettingsDrawerMode("document");
  }, []);

  const openElementSettings = React.useCallback((blockId: string) => {
    setSelectedBlockId(blockId);
    setSettingsDrawerMode("element");
  }, []);

  return (
    <div className="flex h-[calc(100vh-80px)] min-h-[700px] flex-col space-y-4 pb-4">
      <div className={cn(PANEL_CLASS, "flex flex-wrap items-center justify-between gap-3 px-4 py-3 shrink-0")}>
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold">Visual Template Builder</div>
            <p className="text-[11px] text-muted-foreground">{hasLegacyHtml ? "HTML Seeded Canvas" : "Canvas Editor"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? (
            <div className="mr-4 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-1 text-[11px] text-amber-900">
              {readOnlyReason || "Visual editing is locked."}
            </div>
          ) : null}
          <div className="flex items-center rounded-lg border border-border/60 bg-background p-1">
            <Button
              type="button"
              variant={canvasMode === "preview" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-2.5"
              onClick={() => setCanvasMode("preview")}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview Data
            </Button>
            <Button
              type="button"
              variant={canvasMode === "fields" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-2.5"
              onClick={() => setCanvasMode("fields")}
            >
              <Code2 className="h-3.5 w-3.5" />
              Show Fields
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={openDocumentSettings}>
            <Settings2 className="h-3.5 w-3.5" />
            Page Settings
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setZoom((current) => clamp(Number((current - 0.05).toFixed(2)), 0.6, 1.35))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <div className="min-w-[48px] text-center text-[12px] font-medium text-muted-foreground">{Math.round(zoom * 100)}%</div>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setZoom((current) => clamp(Number((current + 0.05).toFixed(2)), 0.6, 1.35))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)_380px]">
        <div className="flex flex-col space-y-4 overflow-y-auto pr-1">
          <div className={PANEL_CLASS}>
            <SectionHeader icon={Palette} title="Elements" subtitle="Click blocks to add to design canvas." />
            <div className="grid grid-cols-2 gap-2 p-3">
              {AVAILABLE_BLOCKS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => handleAddBlock(item.type)}
                    disabled={readOnly}
                    className="group flex flex-col items-center justify-center gap-2 rounded-lg border border-border/40 bg-background/50 p-3 py-4 text-center transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                    <span className="text-[11px] font-medium leading-tight text-foreground/80 group-hover:text-foreground">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={PANEL_CLASS}>
            <SectionHeader icon={FileText} title="Data Fields" subtitle="Click a field to bind it into the selected property." />
            <div className="border-b border-border/50 px-4 py-2 text-[11px] text-muted-foreground">
              Inserting into: <span className="font-medium text-foreground">{activeBinding?.label || "Content"}</span>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto p-4">
              {suggestions.length > 0 ? suggestions.map((suggestion) => (
                <PathTokenButton
                  key={suggestion.path}
                  suggestion={suggestion}
                  onInsert={handleInsertSuggestion}
                  usageCount={fieldUsageMap.get(suggestion.path) || 0}
                />
              )) : (
                <div className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
                  No sample fields found yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col space-y-4 relative">
          <div className={cn(PANEL_CLASS, "flex flex-1 flex-col overflow-hidden")}>
            <div className="relative flex-1 overflow-auto bg-slate-100/50 p-6">
              <div className="mx-auto" style={{ width: scaledWidth, minWidth: scaledWidth }}>
                <div
                  style={{
                    width: PAGE_WIDTH,
                    height: PAGE_HEIGHT,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                  }}
                  className="template-visual-canvas relative overflow-hidden rounded-[20px] border border-slate-300 bg-white shadow-2xl"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setSelectedBlockId(null);
                  }}
                >
                  {scopedCanvasCss ? <style>{scopedCanvasCss}</style> : null}
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, rgba(148,163,184,.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,.14) 1px, transparent 1px)",
                      backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                    }}
                  />
                  <div className="absolute inset-[32px] border border-dashed border-slate-200" />

                  {blocks.length > 0 ? blocks.map((block, index) => (
                    <CanvasBlock
                      key={block.id}
                      block={block}
                      index={index}
                      previewData={safePreviewData}
                      canvasMode={canvasMode}
                      zoom={zoom}
                      readOnly={readOnly}
                      selected={selectedBlockId === block.id}
                      onSelect={() => openElementSettings(block.id)}
                      onLayoutChange={(patch) => updateSelectedLayout(block.id, patch)}
                      onOpenSettings={() => openElementSettings(block.id)}
                      onClearSelection={() => setSelectedBlockId(null)}
                      onMutateBlock={(updater) => mutateBlockById(block.id, updater)}
                      onActivateBinding={setActiveBinding}
                    />
                  )) : (
                    <div className="absolute inset-0 flex items-center justify-center p-12">
                      <div className="max-w-md rounded-2xl border border-dashed border-slate-300 bg-white/90 px-6 py-8 text-center shadow-sm">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Plus className="h-6 w-6" />
                        </div>
                        <div className="text-base font-semibold text-slate-900">Start designing on the page</div>
                        <p className="mt-2 text-sm text-slate-500">
                          Add blocks from the left, then drag, resize, and bind fields until the canvas matches your exported document.
                        </p>
                        {hasLegacyHtml && !readOnly ? (
                          <Button type="button" variant="outline" className="mt-4 gap-1.5" onClick={handleSeedFromLegacyHtml}>
                            <Code2 className="h-4 w-4" />
                            Start with HTML layer
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {showCode ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className={PANEL_CLASS}>
                <SectionHeader icon={Code2} title="Generated HTML" subtitle="This is what gets saved into the template definition." />
                <div className="p-4">
                  <Textarea readOnly value={generatedHtml} className="min-h-[360px] font-mono text-[11px]" />
                </div>
              </div>
              <div className={PANEL_CLASS}>
                <SectionHeader icon={Code2} title="Generated CSS" subtitle="Base page CSS plus any custom additions below." />
                <div className="space-y-3 p-4">
                  <Textarea readOnly value={generatedCss} className="min-h-[220px] font-mono text-[11px]" />
                  <StringAreaField
                    label="Custom CSS"
                    value={userCss}
                    onChange={setUserCss}
                    readOnly={readOnly}
                    className="min-h-[120px] font-mono text-[11px]"
                    placeholder=".my-class { color: #334155; }"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col space-y-4 overflow-y-auto pl-1">
          <div className={cn(PANEL_CLASS, "flex flex-1 flex-col overflow-hidden relative")}>
            {settingsDrawerMode === "document" ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-border/50 px-4 py-3 text-left">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>Page Settings</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Adjust the overall look and feel of this document template.</p>
                </div>
                <div className="space-y-4 overflow-y-auto p-4">
                  <StringField label="Font Family" value={theme.fontFamily} onChange={(next) => setTheme((current) => ({ ...current, fontFamily: next }))} readOnly={readOnly} placeholder="Inter, system-ui, sans-serif" />
                  <ColorField label="Page Background" value={theme.background} onChange={(next) => setTheme((current) => ({ ...current, background: next }))} readOnly={readOnly} />
                  <ColorField label="Default Text Color" value={theme.textColor} onChange={(next) => setTheme((current) => ({ ...current, textColor: next }))} readOnly={readOnly} />
                </div>
              </div>
            ) : selectedBlock ? (
              <div className="flex h-full flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <BlockInspector
                    block={selectedBlock}
                    index={selectedIndex}
                    setBlocks={setBlocks}
                    readOnly={readOnly}
                    activeBinding={activeBinding}
                    onActivateBinding={setActiveBinding}
                    onDuplicate={handleDuplicateSelected}
                    pathSuggestions={suggestions}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="border-b border-border/50 px-4 py-3 text-left">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <span>Element Settings</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Select an element on the canvas to open its settings.</p>
                </div>
                <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-muted-foreground">
                  Select an element on the canvas to edit its content, data, and appearance.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}




