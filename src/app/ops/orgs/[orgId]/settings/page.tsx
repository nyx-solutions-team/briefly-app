"use client";

import * as React from 'react';
import { useParams } from 'next/navigation';
import { RefreshCw, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { OpsOrgSubnav } from '@/components/ops/ops-org-subnav';
import { OpsPageHeader, OpsPill, OpsSurface } from '@/components/ops/ops-primitives';
import { useToast } from '@/hooks/use-toast';
import {
  getOpsOrganization,
  getOpsOrgPrivateSettings,
  getOpsOrgSettings,
  updateOpsOrgPrivateSettings,
  updateOpsOrgSettings,
  type OpsOrgDetail,
  type OpsOrgSettings,
} from '@/lib/ops-api';
import { formatOrgPlanLabel, getOrgPlanFeatureEntitlements } from '@/lib/org-plan-entitlements';

const DEFAULT_SUMMARY_PROMPT =
  'Write a concise summary (<= 300 words) of the document text. Focus on essential facts and outcomes.';

const DATE_FORMAT_OPTIONS = [
  'd MMM yyyy',
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
];

const ACCENT_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'amber', label: 'Amber' },
  { value: 'rose', label: 'Rose' },
  { value: 'slate', label: 'Slate' },
];

type SettingsFormState = {
  date_format: string;
  accent_color: string;
  dark_mode: boolean;
  chat_filters_enabled: boolean;
  ip_allowlist_enabled: boolean;
  ip_allowlist_ips_text: string;
  categories_text: string;
  editor_enabled: boolean;
  approvals_enabled: boolean;
  workflows_enabled: boolean;
};

