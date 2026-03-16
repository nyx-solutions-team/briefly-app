import { apiFetch, getApiContext } from '@/lib/api';
import { dedupRequest } from '@/lib/request-dedup';

export type WorkflowConfig = {
  workflowsEnabled: boolean;
  manualRunEnabled: boolean;
  readOnlyMode: boolean;
  adminOnly: boolean;
  callerRole: string;
  dagExecutorEnabled?: boolean;
  dagExecutorEnv?: boolean | null;
};

export type WorkflowTemplate = {
  id: string;
  org_id: string | null;
  template_scope?: 'org' | 'system';
  source_template_id?: string | null;
  source_template_version?: number | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  visibility: Record<string, any> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  latest_version?: number | null;
  latest_version_created_at?: string | null;
};

export type WorkflowRun = {
  id: string;
  org_id: string;
  workflow_template_id: string;
  workflow_template_version: number;
  status: 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled';
  started_at: string | null;
  completed_at: string | null;
  started_by: string | null;
  input: Record<string, any> | null;
  context: Record<string, any> | null;
  idempotency_key: string | null;
};

export type WorkflowNodeDefinition = {
  id: string;
  org_id: string | null;
  scope: 'system' | 'org';
  node_key: string;
  kind: string;
  name: string;
  description: string | null;
  is_active: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  latest_version?: number | null;
  latest_contract?: Record<string, any> | null;
};

const workflowApiCache = new Map<string, { data: any; cachedAt: number; ttlMs: number }>();
const WORKFLOW_CONFIG_TTL_MS = 30_000;
const WORKFLOW_TEMPLATES_TTL_MS = 15_000;
const WORKFLOW_NODE_DEFINITIONS_TTL_MS = 30_000;
const WORKFLOW_RUNS_TTL_MS = 8_000;

function readWorkflowApiCache<T>(key: string, force = false): T | null {
  if (force) return null;
  const cached = workflowApiCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > cached.ttlMs) {
    workflowApiCache.delete(key);
    return null;
  }
  return cached.data as T;
}

function writeWorkflowApiCache<T>(key: string, ttlMs: number, data: T) {
  workflowApiCache.set(key, {
    data,
    ttlMs,
    cachedAt: Date.now(),
  });
}

export function clearWorkflowApiCache(prefix?: string) {
  if (!prefix) {
    workflowApiCache.clear();
    return;
  }
  for (const key of workflowApiCache.keys()) {
    if (key.startsWith(prefix)) workflowApiCache.delete(key);
  }
}

async function cachedWorkflowGet<T>(
  key: string,
  ttlMs: number,
  requestFn: () => Promise<T>,
  force = false,
): Promise<T> {
  const cached = readWorkflowApiCache<T>(key, force);
  if (cached) return cached;
  return dedupRequest(`workflow-api:${key}`, async () => {
    const data = await requestFn();
    writeWorkflowApiCache(key, ttlMs, data);
    return data;
  });
}

export async function getWorkflowConfig(options: { force?: boolean } = {}): Promise<WorkflowConfig> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const force = options.force === true;
  return cachedWorkflowGet(
    `config:${orgId}`,
    WORKFLOW_CONFIG_TTL_MS,
    () => apiFetch(`/orgs/${orgId}/workflows/config${force ? '?force=1' : ''}`, { skipCache: true }),
    force,
  );
}

export async function listWorkflowTemplates(
  includeInactive = true,
  includeSystem = true,
  options: { force?: boolean } = {},
): Promise<{ templates: WorkflowTemplate[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const force = options.force === true;
  const qs = new URLSearchParams();
  if (includeInactive) qs.set('include_inactive', 'true');
  if (!includeSystem) qs.set('include_system', 'false');
  if (force) qs.set('force', '1');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return cachedWorkflowGet(
    `templates:${orgId}:${includeInactive ? 1 : 0}:${includeSystem ? 1 : 0}`,
    WORKFLOW_TEMPLATES_TTL_MS,
    () => apiFetch(`/orgs/${orgId}/workflows/templates${suffix}`, { skipCache: true }),
    force,
  );
}

export async function listWorkflowNodeDefinitions(
  includeInactive = false,
  options: { force?: boolean } = {},
): Promise<{ nodeDefinitions: WorkflowNodeDefinition[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const force = options.force === true;
  const qs = new URLSearchParams();
  if (includeInactive) qs.set('include_inactive', 'true');
  if (force) qs.set('force', '1');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return cachedWorkflowGet(
    `node-definitions:${orgId}:${includeInactive ? 1 : 0}`,
    WORKFLOW_NODE_DEFINITIONS_TTL_MS,
    () => apiFetch(`/orgs/${orgId}/workflows/node-definitions${suffix}`, { skipCache: true }),
    force,
  );
}

export async function getWorkflowNodeDefinition(nodeKey: string, version?: number): Promise<{ nodeDefinition: WorkflowNodeDefinition }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const safeKey = encodeURIComponent(String(nodeKey || '').trim());
  const suffix = typeof version === 'number' && version > 0 ? `?version=${version}` : '';
  return apiFetch(`/orgs/${orgId}/workflows/node-definitions/${safeKey}${suffix}`, { skipCache: true });
}

export async function createWorkflowTemplate(body: {
  name: string;
  description?: string;
  isActive?: boolean;
  isSystem?: boolean;
  visibility?: Record<string, any>;
  definition: Record<string, any>;
  definitionMode?: 'legacy' | 'mixed' | 'registry';
  changeNote?: string;
}): Promise<{ template: WorkflowTemplate; version: any }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/workflows/templates`, { method: 'POST', body, skipCache: true });
}

export async function createWorkflowTemplateVersion(
  templateId: string,
  body: { definition: Record<string, any>; definitionMode?: 'legacy' | 'mixed' | 'registry'; changeNote?: string }
): Promise<{ version: any }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/workflows/templates/${templateId}/versions`, { method: 'POST', body, skipCache: true });
}

