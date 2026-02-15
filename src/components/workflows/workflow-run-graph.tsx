"use client";

import * as React from "react";
import {
  Bot,
  Bell,
  BrainCircuit,
  CirclePlay,
  GitBranch,
  Layers,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  ZoomIn,
  ZoomOut,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDurationMs, type WorkflowGraphEdge, type WorkflowGraphNode, type WorkflowNodeKind } from "@/lib/workflow-view-model";

const CARD_WIDTH = 240;
const CARD_HEIGHT = 116;
const MIN_CANVAS_HEIGHT = 520;
const LAYOUT_HORIZONTAL_GAP = 36;
const LAYOUT_VERTICAL_GAP = 88;
const LAYOUT_PADDING_X = 44;
const LAYOUT_PADDING_Y = 52;

function nodePositionKey(node: WorkflowGraphNode): string {
  const key = String(node.nodeId || node.id || "").trim();
  return key || String(node.id);
}

function buildResponsivePositions(nodes: WorkflowGraphNode[], canvasWidth: number) {
  const out = new Map<string, { x: number; y: number }>();
  if (!nodes.length) return out;

  const innerWidth = Math.max(CARD_WIDTH, canvasWidth - (LAYOUT_PADDING_X * 2));
  const columns = Math.max(1, Math.floor((innerWidth + LAYOUT_HORIZONTAL_GAP) / (CARD_WIDTH + LAYOUT_HORIZONTAL_GAP)));

  let cursor = 0;
  let row = 0;
  while (cursor < nodes.length) {
    const itemsInRow = Math.min(columns, nodes.length - cursor);
    const rowWidth = (itemsInRow * CARD_WIDTH) + (Math.max(0, itemsInRow - 1) * LAYOUT_HORIZONTAL_GAP);
    const rowOffset = LAYOUT_PADDING_X + Math.max(0, Math.round((innerWidth - rowWidth) / 2));

    for (let col = 0; col < itemsInRow; col += 1) {
      const visualCol = row % 2 === 0 ? col : (itemsInRow - 1 - col);
      const node = nodes[cursor + col];
      out.set(node.id, {
        x: rowOffset + (visualCol * (CARD_WIDTH + LAYOUT_HORIZONTAL_GAP)),
        y: LAYOUT_PADDING_Y + (row * (CARD_HEIGHT + LAYOUT_VERTICAL_GAP)),
      });
    }

    cursor += itemsInRow;
    row += 1;
  }

  return out;
}

function iconForKind(kind: WorkflowNodeKind) {
  switch (kind) {
    case "trigger": return Sparkles;
    case "manual": return CirclePlay;
    case "human": return UserRound;
    case "ai": return Bot;
    case "condition": return GitBranch;
    case "transform": return BrainCircuit;
    case "notification": return Bell;
    case "system": return ShieldCheck;
    default: return Layers;
  }
}

function kindClass(kind: WorkflowNodeKind) {
  switch (kind) {
    case "trigger": return "from-amber-100 to-amber-200 text-amber-700";
    case "manual": return "from-blue-100 to-blue-200 text-blue-700";
    case "human": return "from-emerald-100 to-emerald-200 text-emerald-700";
    case "ai": return "from-violet-100 to-violet-200 text-violet-700";
    case "condition": return "from-pink-100 to-pink-200 text-pink-700";
    case "transform": return "from-cyan-100 to-cyan-200 text-cyan-700";
    case "notification": return "from-indigo-100 to-indigo-200 text-indigo-700";
    case "system": return "from-slate-100 to-slate-200 text-slate-700";
    default: return "from-zinc-100 to-zinc-200 text-zinc-700";
  }
}

function statusClass(status: string) {
  const key = String(status || "").toLowerCase();
  if (key === "succeeded") return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  if (key === "failed") return "bg-red-500/15 text-red-600 border-red-500/30";
  if (key === "running") return "bg-blue-500/15 text-blue-600 border-blue-500/30";
  if (key === "waiting") return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  if (key === "cancelled") return "bg-zinc-500/15 text-zinc-600 border-zinc-500/30";
  return "bg-zinc-500/10 text-zinc-600 border-zinc-500/20";
}

