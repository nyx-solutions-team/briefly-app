export type WorkflowNodeKind =
  | 'trigger'
  | 'manual'
  | 'human'
  | 'ai'
  | 'system'
  | 'condition'
  | 'transform'
  | 'notification'
  | 'unknown';

export type WorkflowGraphNode = {
  id: string;
  index: number;
  nodeId: string;
  nodeType: string;
  label: string;
  kind: WorkflowNodeKind;
  outputKey?: string | null;
  assignee?: { type?: string; value?: string } | null;
  status?: string | null;
  durationMs?: number | null;
  position: { x: number; y: number };
  raw?: any;
};

export type WorkflowGraphEdge = {
  id: string;
  from: string;
  to: string;
  active?: boolean;
};

export function normalizeNodeType(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function resolveDefinitionNodeType(node: any): string {
  return normalizeNodeType(
    node?.node_type
    || node?.type
    || node?.node_ref?.key
    || node?.nodeRef?.key
    || ''
  );
}

function resolveNodeDisplayLabel(nodeType: string, definitionNode?: any, step?: any): string {
  const preferred = [
    definitionNode?.title,
    definitionNode?.name,
    step?.input?.node?.title,
    step?.input?.node?.name,
  ].map((value) => String(value || '').trim()).find(Boolean);
  if (preferred) return preferred;
  return friendlyNodeLabel(nodeType);
}

export function nodeKindFromType(nodeType: string): WorkflowNodeKind {
  const key = normalizeNodeType(nodeType);
  if (!key) return 'unknown';
  if (key.includes('trigger')) return 'trigger';
  if (key.includes('manual')) return 'manual';
  if (key.startsWith('human.') || key.includes('approval') || key.includes('review')) return 'human';
  if (key.startsWith('ai.') || key.includes('llm') || key.includes('gemini') || key.includes('openai')) return 'ai';
  if (key.startsWith('dms.')) return 'system';
  if (key.startsWith('artifact.')) return 'system';
  if (key.includes('condition') || key.includes('branch') || key.includes('route')) return 'condition';
  if (key.includes('transform') || key.includes('map') || key.includes('convert') || key.includes('aggregate') || key.includes('for_each')) return 'transform';
  if (key.includes('notify') || key.includes('email') || key.includes('slack')) return 'notification';
  if (key.startsWith('system.') || key.includes('evaluate') || key.includes('validate') || key.includes('reconcile')) return 'system';
  return 'unknown';
}

export function friendlyNodeLabel(nodeType: string): string {
  const key = normalizeNodeType(nodeType);
  if (key === 'ai.parse_ruleset') return 'Read Ruleset';
  if (key === 'ai.extract_facts') return 'Extract Facts';
  if (key === 'system.evaluate') return 'Evaluate Findings';
  if (key === 'ai.generate_report') return 'Generate Report';
  if (key === 'system.reconcile') return 'Reconcile Data';
  if (key === 'system.enumerate_docs') return 'Enumerate Documents';
  if (key === 'human.approval') return 'Human Approval';
  if (key === 'human.checklist') return 'Checklist Task';
  if (key === 'human.legal_review') return 'Legal Review';
  if (key === 'human.task') return 'Human Task';
  if (key === 'human.review') return 'Human Review';
  if (key.startsWith('human.')) return 'Human Step';
  if (key === 'manual.trigger') return 'Manual Trigger';
  if (key === 'chat.trigger') return 'Chat Trigger';
  if (key === 'ai.prompt') return 'AI Prompt';
  if (key === 'ai.extract') return 'AI Extract';
  if (key === 'ai.classify') return 'AI Classify';
  if (key === 'dms.read_document') return 'Read Document';
  if (key === 'dms.list_folder') return 'List Folder';
  if (key === 'dms.set_metadata') return 'Set Metadata';
  if (key === 'dms.create_document') return 'Create Document';
  if (key === 'dms.move_document') return 'Move Document';
  if (key === 'system.validate') return 'Validate';
  if (key === 'system.reconcile') return 'Reconcile';
  if (key === 'system.packet_check') return 'Packet Check';
  if (key === 'flow.branch') return 'Branch';
  if (key === 'flow.route') return 'Rule Router';
  if (key === 'flow.for_each') return 'For Each';
  if (key === 'flow.aggregate') return 'Merge Results';
  if (key === 'artifact.export_csv') return 'Export CSV';
  if (!key) return 'Workflow Step';
  return key.split('.').map((part) => {
    if (!part) return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ');
}

const SPECIALIZED_AUTOMATED_NODES = new Set([
  'ai.parse_ruleset',
  'ai.extract_facts',
  'system.evaluate',
  'ai.generate_report',
]);

export function nodeExecutionDescription(nodeType: string): string {
  const key = normalizeNodeType(nodeType);
  if (!key) return 'Execution profile unknown.';
  if (key === 'manual.trigger' || key === 'chat.trigger') {
    return 'Trigger marker step. It records run start and does not perform processing.';
  }
  if (key.startsWith('human.')) {
    return 'Human-gated step. The run pauses in waiting state until task sign-off.';
  }
  if (key === 'ai.prompt') {
    return 'AI generation step. Uses prompt + optional document context to produce text or JSON.';
  }
  if (key === 'ai.extract') {
    return 'AI extraction step. Produces structured fields from document context.';
  }
  if (key === 'ai.classify') {
    return 'AI classification step. Assigns labels with confidence scores.';
  }
  if (key === 'dms.list_folder') {
    return 'DMS read step. Lists documents from a target folder.';
  }
  if (key === 'dms.create_document') {
    return 'DMS action step. Creates a new document file in the target folder.';
  }
  if (key === 'dms.set_metadata') {
    return 'DMS action step. Applies tags/keywords/category metadata to one or more documents.';
  }
  if (key === 'dms.read_document') {
    return 'DMS read step. Loads document metadata and optional extracted text for downstream nodes.';
  }
  if (key === 'dms.move_document') {
    return 'DMS action step. Moves one or more documents to the destination folder.';
  }
  if (key === 'system.validate') {
    return 'System validation step. Evaluates payload fields against configured rules.';
  }
  if (key === 'system.reconcile') {
    return 'System reconciliation step. Compares records and reports mismatches.';
  }
  if (key === 'system.packet_check') {
    return 'System packet check step. Verifies required document patterns/types are present.';
  }
  if (key === 'flow.branch') {
    return 'Flow control step. Routes execution based on expression or truthy checks.';
  }
  if (key === 'flow.route') {
    return 'Flow routing step. Selects one named route from rule expressions or value map.';
  }
  if (key === 'flow.for_each') {
    return 'Flow transform step. Normalizes item collections for downstream processing.';
  }
  if (key === 'flow.aggregate') {
    return 'Flow transform step. Merges outputs from multiple previous steps into one payload.';
  }
  if (key === 'artifact.export_csv') {
    return 'Artifact generation step. Exports rows as CSV and stores the file in DMS.';
  }
  if (SPECIALIZED_AUTOMATED_NODES.has(key)) {
    return 'Specialized automated step with workflow-specific output behavior.';
  }
  if (key.startsWith('ai.') || key.startsWith('system.')) {
    return 'Generic automated step. It runs through the shared automation path.';
  }
  return 'Custom/legacy step behavior depends on node contract and executor implementation.';
}

function durationBetween(startAt: any, completedAt: any): number | null {
  const started = startAt ? new Date(startAt).getTime() : NaN;
  const finished = completedAt ? new Date(completedAt).getTime() : NaN;
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return null;
  return Math.max(0, finished - started);
}

function buildZigzagPosition(index: number) {
  return {
    x: 80 + (index * 290),
    y: index % 2 === 0 ? 90 : 290,
  };
}

type NormalizedDefinitionGraph = {
  schemaVersion: 1 | 2;
  nodes: any[];
  edges: any[];
};

function normalizeDefinitionGraphInput(definitionOrNodes: any): NormalizedDefinitionGraph {
  if (Array.isArray(definitionOrNodes)) {
    return {
      schemaVersion: 1,
      nodes: definitionOrNodes,
      edges: [],
    };
  }
  const definition = definitionOrNodes && typeof definitionOrNodes === 'object'
    ? definitionOrNodes
    : {};
  return {
    schemaVersion: Number(definition?.schema_version) === 2 ? 2 : 1,
    nodes: Array.isArray(definition?.nodes) ? definition.nodes : [],
    edges: Array.isArray(definition?.edges) ? definition.edges : [],
  };
}

function edgeIsActive(fromNode: WorkflowGraphNode | undefined, toNode: WorkflowGraphNode | undefined): boolean {
  const fromDone = ['succeeded', 'failed', 'skipped', 'cancelled'].includes(String(fromNode?.status || '').toLowerCase());
  const toRunning = ['running', 'waiting'].includes(String(toNode?.status || '').toLowerCase());
  return fromDone && toRunning;
}

function buildEdgesFromDefinition(
  definitionEdges: any[],
  nodeIdToGraphId: Map<string, string>,
  graphNodeById?: Map<string, WorkflowGraphNode>
): WorkflowGraphEdge[] {
  const out: WorkflowGraphEdge[] = [];
  const used = new Set<string>();
  for (let i = 0; i < definitionEdges.length; i += 1) {
    const edge = definitionEdges[i] || {};
    const fromNodeId = String(edge?.from || '').trim();
    const toNodeId = String(edge?.to || '').trim();
    if (!fromNodeId || !toNodeId) continue;

    const from = nodeIdToGraphId.get(fromNodeId);
    const to = nodeIdToGraphId.get(toNodeId);
    if (!from || !to) continue;

    const baseId = String(edge?.id || `${fromNodeId}_${toNodeId}_${i + 1}`).trim() || `${fromNodeId}_${toNodeId}_${i + 1}`;
    let edgeId = baseId;
    let suffix = 2;
    while (used.has(edgeId)) {
      edgeId = `${baseId}_${suffix}`;
      suffix += 1;
    }
    used.add(edgeId);

    const nextEdge: WorkflowGraphEdge = {
      id: edgeId,
      from,
      to,
    };
    if (graphNodeById) {
      const fromNode = graphNodeById.get(from);
      const toNode = graphNodeById.get(to);
      nextEdge.active = edgeIsActive(fromNode, toNode);
    }
    out.push(nextEdge);
  }
  return out;
}

export function buildDefinitionGraph(definitionOrNodes: any = []): { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } {
  const normalized = normalizeDefinitionGraphInput(definitionOrNodes);
  const graphNodes: WorkflowGraphNode[] = normalized.nodes.map((node, index) => {
    const nodeType = resolveDefinitionNodeType(node);
    const nodeId = String(node?.id || `step_${index + 1}`);
    return {
      id: `${nodeId}__${index}`,
      index,
      nodeId,
      nodeType,
      label: resolveNodeDisplayLabel(nodeType, node, null),
      kind: nodeKindFromType(nodeType),
      outputKey: typeof node?.output === 'string' ? node.output : null,
      assignee: typeof node?.assignee === 'object' && node?.assignee ? node.assignee : null,
      position: buildZigzagPosition(index),
      raw: node,
    };
  });

  const nodeIdToGraphId = new Map<string, string>();
  for (const node of graphNodes) {
    nodeIdToGraphId.set(node.nodeId, node.id);
  }

  let edges: WorkflowGraphEdge[] = [];
  if (normalized.schemaVersion === 2) {
    edges = buildEdgesFromDefinition(normalized.edges, nodeIdToGraphId);
  } else {
    for (let i = 0; i < graphNodes.length - 1; i += 1) {
      edges.push({
        id: `${graphNodes[i].id}->${graphNodes[i + 1].id}`,
        from: graphNodes[i].id,
        to: graphNodes[i + 1].id,
      });
    }
  }

  return { nodes: graphNodes, edges };
}

export function buildRunGraph(steps: any[] = []): { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } {
  const sorted = [...(Array.isArray(steps) ? steps : [])].sort((a, b) => {
    const aTime = new Date(a?.started_at || a?.created_at || 0).getTime();
    const bTime = new Date(b?.started_at || b?.created_at || 0).getTime();
    return aTime - bTime;
  });

  const nodes: WorkflowGraphNode[] = sorted.map((step, index) => {
    const nodeType = normalizeNodeType(step?.node_type || step?.node_id || '');
    const nodeId = String(step?.node_id || step?.id || `step_${index + 1}`);
    return {
      id: String(step?.id || `${nodeId}__${index}`),
      index,
      nodeId,
      nodeType,
      label: friendlyNodeLabel(nodeType),
      kind: nodeKindFromType(nodeType),
      status: typeof step?.status === 'string' ? step.status : null,
      durationMs: durationBetween(step?.started_at, step?.completed_at),
      position: buildZigzagPosition(index),
      raw: step,
    };
  });

  const edges: WorkflowGraphEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const fromNode = nodes[i];
    const toNode = nodes[i + 1];
    const fromDone = ['succeeded', 'failed', 'skipped', 'cancelled'].includes(String(fromNode.status || '').toLowerCase());
    const toRunning = ['running', 'waiting'].includes(String(toNode.status || '').toLowerCase());
    edges.push({
      id: `${fromNode.id}->${toNode.id}`,
      from: fromNode.id,
      to: toNode.id,
      active: fromDone && toRunning,
    });
  }

  return { nodes, edges };
}

function pickLatestStepByNode(steps: any[] = []): Map<string, any> {
  const out = new Map<string, any>();
  const byNodeType = new Map<string, any>();
  
  for (const step of steps || []) {
    const nodeId = String(step?.node_id || '').trim();
    const nodeType = String(step?.node_type || '').trim().toLowerCase();
    
    if (nodeId) {
      const prev = out.get(nodeId);
      if (!prev) {
        out.set(nodeId, step);
        continue;
      }
      const prevAttempt = Number(prev?.attempt || 0);
      const nextAttempt = Number(step?.attempt || 0);
      if (nextAttempt > prevAttempt) {
        out.set(nodeId, step);
        continue;
      }
      if (nextAttempt < prevAttempt) continue;
      const prevTs = new Date(prev?.started_at || prev?.completed_at || 0).getTime();
      const nextTs = new Date(step?.started_at || step?.completed_at || 0).getTime();
      if (nextTs >= prevTs) out.set(nodeId, step);
    }
    
    if (nodeType && !byNodeType.has(nodeType)) {
      byNodeType.set(nodeType, step);
    }
  }
  
  (out as any).byNodeType = byNodeType;
  return out;
}

export function buildLiveRunGraph(
  definitionOrNodes: any = [],
  steps: any[] = []
): { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } {
  const normalized = normalizeDefinitionGraphInput(definitionOrNodes);
  const defNodes = normalized.nodes;
  const stepList = Array.isArray(steps) ? steps : [];
  const latestByNode = pickLatestStepByNode(stepList);
  const definitionNodeIds = new Set<string>();
  const definitionNodeIdToGraphNodeId = new Map<string, string>();

  const nodes: WorkflowGraphNode[] = defNodes.map((defNode, index) => {
    const defNodeId = String(defNode?.id || `step_${index + 1}`);
    definitionNodeIds.add(defNodeId);
    let step = latestByNode.get(defNodeId) || null;
    
    const defNodeType = normalizeNodeType(resolveDefinitionNodeType(defNode) || '');
    if (!step && defNodeType) {
      const byNodeType = (latestByNode as any).byNodeType;
      step = byNodeType?.get(defNodeType) || null;
    }
    
    const nodeType = normalizeNodeType(step?.node_type || defNodeType || '');
    
    function extractStepStatus(s: any): string {
      if (typeof s?.status === 'string') return s.status;
      if (typeof s?.step_status === 'string') return s.step_status;
      if (typeof s?.state === 'string') return s.state;
      return 'pending';
    }
    
    return {
      id: String(step?.id || `def:${defNodeId}:${index}`),
      index,
      nodeId: defNodeId,
      nodeType,
      label: resolveNodeDisplayLabel(nodeType, defNode, step),
      kind: nodeKindFromType(nodeType),
      outputKey: typeof defNode?.output === 'string' ? defNode.output : null,
      assignee: typeof defNode?.assignee === 'object' && defNode?.assignee ? defNode.assignee : null,
      status: extractStepStatus(step),
      durationMs: durationBetween(step?.started_at, step?.completed_at),
      position: buildZigzagPosition(index),
      raw: {
        definition: defNode,
        step,
      },
    };
  });
  for (const node of nodes) {
    definitionNodeIdToGraphNodeId.set(node.nodeId, node.id);
  }

  // Include runtime-only nodes (manual trigger, dynamic legal review, etc.) after template nodes.
  const runtimeOnly = stepList
    .filter((step) => !definitionNodeIds.has(String(step?.node_id || '')))
    .filter((step) => {
      const nodeType = normalizeNodeType(step?.node_type || '');
      return nodeType !== 'manual.trigger' && nodeType !== 'chat.trigger';
    })
    .sort((a, b) => {
      const aTime = new Date(a?.started_at || a?.completed_at || 0).getTime();
      const bTime = new Date(b?.started_at || b?.completed_at || 0).getTime();
      return aTime - bTime;
    });
  for (const step of runtimeOnly) {
    const index = nodes.length;
    const nodeType = normalizeNodeType(step?.node_type || step?.node_id || '');
    nodes.push({
      id: String(step?.id || `runtime:${index}`),
      index,
      nodeId: String(step?.node_id || `runtime_${index + 1}`),
      nodeType,
      label: resolveNodeDisplayLabel(nodeType, null, step),
      kind: nodeKindFromType(nodeType),
      status: typeof step?.status === 'string' ? step.status : 'pending',
      durationMs: durationBetween(step?.started_at, step?.completed_at),
      position: buildZigzagPosition(index),
      raw: {
        definition: null,
        step,
      },
    });
  }

  const graphNodeById = new Map(nodes.map((node) => [node.id, node]));
  let edges: WorkflowGraphEdge[] = [];
  if (normalized.schemaVersion === 2) {
    edges = buildEdgesFromDefinition(normalized.edges, definitionNodeIdToGraphNodeId, graphNodeById);
  } else {
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const fromNode = nodes[i];
      const toNode = nodes[i + 1];
      edges.push({
        id: `${fromNode.id}->${toNode.id}`,
        from: fromNode.id,
        to: toNode.id,
        active: edgeIsActive(fromNode, toNode),
      });
    }
  }

  return { nodes, edges };
}

export function detectCurrentStepId(steps: any[] = []): string | null {
  const running = (steps || []).find((s) => ['running', 'waiting'].includes(String(s?.status || '').toLowerCase()));
  if (running?.id) return String(running.id);
  const latest = [...(steps || [])].sort((a, b) => {
    const aTime = new Date(a?.started_at || a?.created_at || 0).getTime();
    const bTime = new Date(b?.started_at || b?.created_at || 0).getTime();
    return bTime - aTime;
  })[0];
  return latest?.id ? String(latest.id) : null;
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (!Number.isFinite(ms as number)) return 'n/a';
  const value = Number(ms);
  if (value < 1000) return `${value}ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)}s`;
  const m = Math.floor(value / 60000);
  const s = Math.floor((value % 60000) / 1000);
  return `${m}m ${s}s`;
}

export function summarizeObjectForUi(input: any, maxItems = 6): Array<{ key: string; value: string }> {
  if (!input || typeof input !== 'object') return [];
  const rows: Array<{ key: string; value: string }> = [];
  const entries = Object.entries(input);
  for (const [key, value] of entries) {
    if (rows.length >= maxItems) break;
    let label = '';
    if (Array.isArray(value)) {
      label = `${value.length} item${value.length === 1 ? '' : 's'}`;
    } else if (value && typeof value === 'object') {
      label = `${Object.keys(value).length} field${Object.keys(value).length === 1 ? '' : 's'}`;
    } else {
      label = String(value);
    }
    rows.push({ key, value: label.length > 120 ? `${label.slice(0, 117)}...` : label });
  }
  return rows;
}
