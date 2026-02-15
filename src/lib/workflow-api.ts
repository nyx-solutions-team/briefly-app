import { apiFetch, getApiContext } from '@/lib/api';

export type WorkflowConfig = {
  workflowsEnabled: boolean;
  manualRunEnabled: boolean;
  readOnlyMode: boolean;
  adminOnly: boolean;
  callerRole: string;
};

export type WorkflowTemplate = {
  id: string;
  org_id: string;
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

export async function getWorkflowConfig(): Promise<WorkflowConfig> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/workflows/config`, { skipCache: true });
}

export async function listWorkflowTemplates(includeInactive = true): Promise<{ templates: WorkflowTemplate[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const suffix = includeInactive ? '?include_inactive=true' : '';
  return apiFetch(`/orgs/${orgId}/workflows/templates${suffix}`, { skipCache: true });
}

export async function listWorkflowNodeDefinitions(includeInactive = false): Promise<{ nodeDefinitions: WorkflowNodeDefinition[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const suffix = includeInactive ? '?include_inactive=true' : '';
  return apiFetch(`/orgs/${orgId}/workflows/node-definitions${suffix}`, { skipCache: true });
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
}): Promise<{ runs: WorkflowRun[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const qs = new URLSearchParams();
  if (params?.templateId) qs.set('templateId', params.templateId);
  if (params?.status) qs.set('status', params.status);
  if (typeof params?.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/orgs/${orgId}/workflows/runs${suffix}`, { skipCache: true });
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