function linesToArray(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function settingsToForm(settings: OpsOrgSettings): SettingsFormState {
  return {
    date_format: settings.date_format || 'd MMM yyyy',
    accent_color: settings.accent_color || 'default',
    dark_mode: Boolean(settings.dark_mode),
    chat_filters_enabled: Boolean(settings.chat_filters_enabled),
    ip_allowlist_enabled: Boolean(settings.ip_allowlist_enabled),
    ip_allowlist_ips_text: Array.isArray(settings.ip_allowlist_ips)
      ? settings.ip_allowlist_ips.join('\n')
      : '',
    categories_text: Array.isArray(settings.categories) ? settings.categories.join('\n') : '',
    editor_enabled: Boolean(settings.editor_enabled),
    approvals_enabled: Boolean(settings.approvals_enabled),
    workflows_enabled: Boolean(settings.workflows_enabled),
  };
}

function serializeSettings(form: SettingsFormState) {
  return {
    date_format: form.date_format,
    accent_color: form.accent_color,
    dark_mode: form.dark_mode,
    chat_filters_enabled: form.chat_filters_enabled,
    ip_allowlist_enabled: form.ip_allowlist_enabled,
    ip_allowlist_ips: linesToArray(form.ip_allowlist_ips_text),
    categories: linesToArray(form.categories_text),
    editor_enabled: form.editor_enabled,
    approvals_enabled: form.editor_enabled ? form.approvals_enabled : false,
    workflows_enabled: form.workflows_enabled,
  };
}

function getSnapshot(form: SettingsFormState) {
  return JSON.stringify(serializeSettings(form));
}

export default function OpsOrganizationSettingsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId || '';
  const { toast } = useToast();

  const [detail, setDetail] = React.useState<OpsOrgDetail | null>(null);
  const [form, setForm] = React.useState<SettingsFormState | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = React.useState<string>('');
  const [summaryPrompt, setSummaryPrompt] = React.useState(DEFAULT_SUMMARY_PROMPT);
  const [summarySnapshot, setSummarySnapshot] = React.useState(DEFAULT_SUMMARY_PROMPT);
  const [loading, setLoading] = React.useState(true);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [savingPrompt, setSavingPrompt] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const planKey = detail?.plan?.planKey || null;
  const featureEntitlements = React.useMemo(
    () => getOrgPlanFeatureEntitlements(planKey),
    [planKey]
  );
  const featurePlanLabel = React.useMemo(() => formatOrgPlanLabel(planKey), [planKey]);

  const load = React.useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [detailResponse, settingsResponse, privateSettingsResponse] = await Promise.all([
        getOpsOrganization(orgId),
        getOpsOrgSettings(orgId),
        getOpsOrgPrivateSettings(orgId),
      ]);
      const nextForm = settingsToForm(settingsResponse);
      setDetail(detailResponse);
      setForm(nextForm);
      setSettingsSnapshot(getSnapshot(nextForm));
      setSummaryPrompt(privateSettingsResponse.summary_prompt || DEFAULT_SUMMARY_PROMPT);
      setSummarySnapshot(privateSettingsResponse.summary_prompt || DEFAULT_SUMMARY_PROMPT);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load organization settings');
      setDetail(null);
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!form?.editor_enabled && form?.approvals_enabled) {
      setForm((current) => (current ? { ...current, approvals_enabled: false } : current));
    }
  }, [form?.approvals_enabled, form?.editor_enabled]);

  React.useEffect(() => {
    if (!form) return;
    setForm((current) => {
      if (!current) return current;
      const next = {
        ...current,
        editor_enabled: featureEntitlements.editorEnabled ? current.editor_enabled : false,
        approvals_enabled:
          featureEntitlements.editorEnabled && featureEntitlements.approvalsEnabled
            ? current.editor_enabled
              ? current.approvals_enabled
              : false
            : false,
        workflows_enabled: featureEntitlements.workflowsEnabled ? current.workflows_enabled : false,
      };
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [featureEntitlements, form]);

  const settingsDirty = form ? settingsSnapshot !== getSnapshot(form) : false;
  const promptDirty = summaryPrompt.trim() !== summarySnapshot.trim();

  const updateForm = <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const onSaveSettings = async () => {
    if (!orgId || !form) return;
    setSavingSettings(true);
    try {
      const saved = await updateOpsOrgSettings(orgId, serializeSettings(form));
      const nextForm = settingsToForm(saved);
      setForm(nextForm);
      setSettingsSnapshot(getSnapshot(nextForm));
      toast({
        title: 'Org settings saved',
        description: 'Workspace defaults and feature controls were updated.',
      });
    } catch (err) {
      toast({
        title: 'Unable to save settings',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const onSavePrompt = async () => {
    if (!orgId) return;
    setSavingPrompt(true);
    try {
      const saved = await updateOpsOrgPrivateSettings(orgId, summaryPrompt.trim());
      setSummaryPrompt(saved.summary_prompt);
      setSummarySnapshot(saved.summary_prompt);
      toast({
        title: 'AI prompt saved',
        description: 'The org summary prompt is now updated for this client.',
      });
    } catch (err) {
      toast({
        title: 'Unable to save AI prompt',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingPrompt(false);
    }
  };

  if (!orgId) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Missing organization id</AlertTitle>
        <AlertDescription>Open this page from the organizations index.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <OpsPageHeader
        eyebrow="Phase 1"
        title={detail?.orgName ? `${detail.orgName} Settings` : 'Organization Settings'}
        description="This is the cross-client control surface for org defaults: feature access, document categories, security defaults, and AI behavior."
        backHref={`/ops/orgs/${orgId}`}
        backLabel="Overview"
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <OpsOrgSubnav orgId={orgId} orgName={detail?.orgName} />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load org settings</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <OpsSurface
          title="Workspace Defaults"
          description="These are the baseline settings ops can enforce even if the client workspace is still mid-setup."
          actions={
            <Button onClick={onSaveSettings} disabled={!settingsDirty || savingSettings || !form}>
              <Save className="mr-2 h-4 w-4" />
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </Button>
          }
        >
          {loading || !form ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl bg-muted/50" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date Format</Label>
                  <Select
                    value={form.date_format}
                    onValueChange={(value) => updateForm('date_format', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a date format" />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_FORMAT_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Accent Color</Label>
                  <Select
                    value={form.accent_color}
                    onValueChange={(value) => updateForm('accent_color', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an accent color" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCENT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-foreground">Dark Mode Default</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Sets the preferred workspace theme default for newly initialized settings.
                      </p>
                    </div>
                    <Switch
                      checked={form.dark_mode}
                      onCheckedChange={(value) => updateForm('dark_mode', Boolean(value))}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-foreground">Chat Filters</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Enables workspace-level chat filters and saved preferences where supported.
                      </p>
                    </div>
                    <Switch
                      checked={form.chat_filters_enabled}
                      onCheckedChange={(value) =>
                        updateForm('chat_filters_enabled', Boolean(value))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="categories">Document Categories</Label>
                <Textarea
                  id="categories"
                  rows={8}
                  value={form.categories_text}
                  onChange={(event) => updateForm('categories_text', event.target.value)}
                  placeholder={'General\nLegal\nFinancial\nHR'}
                />
                <p className="text-sm text-muted-foreground">
                  One category per line. This becomes the clean default document taxonomy for the client.
                </p>
              </div>
            </div>
          )}
        </OpsSurface>

        <div className="space-y-6">
          <OpsSurface title="Feature Controls" description="These switches define which major product surfaces the client can use.">
            {loading || !form ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted/50" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/50 bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">Plan entitlement source</p>
                    <OpsPill tone="info">{featurePlanLabel}</OpsPill>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    These controls are now managed in ops and clamped by the client plan. Regular org admins no longer edit them from workspace settings.
                  </p>
                </div>

                <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-foreground">Document Editor</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Enables the controlled document editing experience for this org.
                      </p>
                      {!featureEntitlements.editorEnabled ? (
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          Not included on the current plan.
                        </p>
                      ) : null}
                    </div>
                    <Switch
                      checked={form.editor_enabled}
                      disabled={!featureEntitlements.editorEnabled}
                      onCheckedChange={(value) => updateForm('editor_enabled', Boolean(value))}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-foreground">Approvals</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Human approval flows on top of editor-managed documents. Editor must be enabled first.
                      </p>
                      {!featureEntitlements.approvalsEnabled ? (
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          Not included on the current plan.
                        </p>
                      ) : null}
                    </div>
                    <Switch
                      checked={form.approvals_enabled}
                      disabled={!featureEntitlements.approvalsEnabled || !form.editor_enabled}
                      onCheckedChange={(value) =>
                        updateForm('approvals_enabled', Boolean(value))
                      }
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-foreground">Workflows</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Turns on workflow templates, runs, and supporting orchestration screens.
                      </p>
                      {!featureEntitlements.workflowsEnabled ? (
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          Not included on the current plan.
                        </p>
                      ) : null}
                    </div>
                    <Switch
                      checked={form.workflows_enabled}
                      disabled={!featureEntitlements.workflowsEnabled}
                      onCheckedChange={(value) => updateForm('workflows_enabled', Boolean(value))}
                    />
                  </div>
                </div>
              </div>
            )}
          </OpsSurface>

          <OpsSurface title="Security Defaults" description="Ops can seed a client allowlist and connection stance from here.">
            {loading || !form ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted/50" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-foreground">IP Allowlist Enabled</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        When active, the workspace only accepts requests from approved IPs or CIDR ranges.
                      </p>
                    </div>
                    <Switch
                      checked={form.ip_allowlist_enabled}
                      onCheckedChange={(value) =>
                        updateForm('ip_allowlist_enabled', Boolean(value))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ip-list">Allowed IPs / CIDRs</Label>
                  <Textarea
                    id="ip-list"
                    rows={6}
                    value={form.ip_allowlist_ips_text}
                    onChange={(event) => updateForm('ip_allowlist_ips_text', event.target.value)}
                    placeholder={'203.0.113.18\n198.51.100.0/24'}
                  />
                  <p className="text-sm text-muted-foreground">
                    One entry per line. Leave blank if you only want the policy ready but not populated yet.
                  </p>
                </div>
              </div>
            )}
          </OpsSurface>
        </div>
      </div>

      <OpsSurface
        title="AI Summary Prompt"
        description="This is the private org prompt used to guide document summarization behavior."
        actions={
          <Button onClick={onSavePrompt} disabled={!promptDirty || savingPrompt || loading}>
            <Save className="mr-2 h-4 w-4" />
            {savingPrompt ? 'Saving...' : 'Save Prompt'}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <OpsPill tone="neutral">Org Private Setting</OpsPill>
            <OpsPill tone={promptDirty ? 'warning' : 'success'}>
              {promptDirty ? 'Unsaved changes' : 'Saved'}
            </OpsPill>
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary-prompt">Summary Prompt</Label>
            <Textarea
              id="summary-prompt"
              rows={8}
              value={summaryPrompt}
              onChange={(event) => setSummaryPrompt(event.target.value)}
              placeholder={DEFAULT_SUMMARY_PROMPT}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => setSummaryPrompt(DEFAULT_SUMMARY_PROMPT)}
              disabled={savingPrompt}
            >
              Reset to Default
            </Button>
            <Input readOnly value={detail?.orgId || orgId} className="max-w-sm font-mono text-xs" />
          </div>
        </div>
      </OpsSurface>
    </div>
  );
}
