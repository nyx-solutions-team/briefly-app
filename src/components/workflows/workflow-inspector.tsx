"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { friendlyNodeLabel, nodeExecutionDescription, normalizeNodeType } from "@/lib/workflow-view-model";
import type { WorkflowNodeDefinition } from "@/lib/workflow-api";

type StepNode = Record<string, any>;

type Props = {
  schemaVersion: 1 | 2;
  selectedNode: StepNode | null;
  selectedIndex: number | null;
  totalNodes: number;
  previousNodeId?: string | null;
  previousNodeType?: string | null;
  templateName: string;
  templateType: string;
  templateDescription: string;
  onTemplateNameChange: (value: string) => void;
  onTemplateTypeChange: (value: string) => void;
  onTemplateDescriptionChange: (value: string) => void;
  onPatchSelectedNode: (patch: Record<string, any>) => void;
  onMoveSelectedNode: (delta: -1 | 1) => void;
  onDeleteSelectedNode: () => void;
  roleOptions: string[];
  users: Array<{ id: string; label: string; role: string }>;
  nodeDefinitions: WorkflowNodeDefinition[];
  hideGeneralTab?: boolean;
};

function getNodeRef(node: StepNode | null): { key: string; version: number | null } | null {
  const ref = node?.node_ref && typeof node.node_ref === "object"
    ? node.node_ref
    : (node?.nodeRef && typeof node.nodeRef === "object" ? node.nodeRef : null);
  if (!ref) return null;
  const key = String(ref.key || "").trim();
  if (!key) return null;
  const version = Number(ref.version || 0);
  return {
    key,
    version: Number.isFinite(version) && version > 0 ? Math.trunc(version) : null,
  };
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function toPathArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return [];
  return text.split("/").map((part) => part.trim()).filter(Boolean);
}

function toCsvArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return [];
  return text.split(",").map((part) => part.trim()).filter(Boolean);
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

function suggestedCreateDocumentContentPath(previousNodeId: string, previousNodeType: string): string {
  const nodeId = String(previousNodeId || "").trim();
  if (!nodeId) return "";
  const nodeType = normalizeNodeType(previousNodeType || "");
  if (nodeType === "ai.prompt" || nodeType === "ai.summary") {
    return `$.steps.${nodeId}.output.response_text`;
  }
  if (nodeType === "ai.extract") {
    return `$.steps.${nodeId}.output.records`;
  }
  return `$.steps.${nodeId}.output`;
}

const FALLBACK_NODE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "ai.prompt", label: "AI Prompt" },
  { key: "ai.extract", label: "AI Extract" },
  { key: "ai.classify", label: "AI Classify" },
  { key: "system.validate", label: "Validate" },
  { key: "system.reconcile", label: "Reconcile" },
  { key: "dms.read_document", label: "Read Document" },
  { key: "dms.list_folder", label: "List Folder" },
  { key: "dms.set_metadata", label: "Set Metadata" },
  { key: "dms.create_document", label: "Create Document" },
  { key: "dms.move_document", label: "Move Document" },
  { key: "flow.branch", label: "Branch" },
  { key: "artifact.export_csv", label: "Export CSV" },
  { key: "human.review", label: "Human Review" },
  { key: "human.approval", label: "Human Approval" },
];

