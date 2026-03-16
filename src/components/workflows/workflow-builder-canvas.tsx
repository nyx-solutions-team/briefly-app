"use client";

import * as React from "react";
import { Link2, Plus, RefreshCcw, Trash2, Unplug, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { friendlyNodeLabel, normalizeNodeType } from "@/lib/workflow-view-model";

type StepNode = Record<string, any>;

type EdgeWhen = {
  type?: "always" | "route" | "status" | "expression";
  equals?: string;
  in?: string[];
  expression?: string;
};

export type BuilderCanvasEdge = {
  id: string;
  from: string;
  to: string;
  when?: EdgeWhen | null;
};

type Props = {
  schemaVersion: 1 | 2;
  nodes: StepNode[];
  edges: BuilderCanvasEdge[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onInsertAt: (index: number) => void;
  onDelete: (index: number) => void;
  onPatchNodePosition: (index: number, position: { x: number; y: number }) => void;
  onConnectNodes: (fromNodeId: string, toNodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
};

const CARD_WIDTH = 256;
const CARD_HEIGHT = 124;
const MIN_CANVAS_HEIGHT = 560;
const PADDING_X = 56;
const PADDING_Y = 56;
const GRID_SIZE = 24;

function safeNodeId(node: StepNode, index: number): string {
  return String(node?.id || `step_${index + 1}`).trim() || `step_${index + 1}`;
}

function getNodePosition(node: StepNode, index: number): { x: number; y: number } {
  const metadata = node?.metadata && typeof node.metadata === "object" ? node.metadata : {};
  const ui = metadata?.ui && typeof metadata.ui === "object" ? metadata.ui : {};
  const x = Number(ui?.x);
  const y = Number(ui?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return {
      x: Math.max(12, Math.round(x)),
      y: Math.max(12, Math.round(y)),
    };
  }

  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: PADDING_X + (col * (CARD_WIDTH + 68)),
    y: PADDING_Y + (row * (CARD_HEIGHT + 102)),
  };
}

function buildSequentialEdges(nodes: StepNode[]): BuilderCanvasEdge[] {
  const next: BuilderCanvasEdge[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const fromId = safeNodeId(nodes[index], index);
    const toId = safeNodeId(nodes[index + 1], index + 1);
    next.push({
      id: `${fromId}__${toId}__${index + 1}`,
      from: fromId,
      to: toId,
      when: { type: "always" },
    });
  }
  return next;
}

function readEdgeType(edge: BuilderCanvasEdge): string {
  const key = String(edge?.when?.type || "always").toLowerCase();
  if (key === "route") return "route";
  if (key === "status") return "status";
  if (key === "expression") return "expression";
  return "always";
}

export function WorkflowBuilderCanvas({
  schemaVersion,
  nodes,
  edges,
  selectedIndex,
  onSelect,
  onInsertAt,
  onDelete,
  onPatchNodePosition,
  onConnectNodes,
  onDeleteEdge,
}: Props) {
  const [scale, setScale] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [panning, setPanning] = React.useState(false);
  const [draggingNodeId, setDraggingNodeId] = React.useState<string | null>(null);
  const [dragPositionPreview, setDragPositionPreview] = React.useState<Record<string, { x: number; y: number }>>({});
  const [canvasSize, setCanvasSize] = React.useState({ width: 1280, height: 720 });
  const [connectMode, setConnectMode] = React.useState(false);
  const [connectFromNodeId, setConnectFromNodeId] = React.useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(null);

  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const panDragRef = React.useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const nodeDragRef = React.useRef<{
    nodeId: string;
    index: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  React.useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;

    const applySize = () => {
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.max(360, Math.round(rect.width));
      const nextHeight = Math.max(MIN_CANVAS_HEIGHT, Math.round(rect.height));
      setCanvasSize((prev) => (prev.width === nextWidth && prev.height === nextHeight
        ? prev
        : { width: nextWidth, height: nextHeight }));
    };

    applySize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => applySize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const positionedNodes = React.useMemo(() => {
    return nodes.map((node, index) => {
      const nodeId = safeNodeId(node, index);
      const position = dragPositionPreview[nodeId] || getNodePosition(node, index);
      const nodeType = normalizeNodeType(node?.node_type || node?.node_ref?.key || node?.nodeRef?.key || "");
      return {
        index,
        nodeId,
        nodeType,
        label: friendlyNodeLabel(nodeType),
        position,
      };
    });
  }, [dragPositionPreview, nodes]);

  const nodeById = React.useMemo(() => new Map(positionedNodes.map((item) => [item.nodeId, item])), [positionedNodes]);

  const visibleEdges = React.useMemo(
    () => (schemaVersion === 2 ? edges : buildSequentialEdges(nodes)),
    [edges, nodes, schemaVersion]
  );

  React.useEffect(() => {
    if (!selectedEdgeId) return;
    if (visibleEdges.some((edge) => edge.id === selectedEdgeId)) return;
    setSelectedEdgeId(null);
  }, [selectedEdgeId, visibleEdges]);

  const maxX = Math.max(0, ...positionedNodes.map((node) => node.position.x)) + CARD_WIDTH + PADDING_X;
  const maxY = Math.max(0, ...positionedNodes.map((node) => node.position.y)) + CARD_HEIGHT + PADDING_Y;
  const contentWidth = Math.max(canvasSize.width, maxX);
  const contentHeight = Math.max(canvasSize.height, maxY);

  const onMouseDownCanvas = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-node-card='true']")) return;
    setPanning(true);
    panDragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMoveCanvas = (event: React.MouseEvent<HTMLDivElement>) => {
    if (nodeDragRef.current) {
      const dx = (event.clientX - nodeDragRef.current.startX) / scale;
      const dy = (event.clientY - nodeDragRef.current.startY) / scale;
      const nextX = Math.max(12, Math.round(nodeDragRef.current.originX + dx));
      const nextY = Math.max(12, Math.round(nodeDragRef.current.originY + dy));
      const nodeId = nodeDragRef.current.nodeId;
      setDragPositionPreview((prev) => {
        const current = prev[nodeId];
        if (current?.x === nextX && current?.y === nextY) return prev;
        return {
          ...prev,
          [nodeId]: { x: nextX, y: nextY },
        };
      });
      return;
    }

    if (!panning || !panDragRef.current) return;
    const dx = event.clientX - panDragRef.current.x;
    const dy = event.clientY - panDragRef.current.y;
    setPan({
      x: panDragRef.current.panX + dx,
      y: panDragRef.current.panY + dy,
    });
  };

  const onMouseUpCanvas = () => {
    if (nodeDragRef.current) {
      const { index, nodeId } = nodeDragRef.current;
      const nextPosition = dragPositionPreview[nodeId];
      if (nextPosition) onPatchNodePosition(index, nextPosition);
      setDragPositionPreview((prev) => {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      });
    }
    nodeDragRef.current = null;
    setDraggingNodeId(null);
    setPanning(false);
    panDragRef.current = null;
  };

  const startNodeDrag = (event: React.MouseEvent<HTMLDivElement>, nodeId: string, index: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const node = nodeById.get(nodeId);
    if (!node) return;
    nodeDragRef.current = {
      nodeId,
      index,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.position.x,
      originY: node.position.y,
    };
    setDraggingNodeId(nodeId);
  };

  const onNodeCardClick = (nodeId: string, index: number) => {
    if (connectMode && schemaVersion === 2) {
      if (!connectFromNodeId) {
        setConnectFromNodeId(nodeId);
        onSelect(index);
        return;
      }
      if (connectFromNodeId === nodeId) {
        setConnectFromNodeId(null);
        return;
      }
      onConnectNodes(connectFromNodeId, nodeId);
      setConnectFromNodeId(nodeId);
      onSelect(index);
      return;
    }
    onSelect(index);
  };

  const onAutoLayout = () => {
    nodes.forEach((_, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      onPatchNodePosition(index, {
        x: PADDING_X + (col * (CARD_WIDTH + 68)),
        y: PADDING_Y + (row * (CARD_HEIGHT + 102)),
      });
    });
    setPan({ x: 0, y: 0 });
    setScale(1);
  };

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
    transformOrigin: "0 0",
  } as React.CSSProperties;

  return (
    <div className="rounded-lg border border-border/50 bg-card/60 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Graph Canvas</div>
          <div className="text-[11px] text-muted-foreground">
            {nodes.length} node{nodes.length === 1 ? "" : "s"} · {visibleEdges.length} edge{visibleEdges.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px]">schema v{schemaVersion}</Badge>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Zoom out" onClick={() => setScale((v) => Math.max(0.5, Number((v - 0.1).toFixed(2))))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <div className="text-[11px] text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</div>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Zoom in" onClick={() => setScale((v) => Math.min(2, Number((v + 0.1).toFixed(2))))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Reset view" onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}>
            <RefreshCcw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" title="Add node" onClick={() => onInsertAt(nodes.length)}>
            <Plus className="h-3.5 w-3.5" />
            Add Node
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onAutoLayout}>
            Auto Layout
          </Button>
          {schemaVersion === 2 ? (
            <Button
              size="sm"
              variant={connectMode ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => {
                setConnectMode((prev) => !prev);
                setConnectFromNodeId(null);
              }}
            >
              {connectMode ? <Unplug className="h-3.5 w-3.5 mr-1" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
              {connectMode ? "Stop Connect" : "Connect"}
            </Button>
          ) : null}
          {schemaVersion === 2 && selectedEdgeId ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-[11px]"
              onClick={() => {
                onDeleteEdge(selectedEdgeId);
                setSelectedEdgeId(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Edge
            </Button>
          ) : null}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border/30 text-[11px] text-muted-foreground flex items-center justify-between">
        <div>
          Drag nodes to place them freely. Pan empty space to move the canvas.
        </div>
        {connectMode && schemaVersion === 2 ? (
          <div className="font-mono text-[10px]">
            {connectFromNodeId ? `from: ${connectFromNodeId} -> click target` : "click source node"}
          </div>
        ) : null}
      </div>

      <div
        ref={canvasRef}
        className={cn(
          "relative h-[640px] overflow-hidden",
          panning || Boolean(draggingNodeId) ? "cursor-grabbing" : "cursor-grab"
        )}
        onMouseDown={onMouseDownCanvas}
        onMouseMove={onMouseMoveCanvas}
        onMouseUp={onMouseUpCanvas}
        onMouseLeave={onMouseUpCanvas}
      >
        <div className="absolute inset-0 bg-background" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(rgba(120,120,120,0.12) 1px, transparent 0)", backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px` }}
        />
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="pointer-events-auto rounded-lg border border-border/50 bg-card/90 p-4 text-center shadow-sm"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="text-sm font-medium">No nodes yet</div>
              <div className="text-xs text-muted-foreground mt-1">
                Add your first node to start building this workflow.
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 h-8 gap-1.5"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onInsertAt(0);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add First Node
              </Button>
            </div>
          </div>
        ) : null}

        <div className="absolute left-0 top-0" style={{ ...transformStyle, width: contentWidth, height: contentHeight }}>
          <svg width={contentWidth} height={contentHeight} className="absolute left-0 top-0">
            {visibleEdges.map((edge) => {
              const from = nodeById.get(String(edge.from || ""));
              const to = nodeById.get(String(edge.to || ""));
              if (!from || !to) return null;
              const x1 = from.position.x + CARD_WIDTH;
              const y1 = from.position.y + (CARD_HEIGHT / 2);
              const x2 = to.position.x;
              const y2 = to.position.y + (CARD_HEIGHT / 2);
              const mid = Math.round((x1 + x2) / 2);
              const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
              const selected = selectedEdgeId === edge.id;
              return (
                <g key={edge.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={selected ? "#4f46e5" : "rgba(120,120,120,0.55)"}
                    strokeWidth={selected ? 3 : 2}
                    className="cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (schemaVersion !== 2) return;
                      setSelectedEdgeId(edge.id);
                    }}
                  />
                  <text
                    x={mid}
                    y={Math.round((y1 + y2) / 2) - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill={selected ? "#4f46e5" : "rgba(113,113,122,0.95)"}
                    className="pointer-events-none"
                  >
                    {readEdgeType(edge)}
                  </text>
                </g>
              );
            })}
          </svg>

          {positionedNodes.map((node) => {
            const selected = selectedIndex === node.index;
            const isConnectSource = connectFromNodeId === node.nodeId;
            return (
              <div
                key={node.nodeId}
                data-node-card="true"
                role="button"
                tabIndex={0}
                onMouseDown={(event) => startNodeDrag(event, node.nodeId, node.index)}
                onClick={(event) => {
                  event.stopPropagation();
                  onNodeCardClick(node.nodeId, node.index);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onNodeCardClick(node.nodeId, node.index);
                }}
                className={cn(
                  "absolute rounded-xl border p-3 text-left transition-all",
                  selected ? "border-primary/60 bg-card shadow-[0_10px_28px_rgba(15,23,42,0.18)]" : "border-border/60 bg-card hover:bg-card",
                  isConnectSource ? "ring-2 ring-indigo-400/45" : "",
                  connectMode && schemaVersion === 2 ? "cursor-crosshair" : (draggingNodeId === node.nodeId ? "cursor-grabbing" : "cursor-grab")
                )}
                style={{
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  left: node.position.x,
                  top: node.position.y,
                }}
                title={`${node.nodeId} (${node.nodeType || "unknown"})`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{node.nodeId}</div>
                    <div className="text-xs text-muted-foreground truncate">{node.label}</div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-1 truncate">
                      {node.nodeType || "node type missing"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive shrink-0"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(node.index);
                    }}
                    title="Delete node"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    idx {node.index + 1}
                  </Badge>
                  {schemaVersion === 2 ? (
                    <Badge variant="outline" className="text-[10px]">
                      drag + connect
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      linear mode
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
