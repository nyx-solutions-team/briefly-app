"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { ViewAccessDenied } from '@/components/access-denied';
import { cn } from '@/lib/utils';
import { getOrgFeatures } from '@/lib/org-features';
import { apiFetch, getApiContext } from '@/lib/api';
import styles from './page.module.css';
import {
  createApprovalTemplate,
  listApprovalTemplates,
  updateApprovalTemplate,
  type ApprovalTemplate,
} from '@/lib/approval-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, ChevronUp, ChevronDown, ChevronsUpDown, Copy, Loader2, Minus, Plus, RefreshCw, Save, Sparkles, Trash2, Users, X } from 'lucide-react';

type PresetKey = 'simple-2-step' | 'one-step-admin' | 'dept-leads';
type DepartmentOption = {
  id: string;
  name: string;
};
type ReviewerSelectorDraft =
  | { type: 'role'; value: string; departmentId?: string | null }
  | { type: 'department_leads'; departmentId?: string | null }
  | { type: 'user_ids'; value: string[]; departmentId?: string | null };

const ANY_DEPARTMENT_SCOPE = '__any_department__';

type StageDraft = {
  id: string;
  name: string;
  description: string;
  mode: 'parallel' | 'sequential';
  requiredApprovals: number;
  reviewerSelector: ReviewerSelectorDraft;
};

type HealthLevel = 'valid' | 'attention' | 'invalid';

type StageHealth = {
  level: HealthLevel;
  issues: string[];
  blockingIssues: string[];
  assignedApproverCount: number | null;
  requiredApprovals: number;
};

type DraftValidationContext = {
  departmentIds: Set<string>;
  knownRoleKeys: Set<string>;
  knownUserIds: Set<string>;
  userOptionMap: Map<string, OrgUserOption>;
  users: OrgUserOption[];
  directoryLoaded: boolean;
};

