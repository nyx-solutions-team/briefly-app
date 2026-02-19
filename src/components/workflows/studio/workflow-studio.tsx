"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  ExternalLink,
  FileOutput,
  FileText,
  FolderClosed,
  History,
  Info,
  Loader2,
  MoreHorizontal,
  MousePointer2,
  Play,
  Plus,
  Power,
  RefreshCw,
  Search,
  Eye,
  Shield,
  Split,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, getApiContext } from "@/lib/api";
import { FinderPicker } from "@/components/pickers/finder-picker";
import {
  createWorkflowTemplate,
  createWorkflowTemplateVersion,
  runWorkflowManual,
  getWorkflowRun,
  getWorkflowTemplateDefinition,
  completeWorkflowTask,
} from "@/lib/workflow-api";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Clock3,
} from "lucide-react";
import type { StoredDocument } from "@/lib/types";
import {
  WorkflowCanvasV2,
  type WorkflowNode,
  type WorkflowEdge,
} from "@/components/workflows/studio/workflow-canvas-v2";

type NodeType =
  | "trigger"
  | "ai"
  | "records"
  | "retrieval"
  | "document"
  | "file"
  | "checks"
  | "flow"
  | "human"
  | "output"
  | "utilities"
  | "audit"
  | "note"
  | "end";

type NodeGroup = "core" | "tools" | "logic" | "data" | "builder";

export function friendlyNodeLabel(nodeTypeRaw: string): string {
  const nodeType = String(nodeTypeRaw || "").toLowerCase();
  return nodeType.split('.').pop()?.replace(/_/g, ' ') || nodeType;
}

export function runningLine(nodeTypeRaw: string, subjectCount: number): string {
  const nodeType = String(nodeTypeRaw || "").toLowerCase();
  if (nodeType === "ai.parse_ruleset") return "Reading ruleset and preparing clause checklist.";
  if (nodeType === "ai.extract_facts") return `Extracting facts from ${Math.max(subjectCount, 1)} project document${Math.max(subjectCount, 1) === 1 ? "" : "s"}.`;
  if (nodeType === "system.evaluate") return "Comparing extracted facts against ruleset requirements.";
  if (nodeType === "ai.generate_report") return "Generating compliance report and export artifacts.";
  if (nodeType === "dms.list_folder") return "Listing folder documents for downstream steps.";
  if (nodeType === "dms.read_document") return "Reading document content and metadata.";
  if (nodeType === "ai.extract") return "Extracting structured fields from selected content.";
  if (nodeType === "ai.classify") return "Classifying content using configured labels.";
  if (nodeType === "system.validate") return "Running validation checks on the workflow payload.";
  if (nodeType === "system.reconcile") return "Reconciling records and checking mismatches.";
  if (nodeType === "system.packet_check") return "Checking packet completeness against required files.";
  if (nodeType === "dms.set_metadata") return "Updating document metadata fields.";
  if (nodeType === "artifact.export_csv") return "Exporting records as CSV document.";
  if (nodeType === "flow.branch") return "Evaluating branch condition and route.";
  if (nodeType === "flow.route") return "Evaluating routing rules and selecting path.";
  if (nodeType === "flow.for_each") return "Preparing item-wise collection for downstream steps.";
  if (nodeType === "flow.aggregate") return "Merging results from previous steps.";
  if (nodeType === "dms.create_document") return "Creating generated document output.";
  if (nodeType === "dms.move_document") return "Moving document to target folder.";
  if (nodeType.startsWith("human.")) return "Waiting for reviewer action to continue.";
  return "Processing workflow step...";
}

type ModeDefinition = {
  value: string;
  label: string;
  nodeKey?: string;
  implemented?: boolean;
};

type NodeCatalogItem = {
  type: NodeType;
  label: string;
  group: NodeGroup;
  purpose: string;
  color: string;
  icon: React.ReactNode;
  modes: ModeDefinition[];
  builderOnly?: boolean;
};

type WorkflowStudioProps = {
  initialTemplateId?: string | null;
  initialRunId?: string | null;
  onRunWorkflow?: () => void;
  onOpenHistory?: () => void;
  onBackToHome?: () => void;
};

type PickerTarget =
  | { scope: "trigger_input"; key: "doc_id" | "doc_ids" | "folder_path" }
  | { scope: "config"; key: string };

type PickerState = {
  open: boolean;
  mode: "folder" | "doc";
  target: PickerTarget | null;
  maxDocs: number;
  initialPath: string[];
  initialSelectedDocIds: string[];
};

const CATALOG: NodeCatalogItem[] = [
  {
    type: "trigger",
    label: "Trigger",
    group: "core",
    purpose: "Starts the workflow with manual input/context.",
    color: "border-zinc-500/10 shadow-zinc-500/5 group-hover:border-zinc-500/30",
    icon: <Play className="w-5 h-5 text-zinc-500" />,
    modes: [{ value: "manual", label: "Manual", nodeKey: "manual.trigger" }],
  },
  {
    type: "ai",
    label: "AI",
    group: "core",
    purpose: "Generate, extract, or classify using AI.",
    color: "border-primary/10 shadow-primary/5 group-hover:border-primary/30",
    icon: <Bot className="w-5 h-5 text-primary" />,
    modes: [
      { value: "generate", label: "Generate", nodeKey: "ai.prompt" },
      { value: "extract", label: "Extract", nodeKey: "ai.extract" },
      { value: "classify", label: "Classify", nodeKey: "ai.classify" },
    ],
  },
  {
    type: "records",
    label: "Records",
    group: "core",
    purpose: "List folder contents or read document content.",
    color: "border-sky-500/10 shadow-sky-500/5 group-hover:border-sky-500/30",
    icon: <FolderClosed className="w-5 h-5 text-sky-500" />,
    modes: [
      { value: "list_folder", label: "List Folder", nodeKey: "dms.list_folder" },
      { value: "read_document", label: "Read Document", nodeKey: "dms.read_document" },
    ],
  },
  {
    type: "retrieval",
    label: "Retrieval",
    group: "core",
    purpose: "Search internal knowledge or folder index.",
    color: "border-blue-500/10 shadow-blue-500/5 group-hover:border-blue-500/30",
    icon: <Search className="w-5 h-5 text-blue-500" />,
    modes: [{ value: "internal", label: "Knowledge Search", nodeKey: "search.internal", implemented: false }],
  },
  {
    type: "document",
    label: "Document",
    group: "tools",
    purpose: "Create documents.",
    color: "border-indigo-500/10 shadow-indigo-500/5 group-hover:border-indigo-500/30",
    icon: <FileText className="w-5 h-5 text-indigo-500" />,
    modes: [
      { value: "create", label: "Create", nodeKey: "dms.create_document" },
      { value: "update", label: "Update", nodeKey: "dms.update_document", implemented: false },
    ],
  },
  {
    type: "file",
    label: "File",
    group: "tools",
    purpose: "Move files or set metadata.",
    color: "border-teal-500/10 shadow-teal-500/5 group-hover:border-teal-500/30",
    icon: <Archive className="w-5 h-5 text-teal-500" />,
    modes: [
      { value: "move", label: "Move", nodeKey: "dms.move_document" },
      { value: "set_metadata", label: "Set Metadata", nodeKey: "dms.set_metadata" },
    ],
  },
  {
    type: "checks",
    label: "Checks",
    group: "logic",
    purpose: "Validate, reconcile, or check packet completeness.",
    color: "border-emerald-500/10 shadow-emerald-500/5 group-hover:border-emerald-500/30",
    icon: <Shield className="w-5 h-5 text-emerald-500" />,
    modes: [
      { value: "validate", label: "Validate", nodeKey: "system.validate" },
      { value: "reconcile", label: "Reconcile", nodeKey: "system.reconcile" },
      { value: "packet_check", label: "Packet Completeness", nodeKey: "system.packet_check" },
    ],
  },
  {
    type: "flow",
    label: "Flow",
    group: "logic",
    purpose: "Branch, route, loop, or merge flow paths.",
    color: "border-orange-500/10 shadow-orange-500/5 group-hover:border-orange-500/30",
    icon: <Split className="w-5 h-5 text-orange-500" />,
    modes: [
      { value: "if_else", label: "If / Else", nodeKey: "flow.branch" },
      { value: "router", label: "Router", nodeKey: "flow.route" },
      { value: "for_each", label: "For Each", nodeKey: "flow.for_each" },
      { value: "merge_results", label: "Merge Results", nodeKey: "flow.aggregate" },
    ],
  },
  {
    type: "human",
    label: "Human",
    group: "logic",
    purpose: "Create review, approval, checklist, or task assignments.",
    color: "border-pink-500/10 shadow-pink-500/5 group-hover:border-pink-500/30",
    icon: <UserPlus className="w-5 h-5 text-pink-500" />,
    modes: [
      { value: "review", label: "Review", nodeKey: "human.review" },
      { value: "approval", label: "Approval", nodeKey: "human.approval" },
      { value: "checklist", label: "Checklist", nodeKey: "human.checklist" },
      { value: "task", label: "Task", nodeKey: "human.task" },
    ],
  },
  {
    type: "output",
    label: "Output",
    group: "tools",
    purpose: "Export records as CSV artifact.",
    color: "border-cyan-500/10 shadow-cyan-500/5 group-hover:border-cyan-500/30",
    icon: <Upload className="w-5 h-5 text-cyan-500" />,
    modes: [{ value: "export_csv", label: "Export CSV", nodeKey: "artifact.export_csv" }],
  },
  {
    type: "utilities",
    label: "Utilities",
    group: "tools",
    purpose: "Add delays, transform data, or manage state.",
    color: "border-violet-500/10 shadow-violet-500/5 group-hover:border-violet-500/30",
    icon: <Wand2 className="w-5 h-5 text-violet-500" />,
    modes: [
      { value: "delay", label: "Wait / Delay", nodeKey: "flow.delay" },
      { value: "transform", label: "Transform", nodeKey: "flow.transform" },
      { value: "function", label: "Custom Function", nodeKey: "flow.function" },
      { value: "state", label: "State Manager", nodeKey: "flow.state" },
    ],
  },
  {
    type: "audit",
    label: "Audit Log",
    group: "tools",
    purpose: "Log custom events to the timeline.",
    color: "border-slate-500/10 shadow-slate-500/5 group-hover:border-slate-500/30",
    icon: <Database className="w-5 h-5 text-slate-500" />,
    modes: [{ value: "event", label: "Log Event", nodeKey: "system.audit_event" }],
  },
  {
    type: "note",
    label: "Sticky Note",
    group: "builder",
    purpose: "Builder-only annotation. Not executable.",
    color: "border-amber-500/10 shadow-amber-500/5 group-hover:border-amber-500/30",
    icon: <FileText className="w-5 h-5 text-amber-500" />,
    modes: [{ value: "note", label: "Note" }],
    builderOnly: true,
  },
  {
    type: "end",
    label: "End Marker",
    group: "builder",
    purpose: "Builder-only visual end marker.",
    color: "border-rose-500/10 shadow-rose-500/5 group-hover:border-rose-500/30",
    icon: <Archive className="w-5 h-5 text-rose-500" />,
    modes: [{ value: "end", label: "End" }],
    builderOnly: true,
  },
];

const CATALOG_BY_TYPE = new Map<NodeType, NodeCatalogItem>(CATALOG.map((item) => [item.type, item]));
const GROUP_ORDER: NodeGroup[] = ["core", "tools", "logic", "data", "builder"];
const GROUP_LABEL: Record<NodeGroup, string> = {
  core: "Core Components",
  tools: "Standard Tools",
  logic: "Flow Logic",
  data: "Data Ops",
  builder: "Builder Only",
};

function listModesFor(type: string): ModeDefinition[] {
  const item = CATALOG_BY_TYPE.get(type as NodeType);
  return item?.modes || [];
}

function defaultModeFor(type: string): string {
  return listModesFor(type)[0]?.value || "default";
}

function nodeKeyFor(type: string, mode: string): string | null {
  const match = listModesFor(type).find((entry) => entry.value === mode);
  return match?.nodeKey || null;
}

const NODE_KEY_TO_STUDIO_META = (() => {
  const map = new Map<string, { type: NodeType; mode: string, implemented: boolean }>();
  for (const item of CATALOG) {
    for (const mode of item.modes || []) {
      const key = String(mode.nodeKey || "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, { type: item.type, mode: mode.value, implemented: mode.implemented !== false });
    }
  }
  return map;
})();

function resolveStudioNodeMeta(rawNodeKey: any): { type: NodeType; mode: string, implemented: boolean } {
  const raw = String(rawNodeKey || "").trim().toLowerCase();
  if (raw) {
    const fromCatalog = NODE_KEY_TO_STUDIO_META.get(raw);
    if (fromCatalog) return fromCatalog;
  }
  return { type: "utilities", mode: "function", implemented: true };
}

function studioNodesFromTemplateDefinition(definitionNodes: any[]): WorkflowNode[] {
  const safeNodes = Array.isArray(definitionNodes) ? definitionNodes : [];
  return safeNodes.map((rawNode: any, index: number) => {
    const rawNodeKey = String(
      rawNode?.node_ref?.key
      || rawNode?.nodeRef?.key
      || rawNode?.node_type
      || rawNode?.type
      || ""
    ).trim();
    const resolved = resolveStudioNodeMeta(rawNodeKey);
    const item = CATALOG_BY_TYPE.get(resolved.type);
    const nodeId = String(rawNode?.id || `${resolved.type}_${index + 1}`).trim() || `${resolved.type}_${index + 1}`;
    const label = String(rawNode?.title || rawNode?.label || rawNode?.name || nodeId).trim() || nodeId;
    const defaultData = createNodeData(resolved.type, resolved.mode);
    const config = isObjectRecord(rawNode?.config)
      ? deepClone(rawNode.config)
      : deepClone(defaultData.config || {});
    const inputBindings = isObjectRecord(rawNode?.input_bindings)
      ? deepClone(rawNode.input_bindings)
      : {};
    const nodeRefKey = String(rawNode?.node_ref?.key || rawNode?.nodeRef?.key || nodeKeyFor(resolved.type, resolved.mode) || "").trim();
    const rawNodeRefVersion = rawNode?.node_ref?.version ?? rawNode?.nodeRef?.version ?? defaultData?.node_ref?.version;
    const nodeRefVersion = Number(rawNodeRefVersion);
    const nextData: Record<string, any> = {
      ...defaultData,
      config,
      input_bindings: inputBindings,
      enabled: rawNode?.enabled !== false,
      implemented: resolved.implemented,
    };
    if (resolved.type !== "note" && resolved.type !== "end" && nodeRefKey) {
      const normalizedRef: Record<string, any> = {
        key: nodeRefKey,
      };
      if (Number.isFinite(nodeRefVersion) && nodeRefVersion > 0) {
        normalizedRef.version = Math.trunc(nodeRefVersion);
      }
      nextData.node_ref = normalizedRef;
    }
    if (String(rawNode?.join || "").trim()) {
      nextData.join = String(rawNode.join).trim();
    }
    if (String(rawNode?.on_error || "").trim()) {
      nextData.on_error = String(rawNode.on_error).trim();
    }
    if (resolved.type === "human" && isObjectRecord(rawNode?.assignee)) {
      nextData.config = { ...nextData.config, assignee: deepClone(rawNode.assignee) };
    }

    return {
      id: nodeId,
      type: resolved.type,
      label,
      icon: item?.icon,
      color: item?.color,
      position: rawNode?.metadata?.ui?.position || rawNode?.position || {
        x: 100 + index * 380,
        y: 200,
      },
      data: nextData,
    };
  });
}

function studioEdgesFromTemplateDefinition(definitionEdges: any[]): WorkflowEdge[] {
  const safeEdges = Array.isArray(definitionEdges) ? definitionEdges : [];
  const out: WorkflowEdge[] = [];
  for (let index = 0; index < safeEdges.length; index += 1) {
    const edge = safeEdges[index];
    const from = String(edge?.from || "").trim();
    const to = String(edge?.to || "").trim();
    if (!from || !to || from === to) continue;
    const edgeId = String(edge?.id || `edge_${index + 1}`).trim() || `edge_${index + 1}`;
    const when = isObjectRecord(edge?.when) ? edge.when : {};
    let sourceHandle: string | undefined;
    if (String(when?.type || "").trim().toLowerCase() === "route") {
      const rawHandle = String(when?.equals ?? "").trim();
      const normalizedHandle = rawHandle.toLowerCase();
      sourceHandle = normalizedHandle === "true" || normalizedHandle === "false"
        ? normalizedHandle
        : rawHandle || undefined;
    }
    out.push({
      id: edgeId,
      from,
      to,
      sourceHandle,
    });
  }
  return out;
}

function autoLayoutDagNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const byId = new Map<string, WorkflowNode>();
  for (const node of nodes) byId.set(String(node.id), node);
  const validEdges = (Array.isArray(edges) ? edges : []).filter((edge) => byId.has(String(edge.from)) && byId.has(String(edge.to)));

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of nodes) {
    const id = String(node.id);
    incoming.set(id, []);
    outgoing.set(id, []);
    indegree.set(id, 0);
  }
  for (const edge of validEdges) {
    const from = String(edge.from);
    const to = String(edge.to);
    outgoing.get(from)?.push(to);
    incoming.get(to)?.push(from);
    indegree.set(to, Number(indegree.get(to) || 0) + 1);
  }

  const queue: string[] = [];
  for (const node of nodes) {
    const id = String(node.id);
    if (Number(indegree.get(id) || 0) === 0) queue.push(id);
  }

  const levelById = new Map<string, number>();
  const orderById = new Map<string, number>();
  let orderCursor = 0;
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (!orderById.has(current)) {
      orderById.set(current, orderCursor);
      orderCursor += 1;
    }
    const currentLevel = Number(levelById.get(current) || 0);
    for (const next of outgoing.get(current) || []) {
      const nextLevel = Math.max(Number(levelById.get(next) || 0), currentLevel + 1);
      levelById.set(next, nextLevel);
      indegree.set(next, Number(indegree.get(next) || 0) - 1);
      if (Number(indegree.get(next) || 0) === 0) queue.push(next);
    }
  }

  for (const node of nodes) {
    const id = String(node.id);
    if (!levelById.has(id)) levelById.set(id, 0);
    if (!orderById.has(id)) {
      orderById.set(id, orderCursor);
      orderCursor += 1;
    }
  }

  const byLevel = new Map<number, string[]>();
  for (const node of nodes) {
    const id = String(node.id);
    const level = Number(levelById.get(id) || 0);
    const list = byLevel.get(level) || [];
    list.push(id);
    byLevel.set(level, list);
  }

  const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);
  for (const level of levels) {
    const nodeIds = byLevel.get(level) || [];
    nodeIds.sort((a, b) => {
      const aParents = incoming.get(a) || [];
      const bParents = incoming.get(b) || [];
      const aCenter = aParents.length > 0
        ? aParents.reduce((sum, parentId) => sum + Number(orderById.get(parentId) || 0), 0) / aParents.length
        : Number(orderById.get(a) || 0);
      const bCenter = bParents.length > 0
        ? bParents.reduce((sum, parentId) => sum + Number(orderById.get(parentId) || 0), 0) / bParents.length
        : Number(orderById.get(b) || 0);
      if (aCenter !== bCenter) return aCenter - bCenter;
      return Number(orderById.get(a) || 0) - Number(orderById.get(b) || 0);
    });
    nodeIds.forEach((nodeId, idx) => orderById.set(nodeId, idx));
    byLevel.set(level, nodeIds);
  }

  const baseX = 120;
  const baseY = 220;
  const colGap = 380;
  const rowGap = 180;

  return nodes.map((node) => {
    const nodeId = String(node.id);
    const level = Number(levelById.get(nodeId) || 0);
    const levelNodes = byLevel.get(level) || [nodeId];
    const index = Math.max(0, levelNodes.indexOf(nodeId));
    const offset = -((Math.max(1, levelNodes.length) - 1) * rowGap) / 2;
    return {
      ...node,
      position: {
        x: baseX + level * colGap,
        y: baseY + offset + index * rowGap,
      },
    };
  });
}

function defaultConfigFor(type: string, mode: string): Record<string, any> {
  if (type === "trigger") {
    return {
      input: { doc_id: "", doc_ids: [] },
      context: { source: "workflow-builder" },
    };
  }

  if (type === "ai" && mode === "generate") {
    return {
      prompt: "You are a helpful assistant.",
      response_format: "text",
      temperature: 0.2,
      doc_ids: [],
    };
  }
  if (type === "ai" && mode === "extract") {
    return {
      text: "",
      doc_ids: [],
      schema_fields: ["invoice_number", "amount", "date"],
    };
  }
  if (type === "ai" && mode === "classify") {
    return {
      text: "",
      doc_ids: [],
      labels: ["invoice", "agreement", "kyc"],
      threshold: 0.5,
      multi_label: false,
    };
  }

  if (type === "records" && mode === "list_folder") {
    return {
      folder_path: "/",
      recursive: false,
      limit: 100,
      filters: [{ id: "filter_1", field: "", operator: "equals", value: "" }],
    };
  }
  if (type === "records" && mode === "read_document") {
    return { doc_id: "", doc_ids: [], include_text: true, include_metadata: true, max_chars: 6000 };
  }

  if (type === "retrieval") {
    return { query: "", top_k: 10, min_score: 0.2, source_scope: "folder" };
  }

  if (type === "document" && mode === "create") {
    return {
      title: "Generated Document",
      filename: "generated-document.md",
      folder_path: "/",
      content: "",
    };
  }
  if (type === "document" && mode === "update") {
    return {
      doc_id: "",
      title: "",
      content: "",
      create_new_version: true,
    };
  }

  if (type === "file" && mode === "move") {
    return { doc_ids: [], dest_path: "/processed" };
  }
  if (type === "file" && mode === "set_metadata") {
    return { doc_ids: [], tags: [], keywords: [], category: "", merge: true };
  }

  if (type === "checks" && mode === "validate") {
    return {
      required_fields: [],
      rules: [{ id: "rule_1", field: "", operator: "equals", expected: "" }],
      fail_on_warning: false,
    };
  }
  if (type === "checks" && mode === "reconcile") {
    return { records_source_path: "", key_fields: ["id"] };
  }
  if (type === "checks" && mode === "packet_check") {
    return { doc_ids: [], required_patterns: [], required_types: [], min_docs: 1 };
  }

  if (type === "flow" && mode === "if_else") {
    return {
      condition_logic: "all",
      conditions: [{ id: "condition_1", field: "", operator: "equals", value: "" }],
      truthy_values: ["true", "yes", "1"],
      true_label: "True",
      false_label: "False",
    };
  }
  if (type === "flow" && mode === "router") {
    return {
      route_key: "",
      routes: [
        { id: "route_1", key: "finance", label: "Finance" },
        { id: "route_2", key: "ops", label: "Operations" },
      ],
      default_route: "default",
    };
  }
  if (type === "flow" && mode === "for_each") {
    return { items_path: "", max_items: 100, continue_on_item_error: false };
  }
  if (type === "flow" && mode === "merge_results") {
    return { mode: "array", from_nodes: [] };
  }

  if (type === "human" && mode === "review") {
    return {
      title: "Review required",
      assignee: { type: "role", value: "orgAdmin" },
      due_in_hours: 24,
      reminder_minutes: 60,
      comment_required: false,
    };
  }
  if (type === "human" && mode === "approval") {
    return {
      title: "Approval required",
      assignee: { type: "role", value: "orgAdmin" },
      due_in_hours: 24,
      reminder_minutes: 60,
      comment_required: false,
    };
  }
  if (type === "human" && mode === "checklist") {
    return {
      title: "Checklist task",
      assignee: { type: "role", value: "orgAdmin" },
      checklist_items: ["Validate docs", "Confirm fields", "Submit decision"],
    };
  }
  if (type === "human" && mode === "task") {
    return {
      title: "Task",
      assignee: { type: "role", value: "orgAdmin" },
      due_in_hours: 24,
      reminder_minutes: 0,
      comment_required: false,
    };
  }

  if (type === "output") {
    return { rows_source_path: "", filename: "export.csv", columns: [] };
  }

  if (type === "utilities" && mode === "delay") {
    return { duration_ms: 0, until_datetime: "", timezone: "UTC", jitter_ms: 0 };
  }
  if (type === "utilities" && mode === "transform") {
    return {
      mode: "mapping",
      mappings: [{ id: "mapping_1", target: "", source: "" }],
      validate_schema: false,
    };
  }
  if (type === "utilities" && mode === "function") {
    return { operation_type: "expression", expression: "", timeout_ms: 10000 };
  }
  if (type === "utilities" && mode === "state") {
    return { operation: "set", key: "", value: "", scope: "run", ttl_minutes: 0 };
  }

  if (type === "audit") {
    return {
      event_type: "workflow.step",
      message: "",
      severity: "info",
      payload_fields: [{ id: "kv_1", key: "", value: "" }],
    };
  }

  if (type === "note") {
    return { content: "Add your note" };
  }

  if (type === "end") {
    return { final_status: "completed" };
  }

  return {};
}

function createNodeData(type: string, mode?: string): Record<string, any> {
  const selectedMode = mode || defaultModeFor(type);
  const nodeKey = nodeKeyFor(type, selectedMode);
  if (type === "note" || type === "end") {
    return {
      mode: selectedMode,
      config: defaultConfigFor(type, selectedMode),
      enabled: true,
    };
  }

  return {
    mode: selectedMode,
    node_ref: {
      key: nodeKey,
    },
    config: defaultConfigFor(type, selectedMode),
    input_bindings: {},
    on_error: "fail_fast",
    join: "all",
    metadata: {
      ui: {},
    },
    enabled: true,
  };
}

function clearTriggerRuntimeInputsInStudioNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.map((node) => {
    if (node.type !== "trigger") return node;
    const data = getNodeDataRecord(node);
    const config = getNodeConfigRecord(node);
    return {
      ...node,
      data: {
        ...data,
        config: {
          ...config,
          input: {},
        },
      },
    };
  });
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

function buildNodeDisplayNameById(nodes: WorkflowNode[]): Record<string, string> {
  const counts = new Map<string, number>();
  const out: Record<string, string> = {};

  for (const node of nodes) {
    const base = String(node.label || node.type || "Step").trim() || "Step";
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    out[node.id] = count === 1 ? base : `${base} ${count}`;
  }

  return out;
}

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

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function resolveNodeTypeForSave(node: WorkflowNode): string {
  if (node.type === "note" || node.type === "end") return node.type;
  const data = getNodeDataRecord(node);
  const mode = String(data.mode || defaultModeFor(node.type));
  const refKey = String(data?.node_ref?.key || "").trim();
  const fallbackKey = String(nodeKeyFor(node.type, mode) || "").trim();
  return String(refKey || fallbackKey || "").trim();
}

