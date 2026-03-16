"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useSecurity } from '@/hooks/use-security';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatAppDateTime, cn } from '@/lib/utils';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { Globe, Key, Loader2, Minus, Plus, RefreshCw, Shield, ShieldAlert, Trash2 } from 'lucide-react';
import { ViewAccessDenied } from '@/components/access-denied';

function Section({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-border/40 bg-card/40 overflow-hidden shadow-sm', className)}>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border/30 bg-muted/20">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/40">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div>
          <span className="text-[13px] font-semibold text-foreground tracking-tight">{title}</span>
          {description ? (
            <p className="text-[12px] text-muted-foreground leading-none mt-0.5">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

type BypassGrant = {
  id: string;
  org_id: string;
  user_id: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  granted_by: string | null;
  note?: string | null;
};

type OrgUser = {
  userId: string;
  displayName?: string;
  email?: string;
};

export default function SecuritySettingsPage() {
  const { hasPermission, isLoading: authLoading } = useAuth();
  const { policy, loading, updateAllowlist, addIp, removeIp } = useSecurity();

  const canManageAllowlist = hasPermission('org.update_settings');
  const canManageBypassGrants = hasPermission('org.manage_members');
  const canViewPage = canManageAllowlist || canManageBypassGrants;

  const [newIp, setNewIp] = React.useState('');
  const [actionLoading, setActionLoading] = React.useState(false);
  const [orgId, setOrgId] = React.useState<string>(getApiContext().orgId || '');

  const [users, setUsers] = React.useState<OrgUser[]>([]);
  const [userMap, setUserMap] = React.useState<Record<string, { name: string; email: string }>>({});

  const [grantsLoading, setGrantsLoading] = React.useState(false);
  const [grantsRefreshing, setGrantsRefreshing] = React.useState(false);
  const [grantsError, setGrantsError] = React.useState('');
  const [includeInactiveGrants, setIncludeInactiveGrants] = React.useState(false);
  const [grants, setGrants] = React.useState<BypassGrant[]>([]);
  const [revokeLoadingId, setRevokeLoadingId] = React.useState<string | null>(null);

  const [grantDialogOpen, setGrantDialogOpen] = React.useState(false);
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
  const [grantHours, setGrantHours] = React.useState(24);
  const [grantSubmitting, setGrantSubmitting] = React.useState(false);
  const [grantError, setGrantError] = React.useState('');

  React.useEffect(() => {
    const off = onApiContextChange(({ orgId: nextOrgId }) => {
      setOrgId(nextOrgId || '');
    });
    return () => {
      off();
    };
  }, []);

  const loadUsers = React.useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await apiFetch<any[]>(`/orgs/${orgId}/users`);
      const nextUsers: OrgUser[] = Array.isArray(data)
        ? data
            .map((u: any) => ({
              userId: String(u.userId || ''),
              displayName: u.displayName || u.app_users?.display_name || '',
              email: u.email || u.app_users?.email || '',
            }))
            .filter((u) => u.userId)
        : [];

      const nextMap: Record<string, { name: string; email: string }> = {};
      for (const user of nextUsers) {
        nextMap[user.userId] = {
          name: user.displayName || user.email || user.userId,
          email: user.email || '',
        };
      }

      setUsers(nextUsers);
      setUserMap(nextMap);
    } catch {
      // silent
    }
  }, [orgId]);

  const loadGrants = React.useCallback(async () => {
    if (!orgId) return;
    setGrantsLoading(true);
    setGrantsError('');
    try {
      const params = new URLSearchParams();
      if (!includeInactiveGrants) params.set('active', 'true');
      const data = await apiFetch<any[]>(`/orgs/${orgId}/ip-bypass-grants?${params.toString()}`);
      setGrants(Array.isArray(data) ? (data as BypassGrant[]) : []);
    } catch {
      setGrantsError('Unable to load IP bypass grants.');
    } finally {
      setGrantsLoading(false);
    }
  }, [includeInactiveGrants, orgId]);

  React.useEffect(() => {
    if (!canManageBypassGrants) return;
    void loadUsers();
    void loadGrants();
  }, [canManageBypassGrants, loadGrants, loadUsers]);

  const refreshGrants = React.useCallback(async () => {
    setGrantsRefreshing(true);
    try {
      await Promise.all([loadUsers(), loadGrants()]);
    } finally {
      setGrantsRefreshing(false);
    }
  }, [loadGrants, loadUsers]);

  const activeGrants = React.useMemo(() => {
    const now = Date.now();
    return grants.filter((grant) => !grant.revoked_at && (!grant.expires_at || new Date(grant.expires_at).getTime() > now));
  }, [grants]);

  const activeGrantUserIds = React.useMemo(() => new Set(activeGrants.map((grant) => grant.user_id)), [activeGrants]);

  const availableUsers = React.useMemo(() => {
    return users
      .filter((user) => !activeGrantUserIds.has(user.userId))
      .sort((a, b) => {
        const labelA = (a.displayName || a.email || a.userId).toLowerCase();
        const labelB = (b.displayName || b.email || b.userId).toLowerCase();
        return labelA.localeCompare(labelB);
      });
  }, [activeGrantUserIds, users]);

  React.useEffect(() => {
    if (!grantDialogOpen) return;
    setSelectedUserIds((prev) => prev.filter((userId) => !activeGrantUserIds.has(userId)));
  }, [activeGrantUserIds, grantDialogOpen]);

  const handleAddIp = async () => {
    if (!newIp || !canManageAllowlist) return;
    setActionLoading(true);
    try {
      await addIp(newIp);
      setNewIp('');
    } finally {
      setActionLoading(false);
    }
  };

  const revokeGrant = React.useCallback(
    async (grantId: string) => {
      if (!orgId) return;
      setRevokeLoadingId(grantId);
      try {
        await apiFetch(`/orgs/${orgId}/ip-bypass-grants/${grantId}/revoke`, { method: 'POST' });
        await loadGrants();
      } finally {
        setRevokeLoadingId(null);
      }
    },
    [loadGrants, orgId]
  );

  const openGrantDialog = React.useCallback(() => {
    setSelectedUserIds([]);
    setGrantHours(24);
    setGrantError('');
    setGrantDialogOpen(true);
  }, []);

  const toggleSelectedUser = React.useCallback((userId: string, checked: boolean) => {
    setSelectedUserIds((prev) => {
      if (checked) {
        if (prev.includes(userId)) return prev;
        return [...prev, userId];
      }
      return prev.filter((id) => id !== userId);
    });
  }, []);

  const submitGrantBypass = React.useCallback(async () => {
    if (!orgId || selectedUserIds.length === 0) return;
    setGrantSubmitting(true);
    setGrantError('');
    try {
      await Promise.all(
        selectedUserIds.map((userId) =>
          apiFetch(`/orgs/${orgId}/ip-bypass-grants`, {
            method: 'POST',
            body: {
              userId,
              durationMinutes: grantHours * 60,
              note: `Security settings grant (${grantHours}h)`,
            },
          })
        )
      );
      setGrantDialogOpen(false);
      setSelectedUserIds([]);
      await Promise.all([loadUsers(), loadGrants()]);
    } catch (error: any) {
      setGrantError(error?.message || 'Unable to grant bypass.');
    } finally {
      setGrantSubmitting(false);
    }
  }, [grantHours, loadGrants, loadUsers, orgId, selectedUserIds]);

  if (!authLoading && !canViewPage) {
    return <ViewAccessDenied />;
  }

  const activeUserCount = new Set(activeGrants.map((grant) => grant.user_id)).size;
  const nextExpiry = activeGrants
    .filter((grant) => grant.expires_at)
    .map((grant) => new Date(grant.expires_at).getTime())
    .sort((a, b) => a - b)[0];

  return (
    <div className="min-h-screen bg-background/30">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="px-8 py-4">
          <h1 className="text-base font-semibold text-foreground tracking-tight">Security</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Manage network access, IP allowlists, and workspace security protocols
          </p>
        </div>
      </header>

      <div className="p-6 space-y-6 max-w-5xl">
        <div
          className={cn(
            'rounded-xl border p-6 flex items-center justify-between gap-6 transition-all',
            policy.enabled ? 'bg-primary/5 border-primary/20 shadow-sm shadow-primary/5' : 'bg-muted/30 border-border/40'
          )}
        >
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'h-10 w-10 shrink-0 flex items-center justify-center rounded-xl transition-colors',
                policy.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-foreground tracking-tight">IP Allowlist Enforcement</h3>
              <p className="text-[13px] text-muted-foreground mt-0.5 max-w-md">
                When enabled, only users connecting from approved IP addresses will be granted access to the workspace.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            <Switch
              disabled={loading || !canManageAllowlist}
              checked={policy.enabled}
              onCheckedChange={(checked) => updateAllowlist({ enforced: checked })}
            />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-5">
          <Section
            icon={Globe}
            title="Authorized IP Addresses"
            description="Approve specific IP addresses or ranges"
            className="md:col-span-3"
          >
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  className="h-9 text-[13px] bg-background/40 border-border/30 focus:border-primary/40 focus:ring-primary/10"
                  placeholder="e.g. 192.168.1.1"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddIp()}
                />
                <Button
                  size="sm"
                  className="h-9 px-4 font-medium"
                  onClick={handleAddIp}
                  disabled={actionLoading || !newIp || !canManageAllowlist}
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Add IP
                </Button>
              </div>

              <div className="space-y-1 mt-4">
                {policy.ips.length > 0 ? (
                  policy.ips.map((ip) => (
                    <div
                      key={ip}
                      className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 border border-border/10 group hover:border-border/30 transition-colors"
                    >
                      <span className="text-[13px] font-mono text-foreground">{ip}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                        onClick={() => removeIp(ip)}
                        disabled={!canManageAllowlist}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 bg-muted/10 rounded-lg border border-dashed border-border/40">
                    <Globe className="h-8 w-8 mx-auto mb-2 text-muted-foreground/20" />
                    <p className="text-[12px] text-muted-foreground">No IP addresses added yet</p>
                  </div>
                )}
              </div>
            </div>
          </Section>

          {canManageBypassGrants ? (
            <Section
              icon={Key}
              title="Grant IP Bypass"
              description="Grant selected users temporary bypass access"
              className="md:col-span-2"
            >
              <div className="space-y-4">
                <div className="p-3.5 rounded-lg bg-muted/20 border border-border/10">
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    Select one or more users who do not currently have an active bypass grant. New grants default to 24 hours and can be adjusted before you submit.
                  </p>
                </div>
                <div className="rounded-lg border border-border/30 bg-background/40 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Users without active bypass</div>
                  <div className="mt-2 text-[18px] font-semibold">{availableUsers.length}</div>
                </div>
                <Button
                  className="w-full h-9 text-[12px] font-medium"
                  onClick={openGrantDialog}
                  disabled={grantsLoading || availableUsers.length === 0}
                >
                  <Key className="h-3.5 w-3.5 mr-1.5" />
                  Grant Bypass
                </Button>
                {availableUsers.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground">
                    Everyone currently eligible already has an active bypass grant.
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}

          {canManageBypassGrants ? (
            <Section
              icon={ShieldAlert}
              title="Active IP Bypass Grants"
              description="Track time-limited bypass access across the org"
              className="md:col-span-5"
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Active users</div>
                    <div className="text-[18px] font-semibold mt-1">{activeUserCount}</div>
                  </div>
                  <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Active grants</div>
                    <div className="text-[18px] font-semibold mt-1">{activeGrants.length}</div>
                  </div>
                  <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Next expiry</div>
                    <div className="text-[12px] font-mono mt-2">
                      {nextExpiry ? formatAppDateTime(new Date(nextExpiry).toISOString()) : '—'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[11px] text-muted-foreground">
                    This list shows time-limited bypass grants only. Use revoke to remove access early.
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Switch checked={includeInactiveGrants} onCheckedChange={(v) => setIncludeInactiveGrants(!!v)} />
                      Show inactive
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-[12px]"
                      onClick={refreshGrants}
                      disabled={grantsRefreshing}
                    >
                      {grantsRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                      Refresh
                    </Button>
                  </div>
                </div>

                {grantsLoading ? (
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading grants…
                  </div>
                ) : grantsError ? (
                  <div className="text-[12px] text-destructive">{grantsError}</div>
                ) : grants.length === 0 ? (
                  <div className="text-center py-8 bg-muted/10 rounded-lg border border-dashed border-border/40">
                    <ShieldAlert className="h-8 w-8 mx-auto mb-2 text-muted-foreground/20" />
                    <p className="text-[12px] text-muted-foreground">No IP bypass grants found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {grants.map((grant) => {
                      const now = Date.now();
                      const isRevoked = !!grant.revoked_at;
                      const isExpired = grant.expires_at ? new Date(grant.expires_at).getTime() <= now : false;
                      const status = isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Active';
                      const statusClass = isRevoked
                        ? 'text-destructive/80'
                        : isExpired
                          ? 'text-muted-foreground'
                          : 'text-emerald-600';
                      const user = userMap[grant.user_id];
                      const displayName = user?.name || user?.email || grant.user_id;

                      return (
                        <div
                          key={grant.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/30 bg-background/40 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold truncate">{displayName}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {user?.email ? user.email : grant.user_id}
                            </div>
                          </div>
                          <div className="text-[11px] text-muted-foreground min-w-[180px] text-right">
                            <div className="font-mono">Expires {grant.expires_at ? formatAppDateTime(grant.expires_at) : '—'}</div>
                            <div className={cn('text-[10px] uppercase tracking-widest mt-1', statusClass)}>{status}</div>
                          </div>
                          {!isRevoked && !isExpired ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => revokeGrant(grant.id)}
                              disabled={revokeLoadingId === grant.id}
                            >
                              {revokeLoadingId === grant.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Revoke'}
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Section>
          ) : null}
        </div>
      </div>

      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Grant IP Bypass</DialogTitle>
            <DialogDescription>
              Select one or more users without an active grant, then choose how long the bypass should remain active.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Duration</div>
                <div className="mt-1 text-[22px] font-semibold">{grantHours}h</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setGrantHours((current) => Math.max(1, current - 1))}
                  disabled={grantSubmitting || grantHours <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setGrantHours((current) => Math.min(24 * 14, current + 1))}
                  disabled={grantSubmitting || grantHours >= 24 * 14}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border/30">
              <div className="border-b border-border/30 px-4 py-3 text-[12px] font-semibold">
                Available users ({availableUsers.length})
              </div>
              <div className="max-h-[360px] overflow-y-auto p-2">
                {availableUsers.length === 0 ? (
                  <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                    No users are available for a new bypass grant right now.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {availableUsers.map((user) => {
                      const checked = selectedUserIds.includes(user.userId);
                      const label = user.displayName || user.email || user.userId;
                      return (
                        <label
                          key={user.userId}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors',
                            checked ? 'border-primary/40 bg-primary/5' : 'border-border/20 bg-background/40 hover:bg-muted/20'
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleSelectedUser(user.userId, value === true)}
                            disabled={grantSubmitting}
                          />
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium truncate">{label}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{user.email || user.userId}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {grantError ? <div className="text-[12px] text-destructive">{grantError}</div> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGrantDialogOpen(false)} disabled={grantSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={submitGrantBypass} disabled={grantSubmitting || selectedUserIds.length === 0}>
              {grantSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
              Grant {grantHours}h Bypass
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