const HEALTH_META: Record<HealthLevel, { label: string; className: string }> = {
  valid: {
    label: '🟢 Valid',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  },
  attention: {
    label: '🟡 Needs attention',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
  },
  invalid: {
    label: '🔴 Invalid',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
};

const ROLE_KEY_OPTIONS = ['orgAdmin', 'teamLead', 'editor', 'viewer'] as const;

type OrgUserOption = {
  id: string;
  label: string;
  email?: string;
  role?: string | null;
  expiresAt?: string | null;
  departmentIds?: string[];
  departments?: Array<{
    id: string;
    name: string;
    deptRole?: string | null;
  }>;
};

type OrgRoleOption = {
  key: string;
  name?: string;
};

function describeReviewer(sel: ReviewerSelectorDraft): string {
  if (sel.type === 'department_leads') {
    return String(sel.departmentId || '').trim()
      ? 'Specific department leads'
      : "Document department leads";
  }
  if (sel.type === 'user_ids') return `${(sel.value || []).length} users`;
  return `Role: ${String(sel.value || '').trim() || '—'}`;
}

function describeApprovals(stage: StageDraft): string {
  const n = stage.mode === 'sequential'
    ? 1
    : Math.max(1, Number(stage.requiredApprovals || 1) || 1);
  return `${n} approver${n === 1 ? '' : 's'}`;
}

function resolveStageDescription(stage: StageDraft, templateDescription?: string): string {
  const stageDescription = String(stage.description || '').trim();
  if (stageDescription) return stageDescription;
  const fallback = String(templateDescription || '').trim();
  if (fallback) return fallback;
  return 'No description provided.';
}

function formatTimeAgo(timestamp?: string | null): string {
  const time = timestamp ? new Date(timestamp).getTime() : NaN;
  if (!Number.isFinite(time)) return 'just now';

  const diffMs = Math.max(0, Date.now() - time);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} wk${weeks === 1 ? '' : 's'} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo${months === 1 ? '' : 's'} ago`;

  const years = Math.floor(days / 365);
  return `${years} yr${years === 1 ? '' : 's'} ago`;
}

function getScopedDepartmentId(selector: ReviewerSelectorDraft): string | null {
  return String(selector.departmentId || '').trim() || null;
}

function getReviewersForSelector(selector: ReviewerSelectorDraft, users: OrgUserOption[]): OrgUserOption[] {
  const scopedDepartmentId = getScopedDepartmentId(selector);
  const isWithinDepartment = (user: OrgUserOption) => (
    !scopedDepartmentId || (user.departmentIds || []).includes(scopedDepartmentId)
  );

  if (selector.type === 'role') {
    const roleKey = String(selector.value || '').trim();
    if (!roleKey) return [];
    return users.filter((user) => String(user.role || '').trim() === roleKey && isWithinDepartment(user));
  }

  if (selector.type === 'user_ids') {
    const userById = new Map(users.map((user) => [user.id, user]));
    return (selector.value || [])
      .map((userId) => userById.get(String(userId)))
      .filter(Boolean) as OrgUserOption[];
  }

  if (!scopedDepartmentId) return [];
  return users.filter((user) => (
    user.departments || []
  ).some((department) => (
    String(department.id || '') === scopedDepartmentId
    && String(department.deptRole || '').toLowerCase() === 'lead'
  )));
}

function evaluateStageHealth(stage: StageDraft, ctx: DraftValidationContext): StageHealth {
  const previewUsers = ctx.directoryLoaded
    ? getReviewersForSelector(stage.reviewerSelector, ctx.users)
    : [];
  let assignedApproverCount: number | null = null;
  const requiredApprovals = stage.mode === 'sequential'
    ? 1
    : Math.max(1, Number(stage.requiredApprovals || 1) || 1);
  const issues: string[] = [];
  const blockingIssues: string[] = [];

  const stageName = String(stage.name || '').trim();
  if (!stageName) {
    blockingIssues.push('Stage name is required');
  }

  const stageId = String(stage.id || '').trim();
  if (!stageId) {
    blockingIssues.push('Stage id is required');
  } else if (!/^[a-z0-9_]{1,48}$/.test(stageId)) {
    blockingIssues.push('Stage id must use lowercase letters, numbers, and underscores only');
  }

  const noApproversAssigned =
    (stage.reviewerSelector.type === 'role' && !String(stage.reviewerSelector.value || '').trim())
    || (stage.reviewerSelector.type === 'user_ids' && (stage.reviewerSelector.value || []).length === 0);

  if (noApproversAssigned) {
    blockingIssues.push('No approvers assigned');
  } else {
    if (stage.reviewerSelector.type === 'user_ids') {
      assignedApproverCount = (stage.reviewerSelector.value || []).length;
    } else if (ctx.directoryLoaded && (stage.reviewerSelector.type !== 'department_leads' || getScopedDepartmentId(stage.reviewerSelector))) {
      assignedApproverCount = previewUsers.length;
    }

    if (stage.reviewerSelector.type === 'user_ids' && assignedApproverCount !== null && requiredApprovals > assignedApproverCount) {
      blockingIssues.push(`Required approvals (${requiredApprovals}) exceed selected reviewers (${assignedApproverCount})`);
    } else if (assignedApproverCount !== null && requiredApprovals > assignedApproverCount) {
      issues.push(`Currently only ${assignedApproverCount} reviewer${assignedApproverCount === 1 ? '' : 's'} match this stage`);
    }
  }

  const scopedDepartmentId = getScopedDepartmentId(stage.reviewerSelector);
  if (scopedDepartmentId && ctx.directoryLoaded && !ctx.departmentIds.has(scopedDepartmentId)) {
    blockingIssues.push('Selected department no longer exists');
  }

  if (stage.reviewerSelector.type === 'role') {
    const roleKey = String(stage.reviewerSelector.value || '').trim();
    if (roleKey && ctx.directoryLoaded && ctx.knownRoleKeys.size > 0 && !ctx.knownRoleKeys.has(roleKey)) {
      blockingIssues.push(`Role '${roleKey}' does not exist in this organization`);
    } else if (roleKey && ctx.directoryLoaded && previewUsers.length === 0) {
      issues.push('No active members currently match this role and department filter');
    }
  }

  if (stage.reviewerSelector.type === 'user_ids') {
    const selectedUserIds = Array.isArray(stage.reviewerSelector.value)
      ? stage.reviewerSelector.value.map((id) => String(id)).filter(Boolean)
      : [];
    if (ctx.directoryLoaded) {
      const missingUsers = selectedUserIds.filter((id) => !ctx.knownUserIds.has(id));
      if (missingUsers.length > 0) {
        blockingIssues.push('One or more selected users are no longer members of this organization');
      }
      if (scopedDepartmentId) {
        const outsideDepartment = selectedUserIds.filter((id) => {
          const user = ctx.userOptionMap.get(id);
          return !user || !(user.departmentIds || []).includes(scopedDepartmentId);
        });
        if (outsideDepartment.length > 0) {
          blockingIssues.push('One or more selected users are outside the department filter');
        }
      }
    }
  }

  if (stage.reviewerSelector.type === 'department_leads' && !scopedDepartmentId) {
    issues.push("Uses the document's department at submission time, so general documents can still fail later");
  } else if (stage.reviewerSelector.type === 'department_leads' && ctx.directoryLoaded && previewUsers.length === 0) {
    issues.push('No department leads currently match this stage');
  }

  const level: HealthLevel = blockingIssues.length > 0
    ? 'invalid'
    : issues.length > 0
      ? 'attention'
      : 'valid';

  return {
    level,
    issues: [...blockingIssues, ...issues],
    blockingIssues,
    assignedApproverCount,
    requiredApprovals,
  };
}

function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}

function canonicalizeJson(value: any): string {
  return JSON.stringify(sortKeysDeep(value));
}

const PRESETS: Array<{ key: PresetKey; label: string; config: any }> = [
  {
    key: 'simple-2-step',
    label: 'Simple 2-Step Approval',
    config: {
      schema_version: 1,
      stages: [
        {
          id: 'review',
          name: 'Team Lead Review',
          mode: 'parallel',
          required_approvals: 1,
          reviewer_selector: { type: 'role', value: 'teamLead' },
        },
        {
          id: 'final',
          name: 'Org Admin Approval',
          mode: 'sequential',
          required_approvals: 1,
          reviewer_selector: { type: 'role', value: 'orgAdmin' },
        },
      ],
      settings: {
        allow_self_approval: false,
      },
    },
  },
  {
    key: 'one-step-admin',
    label: 'One-Step (Org Admin)',
    config: {
      schema_version: 1,
      stages: [
        {
          id: 'final',
          name: 'Approval',
          mode: 'parallel',
          required_approvals: 1,
          reviewer_selector: { type: 'role', value: 'orgAdmin' },
        },
      ],
      settings: {
        allow_self_approval: false,
      },
    },
  },
  {
    key: 'dept-leads',
    label: 'Department Leads Review',
    config: {
      schema_version: 1,
      stages: [
        {
          id: 'review',
          name: 'Department Lead Review',
          mode: 'parallel',
          required_approvals: 1,
          reviewer_selector: { type: 'department_leads' },
        },
      ],
      settings: {
        allow_self_approval: false,
      },
    },
  },
];

function normalizeStageId(value: string): string {
  const s = String(value || '').trim().toLowerCase();
  // stable, URL-safe-ish identifier
  return s
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'stage';
}

function ensureUniqueStageId(value: string, stages: StageDraft[], index: number): string {
  const base = normalizeStageId(value);
  const taken = new Set(
    stages
      .map((s, i) => (i === index ? '' : String(s.id || '').trim()))
      .filter(Boolean)
  );
  if (!taken.has(base)) return base;

  let n = 2;
  let candidate = `${base}_${n}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${base}_${n}`;
  }
  return candidate;
}

function normalizeRequiredApprovals(stage: StageDraft): number {
  if (stage.mode === 'sequential') return 1;

  const requested = Math.max(1, Number(stage.requiredApprovals || 1) || 1);
  if (stage.reviewerSelector.type !== 'user_ids') return requested;

  const selectedReviewerCount = Math.max(1, (stage.reviewerSelector.value || []).length);
  return Math.min(requested, selectedReviewerCount);
}

function normalizeStageDraft(stage: StageDraft): StageDraft {
  return {
    ...stage,
    requiredApprovals: normalizeRequiredApprovals(stage),
  };
}

function parseConfigToDraft(config: any): {
  stages: StageDraft[];
  settings: { allowSelfApproval: boolean };
} {
  const cfg = config && typeof config === 'object' ? config : {};
  const stagesRaw = Array.isArray(cfg.stages) ? cfg.stages : [];
  const settingsRaw = cfg.settings && typeof cfg.settings === 'object' ? cfg.settings : {};

  const stages: StageDraft[] = stagesRaw.map((s: any, idx: number) => {
    const id = normalizeStageId(String(s?.id || `stage_${idx + 1}`).trim() || `stage_${idx + 1}`);
    const name = String(s?.name || id).trim() || id;
    const stageDescription = String(s?.description || '').trim();
    const mode = String(s?.mode || 'parallel').toLowerCase() === 'sequential' ? 'sequential' : 'parallel';
    const requiredApprovals = Math.max(1, Number(s?.required_approvals || 1) || 1);
    const sel = s?.reviewer_selector && typeof s.reviewer_selector === 'object' ? s.reviewer_selector : {};
    const selType = String(sel?.type || 'role').trim();
    const departmentId = String(sel?.department_id ?? sel?.departmentId ?? '').trim() || null;

    let reviewerSelector: ReviewerSelectorDraft = { type: 'role', value: '', departmentId };
    if (selType === 'department_leads') {
      reviewerSelector = { type: 'department_leads', departmentId };
    } else if (selType === 'user_ids') {
      const v = Array.isArray(sel?.value) ? sel.value : [];
      reviewerSelector = { type: 'user_ids', value: v.map((x: any) => String(x)).filter(Boolean), departmentId };
    } else {
      reviewerSelector = { type: 'role', value: String(sel?.value || '').trim(), departmentId };
    }

    return normalizeStageDraft({
      id,
      name,
      description: stageDescription,
      mode,
      requiredApprovals: mode === 'sequential' ? 1 : requiredApprovals,
      reviewerSelector,
    });
  });

  // Safe default: pharma-style workflows usually should not allow self-approval unless explicitly enabled.
  const allowSelfApproval = settingsRaw.allow_self_approval === true;

  return {
    stages: stages.length ? stages : [
      normalizeStageDraft({
        id: 'review',
        name: 'Review',
        description: '',
        mode: 'parallel',
        requiredApprovals: 1,
        reviewerSelector: { type: 'role', value: '', departmentId: null },
      })
    ],
    settings: {
      allowSelfApproval,
    },
  };
}

function buildConfigFromDraft(draft: {
  stages: StageDraft[];
  settings: { allowSelfApproval: boolean };
}): any {
  return {
    schema_version: 1,
    stages: (draft.stages || []).map((s) => {
      const scopedDepartmentId = String(s.reviewerSelector.departmentId || '').trim() || null;
      const withDepartmentScope = (selector: any) => (
        scopedDepartmentId ? { ...selector, department_id: scopedDepartmentId } : selector
      );
      return {
        id: String(s.id || '').trim(),
        name: String(s.name || '').trim() || String(s.id || '').trim(),
        description: String(s.description || '').trim() || undefined,
        mode: s.mode,
        required_approvals: s.mode === 'sequential' ? 1 : Math.max(1, Number(s.requiredApprovals || 1) || 1),
        reviewer_selector: s.reviewerSelector.type === 'role'
          ? withDepartmentScope({ type: 'role', value: String(s.reviewerSelector.value || '').trim() })
          : s.reviewerSelector.type === 'user_ids'
            ? withDepartmentScope({ type: 'user_ids', value: (s.reviewerSelector.value || []).map((x) => String(x)).filter(Boolean) })
            : withDepartmentScope({ type: 'department_leads' }),
      };
    }),
    settings: {
      allow_self_approval: draft.settings.allowSelfApproval,
    },
  };
}

function validateDraft(draft: { stages: StageDraft[] }, ctx: DraftValidationContext): string | null {
  const stages = draft.stages || [];
  if (stages.length === 0) return 'Add at least 1 stage.';

  const ids = stages.map((s) => String(s.id || '').trim()).filter(Boolean);
  if (ids.length !== stages.length) return 'Every stage must have an id (open a stage → Advanced → Stage id).';
  const uniq = new Set(ids);
  if (uniq.size !== ids.length) return 'Stage ids must be unique (open a stage → Advanced → Stage id).';

  for (const s of stages) {
    if (s.mode === 'sequential' && Number(s.requiredApprovals || 1) !== 1) {
      return 'Sequential stages must have required approvals = 1.';
    }
    const stageHealth = evaluateStageHealth(s, ctx);
    if (stageHealth.blockingIssues.length > 0) {
      return `Stage '${s.id || s.name || 'stage'}': ${stageHealth.blockingIssues[0]}.`;
    }
  }
  return null;
}

export default function ApprovalTemplatesSettingsPage() {
  const { hasPermission, isLoading: authLoading, bootstrapData } = useAuth();
  const { toast } = useToast();
  const canManageTemplates = hasPermission('org.update_settings');
  const { approvalsUsable } = getOrgFeatures(bootstrapData?.orgSettings);

  if (!authLoading && !canManageTemplates) {
    return <ViewAccessDenied />;
  }

  if (!authLoading && bootstrapData && !approvalsUsable) {
    return (
      <ViewAccessDenied
        title="Approvals Not Enabled"
        message="Approvals are not enabled for this organization."
      />
    );
  }

  return <ApprovalTemplatesSettingsInner toast={toast} selectedOrgId={bootstrapData?.selectedOrgId || null} />;
}

function ApprovalTemplatesSettingsInner({ toast, selectedOrgId }: { toast: (args: any) => void; selectedOrgId: string | null }) {

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [templates, setTemplates] = React.useState<ApprovalTemplate[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [templateSelectorOpen, setTemplateSelectorOpen] = React.useState(false);

  const [mode, setMode] = React.useState<'edit' | 'new'>('edit');
  const [preset, setPreset] = React.useState<PresetKey>('simple-2-step');

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [isDefault, setIsDefault] = React.useState(false);
  const [inspectorTab, setInspectorTab] = React.useState<'settings' | 'stage'>('settings');
  const [stagesDraft, setStagesDraft] = React.useState<StageDraft[]>([]);
  const [selectedStageIndex, setSelectedStageIndex] = React.useState<number | null>(null);
  const [allowSelfApproval, setAllowSelfApproval] = React.useState(false);
  const [orgUsers, setOrgUsers] = React.useState<OrgUserOption[]>([]);
  const [orgRoles, setOrgRoles] = React.useState<OrgRoleOption[]>([]);
  const [departments, setDepartments] = React.useState<DepartmentOption[]>([]);
  const [directoryLoading, setDirectoryLoading] = React.useState(true);
  const [reviewerPickerOpen, setReviewerPickerOpen] = React.useState(false);
  const [stagePendingDeleteIndex, setStagePendingDeleteIndex] = React.useState<number | null>(null);

  const departmentNameById = React.useMemo(() => {
    return new Map((departments || []).map((d) => [d.id, d.name]));
  }, [departments]);

  React.useEffect(() => {
    let active = true;
    const loadDirectory = async () => {
      setDirectoryLoading(true);
      try {
        const orgId = getApiContext().orgId || selectedOrgId || '';
        if (!orgId) {
          if (!active) return;
          setOrgUsers([]);
          setOrgRoles([]);
          setDepartments([]);
          return;
        }

        const [usersRes, rolesRes, departmentsRes] = await Promise.allSettled([
          apiFetch<any[]>(`/orgs/${orgId}/users`),
          apiFetch<any[]>(`/orgs/${orgId}/roles`),
          apiFetch<any[]>(`/orgs/${orgId}/departments?includeMine=1`),
        ]);

        if (!active) return;

        const users = usersRes.status === 'fulfilled' && Array.isArray(usersRes.value) ? usersRes.value : [];
        const roles = rolesRes.status === 'fulfilled' && Array.isArray(rolesRes.value) ? rolesRes.value : [];
        const departmentsRaw = departmentsRes.status === 'fulfilled' && Array.isArray(departmentsRes.value)
          ? departmentsRes.value
          : [];

        const mappedUsers: OrgUserOption[] = users
          .map((u: any) => {
            const id = String(u?.userId || u?.id || u?.username || '').trim();
            if (!id) return null;
            const label = String(u?.displayName || u?.app_users?.display_name || u?.email || id).trim() || id;
            const email = String(u?.email || '').trim() || undefined;
            const role = String(u?.role || '').trim() || null;
            const expiresAt = String(u?.expires_at || '').trim() || null;
            const departments = Array.isArray(u?.departments)
              ? u.departments
                .map((d: any) => {
                  const departmentId = String(d?.id || '').trim();
                  if (!departmentId) return null;
                  return {
                    id: departmentId,
                    name: String(d?.name || '').trim() || departmentId,
                    deptRole: String(d?.deptRole || '').trim() || null,
                  };
                })
                .filter(Boolean)
              : [];
            const departmentIds = Array.isArray(u?.departments)
              ? u.departments
                .map((d: any) => String(d?.id || '').trim())
                .filter(Boolean)
              : [];
            return { id, label, email, role, expiresAt, departmentIds, departments };
          })
          .filter(Boolean) as OrgUserOption[];

        const seenUserIds = new Set<string>();
        const dedupedUsers = mappedUsers.filter((u) => {
          if (seenUserIds.has(u.id)) return false;
          seenUserIds.add(u.id);
          return true;
        });
        dedupedUsers.sort((a, b) => a.label.localeCompare(b.label));
        setOrgUsers(dedupedUsers);

        const mappedRoles: OrgRoleOption[] = roles
          .map((r: any) => {
            const key = String(r?.key || '').trim();
            if (!key) return null;
            const name = String(r?.name || '').trim() || undefined;
            return { key, name };
          })
          .filter(Boolean) as OrgRoleOption[];
        setOrgRoles(mappedRoles);

        const mappedDepartments: DepartmentOption[] = departmentsRaw
          .map((d: any) => {
            const id = String(d?.id || '').trim();
            const name = String(d?.name || '').trim();
            if (!id || !name) return null;
            return { id, name };
          })
          .filter(Boolean) as DepartmentOption[];
        mappedDepartments.sort((a, b) => a.name.localeCompare(b.name));
        setDepartments(mappedDepartments);
      } finally {
        if (active) setDirectoryLoading(false);
      }
    };

    void loadDirectory();
    return () => {
      active = false;
    };
  }, [selectedOrgId]);

  const selectedTemplate = React.useMemo(
    () => (selectedId ? templates.find((t) => t.id === selectedId) || null : null),
    [selectedId, templates]
  );

  const originalRef = React.useRef<ApprovalTemplate | null>(null);
  const originalCanonicalConfigRef = React.useRef<string | null>(null);

  const roleOptions = React.useMemo(() => {
    const map = new Map<string, string | undefined>();
    const source = directoryLoading
      ? ROLE_KEY_OPTIONS.map((key) => ({ key, name: undefined }))
      : orgRoles.length > 0
      ? orgRoles
      : [];
    for (const r of source) {
      map.set(r.key, r.name);
    }
    return Array.from(map.entries())
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => (a.name || a.key).localeCompare(b.name || b.key));
  }, [directoryLoading, orgRoles]);

  const userOptionMap = React.useMemo(() => {
    return new Map(orgUsers.map((u) => [u.id, u]));
  }, [orgUsers]);

  const validationContext = React.useMemo<DraftValidationContext>(() => ({
    departmentIds: new Set((departments || []).map((department) => department.id)),
    knownRoleKeys: new Set(roleOptions.map((role) => role.key)),
    knownUserIds: new Set(orgUsers.map((user) => user.id)),
    userOptionMap,
    users: orgUsers,
    directoryLoaded: !directoryLoading,
  }), [departments, directoryLoading, orgUsers, roleOptions, userOptionMap]);

  const loadTemplates = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listApprovalTemplates({ includeInactive: true });
      const list = Array.isArray(res.templates) ? res.templates : [];
      setTemplates(list);
    } catch (e: any) {
      toast({ title: 'Failed to load templates', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  React.useEffect(() => {
    if (mode !== 'edit') return;
    if (selectedId) return;
    if (templates.length === 0) return;
    setSelectedId(templates[0].id);
  }, [mode, selectedId, templates]);

  const loadIntoForm = React.useCallback((t: ApprovalTemplate) => {
    setMode('edit');
    setName(t.name || '');
    setDescription(t.description || '');
    setIsActive(Boolean(t.is_active));
    setIsDefault(Boolean(t.is_default));

    const parsed = parseConfigToDraft(t.config || {});
    setStagesDraft(parsed.stages);
    setSelectedStageIndex(null);
    setStagePendingDeleteIndex(null);
    setAllowSelfApproval(parsed.settings.allowSelfApproval);

    originalRef.current = t;
    originalCanonicalConfigRef.current = canonicalizeJson(buildConfigFromDraft(parsed));
  }, []);

  React.useEffect(() => {
    if (!selectedTemplate) return;
    loadIntoForm(selectedTemplate);
  }, [selectedTemplate, loadIntoForm]);

  const beginNew = () => {
    const p = PRESETS.find((x) => x.key === preset) || PRESETS[0];
    const parsed = parseConfigToDraft(p.config);
    setMode('new');
    setSelectedId(null);
    setName('New approval template');
    setDescription('');
    setIsActive(true);
    setIsDefault(false);
    setStagesDraft(parsed.stages);
    setSelectedStageIndex(null);
    setStagePendingDeleteIndex(null);
    setAllowSelfApproval(parsed.settings.allowSelfApproval);
    originalRef.current = null;
    originalCanonicalConfigRef.current = canonicalizeJson(buildConfigFromDraft(parsed));
  };

  const applyPreset = () => {
    const p = PRESETS.find((x) => x.key === preset) || PRESETS[0];
    const parsed = parseConfigToDraft(p.config);
    setStagesDraft(parsed.stages);
    setSelectedStageIndex(null);
    setStagePendingDeleteIndex(null);
    setAllowSelfApproval(parsed.settings.allowSelfApproval);
  };

  const onSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: 'Name required', description: 'Template name cannot be empty.', variant: 'destructive' });
      return;
    }

    const err = validateDraft({ stages: stagesDraft }, validationContext);
    if (err) {
      toast({ title: 'Template needs fixes', description: err, variant: 'destructive' });
      return;
    }

    const parsedConfig = buildConfigFromDraft({
      stages: stagesDraft,
      settings: {
        allowSelfApproval,
      },
    });

    setSaving(true);
    try {
      let saveToastHandle: ReturnType<typeof toast> | null = null;

      if (mode === 'new') {
        saveToastHandle = toast({
          title: 'Creating template...',
          description: 'Saving your approval template.',
        });
        const created = await createApprovalTemplate({
          name: trimmedName,
          description: description.trim() ? description.trim() : undefined,
          isActive,
          isDefault,
          config: parsedConfig,
        });
        saveToastHandle.update({
          id: saveToastHandle.id,
          title: 'Created',
          description: 'Approval template created.',
          open: true,
        });
        await loadTemplates();
        setSelectedId(created.id);
        setMode('edit');
        return;
      }

      const original = originalRef.current;
      if (!original) return;

      const patch: any = {};

      if (trimmedName !== original.name) patch.name = trimmedName;

      const nextDesc = description.trim();
      const prevDesc = (original.description || '').trim();
      if (nextDesc !== prevDesc) patch.description = nextDesc ? nextDesc : null;

      if (Boolean(isActive) !== Boolean(original.is_active)) patch.isActive = Boolean(isActive);
      if (Boolean(isDefault) !== Boolean(original.is_default)) patch.isDefault = Boolean(isDefault);

      const nextCanonical = canonicalizeJson(parsedConfig || {});
      const prevCanonical = originalCanonicalConfigRef.current || canonicalizeJson(original.config || {});
      if (nextCanonical !== prevCanonical) patch.config = parsedConfig;

      if (Object.keys(patch).length === 0) {
        toast({ title: 'No changes', description: 'Nothing to update.' });
        return;
      }

      saveToastHandle = toast({
        title: 'Saving template...',
        description: 'Updating your approval template.',
      });
      const updated = await updateApprovalTemplate(original.id, patch);
      saveToastHandle.update({
        id: saveToastHandle.id,
        title: 'Saved',
        description: 'Template updated.',
        open: true,
      });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedId(updated.id);
      loadIntoForm(updated);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => String(t.name || '').toLowerCase().includes(q));
  }, [query, templates]);

  React.useEffect(() => {
    setSelectedStageIndex((current) => {
      if (stagesDraft.length === 0) return null;
      if (current === null) return current;
      if (current >= stagesDraft.length) return stagesDraft.length - 1;
      if (current < 0) return 0;
      return current;
    });
  }, [stagesDraft.length]);
  React.useEffect(() => {
    setReviewerPickerOpen(false);
  }, [selectedStageIndex]);

  const selectedStage = selectedStageIndex === null ? null : stagesDraft[selectedStageIndex] || null;
  const selectedStageRoleSelector = selectedStage && selectedStage.reviewerSelector.type === 'role'
    ? selectedStage.reviewerSelector
    : null;
  const selectedStageScopedDepartmentId = selectedStage
    ? getScopedDepartmentId(selectedStage.reviewerSelector)
    : null;

  const selectedStageUserIds = React.useMemo(() => {
    if (!selectedStage || selectedStage.reviewerSelector.type !== 'user_ids') return [] as string[];
    return selectedStage.reviewerSelector.value || [];
  }, [selectedStage]);

  const availableReviewerUserOptions = React.useMemo(() => {
    if (!selectedStage || selectedStage.reviewerSelector.type !== 'user_ids') return [] as OrgUserOption[];
    return orgUsers.filter((u) => {
      if (!selectedStageScopedDepartmentId) return true;
      return (u.departmentIds || []).includes(selectedStageScopedDepartmentId);
    });
  }, [orgUsers, selectedStage, selectedStageScopedDepartmentId]);

  const selectedStagePreviewUsers = React.useMemo(() => {
    if (!selectedStage) return [] as OrgUserOption[];
    return getReviewersForSelector(selectedStage.reviewerSelector, orgUsers);
  }, [orgUsers, selectedStage]);

  const selectedStagePreviewMessage = React.useMemo(() => {
    if (!selectedStage) return null;
    if (directoryLoading) return 'Loading organization directory…';
    if (selectedStage.reviewerSelector.type === 'role' && !String(selectedStage.reviewerSelector.value || '').trim()) {
      return 'Choose a role to resolve reviewers for this stage.';
    }
    if (selectedStage.reviewerSelector.type === 'department_leads' && !selectedStageScopedDepartmentId) {
      return "This stage will use the document's department leads when someone submits a document.";
    }
    if (selectedStagePreviewUsers.length === 0) {
      return 'No active reviewers currently match this stage.';
    }
    return null;
  }, [directoryLoading, selectedStage, selectedStagePreviewUsers, selectedStageScopedDepartmentId]);

  const selectedStageRequiredApprovalsMax = React.useMemo(() => {
    if (!selectedStage || selectedStage.mode === 'sequential') return 1;
    if (selectedStage.reviewerSelector.type !== 'user_ids') return null;
    return selectedStageUserIds.length > 0 ? selectedStageUserIds.length : null;
  }, [selectedStage, selectedStageUserIds.length]);

  const stageCountFromTemplate = React.useCallback((template: ApprovalTemplate | null | undefined) => {
    const n = Array.isArray(template?.config?.stages) ? template?.config?.stages.length : 0;
    return Number(n || 0);
  }, []);

  const selectStageForEditing = React.useCallback((index: number) => {
    setSelectedStageIndex(index);
    setInspectorTab('stage');
  }, []);

  const requestRemoveStage = React.useCallback((index: number) => {
    setStagePendingDeleteIndex(index);
  }, []);

  const addStageAfter = React.useCallback((afterIndex: number) => {
    setStagesDraft((prev) => {
      const used = new Set((prev || []).map((s) => String(s.id || '').trim()));
      let i = (prev?.length || 0) + 1;
      let nextId = `stage_${i}`;
      while (used.has(nextId)) {
        i += 1;
        nextId = `stage_${i}`;
      }
      const newStage: StageDraft = {
        id: nextId,
        name: `Stage ${i}`,
        description: '',
        mode: 'parallel',
        requiredApprovals: 1,
        reviewerSelector: { type: 'role', value: '', departmentId: null },
      };

      const insertAt = Math.max(0, Math.min(afterIndex + 1, prev.length));
      const next = [...prev.slice(0, insertAt), newStage, ...prev.slice(insertAt)];
      setSelectedStageIndex(insertAt);
      return next;
    });
  }, []);

  const updateStageAt = React.useCallback((index: number, patch: Partial<StageDraft>) => {
    setStagesDraft((prev) => prev.map((s, i) => (
      i === index
        ? normalizeStageDraft({ ...s, ...patch })
        : s
    )));
  }, []);

  const setSelectedStageRoleValue = React.useCallback((roleKey: string) => {
    if (selectedStageIndex === null) return;
    updateStageAt(selectedStageIndex, {
      reviewerSelector: {
        type: 'role',
        value: roleKey,
        departmentId: selectedStageScopedDepartmentId,
      },
    });
  }, [selectedStageIndex, selectedStageScopedDepartmentId, updateStageAt]);

  const toggleSelectedStageUser = React.useCallback((userId: string) => {
    if (selectedStageIndex === null || !selectedStage || selectedStage.reviewerSelector.type !== 'user_ids') return;
    const current = selectedStage.reviewerSelector.value || [];
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    updateStageAt(selectedStageIndex, {
      reviewerSelector: {
        type: 'user_ids',
        value: next,
        departmentId: selectedStageScopedDepartmentId,
      },
    });
  }, [selectedStage, selectedStageIndex, selectedStageScopedDepartmentId, updateStageAt]);

  const moveSelectedStageUser = React.useCallback((userId: string, dir: -1 | 1) => {
    if (selectedStageIndex === null || !selectedStage || selectedStage.reviewerSelector.type !== 'user_ids') return;
    const current = [...(selectedStage.reviewerSelector.value || [])];
    const fromIndex = current.findIndex((id) => String(id) === String(userId));
    if (fromIndex < 0) return;
    const toIndex = fromIndex + dir;
    if (toIndex < 0 || toIndex >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateStageAt(selectedStageIndex, {
      reviewerSelector: {
        type: 'user_ids',
        value: next,
        departmentId: selectedStageScopedDepartmentId,
      },
    });
  }, [selectedStage, selectedStageIndex, selectedStageScopedDepartmentId, updateStageAt]);

  const moveStage = React.useCallback((index: number, dir: -1 | 1) => {
    setStagesDraft((prev) => {
      const to = index + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[to];
      next[to] = tmp;
      return next;
    });
    setSelectedStageIndex((current) => {
      const to = index + dir;
      if (to < 0) return current;
      if (current === null) return current;
      if (current === index) return to;
      if (current === to) return index;
      return current;
    });
  }, []);

  const removeStage = React.useCallback((index: number) => {
    setStagesDraft((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = prev.filter((_, i) => i !== index);
      setSelectedStageIndex((current) => {
        if (next.length === 0) return null;
        if (current === null) return null;
        if (current > index) return current - 1;
        if (current === index) return Math.min(index, next.length - 1);
        return current;
      });
      return next;
    });
  }, []);

  const duplicateStageAt = React.useCallback((index: number) => {
    setStagesDraft((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const source = prev[index];
      const copiedSelector: ReviewerSelectorDraft = source.reviewerSelector.type === 'role'
        ? { type: 'role', value: source.reviewerSelector.value, departmentId: source.reviewerSelector.departmentId ?? null }
        : source.reviewerSelector.type === 'user_ids'
          ? { type: 'user_ids', value: [...(source.reviewerSelector.value || [])], departmentId: source.reviewerSelector.departmentId ?? null }
          : { type: 'department_leads', departmentId: source.reviewerSelector.departmentId ?? null };

      const duplicateBaseId = normalizeStageId(`${source.id || 'stage'}_copy`);
      const duplicateId = ensureUniqueStageId(duplicateBaseId, prev, -1);
      const duplicateStage: StageDraft = {
        ...source,
        id: duplicateId,
        name: `${source.name || source.id} Copy`,
        reviewerSelector: copiedSelector,
      };

      const insertAt = index + 1;
      const next = [...prev.slice(0, insertAt), duplicateStage, ...prev.slice(insertAt)];
      setSelectedStageIndex(insertAt);
      return next;
    });
  }, []);

  const stageHealthByIndex = React.useMemo(
    () => stagesDraft.map((stage) => evaluateStageHealth(stage, validationContext)),
    [stagesDraft, validationContext]
  );

  const selectedStageHealth = React.useMemo(() => {
    if (selectedStageIndex === null) return null;
    return stageHealthByIndex[selectedStageIndex] || null;
  }, [selectedStageIndex, stageHealthByIndex]);

  const templateHealth = React.useMemo(() => {
    if (stagesDraft.length === 0) {
      return { level: 'invalid' as HealthLevel, message: 'Template has no stages configured.' };
    }

    const invalidCount = stageHealthByIndex.filter((x) => x.level === 'invalid').length;
    if (invalidCount > 0) {
      return {
        level: 'invalid' as HealthLevel,
        message: `${invalidCount} stage${invalidCount === 1 ? '' : 's'} invalid.`,
      };
    }

    const attentionCount = stageHealthByIndex.filter((x) => x.level === 'attention').length;
    if (attentionCount > 0) {
      return {
        level: 'attention' as HealthLevel,
        message: `${attentionCount} stage${attentionCount === 1 ? '' : 's'} need attention.`,
      };
    }

    return { level: 'valid' as HealthLevel, message: 'All stages are valid.' };
  }, [stageHealthByIndex, stagesDraft.length]);

  const draftValidationMessage = React.useMemo(
    () => validateDraft({ stages: stagesDraft }, validationContext),
    [stagesDraft, validationContext]
  );

  const duplicateNameMessage = React.useMemo(() => {
    const trimmedName = name.trim().toLowerCase();
    if (!trimmedName) return null;
    const conflictingTemplate = templates.find((template) => {
      if (selectedId && template.id === selectedId) return false;
      return String(template.name || '').trim().toLowerCase() === trimmedName;
    });
    return conflictingTemplate ? 'Another approval template already uses this name.' : null;
  }, [name, selectedId, templates]);

  const effectiveStageCount = stagesDraft.length;

  const saveBlockMessage = React.useMemo(() => {
    if (!name.trim()) return 'Template name is required.';
    if (directoryLoading) return 'Loading organization directory…';
    if (duplicateNameMessage) return duplicateNameMessage;
    if (effectiveStageCount === 0) return 'Template must contain at least one stage before saving.';
    if (isDefault && !isActive) return 'Default templates must stay active.';
    return draftValidationMessage;
  }, [directoryLoading, draftValidationMessage, duplicateNameMessage, effectiveStageCount, isActive, isDefault, name]);

  const currentConfigCanonical = React.useMemo(() => {
    const cfg = buildConfigFromDraft({
      stages: stagesDraft,
      settings: {
        allowSelfApproval,
      },
    });
    return canonicalizeJson(cfg);
  }, [allowSelfApproval, stagesDraft]);

  const hasUnsavedChanges = React.useMemo(() => {
    const baselineCanonical = originalCanonicalConfigRef.current;
    const configChanged = currentConfigCanonical !== baselineCanonical;

    if (mode === 'new') {
      return (
        name.trim() !== 'New approval template'
        || description.trim() !== ''
        || isActive !== true
        || isDefault !== false
        || configChanged
      );
    }

    const original = originalRef.current;
    if (!original) return false;

    return (
      name.trim() !== original.name
      || description.trim() !== (original.description || '').trim()
      || Boolean(isActive) !== Boolean(original.is_active)
      || Boolean(isDefault) !== Boolean(original.is_default)
      || configChanged
    );
  }, [currentConfigCanonical, description, isActive, isDefault, mode, name, selectedId]);

  const canSave = !saving && !loading && hasUnsavedChanges && !saveBlockMessage;

  const pendingDeleteStage = stagePendingDeleteIndex === null
    ? null
    : stagesDraft[stagePendingDeleteIndex] || null;

  React.useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      const key = String(event.key || '').toLowerCase();
      if (key !== 's') return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      if (canSave) {
        void onSave();
      }
    };

    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, [canSave, onSave]);

  return (
    <div className={cn(styles.pageTheme, 'min-h-screen bg-background/30')}>
      <header className={cn(styles.pageHeader, 'sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40')}>
        <div className="px-4 md:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-semibold text-foreground tracking-tight">Approval Flows</h1>
              <p className="text-[13px] text-muted-foreground mt-0.5 hidden sm:block">Build and manage approval flows for your organization.</p>
            </div>

            {/* Top Bar Template Selector */}
            <Popover open={templateSelectorOpen} onOpenChange={setTemplateSelectorOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[280px] lg:w-[320px] justify-between h-9 text-left font-normal bg-card/50 backdrop-blur-sm border-border/40 shadow-sm ml-2">
                  <div className="flex items-center gap-2 truncate">
                    {loading ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...</>
                    ) : selectedTemplate ? (
                      <>
                        <span className={cn('inline-flex h-1.5 w-1.5 shrink-0 rounded-full', selectedTemplate.is_active ? 'bg-emerald-500' : 'bg-slate-400')} />
                        <span className="truncate">{selectedTemplate.name}</span>
                        {hasUnsavedChanges && <span className="text-amber-500 text-[10px] font-medium ml-1">*(unsaved)*</span>}
                      </>
                    ) : mode === 'new' ? (
                      <span className="text-muted-foreground font-medium flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />New Template</span>
                    ) : (
                      <span className="text-muted-foreground">Select a template...</span>
                    )}
                  </div>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[360px] p-0" onWheel={(e) => e.stopPropagation()}>
                <Command>
                  <CommandInput placeholder="Search templates..." className="h-9" value={query} onValueChange={setQuery} />
                  <CommandList>
                    <CommandEmpty>No templates found.</CommandEmpty>
                    <CommandGroup>
                      {filtered.map((t) => {
                        const stageCount = stageCountFromTemplate(t);
                        return (
                          <CommandItem
                            key={t.id}
                            value={`${t.name} ${t.id}`}
                            onSelect={() => {
                              setSelectedId(t.id);
                              setMode('edit');
                              setTemplateSelectorOpen(false);
                            }}
                          >
                            <div className="flex w-full items-start justify-between gap-2 py-0.5">
                              <div className="min-w-0 pr-2">
                                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                  <Check className={cn("h-3.5 w-3.5 shrink-0", selectedId === t.id ? "opacity-100 text-primary" : "opacity-0")} />
                                  {t.name}
                                </div>
                                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground ml-5">
                                  <span className={cn('inline-flex h-1.5 w-1.5 rounded-full', t.is_active ? 'bg-emerald-500' : 'bg-slate-400')} />
                                  {t.is_active ? 'Active' : 'Draft'}
                                  <span aria-hidden>•</span>
                                  {stageCount} stage{stageCount === 1 ? '' : 's'}
                                </div>
                              </div>
                              {t.is_default && <Badge className="shrink-0 h-4 px-1 mt-0.5 text-[9px] border-primary/35 bg-primary/10 text-primary">Default</Badge>}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8 gap-1.5" onClick={beginNew} disabled={saving}>
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-[11px] font-medium"
              onClick={() => {
                if (mode === 'edit' && selectedTemplate) loadIntoForm(selectedTemplate);
                if (mode === 'new') beginNew();
              }}
              disabled={saving || !hasUnsavedChanges}
            >
              Reset
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 px-3 text-[11px] font-semibold"
              onClick={() => void onSave()}
              disabled={!canSave}
              aria-busy={saving}
            >
              {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saving ? (mode === 'new' ? 'Creating...' : 'Saving...') : (mode === 'new' ? 'Create' : 'Save')}
            </Button>
          </div>
        </div>
      </header>

      <div className="px-4 md:px-6 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]">

	          <Card className={cn(styles.pagePanel, 'border-border/40 bg-card/50 overflow-hidden shadow-sm min-w-0')}>
	            <CardHeader className="p-4 border-b border-border/20 bg-muted/5">
	              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
	                <div className="min-w-0">
	                  <h2 className="text-base font-semibold tracking-tight truncate">{name || (mode === 'new' ? 'Untitled Template' : 'Template')}</h2>
	                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-medium transition-colors', isActive ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700' : 'bg-muted/50 border-border text-muted-foreground')}>
                      {isActive ? 'Active' : 'Draft'}
                    </Badge>
	                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-sky-50/50 border-sky-200 text-sky-700 font-medium whitespace-nowrap">
	                      {stagesDraft.length} {stagesDraft.length === 1 ? 'Stage' : 'Stages'}
	                    </Badge>
	                    {isDefault && <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-primary/5 border-primary/20 text-primary font-medium">Default</Badge>}
	                    <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-medium', HEALTH_META[templateHealth.level].className)}>
	                      {templateHealth.message}
	                    </Badge>
	                  </div>
	                </div>
	              </div>
	            </CardHeader>
	            <CardContent className="pt-4">
	              <div className="rounded-xl border border-border/40 bg-background/60 overflow-hidden flex flex-col">
	                  <div className="px-3.5 py-2 border-b border-border/30 bg-muted/20 text-[11px] font-medium text-muted-foreground/80 flex items-center justify-between">
	                    <div className="flex items-center gap-2">
	                      <Sparkles className="h-3 w-3 text-primary/60" />
	                      <span>{selectedStage ? `Currently editing stage ${(selectedStageIndex ?? 0) + 1}` : "Click a stage card to start editing."}</span>
                    </div>
                    {selectedStage && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[9px] bg-primary/10 text-primary uppercase tracking-tight font-bold">IN FOCUS</Badge>
                    )}
                  </div>
                  <div className={cn(styles.builderCanvas, 'p-5 min-h-[640px]')}>
                    <div className="mx-auto max-w-[520px]">
                      <div className="flex justify-center">
                        <Badge variant="outline" className="h-6 px-3 text-[10px] tracking-wide">START</Badge>
                      </div>

                      {stagesDraft.length === 0 ? (
                        <>
                          <div className="mt-3 relative flex h-20 justify-center group/line">
                            <div className="h-full w-[2px] rounded-full bg-border/90" />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="absolute top-1/2 -translate-y-1/2 h-7 w-7 rounded-full opacity-90 transition-opacity md:opacity-0 md:pointer-events-none md:group-hover/line:opacity-100 md:group-hover/line:pointer-events-auto"
                              onClick={() => addStageAfter(-1)}
                              title="Add stage"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="text-center text-sm text-muted-foreground">No stages yet. Hover the line to add the first stage.</div>
                          <div className="mt-2 text-center text-xs text-destructive">Template must contain at least one stage before saving.</div>
                        </>
                      ) : (
                        <div className="mt-3 space-y-4">
                          {stagesDraft.map((s, idx) => (
                            <React.Fragment key={`${s.id}_${idx}`}>
                              <div className="relative flex h-10 justify-center group/line">
                                <div className="h-full w-[2px] rounded-full bg-border/90" />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="absolute top-1/2 -translate-y-1/2 h-7 w-7 rounded-full opacity-90 transition-opacity md:opacity-0 md:pointer-events-none md:group-hover/line:opacity-100 md:group-hover/line:pointer-events-auto"
                                  onClick={() => addStageAfter(idx - 1)}
                                  title="Add stage here"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              {(() => {
	                                const stageHealth = stageHealthByIndex[idx] || evaluateStageHealth(s, validationContext);
                                const hasNoApprovers = stageHealth.issues.includes('No approvers assigned');
                                const hasApprovalOverflow = !hasNoApprovers && stageHealth.issues.some((issue) => issue.startsWith('Required approvals'));
                                const isSelected = selectedStageIndex === idx;

                                return (
                                  <div
                                    className={cn(
                                      'group/stage relative rounded-2xl border bg-card/95 shadow-md transition-all duration-200',
                                      'hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/[0.03] hover:shadow-lg',
                                      isSelected
                                        ? 'border-primary/55 ring-1 ring-primary/20 shadow-lg'
                                        : 'border-border/45'
                                    )}
                                  >
                                    <div className="absolute right-3 top-2.5 z-10 flex items-center gap-1.5">
                                      {isSelected && (
                                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                          Editing
                                        </Badge>
                                      )}
                                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                        {s.mode === 'sequential' ? 'SEQUENTIAL' : 'ANY'}
                                      </Badge>
                                      <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', HEALTH_META[stageHealth.level].className)}>
                                        {HEALTH_META[stageHealth.level].label}
                                      </Badge>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => duplicateStageAt(idx)}
                                        title="Duplicate stage"
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>

                                    <button
                                      type="button"
                                      className="w-full text-left px-4 pt-3.5 pr-[220px]"
                                      onClick={() => selectStageForEditing(idx)}
                                    >
                                      <div className="flex min-w-0 items-center gap-2.5">
                                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
                                          {idx + 1}
                                        </span>
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold truncate">{s.name || s.id}</div>
                                        </div>
                                      </div>

                                      <div className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                                        {resolveStageDescription(s, description)}
                                      </div>

                                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <Badge variant="secondary" className="h-5 px-2 text-[10px] font-medium">
                                          {describeReviewer(s.reviewerSelector)}
                                        </Badge>
                                        {String(s.reviewerSelector.departmentId || '').trim() && (
                                          <Badge variant="outline" className="h-5 px-2 text-[10px]">
                                            Dept: {departmentNameById.get(String(s.reviewerSelector.departmentId || '').trim()) || `${String(s.reviewerSelector.departmentId).slice(0, 8)}...`}
                                          </Badge>
                                        )}
                                        {hasNoApprovers && (
                                          <Badge className="h-5 px-2 text-[10px] border-destructive/35 bg-destructive/10 text-destructive">
                                            No approvers
                                          </Badge>
                                        )}
                                        {hasApprovalOverflow && (
                                          <Badge className="h-5 px-2 text-[10px] border-amber-500/35 bg-amber-500/10 text-amber-700">
                                            Required {'>'} assigned
                                          </Badge>
                                        )}
                                      </div>

                                      <div className="mt-2 text-[11px] text-primary/80 opacity-0 transition-opacity group-hover/stage:opacity-100">
                                        Click to edit stage
                                      </div>
                                    </button>

                                    <div className="mt-2 border-t border-border/30 px-3 pb-3 pt-2.5 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                                        <Users className="h-3.5 w-3.5" />
                                        <span>{describeApprovals(s)}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          disabled={idx === 0}
                                          onClick={() => moveStage(idx, -1)}
                                          title="Move up"
                                        >
                                          <ChevronUp className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          disabled={idx >= stagesDraft.length - 1}
                                          onClick={() => moveStage(idx, 1)}
                                          title="Move down"
                                        >
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-destructive"
                                          onClick={() => requestRemoveStage(idx)}
                                          title="Remove stage"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </React.Fragment>
                          ))}
                        </div>
                      )}

                      {stagesDraft.length > 0 && (
                        <div className="relative flex h-10 justify-center mt-3 group/line">
                          <div className="h-full w-[2px] rounded-full bg-border/90" />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="absolute top-1/2 -translate-y-1/2 h-7 w-7 rounded-full opacity-90 transition-opacity md:opacity-0 md:pointer-events-none md:group-hover/line:opacity-100 md:group-hover/line:pointer-events-auto"
                            onClick={() => addStageAfter(stagesDraft.length - 1)}
                            title="Add stage"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
	                      <div className="flex justify-center">
	                        <Badge variant="outline" className="h-6 px-3 text-[10px] tracking-wide">END</Badge>
	                      </div>
	                    </div>
	                  </div>
	                </div>
	            </CardContent>
	          </Card>

          {/* Right Panel: Template and Stage Inspector */}
          <Card className={cn(styles.pagePanel, 'border-border/40 bg-card/50 overflow-hidden shadow-sm h-fit lg:sticky lg:top-[84px] flex flex-col')}>
            <CardHeader className="p-4 pb-3 border-b border-border/30 bg-card/40">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight">Editor</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={cn('h-1.5 w-1.5 rounded-full', hasUnsavedChanges ? 'bg-amber-500' : 'bg-emerald-500')} />
                    <span className={cn('text-[11px] font-medium', hasUnsavedChanges ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                      {hasUnsavedChanges ? 'Unsaved' : 'Saved'}
                    </span>
                    {saveBlockMessage && (hasUnsavedChanges || effectiveStageCount === 0) && (
                      <>
                        <span className="text-muted-foreground/30 px-0.5">•</span>
                        <span className="text-[11px] text-destructive truncate max-w-[120px]" title={saveBlockMessage}>{saveBlockMessage}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>

            <Tabs value={inspectorTab} onValueChange={(v) => setInspectorTab(v as 'settings' | 'stage')} className="flex-1 flex flex-col min-h-0">
              <TabsList className="w-full justify-start rounded-none border-b border-border/30 bg-transparent px-4 h-9">
                <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-0 h-full text-[12px] font-medium shadow-none transition-none">
                  Template
                </TabsTrigger>
                <TabsTrigger value="stage" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-0 h-full text-[12px] font-medium shadow-none transition-none">
                  Stage
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto">
                <TabsContent value="settings" className="p-4 m-0 space-y-6 animate-in fade-in-50 duration-200">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="tpl-name" className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Template Name</Label>
	                    <Input
	                      id="tpl-name"
	                      value={name}
	                      onChange={(e) => setName(e.target.value)}
	                      placeholder="e.g. Standard Review Flow"
	                      className="h-9 text-sm bg-background/40 focus:bg-background/80 transition-colors"
	                    />
	                    {duplicateNameMessage && (
	                      <p className="text-[11px] text-destructive">{duplicateNameMessage}</p>
	                    )}
	                  </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="tpl-desc" className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Description</Label>
                      <Textarea
                        id="tpl-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Purpose of this template..."
                        className="min-h-[80px] text-sm resize-none bg-background/40 focus:bg-background/80 transition-colors"
                      />
                    </div>
                  </div>

                  <Separator className="bg-border/30" />

                  {/* Settings & Policies */}
                  <div className="space-y-3">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Policies</Label>
                    <div className="grid gap-2">
	                      <div className="flex items-center justify-between rounded-lg border border-border/20 bg-background/30 p-2.5 transition-colors hover:bg-background/50">
	                        <div className="space-y-0.5">
	                          <div className="text-[13px] font-medium">Is Active</div>
	                          <p className="text-[11px] text-muted-foreground leading-none">Available for new requests</p>
	                        </div>
	                        <Switch
	                          checked={isActive}
	                          onCheckedChange={(checked) => {
	                            setIsActive(checked);
	                            if (!checked) setIsDefault(false);
	                          }}
	                          className="scale-90"
	                        />
	                      </div>

	                      <div className="flex items-center justify-between rounded-lg border border-border/20 bg-background/30 p-2.5 transition-colors hover:bg-background/50">
	                        <div className="space-y-0.5">
	                          <div className="text-[13px] font-medium">Organization Default</div>
	                          <p className="text-[11px] text-muted-foreground leading-none">Apply if no template chosen</p>
	                        </div>
	                        <Switch
	                          checked={isDefault}
	                          onCheckedChange={(checked) => {
	                            setIsDefault(checked);
	                            if (checked) setIsActive(true);
	                          }}
	                          className="scale-90"
	                        />
	                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-border/20 bg-background/30 p-2.5 transition-colors hover:bg-background/50">
                        <div className="space-y-0.5">
                          <div className="text-[13px] font-medium">Self-Approval</div>
                          <p className="text-[11px] text-muted-foreground leading-none">Allow submitter to approve</p>
                        </div>
                        <Switch checked={allowSelfApproval} onCheckedChange={setAllowSelfApproval} className="scale-90" />
                      </div>

	                    </div>
	                  </div>

                  {mode === 'new' && (
                    <>
                      <Separator className="bg-border/30" />
                      <div className="space-y-3">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Starter Preset</Label>
                        <div className="flex gap-2">
                          <Select value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
                            <SelectTrigger className="h-8 text-[12px] flex-1 bg-background/40">
                              <SelectValue placeholder="Select preset" />
                            </SelectTrigger>
                            <SelectContent>
                              {PRESETS.map((p) => (
                                <SelectItem key={p.key} value={p.key} className="text-[12px]">{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" className="h-8 text-[11px] px-3 font-medium" onClick={applyPreset}>
                            Apply
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>

	                <TabsContent value="stage" className="p-0 m-0 animate-in fade-in-50 duration-200">
	                  {!selectedStage ? (
	                    <div className="p-12 text-center h-[400px] flex flex-col items-center justify-center space-y-3">
	                      <div className="h-10 w-10 rounded-full bg-muted/30 flex items-center justify-center">
	                        <Users className="h-5 w-5 text-muted-foreground/50" />
	                      </div>
	                      <p className="text-sm text-center text-muted-foreground font-medium max-w-[160px]">Select a stage from the flow canvas to edit details.</p>
                    </div>
	                  ) : (
	                    <div className="p-4 space-y-6 pb-8">
	                      {selectedStageHealth && selectedStageHealth.issues.length > 0 && (
	                        <div className={cn('rounded-xl border px-3 py-3', HEALTH_META[selectedStageHealth.level].className)}>
	                          <div className="text-[11px] font-semibold uppercase tracking-wider">
	                            {selectedStageHealth.level === 'invalid' ? 'Fix before saving' : 'Heads up'}
	                          </div>
	                          <div className="mt-2 space-y-1">
	                            {selectedStageHealth.issues.map((issue) => (
	                              <p key={issue} className="text-[12px] leading-relaxed">{issue}</p>
	                            ))}
	                          </div>
	                        </div>
	                      )}
	
	                      {/* Name & ID Section */}
	                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                              {(selectedStageIndex ?? 0) + 1}
                            </span>
                            <h4 className="text-sm font-semibold">Stage Details</h4>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                              onClick={() => duplicateStageAt(selectedStageIndex!)}
                              title="Duplicate Stage"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                              onClick={() => requestRemoveStage(selectedStageIndex!)}
                              title="Delete Stage"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-4 pt-1">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Full Name</Label>
                            <Input
                              value={selectedStage.name}
                              onChange={(e) => updateStageAt(selectedStageIndex!, { name: e.target.value })}
                              placeholder="e.g. Technical Review"
                              className="h-9 text-sm bg-background/40 focus:bg-background/80 transition-colors"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Description</Label>
                            <Textarea
                              value={selectedStage.description}
                              onChange={(e) => updateStageAt(selectedStageIndex!, { description: e.target.value })}
                              placeholder="What needs checking in this stage?"
                              className="min-h-[72px] text-sm resize-none bg-background/40 focus:bg-background/80 transition-colors"
                            />
                          </div>
                        </div>
                      </div>

                      <Separator className="bg-border/30" />

                      {/* Approval Logic */}
                      <div className="space-y-4">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Reviewer Logic</Label>

                        <div className="grid gap-4 bg-muted/10 rounded-xl border border-border/20 p-3.5">
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-medium text-muted-foreground/80">Reviewer Assignment</span>
                              <div className="space-y-2">
                                <Select
                                  value={selectedStage.reviewerSelector.type}
                                  onValueChange={(v) => {
                                    const preservedDepartmentId = getScopedDepartmentId(selectedStage.reviewerSelector);
                                    if (v === 'department_leads') {
                                      updateStageAt(selectedStageIndex!, { reviewerSelector: { type: 'department_leads', departmentId: preservedDepartmentId } });
                                      return;
                                    }
                                    if (v === 'user_ids') {
                                      updateStageAt(selectedStageIndex!, { reviewerSelector: { type: 'user_ids', value: [], departmentId: preservedDepartmentId } });
                                      return;
                                    }
                                    const nextRoleValue = selectedStage.reviewerSelector.type === 'role'
                                      ? String(selectedStage.reviewerSelector.value || '').trim()
                                      : '';
                                    updateStageAt(selectedStageIndex!, { reviewerSelector: { type: 'role', value: nextRoleValue, departmentId: preservedDepartmentId } });
                                  }}
                                >
                                  <SelectTrigger className="h-8 w-full text-[12px] bg-background">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="role" className="text-[12px]">Role-based</SelectItem>
                                    <SelectItem value="department_leads" className="text-[12px]">Document Dept. Leads</SelectItem>
                                    <SelectItem value="user_ids" className="text-[12px]">Specific Users</SelectItem>
                                  </SelectContent>
                                </Select>

                                {selectedStage.reviewerSelector.type === 'role' && (
                                  <div className="space-y-1.5">
                                    <span className="text-[11px] font-medium text-muted-foreground/80">Role</span>
                                    <Select
                                      value={selectedStageRoleSelector && roleOptions.some((r) => r.key === selectedStageRoleSelector.value)
                                        ? selectedStageRoleSelector.value
                                        : undefined}
                                      onValueChange={setSelectedStageRoleValue}
                                    >
                                      <SelectTrigger className="h-8 w-full text-[12px] bg-background truncate">
                                        <SelectValue placeholder="Select role" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {roleOptions.length === 0 && (
                                          <SelectItem value="__no_roles__" className="text-[12px]" disabled>
                                            No roles available
                                          </SelectItem>
                                        )}
                                        {roleOptions.map((r) => (
                                          <SelectItem key={r.key} value={r.key} className="text-[12px]">{r.name || r.key}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}

                                {selectedStage.reviewerSelector.type === 'user_ids' && (
                                  <div className="space-y-1.5">
                                    <span className="text-[11px] font-medium text-muted-foreground/80">Users</span>
                                    <Popover open={reviewerPickerOpen} onOpenChange={setReviewerPickerOpen}>
                                      <PopoverTrigger asChild>
                                        <Button type="button" variant="outline" className="h-8 w-full justify-between bg-background px-2 overflow-hidden">
                                          <span className="truncate text-[11px] text-left">
                                            {selectedStageUserIds.length > 0
                                              ? `${selectedStageUserIds.length} reviewer${selectedStageUserIds.length === 1 ? '' : 's'} selected`
                                              : 'Select reviewers'}
                                          </span>
                                          <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground opacity-50 ml-1" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent align="end" className="w-[260px] p-0">
                                        <Command>
                                          <CommandInput placeholder="Search users..." className="h-8 text-xs" />
                                          <CommandList className="max-h-[240px]">
                                            <CommandEmpty className="py-6 text-[11px] text-muted-foreground">No users found.</CommandEmpty>
                                            <CommandGroup>
                                              {availableReviewerUserOptions.map((u) => (
                                                <CommandItem
                                                  key={u.id}
                                                  value={`${u.label} ${u.email || ''} ${u.id}`}
                                                  onSelect={() => toggleSelectedStageUser(u.id)}
                                                  className="text-[11px] py-2"
                                                >
                                                  <Check className={cn('mr-2 h-3 w-3', selectedStageUserIds.includes(u.id) ? 'opacity-100' : 'opacity-0')} />
                                                  <div className="flex flex-col min-w-0">
                                                    <span className="truncate font-medium">{u.label}</span>
                                                    <span className="truncate text-muted-foreground/70">{u.email || u.role || u.id}</span>
                                                  </div>
                                                </CommandItem>
                                              ))}
                                            </CommandGroup>
                                          </CommandList>
                                        </Command>
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                )}
                              </div>
                            </div>

                            {selectedStage.reviewerSelector.type === 'user_ids' && (
                              <div className="space-y-2 pt-0.5">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>Selected reviewers</span>
                                  <span>{selectedStageUserIds.length}</span>
                                </div>
                                {selectedStageUserIds.length === 0 ? (
                                  <div className="rounded-lg border border-dashed border-border/50 bg-background/30 px-3 py-3 text-[11px] text-muted-foreground">
                                    Pick one or more reviewers from the directory above.
                                  </div>
                                ) : (
                                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                                    {selectedStageUserIds.map((id, index) => {
                                      const u = userOptionMap.get(id);
                                      return (
                                        <div key={id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-2.5 py-2">
                                          <span className="w-5 shrink-0 text-[10px] font-semibold text-muted-foreground">{index + 1}</span>
                                          <div className="min-w-0 flex-1">
                                            <div className="truncate text-[12px] font-medium">{u?.label || id}</div>
                                            <div className="truncate text-[11px] text-muted-foreground">{u?.email || u?.role || id}</div>
                                          </div>
                                          {selectedStage.mode === 'sequential' && (
                                            <>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 shrink-0"
                                                disabled={index === 0}
                                                onClick={() => moveSelectedStageUser(id, -1)}
                                              >
                                                <ChevronUp className="h-3.5 w-3.5" />
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 shrink-0"
                                                disabled={index === selectedStageUserIds.length - 1}
                                                onClick={() => moveSelectedStageUser(id, 1)}
                                              >
                                                <ChevronDown className="h-3.5 w-3.5" />
                                              </Button>
                                            </>
                                          )}
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => toggleSelectedStageUser(id)}
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            {selectedStage.reviewerSelector.type === 'role' && selectedStageRoleSelector && !roleOptions.some((r) => r.key === selectedStageRoleSelector.value) && (
                              <div className="space-y-1.5 pt-1 animate-in slide-in-from-top-1 duration-200">
                                <span className="text-[10px] uppercase tracking-tight font-medium text-muted-foreground">Fix Role Key</span>
                                <Input
                                  value={selectedStageRoleSelector.value}
                                  onChange={(e) => updateStageAt(selectedStageIndex!, { reviewerSelector: { type: 'role', value: e.target.value, departmentId: selectedStageScopedDepartmentId } })}
                                  placeholder="e.g. system_auditor"
                                  className="h-8 font-mono text-[11px] bg-background"
                                />
                              </div>
                            )}

                            <div className="space-y-1.5 pt-1">
                              <span className="text-[11px] font-medium text-muted-foreground/80">
                                {selectedStage.reviewerSelector.type === 'department_leads' ? 'Department Source' : 'Department Filter'}
                              </span>
                              <Select
                                value={selectedStageScopedDepartmentId || ANY_DEPARTMENT_SCOPE}
                                onValueChange={(v) => {
                                  const nextDepartmentId = v === ANY_DEPARTMENT_SCOPE ? null : v;
                                  if (selectedStage.reviewerSelector.type === 'role') {
                                    updateStageAt(selectedStageIndex!, {
                                      reviewerSelector: {
                                        type: 'role',
                                        value: selectedStage.reviewerSelector.value,
                                        departmentId: nextDepartmentId,
                                      }
                                    });
                                    return;
                                  }
                                  if (selectedStage.reviewerSelector.type === 'user_ids') {
                                    updateStageAt(selectedStageIndex!, {
                                      reviewerSelector: {
                                        type: 'user_ids',
                                        value: selectedStage.reviewerSelector.value,
                                        departmentId: nextDepartmentId,
                                      }
                                    });
                                    return;
                                  }
                                  updateStageAt(selectedStageIndex!, {
                                    reviewerSelector: {
                                      type: 'department_leads',
                                      departmentId: nextDepartmentId,
                                    }
                                  });
                                }}
                              >
                                <SelectTrigger className="h-8 text-[12px] bg-background">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={ANY_DEPARTMENT_SCOPE} className="text-[12px]">
                                    {selectedStage.reviewerSelector.type === 'department_leads' ? "Use document's department" : 'All departments'}
                                  </SelectItem>
                                  {(departments || []).map((d) => (
                                    <SelectItem key={d.id} value={d.id} className="text-[12px]">{d.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2 pt-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-medium text-muted-foreground/80">Reviewer preview</span>
                                {selectedStagePreviewUsers.length > 0 && (
                                  <Badge variant="outline" className="h-5 text-[10px]">
                                    {selectedStagePreviewUsers.length} active
                                  </Badge>
                                )}
                              </div>
                              {selectedStagePreviewMessage ? (
                                <div className="rounded-lg border border-dashed border-border/50 bg-background/30 px-3 py-3 text-[11px] text-muted-foreground">
                                  {selectedStagePreviewMessage}
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-1">
                                  {selectedStagePreviewUsers.map((user) => (
                                    <Badge key={user.id} variant="secondary" className="h-6 border-border/40 px-2 text-[10px]">
                                      {user.label}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {selectedStage.mode === 'sequential' && selectedStage.reviewerSelector.type !== 'user_ids' && (
                                <p className="text-[11px] text-muted-foreground">
                                  Fixed reviewer order is only guaranteed with Specific Users. Role and department stages resolve from the live directory at submit time.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Stage Type</Label>
                            <Select
                              value={selectedStage.mode}
                              onValueChange={(v) => {
                                const nextMode = (v === 'sequential' ? 'sequential' : 'parallel') as StageDraft['mode'];
                                updateStageAt(selectedStageIndex!, {
                                  mode: nextMode,
                                  requiredApprovals: nextMode === 'sequential' ? 1 : Math.max(1, Number(selectedStage.requiredApprovals || 1) || 1),
                                });
                              }}
                            >
                              <SelectTrigger className="h-9 text-[12px] bg-background">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="parallel" className="text-[12px]">Parallel</SelectItem>
                                <SelectItem value="sequential" className="text-[12px]">Sequential (Fixed)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
                              Min Approvals
                              <span className="text-[10px] font-mono opacity-50">
                                {selectedStageRequiredApprovalsMax ? `max ${selectedStageRequiredApprovalsMax}` : '#'}
                              </span>
                            </Label>
                            <div className="flex items-center h-9">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-full w-8 rounded-r-none border-r-0 bg-background hover:bg-muted"
                                disabled={selectedStage.mode === 'sequential' || Math.max(1, Number(selectedStage.requiredApprovals || 1) || 1) <= 1}
                                onClick={() => {
                                  const n = Math.max(1, Number(selectedStage.requiredApprovals || 1) || 1);
                                  updateStageAt(selectedStageIndex!, { requiredApprovals: Math.max(1, n - 1) });
                                }}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                value={String(selectedStage.mode === 'sequential' ? 1 : Math.max(1, Number(selectedStage.requiredApprovals || 1) || 1))}
                                onChange={(e) => {
                                  const raw = Math.max(1, Number(e.target.value.replace(/\D/g, '') || '1') || 1);
                                  const n = selectedStageRequiredApprovalsMax
                                    ? Math.min(raw, selectedStageRequiredApprovalsMax)
                                    : raw;
                                  updateStageAt(selectedStageIndex!, { requiredApprovals: n });
                                }}
                                disabled={selectedStage.mode === 'sequential'}
                                max={selectedStageRequiredApprovalsMax || undefined}
                                className="h-full rounded-none text-center text-sm bg-background border-x-1 tabular-nums"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-full w-8 rounded-l-none border-l-0 bg-background hover:bg-muted"
                                disabled={
                                  selectedStage.mode === 'sequential'
                                  || (selectedStageRequiredApprovalsMax !== null
                                    && Math.max(1, Number(selectedStage.requiredApprovals || 1) || 1) >= selectedStageRequiredApprovalsMax)
                                }
                                onClick={() => {
                                  const n = Math.max(1, Number(selectedStage.requiredApprovals || 1) || 1);
                                  updateStageAt(selectedStageIndex!, {
                                    requiredApprovals: selectedStageRequiredApprovalsMax
                                      ? Math.min(n + 1, selectedStageRequiredApprovalsMax)
                                      : n + 1,
                                  });
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </Card>
        </div>
      </div>

      <AlertDialog
        open={stagePendingDeleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setStagePendingDeleteIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stage?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteStage
                ? `This will remove Stage ${(stagePendingDeleteIndex ?? 0) + 1} - ${pendingDeleteStage.name || pendingDeleteStage.id}.`
                : 'This stage will be removed from the approval flow.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (stagePendingDeleteIndex === null) return;
                removeStage(stagePendingDeleteIndex);
                setStagePendingDeleteIndex(null);
              }}
            >
              Delete stage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
