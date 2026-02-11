"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { ViewAccessDenied } from '@/components/access-denied';
import { cn } from '@/lib/utils';
import { getOrgFeatures } from '@/lib/org-features';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ChevronUp, MoreVertical, Plus, RefreshCw, Save, Sparkles, Trash2, Wand2 } from 'lucide-react';

type PresetKey = 'simple-2-step' | 'one-step-admin' | 'dept-leads';
type ReviewerSelectorDraft =
  | { type: 'role'; value: string }
  | { type: 'department_leads' }
  | { type: 'user_ids'; value: string[] };

type StageDraft = {
  id: string;
  name: string;
  mode: 'parallel' | 'sequential';
  requiredApprovals: number;
  reviewerSelector: ReviewerSelectorDraft;
};

function describeReviewer(sel: ReviewerSelectorDraft): string {
  if (sel.type === 'department_leads') return 'Department leads';
  if (sel.type === 'user_ids') return `${(sel.value || []).length} users`;
  return `Role: ${String(sel.value || '').trim() || '—'}`;
}

function describeApprovals(stage: StageDraft): string {
  if (stage.mode === 'sequential') return 'Sequential';
  const n = Math.max(1, Number(stage.requiredApprovals || 1) || 1);
  return `${n} approval${n === 1 ? '' : 's'}`;
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
          reject_policy: 'any_reject_rejects',
        },
        {
          id: 'final',
          name: 'Org Admin Approval',
          mode: 'sequential',
          required_approvals: 1,
          reviewer_selector: { type: 'role', value: 'orgAdmin' },
          reject_policy: 'any_reject_rejects',
        },
      ],
      settings: {
        allow_self_approval: false,
        lock_editing_while_in_review: false,
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
          reject_policy: 'any_reject_rejects',
        },
      ],
      settings: {
        allow_self_approval: false,
        lock_editing_while_in_review: false,
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
          reject_policy: 'any_reject_rejects',
        },
      ],
      settings: {
        allow_self_approval: false,
        lock_editing_while_in_review: false,
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

function parseConfigToDraft(config: any): {
  stages: StageDraft[];
  settings: { allowSelfApproval: boolean; lockEditingWhileInReview: boolean };
} {
  const cfg = config && typeof config === 'object' ? config : {};
  const stagesRaw = Array.isArray(cfg.stages) ? cfg.stages : [];
  const settingsRaw = cfg.settings && typeof cfg.settings === 'object' ? cfg.settings : {};

  const stages: StageDraft[] = stagesRaw.map((s: any, idx: number) => {
    const id = String(s?.id || `stage_${idx + 1}`).trim() || `stage_${idx + 1}`;
    const name = String(s?.name || id).trim() || id;
    const mode = String(s?.mode || 'parallel').toLowerCase() === 'sequential' ? 'sequential' : 'parallel';
    const requiredApprovals = Math.max(1, Number(s?.required_approvals || 1) || 1);
    const sel = s?.reviewer_selector && typeof s.reviewer_selector === 'object' ? s.reviewer_selector : {};
    const selType = String(sel?.type || 'role').trim();

    let reviewerSelector: ReviewerSelectorDraft = { type: 'role', value: 'orgAdmin' };
    if (selType === 'department_leads') {
      reviewerSelector = { type: 'department_leads' };
    } else if (selType === 'user_ids') {
      const v = Array.isArray(sel?.value) ? sel.value : [];
      reviewerSelector = { type: 'user_ids', value: v.map((x: any) => String(x)).filter(Boolean) };
    } else {
      reviewerSelector = { type: 'role', value: String(sel?.value || '').trim() || 'orgAdmin' };
    }

    return {
      id,
      name,
      mode,
      requiredApprovals: mode === 'sequential' ? 1 : requiredApprovals,
      reviewerSelector,
    };
  });

  // Safe default: pharma-style workflows usually should not allow self-approval unless explicitly enabled.
  const allowSelfApproval = settingsRaw.allow_self_approval === true;
  const lockEditingWhileInReview = settingsRaw.lock_editing_while_in_review === true;

  return {
    stages: stages.length ? stages : [
      {
        id: 'review',
        name: 'Review',
        mode: 'parallel',
        requiredApprovals: 1,
        reviewerSelector: { type: 'role', value: 'orgAdmin' },
      }
    ],
    settings: {
      allowSelfApproval,
      lockEditingWhileInReview,
    },
  };
}

function buildConfigFromDraft(draft: {
  stages: StageDraft[];
  settings: { allowSelfApproval: boolean; lockEditingWhileInReview: boolean };
}): any {
  return {
    schema_version: 1,
    stages: (draft.stages || []).map((s) => ({
      id: String(s.id || '').trim(),
      name: String(s.name || '').trim() || String(s.id || '').trim(),
      mode: s.mode,
      required_approvals: s.mode === 'sequential' ? 1 : Math.max(1, Number(s.requiredApprovals || 1) || 1),
      reviewer_selector: s.reviewerSelector.type === 'role'
        ? { type: 'role', value: String(s.reviewerSelector.value || '').trim() }
        : s.reviewerSelector.type === 'user_ids'
          ? { type: 'user_ids', value: (s.reviewerSelector.value || []).map((x) => String(x)).filter(Boolean) }
          : { type: 'department_leads' },
      // Preserve existing behavior from presets; backend currently ignores this, but it helps future extensibility.
      reject_policy: 'any_reject_rejects',
    })),
    settings: {
      allow_self_approval: draft.settings.allowSelfApproval,
      lock_editing_while_in_review: draft.settings.lockEditingWhileInReview,
    },
  };
}

function validateDraft(draft: { stages: StageDraft[] }): string | null {
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
    if (s.reviewerSelector.type === 'role' && !String(s.reviewerSelector.value || '').trim()) {
      return `Stage '${s.id}' must select a role key.`;
    }
    if (s.reviewerSelector.type === 'user_ids' && (s.reviewerSelector.value || []).length === 0) {
      return `Stage '${s.id}' must include at least 1 user id.`;
    }
  }
  return null;
}