function inferDefinitionMode(definition: Record<string, any>): "legacy" | "mixed" | "registry" {
  const nodeList = Array.isArray(definition?.nodes) ? definition.nodes : [];
  let hasRegistry = false;
  let hasLegacy = false;
  for (const node of nodeList) {
    const hasRef = Boolean(String(node?.node_ref?.key || "").trim());
    const hasNodeType = Boolean(String(node?.node_type || "").trim());
    if (hasRef) hasRegistry = true;
    if (hasNodeType && !hasRef) hasLegacy = true;
  }
  if (hasRegistry && hasLegacy) return "mixed";
  if (hasRegistry) return "registry";
  return "legacy";
}

function normalizeStudioNodesForSave(nodes: WorkflowNode[]): {
  nodes: Record<string, any>[];
  idMap: Map<string, string>;
  nodeTypeByOriginalId: Map<string, string>;
} {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const normalizedNodes: Record<string, any>[] = [];
  const idMap = new Map<string, string>();
  const nodeTypeByOriginalId = new Map<string, string>();
  const used = new Set<string>();

  for (let index = 0; index < safeNodes.length; index += 1) {
    const node = safeNodes[index];
    if (!node) continue;

    const sourceId = String(node.id || "").trim() || `step_${index + 1}`;
    const nodeType = resolveNodeTypeForSave(node);
    if (!nodeType) continue;

    const preferred = sanitizeStepId(sourceId)
      || sanitizeStepId(String(node.label || "step"))
      || `step_${index + 1}`;
    let uniqueId = preferred;
    let suffix = 2;
    while (used.has(uniqueId)) {
      uniqueId = `${preferred}_${suffix}`;
      suffix += 1;
    }
    used.add(uniqueId);
    idMap.set(sourceId, uniqueId);
    nodeTypeByOriginalId.set(sourceId, nodeType);

    const data = getNodeDataRecord(node);
    const config = getNodeConfigRecord(node);
    const bindings = getNodeBindingsRecord(node);
    const nextNode: Record<string, any> = {
      id: uniqueId,
      node_type: nodeType,
      title: String(node.label || uniqueId).trim() || uniqueId,
    };

    const refKey = String(data?.node_ref?.key || "").trim();
    if (refKey) {
      const parsedVersion = Number(data?.node_ref?.version);
      const nextRef: Record<string, any> = {
        key: refKey,
      };
      if (Number.isFinite(parsedVersion) && parsedVersion > 0) {
        nextRef.version = Math.trunc(parsedVersion);
      }
      nextNode.node_ref = nextRef;
    }
    if (isObjectRecord(config) && Object.keys(config).length > 0) {
      nextNode.config = deepClone(config);
    }
    if (isObjectRecord(bindings) && Object.keys(bindings).length > 0) {
      nextNode.input_bindings = deepClone(bindings);
    }
    if (node.type === "human" && isObjectRecord(config?.assignee)) {
      nextNode.assignee = deepClone(config.assignee);
    }
    if (data.enabled === false) {
      nextNode.enabled = false;
    }
    nextNode.metadata = {
      ...(isObjectRecord(data.metadata) ? deepClone(data.metadata) : {}),
      ui: {
        ...(isObjectRecord(data.metadata?.ui) ? deepClone(data.metadata.ui) : {}),
        position: node.position,
      },
    };
    normalizedNodes.push(nextNode);
  }

  return { nodes: normalizedNodes, idMap, nodeTypeByOriginalId };
}

function normalizeStudioEdgesForSave(
  edges: WorkflowEdge[],
  idMap: Map<string, string>,
  validNodeIds: Set<string>,
  nodeTypeByOriginalId: Map<string, string>
): Array<Record<string, any>> {
  const safeEdges = Array.isArray(edges) ? edges : [];
  const output: Array<Record<string, any>> = [];
  const usedEdgeIds = new Set<string>();

  for (let index = 0; index < safeEdges.length; index += 1) {
    const edge = safeEdges[index];
    const rawFrom = String(edge?.from || "").trim();
    const rawTo = String(edge?.to || "").trim();
    const from = idMap.get(rawFrom) || sanitizeStepId(rawFrom);
    const to = idMap.get(rawTo) || sanitizeStepId(rawTo);
    if (!from || !to || from === to) continue;
    if (!validNodeIds.has(from) || !validNodeIds.has(to)) continue;

    const baseEdgeId = sanitizeStepId(String(edge?.id || `${from}_${to}_${index + 1}`)) || `edge_${index + 1}`;
    let edgeId = baseEdgeId;
    let suffix = 2;
    while (usedEdgeIds.has(edgeId)) {
      edgeId = `${baseEdgeId}_${suffix}`;
      suffix += 1;
    }
    usedEdgeIds.add(edgeId);

    const sourceType = String(nodeTypeByOriginalId.get(rawFrom) || "").trim().toLowerCase();
    const rawSourceHandle = String(edge?.sourceHandle || "").trim();
    const sourceHandle = sourceType === "flow.branch"
      ? rawSourceHandle.toLowerCase()
      : rawSourceHandle;
    const when = sourceHandle && (sourceType === "flow.branch" || sourceType === "flow.route")
      ? { type: "route", equals: sourceHandle }
      : { type: "always" };

    output.push({
      id: edgeId,
      from,
      to,
      when,
    });
  }

  return output;
}

function buildSequentialEdgesForStudio(nodeIds: string[]): Array<Record<string, any>> {
  const safeNodeIds = Array.isArray(nodeIds)
    ? nodeIds.map((nodeId) => String(nodeId || "").trim()).filter(Boolean)
    : [];
  const output: Array<Record<string, any>> = [];
  for (let index = 0; index < safeNodeIds.length - 1; index += 1) {
    const from = safeNodeIds[index];
    const to = safeNodeIds[index + 1];
    output.push({
      id: sanitizeStepId(`${from}_to_${to}_${index + 1}`) || `edge_${index + 1}`,
      from,
      to,
      when: { type: "always" },
    });
  }
  return output;
}

type InputBindingRow = {
  id: string;
  target: string;
  source_type: "run_input" | "step_output" | "constant";
  source_path: string;
  step_id: string;
  value: string;
};

type InputMappingContract = {
  expectedTargets: string[];
  enforceExpectedTargets: boolean;
  maxMappings: number | null;
};

type ConnectionGuardResult = {
  allow: boolean;
  level?: "warning" | "error" | "info";
  message?: string;
  suggestions?: string[];
};

const STEP_OUTPUT_PATH_PATTERN = /^\$\.steps\.([^.[\]]+)\.output(?:\.(.+))?$/;

function parseStepOutputPath(value: string): { stepId: string; sourcePath: string } | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(STEP_OUTPUT_PATH_PATTERN);
  if (!match) return null;
  return {
    stepId: String(match[1] || "").trim(),
    sourcePath: String(match[2] || "").trim(),
  };
}

function normalizeRunInputField(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "$.input") return "";
  if (raw.startsWith("$.input.")) return raw.slice("$.input.".length).trim();
  if (raw.startsWith("input.")) return raw.slice("input.".length).trim();
  return raw;
}

function normalizeInputPathSegment(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const head = raw.split(".")[0] || "";
  return String(head).replace(/\[\d+\]$/, "").trim();
}

function parseRunInputPath(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw === "$.input" || raw === "input") return null;
  if (raw.startsWith("$.input.")) {
    const key = normalizeInputPathSegment(raw.slice("$.input.".length));
    return key || null;
  }
  if (raw.startsWith("input.")) {
    const key = normalizeInputPathSegment(raw.slice("input.".length));
    return key || null;
  }
  return null;
}

function findTriggerNode(nodeById: Record<string, WorkflowNode> = {}, preferredNodeId: string | null = null): WorkflowNode | null {
  if (preferredNodeId) {
    const direct = nodeById[preferredNodeId];
    if (direct?.type === "trigger") return direct;
  }
  for (const node of Object.values(nodeById)) {
    if (node?.type === "trigger") return node;
  }
  return null;
}

function triggerInputValueForKey(triggerNode: WorkflowNode, rawKey: string): any {
  const key = normalizeInputPathSegment(rawKey).toLowerCase();
  if (!key) return undefined;
  const config = getNodeConfigRecord(triggerNode);
  const input = isObjectRecord(config?.input) ? config.input : {};
  const read = (candidate: string) => (input as Record<string, any>)[candidate];

  const candidates = [key];
  if (key === "doc_ids") candidates.push("doc_id");
  if (key === "doc_id") candidates.push("doc_ids");
  if (key === "folder_path") candidates.push("folderPath");
  if (key === "ruleset_doc_id") candidates.push("rulesetDocId");

  for (const candidate of candidates) {
    const value = read(candidate);
    if (hasMeaningfulValue(value)) return value;
  }
  return undefined;
}

function buildStageByNodeId(nodes: WorkflowNode[], edges: WorkflowEdge[]): Record<string, number> {
  const relevantNodes = nodes.filter((node) => node.type !== "note");
  const nodeIds = relevantNodes.map((node) => node.id);
  const nodeSet = new Set(nodeIds);
  const indexById = new Map(nodeIds.map((id, index) => [id, index]));
  const indegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};
  const stageById: Record<string, number> = {};

  for (const id of nodeIds) {
    indegree[id] = 0;
    adjacency[id] = [];
    stageById[id] = 0;
  }

  for (const edge of edges) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to) || edge.from === edge.to) continue;
    adjacency[edge.from].push(edge.to);
    indegree[edge.to] = (indegree[edge.to] || 0) + 1;
  }

  const queue = nodeIds.filter((id) => (indegree[id] || 0) === 0).sort((a, b) => (indexById.get(a) || 0) - (indexById.get(b) || 0));
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    const currentStage = stageById[current] || 0;
    for (const nextId of adjacency[current] || []) {
      stageById[nextId] = Math.max(stageById[nextId] || 0, currentStage + 1);
      indegree[nextId] = Math.max(0, (indegree[nextId] || 0) - 1);
      if (indegree[nextId] === 0) {
        queue.push(nextId);
      }
    }
  }

  // Cycle-safe fallback: keep deterministic stages by propagating from known neighbors in canvas order.
  for (const id of nodeIds.sort((a, b) => (indexById.get(a) || 0) - (indexById.get(b) || 0))) {
    if ((indegree[id] || 0) === 0) continue;
    const incoming = edges.filter((edge) => edge.to === id && nodeSet.has(edge.from));
    let nextStage = stageById[id] || 0;
    for (const edge of incoming) {
      nextStage = Math.max(nextStage, (stageById[edge.from] || 0) + 1);
    }
    stageById[id] = nextStage;
  }

  return stageById;
}

function canUseSourceStep(sourceNodeId: string, targetNodeId: string, stageByNodeId: Record<string, number>): boolean {
  const sourceStage = stageByNodeId[sourceNodeId];
  const targetStage = stageByNodeId[targetNodeId];
  if (!Number.isFinite(sourceStage) || !Number.isFinite(targetStage)) return false;
  return Number(sourceStage) < Number(targetStage);
}

function isValidInputValueForNode(
  value: any,
  targetNodeId: string,
  stageByNodeId: Record<string, number>,
  nodeById: Record<string, WorkflowNode> = {}
): boolean {
  const raw = typeof value === "string" ? String(value || "").trim() : "";
  const runInputKey = raw ? parseRunInputPath(raw) : null;
  if (runInputKey) {
    const triggerNode = findTriggerNode(nodeById);
    if (triggerNode) {
      return hasMeaningfulValue(triggerInputValueForKey(triggerNode, runInputKey));
    }
    return hasMeaningfulValue(value);
  }

  const parsed = raw ? parseStepOutputPath(raw) : null;
  if (!parsed) return hasMeaningfulValue(value);
  const sourceNode = nodeById[parsed.stepId];
  if (sourceNode?.type === "trigger") {
    const sourceKey = normalizeInputPathSegment(parsed.sourcePath);
    if (!sourceKey) return false;
    return hasMeaningfulValue(triggerInputValueForKey(sourceNode, sourceKey));
  }
  return canUseSourceStep(parsed.stepId, targetNodeId, stageByNodeId);
}

function explicitInputTargetsForNode(node: WorkflowNode): string[] {
  const mode = String(getNodeDataRecord(node).mode || "");

  if (node.type === "trigger" || node.type === "note" || node.type === "end") return [];
  if (node.type === "ai" && mode === "generate") return ["doc_ids"];
  if (node.type === "ai" && (mode === "extract" || mode === "classify")) return ["doc_ids", "text"];
  if (node.type === "records" && mode === "list_folder") return ["folder_path"];
  if (node.type === "records" && mode === "read_document") return ["doc_ids"];
  if (node.type === "retrieval" && mode === "internal") return ["query"];
  if (node.type === "document" && mode === "create") return ["content"];
  if (node.type === "document" && mode === "update") return ["doc_ids", "content"];
  if (node.type === "file" && mode === "move") return ["doc_ids", "dest_path"];
  if (node.type === "file" && mode === "set_metadata") return ["doc_ids"];
  if (node.type === "checks" && mode === "validate") return ["data"];
  if (node.type === "checks" && mode === "reconcile") return ["records"];
  if (node.type === "checks" && mode === "packet_check") return ["doc_ids"];
  if (node.type === "flow" && mode === "if_else") return ["value"];
  if (node.type === "flow" && mode === "router") return ["route_key"];
  if (node.type === "flow" && mode === "for_each") return ["items"];
  if (node.type === "flow" && mode === "merge_results") return ["items"];
  if (node.type === "human") return ["task_payload"];
  if (node.type === "output" && mode === "export_csv") return ["rows"];
  if (node.type === "utilities" && mode === "transform") return ["records"];
  if (node.type === "utilities" && mode === "function") return ["input"];
  if (node.type === "utilities" && mode === "state") return ["value"];
  if (node.type === "audit" && mode === "event") return ["payload"];
  return [];
}

function inputMappingContractForNode(node: WorkflowNode | null): InputMappingContract {
  if (!node) {
    return { expectedTargets: [], enforceExpectedTargets: false, maxMappings: null };
  }
  const expectedTargets = Array.from(
    new Set(
      [
        ...autoBindingRulesForTarget(node).map((rule) => String(rule.targetKey || "").trim()),
        ...explicitInputTargetsForNode(node),
      ].filter(Boolean)
    )
  );
  if (expectedTargets.length === 0) {
    return { expectedTargets: [], enforceExpectedTargets: false, maxMappings: 0 };
  }
  return {
    expectedTargets,
    enforceExpectedTargets: true,
    maxMappings: expectedTargets.length,
  };
}

function sanitizeBindingRowsForNode(
  rows: InputBindingRow[],
  contract: InputMappingContract,
  allowedStepIds: Set<string>
): InputBindingRow[] {
  const defaultRowForTarget = (target: string, index: number): InputBindingRow => ({
    id: `binding_${target || index + 1}`,
    target,
    source_type: "run_input",
    source_path: "",
    step_id: "",
    value: "",
  });

  const trimmedRows = rows.map((row, index) => ({
    id: String(row.id || `binding_${index + 1}`),
    target: String(row.target || "").trim(),
    source_type: row.source_type,
    source_path: String(row.source_path || "").trim(),
    step_id: String(row.step_id || "").trim(),
    value: String(row.value || ""),
  }));

  let workingRows: InputBindingRow[] = [];
  if (contract.enforceExpectedTargets) {
    const byTarget = new Map<string, InputBindingRow>();
    for (const row of trimmedRows) {
      if (!row.target || !contract.expectedTargets.includes(row.target)) continue;
      if (!byTarget.has(row.target)) byTarget.set(row.target, row);
    }
    workingRows = contract.expectedTargets.map((target, index) => byTarget.get(target) || defaultRowForTarget(target, index));
  } else {
    const seenTargets = new Set<string>();
    for (const row of trimmedRows) {
      if (contract.maxMappings !== null && contract.maxMappings <= 0) break;
      if (!row.target || seenTargets.has(row.target)) continue;
      seenTargets.add(row.target);
      workingRows.push(row);
      if (contract.maxMappings !== null && workingRows.length >= contract.maxMappings) break;
    }
  }

  return workingRows.map((row) => {
    if (row.source_type !== "step_output") {
      return { ...row, step_id: "" };
    }
    const parsedPath = parseStepOutputPath(row.source_path);
    const effectiveStepId = row.step_id || parsedPath?.stepId || "";
    const effectiveSourcePath = parsedPath ? parsedPath.sourcePath : row.source_path;
    if (!effectiveStepId || !allowedStepIds.has(effectiveStepId)) {
      return {
        ...row,
        step_id: "",
        source_path: effectiveSourcePath,
      };
    }
    return {
      ...row,
      step_id: effectiveStepId,
      source_path: effectiveSourcePath,
    };
  });
}

function createsGraphCycle(sourceNodeId: string, targetNodeId: string, edges: WorkflowEdge[]): boolean {
  if (sourceNodeId === targetNodeId) return true;
  const stack = [targetNodeId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === sourceNodeId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.from === current) stack.push(edge.to);
    }
  }
  return false;
}

function collectUpstreamNodeIds(targetNodeId: string, edges: WorkflowEdge[]): Set<string> {
  const upstream = new Set<string>();
  const stack = [targetNodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const edge of edges) {
      if (edge.to !== current) continue;
      if (upstream.has(edge.from)) continue;
      upstream.add(edge.from);
      stack.push(edge.from);
    }
  }
  return upstream;
}

function normalizeInputBindings(value: any): InputBindingRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows: InputBindingRow[] = [];
  for (const [target, rule] of Object.entries(value)) {
    if (!target.trim()) continue;
    if (typeof rule === "string") {
      const raw = String(rule || "").trim();
      const parsedStep = parseStepOutputPath(raw);
      if (parsedStep) {
        rows.push({
          id: `binding_${target}`,
          target,
          source_type: "step_output",
          step_id: parsedStep.stepId,
          source_path: parsedStep.sourcePath,
          value: "",
        });
        continue;
      }
      if (raw === "$.input" || raw.startsWith("$.input.")) {
        rows.push({
          id: `binding_${target}`,
          target,
          source_type: "run_input",
          source_path: raw === "$.input" ? "" : raw.slice("$.input.".length),
          step_id: "",
          value: "",
        });
        continue;
      }
      if (raw.startsWith("input.")) {
        rows.push({
          id: `binding_${target}`,
          target,
          source_type: "run_input",
          source_path: raw.slice("input.".length),
          step_id: "",
          value: "",
        });
        continue;
      }
      rows.push({
        id: `binding_${target}`,
        target,
        source_type: "constant",
        source_path: "",
        step_id: "",
        value: raw,
      });
      continue;
    }
    const sourceType = String((rule as any)?.source || "run_input").trim();
    if (sourceType === "step_output") {
      rows.push({
        id: `binding_${target}`,
        target,
        source_type: "step_output",
        source_path: String((rule as any)?.path || ""),
        step_id: String((rule as any)?.step_id || ""),
        value: "",
      });
      continue;
    }
    if (sourceType === "constant") {
      rows.push({
        id: `binding_${target}`,
        target,
        source_type: "constant",
        source_path: "",
        step_id: "",
        value: String((rule as any)?.value ?? ""),
      });
      continue;
    }
    rows.push({
      id: `binding_${target}`,
      target,
      source_type: "run_input",
      source_path: String((rule as any)?.path || ""),
      step_id: String((rule as any)?.step_id || ""),
      value: String((rule as any)?.value || ""),
    });
  }
  return rows;
}

