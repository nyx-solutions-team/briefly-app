"use client";

import Link from 'next/link';
import * as React from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OpsOrgSubnav } from '@/components/ops/ops-org-subnav';
import { OpsMetricCard, OpsPageHeader, OpsPill, OpsSurface } from '@/components/ops/ops-primitives';
import {
  getOpsOrganization,
  getOpsStorageUsagePercent,
  listOpsOrgRoles,
  listOpsOrgTeams,
  listOpsOrgUsers,
  type OpsOrgDetail,
  type OpsOrgDiagnostic,
  type OpsOrgTeam,
  type OpsOrgUser,
  type OpsRole,
} from '@/lib/ops-api';
import { formatBytes, formatOpsDate } from '@/lib/utils';

function getDiagnosticTone(severity: OpsOrgDiagnostic['severity']) {
  if (severity === 'error') return 'danger' as const;
  if (severity === 'warn') return 'warning' as const;
  return 'neutral' as const;
}

function summarizeDiagnosticDetails(details: unknown) {
  if (!details) return null;
  if (typeof details === 'string') return details;
  if (typeof details === 'object') {
    try {
      const text = JSON.stringify(details);
      return text.length > 180 ? `${text.slice(0, 177)}...` : text;
    } catch {
      return null;
    }
  }
  return String(details);
}

function getRolePermissionCount(role: OpsRole) {
  return Object.values(role.permissions || {}).filter((value) => value === true || value === 'admin' || value === 'regular').length;
}

