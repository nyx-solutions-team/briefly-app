"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WorkflowBuilderCanvas } from "@/components/workflows/workflow-builder-canvas";
import { WorkflowExecuteStudio } from "@/components/workflows/workflow-execute-studio";
import { WorkflowInspector } from "@/components/workflows/workflow-inspector";
import { WorkflowTemplateSidebar } from "@/components/workflows/workflow-template-sidebar";
import { WorkflowRunGraph } from "@/components/workflows/workflow-run-graph";
import { type GraphEdge } from "@/components/workflows/workflow-graph-settings";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { AccessDenied } from "@/components/access-denied";
import { apiFetch, getApiContext } from "@/lib/api";
import { buildLiveRunGraph, buildRunGraph, detectCurrentStepId, formatDurationMs } from "@/lib/workflow-view-model";
import { getOrgFeatures } from "@/lib/org-features";
import {
  completeWorkflowTask,
  createWorkflowTemplate,
  createWorkflowTemplateVersion,
  forkWorkflowTemplate,
  getWorkflowTemplateDefinition,
  getWorkflowConfig,
  getWorkflowRun,
  listWorkflowNodeDefinitions,
  listWorkflowRuns,
  listWorkflowTemplates,
  runWorkflowManual,
  type WorkflowConfig,
  type WorkflowNodeDefinition,
  type WorkflowRun,
  type WorkflowTemplate,
} from "@/lib/workflow-api";
import { WorkflowStudio } from "@/components/workflows/studio/workflow-studio";
import { AlertTriangle, Calendar, CheckCircle2, Clock3, Eye, FileText, History, Home, LayoutGrid, MoreHorizontal, Play, Plus, RefreshCw, Search, ArrowRight, BookOpen, Sparkles, Zap, Star, XCircle, Layers, Settings, Activity, HardDrive, Terminal, ShieldCheck, Cpu, Database, Network } from "lucide-react";

type WorkflowPageMode = "home" | "builder" | "execute" | "run" | "history" | "my-workflows" | "templates-list";

/*
 * Mode mapping:
 * - "home" -> /workflows
 * - "builder" -> /workflows/builder
 * - "execute" -> /workflows/run
 * - "history" -> /workflows/history
 * - "templates-list" -> /workflows/templates
 * - "my-workflows" -> /workflows/my-workflows
 * Note: "run" mode is reserved for viewing run details but currently shares the execute workflow
 */

function workflowModeFromPath(pathname: string): WorkflowPageMode {
  const path = String(pathname || "").trim();
  if (path.startsWith("/workflows/builder")) return "builder";
  if (path.startsWith("/workflows/run")) return "execute";
  if (path.startsWith("/workflows/history")) return "history";
  if (path.startsWith("/workflows/templates")) return "templates-list";
  if (path.startsWith("/workflows/my-workflows")) return "my-workflows";
  return "home";
}

function workflowPathFromMode(mode: WorkflowPageMode): string {
  if (mode === "builder") return "/workflows/builder";
  if (mode === "execute") return "/workflows/run";
  if (mode === "history") return "/workflows/history";
  if (mode === "templates-list") return "/workflows/templates";
  if (mode === "my-workflows") return "/workflows/my-workflows";
  return "/workflows";
}

type WorkflowScenario = {
  key: string;
  label: string;
  description: string;
  definition: Record<string, any>;
  input: Record<string, any>;
  context: Record<string, any>;
};

const SCENARIOS: WorkflowScenario[] = [
  {
    key: "lease-review",
    label: "Lease Review and Approval",
    description: "Legal -> Manager -> Final signoff flow for controlled lease docs.",
    definition: {
      schema_version: 1,
      type: "approval.pipeline",
      nodes: [
        { id: "legal_review", node_type: "human.review", assignee: { type: "role", value: "teamLead" } },
        { id: "risk_summary", node_type: "ai.summary", model: "gemini", output: "risk_summary" },
        { id: "manager_signoff", node_type: "human.approval", assignee: { type: "role", value: "orgAdmin" } },
      ],
      policies: { lock_editing: true, require_citations: true },
    },
    input: {
      objectType: "editor_document",
      title: "Lease v4 - Tower B",
      fields: { landlord: "ABC Realty", termMonths: 36 },
    },
    context: { department: "legal", source: "workflow-playground" },
  },
  {
    key: "onboarding-packet",
    label: "Tenant Onboarding Packet Completion",
    description: "Checklist + missing-doc validation run for onboarding packets.",
    definition: {
      schema_version: 1,
      type: "packet.validation",
      nodes: [
        { id: "collect_docs", node_type: "system.enumerate_docs", required: ["id_proof", "agreement", "address_proof"] },
        { id: "extract_core_fields", node_type: "ai.extract", output: "packet_fields" },
        { id: "ops_validation", node_type: "human.review", assignee: { type: "role", value: "manager" } },
      ],
      policies: { partial_completion_allowed: true },
    },
    input: {
      objectType: "folder_packet",
      folderPath: "/tenants/onboarding/tenant-101",
      requiredDocCount: 3,
    },
    context: { department: "operations", source: "workflow-playground" },
  },
  {
    key: "compliance-assessment",
    label: "Ruleset Compliance Assessment",
    description: "Ruleset parse + fact extraction + findings generation for compliance case.",
    definition: {
      schema_version: 1,
      type: "compliance.assessment",
      nodes: [
        { id: "parse_ruleset", node_type: "ai.parse_ruleset", output: "ruleset_json" },
        { id: "extract_facts", node_type: "ai.extract_facts", output: "subject_facts_json" },
        { id: "evaluate_findings", node_type: "system.evaluate", output: "assessment_json" },
        { id: "compliance_signoff", node_type: "human.approval", assignee: { type: "role", value: "orgAdmin" } },
      ],
      policies: { require_citations: true, unknown_requires_signoff: true },
    },
    input: {
      objectType: "compliance_case",
      rulesetDocId: "sample-ruleset-doc",
      subjectPacketId: "sample-subject-packet",
    },
    context: { domain: "real-estate", source: "workflow-playground" },
  },
  {
    key: "folder-consistency",
    label: "Folder Batch Consistency Check",
    description: "Cross-document reconciliation for mismatches and remediation.",
    definition: {
      schema_version: 1,
      type: "folder.reconciliation",
      nodes: [
        { id: "classify_docs", node_type: "ai.classify", output: "doc_groups" },
        { id: "extract_required_fields", node_type: "ai.extract", output: "extraction_results" },
        { id: "run_reconciliation", node_type: "system.reconcile", output: "reconciliation_results" },
        { id: "ops_triage", node_type: "human.review", assignee: { type: "role", value: "manager" } },
      ],
      policies: { auto_edit_docs: false, evidence_required_for_override: true },
    },
    input: {
      objectType: "client_folder",
      folderPath: "/clients/acme-corp",
      filenameRules: ["KYC_*", "Agreement_*", "Invoice_*"],
    },
    context: { department: "ops", source: "workflow-playground" },
  },
];

const EMPTY_BUILDER_DEFINITION: Record<string, any> = {
  schema_version: 1,
  type: "custom.workflow",
  nodes: [],
};

function uniqueStrings(values: any[]): string[] {
  return Array.from(new Set(values.filter((v) => typeof v === "string" && v.trim().length > 0)));
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSchemaVersion(value: any): 1 | 2 {
  return Number(value) === 2 ? 2 : 1;
}

function normalizeFailureMode(value: any): "fail_fast" | "continue" {
  return String(value || "").toLowerCase() === "continue" ? "continue" : "fail_fast";
}

function collectNodeIds(nodes: any[]): string[] {
  return uniqueStrings((Array.isArray(nodes) ? nodes : []).map((node) => String(node?.id || "").trim()));
}

function toStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((entry) => String(entry || "").trim()));
}

function normalizeEdgeCondition(when: any): { type: "always" | "route" | "status" | "expression"; equals?: string; in?: string[]; expression?: string } {
  if (!isPlainObject(when)) return { type: "always" };
  const typeKey = String(when.type || "").trim().toLowerCase();
  if (typeKey === "route") {
    const next: { type: "route"; equals?: string; in?: string[] } = { type: "route" };
    if (String(when.equals || "").trim()) next.equals = String(when.equals).trim();
    const inValues = toStringArray(when.in);
    if (inValues.length > 0) next.in = inValues;
    return next;
  }
  if (typeKey === "status") {
    const statuses = toStringArray(when.in);
    return statuses.length > 0 ? { type: "status", in: statuses } : { type: "status" };
  }
  if (typeKey === "expression") {
    const expression = String(when.expression || "").trim();
    return expression ? { type: "expression", expression } : { type: "expression" };
  }
  return { type: "always" };
}

function normalizeGraphEdges(value: any): GraphEdge[] {
  if (!Array.isArray(value)) return [];
  const next: GraphEdge[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const edge = value[index];
    const from = String(edge?.from || "").trim();
    const to = String(edge?.to || "").trim();
    const edgeId = String(edge?.id || `edge_${index + 1}`).trim() || `edge_${index + 1}`;
    next.push({
      id: edgeId,
      from,
      to,
      when: normalizeEdgeCondition(edge?.when),
    });
  }
  return next;
}

function buildSequentialEdges(nodeIds: string[]): GraphEdge[] {
  const safe = uniqueStrings(nodeIds);
  const next: GraphEdge[] = [];
  for (let index = 0; index < safe.length - 1; index += 1) {
    const from = safe[index];
    const to = safe[index + 1];
    next.push({
      id: `${from}__${to}__${index + 1}`,
      from,
      to,
      when: { type: "always" },
    });
  }
  return next;
}

function normalizeTemplateName(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function templateScopeOf(tpl: Partial<WorkflowTemplate> | null | undefined): "org" | "system" {
  const explicit = String((tpl as any)?.template_scope || "").trim().toLowerCase();
  if (explicit === "system") return "system";
  if (explicit === "org") return "org";
  return tpl?.org_id ? "org" : "system";
}

function normalizeAssessmentResult(value: any): "pass" | "fail" | "unknown" {
  const key = String(value || "").toLowerCase();
  if (key === "pass" || key === "passed" || key === "succeeded" || key === "compliant") return "pass";
  if (key === "fail" || key === "failed" || key === "error" || key === "non_compliant") return "fail";
  return "unknown";
}

function toTimestampMs(value: any): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return ts;
}

function formatRunDate(value: any): string {
  const ts = toTimestampMs(value);
  if (!ts) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function isTaskPending(statusValue: any): boolean {
  const key = String(statusValue || "").toLowerCase();
  return key !== "completed" && key !== "done" && key !== "cancelled" && key !== "failed";
}

function runStatusToneClass(statusValue: any): string {
  const key = String(statusValue || "").toLowerCase();
  if (key === "succeeded" || key === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
  if (key === "failed") return "border-red-500/30 bg-red-500/10 text-red-600";
  if (key === "running" || key === "waiting" || key === "queued") return "border-blue-500/30 bg-blue-500/10 text-blue-600";
  if (key === "cancelled") return "border-zinc-500/30 bg-zinc-500/10 text-zinc-600";
  return "border-border/40 bg-background/60 text-muted-foreground";
}

function formatOutputPrimitive(value: any): string {
  if (value == null) return "n/a";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => formatOutputPrimitive(item)).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function compactOutputRows(obj: Record<string, any> | null | undefined, maxItems = 10): Array<{ key: string; value: string }> {
  if (!obj || typeof obj !== "object") return [];
  const safeObj = stripModelFields(obj);
  const rows: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(safeObj)) {
    if (rows.length >= maxItems) break;
    const label = formatOutputPrimitive(value);
    rows.push({ key, value: label.length > 180 ? `${label.slice(0, 177)}...` : label });
  }
  return rows;
}

function stripModelFields(value: any): any {
  if (Array.isArray(value)) return value.map((item) => stripModelFields(item));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, any> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (String(key).toLowerCase() === "model") continue;
    next[key] = stripModelFields(nested);
  }
  return next;
}

function inferDefinitionMode(definition: Record<string, any>): "legacy" | "mixed" | "registry" {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  let hasRegistry = false;
  let hasLegacy = false;
  for (const node of nodes) {
    const ref = node?.node_ref && typeof node.node_ref === "object"
      ? node.node_ref
      : (node?.nodeRef && typeof node.nodeRef === "object" ? node.nodeRef : null);
    const hasRef = Boolean(ref && String(ref.key || "").trim());
    const hasNodeType = String(node?.node_type || node?.type || "").trim().length > 0;
    if (hasRef) hasRegistry = true;
    if (hasNodeType && !hasRef) hasLegacy = true;
  }
  if (hasRegistry && hasLegacy) return "mixed";
  if (hasRegistry) return "registry";
  return "legacy";
}

const BUILDER_FALLBACK_NODE_TYPES: Array<{ key: string; label: string }> = [
  { key: "ai.prompt", label: "AI Prompt" },
  { key: "ai.extract", label: "AI Extract" },
  { key: "ai.classify", label: "AI Classify" },
  { key: "system.validate", label: "Validate" },
  { key: "system.reconcile", label: "Reconcile" },
  { key: "system.packet_check", label: "Packet Check" },
  { key: "dms.read_document", label: "Read Document" },
  { key: "dms.list_folder", label: "List Folder" },
  { key: "dms.set_metadata", label: "Set Metadata" },
  { key: "dms.create_document", label: "Create Document" },
  { key: "dms.move_document", label: "Move Document" },
  { key: "flow.branch", label: "Branch" },
  { key: "flow.route", label: "Rule Router" },
  { key: "flow.for_each", label: "For Each" },
  { key: "flow.aggregate", label: "Merge Results" },
  { key: "artifact.export_csv", label: "Export CSV" },
  { key: "human.review", label: "Human Review" },
  { key: "human.approval", label: "Human Approval" },
  { key: "human.task", label: "Create Task" },
  { key: "human.checklist", label: "Checklist Task" },
];

function sanitizeStepId(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  if (!normalized) return "";
  if (!/^[A-Za-z]/.test(normalized)) return `step_${normalized}`;
  return normalized;
}

function resolveNodeType(node: any): string {
  return String(
    node?.node_type
    || node?.type
    || node?.node_ref?.key
    || node?.nodeRef?.key
    || ""
  ).trim();
}

function hasBindingField(node: any, key: string): boolean {
  if (!isPlainObject(node?.input_bindings)) return false;
  return Object.prototype.hasOwnProperty.call(node.input_bindings, String(key || "").trim());
}

function normalizeBuilderNodesForSave(nodes: any[]): {
  nodes: Record<string, any>[];
  idMap: Map<string, string>;
} {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const normalizedNodes: Record<string, any>[] = [];
  const idMap = new Map<string, string>();
  const used = new Set<string>();

  for (let index = 0; index < safeNodes.length; index += 1) {
    const rawNode = safeNodes[index];
    const sourceId = String(rawNode?.id || "").trim() || `step_${index + 1}`;
    const nodeType = resolveNodeType(rawNode);
    const preferred = sanitizeStepId(sourceId)
      || sanitizeStepId(nodeType.replace(/\./g, "_"))
      || `step_${index + 1}`;

    let uniqueId = preferred;
    let suffix = 2;
    while (used.has(uniqueId)) {
      uniqueId = `${preferred}_${suffix}`;
      suffix += 1;
    }
    used.add(uniqueId);
    idMap.set(sourceId, uniqueId);

    const nextNode: Record<string, any> = isPlainObject(rawNode) ? deepClone(rawNode) : {};
    nextNode.id = uniqueId;
    if (nodeType) nextNode.node_type = nodeType;

    if (nodeType.startsWith("human.") && !isPlainObject(nextNode.assignee)) {
      nextNode.assignee = { type: "role", value: "orgAdmin" };
    }

    if (nodeType === "ai.classify") {
      const cfg = isPlainObject(nextNode.config) ? { ...nextNode.config } : {};
      const labels = Array.isArray(cfg.labels)
        ? cfg.labels.map((item: any) => String(item || "").trim()).filter(Boolean)
        : [];
      if (labels.length === 0 && !hasBindingField(nextNode, "labels")) {
        cfg.labels = ["label_a", "label_b"];
      } else if (labels.length > 0) {
        cfg.labels = labels;
      }
      nextNode.config = cfg;
    }

    normalizedNodes.push(nextNode);
  }

  return { nodes: normalizedNodes, idMap };
}

function normalizeBuilderEdgesForSave(
  edges: GraphEdge[],
  idMap: Map<string, string>,
  validNodeIds: Set<string>
): GraphEdge[] {
  const safeEdges = Array.isArray(edges) ? edges : [];
  const out: GraphEdge[] = [];
  const usedEdgeIds = new Set<string>();

  for (let index = 0; index < safeEdges.length; index += 1) {
    const edge = safeEdges[index];
    const rawFrom = String(edge?.from || "").trim();
    const rawTo = String(edge?.to || "").trim();
    const from = idMap.get(rawFrom) || sanitizeStepId(rawFrom);
    const to = idMap.get(rawTo) || sanitizeStepId(rawTo);
    if (!from || !to) continue;
    if (!validNodeIds.has(from) || !validNodeIds.has(to)) continue;
    if (from === to) continue;

    const rawEdgeId = String(edge?.id || `${from}_to_${to}`).trim();
    const edgeIdBase = sanitizeStepId(rawEdgeId) || `edge_${index + 1}`;
    let edgeId = edgeIdBase;
    let suffix = 2;
    while (usedEdgeIds.has(edgeId)) {
      edgeId = `${edgeIdBase}_${suffix}`;
      suffix += 1;
    }
    usedEdgeIds.add(edgeId);

    out.push({
      id: edgeId,
      from,
      to,
      when: normalizeEdgeCondition(edge?.when),
    });
  }

  return out;
}

