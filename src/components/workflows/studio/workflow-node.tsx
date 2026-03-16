"use client";

import * as React from "react";
import { Trash2, Clock3, RefreshCw, CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { WorkflowNode } from "./types";

interface WorkflowNodeCardProps {
  node: WorkflowNode;
  readiness?: { missing: string[]; ready: boolean };
  selected: boolean;
  highlighted?: boolean;
  dragging: boolean;
  onNodePointerDown: (e: React.PointerEvent, id: string) => void;
  onPortPointerDown: (e: React.PointerEvent, id: string, handleId?: string) => void;
  onPortPointerUp: (e: React.PointerEvent, id: string) => void;
  onDelete: (id: string) => void;
  status?: string;
  viewMode?: "build" | "run";
}

function getModeLabel(node: WorkflowNode): string {
  const mode = String(node.data?.mode || "").trim();
  if (!mode) return "";
  return mode.replace(/_/g, " ");
}

function getFlowRouteHandles(node: WorkflowNode): Array<{ id: string; label: string }> {
  if (node.type !== "flow") return [];
  const mode = String(node.data?.mode || "");
  const config = node.data?.config || {};

  if (mode === "if_else") {
    const trueLabel = String(config.true_label || "True").trim() || "True";
    const falseLabel = String(config.false_label || "False").trim() || "False";
    return [
      { id: "true", label: trueLabel },
      { id: "false", label: falseLabel },
    ];
  }

  if (mode === "router") {
    const routes = Array.isArray(config.routes) ? config.routes : [];
    const mapped = routes
      .map((route: any, index: number) => ({
        id: String(route?.key || route?.id || `route_${index + 1}`),
        label: String(route?.label || route?.key || `Route ${index + 1}`),
      }))
      .filter((route: { id: string; label: string }) => Boolean(route.id));

    const fallback = mapped.length > 0 ? mapped : [{ id: "route_1", label: "Route 1" }];
    const defaultRoute = String(config.default_route || "default").trim() || "default";
    return [...fallback, { id: "default", label: `Default (${defaultRoute})` }];
  }

  return [];
}

export function WorkflowNodeCard({
  node,
  readiness,
  selected,
  highlighted = false,
  dragging,
  onNodePointerDown,
  onPortPointerDown,
  onPortPointerUp,
  onDelete,
  status = "pending",
  viewMode = "build",
}: WorkflowNodeCardProps) {
  const flowHandles = getFlowRouteHandles(node);
  const isFlowBranchNode = flowHandles.length > 0;

  const isHumanDecisionNode =
    node.type === "human" && ["review", "approval"].includes(String(node.data?.mode || ""));

  const showOutputPort = !(node.type === "note" || node.type === "end" || isFlowBranchNode || isHumanDecisionNode);
  const showInputPort = !(node.type === "trigger" || node.type === "note");

  const modeLabel = getModeLabel(node);
  const noteText = String(node.data?.config?.content || node.label || "").trim();
  const isBuilderOnly = node.type === "note" || node.type === "end";
  const readinessLabel = isBuilderOnly
    ? "Builder"
    : readiness?.ready
      ? "Ready"
      : `Needs ${Math.max(1, readiness?.missing?.length || 0)}`;
  const readinessTitle = isBuilderOnly
    ? "Builder-only step"
    : readiness?.ready
      ? "This step has required inputs."
      : `Missing: ${(readiness?.missing || []).join(", ")}`;

  if (node.type === "note") {
    const theme = String(node.data?.config?.theme || "yellow");

    const themes: Record<string, { bg: string, border: string, text: string, darkBg: string, darkBorder: string, darkText: string, badge: string, iconColor: string }> = {
      yellow: {
        bg: "bg-yellow-100",
        border: "border-yellow-400/70",
        text: "text-yellow-900/90",
        darkBg: "dark:bg-yellow-900/40",
        darkBorder: "dark:border-yellow-500/50",
        darkText: "dark:text-yellow-100/80",
        badge: "bg-yellow-400/10 border-yellow-400/30 text-yellow-700/70",
        iconColor: "text-yellow-700 dark:text-yellow-400"
      },
      blue: {
        bg: "bg-blue-100",
        border: "border-blue-400/70",
        text: "text-blue-900/90",
        darkBg: "dark:bg-blue-900/40",
        darkBorder: "dark:border-blue-500/50",
        darkText: "dark:text-blue-100/80",
        badge: "bg-blue-400/10 border-blue-400/30 text-blue-700/70",
        iconColor: "text-blue-700 dark:text-blue-400"
      },
      green: {
        bg: "bg-emerald-100",
        border: "border-emerald-400/70",
        text: "text-emerald-900/90",
        darkBg: "dark:bg-emerald-900/40",
        darkBorder: "dark:border-emerald-500/50",
        darkText: "dark:text-emerald-100/80",
        badge: "bg-emerald-400/10 border-emerald-400/30 text-emerald-700/70",
        iconColor: "text-emerald-700 dark:text-emerald-400"
      },
      pink: {
        bg: "bg-pink-100",
        border: "border-pink-400/70",
        text: "text-pink-900/90",
        darkBg: "dark:bg-pink-900/40",
        darkBorder: "dark:border-pink-500/50",
        darkText: "dark:text-pink-100/80",
        badge: "bg-pink-400/10 border-pink-400/30 text-pink-700/70",
        iconColor: "text-pink-700 dark:text-pink-400"
      },
      purple: {
        bg: "bg-purple-100",
        border: "border-purple-400/70",
        text: "text-purple-900/90",
        darkBg: "dark:bg-purple-900/40",
        darkBorder: "dark:border-purple-500/50",
        darkText: "dark:text-purple-100/80",
        badge: "bg-purple-400/10 border-purple-400/30 text-purple-700/70",
        iconColor: "text-purple-700 dark:text-purple-400"
      }
    };

    const currentTheme = themes[theme] || themes.yellow;

    return (
      <div
        onPointerDown={(e) => onNodePointerDown(e, node.id)}
        style={{
          transform: `translate(${node.position.x}px, ${node.position.y}px) rotate(-1.5deg)`,
          position: "absolute",
          left: 0,
          top: 0,
        }}
        className={cn(
          "w-[200px] min-h-[200px] p-5 shadow-lg transition-all group flex flex-col z-10 select-none",
          currentTheme.bg, currentTheme.darkBg,
          `border-l-[6px] ${currentTheme.border} ${currentTheme.darkBorder} rounded-r-md rounded-l-sm`,
          "after:absolute after:bottom-0 after:right-0 after:w-8 after:h-8 after:bg-gradient-to-br after:from-transparent after:to-black/5 dark:after:to-white/5",
          selected ? "ring-2 ring-primary/40 shadow-2xl scale-[1.02]" : "hover:shadow-xl hover:rotate-0",
          dragging ? "cursor-grabbing shadow-2xl scale-[1.05] z-50 opacity-90" : "cursor-grab"
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("w-6 h-6 rounded bg-black/5 dark:bg-white/5 flex items-center justify-center")}>
              <span className={currentTheme.iconColor}>
                {node.icon}
              </span>
            </div>
            <span className={cn("text-[10px] font-bold uppercase tracking-widest opacity-60", currentTheme.text, currentTheme.darkText)}>
              {node.label || "Sticky Note"}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            className={cn("opacity-0 group-hover:opacity-100 p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded shadow-sm transition-all shrink-0", currentTheme.text, currentTheme.darkText)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className={cn("flex-1 text-[13px] font-medium leading-relaxed italic pr-2", currentTheme.text, currentTheme.darkText)}>
          {noteText || "Add your note here..."}
        </div>

        {status === "running" && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/10 rounded-b-xl overflow-hidden">
            <div className="h-full bg-primary animate-[shimmer_2s_infinite_linear] origin-left scale-x-[0.3]" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onPointerDown={(e) => onNodePointerDown(e, node.id)}
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        position: "absolute",
        left: 0,
        top: 0,
      }}
      className={cn(
        "w-[190px] p-4 rounded-xl border bg-card/90 backdrop-blur-md shadow-sm transition-shadow group flex flex-col gap-3 z-10",
        node.color,
        selected
          ? "ring-2 ring-primary border-primary shadow-lg"
          : highlighted
            ? "ring-2 ring-sky-500/70 border-sky-400 shadow-md shadow-sky-500/20"
            : status === "running"
              ? "ring-2 ring-primary/60 border-primary/80 shadow-[0_0_15px_rgba(var(--primary),0.2)] bg-primary/5"
              : status === "completed"
                ? "border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.15)] bg-emerald-50/10 dark:bg-emerald-950/5"
                : "hover:shadow-md border-border",
        dragging ? "cursor-grabbing shadow-xl scale-[1.02] z-50" : "cursor-grab"
      )}
    >

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-muted/50 flex items-center justify-center border border-border/50 shadow-inner">
              {node.icon}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-bold text-foreground tracking-tight truncate">{node.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === "running" && (
              <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-extrabold uppercase tracking-tight border-primary/30 bg-primary/10 text-primary animate-pulse flex items-center gap-1 shrink-0">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                Running
              </Badge>
            )}
            {status === "completed" && (
              <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-extrabold uppercase tracking-tight border-emerald-500/30 bg-emerald-500/10 text-emerald-600 flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Done
              </Badge>
            )}
            {node.data?.implemented === false && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[9px] font-extrabold uppercase tracking-tight bg-orange-500/10 text-orange-600 border-none shrink-0">
                Planned
              </Badge>
            )}
            {selected && (
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform group-hover:scale-110">
                <ArrowRight className="w-3 h-3" />
              </div>
            )}
          </div>
          {viewMode === "build" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 rounded-md text-destructive transition-all shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {modeLabel ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className="text-[9px] px-1.5 h-5 capitalize border-border/70">
                {modeLabel}
              </Badge>
              {viewMode === "run" ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] px-1.5 h-5 border animate-in fade-in zoom-in duration-300",
                    status === "completed" || status === "succeeded" ? "border-emerald-500/40 text-emerald-700 bg-emerald-500/10" :
                      status === "running" || status === "waiting" ? "border-primary/40 text-primary bg-primary/10" :
                        status === "failed" || status === "error" ? "border-rose-500/40 text-rose-700 bg-rose-500/10" :
                          "border-border/70 text-muted-foreground"
                  )}
                >
                  {status === "running" || status === "waiting" ? (
                    <span className="flex items-center gap-1">
                      <Clock3 className="w-2.5 h-2.5 animate-spin duration-700" />
                      Running
                    </span>
                  ) : status || "Pending"}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] px-1.5 h-5 border",
                    isBuilderOnly
                      ? "border-border/70 text-muted-foreground"
                      : readiness?.ready
                        ? "border-emerald-500/40 text-emerald-700 bg-emerald-500/10"
                        : "border-amber-500/40 text-amber-700 bg-amber-500/10"
                  )}
                  title={readinessTitle}
                >
                  {readinessLabel}
                </Badge>
              )}
            </div>
          </>
        ) : null}

        {isFlowBranchNode ? (
          <div className="space-y-2 mt-1">
            {flowHandles.map((handle, index) => (
              <div
                key={handle.id}
                className={cn(
                  "relative flex items-center justify-between rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border",
                  index === flowHandles.length - 1
                    ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                    : "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                )}
              >
                {handle.label}
                <div
                  className="absolute -right-5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center cursor-crosshair z-20 group/port"
                  data-port-id={handle.id}
                  data-node-id={node.id}
                  onPointerDown={(e) => onPortPointerDown(e, node.id, handle.id)}
                >
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full bg-background hover:scale-125 transition-all border-2",
                      index === flowHandles.length - 1 ? "border-rose-500" : "border-emerald-500"
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {isHumanDecisionNode ? (
          <div className="space-y-2 mt-1">
            {[{ id: "approve", label: "Approve", color: "emerald" }, { id: "reject", label: "Reject", color: "rose" }].map((item) => (
              <div
                key={item.id}
                className="relative bg-muted/30 border border-border/50 rounded px-2 py-1.5 text-[11px] font-medium text-foreground flex items-center justify-between group/item transition-colors hover:border-border"
              >
                {item.label}
                <div className={cn("w-2 h-2 rounded-full", item.color === "emerald" ? "bg-emerald-500" : "bg-rose-500")} />
                <div
                  className="absolute -right-5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center cursor-crosshair z-20 group/port"
                  data-port-id={item.id}
                  data-node-id={node.id}
                  onPointerDown={(e) => onPortPointerDown(e, node.id, item.id)}
                >
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full bg-background border-2 hover:scale-125 transition-all",
                      item.color === "emerald" ? "border-emerald-500" : "border-rose-500"
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {showInputPort ? (
        <div
          className="absolute -left-5 top-[50px] -translate-y-1/2 w-10 h-10 flex items-center justify-center cursor-crosshair z-30 group/port touch-none"
          data-node-id={node.id}
          data-port-type="input"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            onPortPointerUp(e, node.id);
          }}
        >
          <div className="w-4 h-4 rounded-full bg-background border-2 border-primary shadow-md group-hover/port:scale-125 group-hover/port:border-primary transition-all" />
        </div>
      ) : null}

      {showOutputPort ? (
        <div
          className="absolute -right-5 top-[50px] -translate-y-1/2 w-10 h-10 flex items-center justify-center cursor-crosshair z-30 group/port touch-none"
          data-node-id={node.id}
          data-port-type="output"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onPortPointerDown(e, node.id);
          }}
        >
          <div className="w-4 h-4 rounded-full bg-background border-2 border-primary shadow-md group-hover/port:scale-125 group-hover/port:border-primary transition-all" />
        </div>
      ) : null}

      {status === "running" && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/10 rounded-b-xl overflow-hidden z-10">
          <div
            className="h-full bg-primary origin-left"
            style={{ animation: 'loading-bar-pulse 2s infinite ease-in-out' }}
          />
          <style jsx>{`
            @keyframes loading-bar-pulse {
              0% { transform: scaleX(0.1); opacity: 0.5; }
              50% { transform: scaleX(0.6); opacity: 1; }
              100% { transform: scaleX(0.1); opacity: 0.5; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
