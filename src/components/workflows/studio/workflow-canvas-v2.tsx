"use client";

import * as React from "react";
import {
  Archive,
  Bot,
  Database,
  FileText,
  FolderClosed,
  Maximize,
  Minimize,
  Play,
  Search,
  Shield,
  Split,
  Undo2,
  Redo2,
  Upload,
  UserPlus,
  Wand2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WorkflowNodeCard } from "./workflow-node";
import { WorkflowNode, WorkflowEdge } from "./types";

export type { WorkflowNode, WorkflowEdge };

type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

type ConnectionState = {
  isConnecting: boolean;
  sourceNodeId: string | null;
  sourceHandle: string | null;
  currentMousePos: { x: number; y: number } | null;
};

type ConnectionGuardResult = {
  allow: boolean;
  level?: "warning" | "error" | "info";
  message?: string;
  suggestions?: string[];
};

const FLOW_HANDLE_TOP_Y = 113;
const FLOW_HANDLE_GAP_Y = 34;
const HUMAN_HANDLE_TOP_Y = 113;
const HUMAN_HANDLE_GAP_Y = 34;

function normalizeIfElseHandle(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (["true", "1", "yes", "y", "pass", "approved", "approve"].includes(normalized)) return "true";
  if (["false", "0", "no", "n", "fail", "rejected", "reject"].includes(normalized)) return "false";
  return normalized;
}

interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<WorkflowEdge[]>>;
  selectedNodeId: string | null;
  highlightedNodeId?: string | null;
  focusRequest?: { nodeId: string; token: number } | null;
  setSelectedNodeId: (id: string | null) => void;
  nodeReadinessById?: Record<string, { missing: string[]; ready: boolean }>;
  viewMode?: "build" | "run";
  nodeStatusById?: Record<string, string>;
  onConnectionGuard?: (sourceNodeId: string, targetNodeId: string, sourceHandle?: string | null) => ConnectionGuardResult;
  onConnectionFeedback?: (result: ConnectionGuardResult) => void;
  onConnectNodes?: (
    sourceNodeId: string,
    targetNodeId: string,
    sourceHandle?: string | null,
    nextEdges?: WorkflowEdge[]
  ) => void;
}

const STYLE_BY_TYPE: Record<string, { icon: React.ReactNode; color: string }> = {
  trigger: {
    icon: <Play className="w-5 h-5 text-zinc-500" />,
    color: "border-zinc-500/10 shadow-zinc-500/5 group-hover:border-zinc-500/30",
  },
  ai: {
    icon: <Bot className="w-5 h-5 text-primary" />,
    color: "border-primary/10 shadow-primary/5 group-hover:border-primary/30",
  },
  records: {
    icon: <FolderClosed className="w-5 h-5 text-sky-500" />,
    color: "border-sky-500/10 shadow-sky-500/5 group-hover:border-sky-500/30",
  },
  retrieval: {
    icon: <Search className="w-5 h-5 text-blue-500" />,
    color: "border-blue-500/10 shadow-blue-500/5 group-hover:border-blue-500/30",
  },
  document: {
    icon: <FileText className="w-5 h-5 text-indigo-500" />,
    color: "border-indigo-500/10 shadow-indigo-500/5 group-hover:border-indigo-500/30",
  },
  file: {
    icon: <Archive className="w-5 h-5 text-teal-500" />,
    color: "border-teal-500/10 shadow-teal-500/5 group-hover:border-teal-500/30",
  },
  checks: {
    icon: <Shield className="w-5 h-5 text-emerald-500" />,
    color: "border-emerald-500/10 shadow-emerald-500/5 group-hover:border-emerald-500/30",
  },
  flow: {
    icon: <Split className="w-5 h-5 text-orange-500" />,
    color: "border-orange-500/10 shadow-orange-500/5 group-hover:border-orange-500/30",
  },
  human: {
    icon: <UserPlus className="w-5 h-5 text-pink-500" />,
    color: "border-pink-500/10 shadow-pink-500/5 group-hover:border-pink-500/30",
  },
  output: {
    icon: <Upload className="w-5 h-5 text-cyan-500" />,
    color: "border-cyan-500/10 shadow-cyan-500/5 group-hover:border-cyan-500/30",
  },
  utilities: {
    icon: <Wand2 className="w-5 h-5 text-violet-500" />,
    color: "border-violet-500/10 shadow-violet-500/5 group-hover:border-violet-500/30",
  },
  audit: {
    icon: <Database className="w-5 h-5 text-slate-500" />,
    color: "border-slate-500/10 shadow-slate-500/5 group-hover:border-slate-500/30",
  },
  note: {
    icon: <FileText className="w-5 h-5 text-amber-500" />,
    color: "border-amber-500/10 shadow-amber-500/5 group-hover:border-amber-500/30",
  },
  end: {
    icon: <Archive className="w-5 h-5 text-rose-500" />,
    color: "border-rose-500/10 shadow-rose-500/5 group-hover:border-rose-500/30",
  },
};