function serializeInputBindings(rows: InputBindingRow[]): Record<string, any> {
  const output: Record<string, any> = {};
  const parseConstant = (raw: string) => {
    const text = String(raw || "").trim();
    if (text === "true") return true;
    if (text === "false") return false;
    if (text === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    return raw;
  };
  for (const row of rows) {
    const target = String(row.target || "").trim();
    if (!target) continue;
    if (row.source_type === "constant") {
      output[target] = parseConstant(row.value);
      continue;
    }
    if (row.source_type === "step_output") {
      const rawPath = String(row.source_path || "").trim();
      const parsedPath = parseStepOutputPath(rawPath);
      const stepId = String(row.step_id || "").trim() || parsedPath?.stepId || "";
      if (!stepId) continue;
      const cleaned = (parsedPath?.sourcePath || rawPath).replace(/^output\.?/i, "").trim();
      output[target] = cleaned
        ? `$.steps.${stepId}.output.${cleaned}`
        : `$.steps.${stepId}.output`;
      continue;
    }
    const rawPath = String(row.source_path || "").trim();
    if (!rawPath) {
      output[target] = "$.input";
      continue;
    }
    if (rawPath.startsWith("$.")) {
      const cleanedAbsolute = rawPath.replace(/^\$\.input\.?/i, "").trim();
      output[target] = rawPath === "$.input" || rawPath.startsWith("$.input.")
        ? (cleanedAbsolute ? `$.input.${cleanedAbsolute}` : "$.input")
        : "$.input";
      continue;
    }
    const cleaned = rawPath.replace(/^input\.?/i, "").trim();
    output[target] = cleaned ? `$.input.${cleaned}` : "$.input";
  }
  return output;
}

function isObjectRecord(value: any): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasMeaningfulValue(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function hasAnyField(bindings: Record<string, any>, config: Record<string, any>, bindingKeys: string[], configKeys: string[] = bindingKeys): boolean {
  const bindingHit = bindingKeys.some((key) => hasMeaningfulValue(bindings?.[key]));
  const configHit = configKeys.some((key) => hasMeaningfulValue(config?.[key]));
  return bindingHit || configHit;
}

function buildStepOutputPath(sourceNodeId: string, outputPath?: string): string {
  const clean = String(outputPath || "").trim().replace(/^output\.?/i, "");
  return clean ? `$.steps.${sourceNodeId}.output.${clean}` : `$.steps.${sourceNodeId}.output`;
}

function preferredDocIdsPathFromSource(sourceNode: WorkflowNode): string {
  const mode = String(sourceNode?.data?.mode || "");
  if (sourceNode.type === "document" && mode === "create") return buildStepOutputPath(sourceNode.id, "generated_doc_id");
  if (sourceNode.type === "file" && mode === "set_metadata") return buildStepOutputPath(sourceNode.id, "updated_doc_ids");
  if (sourceNode.type === "checks" && mode === "packet_check") return buildStepOutputPath(sourceNode.id, "doc_ids");
  if (sourceNode.type === "ai") return buildStepOutputPath(sourceNode.id, "input_doc_ids");
  if (sourceNode.type === "records" && mode === "read_document") return buildStepOutputPath(sourceNode.id, "doc_id");
  return buildStepOutputPath(sourceNode.id, "doc_ids");
}

function preferredTextPathFromSource(sourceNode: WorkflowNode): string {
  const mode = String(sourceNode?.data?.mode || "");
  if (sourceNode.type === "ai" && mode === "generate") return buildStepOutputPath(sourceNode.id, "response_text");
  if (sourceNode.type === "records" && mode === "read_document") return buildStepOutputPath(sourceNode.id, "text");
  return buildStepOutputPath(sourceNode.id, "text");
}

function preferredContentPathFromSource(sourceNode: WorkflowNode): string {
  const mode = String(sourceNode?.data?.mode || "");
  if (sourceNode.type === "ai" && mode === "generate") return buildStepOutputPath(sourceNode.id, "response_text");
  if (sourceNode.type === "records" && mode === "read_document") return buildStepOutputPath(sourceNode.id, "text");
  if (sourceNode.type === "ai" && mode === "extract") return buildStepOutputPath(sourceNode.id, "records");
  return buildStepOutputPath(sourceNode.id);
}

function preferredRecordsPathFromSource(sourceNode: WorkflowNode): string {
  const mode = String(sourceNode?.data?.mode || "");
  if (sourceNode.type === "ai" && mode === "extract") return buildStepOutputPath(sourceNode.id, "records");
  if (sourceNode.type === "records" && mode === "list_folder") return buildStepOutputPath(sourceNode.id, "docs");
  if (sourceNode.type === "flow" && mode === "for_each") return buildStepOutputPath(sourceNode.id, "items");
  if (sourceNode.type === "flow" && mode === "merge_results") return buildStepOutputPath(sourceNode.id, "items");
  return buildStepOutputPath(sourceNode.id, "records");
}

type AutoBindingRule = {
  targetKey: string;
  bindingKeys?: string[];
  configKeys?: string[];
  runInputFallback?: string;
  fromSource: (sourceNode: WorkflowNode) => string | null;
};

function autoBindingRulesForTarget(targetNode: WorkflowNode): AutoBindingRule[] {
  const mode = String(targetNode?.data?.mode || "");

  if (targetNode.type === "ai" && mode === "generate") {
    return [
      {
        targetKey: "doc_ids",
        bindingKeys: ["doc_ids", "doc_id"],
        configKeys: ["doc_ids", "doc_id"],
        runInputFallback: "$.input.doc_ids",
        fromSource: preferredDocIdsPathFromSource,
      },
    ];
  }

  if (targetNode.type === "ai" && (mode === "extract" || mode === "classify")) {
    return [
      {
        targetKey: "doc_ids",
        bindingKeys: ["doc_ids", "doc_id"],
        configKeys: ["doc_ids", "doc_id"],
        runInputFallback: "$.input.doc_ids",
        fromSource: preferredDocIdsPathFromSource,
      },
      {
        targetKey: "text",
        bindingKeys: ["text"],
        configKeys: ["text"],
        runInputFallback: "$.input.text",
        fromSource: preferredTextPathFromSource,
      },
    ];
  }

  if (targetNode.type === "records" && mode === "read_document") {
    return [
      {
        targetKey: "doc_ids",
        bindingKeys: ["doc_ids", "doc_id"],
        configKeys: ["doc_ids", "doc_id"],
        runInputFallback: "$.input.doc_ids",
        fromSource: preferredDocIdsPathFromSource,
      },
    ];
  }

  if (targetNode.type === "document" && mode === "create") {
    return [
      {
        targetKey: "content",
        bindingKeys: ["content", "text", "markdown"],
        configKeys: ["content", "text", "markdown"],
        runInputFallback: "$.input.content",
        fromSource: preferredContentPathFromSource,
      },
    ];
  }

  if (targetNode.type === "document" && mode === "update") {
    return [
      {
        targetKey: "doc_ids",
        bindingKeys: ["doc_ids", "doc_id"],
        configKeys: ["doc_ids", "doc_id"],
        runInputFallback: "$.input.doc_ids",
        fromSource: preferredDocIdsPathFromSource,
      },
      {
        targetKey: "content",
        bindingKeys: ["content", "text", "markdown"],
        configKeys: ["content", "text", "markdown"],
        runInputFallback: "$.input.content",
        fromSource: preferredContentPathFromSource,
      },
    ];
  }

  if (targetNode.type === "file" && mode === "move") {
    return [
      {
        targetKey: "doc_ids",
        bindingKeys: ["doc_ids", "doc_id"],
        configKeys: ["doc_ids", "doc_id"],
        runInputFallback: "$.input.doc_ids",
        fromSource: preferredDocIdsPathFromSource,
      },
      {
        targetKey: "dest_path",
        bindingKeys: ["dest_path", "destPath"],
        configKeys: ["dest_path", "destPath"],
        runInputFallback: "$.input.dest_path",
        fromSource: () => null,
      },
    ];
  }

  if (targetNode.type === "file" && mode === "set_metadata") {
    return [
      {
        targetKey: "doc_ids",
        bindingKeys: ["doc_ids", "doc_id"],
        configKeys: ["doc_ids", "doc_id"],
        runInputFallback: "$.input.doc_ids",
        fromSource: preferredDocIdsPathFromSource,
      },
    ];
  }

  if (targetNode.type === "checks" && mode === "validate") {
    return [
      {
        targetKey: "data",
        bindingKeys: ["data", "payload"],
        configKeys: ["data", "payload"],
        runInputFallback: "$.input",
        fromSource: (sourceNode) => buildStepOutputPath(sourceNode.id),
      },
    ];
  }

  if (targetNode.type === "checks" && mode === "reconcile") {
    return [
      {
        targetKey: "records",
        bindingKeys: ["records", "items"],
        configKeys: ["records", "items"],
        runInputFallback: "$.input.records",
        fromSource: preferredRecordsPathFromSource,
      },
    ];
  }

  if (targetNode.type === "checks" && mode === "packet_check") {
    return [
      {
        targetKey: "doc_ids",
        bindingKeys: ["doc_ids", "doc_id", "documents", "docs"],
        configKeys: ["doc_ids", "doc_id", "documents", "docs"],
        runInputFallback: "$.input.doc_ids",
        fromSource: preferredDocIdsPathFromSource,
      },
    ];
  }

  if (targetNode.type === "flow" && mode === "if_else") {
    return [
      {
        targetKey: "value",
        bindingKeys: ["value"],
        configKeys: ["value"],
        runInputFallback: "$.input.value",
        fromSource: (sourceNode) => buildStepOutputPath(sourceNode.id),
      },
    ];
  }

  if (targetNode.type === "human") {
    return [
      {
        targetKey: "task_payload",
        bindingKeys: ["task_payload"],
        configKeys: ["task_payload"],
        runInputFallback: "$.input.task_payload",
        fromSource: (sourceNode) => buildStepOutputPath(sourceNode.id),
      },
    ];
  }

  if (targetNode.type === "output" && mode === "export_csv") {
    return [
      {
        targetKey: "rows",
        bindingKeys: ["rows", "records"],
        configKeys: ["rows", "records"],
        runInputFallback: "$.input.rows",
        fromSource: preferredRecordsPathFromSource,
      },
    ];
  }

  return [];
}

function getNodeDataRecord(node: WorkflowNode): Record<string, any> {
  return isObjectRecord(node.data) ? node.data : {};
}

function getNodeConfigRecord(node: WorkflowNode): Record<string, any> {
  const data = getNodeDataRecord(node);
  return isObjectRecord(data.config) ? data.config : {};
}

function getNodeBindingsRecord(node: WorkflowNode): Record<string, any> {
  const data = getNodeDataRecord(node);
  return isObjectRecord(data.input_bindings) ? data.input_bindings : {};
}

function missingInputsForNode(
  node: WorkflowNode,
  edges: WorkflowEdge[],
  stageByNodeId: Record<string, number> = {},
  nodeById: Record<string, WorkflowNode> = {}
): string[] {
  if (!node || node.type === "note" || node.type === "end" || node.type === "trigger") return [];
  const config = getNodeConfigRecord(node);
  const bindings = getNodeBindingsRecord(node);
  const mode = String(getNodeDataRecord(node).mode || "");
  const nodeRefKey = String(getNodeDataRecord(node).node_ref?.key || "").toLowerCase();
  const hasIncomingFromPriorSteps = edges.some((edge) => {
    if (edge.to !== node.id) return false;
    if (!canUseSourceStep(edge.from, node.id, stageByNodeId)) return false;
    return nodeById[edge.from]?.type !== "trigger";
  });
  const missing: string[] = [];

  const requireAny = (
    label: string,
    bindingKeys: string[],
    configKeys: string[] = bindingKeys,
    options: { satisfyWithIncoming?: boolean } = {}
  ) => {
    const hasBinding = bindingKeys.some((key) => isValidInputValueForNode(bindings?.[key], node.id, stageByNodeId, nodeById));
    const hasConfig = configKeys.some((key) => isValidInputValueForNode(config?.[key], node.id, stageByNodeId, nodeById));
    const hasIncomingFallback = options.satisfyWithIncoming === true && hasIncomingFromPriorSteps;
    if (!(hasBinding || hasConfig || hasIncomingFallback)) {
      missing.push(label);
    }
  };

  if (nodeRefKey === "ai.parse_ruleset") {
    requireAny("Ruleset document", ["ruleset_doc_id"], ["ruleset_doc_id", "rulesetDocId"]);
    return missing;
  }
  if (nodeRefKey === "ai.extract_facts") {
    requireAny("Subject documents", ["doc_ids", "subject_packet_doc_ids"], ["doc_ids", "doc_id", "subject_packet_doc_ids"], { satisfyWithIncoming: true });
    return missing;
  }
  if (nodeRefKey === "system.evaluate") {
    requireAny("Subject documents", ["doc_ids", "subject_packet_doc_ids"], ["doc_ids", "subject_packet_doc_ids"], { satisfyWithIncoming: true });
    return missing;
  }
  if (nodeRefKey === "ai.generate_report") {
    requireAny("Subject documents", ["doc_ids", "subject_packet_doc_ids"], ["doc_ids", "subject_packet_doc_ids"], { satisfyWithIncoming: true });
    return missing;
  }

  if (node.type === "ai" && mode === "generate") {
    requireAny("Prompt", ["prompt"], ["prompt", "prompt_template"]);
    return missing;
  }
  if (node.type === "ai" && mode === "extract") {
    requireAny("Source content (text or document IDs)", ["text", "doc_ids", "doc_id"], ["text", "doc_ids", "doc_id"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "ai" && mode === "classify") {
    requireAny("Labels", ["labels"]);
    requireAny("Source content (text or document IDs)", ["text", "doc_ids", "doc_id"], ["text", "doc_ids", "doc_id"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "records" && mode === "read_document") {
    requireAny("Document ID(s)", ["doc_ids", "doc_id"], ["doc_ids", "doc_id"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "records" && mode === "list_folder") {
    requireAny("Folder path", ["folder_path"], ["folder_path"]);
    return missing;
  }
  if (node.type === "document" && mode === "create") {
    requireAny("Document content", ["content", "text", "markdown"], ["content", "text", "markdown"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "document" && mode === "update") {
    requireAny("Document ID(s)", ["doc_ids", "doc_id"], ["doc_ids", "doc_id"], { satisfyWithIncoming: true });
    requireAny("Updated content", ["content", "text", "markdown"], ["content", "text", "markdown"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "file" && mode === "move") {
    requireAny("Document ID(s)", ["doc_ids", "doc_id"], ["doc_ids", "doc_id"], { satisfyWithIncoming: true });
    requireAny("Destination folder", ["dest_path", "destPath"], ["dest_path", "destPath"]);
    return missing;
  }
  if (node.type === "file" && mode === "set_metadata") {
    requireAny("Document ID(s)", ["doc_ids", "doc_id"], ["doc_ids", "doc_id"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "checks" && mode === "packet_check") {
    requireAny("Document ID(s)", ["doc_ids", "doc_id", "docs", "documents"], ["doc_ids", "doc_id", "docs", "documents"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "checks" && mode === "validate") {
    requireAny("Data to validate", ["data", "payload"], ["data", "payload"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "checks" && mode === "reconcile") {
    requireAny("Records to compare", ["records", "items"], ["records", "items"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "flow" && mode === "if_else") {
    const conditions = Array.isArray(config?.conditions) ? config.conditions.filter((item) => String(item?.field || "").trim()) : [];
    const hasExpression = String(config?.expression || "").trim().length > 0;
    const hasValueInput = isValidInputValueForNode(bindings?.value, node.id, stageByNodeId, nodeById)
      || isValidInputValueForNode(config?.value, node.id, stageByNodeId, nodeById);
    if (!hasExpression && conditions.length === 0 && !hasValueInput && !hasIncomingFromPriorSteps) {
      missing.push("Condition source (conditions, expression, or incoming value)");
    }
    return missing;
  }
  if (node.type === "flow" && mode === "router") {
    const routes = Array.isArray(config?.routes) ? config.routes : [];
    const hasRoute = routes.some((route) => String(route?.key || route?.id || "").trim().length > 0);
    const hasDefault = String(config?.default_route || "").trim().length > 0;

    requireAny("Route key", ["route_key"], ["route_key"], { satisfyWithIncoming: true });

    if (!hasRoute && !hasDefault) {
      missing.push("At least one route (or set a Default Route)");
    }
    return missing;
  }
  if (node.type === "flow" && mode === "for_each") {
    requireAny("Items to iterate", ["items", "records"], ["items", "records"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "output" && mode === "export_csv") {
    requireAny("Rows to export", ["rows", "records"], ["rows", "records"], { satisfyWithIncoming: true });
    return missing;
  }
  if (node.type === "utilities" && mode === "delay") {
    const hasWaitMs = typeof config?.wait_ms === "number" || (bindings?.wait_ms && isValidInputValueForNode(bindings.wait_ms, node.id, stageByNodeId, nodeById));
    const hasTargetTime = String(config?.target_time || "").trim() || (bindings?.target_time && isValidInputValueForNode(bindings.target_time, node.id, stageByNodeId, nodeById));
    if (!hasWaitMs && !hasTargetTime) {
      missing.push("Wait duration or Target time");
    }
    return missing;
  }
  if (node.type === "flow" && mode === "merge_results") {
    const fromNodes = Array.isArray(config?.from_nodes) ? config.from_nodes.filter((item) => String(item || "").trim()) : [];
    if (!hasIncomingFromPriorSteps && fromNodes.length === 0) {
      missing.push("At least one upstream step to merge");
    }
    return missing;
  }
  if (node.type === "human") {
    requireAny("Task title", ["title"], ["title"]);
    const assignee = isObjectRecord(config?.assignee) ? config.assignee : {};
    const assigneeType = String(assignee?.type || "").trim();
    const assigneeValue = String(assignee?.value || "").trim();
    if (!assigneeType || !assigneeValue) {
      missing.push("Assignee");
    }
    if (mode === "checklist") {
      const checklistItems = Array.isArray(config?.checklist_items)
        ? config.checklist_items.map((item: any) => String(item || "").trim()).filter(Boolean)
        : [];
      if (checklistItems.length === 0) missing.push("Checklist items");
    }
    return missing;
  }

  return missing;
}

const SETUP_MISSING_LABELS = new Set<string>([
  "At least one route",
  "At least one upstream step to merge",
  "Condition source (conditions, expression, or incoming value)",
  "Task title",
  "Assignee",
  "Checklist items",
  "Labels",
]);

function splitMissingLabels(labels: string[]): { inputMissing: string[]; setupMissing: string[] } {
  const inputMissing: string[] = [];
  const setupMissing: string[] = [];
  for (const label of labels) {
    if (SETUP_MISSING_LABELS.has(String(label || "").trim())) {
      setupMissing.push(label);
    } else {
      inputMissing.push(label);
    }
  }
  return { inputMissing, setupMissing };
}

type RuntimeInputRequirement = {
  inputKey: string;
  label: string;
  kind: "folder" | "docs" | "text";
  targets: Array<{ nodeId: string; targetKey: string }>;
};

function requirementForMissingLabel(label: string): Omit<RuntimeInputRequirement, "targets"> | null {
  const key = String(label || "").trim().toLowerCase();
  if (key === "folder path") return { inputKey: "folder_path", label: "Folder path", kind: "folder" };
  if (key === "document id(s)") return { inputKey: "doc_ids", label: "Document IDs", kind: "docs" };
  if (key === "source content (text or document ids)") return { inputKey: "text", label: "Source text", kind: "text" };
  if (key === "destination folder") return { inputKey: "dest_path", label: "Destination folder", kind: "text" };
  if (key === "prompt") return { inputKey: "prompt", label: "Prompt", kind: "text" };
  if (key === "document content" || key === "updated content") return { inputKey: "content", label: "Content", kind: "text" };
  if (key === "data to validate") return { inputKey: "data", label: "Data", kind: "text" };
  if (key === "records to compare") return { inputKey: "records", label: "Records", kind: "text" };
  if (key === "rows to export") return { inputKey: "rows", label: "Rows", kind: "text" };
  if (key === "items to iterate") return { inputKey: "items", label: "Items", kind: "text" };
  if (key === "route key") return { inputKey: "route_key", label: "Route key", kind: "text" };
  if (key === "ruleset document" || key === "ruleset doc id") return { inputKey: "ruleset_doc_id", label: "Ruleset Document", kind: "docs" };
  if (key === "subject documents" || key === "subject packet doc ids" || key === "project documents") return { inputKey: "doc_ids", label: "Project Documents", kind: "docs" };
  if (key === "ruleset doc id") return { inputKey: "ruleset_doc_id", label: "Ruleset Document", kind: "docs" };
  return null;
}

function buildAutoBindingsForNode(
  targetNode: WorkflowNode,
  sourceNodes: WorkflowNode[],
  existingBindings: Record<string, any>,
  targetConfig: Record<string, any>,
  force = false,
  stageByNodeId: Record<string, number> = {}
): { nextBindings: Record<string, any>; changed: boolean } {
  const nextBindings = { ...existingBindings };
  const rules = autoBindingRulesForTarget(targetNode);
  if (rules.length === 0) return { nextBindings, changed: false };
  const sourceCandidates = sourceNodes.filter((sourceNode) => canUseSourceStep(sourceNode.id, targetNode.id, stageByNodeId));

  let changed = false;
  for (const rule of rules) {
    const bindingKeys = rule.bindingKeys && rule.bindingKeys.length > 0 ? rule.bindingKeys : [rule.targetKey];
    const configKeys = rule.configKeys && rule.configKeys.length > 0 ? rule.configKeys : bindingKeys;
    if (!force && hasAnyField(nextBindings, targetConfig, bindingKeys, configKeys)) continue;
    if (configKeys.some((key) => hasMeaningfulValue(targetConfig?.[key]))) continue;

    let resolved: string | null = null;
    for (const sourceNode of sourceCandidates) {
      resolved = rule.fromSource(sourceNode);
      if (resolved) break;
    }
    if (!resolved) resolved = rule.runInputFallback || null;
    if (!resolved) continue;

    if (!force && hasMeaningfulValue(nextBindings[rule.targetKey])) continue;
    if (String(nextBindings[rule.targetKey] || "") === String(resolved)) continue;

    nextBindings[rule.targetKey] = resolved;
    changed = true;
  }

  return { nextBindings, changed };
}

type NodeCapability = "docs" | "text" | "records" | "content" | "any";

function sourceCapabilities(node: WorkflowNode): Set<NodeCapability> {
  const mode = String(getNodeDataRecord(node).mode || "");
  const set = new Set<NodeCapability>();

  if (node.type === "trigger") {
    set.add("any");
    return set;
  }
  if (node.type === "ai" && mode === "generate") {
    set.add("text");
    set.add("content");
    set.add("docs");
    return set;
  }
  if (node.type === "ai" && mode === "extract") {
    set.add("records");
    set.add("docs");
    return set;
  }
  if (node.type === "ai" && mode === "classify") {
    set.add("text");
    set.add("docs");
    return set;
  }
  if (node.type === "records" && mode === "list_folder") {
    set.add("docs");
    set.add("records");
    return set;
  }
  if (node.type === "records" && mode === "read_document") {
    set.add("text");
    set.add("content");
    set.add("docs");
    return set;
  }
  if (node.type === "document" || node.type === "file") {
    set.add("docs");
    return set;
  }
  if (node.type === "checks" && mode === "reconcile") {
    set.add("records");
    return set;
  }
  if (node.type === "checks" && mode === "packet_check") {
    set.add("docs");
    return set;
  }
  if (node.type === "flow" && (mode === "for_each" || mode === "merge_results")) {
    set.add("records");
    return set;
  }
  if (node.type === "output") return set;
  set.add("any");
  return set;
}

function targetNeeds(node: WorkflowNode): Array<"docs" | "text_or_docs" | "records" | "content"> {
  const mode = String(getNodeDataRecord(node).mode || "");

  if (node.type === "ai" && (mode === "extract" || mode === "classify")) return ["text_or_docs"];
  if (node.type === "records" && mode === "read_document") return ["docs"];
  if (node.type === "document" && mode === "create") return ["content"];
  if (node.type === "document" && mode === "update") return ["docs", "content"];
  if (node.type === "file" && (mode === "move" || mode === "set_metadata")) return ["docs"];
  if (node.type === "checks" && mode === "packet_check") return ["docs"];
  if (node.type === "checks" && mode === "reconcile") return ["records"];
  if (node.type === "flow" && mode === "for_each") return ["records"];
  if (node.type === "output" && mode === "export_csv") return ["records"];

  return [];
}

function suggestedNextNodes(sourceNode: WorkflowNode): string[] {
  const mode = String(getNodeDataRecord(sourceNode).mode || "");
  if (sourceNode.type === "trigger") return ["Records -> Read Document", "AI -> Extract", "Checks -> Packet Completeness"];
  if (sourceNode.type === "records" && mode === "read_document") return ["AI -> Extract", "AI -> Classify", "Document -> Create"];
  if (sourceNode.type === "records" && mode === "list_folder") return ["Checks -> Packet Completeness", "Records -> Read Document", "AI -> Extract"];
  if (sourceNode.type === "ai" && mode === "extract") return ["Checks -> Validate", "Checks -> Reconcile", "Output -> Export CSV"];
  if (sourceNode.type === "ai" && mode === "classify") return ["Flow -> Router", "Flow -> If / Else", "Human -> Review"];
  if (sourceNode.type === "checks" && mode === "packet_check") return ["Human -> Checklist", "Document -> Create", "Output -> Export CSV"];
  if (sourceNode.type === "flow") return ["Checks -> Validate", "Human -> Review", "Output -> Export CSV"];
  return ["Checks -> Validate", "Human -> Review", "Output -> Export CSV"];
}

function guardConnection(sourceNode: WorkflowNode | null, targetNode: WorkflowNode | null): ConnectionGuardResult {
  if (!sourceNode || !targetNode) {
    return { allow: false, level: "error", message: "Cannot connect these steps." };
  }

  if (targetNode.type === "trigger") {
    return {
      allow: false,
      level: "error",
      message: "Trigger cannot have incoming connections.",
      suggestions: suggestedNextNodes(sourceNode),
    };
  }

  if (sourceNode.type === "end") {
    return {
      allow: false,
      level: "error",
      message: "End marker cannot connect to another step.",
      suggestions: ["Use End Marker as the final visual step only."],
    };
  }

  const caps = sourceCapabilities(sourceNode);
  const needs = targetNeeds(targetNode);
  if (needs.length === 0 || caps.has("any")) return { allow: true };

  const missing: string[] = [];
  for (const need of needs) {
    if (need === "docs" && !caps.has("docs")) missing.push("documents");
    if (need === "records" && !caps.has("records")) missing.push("records");
    if (need === "content" && !(caps.has("content") || caps.has("text") || caps.has("records"))) missing.push("content");
    if (need === "text_or_docs" && !(caps.has("text") || caps.has("docs") || caps.has("content"))) missing.push("text or documents");
  }

  if (missing.length === 0) return { allow: true };

  return {
    allow: true,
    level: "warning",
    message: `This connection may need manual mapping for ${Array.from(new Set(missing)).join(", ")}.`,
    suggestions: suggestedNextNodes(sourceNode),
  };
}

type StringListEditorProps = {
  label: string;
  items: string[];
  placeholder?: string;
  addLabel?: string;
  onChange: (items: string[]) => void;
};

function StringListEditor({
  label,
  items,
  placeholder = "Value",
  addLabel = "Add",
  onChange,
}: StringListEditorProps) {
  const safeItems = items.length > 0 ? items : [""];
  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] px-1">{label}</label>
      <div className="space-y-2">
        {safeItems.map((item, index) => (
          <div key={`${label}-${index}`} className="group/row grid grid-cols-[1fr_auto] gap-2 items-center">
            <Input
              className="h-8 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
              value={item}
              onChange={(e) => {
                const next = [...safeItems];
                next[index] = e.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 transition-all"
              onClick={() => {
                const next = safeItems.filter((_, rowIndex) => rowIndex !== index);
                onChange(next);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-full text-[10px] font-bold border-border/40 hover:bg-muted/10 transition-colors gap-1.5 uppercase tracking-wider"
        onClick={() => onChange([...safeItems, ""])}
      >
        <Plus className="w-3 w-3" />
        {addLabel}
      </Button>
    </div>
  );
}

type RuleRow = {
  id: string;
  field: string;
  operator: string;
  expected: string;
};

function RuleListEditor({
  rules,
  onChange,
}: {
  rules: RuleRow[];
  onChange: (rules: RuleRow[]) => void;
}) {
  const safeRules = rules.length > 0 ? rules : [{ id: "rule_1", field: "", operator: "equals", expected: "" }];
  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] px-1">Rules</label>
      <div className="space-y-3">
        {safeRules.map((rule, index) => (
          <div key={rule.id} className="group/row space-y-2 pb-3 border-b border-border/10 last:border-b-0 last:pb-0">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <Input
                className="h-8 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors font-mono"
                value={rule.field}
                onChange={(e) => {
                  const next = [...safeRules];
                  next[index] = { ...next[index], field: e.target.value };
                  onChange(next);
                }}
                placeholder="Field path"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 transition-all"
                onClick={() => {
                  const next = safeRules.filter((_, rowIndex) => rowIndex !== index);
                  onChange(next);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
              <Select
                value={rule.operator}
                onValueChange={(val) => {
                  const next = [...safeRules];
                  next[index] = { ...next[index], operator: val };
                  onChange(next);
                }}
              >
                <SelectTrigger className="h-8 text-[11px] bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                  <SelectValue placeholder="Op" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals" className="text-xs">equals</SelectItem>
                  <SelectItem value="not_equals" className="text-xs">not equals</SelectItem>
                  <SelectItem value="contains" className="text-xs">contains</SelectItem>
                  <SelectItem value="required" className="text-xs">required</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-8 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                value={rule.expected}
                onChange={(e) => {
                  const next = [...safeRules];
                  next[index] = { ...next[index], expected: e.target.value };
                  onChange(next);
                }}
                placeholder="Expected value"
              />
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-full text-[10px] font-bold border-border/40 hover:bg-muted/10 transition-colors gap-1.5 uppercase tracking-wider"
        onClick={() =>
          onChange([
            ...safeRules,
            { id: `rule_${Date.now()}`, field: "", operator: "equals", expected: "" },
          ])
        }
      >
        <Plus className="w-3 w-3" />
        Add Rule
      </Button>
    </div>
  );
}

type ConditionRow = {
  id: string;
  field: string;
  operator: string;
  value: string;
};

function ConditionListEditor({
  title = "Conditions",
  conditions,
  onChange,
}: {
  title?: string;
  conditions: ConditionRow[];
  onChange: (conditions: ConditionRow[]) => void;
}) {
  const safeConditions = conditions.length > 0 ? conditions : [{ id: "cond_1", field: "", operator: "equals", value: "" }];
  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] px-1">{title}</label>
      <div className="space-y-3">
        {safeConditions.map((cond, index) => (
          <div key={cond.id} className="group/row space-y-2 pb-3 border-b border-border/10 last:border-b-0 last:pb-0">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <Input
                className="h-8 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors font-mono"
                value={cond.field}
                onChange={(e) => {
                  const next = [...safeConditions];
                  next[index] = { ...next[index], field: e.target.value };
                  onChange(next);
                }}
                placeholder="Variable name"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 transition-all"
                onClick={() => {
                  const next = safeConditions.filter((_, rowIndex) => rowIndex !== index);
                  onChange(next);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
              <Select
                value={cond.operator}
                onValueChange={(val) => {
                  const next = [...safeConditions];
                  next[index] = { ...next[index], operator: val };
                  onChange(next);
                }}
              >
                <SelectTrigger className="h-8 text-[11px] bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                  <SelectValue placeholder="Op" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals" className="text-xs">equals</SelectItem>
                  <SelectItem value="not_equals" className="text-xs">not equals</SelectItem>
                  <SelectItem value="contains" className="text-xs">contains</SelectItem>
                  <SelectItem value="not_contains" className="text-xs">not contains</SelectItem>
                  <SelectItem value="greater_than" className="text-xs">greater than</SelectItem>
                  <SelectItem value="less_than" className="text-xs">less than</SelectItem>
                  <SelectItem value="exists" className="text-xs">exists</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-8 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                value={cond.value}
                onChange={(e) => {
                  const next = [...safeConditions];
                  next[index] = { ...next[index], value: e.target.value };
                  onChange(next);
                }}
                placeholder="Value"
              />
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-full text-[10px] font-bold border-border/40 hover:bg-muted/10 transition-colors gap-1.5 uppercase tracking-wider"
        onClick={() =>
          onChange([
            ...safeConditions,
            { id: `cond_${Date.now()}`, field: "", operator: "equals", value: "" },
          ])
        }
      >
        <Plus className="w-3 w-3" />
        Add Condition
      </Button>
    </div>
  );
}

type RouteRow = {
  id: string;
  key: string;
  label: string;
};

function RouteListEditor({
  routes,
  onChange,
}: {
  routes: RouteRow[];
  onChange: (routes: RouteRow[]) => void;
}) {
  const safeRoutes = routes.length > 0 ? routes : [{ id: "route_1", key: "default", label: "Default" }];
  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] px-1">Routes</label>
      <div className="space-y-2">
        {safeRoutes.map((route, index) => (
          <div key={route.id} className="group/row grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <Input
              className="h-8 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors font-mono"
              value={route.key}
              onChange={(e) => {
                const next = [...safeRoutes];
                next[index] = { ...next[index], key: e.target.value };
                onChange(next);
              }}
              placeholder="Key"
            />
            <Input
              className="h-8 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
              value={route.label}
              onChange={(e) => {
                const next = [...safeRoutes];
                next[index] = { ...next[index], label: e.target.value };
                onChange(next);
              }}
              placeholder="Label"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 transition-all"
              onClick={() => {
                const next = safeRoutes.filter((_, rowIndex) => rowIndex !== index);
                onChange(next);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-full text-[10px] font-bold border-border/40 hover:bg-muted/10 transition-colors gap-1.5 uppercase tracking-wider"
        onClick={() =>
          onChange([
            ...safeRoutes,
            { id: `route_${Date.now()}`, key: "", label: "" },
          ])
        }
      >
        <Plus className="w-3 w-3" />
        Add Route
      </Button>
    </div>
  );
}

type KeyValueRow = {
  id: string;
  key: string;
  value: string;
};

function KeyValueListEditor({
  rows,
  onChange,
}: {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
}) {
  const safeRows = rows.length > 0 ? rows : [{ id: "kv_1", key: "", value: "" }];
  return (
    <div className="space-y-2">
      {safeRows.map((row, index) => (
        <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <Input
            className="h-8 text-xs"
            value={row.key}
            onChange={(e) => {
              const next = [...safeRows];
              next[index] = { ...next[index], key: e.target.value };
              onChange(next);
            }}
            placeholder="Key"
          />
          <Input
            className="h-8 text-xs"
            value={row.value}
            onChange={(e) => {
              const next = [...safeRows];
              next[index] = { ...next[index], value: e.target.value };
              onChange(next);
            }}
            placeholder="Value"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => onChange(safeRows.filter((_, rowIndex) => rowIndex !== index))}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1.5"
        onClick={() => onChange([...safeRows, { id: `kv_${Date.now()}`, key: "", value: "" }])}
      >
        <Plus className="w-3.5 h-3.5" />
        Add Field
      </Button>
    </div>
  );
}

export function WorkflowStudio({ initialTemplateId = null, initialRunId = null, onRunWorkflow, onOpenHistory, onBackToHome }: WorkflowStudioProps = {}) {
  const [workflowName, setWorkflowName] = React.useState("Untitled Workflow");
  const [draftWorkflowName, setDraftWorkflowName] = React.useState("Untitled Workflow");
  const [isEditingWorkflowName, setIsEditingWorkflowName] = React.useState(false);
  const [showPreRunDialog, setShowPreRunDialog] = React.useState(false);
  const workflowNameInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [savedTemplateId, setSavedTemplateId] = React.useState<string | null>(null);
  const [savedTemplateVersion, setSavedTemplateVersion] = React.useState<number | null>(null);
  const [savedTemplateName, setSavedTemplateName] = React.useState<string>("");
  const [viewMode, setViewMode] = React.useState<"build" | "run">("build");
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [runDetail, setRunDetail] = React.useState<any>(null);
  const [isRefreshingRun, setIsRefreshingRun] = React.useState(false);
  const [completingTaskId, setCompletingTaskId] = React.useState<string | null>(null);
  const [taskActionNote, setTaskActionNote] = React.useState("");

  const [nodes, setNodes] = React.useState<WorkflowNode[]>([
    {
      id: "trigger_1",
      type: "trigger",
      label: "Trigger",
      icon: CATALOG_BY_TYPE.get("trigger")?.icon,
      position: { x: 80, y: 170 },
      color: CATALOG_BY_TYPE.get("trigger")?.color,
      data: createNodeData("trigger"),
    },
    {
      id: "ai_1",
      type: "ai",
      label: "AI",
      icon: CATALOG_BY_TYPE.get("ai")?.icon,
      position: { x: 410, y: 180 },
      color: CATALOG_BY_TYPE.get("ai")?.color,
      data: createNodeData("ai", "generate"),
    },
    {
      id: "note_1",
      type: "note",
      label: "Sticky Note",
      icon: CATALOG_BY_TYPE.get("note")?.icon,
      position: { x: 470, y: 400 },
      color: CATALOG_BY_TYPE.get("note")?.color,
      data: createNodeData("note"),
    },
  ]);

  const [edges, setEdges] = React.useState<WorkflowEdge[]>([{ id: "edge_1", from: "trigger_1", to: "ai_1" }]);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showMappingAdvanced, setShowMappingAdvanced] = React.useState(false);
  const [selectedSourceNodeId, setSelectedSourceNodeId] = React.useState<string | null>(null);
  const [hoveredSourceNodeId, setHoveredSourceNodeId] = React.useState<string | null>(null);
  const [canvasFocusRequest, setCanvasFocusRequest] = React.useState<{ nodeId: string; token: number } | null>(null);
  const lastRunningNodeIdRef = React.useRef<string | null>(null);

  // Auto-focus running node
  React.useEffect(() => {
    if (viewMode !== "run" || !runDetail?.steps) {
      lastRunningNodeIdRef.current = null;
      return;
    }
    const runningStep = runDetail.steps.find((s: any) => String(s?.status || "").toLowerCase() === "running");
    if (runningStep?.nodeId && runningStep.nodeId !== lastRunningNodeIdRef.current) {
      lastRunningNodeIdRef.current = runningStep.nodeId;
      setSelectedNodeId(runningStep.nodeId);
      setCanvasFocusRequest({ nodeId: runningStep.nodeId, token: Date.now() });
    }
  }, [runDetail?.steps, viewMode]);

  // Poll for run status if active
  React.useEffect(() => {
    if (!activeRunId || viewMode !== "run") return;

    let timer: any;
    const fetchRun = async () => {
      try {
        const detail = await getWorkflowRun(activeRunId);
        setRunDetail(detail);

        // Stop polling if finished
        const status = detail?.run?.status?.toLowerCase();
        if (status === "completed" || status === "failed" || status === "cancelled") {
          return;
        }

        timer = setTimeout(fetchRun, 3000);
      } catch (e) {
        console.error("Failed to fetch run detail", e);
      }
    };

    fetchRun();
    return () => clearTimeout(timer);
  }, [activeRunId, viewMode]);

  const nodeStatusById = React.useMemo(() => {
    if (!runDetail?.steps) return {};
    const map: Record<string, string> = {};
    for (const step of runDetail.steps) {
      const nodeId = step.nodeId || step.node_id || step.workflow_step_id || '';
      if (nodeId) {
        map[nodeId] = step.status || step.step_status || "pending";
      }
    }
    return map;
  }, [runDetail]);

  const runProgress = React.useMemo(() => {
    const steps = runDetail?.steps || [];
    if (steps.length === 0) return 0;
    const completed = steps.filter((s: any) => {
      const status = s.status || s.step_status || s.state || '';
      return String(status).toLowerCase() === "completed" || String(status).toLowerCase() === "succeeded";
    }).length;
    const running = steps.filter((s: any) => {
      const status = s.status || s.step_status || s.state || '';
      return String(status).toLowerCase() === "running" || String(status).toLowerCase() === "waiting";
    }).length;
    const base = (completed / steps.length) * 100;
    const boost = running > 0 ? (0.5 / steps.length) * 100 : 0;
    return Math.min(100, Math.round(base + boost));
  }, [runDetail]);
  const runStatus = String(runDetail?.run?.status || "").toLowerCase();
  const isRunLocked = runStatus === "queued" || runStatus === "running" || runStatus === "waiting";

  React.useEffect(() => {
    if (!isEditingWorkflowName) return;
    workflowNameInputRef.current?.focus();
    workflowNameInputRef.current?.select();
  }, [isEditingWorkflowName]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedData = selectedNode?.data || {};
  const selectedConfig = selectedData?.config || {};
  const selectedCatalog = selectedNode ? CATALOG_BY_TYPE.get(selectedNode.type as NodeType) : null;
  const [pickerState, setPickerState] = React.useState<PickerState>({
    open: false,
    mode: "doc",
    target: null,
    maxDocs: 1,
    initialPath: [],
    initialSelectedDocIds: [],
  });
  const [docDisplayById, setDocDisplayById] = React.useState<Record<string, string>>({});
  const loadedInitialTemplateRef = React.useRef<string>("");

  React.useEffect(() => {
    const templateId = String(initialTemplateId || "").trim();
    if (!templateId || initialRunId) return;
    if (loadedInitialTemplateRef.current === templateId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getWorkflowTemplateDefinition(templateId);
        if (cancelled) return;
        const definition = res?.version?.definition && typeof res.version.definition === "object"
          ? deepClone(res.version.definition)
          : { nodes: [], edges: [] };
        const baseTemplateNodes = clearTriggerRuntimeInputsInStudioNodes(studioNodesFromTemplateDefinition(definition?.nodes));
        const templateEdges = studioEdgesFromTemplateDefinition(definition?.edges);
        const templateNodes = Number(definition?.schema_version || 1) === 2
          ? autoLayoutDagNodes(baseTemplateNodes, templateEdges)
          : baseTemplateNodes;
        setNodes(templateNodes.length > 0 ? templateNodes : [{
          id: "trigger_1",
          type: "trigger",
          label: "Trigger",
          icon: CATALOG_BY_TYPE.get("trigger")?.icon,
          position: { x: 80, y: 170 },
          color: CATALOG_BY_TYPE.get("trigger")?.color,
          data: createNodeData("trigger"),
        }]);
        setEdges(templateEdges);
        setSelectedNodeId(templateNodes[0]?.id || null);
        const templateName = String(res?.template?.name || "Untitled Workflow").trim() || "Untitled Workflow";
        setWorkflowName(templateName);
        setDraftWorkflowName(templateName);
        setSavedTemplateId(String(res?.template?.id || templateId));
        setSavedTemplateVersion(Number(res?.version?.version || 0) || null);
        setSavedTemplateName(templateName);
        loadedInitialTemplateRef.current = templateId;
      } catch (e: any) {
        if (cancelled) return;
        toast({
          title: "Failed to load template",
          description: e?.message || "Unable to open selected workflow template.",
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialTemplateId, toast]);

  // ── Load run from initialRunId and open in run mode ──
  const loadedInitialRunRef = React.useRef<string>("");
  React.useEffect(() => {
    const runId = String(initialRunId || "").trim();
    if (!runId) return;
    if (loadedInitialRunRef.current === runId) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = await getWorkflowRun(runId);
        if (cancelled) return;
        loadedInitialRunRef.current = runId;
        setRunDetail(detail);
        setActiveRunId(runId);
        setViewMode("run");

        // Extract run input (doc_ids, doc_id, folder_path)
        const runInput: Record<string, any> = isObjectRecord(detail?.run?.input) ? detail.run.input : {};
        const runDocIds: string[] = Array.isArray(runInput.doc_ids)
          ? runInput.doc_ids.map((x: any) => String(x || "")).filter(Boolean)
          : (runInput.doc_id ? [String(runInput.doc_id)] : []);
        const runFolderPath = typeof runInput.folder_path === "string" ? runInput.folder_path : "";

        // Build doc labels by fetching actual document metadata for the run input IDs
        if (runDocIds.length > 0) {
          try {
            const orgId = getApiContext().orgId;
            if (orgId) {
              const docsResponse = await apiFetch<any>(`/orgs/${orgId}/documents`, { skipCache: true });
              const docList = Array.isArray(docsResponse)
                ? docsResponse
                : (Array.isArray(docsResponse?.items) ? docsResponse.items : []);
              const fetchedLabels: Record<string, string> = {};
              for (const doc of docList) {
                const id = String(doc?.id || "").trim();
                if (!id || !runDocIds.includes(id)) continue;
                const label = String(doc?.title || doc?.filename || doc?.name || "").trim();
                if (label) fetchedLabels[id] = label;
              }
              if (Object.keys(fetchedLabels).length > 0) {
                setDocDisplayById((prev) => ({ ...prev, ...fetchedLabels }));
              }
            }
          } catch {
            // Doc label lookup failed — IDs will be shown as-is
          }
        }

        // Input patch to apply to the trigger node on the canvas
        const inputPatch: Record<string, any> = {};
        if (runDocIds.length > 0) {
          inputPatch.doc_ids = runDocIds;
          inputPatch.doc_id = runDocIds[0];
        }
        if (runFolderPath) inputPatch.folder_path = runFolderPath;

        // Resolve template from the run to populate the canvas
        const templateId = String(detail?.run?.workflow_template_id || "").trim();
        const templateVersion = Number(detail?.run?.workflow_template_version || 0) || undefined;
        if (templateId && loadedInitialTemplateRef.current !== templateId) {
          try {
            const res = await getWorkflowTemplateDefinition(templateId, templateVersion);
            if (cancelled) return;
            const definition = res?.version?.definition && typeof res.version.definition === "object"
              ? deepClone(res.version.definition)
              : { nodes: [], edges: [] };
            const baseTemplateNodes = clearTriggerRuntimeInputsInStudioNodes(studioNodesFromTemplateDefinition(definition?.nodes));
            const templateEdges = studioEdgesFromTemplateDefinition(definition?.edges);
            const templateNodes = Number(definition?.schema_version || 1) === 2
              ? autoLayoutDagNodes(baseTemplateNodes, templateEdges)
              : baseTemplateNodes;

            // Patch trigger node with the actual doc_ids / folder_path from the run
            const patchedNodes = Object.keys(inputPatch).length > 0
              ? templateNodes.map((node) => {
                if (node.type !== "trigger") return node;
                const data = getNodeDataRecord(node);
                const config = getNodeConfigRecord(node);
                const existingInput = isObjectRecord(config?.input) ? config.input : {};
                return {
                  ...node,
                  data: {
                    ...data,
                    config: {
                      ...config,
                      input: { ...existingInput, ...inputPatch },
                    },
                  },
                };
              })
              : templateNodes;

            setNodes(patchedNodes.length > 0 ? patchedNodes : [{
              id: "trigger_1",
              type: "trigger",
              label: "Trigger",
              icon: CATALOG_BY_TYPE.get("trigger")?.icon,
              position: { x: 80, y: 170 },
              color: CATALOG_BY_TYPE.get("trigger")?.color,
              data: createNodeData("trigger"),
            }]);
            setEdges(templateEdges);
            const templateName = String(res?.template?.name || "Untitled Workflow").trim() || "Untitled Workflow";
            setWorkflowName(templateName);
            setDraftWorkflowName(templateName);
            setSavedTemplateId(String(res?.template?.id || templateId));
            setSavedTemplateVersion(Number(res?.version?.version || 0) || null);
            setSavedTemplateName(templateName);
            loadedInitialTemplateRef.current = templateId;
          } catch {
            // Template load failed, run mode still works without canvas nodes
          }
        }

        // Select the running/first step
        const runningStep = detail?.steps?.find((step: any) => {
          const status = String(step?.status || step?.step_status || step?.state || "").toLowerCase();
          return status === "running" || status === "waiting";
        });
        const firstStep = detail?.steps?.[0];
        const currentNodeId = String(
          (runningStep?.nodeId || runningStep?.node_id)
          || (firstStep?.nodeId || firstStep?.node_id)
          || ""
        ).trim();
        if (currentNodeId) setSelectedNodeId(currentNodeId);
      } catch (e: any) {
        if (cancelled) return;
        toast({
          title: "Failed to load run",
          description: e?.message || "Unable to open selected workflow run.",
          variant: "destructive",
        });
      }
    })();
    return () => { cancelled = true; };
  }, [initialRunId, toast]);

  React.useEffect(() => {
    setShowAdvanced(false);
    setShowMappingAdvanced(false);
    setSelectedSourceNodeId(null);
    setHoveredSourceNodeId(null);
    setCanvasFocusRequest(null);
  }, [selectedNodeId]);

  const startEditingWorkflowName = () => {
    setDraftWorkflowName(workflowName);
    setIsEditingWorkflowName(true);
  };

  const saveWorkflowName = () => {
    const nextName = draftWorkflowName.trim() || "Untitled Workflow";
    setWorkflowName(nextName);
    setDraftWorkflowName(nextName);
    setIsEditingWorkflowName(false);
  };

  const deleteNodeById = React.useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((node) => node.id !== nodeId));
    setEdges((prev) => prev.filter((edge) => edge.from !== nodeId && edge.to !== nodeId));
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  }, []);

  const updateNodeData = React.useCallback((key: string, value: any) => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== selectedNodeId) return node;
        return {
          ...node,
          data: {
            ...(node.data || {}),
            [key]: value,
          },
        };
      })
    );
  }, [selectedNodeId]);

  const updateNodeConfig = React.useCallback((key: string, value: any) => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== selectedNodeId) return node;
        return {
          ...node,
          data: {
            ...(node.data || {}),
            config: {
              ...((node.data || {}).config || {}),
              [key]: value,
            },
          },
        };
      })
    );
  }, [selectedNodeId]);

  const parseFolderPathSegments = React.useCallback((value: any): string[] => {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry || "").trim()).filter(Boolean);
    }
    const raw = String(value || "").trim();
    if (!raw || raw === "/") return [];
    return raw
      .split("/")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }, []);

  const formatFolderPathValue = React.useCallback((path: string[]): string => {
    return path.length > 0 ? path.join("/") : "/";
  }, []);

  const openConfigDocPicker = React.useCallback((key: string, multi = false, maxDocs = 1) => {
    const existing = multi
      ? (Array.isArray(selectedConfig?.[key]) ? selectedConfig[key].map((entry: any) => String(entry || "")).filter(Boolean) : [])
      : (selectedConfig?.[key] ? [String(selectedConfig[key])] : []);
    setPickerState({
      open: true,
      mode: "doc",
      target: { scope: "config", key },
      maxDocs: Math.max(1, maxDocs),
      initialPath: [],
      initialSelectedDocIds: existing,
    });
  }, [selectedConfig]);

  const openTriggerDocPicker = React.useCallback((key: "doc_id" | "doc_ids", multi = false, maxDocs = 1) => {
    const triggerNode = nodes.find((node) => node.type === "trigger") || null;
    const triggerConfig = triggerNode ? getNodeConfigRecord(triggerNode) : {};
    const input = isObjectRecord(triggerConfig?.input) ? triggerConfig.input : {};
    const existing = multi
      ? (Array.isArray(input[key]) ? input[key].map((entry: any) => String(entry || "")).filter(Boolean) : [])
      : (input[key] ? [String(input[key])] : []);
    setPickerState({
      open: true,
      mode: "doc",
      target: { scope: "trigger_input", key },
      maxDocs: Math.max(1, maxDocs),
      initialPath: [],
      initialSelectedDocIds: existing,
    });
  }, [nodes]);

  const openConfigFolderPicker = React.useCallback((key: string) => {
    setPickerState({
      open: true,
      mode: "folder",
      target: { scope: "config", key },
      maxDocs: 1,
      initialPath: parseFolderPathSegments(selectedConfig?.[key]),
      initialSelectedDocIds: [],
    });
  }, [parseFolderPathSegments, selectedConfig]);

  const openTriggerFolderPicker = React.useCallback(() => {
    const triggerNode = nodes.find((node) => node.type === "trigger") || null;
    const triggerConfig = triggerNode ? getNodeConfigRecord(triggerNode) : {};
    const input = isObjectRecord(triggerConfig?.input) ? triggerConfig.input : {};
    setPickerState({
      open: true,
      mode: "folder",
      target: { scope: "trigger_input", key: "folder_path" },
      maxDocs: 1,
      initialPath: parseFolderPathSegments(input.folder_path),
      initialSelectedDocIds: [],
    });
  }, [nodes, parseFolderPathSegments]);

  const updateNodeLabel = React.useCallback((label: string) => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== selectedNodeId) return node;
        return { ...node, label };
      })
    );
  }, [selectedNodeId]);

  const setNodeMode = React.useCallback((mode: string) => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== selectedNodeId) return node;
        const key = nodeKeyFor(node.type, mode);
        const nextData = {
          ...(node.data || {}),
          mode,
          config: defaultConfigFor(node.type, mode),
        } as Record<string, any>;
        if (node.type !== "note" && node.type !== "end") {
          const nextNodeRef: Record<string, any> = {
            key,
          };
          const parsedVersion = Number(node.data?.node_ref?.version);
          if (Number.isFinite(parsedVersion) && parsedVersion > 0) {
            nextNodeRef.version = Math.trunc(parsedVersion);
          }
          nextData.node_ref = nextNodeRef;
        }
        return { ...node, data: nextData };
      })
    );
  }, [selectedNodeId]);

  const duplicateSelectedNode = () => {
    if (!selectedNode) return;
    const duplicateId = `node_${Date.now()}`;
    const duplicateLabel = nextAutoNodeLabel(String(selectedNode.label || "Step"), nodes);
    const duplicate: WorkflowNode = {
      ...selectedNode,
      id: duplicateId,
      label: duplicateLabel,
      position: {
        x: selectedNode.position.x + 40,
        y: selectedNode.position.y + 40,
      },
      data: JSON.parse(JSON.stringify(selectedNode.data || {})),
    };
    setNodes((prev) => [...prev, duplicate]);
    setSelectedNodeId(duplicateId);
  };

  const handleAddNode = (type: NodeType) => {
    const item = CATALOG_BY_TYPE.get(type);
    if (!item) return;
    const nextLabel = nextAutoNodeLabel(item.label, nodes);
    const nextNode: WorkflowNode = {
      id: `${type}_${Date.now()}`,
      type,
      label: nextLabel,
      icon: item.icon,
      color: item.color,
      position: { x: 120 + Math.random() * 90, y: 100 + Math.random() * 90 },
      data: createNodeData(type),
    };
    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeId(nextNode.id);
  };

  const readString = (value: any, fallback = "") => {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  };

  const readNumber = (value: any, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const readBoolean = (value: any, fallback = false) => {
    if (value === null || value === undefined) return fallback;
    return Boolean(value);
  };

  const readStringArray = (value: any, fallback: string[] = []) => {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return fallback;
  };

  const selectedMode = readString(selectedData.mode, defaultModeFor(selectedNode?.type || ""));
  const modeOptions = selectedNode ? listModesFor(selectedNode.type) : [];
  const selectedPurpose = selectedCatalog?.purpose || "Configure this node for your workflow.";
  const stageByNodeId = React.useMemo(() => buildStageByNodeId(nodes, edges), [nodes, edges]);
  const nodeById = React.useMemo(() => {
    const map: Record<string, WorkflowNode> = {};
    for (const node of nodes) {
      map[node.id] = node;
    }
    return map;
  }, [nodes]);
  const nodeDisplayNameById = React.useMemo(() => buildNodeDisplayNameById(nodes), [nodes]);
  const selectedMappingContract = React.useMemo(() => inputMappingContractForNode(selectedNode), [selectedNode]);
  const selectedAutoBindingRules = React.useMemo(
    () => (selectedNode ? autoBindingRulesForTarget(selectedNode) : []),
    [selectedNode]
  );
  const runInputFieldOptions = React.useMemo(() => {
    const options = new Set<string>();
    for (const rule of selectedAutoBindingRules) {
      const fallback = normalizeRunInputField(String(rule.runInputFallback || ""));
      if (fallback) options.add(fallback);
    }
    for (const target of selectedMappingContract.expectedTargets || []) {
      const key = String(target || "").trim();
      if (key) options.add(key);
    }
    [
      "doc_id",
      "doc_ids",
      "folder_path",
      "dest_path",
      "text",
      "content",
      "records",
      "rows",
      "value",
      "task_payload",
      "prompt",
    ].forEach((entry) => options.add(entry));
    return Array.from(options);
  }, [selectedAutoBindingRules, selectedMappingContract.expectedTargets]);
  const selectedUpstreamNodeIds = React.useMemo(
    () => (selectedNodeId ? collectUpstreamNodeIds(selectedNodeId, edges) : new Set<string>()),
    [edges, selectedNodeId]
  );
  const stepOutputSourceOptions = React.useMemo(
    () =>
      nodes
        .filter((node) => {
          if (!selectedNodeId) return false;
          if (node.id === selectedNodeId) return false;
          if (node.type === "note" || node.type === "end") return false;
          if (!selectedUpstreamNodeIds.has(node.id)) return false;
          return canUseSourceStep(node.id, selectedNodeId, stageByNodeId);
        })
        .map((node) => ({ id: node.id, label: nodeDisplayNameById[node.id] || node.label || node.id })),
    [nodeDisplayNameById, nodes, selectedNodeId, selectedUpstreamNodeIds, stageByNodeId]
  );
  const allowedStepSourceIds = React.useMemo(
    () => new Set(stepOutputSourceOptions.map((option) => option.id)),
    [stepOutputSourceOptions]
  );
  React.useEffect(() => {
    if (selectedSourceNodeId && !allowedStepSourceIds.has(selectedSourceNodeId)) {
      setSelectedSourceNodeId(null);
    }
    if (hoveredSourceNodeId && !allowedStepSourceIds.has(hoveredSourceNodeId)) {
      setHoveredSourceNodeId(null);
    }
  }, [allowedStepSourceIds, hoveredSourceNodeId, selectedSourceNodeId]);
  const activeHighlightedSourceNodeId = hoveredSourceNodeId || selectedSourceNodeId;
  const focusSourceNode = React.useCallback((nodeId: string) => {
    const clean = String(nodeId || "").trim();
    if (!clean) return;
    setSelectedSourceNodeId(clean);
    setHoveredSourceNodeId(null);
    setCanvasFocusRequest({ nodeId: clean, token: Date.now() });
  }, []);
  const bindingRows = React.useMemo(() => {
    if (!selectedNode) return [];
    const rows = normalizeInputBindings(selectedData.input_bindings);
    return sanitizeBindingRowsForNode(rows, selectedMappingContract, allowedStepSourceIds);
  }, [allowedStepSourceIds, selectedData.input_bindings, selectedMappingContract, selectedNode]);
  const persistBindingRows = React.useCallback(
    (rows: InputBindingRow[]) => {
      if (!selectedNode) return;
      const sanitized = sanitizeBindingRowsForNode(rows, selectedMappingContract, allowedStepSourceIds);
      updateNodeData("input_bindings", serializeInputBindings(sanitized));
    },
    [allowedStepSourceIds, selectedMappingContract, selectedNode, updateNodeData]
  );
  const maxMappingsForSelected = selectedMappingContract.maxMappings;
  const canAddMapping =
    maxMappingsForSelected === null ? true : bindingRows.length < maxMappingsForSelected;
  const remapNodeById = React.useCallback((targetNodeId: string, force = false): boolean => {
    let changed = false;
    setNodes((prev) => {
      const targetIndex = prev.findIndex((node) => node.id === targetNodeId);
      if (targetIndex < 0) return prev;
      const targetNode = prev[targetIndex];
      const sourceNodes = edges
        .filter((edge) => edge.to === targetNodeId)
        .map((edge) => prev.find((node) => node.id === edge.from))
        .filter((node): node is WorkflowNode => Boolean(node));

      const targetData = getNodeDataRecord(targetNode);
      const targetConfig = getNodeConfigRecord(targetNode);
      const targetBindings = getNodeBindingsRecord(targetNode);
      const mapped = buildAutoBindingsForNode(
        targetNode,
        sourceNodes,
        targetBindings,
        targetConfig,
        force,
        stageByNodeId
      );
      if (!mapped.changed) return prev;

      changed = true;
      const next = [...prev];
      next[targetIndex] = {
        ...targetNode,
        data: {
          ...targetData,
          input_bindings: mapped.nextBindings,
        },
      };
      return next;
    });
    return changed;
  }, [edges, stageByNodeId]);

  const handleAutoMapOnConnect = React.useCallback((
    sourceNodeId: string,
    targetNodeId: string,
    _sourceHandle?: string | null,
    nextEdges?: WorkflowEdge[]
  ) => {
    setNodes((prev) => {
      const sourceNode = prev.find((node) => node.id === sourceNodeId);
      const targetIndex = prev.findIndex((node) => node.id === targetNodeId);
      if (!sourceNode || targetIndex < 0) return prev;
      const targetNode = prev[targetIndex];
      const effectiveEdges = Array.isArray(nextEdges) && nextEdges.length > 0 ? nextEdges : edges;
      const effectiveStageByNodeId = buildStageByNodeId(prev, effectiveEdges);
      const mapped = buildAutoBindingsForNode(
        targetNode,
        [sourceNode],
        getNodeBindingsRecord(targetNode),
        getNodeConfigRecord(targetNode),
        false,
        effectiveStageByNodeId
      );
      if (!mapped.changed) return prev;

      const next = [...prev];
      next[targetIndex] = {
        ...targetNode,
        data: {
          ...getNodeDataRecord(targetNode),
          input_bindings: mapped.nextBindings,
        },
      };
      return next;
    });
  }, [edges]);

  const selectedMissingInputs = React.useMemo(
    () => (selectedNode ? missingInputsForNode(selectedNode, edges, stageByNodeId, nodeById) : []),
    [selectedNode, edges, stageByNodeId, nodeById]
  );

  const nodeReadinessById = React.useMemo(() => {
    const map: Record<string, { missing: string[]; ready: boolean }> = {};
    for (const node of nodes) {
      const missing = missingInputsForNode(node, edges, stageByNodeId, nodeById);
      map[node.id] = { missing, ready: missing.length === 0 };
    }
    return map;
  }, [nodes, edges, stageByNodeId, nodeById]);

  const preRunIssues = React.useMemo(() => {
    return nodes
      .map((node) => {
        const missing = missingInputsForNode(node, edges, stageByNodeId, nodeById);
        const split = splitMissingLabels(missing);
        return {
          nodeId: node.id,
          label: String(node.label || node.id),
          type: String(node.type || ""),
          missing,
          inputMissing: split.inputMissing,
          setupMissing: split.setupMissing,
        };
      })
      .filter((item) => item.missing.length > 0);
  }, [nodes, edges, stageByNodeId, nodeById]);
  const preRunInputIssueCount = React.useMemo(
    () => preRunIssues.filter((issue) => issue.inputMissing.length > 0).length,
    [preRunIssues]
  );
  const preRunSetupIssueCount = React.useMemo(
    () => preRunIssues.filter((issue) => issue.setupMissing.length > 0).length,
    [preRunIssues]
  );
  const preRunSetupIssues = React.useMemo(
    () => preRunIssues.filter((issue) => issue.setupMissing.length > 0),
    [preRunIssues]
  );
  const runtimeInputRequirements = React.useMemo<RuntimeInputRequirement[]>(() => {
    const byInputKey = new Map<string, RuntimeInputRequirement>();
    for (const issue of preRunIssues) {
      for (const missingLabel of issue.inputMissing) {
        const mapped = requirementForMissingLabel(missingLabel);
        if (!mapped) continue;
        const targetKey = mapped.inputKey === "doc_ids"
          ? "doc_ids"
          : mapped.inputKey;
        const existing = byInputKey.get(mapped.inputKey);
        if (existing) {
          const hasTarget = existing.targets.some((target) => target.nodeId === issue.nodeId && target.targetKey === targetKey);
          if (!hasTarget) existing.targets.push({ nodeId: issue.nodeId, targetKey });
          continue;
        }
        byInputKey.set(mapped.inputKey, {
          ...mapped,
          targets: [{ nodeId: issue.nodeId, targetKey }],
        });
      }
    }
    return Array.from(byInputKey.values());
  }, [preRunIssues]);

  const applyRuntimeInputsToNodeList = React.useCallback((list: WorkflowNode[]): { nodes: WorkflowNode[]; applied: number } => {
    if (runtimeInputRequirements.length === 0) return { nodes: list, applied: 0 };
    const stageById = buildStageByNodeId(list, edges);
    const nextNodeById: Record<string, WorkflowNode> = {};
    for (const node of list) nextNodeById[node.id] = node;
    let applied = 0;
    const nodesWithBindings = list.map((node) => {
      const relevantTargets = runtimeInputRequirements
        .flatMap((req) => req.targets.map((target) => ({ ...target, inputKey: req.inputKey })))
        .filter((target) => target.nodeId === node.id);
      if (relevantTargets.length === 0) return node;
      const data = getNodeDataRecord(node);
      const config = getNodeConfigRecord(node);
      const bindings = { ...getNodeBindingsRecord(node) };
      let changed = false;
      for (const target of relevantTargets) {
        if (isValidInputValueForNode(bindings[target.targetKey], node.id, stageById, nextNodeById)) continue;
        if (isValidInputValueForNode(config[target.targetKey], node.id, stageById, nextNodeById)) continue;
        bindings[target.targetKey] = `$.input.${target.inputKey}`;
        applied += 1;
        changed = true;
      }
      if (!changed) return node;
      return {
        ...node,
        data: {
          ...data,
          input_bindings: bindings,
        },
      };
    });
    return { nodes: nodesWithBindings, applied };
  }, [edges, runtimeInputRequirements]);

  const setTriggerInputFields = React.useCallback((patch: Record<string, any>) => {
    setNodes((prev) => {
      const patched = prev.map((node) => {
        if (node.type !== "trigger") return node;
        const data = getNodeDataRecord(node);
        const config = getNodeConfigRecord(node);
        const input = isObjectRecord(config?.input) ? config.input : {};
        return {
          ...node,
          data: {
            ...data,
            config: {
              ...config,
              input: {
                ...input,
                ...patch,
              },
            },
          },
        };
      });
      return applyRuntimeInputsToNodeList(patched).nodes;
    });
  }, [applyRuntimeInputsToNodeList]);

  const handlePickerConfirm = React.useCallback((payload: { path?: string[]; docs?: StoredDocument[] }) => {
    const target = pickerState.target;
    if (!target) return;
    const selectedDocs = Array.isArray(payload.docs)
      ? payload.docs.filter((doc) => Boolean(doc?.id))
      : [];
    const selectedDocIds = selectedDocs.map((doc) => String(doc.id)).filter(Boolean);
    if (selectedDocs.length > 0) {
      const nextDocLabels: Record<string, string> = {};
      for (const doc of selectedDocs) {
        const docId = String(doc.id || "").trim();
        if (!docId) continue;
        const label =
          String(doc.title || "").trim()
          || String(doc.filename || "").trim()
          || String(doc.name || "").trim()
          || docId;
        nextDocLabels[docId] = label;
      }
      if (Object.keys(nextDocLabels).length > 0) {
        setDocDisplayById((prev) => ({ ...prev, ...nextDocLabels }));
      }
    }
    const pickedPath = Array.isArray(payload.path) ? payload.path : [];

    if (target.scope === "trigger_input") {
      if (target.key === "folder_path") {
        setTriggerInputFields({ folder_path: formatFolderPathValue(pickedPath) });
      } else if (target.key === "doc_id") {
        setTriggerInputFields({ doc_id: selectedDocIds[0] || "" });
      } else {
        setTriggerInputFields({
          doc_ids: selectedDocIds,
          doc_id: selectedDocIds[0] || "",
        });
      }
    } else if (target.scope === "config") {
      if (pickerState.mode === "folder") {
        updateNodeConfig(target.key, formatFolderPathValue(pickedPath));
      } else if (pickerState.maxDocs === 1 && target.key !== "doc_ids") {
        updateNodeConfig(target.key, selectedDocIds[0] || "");
      } else {
        updateNodeConfig(target.key, selectedDocIds);
      }
    }
  }, [formatFolderPathValue, pickerState.maxDocs, pickerState.mode, pickerState.target, setTriggerInputFields, updateNodeConfig]);

  const buildDefinitionForSave = React.useCallback(() => {
    const normalized = normalizeStudioNodesForSave(nodes);
    const normalizedNodes = normalized.nodes.map((rawNode: any) => {
      const nodeType = String(
        rawNode?.node_type
        || rawNode?.node_ref?.key
        || rawNode?.nodeRef?.key
        || ""
      ).trim().toLowerCase();
      if (nodeType !== "manual.trigger" && nodeType !== "chat.trigger") return rawNode;
      const config = isObjectRecord(rawNode?.config) ? rawNode.config : {};
      return {
        ...rawNode,
        config: {
          ...config,
          input: {},
        },
      };
    });
    if (normalizedNodes.length === 0) {
      throw new Error("Add at least one executable step before saving.");
    }

    const normalizedNodeIds = normalizedNodes.map((node) => String(node.id || "").trim()).filter(Boolean);
    const validNodeIdSet = new Set(normalizedNodeIds);
    let normalizedEdges = normalizeStudioEdgesForSave(
      edges,
      normalized.idMap,
      validNodeIdSet,
      normalized.nodeTypeByOriginalId
    );
    if (normalizedEdges.length === 0 && normalizedNodeIds.length > 1) {
      normalizedEdges = buildSequentialEdgesForStudio(normalizedNodeIds);
    }

    const incomingCounts: Record<string, number> = {};
    for (const nodeId of normalizedNodeIds) incomingCounts[nodeId] = 0;
    for (const edge of normalizedEdges) {
      const to = String(edge?.to || "").trim();
      if (!to || !Object.prototype.hasOwnProperty.call(incomingCounts, to)) continue;
      incomingCounts[to] += 1;
    }
    const entryNodes = normalizedNodeIds.filter((nodeId) => incomingCounts[nodeId] === 0);
    const definition = {
      schema_version: 2,
      type: "custom.workflow",
      nodes: normalizedNodes,
      entry_nodes: entryNodes.length > 0 ? entryNodes : [normalizedNodeIds[0]],
      execution: {
        max_parallelism: 2,
        on_node_failure: "fail_fast",
      },
      edges: normalizedEdges,
    };
    return {
      definition,
      definitionMode: inferDefinitionMode(definition),
      nodeCount: normalizedNodes.length,
    };
  }, [nodes, edges]);

  const buildRunPayloadFromTrigger = React.useCallback(() => {
    const triggerNode = nodes.find((node) => node.type === "trigger") || null;
    const triggerConfig = triggerNode ? getNodeConfigRecord(triggerNode) : {};
    const input = isObjectRecord(triggerConfig?.input) ? deepClone(triggerConfig.input) : {};
    const context = isObjectRecord(triggerConfig?.context) ? deepClone(triggerConfig.context) : {};
    if (!String((context as Record<string, any>)?.source || "").trim()) {
      (context as Record<string, any>).source = "workflow-studio";
    }
    return { input, context };
  }, [nodes]);

  const persistTemplate = React.useCallback(async (options: { silent?: boolean } = {}) => {
    const templateName = String(workflowName || "").trim() || "Untitled Workflow";
    const { definition, definitionMode, nodeCount } = buildDefinitionForSave();
    const useVersioning = Boolean(savedTemplateId && savedTemplateName === templateName);

    if (useVersioning) {
      const versionRes = await createWorkflowTemplateVersion(String(savedTemplateId), {
        definition,
        definitionMode,
        changeNote: "Updated from workflow studio",
      });
      const nextVersion = Number(versionRes?.version?.version || savedTemplateVersion || 1);
      setSavedTemplateVersion(Number.isFinite(nextVersion) && nextVersion > 0 ? Math.trunc(nextVersion) : 1);
      if (!options.silent) {
        toast({
          title: "Workflow saved",
          description: `Saved v${Number.isFinite(nextVersion) ? Math.trunc(nextVersion) : 1} with ${nodeCount} steps.`,
        });
      }
      return {
        templateId: String(savedTemplateId),
        templateVersion: Number.isFinite(nextVersion) && nextVersion > 0 ? Math.trunc(nextVersion) : 1,
      };
    }

    const createRes = await createWorkflowTemplate({
      name: templateName,
      description: "Created from workflow studio",
      isActive: true,
      definition,
      definitionMode,
      changeNote: "Initial save from workflow studio",
    });
    const templateId = String(createRes?.template?.id || "").trim();
    const templateVersion = Number(createRes?.version?.version || 1);
    const safeVersion = Number.isFinite(templateVersion) && templateVersion > 0 ? Math.trunc(templateVersion) : 1;
    setSavedTemplateId(templateId || null);
    setSavedTemplateVersion(safeVersion);
    setSavedTemplateName(templateName);
    if (!options.silent) {
      toast({
        title: "Workflow saved",
        description: `Created template ${templateId || "(unknown)"} with ${nodeCount} steps.`,
      });
    }
    return {
      templateId: templateId || null,
      templateVersion: safeVersion,
    };
  }, [
    buildDefinitionForSave,
    savedTemplateId,
    savedTemplateName,
    savedTemplateVersion,
    toast,
    workflowName,
  ]);

  const handleSave = React.useCallback(async () => {
    setIsSaving(true);
    try {
      await persistTemplate();
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Unable to save workflow template.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [persistTemplate, toast]);

  const remapAllNodes = React.useCallback((force = false) => {
    let changedCount = 0;
    setNodes((prev) => {
      let next = [...prev];
      for (let index = 0; index < next.length; index += 1) {
        const targetNode = next[index];
        if (targetNode.type === "trigger" || targetNode.type === "note" || targetNode.type === "end") continue;
        const sourceNodes = edges
          .filter((edge) => edge.to === targetNode.id)
          .map((edge) => next.find((node) => node.id === edge.from))
          .filter((node): node is WorkflowNode => Boolean(node));
        if (sourceNodes.length === 0) continue;
        const mapped = buildAutoBindingsForNode(
          targetNode,
          sourceNodes,
          getNodeBindingsRecord(targetNode),
          getNodeConfigRecord(targetNode),
          force,
          stageByNodeId
        );
        if (!mapped.changed) continue;
        changedCount += 1;
        next[index] = {
          ...targetNode,
          data: {
            ...getNodeDataRecord(targetNode),
            input_bindings: mapped.nextBindings,
          },
        };
      }
      return changedCount > 0 ? next : prev;
    });

    toast({
      title: changedCount > 0 ? "Mappings updated" : "No mapping changes",
      description:
        changedCount > 0
          ? `Auto-mapped inputs for ${changedCount} step${changedCount === 1 ? "" : "s"}.`
          : "All steps already had inputs or custom mappings.",
    });
  }, [edges, stageByNodeId, toast]);

  const remapSelectedNode = React.useCallback(() => {
    if (!selectedNode) return;
    const changed = remapNodeById(selectedNode.id, false);
    toast({
      title: changed ? "Step remapped" : "No mapping changes",
      description: changed
        ? `Updated auto-mapped inputs for ${selectedNode.label}.`
        : `${selectedNode.label} already has required mappings or config.`,
    });
  }, [remapNodeById, selectedNode, toast]);
  const resetSelectedNodeMappings = React.useCallback(() => {
    if (!selectedNode) return;
    persistBindingRows([]);
    toast({
      title: "Mappings reset",
      description: selectedMappingContract.expectedTargets.length > 0
        ? `Reset mappings for ${selectedNode.label}.`
        : `Cleared mappings for ${selectedNode.label}.`,
    });
  }, [persistBindingRows, selectedMappingContract.expectedTargets.length, selectedNode, toast]);

  const runNow = React.useCallback(async () => {
    setIsRunning(true);
    try {
      const ensured = await persistTemplate({ silent: true });
      if (!ensured.templateId) {
        throw new Error("Template ID is missing after save.");
      }
      const runPayload = buildRunPayloadFromTrigger();
      const runRes = await runWorkflowManual({
        templateId: ensured.templateId,
        templateVersion: ensured.templateVersion || undefined,
        input: runPayload.input,
        context: runPayload.context,
        idempotencyKey: `studio-run-${Date.now()}`,
      });

      toast({
        title: "Workflow run started",
        description: `Run id: ${String(runRes?.run?.id || "")}`,
      });
      const runId = String(runRes?.run?.id || "").trim();
      if (runId) {
        setActiveRunId(runId);
        setViewMode("run");
        try {
          const detail = await getWorkflowRun(runId);
          setRunDetail(detail);
          const runningStep = detail?.steps?.find((step: any) => {
            const status = String(step?.status || step?.step_status || step?.state || "").toLowerCase();
            return status === "running" || status === "waiting";
          });
          const firstStep = detail?.steps?.[0];
          const currentNodeId = String(
            (runningStep?.nodeId || runningStep?.node_id)
            || (firstStep?.nodeId || firstStep?.node_id)
            || ""
          ).trim();
          if (currentNodeId) setSelectedNodeId(currentNodeId);
        } catch {
          // Polling effect will catch up even if initial detail fetch fails.
        }
      }

      if (onRunWorkflow) {
        onRunWorkflow();
      }
    } catch (e: any) {
      toast({
        title: "Run failed",
        description: e?.message || "Unable to run workflow.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  }, [buildRunPayloadFromTrigger, onRunWorkflow, persistTemplate, toast]);

  const triggerInput = React.useMemo(() => {
    const triggerNode = nodes.find((node) => node.type === "trigger") || null;
    const triggerConfig = triggerNode ? getNodeConfigRecord(triggerNode) : {};
    return (isObjectRecord(triggerConfig?.input) ? triggerConfig.input : {}) as Record<string, any>;
  }, [nodes]);

  const triggerDocIds = React.useMemo(() => {
    const ids = readStringArray(triggerInput.doc_ids, []);
    const single = readString(triggerInput.doc_id, "").trim();
    if (single && !ids.includes(single)) ids.unshift(single);
    return ids;
  }, [triggerInput]);
  const triggerDocEntries = React.useMemo(
    () =>
      triggerDocIds.map((id) => ({
        id,
        label: String(docDisplayById[id] || id),
      })),
    [docDisplayById, triggerDocIds]
  );

  const visibleRuntimeInputRequirements = React.useMemo<RuntimeInputRequirement[]>(() => {
    if (runtimeInputRequirements.length > 0) return runtimeInputRequirements;
    const fallback: RuntimeInputRequirement[] = [];
    if (triggerDocIds.length > 0) {
      fallback.push({ inputKey: "doc_ids", label: "Document IDs", kind: "docs", targets: [] });
    }
    if (hasMeaningfulValue(triggerInput.folder_path)) {
      fallback.push({ inputKey: "folder_path", label: "Folder path", kind: "folder", targets: [] });
    }
    return fallback;
  }, [runtimeInputRequirements, triggerDocIds, triggerInput.folder_path]);

  const setTriggerInputField = React.useCallback((key: string, value: any) => {
    setTriggerInputFields({ [key]: value });
  }, [setTriggerInputFields]);
  const removeTriggerDocId = React.useCallback((docId: string) => {
    const nextDocIds = triggerDocIds.filter((id) => id !== docId);
    setTriggerInputFields({
      doc_ids: nextDocIds,
      doc_id: nextDocIds[0] || "",
    });
  }, [setTriggerInputFields, triggerDocIds]);

  const handleRunClick = React.useCallback(() => {
    if (preRunSetupIssueCount > 0) {
      setShowPreRunDialog(true);
      return;
    }
    if (preRunInputIssueCount > 0) {
      setViewMode("run");
      toast({
        title: "Add required inputs",
        description: "Fill required inputs in Control Center, then start run.",
      });
      return;
    }
    void runNow();
  }, [preRunInputIssueCount, preRunSetupIssueCount, runNow, toast]);

  const handleConnectionGuard = React.useCallback((sourceNodeId: string, targetNodeId: string): ConnectionGuardResult => {
    if (createsGraphCycle(sourceNodeId, targetNodeId, edges)) {
      return {
        allow: false,
        level: "error",
        message: "This connection creates a loop. Use only forward flow steps.",
      };
    }
    const sourceNode = nodes.find((node) => node.id === sourceNodeId) || null;
    const targetNode = nodes.find((node) => node.id === targetNodeId) || null;
    return guardConnection(sourceNode, targetNode);
  }, [edges, nodes]);

  const handleConnectionFeedback = React.useCallback((result: ConnectionGuardResult) => {
    if (!result.message) return;
    const title = result.level === "error" ? "Connection blocked" : "Connection warning";
    const suggestions = Array.isArray(result.suggestions) && result.suggestions.length > 0
      ? ` Try: ${result.suggestions.slice(0, 3).join(" · ")}`
      : "";
    toast({
      title,
      description: `${result.message}${suggestions}`,
    });
  }, [toast]);

  const renderModeFields = () => {
    if (!selectedNode) return null;

    if (selectedNode.type === "trigger") {
      const input = selectedConfig.input || {};
      const context = selectedConfig.context || {};
      return (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Choose what this workflow should start with.
          </p>
          <div className="flex items-center gap-2">
            <Input
              className="h-9 text-xs"
              value={readString(input.doc_id, "")}
              placeholder="Main file ID (optional)"
              readOnly
            />
            <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => openTriggerDocPicker("doc_id", false, 1)}>
              Pick File
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={() => updateNodeConfig("input", { ...input, doc_id: "" })}>
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              className="h-9 text-xs"
              value={readString(readStringArray(input.doc_ids).join(", "), "")}
              placeholder="Extra file IDs (comma separated)"
              readOnly
            />
            <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => openTriggerDocPicker("doc_ids", true, 20)}>
              Pick Files
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={() => updateNodeConfig("input", { ...input, doc_ids: [] })}>
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              className="h-9 text-xs"
              value={readString(input.folder_path, "")}
              placeholder="Folder path (optional)"
              readOnly
            />
            <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={openTriggerFolderPicker}>
              Pick Folder
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={() => updateNodeConfig("input", { ...input, folder_path: "" })}>
              Clear
            </Button>
          </div>
          <Input
            className="h-9 text-xs"
            value={readString(context.source, "workflow-builder")}
            onChange={(e) => updateNodeConfig("context", { ...context, source: e.target.value })}
            placeholder="Run label (optional)"
          />
        </div>
      );
    }

    if (selectedNode.type === "ai") {
      if (selectedMode === "generate") {
        return (
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Prompt</label>
            <textarea
              className="w-full min-h-[100px] bg-background border border-border rounded-md p-2 text-xs outline-none focus:ring-1 ring-primary"
              value={readString(selectedConfig.prompt, "")}
              onChange={(e) => updateNodeConfig("prompt", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={readString(selectedConfig.response_format, "text")}
                onValueChange={(val) => updateNodeConfig("response_format", val)}
              >
                <SelectTrigger className="h-9 text-xs bg-background border-border/50">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Plain Text</SelectItem>
                  <SelectItem value="json">Structured Response</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.1"
                className="h-9 text-xs"
                value={readNumber(selectedConfig.temperature, 0.2)}
                onChange={(e) => updateNodeConfig("temperature", Number(e.target.value))}
                placeholder="Creativity (0-1)"
              />
            </div>
          </div>
        );
      }
      if (selectedMode === "extract") {
        const schemaFields = readStringArray(selectedConfig.schema_fields, []);
        return (
          <div className="space-y-2">
            <Input
              className="h-9 text-xs"
              value={readString(selectedConfig.text, "")}
              onChange={(e) => updateNodeConfig("text", e.target.value)}
              placeholder="Paste text to extract from (optional if using files)"
            />
            <div className="flex items-center gap-2">
              <Input
                className="h-9 text-xs"
                value={readString(readStringArray(selectedConfig.doc_ids).join(", "), "")}
                placeholder="File IDs (comma separated)"
                readOnly
              />
              <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => openConfigDocPicker("doc_ids", true, 20)}>
                Pick Files
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={() => updateNodeConfig("doc_ids", [])}>
                Clear
              </Button>
            </div>
            <StringListEditor
              label="Fields To Extract"
              items={schemaFields}
              placeholder="Field name"
              addLabel="Add Field"
              onChange={(next) => updateNodeConfig("schema_fields", next.filter(Boolean))}
            />
          </div>
        );
      }
      const labels = readStringArray(selectedConfig.labels, ["invoice", "agreement"]);
      return (
        <div className="space-y-2">
          <Input
            className="h-9 text-xs"
            value={readString(selectedConfig.text, "")}
            onChange={(e) => updateNodeConfig("text", e.target.value)}
            placeholder="Paste text to classify (optional if using files)"
          />
          <StringListEditor
            label="Labels"
            items={labels}
            placeholder="Label"
            addLabel="Add Label"
            onChange={(next) => updateNodeConfig("labels", next.filter(Boolean))}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step="0.05"
              className="h-9 text-xs"
              value={readNumber(selectedConfig.threshold, 0.5)}
              onChange={(e) => updateNodeConfig("threshold", Number(e.target.value))}
              placeholder="Match confidence (0-1)"
            />
            <label className="h-9 px-3 border border-border rounded-md bg-background flex items-center justify-between text-xs">
              Multi-label
              <input
                type="checkbox"
                checked={readBoolean(selectedConfig.multi_label, false)}
                onChange={(e) => updateNodeConfig("multi_label", e.target.checked)}
              />
            </label>
          </div>
        </div>
      );
    }

    if (selectedNode.type === "file") {
      if (selectedMode === "list_folder") {
        const folderFilters: RuleRow[] = Array.isArray(selectedConfig.filters)
          ? selectedConfig.filters.map((rule: any, index: number) => ({
            id: String(rule?.id || `filter_${index + 1}`),
            field: String(rule?.field || ""),
            operator: String(rule?.operator || "equals"),
            expected: String(rule?.expected || rule?.value || ""),
          }))
          : [];
        return (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Source Folder</label>
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 text-xs border-border/40 bg-muted/5"
                  value={readString(selectedConfig.folder_path, "/")}
                  placeholder="Folder path"
                  readOnly
                />
                <Button type="button" variant="outline" size="sm" className="h-9 text-[11px] font-bold border-border/40 hover:bg-muted/10" onClick={() => openConfigFolderPicker("folder_path")}>
                  Pick
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9 text-[11px] font-bold text-muted-foreground/40 hover:text-destructive transition-colors px-2" onClick={() => updateNodeConfig("folder_path", "")}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <label className="h-9 px-3 border border-border/40 rounded-lg bg-transparent hover:bg-muted/5 transition-colors flex items-center justify-between text-[11px] font-medium cursor-pointer">
                Recursive
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-border/40 text-primary focus:ring-primary focus:ring-offset-0"
                  checked={readBoolean(selectedConfig.recursive, false)}
                  onChange={(e) => updateNodeConfig("recursive", e.target.checked)}
                />
              </label>
              <div className="space-y-1.5">
                <Input
                  type="number"
                  className="h-9 text-xs border-border/40 bg-transparent text-center"
                  value={readNumber(selectedConfig.limit, 100)}
                  onChange={(e) => updateNodeConfig("limit", Math.max(1, Number(e.target.value) || 1))}
                  placeholder="Limit"
                />
              </div>
            </div>
            <RuleListEditor
              rules={folderFilters}
              onChange={(next) =>
                updateNodeConfig(
                  "filters",
                  next.map((rule) => ({
                    id: rule.id,
                    field: rule.field,
                    operator: rule.operator,
                    value: rule.expected,
                  }))
                )
              }
            />
          </div>
        );
      }
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Source File(s)</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 text-xs border-border/40 bg-muted/5"
                  value={readString(selectedConfig.doc_id, "")}
                  placeholder="Single file ID"
                  readOnly
                />
                <Button type="button" variant="outline" size="sm" className="h-9 text-[11px] font-bold border-border/40 hover:bg-muted/10 shrink-0" onClick={() => openConfigDocPicker("doc_id", false, 1)}>
                  Pick Single
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9 text-[11px] font-bold text-muted-foreground/40 hover:text-destructive transition-colors px-2" onClick={() => updateNodeConfig("doc_id", "")}>
                  Clear
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 text-xs border-border/40 bg-muted/5"
                  value={readString(readStringArray(selectedConfig.doc_ids).join(", "), "")}
                  placeholder="Multiple file IDs"
                  readOnly
                />
                <Button type="button" variant="outline" size="sm" className="h-9 text-[11px] font-bold border-border/40 hover:bg-muted/10 shrink-0" onClick={() => openConfigDocPicker("doc_ids", true, 20)}>
                  Pick Multiple
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9 text-[11px] font-bold text-muted-foreground/40 hover:text-destructive transition-colors px-2" onClick={() => updateNodeConfig("doc_ids", [])}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <label className="h-9 px-3 border border-border/40 rounded-lg bg-transparent hover:bg-muted/5 transition-colors flex items-center justify-between text-[11px] font-medium cursor-pointer">
              Include Metadata
              <input
                type="checkbox"
                className="w-3.5 h-3.5 rounded border-border/40 text-primary focus:ring-primary focus:ring-offset-0"
                checked={readBoolean(selectedConfig.include_metadata, true)}
                onChange={(e) => updateNodeConfig("include_metadata", e.target.checked)}
              />
            </label>
            <div className="space-y-1.5">
              <Input
                type="number"
                className="h-9 text-xs border-border/40 bg-transparent text-center"
                value={readNumber(selectedConfig.max_chars, 6000)}
                onChange={(e) => updateNodeConfig("max_chars", Math.max(100, Number(e.target.value) || 100))}
                placeholder="Max chars"
              />
            </div>
          </div>
        </div>
      );
    }

    if (selectedNode.type === "retrieval") {
      const scope = readString(selectedConfig.source_scope, "folder");
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Search Parameters</label>
            <Input
              className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
              value={readString(selectedConfig.query, "")}
              onChange={(e) => updateNodeConfig("query", e.target.value)}
              placeholder="Search query..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest px-1">Top K</label>
              <Input
                type="number"
                className="h-8 text-xs border-border/40 bg-transparent"
                value={readNumber(selectedConfig.top_k, 10)}
                onChange={(e) => updateNodeConfig("top_k", Math.max(1, Number(e.target.value) || 1))}
                placeholder="Matches"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest px-1">Min Score</label>
              <Input
                type="number"
                step="0.05"
                className="h-8 text-xs border-border/40 bg-transparent"
                value={readNumber(selectedConfig.min_score, 0.2)}
                onChange={(e) => updateNodeConfig("min_score", Number(e.target.value))}
                placeholder="Score"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Search Scope</label>
            <Select value={scope} onValueChange={(val) => updateNodeConfig("source_scope", val)}>
              <SelectTrigger className="h-9 text-xs bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="folder" className="text-xs">Selected Folder</SelectItem>
                <SelectItem value="tags" className="text-xs">By Tags</SelectItem>
                <SelectItem value="index" className="text-xs">Entire Index</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "folder" ? (
            <div className="flex items-center gap-2 pt-1">
              <Input
                className="h-9 text-xs border-border/40 bg-muted/5"
                value={readString(selectedConfig.folder_path, "")}
                placeholder="Folder path"
                readOnly
              />
              <Button type="button" variant="outline" size="sm" className="h-9 text-[11px] font-bold border-border/40 hover:bg-muted/10 shrink-0" onClick={() => openConfigFolderPicker("folder_path")}>
                Pick
              </Button>
            </div>
          ) : null}
          {scope === "tags" ? (
            <Input
              className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
              value={readString(readStringArray(selectedConfig.tags).join(", "), "")}
              onChange={(e) => updateNodeConfig("tags", readStringArray(e.target.value))}
              placeholder="Enter tags (comma separated)"
            />
          ) : null}
        </div>
      );
    }

    if (selectedNode.type === "document") {
      if (selectedMode === "create") {
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Title</label>
                <Input
                  className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                  value={readString(selectedConfig.title, "")}
                  onChange={(e) => {
                    const nextTitle = e.target.value;
                    updateNodeConfig("title", nextTitle);
                    const currentFilename = readString(selectedConfig.filename, "");
                    if (!currentFilename.trim()) {
                      const suggested = `${nextTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "generated-document"}.md`;
                      updateNodeConfig("filename", suggested);
                    }
                  }}
                  placeholder="Doc title"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Filename</label>
                <Input
                  className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors font-mono"
                  value={readString(selectedConfig.filename, "")}
                  onChange={(e) => updateNodeConfig("filename", e.target.value)}
                  placeholder="file-name.md"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Content Template</label>
              <textarea
                className="w-full min-h-[140px] bg-muted/5 border border-border/40 rounded-lg p-3 text-xs outline-none focus:ring-1 focus:ring-primary/40 transition-all leading-relaxed custom-scrollbar font-mono"
                value={readString(selectedConfig.content, "")}
                onChange={(e) => updateNodeConfig("content", e.target.value)}
                placeholder="# Document Content..."
              />
            </div>
          </div>
        );
      }
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Target Document</label>
            <div className="flex items-center gap-2">
              <Input
                className="h-9 text-xs border-border/40 bg-muted/5"
                value={readString(selectedConfig.doc_id, "")}
                placeholder="Document ID to update"
                readOnly
              />
              <Button type="button" variant="outline" size="sm" className="h-9 text-[11px] font-bold border-border/40 hover:bg-muted/10 shrink-0" onClick={() => openConfigDocPicker("doc_id", false, 1)}>
                Pick
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">New Title (Optional)</label>
            <Input
              className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
              value={readString(selectedConfig.title, "")}
              onChange={(e) => updateNodeConfig("title", e.target.value)}
              placeholder="Keep empty to leave title unchanged"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Update Content</label>
            <textarea
              className="w-full min-h-[120px] bg-muted/5 border border-border/40 rounded-lg p-3 text-xs outline-none focus:ring-1 focus:ring-primary/40 transition-all leading-relaxed custom-scrollbar font-mono"
              value={readString(selectedConfig.content, "")}
              onChange={(e) => updateNodeConfig("content", e.target.value)}
              placeholder="New document content..."
            />
          </div>
          <label className="h-9 px-3 border border-border/40 rounded-lg bg-transparent hover:bg-muted/5 transition-colors flex items-center justify-between text-[11px] font-medium cursor-pointer">
            Create New Version
            <input
              type="checkbox"
              className="w-3.5 h-3.5 rounded border-border/40 text-primary focus:ring-primary focus:ring-offset-0"
              checked={readBoolean(selectedConfig.create_new_version, true)}
              onChange={(e) => updateNodeConfig("create_new_version", e.target.checked)}
            />
          </label>
        </div>
      );
    }

    if (selectedNode.type === "file") {
      if (selectedMode === "move") {
        return (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Source File(s)</label>
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 text-xs border-border/40 bg-muted/5"
                  value={readString(readStringArray(selectedConfig.doc_ids).join(", "), "")}
                  placeholder="Select files to move"
                  readOnly
                />
                <Button type="button" variant="outline" size="sm" className="h-9 text-[11px] font-bold border-border/40 hover:bg-muted/10 shrink-0" onClick={() => openConfigDocPicker("doc_ids", true, 20)}>
                  Pick
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Destination</label>
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 text-xs border-border/40 bg-muted/5"
                  value={readString(selectedConfig.dest_path, "")}
                  placeholder="Target folder path"
                  readOnly
                />
                <Button type="button" variant="outline" size="sm" className="h-9 text-[11px] font-bold border-border/40 hover:bg-muted/10 shrink-0" onClick={() => openConfigFolderPicker("dest_path")}>
                  Pick Folder
                </Button>
              </div>
            </div>
          </div>
        );
      }
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Target File(s)</label>
            <div className="flex items-center gap-2">
              <Input
                className="h-9 text-xs border-border/40 bg-muted/5"
                value={readString(readStringArray(selectedConfig.doc_ids).join(", "), "")}
                placeholder="Multiple file IDs"
                readOnly
              />
              <Button type="button" variant="outline" size="sm" className="h-9 text-[11px] font-bold border-border/40 hover:bg-muted/10 shrink-0" onClick={() => openConfigDocPicker("doc_ids", true, 20)}>
                Pick
              </Button>
            </div>
          </div>
          <div className="space-y-4 pt-1">
            <StringListEditor
              label="Tags"
              items={readStringArray(selectedConfig.tags, [])}
              placeholder="Add tag"
              addLabel="New Tag"
              onChange={(next) => updateNodeConfig("tags", next.filter(Boolean))}
            />
            <StringListEditor
              label="Keywords"
              items={readStringArray(selectedConfig.keywords, [])}
              placeholder="Add keyword"
              addLabel="New Keyword"
              onChange={(next) => updateNodeConfig("keywords", next.filter(Boolean))}
            />
          </div>
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Category</label>
              <Input
                className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                value={readString(selectedConfig.category, "")}
                onChange={(e) => updateNodeConfig("category", e.target.value)}
                placeholder="Ex: Invoice"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1 text-center">Merge</label>
              <label className="h-9 px-3 border border-border/40 rounded-lg bg-transparent hover:bg-muted/5 transition-colors flex items-center justify-center cursor-pointer">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-border/40 text-primary focus:ring-primary focus:ring-offset-0"
                  checked={readBoolean(selectedConfig.merge, true)}
                  onChange={(e) => updateNodeConfig("merge", e.target.checked)}
                />
              </label>
            </div>
          </div>
        </div>
      );
    }

    if (selectedNode.type === "checks") {
      if (selectedMode === "validate") {
        const requiredFields = readStringArray(selectedConfig.required_fields, []);
        const rules: RuleRow[] = Array.isArray(selectedConfig.rules)
          ? selectedConfig.rules.map((rule: any, index: number) => ({
            id: String(rule?.id || `rule_${index + 1}`),
            field: String(rule?.field || ""),
            operator: String(rule?.operator || "equals"),
            expected: String(rule?.expected || ""),
          }))
          : [];
        return (
          <div className="space-y-5">
            <StringListEditor
              label="Required Fields"
              items={requiredFields}
              placeholder="Field name"
              addLabel="Add Field"
              onChange={(next) => updateNodeConfig("required_fields", next.filter(Boolean))}
            />
            <RuleListEditor
              rules={rules}
              onChange={(next) => updateNodeConfig("rules", next)}
            />
            <label className="h-9 px-3 border border-border/40 rounded-lg bg-transparent hover:bg-muted/5 transition-colors flex items-center justify-between text-[11px] font-medium cursor-pointer">
              Fail On Warning
              <input
                type="checkbox"
                className="w-3.5 h-3.5 rounded border-border/40 text-primary focus:ring-primary focus:ring-offset-0"
                checked={readBoolean(selectedConfig.fail_on_warning, false)}
                onChange={(e) => updateNodeConfig("fail_on_warning", e.target.checked)}
              />
            </label>
          </div>
        );
      }
      if (selectedMode === "reconcile") {
        return (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Records Source</label>
              <Input
                className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                value={readString(selectedConfig.records_source_path, "")}
                onChange={(e) => updateNodeConfig("records_source_path", e.target.value)}
                placeholder="Ex: run.input.records"
              />
            </div>
            <StringListEditor
              label="Key Fields"
              items={readStringArray(selectedConfig.key_fields, ["id"])}
              placeholder="Field name"
              addLabel="Add Key Field"
              onChange={(next) => updateNodeConfig("key_fields", next.filter(Boolean))}
            />
          </div>
        );
      }
      return (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Target Files</label>
            <div className="flex items-center gap-2">
              <Input
                className="h-9 text-xs border-border/40 bg-muted/5"
                value={readString(readStringArray(selectedConfig.doc_ids).join(", "), "")}
                placeholder="Source files"
                readOnly
              />
              <Button type="button" variant="outline" size="sm" className="h-9 text-[11px] font-bold border-border/40 hover:bg-muted/10 shrink-0" onClick={() => openConfigDocPicker("doc_ids", true, 20)}>
                Pick
              </Button>
            </div>
          </div>
          <StringListEditor
            label="Required Patterns"
            items={readStringArray(selectedConfig.required_patterns, [])}
            placeholder="Regex pattern"
            addLabel="Add Pattern"
            onChange={(next) => updateNodeConfig("required_patterns", next.filter(Boolean))}
          />
          <StringListEditor
            label="Required Types"
            items={readStringArray(selectedConfig.required_types, [])}
            placeholder="File type"
            addLabel="Add Type"
            onChange={(next) => updateNodeConfig("required_types", next.filter(Boolean))}
          />
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Min Files Required</label>
            <Input
              type="number"
              className="h-9 text-xs border-border/40 bg-transparent"
              value={readNumber(selectedConfig.min_docs, 1)}
              onChange={(e) => updateNodeConfig("min_docs", Math.max(0, Number(e.target.value) || 0))}
              placeholder="1"
            />
          </div>
        </div>
      );
    }

    if (selectedNode.type === "flow") {
      if (selectedMode === "if_else") {
        const conditions: ConditionRow[] = Array.isArray(selectedConfig.conditions)
          ? selectedConfig.conditions.map((condition: any, index: number) => ({
            id: String(condition?.id || `condition_${index + 1}`),
            field: String(condition?.field || ""),
            operator: String(condition?.operator || "equals"),
            value: String(condition?.value || ""),
          }))
          : [];
        const conditionLogic = readString(selectedConfig.condition_logic, "all");
        const expressionPreview = conditions
          .filter((condition) => condition.field.trim().length > 0)
          .map((condition) => `${condition.field} ${condition.operator} ${condition.value || "?"}`)
          .join(conditionLogic === "any" ? " OR " : " AND ");
        return (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Logic Pattern</label>
              <Select value={conditionLogic} onValueChange={(val) => updateNodeConfig("condition_logic", val)}>
                <SelectTrigger className="h-9 text-xs bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                  <SelectValue placeholder="Select logic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Match ALL (AND)</SelectItem>
                  <SelectItem value="any" className="text-xs">Match ANY (OR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ConditionListEditor
              conditions={conditions}
              onChange={(next) => updateNodeConfig("conditions", next)}
            />
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Truthy Definitions</label>
                <Input
                  className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                  value={readString(readStringArray(selectedConfig.truthy_values, ["true", "yes", "1"]).join(", "), "")}
                  onChange={(e) => updateNodeConfig("truthy_values", readStringArray(e.target.value))}
                  placeholder="Values treated as TRUE (comma separated)"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest px-1">True Label</label>
                  <Input
                    className="h-8 text-xs border-border/40 bg-transparent"
                    value={readString(selectedConfig.true_label, "True")}
                    onChange={(e) => updateNodeConfig("true_label", e.target.value)}
                    placeholder="True"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest px-1">False Label</label>
                  <Input
                    className="h-8 text-xs border-border/40 bg-transparent"
                    value={readString(selectedConfig.false_label, "False")}
                    onChange={(e) => updateNodeConfig("false_label", e.target.value)}
                    placeholder="False"
                  />
                </div>
              </div>
            </div>
            {expressionPreview && (
              <div className="rounded-lg border border-border/30 bg-muted/5 px-3 py-2.5 text-[10px] font-mono text-muted-foreground leading-relaxed">
                <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest mb-1.5 opacity-50">Preview</div>
                {expressionPreview}
              </div>
            )}
          </div>
        );
      }
      if (selectedMode === "router") {
        const routes: RouteRow[] = Array.isArray(selectedConfig.routes)
          ? selectedConfig.routes.map((route: any, index: number) => ({
            id: String(route?.id || `route_${index + 1}`),
            key: String(route?.key || ""),
            label: String(route?.label || ""),
          }))
          : [];
        const routeKeys = routes.map((route) => route.key).filter(Boolean);
        return (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Routing Field</label>
              <Input
                className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                value={readString(selectedConfig.route_key, "")}
                onChange={(e) => updateNodeConfig("route_key", e.target.value)}
                placeholder="Ex: department"
              />
            </div>
            <RouteListEditor
              routes={routes}
              onChange={(next) => updateNodeConfig("routes", next)}
            />
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Default Fallback</label>
              {routeKeys.length > 0 ? (
                <Select
                  value={readString(selectedConfig.default_route, routeKeys[0])}
                  onValueChange={(val) => updateNodeConfig("default_route", val)}
                >
                  <SelectTrigger className="h-9 text-xs bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                    <SelectValue placeholder="Select default" />
                  </SelectTrigger>
                  <SelectContent>
                    {routeKeys.map((key) => (
                      <SelectItem key={key} value={key} className="text-xs">{`Default -> ${key}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                  value={readString(selectedConfig.default_route, "default")}
                  onChange={(e) => updateNodeConfig("default_route", e.target.value)}
                  placeholder="Default route key"
                />
              )}
            </div>
          </div>
        );
      }
      if (selectedMode === "for_each") {
        return (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Source Collection</label>
              <Input
                className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors font-mono"
                value={readString(selectedConfig.items_path, "")}
                onChange={(e) => updateNodeConfig("items_path", e.target.value)}
                placeholder="Ex: run.input.items"
              />
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <label className="h-9 px-3 border border-border/40 rounded-lg bg-transparent hover:bg-muted/5 transition-colors flex items-center justify-between text-[11px] font-medium cursor-pointer">
                Allow Errors
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-border/40 text-primary focus:ring-primary focus:ring-offset-0"
                  checked={readBoolean(selectedConfig.continue_on_item_error, false)}
                  onChange={(e) => updateNodeConfig("continue_on_item_error", e.target.checked)}
                />
              </label>
              <div className="space-y-1.5">
                <Input
                  type="number"
                  className="h-9 text-xs border-border/40 bg-transparent text-center"
                  value={readNumber(selectedConfig.max_items, 100)}
                  onChange={(e) => updateNodeConfig("max_items", Math.max(1, Number(e.target.value) || 1))}
                  placeholder="Limit"
                />
              </div>
            </div>
          </div>
        );
      }
      return (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Merge Strategy</label>
            <Select value={readString(selectedConfig.mode, "array")} onValueChange={(val) => updateNodeConfig("mode", val)}>
              <SelectTrigger className="h-9 text-xs bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="array" className="text-xs">Combine as List</SelectItem>
                <SelectItem value="records" className="text-xs">Combine Base Records</SelectItem>
                <SelectItem value="object_merge" className="text-xs">Deep Merge Fields</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <StringListEditor
            label="Merge Sources"
            items={readStringArray(selectedConfig.from_nodes, [])}
            placeholder="Step ID"
            addLabel="Add Step"
            onChange={(next) => updateNodeConfig("from_nodes", next.filter(Boolean))}
          />
        </div>
      );
    }

    if (selectedNode.type === "human") {
      const assignee = selectedConfig.assignee || { type: "role", value: "orgAdmin" };
      const checklistItems = readStringArray(selectedConfig.checklist_items, []);
      return (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Task Title</label>
            <Input
              className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
              value={readString(selectedConfig.title, "")}
              onChange={(e) => updateNodeConfig("title", e.target.value)}
              placeholder="Ex: Review Required"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Assignee</label>
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <Select value={readString(assignee.type, "role")} onValueChange={(val) => updateNodeConfig("assignee", { ...assignee, type: val })}>
                <SelectTrigger className="h-9 text-[11px] bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none uppercase font-bold tracking-widest">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role" className="text-xs">Role</SelectItem>
                  <SelectItem value="user" className="text-xs">User</SelectItem>
                  <SelectItem value="email" className="text-xs">Email</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                value={readString(assignee.value, "")}
                onChange={(e) => updateNodeConfig("assignee", { ...assignee, value: e.target.value })}
                placeholder="Value..."
              />
            </div>
          </div>
          {selectedMode === "checklist" ? (
            <StringListEditor
              label="Checklist Items"
              items={checklistItems}
              placeholder="Ex: Verify calculations"
              addLabel="Add Requirement"
              onChange={(next) => updateNodeConfig("checklist_items", next.filter(Boolean))}
            />
          ) : (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest px-1">Due In (Hrs)</label>
                  <Input
                    type="number"
                    className="h-8 text-xs border-border/40 bg-transparent"
                    value={readNumber(selectedConfig.due_in_hours, 24)}
                    onChange={(e) => updateNodeConfig("due_in_hours", Math.max(1, Number(e.target.value) || 1))}
                    placeholder="24"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest px-1">Reminder (Min)</label>
                  <Input
                    type="number"
                    className="h-8 text-xs border-border/40 bg-transparent"
                    value={readNumber(selectedConfig.reminder_minutes, 0)}
                    onChange={(e) => updateNodeConfig("reminder_minutes", Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                  />
                </div>
              </div>
              <label className="h-9 px-3 border border-border/40 rounded-lg bg-transparent hover:bg-muted/5 transition-colors flex items-center justify-between text-[11px] font-medium cursor-pointer">
                Comment Required
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-border/40 text-primary focus:ring-primary focus:ring-offset-0"
                  checked={readBoolean(selectedConfig.comment_required, false)}
                  onChange={(e) => updateNodeConfig("comment_required", e.target.checked)}
                />
              </label>
            </div>
          )}
        </div>
      );
    }

    if (selectedNode.type === "output") {
      return (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Export Config</label>
            <Input
              className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors font-mono"
              value={readString(selectedConfig.filename, "export.csv")}
              onChange={(e) => updateNodeConfig("filename", e.target.value)}
              placeholder="filename.csv"
            />
          </div>
          <StringListEditor
            label="Columns"
            items={readStringArray(selectedConfig.columns, [])}
            placeholder="Ex: Customer Name"
            addLabel="Add Column"
            onChange={(next) => updateNodeConfig("columns", next.filter(Boolean))}
          />
          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Records Source</label>
            <Input
              className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors font-mono"
              value={readString(selectedConfig.rows_source_path, "")}
              onChange={(e) => updateNodeConfig("rows_source_path", e.target.value)}
              placeholder="Ex: previous.items"
            />
          </div>
        </div>
      );
    }

    if (selectedNode.type === "utilities") {
      if (selectedMode === "delay") {
        const waitMode =
          readString(selectedConfig.wait_mode, "") ||
          (readString(selectedConfig.until_datetime, "") ? "until" : "duration");
        return (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Wait Mode</label>
              <Select value={waitMode} onValueChange={(val) => updateNodeConfig("wait_mode", val)}>
                <SelectTrigger className="h-9 text-xs bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="duration" className="text-xs">Relative Duration</SelectItem>
                  <SelectItem value="until" className="text-xs">Until Date/Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {waitMode === "duration" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Duration (ms)</label>
                  <Input
                    type="number"
                    className="h-9 text-xs border-border/40 bg-transparent"
                    value={readNumber(selectedConfig.duration_ms, 0)}
                    onChange={(e) => updateNodeConfig("duration_ms", Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold border-border/40 hover:bg-muted/10 uppercase" onClick={() => updateNodeConfig("duration_ms", 5 * 60 * 1000)}>5m</Button>
                  <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold border-border/40 hover:bg-muted/10 uppercase" onClick={() => updateNodeConfig("duration_ms", 30 * 60 * 1000)}>30m</Button>
                  <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold border-border/40 hover:bg-muted/10 uppercase" onClick={() => updateNodeConfig("duration_ms", 60 * 60 * 1000)}>1h</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Until Date/Time</label>
                <Input
                  type="datetime-local"
                  className="h-9 text-xs border-border/40 bg-transparent"
                  value={readString(selectedConfig.until_datetime, "")}
                  onChange={(e) => updateNodeConfig("until_datetime", e.target.value)}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest px-1">Timezone</label>
                <Input
                  className="h-8 text-xs border-border/40 bg-muted/5 font-mono"
                  value={readString(selectedConfig.timezone, "UTC")}
                  onChange={(e) => updateNodeConfig("timezone", e.target.value)}
                  placeholder="UTC"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest px-1">Jitter (ms)</label>
                <Input
                  type="number"
                  className="h-8 text-xs border-border/40 bg-transparent"
                  value={readNumber(selectedConfig.jitter_ms, 0)}
                  onChange={(e) => updateNodeConfig("jitter_ms", Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        );
      }

      if (selectedMode === "transform") {
        const mappingRows: KeyValueRow[] = Array.isArray(selectedConfig.mappings)
          ? selectedConfig.mappings.map((mapping: any, index: number) => ({
            id: String(mapping?.id || `mapping_${index + 1}`),
            key: String(mapping?.target || mapping?.key || ""),
            value: String(mapping?.source || mapping?.value || ""),
          }))
          : [];
        return (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Transform Mode</label>
              <Select value={readString(selectedConfig.mode, "mapping")} onValueChange={(val) => updateNodeConfig("mode", val)}>
                <SelectTrigger className="h-9 text-xs bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mapping" className="text-xs">Direct Field Mapping</SelectItem>
                  <SelectItem value="template" className="text-xs">Liquid/Mustache Template</SelectItem>
                  <SelectItem value="expression" className="text-xs">Formula Expression</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {readString(selectedConfig.mode, "mapping") === "mapping" ? (
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Field Mapping</label>
                <KeyValueListEditor
                  rows={mappingRows}
                  onChange={(next) =>
                    updateNodeConfig(
                      "mappings",
                      next.map((row) => ({ id: row.id, target: row.key, source: row.value }))
                    )
                  }
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Logic / Template</label>
                <textarea
                  className="w-full min-h-[120px] bg-muted/5 border border-border/40 rounded-lg p-3 text-xs outline-none focus:ring-1 focus:ring-primary/40 transition-all leading-relaxed custom-scrollbar font-mono"
                  value={readString(selectedConfig.rules_text, "")}
                  onChange={(e) => updateNodeConfig("rules_text", e.target.value)}
                  placeholder="Describe the logic or enter template..."
                />
              </div>
            )}
            <label className="h-9 px-3 border border-border/40 rounded-lg bg-transparent hover:bg-muted/5 transition-colors flex items-center justify-between text-[11px] font-medium cursor-pointer">
              Validate Schema
              <input
                type="checkbox"
                className="w-3.5 h-3.5 rounded border-border/40 text-primary focus:ring-primary focus:ring-offset-0"
                checked={readBoolean(selectedConfig.validate_schema, false)}
                onChange={(e) => updateNodeConfig("validate_schema", e.target.checked)}
              />
            </label>
          </div>
        );
      }

      if (selectedMode === "function") {
        return (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Logic Type</label>
              <Select value={readString(selectedConfig.operation_type, "expression")} onValueChange={(val) => updateNodeConfig("operation_type", val)}>
                <SelectTrigger className="h-9 text-xs bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template" className="text-xs">Mustache Template</SelectItem>
                  <SelectItem value="expression" className="text-xs">Formula / Expression</SelectItem>
                  <SelectItem value="code" className="text-xs">Javascript Snippet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Code / Formula</label>
              <textarea
                className="w-full min-h-[140px] bg-muted/5 border border-border/40 rounded-lg p-3 text-[11px] font-mono outline-none focus:ring-1 focus:ring-primary/40 transition-all leading-relaxed custom-scrollbar"
                value={readString(selectedConfig.expression || selectedConfig.code, "")}
                onChange={(e) => {
                  if (readString(selectedConfig.operation_type, "expression") === "code") {
                    updateNodeConfig("code", e.target.value);
                  } else {
                    updateNodeConfig("expression", e.target.value);
                  }
                }}
                placeholder="Write your logic here..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Timeout (ms)</label>
              <Input
                type="number"
                className="h-9 text-xs border-border/40 bg-transparent text-center"
                value={readNumber(selectedConfig.timeout_ms, 5000)}
                onChange={(e) => updateNodeConfig("timeout_ms", Math.max(100, Number(e.target.value) || 100))}
                placeholder="5000"
              />
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-4">
          {(() => {
            const operation = readString(selectedConfig.operation, "set");
            const requiresValue = !["get", "delete"].includes(operation);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-[100px_1fr] gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Operation</label>
                    <Select value={operation} onValueChange={(val) => updateNodeConfig("operation", val)}>
                      <SelectTrigger className="h-9 text-[11px] bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none font-bold uppercase tracking-wider">
                        <SelectValue placeholder="Op" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="set" className="text-xs">SET</SelectItem>
                        <SelectItem value="get" className="text-xs">GET</SelectItem>
                        <SelectItem value="increment" className="text-xs">INC</SelectItem>
                        <SelectItem value="append" className="text-xs">ADD</SelectItem>
                        <SelectItem value="delete" className="text-xs">DEL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Key Path</label>
                    <Input
                      className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors font-mono"
                      value={readString(selectedConfig.key, "")}
                      onChange={(e) => updateNodeConfig("key", e.target.value)}
                      placeholder="Ex: user.score"
                    />
                  </div>
                </div>
                {requiresValue && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Value To Write</label>
                    <Input
                      className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                      value={readString(selectedConfig.value, "")}
                      onChange={(e) => updateNodeConfig("value", e.target.value)}
                      placeholder="Value or {{template}}"
                    />
                  </div>
                )}
              </div>
            );
          })()}
          <div className="grid grid-cols-[1fr_80px] gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">State Scope</label>
              <Select value={readString(selectedConfig.scope, "run")} onValueChange={(val) => updateNodeConfig("scope", val)}>
                <SelectTrigger className="h-9 text-xs bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="run" className="text-xs">This Run Execution</SelectItem>
                  <SelectItem value="session" className="text-xs">Current User Session</SelectItem>
                  <SelectItem value="global" className="text-xs">Global Application</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1 text-center">TTL (Min)</label>
              <Input
                type="number"
                className="h-9 text-xs border-border/40 bg-transparent text-center"
                value={readNumber(selectedConfig.ttl_minutes, 0)}
                onChange={(e) => updateNodeConfig("ttl_minutes", Math.max(0, Number(e.target.value) || 0))}
                placeholder="None"
              />
            </div>
          </div>
        </div>
      );
    }

    if (selectedNode.type === "audit") {
      const payloadRows: KeyValueRow[] = Array.isArray(selectedConfig.payload_fields)
        ? selectedConfig.payload_fields.map((row: any, index: number) => ({
          id: String(row?.id || `kv_${index + 1}`),
          key: String(row?.key || ""),
          value: String(row?.value || ""),
        }))
        : [];
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Log Event</label>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Input
                className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
                value={readString(selectedConfig.event_type, "workflow.step")}
                onChange={(e) => updateNodeConfig("event_type", e.target.value)}
                placeholder="Event type..."
              />
              <Select value={readString(selectedConfig.severity, "info")} onValueChange={(val) => updateNodeConfig("severity", val)}>
                <SelectTrigger className="h-9 text-[11px] bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors shadow-none uppercase font-bold tracking-tighter">
                  <SelectValue placeholder="Lvl" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info" className="text-xs">Info</SelectItem>
                  <SelectItem value="warning" className="text-xs">Warn</SelectItem>
                  <SelectItem value="critical" className="text-xs">Crit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Message Template</label>
            <textarea
              className="w-full min-h-[80px] bg-muted/5 border border-border/40 rounded-lg p-3 text-xs outline-none focus:ring-1 focus:ring-primary/40 transition-all leading-relaxed custom-scrollbar"
              value={readString(selectedConfig.message, "")}
              onChange={(e) => updateNodeConfig("message", e.target.value)}
              placeholder="Ex: Step {{step.id}} completed successfully"
            />
          </div>
          <div className="space-y-3 pt-1">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Contextual Payload</label>
            <KeyValueListEditor
              rows={payloadRows}
              onChange={(next) =>
                updateNodeConfig(
                  "payload_fields",
                  next.map((row) => ({ id: row.id, key: row.key, value: row.value }))
                )
              }
            />
          </div>
        </div>
      );
    }

    if (selectedNode.type === "note") {
      const themes = [
        { id: "yellow", name: "Yellow", color: "bg-yellow-400" },
        { id: "blue", name: "Blue", color: "bg-blue-400" },
        { id: "green", name: "Green", color: "bg-emerald-400" },
        { id: "pink", name: "Pink", color: "bg-pink-400" },
        { id: "purple", name: "Purple", color: "bg-purple-400" },
      ];

      return (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Note Narrative</label>
            <textarea
              className="w-full min-h-[160px] bg-muted/5 border border-border/40 rounded-lg p-3 text-xs outline-none focus:ring-1 focus:ring-primary/40 transition-all leading-relaxed custom-scrollbar font-sans italic"
              value={readString(selectedConfig.content, "")}
              onChange={(e) => updateNodeConfig("content", e.target.value)}
              placeholder="Enter context or documentation for this workflow step..."
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Visual Theme</label>
            <div className="flex items-center gap-2.5 px-1">
              {themes.map((theme) => {
                const isActive = readString(selectedConfig.theme, "yellow") === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => updateNodeConfig("theme", theme.id)}
                    title={theme.name}
                    className={cn(
                      "w-7 h-7 rounded-sm border-2 transition-all duration-200 outline-none hover:rotate-6",
                      theme.color,
                      isActive ? "border-primary ring-2 ring-primary/20 scale-110 shadow-lg" : "border-transparent opacity-60 hover:opacity-100"
                    )}
                  />
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    if (selectedNode.type === "end") {
      return (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] px-1">Final Outcome Label</label>
          <Input
            className="h-9 text-xs border-border/40 bg-transparent focus-visible:bg-muted/5 transition-colors"
            value={readString(selectedConfig.final_status, "completed")}
            onChange={(e) => updateNodeConfig("final_status", e.target.value)}
            placeholder="Ex: Success, Approved, Failed..."
          />
        </div>
      );
    }

    return null;
  };

  const hideAdvancedForSelectedNode = selectedNode?.type === "note";

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden font-sans">
      <header className="h-14 border-b border-border/50 flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight">Briefly Studio</h1>
            <Badge variant="outline" className="text-[10px] font-bold px-1.5 h-5 border-primary/20 bg-primary/5 text-primary tracking-wide">V9</Badge>
          </div>

          <Tabs value={viewMode} onValueChange={(val) => setViewMode(val as any)} className="w-[180px]">
            <TabsList className="grid w-full grid-cols-2 h-8 p-1 bg-muted/40">
              <TabsTrigger value="build" className="text-[10px] font-bold uppercase tracking-wider h-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">Build</TabsTrigger>
              <TabsTrigger value="run" className="text-[10px] font-bold uppercase tracking-wider h-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">Run</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="h-4 w-[1px] bg-border/50" />

          <div className="min-w-[220px] max-w-[320px] px-2 py-1 rounded-md bg-muted/30 border border-border/50">
            {isEditingWorkflowName ? (
              <Input
                ref={workflowNameInputRef}
                value={draftWorkflowName}
                onChange={(e) => setDraftWorkflowName(e.target.value)}
                onBlur={saveWorkflowName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveWorkflowName();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setDraftWorkflowName(workflowName);
                    setIsEditingWorkflowName(false);
                  }
                }}
                className="h-7 border-0 bg-transparent px-1 text-xs font-semibold shadow-none focus-visible:ring-0"
                placeholder="Workflow name"
              />
            ) : (
              <button
                type="button"
                className="w-full px-1 text-left text-xs font-semibold text-foreground truncate hover:text-primary transition-colors"
                onClick={startEditingWorkflowName}
                title="Click to rename workflow"
              >
                {workflowName}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onBackToHome ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
              onClick={onBackToHome}
              title="Back to Home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}

          <Button variant="default" size="sm" className="h-8 gap-1.5 text-xs font-semibold" asChild>
            <Link href="/workflows">Builder</Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-semibold"
            onClick={handleRunClick}
            disabled={isSaving || isRunning}
          >
            {isRunning ? "Running..." : "Run Workflow"}
          </Button>

          <div className="h-4 w-[1px] bg-border/50 mx-1" />

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-semibold"
            onClick={() => remapAllNodes(false)}
          >
            Remap All
          </Button>

          {onOpenHistory ? (
            <Button variant="outline" size="sm" className="h-8 gap-2 hover:bg-muted/50 text-xs font-semibold px-3 border-border/50" onClick={onOpenHistory}>
              <History className="w-3.5 h-3.5" />
              History
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-8 gap-2 hover:bg-muted/50 text-xs font-semibold px-3 border-border/50" asChild>
              <Link href="/workflows?panel=history">
                <History className="w-3.5 h-3.5" />
                History
              </Link>
            </Button>
          )}

          <div className="h-4 w-[1px] bg-border/50 mx-1" />
          <Button
            onClick={() => { void handleSave(); }}
            disabled={isSaving || isRunning}
            className="h-8 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded shadow-sm gap-2"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden h-full relative">
        <aside className={cn(
          "border-r border-border/50 flex flex-col bg-card/50 h-full transition-all duration-300",
          viewMode === "build" ? "w-64" : "w-0 opacity-0 overflow-hidden pointer-events-none"
        )}>
          <div className="p-4 overflow-y-auto custom-scrollbar flex-1 whitespace-nowrap">
            <div className="space-y-6">
              {GROUP_ORDER.map((group) => {
                const groupItems = CATALOG.filter((item) => item.group === group);
                if (groupItems.length === 0) return null;
                return (
                  <section key={group}>
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-3 px-1">{GROUP_LABEL[group]}</h3>
                    <div className="space-y-1">
                      {groupItems.map((item) => (
                        <SidebarBlockItem
                          key={item.type}
                          icon={item.icon}
                          label={item.label}
                          type={item.type}
                          onAdd={() => handleAddNode(item.type)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </aside>

        {viewMode === "run" && (
          <aside className="w-80 border-r border-border/50 flex flex-col bg-card/5 shadow-sm h-full overflow-hidden animate-in slide-in-from-left duration-300">
            <div className="h-14 border-b border-border/40 flex items-center justify-between px-5 bg-muted/5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-foreground/80">Control Center</h3>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground/60 hover:text-foreground"
                title="Refresh execution state"
                onClick={() => activeRunId && void (async () => {
                  setIsRefreshingRun(true);
                  try {
                    const detail = await getWorkflowRun(activeRunId);
                    setRunDetail(detail);
                  } finally {
                    setIsRefreshingRun(false);
                  }
                })()}
                disabled={!activeRunId || isRefreshingRun}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshingRun && "animate-spin")} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
              <div className="space-y-3">
                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-1">Run Configuration</label>
                <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-4">
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-foreground truncate">{workflowName}</div>
                    <div className="text-[10px] text-muted-foreground">v{savedTemplateVersion || 1} • {nodes.length} Steps</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!activeRunId || !isRunLocked ? (
                      <Button className="flex-1 h-9 text-xs font-bold gap-2" onClick={handleRunClick} disabled={isRunning}>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        START RUN
                      </Button>
                    ) : (
                      <Badge className={cn(
                        "flex-1 h-9 justify-center text-[10px] font-bold uppercase tracking-[0.1em]",
                        runDetail?.run?.status === "completed" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                          runDetail?.run?.status === "failed" ? "bg-rose-500/10 text-rose-600 border-rose-500/20" :
                            "bg-primary text-primary-foreground"
                      )}>
                        {runDetail?.run?.status || "Running"}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {visibleRuntimeInputRequirements.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Required Inputs</label>
                    {activeRunId && <Badge variant="outline" className="h-5 text-[9px] font-bold border-primary/20 bg-primary/5 text-primary">Active Run</Badge>}
                  </div>
                  <div className={cn(
                    "rounded-xl border p-4 space-y-3 transition-opacity",
                    !activeRunId ? "border-amber-500/25 bg-amber-500/5" : "border-border/40 bg-muted/5 opacity-80"
                  )}>
                    {visibleRuntimeInputRequirements.map((req) => (
                      <div key={req.inputKey} className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-foreground">{req.label}</div>
                        {req.kind === "folder" ? (
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-8 text-xs bg-background"
                              value={readString(triggerInput.folder_path, "")}
                              disabled={isRunLocked}
                              readOnly
                              placeholder="Pick folder"
                            />
                            {!isRunLocked && (
                              <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={openTriggerFolderPicker}>
                                Pick
                              </Button>
                            )}
                          </div>
                        ) : req.kind === "docs" ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[10px] text-muted-foreground">Multiple files supported</div>
                              <Badge variant="outline" className="h-5 text-[9px] font-bold border-border/50 bg-background">
                                {triggerDocEntries.length} selected
                              </Badge>
                            </div>
                            <div className="space-y-1.5">
                              {triggerDocEntries.length === 0 ? (
                                <div className="h-8 px-2.5 text-[11px] text-muted-foreground rounded-md border border-dashed border-border/50 bg-background/60 flex items-center">
                                  No files selected
                                </div>
                              ) : (
                                triggerDocEntries.map((doc) => (
                                  <div key={doc.id} className="h-8 px-2.5 rounded-md border border-border/50 bg-background flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-[11px]" title={doc.label}>
                                      {doc.label}
                                    </span>
                                    {!isRunLocked ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                        onClick={() => removeTriggerDocId(doc.id)}
                                        title="Remove file"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    ) : null}
                                  </div>
                                ))
                              )}
                            </div>
                            {!isRunLocked && (
                              <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => openTriggerDocPicker("doc_ids", true, 20)}>
                                Pick files
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Input
                            className="h-8 text-xs bg-background"
                            value={readString(triggerInput[req.inputKey], "")}
                            disabled={isRunLocked}
                            onChange={(e) => setTriggerInputField(req.inputKey, e.target.value)}
                            placeholder={`Enter ${req.label.toLowerCase()}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeRunId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Execution Pipeline</label>
                    <span className="text-[9px] font-bold text-primary">{runProgress}%</span>
                  </div>
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 ease-out"
                      style={{ width: `${runProgress}%` }}
                    />
                  </div>
                  <div className="space-y-2">
                    {runDetail?.steps?.map((step: any, index: number) => {
                      const stepNodeId = step.nodeId || step.node_id || step.workflow_step_id || '';
                      const stepStatus = step.status || step.step_status || step.state || 'pending';
                      return (
                        <div
                          key={step.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
                            selectedNodeId === stepNodeId ? "bg-background border-primary shadow-sm" : "bg-muted/5 border-border/40 hover:bg-muted/10",
                            stepStatus === "completed" || stepStatus === "succeeded" ? "border-emerald-500/20" :
                              stepStatus === "running" || stepStatus === "waiting" ? "border-primary animate-pulse" :
                                stepStatus === "failed" || stepStatus === "error" ? "border-rose-500/20" : ""
                          )}
                          onClick={() => setSelectedNodeId(stepNodeId)}
                        >
                          <div className={cn(
                            "w-6 h-6 rounded-md flex items-center justify-center border",
                            stepStatus === "completed" || stepStatus === "succeeded" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" :
                              stepStatus === "failed" || stepStatus === "error" ? "bg-rose-500/10 border-rose-500/20 text-rose-600" :
                                stepStatus === "running" || stepStatus === "waiting" ? "bg-primary/10 border-primary/20 text-primary" :
                                  "bg-muted/50 border-border/50 text-muted-foreground"
                          )}>
                            <span className="text-[9px] font-bold">{index + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold truncate uppercase tracking-tight">{friendlyNodeLabel(step.nodeType || step.node_type) || "Step"}</div>
                            <div className="text-[9px] text-muted-foreground flex items-center gap-1.5 min-w-0">
                              <Clock3 className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">
                                {stepStatus === "running" || stepStatus === "waiting"
                                  ? runningLine(step.nodeType || step.node_type, triggerDocIds.length)
                                  : (stepStatus || "Pending")}
                              </span>
                            </div>
                          </div>
                          {(stepStatus === "completed" || stepStatus === "succeeded") && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!activeRunId && (
                <div className="p-4 rounded-xl border border-dashed border-border/60 bg-muted/5 flex flex-col items-center justify-center text-center gap-3 py-10">
                  <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center border border-border/50 shadow-inner">
                    <Play className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-foreground">Ready for Launch</div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed px-4">Initialization requirements met. Start the automated sequence.</p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        <main className="flex-1 relative bg-background">
          <WorkflowCanvasV2
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            setEdges={setEdges}
            selectedNodeId={selectedNodeId}
            highlightedNodeId={activeHighlightedSourceNodeId}
            focusRequest={canvasFocusRequest}
            setSelectedNodeId={setSelectedNodeId}
            nodeReadinessById={nodeReadinessById}
            onConnectionGuard={handleConnectionGuard}
            onConnectionFeedback={handleConnectionFeedback}
            onConnectNodes={handleAutoMapOnConnect}
            nodeStatusById={nodeStatusById}
            viewMode={viewMode}
          />
        </main>

        <aside className="w-80 border-l border-border/40 bg-background flex flex-col h-full z-10 transition-all duration-300">
          <div className="h-14 border-b border-border/40 flex items-center gap-3 px-5 shrink-0">
            <div className="min-w-0 flex-1">
              {viewMode === "run" ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <h3 className="text-[10px] font-extrabold tracking-widest uppercase text-foreground/80">Step Artifacts</h3>
                </div>
              ) : selectedNode ? (
                <Input
                  className="h-9 bg-transparent border-transparent hover:bg-muted/30 focus-visible:bg-muted/40 shadow-none text-sm font-bold focus-visible:ring-0 px-2 -ml-2 transition-all"
                  value={selectedNode.label || selectedCatalog?.label || ""}
                  onChange={(e) => updateNodeLabel(e.target.value)}
                />
              ) : (
                <h3 className="text-xs font-bold tracking-[0.05em] uppercase text-muted-foreground/70">Step Inspector</h3>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40"
                    disabled={!selectedNode}
                    title="Step description"
                  >
                    <Info className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3 text-xs leading-relaxed text-muted-foreground">
                  {selectedPurpose}
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40"
                    disabled={!selectedNode}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Step Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      if (!selectedNode) return;
                      updateNodeData("enabled", !readBoolean(selectedData.enabled, true));
                    }}
                    className="gap-2"
                  >
                    <Power className={cn("w-4 h-4", readBoolean(selectedData.enabled, true) ? "text-emerald-600" : "text-muted-foreground")} />
                    <span>{readBoolean(selectedData.enabled, true) ? "Disable Step" : "Enable Step"}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={duplicateSelectedNode} className="gap-2">
                    <Copy className="w-4 h-4" />
                    <span>Duplicate</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={remapSelectedNode} className="gap-2">
                    <Wand2 className="w-4 h-4" />
                    <span>Remap Inputs</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      if (!selectedNode) return;
                      deleteNodeById(selectedNode.id);
                    }}
                    className="text-destructive focus:text-destructive gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar relative">
            {viewMode === "run" ? (
              <div className="space-y-6">
                {selectedNode ? (
                  (() => {
                    const step = runDetail?.steps?.find((s: any) => (s.nodeId || s.node_id) === selectedNode?.id);
                    const stepStatusRaw = String(step?.status || step?.step_status || nodeStatusById[selectedNode.id] || "pending").toLowerCase();
                    const nodeTypeRaw = String(step?.nodeType || step?.node_type || selectedNode?.type || "").toLowerCase();
                    const output = step?.output && typeof step.output === "object" ? step.output : {};

                    // Strip internal/model fields
                    const stripInternal = (obj: any): any => {
                      if (Array.isArray(obj)) return obj.map(stripInternal);
                      if (!obj || typeof obj !== "object") return obj;
                      const next: Record<string, any> = {};
                      for (const [k, v] of Object.entries(obj)) {
                        if (["model", "model_id", "model_name", "inference_ms", "token_count", "tokens_used", "prompt_tokens", "completion_tokens", "org_id", "run_id", "step_id", "trace_id", "span_id"].includes(k)) continue;
                        next[k] = stripInternal(v);
                      }
                      return next;
                    };
                    const safeOutput = stripInternal(output);

                    // Linked artifacts, tasks, findings for this step
                    const stepArtifacts = (runDetail?.artifacts || []).filter(
                      (a: any) => (a.workflow_step_id || a.stepId || a.step_id) === (step?.id || step?.workflow_step_id)
                    );
                    const stepTasks = (runDetail?.tasks || []).filter(
                      (t: any) => (t.workflow_step_id || t.stepId || t.step_id) === (step?.id || step?.workflow_step_id)
                    );
                    const stepFindings = (runDetail?.findings || []).filter(
                      (f: any) => (f.workflow_step_id || f.stepId || f.step_id) === (step?.id || step?.workflow_step_id)
                    );

                    // Timing helpers
                    const startedAt = step?.started_at || step?.created_at || step?.startedAt || null;
                    const completedAt = step?.completed_at || step?.completedAt || step?.updated_at || null;
                    const startMs = startedAt ? new Date(startedAt).getTime() : 0;
                    const endMs = completedAt ? new Date(completedAt).getTime() : (startMs ? Date.now() : 0);
                    const durationSec = startMs && endMs ? Math.max(0, Math.round((endMs - startMs) / 1000)) : 0;
                    const durationLabel = durationSec === 0 ? "—" : durationSec < 60 ? `${durationSec}s` : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

                    // Status display
                    const isSucceeded = stepStatusRaw === "completed" || stepStatusRaw === "succeeded";
                    const isFailed = stepStatusRaw === "failed" || stepStatusRaw === "error";
                    const isRunning = stepStatusRaw === "running";
                    const isWaiting = stepStatusRaw === "waiting";
                    const statusBg = isSucceeded ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : isFailed ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400"
                        : (isRunning || isWaiting) ? "bg-primary/10 border-primary/30 text-primary"
                          : "bg-muted/20 border-border/40 text-muted-foreground";
                    const statusIcon = isSucceeded ? <CheckCircle2 className="w-4 h-4" />
                      : isFailed ? <AlertTriangle className="w-4 h-4" />
                        : (isRunning || isWaiting) ? <RefreshCw className="w-4 h-4 animate-spin" />
                          : <Clock3 className="w-4 h-4" />;
                    const statusLabel = isSucceeded ? "Completed" : isFailed ? "Failed" : isRunning ? "Processing…" : isWaiting ? "Awaiting Review" : "Pending";

                    // Smart output fields
                    const responseText = typeof safeOutput?.response_text === "string" ? safeOutput.response_text.trim() : "";
                    const generatedDocTitle = safeOutput?.generated_doc_title || safeOutput?.generated_doc_filename || null;
                    const generatedDocId = typeof safeOutput?.generated_doc_id === "string" ? safeOutput.generated_doc_id : null;
                    const docCount = Number.isFinite(Number(safeOutput?.count)) ? Number(safeOutput.count) : null;
                    const updatedCount = Number.isFinite(Number(safeOutput?.updated_count)) ? Number(safeOutput.updated_count) : null;
                    const movedDocIds = Array.isArray(safeOutput?.doc_ids) ? safeOutput.doc_ids : [];
                    const missingReqs = Array.isArray(safeOutput?.missing_requirements) ? safeOutput.missing_requirements : [];
                    const matchedReqs = Array.isArray(safeOutput?.matched_requirements) ? safeOutput.matched_requirements : [];
                    const validateErrors = Array.isArray(safeOutput?.errors) ? safeOutput.errors : [];
                    const topLabel = typeof safeOutput?.top_label === "string" ? safeOutput.top_label : null;
                    const confidence = typeof safeOutput?.confidence === "number" ? safeOutput.confidence : null;
                    const taskId = typeof safeOutput?.task_id === "string" ? safeOutput.task_id : null;
                    const branchRoute = typeof safeOutput?.route === "string" ? safeOutput.route : null;
                    const csvRowCount = Number.isFinite(Number(safeOutput?.row_count)) ? Number(safeOutput.row_count) : null;

                    // Friendly step name
                    const friendlyName = selectedNode?.label || friendlyNodeLabel(nodeTypeRaw);

                    return (
                      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* ── Status Header ── */}
                        <div className={cn("rounded-xl border p-4 flex items-start gap-3", statusBg)}>
                          <div className="mt-0.5 shrink-0">{statusIcon}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold">{friendlyName}</div>
                            <div className="text-xs mt-0.5 opacity-80">{statusLabel} {durationLabel !== "—" && <span className="ml-1.5">· {durationLabel}</span>}</div>
                            {isWaiting && (
                              <div className="text-xs mt-1.5 font-medium">This step needs a reviewer to approve or reject before the workflow can continue.</div>
                            )}
                          </div>
                        </div>

                        {/* ── Smart Output ── */}
                        {!step?.output ? (
                          stepStatusRaw === "pending" ? (
                            <div className="p-6 rounded-xl border border-dashed border-border/60 bg-muted/5 flex flex-col items-center justify-center text-center gap-2">
                              <Clock3 className="w-6 h-6 text-muted-foreground/40" />
                              <div className="text-[11px] text-muted-foreground">This step hasn't run yet.</div>
                            </div>
                          ) : (isRunning || isWaiting) ? (
                            <div className="p-6 rounded-xl border border-primary/20 bg-primary/5 flex flex-col items-center justify-center text-center gap-2">
                              <RefreshCw className="w-6 h-6 text-primary/60 animate-spin" />
                              <div className="text-[11px] text-muted-foreground">{isWaiting ? "Waiting for reviewer action…" : "Processing… results will appear here."}</div>
                            </div>
                          ) : null
                        ) : (
                          <div className="space-y-4">
                            <label className="text-[10px] font-extrabold text-muted-foreground/60 uppercase tracking-[0.2em]">Result</label>

                            {/* AI Prompt - show generated text */}
                            {(nodeTypeRaw.includes("prompt") || (nodeTypeRaw === "ai" && responseText)) && responseText ? (
                              <div className="rounded-xl border border-border/40 bg-muted/5 overflow-hidden">
                                <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
                                  <Bot className="w-3.5 h-3.5 text-primary" />
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Generated Content</span>
                                </div>
                                <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                                  {responseText}
                                </div>
                              </div>
                            ) : null}

                            {/* Document created */}
                            {(nodeTypeRaw.includes("create_document") || generatedDocId) && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                  <FileOutput className="w-4 h-4 text-primary" />
                                  <span className="text-sm font-semibold">{generatedDocTitle || "Document Created"}</span>
                                </div>
                                {generatedDocId && (
                                  <Link
                                    href={`/documents/${generatedDocId}`}
                                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                                  >
                                    <ExternalLink className="w-3 h-3" /> Open Document
                                  </Link>
                                )}
                              </div>
                            )}

                            {/* List folder */}
                            {nodeTypeRaw.includes("list_folder") && docCount !== null && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 flex items-center gap-3">
                                <FolderClosed className="w-5 h-5 text-sky-500 shrink-0" />
                                <div>
                                  <div className="text-sm font-semibold">{docCount} document{docCount !== 1 ? "s" : ""} found</div>
                                  {safeOutput?.folder_path && (
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      in {Array.isArray(safeOutput.folder_path) ? safeOutput.folder_path.join("/") : String(safeOutput.folder_path)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Read document */}
                            {nodeTypeRaw.includes("read_document") && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 flex items-center gap-3">
                                <FileText className="w-5 h-5 text-sky-500 shrink-0" />
                                <div className="text-sm font-semibold">Document content loaded successfully</div>
                              </div>
                            )}

                            {/* Set metadata */}
                            {nodeTypeRaw.includes("set_metadata") && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 flex items-center gap-3">
                                <Tag className="w-5 h-5 text-violet-500 shrink-0" />
                                <div>
                                  <div className="text-sm font-semibold">{updatedCount != null ? `${updatedCount} document${updatedCount !== 1 ? "s" : ""} updated` : "Metadata updated"}</div>
                                  <div className="text-xs text-muted-foreground mt-0.5">Tags and properties applied successfully.</div>
                                </div>
                              </div>
                            )}

                            {/* Move document */}
                            {nodeTypeRaw.includes("move_document") && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 flex items-center gap-3">
                                <FolderClosed className="w-5 h-5 text-amber-500 shrink-0" />
                                <div>
                                  <div className="text-sm font-semibold">{movedDocIds.length > 0 ? `${movedDocIds.length} document${movedDocIds.length !== 1 ? "s" : ""} moved` : "Document moved"}</div>
                                  {safeOutput?.dest_path && <div className="text-xs text-muted-foreground mt-0.5">to {String(safeOutput.dest_path)}</div>}
                                </div>
                              </div>
                            )}

                            {/* Classify */}
                            {(nodeTypeRaw.includes("classify") && topLabel) && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Tag className="w-4 h-4 text-primary" />
                                  <span className="text-sm font-semibold">Classification: {topLabel}</span>
                                </div>
                                {confidence != null && (
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(confidence * 100)}%` }} />
                                    </div>
                                    <span className="text-[10px] font-bold text-muted-foreground">{Math.round(confidence * 100)}%</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Validate */}
                            {nodeTypeRaw.includes("validate") && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                  {safeOutput?.valid === true
                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                    : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                                  <span className="text-sm font-semibold">{safeOutput?.valid === true ? "All checks passed" : `${validateErrors.length} issue${validateErrors.length !== 1 ? "s" : ""} found`}</span>
                                </div>
                                {validateErrors.length > 0 && (
                                  <div className="space-y-1.5">
                                    {validateErrors.slice(0, 5).map((err: any, i: number) => (
                                      <div key={`ve-${i}`} className="text-xs text-rose-700 dark:text-rose-400 flex items-start gap-1.5">
                                        <span className="shrink-0 mt-0.5">•</span>
                                        <span>{String(err?.message || err?.path || "Validation issue")}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Packet check */}
                            {nodeTypeRaw.includes("packet_check") && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                  {safeOutput?.complete === true
                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                    : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                                  <span className="text-sm font-semibold">{safeOutput?.complete === true ? "Packet is complete" : "Packet incomplete"}</span>
                                </div>
                                {missingReqs.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Missing</div>
                                    {missingReqs.slice(0, 6).map((r: any, i: number) => (
                                      <div key={`mr-${i}`} className="text-xs flex items-start gap-1.5">
                                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                                        <span>{String(r?.value || r?.kind || "Missing requirement")}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {matchedReqs.length > 0 && missingReqs.length === 0 && (
                                  <div className="text-xs text-emerald-700 dark:text-emerald-400">
                                    All {matchedReqs.length} requirements matched.
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Branch / Route */}
                            {(nodeTypeRaw.includes("branch") || nodeTypeRaw.includes("route")) && branchRoute && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 flex items-center gap-3">
                                <Split className="w-5 h-5 text-violet-500 shrink-0" />
                                <div>
                                  <div className="text-sm font-semibold">Route: {branchRoute}</div>
                                  {safeOutput?.matched != null && (
                                    <div className="text-xs text-muted-foreground mt-0.5">{safeOutput.matched ? "Condition matched" : "Using default route"}</div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Export CSV */}
                            {nodeTypeRaw.includes("export_csv") && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                  <FileOutput className="w-4 h-4 text-primary" />
                                  <span className="text-sm font-semibold">CSV Export {csvRowCount != null ? `· ${csvRowCount} rows` : ""}</span>
                                </div>
                                {generatedDocId && (
                                  <Link
                                    href={`/documents/${generatedDocId}`}
                                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                                  >
                                    <ExternalLink className="w-3 h-3" /> Download CSV
                                  </Link>
                                )}
                              </div>
                            )}

                            {/* Human review step */}
                            {(nodeTypeRaw.includes("human") || nodeTypeRaw.includes("review") || nodeTypeRaw.includes("checklist")) && (
                              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-blue-500" />
                                  <span className="text-sm font-semibold">{isWaiting ? "Waiting for reviewer" : "Review step"}</span>
                                </div>
                                {taskId && <div className="text-xs text-muted-foreground">A review task has been created and assigned.</div>}
                              </div>
                            )}

                            {/* Trigger / generic fallback for completed steps with no special rendering */}
                            {(() => {
                              const hasSpecial = responseText || generatedDocId || nodeTypeRaw.includes("list_folder")
                                || nodeTypeRaw.includes("read_document") || nodeTypeRaw.includes("set_metadata")
                                || nodeTypeRaw.includes("move_document") || (nodeTypeRaw.includes("classify") && topLabel)
                                || nodeTypeRaw.includes("validate") || nodeTypeRaw.includes("packet_check")
                                || nodeTypeRaw.includes("branch") || nodeTypeRaw.includes("route")
                                || nodeTypeRaw.includes("export_csv") || nodeTypeRaw.includes("human")
                                || nodeTypeRaw.includes("review") || nodeTypeRaw.includes("checklist");
                              if (hasSpecial) return null;

                              // Show top-level summary fields (skip arrays/objects)
                              const summaryKeys = Object.entries(safeOutput)
                                .filter(([, v]) => v != null && typeof v !== "object")
                                .slice(0, 6);
                              if (summaryKeys.length === 0 && isSucceeded) {
                                return (
                                  <div className="rounded-xl border border-border/40 bg-muted/5 p-4 flex items-center gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                    <div className="text-sm font-semibold">Step completed successfully</div>
                                  </div>
                                );
                              }
                              return summaryKeys.length > 0 ? (
                                <div className="rounded-xl border border-border/40 bg-muted/5 p-4 space-y-2">
                                  {summaryKeys.map(([k, v]) => (
                                    <div key={k} className="flex items-start gap-2">
                                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider min-w-[70px] shrink-0 pt-0.5">{k.replace(/_/g, " ")}</span>
                                      <span className="text-sm">{String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        )}

                        {/* ── Linked Artifacts ── */}
                        {stepArtifacts.length > 0 && (
                          <div className="space-y-3">
                            <label className="text-[10px] font-extrabold text-muted-foreground/60 uppercase tracking-[0.2em]">Documents</label>
                            {stepArtifacts.map((artifact: any, artIdx: number) => {
                              const docId = typeof artifact?.doc_id === "string" ? artifact.doc_id : null;
                              return (
                                <div key={String(artifact?.id || `art-${artIdx}`)} className="rounded-xl border border-border/40 bg-muted/5 p-3 flex items-center gap-3">
                                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold truncate">{String(artifact?.title || artifact?.artifact_type || "Artifact")}</div>
                                    <div className="text-[10px] text-muted-foreground">{String(artifact?.artifact_type || "")}</div>
                                  </div>
                                  {docId && (
                                    <Link href={`/documents/${docId}`} className="shrink-0">
                                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] font-bold gap-1">
                                        <ExternalLink className="w-3 h-3" /> Open
                                      </Button>
                                    </Link>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Human Tasks ── */}
                        {stepTasks.length > 0 && (
                          <div className="space-y-3">
                            <label className="text-[10px] font-extrabold text-muted-foreground/60 uppercase tracking-[0.2em]">Review Tasks</label>
                            {stepTasks.map((task: any, tIdx: number) => {
                              const tId = String(task?.id || "");
                              const taskStatus = String(task?.status || "pending").toLowerCase();
                              const isOpen = taskStatus !== "completed" && taskStatus !== "done" && taskStatus !== "cancelled";
                              const isActing = completingTaskId === tId;
                              const handleDecision = async (decision: "approved" | "rejected") => {
                                if (!tId || isActing) return;
                                setCompletingTaskId(tId);
                                try {
                                  await completeWorkflowTask(tId, {
                                    decision,
                                    note: taskActionNote.trim() || undefined,
                                  });
                                  toast({
                                    title: decision === "approved" ? "Approved" : "Rejected",
                                    description: `Review task ${decision} successfully.`,
                                  });
                                  setTaskActionNote("");
                                  // Refresh run detail
                                  if (activeRunId) {
                                    try {
                                      const detail = await getWorkflowRun(activeRunId);
                                      setRunDetail(detail);
                                    } catch { }
                                  }
                                } catch (e: any) {
                                  toast({
                                    title: "Action failed",
                                    description: e?.message || "Unable to complete task.",
                                    variant: "destructive",
                                  });
                                } finally {
                                  setCompletingTaskId(null);
                                }
                              };
                              return (
                                <div key={String(task?.id || `task-${tIdx}`)} className={cn(
                                  "rounded-xl border overflow-hidden",
                                  isOpen ? "border-blue-500/30 bg-blue-500/5" : "border-border/40 bg-muted/5"
                                )}>
                                  <div className="p-3 flex items-center gap-3">
                                    {isOpen ? <Clock3 className="w-4 h-4 text-blue-500 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-semibold truncate">{String(task?.title || "Review Task")}</div>
                                      <div className="text-[10px] text-muted-foreground">{isOpen ? "Pending review" : "Completed"}</div>
                                    </div>
                                  </div>
                                  {isOpen && tId && (
                                    <div className="px-3 pb-3 space-y-2.5 border-t border-border/20 pt-2.5">
                                      <Textarea
                                        placeholder="Add a note (optional)…"
                                        className="min-h-[60px] text-xs resize-none bg-background/60 border-border/40 focus:border-primary/40"
                                        value={completingTaskId === tId ? taskActionNote : taskActionNote}
                                        onChange={(e) => setTaskActionNote(e.target.value)}
                                        disabled={isActing}
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          className="flex-1 h-8 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                          disabled={isActing}
                                          onClick={() => handleDecision("approved")}
                                        >
                                          {isActing && completingTaskId === tId ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <ThumbsUp className="w-3.5 h-3.5" />
                                          )}
                                          Approve
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="flex-1 h-8 text-xs font-bold gap-1.5 border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                                          disabled={isActing}
                                          onClick={() => handleDecision("rejected")}
                                        >
                                          {isActing && completingTaskId === tId ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <ThumbsDown className="w-3.5 h-3.5" />
                                          )}
                                          Reject
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Findings ── */}
                        {stepFindings.length > 0 && (
                          <div className="space-y-3">
                            <label className="text-[10px] font-extrabold text-muted-foreground/60 uppercase tracking-[0.2em]">Findings</label>
                            {stepFindings.map((finding: any, fIdx: number) => {
                              const result = String(finding?.result || finding?.status || "").toLowerCase();
                              const isPass = result === "pass" || result === "passed" || result === "compliant";
                              return (
                                <div key={String(finding?.id || `f-${fIdx}`)} className={cn(
                                  "rounded-xl border p-3 flex items-start gap-3",
                                  isPass ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
                                )}>
                                  {isPass ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold">{String(finding?.message || finding?.summary || "Finding")}</div>
                                    {finding?.severity && <div className="text-[10px] text-muted-foreground mt-0.5">Severity: {finding.severity}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-40 px-10 py-20 gap-4">
                    <Eye className="w-10 h-10 text-muted-foreground/50 stroke-1" />
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-widest">No Step Selected</div>
                      <p className="text-[10px] leading-relaxed">Click a step on the canvas or pipeline to see its details.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : selectedNode ? (
              <>
                <div className="space-y-5">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.2em]">Quick Setup</h4>
                    {selectedCatalog && (
                      <Badge variant="outline" className="text-[9px] font-bold py-0 px-2 h-5 bg-muted/30 border-muted-foreground/20 text-muted-foreground/80 uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                        <span>{selectedCatalog.label}</span>
                        {(() => {
                          const activeModeObj = modeOptions.find((m) => m.value === selectedMode);
                          if (activeModeObj && selectedCatalog && activeModeObj.label !== selectedCatalog.label) {
                            return (
                              <>
                                <span className="opacity-30 text-[10px] font-light">/</span>
                                <span className="text-primary/60">{activeModeObj.label}</span>
                              </>
                            );
                          }
                          return null;
                        })()}
                      </Badge>
                    )}
                  </div>

                  {modeOptions.length > 1 && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-[0.1em] px-1">Execution Mode</label>
                      <Select value={selectedMode} onValueChange={(val) => setNodeMode(val)}>
                        <SelectTrigger className="h-10 text-xs bg-muted/10 border-border/40 hover:bg-muted/20 hover:border-border/60 transition-all shadow-none">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          {modeOptions.map((mode) => (
                            <SelectItem key={mode.value} value={mode.value} className="text-xs">{mode.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="pt-2">
                    {renderModeFields()}
                  </div>
                </div>

                {hideAdvancedForSelectedNode ? null : (
                  <div className="pt-6 border-t border-border/30 space-y-5">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between group py-1"
                      onClick={() => setShowAdvanced((prev) => !prev)}
                    >
                      <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.2em] group-hover:text-foreground transition-colors">Advanced Settings</span>
                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/60 group-hover:text-foreground transition-all uppercase tracking-wider">
                        <span>{showAdvanced ? "Hide" : "Show"}</span>
                        {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </div>
                    </button>
                    {showAdvanced ? (
                      <div className="space-y-6 pt-1">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-2 px-1">
                            <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Step Inputs</label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-6 px-2 text-[10px] font-bold uppercase tracking-wider transition-all",
                                showMappingAdvanced ? "bg-primary/10 text-primary hover:bg-primary/20" : "text-muted-foreground/60 hover:text-foreground"
                              )}
                              onClick={() => setShowMappingAdvanced((prev) => !prev)}
                            >
                              {showMappingAdvanced ? "Manual Config" : "Standard"}
                            </Button>
                          </div>

                          {selectedMappingContract.expectedTargets.length > 0 ? (
                            <div className="px-1 flex flex-wrap gap-1.5">
                              {selectedMappingContract.expectedTargets.map(target => (
                                <Badge key={target} variant="secondary" className="text-[9px] font-medium bg-muted/40 border-transparent text-muted-foreground/70 tracking-tight">
                                  {target}
                                </Badge>
                              ))}
                            </div>
                          ) : null}

                          <div className="flex items-center gap-2 px-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-[11px] font-bold border-border/40 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all flex-1"
                              onClick={remapSelectedNode}
                            >
                              Auto Map
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-[11px] font-bold text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all"
                              onClick={resetSelectedNodeMappings}
                            >
                              Reset
                            </Button>
                          </div>
                          <div className="space-y-4">
                            {bindingRows.length === 0 ? (
                              <div className="text-[11px] text-muted-foreground border border-dashed border-border/40 rounded-lg p-4 text-center bg-muted/5">
                                No input mappings defined.
                              </div>
                            ) : (
                              bindingRows.map((row, index) => (
                                <div key={row.id} className="space-y-3 pb-4 border-b border-border/20 last:border-b-0 last:pb-0">
                                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                    {selectedMappingContract.enforceExpectedTargets ? (
                                      <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-tight px-1">Target</label>
                                        <Input
                                          className="h-8 text-xs bg-muted/30 border-transparent font-medium"
                                          value={row.target}
                                          readOnly
                                          aria-label="Target field (fixed)"
                                          title="Target field (fixed by this node type)"
                                        />
                                      </div>
                                    ) : (
                                      <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-tight px-1">Target</label>
                                        <Input
                                          className="h-8 text-xs border-border/40 bg-transparent focus-visible:bg-muted/10 transition-colors"
                                          value={row.target}
                                          onChange={(e) => {
                                            const next = [...bindingRows];
                                            next[index] = { ...next[index], target: e.target.value };
                                            persistBindingRows(next);
                                          }}
                                          placeholder="Target field"
                                        />
                                      </div>
                                    )}
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-tight px-1">Source Type</label>
                                      <Select
                                        value={row.source_type}
                                        onValueChange={(val) => {
                                          const nextType = val as InputBindingRow["source_type"];
                                          const next = [...bindingRows];
                                          const suggestedStepId =
                                            nextType === "step_output"
                                              ? (next[index].step_id || stepOutputSourceOptions[0]?.id || "")
                                              : next[index].step_id;
                                          next[index] = {
                                            ...next[index],
                                            source_type: nextType,
                                            step_id: suggestedStepId,
                                          };
                                          persistBindingRows(next);
                                          if (nextType === "step_output" && suggestedStepId) {
                                            setSelectedSourceNodeId(suggestedStepId);
                                            setHoveredSourceNodeId(null);
                                          } else if (nextType !== "step_output") {
                                            setSelectedSourceNodeId(null);
                                            setHoveredSourceNodeId(null);
                                          }
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-[11px] bg-transparent border-border/40 hover:bg-muted/10 transition-colors shadow-none">
                                          <SelectValue placeholder="Source" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="run_input" className="text-xs">Run Form</SelectItem>
                                          <SelectItem value="step_output" className="text-xs">Previous Step</SelectItem>
                                          <SelectItem value="constant" className="text-xs">Fixed Value</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="flex items-end pb-0.5">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
                                        onClick={() => {
                                          let next: InputBindingRow[];
                                          if (selectedMappingContract.enforceExpectedTargets) {
                                            next = [...bindingRows];
                                            next[index] = {
                                              ...next[index],
                                              source_type: "run_input",
                                              source_path: "",
                                              step_id: "",
                                              value: "",
                                            };
                                          } else {
                                            next = bindingRows.filter((_, rowIndex) => rowIndex !== index);
                                          }
                                          persistBindingRows(next);
                                        }}
                                        title={selectedMappingContract.enforceExpectedTargets ? "Clear mapping" : "Remove mapping"}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="px-1 flex items-center gap-2 group/summary">
                                    <div className="h-[1px] flex-1 bg-border/20 group-hover/summary:bg-border/40 transition-colors" />
                                    <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest whitespace-nowrap bg-background px-2 py-0.5 rounded-full border border-border/10">
                                      {row.target || "field"}
                                      <span className="mx-1 text-primary/40 text-[11px]">←</span>
                                      {row.source_type === "run_input"
                                        ? (row.source_path
                                          ? `run.${row.source_path}`
                                          : "run input")
                                        : row.source_type === "step_output"
                                          ? (row.step_id
                                            ? `${nodeDisplayNameById[row.step_id] || row.step_id}${row.source_path ? `.${row.source_path}` : ".output"}`
                                            : "previous output")
                                          : (row.value ? `fixed: ${row.value}` : "fixed")}
                                    </div>
                                    <div className="h-[1px] flex-1 bg-border/20 group-hover/summary:bg-border/40 transition-colors" />
                                  </div>

                                  {row.source_type === "step_output" ? (
                                    <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                      <div className="grid grid-cols-[1fr_auto] gap-2">
                                        <Select
                                          value={row.step_id}
                                          onOpenChange={(open) => {
                                            if (open) setSelectedSourceNodeId(row.step_id || null);
                                            setHoveredSourceNodeId(null);
                                          }}
                                          onValueChange={(val) => {
                                            const next = [...bindingRows];
                                            next[index] = { ...next[index], step_id: val };
                                            persistBindingRows(next);
                                            setSelectedSourceNodeId(val || null);
                                            setHoveredSourceNodeId(null);
                                          }}
                                        >
                                          <SelectTrigger className="h-8 text-[11px] bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors">
                                            <SelectValue placeholder={stepOutputSourceOptions.length > 0 ? "Select step" : "No steps"} />
                                          </SelectTrigger>
                                          <SelectContent onPointerLeave={() => setHoveredSourceNodeId(null)}>
                                            {stepOutputSourceOptions.map((option) => (
                                              <SelectItem
                                                key={option.id}
                                                value={option.id}
                                                className="text-xs"
                                                onPointerMove={() => setHoveredSourceNodeId(option.id)}
                                                onMouseMove={() => setHoveredSourceNodeId(option.id)}
                                                onFocus={() => setHoveredSourceNodeId(option.id)}
                                              >
                                                {option.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-8 px-3 text-[10px] font-bold border-border/40 hover:bg-muted/10"
                                          disabled={!row.step_id}
                                          onClick={() => focusSourceNode(row.step_id)}
                                        >
                                          Locate
                                        </Button>
                                      </div>
                                      {showMappingAdvanced ? (
                                        <Input
                                          className="h-8 text-xs font-mono border-border/40 bg-transparent"
                                          value={row.source_path}
                                          onChange={(e) => {
                                            const next = [...bindingRows];
                                            next[index] = { ...next[index], source_path: e.target.value };
                                            persistBindingRows(next);
                                          }}
                                          placeholder="Output path (e.g. data.id)"
                                        />
                                      ) : null}
                                    </div>
                                  ) : null}

                                  {row.source_type === "run_input" ? (
                                    <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                      <Select
                                        value={
                                          runInputFieldOptions.includes(normalizeRunInputField(row.source_path))
                                            ? normalizeRunInputField(row.source_path)
                                            : "__custom__"
                                        }
                                        onValueChange={(val) => {
                                          if (val === "__custom__") return;
                                          const next = [...bindingRows];
                                          next[index] = { ...next[index], source_path: val };
                                          persistBindingRows(next);
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-[11px] bg-muted/5 border-border/40 hover:bg-muted/10 transition-colors">
                                          <SelectValue placeholder="Select run field" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {runInputFieldOptions.map((option) => (
                                            <SelectItem key={option} value={option} className="text-xs">
                                              {option}
                                            </SelectItem>
                                          ))}
                                          <SelectItem value="__custom__" className="text-xs font-medium text-primary">Custom field...</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      {showMappingAdvanced ? (
                                        <Input
                                          className="h-8 text-xs font-mono border-border/40 bg-transparent"
                                          value={row.source_path}
                                          onChange={(e) => {
                                            const next = [...bindingRows];
                                            next[index] = { ...next[index], source_path: e.target.value };
                                            persistBindingRows(next);
                                          }}
                                          placeholder="Custom run field path"
                                        />
                                      ) : null}
                                    </div>
                                  ) : null}

                                  {row.source_type === "constant" ? (
                                    <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                      <Input
                                        className="h-8 text-xs border-border/40 bg-transparent focus-visible:bg-muted/10 transition-colors"
                                        value={row.value}
                                        onChange={(e) => {
                                          const next = [...bindingRows];
                                          next[index] = { ...next[index], value: e.target.value };
                                          persistBindingRows(next);
                                        }}
                                        placeholder="Ex: fixed_value or 100"
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>

                          <div className="pt-2 px-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 w-full text-xs font-bold border-border/40 hover:bg-primary/5 hover:text-primary hover:border-primary/40 transition-all gap-2"
                              disabled={!canAddMapping}
                              onClick={() => {
                                if (!canAddMapping) return;
                                const nextIndex = bindingRows.length + 1;
                                const usedTargets = new Set(bindingRows.map((row) => row.target));
                                const suggestedTarget =
                                  selectedMappingContract.expectedTargets.find((target) => !usedTargets.has(target))
                                  || `field_${nextIndex}`;
                                const nextRow: InputBindingRow = {
                                  id: `binding_${Date.now()}`,
                                  target: suggestedTarget,
                                  source_type: "run_input",
                                  source_path: "",
                                  step_id: "",
                                  value: "",
                                };
                                const next = [
                                  ...bindingRows,
                                  nextRow,
                                ];
                                persistBindingRows(next);
                              }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Mapping
                            </Button>
                            {!canAddMapping ? (
                              <p className="text-[10px] text-muted-foreground/60 mt-3 text-center italic">
                                Maximum mappings reached for this step type.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-4 opacity-70 animate-in fade-in duration-500">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center border border-border/40 shadow-sm">
                  <MousePointer2 className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-sm font-bold tracking-tight">Step Inspector</h4>
                  <p className="text-xs text-muted-foreground/60 max-w-[200px] leading-relaxed">
                    Select any step on the canvas to configure its settings and inputs.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      <FinderPicker
        open={pickerState.open}
        onOpenChange={(open) => {
          setPickerState((prev) => ({
            ...prev,
            open,
            target: open ? prev.target : null,
          }));
        }}
        mode={pickerState.mode}
        maxDocs={pickerState.maxDocs}
        initialPath={pickerState.initialPath}
        initialSelectedDocIds={pickerState.initialSelectedDocIds}
        onConfirm={handlePickerConfirm}
      />

      <Dialog open={showPreRunDialog} onOpenChange={setShowPreRunDialog}>
        <DialogContent className="max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Resolve Run Blockers</DialogTitle>
            <DialogDescription>
              {preRunSetupIssues.length === 0
                ? "All steps look ready."
                : `Found ${preRunSetupIssues.length} step${preRunSetupIssues.length === 1 ? "" : "s"} with setup blockers that must be fixed before run.`}
            </DialogDescription>
          </DialogHeader>

          {preRunSetupIssues.length === 0 ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
              No setup blockers detected.
            </div>
          ) : (
            <div className="max-h-[360px] overflow-auto rounded-md border border-border/60">
              {preRunSetupIssues.map((issue) => (
                <div key={issue.nodeId} className="px-3 py-2 border-b border-border/50 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{issue.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{issue.type}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setSelectedNodeId(issue.nodeId);
                        setShowPreRunDialog(false);
                      }}
                    >
                      Open Step
                    </Button>
                  </div>
                  {issue.setupMissing.length > 0 ? (
                    <div className="text-[12px] text-rose-700 mt-1">
                      Needs setup: {issue.setupMissing.join(" · ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => remapAllNodes(false)}
              className="h-8 text-xs"
              disabled={isSaving || isRunning}
            >
              Auto-Fix With Remap
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowPreRunDialog(false)}
              className="h-8 text-xs"
              disabled={isSaving || isRunning}
            >
              Fix Before Run
            </Button>
            <Button
              onClick={() => setShowPreRunDialog(false)}
              className="h-8 text-xs"
              disabled={isSaving || isRunning}
            >
              Continue Editing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SidebarBlockItem({
  icon,
  label,
  type,
  onAdd,
}: {
  icon: React.ReactNode;
  label: string;
  type: string;
  onAdd?: () => void;
}) {
  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData("application/reactflow", type);
    event.dataTransfer.setData("application/label", label);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 cursor-grab active:cursor-grabbing group transition-all duration-200 border border-transparent hover:border-border/50 shadow-none hover:shadow-sm select-none"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center border border-border group-hover:border-primary/20 shadow-none transition-colors pointer-events-none">
          {icon}
        </div>
        <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors pointer-events-none">{label}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onAdd?.();
        }}
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
      </Button>
    </div>
  );
}