export default function OpsOrganizationDetailPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId || '';

  const [detail, setDetail] = React.useState<OpsOrgDetail | null>(null);
  const [teams, setTeams] = React.useState<OpsOrgTeam[]>([]);
  const [users, setUsers] = React.useState<OpsOrgUser[]>([]);
  const [roles, setRoles] = React.useState<OpsRole[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [detailResponse, teamsResponse, usersResponse, rolesResponse] = await Promise.all([
        getOpsOrganization(orgId),
        listOpsOrgTeams(orgId),
        listOpsOrgUsers(orgId),
        listOpsOrgRoles(orgId),
      ]);
      setDetail(detailResponse);
      setTeams(Array.isArray(teamsResponse) ? teamsResponse : []);
      setUsers(Array.isArray(usersResponse) ? usersResponse : []);
      setRoles(Array.isArray(rolesResponse) ? rolesResponse : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load organization details');
      setDetail(null);
      setTeams([]);
      setUsers([]);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const teamNameById = React.useMemo(() => {
    return new Map(teams.map((team) => [team.id, team.name]));
  }, [teams]);

  const adminCount = React.useMemo(() => {
    return users.filter((user) => user.role === 'orgAdmin' || user.role === 'owner').length;
  }, [users]);

  const detailSummary = detail?.summary || {
    teams: 0,
    users: 0,
    documents: 0,
    overrides: 0,
  };
  const detailPlan = detail?.plan || null;
  const detailDiagnostics = detail?.diagnostics || [];

  const setupChecklist = React.useMemo(() => {
    const roleKeys = new Set(roles.map((role) => role.key));
    return [
      {
        label: 'Workspace has at least one team',
        done: detailSummary.teams > 0,
      },
      {
        label: 'Workspace has at least one member',
        done: detailSummary.users > 0,
      },
      {
        label: 'Workspace has an admin assigned',
        done: adminCount > 0,
      },
      {
        label: 'Core team exists',
        done: teams.some((team) => team.name === 'Core'),
      },
      {
        label: 'Default roles are present',
        done: ['owner', 'orgAdmin', 'member', 'contentViewer', 'guest'].every((key) => roleKeys.has(key)),
      },
    ];
  }, [adminCount, detailSummary.teams, detailSummary.users, roles, teams]);

  const storageUsagePercent = React.useMemo(() => {
    return getOpsStorageUsagePercent(detailPlan);
  }, [detailPlan]);

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
        title={detail?.orgName || 'Organization Detail'}
        description="This screen is the first org command center in the new ops console: setup health, team structure, member access, and role coverage."
        backHref="/ops/orgs"
        backLabel="Organizations"
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="destructive" asChild>
              <Link href={`/ops/orgs/${orgId}/danger`}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Danger Zone
              </Link>
            </Button>
          </>
        }
      />

      <OpsOrgSubnav orgId={orgId} orgName={detail?.orgName} />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load organization</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OpsMetricCard label="Teams" value={loading ? '...' : detailSummary.teams} hint="Current org structure" />
        <OpsMetricCard label="Members" value={loading ? '...' : detailSummary.users} hint={`${adminCount} admins or owners`} />
        <OpsMetricCard label="Documents" value={loading ? '...' : detailSummary.documents} hint="Tracked documents in workspace" />
        <OpsMetricCard
          label="Storage"
          value={loading ? '...' : formatBytes(detailPlan?.storageBytes || 0)}
          hint={
            storageUsagePercent !== null
              ? `${storageUsagePercent.toFixed(1)}% of ${detailPlan?.storageLimitGb || 0} GB`
              : 'No plan limit detected'
          }
          tone={storageUsagePercent !== null && storageUsagePercent >= 80 ? 'warning' : 'default'}
        />
      </div>

      <Tabs defaultValue="summary" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <OpsSurface title="Setup Checklist" description="A small but explicit view of whether the workspace is structurally ready for use.">
              <div className="space-y-3">
                {setupChecklist.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start gap-3 rounded-2xl border border-border/50 bg-background/70 p-4"
                  >
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.done ? 'Ready' : 'Needs attention'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </OpsSurface>

            <OpsSurface title="Plan and Diagnostics" description="Plan state is shown alongside the backend diagnostics already available for this org.">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{detailPlan?.planKey || 'No plan key'}</p>
                      <p className="text-sm text-muted-foreground">
                        Ends {formatOpsDate(detailPlan?.planEndsAt)}
                      </p>
                    </div>
                    {detailPlan?.status?.expired ? (
                      <OpsPill tone="danger">Expired</OpsPill>
                    ) : detailPlan?.status?.withinGrace ? (
                      <OpsPill tone="warning">Grace Window</OpsPill>
                    ) : (
                      <OpsPill tone="success">Healthy</OpsPill>
                    )}
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                    <p>Usage calculated {formatOpsDate(detailPlan?.usageCalculatedAt, { withTime: true })}</p>
                    <p>Storage limit {detailPlan?.storageLimitGb || 0} GB</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {detailDiagnostics.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
                      No diagnostics returned for this organization.
                    </div>
                  ) : (
                    detailDiagnostics.map((diagnostic) => (
                      <div
                        key={diagnostic.id}
                        className="rounded-2xl border border-border/50 bg-background/70 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-medium text-foreground">{diagnostic.title}</p>
                          <OpsPill tone={getDiagnosticTone(diagnostic.severity)}>
                            {diagnostic.severity.toUpperCase()}
                          </OpsPill>
                        </div>
                        {summarizeDiagnosticDetails(diagnostic.details) ? (
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {summarizeDiagnosticDetails(diagnostic.details)}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </OpsSurface>
          </div>
        </TabsContent>

        <TabsContent value="teams">
          <OpsSurface title="Teams and Leads" description="Current department structure and lead assignment.">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead>Lead User</TableHead>
                    <TableHead>Members</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <div className="h-12 animate-pulse rounded-xl bg-muted/50" />
                      </TableCell>
                    </TableRow>
                  ) : teams.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                        No teams found for this org.
                      </TableCell>
                    </TableRow>
                  ) : (
                    teams.map((team) => (
                      <TableRow key={team.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{team.name}</p>
                            <p className="text-xs text-muted-foreground">{team.id}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {team.leadUserId || 'Unassigned'}
                        </TableCell>
                        <TableCell>{team.members}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </OpsSurface>
        </TabsContent>

        <TabsContent value="members">
          <OpsSurface title="Members and Org Roles" description="A clean view of who is in the workspace and how they are assigned.">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Org Role</TableHead>
                    <TableHead>Teams</TableHead>
                    <TableHead>Access Window</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <div className="h-12 animate-pulse rounded-xl bg-muted/50" />
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                        No users found for this org.
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.userId}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{user.displayName || 'Unnamed user'}</p>
                            <p className="text-xs text-muted-foreground">{user.userId}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <OpsPill tone={user.role === 'orgAdmin' || user.role === 'owner' ? 'success' : 'neutral'}>
                            {user.role}
                          </OpsPill>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.departments.length > 0
                            ? user.departments
                                .map((department) => teamNameById.get(department.departmentId) || department.departmentId)
                                .join(', ')
                            : 'No team assignments'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.expiresAt ? formatOpsDate(user.expiresAt, { withTime: true }) : 'No expiry'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </OpsSurface>
        </TabsContent>

        <TabsContent value="roles">
          <OpsSurface title="Role Coverage" description="Role definitions are shown here in a compact, human-readable format instead of raw policy blobs.">
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-40 animate-pulse rounded-2xl bg-muted/50" />
                ))}
              </div>
            ) : roles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 bg-background/70 p-6 text-sm text-muted-foreground">
                No roles found for this organization.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {roles.map((role) => (
                  <div
                    key={role.key}
                    className="rounded-2xl border border-border/50 bg-background/70 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{role.name}</p>
                        <p className="text-xs text-muted-foreground">{role.key}</p>
                      </div>
                      <OpsPill tone={role.is_system ? 'neutral' : 'warning'}>
                        {role.is_system ? 'System' : 'Custom'}
                      </OpsPill>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <ShieldCheck className="h-4 w-4" />
                      <span>{getRolePermissionCount(role)} enabled permissions</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {Object.entries(role.permissions || {})
                        .filter(([, value]) => value === true || value === 'admin' || value === 'regular')
                        .slice(0, 6)
                        .map(([key]) => (
                          <OpsPill key={key}>{key}</OpsPill>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </OpsSurface>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link href="/ops/orgs">
            <Users className="mr-2 h-4 w-4" />
            Back to Organizations
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/ops/orgs/${orgId}/settings`}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Manage Settings
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/ops/orgs/new">
            <UsersRound className="mr-2 h-4 w-4" />
            Create Another Org
          </Link>
        </Button>
      </div>
    </div>
  );
}
