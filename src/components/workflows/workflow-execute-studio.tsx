"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FinderPicker } from "@/components/pickers/finder-picker";
import { WorkflowRunGraph } from "@/components/workflows/workflow-run-graph";
import { WorkflowRunStepDetail } from "@/components/workflows/workflow-run-step-detail";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, getApiContext } from "@/lib/api";
import { buildDefinitionGraph, buildLiveRunGraph, detectCurrentStepId, friendlyNodeLabel } from "@/lib/workflow-view-model";
import type { StoredDocument } from "@/lib/types";
import {
  completeWorkflowTask,
  getWorkflowRun,
  getWorkflowTemplateDefinition,
  listWorkflowTemplates,
  runWorkflowManual,
  type WorkflowTemplate,
} from "@/lib/workflow-api";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Clock3,
  Eye,
  FileText,
  FolderOpen,
  Play,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

type DocItem = {
  id: string;
  filename: string;
  folderPath: string[];
};

type StudioState = "setup" | "running" | "results" | "review";
type RulesTab = "issues" | "all";
type RequirementKind = "doc" | "doc_list" | "text" | "folder";
type InputRequirement = {
  key: string;
  label: string;
  kind: RequirementKind;
  nodeId: string;
  nodeType: string;
};

function normalizeFolderPath(row: any): string[] {
  if (Array.isArray(row?.folderPath)) return row.folderPath;
  if (Array.isArray(row?.folder_path)) return row.folder_path;
  if (typeof row?.folderPath === "string") return row.folderPath.split("/").filter(Boolean);
  if (typeof row?.folder_path === "string") return row.folder_path.split("/").filter(Boolean);
  return [];
}

function normalizeFolderValue(value: any): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split("/").map((item) => item.trim()).filter(Boolean);
  return [];
}

function formatFolderPath(path: string[]): string {
  if (!Array.isArray(path) || path.length === 0) return "/";
  return `/${path.join("/")}`;
}

