"use client";

import * as React from 'react';
import { useParams } from 'next/navigation';
import { KeyRound, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
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
  addOpsOrgAdmin,
  getOpsOrganization,
  inviteOpsOrgUser,
  listOpsOrgTeams,
  listOpsOrgUsers,
  updateOpsOrgUserPassword,
  type OpsOrgDetail,
  type OpsOrgTeam,
  type OpsOrgUser,
} from '@/lib/ops-api';
import { formatOpsDate } from '@/lib/utils';

const ROLE_OPTIONS = [
  'owner',
  'orgAdmin',
  'contentManager',
  'teamLead',
  'member',
  'contentViewer',
  'guest',
] as const;

export default function OpsOrganizationMembersPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId || '';
  const { toast } = useToast();

  const [detail, setDetail] = React.useState<OpsOrgDetail | null>(null);
  const [teams, setTeams] = React.useState<OpsOrgTeam[]>([]);
  const [users, setUsers] = React.useState<OpsOrgUser[]>([]);
  const [inviteForm, setInviteForm] = React.useState({
    email: '',
    role: 'member',
    departmentId: '__none__',
    deptRole: 'member',
    password: '',
  });
  const [passwordForm, setPasswordForm] = React.useState({
    userId: '__none__',
    password: '',
  });
  const [loading, setLoading] = React.useState(true);
  const [inviting, setInviting] = React.useState(false);
  const [resettingPassword, setResettingPassword] = React.useState(false);
  const [promotingUserId, setPromotingUserId] = React.useState<string | null>(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load members');
      setDetail(null);
      setTeams([]);
      setUsers([]);
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
    return users.filter((user) => user.role === 'owner' || user.role === 'orgAdmin').length;
  }, [users]);

  const expiringCount = React.useMemo(() => {
    const now = Date.now();
    const nextWeek = now + 7 * 24 * 60 * 60 * 1000;
    return users.filter((user) => {
      if (!user.expiresAt) return false;
      const expiry = new Date(user.expiresAt).getTime();
      return expiry >= now && expiry <= nextWeek;
    }).length;
  }, [users]);

  const onInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId) return;
    setInviting(true);
    try {
      await inviteOpsOrgUser(orgId, {
        email: inviteForm.email.trim(),
        role: inviteForm.role,
        departmentId:
          inviteForm.departmentId !== '__none__' ? inviteForm.departmentId : undefined,
        deptRole: inviteForm.deptRole === 'lead' ? 'lead' : 'member',
        password: inviteForm.password.trim() || undefined,
      });
      setInviteForm({
        email: '',
        role: 'member',
        departmentId: '__none__',
        deptRole: 'member',
        password: '',
      });
      toast({
        title: 'Member invited',
        description: 'The user was added to the client workspace.',
      });
      await load();
    } catch (err) {
      toast({
        title: 'Unable to invite member',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setInviting(false);
    }
  };

  const onResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || passwordForm.userId === '__none__') return;
    setResettingPassword(true);
    try {
      await updateOpsOrgUserPassword(orgId, passwordForm.userId, passwordForm.password);
      setPasswordForm({ userId: '__none__', password: '' });
      toast({
        title: 'Password updated',
        description: 'The member can use the new password immediately.',
      });
    } catch (err) {
      toast({
        title: 'Unable to reset password',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setResettingPassword(false);
    }
  };

  const onPromote = async (userId: string) => {
    if (!orgId) return;
    setPromotingUserId(userId);
    try {
      await addOpsOrgAdmin(orgId, userId);
      toast({
        title: 'Admin promoted',
        description: 'The member now has organization admin rights.',
      });
      await load();
    } catch (err) {
      toast({
        title: 'Unable to promote member',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPromotingUserId(null);
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
        title={detail?.orgName ? `${detail.orgName} Members` : 'Members and Access'}
        description="This is the ops-side membership console for invitations, admin promotion, and direct password support."
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
          <AlertTitle>Unable to load members</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <OpsMetricCard label="Members" value={loading ? '...' : users.length} hint="Org memberships" />
        <OpsMetricCard
          label="Admins"
          value={loading ? '...' : adminCount}
          hint="Owners and org admins"
          tone={adminCount > 0 ? 'success' : 'warning'}
        />
        <OpsMetricCard
          label="Expiring Soon"
          value={loading ? '...' : expiringCount}
          hint="Memberships ending within 7 days"
          tone={expiringCount > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <OpsSurface title="Invite or Add Member" description="Create a user, invite them, and place them directly into the workspace structure.">
          <form className="space-y-4" onSubmit={onInvite}>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteForm.email}
                onChange={(event) =>
                  setInviteForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="member@example.com"
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Org Role</Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(value) =>
                    setInviteForm((current) => ({ ...current, role: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Team</Label>
                <Select
                  value={inviteForm.departmentId}
                  onValueChange={(value) =>
                    setInviteForm((current) => ({ ...current, departmentId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No team assignment</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Team Role</Label>
                <Select
                  value={inviteForm.deptRole}
                  onValueChange={(value) =>
                    setInviteForm((current) => ({ ...current, deptRole: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-password">Temporary Password</Label>
                <Input
                  id="invite-password"
                  type="password"
                  value={inviteForm.password}
                  onChange={(event) =>
                    setInviteForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
            </div>

            <Button type="submit" disabled={inviting || !inviteForm.email.trim()}>
              <UserPlus className="mr-2 h-4 w-4" />
              {inviting ? 'Adding...' : 'Add Member'}
            </Button>
          </form>
        </OpsSurface>

        <OpsSurface title="Password Reset" description="Use this for support situations where a user needs immediate access recovery.">
          <form className="space-y-4" onSubmit={onResetPassword}>
            <div className="space-y-2">
              <Label>User</Label>
              <Select
                value={passwordForm.userId}
                onValueChange={(value) =>
                  setPasswordForm((current) => ({ ...current, userId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Choose a member</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.userId} value={user.userId}>
                      {user.displayName || user.userId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                minLength={6}
                value={passwordForm.password}
                onChange={(event) =>
                  setPasswordForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="At least 6 characters"
              />
            </div>

            <div className="rounded-2xl border border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
              This is an ops action and should be used for verified support requests only. Every reset is audited on the backend.
            </div>

            <Button
              type="submit"
              disabled={
                resettingPassword ||
                passwordForm.userId === '__none__' ||
                passwordForm.password.trim().length < 6
              }
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {resettingPassword ? 'Updating...' : 'Set Password'}
            </Button>
          </form>
        </OpsSurface>
      </div>

      <OpsSurface title="Workspace Members" description="Review role assignment, team membership, and fast-track admin promotion.">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Org Role</TableHead>
                <TableHead>Teams</TableHead>
                <TableHead>Access Window</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={5}>
                      <div className="h-12 animate-pulse rounded-xl bg-muted/50" />
                    </TableCell>
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    No users found for this org.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">
                          {user.displayName || 'Unnamed user'}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.userId}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <OpsPill
                        tone={
                          user.role === 'owner' || user.role === 'orgAdmin'
                            ? 'success'
                            : 'neutral'
                        }
                      >
                        {user.role}
                      </OpsPill>
                    </TableCell>
                    <TableCell className="min-w-[240px] text-sm text-muted-foreground">
                      {user.departments.length > 0
                        ? user.departments
                            .map((department) => {
                              const teamName =
                                teamNameById.get(department.departmentId) || department.departmentId;
                              return department.role === 'lead'
                                ? `${teamName} (lead)`
                                : teamName;
                            })
                            .join(', ')
                        : 'No team assignments'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.expiresAt
                        ? formatOpsDate(user.expiresAt, { withTime: true })
                        : 'No expiry'}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.role === 'owner' || user.role === 'orgAdmin' ? (
                        <OpsPill tone="success">Admin</OpsPill>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={promotingUserId === user.userId}
                          onClick={() => void onPromote(user.userId)}
                        >
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          {promotingUserId === user.userId ? 'Promoting...' : 'Make Admin'}
                        </Button>
                      )}
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