function schemaFieldKeys(schema: any): string[] {
  const properties = isPlainObject(schema?.properties) ? schema.properties : {};
  return Object.keys(properties);
}

function schemaPreview(value: any, maxChars = 1200): string {
  if (!isPlainObject(value)) return "{}";
  try {
    const formatted = JSON.stringify(value, null, 2);
    if (formatted.length <= maxChars) return formatted;
    return `${formatted.slice(0, maxChars)}\n...`;
  } catch {
    return "{}";
  }
}

const nodeTypeColors: Record<string, { bg: string; icon: string; label: string }> = {
  "ai.prompt": { bg: "bg-purple-500", icon: "text-purple-500", label: "AI" },
  "ai.extract": { bg: "bg-purple-500", icon: "text-purple-500", label: "AI" },
  "ai.classify": { bg: "bg-purple-500", icon: "text-purple-500", label: "AI" },
  "ai.summary": { bg: "bg-purple-500", icon: "text-purple-500", label: "AI" },
  "ai.generate": { bg: "bg-purple-500", icon: "text-purple-500", label: "AI" },
  "ai.parse_ruleset": { bg: "bg-purple-500", icon: "text-purple-500", label: "AI" },
  "ai.extract_facts": { bg: "bg-purple-500", icon: "text-purple-500", label: "AI" },
  "ai.generate_report": { bg: "bg-purple-500", icon: "text-purple-500", label: "AI" },
  "human.review": { bg: "bg-blue-500", icon: "text-blue-500", label: "Review" },
  "human.approval": { bg: "bg-green-500", icon: "text-green-500", label: "Approve" },
  "human.task": { bg: "bg-orange-500", icon: "text-orange-500", label: "Task" },
  "human.checklist": { bg: "bg-orange-500", icon: "text-orange-500", label: "Check" },
  "dms.read_document": { bg: "bg-zinc-500", icon: "text-zinc-500", label: "Read" },
  "dms.create_document": { bg: "bg-zinc-500", icon: "text-zinc-500", label: "Create" },
  "dms.list_folder": { bg: "bg-zinc-500", icon: "text-zinc-500", label: "List" },
  "system.validate": { bg: "bg-amber-500", icon: "text-amber-500", label: "Validate" },
  "system.reconcile": { bg: "bg-amber-500", icon: "text-amber-500", label: "Reconcile" },
  "system.evaluate": { bg: "bg-amber-500", icon: "text-amber-500", label: "Evaluate" },
  "system.packet_check": { bg: "bg-amber-500", icon: "text-amber-500", label: "Check" },
  "flow.branch": { bg: "bg-pink-500", icon: "text-pink-500", label: "Branch" },
  "flow.route": { bg: "bg-pink-500", icon: "text-pink-500", label: "Route" },
  "flow.for_each": { bg: "bg-pink-500", icon: "text-pink-500", label: "Loop" },
  "flow.aggregate": { bg: "bg-pink-500", icon: "text-pink-500", label: "Merge" },
  "trigger": { bg: "bg-cyan-500", icon: "text-cyan-500", label: "Trigger" },
  "artifact.export_csv": { bg: "bg-emerald-500", icon: "text-emerald-500", label: "Export" },
};

function getNodeTypeInfo(nodeType: string) {
  const normalized = String(nodeType || "").toLowerCase();
  for (const key of Object.keys(nodeTypeColors)) {
    if (normalized.includes(key)) return nodeTypeColors[key];
  }
  return { bg: "bg-gray-500", icon: "text-gray-500", label: "Step" };
}

const nodeIcons: Record<string, React.ReactNode> = {
  "ai.prompt": <Sparkles className="w-3 h-3" />,
  "ai.extract": <Sparkles className="w-3 h-3" />,
  "ai.classify": <Sparkles className="w-3 h-3" />,
  "ai.summary": <Sparkles className="w-3 h-3" />,
  "ai.generate": <Sparkles className="w-3 h-3" />,
  "ai.parse_ruleset": <Sparkles className="w-3 h-3" />,
  "ai.extract_facts": <Sparkles className="w-3 h-3" />,
  "ai.generate_report": <Sparkles className="w-3 h-3" />,
  "human.review": <Eye className="w-3 h-3" />,
  "human.approval": <CheckCircle2 className="w-3 h-3" />,
  "human.task": <Zap className="w-3 h-3" />,
  "human.checklist": <CheckCircle2 className="w-3 h-3" />,
  "dms.read_document": <FileText className="w-3 h-3" />,
  "dms.create_document": <FileText className="w-3 h-3" />,
  "dms.list_folder": <FileText className="w-3 h-3" />,
  "system.validate": <CheckCircle2 className="w-3 h-3" />,
  "system.reconcile": <RefreshCw className="w-3 h-3" />,
  "system.evaluate": <AlertTriangle className="w-3 h-3" />,
  "system.packet_check": <CheckCircle2 className="w-3 h-3" />,
  "flow.branch": <ArrowRight className="w-3 h-3" />,
  "flow.route": <ArrowRight className="w-3 h-3" />,
  "flow.for_each": <RefreshCw className="w-3 h-3" />,
  "flow.aggregate": <RefreshCw className="w-3 h-3" />,
  "trigger": <Zap className="w-3 h-3" />,
  "artifact.export_csv": <FileText className="w-3 h-3" />,
};

function getNodeIcon(nodeType: string) {
  const normalized = String(nodeType || "").toLowerCase();
  for (const key of Object.keys(nodeIcons)) {
    if (normalized.includes(key)) return nodeIcons[key];
  }
  return <Zap className="w-3 h-3" />;
}

function WorkflowPreview({ nodes }: { nodes: any[] }) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-2">
        <span className="text-[10px] text-muted-foreground">Empty workflow</span>
      </div>
    );
  }

  const displayNodes = nodes.slice(0, 4);

  return (
    <div className="flex flex-col gap-1.5 py-1 w-full px-1">
      {displayNodes.map((node: any, idx: number) => {
        const info = getNodeTypeInfo(node?.node_type || node?.node_ref?.key || "");
        const nodeId = node?.id || `step_${idx + 1}`;
        return (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className={`w-6 h-6 rounded-md ${info.bg} flex items-center justify-center text-white shrink-0`}>
                {getNodeIcon(node?.node_type || "")}
              </div>
              <span className="text-[10px] text-foreground/80 truncate font-medium">
                {nodeId}
              </span>
            </div>
            {idx < displayNodes.length - 1 && (
              <div className="absolute left-3 top-6 w-0.5 h-3 bg-border" />
            )}
          </div>
        );
      })}
      {nodes.length > 4 && (
        <div className="text-[9px] text-muted-foreground text-center pt-1">
          +{nodes.length - 4} more nodes
        </div>
      )}
    </div>
  );
}

