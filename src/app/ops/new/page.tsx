"use client";
import React, { useState } from 'react';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';
import { OpsHeaderSync } from '@/components/ops/ops-header-context';

const PLAN_OPTIONS = [
  { value: 'free', label: 'Free (2 GB / 3 months)' },
  { value: 'paid_tier1', label: 'Paid Tier 1 (200 GB / 12 months)' },
  { value: 'enterprise', label: 'Enterprise (custom)' },
];

export default function NewOrgPage() {
  const [name, setName] = useState('');
  const [planKey, setPlanKey] = useState('paid_tier1');
  const [storageLimitGb, setStorageLimitGb] = useState(200);
  const [planLengthMonths, setPlanLengthMonths] = useState(12);
  const [graceDays, setGraceDays] = useState(7);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [csmEmail, setCsmEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMsg(null);
    try {
      const body = {
        name,
        planKey,
        storageLimitGb,
        planLengthMonths,
        graceDays,
        ownerEmail: ownerEmail || undefined,
        csmEmail: csmEmail || undefined,
        notes: notes || undefined,
      };
      const res = await apiFetch('/ops/orgs', { method: 'POST', body });
      setMsg('Organization created. Redirecting…');
      setTimeout(() => { window.location.href = `/ops/orgs/${(res as any)?.id}`; }, 800);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to create org');
    } finally {
      setCreating(false);
    }
  };
  return (
    <SimpleOpsLayout showFilters={false}>
      <OpsHeaderSync
        title="Create Organization"
        subtitle="Capture plan tier, limits, and ownership before provisioning a new workspace."
        backHref="/ops"
        backLabel="Back to Ops"
      />
      <div className="px-4 md:px-6 py-4">
        <Card>
          <CardHeader>
            <CardTitle>New Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <section className="space-y-3">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Corp"
                  required
                />
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Plan tier</Label>
                  <Select value={planKey} onValueChange={setPlanKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a tier" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storage">Storage limit (GB)</Label>
                  <Input
                    id="storage"
                    type="number"
                    min={1}
                    value={storageLimitGb}
                    onChange={(e) => setStorageLimitGb(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-length">Plan length (months)</Label>
                  <Input
                    id="plan-length"
                    type="number"
                    min={1}
                    value={planLengthMonths}
                    onChange={(e) => setPlanLengthMonths(Number(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grace">Grace period (days)</Label>
                  <Input
                    id="grace"
                    type="number"
                    min={0}
                    value={graceDays}
                    onChange={(e) => setGraceDays(Number(e.target.value) || 0)}
                  />
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="owner">Owner email (optional)</Label>
                  <Input
                    id="owner"
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="owner@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="csm">CSM contact (optional)</Label>
                  <Input
                    id="csm"
                    type="email"
                    value={csmEmail}
                    onChange={(e) => setCsmEmail(e.target.value)}
                    placeholder="csm@example.com"
                  />
                </div>
              </section>

              <section className="space-y-2">
                <Label htmlFor="notes">Plan notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contract IDs, special limits, or other notes"
                />
              </section>

              <p className="text-xs text-muted-foreground">
                This will seed default roles, ensure a Core team, and add you as orgAdmin.
              </p>

              <div>
                <Button type="submit" disabled={creating || name.trim().length < 2}>
                  {creating ? 'Creating…' : 'Create organization'}
                </Button>
              </div>

              {msg && <div className="text-sm">{msg}</div>}
            </form>
          </CardContent>
        </Card>
      </div>
    </SimpleOpsLayout>
  );
}