const DEFAULT_MODES: Record<string, string> = {
  trigger: "manual",
  ai: "generate",
  records: "list_folder",
  retrieval: "internal",
  document: "create",
  file: "move",
  checks: "validate",
  flow: "if_else",
  human: "review",
  output: "export_csv",
  utilities: "delay",
  audit: "event",
  note: "note",
  end: "end",
};

const MODE_TO_NODE_KEY: Record<string, Record<string, string>> = {
  trigger: { manual: "manual.trigger" },
  ai: { generate: "ai.prompt", extract: "ai.extract", classify: "ai.classify" },
  records: { list_folder: "dms.list_folder", read_document: "dms.read_document" },
  retrieval: { internal: "search.internal" },
  document: { create: "dms.create_document", update: "dms.update_document" },
  file: { move: "dms.move_document", set_metadata: "dms.set_metadata" },
  checks: { validate: "system.validate", reconcile: "system.reconcile", packet_check: "system.packet_check" },
  flow: { if_else: "flow.branch", router: "flow.route", for_each: "flow.for_each", merge_results: "flow.aggregate" },
  human: { review: "human.review", approval: "human.approval", checklist: "human.checklist", task: "human.task" },
  output: { export_csv: "artifact.export_csv" },
  utilities: { delay: "flow.delay", transform: "flow.transform", function: "flow.function", state: "flow.state" },
  audit: { event: "system.audit_event" },
};

function defaultConfig(type: string, mode: string): Record<string, any> {
  if (type === "flow" && mode === "if_else") {
    return { expression: "", true_label: "True", false_label: "False", truthy_values: ["true", "yes", "1"] };
  }
  if (type === "flow" && mode === "router") {
    return {
      route_key: "",
      routes: [{ id: "route_1", key: "finance", label: "Finance" }, { id: "route_2", key: "ops", label: "Operations" }],
      default_route: "default",
    };
  }
  if (type === "human" && mode === "checklist") {
    return {
      title: "Checklist task",
      assignee: { type: "role", value: "orgAdmin" },
      checklist_items: ["Validate docs", "Confirm fields", "Submit decision"],
    };
  }
  if (type === "note") return { content: "Add your note" };
  if (type === "end") return { final_status: "completed" };
  return {};
}

function buildDefaultData(type: string): Record<string, any> {
  const mode = DEFAULT_MODES[type] || "default";
  if (type === "note" || type === "end") {
    return { mode, config: defaultConfig(type, mode), enabled: true };
  }

  return {
    mode,
    node_ref: {
      key: MODE_TO_NODE_KEY[type]?.[mode] || null,
    },
    config: defaultConfig(type, mode),
    input_bindings: {},
    on_error: "fail_fast",
    join: "all",
    metadata: { ui: {} },
    enabled: true,
  };
}

