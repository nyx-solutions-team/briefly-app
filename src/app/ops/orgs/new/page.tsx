"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { OpsPageHeader, OpsSurface } from '@/components/ops/ops-primitives';
import { createOpsOrganization } from '@/lib/ops-api';

const PLAN_PRESETS: Record<
  string,
  {
    label: string;
    storageLimitGb: number;
    planLengthMonths: number;
    graceDays: number;
  }
> = {
  free: {
    label: 'Free',
    storageLimitGb: 2,
    planLengthMonths: 3,
    graceDays: 3,
  },
  paid_tier1: {
    label: 'Paid Tier 1',
    storageLimitGb: 200,
    planLengthMonths: 12,
    graceDays: 7,
  },
  enterprise: {
    label: 'Enterprise',
    storageLimitGb: 500,
    planLengthMonths: 12,
    graceDays: 14,
  },
};

export default function OpsCreateOrganizationPage() {
  const router = useRouter();
  const [form, setForm] = React.useState({
    name: '',
    planKey: 'paid_tier1',
    storageLimitGb: PLAN_PRESETS.paid_tier1.storageLimitGb,
    planLengthMonths: PLAN_PRESETS.paid_tier1.planLengthMonths,
    graceDays: PLAN_PRESETS.paid_tier1.graceDays,
    ownerEmail: '',
    csmEmail: '',
    notes: '',
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onFieldChange = (field: string, value: string | number) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const onPlanChange = (planKey: string) => {
    const preset = PLAN_PRESETS[planKey] || PLAN_PRESETS.paid_tier1;
    setForm((current) => ({
      ...current,
      planKey,
      storageLimitGb: preset.storageLimitGb,
      planLengthMonths: preset.planLengthMonths,
      graceDays: preset.graceDays,
    }));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await createOpsOrganization({
        name: form.name.trim(),
        planKey: form.planKey,
        storageLimitGb: Number(form.storageLimitGb),
        planLengthMonths: Number(form.planLengthMonths),
        graceDays: Number(form.graceDays),
        ownerEmail: form.ownerEmail.trim() || undefined,
        csmEmail: form.csmEmail.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      router.push(`/ops/orgs/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create organization');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <OpsPageHeader
        eyebrow="Phase 1"
        title="Create Organization"
        description="This is the new clean provisioning flow. Keep it focused on reliable setup: org identity, plan defaults, ownership metadata, and a clear post-create scaffold."
        backHref="/ops/orgs"
        backLabel="Organizations"
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to create organization</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <OpsSurface title="Provision Workspace" description="Create the org record with a sensible plan preset and basic ownership metadata.">
          <form className="space-y-8" onSubmit={onSubmit}>
            <section className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  placeholder="Acme Steel Pvt Ltd"
                  value={form.name}
                  onChange={(event) => onFieldChange('name', event.target.value)}
                  required
                />
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Plan Preset</Label>
                <Select value={form.planKey} onValueChange={onPlanChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLAN_PRESETS).map(([key, preset]) => (
                      <SelectItem key={key} value={key}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="storage-limit">Storage Limit (GB)</Label>
                <Input
                  id="storage-limit"
                  type="number"
                  min={1}
                  value={form.storageLimitGb}
                  onChange={(event) => onFieldChange('storageLimitGb', Number(event.target.value) || 0)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plan-length">Plan Length (Months)</Label>
                <Input
                  id="plan-length"
                  type="number"
                  min={1}
                  value={form.planLengthMonths}
                  onChange={(event) => onFieldChange('planLengthMonths', Number(event.target.value) || 1)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="grace-days">Grace Window (Days)</Label>
                <Input
                  id="grace-days"
                  type="number"
                  min={0}
                  value={form.graceDays}
                  onChange={(event) => onFieldChange('graceDays', Number(event.target.value) || 0)}
                  required
                />
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="owner-email">Owner Email</Label>
                <Input
                  id="owner-email"
                  type="email"
                  placeholder="owner@example.com"
                  value={form.ownerEmail}
                  onChange={(event) => onFieldChange('ownerEmail', event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="csm-email">CSM Email</Label>
                <Input
                  id="csm-email"
                  type="email"
                  placeholder="csm@example.com"
                  value={form.csmEmail}
                  onChange={(event) => onFieldChange('csmEmail', event.target.value)}
                />
              </div>
            </section>

            <section className="space-y-2">
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea
                id="notes"
                placeholder="Contract notes, onboarding reminders, special handling, or account context."
                value={form.notes}
                onChange={(event) => onFieldChange('notes', event.target.value)}
                rows={5}
              />
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={submitting || form.name.trim().length < 2}>
                {submitting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Creating Workspace
                  </>
                ) : (
                  'Create Organization'
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/ops/orgs')}>
                Cancel
              </Button>
            </div>
          </form>
        </OpsSurface>

        <div className="space-y-6">
          <OpsSurface title="What This Creates" description="The backend already scaffolds a reliable starting point. This screen keeps that flow explicit.">
            <div className="space-y-3 text-sm text-muted-foreground">
              {[
                'Organization record with plan dates, storage limit, and notes',
                'Default org settings scaffold',
                'Default role scaffold',
                'Core team scaffold',
                'Creator enrolled as org admin',
                'Ops audit trail for the create action',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-border/50 bg-background/70 p-4">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </OpsSurface>

          <OpsSurface title="Provisioning Philosophy" description="This flow is intentionally narrower than the old ops area.">
            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Create the workspace first. Configure deeper controls after the org exists and is auditable.
              </p>
              <p>
                Feature controls, detailed permissions, and richer setup checks should happen inside the org detail flow rather than overloading creation.
              </p>
              <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 text-foreground" />
                  <p>
                    The goal here is a dependable first step, not a giant wizard.
                  </p>
                </div>
              </div>
            </div>
          </OpsSurface>
        </div>
      </div>
    </div>
  );
}