type Props = {
  title: string;
  subtitle?: string;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  showTechnicalMeta?: boolean;
  chromeless?: boolean;
  canvasClassName?: string;
};

export function WorkflowRunGraph({
  title,
  subtitle,
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  showTechnicalMeta = false,
  chromeless = false,
  canvasClassName,
}: Props) {
  const [scale, setScale] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [panning, setPanning] = React.useState(false);
  const [draggingNodeKey, setDraggingNodeKey] = React.useState<string | null>(null);
  const [manualNodePositions, setManualNodePositions] = React.useState<Record<string, { x: number; y: number }>>({});
  const [canvasSize, setCanvasSize] = React.useState({ width: 1280, height: 720 });
  const panDragRef = React.useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const nodeDragRef = React.useRef<{
    nodeKey: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;

    const applySize = () => {
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.max(320, Math.round(rect.width));
      const nextHeight = Math.max(MIN_CANVAS_HEIGHT, Math.round(rect.height));
      setCanvasSize((prev) => (
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      ));
    };

    applySize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => applySize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const autoPositions = React.useMemo(
    () => buildResponsivePositions(nodes, canvasSize.width),
    [canvasSize.width, nodes]
  );

  React.useEffect(() => {
    const activeKeys = new Set(nodes.map((node) => nodePositionKey(node)));
    setManualNodePositions((prev) => {
      let changed = false;
      const next: Record<string, { x: number; y: number }> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (activeKeys.has(key)) {
          next[key] = value;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [nodes]);

  const positionedNodes = React.useMemo(() => (
    nodes.map((node) => {
      const key = nodePositionKey(node);
      const auto = autoPositions.get(node.id) || node.position;
      return {
        ...node,
        position: manualNodePositions[key] || auto,
        positionKey: key,
      };
    })
  ), [autoPositions, manualNodePositions, nodes]);

  const positionedNodeById = React.useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node])),
    [positionedNodes]
  );

  const maxX = Math.max(0, ...positionedNodes.map((n) => n.position.x)) + CARD_WIDTH + LAYOUT_PADDING_X;
  const maxY = Math.max(0, ...positionedNodes.map((n) => n.position.y)) + CARD_HEIGHT + LAYOUT_PADDING_Y;
  const contentWidth = Math.max(canvasSize.width, maxX);
  const contentHeight = Math.max(canvasSize.height, maxY);

  const startNodeDrag = (event: React.MouseEvent<HTMLButtonElement>, nodeId: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const node = positionedNodeById.get(nodeId);
    if (!node) return;
    onSelectNode(nodeId);
    nodeDragRef.current = {
      nodeKey: node.positionKey,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.position.x,
      originY: node.position.y,
    };
    setDraggingNodeKey(node.positionKey);
  };

  const onMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-node-card='true']")) return;
    setPanning(true);
    panDragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (nodeDragRef.current) {
      const dx = (event.clientX - nodeDragRef.current.startX) / scale;
      const dy = (event.clientY - nodeDragRef.current.startY) / scale;
      const nextX = Math.max(12, Math.round(nodeDragRef.current.originX + dx));
      const nextY = Math.max(12, Math.round(nodeDragRef.current.originY + dy));
      const key = nodeDragRef.current.nodeKey;
      setManualNodePositions((prev) => {
        const current = prev[key];
        if (current?.x === nextX && current?.y === nextY) return prev;
        return {
          ...prev,
          [key]: { x: nextX, y: nextY },
        };
      });
      return;
    }

    if (!panning || !panDragRef.current) return;
    const dx = event.clientX - panDragRef.current.x;
    const dy = event.clientY - panDragRef.current.y;
    setPan({ x: panDragRef.current.panX + dx, y: panDragRef.current.panY + dy });
  };

  const onMouseUp = () => {
    nodeDragRef.current = null;
    setDraggingNodeKey(null);
    setPanning(false);
    panDragRef.current = null;
  };

  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
    transformOrigin: "0 0",
  } as React.CSSProperties;

  return (
    <div className={cn(chromeless ? "overflow-hidden h-full flex flex-col" : "rounded-lg border border-border/50 bg-card/60 overflow-hidden")}>
      <div className={cn(
        "flex items-center justify-between gap-3",
        chromeless ? "px-1 pb-2" : "px-3 py-2.5 border-b border-border/40"
      )}>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          {subtitle ? <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div> : null}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setScale((v) => Math.max(0.5, Number((v - 0.1).toFixed(2))))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <div className="text-[11px] text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setScale((v) => Math.min(2, Number((v + 0.1).toFixed(2))))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={resetView}>
            <RefreshCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className={cn(
          "relative overflow-hidden",
          chromeless ? "flex-1 min-h-[680px]" : "h-[520px]",
          canvasClassName,
          panning || Boolean(draggingNodeKey) ? "cursor-grabbing" : "cursor-grab"
        )}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div className="absolute inset-0 bg-background" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(120,120,120,0.12)_1px,transparent_0)] bg-[size:24px_24px] pointer-events-none" />

        <div className="absolute left-0 top-0" style={{ ...transformStyle, width: contentWidth, height: contentHeight }}>
          <svg width={contentWidth} height={contentHeight} className="absolute left-0 top-0 pointer-events-none">
            {edges.map((edge) => {
              const from = positionedNodeById.get(edge.from);
              const to = positionedNodeById.get(edge.to);
              if (!from || !to) return null;
              const x1 = from.position.x + CARD_WIDTH;
              const y1 = from.position.y + CARD_HEIGHT / 2;
              const x2 = to.position.x;
              const y2 = to.position.y + CARD_HEIGHT / 2;
              const mid = (x1 + x2) / 2;
              const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
              return (
                <path
                  key={edge.id}
                  d={d}
                  fill="none"
                  stroke={edge.active ? "#5e6ad2" : "rgba(120,120,120,0.4)"}
                  strokeWidth={edge.active ? 2.5 : 2}
                  strokeDasharray={edge.active ? "7 4" : undefined}
                />
              );
            })}
          </svg>

          {positionedNodes.map((node) => {
            const Icon = iconForKind(node.kind);
            const selected = selectedNodeId === node.id;
            const nodeStatus = String(node.status || "pending").toLowerCase();
            const isActive = nodeStatus === "running" || nodeStatus === "waiting";
            return (
              <button
                key={node.id}
                data-node-card="true"
                type="button"
                onMouseDown={(event) => startNodeDrag(event, node.id)}
                onClick={() => onSelectNode(node.id)}
                className={cn(
                  "absolute rounded-xl border p-3 text-left transition-all",
                  selected
                    ? "border-primary/60 bg-card shadow-[0_10px_28px_rgba(15,23,42,0.18)] dark:shadow-[0_14px_30px_rgba(0,0,0,0.55)]"
                    : "border-border/70 bg-card hover:bg-card shadow-[0_2px_6px_rgba(15,23,42,0.10)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.40)]",
                  isActive ? "ring-2 ring-blue-400/35 shadow-blue-500/20" : "",
                  draggingNodeKey && draggingNodeKey === node.positionKey ? "cursor-grabbing" : "cursor-grab"
                )}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                }}
              >
                <div className="flex items-start gap-2">
                  <div className={cn("h-9 w-9 rounded-lg bg-gradient-to-b flex items-center justify-center shrink-0", kindClass(node.kind))}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" title={node.label}>{node.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate" title={node.nodeType}>
                      {showTechnicalMeta ? (node.nodeType || node.nodeId) : "Click to inspect"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", statusClass(String(node.status || "pending")))}>
                    {isActive ? <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" /> : null}
                    {String(node.status || "pending")}
                  </Badge>
                  <div className="text-[11px] text-muted-foreground">{formatDurationMs(node.durationMs)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