function nextAutoNodeLabel(baseLabel: string, nodes: WorkflowNode[]): string {
  const base = String(baseLabel || "Step").trim() || "Step";
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numbered = new RegExp(`^${escaped}\\s+(\\d+)$`);
  let maxSeen = 0;

  for (const node of nodes) {
    const current = String(node.label || "").trim();
    if (!current) continue;
    if (current === base) {
      maxSeen = Math.max(maxSeen, 1);
      continue;
    }
    const match = current.match(numbered);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n)) maxSeen = Math.max(maxSeen, n);
  }

  if (maxSeen === 0) return base;
  return `${base} ${maxSeen + 1}`;
}

function getFlowHandles(node: WorkflowNode): string[] {
  if (node.type !== "flow") return [];
  const mode = String(node.data?.mode || "");
  const config = node.data?.config || {};

  if (mode === "if_else") return ["true", "false"];

  if (mode === "router") {
    const routes = Array.isArray(config.routes) ? config.routes : [];
    const routeKeys = routes
      .map((route: any, index: number) => String(route?.key || route?.id || `route_${index + 1}`))
      .filter(Boolean);
    return routeKeys.length > 0 ? [...routeKeys, "default"] : ["route_1", "default"];
  }

  return [];
}

function getHumanHandles(node: WorkflowNode): string[] {
  if (node.type !== "human") return [];
  const mode = String(node.data?.mode || "");
  if (mode === "review" || mode === "approval") return ["approve", "reject"];
  return [];
}

