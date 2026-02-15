"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { friendlyNodeLabel, normalizeNodeType } from "@/lib/workflow-view-model";

type StepNode = Record<string, any>;

type Props = {
  nodes: StepNode[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onInsertAt: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onDelete: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

function approverLabel(node: any): string {
  const assignee = node?.assignee;
  if (!assignee || typeof assignee !== "object") return "unassigned";
  const type = String(assignee.type || "").toLowerCase();
  const value = String(assignee.value || "").trim();
  if (!value) return "unassigned";
  return type === "user" ? `user:${value}` : `role:${value}`;
}

export function WorkflowBuilderCanvas({
  nodes,
  selectedIndex,
  onSelect,
  onInsertAt,
  onMove,
  onDelete,
  onReorder,
}: Props) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  return (
    <div className="rounded-lg border border-border/50 bg-card/60 min-h-[460px] overflow-auto">
      <div className="px-3 py-2.5 border-b border-border/40 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visual Flow</div>
        <Badge variant="outline" className="text-[10px]">{nodes.length} step{nodes.length === 1 ? "" : "s"}</Badge>
      </div>

      <div className="p-4">
        <div className="mx-auto max-w-[560px]">
          <div className="flex justify-center">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Start</Badge>
          </div>

          <div className="h-8 flex justify-center items-center">
            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => onInsertAt(0)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {nodes.map((node, index) => {
            const nodeType = normalizeNodeType(node?.node_type || node?.node_ref?.key || node?.nodeRef?.key || "");
            const selected = selectedIndex === index;
            const isHuman = nodeType.startsWith("human.");
            return (
              <React.Fragment key={`${String(node?.id || "step")}-${index}`}>
                <div
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex == null || dragIndex === index) return;
                    onReorder(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onClick={() => onSelect(index)}
                  className={`rounded-lg border p-3 transition-all cursor-pointer ${selected
                    ? "border-primary/50 bg-primary/10 shadow-sm"
                    : "border-border/40 bg-background/60 hover:bg-muted/30"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" title={String(node?.id || `step_${index + 1}`)}>
                          {String(node?.id || `step_${index + 1}`)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{friendlyNodeLabel(nodeType)}</div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-1 truncate" title={String(node?.node_type || node?.node_ref?.key || node?.nodeRef?.key || "")}>
                          {String(node?.node_type || node?.node_ref?.key || node?.nodeRef?.key || "") || "node type missing"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onMove(index, -1); }} disabled={index === 0}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onMove(index, 1); }} disabled={index === nodes.length - 1}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(index); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">output: {String(node?.output || "none")}</Badge>
                    {isHuman ? (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {String(node?.assignee?.type || "").toLowerCase() === "user" ? (
                          <User className="h-3 w-3" />
                        ) : (
                          <Users className="h-3 w-3" />
                        )}
                        {approverLabel(node)}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="h-8 flex justify-center items-center">
                  <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => onInsertAt(index + 1)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </React.Fragment>
            );
          })}

          <div className="flex justify-center">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">End</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
