import { supabase } from '@/lib/supabase';

const OPS_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';

type OpsFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Missing access token for ops request');
  }
  return token;
}

async function opsFetch<T = any>(path: string, opts: OpsFetchOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${OPS_BASE_URL}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    cache: 'no-store',
  });

  const text = await response.text();
  let payload: any = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      `${response.status} ${response.statusText}` ||
      'Ops request failed';
    const error = new Error(message);
    (error as any).status = response.status;
    (error as any).data = payload;
    throw error;
  }

  return payload as T;
}

export type OpsWhoAmI = {
  userId?: string | null;
  ip?: string | null;
  enableOps?: boolean | null;
  platformAdmin?: boolean | null;
};

export type OpsOrgPlanSummary = {
  key: string | null;
  planEndsAt: string | null;
  planStartedAt: string | null;
  storageLimitGb: number;
  storageUsedBytes: number;
  storageGraceUntil: string | null;
};

export type OpsOrgListItem = {
  orgId: string;
  name: string;
  teams: number;
  users: number;
  documents: number;
  overrides: number;
  plan: OpsOrgPlanSummary;
};

export type OpsOrgLifecycle = 'active' | 'setup_incomplete' | 'grace' | 'expired';
export type OpsOrgLifecycleState = 'active' | 'suspended' | 'deleting';

export type OpsOrgLifecycleInfo = {
  state: OpsOrgLifecycleState;
  reason: string | null;
  updatedAt: string | null;
};

export type OpsOrgDiagnostic = {
  id: string;
  severity: 'error' | 'warn' | 'info';
  title: string;
  details?: unknown;
};

export type OpsOrgDetail = {
  orgId: string;
  orgName?: string | null;
  summary: {
    teams: number;
    users: number;
    documents: number;
    overrides: number;
  };
  diagnostics: OpsOrgDiagnostic[];
  plan?: {
    planKey: string | null;
    storageLimitGb: number;
    storageBytes: number;
    usageCalculatedAt: string | null;
    planEndsAt: string | null;
    storageGraceUntil: string | null;
    status: {
      expired: boolean;
      withinGrace: boolean;
      storageFull: boolean;
    } | null;
  } | null;
  lifecycle?: OpsOrgLifecycleInfo | null;
};

export type OpsOrgTeam = {
  id: string;
  name: string;
  leadUserId: string | null;
  members: number;
};

export type OpsOrgUser = {
  userId: string;
  role: string;
  displayName: string | null;
  expiresAt: string | null;
  departments: Array<{
    departmentId: string;
    role: string;
  }>;
};

export type OpsRole = {
  key: string;
  name: string;
  is_system: boolean;
  permissions: Record<string, unknown>;
};

export type OpsOrgSettings = {
  org_id: string;
  date_format: string;
  accent_color: string;
  dark_mode: boolean;
  chat_filters_enabled: boolean;
  ip_allowlist_enabled: boolean;
  ip_allowlist_ips: string[];
  categories: string[];
  editor_enabled: boolean;
  approvals_enabled: boolean;
  workflows_enabled: boolean;
};

export type UpdateOpsOrgSettingsInput = Partial<
  Pick<
    OpsOrgSettings,
    | 'date_format'
    | 'accent_color'
    | 'dark_mode'
    | 'chat_filters_enabled'
    | 'ip_allowlist_enabled'
    | 'ip_allowlist_ips'
    | 'categories'
    | 'editor_enabled'
    | 'approvals_enabled'
    | 'workflows_enabled'
  >
>;