export function WorkflowCanvasV2({
  nodes,
  edges,
  setNodes,
  setEdges,
  selectedNodeId,
  highlightedNodeId = null,
  focusRequest = null,
  setSelectedNodeId,
  nodeReadinessById,
  onConnectionGuard,
  onConnectionFeedback,
  onConnectNodes,
  viewMode = "build",
  nodeStatusById = {},
}: WorkflowCanvasProps) {
  const [viewport, setViewport] = React.useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = React.useState(false);
  const [draggingNode, setDraggingNode] = React.useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = React.useState<string | null>(null);
  const [connection, setConnection] = React.useState<ConnectionState>({
    isConnecting: false,
    sourceNodeId: null,
    sourceHandle: null,
    currentMousePos: null,
  });

  const containerRef = React.useRef<HTMLDivElement>(null);
  const lastMousePos = React.useRef({ x: 0, y: 0 });
  const connectionRef = React.useRef(connection);
  connectionRef.current = connection;

  React.useEffect(() => {
    if (!focusRequest?.nodeId) return;
    const node = nodes.find((entry) => entry.id === focusRequest.nodeId);
    const container = containerRef.current;
    if (!node || !container) return;
    const rect = container.getBoundingClientRect();
    const nodeCenterX = node.position.x + 95;
    const nodeCenterY = node.position.y + 70;
    const nextX = rect.width / 2 - nodeCenterX * viewport.zoom;
    const nextY = rect.height / 2 - nodeCenterY * viewport.zoom;
    setViewport((prev) => ({ ...prev, x: nextX, y: nextY }));
  }, [focusRequest?.token, focusRequest?.nodeId, nodes, viewport.zoom]);

  const connectNodes = React.useCallback(
    (sourceNodeId: string, targetNodeId: string, sourceHandle?: string | null) => {
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
      const guardResult = onConnectionGuard
        ? onConnectionGuard(sourceNodeId, targetNodeId, sourceHandle || null)
        : { allow: true };
      if (!guardResult.allow) {
        onConnectionFeedback?.(guardResult);
        return;
      }
      const normalizedHandle = sourceHandle || undefined;
      const exists = edges.some(
        (edge) => edge.from === sourceNodeId && edge.to === targetNodeId && edge.sourceHandle === normalizedHandle
      );
      if (exists) return;

      const newEdge: WorkflowEdge = {
        id: `e-${Date.now()}`,
        from: sourceNodeId,
        to: targetNodeId,
        sourceHandle: normalizedHandle,
      };
      let nextEdgesSnapshot: WorkflowEdge[] = [];
      setEdges((prev) => {
        nextEdgesSnapshot = [...prev, newEdge];
        return nextEdgesSnapshot;
      });
      if (guardResult.message) onConnectionFeedback?.(guardResult);
      onConnectNodes?.(sourceNodeId, targetNodeId, sourceHandle || null, nextEdgesSnapshot);
    },
    [edges, onConnectionFeedback, onConnectionGuard, onConnectNodes, setEdges]
  );

  const onContainerPointerDown = (e: React.PointerEvent) => {
    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      setSelectedNodeId(null);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      const delta = -e.deltaY * zoomSensitivity;
      const newZoom = Math.min(Math.max(viewport.zoom + delta, 0.2), 3);
      setViewport((prev) => ({ ...prev, zoom: newZoom }));
    } else {
      setViewport((prev) => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (viewMode === "run") {
      // In run mode, clicks only select — no dragging
      setSelectedNodeId(id);
      return;
    }
    if (e.button === 0) {
      e.preventDefault();
      setDraggingNode(id);
      setSelectedNodeId(id);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPortPointerDown = (e: React.PointerEvent, nodeId: string, handleId?: string) => {
    e.stopPropagation();
    e.preventDefault();
    // Connecting is only allowed in build mode
    if (viewMode === "run") return;

    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId);
    }

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    const worldX = (mouseX - viewport.x) / viewport.zoom;
    const worldY = (mouseY - viewport.y) / viewport.zoom;

    setConnection({
      isConnecting: true,
      sourceNodeId: nodeId,
      sourceHandle: handleId || null,
      currentMousePos: { x: worldX, y: worldY },
    });
    setSelectedNodeId(nodeId);
  };

  const onPortPointerUp = React.useCallback(
    (e: React.PointerEvent, targetNodeId: string) => {
      e.stopPropagation();
      const conn = connectionRef.current;
      if (conn.isConnecting && conn.sourceNodeId && conn.sourceNodeId !== targetNodeId) {
        connectNodes(conn.sourceNodeId, targetNodeId, conn.sourceHandle);
      }
      setConnection({ isConnecting: false, sourceNodeId: null, sourceHandle: null, currentMousePos: null });
    },
    [connectNodes]
  );

  const deleteNode = (id: string) => {
    if (viewMode === "run") return;
    setNodes((prev) => prev.filter((node) => node.id !== id));
    setEdges((prev) => prev.filter((edge) => edge.from !== id && edge.to !== id));
  };

  const getPortPosition = (node: WorkflowNode, handleId?: string) => {
    const x = node.position.x + 190;
    let y = node.position.y + 42;

    const flowHandles = getFlowHandles(node);
    if (flowHandles.length > 0) {
      const mode = String(node.data?.mode || "").trim().toLowerCase();
      let index = 0;
      if (mode === "if_else") {
        index = normalizeIfElseHandle(handleId) === "false" ? 1 : 0;
      } else if (handleId) {
        const normalized = String(handleId || "").trim();
        const direct = flowHandles.indexOf(normalized);
        const insensitive = flowHandles.findIndex((entry) => entry.toLowerCase() === normalized.toLowerCase());
        index = Math.max(0, direct >= 0 ? direct : insensitive);
      }
      y = node.position.y + FLOW_HANDLE_TOP_Y + index * FLOW_HANDLE_GAP_Y;
      return { x, y };
    }

    const humanHandles = getHumanHandles(node);
    if (humanHandles.length > 0) {
      const index = handleId ? Math.max(0, humanHandles.indexOf(handleId)) : 0;
      y = node.position.y + HUMAN_HANDLE_TOP_Y + index * HUMAN_HANDLE_GAP_Y;
      return { x, y };
    }

    return { x, y };
  };

  const calculateCurve = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = Math.abs(y2 - y1);
    // Horizontal control-handle length: at least 80px, scales with horizontal and vertical distance
    const hx = Math.max(Math.abs(dx) * 0.5, dy * 0.4, 80);
    // Control points exit horizontally from both ports for natural S-curve feel
    const cx1 = x1 + hx;
    const cy1 = y1;
    const cx2 = x2 - hx;
    const cy2 = y2;
    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  };

  const getEdgePath = (from: WorkflowNode, to: WorkflowNode, sourceHandle?: string) => {
    const start = getPortPosition(from, sourceHandle);
    const x1 = start.x;
    const y1 = start.y;

    const x2 = to.position.x;
    const y2 = to.position.y + 50;
    return calculateCurve(x1, y1, x2, y2);
  };

  const disconnectEdge = React.useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((edge) => edge.id !== edgeId));
  }, [setEdges]);

  const getConnectionLinePath = () => {
    if (!connection.isConnecting || !connection.sourceNodeId || !connection.currentMousePos) return "";

    const sourceNode = nodes.find((node) => node.id === connection.sourceNodeId);
    if (!sourceNode) return "";

    const start = getPortPosition(sourceNode, connection.sourceHandle || undefined);
    return calculateCurve(start.x, start.y, connection.currentMousePos.x, connection.currentMousePos.y);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();

    const label = e.dataTransfer.getData("application/label");
    const type = e.dataTransfer.getData("application/reactflow") || "default";
    if (!label) return;

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const position = {
      x: (e.clientX - containerRect.left - viewport.x) / viewport.zoom,
      y: (e.clientY - containerRect.top - viewport.y) / viewport.zoom,
    };

    const style = STYLE_BY_TYPE[type] || {
      icon: <Zap className="w-5 h-5 text-muted-foreground" />,
      color: "border-border/50 shadow-sm",
    };

    const uniqueLabel = nextAutoNodeLabel(label, nodes);
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type,
      label: uniqueLabel,
      icon: style.icon,
      position,
      color: style.color,
      data: buildDefaultData(type),
    };

    setNodes((prev) => [...prev, newNode]);
  };

  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsPanning(false);
      setDraggingNode(null);
      setConnection({ isConnecting: false, sourceNodeId: null, sourceHandle: null, currentMousePos: null });
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  React.useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      if (isPanning) {
        setViewport((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        return;
      }

      if (draggingNode) {
        const zoomDx = dx / viewport.zoom;
        const zoomDy = dy / viewport.zoom;
        setNodes((prev) =>
          prev.map((node) => {
            if (node.id !== draggingNode) return node;
            return {
              ...node,
              position: {
                x: node.position.x + zoomDx,
                y: node.position.y + zoomDy,
              },
            };
          })
        );
        return;
      }

      if (connection.isConnecting) {
        const worldX = (mouseX - viewport.x) / viewport.zoom;
        const worldY = (mouseY - viewport.y) / viewport.zoom;
        setConnection((prev) => ({ ...prev, currentMousePos: { x: worldX, y: worldY } }));
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      setIsPanning(false);
      setDraggingNode(null);

      if (connectionRef.current.isConnecting && connectionRef.current.sourceNodeId) {
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        const inputPort = elements
          .map((element) => (element as HTMLElement).closest<HTMLElement>("[data-port-type='input'][data-node-id]"))
          .find((element): element is HTMLElement => Boolean(element));

        if (inputPort) {
          const targetNodeId = inputPort.getAttribute("data-node-id");
          if (targetNodeId && targetNodeId !== connectionRef.current.sourceNodeId) {
            connectNodes(
              connectionRef.current.sourceNodeId,
              targetNodeId,
              connectionRef.current.sourceHandle
            );
          }
        }
      }

      setConnection({ isConnecting: false, sourceNodeId: null, sourceHandle: null, currentMousePos: null });

      if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
        containerRef.current.releasePointerCapture(e.pointerId);
      }
    };

    const handlePointerCancel = () => {
      setIsPanning(false);
      setDraggingNode(null);
      setConnection({ isConnecting: false, sourceNodeId: null, sourceHandle: null, currentMousePos: null });
    };

    if (isPanning || draggingNode || connection.isConnecting) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
      window.addEventListener("blur", handlePointerCancel);
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("blur", handlePointerCancel);
    };
  }, [isPanning, draggingNode, connection.isConnecting, viewport, setNodes, connectNodes]);

  return (
    <div
      ref={containerRef}
      className={cn("w-full h-full relative overflow-hidden bg-background select-none", isPanning ? "cursor-grabbing" : "cursor-default")}
      onPointerDown={onContainerPointerDown}
      onWheel={onWheel}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        <div
          className="absolute inset-[-200%] w-[500%] h-[500%] pointer-events-none opacity-20"
          style={{
            backgroundImage: "radial-gradient(currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
            color: "var(--primary)",
          }}
        />

        <svg className="absolute inset-0 w-full h-full overflow-visible z-0">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--foreground) / 0.75)" />
            </marker>
            <marker id="arrowhead-active" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const fromNode = nodes.find((node) => node.id === edge.from);
            const toNode = nodes.find((node) => node.id === edge.to);
            if (!fromNode || !toNode) return null;

            const path = getEdgePath(fromNode, toNode, edge.sourceHandle);
            const isHovered = viewMode === "build" && hoveredEdgeId === edge.id;

            return (
              <g key={edge.id}>
                <path
                  d={path}
                  stroke={isHovered ? "hsl(var(--destructive) / 0.95)" : "hsl(var(--foreground) / 0.72)"}
                  strokeWidth={isHovered ? "3.2" : "2.5"}
                  fill="none"
                  markerEnd="url(#arrowhead)"
                  pointerEvents="none"
                />
                {viewMode === "build" && (
                  <path
                    d={path}
                    stroke="transparent"
                    strokeWidth="14"
                    fill="none"
                    pointerEvents="stroke"
                    style={{ cursor: "pointer" }}
                    onPointerEnter={() => setHoveredEdgeId(edge.id)}
                    onPointerLeave={() => setHoveredEdgeId((prev) => (prev === edge.id ? null : prev))}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      disconnectEdge(edge.id);
                      setHoveredEdgeId((prev) => (prev === edge.id ? null : prev));
                    }}
                  />
                )}
              </g>
            );
          })}

          {connection.isConnecting ? (
            <path
              d={getConnectionLinePath()}
              stroke="hsl(var(--primary))"
              strokeWidth="3"
              fill="none"
              markerEnd="url(#arrowhead-active)"
              className="animate-pulse"
              pointerEvents="none"
            />
          ) : null}
        </svg>

        {nodes.map((node) => (
          <WorkflowNodeCard
            key={node.id}
            node={node}
            readiness={nodeReadinessById?.[node.id]}
            selected={selectedNodeId === node.id}
            highlighted={highlightedNodeId === node.id}
            dragging={draggingNode === node.id}
            onNodePointerDown={onNodePointerDown}
            onPortPointerDown={onPortPointerDown}
            onPortPointerUp={onPortPointerUp}
            onDelete={deleteNode}
            status={nodeStatusById?.[node.id]}
            viewMode={viewMode}
          />
        ))}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1.5 rounded-xl bg-card/90 backdrop-blur-md border border-border shadow-lg select-none z-50">
        <div className="flex items-center bg-muted/30 rounded-lg px-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setViewport((prev) => ({ ...prev, zoom: Math.max(prev.zoom - 0.1, 0.2) }))}
          >
            <Minimize className="w-4 h-4" />
          </Button>
          <span className="text-[11px] font-bold text-muted-foreground w-10 text-center">{Math.round(viewport.zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setViewport((prev) => ({ ...prev, zoom: Math.min(prev.zoom + 0.1, 3) }))}
          >
            <Maximize className="w-4 h-4" />
          </Button>
        </div>
        <div className="w-[1px] h-4 bg-border/50 mx-0.5" />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10">
          <Zap className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-500 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <Play className="w-4.5 h-4.5 fill-emerald-500/20" />
        </Button>
        <div className="w-[1px] h-4 bg-border/50 mx-0.5" />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Undo2 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Redo2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