function TemplateRow({
  t,
  active,
  onClick,
}: {
  t: ApprovalTemplate;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'w-full text-left rounded-md border px-3 py-2 transition-colors',
        active ? 'border-primary/40 bg-primary/5' : 'border-border/40 bg-background/40 hover:bg-muted/20'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{t.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground truncate">
            v{t.template_version} · {new Date(t.updated_at || t.created_at).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {t.is_default && <Badge variant="outline">Default</Badge>}
          {!t.is_active && <Badge variant="outline">Inactive</Badge>}
        </div>
      </div>
    </button>
  );
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

  return <ApprovalTemplatesSettingsInner toast={toast} />;
}

function ApprovalTemplatesSettingsInner({ toast }: { toast: (args: any) => void }) {

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [templates, setTemplates] = React.useState<ApprovalTemplate[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  const [mode, setMode] = React.useState<'edit' | 'new'>('edit');
  const [preset, setPreset] = React.useState<PresetKey>('simple-2-step');

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [isDefault, setIsDefault] = React.useState(false);
  const [configText, setConfigText] = React.useState('');
  const [configError, setConfigError] = React.useState<string | null>(null);
  const [configTab, setConfigTab] = React.useState<'builder' | 'json'>('builder');
  const [stagesDraft, setStagesDraft] = React.useState<StageDraft[]>([]);
  const [allowSelfApproval, setAllowSelfApproval] = React.useState(false);
  const [lockEditingWhileInReview, setLockEditingWhileInReview] = React.useState(false);
  const [openStageMap, setOpenStageMap] = React.useState<Record<string, boolean>>({});
  const [openStageAdvancedMap, setOpenStageAdvancedMap] = React.useState<Record<string, boolean>>({});

  const selectedTemplate = React.useMemo(
    () => (selectedId ? templates.find((t) => t.id === selectedId) || null : null),
    [selectedId, templates]
  );

  const originalRef = React.useRef<ApprovalTemplate | null>(null);
  const originalCanonicalConfigRef = React.useRef<string | null>(null);

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
    setConfigError(null);
    setName(t.name || '');
    setDescription(t.description || '');
    setIsActive(Boolean(t.is_active));
    setIsDefault(Boolean(t.is_default));
    setConfigText(JSON.stringify(t.config || {}, null, 2));
    setConfigTab('builder');

    const parsed = parseConfigToDraft(t.config || {});
    setStagesDraft(parsed.stages);
    setAllowSelfApproval(parsed.settings.allowSelfApproval);
    setLockEditingWhileInReview(parsed.settings.lockEditingWhileInReview);

    originalRef.current = t;
    originalCanonicalConfigRef.current = canonicalizeJson(t.config || {});
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
    setConfigError(null);
    setName('New approval template');
    setDescription('');
    setIsActive(true);
    setIsDefault(false);
    setConfigText(JSON.stringify(p.config, null, 2));
    setConfigTab('builder');
    setStagesDraft(parsed.stages);
    setAllowSelfApproval(parsed.settings.allowSelfApproval);
    setLockEditingWhileInReview(parsed.settings.lockEditingWhileInReview);
    originalRef.current = null;
    originalCanonicalConfigRef.current = canonicalizeJson(p.config);
  };

  const formatConfig = () => {
    try {
      const parsed = JSON.parse(configText);
      setConfigText(JSON.stringify(parsed, null, 2));
      setConfigError(null);
    } catch {
      setConfigError('Config must be valid JSON');
    }
  };

  const applyPreset = () => {
    const p = PRESETS.find((x) => x.key === preset) || PRESETS[0];
    setConfigText(JSON.stringify(p.config, null, 2));
    setConfigError(null);
    const parsed = parseConfigToDraft(p.config);
    setStagesDraft(parsed.stages);
    setAllowSelfApproval(parsed.settings.allowSelfApproval);
    setLockEditingWhileInReview(parsed.settings.lockEditingWhileInReview);
  };

  const switchToJson = () => {
    setConfigError(null);
    const err = validateDraft({ stages: stagesDraft });
    if (err) {
      setConfigError(err);
      return;
    }
    const cfg = buildConfigFromDraft({
      stages: stagesDraft,
      settings: { allowSelfApproval, lockEditingWhileInReview },
    });
    setConfigText(JSON.stringify(cfg, null, 2));
    setConfigTab('json');
  };

  const switchToBuilder = () => {
    setConfigError(null);
    try {
      const parsed = JSON.parse(configText);
      const draft = parseConfigToDraft(parsed);
      setStagesDraft(draft.stages);
      setAllowSelfApproval(draft.settings.allowSelfApproval);
      setLockEditingWhileInReview(draft.settings.lockEditingWhileInReview);
    } catch {
      // keep current draft; show error only on save
    }
    setConfigTab('builder');
  };

  const onSave = async () => {
    setConfigError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: 'Name required', description: 'Template name cannot be empty.', variant: 'destructive' });
      return;
    }

    let parsedConfig: any;
    if (configTab === 'builder') {
      const err = validateDraft({ stages: stagesDraft });
      if (err) {
        setConfigError(err);
        return;
      }
      parsedConfig = buildConfigFromDraft({
        stages: stagesDraft,
        settings: {
          allowSelfApproval,
          lockEditingWhileInReview,
        },
      });
    } else {
      try {
        parsedConfig = JSON.parse(configText);
      } catch {
        setConfigError('Config must be valid JSON');
        return;
      }
    }

    setSaving(true);
    try {
      if (mode === 'new') {
        const created = await createApprovalTemplate({
          name: trimmedName,
          description: description.trim() ? description.trim() : undefined,
          isActive,
          isDefault,
          config: parsedConfig,
        });
        toast({ title: 'Created', description: 'Approval template created.' });
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

      const updated = await updateApprovalTemplate(original.id, patch);
      toast({ title: 'Saved', description: 'Template updated.' });
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

  return (
    <div className="min-h-screen bg-background/30">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="px-8 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-foreground tracking-tight">Approval Templates</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Create and manage approval workflow templates for your organization.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void loadTemplates()} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button size="sm" className="h-8 gap-1.5" onClick={beginNew}>
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-6xl grid gap-6 lg:grid-cols-[360px,1fr]">
          <Card className="border-border/40 bg-card/40 overflow-hidden shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Templates</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates"
                className="h-9"
                disabled={loading}
              />

              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground">No templates found.</div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((t) => (
                    <TemplateRow
                      key={t.id}
                      t={t}
                      active={mode === 'edit' && selectedId === t.id}
                      onClick={() => {
                        setSelectedId(t.id);
                        setMode('edit');
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/40 overflow-hidden shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {mode === 'new' ? 'New Template' : 'Template Details'}
                {mode === 'edit' && selectedTemplate?.is_default && <Badge variant="outline">Default</Badge>}
                {mode === 'edit' && selectedTemplate && !selectedTemplate.is_active && <Badge variant="outline">Inactive</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {mode === 'new' && (
                <div className="rounded-lg border border-border/40 bg-background/40 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Start from a preset
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
                      <SelectTrigger className="h-8 w-[240px]">
                        <SelectValue placeholder="Select preset" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRESETS.map((p) => (
                          <SelectItem key={p.key} value={p.key}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={applyPreset}>
                      <Wand2 className="h-3.5 w-3.5" />
                      Apply
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Name</div>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="h-9" />
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Description</div>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                    className="min-h-[70px]"
                  />
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-2 flex-1">
                    <div>
                      <div className="text-sm font-medium">Active</div>
                      <div className="text-xs text-muted-foreground">Inactive templates won't appear in submit dropdowns.</div>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-2 flex-1">
                    <div>
                      <div className="text-sm font-medium">Default</div>
                      <div className="text-xs text-muted-foreground">Used when submitter doesn't choose a template.</div>
                    </div>
                    <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Workflow</div>

                  <div className="rounded-lg border border-border/40 bg-background/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">Stages</div>
                        <div className="text-xs text-muted-foreground">
                          Review runs top to bottom. Most teams can stick to Role-based reviewers.
                        </div>
                      </div>
                      {configTab === 'builder' ? (
                        <Button variant="outline" size="sm" className="h-8" onClick={switchToJson}>
                          Advanced JSON
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="h-8" onClick={switchToBuilder}>
                          Back to Builder
                        </Button>
                      )}
                    </div>

                    {configTab === 'builder' ? (
                      <div className="mt-3 space-y-3">
                        {stagesDraft.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            {stagesDraft.map((s, idx) => (
                              <Badge key={`${s.id}_${idx}`} variant="outline" className="text-[11px]">
                                {idx + 1}. {s.name || s.id}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">Click a stage to edit.</div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => {
                              setStagesDraft((prev) => {
                                const nextIdx = (prev?.length || 0) + 1;
                                const id = `stage_${nextIdx}`;
                                const next = [
                                  ...(prev || []),
                                  {
                                    id,
                                    name: `Stage ${nextIdx}`,
                                    mode: 'parallel',
                                    requiredApprovals: 1,
                                    reviewerSelector: { type: 'role', value: 'orgAdmin' },
                                  } as StageDraft,
                                ];
                                setOpenStageMap((m) => ({ ...m, [id]: true }));
                                return next;
                              });
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add stage
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {stagesDraft.map((s, idx) => {
                            const stageKey = String(s.id || idx);
                            const isOpen = Boolean(openStageMap[stageKey]);
                            const isAdvOpen = Boolean(openStageAdvancedMap[stageKey]);
                            const canMoveUp = idx > 0;
                            const canMoveDown = idx < stagesDraft.length - 1;

                            const setStage = (patch: Partial<StageDraft>) => {
                              setStagesDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
                            };

                            const moveUp = () => {
                              setStagesDraft((prev) => {
                                const next = [...prev];
                                const tmp = next[idx - 1];
                                next[idx - 1] = next[idx];
                                next[idx] = tmp;
                                return next;
                              });
                            };

                            const moveDown = () => {
                              setStagesDraft((prev) => {
                                const next = [...prev];
                                const tmp = next[idx + 1];
                                next[idx + 1] = next[idx];
                                next[idx] = tmp;
                                return next;
                              });
                            };

                            const remove = () => {
                              setStagesDraft((prev) => prev.filter((_, i) => i !== idx));
                            };

                            return (
                              <Collapsible
                                key={`${s.id}_${idx}`}
                                open={isOpen}
                                onOpenChange={(open) => setOpenStageMap((m) => ({ ...m, [stageKey]: open }))}
                              >
                                <div className="rounded-md border border-border/40 bg-background/30 overflow-hidden">
                                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                                    <CollapsibleTrigger asChild>
                                      <button
                                        type="button"
                                        className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
                                      >
                                        <div className="min-w-0">
                                          <div className="text-[11px] text-muted-foreground">Stage {idx + 1}</div>
                                          <div className="text-sm font-medium truncate">{s.name || s.id}</div>
                                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                            <Badge variant="outline" className="text-[11px]">
                                              {describeReviewer(s.reviewerSelector)}
                                            </Badge>
                                            <Badge variant="outline" className="text-[11px]">
                                              {describeApprovals(s)}
                                            </Badge>
                                          </div>
                                        </div>
                                        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                                      </button>
                                    </CollapsibleTrigger>

                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem disabled={!canMoveUp} onSelect={moveUp}>
                                          <ChevronUp className="h-4 w-4" />
                                          Move up
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={!canMoveDown} onSelect={moveDown}>
                                          <ChevronDown className="h-4 w-4" />
                                          Move down
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          disabled={stagesDraft.length <= 1}
                                          onSelect={remove}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          Remove stage
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  <CollapsibleContent>
                                    <div className="px-3 pb-3 pt-1 space-y-3">
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-1.5">
                                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Stage name</div>
                                          <Input
                                            value={s.name}
                                            onChange={(e) => setStage({ name: e.target.value })}
                                            placeholder="e.g. Team lead review"
                                            className="h-9"
                                          />
                                        </div>

                                        <div className="space-y-1.5">
                                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Reviewers</div>
                                          <Select
                                            value={s.reviewerSelector.type}
                                            onValueChange={(v) => {
                                              if (v === 'department_leads') {
                                                setStage({ reviewerSelector: { type: 'department_leads' } });
                                                return;
                                              }
                                              if (v === 'user_ids') {
                                                setStage({ reviewerSelector: { type: 'user_ids', value: [] } });
                                                return;
                                              }
                                              setStage({ reviewerSelector: { type: 'role', value: 'orgAdmin' } });
                                            }}
                                          >
                                            <SelectTrigger className="h-9">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="role">By role</SelectItem>
                                              <SelectItem value="department_leads">Department leads</SelectItem>
                                              <SelectItem value="user_ids">Specific users</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        {s.reviewerSelector.type === 'role' && (
                                          <div className="space-y-1.5 md:col-span-2">
                                            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Role key</div>
                                            <Input
                                              value={s.reviewerSelector.value}
                                              onChange={(e) => setStage({ reviewerSelector: { type: 'role', value: e.target.value } })}
                                              placeholder="e.g. teamLead, orgAdmin"
                                              className="h-9 font-mono text-[12px]"
                                            />
                                            <div className="flex flex-wrap gap-2 pt-1">
                                              {['orgAdmin', 'teamLead', 'manager'].map((k) => (
                                                <Button
                                                  key={k}
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 px-2 text-[11px]"
                                                  onClick={() => setStage({ reviewerSelector: { type: 'role', value: k } })}
                                                >
                                                  {k}
                                                </Button>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {s.reviewerSelector.type === 'user_ids' && (
                                          <div className="space-y-1.5 md:col-span-2">
                                            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">User ids</div>
                                            <Textarea
                                              value={(s.reviewerSelector.value || []).join('\n')}
                                              onChange={(e) => {
                                                const raw = e.target.value || '';
                                                const ids = raw
                                                  .split(/[\n,]/g)
                                                  .map((x) => x.trim())
                                                  .filter(Boolean);
                                                setStage({ reviewerSelector: { type: 'user_ids', value: ids } });
                                              }}
                                              placeholder="One user id per line"
                                              className="min-h-[90px] font-mono text-[12px]"
                                            />
                                          </div>
                                        )}

                                        {s.reviewerSelector.type === 'department_leads' && (
                                          <div className="md:col-span-2 rounded-md border border-border/40 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
                                            Uses the doc's department leads.
                                          </div>
                                        )}

                                        <div className="space-y-1.5">
                                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Approvals needed</div>
                                          <Input
                                            value={String(s.mode === 'sequential' ? 1 : Math.max(1, Number(s.requiredApprovals || 1) || 1))}
                                            onChange={(e) => {
                                              const n = Math.max(1, Number(e.target.value || '1') || 1);
                                              setStage({ requiredApprovals: n });
                                            }}
                                            disabled={s.mode === 'sequential'}
                                            className="h-9"
                                            inputMode="numeric"
                                          />
                                          {s.mode === 'sequential' && (
                                            <div className="text-[11px] text-muted-foreground ml-1">Sequential stages always require 1 approval.</div>
                                          )}
                                        </div>

                                        <div className="space-y-1.5">
                                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Stage options</div>
                                          <Collapsible
                                            open={isAdvOpen}
                                            onOpenChange={(open) => setOpenStageAdvancedMap((m) => ({ ...m, [stageKey]: open }))}
                                          >
                                            <CollapsibleTrigger asChild>
                                              <Button variant="outline" size="sm" className="h-9 w-full justify-between">
                                                Advanced
                                                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isAdvOpen && 'rotate-180')} />
                                              </Button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                              <div className="mt-2 grid gap-3">
                                                <div className="space-y-1.5">
                                                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Stage id</div>
                                                  <Input
                                                    value={s.id}
                                                    onChange={(e) => setStage({ id: normalizeStageId(e.target.value) })}
                                                    placeholder="e.g. review"
                                                    className="h-9 font-mono text-[12px]"
                                                  />
                                                </div>

                                                <div className="space-y-1.5">
                                                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Mode</div>
                                                  <Select
                                                    value={s.mode}
                                                    onValueChange={(v) => {
                                                      const nextMode = (v === 'sequential' ? 'sequential' : 'parallel') as StageDraft['mode'];
                                                      setStage({
                                                        mode: nextMode,
                                                        requiredApprovals: nextMode === 'sequential' ? 1 : Math.max(1, Number(s.requiredApprovals || 1) || 1),
                                                      });
                                                    }}
                                                  >
                                                    <SelectTrigger className="h-9">
                                                      <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      <SelectItem value="parallel">Parallel (any order)</SelectItem>
                                                      <SelectItem value="sequential">Sequential (in order)</SelectItem>
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                              </div>
                                            </CollapsibleContent>
                                          </Collapsible>
                                        </div>
                                      </div>
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            );
                          })}
                        </div>

                        <div className="rounded-md border border-border/40 bg-background/30 p-3">
                          <div className="text-sm font-medium">Policy</div>
                          <div className="text-xs text-muted-foreground">Defaults applied when a doc is submitted.</div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-2">
                              <div>
                                <div className="text-sm font-medium">Allow self-approval</div>
                                <div className="text-xs text-muted-foreground">If disabled, submitter can't be a reviewer.</div>
                              </div>
                              <Switch checked={allowSelfApproval} onCheckedChange={setAllowSelfApproval} />
                            </div>
                            <div className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-2">
                              <div>
                                <div className="text-sm font-medium">Lock editing during review</div>
                                <div className="text-xs text-muted-foreground">Disable editing while approval is active.</div>
                              </div>
                              <Switch checked={lockEditingWhileInReview} onCheckedChange={setLockEditingWhileInReview} />
                            </div>
                          </div>
                        </div>

                        {configError && <div className="text-xs text-destructive">{configError}</div>}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Config (JSON)</div>
                          <Button variant="outline" size="sm" className="h-8" onClick={formatConfig}>
                            Format JSON
                          </Button>
                        </div>
                        <Textarea
                          value={configText}
                          onChange={(e) => setConfigText(e.target.value)}
                          className={cn('min-h-[320px] font-mono text-[12px]', configError && 'border-destructive')}
                          placeholder={JSON.stringify(PRESETS[0].config, null, 2)}
                        />
                        {configError && <div className="text-xs text-destructive">{configError}</div>}
                        <div className="text-[11px] text-muted-foreground">
                          Tip: reviewer selectors: <span className="font-mono">role</span>, <span className="font-mono">department_leads</span>, or <span className="font-mono">user_ids</span>.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    if (mode === 'edit' && selectedTemplate) loadIntoForm(selectedTemplate);
                    if (mode === 'new') beginNew();
                  }}
                  disabled={saving}
                >
                  Reset
                </Button>
                <Button className="h-9 gap-1.5" onClick={() => void onSave()} disabled={saving || loading}>
                  {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {mode === 'new' ? 'Create' : 'Save'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
