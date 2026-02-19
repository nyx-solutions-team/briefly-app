"use client";

import * as React from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type EdgeWhen = {
  type?: "always" | "route" | "status" | "expression";
  equals?: string;
  in?: string[];
  expression?: string;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  when?: EdgeWhen | null;
};

type Props = {
  schemaVersion: 1 | 2;
  nodeIds: string[];
  entryNodes: string[];
  execution: {
    max_parallelism?: number;
    on_node_failure?: "fail_fast" | "continue";
  };
  edges: GraphEdge[];
  onSchemaVersionChange: (version: 1 | 2) => void;
  onEntryNodesChange: (entryNodes: string[]) => void;
  onExecutionChange: (patch: { max_parallelism?: number; on_node_failure?: "fail_fast" | "continue" }) => void;
  onEdgesChange: (edges: GraphEdge[]) => void;
  onAutowireSequential: () => void;
};

function toCsv(values: string[] = []): string {
  return (values || []).filter(Boolean).join(", ");
}

function parseCsv(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeConditionType(value: any): "always" | "route" | "status" | "expression" {
  const key = String(value || "").trim().toLowerCase();
  if (key === "route") return "route";
  if (key === "status") return "status";
  if (key === "expression") return "expression";
  return "always";
}

export function WorkflowGraphSettings({
  schemaVersion,
  nodeIds,
  entryNodes,
  execution,
  edges,
  onSchemaVersionChange,
  onEntryNodesChange,
  onExecutionChange,
  onEdgesChange,
  onAutowireSequential,
}: Props) {
  const addEdge = React.useCallback(() => {
    const from = nodeIds[0] || "";
    const to = nodeIds[Math.min(1, Math.max(nodeIds.length - 1, 0))] || "";
    const next = [...edges];
    next.push({
      id: `edge_${Date.now()}`,
      from,
      to,
      when: { type: "always" },
    });
    onEdgesChange(next);
  }, [edges, nodeIds, onEdgesChange]);

  const patchEdge = React.useCallback((index: number, patch: Partial<GraphEdge>) => {
    const next = [...edges];
    next[index] = {
      ...(next[index] || { id: `edge_${index + 1}`, from: "", to: "", when: { type: "always" } }),
      ...patch,
    };
    onEdgesChange(next);
  }, [edges, onEdgesChange]);

  const patchEdgeWhen = React.useCallback((index: number, patch: Partial<EdgeWhen>) => {
    const edge = edges[index] || { id: `edge_${index + 1}`, from: "", to: "", when: { type: "always" } };
    const currentWhen = edge.when && typeof edge.when === "object" ? edge.when : { type: "always" as const };
    patchEdge(index, {
      when: {
        ...currentWhen,
        ...patch,
      },
    });
  }, [edges, patchEdge]);

  const removeEdge = React.useCallback((index: number) => {
    const next = edges.filter((_, i) => i !== index);
    onEdgesChange(next);
  }, [edges, onEdgesChange]);

  return (
    <div className="rounded-lg border border-border/50 bg-card/60 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Graph Settings</div>
        <Select
          value={String(schemaVersion)}
          onValueChange={(value) => onSchemaVersionChange(value === "2" ? 2 : 1)}
        >
          <SelectTrigger className="h-7 w-[132px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Schema v1</SelectItem>
            <SelectItem value="2">Schema v2 (DAG)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="p-3 space-y-3">
        {schemaVersion === 1 ? (
          <div className="rounded border border-border/40 bg-background/50 p-3 text-xs text-muted-foreground">
            Schema v1 uses ordered `nodes` execution. Switch to schema v2 to configure `entry_nodes`, conditional edges, joins, and parallel branches.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Entry Nodes (csv)</div>
                <Input
                  value={toCsv(entryNodes)}
                  onChange={(e) => onEntryNodesChange(parseCsv(e.target.value))}
                  className="h-8 text-xs font-mono"
                  placeholder="start_node"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Max Parallelism</div>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  value={String(execution?.max_parallelism ?? 2)}
                  onChange={(e) => {
                    const parsed = Number(e.target.value || 2);
                    const bounded = Number.isFinite(parsed) ? Math.max(1, Math.min(50, Math.trunc(parsed))) : 2;
                    onExecutionChange({ max_parallelism: bounded });
                  }}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">On Node Failure</div>
                <Select
                  value={String(execution?.on_node_failure || "fail_fast")}
                  onValueChange={(value) => onExecutionChange({ on_node_failure: value === "continue" ? "continue" : "fail_fast" })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fail_fast">fail_fast</SelectItem>
                    <SelectItem value="continue">continue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">Edges define routing and parallel fan-out/fan-in behavior.</div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={onAutowireSequential}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1" />
                  Auto-wire
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={addEdge}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Edge
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {edges.map((edge, index) => {
                const conditionType = normalizeConditionType(edge?.when?.type);
                const edgeId = String(edge?.id || `edge_${index + 1}`);
                const from = String(edge?.from || "");
                const to = String(edge?.to || "");
                const when = edge?.when && typeof edge.when === "object" ? edge.when : { type: "always" as const };
                return (
                  <div key={`${edgeId}-${index}`} className="rounded border border-border/40 bg-background/50 p-2 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div>
                        <div className="text-[11px] text-muted-foreground mb-1">Edge Id</div>
                        <Input
                          value={edgeId}
                          onChange={(e) => patchEdge(index, { id: String(e.target.value || "").trim() })}
                          className="h-8 text-xs font-mono"
                          placeholder="edge_from_to"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground mb-1">From</div>
                        <Select
                          value={from || undefined}
                          onValueChange={(value) => patchEdge(index, { from: value })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="from node" />
                          </SelectTrigger>
                          <SelectContent>
                            {nodeIds.map((nodeId) => (
                              <SelectItem key={`from-${edgeId}-${nodeId}`} value={nodeId}>{nodeId}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground mb-1">To</div>
                        <Select
                          value={to || undefined}
                          onValueChange={(value) => patchEdge(index, { to: value })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="to node" />
                          </SelectTrigger>
                          <SelectContent>
                            {nodeIds.map((nodeId) => (
                              <SelectItem key={`to-${edgeId}-${nodeId}`} value={nodeId}>{nodeId}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground mb-1">Condition Type</div>
                        <Select
                          value={conditionType}
                          onValueChange={(value) => {
                            const type = normalizeConditionType(value);
                            patchEdgeWhen(index, { type });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="always">always</SelectItem>
                            <SelectItem value="route">route</SelectItem>
                            <SelectItem value="status">status</SelectItem>
                            <SelectItem value="expression">expression</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {conditionType === "route" ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-1">Route equals</div>
                          <Input
                            value={String(when?.equals || "")}
                            onChange={(e) => patchEdgeWhen(index, { equals: String(e.target.value || "") })}
                            className="h-8 text-xs"
                            placeholder="true"
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-1">Route in (csv)</div>
                          <Input
                            value={toCsv(Array.isArray(when?.in) ? when.in : [])}
                            onChange={(e) => patchEdgeWhen(index, { in: parseCsv(e.target.value) })}
                            className="h-8 text-xs"
                            placeholder="true,false"
                          />
                        </div>
                      </div>
                    ) : null}

                    {conditionType === "status" ? (
                      <div>
                        <div className="text-[11px] text-muted-foreground mb-1">Statuses (csv)</div>
                        <Input
                          value={toCsv(Array.isArray(when?.in) ? when.in : [])}
                          onChange={(e) => patchEdgeWhen(index, { in: parseCsv(e.target.value) })}
                          className="h-8 text-xs"
                          placeholder="succeeded,failed"
                        />
                      </div>
                    ) : null}

                    {conditionType === "expression" ? (
                      <div>
                        <div className="text-[11px] text-muted-foreground mb-1">Expression</div>
                        <Textarea
                          value={String(when?.expression || "")}
                          onChange={(e) => patchEdgeWhen(index, { expression: String(e.target.value || "") })}
                          className="min-h-[72px] text-xs font-mono"
                          placeholder="$.input.shouldProceed == true"
                        />
                      </div>
                    ) : null}

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive"
                        onClick={() => removeEdge(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}

              {edges.length === 0 ? (
                <div className="rounded border border-dashed border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
                  No edges configured. Add an edge or auto-wire from current node order.
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