export type OpsOrgPrivateSettings = {
  org_id: string;
  summary_prompt: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type InviteOpsOrgUserInput = {
  email: string;
  role?: string;
  departmentId?: string;
  deptRole?: 'member' | 'lead';
  password?: string;
};

export type CreateOpsOrgTeamInput = {
  name: string;
  leadEmail?: string;
};

export type UpdateOpsRoleInput = {
  name?: string;
  permissions?: Record<string, unknown>;
};

export type OpsRbacState = {
  org_id: string;
  rbac_mode: 'legacy' | 'shadow' | 'ideal';
  rbac_migration_status: string;
  rbac_migration_version: string | null;
  rbac_last_migrated_at: string | null;
};

export type UpdateOpsRbacStateInput = Partial<
  Pick<
    OpsRbacState,
    'rbac_mode' | 'rbac_migration_status' | 'rbac_migration_version' | 'rbac_last_migrated_at'
  >
>;

export type OpsRbacRoleMapEntry = {
  org_id: string;
  legacy_role_key: string;
  target_role_key: string;
  decided_by?: string | null;
  decided_at?: string | null;
};

export type OpsRbacUserMapEntry = {
  org_id: string;
  user_id: string;
  legacy_role_key: string;
  target_role_key: string;
  decided_by?: string | null;
  decided_at?: string | null;
};

export type OpsAccessOverride = {
  user_id: string;
  department_id: string | null;
  permissions: Record<string, unknown>;
};

export type OpsEffectivePermissions = {
  role: string | null;
  rolePermissions: Record<string, unknown>;
  orgOverride: Record<string, unknown>;
  effective: Record<string, boolean>;
};

export type OpsUsageRow = {
  orgId: string;
  name: string;
  planKey: string | null;
  membersTotal: number;
  membersActive: number;
  expiring30: number;
  uploads7: number;
  uploads30: number;
  documents: number;
  teams: number;
  storageBytes: number;
  storageLimitGb: number;
  usagePercent: number | null;
  usageCalculatedAt: string | null;
  featureFlags: {
    editorEnabled: boolean;
    approvalsEnabled: boolean;
    workflowsEnabled: boolean;
  };
};

export type OpsUsageOverview = {
  totals: {
    orgs: number;
    membersTotal: number;
    membersActive: number;
    uploads7: number;
    uploads30: number;
    storageBytes: number;
    editorEnabled: number;
    approvalsEnabled: number;
    workflowsEnabled: number;
  };
  rows: OpsUsageRow[];
};

export type OpsStorageUsageRow = {
  orgId: string;
  name: string;
  planKey: string | null;
  storageLimitGb: number;
  storageLimitBytes: number | null;
  storageBytes: number;
  usagePercent: number | null;
  usageCalculatedAt: string | null;
  planEndsAt: string | null;
  storageGraceUntil: string | null;
  status: 'ok' | 'warning' | 'grace' | 'expired' | 'limit';
};

export type OpsStorageUsageResponse = {
  totals: {
    orgs: number;
    totalBytes: number;
    averageUsagePercent: number | null;
  };
  rows: OpsStorageUsageRow[];
};

export type OpsOrphanStorageSummaryRow = {
  orgId: string;
  name: string;
  orphanFiles: number;
  storageBytes: number;
  docKeys: number;
  storageObjects: number;
  scannedAt: string;
};

export type OpsOrphanStorageSummary = {
  bucket: string;
  rows: OpsOrphanStorageSummaryRow[];
};

export type OpsActivityKind = 'ops' | 'security' | 'documents' | 'auth' | 'other';

export type OpsActivityRow = {
  id: string;
  orgId: string | null;
  orgName: string;
  actorUserId: string | null;
  actorDisplayName: string;
  type: string;
  ts: string | null;
  note: string | null;
  kind: OpsActivityKind;
};

export type OpsActivityResponse = {
  totals: {
    total: number;
    ops: number;
    security: number;
    documents: number;
    auth: number;
    other: number;
  };
  rows: OpsActivityRow[];
};

export type OpsOrgDeletionJobStatus =
  | 'queued'
  | 'preflight'
  | 'running'
  | 'failed'
  | 'completed'
  | 'cancelled';

export type OpsOrgDeletionJob = {
  id: string;
  orgId: string;
  orgName: string | null;
  requestedBy: string | null;
  lifecycleBefore: string | null;
  reason: string | null;
  confirmationText: string | null;
  status: OpsOrgDeletionJobStatus;
  manifest: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type OpsOrgDeletionPreflight = {
  org: {
    orgId: string;
    name: string;
    planKey: string | null;
    storageLimitGb: number;
    lifecycle: OpsOrgLifecycleInfo;
  };
  summary: {
    documents: number;
    members: number;
    teams: number;
    roles: number;
    shares: number;
    approvals: number;
    workflows: number;
    chats: number;
    ingestion: number;
    vespa: number;
  };
  counts: Record<string, number | null>;
  blockers: {
    activeLegacyIngestion: number;
    activeIngestionV2: number;
    activeWorkflowRuns: number;
    activeUploadAnalysis: number;
    activeChatOutbox: number;
  };
  storage: {
    documentsBucketObjects: number | null;
    documentsBucketBytes: number | null;
    extractionsBucketObjects: number | null;
    extractionsBucketBytes: number | null;
    trackedDocumentKeys: number;
    trackedArtifactKeys: number;
    trackedExtractionKeys: number;
    derivedExtractionKeys: number;
    deepExtractionScan: boolean;
  };
  latestJob: OpsOrgDeletionJob | null;
};

function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOpsOrgLifecycleInfo(value: Partial<OpsOrgLifecycleInfo> | null | undefined): OpsOrgLifecycleInfo {
  const state = value?.state;
  return {
    state: state === 'suspended' || state === 'deleting' ? state : 'active',
    reason: typeof value?.reason === 'string' ? value.reason : null,
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : null,
  };
}

function normalizeOpsOrgDeletionPreflight(
  value: Partial<OpsOrgDeletionPreflight> | null | undefined
): OpsOrgDeletionPreflight {
  const org = (value?.org || {}) as Partial<OpsOrgDeletionPreflight['org']>;
  const summary = (value?.summary || {}) as Partial<OpsOrgDeletionPreflight['summary']>;
  const blockers = (value?.blockers || {}) as Partial<OpsOrgDeletionPreflight['blockers']>;
  const storage = (value?.storage || {}) as Partial<OpsOrgDeletionPreflight['storage']>;

  return {
    org: {
      orgId: typeof org.orgId === 'string' ? org.orgId : '',
      name: typeof org.name === 'string' ? org.name : '',
      planKey: typeof org.planKey === 'string' ? org.planKey : null,
      storageLimitGb: toFiniteNumber(org.storageLimitGb, 0),
      lifecycle: normalizeOpsOrgLifecycleInfo(org.lifecycle),
    },
    summary: {
      documents: toFiniteNumber(summary.documents, 0),
      members: toFiniteNumber(summary.members, 0),
      teams: toFiniteNumber(summary.teams, 0),
      roles: toFiniteNumber(summary.roles, 0),
      shares: toFiniteNumber(summary.shares, 0),
      approvals: toFiniteNumber(summary.approvals, 0),
      workflows: toFiniteNumber(summary.workflows, 0),
      chats: toFiniteNumber(summary.chats, 0),
      ingestion: toFiniteNumber(summary.ingestion, 0),
      vespa: toFiniteNumber(summary.vespa, 0),
    },
    counts:
      value?.counts && typeof value.counts === 'object'
        ? (value.counts as Record<string, number | null>)
        : {},
    blockers: {
      activeLegacyIngestion: toFiniteNumber(blockers.activeLegacyIngestion, 0),
      activeIngestionV2: toFiniteNumber(blockers.activeIngestionV2, 0),
      activeWorkflowRuns: toFiniteNumber(blockers.activeWorkflowRuns, 0),
      activeUploadAnalysis: toFiniteNumber(blockers.activeUploadAnalysis, 0),
      activeChatOutbox: toFiniteNumber(blockers.activeChatOutbox, 0),
    },
    storage: {
      documentsBucketObjects: toNullableFiniteNumber(storage.documentsBucketObjects),
      documentsBucketBytes: toNullableFiniteNumber(storage.documentsBucketBytes),
      extractionsBucketObjects: toNullableFiniteNumber(storage.extractionsBucketObjects),
      extractionsBucketBytes: toNullableFiniteNumber(storage.extractionsBucketBytes),
      trackedDocumentKeys: toFiniteNumber(storage.trackedDocumentKeys, 0),
      trackedArtifactKeys: toFiniteNumber(storage.trackedArtifactKeys, 0),
      trackedExtractionKeys: toFiniteNumber(storage.trackedExtractionKeys, 0),
      derivedExtractionKeys: toFiniteNumber(storage.derivedExtractionKeys, 0),
      deepExtractionScan: Boolean(storage.deepExtractionScan),
    },
    latestJob: value?.latestJob || null,
  };
}

function normalizeOpsOrgDiagnostic(value: Partial<OpsOrgDiagnostic> | null | undefined): OpsOrgDiagnostic {
  const severity = value?.severity;
  return {
    id: typeof value?.id === 'string' ? value.id : crypto.randomUUID(),
    severity: severity === 'error' || severity === 'warn' ? severity : 'info',
    title: typeof value?.title === 'string' ? value.title : 'Untitled diagnostic',
    details: value?.details,
  };
}

function normalizeOpsOrgDetail(value: Partial<OpsOrgDetail> | null | undefined): OpsOrgDetail {
  const summary = (value?.summary || {}) as Partial<OpsOrgDetail['summary']>;
  const plan = value?.plan;

  return {
    orgId: typeof value?.orgId === 'string' ? value.orgId : '',
    orgName: typeof value?.orgName === 'string' ? value.orgName : null,
    summary: {
      teams: toFiniteNumber(summary.teams, 0),
      users: toFiniteNumber(summary.users, 0),
      documents: toFiniteNumber(summary.documents, 0),
      overrides: toFiniteNumber(summary.overrides, 0),
    },
    diagnostics: Array.isArray(value?.diagnostics)
      ? value.diagnostics.map((item) => normalizeOpsOrgDiagnostic(item))
      : [],
    plan: plan
      ? {
          planKey: typeof plan.planKey === 'string' ? plan.planKey : null,
          storageLimitGb: toFiniteNumber(plan.storageLimitGb, 0),
          storageBytes: toFiniteNumber(plan.storageBytes, 0),
          usageCalculatedAt: typeof plan.usageCalculatedAt === 'string' ? plan.usageCalculatedAt : null,
          planEndsAt: typeof plan.planEndsAt === 'string' ? plan.planEndsAt : null,
          storageGraceUntil: typeof plan.storageGraceUntil === 'string' ? plan.storageGraceUntil : null,
          status: plan.status
            ? {
                expired: Boolean(plan.status.expired),
                withinGrace: Boolean(plan.status.withinGrace),
                storageFull: Boolean(plan.status.storageFull),
              }
            : null,
        }
      : null,
    lifecycle: normalizeOpsOrgLifecycleInfo(value?.lifecycle),
  };
}

function normalizeOpsOrgTeam(value: Partial<OpsOrgTeam> | null | undefined): OpsOrgTeam {
  return {
    id: typeof value?.id === 'string' ? value.id : '',
    name: typeof value?.name === 'string' ? value.name : 'Unnamed team',
    leadUserId: typeof value?.leadUserId === 'string' ? value.leadUserId : null,
    members: toFiniteNumber(value?.members, 0),
  };
}

function normalizeOpsOrgUser(value: Partial<OpsOrgUser> | null | undefined): OpsOrgUser {
  return {
    userId: typeof value?.userId === 'string' ? value.userId : '',
    role: typeof value?.role === 'string' ? value.role : 'member',
    displayName: typeof value?.displayName === 'string' ? value.displayName : null,
    expiresAt: typeof value?.expiresAt === 'string' ? value.expiresAt : null,
    departments: Array.isArray(value?.departments)
      ? value.departments.map((department) => ({
          departmentId: typeof department?.departmentId === 'string' ? department.departmentId : '',
          role: typeof department?.role === 'string' ? department.role : 'member',
        }))
      : [],
  };
}

function normalizeOpsRole(value: Partial<OpsRole> | null | undefined): OpsRole {
  return {
    key: typeof value?.key === 'string' ? value.key : '',
    name: typeof value?.name === 'string' ? value.name : 'Untitled role',
    is_system: Boolean(value?.is_system),
    permissions:
      value?.permissions && typeof value.permissions === 'object'
        ? (value.permissions as Record<string, unknown>)
        : {},
  };
}

export type CreateOpsOrgInput = {
  name: string;
  planKey: string;
  storageLimitGb: number;
  planLengthMonths: number;
  graceDays: number;
  ownerEmail?: string;
  csmEmail?: string;
  notes?: string;
};

export function getOpsStorageUsagePercent(
  plan:
    | {
        storageLimitGb?: number | null;
        storageUsedBytes?: number | null;
        storageBytes?: number | null;
      }
    | null
    | undefined
): number | null {
  if (!plan) return null;
  const storageLimitGb = Number(plan.storageLimitGb || 0);
  const usedBytes = Number(
    typeof plan.storageUsedBytes === 'number' ? plan.storageUsedBytes : plan.storageBytes || 0
  );
  if (!storageLimitGb || storageLimitGb <= 0) return null;
  const limitBytes = storageLimitGb * 1024 ** 3;
  return Math.min(999, Math.round((usedBytes / limitBytes) * 10000) / 100);
}

export function getOpsOrgLifecycle(org: OpsOrgListItem): OpsOrgLifecycle {
  if (org.users === 0 || org.teams === 0) {
    return 'setup_incomplete';
  }

  const now = Date.now();
  const planEndsAt = org.plan.planEndsAt ? new Date(org.plan.planEndsAt).getTime() : 0;
  const graceEndsAt = org.plan.storageGraceUntil ? new Date(org.plan.storageGraceUntil).getTime() : 0;

  if (planEndsAt && now > planEndsAt) {
    if (graceEndsAt && now <= graceEndsAt) return 'grace';
    return 'expired';
  }

  return 'active';
}

export function getOpsLifecycleLabel(status: OpsOrgLifecycle) {
  switch (status) {
    case 'setup_incomplete':
      return 'Setup Incomplete';
    case 'grace':
      return 'Grace Window';
    case 'expired':
      return 'Expired';
    default:
      return 'Active';
  }
}

export async function getOpsWhoAmI(signal?: AbortSignal) {
  return opsFetch<OpsWhoAmI>('/ops/whoami', { signal });
}

export async function getOpsUsageOverview(search?: string, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return opsFetch<OpsUsageOverview>(`/ops/usage${suffix}`, { signal });
}

export async function listOpsOrganizations(signal?: AbortSignal) {
  return opsFetch<OpsOrgListItem[]>('/ops/orgs', { signal });
}

export async function getOpsOrganization(orgId: string, signal?: AbortSignal) {
  const payload = await opsFetch<OpsOrgDetail>(`/ops/orgs/${orgId}`, { signal });
  return normalizeOpsOrgDetail(payload);
}

export async function getOpsOrgSettings(orgId: string, signal?: AbortSignal) {
  return opsFetch<OpsOrgSettings>(`/ops/orgs/${orgId}/settings`, { signal });
}

export async function updateOpsOrgSettings(orgId: string, body: UpdateOpsOrgSettingsInput) {
  return opsFetch<OpsOrgSettings>(`/ops/orgs/${orgId}/settings`, {
    method: 'PUT',
    body,
  });
}

export async function getOpsOrgPrivateSettings(orgId: string, signal?: AbortSignal) {
  return opsFetch<OpsOrgPrivateSettings>(`/ops/orgs/${orgId}/private-settings`, { signal });
}

export async function updateOpsOrgPrivateSettings(orgId: string, summary_prompt: string) {
  return opsFetch<OpsOrgPrivateSettings>(`/ops/orgs/${orgId}/private-settings`, {
    method: 'PUT',
    body: { summary_prompt },
  });
}

export async function listOpsOrgTeams(orgId: string, signal?: AbortSignal) {
  const payload = await opsFetch<OpsOrgTeam[]>(`/ops/orgs/${orgId}/teams`, { signal });
  return Array.isArray(payload) ? payload.map((item) => normalizeOpsOrgTeam(item)) : [];
}

export async function createOpsOrgTeam(orgId: string, body: CreateOpsOrgTeamInput) {
  return opsFetch<{ ok: true; departmentId: string }>(`/ops/orgs/${orgId}/teams`, {
    method: 'POST',
    body,
  });
}

export async function assignOpsOrgTeamLead(orgId: string, deptId: string, userId: string) {
  return opsFetch<{ ok: true }>(`/ops/orgs/${orgId}/teams/${deptId}/leads`, {
    method: 'POST',
    body: { userId },
  });
}

export async function listOpsOrgUsers(orgId: string, signal?: AbortSignal) {
  const payload = await opsFetch<OpsOrgUser[]>(`/ops/orgs/${orgId}/users`, { signal });
  return Array.isArray(payload) ? payload.map((item) => normalizeOpsOrgUser(item)) : [];
}

export async function inviteOpsOrgUser(orgId: string, body: InviteOpsOrgUserInput) {
  return opsFetch<{ ok: true; userId: string; userWasCreated?: boolean }>(
    `/ops/orgs/${orgId}/users/invite`,
    {
      method: 'POST',
      body,
    }
  );
}

export async function addOpsOrgAdmin(orgId: string, userId: string) {
  return opsFetch<{ ok: true }>(`/ops/orgs/${orgId}/admins`, {
    method: 'POST',
    body: { userId },
  });
}

export async function updateOpsOrgUserPassword(orgId: string, userId: string, password: string) {
  return opsFetch<{ ok: true }>(`/ops/orgs/${orgId}/users/${userId}`, {
    method: 'PATCH',
    body: { password },
  });
}

export async function listOpsOrgRoles(orgId: string, signal?: AbortSignal) {
  const payload = await opsFetch<OpsRole[]>(`/ops/orgs/${orgId}/roles`, { signal });
  return Array.isArray(payload) ? payload.map((item) => normalizeOpsRole(item)) : [];
}

export async function updateOpsOrgRole(orgId: string, key: string, body: UpdateOpsRoleInput) {
  return opsFetch<OpsRole>(`/ops/orgs/${orgId}/roles/${key}`, {
    method: 'PUT',
    body,
  });
}

export async function getOpsRbacState(orgId: string, signal?: AbortSignal) {
  return opsFetch<OpsRbacState>(`/ops/orgs/${orgId}/rbac`, { signal });
}

export async function updateOpsRbacState(orgId: string, body: UpdateOpsRbacStateInput) {
  return opsFetch<OpsRbacState>(`/ops/orgs/${orgId}/rbac`, {
    method: 'PUT',
    body,
  });
}

export async function listOpsRbacRoleMap(orgId: string, signal?: AbortSignal) {
  return opsFetch<OpsRbacRoleMapEntry[]>(`/ops/orgs/${orgId}/rbac/role-map`, { signal });
}

export async function updateOpsRbacRoleMap(
  orgId: string,
  entries: Array<{ legacyRoleKey: string; targetRoleKey: string }>
) {
  return opsFetch<OpsRbacRoleMapEntry[]>(`/ops/orgs/${orgId}/rbac/role-map`, {
    method: 'PUT',
    body: { entries },
  });
}

export async function listOpsRbacUserMap(orgId: string, signal?: AbortSignal) {
  return opsFetch<OpsRbacUserMapEntry[]>(`/ops/orgs/${orgId}/rbac/user-map`, { signal });
}

export async function updateOpsRbacUserMap(
  orgId: string,
  entries: Array<{ userId: string; legacyRoleKey: string; targetRoleKey: string }>
) {
  return opsFetch<OpsRbacUserMapEntry[]>(`/ops/orgs/${orgId}/rbac/user-map`, {
    method: 'PUT',
    body: { entries },
  });
}

export async function listOpsAccessOverrides(orgId: string, signal?: AbortSignal) {
  return opsFetch<OpsAccessOverride[]>(`/ops/orgs/${orgId}/overrides`, { signal });
}

export async function getOpsEffectivePermissions(
  orgId: string,
  userId: string,
  signal?: AbortSignal
) {
  return opsFetch<OpsEffectivePermissions>(`/ops/orgs/${orgId}/effective/${userId}`, { signal });
}

export async function getOpsStorageUsage(search?: string, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return opsFetch<OpsStorageUsageResponse>(`/ops/storage/usage${suffix}`, { signal });
}

export async function recalculateOpsStorage(orgId: string) {
  return opsFetch<{ ok: true; storageBytes: number }>(`/ops/orgs/${orgId}/storage/recalculate`, {
    method: 'POST',
  });
}

export async function updateOpsStorageLimit(orgId: string, storageLimitGb: number) {
  return opsFetch<{ ok: true; organization: { id: string; storage_limit_gb: number } | null }>(
    `/ops/orgs/${orgId}/storage/limit`,
    {
      method: 'PATCH',
      body: { storageLimitGb },
    }
  );
}

export async function listOpsOrphanStorageSummary(bucket = 'documents', signal?: AbortSignal) {
  const params = new URLSearchParams({ bucket });
  return opsFetch<OpsOrphanStorageSummary>(`/ops/orphan-storage?${params.toString()}`, { signal });
}

export async function getOpsActivity(params?: {
  orgId?: string;
  kind?: 'all' | OpsActivityKind;
  search?: string;
  limit?: number;
}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (params?.orgId) query.set('orgId', params.orgId);
  if (params?.kind) query.set('kind', params.kind);
  if (params?.search?.trim()) query.set('search', params.search.trim());
  if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return opsFetch<OpsActivityResponse>(`/ops/activity${suffix}`, { signal });
}

export async function createOpsOrganization(body: CreateOpsOrgInput) {
  return opsFetch<{ id: string; name: string }>('/ops/orgs', {
    method: 'POST',
    body,
  });
}

export async function getOpsOrgDeletionPreflight(orgId: string, signal?: AbortSignal) {
  const payload = await opsFetch<OpsOrgDeletionPreflight>(`/ops/orgs/${orgId}/deletion/preflight`, { signal });
  return normalizeOpsOrgDeletionPreflight(payload);
}

export async function listOpsOrgDeletionJobs(orgId: string, limit = 10, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: String(limit) });
  return opsFetch<{ rows: OpsOrgDeletionJob[] }>(`/ops/orgs/${orgId}/deletion/jobs?${params.toString()}`, {
    signal,
  });
}

export async function updateOpsOrgLifecycle(
  orgId: string,
  body: { state: OpsOrgLifecycleState; reason?: string | null }
) {
  return opsFetch<OpsOrgLifecycleInfo>(`/ops/orgs/${orgId}/lifecycle`, {
    method: 'PATCH',
    body,
  });
}

export async function requestOpsOrgDeletion(
  orgId: string,
  body: { confirmationText: string; reason?: string | null }
) {
  return opsFetch<OpsOrgDeletionJob>(`/ops/orgs/${orgId}/deletion`, {
    method: 'POST',
    body,
  });
}
