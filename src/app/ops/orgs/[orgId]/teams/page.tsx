"use client";

import * as React from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, RefreshCw, Save, UsersRound } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OpsMetricCard, OpsPageHeader, OpsPill, OpsSurface } from '@/components/ops/ops-primitives';
import { OpsOrgSubnav } from '@/components/ops/ops-org-subnav';
import { useToast } from '@/hooks/use-toast';
import {
  assignOpsOrgTeamLead,
  createOpsOrgTeam,
  getOpsOrganization,
  listOpsOrgTeams,
  listOpsOrgUsers,
  type OpsOrgDetail,
  type OpsOrgTeam,
  type OpsOrgUser,
} from '@/lib/ops-api';

export default function OpsOrganizationTeamsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId || '';
  const { toast } = useToast();

  const [detail, setDetail] = React.useState<OpsOrgDetail | null>(null);
  const [teams, setTeams] = React.useState<OpsOrgTeam[]>([]);
  const [users, setUsers] = React.useState<OpsOrgUser[]>([]);
  const [leadDrafts, setLeadDrafts] = React.useState<Record<string, string>>({});
  const [createForm, setCreateForm] = React.useState({ name: '', leadEmail: '' });
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [savingLeadFor, setSavingLeadFor] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [detailResponse, teamsResponse, usersResponse] = await Promise.all([
        getOpsOrganization(orgId),
        listOpsOrgTeams(orgId),
        listOpsOrgUsers(orgId),
      ]);
      setDetail(detailResponse);
      setTeams(Array.isArray(teamsResponse) ? teamsResponse : []);
      setUsers(Array.isArray(usersResponse) ? usersResponse : []);
      setLeadDrafts(
        Object.fromEntries(
          (Array.isArray(teamsResponse) ? teamsResponse : []).map((team) => [
            team.id,
            team.leadUserId || '',
          ])
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load teams');
      setDetail(null);
      setTeams([]);
      setUsers([]);
      setLeadDrafts({});
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const userNameById = React.useMemo(() => {
    return new Map(
      users.map((user) => [user.userId, user.displayName || user.userId])
    );
  }, [users]);

  const leadlessCount = React.useMemo(() => {
    return teams.filter((team) => !team.leadUserId).length;
  }, [teams]);

  const totalMembers = React.useMemo(() => {
    return teams.reduce((sum, team) => sum + Number(team.members || 0), 0);
  }, [teams]);

  const onCreateTeam = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId) return;
    setCreating(true);
    try {
      await createOpsOrgTeam(orgId, {
        name: createForm.name.trim(),
        leadEmail: createForm.leadEmail.trim() || undefined,
      });
      setCreateForm({ name: '', leadEmail: '' });
      toast({
        title: 'Team created',
        description: 'The team was added to the workspace structure.',
      });
      await load();
    } catch (err) {
      toast({
        title: 'Unable to create team',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const onAssignLead = async (deptId: string) => {
    if (!orgId || !leadDrafts[deptId]) return;
    setSavingLeadFor(deptId);
    try {
      await assignOpsOrgTeamLead(orgId, deptId, leadDrafts[deptId]);
      toast({
        title: 'Lead assigned',
        description: 'Team lead membership has been repaired or updated.',
      });
      await load();
    } catch (err) {
      toast({
        title: 'Unable to assign lead',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingLeadFor(null);
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
        title={detail?.orgName ? `${detail.orgName} Teams` : 'Teams and Leads'}
        description="This page is for workspace structure repair: create teams, spot missing leads, and keep department ownership explicit."
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
          <AlertTitle>Unable to load teams</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <OpsMetricCard label="Teams" value={loading ? '...' : teams.length} hint="Current workspace structure" />
        <OpsMetricCard
          label="Without Leads"
          value={loading ? '...' : leadlessCount}
          hint="Departments needing ownership"
          tone={leadlessCount > 0 ? 'warning' : 'success'}
        />
        <OpsMetricCard label="Member Seats" value={loading ? '...' : totalMembers} hint="Team memberships across all departments" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <OpsSurface title="Create Team" description="Create a clean department entry and optionally seed a lead by email.">
          <form className="space-y-4" onSubmit={onCreateTeam}>
            <div className="space-y-2">
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Legal, Finance, Sales Ops"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead-email">Lead Email</Label>
              <Input
                id="lead-email"
                type="email"
                value={createForm.leadEmail}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, leadEmail: event.target.value }))
                }
                placeholder="Optional: lead@example.com"
              />
            </div>

            <Button type="submit" disabled={creating || !createForm.name.trim()}>
              <UsersRound className="mr-2 h-4 w-4" />
              {creating ? 'Creating...' : 'Create Team'}
            </Button>
          </form>
        </OpsSurface>

        <OpsSurface title="Structure Signals" description="A small operational read on whether the team setup is usable yet.">
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
              <div className="flex items-start gap-3">
                {leadlessCount > 0 ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                ) : (
                  <OpsPill tone="success">Healthy</OpsPill>
                )}
                <div>
                  <p className="font-medium text-foreground">Lead coverage</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {leadlessCount > 0
                      ? `${leadlessCount} teams do not currently have an assigned lead.`
                      : 'Every current team has an assigned lead.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
              <p className="font-medium text-foreground">Core team check</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {teams.some((team) => team.name === 'Core')
                  ? 'Core team exists, which keeps the default admin structure predictable.'
                  : 'Core team is missing. That is usually the first department we want in place.'}
              </p>
            </div>

            <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
              <p className="font-medium text-foreground">Ops note</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Team creation is intentionally simple in v1. We are optimizing for reliable org structure first, not fancy re-org flows.
              </p>
            </div>
          </div>
        </OpsSurface>
      </div>

      <OpsSurface title="Teams and Lead Assignment" description="Repair a team lead in-place without needing to leave the ops console.">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Current Lead</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Assign Lead</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={5}>
                      <div className="h-12 animate-pulse rounded-xl bg-muted/50" />
                    </TableCell>
                  </TableRow>
                ))
              ) : teams.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    No teams found for this org yet.
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
                    <TableCell>
                      {team.leadUserId ? (
                        <div>
                          <p className="font-medium text-foreground">
                            {userNameById.get(team.leadUserId) || team.leadUserId}
                          </p>
                          <p className="text-xs text-muted-foreground">{team.leadUserId}</p>
                        </div>
                      ) : (
                        <OpsPill tone="warning">Unassigned</OpsPill>
                      )}
                    </TableCell>
                    <TableCell>{team.members}</TableCell>
                    <TableCell className="min-w-[260px]">
                      <Select
                        value={leadDrafts[team.id] || '__empty__'}
                        onValueChange={(value) =>
                          setLeadDrafts((current) => ({
                            ...current,
                            [team.id]: value === '__empty__' ? '' : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a member" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty__">No selection</SelectItem>
                          {users.map((user) => (
                            <SelectItem key={user.userId} value={user.userId}>
                              {user.displayName || user.userId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!leadDrafts[team.id] || savingLeadFor === team.id}
                        onClick={() => void onAssignLead(team.id)}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        {savingLeadFor === team.id ? 'Saving...' : 'Assign'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </OpsSurface>
    </div>
  );
}
