import { apiFetch, getApiContext } from '@/lib/api';

export type ApprovalInstance = {
  id: string;
  org_id: string;
  doc_id: string;
  workflow_template_id: string;
  workflow_template_version: number;
  status: 'draft' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';
  current_stage_id: string | null;
  submitted_by: string | null;
  submitted_by_name?: string | null;
  submitted_at: string;
  total_stage_count?: number | null;
  completed_at: string | null;
  completed_by: string | null;
  submitted_version_number: number;
  approved_version_number: number | null;
  rejection_reason: string | null;
};

export type ApprovalStageInstance = {
  id: string;
  org_id: string;
  approval_instance_id: string;
  stage_id: string;
  stage_order: number;
  mode: 'parallel' | 'sequential';
  required_approvals: number;
  received_approvals: number;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
};

export type ApprovalAction = {
  id: string;
  org_id: string;
  approval_instance_id: string;
  stage_instance_id: string | null;
  actor_user_id: string | null;
  action_type: string;
  message: string | null;
  payload: any;
  created_at: string;
};

export type ApprovalTemplate = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  template_version: number;
  config: any;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MyQueueItem = {
  assignment: {
    id: string;
    stage_instance_id: string;
    sequence_order: number | null;
    status: 'assigned' | 'acted' | 'removed';
    assigned_at: string;
  };
  stage: ApprovalStageInstance;
  approval: ApprovalInstance;
  doc: {
    id: string;
    title: string | null;
    filename: string | null;
    folder_path: string[];
    department_id: string | null;
    type: string;
  } | null;
};

export async function listApprovalTemplates(opts?: { includeInactive?: boolean }): Promise<{ templates: ApprovalTemplate[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const qs = new URLSearchParams();
  if (opts?.includeInactive) qs.set('include_inactive', 'true');
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiFetch(`/orgs/${orgId}/approval-templates${suffix}`, { skipCache: true });
}

export async function createApprovalTemplate(body: {
  name: string;
  description?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
  config: any;
}): Promise<ApprovalTemplate> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/approval-templates`, { method: 'POST', body, skipCache: true });
}

export async function updateApprovalTemplate(templateId: string, body: any): Promise<ApprovalTemplate> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/approval-templates/${templateId}`, { method: 'PATCH', body, skipCache: true });
}

export async function submitApproval(docId: string, body: { templateId?: string; versionNumber?: number; message?: string }): Promise<{ approval: ApprovalInstance; stages: ApprovalStageInstance[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/approvals/docs/${docId}/submit`, { method: 'POST', body, skipCache: true });
}

export async function getCurrentApproval(docId: string): Promise<{ approval: ApprovalInstance; stages: ApprovalStageInstance[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/approvals/docs/${docId}/current`, { skipCache: true });
}

export async function getApprovalActions(approvalId: string): Promise<{ actions: ApprovalAction[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/approvals/${approvalId}/actions`, { skipCache: true });
}

export async function getMyApprovalQueue(): Promise<{ items: MyQueueItem[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/approvals/my-queue`, { skipCache: true });
}

export async function approve(approvalId: string, message?: string): Promise<any> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/approvals/${approvalId}/approve`, { method: 'POST', body: { message }, skipCache: true });
}

export async function reject(approvalId: string, reason: string): Promise<any> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/approvals/${approvalId}/reject`, { method: 'POST', body: { reason }, skipCache: true });
}

export async function comment(approvalId: string, message: string): Promise<any> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/approvals/${approvalId}/comment`, { method: 'POST', body: { message }, skipCache: true });
}

export async function cancel(approvalId: string): Promise<any> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/approvals/${approvalId}/cancel`, { method: 'POST', body: {}, skipCache: true });
}