export async function forkWorkflowTemplate(
  templateId: string,
  body?: {
    name?: string;
    description?: string;
    sourceVersion?: number;
    isActive?: boolean;
    changeNote?: string;
  }
): Promise<{ template: WorkflowTemplate; version: any; forkedFrom: { templateId: string; version: number; templateScope: 'org' | 'system' } }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/workflows/templates/${templateId}/fork`, { method: 'POST', body: body || {}, skipCache: true });
}

export async function getWorkflowTemplateDefinition(templateId: string, version?: number): Promise<{
  template: WorkflowTemplate;
  version: { version: number; definition: Record<string, any>; [key: string]: any };
}> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const suffix = typeof version === 'number' && version > 0 ? `?version=${version}` : '';
  return apiFetch(`/orgs/${orgId}/workflows/templates/${templateId}/definition${suffix}`, { skipCache: true });
}

export async function runWorkflowManual(body: {
  templateId: string;
  templateVersion?: number;
  input?: Record<string, any>;
  context?: Record<string, any>;
  idempotencyKey?: string;
}): Promise<{ run: WorkflowRun; deduplicated?: boolean; queuedForExecution?: boolean }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/workflows/runs/manual`, { method: 'POST', body, skipCache: true });
}

export async function listWorkflowRuns(params?: {
  templateId?: string;
  status?: WorkflowRun['status'];
  limit?: number;
  offset?: number;
}, options: { force?: boolean } = {}): Promise<{ runs: WorkflowRun[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const force = options.force === true;
  const qs = new URLSearchParams();
  if (params?.templateId) qs.set('templateId', params.templateId);
  if (params?.status) qs.set('status', params.status);
  if (typeof params?.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') qs.set('offset', String(params.offset));
  if (force) qs.set('force', 'true');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return cachedWorkflowGet(
    `runs:${orgId}:${params?.templateId || ''}:${params?.status || ''}:${params?.limit || ''}:${params?.offset || ''}`,
    WORKFLOW_RUNS_TTL_MS,
    () => apiFetch(`/orgs/${orgId}/workflows/runs${suffix}`, { skipCache: true }),
    force,
  );
}

export async function getWorkflowRun(runId: string): Promise<{
  run: WorkflowRun;
  steps: any[];
  artifacts: any[];
  findings: any[];
  tasks: any[];
  taskAssignments: any[];
}> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/workflows/runs/${runId}`, { skipCache: true });
}

export async function updateWorkflowFinding(
  findingId: string,
  body: { status: 'open' | 'acknowledged' | 'resolved' | 'false_positive'; note?: string }
): Promise<{ finding: any }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/workflows/findings/${findingId}`, { method: 'PATCH', body, skipCache: true });
}

export async function completeWorkflowTask(
  taskId: string,
  body: {
    decision: 'approved' | 'rejected';
    note?: string;
    waiveUnknowns?: boolean;
    waiverReason?: string;
    escalateToLegal?: boolean;
  }
): Promise<{ task: any; run: WorkflowRun }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/workflows/tasks/${taskId}/complete`, { method: 'POST', body, skipCache: true });
}

export async function assignWorkflowTask(
  taskId: string,
  body: { userId?: string; role?: string; note?: string }
): Promise<{ task: any; assignedUserIds: string[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/workflows/tasks/${taskId}/assign`, { method: 'POST', body, skipCache: true });
}

export async function listOpenWorkflowTasks(limit = 50): Promise<{ tasks: any[]; taskAssignments: any[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/workflows/tasks/open?limit=${limit}`, { skipCache: true });
}
