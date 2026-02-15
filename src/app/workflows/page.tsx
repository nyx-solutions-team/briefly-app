"use client";

import * as React from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowBuilderCanvas } from "@/components/workflows/workflow-builder-canvas";
import { WorkflowExecuteStudio } from "@/components/workflows/workflow-execute-studio";
import { WorkflowInspector } from "@/components/workflows/workflow-inspector";
import { WorkflowTemplateSidebar } from "@/components/workflows/workflow-template-sidebar";
import { WorkflowRunGraph } from "@/components/workflows/workflow-run-graph";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { AccessDenied } from "@/components/access-denied";
import { apiFetch, getApiContext } from "@/lib/api";
import { buildRunGraph, detectCurrentStepId, formatDurationMs } from "@/lib/workflow-view-model";
import { getOrgFeatures } from "@/lib/org-features";
import {
  completeWorkflowTask,
  createWorkflowTemplate,
  createWorkflowTemplateVersion,
  getWorkflowTemplateDefinition,
  getWorkflowConfig,
  getWorkflowRun,
  listWorkflowNodeDefinitions,
  listWorkflowRuns,
  listWorkflowTemplates,
  runWorkflowManual,
  type WorkflowNodeDefinition,
  type WorkflowRun,
  type WorkflowTemplate,
} from "@/lib/workflow-api";
import { AlertTriangle, CheckCircle2, Clock3, History, Layers, Play, RefreshCw, Wrench } from "lucide-react";

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