function trimMiddle(value: string, max = 54) {
  if (!value) return "";
  if (value.length <= max) return value;
  const keep = Math.max(8, Math.floor((max - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

function detectCaseFolder(doc: DocItem | null, fallbackDocs: DocItem[]) {
  const source = doc || fallbackDocs[0] || null;
  if (!source) return "";
  const p = source.folderPath;
  const idx = p.findIndex((seg) => /^CASE-\d{3}_/i.test(seg));
  if (idx >= 0) return p.slice(0, idx + 1).join("/");
  return p.join("/");
}

function formatRunLabel(iso: string | null | undefined): string {
  if (!iso) return "Run";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "Run";
  const formatted = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
  return `Run • ${formatted}`;
}

function businessStepLabel(nodeTypeRaw: string): string {
  const nodeType = String(nodeTypeRaw || "").toLowerCase();
  if (nodeType === "manual.trigger") return "Manual Start";
  if (nodeType === "ai.parse_ruleset") return "Read Ruleset";
  if (nodeType === "ai.extract_facts") return "Read Project Documents";
  if (nodeType === "system.evaluate") return "Evaluate Compliance";
  if (nodeType === "ai.generate_report") return "Generate Report";
  if (nodeType.startsWith("human.")) return "Reviewer Sign-off";
  return friendlyNodeLabel(nodeType) || "Workflow Step";
}

function runningLine(nodeTypeRaw: string, subjectCount: number): string {
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

function formatOutputValue(value: any): string {
  if (value == null) return "n/a";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => formatOutputValue(item)).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function compactJsonRows(obj: Record<string, any> | null | undefined, maxItems = 10): Array<{ key: string; value: string }> {
  if (!obj || typeof obj !== "object") return [];
  const safeObj = stripModelFields(obj);
  const rows: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(safeObj)) {
    if (rows.length >= maxItems) break;
    const label = formatOutputValue(value);
    rows.push({ key, value: label.length > 180 ? `${label.slice(0, 177)}...` : label });
  }
  return rows;
}

function normalizeFindingResult(value: any): "pass" | "fail" | "unknown" {
  const key = String(value || "").toLowerCase();
  if (key === "pass" || key === "passed" || key === "succeeded") return "pass";
  if (key === "fail" || key === "failed" || key === "error") return "fail";
  return "unknown";
}

function normalizeTemplateNodeType(node: any): string {
  const refKey = node?.node_ref && typeof node.node_ref === "object"
    ? String(node.node_ref.key || "")
    : (node?.nodeRef && typeof node.nodeRef === "object" ? String(node.nodeRef.key || "") : "");
  const raw = refKey || String(node?.node_type || node?.type || "");
  return raw.toLowerCase().trim();
}

function isTriggerNodeType(nodeTypeRaw: string): boolean {
  const nodeType = String(nodeTypeRaw || "").trim().toLowerCase();
  return nodeType === "manual.trigger" || nodeType === "chat.trigger";
}

function extractInputKeyFromTriggerStepPath(pathValue: string, nodeById: Map<string, any>): string | null {
  const raw = String(pathValue || "").trim();
  const match = raw.match(/^\$\.steps\.([A-Za-z0-9_-]+)\.output\.(.+)$/);
  if (!match) return null;
  const sourceNodeId = String(match[1] || "").trim();
  const sourceFieldPath = String(match[2] || "").trim();
  if (!sourceNodeId || !sourceFieldPath) return null;
  const sourceNode = nodeById.get(sourceNodeId);
  const sourceNodeType = normalizeTemplateNodeType(sourceNode);
  if (!isTriggerNodeType(sourceNodeType)) return null;
  const key = sourceFieldPath.split(".")[0]?.trim();
  return key || null;
}

function extractInputKeyFromPath(pathValue: string, nodeById: Map<string, any> = new Map()): string | null {
  const raw = String(pathValue || "").trim();
  if (raw.startsWith("$.input.")) {
    const remainder = raw.slice("$.input.".length).trim();
    if (!remainder) return null;
    const key = remainder.split(".")[0]?.trim();
    return key || null;
  }
  if (raw.startsWith("$.steps.")) {
    return extractInputKeyFromTriggerStepPath(raw, nodeById);
  }
  return null;
}

function parseIndexedInputKey(rawKey: string): { baseKey: string; index: number | null } {
  const normalized = String(rawKey || "").trim();
  const match = normalized.match(/^([A-Za-z0-9_]+)\[(\d+)\]$/);
  if (!match) return { baseKey: normalized, index: null };
  return {
    baseKey: String(match[1] || "").trim(),
    index: Number(match[2]),
  };
}

function inferRequirementMeta(rawKey: string): { key: string; label: string; kind: RequirementKind } {
  const normalized = String(rawKey || "").trim();
  const parsed = parseIndexedInputKey(normalized);
  const lower = normalized.toLowerCase();
  const lowerBase = parsed.baseKey.toLowerCase();

  const camelBase = parsed.baseKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const camelLowerBase = camelBase.toLowerCase();

  if (lowerBase === "folder_path" || lowerBase === "folderpath" || camelLowerBase === "folderpath" || camelLowerBase === "folderpath") {
    return { key: "folder_path", label: "Source Folder", kind: "folder" };
  }
  if (lowerBase === "ruleset_doc_id" || lowerBase === "rulesetdocid" || camelLowerBase === "rulesetdocid") {
    return { key: "ruleset_doc_id", label: "Ruleset Document", kind: "doc" };
  }
  if (lowerBase === "doc_id" || lowerBase === "docid" || camelLowerBase === "docid") {
    return { key: "doc_id", label: "Source Document", kind: "doc" };
  }
  if (
    lowerBase === "doc_ids"
    || lowerBase === "supporting_doc_ids"
    || lowerBase === "subject_packet_doc_ids"
    || lowerBase === "supportingdocids"
    || lowerBase === "subjectpacketdocids"
    || camelLowerBase === "docids"
    || camelLowerBase === "supportingdocids"
    || camelLowerBase === "subjectpacketdocids"
  ) {
    if (parsed.index != null) {
      return {
        key: normalized,
        label: `Project Document ${parsed.index + 1}`,
        kind: "doc",
      };
    }
    return { key: "doc_ids", label: "Source Documents", kind: "doc_list" };
  }
  if ((lowerBase.includes("doc") && lowerBase.endsWith("_id")) || (camelLowerBase.includes("doc") && camelLowerBase.endsWith("id"))) {
    return { key: parsed.baseKey, label: parsed.baseKey, kind: "doc" };
  }
  if ((lowerBase.includes("doc") && lowerBase.endsWith("_ids")) || (camelLowerBase.includes("doc") && camelLowerBase.endsWith("ids"))) {
    if (parsed.index != null) {
      return {
        key: normalized,
        label: `${parsed.baseKey} #${parsed.index + 1}`,
        kind: "doc",
      };
    }
    return { key: parsed.baseKey, label: parsed.baseKey, kind: "doc_list" };
  }
  if (lowerBase.includes("folder") || lowerBase.endsWith("_path") || camelLowerBase.includes("folder") || camelLowerBase.endsWith("path")) {
    return { key: "folder_path", label: "Source Folder", kind: "folder" };
  }
  if (lower.includes("prompt") || lower.includes("text") || lower.includes("content")) {
    if (lower === "content") return { key: "content", label: "Document Content", kind: "text" };
    if (lower === "prompt") return { key: "prompt", label: "Prompt", kind: "text" };
    return { key: normalized, label: normalized, kind: "text" };
  }
  return { key: normalized, label: normalized, kind: "text" };
}

function hasNonEmptyValue(value: any): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function resolveGeneratedRequirementValue(input: Record<string, any>, requirementKey: string): any {
  if (!input || typeof input !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(input, requirementKey)) {
    return (input as any)[requirementKey];
  }

  const parsed = parseIndexedInputKey(requirementKey);
  const baseValue = Object.prototype.hasOwnProperty.call(input, parsed.baseKey)
    ? (input as any)[parsed.baseKey]
    : undefined;

  if (parsed.index != null) {
    if (Array.isArray(baseValue)) return baseValue[parsed.index];
    if (Array.isArray((input as any).doc_ids)) return (input as any).doc_ids[parsed.index];
    if (Array.isArray((input as any).supporting_doc_ids)) return (input as any).supporting_doc_ids[parsed.index];
    if (Array.isArray((input as any).subject_packet_doc_ids)) return (input as any).subject_packet_doc_ids[parsed.index];
    return undefined;
  }

  return baseValue;
}

function toDocItem(doc: StoredDocument): DocItem {
  const folderPathRaw = (doc.folderPath || (doc as any).folder_path || []) as string[] | string;
  const folderPath = Array.isArray(folderPathRaw)
    ? folderPathRaw.filter(Boolean)
    : (typeof folderPathRaw === "string" ? folderPathRaw.split("/").map((v) => v.trim()).filter(Boolean) : []);
  return {
    id: String(doc.id),
    filename: String(doc.filename || doc.title || doc.name || "Untitled"),
    folderPath,
  };
}

const BRIEFLY_LOCAL_ORG_ID = "5f4fa858-8ba2-4f46-988b-58ac0b2a948d";

type WorkflowExecuteStudioProps = {
  embedded?: boolean;
  initialTemplateId?: string | null;
  onOpenRunDetail?: (runId: string) => void;
};

export function WorkflowExecuteStudio({
  embedded = false,
  initialTemplateId = null,
  onOpenRunDetail,
}: WorkflowExecuteStudioProps) {
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [templates, setTemplates] = React.useState<WorkflowTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("");
  const [selectedTemplateType, setSelectedTemplateType] = React.useState<string>("");
  const [selectedTemplateDefinition, setSelectedTemplateDefinition] = React.useState<Record<string, any> | null>(null);
  const [docs, setDocs] = React.useState<DocItem[]>([]);
  const [rulesetDoc, setRulesetDoc] = React.useState<DocItem | null>(null);
  const [subjectDocs, setSubjectDocs] = React.useState<DocItem[]>([]);
  const [selectedFolderPath, setSelectedFolderPath] = React.useState<string[]>([]);
  const [runInputFields, setRunInputFields] = React.useState<Record<string, string>>({});
  const [extraInputJson, setExtraInputJson] = React.useState("{}");
  const [extraContextJson, setExtraContextJson] = React.useState('{"source":"workflow-run-studio"}');
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [rulesetPickerOpen, setRulesetPickerOpen] = React.useState(false);
  const [subjectPickerOpen, setSubjectPickerOpen] = React.useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = React.useState(false);
  const [stepInspectorOpen, setStepInspectorOpen] = React.useState(false);
  const [rulesTab, setRulesTab] = React.useState<RulesTab>("issues");

  const [orgUsers, setOrgUsers] = React.useState<Array<{ id: string; label: string; role: string }>>([]);
  const [liveRunId, setLiveRunId] = React.useState("");
  const [liveRunDetail, setLiveRunDetail] = React.useState<any>(null);
  const [selectedLiveStepId, setSelectedLiveStepId] = React.useState<string | null>(null);
  const [selectedDefinitionNodeId, setSelectedDefinitionNodeId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const [selectedTaskId, setSelectedTaskId] = React.useState("");
  const [signoffDecision, setSignoffDecision] = React.useState<"approved" | "rejected">("approved");
  const [signoffNote, setSignoffNote] = React.useState("");
  const [waiveUnknowns, setWaiveUnknowns] = React.useState(false);
  const [waiverReason, setWaiverReason] = React.useState("");
  const [escalateToLegal, setEscalateToLegal] = React.useState(false);
  const [reviewOptionsOpen, setReviewOptionsOpen] = React.useState(false);
  const [signoffError, setSignoffError] = React.useState("");
  const [taskActing, setTaskActing] = React.useState(false);

  const pollTimerRef = React.useRef<number | null>(null);
  const runFetchSeqRef = React.useRef(0);
  const runAppliedSeqRef = React.useRef(0);

  const loadInitial = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const orgId = getApiContext().orgId || BRIEFLY_LOCAL_ORG_ID;
      const [tplRes, docsRes, usersRes] = await Promise.all([
        listWorkflowTemplates(true),
        apiFetch<any>(`/orgs/${orgId}/documents`, { skipCache: true }),
        apiFetch<any[]>(`/orgs/${orgId}/users`, { skipCache: true }).catch(() => []),
      ]);

      const list = Array.isArray(docsRes) ? docsRes : (Array.isArray(docsRes?.items) ? docsRes.items : []);
      const normalizedDocs: DocItem[] = list.map((row: any) => ({
        id: String(row.id),
        filename: String(row?.filename || row?.title || row?.name || ""),
        folderPath: normalizeFolderPath(row),
      }));
      const allFiles = normalizedDocs.filter((d, index) => {
        const row = list[index] || {};
        return String(row?.type || "").toLowerCase() !== "folder";
      });

      setTemplates(tplRes.templates || []);
      setDocs(allFiles);
      setOrgUsers((usersRes || []).map((u: any) => ({
        id: String(u?.userId || u?.id || ""),
        role: String(u?.role || "member"),
        label: String(u?.displayName || u?.username || u?.email || u?.userId || "user"),
      })).filter((u) => u.id));

      if (Array.isArray(tplRes.templates) && tplRes.templates.length > 0) {
        const requestedTemplateId = String(initialTemplateId || "").trim();
        const requested = requestedTemplateId
          ? tplRes.templates.find((tpl) => String(tpl.id) === requestedTemplateId)
          : null;
        const defaultTpl = requested
          || tplRes.templates.find((t) => String(t.name || "").toLowerCase().includes("compliance"))
          || tplRes.templates[0];
        setSelectedTemplateId(defaultTpl.id);
      }
    } catch (e: any) {
      toast({
        title: "Failed to load run studio",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  React.useEffect(() => {
    if (!selectedTemplateId) return;
    setRunInputFields({});
    setSelectedFolderPath([]);
    setRulesetDoc(null);
    setSubjectDocs([]);
    setLiveRunId("");
    setLiveRunDetail(null);
    void (async () => {
      try {
        const def = await getWorkflowTemplateDefinition(selectedTemplateId);
        setSelectedTemplateType(String(def?.version?.definition?.type || ""));
        const definition = def?.version?.definition && typeof def.version.definition === "object"
          ? def.version.definition
          : null;
        setSelectedTemplateDefinition(definition);
        const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
        if (nodes.length === 0) {
          setSelectedDefinitionNodeId(null);
        }
      } catch {
        setSelectedTemplateType("");
        setSelectedTemplateDefinition(null);
        setSelectedDefinitionNodeId(null);
      }
    })();
  }, [selectedTemplateId]);

  React.useEffect(() => {
    const nextTemplateId = String(initialTemplateId || "").trim();
    if (!nextTemplateId) return;
    if (nextTemplateId === selectedTemplateId) return;
    if (templates.length > 0 && !templates.some((tpl) => String(tpl.id) === nextTemplateId)) return;
    setSelectedTemplateId(nextTemplateId);
  }, [initialTemplateId, selectedTemplateId, templates]);

  const docLabelById = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const doc of docs) {
      map[doc.id] = doc.filename || doc.id;
    }
    return map;
  }, [docs]);

  const labelForDoc = React.useCallback((docId: string | null) => {
    if (!docId) return "N/A";
    return docLabelById[docId] || docId;
  }, [docLabelById]);

  const isComplianceTemplate = selectedTemplateType.toLowerCase() === "compliance.assessment";
  const templateGraphMeta = React.useMemo(() => {
    const nodes = Array.isArray(selectedTemplateDefinition?.nodes) ? selectedTemplateDefinition.nodes : [];
    const edges = Array.isArray(selectedTemplateDefinition?.edges) ? selectedTemplateDefinition.edges : [];
    const nodeTypeById = new Map<string, string>();
    const nodeById = new Map<string, any>();
    const incomingByNodeId = new Map<string, string[]>();

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const nodeId = String(node?.id || `step_${index + 1}`);
      nodeById.set(nodeId, node);
      nodeTypeById.set(nodeId, normalizeTemplateNodeType(node));
      incomingByNodeId.set(nodeId, []);
    }

    for (const edge of edges) {
      const from = String((edge as any)?.from || "").trim();
      const to = String((edge as any)?.to || "").trim();
      if (!from || !to || from === to) continue;
      if (!incomingByNodeId.has(to) || !nodeTypeById.has(from)) continue;
      incomingByNodeId.get(to)?.push(from);
    }

    return {
      nodes,
      nodeById,
      nodeTypeById,
      incomingByNodeId,
    };
  }, [selectedTemplateDefinition?.edges, selectedTemplateDefinition?.nodes]);

  const packetCanUseFolderListing = React.useCallback((nodeId: string, fallbackIndex: number) => {
    const incoming = templateGraphMeta.incomingByNodeId.get(nodeId) || [];
    if (incoming.some((sourceId) => templateGraphMeta.nodeTypeById.get(sourceId) === "dms.list_folder")) {
      return true;
    }
    if (incoming.length === 0 && fallbackIndex > 0) {
      const prevNode = templateGraphMeta.nodes[fallbackIndex - 1];
      if (normalizeTemplateNodeType(prevNode) === "dms.list_folder") return true;
    }
    return false;
  }, [templateGraphMeta.incomingByNodeId, templateGraphMeta.nodeTypeById, templateGraphMeta.nodes]);

  const templateRequirements = React.useMemo<InputRequirement[]>(() => {
    const requirementMap = new Map<string, InputRequirement>();
    const addRequirement = (rawKey: string, nodeId: string, nodeType: string) => {
      const meta = inferRequirementMeta(rawKey);
      const id = `${meta.key}:${meta.kind}`;
      if (requirementMap.has(id)) return;
      requirementMap.set(id, {
        key: meta.key,
        label: meta.label,
        kind: meta.kind,
        nodeId,
        nodeType,
      });
    };

    if (isComplianceTemplate) {
      addRequirement("ruleset_doc_id", "parse_ruleset", "ai.parse_ruleset");
      addRequirement("doc_ids", "extract_facts", "ai.extract_facts");
    }

    const nodes = templateGraphMeta.nodes;
    const docRequiredNodeTypes = new Set([
      "dms.read_document",
      "dms.set_metadata",
      "dms.move_document",
      "system.packet_check",
      "ai.extract_facts",
      "system.evaluate",
      "ai.generate_report",
    ]);
    const folderRequiredNodeTypes = new Set([
      "dms.list_folder",
    ]);

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const nodeId = String(node?.id || "step");
      const nodeType = normalizeTemplateNodeType(node);
      const config = node?.config && typeof node.config === "object" ? node.config : {};
      const inputBindings = node?.input_bindings && typeof node.input_bindings === "object"
        ? node.input_bindings
        : {};
      const bindingEntries = Object.entries(inputBindings);

      let hasRulesetFromInput = false;
      let hasRulesetFromSteps = false;
      let hasDocsFromInput = false;
      let hasDocsFromSteps = false;
      let hasTextBinding = false;
      let hasContentFromInput = false;
      let hasContentFromSteps = false;
      let hasFolderFromInput = false;
      let hasFolderFromSteps = false;

      for (const [fieldKey, fieldPathRaw] of bindingEntries) {
        const fieldPath = String(fieldPathRaw || "").trim();
        if (!fieldPath) continue;
        const inputKey = extractInputKeyFromPath(fieldPath, templateGraphMeta.nodeById);
        if (inputKey) addRequirement(inputKey, nodeId, nodeType);
        const isTriggerInputBinding = Boolean(extractInputKeyFromTriggerStepPath(fieldPath, templateGraphMeta.nodeById));

        const field = String(fieldKey || "").toLowerCase();
        const path = fieldPath.toLowerCase();
        const referencesDocs = field.includes("doc") || path.includes("doc");
        const referencesRuleset = field.includes("ruleset") || path.includes("ruleset");
        const referencesText = field.includes("text") || field.includes("prompt") || field.includes("content");
        const referencesContent = field === "content" || field === "text" || field === "markdown" || path.endsWith(".content") || path.endsWith(".text") || path.endsWith(".markdown");
        const referencesFolder = field.includes("folder_path") || field.includes("folderpath") || path.includes("folder_path") || path.includes("folderpath");

        if (path.startsWith("$.input.")) {
          if (referencesDocs) hasDocsFromInput = true;
          if (referencesRuleset) hasRulesetFromInput = true;
          if (referencesText) hasTextBinding = true;
          if (referencesContent) hasContentFromInput = true;
          if (referencesFolder) hasFolderFromInput = true;
        }
        if (path.startsWith("$.steps.")) {
          if (referencesDocs) {
            if (isTriggerInputBinding) hasDocsFromInput = true;
            else hasDocsFromSteps = true;
          }
          if (referencesRuleset) {
            if (isTriggerInputBinding) hasRulesetFromInput = true;
            else hasRulesetFromSteps = true;
          }
          if (referencesText) hasTextBinding = true;
          if (referencesContent) {
            if (isTriggerInputBinding) hasContentFromInput = true;
            else hasContentFromSteps = true;
          }
          if (referencesFolder) {
            if (isTriggerInputBinding) hasFolderFromInput = true;
            else hasFolderFromSteps = true;
          }
        }
      }

      const hasStaticRuleset =
        (typeof config?.ruleset_doc_id === "string" && String(config.ruleset_doc_id).trim().length > 0)
        || (typeof config?.rulesetDocId === "string" && String(config.rulesetDocId).trim().length > 0);
      const hasStaticDocs =
        (typeof config?.doc_id === "string" && String(config.doc_id).trim().length > 0)
        || (typeof config?.docId === "string" && String(config.docId).trim().length > 0)
        || (Array.isArray(config?.doc_ids) && config.doc_ids.length > 0)
        || (Array.isArray(config?.supporting_doc_ids) && config.supporting_doc_ids.length > 0);
      const hasStaticContent = typeof config?.content === "string"
        ? String(config.content).trim().length > 0
        : Boolean(config?.content);
      const hasStaticFolder = normalizeFolderValue(config?.folder_path).length > 0
        || normalizeFolderValue(config?.folderPath).length > 0;

      if (nodeType === "ai.parse_ruleset" && !hasStaticRuleset && !hasRulesetFromInput && !hasRulesetFromSteps) {
        addRequirement("ruleset_doc_id", nodeId, nodeType);
      }
      const packetHasFolderDocSource = nodeType === "system.packet_check" && packetCanUseFolderListing(nodeId, index);
      if (docRequiredNodeTypes.has(nodeType) && !hasStaticDocs && !hasDocsFromInput && !hasDocsFromSteps && !packetHasFolderDocSource) {
        addRequirement("doc_ids", nodeId, nodeType);
      }
      if (folderRequiredNodeTypes.has(nodeType) && !hasStaticFolder && !hasFolderFromInput && !hasFolderFromSteps) {
        addRequirement("folder_path", nodeId, nodeType);
      }
      if ((nodeType === "ai.extract" || nodeType === "ai.classify") && !hasStaticDocs && !hasDocsFromInput && !hasDocsFromSteps && !hasTextBinding) {
        addRequirement("doc_ids", nodeId, nodeType);
      }
      const hasImplicitPreviousStepOutput = index > 0;
      if (nodeType === "dms.create_document" && !hasStaticContent && !hasContentFromInput && !hasContentFromSteps && !hasImplicitPreviousStepOutput) {
        addRequirement("content", nodeId, nodeType);
      }
    }

    return Array.from(requirementMap.values());
  }, [isComplianceTemplate, packetCanUseFolderListing, templateGraphMeta.nodeById, templateGraphMeta.nodes]);

  const templateInputNeeds = React.useMemo(() => {
    if (isComplianceTemplate) return { needsRuleset: true, needsSubjectDocs: true, needsFolder: false };
    const nodes = templateGraphMeta.nodes;
    let needsRuleset = false;
    let needsSubjectDocs = false;
    let needsFolder = false;
    const docRequiredNodeTypes = new Set([
      "dms.read_document",
      "dms.set_metadata",
      "dms.move_document",
      "system.packet_check",
      "ai.extract_facts",
      "system.evaluate",
      "ai.generate_report",
    ]);
    const folderRequiredNodeTypes = new Set([
      "dms.list_folder",
    ]);

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const nodeId = String(node?.id || `step_${index + 1}`);
      const nodeType = normalizeTemplateNodeType(node);
      const config = node?.config && typeof node.config === "object" ? node.config : {};

      const inputBindings = node?.input_bindings && typeof node.input_bindings === "object"
        ? node.input_bindings
        : {};
      const bindingPaths = Object.values(inputBindings)
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const bindingValues = bindingPaths
        .map((value) => value.toLowerCase())
        .filter(Boolean);
      const stepBindingPaths = bindingPaths.filter((value) => value.toLowerCase().startsWith("$.steps."));
      const triggerInputKeys = stepBindingPaths
        .map((value) => extractInputKeyFromTriggerStepPath(value, templateGraphMeta.nodeById))
        .filter(Boolean) as string[];
      const triggerInputKeyTexts = triggerInputKeys.map((value) => String(value || "").toLowerCase());

      const usesRulesetFromInput = bindingValues.some((text) => {
        if (!text.includes("$.input.")) return false;
        return text.includes("ruleset_doc_id") || text.includes("rulesetdocid");
      }) || triggerInputKeyTexts.some((text) => text.includes("ruleset"));
      const usesDocIdsFromInput = bindingValues.some((text) => {
        if (!text.includes("$.input.")) return false;
        return (
          text.includes("subject_packet_doc_ids")
          || text.includes("subjectpacketdocids")
          || text.includes("subjectpacketid")
          || text.includes("supporting_doc_ids")
          || text.includes("supportingdocids")
          || text.includes("doc_ids")
          || text.includes("docid")
        );
      }) || triggerInputKeyTexts.some((text) => text.includes("doc"));
      const usesDocIdsFromSteps = stepBindingPaths.some((rawPath) => {
        if (extractInputKeyFromTriggerStepPath(rawPath, templateGraphMeta.nodeById)) return false;
        const text = rawPath.toLowerCase();
        return text.includes("doc_ids") || text.includes("docid");
      });
      const usesFolderFromInput = bindingValues.some((text) => {
        if (!text.includes("$.input.")) return false;
        return text.includes("folder_path") || text.includes("folderpath");
      }) || triggerInputKeyTexts.some((text) => text.includes("folder") || text.includes("path"));
      const usesFolderFromSteps = stepBindingPaths.some((rawPath) => {
        if (extractInputKeyFromTriggerStepPath(rawPath, templateGraphMeta.nodeById)) return false;
        const text = rawPath.toLowerCase();
        return text.includes("folder_path") || text.includes("folderpath");
      });
      const hasTextBinding = bindingValues.some((text) => {
        return (text.includes("$.input.") || text.includes("$.steps.")) && (text.includes("text") || text.includes("content"));
      }) || triggerInputKeyTexts.some((text) => text.includes("text") || text.includes("content") || text.includes("prompt"));

      const hasStaticRuleset = typeof config?.ruleset_doc_id === "string" && String(config.ruleset_doc_id).trim().length > 0;
      const hasStaticDoc =
        (typeof config?.doc_id === "string" && String(config.doc_id).trim().length > 0)
        || (typeof config?.docId === "string" && String(config.docId).trim().length > 0)
        || (Array.isArray(config?.doc_ids) && config.doc_ids.length > 0)
        || (Array.isArray(config?.supporting_doc_ids) && config.supporting_doc_ids.length > 0);
      const hasStaticFolder = normalizeFolderValue(config?.folder_path).length > 0
        || normalizeFolderValue(config?.folderPath).length > 0;

      if ((nodeType === "ai.parse_ruleset" || usesRulesetFromInput) && !hasStaticRuleset) {
        needsRuleset = true;
      }
      if (usesDocIdsFromInput) {
        needsSubjectDocs = true;
      }
      const packetHasFolderDocSource = nodeType === "system.packet_check" && packetCanUseFolderListing(nodeId, index);
      if (docRequiredNodeTypes.has(nodeType) && !hasStaticDoc && !usesDocIdsFromSteps && !packetHasFolderDocSource) {
        needsSubjectDocs = true;
      }
      if ((nodeType === "ai.extract" || nodeType === "ai.classify") && !hasStaticDoc && !usesDocIdsFromSteps && !hasTextBinding) {
        needsSubjectDocs = true;
      }
      if ((folderRequiredNodeTypes.has(nodeType) || usesFolderFromInput) && !hasStaticFolder && !usesFolderFromSteps) {
        needsFolder = true;
      }

      if (needsRuleset && needsSubjectDocs && needsFolder) break;
    }

    if (templateRequirements.some((req) => req.key === "ruleset_doc_id")) needsRuleset = true;
    if (templateRequirements.some((req) => req.key === "doc_id" || req.key === "doc_ids")) needsSubjectDocs = true;
      if (templateRequirements.some((req) => req.key === "folder_path")) needsFolder = true;

    return { needsRuleset, needsSubjectDocs, needsFolder };
  }, [isComplianceTemplate, packetCanUseFolderListing, templateGraphMeta.nodeById, templateGraphMeta.nodes, templateRequirements]);
  const needsRuleset = templateInputNeeds.needsRuleset;
  const needsSubjectDocs = templateInputNeeds.needsSubjectDocs;
  const needsFolder = templateInputNeeds.needsFolder;

  React.useEffect(() => {
    if (!needsFolder) return;
    if (selectedFolderPath.length > 0) return;
    const inferred = subjectDocs[0]?.folderPath || [];
    if (inferred.length === 0) return;
    setSelectedFolderPath(inferred);
  }, [needsFolder, selectedFolderPath.length, subjectDocs]);

  const manualRequirementInput = React.useMemo(() => {
    const output: Record<string, any> = {};
    for (const req of templateRequirements) {
      if (req.kind !== "text") continue;
      const raw = String(runInputFields[req.key] || "").trim();
      if (!raw) continue;
      if (
        (raw.startsWith("{") && raw.endsWith("}"))
        || (raw.startsWith("[") && raw.endsWith("]"))
      ) {
        try {
          output[req.key] = JSON.parse(raw);
          continue;
        } catch {
          // keep as string
        }
      }
      output[req.key] = raw;
    }
    return output;
  }, [runInputFields, templateRequirements]);

  const generatedInput = React.useMemo(() => {
    let extra: Record<string, any> = {};
    try {
      extra = JSON.parse(extraInputJson || "{}");
    } catch {
      extra = {};
    }
    const selectedDocIds = subjectDocs.map((d) => d.id);
    const primaryDocId = selectedDocIds[0] || rulesetDoc?.id || "";
    const derivedFolderPath = selectedFolderPath.length > 0
      ? selectedFolderPath
      : (subjectDocs[0]?.folderPath || []);
    const payload: Record<string, any> = { ...manualRequirementInput };

    if (rulesetDoc?.id) {
      payload.ruleset_doc_id = rulesetDoc.id;
      payload.rulesetDocId = rulesetDoc.id;
    }
    if (selectedDocIds.length > 0) {
      payload.doc_ids = selectedDocIds;
      payload.supporting_doc_ids = selectedDocIds;
      payload.subject_packet_doc_ids = selectedDocIds;
      payload.doc_id = primaryDocId;
      payload.docId = primaryDocId;
    }
    if (derivedFolderPath.length > 0) {
      payload.folder_path = derivedFolderPath;
      payload.folderPath = derivedFolderPath;
    }
    if (isComplianceTemplate) {
      payload.caseFolder = detectCaseFolder(rulesetDoc, subjectDocs);
    }

    return {
      ...payload,
      ...extra,
    };
  }, [extraInputJson, isComplianceTemplate, manualRequirementInput, rulesetDoc, selectedFolderPath, subjectDocs]);

  const requirementStatus = React.useMemo(() => {
    return templateRequirements.map((req) => {
      let value: any = resolveGeneratedRequirementValue(generatedInput, req.key);
      if (req.key === "ruleset_doc_id") {
        value = generatedInput.ruleset_doc_id ?? generatedInput.rulesetDocId;
      }
      if (req.key === "doc_id") {
        value = generatedInput.doc_id ?? generatedInput.docId ?? generatedInput.doc_ids?.[0];
      }
      if (req.key === "doc_ids") {
        value = generatedInput.doc_ids ?? generatedInput.supporting_doc_ids ?? generatedInput.subject_packet_doc_ids;
      }
      if (req.key === "folder_path") {
        value = generatedInput.folder_path ?? generatedInput.folderPath;
      }
      return {
        ...req,
        missing: !hasNonEmptyValue(value),
      };
    });
  }, [generatedInput, templateRequirements]);

  const missingRequirements = React.useMemo(() => {
    return requirementStatus.filter((req) => req.missing);
  }, [requirementStatus]);

  const loadRun = React.useCallback(async (runId: string) => {
    if (!runId) return null;
    const currentSeq = ++runFetchSeqRef.current;
    const detail = await getWorkflowRun(runId);
    if (currentSeq < runAppliedSeqRef.current) return detail;
    runAppliedSeqRef.current = currentSeq;
    setLiveRunDetail((prev: any) => {
      if (!prev) return detail;
      const prevRunId = String(prev?.run?.id || "");
      const nextRunId = String(detail?.run?.id || "");
      if (prevRunId && nextRunId && prevRunId !== nextRunId) return prev;
      return detail;
    });
    return detail;
  }, []);

  React.useEffect(() => {
    if (!liveRunId) {
      if (pollTimerRef.current != null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    let cancelled = false;
    let currentTimer: number | null = null;
    const clearPollTimer = () => {
      if (currentTimer != null) {
        window.clearTimeout(currentTimer);
        currentTimer = null;
      }
      if (pollTimerRef.current != null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    const tick = async () => {
      if (cancelled) return;
      try {
        const detail = await loadRun(liveRunId);
        if (cancelled) return;
        const status = String(detail?.run?.status || "").toLowerCase();
        const keepPolling = status === "queued" || status === "running" || status === "waiting";
        if (!keepPolling) {
          clearPollTimer();
          return;
        }
        const delay = status === "running" ? 350 : 900;
        currentTimer = window.setTimeout(() => { void tick(); }, delay);
        pollTimerRef.current = currentTimer;
      } catch {
        if (cancelled) return;
        currentTimer = window.setTimeout(() => { void tick(); }, 1200);
        pollTimerRef.current = currentTimer;
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearPollTimer();
    };
  }, [liveRunId, loadRun]);

  const onRun = async () => {
    if (!selectedTemplateId) {
      toast({ title: "Select a template first", variant: "destructive" });
      return;
    }
    if (missingRequirements.length > 0) {
      const labels = missingRequirements.map((req) => req.label);
      const message = labels.length > 2
        ? `${labels.slice(0, 2).join(", ")} and ${labels.length - 2} more`
        : labels.join(", ");
      toast({ title: "Fill required inputs before run", description: message, variant: "destructive" });
      return;
    }
    if ((needsRuleset && !rulesetDoc) || (needsSubjectDocs && subjectDocs.length === 0) || (needsFolder && selectedFolderPath.length === 0)) {
      const message = needsRuleset && needsSubjectDocs && needsFolder
        ? "Select required files and folder for this workflow before starting."
        : needsRuleset && needsSubjectDocs
          ? "Select required files for this workflow before starting."
          : needsRuleset && needsFolder
            ? "Select a ruleset file and folder before starting."
            : needsSubjectDocs && needsFolder
              ? "Select project document(s) and folder before starting."
              : needsRuleset
                ? "Select a ruleset file before starting."
                : needsFolder
                  ? "Select a source folder before starting."
                  : "Select at least one project document before starting.";
      toast({ title: message, variant: "destructive" });
      return;
    }

    let contextObj: Record<string, any> = {};
    try {
      contextObj = JSON.parse(extraContextJson || "{}");
    } catch {
      toast({ title: "Context JSON invalid", variant: "destructive" });
      return;
    }

    setRunning(true);
    try {
      runFetchSeqRef.current = 0;
      runAppliedSeqRef.current = 0;
      const res = await runWorkflowManual({
        templateId: selectedTemplateId,
        input: generatedInput,
        context: contextObj,
        idempotencyKey: `studio-${Date.now()}`,
      });
      setLiveRunId(res.run.id);
      setLiveRunDetail({ run: { id: res.run.id, status: res.run.status || "queued" }, steps: [], tasks: [], taskAssignments: [] });
      try {
        await loadRun(res.run.id);
      } catch {
        // Poller will hydrate soon.
      }
      toast({ title: isComplianceTemplate ? "Compliance check started" : "Workflow run started" });
    } catch (e: any) {
      toast({ title: "Run failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const steps = React.useMemo(() => (
    Array.isArray(liveRunDetail?.steps) ? liveRunDetail.steps : []
  ), [liveRunDetail?.steps]);

  React.useEffect(() => {
    if (steps.length === 0) {
      setSelectedLiveStepId(null);
      return;
    }
    const currentId = detectCurrentStepId(steps);
    setSelectedLiveStepId((prev) => {
      const prevStep = prev
        ? steps.find((step: any) => String(step?.id || "") === prev)
        : null;
      const prevStatus = String(prevStep?.status || "").toLowerCase();
      const prevIsActive = prevStatus === "running" || prevStatus === "waiting";
      if (prev && prevStep && prevIsActive) return prev;
      if (currentId) return currentId;
      if (prev && prevStep) return prev;
      return String(steps[0]?.id || "");
    });
  }, [steps]);

  const definitionGraph = React.useMemo(() => {
    return buildDefinitionGraph(selectedTemplateDefinition || { nodes: [] });
  }, [selectedTemplateDefinition]);

  React.useEffect(() => {
    if (definitionGraph.nodes.length === 0) {
      setSelectedDefinitionNodeId(null);
      return;
    }
    setSelectedDefinitionNodeId((prev) => {
      if (prev && definitionGraph.nodes.some((node) => node.id === prev)) return prev;
      return definitionGraph.nodes[0].id;
    });
  }, [definitionGraph.nodes]);

  const runGraph = React.useMemo(() => {
    return buildLiveRunGraph(selectedTemplateDefinition || { nodes: [] }, steps);
  }, [selectedTemplateDefinition, steps]);

  const selectedTemplate = React.useMemo(() => {
    return templates.find((template) => template.id === selectedTemplateId) || null;
  }, [selectedTemplateId, templates]);
  const hasLiveRun = Boolean(liveRunDetail?.run?.id);
  const graphData = hasLiveRun ? runGraph : definitionGraph;
  const selectedGraphNodeId = hasLiveRun ? selectedLiveStepId : selectedDefinitionNodeId;

  const selectedLiveStep = React.useMemo(() => {
    if (steps.length === 0) return null;
    if (selectedLiveStepId) {
      const found = steps.find((step: any) => String(step?.id || "") === selectedLiveStepId);
      if (found) return found;
      return null;
    }
    return steps[0] || null;
  }, [selectedLiveStepId, steps]);

  const selectedLiveArtifacts = React.useMemo(() => {
    const list = Array.isArray(liveRunDetail?.artifacts) ? liveRunDetail.artifacts : [];
    const stepId = String(selectedLiveStep?.id || "");
    const nodeId = String(selectedLiveStep?.node_id || "");
    if (!stepId && !nodeId) return [];
    return list.filter((artifact: any) => {
      const linkedStepIds = [artifact?.step_id, artifact?.workflow_step_id, artifact?.source_step_id, artifact?.node_step_id].map((v) => String(v || ""));
      const linkedNodeIds = [artifact?.node_id, artifact?.nodeId].map((v) => String(v || ""));
      return (stepId && linkedStepIds.includes(stepId)) || (nodeId && linkedNodeIds.includes(nodeId));
    });
  }, [liveRunDetail?.artifacts, selectedLiveStep?.id, selectedLiveStep?.node_id]);

  const selectedLiveFindings = React.useMemo(() => {
    const list = Array.isArray(liveRunDetail?.findings) ? liveRunDetail.findings : [];
    const stepId = String(selectedLiveStep?.id || "");
    const nodeId = String(selectedLiveStep?.node_id || "");
    if (!stepId && !nodeId) return [];
    return list.filter((finding: any) => {
      const linkedStepIds = [finding?.step_id, finding?.workflow_step_id, finding?.source_step_id].map((v) => String(v || ""));
      const linkedNodeIds = [finding?.node_id, finding?.nodeId].map((v) => String(v || ""));
      return (stepId && linkedStepIds.includes(stepId)) || (nodeId && linkedNodeIds.includes(nodeId));
    });
  }, [liveRunDetail?.findings, selectedLiveStep?.id, selectedLiveStep?.node_id]);

  const tasks = Array.isArray(liveRunDetail?.tasks) ? liveRunDetail.tasks : [];
  const openTasks = tasks.filter((t: any) => String(t?.status || "") !== "done" && String(t?.status || "") !== "completed");
  const taskAssignments = Array.isArray(liveRunDetail?.taskAssignments) ? liveRunDetail.taskAssignments : [];
  const userLabelById = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const user of orgUsers) {
      map[user.id] = user.label;
    }
    return map;
  }, [orgUsers]);

  const selectedLiveTasks = React.useMemo(() => {
    const stepId = String(selectedLiveStep?.id || "");
    const nodeId = String(selectedLiveStep?.node_id || "");
    if (!stepId && !nodeId) return [];
    return tasks.filter((task: any) => {
      const linkedStepIds = [task?.step_id, task?.workflow_step_id, task?.source_step_id].map((v) => String(v || ""));
      const linkedNodeIds = [task?.node_id, task?.nodeId].map((v) => String(v || ""));
      return (stepId && linkedStepIds.includes(stepId)) || (nodeId && linkedNodeIds.includes(nodeId));
    });
  }, [selectedLiveStep?.id, selectedLiveStep?.node_id, tasks]);

  React.useEffect(() => {
    if (openTasks.length === 0) {
      setSelectedTaskId("");
      return;
    }
    setSelectedTaskId((prev) => {
      if (prev && openTasks.some((task: any) => String(task?.id || "") === prev)) return prev;
      return String(openTasks[0]?.id || "");
    });
  }, [openTasks]);

  const selectedTask = openTasks.find((t: any) => String(t.id) === selectedTaskId) || null;
  const selectedTaskAssignees = selectedTask
    ? taskAssignments.filter((a: any) => String(a?.task_id || "") === String(selectedTask.id))
    : [];

  React.useEffect(() => {
    setSignoffError("");
  }, [selectedTaskId, signoffDecision, waiveUnknowns, waiverReason]);

  const runStatus = String(liveRunDetail?.run?.status || (running ? "starting" : "idle"));
  const runStatusKey = runStatus.toLowerCase();
  const unknownRequiresResolution = React.useMemo(() => {
    const policies = (selectedTemplateDefinition && typeof selectedTemplateDefinition === "object")
      ? (selectedTemplateDefinition as any).policies
      : null;
    return Boolean(
      policies
      && typeof policies === "object"
      && (policies.unknown_requires_resolution === true || policies.unknown_requires_signoff === true)
    );
  }, [selectedTemplateDefinition]);

  const unresolvedUnknownFindingCount = React.useMemo(() => {
    const findings = Array.isArray(liveRunDetail?.findings) ? liveRunDetail.findings : [];
    return findings.filter((finding: any) => {
      const result = String(finding?.evidence?.result || "").toLowerCase();
      const status = String(finding?.status || "").toLowerCase();
      return result === "unknown" && status !== "resolved" && status !== "false_positive";
    }).length;
  }, [liveRunDetail?.findings]);

  const missingRuleset = needsRuleset && !rulesetDoc;
  const missingSubjectDocs = needsSubjectDocs && subjectDocs.length === 0;
  const missingFolder = needsFolder && selectedFolderPath.length === 0;
  const hasMissingRequirements = missingRequirements.length > 0;
  const canStartRun = Boolean(selectedTemplateId) && !missingRuleset && !missingSubjectDocs && !missingFolder && !hasMissingRequirements && !running;
  const runBlockedMessage = !selectedTemplateId
    ? "Select a template to run."
    : (missingRuleset && missingSubjectDocs && missingFolder)
      ? "Select required files and folder to run this workflow."
      : (missingRuleset && missingSubjectDocs)
        ? "Select required files to run this workflow."
        : (missingSubjectDocs && missingFolder)
          ? "Select project documents and a source folder to run this workflow."
          : (missingRuleset && missingFolder)
            ? "Select a ruleset file and source folder to run this workflow."
            : missingRuleset
              ? "Select a ruleset file to run this workflow."
              : missingFolder
                ? "Select a source folder to run this workflow."
                : missingSubjectDocs
                  ? "Select at least one project document to run this workflow."
                  : hasMissingRequirements
                    ? `Fill required inputs: ${missingRequirements.slice(0, 2).map((req) => req.label).join(", ")}${missingRequirements.length > 2 ? ` (+${missingRequirements.length - 2} more)` : ""}`
                    : "";

  const activeGraphNode = runGraph.nodes.find((n) => {
    const status = String(n?.status || "").toLowerCase();
    return status === "running" || status === "waiting";
  }) || null;

  const runningIndex = activeGraphNode ? activeGraphNode.index + 1 : (runGraph.nodes.length > 0 ? 1 : 0);
  const totalGraphNodes = Math.max(runGraph.nodes.length, definitionGraph.nodes.length, 1);
  const runDisplayLabel = formatRunLabel(liveRunDetail?.run?.started_at || null);

  const needsReviewState = runStatusKey === "waiting" || openTasks.length > 0;
  const state: StudioState = React.useMemo(() => {
    if (!hasLiveRun) return "setup";
    if (runStatusKey === "queued" || runStatusKey === "running" || runStatusKey === "starting") return "running";
    if (needsReviewState) return "review";
    return "results";
  }, [hasLiveRun, needsReviewState, runStatusKey]);

  const assessmentRows = React.useMemo(() => {
    const evalStep = steps.find((s: any) => String(s?.node_type || "").toLowerCase() === "system.evaluate");
    return Array.isArray(evalStep?.output?.assessment) ? evalStep.output.assessment : [];
  }, [steps]);

  const summaryCounts = React.useMemo(() => {
    const out = { pass: 0, fail: 0, unknown: 0 };
    for (const row of assessmentRows) {
      const result = normalizeFindingResult(row?.result || row?.status);
      out[result] += 1;
    }
    return out;
  }, [assessmentRows]);

  const unknownCountForGate = unresolvedUnknownFindingCount > 0 ? unresolvedUnknownFindingCount : summaryCounts.unknown;
  const approvalBlockedByUnknowns = signoffDecision === "approved"
    && unknownRequiresResolution
    && unknownCountForGate > 0
    && !waiveUnknowns;
  const missingWaiverReason = signoffDecision === "approved" && waiveUnknowns && !String(waiverReason || "").trim();

  const reportStep = React.useMemo(
    () => steps.find((s: any) => String(s?.node_type || "").toLowerCase() === "ai.generate_report") || null,
    [steps]
  );

  const runArtifacts = React.useMemo(() => (Array.isArray(liveRunDetail?.artifacts) ? liveRunDetail.artifacts : []), [liveRunDetail?.artifacts]);

  const reportDocId = React.useMemo(() => {
    const fromArtifact = runArtifacts.find((a: any) => String(a?.data?.kind || "") === "compliance_report_pdf" && typeof a?.doc_id === "string");
    if (fromArtifact?.doc_id) return String(fromArtifact.doc_id);
    const fromStep = reportStep?.output?.report?.report_doc_id;
    return typeof fromStep === "string" ? fromStep : null;
  }, [reportStep, runArtifacts]);

  const evidencePackDocId = React.useMemo(() => {
    const bundleZip = runArtifacts.find((a: any) => String(a?.data?.kind || "") === "compliance_submission_bundle_zip" && typeof a?.doc_id === "string");
    if (bundleZip?.doc_id) return String(bundleZip.doc_id);
    const evidenceJson = runArtifacts.find((a: any) => String(a?.data?.kind || "") === "evidence_bundle_json" && typeof a?.doc_id === "string");
    return evidenceJson?.doc_id ? String(evidenceJson.doc_id) : null;
  }, [runArtifacts]);

  const keyIssues = React.useMemo(() => {
    return assessmentRows
      .map((row: any, index: number) => {
        const result = normalizeFindingResult(row?.result || row?.status);
        const ruleId = String(row?.rule?.clause_id || row?.citation?.clause_id || row?.clause_id || `rule_${index + 1}`);
        const reason = String(row?.reason || row?.message || "No reason provided");
        return {
          id: `${ruleId}:${index}`,
          result,
          ruleId,
          reason,
          confidence: typeof row?.confidence === "number" ? row.confidence : null,
          evidenceDocId: typeof row?.supporting_evidence?.doc_id === "string" ? row.supporting_evidence.doc_id : null,
          evidenceLocation: String(row?.supporting_evidence?.location || ""),
        };
      })
      .filter((row: any) => row.result === "fail" || row.result === "unknown");
  }, [assessmentRows]);

  const shownRules = rulesTab === "issues"
    ? keyIssues
    : assessmentRows.map((row: any, index: number) => {
      const result = normalizeFindingResult(row?.result || row?.status);
      const ruleId = String(row?.rule?.clause_id || row?.citation?.clause_id || row?.clause_id || `rule_${index + 1}`);
      const reason = String(row?.reason || row?.message || "No reason provided");
      return {
        id: `${ruleId}:${index}`,
        result,
        ruleId,
        reason,
        confidence: typeof row?.confidence === "number" ? row.confidence : null,
        evidenceDocId: typeof row?.supporting_evidence?.doc_id === "string" ? row.supporting_evidence.doc_id : null,
        evidenceLocation: String(row?.supporting_evidence?.location || ""),
      };
    });

  const recommendation = String(
    reportStep?.output?.report?.final_recommendation
    || reportStep?.output?.report?.recommendation
    || ""
  ).trim() || (summaryCounts.fail > 0
    ? "Requires remediation before approval."
    : summaryCounts.unknown > 0
      ? "Needs reviewer sign-off due to unknown findings."
      : "Compliant based on the provided evidence.");

  const hasComplianceSignals = assessmentRows.length > 0 || keyIssues.length > 0 || Boolean(reportDocId || evidencePackDocId);

  const overallOutcome: "pass" | "fail" | "unknown" = summaryCounts.fail > 0
    ? "fail"
    : summaryCounts.unknown > 0
      ? "unknown"
      : summaryCounts.pass > 0
        ? "pass"
        : (runStatusKey === "failed" ? "fail" : "unknown");

  const createdDocArtifacts = React.useMemo(() => {
    const out: any[] = [];
    const seen = new Set<string>();
    for (const artifact of runArtifacts) {
      const docId = typeof artifact?.doc_id === "string" ? artifact.doc_id.trim() : "";
      if (!docId) continue;
      if (String(artifact?.artifact_type || "").toLowerCase() !== "generated_doc") continue;
      if (seen.has(docId)) continue;
      seen.add(docId);
      out.push(artifact);
    }
    return out;
  }, [runArtifacts]);

  const referencedDocArtifacts = React.useMemo(() => {
    const out: any[] = [];
    const seen = new Set<string>();
    for (const artifact of runArtifacts) {
      const docId = typeof artifact?.doc_id === "string" ? artifact.doc_id.trim() : "";
      if (!docId) continue;
      if (String(artifact?.artifact_type || "").toLowerCase() === "generated_doc") continue;
      const key = `${docId}:${String(artifact?.artifact_type || "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(artifact);
    }
    return out;
  }, [runArtifacts]);

  const advancedArtifacts = referencedDocArtifacts.filter((artifact: any) => {
    const docId = typeof artifact?.doc_id === "string" ? artifact.doc_id : "";
    if (!docId) return false;
    return docId !== reportDocId && docId !== evidencePackDocId;
  });

  const stepStatusCounts = React.useMemo(() => {
    const counts = { succeeded: 0, failed: 0, waiting: 0, running: 0, other: 0 };
    for (const step of steps) {
      const status = String(step?.status || "").toLowerCase();
      if (status === "succeeded") counts.succeeded += 1;
      else if (status === "failed") counts.failed += 1;
      else if (status === "waiting") counts.waiting += 1;
      else if (status === "running") counts.running += 1;
      else counts.other += 1;
    }
    return counts;
  }, [steps]);

  const latestBusinessStep = React.useMemo(() => {
    const rows = [...steps].filter((step: any) => String(step?.node_type || "").toLowerCase() !== "manual.trigger");
    rows.sort((a: any, b: any) => {
      const aTime = new Date(a?.completed_at || a?.started_at || 0).getTime();
      const bTime = new Date(b?.completed_at || b?.started_at || 0).getTime();
      return bTime - aTime;
    });
    return rows[0] || null;
  }, [steps]);

  const latestBusinessOutput = React.useMemo(() => {
    const output = latestBusinessStep?.output;
    return output && typeof output === "object" ? stripModelFields(output) : {};
  }, [latestBusinessStep?.output]);

  const latestBusinessOutputRows = React.useMemo(() => {
    return compactJsonRows(latestBusinessOutput, 12);
  }, [latestBusinessOutput]);

  const latestBusinessOutputText = React.useMemo(() => {
    const text = typeof latestBusinessOutput?.response_text === "string"
      ? latestBusinessOutput.response_text.trim()
      : "";
    return text;
  }, [latestBusinessOutput]);

  const latestBusinessGeneratedDocId = React.useMemo(() => {
    return typeof latestBusinessOutput?.generated_doc_id === "string" ? latestBusinessOutput.generated_doc_id : null;
  }, [latestBusinessOutput]);

  const latestBusinessGeneratedDocTitle = React.useMemo(() => {
    if (typeof latestBusinessOutput?.generated_doc_title === "string" && latestBusinessOutput.generated_doc_title.trim()) {
      return latestBusinessOutput.generated_doc_title.trim();
    }
    if (typeof latestBusinessOutput?.generated_doc_filename === "string" && latestBusinessOutput.generated_doc_filename.trim()) {
      return latestBusinessOutput.generated_doc_filename.trim();
    }
    return null;
  }, [latestBusinessOutput]);
  const selectedLiveOutput = React.useMemo(() => {
    const output = selectedLiveStep?.output;
    return output && typeof output === "object" ? stripModelFields(output) : {};
  }, [selectedLiveStep?.output]);
  const selectedLiveOutputText = React.useMemo(() => {
    const text = typeof selectedLiveOutput?.response_text === "string"
      ? selectedLiveOutput.response_text.trim()
      : "";
    return text;
  }, [selectedLiveOutput]);
  const selectedLiveOutputRows = React.useMemo(() => {
    return compactJsonRows(selectedLiveOutput, 12);
  }, [selectedLiveOutput]);

  const onCompleteTask = async () => {
    if (!selectedTaskId) return;
    if (approvalBlockedByUnknowns) {
      setReviewOptionsOpen(true);
      const msg = `Approval blocked: ${unknownCountForGate} unresolved unknown finding${unknownCountForGate === 1 ? "" : "s"}. Resolve findings first or waive unknown findings with reason.`;
      setSignoffError(msg);
      toast({ title: "Signoff blocked", description: msg, variant: "destructive" });
      return;
    }
    if (missingWaiverReason) {
      setReviewOptionsOpen(true);
      const msg = "Waiver reason is required when waiving unknown findings.";
      setSignoffError(msg);
      toast({ title: "Signoff blocked", description: msg, variant: "destructive" });
      return;
    }

    setSignoffError("");
    setTaskActing(true);
    try {
      if (selectedTask?.workflow_run_id && selectedTask.workflow_run_id !== liveRunId) {
        setLiveRunId(String(selectedTask.workflow_run_id));
      }
      await completeWorkflowTask(selectedTaskId, {
        decision: signoffDecision,
        note: signoffNote || undefined,
        waiveUnknowns: waiveUnknowns || undefined,
        waiverReason: waiverReason || undefined,
        escalateToLegal: escalateToLegal || undefined,
      });
      if (selectedTask?.workflow_run_id) await loadRun(String(selectedTask.workflow_run_id));
      else if (liveRunId) await loadRun(liveRunId);
      toast({ title: "Signoff submitted" });
    } catch (e: any) {
      const status = Number(e?.status || e?.data?.statusCode || 0);
      const apiMsg = String(e?.message || "");
      const unresolvedCount = Number(e?.data?.unresolvedUnknownCount || 0);
      if (status === 409 && apiMsg.toLowerCase().includes("unknown findings must be resolved")) {
        setReviewOptionsOpen(true);
        setSignoffError(
          `Approval blocked: ${unresolvedCount > 0 ? unresolvedCount : unknownCountForGate} unresolved unknown finding${(unresolvedCount > 0 ? unresolvedCount : unknownCountForGate) === 1 ? "" : "s"}. Resolve findings first or waive unknown findings with reason.`
        );
      } else if (status === 400 && apiMsg.toLowerCase().includes("waiverreason is required")) {
        setReviewOptionsOpen(true);
        setSignoffError("Waiver reason is required when waiving unknown findings.");
      }
      toast({ title: "Signoff failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setTaskActing(false);
    }
  };

  const copyRunId = async () => {
    const runId = String(liveRunDetail?.run?.id || liveRunId || "").trim();
    if (!runId) return;
    try {
      await navigator.clipboard.writeText(runId);
      toast({ title: "Run id copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className={embedded ? "w-full" : "min-h-screen bg-gradient-to-b from-background via-background to-muted/20"}>
      {!embedded ? (
        <header className="h-14 border-b border-border/50 flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">Workflow Runs</h1>
            </div>
            <div className="h-4 w-[1px] bg-border/50 mx-1" />
            <div className="min-w-[220px] max-w-[320px] px-2 py-1 rounded-md bg-muted/30 border border-border/50">
              <div className="w-full px-1 text-left text-xs font-semibold text-foreground truncate" title="Run Studio">
                Run Studio
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-semibold" asChild>
              <Link href="/workflows">Builder</Link>
            </Button>
            <Button variant="default" size="sm" className="h-8 gap-1.5 text-xs font-semibold" asChild>
              <Link href="/workflows">Run Workflow</Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-semibold" onClick={() => void loadInitial()} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>
      ) : null}

      <div className={embedded ? "w-full grid grid-cols-1 xl:grid-cols-12 gap-0 overflow-hidden" : "pl-4 md:pl-6 pt-0 pb-0 pr-0"}>
        <div className={embedded ? "contents" : "w-full grid grid-cols-1 xl:grid-cols-12 gap-0 overflow-hidden"}>
          <div className={`xl:col-span-9 xl:h-full ${embedded ? "xl:min-h-[calc(100vh-77px)]" : "xl:min-h-[calc(100vh-250px)]"} p-4`}>
            <WorkflowRunGraph
              title={hasLiveRun
                ? (isComplianceTemplate
                  ? "Compliance Run"
                  : `${selectedTemplate?.name || "Workflow"} Run`)
                : "Workflow Preview"}
              subtitle={hasLiveRun
                ? `${selectedTemplate?.name || "Workflow"} · Status: ${String(liveRunDetail?.run?.status || "-")} · Steps: ${graphData.nodes.length}`
                : `Steps: ${graphData.nodes.length} · Start run to track live progress`}
              nodes={graphData.nodes}
              edges={graphData.edges}
              selectedNodeId={selectedGraphNodeId}
              chromeless
              canvasClassName={embedded ? "h-full min-h-[700px]" : "h-full min-h-[720px]"}
              onSelectNode={(nodeId) => {
                if (hasLiveRun) {
                  const node = graphData.nodes.find((n) => n.id === nodeId);
                  const stepId = String(node?.raw?.step?.id || "");
                  setSelectedLiveStepId(stepId || nodeId);
                  return;
                }
                setSelectedDefinitionNodeId(nodeId);
              }}
            />
          </div>

          <Card className="xl:col-span-3 border-border/40 bg-card/50 xl:sticky xl:top-[77px] xl:h-[calc(100vh-77px)] rounded-none border-r-0 border-t-0 border-b-0 flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">Run Controls</CardTitle>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title="Refresh run"
                  aria-label="Refresh run"
                  onClick={() => liveRunId && void loadRun(liveRunId)}
                  disabled={!liveRunId}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 flex-1 overflow-auto">
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Workflow</div>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Select workflow template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.latest_version ? `(v${t.latest_version})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{runDisplayLabel}</Badge>
                  <Badge variant="outline">status: {runStatus}</Badge>
                  {(liveRunDetail?.run?.id || liveRunId) ? (
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      title="Copy run id"
                      aria-label="Copy run id"
                      onClick={() => void copyRunId()}
                    >
                      <Clipboard className="h-3 w-3" />
                    </Button>
                  ) : null}
                  {hasLiveRun && selectedLiveStep ? (
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      title="Inspect selected step"
                      aria-label="Inspect selected step"
                      onClick={() => setStepInspectorOpen(true)}
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Current State</div>
                <div className="flex items-center gap-2">
                  <Badge variant={state === "setup" ? "default" : "outline"}>Setup</Badge>
                  <Badge variant={state === "running" ? "default" : "outline"}>Running</Badge>
                  <Badge variant={state === "results" ? "default" : "outline"}>Results</Badge>
                  <Badge variant={state === "review" ? "default" : "outline"}>Review</Badge>
                </div>
              </div>

              {state === "setup" ? (
                <>
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Setup Inputs</div>
                    <div className="text-xs text-muted-foreground">
                      {needsRuleset && needsSubjectDocs && needsFolder
                        ? "Choose required files and source folder, then start the run."
                        : needsRuleset && needsSubjectDocs
                          ? "Choose required files, then start the run."
                          : needsSubjectDocs && needsFolder
                            ? "Choose project documents and source folder, then start the run."
                            : needsRuleset && needsFolder
                              ? "Choose a ruleset file and source folder, then start the run."
                              : needsRuleset
                                ? "Choose a ruleset file, then start the run."
                                : needsSubjectDocs
                                  ? "Choose project documents, then start the run."
                                  : needsFolder
                                    ? "Choose a source folder, then start the run."
                                    : "No file/folder selection needed for this workflow."}
                    </div>

                    {requirementStatus.length > 0 ? (
                      <div className="rounded-lg border border-border/30 bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">Required Inputs</div>
                          <Badge variant={missingRequirements.length === 0 ? "default" : "outline"} className="h-5 text-[10px]">
                            {missingRequirements.length === 0 ? "Ready" : `${missingRequirements.length} missing`}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {requirementStatus.map((req) => (
                            <div key={`${req.nodeId}:${req.key}`} className="rounded border border-border/30 bg-background/70 p-2">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="text-xs font-medium">
                                  {String(req.label || req.key).replace(/_/g, " ")}
                                </div>
                                <Badge variant={req.missing ? "outline" : "default"} className="h-5 text-[10px]">
                                  {req.missing ? "Missing" : "Ready"}
                                </Badge>
                              </div>
                              {req.kind === "text" ? (
                                <Input
                                  value={String(runInputFields[req.key] || "")}
                                  onChange={(e) => setRunInputFields((prev) => ({ ...prev, [req.key]: e.target.value }))}
                                  placeholder={`Enter ${String(req.label || req.key).replace(/_/g, " ").toLowerCase()}`}
                                  className="h-8 text-xs"
                                />
                              ) : req.kind === "folder" ? (
                                <div className="text-[11px] text-muted-foreground">
                                  Use the <span className="font-medium">Source Folder</span> selector below.
                                </div>
                              ) : req.key === "ruleset_doc_id" ? (
                                <div className="text-[11px] text-muted-foreground">
                                  Use the <span className="font-medium">Ruleset</span> selector below.
                                </div>
                              ) : (
                                <div className="text-[11px] text-muted-foreground">
                                  Use the <span className="font-medium">Project Documents</span> selector below.
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {needsRuleset ? (
                      <div className={`rounded-lg border p-3 ${rulesetDoc ? "border-emerald-300/50 bg-emerald-50/30 dark:bg-emerald-950/15" : "border-border/30 bg-muted/20"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-xs text-muted-foreground">Ruleset</div>
                            <Badge variant={rulesetDoc ? "default" : "outline"} className="h-5 text-[10px] gap-1">
                              {rulesetDoc ? <CheckCircle2 className="h-3 w-3" /> : null}
                              {rulesetDoc ? "Ready" : "Missing"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant={rulesetDoc ? "secondary" : "outline"}
                              className="h-7 w-7"
                              title={rulesetDoc ? "Change ruleset" : "Select ruleset"}
                              aria-label={rulesetDoc ? "Change ruleset" : "Select ruleset"}
                              onClick={() => setRulesetPickerOpen(true)}
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                            </Button>
                            {rulesetDoc ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground"
                                title="Clear ruleset"
                                aria-label="Clear ruleset"
                                onClick={() => setRulesetDoc(null)}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {rulesetDoc ? (
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm truncate" title={rulesetDoc.filename}>{rulesetDoc.filename}</div>
                              <div className="text-xs text-muted-foreground font-mono">{trimMiddle(rulesetDoc.id, 24)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-1">No ruleset selected.</div>
                        )}
                      </div>
                    ) : null}

                    {needsSubjectDocs ? (
                      <div className={`rounded-lg border p-3 ${subjectDocs.length > 0 ? "border-emerald-300/50 bg-emerald-50/30 dark:bg-emerald-950/15" : "border-border/30 bg-muted/20"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-xs text-muted-foreground">Project Documents</div>
                            <Badge variant={subjectDocs.length > 0 ? "default" : "outline"} className="h-5 text-[10px] gap-1">
                              {subjectDocs.length > 0 ? <CheckCircle2 className="h-3 w-3" /> : null}
                              {subjectDocs.length > 0 ? `${subjectDocs.length} selected` : "Missing"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant={subjectDocs.length > 0 ? "secondary" : "outline"}
                              className="h-7 w-7"
                              title="Select project documents"
                              aria-label="Select project documents"
                              onClick={() => setSubjectPickerOpen(true)}
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                            </Button>
                            {subjectDocs.length > 0 ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground"
                                title="Clear project documents"
                                aria-label="Clear project documents"
                                onClick={() => setSubjectDocs([])}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {subjectDocs.length > 0 ? (
                          <div className="space-y-1 mt-1">
                            {subjectDocs.map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between gap-2 rounded bg-background/70 px-2 py-1.5">
                                <div className="min-w-0">
                                  <div className="text-sm truncate" title={doc.filename}>{doc.filename}</div>
                                  <div className="text-xs text-muted-foreground font-mono">{trimMiddle(doc.id, 24)}</div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => setSubjectDocs((prev) => prev.filter((x) => x.id !== doc.id))}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-1">No project documents selected.</div>
                        )}
                      </div>
                    ) : null}

                    {needsFolder ? (
                      <div className={`rounded-lg border p-3 ${selectedFolderPath.length > 0 ? "border-emerald-300/50 bg-emerald-50/30 dark:bg-emerald-950/15" : "border-border/30 bg-muted/20"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-xs text-muted-foreground">Source Folder</div>
                            <Badge variant={selectedFolderPath.length > 0 ? "default" : "outline"} className="h-5 text-[10px] gap-1">
                              {selectedFolderPath.length > 0 ? <CheckCircle2 className="h-3 w-3" /> : null}
                              {selectedFolderPath.length > 0 ? "Ready" : "Missing"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant={selectedFolderPath.length > 0 ? "secondary" : "outline"}
                              className="h-7 w-7"
                              title="Select source folder"
                              aria-label="Select source folder"
                              onClick={() => setFolderPickerOpen(true)}
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                            </Button>
                            {selectedFolderPath.length > 0 ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground"
                                title="Clear source folder"
                                aria-label="Clear source folder"
                                onClick={() => setSelectedFolderPath([])}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {selectedFolderPath.length > 0 ? (
                          <div className="mt-1 text-sm font-mono">{formatFolderPath(selectedFolderPath)}</div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-1">No source folder selected.</div>
                        )}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button onClick={() => void onRun()} disabled={!canStartRun}>
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                        {isComplianceTemplate ? "Run Compliance Check" : "Run Workflow"}
                      </Button>
                    </div>
                    {!canStartRun ? (
                      <div className="text-xs text-muted-foreground px-1">
                        {runBlockedMessage}
                      </div>
                    ) : null}
                  </div>

                  <details className="rounded-md p-2 bg-muted/20">
                    <summary className="text-xs cursor-pointer text-muted-foreground">More options</summary>
                    <div className="mt-2 space-y-2">
                      {needsRuleset || needsSubjectDocs ? (
                        <div className="text-xs text-muted-foreground">Case Folder: {detectCaseFolder(rulesetDoc, subjectDocs) || "-"}</div>
                      ) : null}
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setShowAdvanced((v) => !v)}>
                        {showAdvanced ? "Hide technical input" : "Edit input/context JSON"}
                      </Button>
                      {showAdvanced ? (
                        <div className="grid grid-cols-1 gap-2">
                          <Textarea value={extraInputJson} onChange={(e) => setExtraInputJson(e.target.value)} className="min-h-[70px] font-mono text-xs" />
                          <Textarea value={extraContextJson} onChange={(e) => setExtraContextJson(e.target.value)} className="min-h-[70px] font-mono text-xs" />
                        </div>
                      ) : null}
                    </div>
                  </details>
                </>
              ) : null}

              {state === "running" ? (
                <>
                  <div className="rounded-md border border-blue-300/40 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2">
                    <div className="text-sm font-semibold">{isComplianceTemplate ? "Compliance check in progress" : "Workflow run in progress"}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" />
                      Step {runningIndex} of {totalGraphNodes} — {businessStepLabel(activeGraphNode?.nodeType || "")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {runningLine(activeGraphNode?.nodeType || "", subjectDocs.length)}
                    </div>
                    <div className="h-2 rounded bg-blue-100 dark:bg-blue-950/40 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${Math.min(100, Math.max(8, (runningIndex / totalGraphNodes) * 100))}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Run: {trimMiddle(String(liveRunDetail?.run?.id || liveRunId || "-"), 44)}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setStepInspectorOpen(true)}>
                        View Live Details
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}

              {state === "results" ? (
                <>
                  {hasComplianceSignals ? (
                    <>
                      <div className="rounded-md border border-border/40 p-3 bg-background/60 space-y-2">
                        <div className="text-sm font-semibold">Compliance Summary</div>
                        <div className="flex items-center gap-2">
                          {overallOutcome === "pass" ? <Badge className="bg-emerald-600">Pass</Badge> : null}
                          {overallOutcome === "fail" ? <Badge className="bg-red-600">Fail</Badge> : null}
                          {overallOutcome === "unknown" ? <Badge className="bg-amber-600">Unknown</Badge> : null}
                          <Badge variant="outline">Pass: {summaryCounts.pass}</Badge>
                          <Badge variant="outline">Fail: {summaryCounts.fail}</Badge>
                          <Badge variant="outline">Unknown: {summaryCounts.unknown}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{recommendation}</div>

                        <div className="flex items-center gap-2 pt-1">
                          {reportDocId ? (
                            <Button asChild size="sm">
                              <a href={`/documents/${reportDocId}`}>
                                <FileText className="h-3.5 w-3.5 mr-1.5" />
                                Open Report
                              </a>
                            </Button>
                          ) : (
                            <Button size="sm" disabled>Open Report</Button>
                          )}

                          {evidencePackDocId ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={`/documents/${evidencePackDocId}`}>
                                <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                                Open Evidence Pack
                              </a>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled>Open Evidence Pack</Button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        <div className="text-sm font-semibold">Key Issues</div>
                        {keyIssues.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No blocking issues found.</div>
                        ) : (
                          <div className="space-y-2">
                            {keyIssues.slice(0, 6).map((row: any) => (
                              <div key={row.id} className="rounded border border-border/30 p-2 text-xs">
                                <div className="flex items-center gap-2 mb-1">
                                  {row.result === "fail" ? <XCircle className="h-3.5 w-3.5 text-red-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                                  <span className="font-medium">{row.ruleId}</span>
                                </div>
                                <div className="text-muted-foreground">{row.reason}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">Rules</div>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant={rulesTab === "issues" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setRulesTab("issues")}>
                              Issues
                            </Button>
                            <Button size="sm" variant={rulesTab === "all" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setRulesTab("all")}>
                              All Rules
                            </Button>
                          </div>
                        </div>

                        {shownRules.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No rules to display.</div>
                        ) : (
                          <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                            {shownRules.map((row: any) => (
                              <details key={row.id} className="rounded border border-border/30 p-2 text-xs">
                                <summary className="cursor-pointer flex items-center justify-between gap-2">
                                  <span className="font-medium">{row.ruleId}</span>
                                  <Badge variant="outline">{row.result}</Badge>
                                </summary>
                                <div className="mt-2 space-y-2 text-muted-foreground">
                                  <div>{row.reason}</div>
                                  {row.evidenceDocId ? (
                                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                      <a href={`/documents/${row.evidenceDocId}`}>
                                        View Evidence
                                      </a>
                                    </Button>
                                  ) : null}
                                  <div className="text-xs">Location: {row.evidenceLocation || "Not specified"}</div>
                                  {typeof row.confidence === "number" ? <div className="text-xs">Confidence: {row.confidence}</div> : null}
                                </div>
                              </details>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-md border border-border/40 p-3 bg-background/60 space-y-2">
                        <div className="text-sm font-semibold">Run Summary</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">Status: {runStatus}</Badge>
                          <Badge variant="outline">Succeeded: {stepStatusCounts.succeeded}</Badge>
                          <Badge variant="outline">Failed: {stepStatusCounts.failed}</Badge>
                          <Badge variant="outline">Waiting: {stepStatusCounts.waiting}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Latest step: {latestBusinessStep ? businessStepLabel(latestBusinessStep?.node_type || "") : "N/A"}
                        </div>
                      </div>

                      <div className="rounded-md border border-border/40 p-3 bg-background/60 space-y-2">
                        <div className="text-sm font-semibold">Output</div>
                        {latestBusinessOutputText ? (
                          <div className="rounded border border-border/30 bg-background/70 p-3 text-sm whitespace-pre-wrap leading-6">
                            {latestBusinessOutputText}
                          </div>
                        ) : latestBusinessOutputRows.length > 0 ? (
                          <div className="space-y-1">
                            {latestBusinessOutputRows.map((row) => (
                              <div key={row.key} className="text-xs">
                                <span className="text-muted-foreground">{row.key}:</span> {row.value}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">No user-facing output available.</div>
                        )}
                        {latestBusinessGeneratedDocId ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={`/documents/${latestBusinessGeneratedDocId}`}>
                              <FileText className="h-3.5 w-3.5 mr-1.5" />
                              {latestBusinessGeneratedDocTitle || "Open Generated Document"}
                            </a>
                          </Button>
                        ) : null}
                      </div>

                      <div className="rounded-md border border-border/40 p-3 bg-background/60 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">Files Created</div>
                          <Badge variant="outline">{createdDocArtifacts.length}</Badge>
                        </div>
                        {createdDocArtifacts.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No files were produced by this run.</div>
                        ) : (
                          <div className="space-y-2">
                            {createdDocArtifacts.slice(0, 6).map((artifact: any) => (
                              <div key={String(artifact?.id || artifact?.doc_id)} className="rounded border border-border/30 p-2 bg-background/70 text-xs flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{String(artifact?.title || artifact?.data?.filename || "artifact")}</div>
                                  <div className="text-muted-foreground truncate">{String(artifact?.artifact_type || "")}</div>
                                </div>
                                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                  <a href={`/documents/${artifact.doc_id}`}>Open</a>
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <details className="rounded-md p-2 bg-muted/20">
                    <summary className="text-xs cursor-pointer text-muted-foreground">More files (advanced)</summary>
                    <div className="mt-2 space-y-2">
                      {advancedArtifacts.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No referenced files.</div>
                      ) : (
                        advancedArtifacts.map((artifact: any) => {
                          const docId = typeof artifact?.doc_id === "string" ? artifact.doc_id : "";
                          return (
                            <div key={String(artifact?.id || docId)} className="rounded bg-background/70 p-2 text-xs flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{String(artifact?.title || artifact?.data?.filename || "artifact")}</div>
                                <div className="text-muted-foreground">{String(artifact?.data?.kind || artifact?.artifact_type || "")}</div>
                              </div>
                              {docId ? (
                                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                  <a href={`/documents/${docId}`}>Open</a>
                                </Button>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </details>
                </>
              ) : null}

              {state === "review" ? (
                <>
                  <div className="rounded-md border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
                    <div className="text-sm font-semibold flex items-center gap-1.5">
                      <ShieldAlert className="h-4 w-4" /> Reviewer sign-off required
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Complete a decision to finish this workflow.
                    </div>
                  </div>

                  <div className="rounded-md border border-border/40 p-3 bg-background/60 space-y-2">
                    <div className="text-sm font-semibold">Current Step Output</div>
                    {String(selectedLiveStep?.node_type || "").toLowerCase() === "system.packet_check" ? (
                      <div className="text-xs text-muted-foreground">
                        Packet Check verifies minimum docs + required filename/type rules, then lists missing requirements.
                      </div>
                    ) : null}
                    {String(selectedLiveStep?.node_type || "").toLowerCase() === "human.checklist" ? (
                      <div className="text-xs text-muted-foreground">
                        Checklist Task creates a human review task and waits for Accept/Reject to continue the run.
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      {selectedLiveStep
                        ? `Step: ${businessStepLabel(String(selectedLiveStep?.node_type || ""))}`
                        : (selectedLiveStepId
                          ? "Selected node has not executed yet."
                          : "Select a step on the graph to inspect output.")}
                    </div>
                    {selectedLiveOutputText ? (
                      <div className="rounded border border-border/30 bg-background/70 p-3 text-sm whitespace-pre-wrap leading-6">
                        {selectedLiveOutputText}
                      </div>
                    ) : selectedLiveOutputRows.length > 0 ? (
                      <div className="space-y-1">
                        {selectedLiveOutputRows.map((row) => (
                          <div key={row.key} className="text-xs">
                            <span className="text-muted-foreground">{row.key}:</span> {row.value}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No user-facing output available for the selected step yet.</div>
                    )}
                    <div className="flex items-center justify-end">
                      <Button size="sm" variant="outline" onClick={() => setStepInspectorOpen(true)} disabled={!selectedLiveStep}>
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        View Full Step Output
                      </Button>
                    </div>
                  </div>

                  {openTasks.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No open review task found for this run.</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-md bg-muted/20 p-2">
                        <div className="text-xs text-muted-foreground mb-1">Task</div>
                        <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                          <SelectTrigger><SelectValue placeholder="Select task" /></SelectTrigger>
                          <SelectContent>
                            {openTasks.map((t: any) => (
                              <SelectItem key={t.id} value={String(t.id)}>
                                {String(t?.title || "Task")} ({String(t?.status || "-")})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedTask ? (
                          <div className="text-xs text-muted-foreground mt-2">
                            Assigned: {selectedTaskAssignees.length > 0
                              ? selectedTaskAssignees.map((a: any) => {
                                const userId = String(a?.user_id || "");
                                return userLabelById[userId] || trimMiddle(userId, 14);
                              }).join(", ")
                              : "none"}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-md bg-muted/20 p-2 space-y-2">
                        <div className="text-xs font-medium">Decision</div>
                        {approvalBlockedByUnknowns ? (
                          <div className="rounded border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-2 text-xs text-amber-900 dark:text-amber-200">
                            {unknownCountForGate} unknown finding{unknownCountForGate === 1 ? "" : "s"} must be resolved before approval, or waived with a reason.
                          </div>
                        ) : null}
                        {signoffError ? (
                          <div className="rounded border border-red-300/50 bg-red-50/60 dark:bg-red-950/20 p-2 text-xs text-red-700 dark:text-red-300">
                            {signoffError}
                          </div>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={signoffDecision} onValueChange={(v: any) => setSignoffDecision(v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="approved">Accept</SelectItem>
                              <SelectItem value="rejected">Reject</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input placeholder="Optional note" value={signoffNote} onChange={(e) => setSignoffNote(e.target.value)} />
                        </div>

                        <details
                          className="rounded p-2 bg-background/50"
                          open={reviewOptionsOpen}
                          onToggle={(e) => setReviewOptionsOpen((e.currentTarget as HTMLDetailsElement).open)}
                        >
                          <summary className="text-xs cursor-pointer text-muted-foreground">More options</summary>
                          <div className="mt-2 grid grid-cols-1 gap-2">
                            <label className="text-xs flex items-center gap-2">
                              <input type="checkbox" checked={waiveUnknowns} onChange={(e) => setWaiveUnknowns(e.target.checked)} />
                              Waive unknown findings
                            </label>
                            {waiveUnknowns ? (
                              <Input placeholder="Waiver reason" value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)} />
                            ) : null}
                            <label className="text-xs flex items-center gap-2">
                              <input type="checkbox" checked={escalateToLegal} onChange={(e) => setEscalateToLegal(e.target.checked)} />
                              Escalate to legal
                            </label>
                          </div>
                        </details>

                        <Button
                          size="sm"
                          onClick={() => void onCompleteTask()}
                          disabled={!selectedTaskId || taskActing || approvalBlockedByUnknowns || missingWaiverReason}
                        >
                          Submit Sign-off
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                {liveRunId ? (
                  onOpenRunDetail ? (
                    <Button size="sm" variant="outline" onClick={() => onOpenRunDetail(liveRunId)}>
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      Open Detail
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <a href={`/workflows/run#run-${liveRunId}`}>
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        Open Detail
                      </a>
                    </Button>
                  )
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <FinderPicker
        open={rulesetPickerOpen}
        onOpenChange={setRulesetPickerOpen}
        mode="doc"
        maxDocs={1}
        initialSelectedDocIds={rulesetDoc?.id ? [rulesetDoc.id] : []}
        onConfirm={(payload) => {
          const selected = Array.isArray(payload?.docs) ? payload.docs[0] : null;
          if (!selected) return;
          setRulesetDoc(toDocItem(selected));
        }}
      />

      <FinderPicker
        open={subjectPickerOpen}
        onOpenChange={setSubjectPickerOpen}
        mode="doc"
        maxDocs={25}
        initialSelectedDocIds={subjectDocs.map((d) => d.id)}
        onConfirm={(payload) => {
          const selected = Array.isArray(payload?.docs) ? payload.docs : [];
          setSubjectDocs(selected.map((doc) => toDocItem(doc)));
        }}
      />

      <FinderPicker
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        mode="folder"
        initialPath={selectedFolderPath}
        onConfirm={(payload) => {
          const path = Array.isArray(payload?.path) ? payload.path.map((value) => String(value || "").trim()).filter(Boolean) : [];
          setSelectedFolderPath(path);
        }}
      />

      <Sheet open={stepInspectorOpen} onOpenChange={setStepInspectorOpen}>
        <SheetContent side="right" className="w-[700px] sm:max-w-[700px] p-0 overflow-auto">
          <div className="h-full flex flex-col">
            <SheetHeader className="px-4 py-3 border-b border-border/40">
              <SheetTitle>Step Details</SheetTitle>
              <SheetDescription>Detailed artifacts, findings, and step output.</SheetDescription>
            </SheetHeader>
            <div className="p-4">
              <WorkflowRunStepDetail
                step={selectedLiveStep}
                artifacts={selectedLiveArtifacts}
                findings={selectedLiveFindings}
                tasks={selectedLiveTasks}
                labelForDoc={labelForDoc}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
