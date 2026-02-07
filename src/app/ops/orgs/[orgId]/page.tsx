"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { formatBytes, formatOpsDate } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { OpsHeaderSync } from '@/components/ops/ops-header-context';

type Diagnostic = { id: string; severity: 'error' | 'warn' | 'info'; title: string; details?: any };
type OrgPlan = {
  planKey: string | null;
  storageLimitGb: number;
  storageBytes: number;
  usageCalculatedAt: string | null;
  planEndsAt: string | null;
  storageGraceUntil: string | null;
  status: { expired: boolean; withinGrace: boolean; storageFull: boolean };
};
type OrgDiag = {
  orgId: string;
  orgName?: string | null;
  summary: { teams: number; users: number; documents: number; overrides: number };
  diagnostics: Diagnostic[];
  plan?: OrgPlan | null;
};

export default function OrgOpsPage() {
  const params = useParams();
  let orgId = String(params?.orgId || '');
  if (!orgId && typeof window !== 'undefined') {
    const parts = window.location.pathname.split('/');
    const idx = parts.findIndex((p) => p === 'orgs');
    if (idx !== -1 && parts[idx + 1]) orgId = parts[idx + 1];
  }

  const [data, setData] = useState<OrgDiag | null>(null);
  const [roles, setRoles] = useState<any[] | null>(null);
  const [teams, setTeams] = useState<any[] | null>(null);
  const [overrides, setOverrides] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[] | null>(null);
  const [leadInputs, setLeadInputs] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState({ email: '', role: 'member', deptId: '', deptRole: 'member', password: '' });
  const [newTeam, setNewTeam] = useState({ name: '', leadEmail: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policySQL, setPolicySQL] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'storage' | 'security' | 'members' | 'admin'>('overview');

  async function load() {
    if (!orgId) return;
    setLoading(true);
    setMsg(null);
    try {
      const d = await apiFetch<OrgDiag>(`/ops/orgs/${orgId}`);
      setData(d);
      const r = await apiFetch<any[]>(`/ops/orgs/${orgId}/roles`);
      setRoles(r || []);
      const t = await apiFetch<any[]>(`/ops/orgs/${orgId}/teams`);
      setTeams(t || []);
      const ov = await apiFetch<any[]>(`/ops/orgs/${orgId}/overrides`);
      setOverrides(ov || []);
      const us = await apiFetch<any[]>(`/ops/orgs/${orgId}/users`);
      setUsers(us || []);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to load diagnostics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (orgId) void load();
  }, [orgId]);

  const fixSeedRoles = async () => {
    try {
      await apiFetch(`/ops/fix/${orgId}/seed-roles`, { method: 'POST' });
      setMsg('Seeded roles.');
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Fix failed');
    }
  };
  const fixCoreTeam = async () => {
    try {
      await apiFetch(`/ops/fix/${orgId}/core-team`, { method: 'POST' });
      setMsg('Ensured Core team.');
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Fix failed');
    }
  };
  const fixRoleDrift = async () => {
    try {
      await apiFetch(`/ops/fix/${orgId}/role-drift`, { method: 'POST' });
      setMsg('Fixed role drift.');
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Fix failed');
    }
  };
  const fixMembership = async () => {
    try {
      await apiFetch(`/ops/fix/${orgId}/membership`, { method: 'POST' });
      setMsg('Fixed membership.');
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Fix failed');
    }
  };
  const fixInitSettings = async () => {
    try {
      const result = await apiFetch<{ ok: boolean; categoriesFixed: boolean; userSettingsFixed: number }>(`/ops/fix/${orgId}/init-settings`, { method: 'POST' });
      const parts = [];
      if (result.categoriesFixed) parts.push('added categories');
      if (result.userSettingsFixed > 0) parts.push(`initialized ${result.userSettingsFixed} admin user setting${result.userSettingsFixed > 1 ? 's' : ''}`);
      setMsg(parts.length > 0 ? `Fixed initialization: ${parts.join(', ')}.` : 'Initialization settings already complete.');
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Fix failed');
    }
  };

  const openPolicySQL = useCallback(async () => {
    try {
      const res = await apiFetch<{ sql: string }>(`/ops/fix/${orgId}/policies/sql`);
      setPolicySQL(res?.sql || '');
      setPolicyOpen(true);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to load SQL');
    }
  }, [orgId]);

  const grouped = useMemo(() => {
    const errors = (data?.diagnostics || []).filter((d) => d.severity === 'error');
    const warns = (data?.diagnostics || []).filter((d) => d.severity === 'warn');
    const infos = (data?.diagnostics || []).filter((d) => d.severity === 'info');
    return { errors, warns, infos };
  }, [data]);

  const headerActions = useMemo(() => {
    if (!data) return undefined;
    return (
      <Button variant="outline" size="sm" onClick={openPolicySQL}>
        Policy SQL
      </Button>
    );
  }, [data, openPolicySQL]);

  const headerMeta = data?.orgName 
    ? `${data.orgName} (${data?.orgId || orgId})`
    : data?.orgId || orgId 
    ? `Org: ${data?.orgId || orgId}` 
    : undefined;

  if (!orgId) {
    return (
      <SimpleOpsLayout showFilters={false}>
        <OpsHeaderSync
          title="Org Diagnostics"
          subtitle="Detailed plan, storage, security, and membership controls for this workspace."
          backHref="/ops"
          backLabel="Back to Ops"
          meta={headerMeta}
          actions={headerActions}
        />
        <div className="px-4 md:px-6 py-6">
          <Alert>
            <AlertTitle>No organization selected</AlertTitle>
            <AlertDescription>Choose an organization from the sidebar or the filters to continue.</AlertDescription>
          </Alert>
        </div>
      </SimpleOpsLayout>
    );
  }

  if (loading) {
    return (
      <SimpleOpsLayout showFilters={false}>
        <OpsHeaderSync
          title="Org Diagnostics"
          subtitle="Detailed plan, storage, security, and membership controls for this workspace."
          backHref="/ops"
          backLabel="Back to Ops"
          meta={headerMeta}
          actions={headerActions}
        />
        <div className="px-4 md:px-6 py-6 space-y-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Card key={idx}>
              <CardContent className="h-32 animate-pulse bg-muted/40" />
            </Card>
          ))}
        </div>
      </SimpleOpsLayout>
    );
  }

  return (
    <SimpleOpsLayout showFilters={false}>
        <OpsHeaderSync
          title="Org Diagnostics"
          subtitle="Detailed plan, storage, security, and membership controls for this workspace."
          backHref="/ops"
          backLabel="Back to Ops"
          meta={headerMeta}
          actions={headerActions}
        />
      <div className="px-4 md:px-6 py-6 space-y-6">
        {msg && (
          <Alert>
            <AlertTitle>Notice</AlertTitle>
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <PlanCard summary={data?.summary} plan={data?.plan || null} />
            <QuickActionsCard
              grouped={grouped}
              onSeedRoles={fixSeedRoles}
              onCoreTeam={fixCoreTeam}
              onRoleDrift={fixRoleDrift}
              onMembership={fixMembership}
              onInitSettings={fixInitSettings}
            />
          </div>

          <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="storage">Storage</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
                <TabsTrigger value="admin">Admin</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="space-y-4">
                <DiagnosticsPanel grouped={grouped} />
                <TeamsPanel teams={teams || []} leadInputs={leadInputs} setLeadInputs={setLeadInputs} orgId={orgId} onUpdated={load} />
              </TabsContent>
              <TabsContent value="activity">
                <ActivityPanel orgId={orgId} users={users} />
              </TabsContent>
              <TabsContent value="storage">
                <StoragePanel orgId={orgId} plan={data?.plan || null} />
              </TabsContent>
              <TabsContent value="security">
                <SecurityPanel orgId={orgId} />
              </TabsContent>
              <TabsContent value="members">
                <MembersPanel
                  invite={invite}
                  setInvite={setInvite}
                  newTeam={newTeam}
                  setNewTeam={setNewTeam}
                  data={data}
                  teams={teams || []}
                  users={users || []}
                  orgId={orgId}
                  onUpdated={load}
                  setMsg={setMsg}
                />
              </TabsContent>
              <TabsContent value="admin" className="space-y-4">
                <RolesPanel roles={roles || []} orgId={orgId} onSaved={load} />
                <OverridesPanel overrides={overrides || []} />
                <Card>
                  <CardHeader>
                    <CardTitle>RLS Simulator</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RlsSimulator orgId={orgId} teams={teams || []} users={users || []} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Align Policies — SQL Preview</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Copy and run this SQL in your editor to align the documents policies. It is idempotent.
          </div>
          <pre className="mt-2 max-h-[60vh] overflow-auto rounded border bg-muted/40 p-3 text-xs">{policySQL}</pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SimpleOpsLayout>
  );
}

function PlanCard({ summary, plan }: { summary: OrgDiag['summary'] | undefined; plan: OrgPlan | null }) {
  const usagePercent =
    plan && plan.storageLimitGb > 0
      ? Math.min(999, Math.round((plan.storageBytes / (plan.storageLimitGb * 1024 ** 3)) * 10000) / 100)
      : null;
  const statusLabel = (() => {
    if (!plan) return 'Unknown';
    if (plan.status.storageFull) return 'Storage limit reached';
    if (plan.status.expired) return 'Plan expired';
    if (plan.status.withinGrace) return 'In grace period';
    return 'Healthy';
  })();
  const statusVariant = plan?.status.storageFull || plan?.status.expired ? 'destructive' : 'secondary';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan & usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Plan</span>
          <span className="font-medium">{plan?.planKey || 'unknown'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Storage used</span>
          <span className="font-medium">{formatBytes(plan?.storageBytes || 0)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Limit</span>
          <span className="font-medium">
            {plan?.storageLimitGb ? `${plan.storageLimitGb.toLocaleString()} GB` : 'Unlimited'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Usage</span>
          <span className="font-medium">{usagePercent !== null ? `${usagePercent}%` : 'n/a'}</span>
        </div>
        {plan?.planEndsAt && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Plan ends</span>
            <span className="font-medium text-xs">{formatOpsDate(plan.planEndsAt)}</span>
          </div>
        )}
        <Badge variant={statusVariant} className="text-xs">
          {statusLabel}
        </Badge>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 text-xs">
          <div>
            <div className="text-muted-foreground">Teams</div>
            <div className="text-lg font-semibold">{summary?.teams ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Users</div>
            <div className="text-lg font-semibold">{summary?.users ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Documents</div>
            <div className="text-lg font-semibold">{summary?.documents ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Overrides</div>
            <div className="text-lg font-semibold">{summary?.overrides ?? '—'}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickActionsCard({
  grouped,
  onSeedRoles,
  onCoreTeam,
  onRoleDrift,
  onMembership,
  onInitSettings,
}: {
  grouped: { errors: Diagnostic[]; warns: Diagnostic[]; infos: Diagnostic[] };
  onSeedRoles: () => void;
  onCoreTeam: () => void;
  onRoleDrift: () => void;
  onMembership: () => void;
  onInitSettings: () => void;
}) {
  const statusIcon =
    grouped.errors.length > 0 ? (
      <AlertTriangle className="h-5 w-5 text-red-600" />
    ) : grouped.warns.length > 0 ? (
      <Info className="h-5 w-5 text-amber-600" />
    ) : (
      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
    );
  const statusLabel =
    grouped.errors.length > 0 ? 'Needs attention' : grouped.warns.length > 0 ? 'Minor issues' : 'Healthy';

  const actions = [
    {
      title: 'Seed roles',
      description:
        'Upsert the core roles (orgAdmin, contentManager, teamLead, member, contentViewer) with default permissions.',
      action: onSeedRoles,
    },
    {
      title: 'Ensure Core team',
      description: 'Create Core department if missing and set all orgAdmins as Core leads.',
      action: onCoreTeam,
    },
    {
      title: 'Fix role drift',
      description: 'Ensure teamLead/member roles keep the required document permissions.',
      action: onRoleDrift,
    },
    {
      title: 'Fix membership',
      description: 'Add missing organization_users entries for department members.',
      action: onMembership,
    },
    {
      title: 'Fix initialization',
      description: 'Add categories to org_settings and initialize user_settings for orgAdmins if missing.',
      action: onInitSettings,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            {statusIcon}
            Status: {statusLabel}
          </span>
          <span className="text-xs text-muted-foreground">
            Errors: {grouped.errors.length} · Warnings: {grouped.warns.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {actions.map((item) => (
          <div key={item.title} className="rounded border p-3">
            <div className="font-semibold">{item.title}</div>
            <div className="text-xs text-muted-foreground">{item.description}</div>
            <Button size="sm" variant="outline" className="mt-2" onClick={item.action}>
              Run
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DiagnosticsPanel({ grouped }: { grouped: { errors: Diagnostic[]; warns: Diagnostic[]; infos: Diagnostic[] } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {(['error', 'warn', 'info'] as const).map((sev) => {
          const list =
            sev === 'error' ? grouped.errors : sev === 'warn' ? grouped.warns : grouped.infos;
          if (!list.length) return null;
          const label = sev === 'error' ? 'Errors' : sev === 'warn' ? 'Warnings' : 'Info';
          return (
            <div key={sev}>
              <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
              <div className="space-y-2">
                {list.map((diag) => (
                  <div key={diag.id} className="rounded border p-2">
                    <div className="font-medium">{diag.title}</div>
                    {diag.details && (
                      <pre className="mt-1 overflow-auto rounded bg-muted/40 p-2 text-[11px]">
                        {JSON.stringify(diag.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {grouped.errors.length + grouped.warns.length + grouped.infos.length === 0 && (
          <p className="text-sm text-muted-foreground">No diagnostics available.</p>
        )}
      </CardContent>
    </Card>
  );
}

function TeamsPanel({
  teams,
  leadInputs,
  setLeadInputs,
  orgId,
  onUpdated,
}: {
  teams: any[];
  leadInputs: Record<string, string>;
  setLeadInputs: (value: Record<string, string>) => void;
  orgId: string;
  onUpdated: () => Promise<void> | void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Teams</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {teams.length === 0 && <p className="text-muted-foreground">No teams found.</p>}
        {teams.map((team) => (
          <div key={team.id} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{team.name}</div>
                <div className="text-xs text-muted-foreground">Members: {team.members}</div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8"
                  placeholder="Lead userId"
                  value={leadInputs[team.id] || ''}
                  onChange={(e) => setLeadInputs({ ...leadInputs, [team.id]: e.target.value })}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const uid = (leadInputs[team.id] || '').trim();
                    if (!uid) {
                      alert('Enter userId');
                      return;
                    }
                    try {
                      await apiFetch(`/ops/orgs/${orgId}/teams/${team.id}/leads`, {
                        method: 'POST',
                        body: { userId: uid },
                      });
                      setLeadInputs({ ...leadInputs, [team.id]: '' });
                      await onUpdated();
                    } catch (e: any) {
                      alert(e?.message || 'Failed');
                    }
                  }}
                >
                  Set lead
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MembersPanel({
  invite,
  setInvite,
  newTeam,
  setNewTeam,
  data,
  teams,
  users,
  orgId,
  onUpdated,
  setMsg,
}: {
  invite: { email: string; role: string; deptId: string; deptRole: string; password: string };
  setInvite: (v: typeof invite) => void;
  newTeam: { name: string; leadEmail: string };
  setNewTeam: (v: typeof newTeam) => void;
  data: OrgDiag | null;
  teams: any[];
  users: any[];
  orgId: string;
  onUpdated: () => Promise<void> | void;
  setMsg: (msg: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Invite or add member</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <Input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Password (optional)</label>
              <Input
                type="password"
                value={invite.password}
                onChange={(e) => setInvite({ ...invite, password: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Role</label>
              <Select value={invite.role} onValueChange={(val) => setInvite({ ...invite, role: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orgAdmin">orgAdmin</SelectItem>
                  <SelectItem value="contentManager">contentManager</SelectItem>
                  <SelectItem value="teamLead">teamLead</SelectItem>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="contentViewer">contentViewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Team (optional)</label>
                  <Select
                    value={invite.deptId ? invite.deptId : 'all'}
                    onValueChange={(val) => setInvite({ ...invite, deptId: val === 'all' ? '' : val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">None</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Team role</label>
              <Select value={invite.deptRole} onValueChange={(val) => setInvite({ ...invite, deptRole: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={async () => {
              if (!invite.email.includes('@')) {
                alert('Enter valid email');
                return;
              }
              try {
                const response: any = await apiFetch(`/ops/orgs/${orgId}/users/invite`, {
                  method: 'POST',
                  body: {
                    email: invite.email,
                    role: invite.role,
                    departmentId: invite.deptId || undefined,
                    deptRole: invite.deptRole,
                    password: invite.password || undefined,
                  },
                });
                if (response.userWasCreated) {
                  setMsg('User created with password - no email sent');
                } else {
                  setMsg('User invited via email');
                }
                setInvite({ email: '', role: 'member', deptId: '', deptRole: 'member', password: '' });
                await onUpdated();
              } catch (e: any) {
                alert(e?.message || 'Failed');
              }
            }}
          >
            Invite/Add
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Team name"
              value={newTeam.name}
              onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
            />
            <Input
              placeholder="Lead email (optional)"
              value={newTeam.leadEmail}
              onChange={(e) => setNewTeam({ ...newTeam, leadEmail: e.target.value })}
            />
          </div>
          <Button
            onClick={async () => {
              if (newTeam.name.trim().length < 2) {
                alert('Enter team name');
                return;
              }
              try {
                await apiFetch(`/ops/orgs/${orgId}/teams`, {
                  method: 'POST',
                  body: { name: newTeam.name, leadEmail: newTeam.leadEmail || undefined },
                });
                setNewTeam({ name: '', leadEmail: '' });
                await onUpdated();
              } catch (e: any) {
                alert(e?.message || 'Failed');
              }
            }}
          >
            Create team
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto text-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Teams</TableHead>
                <TableHead>Reset password</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users || []).map((user) => (
                <UserRow key={user.userId} orgId={orgId} user={user} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function RolesPanel({ roles, orgId, onSaved }: { roles: any[]; orgId: string; onSaved: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Key</th>
              <th className="p-2">Name</th>
              <th className="p-2">System</th>
              <th className="p-2">Permissions JSON</th>
              <th className="p-2">Save</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <RoleRow key={role.key} orgId={orgId} row={role} onSaved={onSaved} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function OverridesPanel({ overrides }: { overrides: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overrides</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto text-sm">
        <table className="min-w-full">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">User</th>
              <th className="p-2">Department</th>
              <th className="p-2">Permissions</th>
            </tr>
          </thead>
          <tbody>
            {overrides.length === 0 ? (
              <tr>
                <td className="p-2 text-muted-foreground" colSpan={3}>
                  No overrides configured.
                </td>
              </tr>
            ) : (
              overrides.map((o, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2">{o.user_id}</td>
                  <td className="p-2">{o.department_id || 'org-wide'}</td>
                  <td className="p-2">
                    <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(o.permissions, null, 2)}</pre>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

type IncidentRow = {
  id: string;
  type: string;
  ts: string;
  note: string | null;
  actor_user_id: string | null;
};

type OrgUserSummary = {
  userId: string;
  displayName?: string | null;
  role?: string | null;
};

function ActivityPanel({ orgId, users }: { orgId: string; users: OrgUserSummary[] | null }) {
  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const actorMap = useMemo(() => {
    const map = new Map<string, { name: string | null | undefined; role: string | null | undefined }>();
    (users || []).forEach((u) => {
      map.set(u.userId, { name: u.displayName, role: u.role });
    });
    return map;
  }, [users]);

  useEffect(() => {
    let active = true;
    async function loadActivity() {
      setLoading(true);
      setError(null);
      try {
        const resp = await apiFetch<{ rows: IncidentRow[] } | IncidentRow[]>(`/ops/incidents?orgId=${orgId}&since=30&limit=50`);
        const list = Array.isArray(resp) ? resp : resp?.rows || [];
        if (active) setRows(list);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load activity');
          setRows([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadActivity();
    return () => {
      active = false;
    };
  }, [orgId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-10 animate-pulse rounded bg-muted/40" />
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load activity</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incidents in the last 30 days.</p>
        ) : (
          <div className="space-y-2">
            {rows.slice(0, 15).map((row) => {
              const actorId = row.actor_user_id;
              const actorMeta = actorId ? actorMap.get(actorId) : null;
              let actorContent: React.ReactNode = 'system';
              if (actorId) {
                actorContent = actorMeta ? (
                  <>
                    {actorMeta.name || 'Unknown user'}
                    {actorMeta.role ? <span> · {actorMeta.role}</span> : null}
                  </>
                ) : (
                  actorId
                );
              }
              return (
                <div key={row.id} className="rounded border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs capitalize">
                      {row.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatOpsDate(row.ts, { withTime: true })}
                    </span>
                  </div>
                  <p className="mt-1">{row.note || 'No additional context'}</p>
                  <div className="text-xs text-muted-foreground">Actor: {actorContent}</div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type OrphanSummary = {
  summary?: { total: number; storageBytes: number };
  total: number;
  rows: { path: string; size: number; linkedDocId?: string | null }[];
};

function StoragePanel({ orgId, plan }: { orgId: string; plan: OrgPlan | null }) {
  const [data, setData] = useState<OrphanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadOrphans() {
      setLoading(true);
      setError(null);
      try {
        const resp = await apiFetch<OrphanSummary>(
          `/ops/orgs/${orgId}/orphan-storage?bucket=documents&page=1&pageSize=10`,
          { skipCache: true }
        );
        if (active) setData(resp);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load orphan summary');
          setData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadOrphans();
    return () => {
      active = false;
    };
  }, [orgId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage & orphaned files</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="rounded border bg-muted/40 p-3 text-xs">
          <div>Plan usage: {formatBytes(plan?.storageBytes || 0)} / {plan?.storageLimitGb ? `${plan.storageLimitGb} GB` : 'Unlimited'}</div>
          {plan?.planEndsAt && (
            <div>Plan ends: {formatOpsDate(plan.planEndsAt)}</div>
          )}
          {plan?.status.storageFull && <div className="text-destructive">Storage limit reached</div>}
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-10 animate-pulse rounded bg-muted/40" />
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load orphaned storage</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              Orphan files: {data?.summary?.total ?? data?.total ?? 0} ·{' '}
              Storage: {formatBytes(data?.summary?.storageBytes || 0)}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Linked doc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows?.length ? (
                  data.rows.map((row) => (
                    <TableRow key={row.path}>
                      <TableCell className="font-mono text-xs">{row.path}</TableCell>
                      <TableCell>{formatBytes(row.size || 0)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.linkedDocId || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      No orphaned storage detected in recent scan.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="text-right">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/ops/orphan-files/${orgId}`}>Open orphaned storage</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type SecurityOverview = {
  ipAllowlist: { id: string; org_id: string; ip_address: string; label: string | null; enforced: boolean | null }[];
  overrides: { id: string; org_id: string; user_id: string; expires_at: string | null }[];
  anomalies: { id: string; org_id: string | null; type: string; ts: string; actor_user_id: string | null; note: string | null }[];
};

function SecurityPanel({ orgId }: { orgId: string }) {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSecurity() {
      setLoading(true);
      setError(null);
      try {
        const resp = await apiFetch<SecurityOverview>('/ops/security/overview', { skipCache: true });
        if (active) setData(resp);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load security data');
          setData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSecurity();
    return () => {
      active = false;
    };
  }, [orgId]);

  const ipRules = (data?.ipAllowlist || []).filter((rule) => rule.org_id === orgId);
  const overrides = (data?.overrides || []).filter((row) => row.org_id === orgId);
  const anomalies = (data?.anomalies || []).filter((row) => row.org_id === orgId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>IP allowlist</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-10 animate-pulse rounded bg-muted/40" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load allowlist</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : ipRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No IP rules configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ipRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono text-xs">{rule.ip_address}</TableCell>
                    <TableCell>{rule.label || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={rule.enforced ? 'secondary' : 'outline'}>
                        {rule.enforced ? 'Enforced' : 'Bypass'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overrides</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-10 animate-pulse rounded bg-muted/40" />
              ))}
            </div>
          ) : overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No overrides created.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.user_id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.expires_at ? formatOpsDate(row.expires_at, { withTime: true }) : 'No expiry'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anomalies (7 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, idx) => (
                <div key={idx} className="h-10 animate-pulse rounded bg-muted/40" />
              ))}
            </div>
          ) : anomalies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No anomalies recorded.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {anomalies.map((row) => (
                <div key={row.id} className="rounded border p-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{row.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatOpsDate(row.ts, { withTime: true })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{row.note || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function RoleRow({ orgId, row, onSaved }: { orgId: string; row: any; onSaved: () => void }) {
  const [json, setJson] = useState(JSON.stringify(row.permissions, null, 2));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(json);
      } catch {
        alert('Invalid JSON');
        setSaving(false);
        return;
      }
      await apiFetch(`/ops/orgs/${orgId}/roles/${row.key}`, {
        method: 'PUT',
        body: { permissions: parsed },
      });
      onSaved();
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };
  return (
    <tr className="border-b align-top">
      <td className="p-2">{row.key}</td>
      <td className="p-2">{row.name}</td>
      <td className="p-2">{String(row.is_system)}</td>
      <td className="p-2 w-[520px]">
        <textarea
          className="h-40 w-full rounded border p-2 text-xs"
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
      </td>
      <td className="p-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </td>
    </tr>
  );
}

function RlsSimulator({ orgId, teams, users }: { orgId: string; teams: any[]; users: any[] }) {
  const [userId, setUserId] = useState(users[0]?.userId || '');
  const [dept, setDept] = useState(teams[0]?.id || '');
  const [action, setAction] = useState<'create' | 'update' | 'delete' | 'read'>('create');
  const [result, setResult] = useState<any | null>(null);
  const simulate = async () => {
    try {
      const r = await apiFetch(
        `/ops/orgs/${orgId}/rls-simulate?userId=${encodeURIComponent(userId)}&action=${encodeURIComponent(
          action
        )}&departmentId=${encodeURIComponent(dept)}`
      );
      setResult(r);
    } catch (e: any) {
      alert(e?.message || 'Simulation failed');
    }
  };
  return (
    <div className="space-y-2 text-sm">
      <div className="grid gap-2 md:grid-cols-4">
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger>
            <SelectValue placeholder="User" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.userId} value={u.userId}>
                {u.displayName || u.userId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger>
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={(val) => setAction(val as typeof action)}>
          <SelectTrigger>
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={simulate}>Simulate</Button>
      </div>
      {result && (
        <div className="rounded border bg-muted/40 p-2 text-xs">
          <div>Role: {result.role || 'n/a'}</div>
          <div>Org member: {String(result.isMember)}</div>
          <div>Dept member: {String(result.isDeptMember)}</div>
          <div>
            Needs: {result.needKey} → Has: <strong>{String(result.hasPerm)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function UserRow({ orgId, user }: { orgId: string; user: any }) {
  const [pwd, setPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const reset = async () => {
    if (pwd.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/ops/users/${user.userId}/password`, { method: 'POST', body: { newPassword: pwd } });
      setPwd('');
      alert('Password updated');
    } catch (e: any) {
      alert(e?.message || 'Reset failed');
    } finally {
      setSaving(false);
    }
  };
  return (
    <TableRow className="align-top">
      <TableCell className="font-medium">{user.displayName || user.userId}</TableCell>
      <TableCell>{user.role}</TableCell>
      <TableCell className="text-xs">{(user.departments || []).map((d: any) => d.departmentId).join(', ') || '—'}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 text-xs"
            type="password"
            placeholder="New password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
          <Button size="sm" onClick={reset} disabled={saving}>
            {saving ? 'Saving…' : 'Set'}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