function normalizeTemplateName(value: string): string {
  return String(value || "").trim().toLowerCase();
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

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [config, setConfig] = React.useState<any>(null);
  const [templates, setTemplates] = React.useState<WorkflowTemplate[]>([]);
  const [nodeDefinitions, setNodeDefinitions] = React.useState<WorkflowNodeDefinition[]>([]);
  const [runs, setRuns] = React.useState<WorkflowRun[]>([]);
  const [activeRunId, setActiveRunId] = React.useState<string>("");
  const [runDetail, setRunDetail] = React.useState<any>(null);
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
  const roleOptions = ["orgAdmin", "member", "viewer", "uploader"];
  const [builderTemplateId, setBuilderTemplateId] = React.useState<string>("");
  const [builderTemplateName, setBuilderTemplateName] = React.useState<string>("Untitled Workflow");
  const [builderTemplateDescription, setBuilderTemplateDescription] = React.useState<string>("");
  const [builderType, setBuilderType] = React.useState<string>("custom.workflow");
  const [templatePickerOpen, setTemplatePickerOpen] = React.useState(false);
  const [runHistoryOpen, setRunHistoryOpen] = React.useState(false);
  const [pageMode, setPageMode] = React.useState<"builder" | "execute" | "run">("builder");
  const runPollTimerRef = React.useRef<number | null>(null);
  const runFetchSeqRef = React.useRef(0);
  const runAppliedSeqRef = React.useRef(0);

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
    return detail;
  }, [hydrateDocLabels]);

  const reload = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [cfg, tplRes, runRes] = await Promise.all([
        getWorkflowConfig(),
        listWorkflowTemplates(true),
        listWorkflowRuns({ limit: 20 }),
      ]);
      setConfig(cfg);
      setTemplates(tplRes.templates || []);
      setRuns(runRes.runs || []);
      try {
        const nodeRes = await listWorkflowNodeDefinitions(false);
        setNodeDefinitions(Array.isArray(nodeRes?.nodeDefinitions) ? nodeRes.nodeDefinitions : []);
      } catch {
        setNodeDefinitions([]);
      }
      try {
        const orgId = getApiContext().orgId;
        if (orgId) {
          const users = await apiFetch<any[]>(`/orgs/${orgId}/users`, { skipCache: true });
          setOrgUsers((users || []).map((u: any) => ({
            id: String(u?.userId || u?.id || ""),
            role: String(u?.role || "member"),
            label: String(u?.displayName || u?.username || u?.email || u?.userId || "user"),
          })).filter((u) => u.id));
        }
      } catch {
        setOrgUsers([]);
      }
      if (activeRunId) {
        await loadRunDetail(activeRunId);
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

  const insertStepAt = React.useCallback((index: number) => {
    const bounded = Math.max(0, Math.min(index, stepNodes.length));
    const next = [...stepNodes];
    next.splice(bounded, 0, {
      id: `step_${stepNodes.length + 1}`,
      node_type: "human.review",
      output: "",
      assignee: { type: "role", value: "orgAdmin" },
    });
    setStepNodes(next);
    setSelectedBuilderStepIndex(bounded);
  }, [setStepNodes, stepNodes]);

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

  const getBuilderDefinition = React.useCallback(() => {
    const base = deepClone(customDefinition || {});
    return {
      ...base,
      schema_version: Number(base?.schema_version || 1),
      type: builderType || String(base?.type || "custom.workflow"),
      nodes: Array.isArray(stepNodes) ? stepNodes : [],
    };
  }, [builderType, customDefinition, stepNodes]);

  const ensureScenarioTemplate = async () => {
    const definitionToSave = getBuilderDefinition();
    const definitionMode = inferDefinitionMode(definitionToSave);
    if (builderTemplateId) {
      const versionRes = await createWorkflowTemplateVersion(builderTemplateId, {
        definition: definitionToSave,
        definitionMode,
        changeNote: "Workflow builder update from UI",
      });
      return {
        templateId: builderTemplateId,
        version: versionRes.version?.version,
        created: false,
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
      return { templateId: created.template.id, version: 1, created: true };
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
    };
  };

  const onCreateOrUpdateScenarioTemplate = async () => {
    setActing(true);
    try {
      const result = await ensureScenarioTemplate();
      setBuilderTemplateId(result.templateId);
      toast({
        title: result.created ? "Template created" : "Template version added",
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
      setRunHistoryOpen(false);
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
          setRunHistoryOpen(false);
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

  const runGraph = React.useMemo(() => buildRunGraph(runSteps), [runSteps]);

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

  return (
    <AppLayout flush={pageMode !== "builder"}>
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-4 md:px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Wrench className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold truncate">Visual Workflow Builder</h1>
                <p className="text-xs text-muted-foreground truncate">Build a workflow, save a version, and run it from one page.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={pageMode === "builder" ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setPageMode("builder")}
              >
                Builder
              </Button>
              <Button
                variant={pageMode === "execute" ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setPageMode("execute")}
              >
                Run Workflow
              </Button>
              <Button
                variant={pageMode === "run" ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setPageMode("run")}
                disabled={!runDetail}
              >
                Run Detail
              </Button>
              {pageMode === "run" ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setRunHistoryOpen(true)}
                >
                  <History className="h-3.5 w-3.5" />
                  History
                </Button>
              )}
            </div>
          </div>
        </header>

        <Sheet open={runHistoryOpen} onOpenChange={setRunHistoryOpen}>
          <SheetContent side="right" className="w-[460px] sm:max-w-[460px] p-0">
            <div className="h-full flex flex-col">
              <SheetHeader className="px-4 py-3 border-b border-border/40">
                <SheetTitle className="text-base">Run History</SheetTitle>
                <SheetDescription>One tap on any run card opens it instantly.</SheetDescription>
              </SheetHeader>

              <div className="p-4 space-y-2 border-b border-border/30 bg-muted/10">
                <div className="text-xs text-muted-foreground">Paste a run id and press Enter to open.</div>
                <Input
                  placeholder="Paste run id (or select below)"
                  value={activeRunId}
                  onChange={(e) => setActiveRunId(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const next = String(activeRunId || "").trim();
                    if (!next) return;
                    event.preventDefault();
                    void onOpenRun(next);
                  }}
                />
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-2 bg-gradient-to-b from-background to-muted/10">
                {runs.map((r) => {
                  const status = String((r as any)?.status || "-");
                  const startedAt = (r as any)?.started_at || (r as any)?.created_at || (r as any)?.updated_at || null;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="group w-full text-left rounded-lg border border-border/40 bg-card/70 p-3 transition hover:border-primary/40 hover:bg-accent/20"
                      onClick={() => {
                        setActiveRunId(String(r.id || ""));
                        void onOpenRun(r.id);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-mono truncate">{r.id}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">{formatRunDate(startedAt)}</div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${runStatusToneClass(status)}`}>{status}</Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Template v{(r as any)?.workflow_template_version ?? "-"}</span>
                        <span className="text-foreground/80 group-hover:text-foreground">Open</span>
                      </div>
                    </button>
                  );
                })}
                {runs.length === 0 && !loading ? <div className="text-xs text-muted-foreground">No runs yet.</div> : null}
              </div>
            </div>
          </SheetContent>
        </Sheet>

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
                }))}
                activeId={builderTemplateId}
                onSelect={(id) => {
                  void loadTemplateIntoBuilder(id);
                  setTemplatePickerOpen(false);
                }}
                onCreateNew={() => {
                  onCreateNewBuilderTemplate();
                  setTemplatePickerOpen(false);
                }}
                onRefresh={() => void reload()}
                isRefreshing={refreshing}
              />
            </div>
          </DialogContent>
        </Dialog>

        <main className={pageMode === "builder" ? "px-4 md:px-6 py-6" : "pl-4 md:pl-6 pt-0 pb-0 pr-0"}>
          <div className={`${pageMode === "builder" ? "mx-auto max-w-7xl" : "w-full"} grid grid-cols-1 xl:grid-cols-3 gap-0`}>
            {pageMode === "builder" ? (
              <div className="xl:col-span-3 space-y-3">
                <div className="text-sm font-semibold">Creating Workflow Templates</div>

                <div className="rounded-md border border-border/40 p-3 bg-background/60 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Active Template</div>
                    <div className="text-sm font-medium truncate" title={activeBuilderTemplateLabel}>{activeBuilderTemplateLabel}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 shrink-0"
                    title="Open template library"
                    aria-label="Open template library"
                    onClick={() => setTemplatePickerOpen(true)}
                  >
                    <Layers className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
                  <div className="xl:col-span-7">
                    <WorkflowBuilderCanvas
                      nodes={stepNodes}
                      selectedIndex={selectedBuilderStepIndex}
                      onSelect={setSelectedBuilderStepIndex}
                      onInsertAt={insertStepAt}
                      onMove={moveStep}
                      onDelete={removeStep}
                      onReorder={reorderSteps}
                    />
                  </div>

                  <div className="xl:col-span-5">
                    <WorkflowInspector
                      selectedNode={selectedBuilderNode}
                      selectedIndex={selectedBuilderStepIndex}
                      totalNodes={stepNodes.length}
                      previousNodeId={selectedBuilderStepIndex != null && selectedBuilderStepIndex > 0 ? String(stepNodes[selectedBuilderStepIndex - 1]?.id || "") : null}
                      previousNodeType={selectedBuilderStepIndex != null && selectedBuilderStepIndex > 0 ? String(stepNodes[selectedBuilderStepIndex - 1]?.node_type || stepNodes[selectedBuilderStepIndex - 1]?.node_ref?.key || stepNodes[selectedBuilderStepIndex - 1]?.nodeRef?.key || "") : null}
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
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => void onCreateOrUpdateScenarioTemplate()} disabled={acting || loading}>
                    {builderTemplateId ? "Save New Version" : "Create/Update Template"}
                  </Button>
                  <Button onClick={() => void onRunScenario()} disabled={acting || loading || !config?.manualRunEnabled}>
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    Run Workflow
                  </Button>
                </div>

              </div>
            ) : null}

            {pageMode === "execute" ? (
              <div className="xl:col-span-3">
                <WorkflowExecuteStudio
                  embedded
                  onOpenRunDetail={(runId) => {
                    void onOpenRun(runId);
                    setPageMode("run");
                  }}
                />
              </div>
            ) : null}

            {pageMode === "run" ? (
              <div className="xl:col-span-3">
                {!runDetail ? (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Select a run to view steps, output, artifacts, and tasks.</div>
                    <Button size="sm" variant="outline" onClick={() => setRunHistoryOpen(true)}>
                      Open Run History
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
                        onSelectNode={setSelectedRunStepId}
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
                              onClick={() => setRunHistoryOpen(true)}
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
                                <div className="text-sm text-muted-foreground">Select a step on the graph to inspect it.</div>
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
    </AppLayout>
  );
}