export function WorkflowInspector(props: Props) {
  const {
    schemaVersion,
    selectedNode,
    selectedIndex,
    totalNodes,
    previousNodeId,
    previousNodeType,
    templateName,
    templateDescription,
    onTemplateNameChange,
    onTemplateDescriptionChange,
    onPatchSelectedNode,
    onMoveSelectedNode,
    onDeleteSelectedNode,
    roleOptions,
    users,
    nodeDefinitions,
    hideGeneralTab = false,
  } = props;

  void props.templateType;
  void props.onTemplateTypeChange;

  const [activeTab, setActiveTab] = React.useState<"general" | "step">("general");

  React.useEffect(() => {
    if (hideGeneralTab) {
      if (activeTab !== "step") setActiveTab("step");
      return;
    }
    if (selectedNode && selectedIndex != null) {
      setActiveTab("step");
      return;
    }
    setActiveTab("general");
  }, [activeTab, hideGeneralTab, selectedNode?.id, selectedIndex]);

  const selectedNodeRef = getNodeRef(selectedNode);
  const hasSelectedNode = Boolean(selectedNode && selectedIndex != null);
  const selectedStepPosition = selectedIndex != null ? selectedIndex + 1 : null;
  const isLastSelectedStep = selectedIndex != null ? selectedIndex >= totalNodes - 1 : true;

  const sortedNodeDefinitions = [...(nodeDefinitions || [])].sort((a, b) => {
    const an = String(a?.name || a?.node_key || "").toLowerCase();
    const bn = String(b?.name || b?.node_key || "").toLowerCase();
    return an.localeCompare(bn);
  });

  const supportsRegistry = sortedNodeDefinitions.length > 0;
  const nodeType = normalizeNodeType(selectedNodeRef?.key || selectedNode?.node_type || "");
  const selectedNodeDefinition = React.useMemo(() => {
    const lookupKey = String(selectedNodeRef?.key || nodeType || "").trim();
    if (!lookupKey) return null;
    return sortedNodeDefinitions.find((definition) => String(definition.node_key) === lookupKey) || null;
  }, [nodeType, selectedNodeRef?.key, sortedNodeDefinitions]);
  const selectedNodeContract = isPlainObject(selectedNodeDefinition?.latest_contract)
    ? selectedNodeDefinition.latest_contract
    : null;
  const selectedInputSchema = isPlainObject(selectedNodeContract?.input_schema) ? selectedNodeContract.input_schema : {};
  const selectedOutputSchema = isPlainObject(selectedNodeContract?.output_schema) ? selectedNodeContract.output_schema : {};
  const selectedInputSchemaKeys = schemaFieldKeys(selectedInputSchema);
  const selectedOutputSchemaKeys = schemaFieldKeys(selectedOutputSchema);
  const hasSelectedContract = Boolean(
    selectedNodeDefinition
    && (selectedInputSchemaKeys.length > 0 || selectedOutputSchemaKeys.length > 0 || Object.keys(selectedInputSchema).length > 0 || Object.keys(selectedOutputSchema).length > 0)
  );
  const assigneeType = String(selectedNode?.assignee?.type || "role");
  const assigneeValue = String(selectedNode?.assignee?.value || (assigneeType === "user" ? "" : "orgAdmin"));

  const selectedConfig = isPlainObject(selectedNode?.config) ? stripModelFields(selectedNode.config) : {};
  const selectedBindings = isPlainObject(selectedNode?.input_bindings) ? selectedNode.input_bindings : {};
  const defaultCreateDocContentPath = React.useMemo(
    () => suggestedCreateDocumentContentPath(String(previousNodeId || ""), String(previousNodeType || "")),
    [previousNodeId, previousNodeType]
  );

  const patchConfigField = React.useCallback((key: string, value: any) => {
    const next = {
      ...selectedConfig,
      [key]: value,
    };
    onPatchSelectedNode({ config: stripModelFields(next) });
  }, [onPatchSelectedNode, selectedConfig]);

  const patchBindingField = React.useCallback((key: string, value: string) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    const normalizedValue = String(value || "").trim();
    const next = {
      ...selectedBindings,
    };
    if (!normalizedValue) {
      delete next[normalizedKey];
    } else {
      next[normalizedKey] = normalizedValue;
    }
    onPatchSelectedNode({
      input_bindings: Object.keys(next).length > 0 ? next : null,
    });
  }, [onPatchSelectedNode, selectedBindings]);

  const nodeOptions = React.useMemo(() => {
    const options = supportsRegistry
      ? sortedNodeDefinitions.map((d) => ({ key: String(d.node_key), label: String(d.name || d.node_key) }))
      : [...FALLBACK_NODE_OPTIONS];

    if (nodeType && !options.some((o) => o.key === nodeType)) {
      options.unshift({ key: nodeType, label: friendlyNodeLabel(nodeType) });
    }

    return options;
  }, [nodeType, sortedNodeDefinitions, supportsRegistry]);

  const selectedNodeKey = selectedNodeRef?.key || nodeType || nodeOptions[0]?.key || "";

  const setNodeKey = React.useCallback((value: string) => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    if (supportsRegistry) {
      const found = sortedNodeDefinitions.find((d) => String(d.node_key) === normalized);
      const nextRef: Record<string, any> = {
        key: normalized,
      };
      const latestVersion = Number(found?.latest_version || 0);
      if (Number.isFinite(latestVersion) && latestVersion > 0) {
        nextRef.version = Math.trunc(latestVersion);
      }
      onPatchSelectedNode({
        node_ref: nextRef,
        nodeRef: null,
        node_type: normalized,
      });
      return;
    }
    onPatchSelectedNode({
      node_ref: null,
      nodeRef: null,
      node_type: normalized,
    });
  }, [onPatchSelectedNode, sortedNodeDefinitions, supportsRegistry]);

  React.useEffect(() => {
    const refKey = String(selectedNodeRef?.key || "").trim();
    if (!refKey) return;
    const currentType = normalizeNodeType(selectedNode?.node_type || "");
    if (currentType === normalizeNodeType(refKey)) return;
    onPatchSelectedNode({ node_type: refKey });
  }, [onPatchSelectedNode, selectedNode?.node_type, selectedNodeRef?.key]);

  const isAiPromptNode = nodeType === "ai.prompt";
  const isAiExtractNode = nodeType === "ai.extract";
  const isAiClassifyNode = nodeType === "ai.classify";
  const isSystemValidateNode = nodeType === "system.validate";
  const isSystemReconcileNode = nodeType === "system.reconcile";
  const isDmsListFolderNode = nodeType === "dms.list_folder";
  const isDmsSetMetadataNode = nodeType === "dms.set_metadata";
  const isFlowBranchNode = nodeType === "flow.branch";
  const isArtifactExportCsvNode = nodeType === "artifact.export_csv";
  const isDmsReadNode = nodeType === "dms.read_document";
  const isDmsCreateNode = nodeType === "dms.create_document";
  const isDmsMoveNode = nodeType === "dms.move_document";
  const dmsReadIncludeText = selectedConfig.include_text === true ? "true" : "false";
  const dmsReadMaxChars = Number.isFinite(Number(selectedConfig.max_chars))
    ? String(Math.trunc(Number(selectedConfig.max_chars)))
    : "12000";
  const dmsCreateFolderPath = toPathArray(selectedConfig.folder_path).join("/");
  const dmsMoveDestPath = toPathArray(selectedConfig.dest_path).join("/");
  const dmsListFolderPath = toPathArray(selectedConfig.folder_path).join("/");
  const dmsSetMetadataTags = toCsvArray(selectedConfig.tags).join(", ");
  const dmsSetMetadataKeywords = toCsvArray(selectedConfig.keywords).join(", ");
  const aiClassifyLabels = toCsvArray(selectedConfig.labels).join(", ");
  const aiExtractIncludeDocText = selectedConfig.include_doc_text === false ? "false" : "true";
  const aiClassifyMultiLabel = selectedConfig.multi_label === true ? "true" : "false";
  const systemValidateRequiredFields = toCsvArray(selectedConfig.required_fields).join(", ");
  const systemReconcileKeyFields = toCsvArray(selectedConfig.key_fields).join(", ");
  const flowBranchTruthyValues = toCsvArray(selectedConfig.truthy_values).join(", ");
  const artifactExportColumns = toCsvArray(selectedConfig.columns).join(", ");
  const artifactExportFolderPath = toPathArray(selectedConfig.folder_path).join("/");
  const aiResponseFormat = String(selectedConfig.response_format || "text").toLowerCase() === "json" ? "json" : "text";
  const aiIncludeDocText = selectedConfig.include_doc_text === false ? "false" : "true";
  const nodeOnErrorMode = String(selectedNode?.on_error || "").toLowerCase() === "continue" ? "continue" : "fail_fast";
  const nodeJoinMode = String(selectedNode?.join || "").toLowerCase() === "any" ? "any" : "all";

  React.useEffect(() => {
    if (!isDmsCreateNode) return;
    const hasMappedContent = String(selectedBindings?.content || "").trim().length > 0;
    const hasConfigContent = String(selectedConfig?.content || "").trim().length > 0;
    if (hasMappedContent || hasConfigContent) return;
    if (!defaultCreateDocContentPath) return;
    onPatchSelectedNode({
      input_bindings: {
        ...selectedBindings,
        content: defaultCreateDocContentPath,
      },
    });
  }, [defaultCreateDocContentPath, isDmsCreateNode, onPatchSelectedNode, selectedBindings, selectedConfig?.content]);

  const bindingFields = React.useMemo(() => {
    if (isAiPromptNode) {
      return [
        { key: "prompt", label: "Prompt", placeholder: "$.input.prompt", runInputPath: "$.input.prompt" },
        { key: "doc_id", label: "Source Document (single)", placeholder: "$.input.doc_id", runInputPath: "$.input.doc_id" },
        { key: "doc_ids", label: "Source Documents", placeholder: "$.input.doc_ids", runInputPath: "$.input.doc_ids" },
        { key: "response_format", label: "Response Format", placeholder: "$.input.response_format", runInputPath: "$.input.response_format" },
      ];
    }
    if (isAiExtractNode) {
      return [
        { key: "doc_id", label: "Source Document (single)", placeholder: "$.input.doc_id", runInputPath: "$.input.doc_id" },
        { key: "doc_ids", label: "Source Documents", placeholder: "$.input.doc_ids", runInputPath: "$.input.doc_ids" },
        { key: "text", label: "Source Text", placeholder: "$.input.text", runInputPath: "$.input.text" },
      ];
    }
    if (isAiClassifyNode) {
      return [
        { key: "doc_id", label: "Source Document (single)", placeholder: "$.input.doc_id", runInputPath: "$.input.doc_id" },
        { key: "doc_ids", label: "Source Documents", placeholder: "$.input.doc_ids", runInputPath: "$.input.doc_ids" },
        { key: "text", label: "Source Text", placeholder: "$.input.text", runInputPath: "$.input.text" },
        { key: "labels", label: "Labels", placeholder: "$.input.labels", runInputPath: "$.input.labels" },
      ];
    }
    if (isDmsReadNode) {
      return [
        { key: "doc_id", label: "Source Document (single)", placeholder: "$.input.doc_id", runInputPath: "$.input.doc_id" },
        { key: "doc_ids", label: "Source Documents", placeholder: "$.input.doc_ids", runInputPath: "$.input.doc_ids" },
      ];
    }
    if (isDmsCreateNode) {
      return [
        { key: "title", label: "Title", placeholder: "$.input.title", runInputPath: "$.input.title" },
        { key: "content", label: "Content", placeholder: "$.steps.some_step.output.response_text", runInputPath: "$.input.content" },
        { key: "filename", label: "Filename", placeholder: "$.input.filename", runInputPath: "$.input.filename" },
      ];
    }
    if (isDmsMoveNode) {
      return [
        { key: "doc_id", label: "Source Document (single)", placeholder: "$.input.doc_id", runInputPath: "$.input.doc_id" },
        { key: "doc_ids", label: "Source Documents", placeholder: "$.input.doc_ids", runInputPath: "$.input.doc_ids" },
        { key: "dest_path", label: "Destination Folder", placeholder: "$.input.dest_path", runInputPath: "$.input.dest_path" },
      ];
    }
    if (isDmsListFolderNode) {
      return [
        { key: "folder_path", label: "Folder Path", placeholder: "$.input.folder_path", runInputPath: "$.input.folder_path" },
        { key: "recursive", label: "Recursive", placeholder: "$.input.recursive", runInputPath: "$.input.recursive" },
        { key: "limit", label: "Limit", placeholder: "$.input.limit", runInputPath: "$.input.limit" },
      ];
    }
    if (isDmsSetMetadataNode) {
      return [
        { key: "doc_id", label: "Source Document (single)", placeholder: "$.input.doc_id", runInputPath: "$.input.doc_id" },
        { key: "doc_ids", label: "Source Documents", placeholder: "$.input.doc_ids", runInputPath: "$.input.doc_ids" },
        { key: "tags", label: "Tags", placeholder: "$.input.tags", runInputPath: "$.input.tags" },
        { key: "keywords", label: "Keywords", placeholder: "$.input.keywords", runInputPath: "$.input.keywords" },
      ];
    }
    if (isSystemValidateNode) {
      return [
        { key: "data", label: "Validation Payload", placeholder: "$.steps.some_step.output", runInputPath: "$.input" },
        { key: "required_fields", label: "Required Fields", placeholder: "$.input.required_fields", runInputPath: "$.input.required_fields" },
      ];
    }
    if (isSystemReconcileNode) {
      return [
        { key: "records", label: "Records To Compare", placeholder: "$.steps.some_step.output.records", runInputPath: "$.input.records" },
        { key: "key_fields", label: "Key Fields", placeholder: "$.input.key_fields", runInputPath: "$.input.key_fields" },
      ];
    }
    if (isFlowBranchNode) {
      return [
        { key: "expression", label: "Branch Expression", placeholder: "$.input.expression", runInputPath: "$.input.expression" },
        { key: "value", label: "Value To Check", placeholder: "$.steps.some_step.output.valid", runInputPath: "$.input.value" },
      ];
    }
    if (isArtifactExportCsvNode) {
      return [
        { key: "rows", label: "Rows To Export", placeholder: "$.steps.some_step.output.records", runInputPath: "$.input.rows" },
        { key: "columns", label: "Export Columns", placeholder: "$.input.columns", runInputPath: "$.input.columns" },
      ];
    }
    return [];
  }, [
    isAiClassifyNode,
    isAiExtractNode,
    isAiPromptNode,
    isArtifactExportCsvNode,
    isDmsCreateNode,
    isDmsListFolderNode,
    isDmsMoveNode,
    isDmsReadNode,
    isDmsSetMetadataNode,
    isFlowBranchNode,
    isSystemReconcileNode,
    isSystemValidateNode,
  ]);

  const applyRunInputBindings = React.useCallback(() => {
    if (bindingFields.length === 0) return;
    const next = {
      ...selectedBindings,
    };
    for (const field of bindingFields) {
      if (!field.runInputPath) continue;
      next[field.key] = field.runInputPath;
    }
    onPatchSelectedNode({
      input_bindings: Object.keys(next).length > 0 ? next : null,
    });
  }, [bindingFields, onPatchSelectedNode, selectedBindings]);

  const clearAllBindings = React.useCallback(() => {
    onPatchSelectedNode({ input_bindings: null });
  }, [onPatchSelectedNode]);

  const activeBindingCount = Object.keys(selectedBindings).length;
  const isDocInputNode = isAiPromptNode || isAiExtractNode || isAiClassifyNode || isDmsReadNode || isDmsMoveNode || isDmsSetMetadataNode;

  return (
    <div className="h-full min-h-[460px] rounded-lg border border-border/50 bg-card/60 overflow-hidden flex flex-col">
      <div className="px-3 py-2.5 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{hideGeneralTab ? "Node Setup" : "Workflow Inspector"}</div>
        {hasSelectedNode ? (
          <div className="text-[11px] text-muted-foreground">{selectedStepPosition} / {totalNodes}</div>
        ) : null}
      </div>

      <Tabs
        value={hideGeneralTab ? "step" : activeTab}
        onValueChange={(value) => {
          if (hideGeneralTab) return;
          setActiveTab(value as "general" | "step");
        }}
        className="flex-1 min-h-0 flex flex-col"
      >
        {hideGeneralTab ? null : (
          <div className="px-3 py-2 border-b border-border/40">
            <TabsList className="grid w-full grid-cols-2 h-8 bg-muted/40 p-0.5">
              <TabsTrigger value="general" className="h-8 text-sm">General</TabsTrigger>
              <TabsTrigger value="step" className="h-8 text-sm">Step</TabsTrigger>
            </TabsList>
          </div>
        )}

        {hideGeneralTab ? null : (
          <TabsContent value="general" className="m-0 p-3 space-y-3 flex-1 overflow-auto">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Workflow Name</div>
              <Input value={templateName} onChange={(e) => onTemplateNameChange(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Description</div>
              <Textarea value={templateDescription} onChange={(e) => onTemplateDescriptionChange(e.target.value)} className="min-h-[96px] text-sm" />
            </div>
            <div className="text-sm text-muted-foreground rounded border border-border/40 p-2 bg-background/40">
              {hasSelectedNode
                ? "Step-specific controls are available in the Step tab."
                : "Select any step from the visual flow to configure step details."}
            </div>
          </TabsContent>
        )}

        <TabsContent value="step" className="m-0 flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
          {!hasSelectedNode ? (
            <div className="p-3 flex-1 overflow-auto">
              <div className="rounded border border-border/40 bg-background/40 p-3 text-sm text-muted-foreground">
                Select any step on the canvas to edit its settings.
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 space-y-3 flex-1 overflow-auto">
                <div className="rounded border border-border/40 p-2 bg-background/40">
                  <div className="text-sm text-muted-foreground">Selected Step</div>
                  <div className="text-sm font-medium mt-0.5">{friendlyNodeLabel(nodeType)}</div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-1">{nodeType || "node type missing"}</div>
                  <div className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{nodeExecutionDescription(nodeType)}</div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground mb-1">Step ID</div>
                  <Input
                    value={String(selectedNode?.id || "")}
                    onChange={(e) => onPatchSelectedNode({ id: e.target.value })}
                    onBlur={(e) => {
                      const normalized = sanitizeStepId(e.target.value);
                      if (normalized && normalized !== String(selectedNode?.id || "")) {
                        onPatchSelectedNode({ id: normalized });
                      }
                    }}
                    className="h-9 text-sm"
                  />
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Use letters/numbers with <span className="font-mono">_</span> or <span className="font-mono">-</span>. Must start with a letter (example: <span className="font-mono">classify_docs</span>).
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground mb-1">Step Type</div>
                  <Select value={selectedNodeKey || undefined} onValueChange={setNodeKey}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a step type" /></SelectTrigger>
                    <SelectContent>
                      {nodeOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label} ({option.key})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!supportsRegistry ? (
                    <div className="text-[11px] text-muted-foreground mt-1">Node library unavailable. Showing basic step types.</div>
                  ) : null}
                </div>

                {hasSelectedContract ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Node Contract (Expected I/O)</div>
                    <div className="text-[11px] text-muted-foreground">
                      {selectedNodeDefinition ? `${selectedNodeDefinition.name} (${selectedNodeDefinition.node_key})` : "Resolved from registry"}
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="rounded border border-border/30 bg-background/50 p-2">
                        <div className="text-[11px] font-medium">Expected Input</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {selectedInputSchemaKeys.length > 0 ? selectedInputSchemaKeys.join(", ") : "Schema does not declare specific properties."}
                        </div>
                        <pre className="mt-2 max-h-28 overflow-auto rounded bg-background/80 p-2 text-[10px] leading-relaxed">
                          {schemaPreview(selectedInputSchema)}
                        </pre>
                      </div>
                      <div className="rounded border border-border/30 bg-background/50 p-2">
                        <div className="text-[11px] font-medium">Expected Output</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {selectedOutputSchemaKeys.length > 0 ? selectedOutputSchemaKeys.join(", ") : "Schema does not declare specific properties."}
                        </div>
                        <pre className="mt-2 max-h-28 overflow-auto rounded bg-background/80 p-2 text-[10px] leading-relaxed">
                          {schemaPreview(selectedOutputSchema)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isAiPromptNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">AI Prompt Settings</div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Prompt Template</div>
                      <Textarea
                        value={String(selectedConfig.prompt_template || "")}
                        onChange={(e) => patchConfigField("prompt_template", e.target.value)}
                        className="min-h-[96px] text-sm"
                        placeholder="Summarize this document set in 5 bullets"
                      />
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Temperature</div>
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        max={2}
                        value={String(selectedConfig.temperature ?? 0.2)}
                        onChange={(e) => {
                          const parsed = Number(e.target.value || 0);
                          patchConfigField("temperature", Number.isFinite(parsed) ? parsed : 0);
                        }}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Response Format</div>
                        <Select value={aiResponseFormat} onValueChange={(value) => patchConfigField("response_format", value)}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="json">JSON</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Include Doc Text</div>
                        <Select value={aiIncludeDocText} onValueChange={(value) => patchConfigField("include_doc_text", value === "true") }>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isAiExtractNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">AI Extract Settings</div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Prompt Template</div>
                      <Textarea
                        value={String(selectedConfig.prompt_template || "")}
                        onChange={(e) => patchConfigField("prompt_template", e.target.value)}
                        className="min-h-[84px] text-sm"
                        placeholder="Extract the required fields from source content."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Temperature</div>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          max={2}
                          value={String(selectedConfig.temperature ?? 0.1)}
                          onChange={(e) => {
                            const parsed = Number(e.target.value || 0);
                            patchConfigField("temperature", Number.isFinite(parsed) ? parsed : 0);
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Include Doc Text</div>
                        <Select value={aiExtractIncludeDocText} onValueChange={(value) => patchConfigField("include_doc_text", value === "true")}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isAiClassifyNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">AI Classify Settings</div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Labels (comma-separated)</div>
                      <Input
                        value={aiClassifyLabels}
                        onChange={(e) => patchConfigField("labels", toCsvArray(e.target.value))}
                        className="h-9 text-sm"
                        placeholder="invoice, agreement, kyc"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Threshold</div>
                        <Input
                          type="number"
                          step="0.05"
                          min={0}
                          max={1}
                          value={String(selectedConfig.threshold ?? 0.5)}
                          onChange={(e) => {
                            const parsed = Number(e.target.value || 0);
                            const bounded = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0.5;
                            patchConfigField("threshold", bounded);
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Multi-label</div>
                        <Select value={aiClassifyMultiLabel} onValueChange={(value) => patchConfigField("multi_label", value === "true")}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="false">No</SelectItem>
                            <SelectItem value="true">Yes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isDmsCreateNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Create Document Settings</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Title</div>
                        <Input
                          value={String(selectedConfig.title || "")}
                          onChange={(e) => patchConfigField("title", e.target.value)}
                          className="h-9 text-sm"
                          placeholder="Workflow Summary"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Filename</div>
                        <Input
                          value={String(selectedConfig.filename || "")}
                          onChange={(e) => patchConfigField("filename", e.target.value)}
                          className="h-9 text-sm"
                          placeholder="summary.md"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Mime Type</div>
                        <Input
                          value={String(selectedConfig.mime_type || "text/markdown")}
                          onChange={(e) => patchConfigField("mime_type", e.target.value)}
                          className="h-9 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Folder Path</div>
                        <Input
                          value={dmsCreateFolderPath}
                          onChange={(e) => patchConfigField("folder_path", toPathArray(e.target.value))}
                          className="h-9 text-sm font-mono"
                          placeholder="Workflows/Outputs"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {isDmsReadNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Read Document Settings</div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Fixed Source Document (optional)</div>
                      <Input
                        value={String(selectedConfig.doc_id || "")}
                        onChange={(e) => patchConfigField("doc_id", e.target.value)}
                        className="h-9 text-sm"
                        placeholder="Leave empty to use runtime input"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Include Text</div>
                        <Select value={dmsReadIncludeText} onValueChange={(value) => patchConfigField("include_text", value === "true")}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Max Chars</div>
                        <Input
                          type="number"
                          min={100}
                          max={200000}
                          step={100}
                          value={dmsReadMaxChars}
                          onChange={(e) => {
                            const parsed = Number(e.target.value || 0);
                            const bounded = Number.isFinite(parsed)
                              ? Math.max(100, Math.min(200000, Math.trunc(parsed)))
                              : 12000;
                            patchConfigField("max_chars", bounded);
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {isDocInputNode ? (
                  <div className="rounded border border-border/40 p-2 bg-background/40 text-[11px] text-muted-foreground leading-relaxed">
                    Input source behavior: if no fixed document is set, this step uses run input or mapped values from earlier steps.
                  </div>
                ) : null}

                {isDmsMoveNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Move Document Settings</div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Destination Path</div>
                      <Input
                        value={dmsMoveDestPath}
                        onChange={(e) => patchConfigField("dest_path", toPathArray(e.target.value))}
                        className="h-9 text-sm font-mono"
                        placeholder="Contracts/Reviewed"
                      />
                    </div>
                  </div>
                ) : null}

                {isDmsListFolderNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">List Folder Settings</div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Folder Path</div>
                      <Input
                        value={dmsListFolderPath}
                        onChange={(e) => patchConfigField("folder_path", toPathArray(e.target.value))}
                        className="h-9 text-sm font-mono"
                        placeholder="Inbox/Leases"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Recursive</div>
                        <Select value={selectedConfig.recursive === true ? "true" : "false"} onValueChange={(value) => patchConfigField("recursive", value === "true")}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="false">No</SelectItem>
                            <SelectItem value="true">Yes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Limit</div>
                        <Input
                          type="number"
                          min={1}
                          max={500}
                          step={1}
                          value={String(selectedConfig.limit ?? 100)}
                          onChange={(e) => {
                            const parsed = Number(e.target.value || 0);
                            const bounded = Number.isFinite(parsed) ? Math.max(1, Math.min(500, Math.trunc(parsed))) : 100;
                            patchConfigField("limit", bounded);
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {isDmsSetMetadataNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Set Metadata Settings</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Tags</div>
                        <Input
                          value={dmsSetMetadataTags}
                          onChange={(e) => patchConfigField("tags", toCsvArray(e.target.value))}
                          className="h-9 text-sm"
                          placeholder="workflow, reviewed"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Keywords</div>
                        <Input
                          value={dmsSetMetadataKeywords}
                          onChange={(e) => patchConfigField("keywords", toCsvArray(e.target.value))}
                          className="h-9 text-sm"
                          placeholder="lease, summary"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Category</div>
                        <Input
                          value={String(selectedConfig.category || "")}
                          onChange={(e) => patchConfigField("category", e.target.value)}
                          className="h-9 text-sm"
                          placeholder="Workflow Outputs"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Merge Existing</div>
                        <Select value={selectedConfig.merge === false ? "false" : "true"} onValueChange={(value) => patchConfigField("merge", value === "true")}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isSystemValidateNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Validation Settings</div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Required Fields (comma-separated)</div>
                      <Input
                        value={systemValidateRequiredFields}
                        onChange={(e) => patchConfigField("required_fields", toCsvArray(e.target.value))}
                        className="h-9 text-sm"
                        placeholder="tenant.name, tenant.email"
                      />
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Fail On Warning</div>
                      <Select value={selectedConfig.fail_on_warning === true ? "true" : "false"} onValueChange={(value) => patchConfigField("fail_on_warning", value === "true")}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">No</SelectItem>
                          <SelectItem value="true">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}

                {isSystemReconcileNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Reconcile Settings</div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Key Fields (comma-separated)</div>
                      <Input
                        value={systemReconcileKeyFields}
                        onChange={(e) => patchConfigField("key_fields", toCsvArray(e.target.value))}
                        className="h-9 text-sm"
                        placeholder="invoice_number, amount, due_date"
                      />
                    </div>
                  </div>
                ) : null}

                {isFlowBranchNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Branch Settings</div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Expression</div>
                      <Input
                        value={String(selectedConfig.expression || "")}
                        onChange={(e) => patchConfigField("expression", e.target.value)}
                        className="h-9 text-sm font-mono"
                        placeholder="$.steps.validate.output.valid == true"
                      />
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Truthy Values (comma-separated)</div>
                      <Input
                        value={flowBranchTruthyValues}
                        onChange={(e) => patchConfigField("truthy_values", toCsvArray(e.target.value))}
                        className="h-9 text-sm"
                        placeholder="pass, approved, true"
                      />
                    </div>
                  </div>
                ) : null}

                {isArtifactExportCsvNode ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">CSV Export Settings</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Title</div>
                        <Input
                          value={String(selectedConfig.title || "")}
                          onChange={(e) => patchConfigField("title", e.target.value)}
                          className="h-9 text-sm"
                          placeholder="Reconciliation Export"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Filename</div>
                        <Input
                          value={String(selectedConfig.filename || "")}
                          onChange={(e) => patchConfigField("filename", e.target.value)}
                          className="h-9 text-sm"
                          placeholder="reconciliation.csv"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Folder Path</div>
                        <Input
                          value={artifactExportFolderPath}
                          onChange={(e) => patchConfigField("folder_path", toPathArray(e.target.value))}
                          className="h-9 text-sm font-mono"
                          placeholder="Workflows/Exports"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Columns (comma-separated)</div>
                        <Input
                          value={artifactExportColumns}
                          onChange={(e) => patchConfigField("columns", toCsvArray(e.target.value))}
                          className="h-9 text-sm"
                          placeholder="id,status,reason"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {bindingFields.length > 0 ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Input Mapping</div>
                    <div className="text-[11px] text-muted-foreground">
                      Choose how this step gets runtime values.
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" className="h-8 px-2 text-sm" onClick={applyRunInputBindings}>
                        Use Run Input Defaults
                      </Button>
                      {isDmsCreateNode && defaultCreateDocContentPath ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-sm"
                          onClick={() => patchBindingField("content", defaultCreateDocContentPath)}
                        >
                          Use Previous Step Output
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" className="h-8 px-2 text-sm" onClick={clearAllBindings}>
                        Clear Mapping
                      </Button>
                      <Badge variant="outline" className="h-6 text-[10px]">
                        {activeBindingCount} mapped
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      JSON path examples: <span className="font-mono">$.input.doc_id</span>, <span className="font-mono">$.steps.step_1.output.records</span>
                    </div>
                    <div className="space-y-2">
                      {bindingFields.map((field) => (
                        <div key={field.key}>
                          <div className="text-sm text-muted-foreground mb-1">{field.label}</div>
                          <Input
                            value={String(selectedBindings[field.key] || "")}
                            onChange={(e) => patchBindingField(field.key, e.target.value)}
                            className="h-9 text-sm font-mono"
                            placeholder={field.placeholder}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {schemaVersion === 2 ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Execution Controls</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">On Error</div>
                        <Select value={nodeOnErrorMode} onValueChange={(value) => onPatchSelectedNode({ on_error: value === "continue" ? "continue" : "fail_fast" })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fail_fast">fail_fast</SelectItem>
                            <SelectItem value="continue">continue</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Join Mode</div>
                        <Select value={nodeJoinMode} onValueChange={(value) => onPatchSelectedNode({ join: value === "any" ? "any" : "all" })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">all</SelectItem>
                            <SelectItem value="any">any</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Join mode is used when this node has multiple incoming edges.
                    </div>
                  </div>
                ) : null}

                {nodeType.startsWith("human.") ? (
                  <div className="space-y-2 rounded border border-border/40 p-2 bg-background/40">
                    <div className="text-sm font-medium">Assignment</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={assigneeType}
                        onValueChange={(value) => onPatchSelectedNode({
                          assignee: {
                            ...(selectedNode?.assignee || {}),
                            type: value,
                            value: value === "user" ? "" : String(selectedNode?.assignee?.value || "orgAdmin"),
                          },
                        })}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="role">Role</SelectItem>
                          <SelectItem value="user">User</SelectItem>
                        </SelectContent>
                      </Select>

                      {assigneeType === "user" ? (
                        <Select
                          value={assigneeValue}
                          onValueChange={(value) => onPatchSelectedNode({ assignee: { type: "user", value } })}
                        >
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select user" /></SelectTrigger>
                          <SelectContent>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.label} ({u.role})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select
                          value={assigneeValue}
                          onValueChange={(value) => onPatchSelectedNode({ assignee: { type: "role", value } })}
                        >
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {roleOptions.map((role) => (
                              <SelectItem key={role} value={role}>{role}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="px-3 py-2 border-t border-border/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onMoveSelectedNode(-1)} disabled={selectedIndex === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onMoveSelectedNode(1)} disabled={isLastSelectedStep}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button size="sm" variant="destructive" onClick={onDeleteSelectedNode}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Remove
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