function TemplateCardWithPreview({ template, loadDefinition, onClick }: {
  template: any;
  loadDefinition: (id: string) => Promise<any>;
  onClick: () => void;
}) {
  const [nodes, setNodes] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadDefinition(template.id).then((def) => {
      if (!cancelled) {
        setNodes(def?.nodes || []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [template.id, loadDefinition]);

  const backgrounds = [
    "bg-gradient-to-br from-amber-400 to-amber-500",
    "bg-gradient-to-br from-blue-500 to-blue-600",
    "bg-gradient-to-br from-emerald-400 to-emerald-500",
    "bg-gradient-to-br from-rose-500 to-rose-600",
    "bg-gradient-to-br from-fuchsia-500 to-fuchsia-600",
    "bg-gradient-to-br from-cyan-500 to-cyan-600",
    "bg-gradient-to-br from-orange-400 to-orange-500",
    "bg-gradient-to-br from-zinc-400 to-zinc-500",
  ];
  const bg = backgrounds[(template.id || "").split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % backgrounds.length];

  return (
    <div
      onClick={onClick}
      className="group flex flex-col rounded-xl border border-border/40 bg-card/60 dark:bg-zinc-900/60 hover:bg-card dark:hover:bg-zinc-800 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer overflow-hidden"
    >
      <div className={`h-1.5 w-full ${bg}`} />
      <div className="p-3 flex flex-col flex-1 relative">
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
            <ArrowRight className="w-3 h-3 text-primary" />
          </div>
        </div>
        <h3 className="font-semibold text-sm text-foreground/90 line-clamp-1 pr-5">
          {template?.name || "Untitled Workflow"}
        </h3>
        <div className="mt-auto pt-2">
          {loading ? (
            <div className="flex items-center justify-center gap-1 py-2">
              <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <WorkflowPreview nodes={nodes} />
          )}
        </div>
      </div>
    </div>
  );
}

function WorkflowCard({ tpl, onClick, formatRunDate, variant = "recent" }: { tpl: any; onClick: () => void; formatRunDate: (d: any) => string; variant?: "recent" | "featured" }) {
  const getTemplateIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("approval") || n.includes("sign")) return <ShieldCheck className="w-5 h-5" />;
    if (n.includes("extract") || n.includes("parse")) return <Cpu className="w-5 h-5" />;
    if (n.includes("batch") || n.includes("mass")) return <Layers className="w-5 h-5" />;
    if (n.includes("compliance") || n.includes("ruleset")) return <ShieldCheck className="w-5 h-5" />;
    if (n.includes("review") || n.includes("audit")) return <Activity className="w-5 h-5" />;
    if (n.includes("database") || n.includes("sync")) return <Database className="w-5 h-5" />;
    if (n.includes("route") || n.includes("dispatch")) return <Network className="w-5 h-5" />;
    return <Zap className="w-5 h-5" />;
  };

  const getTemplateColor = (id: string) => {
    const colors = [
      { text: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", gradient: "from-amber-500 to-orange-600" },
      { text: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", gradient: "from-blue-500 to-indigo-600" },
      { text: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", gradient: "from-emerald-500 to-teal-600" },
      { text: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20", gradient: "from-rose-500 to-pink-600" },
      { text: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", gradient: "from-purple-500 to-violet-600" },
      { text: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/20", gradient: "from-cyan-500 to-sky-600" },
    ];
    const index = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  const style = getTemplateColor(String(tpl?.id || ""));
  const workflowName = String(tpl?.name || "Untitled Workflow");

  if (variant === "featured") {
    // Featured variant used in dashboard-like views
    const richMutedPalette = [
      { darkBg: "dark:bg-gradient-to-br dark:from-[#3e4a3e] dark:to-[#2d352d]", lightBg: "bg-gradient-to-br from-[#f1f5f1] to-[#e8ede8]", icon: "dark:text-[#7a9a7a] text-[#4d6a4d]", hover: "hover:shadow-emerald-500/20" },
      { darkBg: "dark:bg-gradient-to-br dark:from-[#2d3a4b] dark:to-[#1d2835]", lightBg: "bg-gradient-to-br from-[#f1f4f8] to-[#e5eaf0]", icon: "dark:text-[#7a8a9a] text-[#405060]", hover: "hover:shadow-blue-500/20" },
      { darkBg: "dark:bg-gradient-to-br dark:from-[#4a3b2d] dark:to-[#352a1d]", lightBg: "bg-gradient-to-br from-[#f8f4f1] to-[#ede8e3]", icon: "dark:text-[#9a8a7a] text-[#605040]", hover: "hover:shadow-amber-500/20" },
      { darkBg: "dark:bg-gradient-to-br dark:from-[#4a2d3a] dark:to-[#351d2a]", lightBg: "bg-gradient-to-br from-[#f8f1f4] to-[#ede4ea]", icon: "dark:text-[#9a7a8a] text-[#705060]", hover: "hover:shadow-rose-500/20" },
      { darkBg: "dark:bg-gradient-to-br dark:from-[#2d4a4a] dark:to-[#1d3535]", lightBg: "bg-gradient-to-br from-[#f1f8f8] to-[#e5eded]", icon: "dark:text-[#7a9a9a] text-[#406060]", hover: "hover:shadow-cyan-500/20" },
      { darkBg: "dark:bg-gradient-to-br dark:from-[#3d2d4a] dark:to-[#2d1d35]", lightBg: "bg-gradient-to-br from-[#f4f1f8] to-[#e8e5ed]", icon: "dark:text-[#8a7a9a] text-[#605070]", hover: "hover:shadow-purple-500/20" },
    ];
    const getRichStyle = (id: string) => {
      const index = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % richMutedPalette.length;
      return richMutedPalette[index];
    };
    const style = getRichStyle(String(tpl?.id || ""));

    return (
      <div
        className={`group flex flex-col rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${style.hover} ${style.lightBg} ${style.darkBg} border border-border/40 dark:border-white/5`}
        onClick={onClick}
      >
        <div className="flex-1 flex items-center justify-center p-6 relative min-h-[100px]">
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 dark:from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className={`w-16 h-16 rounded-2xl bg-white/60 dark:bg-white/10 backdrop-blur-md flex items-center justify-center ring-1 ring-black/[0.05] dark:ring-white/10 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
            {getTemplateIcon(workflowName)}
          </div>
        </div>
        <div className="bg-white/60 dark:bg-black/40 backdrop-blur-md p-3 border-t border-border/40 dark:border-white/5 min-h-[60px] flex flex-col justify-center">
          <h3 className="font-semibold text-[13px] text-foreground/90 dark:text-white/90 line-clamp-1 group-hover:text-foreground dark:group-hover:text-white transition-colors">
            {workflowName}
          </h3>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[9px] text-muted-foreground/60 dark:text-white/40 font-medium">Template</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group flex flex-col h-full rounded-2xl border border-border/40 bg-card/40 dark:bg-zinc-900/40 hover:bg-card dark:hover:bg-zinc-900 shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-sm"
      onClick={onClick}
    >
      <div className={`h-1.5 w-full bg-gradient-to-r ${style.gradient} opacity-80 group-hover:opacity-100 transition-opacity`} />

      <div className="p-5 flex flex-col flex-1 relative gap-4">
        <div className="flex items-start justify-between">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-sm", style.bg, style.text, style.border)}>
            {getTemplateIcon(workflowName)}
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0 transition-transform duration-300">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <ArrowRight className="w-4 h-4 text-primary" />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="font-bold text-sm text-foreground/90 group-hover:text-foreground transition-colors line-clamp-2 leading-tight">
            {workflowName}
          </h3>
          <p className="text-[11px] text-muted-foreground/70 line-clamp-2">
            Automated workflow template for enterprise processes.
          </p>
        </div>

        <div className="mt-auto pt-4 flex items-center justify-between border-t border-border/20">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
            <Calendar className="w-3 h-3 opacity-60" />
            <span>{String(tpl?.updated_at || tpl?.created_at).includes("T") ? formatRunDate(tpl?.updated_at || tpl?.created_at) : "Recent"}</span>
          </div>
          <Badge variant="outline" className="h-4 px-1.5 text-[8px] font-bold uppercase tracking-wider bg-muted/30 border-border/40 shadow-none">
            v{(tpl as any)?.latest_version ?? "1"}
          </Badge>
        </div>
      </div>
    </div>
  );
}



export default function WorkflowsPage() {
  const { bootstrapData } = useAuth();
  const { workflowsEnabled } = getOrgFeatures(bootstrapData?.orgSettings);

  if (bootstrapData && !workflowsEnabled) {
    return (
      <AppLayout>
        <AccessDenied
          title="Workflows Not Enabled"
          message="The Workflows feature is not enabled for this organization."
        />
      </AppLayout>
    );
  }

  return <WorkflowsPageInner />;
}

function WorkflowsPageInner() {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [config, setConfig] = React.useState<WorkflowConfig | null>(null);
  const [templates, setTemplates] = React.useState<WorkflowTemplate[]>([]);
  const [nodeDefinitions, setNodeDefinitions] = React.useState<WorkflowNodeDefinition[]>([]);
  const [runs, setRuns] = React.useState<WorkflowRun[]>([]);
  const [templateDefinitions, setTemplateDefinitions] = React.useState<Record<string, Record<string, any>>>({});
  const [activeRunId, setActiveRunId] = React.useState<string>("");
  const [runDetail, setRunDetail] = React.useState<any>(null);
  const [runTemplateDefinition, setRunTemplateDefinition] = React.useState<Record<string, any> | null>(null);
  const [acting, setActing] = React.useState(false);
  const [runDetailTab, setRunDetailTab] = React.useState<"overview" | "output">("overview");
  const [docLabelById, setDocLabelById] = React.useState<Record<string, string>>({});
  const [orgUsers, setOrgUsers] = React.useState<Array<{ id: string; label: string; role: string }>>([]);
  const [customDefinition, setCustomDefinition] = React.useState<Record<string, any>>(deepClone(EMPTY_BUILDER_DEFINITION));
  const [selectedBuilderStepIndex, setSelectedBuilderStepIndex] = React.useState<number | null>(null);
  const [selectedRunStepId, setSelectedRunStepId] = React.useState<string | null>(null);
  const [selectedRunTaskId, setSelectedRunTaskId] = React.useState<string>("");
  const [runTaskDecision, setRunTaskDecision] = React.useState<"approved" | "rejected">("approved");
  const [runTaskNote, setRunTaskNote] = React.useState<string>("");
  const [runTaskWaiveUnknowns, setRunTaskWaiveUnknowns] = React.useState<boolean>(false);
  const [runTaskWaiverReason, setRunTaskWaiverReason] = React.useState<string>("");
  const [runTaskEscalateToLegal, setRunTaskEscalateToLegal] = React.useState<boolean>(false);
  const [runTaskActing, setRunTaskActing] = React.useState<boolean>(false);
  const [runTaskError, setRunTaskError] = React.useState<string>("");
  const [templateActionTemplateId, setTemplateActionTemplateId] = React.useState<string | null>(null);
  const roleOptions = ["orgAdmin", "member", "viewer", "uploader"];
  const [builderTemplateId, setBuilderTemplateId] = React.useState<string>("");
  const [builderTemplateName, setBuilderTemplateName] = React.useState<string>("Untitled Workflow");
  const [builderTemplateDescription, setBuilderTemplateDescription] = React.useState<string>("");
  const [builderType, setBuilderType] = React.useState<string>("custom.workflow");
  const [templatePickerOpen, setTemplatePickerOpen] = React.useState(false);
  const [addNodeDialogOpen, setAddNodeDialogOpen] = React.useState(false);
  const [addNodeInsertIndex, setAddNodeInsertIndex] = React.useState(0);
  const [addNodeMode, setAddNodeMode] = React.useState<"existing" | "new">("existing");
  const [addNodeExistingKey, setAddNodeExistingKey] = React.useState<string>("");
  const [addNodeNewType, setAddNodeNewType] = React.useState<string>("human.review");
  const [addNodeCustomId, setAddNodeCustomId] = React.useState<string>("");
  const [addNodePromptTemplate, setAddNodePromptTemplate] = React.useState<string>("");
  const [nodeLibraryQuery, setNodeLibraryQuery] = React.useState<string>("");
  const [pageMode, setPageMode] = React.useState<WorkflowPageMode>(() => workflowModeFromPath(pathname || "/workflows"));
  const runPollTimerRef = React.useRef<number | null>(null);
  const runFetchSeqRef = React.useRef(0);
  const runAppliedSeqRef = React.useRef(0);
  const runDefinitionCacheRef = React.useRef<Map<string, Record<string, any>>>(new Map());
  const [historyStatusFilter, setHistoryStatusFilter] = React.useState<string>("all");
  const [builderOpenRunId, setBuilderOpenRunId] = React.useState<string | null>(null);

  const navigateToMode = React.useCallback((mode: WorkflowPageMode) => {
    const target = workflowPathFromMode(mode);
    if (pathname !== target) router.push(target);
    setPageMode(mode);
  }, [pathname, router]);
  const openTemplateInBuilderPage = React.useCallback((templateId: string) => {
    const nextTemplateId = String(templateId || "").trim();
    if (!nextTemplateId) return;
    router.push(`/workflows/builder?templateId=${encodeURIComponent(nextTemplateId)}`);
    setPageMode("builder");
  }, [router]);

  React.useEffect(() => {
    const nextMode = workflowModeFromPath(pathname || "/workflows");
    setPageMode((prev) => (prev === nextMode ? prev : nextMode));
  }, [pathname]);

  React.useEffect(() => {
    const panel = searchParams.get("panel");
    if (panel !== "history") return;
    navigateToMode("history");
  }, [navigateToMode, searchParams]);
  const preferredExecuteTemplateId = React.useMemo(() => {
    const raw = String(searchParams.get("templateId") || "").trim();
    return raw || null;
  }, [searchParams]);
  const preferredBuilderTemplateId = React.useMemo(() => {
    const raw = String(searchParams.get("templateId") || "").trim();
    return raw || null;
  }, [searchParams]);

  const hydrateDocLabels = React.useCallback(async (detail: any) => {
    const ids: string[] = [];
    const input = detail?.run?.input || {};
    if (typeof input?.ruleset_doc_id === "string") ids.push(input.ruleset_doc_id);
    if (typeof input?.rulesetDocId === "string") ids.push(input.rulesetDocId);
    if (Array.isArray(input?.subject_packet_doc_ids)) ids.push(...input.subject_packet_doc_ids);
    if (Array.isArray(input?.subjectPacketDocIds)) ids.push(...input.subjectPacketDocIds);
    if (typeof input?.subjectPacketId === "string") ids.push(input.subjectPacketId);

    for (const artifact of Array.isArray(detail?.artifacts) ? detail.artifacts : []) {
      if (typeof artifact?.doc_id === "string") ids.push(artifact.doc_id);
      const data = artifact?.data || {};
      if (typeof data?.report_doc_id === "string") ids.push(data.report_doc_id);
    }
    for (const step of Array.isArray(detail?.steps) ? detail.steps : []) {
      const output = step?.output || {};
      if (typeof output?.checkedDocId === "string") ids.push(output.checkedDocId);
      if (typeof output?.ruleset?.source_doc_id === "string") ids.push(output.ruleset.source_doc_id);
      if (Array.isArray(output?.evidence_doc_ids)) ids.push(...output.evidence_doc_ids);
      if (typeof output?.report?.report_doc_id === "string") ids.push(output.report.report_doc_id);
      if (Array.isArray(output?.assessment)) {
        for (const row of output.assessment) {
          const docId = row?.supporting_evidence?.doc_id;
          if (typeof docId === "string") ids.push(docId);
        }
      }
    }
    for (const finding of Array.isArray(detail?.findings) ? detail.findings : []) {
      if (typeof finding?.doc_id === "string") ids.push(finding.doc_id);
    }

    const needed = uniqueStrings(ids);
    if (needed.length === 0) return;
    const orgId = getApiContext().orgId;
    if (!orgId) return;

    const response = await apiFetch<any>(`/orgs/${orgId}/documents`, { skipCache: true });
    const list = Array.isArray(response) ? response : (Array.isArray(response?.items) ? response.items : []);
    const next: Record<string, string> = {};
    for (const doc of list) {
      if (!needed.includes(String(doc?.id || ""))) continue;
      const name = String(doc?.title || doc?.filename || doc?.name || doc?.id || "").trim();
      if (name) next[String(doc.id)] = name;
    }
    setDocLabelById((prev) => ({ ...prev, ...next }));
  }, []);

  const loadRunDetail = React.useCallback(async (runId: string) => {
    if (!runId) return null;
    const requestSeq = ++runFetchSeqRef.current;
    const detail = await getWorkflowRun(runId);
    if (requestSeq < runAppliedSeqRef.current) return detail;
    runAppliedSeqRef.current = requestSeq;
    setRunDetail((prev: any) => {
      const prevRunId = String(prev?.run?.id || "");
      const nextRunId = String(detail?.run?.id || "");
      if (prevRunId && prevRunId !== runId && nextRunId !== runId) return prev;
      return detail;
    });
    try {
      await hydrateDocLabels(detail);
    } catch {
      // Keep run detail visible even if label lookup fails.
    }
    const templateId = String(detail?.run?.workflow_template_id || "").trim();
    const templateVersion = Number(detail?.run?.workflow_template_version || 0);
    if (!templateId) {
      setRunTemplateDefinition(null);
      return detail;
    }

    const definitionCacheKey = `${templateId}:${templateVersion > 0 ? templateVersion : "latest"}`;
    const cachedDefinition = runDefinitionCacheRef.current.get(definitionCacheKey);
    if (cachedDefinition) {
      setRunTemplateDefinition(cachedDefinition);
      return detail;
    }
    setRunTemplateDefinition(null);

    try {
      const definitionRes = await getWorkflowTemplateDefinition(
        templateId,
        templateVersion > 0 ? templateVersion : undefined
      );
      const fetchedDefinition = definitionRes?.version?.definition && typeof definitionRes.version.definition === "object"
        ? deepClone(definitionRes.version.definition)
        : null;
      if (fetchedDefinition) {
        runDefinitionCacheRef.current.set(definitionCacheKey, fetchedDefinition);
        setRunTemplateDefinition(fetchedDefinition);
      } else {
        setRunTemplateDefinition(null);
      }
    } catch {
      setRunTemplateDefinition(null);
    }
    return detail;
  }, [hydrateDocLabels]);

  const reload = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [cfg, tplRes, runRes] = await Promise.all([
        getWorkflowConfig(),
        listWorkflowTemplates(false),
        listWorkflowRuns({ limit: 20 }),
      ]);
      setConfig(cfg);
      setTemplates(tplRes.templates || []);
      setRuns(runRes.runs || []);
      // Unblock first paint; fetch secondary data in background.
      setLoading(false);
      setRefreshing(false);

      void (async () => {
        try {
          const nodeRes = await listWorkflowNodeDefinitions(false);
          setNodeDefinitions(Array.isArray(nodeRes?.nodeDefinitions) ? nodeRes.nodeDefinitions : []);
        } catch {
          setNodeDefinitions([]);
        }
      })();

      void (async () => {
        try {
          const orgId = getApiContext().orgId;
          if (!orgId) return;
          const users = await apiFetch<any[]>(`/orgs/${orgId}/users`, { skipCache: true });
          setOrgUsers((users || []).map((u: any) => ({
            id: String(u?.userId || u?.id || ""),
            role: String(u?.role || "member"),
            label: String(u?.displayName || u?.username || u?.email || u?.userId || "user"),
          })).filter((u) => u.id));
        } catch {
          setOrgUsers([]);
        }
      })();

      if (activeRunId) {
        void loadRunDetail(activeRunId);
      }
    } catch (e: any) {
      toast({ title: "Failed to load workflows", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [activeRunId, loadRunDetail, toast]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (pageMode !== "run") return;
    const runId = activeRunId || String(runDetail?.run?.id || "");
    if (!runId) return;
    let cancelled = false;
    const clearPollTimer = () => {
      if (runPollTimerRef.current != null) {
        window.clearTimeout(runPollTimerRef.current);
        runPollTimerRef.current = null;
      }
    };
    const tick = async () => {
      if (cancelled) return;
      try {
        const detail = await loadRunDetail(runId);
        if (cancelled) return;
        const status = String(detail?.run?.status || "").toLowerCase();
        const shouldPoll = status === "queued" || status === "running" || status === "waiting";
        if (!shouldPoll) {
          clearPollTimer();
          return;
        }
        const delay = status === "running" ? 500 : 1100;
        runPollTimerRef.current = window.setTimeout(() => { void tick(); }, delay);
      } catch {
        if (cancelled) return;
        runPollTimerRef.current = window.setTimeout(() => { void tick(); }, 1400);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearPollTimer();
    };
  }, [activeRunId, loadRunDetail, pageMode, runDetail?.run?.id, runDetail?.run?.status]);

  const stepNodes = React.useMemo(() => {
    return Array.isArray(customDefinition?.nodes) ? customDefinition.nodes : [];
  }, [customDefinition]);

  const setStepNodes = React.useCallback((nodes: any[]) => {
    setCustomDefinition((prev) => ({ ...(prev || {}), nodes }));
  }, []);

  const builderSchemaVersion = React.useMemo(
    () => normalizeSchemaVersion(customDefinition?.schema_version),
    [customDefinition?.schema_version]
  );

  const builderNodeIds = React.useMemo(
    () => collectNodeIds(stepNodes),
    [stepNodes]
  );

  const builderEntryNodes = React.useMemo(() => {
    const raw = toStringArray(customDefinition?.entry_nodes);
    const validSet = new Set(builderNodeIds);
    const filtered = raw.filter((nodeId) => validSet.has(nodeId));
    if (filtered.length > 0) return filtered;
    return builderNodeIds.length > 0 ? [builderNodeIds[0]] : [];
  }, [builderNodeIds, customDefinition?.entry_nodes]);

  const builderExecution = React.useMemo(() => {
    const raw = isPlainObject(customDefinition?.execution) ? customDefinition.execution : {};
    const parsedParallelism = Number(raw.max_parallelism);
    const maxParallelism = Number.isFinite(parsedParallelism)
      ? Math.max(1, Math.min(50, Math.trunc(parsedParallelism)))
      : 2;
    return {
      max_parallelism: maxParallelism,
      on_node_failure: normalizeFailureMode(raw.on_node_failure),
    };
  }, [customDefinition?.execution]);

  const builderEdges = React.useMemo(
    () => normalizeGraphEdges(customDefinition?.edges),
    [customDefinition?.edges]
  );

  const sortedNodeDefinitions = React.useMemo(() => {
    return [...(nodeDefinitions || [])].sort((a, b) => {
      const an = String(a?.name || a?.node_key || "").toLowerCase();
      const bn = String(b?.name || b?.node_key || "").toLowerCase();
      return an.localeCompare(bn);
    });
  }, [nodeDefinitions]);

  const createNodeTypeOptions = React.useMemo(() => {
    const fromRegistry = sortedNodeDefinitions.map((definition) => ({
      key: String(definition.node_key || "").trim(),
      label: String(definition.name || definition.node_key || "").trim() || String(definition.node_key || "").trim(),
    })).filter((entry) => entry.key.length > 0);

    const merged: Array<{ key: string; label: string }> = [];
    const seen = new Set<string>();
    for (const entry of [...fromRegistry, ...BUILDER_FALLBACK_NODE_TYPES]) {
      const key = String(entry.key || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push({
        key,
        label: String(entry.label || key),
      });
    }
    return merged;
  }, [sortedNodeDefinitions]);

  const filteredNodeLibraryOptions = React.useMemo(() => {
    const query = String(nodeLibraryQuery || "").trim().toLowerCase();
    if (!query) return createNodeTypeOptions;
    return createNodeTypeOptions.filter((option) => (
      String(option.label || "").toLowerCase().includes(query)
      || String(option.key || "").toLowerCase().includes(query)
    ));
  }, [createNodeTypeOptions, nodeLibraryQuery]);

  const selectedAddNodeDefinition = React.useMemo(() => {
    if (!addNodeExistingKey) return null;
    return sortedNodeDefinitions.find((definition) => String(definition.node_key) === addNodeExistingKey) || null;
  }, [addNodeExistingKey, sortedNodeDefinitions]);

  const addNodeContractInputSchema = React.useMemo(() => {
    const contract = isPlainObject(selectedAddNodeDefinition?.latest_contract) ? selectedAddNodeDefinition.latest_contract : null;
    return isPlainObject(contract?.input_schema) ? contract.input_schema : {};
  }, [selectedAddNodeDefinition?.latest_contract]);

  const addNodeContractOutputSchema = React.useMemo(() => {
    const contract = isPlainObject(selectedAddNodeDefinition?.latest_contract) ? selectedAddNodeDefinition.latest_contract : null;
    return isPlainObject(contract?.output_schema) ? contract.output_schema : {};
  }, [selectedAddNodeDefinition?.latest_contract]);

  const onBuilderSchemaVersionChange = React.useCallback((version: 1 | 2) => {
    setCustomDefinition((prev) => {
      const current = prev || {};
      if (version === 1) {
        const next = {
          ...current,
          schema_version: 1,
          nodes: Array.isArray(current.nodes) ? current.nodes : [],
        };
        delete (next as any).entry_nodes;
        delete (next as any).execution;
        delete (next as any).edges;
        return next;
      }

      const nodes = Array.isArray(current.nodes) ? current.nodes : [];
      const nodeIds = collectNodeIds(nodes);
      const nextEntryNodes = toStringArray(current.entry_nodes).filter((nodeId) => nodeIds.includes(nodeId));
      const execution = isPlainObject(current.execution) ? current.execution : {};
      const parsedParallelism = Number(execution.max_parallelism);
      const maxParallelism = Number.isFinite(parsedParallelism)
        ? Math.max(1, Math.min(50, Math.trunc(parsedParallelism)))
        : 2;
      const normalizedExecution = {
        ...execution,
        max_parallelism: maxParallelism,
        on_node_failure: normalizeFailureMode(execution.on_node_failure),
      };
      const nextEdges = normalizeGraphEdges(current.edges);

      return {
        ...current,
        schema_version: 2,
        nodes,
        entry_nodes: nextEntryNodes.length > 0 ? nextEntryNodes : (nodeIds.length > 0 ? [nodeIds[0]] : []),
        execution: normalizedExecution,
        edges: nextEdges.length > 0 ? nextEdges : buildSequentialEdges(nodeIds),
      };
    });
  }, []);

  const onBuilderEntryNodesChange = React.useCallback((entryNodes: string[]) => {
    const allowed = new Set(builderNodeIds);
    const normalized = uniqueStrings(entryNodes.map((nodeId) => String(nodeId || "").trim()))
      .filter((nodeId) => allowed.has(nodeId));
    setCustomDefinition((prev) => ({
      ...(prev || {}),
      schema_version: 2,
      entry_nodes: normalized,
    }));
  }, [builderNodeIds]);

  const onBuilderExecutionChange = React.useCallback((patch: { max_parallelism?: number; on_node_failure?: "fail_fast" | "continue" }) => {
    setCustomDefinition((prev) => {
      const current = prev || {};
      const execution = isPlainObject(current.execution) ? current.execution : {};
      const nextExecution: Record<string, any> = {
        ...execution,
      };
      if (typeof patch.max_parallelism === "number" && Number.isFinite(patch.max_parallelism)) {
        nextExecution.max_parallelism = Math.max(1, Math.min(50, Math.trunc(patch.max_parallelism)));
      }
      if (patch.on_node_failure) {
        nextExecution.on_node_failure = normalizeFailureMode(patch.on_node_failure);
      }
      return {
        ...current,
        schema_version: 2,
        execution: nextExecution,
      };
    });
  }, []);

  const onBuilderEdgesChange = React.useCallback((edges: GraphEdge[]) => {
    setCustomDefinition((prev) => ({
      ...(prev || {}),
      schema_version: 2,
      edges: normalizeGraphEdges(edges),
    }));
  }, []);

  const onBuilderAutowireSequential = React.useCallback(() => {
    if (builderNodeIds.length < 2) {
      toast({
        title: "Not enough nodes to wire",
        description: "Add at least two nodes before auto-wiring edges.",
        variant: "destructive",
      });
      return;
    }
    const nextEdges = buildSequentialEdges(builderNodeIds);
    setCustomDefinition((prev) => ({
      ...(prev || {}),
      schema_version: 2,
      entry_nodes: builderNodeIds.length > 0 ? [builderNodeIds[0]] : [],
      edges: nextEdges,
      execution: {
        max_parallelism: 2,
        on_node_failure: normalizeFailureMode((isPlainObject(prev?.execution) ? prev.execution.on_node_failure : null) || "fail_fast"),
      },
    }));
    toast({
      title: "Edges auto-wired",
      description: `Created ${nextEdges.length} sequential edge${nextEdges.length === 1 ? "" : "s"}.`,
    });
  }, [builderNodeIds, toast]);

  React.useEffect(() => {
    if (stepNodes.length === 0) {
      setSelectedBuilderStepIndex(null);
      return;
    }
    setSelectedBuilderStepIndex((prev) => {
      if (prev == null) return 0;
      if (prev < 0) return 0;
      if (prev >= stepNodes.length) return stepNodes.length - 1;
      return prev;
    });
  }, [stepNodes.length]);

  const createUniqueStepId = React.useCallback((preferred?: string) => {
    const base = sanitizeStepId(String(preferred || "")) || "step";
    const used = new Set(stepNodes.map((node) => String(node?.id || "").trim()).filter(Boolean));
    if (!used.has(base)) return base;
    let suffix = 1;
    while (used.has(`${base}_${suffix}`)) suffix += 1;
    return `${base}_${suffix}`;
  }, [stepNodes]);

  const buildStepNodeDraft = React.useCallback((params?: {
    nodeType?: string;
    nodeRefKey?: string;
    nodeRefVersion?: number | null;
    preferredId?: string;
    promptTemplate?: string;
  }) => {
    const normalizedType = String(params?.nodeType || "human.review").trim() || "human.review";
    const node: Record<string, any> = {
      id: createUniqueStepId(params?.preferredId),
      node_type: normalizedType,
      output: "",
    };

    const refKey = String(params?.nodeRefKey || "").trim();
    if (refKey) {
      const version = Number(params?.nodeRefVersion || 0);
      node.node_ref = {
        key: refKey,
        version: Number.isFinite(version) && version > 0 ? Math.trunc(version) : 1,
      };
      node.nodeRef = null;
    }

    if (normalizedType.startsWith("human.")) {
      node.assignee = { type: "role", value: "orgAdmin" };
    }
    if (normalizedType === "ai.prompt") {
      node.config = {
        prompt_template: String(params?.promptTemplate || "").trim() || "Summarize the source and highlight key risks.",
        temperature: 0.2,
        response_format: "text",
        include_doc_text: true,
      };
    } else if (normalizedType === "ai.extract") {
      node.config = {
        prompt_template: String(params?.promptTemplate || "").trim() || "Extract required fields from the source content.",
        temperature: 0.1,
        include_doc_text: true,
      };
    } else if (normalizedType === "ai.classify") {
      node.config = {
        labels: ["label_a", "label_b"],
        threshold: 0.5,
        multi_label: false,
        include_doc_text: true,
      };
    } else if (normalizedType === "flow.route") {
      node.config = {
        routes: [
          { id: "high_value", expression: "$.steps.ai_extract.output.records.amount >= 100000", route: "high_value" },
          { id: "default_path", expression: "true", route: "default" },
        ],
        default_route: "default",
      };
    } else if (normalizedType === "flow.for_each") {
      node.config = {
        item_key: "item",
        max_items: 500,
      };
    } else if (normalizedType === "flow.aggregate") {
      node.config = {
        mode: "records",
      };
    } else if (normalizedType === "system.packet_check") {
      node.config = {
        required_patterns: ["KYC_*", "Agreement_*", "Invoice_*"],
        min_docs: 3,
      };
    } else if (normalizedType === "human.checklist") {
      node.config = {
        checklist_items: ["Verify required files", "Confirm extracted values", "Approve or reject packet"],
      };
    }
    return node;
  }, [createUniqueStepId]);

  const insertStepAt = React.useCallback((index: number, seedNode?: Record<string, any>) => {
    const bounded = Math.max(0, Math.min(index, stepNodes.length));
    const next = [...stepNodes];
    const draft = isPlainObject(seedNode)
      ? deepClone(seedNode)
      : buildStepNodeDraft({ nodeType: "human.review", preferredId: `step_${stepNodes.length + 1}` });
    const normalizedId = createUniqueStepId(String(draft?.id || ""));
    const nodeType = String(draft?.node_type || draft?.node_ref?.key || "human.review").trim() || "human.review";
    const nextNode: Record<string, any> = {
      ...draft,
      id: normalizedId,
      node_type: nodeType,
    };
    if (nodeType.startsWith("human.") && !isPlainObject(nextNode.assignee)) {
      nextNode.assignee = { type: "role", value: "orgAdmin" };
    }
    next.splice(bounded, 0, nextNode);
    setStepNodes(next);
    setSelectedBuilderStepIndex(bounded);
  }, [buildStepNodeDraft, createUniqueStepId, setStepNodes, stepNodes]);

  const openAddNodeDialog = React.useCallback((index: number) => {
    const bounded = Math.max(0, Math.min(index, stepNodes.length));
    const hasRegistryNodes = sortedNodeDefinitions.length > 0;
    const firstExistingKey = String(sortedNodeDefinitions[0]?.node_key || "").trim();
    const firstCreateType = createNodeTypeOptions[0]?.key || "human.review";
    setAddNodeInsertIndex(bounded);
    setAddNodeMode(hasRegistryNodes ? "existing" : "new");
    setAddNodeExistingKey(firstExistingKey);
    setAddNodeNewType(firstCreateType);
    setAddNodeCustomId("");
    setAddNodePromptTemplate("");
    setAddNodeDialogOpen(true);
  }, [createNodeTypeOptions, sortedNodeDefinitions, stepNodes.length]);

  const onConfirmAddNode = React.useCallback(() => {
    const preferredId = sanitizeStepId(addNodeCustomId);
    if (addNodeMode === "existing") {
      if (!selectedAddNodeDefinition) {
        toast({
          title: "Select a node definition",
          description: "Pick an existing node from the registry first.",
          variant: "destructive",
        });
        return;
      }
      const definitionKey = String(selectedAddNodeDefinition.node_key || "").trim();
      const latestVersion = Number(
        selectedAddNodeDefinition.latest_version
        || (isPlainObject(selectedAddNodeDefinition.latest_contract) ? selectedAddNodeDefinition.latest_contract.version : 0)
        || 1
      );
      const node = buildStepNodeDraft({
        nodeType: definitionKey || "human.review",
        nodeRefKey: definitionKey || undefined,
        nodeRefVersion: Number.isFinite(latestVersion) && latestVersion > 0 ? latestVersion : 1,
        preferredId: preferredId || definitionKey,
        promptTemplate: addNodePromptTemplate,
      });
      insertStepAt(addNodeInsertIndex, node);
      setAddNodeDialogOpen(false);
      return;
    }

    const nodeType = String(addNodeNewType || "").trim();
    if (!nodeType) {
      toast({
        title: "Select a node type",
        description: "Choose a node type to create.",
        variant: "destructive",
      });
      return;
    }
    const node = buildStepNodeDraft({
      nodeType,
      preferredId: preferredId || nodeType,
      promptTemplate: addNodePromptTemplate,
    });
    insertStepAt(addNodeInsertIndex, node);
    setAddNodeDialogOpen(false);
  }, [
    addNodeCustomId,
    addNodeInsertIndex,
    addNodeMode,
    addNodeNewType,
    addNodePromptTemplate,
    buildStepNodeDraft,
    insertStepAt,
    selectedAddNodeDefinition,
    toast,
  ]);

  const addModeNodeType = React.useMemo(() => {
    if (addNodeMode === "existing") {
      return String(selectedAddNodeDefinition?.node_key || "").trim();
    }
    return String(addNodeNewType || "").trim();
  }, [addNodeMode, addNodeNewType, selectedAddNodeDefinition?.node_key]);
  const addModeSupportsPrompt = addModeNodeType.startsWith("ai.");
  const addNodeInputFields = React.useMemo(
    () => schemaFieldKeys(addNodeContractInputSchema),
    [addNodeContractInputSchema]
  );
  const addNodeOutputFields = React.useMemo(
    () => schemaFieldKeys(addNodeContractOutputSchema),
    [addNodeContractOutputSchema]
  );

  const patchStepAt = React.useCallback((index: number, patch: Record<string, any>) => {
    if (index < 0 || index >= stepNodes.length) return;
    const next = [...stepNodes];
    next[index] = { ...(next[index] || {}), ...patch };
    setStepNodes(next);
  }, [setStepNodes, stepNodes]);

  const reorderSteps = React.useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= stepNodes.length) return;
    if (toIndex < 0 || toIndex >= stepNodes.length) return;
    const next = [...stepNodes];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setStepNodes(next);
    setSelectedBuilderStepIndex((prev) => {
      if (prev == null) return toIndex;
      if (prev === fromIndex) return toIndex;
      if (fromIndex < toIndex && prev > fromIndex && prev <= toIndex) return prev - 1;
      if (fromIndex > toIndex && prev >= toIndex && prev < fromIndex) return prev + 1;
      return prev;
    });
  }, [setStepNodes, stepNodes]);

  const moveStep = React.useCallback((index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= stepNodes.length) return;
    reorderSteps(index, target);
  }, [reorderSteps, stepNodes.length]);

  const removeStep = React.useCallback((index: number) => {
    if (index < 0 || index >= stepNodes.length) return;
    const next = stepNodes.filter((_, i) => i !== index);
    setStepNodes(next);
    setSelectedBuilderStepIndex((prev) => {
      if (next.length === 0) return null;
      if (prev == null) return 0;
      if (prev === index) return Math.min(index, next.length - 1);
      if (prev > index) return prev - 1;
      return prev;
    });
  }, [setStepNodes, stepNodes]);

  const patchStepPosition = React.useCallback((index: number, position: { x: number; y: number }) => {
    if (index < 0 || index >= stepNodes.length) return;
    const next = [...stepNodes];
    const current = next[index] || {};
    const metadata = isPlainObject(current?.metadata) ? { ...current.metadata } : {};
    const currentUi = isPlainObject(metadata?.ui) ? { ...metadata.ui } : {};
    metadata.ui = {
      ...currentUi,
      x: Math.max(12, Math.round(Number(position?.x || 0))),
      y: Math.max(12, Math.round(Number(position?.y || 0))),
    };
    next[index] = {
      ...current,
      metadata,
    };
    setStepNodes(next);
  }, [setStepNodes, stepNodes]);

  const connectBuilderNodes = React.useCallback((fromNodeId: string, toNodeId: string) => {
    const from = String(fromNodeId || "").trim();
    const to = String(toNodeId || "").trim();
    if (!from || !to || from === to) return;

    setCustomDefinition((prev) => {
      const current = prev || {};
      const nodes = Array.isArray(current.nodes) ? current.nodes : [];
      const nodeIds = collectNodeIds(nodes);
      if (!nodeIds.includes(from) || !nodeIds.includes(to)) return current;

      const existingEdges = normalizeGraphEdges(current.edges);
      const hasSame = existingEdges.some((edge) => edge.from === from && edge.to === to);
      if (hasSame) return current;

      const existingEntries = toStringArray(current.entry_nodes).filter((nodeId) => nodeIds.includes(nodeId));
      const existingExecution = isPlainObject(current.execution) ? current.execution : {};
      const parsedParallelism = Number(existingExecution.max_parallelism);
      const maxParallelism = Number.isFinite(parsedParallelism)
        ? Math.max(1, Math.min(50, Math.trunc(parsedParallelism)))
        : 2;
      const edgeIdBase = `${from}_to_${to}`.replace(/[^A-Za-z0-9_-]/g, "_");
      let suffix = existingEdges.length + 1;
      let edgeId = `${edgeIdBase}_${suffix}`;
      const usedIds = new Set(existingEdges.map((edge) => String(edge.id || "").trim()));
      while (usedIds.has(edgeId)) {
        suffix += 1;
        edgeId = `${edgeIdBase}_${suffix}`;
      }

      return {
        ...current,
        schema_version: 2,
        nodes,
        entry_nodes: existingEntries.length > 0 ? existingEntries : (nodeIds.length > 0 ? [nodeIds[0]] : []),
        execution: {
          ...existingExecution,
          max_parallelism: maxParallelism,
          on_node_failure: normalizeFailureMode(existingExecution.on_node_failure),
        },
        edges: [
          ...existingEdges,
          {
            id: edgeId,
            from,
            to,
            when: { type: "always" },
          },
        ],
      };
    });
  }, []);

  const deleteBuilderEdge = React.useCallback((edgeId: string) => {
    const target = String(edgeId || "").trim();
    if (!target) return;
    setCustomDefinition((prev) => {
      const current = prev || {};
      const nextEdges = normalizeGraphEdges(current.edges).filter((edge) => edge.id !== target);
      return {
        ...current,
        schema_version: 2,
        edges: nextEdges,
      };
    });
  }, []);

  const loadTemplateIntoBuilder = React.useCallback(async (templateId: string) => {
    if (!templateId) return;
    const res = await getWorkflowTemplateDefinition(templateId);
    const definition = res?.version?.definition && typeof res.version.definition === "object"
      ? deepClone(res.version.definition)
      : { schema_version: 1, type: "custom.workflow", nodes: [] };
    if (!Array.isArray(definition.nodes)) definition.nodes = [];
    setCustomDefinition(definition);
    setBuilderTemplateId(templateId);
    setBuilderTemplateName(String(res?.template?.name || ""));
    setBuilderTemplateDescription(String(res?.template?.description || ""));
    setBuilderType(String(definition?.type || "custom.workflow"));
    setSelectedBuilderStepIndex(definition.nodes.length > 0 ? 0 : null);
  }, []);

  const loadTemplateDefinitionForPreview = React.useCallback(async (templateId: string) => {
    if (templateDefinitions[templateId]) return templateDefinitions[templateId];
    try {
      const res = await getWorkflowTemplateDefinition(templateId);
      const definition = res?.version?.definition && typeof res.version.definition === "object"
        ? res.version.definition
        : { nodes: [] };
      setTemplateDefinitions(prev => ({ ...prev, [templateId]: definition }));
      return definition;
    } catch {
      return { nodes: [] };
    }
  }, [templateDefinitions]);

  const onCreateNewBuilderTemplate = React.useCallback(() => {
    setBuilderTemplateId("");
    setCustomDefinition(deepClone(EMPTY_BUILDER_DEFINITION));
    setBuilderTemplateName("Untitled Workflow");
    setBuilderTemplateDescription("");
    setBuilderType("custom.workflow");
    setSelectedBuilderStepIndex(null);
  }, []);

  const activeBuilderTemplateLabel = React.useMemo(() => {
    if (!builderTemplateId) return "Draft Template";
    const found = templates.find((tpl) => tpl.id === builderTemplateId);
    return String(found?.name || builderTemplateName || "Template");
  }, [builderTemplateId, builderTemplateName, templates]);

  const firstForkBySourceTemplateId = React.useMemo(() => {
    const map = new Map<string, WorkflowTemplate>();
    for (const tpl of templates) {
      if (templateScopeOf(tpl) !== "org") continue;
      const sourceId = String(tpl?.source_template_id || "").trim();
      if (!sourceId) continue;
      if (!map.has(sourceId)) map.set(sourceId, tpl);
    }
    return map;
  }, [templates]);

  const activeBuilderTemplate = React.useMemo(
    () => templates.find((tpl) => tpl.id === builderTemplateId) || null,
    [builderTemplateId, templates]
  );
  const builderIsSystemTemplate = templateScopeOf(activeBuilderTemplate) === "system";
  const availableTemplates = React.useMemo(
    () => templates.filter((tpl) => templateScopeOf(tpl) === "org"),
    [templates]
  );
  const systemTemplates = React.useMemo(
    () => templates.filter((tpl) => templateScopeOf(tpl) === "system"),
    [templates]
  );
  const templatesForCatalog = React.useMemo(
    () => (systemTemplates.length > 0 ? systemTemplates : availableTemplates),
    [availableTemplates, systemTemplates]
  );
  const templateNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const tpl of templates) {
      const id = String(tpl?.id || "").trim();
      if (!id) continue;
      const name = String(tpl?.name || "").trim() || "Untitled Workflow";
      map.set(id, name);
    }
    return map;
  }, [templates]);
  const recentRuns = React.useMemo(() => {
    const sorted = [...runs].sort((a: any, b: any) => {
      const aStarted = toTimestampMs(a?.started_at || a?.created_at || a?.updated_at || null) || 0;
      const bStarted = toTimestampMs(b?.started_at || b?.created_at || b?.updated_at || null) || 0;
      return bStarted - aStarted;
    });
    return sorted.slice(0, 8);
  }, [runs]);

  const forkTemplateForBuilder = React.useCallback(async (sourceTemplateId: string, definitionToSave?: Record<string, any>) => {
    const sourceTemplate = templates.find((tpl) => tpl.id === sourceTemplateId) || null;
    const sourceName = String(sourceTemplate?.name || builderTemplateName || "Workflow Template").trim();
    const forkName = `${sourceName} (Fork)`;
    const forked = await forkWorkflowTemplate(sourceTemplateId, {
      name: forkName,
      description: sourceTemplate?.description || builderTemplateDescription || undefined,
      isActive: true,
      changeNote: "Forked from system template via workflow builder",
    });

    const forkTemplateId = String(forked?.template?.id || "").trim();
    if (!forkTemplateId) throw new Error("Fork succeeded but template id is missing");

    let forkVersion = Number(forked?.version?.version || 1) || 1;
    if (definitionToSave && typeof definitionToSave === "object") {
      const definitionMode = inferDefinitionMode(definitionToSave);
      const versionRes = await createWorkflowTemplateVersion(forkTemplateId, {
        definition: definitionToSave,
        definitionMode,
        changeNote: "Builder edits applied after forking system template",
      });
      forkVersion = Number(versionRes?.version?.version || forkVersion) || forkVersion;
    }

    return {
      templateId: forkTemplateId,
      version: forkVersion,
      sourceTemplateName: sourceName,
    };
  }, [builderTemplateDescription, builderTemplateName, templates]);

  const onUseTemplateFromLibrary = React.useCallback(async (templateId: string) => {
    if (!templateId) return;
    await loadTemplateIntoBuilder(templateId);
    setTemplatePickerOpen(false);
  }, [loadTemplateIntoBuilder]);

  const openTemplateInBuilder = React.useCallback(async (templateId: string) => {
    const nextTemplateId = String(templateId || "").trim();
    if (!nextTemplateId) return;
    try {
      await loadTemplateIntoBuilder(nextTemplateId);
      navigateToMode("builder");
    } catch (e: any) {
      toast({
        title: "Failed to open workflow",
        description: e?.message || "Unable to load template in builder",
        variant: "destructive",
      });
    }
  }, [loadTemplateIntoBuilder, navigateToMode, toast]);
  const onForkTemplateFromLibrary = React.useCallback(async (templateId: string) => {
    if (!templateId) return;
    setTemplateActionTemplateId(templateId);
    try {
      const forked = await forkTemplateForBuilder(templateId);
      await reload();
      await loadTemplateIntoBuilder(forked.templateId);
      setTemplatePickerOpen(false);
      toast({
        title: "Template forked",
        description: `Created fork ${forked.templateId}`,
      });
    } catch (e: any) {
      toast({
        title: "Fork failed",
        description: e?.message || "Unable to fork template",
        variant: "destructive",
      });
    } finally {
      setTemplateActionTemplateId(null);
    }
  }, [forkTemplateForBuilder, loadTemplateIntoBuilder, reload, toast]);

  const onEditForkFromLibrary = React.useCallback(async (templateId: string, linkedForkId: string | null) => {
    if (!templateId) return;
    const selected = templates.find((tpl) => tpl.id === templateId) || null;
    if (!selected) return;
    const scope = templateScopeOf(selected);
    if (scope === "org") {
      await loadTemplateIntoBuilder(selected.id);
      setTemplatePickerOpen(false);
      return;
    }

    const existingForkId = String(linkedForkId || firstForkBySourceTemplateId.get(templateId)?.id || "").trim();
    if (existingForkId) {
      await loadTemplateIntoBuilder(existingForkId);
      setTemplatePickerOpen(false);
      return;
    }

    await onForkTemplateFromLibrary(templateId);
  }, [firstForkBySourceTemplateId, loadTemplateIntoBuilder, onForkTemplateFromLibrary, templates]);

  const getBuilderDefinition = React.useCallback(() => {
    const base = deepClone(customDefinition || {});
    const normalized = normalizeBuilderNodesForSave(stepNodes);
    const normalizedNodes = normalized.nodes;
    const normalizedNodeIds = collectNodeIds(normalizedNodes);
    const validNodeIdSet = new Set(normalizedNodeIds);
    const baseDefinition = {
      ...base,
      schema_version: builderSchemaVersion,
      type: builderType || String(base?.type || "custom.workflow"),
      nodes: normalizedNodes,
    };

    if (builderSchemaVersion === 2) {
      const normalizedEntries = uniqueStrings(
        builderEntryNodes
          .map((nodeId) => normalized.idMap.get(String(nodeId || "").trim()) || sanitizeStepId(String(nodeId || "").trim()))
          .filter((nodeId) => validNodeIdSet.has(nodeId))
      );
      const normalizedEdges = normalizeBuilderEdgesForSave(builderEdges, normalized.idMap, validNodeIdSet);
      return {
        ...baseDefinition,
        entry_nodes: normalizedEntries.length > 0
          ? normalizedEntries
          : (normalizedNodeIds.length > 0 ? [normalizedNodeIds[0]] : []),
        execution: builderExecution,
        edges: normalizedEdges,
      };
    }

    delete (baseDefinition as any).entry_nodes;
    delete (baseDefinition as any).execution;
    delete (baseDefinition as any).edges;
    return baseDefinition;
  }, [builderEdges, builderEntryNodes, builderExecution, builderSchemaVersion, builderType, customDefinition, stepNodes]);

  const ensureScenarioTemplate = async () => {
    const definitionToSave = getBuilderDefinition();
    setCustomDefinition(deepClone(definitionToSave));
    const definitionMode = inferDefinitionMode(definitionToSave);
    if (builderTemplateId) {
      if (builderIsSystemTemplate) {
        const forked = await forkTemplateForBuilder(builderTemplateId, definitionToSave);
        return {
          templateId: forked.templateId,
          version: forked.version,
          created: true,
          forked: true,
        };
      }
      const versionRes = await createWorkflowTemplateVersion(builderTemplateId, {
        definition: definitionToSave,
        definitionMode,
        changeNote: "Workflow builder update from UI",
      });
      return {
        templateId: builderTemplateId,
        version: versionRes.version?.version,
        created: false,
        forked: false,
      };
    }

    const templateName = builderTemplateName.trim() || "Untitled Workflow";
    const wanted = normalizeTemplateName(templateName);
    const existing = templates.find((t) => normalizeTemplateName(String(t?.name || "")) === wanted);
    if (!existing) {
      const created = await createWorkflowTemplate({
        name: templateName,
        description: builderTemplateDescription,
        isActive: true,
        definition: definitionToSave,
        definitionMode,
        changeNote: "Scenario template bootstrap from UI",
      });
      return { templateId: created.template.id, version: 1, created: true, forked: false };
    }

    const versionRes = await createWorkflowTemplateVersion(existing.id, {
      definition: definitionToSave,
      definitionMode,
      changeNote: "Scenario version update from UI",
    });
    return {
      templateId: existing.id,
      version: versionRes.version?.version || existing.latest_version || undefined,
      created: false,
      forked: false,
    };
  };

  const onCreateOrUpdateScenarioTemplate = async () => {
    setActing(true);
    try {
      const result = await ensureScenarioTemplate();
      setBuilderTemplateId(result.templateId);
      toast({
        title: result.forked ? "Template forked and updated" : (result.created ? "Template created" : "Template version added"),
        description: `Template id: ${result.templateId}`,
      });
      await reload();
    } catch (e: any) {
      toast({ title: "Template action failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const onRunScenario = async () => {
    if (builderSchemaVersion === 2 && config?.dagExecutorEnabled === false) {
      toast({
        title: "DAG executor is disabled",
        description: "Schema v2 workflows require DAG runtime. Enable WORKFLOWS_DAG_EXECUTOR_ENABLED=true or remove the explicit false override.",
        variant: "destructive",
      });
      return;
    }

    setActing(true);
    try {
      const parsedInput: Record<string, any> = {};
      const parsedContext: Record<string, any> = { source: "workflow-builder" };

      const ensured = await ensureScenarioTemplate();
      setBuilderTemplateId(ensured.templateId);
      const idempotencyKey = `ui-builder-${Date.now()}`;
      const runRes = await runWorkflowManual({
        templateId: ensured.templateId,
        templateVersion: ensured.version,
        input: parsedInput,
        context: parsedContext,
        idempotencyKey,
      });
      runFetchSeqRef.current = 0;
      runAppliedSeqRef.current = 0;
      setActiveRunId(runRes.run.id);
      toast({ title: "Workflow run created", description: `Run: ${runRes.run.id}` });
      await reload();
      await loadRunDetail(runRes.run.id);
      setRunDetailTab("overview");
      setPageMode("run");
    } catch (e: any) {
      toast({ title: "Run failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const onOpenRun = async (runId: string) => {
    const trimmed = String(runId || "").trim();
    if (!trimmed) return;

    const resolveByRunPrefix = async (prefix: string) => {
      const localMatches = runs.filter((r) => typeof r?.id === "string" && r.id.startsWith(prefix));
      if (localMatches.length === 1) return localMatches[0].id;
      const remote = await listWorkflowRuns({ limit: 200 });
      const remoteMatches = (remote?.runs || []).filter((r) => typeof r?.id === "string" && r.id.startsWith(prefix));
      if (remoteMatches.length === 1) return remoteMatches[0].id;
      return null;
    };

    const resolveFromReportDoc = async (docId: string) => {
      const orgId = getApiContext().orgId;
      if (!orgId) return null;
      try {
        const doc = await apiFetch<any>(`/orgs/${orgId}/documents/${docId}`, { skipCache: true });
        const filename = String(doc?.filename || doc?.title || doc?.name || "").trim();
        const m = filename.match(/_([0-9a-f]{8})\.pdf$/i);
        if (!m) return null;
        return await resolveByRunPrefix(m[1]);
      } catch {
        return null;
      }
    };

    try {
      let resolvedRunId: string | null = null;
      if (isUuidLike(trimmed)) {
        resolvedRunId = trimmed;
      } else {
        resolvedRunId = await resolveByRunPrefix(trimmed);
      }

      if (!resolvedRunId && isUuidLike(trimmed)) {
        resolvedRunId = await resolveFromReportDoc(trimmed);
      }

      if (!resolvedRunId) {
        toast({
          title: "Run not resolved",
          description: "Use a run id from Run Explorer, or paste a report doc id created by this workflow.",
          variant: "destructive",
        });
        return;
      }

      runFetchSeqRef.current = 0;
      runAppliedSeqRef.current = 0;
      setActiveRunId(resolvedRunId);
      await loadRunDetail(resolvedRunId);
      setRunDetailTab("overview");
      setPageMode("run");
    } catch (e: any) {
      if ((e as any)?.status === 404 && isUuidLike(trimmed)) {
        const fromDoc = await resolveFromReportDoc(trimmed);
        if (fromDoc) {
          runFetchSeqRef.current = 0;
          runAppliedSeqRef.current = 0;
          setActiveRunId(fromDoc);
          await loadRunDetail(fromDoc);
          setRunDetailTab("overview");
          setPageMode("run");
          return;
        }
      }
      toast({ title: "Failed to load run", description: e?.message || "Unknown error", variant: "destructive" });
    }
  };

  React.useEffect(() => {
    let cancelled = false;

    const parseRunIdFromHash = () => {
      if (typeof window === "undefined") return "";
      const raw = String(window.location.hash || "").trim();
      if (!raw) return "";
      const cleaned = raw.startsWith("#") ? raw.slice(1) : raw;
      if (!cleaned) return "";
      if (cleaned.startsWith("run-")) return cleaned.slice(4).trim();
      return cleaned.trim();
    };

    const openFromHash = async () => {
      const runId = parseRunIdFromHash();
      if (!runId) return;
      if (cancelled) return;
      await onOpenRun(runId);
    };

    const onHashChange = () => { void openFromHash(); };
    void openFromHash();
    window.addEventListener("hashchange", onHashChange);

    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [onOpenRun]);

  const complianceView = React.useMemo(() => {
    if (!runDetail) return null;
    const run = runDetail?.run || {};
    const steps = Array.isArray(runDetail?.steps) ? runDetail.steps : [];
    const artifacts = Array.isArray(runDetail?.artifacts) ? runDetail.artifacts : [];
    const input = run?.input || {};
    const rulesetDocId = (
      typeof input?.ruleset_doc_id === "string" ? input.ruleset_doc_id
        : typeof input?.rulesetDocId === "string" ? input.rulesetDocId
          : null
    );
    const parseStep = steps.find((s: any) => String(s?.node_type || "").toLowerCase() === "ai.parse_ruleset");
    const factsStep = steps.find((s: any) => String(s?.node_type || "").toLowerCase() === "ai.extract_facts");
    const evalStep = steps.find((s: any) => String(s?.node_type || "").toLowerCase() === "system.evaluate");
    const reportStep = steps.find((s: any) => String(s?.node_type || "").toLowerCase() === "ai.generate_report");
    const summary = reportStep?.output?.report?.summary || evalStep?.output?.summary || null;
    const recommendation = reportStep?.output?.report?.final_recommendation || null;

    const subjectDocIds = uniqueStrings([
      ...(Array.isArray(input?.subject_packet_doc_ids) ? input.subject_packet_doc_ids : []),
      ...(Array.isArray(input?.subjectPacketDocIds) ? input.subjectPacketDocIds : []),
      ...(typeof input?.subjectPacketId === "string" ? [input.subjectPacketId] : []),
      ...(Array.isArray(factsStep?.output?.evidence_doc_ids) ? factsStep.output.evidence_doc_ids : []),
    ]);

    const evidenceIds = uniqueStrings(
      (Array.isArray(evalStep?.output?.assessment) ? evalStep.output.assessment : [])
        .map((row: any) => row?.supporting_evidence?.doc_id)
    );
    const comparedDocIds = subjectDocIds.length > 0 ? subjectDocIds : evidenceIds;
    const caseFolder = String(
      input?.caseFolder ||
      reportStep?.output?.case_folder ||
      artifacts.find((a: any) => a?.data?.case_folder)?.data?.case_folder ||
      ""
    );
    const normalizedRulesetDocId = rulesetDocId || parseStep?.output?.ruleset?.source_doc_id || null;

    const reports = artifacts
      .filter((a: any) => String(a?.artifact_type || "") === "generated_doc" && String(a?.data?.kind || "") === "compliance_report_pdf")
      .map((a: any) => ({
        id: String(a.id),
        filename: String(a?.data?.filename || a?.title || "Compliance report"),
        docId: typeof a?.doc_id === "string" ? a.doc_id : null,
        storageKey: typeof a?.storage_key === "string" ? a.storage_key : null,
      }));

    const reportDocId = reportStep?.output?.report?.report_doc_id;
    if (typeof reportDocId === "string" && !reports.some((r: any) => r.docId === reportDocId)) {
      reports.push({
        id: `step-${reportDocId}`,
        filename: String(reportStep?.output?.report?.report_filename || "Compliance report"),
        docId: reportDocId,
        storageKey: String(reportStep?.output?.report?.report_storage_key || ""),
      });
    }

    const isComplianceLike = Boolean(normalizedRulesetDocId || comparedDocIds.length > 0 || reports.length > 0 || evalStep || reportStep);
    if (!isComplianceLike) return null;
    const assessmentRows = Array.isArray(evalStep?.output?.assessment) ? evalStep.output.assessment : [];

    return {
      caseFolder,
      rulesetDocId: normalizedRulesetDocId,
      rulesetVersionHash: parseStep?.output?.ruleset?.version_hash || null,
      comparedDocIds,
      reports,
      assessmentRows,
      summary,
      recommendation,
      findingsCount: Array.isArray(runDetail?.findings) ? runDetail.findings.length : 0,
      openTasksCount: (Array.isArray(runDetail?.tasks) ? runDetail.tasks : []).filter((t: any) => isTaskPending(t?.status)).length,
      runStatus: run?.status || "-",
    };
  }, [runDetail]);

  const runAssessment = React.useMemo(() => {
    const rows = Array.isArray(complianceView?.assessmentRows) ? complianceView.assessmentRows : [];
    const counts = { pass: 0, fail: 0, unknown: 0 };
    for (const row of rows) {
      const result = normalizeAssessmentResult(row?.result || row?.status);
      counts[result] += 1;
    }

    if (counts.pass + counts.fail + counts.unknown === 0) {
      counts.pass = Number(complianceView?.summary?.pass || 0);
      counts.fail = Number(complianceView?.summary?.fail || 0);
      counts.unknown = Number(complianceView?.summary?.unknown || 0);
    }

    const issueRows = rows.filter((row: any) => {
      const result = normalizeAssessmentResult(row?.result || row?.status);
      return result === "fail" || result === "unknown";
    });

    const recommendation = String(complianceView?.recommendation || "").trim() || (
      counts.fail > 0
        ? "Requires remediation before approval."
        : counts.unknown > 0
          ? "Needs reviewer sign-off for unknown findings."
          : "Compliant based on available evidence."
    );

    const runStatus = String(complianceView?.runStatus || "").toLowerCase();
    const overallOutcome: "pass" | "fail" | "unknown" = counts.fail > 0
      ? "fail"
      : counts.unknown > 0
        ? "unknown"
        : counts.pass > 0
          ? "pass"
          : (runStatus === "failed" ? "fail" : "unknown");

    return {
      rows,
      issueRows,
      counts,
      recommendation,
      overallOutcome,
    };
  }, [complianceView]);

  const labelForDoc = React.useCallback((docId: string | null) => {
    if (!docId) return "N/A";
    return docLabelById[docId] || docId;
  }, [docLabelById]);

  const selectedBuilderNode = React.useMemo(() => {
    if (selectedBuilderStepIndex == null) return null;
    return stepNodes[selectedBuilderStepIndex] || null;
  }, [selectedBuilderStepIndex, stepNodes]);

  const patchSelectedBuilderNode = React.useCallback((patch: Record<string, any>) => {
    if (selectedBuilderStepIndex == null) return;
    patchStepAt(selectedBuilderStepIndex, patch);
  }, [patchStepAt, selectedBuilderStepIndex]);

  const moveSelectedBuilderNode = React.useCallback((delta: -1 | 1) => {
    if (selectedBuilderStepIndex == null) return;
    moveStep(selectedBuilderStepIndex, delta);
  }, [moveStep, selectedBuilderStepIndex]);

  const deleteSelectedBuilderNode = React.useCallback(() => {
    if (selectedBuilderStepIndex == null) return;
    removeStep(selectedBuilderStepIndex);
  }, [removeStep, selectedBuilderStepIndex]);

  const runSteps = React.useMemo(() => {
    return Array.isArray(runDetail?.steps) ? runDetail.steps : [];
  }, [runDetail?.steps]);

  const runGraph = React.useMemo(() => {
    if (runTemplateDefinition && typeof runTemplateDefinition === "object") {
      return buildLiveRunGraph(runTemplateDefinition, runSteps);
    }
    return buildRunGraph(runSteps);
  }, [runSteps, runTemplateDefinition]);

  React.useEffect(() => {
    if (runSteps.length === 0) {
      setSelectedRunStepId(null);
      return;
    }
    setSelectedRunStepId((prev) => {
      if (prev && runSteps.some((step: any) => String(step?.id || "") === prev)) return prev;
      return detectCurrentStepId(runSteps) || String(runSteps[0]?.id || "");
    });
  }, [runSteps]);

  const selectedRunStep = React.useMemo(() => {
    if (runSteps.length === 0) return null;
    if (selectedRunStepId) {
      const found = runSteps.find((step: any) => String(step?.id || "") === selectedRunStepId);
      if (found) return found;
      return null;
    }
    return runSteps[0] || null;
  }, [runSteps, selectedRunStepId]);

  const selectedRunArtifacts = React.useMemo(() => {
    const list = Array.isArray(runDetail?.artifacts) ? runDetail.artifacts : [];
    const stepId = String(selectedRunStep?.id || "");
    const nodeId = String(selectedRunStep?.node_id || "");
    if (!stepId && !nodeId) return [];
    return list.filter((artifact: any) => {
      const linkedStepIds = [
        artifact?.step_id,
        artifact?.workflow_step_id,
        artifact?.source_step_id,
        artifact?.node_step_id,
      ].map((v) => String(v || ""));
      const linkedNodeIds = [
        artifact?.node_id,
        artifact?.nodeId,
      ].map((v) => String(v || ""));
      return (stepId && linkedStepIds.includes(stepId)) || (nodeId && linkedNodeIds.includes(nodeId));
    });
  }, [runDetail?.artifacts, selectedRunStep?.id, selectedRunStep?.node_id]);

  const selectedRunFindings = React.useMemo(() => {
    const list = Array.isArray(runDetail?.findings) ? runDetail.findings : [];
    const stepId = String(selectedRunStep?.id || "");
    const nodeId = String(selectedRunStep?.node_id || "");
    if (!stepId && !nodeId) return [];
    return list.filter((finding: any) => {
      const linkedStepIds = [
        finding?.step_id,
        finding?.workflow_step_id,
        finding?.source_step_id,
      ].map((v) => String(v || ""));
      const linkedNodeIds = [
        finding?.node_id,
        finding?.nodeId,
      ].map((v) => String(v || ""));
      return (stepId && linkedStepIds.includes(stepId)) || (nodeId && linkedNodeIds.includes(nodeId));
    });
  }, [runDetail?.findings, selectedRunStep?.id, selectedRunStep?.node_id]);

  const selectedRunTasks = React.useMemo(() => {
    const list = Array.isArray(runDetail?.tasks) ? runDetail.tasks : [];
    const stepId = String(selectedRunStep?.id || "");
    const nodeId = String(selectedRunStep?.node_id || "");
    if (!stepId && !nodeId) return [];
    return list.filter((task: any) => {
      const linkedStepIds = [
        task?.step_id,
        task?.workflow_step_id,
        task?.source_step_id,
      ].map((v) => String(v || ""));
      const linkedNodeIds = [
        task?.node_id,
        task?.nodeId,
      ].map((v) => String(v || ""));
      return (stepId && linkedStepIds.includes(stepId)) || (nodeId && linkedNodeIds.includes(nodeId));
    });
  }, [runDetail?.tasks, selectedRunStep?.id, selectedRunStep?.node_id]);

  const selectedRunUserOutput = React.useMemo(() => {
    const nodeType = String(selectedRunStep?.node_type || selectedRunStep?.node_id || "").toLowerCase();
    const output = (selectedRunStep?.output && typeof selectedRunStep.output === "object")
      ? stripModelFields(selectedRunStep.output)
      : {};
    const text = typeof output?.response_text === "string" ? output.response_text.trim() : "";
    const responseJson = output?.response_json && typeof output.response_json === "object" ? output.response_json : null;
    const responseFormat = typeof output?.response_format === "string" ? output.response_format : null;
    const generatedDocId = typeof output?.generated_doc_id === "string" ? output.generated_doc_id : null;
    const generatedDocTitle = typeof output?.generated_doc_title === "string"
      ? output.generated_doc_title
      : (typeof output?.generated_doc_filename === "string" ? output.generated_doc_filename : null);
    const jsonRows = compactOutputRows(responseJson, 10);
    const genericRows = compactOutputRows(output, 8);
    return {
      nodeType,
      text,
      responseFormat,
      jsonRows,
      generatedDocId,
      generatedDocTitle,
      genericRows,
    };
  }, [selectedRunStep]);

  const selectedRunActionFindings = React.useMemo(() => {
    return selectedRunFindings.filter((finding: any) => {
      const result = normalizeAssessmentResult(finding?.result || finding?.status);
      return result !== "pass";
    });
  }, [selectedRunFindings]);

  const selectedRunOpenTasks = React.useMemo(() => {
    return selectedRunTasks.filter((task: any) => isTaskPending(task?.status));
  }, [selectedRunTasks]);

  const activeSelectedRunTask = React.useMemo(() => {
    return selectedRunOpenTasks.find((task: any) => String(task?.id || "") === selectedRunTaskId) || null;
  }, [selectedRunOpenTasks, selectedRunTaskId]);

  React.useEffect(() => {
    if (selectedRunOpenTasks.length === 0) {
      setSelectedRunTaskId("");
      return;
    }
    setSelectedRunTaskId((prev) => {
      if (prev && selectedRunOpenTasks.some((task: any) => String(task?.id || "") === prev)) return prev;
      return String(selectedRunOpenTasks[0]?.id || "");
    });
  }, [selectedRunOpenTasks]);

  React.useEffect(() => {
    setRunTaskError("");
  }, [selectedRunTaskId, runTaskDecision, runTaskWaiveUnknowns, runTaskWaiverReason, runTaskEscalateToLegal]);

  const submitRunTaskDecision = React.useCallback(async () => {
    if (!selectedRunTaskId) return;
    if (runTaskDecision === "approved" && runTaskWaiveUnknowns && !String(runTaskWaiverReason || "").trim()) {
      setRunTaskError("Waiver reason is required when waiving unknown findings.");
      return;
    }

    setRunTaskActing(true);
    setRunTaskError("");
    try {
      await completeWorkflowTask(selectedRunTaskId, {
        decision: runTaskDecision,
        note: runTaskNote || undefined,
        waiveUnknowns: runTaskWaiveUnknowns || undefined,
        waiverReason: runTaskWaiverReason || undefined,
        escalateToLegal: runTaskEscalateToLegal || undefined,
      });

      const currentRunId = String(activeSelectedRunTask?.workflow_run_id || runDetail?.run?.id || activeRunId || "");
      if (currentRunId) {
        await loadRunDetail(currentRunId);
      }

      setRunTaskNote("");
      setRunTaskWaiveUnknowns(false);
      setRunTaskWaiverReason("");
      setRunTaskEscalateToLegal(false);

      toast({
        title: runTaskDecision === "approved" ? "Task approved" : "Task rejected",
        description: "Run status has been updated.",
      });
    } catch (e: any) {
      const status = Number(e?.status || e?.data?.statusCode || 0);
      const message = String(e?.message || "Failed to submit task decision");
      if (status === 409 && message.toLowerCase().includes("unknown findings must be resolved")) {
        setRunTaskError("Approval blocked: unresolved unknown findings. Resolve findings or waive unknown findings with a reason.");
      } else if (status === 400 && message.toLowerCase().includes("waiverreason is required")) {
        setRunTaskError("Waiver reason is required when waiving unknown findings.");
      } else {
        setRunTaskError(message);
      }
      toast({
        title: "Task action failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRunTaskActing(false);
    }
  }, [
    activeRunId,
    activeSelectedRunTask?.workflow_run_id,
    loadRunDetail,
    runDetail?.run?.id,
    runTaskDecision,
    runTaskEscalateToLegal,
    runTaskNote,
    runTaskWaiveUnknowns,
    runTaskWaiverReason,
    selectedRunTaskId,
    toast,
  ]);

  const runMeta = React.useMemo(() => {
    const run = runDetail?.run || {};
    const startedRaw = run?.started_at || run?.startedAt || run?.created_at || run?.createdAt || null;
    const completedRaw = run?.completed_at || run?.completedAt || run?.updated_at || run?.updatedAt || null;
    const startedMs = toTimestampMs(startedRaw);
    const completedMs = toTimestampMs(completedRaw);
    const effectiveEnd = completedMs ?? (startedMs ? Date.now() : null);
    const durationMs = startedMs && effectiveEnd ? Math.max(0, effectiveEnd - startedMs) : null;
    return {
      runId: String(run?.id || "-"),
      status: String(run?.status || "-"),
      startedAt: formatRunDate(startedRaw),
      completedAt: formatRunDate(completedRaw),
      duration: durationMs != null ? formatDurationMs(durationMs) : "n/a",
      templateVersion: run?.workflow_template_version ?? run?.template_version ?? "-",
    };
  }, [runDetail?.run]);

  const dagExecutorEnabled = config?.dagExecutorEnabled !== false;
  const isDagRunBlocked = builderSchemaVersion === 2 && !dagExecutorEnabled;
  const workspaceHeaderTitle = pageMode === "run"
    ? "Run Insights"
    : (pageMode === "history"
      ? "Run History"
      : (pageMode === "my-workflows"
        ? "My Workflows"
        : (pageMode === "templates-list"
          ? "Workflow Templates"
          : (pageMode === "home" ? "Workflow Home" : "Workflow Runs"))));
  const workspaceHeaderName = pageMode === "run"
    ? (runDetail ? `Run ${runMeta.runId}` : "No Run Selected")
    : (pageMode === "history"
      ? `${runs.length} Runs`
      : (pageMode === "my-workflows"
        ? `${availableTemplates.length} Workflows`
        : (pageMode === "templates-list"
          ? `${templatesForCatalog.length} Templates`
          : (pageMode === "home" ? "Dashboard" : (builderTemplateName || "Untitled Workflow")))));
  return (
    <AppLayout flush={pageMode === "builder"} collapseSidebar={pageMode === "builder"}>
      {pageMode === "builder" ? (
        <WorkflowStudio
          initialTemplateId={preferredBuilderTemplateId}
          initialRunId={builderOpenRunId}
          onOpenHistory={() => { setBuilderOpenRunId(null); navigateToMode("history"); }}
          onBackToHome={() => { setBuilderOpenRunId(null); navigateToMode("home"); }}
        />
      ) : (
        <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
          <header className="h-14 border-b border-border/50 flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-20">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight">{workspaceHeaderTitle}</h1>
              </div>
              <div className="h-4 w-[1px] bg-border/50 mx-1" />
              <div className="min-w-[220px] max-w-[320px] px-2 py-1 rounded-md bg-muted/30 border border-border/50">
                <div className="w-full px-1 text-left text-xs font-semibold text-foreground truncate" title={workspaceHeaderName}>
                  {workspaceHeaderName}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px]">
                {pageMode === "run" ? "Run Detail" : "Workspace"}
              </Badge>
            </div>
          </header>

          <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
            <DialogContent className="max-w-4xl h-[85vh] max-h-[85vh] gap-0 p-0 overflow-hidden grid-rows-[auto_1fr]">
              <DialogHeader className="px-4 py-3 border-b border-border/40">
                <DialogTitle className="text-base">Workflow Template Library</DialogTitle>
                <DialogDescription>Select a template to load into the builder, or create a fresh draft.</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 p-4">
                <WorkflowTemplateSidebar
                  title="Available Templates"
                  items={templates.map((tpl) => ({
                    id: tpl.id,
                    name: tpl.name,
                    latestVersion: tpl.latest_version,
                    isActive: tpl.is_active,
                    description: tpl.description,
                    templateScope: templateScopeOf(tpl),
                    sourceTemplateId: tpl.source_template_id || null,
                    sourceTemplateVersion: tpl.source_template_version || null,
                    linkedForkId: templateScopeOf(tpl) === "system"
                      ? (firstForkBySourceTemplateId.get(tpl.id)?.id || null)
                      : null,
                  }))}
                  activeId={builderTemplateId}
                  onSelect={(id) => { void onUseTemplateFromLibrary(id); }}
                  onUseTemplate={(id) => { void onUseTemplateFromLibrary(id); }}
                  onForkTemplate={(id) => { void onForkTemplateFromLibrary(id); }}
                  onEditFork={(id, linkedForkId) => { void onEditForkFromLibrary(id, linkedForkId); }}
                  onCreateNew={() => {
                    onCreateNewBuilderTemplate();
                    setTemplatePickerOpen(false);
                  }}
                  onRefresh={() => void reload()}
                  isRefreshing={refreshing}
                  actioningTemplateId={templateActionTemplateId}
                />
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addNodeDialogOpen} onOpenChange={setAddNodeDialogOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Add Node</DialogTitle>
                <DialogDescription>
                  Choose an existing node from the library, or create a workflow-local node.
                </DialogDescription>
              </DialogHeader>

              <Tabs value={addNodeMode} onValueChange={(value) => setAddNodeMode(value === "new" ? "new" : "existing")} className="space-y-3">
                <TabsList className="grid grid-cols-2 w-full h-9">
                  <TabsTrigger value="existing">Use Existing Node</TabsTrigger>
                  <TabsTrigger value="new">Create New Node</TabsTrigger>
                </TabsList>

                <TabsContent value="existing" className="space-y-3">
                  {sortedNodeDefinitions.length === 0 ? (
                    <div className="rounded border border-border/40 bg-background/50 p-3 text-xs text-muted-foreground">
                      No node definitions available in the registry for this org. Use <span className="font-medium">Create New Node</span>.
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Node Definition</div>
                        <Select value={addNodeExistingKey || undefined} onValueChange={setAddNodeExistingKey}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Select node definition" />
                          </SelectTrigger>
                          <SelectContent>
                            {sortedNodeDefinitions.map((definition) => (
                              <SelectItem key={definition.id} value={String(definition.node_key)}>
                                {String(definition.name || definition.node_key)} ({String(definition.node_key)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedAddNodeDefinition ? (
                          <div className="text-[11px] text-muted-foreground mt-1">
                            Scope: {selectedAddNodeDefinition.scope} | Latest version: v{selectedAddNodeDefinition.latest_version || "-"}
                          </div>
                        ) : null}
                      </div>

                      {selectedAddNodeDefinition ? (
                        <div className="rounded border border-border/40 bg-background/40 p-2.5 space-y-2">
                          <div className="text-xs font-medium">Node Contract (Expected I/O)</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className="rounded border border-border/30 bg-background/50 p-2">
                              <div className="text-[11px] font-medium">Expected Input</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {addNodeInputFields.length > 0 ? addNodeInputFields.join(", ") : "Schema does not declare specific properties."}
                              </div>
                              <pre className="mt-2 max-h-28 overflow-auto rounded bg-background/80 p-2 text-[10px] leading-relaxed">
                                {schemaPreview(addNodeContractInputSchema)}
                              </pre>
                            </div>
                            <div className="rounded border border-border/30 bg-background/50 p-2">
                              <div className="text-[11px] font-medium">Expected Output</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {addNodeOutputFields.length > 0 ? addNodeOutputFields.join(", ") : "Schema does not declare specific properties."}
                              </div>
                              <pre className="mt-2 max-h-28 overflow-auto rounded bg-background/80 p-2 text-[10px] leading-relaxed">
                                {schemaPreview(addNodeContractOutputSchema)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="new" className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Node Type</div>
                    <Select value={addNodeNewType || undefined} onValueChange={setAddNodeNewType}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select node type" />
                      </SelectTrigger>
                      <SelectContent>
                        {createNodeTypeOptions.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.label} ({option.key})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded border border-border/40 bg-background/40 p-2.5 text-[11px] text-muted-foreground">
                    Creates a workflow-local node. It can be fully customized in the Step inspector after insertion.
                  </div>
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Step ID (optional)</div>
                  <Input
                    value={addNodeCustomId}
                    onChange={(event) => setAddNodeCustomId(event.target.value)}
                    placeholder="e.g. classify_documents"
                    className="h-9 text-xs"
                  />
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Letters/numbers with <span className="font-mono">_</span> or <span className="font-mono">-</span> only.
                  </div>
                </div>
                {addModeSupportsPrompt ? (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Prompt Template (optional override)</div>
                    <Input
                      value={addNodePromptTemplate}
                      onChange={(event) => setAddNodePromptTemplate(event.target.value)}
                      placeholder="Write an instruction for this AI step"
                      className="h-9 text-xs"
                    />
                  </div>
                ) : (
                  <div className="rounded border border-border/40 bg-background/40 p-2.5 text-[11px] text-muted-foreground self-end">
                    Prompt override is available for AI node types.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setAddNodeDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={onConfirmAddNode}
                  disabled={addNodeMode === "existing" && sortedNodeDefinitions.length === 0}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Node
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <main className="pl-4 md:pl-6 pt-0 pb-0 pr-0">
            <div className="w-full grid grid-cols-1 xl:grid-cols-3 gap-0">
              {pageMode === "home" ? (
                <div className="xl:col-span-3 min-h-[calc(100vh-60px)] bg-background/50">
                  <div className="max-w-5xl mx-auto px-6 py-8 space-y-12">



                    {/* Recent History Section */}
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground/60">
                          <History className="w-3.5 h-3.5" />
                          <span>Recent History</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-white/5 font-medium flex items-center gap-1.5"
                          onClick={() => navigateToMode("history")}
                        >
                          View all
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {recentRuns.slice(0, 5).map((run: any) => {
                          const templateId = String(run?.workflow_template_id || "");
                          const workflowName = templateNameById.get(templateId) || "Unknown Workflow";
                          const status = String(run?.status || "").toLowerCase();
                          return (
                            <div
                              key={run.id}
                              className="group flex flex-col rounded-xl border border-border/40 bg-card/40 dark:bg-zinc-900/40 hover:bg-card/60 dark:hover:bg-zinc-900/60 hover:border-border/60 transition-all overflow-hidden cursor-pointer aspect-[1/1.1]"
                              onClick={() => { setActiveRunId(run.id); setPageMode("run"); }}
                            >
                              <div className={`h-1/3 w-full flex items-center justify-center ${status === "succeeded" ? "bg-emerald-500/10" :
                                status === "failed" ? "bg-red-500/10" :
                                  status === "running" || status === "queued" ? "bg-blue-500/10" :
                                    "bg-muted/50"
                                }`}>
                                <div className="w-8 h-8 rounded-lg bg-black/10 backdrop-blur-md flex items-center justify-center text-muted-foreground">
                                  {status === "succeeded" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                                    status === "failed" ? <AlertTriangle className="w-4 h-4 text-red-500" /> :
                                      status === "running" || status === "queued" ? <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" /> :
                                        <Clock3 className="w-4 h-4" />}
                                </div>
                              </div>
                              <div className="p-4 flex flex-col flex-1 relative bg-card/30 dark:bg-transparent">
                                <h3 className="font-semibold text-[13px] text-foreground/90 line-clamp-2 mt-1">{workflowName}</h3>
                                <div className="mt-auto pt-2 flex items-center gap-2">
                                  <Badge variant="outline" className={`text-[10px] ${runStatusToneClass(status)}`}>{status}</Badge>
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/60 font-medium">
                                  <Calendar className="w-3 h-3" />
                                  <span>{formatRunDate(run?.started_at || run?.created_at)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {recentRuns.length === 0 && (
                          <div className="col-span-full text-sm text-muted-foreground py-8 text-center">
                            No recent workflow runs
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Templates Section */}
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <LayoutGrid className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <h2 className="text-sm font-bold text-foreground tracking-tight">Workflow Templates</h2>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Start with a blueprint</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 font-semibold flex items-center gap-2 px-3"
                          onClick={() => navigateToMode("templates-list")}
                        >
                          Explore Gallery
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {/* New workflow quick action card */}
                        <button
                          onClick={() => { onCreateNewBuilderTemplate(); navigateToMode("builder"); }}
                          className="flex flex-col items-center justify-center gap-4 h-full min-h-[200px] rounded-2xl border-2 border-dashed border-border/40 hover:border-primary/40 hover:bg-primary/5 hover:scale-[1.02] transition-all group relative bg-muted/10 backdrop-blur-sm"
                        >
                          <div className="w-14 h-14 rounded-2xl bg-muted/40 group-hover:bg-primary/10 flex items-center justify-center transition-all duration-300 shadow-sm group-hover:rotate-90">
                            <Plus className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <div className="text-center">
                            <span className="text-sm font-bold text-foreground/80 group-hover:text-primary transition-colors block">New Workflow</span>
                            <span className="text-[10px] text-muted-foreground mt-1 block">Start from scratch</span>
                          </div>
                        </button>

                        {(availableTemplates || []).slice(0, 4).map((tpl) => (
                          <WorkflowCard
                            key={tpl.id}
                            tpl={tpl}
                            onClick={() => { openTemplateInBuilderPage(String(tpl?.id || "")); }}
                            formatRunDate={formatRunDate}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {pageMode === "my-workflows" ? (
                <div className="xl:col-span-3 min-h-[calc(100vh-60px)] bg-background/50">
                  <div className="max-w-6xl mx-auto px-6 py-12">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {/* Create New Card */}
                      <button
                        onClick={() => { onCreateNewBuilderTemplate(); navigateToMode("builder"); }}
                        className="flex flex-col items-center justify-center gap-4 h-full min-h-[200px] rounded-2xl border-2 border-dashed border-border/40 hover:border-primary/40 hover:bg-primary/5 hover:scale-[1.02] transition-all group relative bg-muted/10 backdrop-blur-sm"
                      >
                        <div className="w-14 h-14 rounded-2xl bg-muted/40 group-hover:bg-primary/10 flex items-center justify-center transition-all duration-300 shadow-sm group-hover:rotate-90">
                          <Plus className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div className="text-center">
                          <span className="text-sm font-bold text-foreground/80 group-hover:text-primary transition-colors block">New Workflow</span>
                          <span className="text-[10px] text-muted-foreground mt-1 block">Start from scratch</span>
                        </div>
                      </button>

                      {availableTemplates.map((tpl) => (
                        <WorkflowCard
                          key={tpl.id}
                          tpl={tpl}
                          onClick={() => { openTemplateInBuilderPage(String(tpl?.id || "")); }}
                          formatRunDate={formatRunDate}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {pageMode === "templates-list" ? (
                <div className="xl:col-span-3 min-h-[calc(100vh-60px)] bg-background/50">
                  <div className="max-w-6xl mx-auto px-6 py-12">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {templatesForCatalog.map((tpl) => (
                        <WorkflowCard
                          key={tpl.id}
                          tpl={tpl}
                          onClick={() => { openTemplateInBuilderPage(String(tpl?.id || "")); }}
                          formatRunDate={formatRunDate}
                        />
                      ))}
                      {templatesForCatalog.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No templates found.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {false ? (
                <div className="xl:col-span-3">
                  <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_360px] gap-3">
                    <Card className="border-border/40 bg-card/60 xl:h-[calc(100vh-170px)]">
                      <CardHeader className="pb-2 space-y-1">
                        <CardTitle className="text-sm">Workflow Setup</CardTitle>
                        <div className="text-[11px] text-muted-foreground truncate" title={activeBuilderTemplateLabel}>
                          {activeBuilderTemplateLabel}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 overflow-auto max-h-[calc(100vh-260px)]">
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">Template</div>
                          <Input
                            value={builderTemplateName}
                            onChange={(e) => setBuilderTemplateName(e.target.value)}
                            placeholder="Workflow name"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={builderTemplateDescription}
                            onChange={(e) => setBuilderTemplateDescription(e.target.value)}
                            placeholder="Workflow description (optional)"
                            className="h-8 text-xs"
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onCreateNewBuilderTemplate}>
                              New
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setTemplatePickerOpen(true)}>
                              Templates
                            </Button>
                          </div>
                          {builderTemplateId && builderIsSystemTemplate ? (
                            <div className="rounded border border-border/40 bg-background/60 p-2 text-[11px] text-muted-foreground">
                              System template loaded. Saving will fork it for this org.
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">Execution Mode</div>
                          <Select
                            value={String(builderSchemaVersion)}
                            onValueChange={(value) => onBuilderSchemaVersionChange(value === "2" ? 2 : 1)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Linear (Schema v1)</SelectItem>
                              <SelectItem value="2">Graph + Parallel (Schema v2)</SelectItem>
                            </SelectContent>
                          </Select>
                          {builderSchemaVersion === 2 ? (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[11px] text-muted-foreground mb-1">Max Parallel</div>
                                <Input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={String(builderExecution.max_parallelism)}
                                  onChange={(event) => {
                                    const parsed = Number(event.target.value || 0);
                                    if (!Number.isFinite(parsed)) return;
                                    onBuilderExecutionChange({ max_parallelism: parsed });
                                  }}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div>
                                <div className="text-[11px] text-muted-foreground mb-1">On Failure</div>
                                <Select
                                  value={builderExecution.on_node_failure}
                                  onValueChange={(value) => onBuilderExecutionChange({
                                    on_node_failure: value === "continue" ? "continue" : "fail_fast",
                                  })}
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
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-muted-foreground">Node Library</div>
                            {builderSchemaVersion === 2 ? (
                              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onBuilderAutowireSequential}>
                                Auto-wire
                              </Button>
                            ) : null}
                          </div>
                          <Input
                            value={nodeLibraryQuery}
                            onChange={(e) => setNodeLibraryQuery(e.target.value)}
                            placeholder="Search nodes..."
                            className="h-8 text-xs"
                          />
                          <div className="rounded border border-border/40 bg-background/50 max-h-[300px] overflow-auto">
                            {filteredNodeLibraryOptions.map((option) => (
                              <button
                                key={option.key}
                                type="button"
                                className="w-full text-left px-2.5 py-2 border-b border-border/30 last:border-b-0 hover:bg-accent/40"
                                onClick={() => {
                                  const definition = sortedNodeDefinitions.find((d) => String(d.node_key || "").trim() === option.key) || null;
                                  const latestVersion = Number(
                                    definition?.latest_version
                                    || (isPlainObject(definition?.latest_contract) ? definition.latest_contract.version : 0)
                                    || 1
                                  );
                                  const node = buildStepNodeDraft({
                                    nodeType: option.key,
                                    nodeRefKey: definition ? option.key : undefined,
                                    nodeRefVersion: Number.isFinite(latestVersion) && latestVersion > 0 ? latestVersion : 1,
                                    preferredId: option.key,
                                  });
                                  insertStepAt(stepNodes.length, node);
                                }}
                              >
                                <div className="text-xs font-medium">{option.label}</div>
                                <div className="text-[11px] text-muted-foreground font-mono">{option.key}</div>
                              </button>
                            ))}
                            {filteredNodeLibraryOptions.length === 0 ? (
                              <div className="px-2.5 py-3 text-xs text-muted-foreground">No nodes match this search.</div>
                            ) : null}
                          </div>
                        </div>

                        {isDagRunBlocked ? (
                          <div className="rounded-md border border-amber-300/50 bg-amber-50/60 p-2 text-[11px] text-amber-800">
                            Graph runtime is disabled. Enable DAG runtime for schema v2 runs.
                          </div>
                        ) : null}

                        <div className="flex items-center gap-2 pt-1">
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void onCreateOrUpdateScenarioTemplate()} disabled={acting || loading}>
                            {builderTemplateId
                              ? (builderIsSystemTemplate ? "Fork + Save" : "Save Version")
                              : "Create Template"}
                          </Button>
                          <Button size="sm" className="h-8 text-xs" onClick={() => void onRunScenario()} disabled={acting || loading || !config?.manualRunEnabled || isDagRunBlocked}>
                            <Play className="h-3.5 w-3.5 mr-1.5" />
                            Run
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <div>
                      <WorkflowBuilderCanvas
                        schemaVersion={builderSchemaVersion}
                        nodes={stepNodes}
                        edges={builderEdges}
                        selectedIndex={selectedBuilderStepIndex}
                        onSelect={setSelectedBuilderStepIndex}
                        onInsertAt={(index) => {
                          insertStepAt(index, buildStepNodeDraft({ nodeType: "human.review" }));
                        }}
                        onDelete={removeStep}
                        onPatchNodePosition={patchStepPosition}
                        onConnectNodes={connectBuilderNodes}
                        onDeleteEdge={deleteBuilderEdge}
                      />
                    </div>

                    <div>
                      <WorkflowInspector
                        schemaVersion={builderSchemaVersion}
                        selectedNode={selectedBuilderNode}
                        selectedIndex={selectedBuilderStepIndex}
                        totalNodes={stepNodes.length}
                        previousNodeId={selectedBuilderStepIndex != null && (selectedBuilderStepIndex ?? -1) > 0 ? String(stepNodes[(selectedBuilderStepIndex ?? 0) - 1]?.id || "") : null}
                        previousNodeType={selectedBuilderStepIndex != null && (selectedBuilderStepIndex ?? -1) > 0 ? String(stepNodes[(selectedBuilderStepIndex ?? 0) - 1]?.node_type || stepNodes[(selectedBuilderStepIndex ?? 0) - 1]?.node_ref?.key || stepNodes[(selectedBuilderStepIndex ?? 0) - 1]?.nodeRef?.key || "") : null}
                        templateName={builderTemplateName}
                        templateType={builderType}
                        templateDescription={builderTemplateDescription}
                        onTemplateNameChange={setBuilderTemplateName}
                        onTemplateTypeChange={setBuilderType}
                        onTemplateDescriptionChange={setBuilderTemplateDescription}
                        onPatchSelectedNode={patchSelectedBuilderNode}
                        onMoveSelectedNode={moveSelectedBuilderNode}
                        onDeleteSelectedNode={deleteSelectedBuilderNode}
                        roleOptions={roleOptions}
                        users={orgUsers}
                        nodeDefinitions={nodeDefinitions}
                        hideGeneralTab
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {pageMode === "execute" ? (
                <div className="xl:col-span-3">
                  <WorkflowExecuteStudio
                    embedded
                    initialTemplateId={preferredExecuteTemplateId}
                    onOpenRunDetail={(runId) => {
                      void onOpenRun(runId);
                      setPageMode("run");
                    }}
                  />
                </div>
              ) : null}

              {pageMode === "history" ? (
                <div className="xl:col-span-3 min-h-[calc(100vh-60px)] bg-background/50">
                  <div className="max-w-6xl mx-auto px-6 py-12 space-y-6">
                    {/* Toolbar */}
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-card/40 dark:bg-zinc-900/40 p-4 rounded-xl border border-border/40 backdrop-blur-sm">
                      <div className="relative flex-1 w-full md:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                        <Input
                          placeholder="Search run ID or workflow..."
                          value={activeRunId}
                          onChange={(e) => setActiveRunId(e.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            const next = String(activeRunId || "").trim();
                            if (!next) return;
                            event.preventDefault();
                            void onOpenRun(next);
                          }}
                          className="pl-9 h-9 bg-muted/30 border-border/40 text-sm placeholder:text-muted-foreground/50 rounded-lg"
                        />
                      </div>

                      {/* Status Tabs */}
                      <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/30 border border-border/40 overflow-x-auto">
                        {[
                          { value: "all", label: "All" },
                          { value: "succeeded", label: "Succeeded", icon: CheckCircle2 },
                          { value: "failed", label: "Failed", icon: AlertTriangle },
                          { value: "active", label: "Active", icon: RefreshCw },
                          { value: "cancelled", label: "Cancelled", icon: XCircle },
                        ].map((tab) => {
                          const isActive = historyStatusFilter === tab.value;
                          const TabIcon = tab.icon;

                          // Count items for this tab
                          const count = tab.value === "all"
                            ? runs.length
                            : runs.filter(r => {
                              const s = String((r as any)?.status || "").toLowerCase();
                              if (tab.value === "active") return ["running", "queued", "waiting"].includes(s);
                              return s === tab.value;
                            }).length;

                          return (
                            <button
                              key={tab.value}
                              onClick={() => setHistoryStatusFilter(tab.value)}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap",
                                isActive
                                  ? "bg-background shadow-sm text-foreground"
                                  : "text-muted-foreground hover:text-foreground hover:bg-background/20"
                              )}
                            >
                              {TabIcon && <TabIcon className={cn("h-3.5 w-3.5", tab.value === "active" && isActive && "animate-spin")} />}
                              {tab.label}
                              {count > 0 && (
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-full",
                                  isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                )}>
                                  {count}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                    </div>

                    {/* List Header */}
                    <div className="hidden md:block px-6 py-2 border-b border-border/30 bg-muted/20 rounded-t-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-8" />
                        <div className="flex-1">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Workflow
                          </span>
                        </div>
                        <div className="hidden md:block w-48">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Run ID
                          </span>
                        </div>
                        <div className="w-28">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Status
                          </span>
                        </div>
                        <div className="hidden lg:block w-32">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Started
                          </span>
                        </div>
                        <div className="w-20">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right block">
                            Actions
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* List Content */}
                    <div className="bg-card/30 dark:bg-zinc-900/20 border border-border/40 rounded-b-xl divide-y divide-border/20 overflow-hidden shadow-sm">
                      {runs
                        .filter(r => {
                          if (historyStatusFilter === "all") return true;
                          const s = String((r as any)?.status || "").toLowerCase();
                          if (historyStatusFilter === "active") return ["running", "queued", "waiting"].includes(s);
                          return s === historyStatusFilter;
                        })
                        .map((r) => {
                          const status = String((r as any)?.status || "-").toLowerCase();
                          const startedAt = (r as any)?.started_at || (r as any)?.created_at || (r as any)?.updated_at || null;
                          const templateId = String((r as any)?.workflow_template_id || "").trim();
                          const workflowName = templateNameById.get(templateId) || "Unknown Workflow";

                          return (
                            <div
                              key={r.id}
                              className="group px-6 py-4 hover:bg-muted/30 transition-colors flex items-center gap-4"
                            >
                              <div className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-lg transition-colors border border-border/40 shadow-sm",
                                status === "succeeded" || status === "completed" ? "bg-emerald-500/10 text-emerald-600" :
                                  status === "failed" ? "bg-red-500/10 text-red-600" :
                                    ["running", "queued", "waiting"].includes(status) ? "bg-blue-500/10 text-blue-600" :
                                      status === "cancelled" ? "bg-zinc-500/10 text-zinc-600" :
                                        "bg-muted/50 text-muted-foreground"
                              )}>
                                {status === "succeeded" || status === "completed" ? <CheckCircle2 className="h-4 w-4" /> :
                                  status === "failed" ? <AlertTriangle className="h-4 w-4" /> :
                                    ["running", "queued", "waiting"].includes(status) ? <RefreshCw className="h-4 w-4 animate-spin" /> :
                                      status === "cancelled" ? <XCircle className="h-4 w-4" /> :
                                        <Clock3 className="h-4 w-4" />}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-foreground truncate" title={workflowName}>
                                  {workflowName}
                                </div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                  <span className="px-1 py-0.5 rounded bg-muted/50 border border-border/40 text-[9px] font-mono">
                                    v{(r as any)?.workflow_template_version ?? "-"}
                                  </span>
                                  <span className="hidden sm:inline">·</span>
                                  <span className="hidden sm:inline italic">Started {formatRunDate(startedAt)}</span>
                                </div>
                              </div>

                              <div className="hidden md:block w-48 overflow-hidden">
                                <span className="text-[11px] font-mono text-muted-foreground truncate block" title={String(r.id)}>
                                  {String(r.id)}
                                </span>
                              </div>

                              <div className="w-28">
                                <Badge variant="outline" className={cn(
                                  "text-[10px] font-medium py-0 h-5 border shadow-none",
                                  runStatusToneClass(status)
                                )}>
                                  {status}
                                </Badge>
                              </div>

                              <div className="hidden lg:flex flex-col w-32">
                                <span className="text-[11px] text-foreground font-medium">{formatRunDate(startedAt).split(",")[0]}</span>
                                <span className="text-[10px] text-muted-foreground">{formatRunDate(startedAt).split(",")[1]}</span>
                              </div>

                              <div className="w-20 flex justify-end">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                  title="View run detail"
                                  onClick={() => {
                                    setBuilderOpenRunId(String(r.id || ""));
                                    setPageMode("builder");
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}

                      {(runs.filter(r => {
                        if (historyStatusFilter === "all") return true;
                        const s = String((r as any)?.status || "").toLowerCase();
                        if (historyStatusFilter === "active") return ["running", "queued", "waiting"].includes(s);
                        return s === historyStatusFilter;
                      })).length === 0 && !loading && (
                          <div className="flex flex-col items-center justify-center py-20 px-6">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4 border border-border/40">
                              <History className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                            <h3 className="text-base font-medium text-foreground mb-1">
                              {historyStatusFilter !== "all" ? `No ${historyStatusFilter} runs found` : "No history found"}
                            </h3>
                            <p className="text-sm text-muted-foreground text-center max-w-xs">
                              {historyStatusFilter !== "all"
                                ? `Try changing the status filter or search query.`
                                : "Workflow executions will appear here once you start running them."}
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              ) : null}

              {pageMode === "run" ? (
                <div className="xl:col-span-3">
                  {!runDetail ? (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">Select a run to view steps, output, artifacts, and tasks.</div>
                      <Button size="sm" variant="outline" onClick={() => navigateToMode("history")}>
                        Go To History
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-0 overflow-hidden">
                      <div className="xl:col-span-9 xl:min-h-[calc(100vh-77px)] p-4">
                        <WorkflowRunGraph
                          title={`Run ${runMeta.runId}`}
                          subtitle={`Status: ${runMeta.status} · Steps: ${runGraph.nodes.length}`}
                          nodes={runGraph.nodes}
                          edges={runGraph.edges}
                          selectedNodeId={selectedRunStepId}
                          chromeless
                          canvasClassName="h-full min-h-[760px]"
                          onSelectNode={(nodeId) => {
                            const node = runGraph.nodes.find((entry) => entry.id === nodeId);
                            const stepId = String(node?.raw?.step?.id || "");
                            setSelectedRunStepId(stepId || nodeId);
                          }}
                        />
                      </div>

                      <Card className="xl:col-span-3 border-border/40 bg-card/50 xl:sticky xl:top-[77px] xl:h-[calc(100vh-77px)] rounded-none border-r-0 border-t-0 border-b-0 flex flex-col">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm">Run Detail</CardTitle>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                title="Refresh run"
                                aria-label="Refresh run"
                                onClick={() => {
                                  const currentRunId = String(runDetail?.run?.id || activeRunId || "");
                                  if (currentRunId) void loadRunDetail(currentRunId);
                                }}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                title="Open run history"
                                aria-label="Open run history"
                                onClick={() => navigateToMode("history")}
                              >
                                <History className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Clock3 className="h-3.5 w-3.5" />
                                {runMeta.startedAt}
                              </span>
                              <span>{runMeta.duration}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">status: {runMeta.status}</Badge>
                              {complianceView && runAssessment.overallOutcome === "pass" ? (
                                <Badge className="bg-emerald-600">
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                  Compliant
                                </Badge>
                              ) : null}
                              {complianceView && runAssessment.overallOutcome === "fail" ? (
                                <Badge className="bg-red-600">
                                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                  Action Needed
                                </Badge>
                              ) : null}
                              {complianceView && runAssessment.overallOutcome === "unknown" ? (
                                <Badge className="bg-amber-600">
                                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                  Needs Review
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3 flex-1 overflow-auto">
                          <Tabs
                            value={runDetailTab}
                            onValueChange={(value) => setRunDetailTab(value as "overview" | "output")}
                            className="space-y-3"
                          >
                            <TabsList className="grid grid-cols-2 w-full">
                              <TabsTrigger value="overview">Summary</TabsTrigger>
                              <TabsTrigger value="output">Output</TabsTrigger>
                            </TabsList>

                            <TabsContent value="overview" className="space-y-3">
                              <div className="rounded-md border border-border/30 p-3 bg-background/70 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-medium">Current Step</div>
                                  <Badge variant="outline">selected</Badge>
                                </div>
                                {selectedRunStep ? (
                                  <>
                                    <div className="text-sm break-all">{String(selectedRunStep?.node_id || selectedRunStep?.id || "Step")}</div>
                                    <div className="text-xs text-muted-foreground break-all">{String(selectedRunStep?.node_type || "Unknown step type")}</div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline">status: {String(selectedRunStep?.status || "-")}</Badge>
                                      <Badge variant="outline">artifacts: {selectedRunArtifacts.length}</Badge>
                                      <Badge variant="outline">findings: {selectedRunFindings.length}</Badge>
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-sm text-muted-foreground">
                                    {selectedRunStepId
                                      ? "Selected node has not executed yet."
                                      : "Select a step on the graph to inspect it."}
                                  </div>
                                )}
                              </div>

                              {selectedRunArtifacts.length > 0 ? (
                                <div className="rounded-md border border-border/30 p-3 bg-background/70 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium">Evidence Files</div>
                                    <Badge variant="outline">{selectedRunArtifacts.length}</Badge>
                                  </div>
                                  <div className="space-y-2">
                                    {selectedRunArtifacts.slice(0, 3).map((artifact: any, index: number) => {
                                      const docId = typeof artifact?.doc_id === "string" ? artifact.doc_id : null;
                                      return (
                                        <div key={String(artifact?.id || `run-artifact-${index}`)} className="rounded border border-border/30 p-2 bg-background/60">
                                          <div className="text-sm font-medium">{String(artifact?.title || artifact?.artifact_type || "Artifact")}</div>
                                          <div className="text-xs text-muted-foreground">{String(artifact?.artifact_type || "-")}</div>
                                          {docId ? (
                                            <Button asChild size="sm" variant="outline" className="h-7 text-xs mt-2">
                                              <Link href={`/documents/${docId}`}>Open</Link>
                                            </Button>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                    {selectedRunArtifacts.length > 3 ? (
                                      <div className="text-xs text-muted-foreground">+{selectedRunArtifacts.length - 3} more files</div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}

                              {selectedRunTasks.length > 0 ? (
                                <div className="rounded-md border border-border/30 p-3 bg-background/70 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium">Review Tasks</div>
                                    <Badge variant="outline">{selectedRunTasks.length}</Badge>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">open: {selectedRunTasks.filter((task: any) => isTaskPending(task?.status)).length}</Badge>
                                    <Badge variant="outline">findings to review: {selectedRunActionFindings.length}</Badge>
                                  </div>
                                  <div className="space-y-2">
                                    {selectedRunTasks.map((task: any, index: number) => (
                                      <div key={String(task?.id || `run-task-${index}`)} className="rounded border border-border/30 p-2 bg-background/60">
                                        <div className="text-sm font-medium">{String(task?.title || "Task")}</div>
                                        <div className="text-xs text-muted-foreground">status: {String(task?.status || "-")}</div>
                                      </div>
                                    ))}

                                    {selectedRunOpenTasks.length > 0 ? (
                                      <div className="rounded border border-border/40 p-2 bg-background/60 space-y-2">
                                        <div className="text-xs font-medium">Take Action</div>
                                        <Select value={selectedRunTaskId} onValueChange={setSelectedRunTaskId}>
                                          <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Select open task" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {selectedRunOpenTasks.map((task: any) => (
                                              <SelectItem key={String(task?.id || "")} value={String(task?.id || "")}>
                                                {String(task?.title || "Task")} ({String(task?.status || "-")})
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>

                                        <div className="grid grid-cols-2 gap-2">
                                          <Select value={runTaskDecision} onValueChange={(value) => setRunTaskDecision(value as "approved" | "rejected")}>
                                            <SelectTrigger className="h-8 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="approved">Accept</SelectItem>
                                              <SelectItem value="rejected">Reject</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <Input
                                            value={runTaskNote}
                                            onChange={(e) => setRunTaskNote(e.target.value)}
                                            placeholder="Optional note"
                                            className="h-8 text-xs"
                                          />
                                        </div>

                                        <details className="rounded border border-border/30 p-2 bg-background/50">
                                          <summary className="cursor-pointer text-xs text-muted-foreground">More options</summary>
                                          <div className="mt-2 space-y-2">
                                            <label className="text-xs flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={runTaskWaiveUnknowns}
                                                onChange={(e) => setRunTaskWaiveUnknowns(e.target.checked)}
                                              />
                                              Waive unknown findings
                                            </label>
                                            {runTaskWaiveUnknowns ? (
                                              <Input
                                                value={runTaskWaiverReason}
                                                onChange={(e) => setRunTaskWaiverReason(e.target.value)}
                                                placeholder="Waiver reason"
                                                className="h-8 text-xs"
                                              />
                                            ) : null}
                                            <label className="text-xs flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={runTaskEscalateToLegal}
                                                onChange={(e) => setRunTaskEscalateToLegal(e.target.checked)}
                                              />
                                              Escalate to legal
                                            </label>
                                          </div>
                                        </details>

                                        {runTaskError ? (
                                          <div className="rounded border border-red-300/50 bg-red-50/60 p-2 text-xs text-red-700">
                                            {runTaskError}
                                          </div>
                                        ) : null}

                                        <Button
                                          size="sm"
                                          className="h-8 text-xs"
                                          onClick={() => void submitRunTaskDecision()}
                                          disabled={!selectedRunTaskId || runTaskActing}
                                        >
                                          {runTaskActing ? "Submitting..." : "Submit Sign-off"}
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="text-xs text-muted-foreground">
                                        All tasks on this step are completed.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </TabsContent>

                            <TabsContent value="output" className="space-y-3">
                              <div className="rounded-md border border-border/30 p-3 bg-background/70 space-y-2">
                                <div className="text-sm font-medium">Step Output</div>
                                {!selectedRunStep ? (
                                  <div className="text-sm text-muted-foreground">Select a step to view output.</div>
                                ) : selectedRunUserOutput.nodeType === "ai.prompt" ? (
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline">AI Prompt</Badge>
                                      {selectedRunUserOutput.responseFormat ? <Badge variant="outline">format: {selectedRunUserOutput.responseFormat}</Badge> : null}
                                    </div>
                                    {selectedRunUserOutput.text ? (
                                      <div className="rounded border border-border/30 bg-background/60 p-3 text-sm whitespace-pre-wrap leading-6">
                                        {selectedRunUserOutput.text}
                                      </div>
                                    ) : selectedRunUserOutput.jsonRows.length > 0 ? (
                                      <div className="rounded border border-border/30 bg-background/60 p-3 space-y-1">
                                        {selectedRunUserOutput.jsonRows.map((row) => (
                                          <div key={row.key} className="text-sm">
                                            <span className="text-muted-foreground">{row.key}:</span> {row.value}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-muted-foreground">No generated output available yet.</div>
                                    )}
                                  </div>
                                ) : selectedRunUserOutput.nodeType === "dms.create_document" ? (
                                  <div className="space-y-2">
                                    <div className="text-sm">
                                      {selectedRunUserOutput.generatedDocTitle || "Generated document"}
                                    </div>
                                    {selectedRunUserOutput.generatedDocId ? (
                                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                        <Link href={`/documents/${selectedRunUserOutput.generatedDocId}`}>Open Generated Document</Link>
                                      </Button>
                                    ) : (
                                      <div className="text-sm text-muted-foreground">Document link not available.</div>
                                    )}
                                  </div>
                                ) : selectedRunUserOutput.genericRows.length > 0 ? (
                                  <div className="space-y-1">
                                    {selectedRunUserOutput.genericRows.map((row) => (
                                      <div key={row.key} className="text-sm">
                                        <span className="text-muted-foreground">{row.key}:</span> {row.value}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground">No user-facing output for this step.</div>
                                )}
                              </div>
                            </TabsContent>

                          </Tabs>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </main>
        </div>
      )}
    </AppLayout>
  );
}
