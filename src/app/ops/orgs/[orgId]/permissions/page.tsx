"use client";

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Eye, RefreshCw, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { OpsOrgSubnav } from '@/components/ops/ops-org-subnav';
import { OpsMetricCard, OpsPageHeader, OpsPill, OpsSurface } from '@/components/ops/ops-primitives';
import { useToast } from '@/hooks/use-toast';
import {
  getOpsEffectivePermissions,
  getOpsOrganization,
  getOpsRbacState,
  listOpsAccessOverrides,
  listOpsOrgRoles,
  listOpsOrgUsers,
  updateOpsOrgRole,
  updateOpsRbacState,
  type OpsAccessOverride,
  type OpsEffectivePermissions,
  type OpsOrgDetail,
  type OpsOrgUser,
  type OpsRbacState,
  type OpsRole,
} from '@/lib/ops-api';
import { OPS_EDITABLE_PERMISSION_KEYS, OPS_PERMISSION_GROUPS } from '@/lib/ops-permission-groups';

function getRoleDraft(role: OpsRole | null) {
  return Object.fromEntries(
    OPS_EDITABLE_PERMISSION_KEYS.map((key) => [key, role?.permissions?.[key] === true])
  ) as Record<string, boolean>;
}

export default function OpsOrganizationPermissionsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId || '';
  const { toast } = useToast();

  const [detail, setDetail] = React.useState<OpsOrgDetail | null>(null);
  const [roles, setRoles] = React.useState<OpsRole[]>([]);
  const [users, setUsers] = React.useState<OpsOrgUser[]>([]);
  const [overrides, setOverrides] = React.useState<OpsAccessOverride[]>([]);
  const [rbacState, setRbacState] = React.useState<OpsRbacState | null>(null);
  const [selectedRoleKey, setSelectedRoleKey] = React.useState<string>('');
  const [roleDraft, setRoleDraft] = React.useState<Record<string, boolean>>({});
  const [roleSnapshot, setRoleSnapshot] = React.useState<string>('');
  const [effectiveUserId, setEffectiveUserId] = React.useState('__none__');
  const [effectiveAccess, setEffectiveAccess] = React.useState<OpsEffectivePermissions | null>(null);
  const [loadingEffective, setLoadingEffective] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [savingRole, setSavingRole] = React.useState(false);
  const [savingRbac, setSavingRbac] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [detailResponse, rolesResponse, usersResponse, overridesResponse, rbacResponse] =
        await Promise.all([
          getOpsOrganization(orgId),
          listOpsOrgRoles(orgId),
          listOpsOrgUsers(orgId),
          listOpsAccessOverrides(orgId),
          getOpsRbacState(orgId),
        ]);
      const nextRoles = Array.isArray(rolesResponse) ? rolesResponse : [];
      setDetail(detailResponse);
      setRoles(nextRoles);
      setUsers(Array.isArray(usersResponse) ? usersResponse : []);
      setOverrides(Array.isArray(overridesResponse) ? overridesResponse : []);
      setRbacState(rbacResponse);
      setSelectedRoleKey((current) => {
        if (current && nextRoles.some((role) => role.key === current)) return current;
        if (nextRoles.some((role) => role.key === 'orgAdmin')) return 'orgAdmin';
        return nextRoles[0]?.key || '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load permissions');
      setDetail(null);
      setRoles([]);
      setUsers([]);
      setOverrides([]);
      setRbacState(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selectedRole = React.useMemo(() => {
    return roles.find((role) => role.key === selectedRoleKey) || null;
  }, [roles, selectedRoleKey]);

  React.useEffect(() => {
    const draft = getRoleDraft(selectedRole);
    setRoleDraft(draft);
    setRoleSnapshot(JSON.stringify(draft));
  }, [selectedRole]);

  const roleDirty = JSON.stringify(roleDraft) !== roleSnapshot;

  const userNameById = React.useMemo(() => {
    return new Map(users.map((user) => [user.userId, user.displayName || user.userId]));
  }, [users]);

  const enabledCount = React.useMemo(() => {
    return Object.values(roleDraft).filter(Boolean).length;
  }, [roleDraft]);

  const loadEffectiveAccess = React.useCallback(async () => {
    if (!orgId || effectiveUserId === '__none__') return;
    setLoadingEffective(true);
    try {
      const payload = await getOpsEffectivePermissions(orgId, effectiveUserId);
      setEffectiveAccess(payload);
    } catch (err) {
      toast({
        title: 'Unable to load effective access',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
      setEffectiveAccess(null);
    } finally {
      setLoadingEffective(false);
    }
  }, [effectiveUserId, orgId, toast]);

  const onSaveRole = async () => {
    if (!orgId || !selectedRole) return;
    setSavingRole(true);
    try {
      const updated = await updateOpsOrgRole(orgId, selectedRole.key, {
        permissions: roleDraft,
      });
      setRoles((current) =>
        current.map((role) => (role.key === updated.key ? updated : role))
      );
      const nextDraft = getRoleDraft(updated);
      setRoleDraft(nextDraft);
      setRoleSnapshot(JSON.stringify(nextDraft));
      toast({
        title: 'Role updated',
        description: `${updated.name} permissions were saved.`,
      });
    } catch (err) {
      toast({
        title: 'Unable to save role',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingRole(false);
    }
  };

  const onSaveRbacMode = async (value: OpsRbacState['rbac_mode']) => {
    if (!orgId || !rbacState || value === rbacState.rbac_mode) return;
    setSavingRbac(true);
    try {
      const saved = await updateOpsRbacState(orgId, { rbac_mode: value });
      setRbacState(saved);
      toast({
        title: 'RBAC mode updated',
        description: `Workspace RBAC mode is now ${saved.rbac_mode}.`,
      });
    } catch (err) {
      toast({
        title: 'Unable to update RBAC mode',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingRbac(false);
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
        title={detail?.orgName ? `${detail.orgName} Permissions` : 'Permissions and Roles'}
        description="This is the new scratch-built permissions surface for ops: curated role editing, RBAC posture, and effective access checks."
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
          <AlertTitle>Unable to load permissions</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <OpsMetricCard label="Roles" value={loading ? '...' : roles.length} hint="Defined role profiles in this org" />
        <OpsMetricCard label="Overrides" value={loading ? '...' : overrides.length} hint="Direct user access overrides" tone={overrides.length > 0 ? 'warning' : 'default'} />
        <OpsMetricCard
          label="RBAC Mode"
          value={loading ? '...' : rbacState?.rbac_mode || 'legacy'}
          hint={rbacState?.rbac_migration_status || 'No migration metadata'}
          tone={rbacState?.rbac_mode === 'ideal' ? 'success' : 'default'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <OpsSurface
          title="Role Editor"
          description="Edit the core permission set for one role at a time. This page intentionally focuses on the permissions that matter most operationally."
          actions={
            <Button onClick={onSaveRole} disabled={!selectedRole || !roleDirty || savingRole}>
              <Save className="mr-2 h-4 w-4" />
              {savingRole ? 'Saving...' : 'Save Role'}
            </Button>
          }
        >
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          ) : selectedRole ? (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => setSelectedRoleKey(role.key)}
                    className={
                      role.key === selectedRoleKey
                        ? 'rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-foreground'
                        : 'rounded-full border border-border/60 bg-background/60 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground'
                    }
                  >
                    {role.name}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="font-medium text-foreground">{selectedRole.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedRole.key}</p>
                  </div>
                  <OpsPill tone={selectedRole.is_system ? 'neutral' : 'warning'}>
                    {selectedRole.is_system ? 'System role' : 'Custom role'}
                  </OpsPill>
                  <OpsPill tone={roleDirty ? 'warning' : 'success'}>
                    {roleDirty ? 'Unsaved changes' : `${enabledCount} enabled`}
                  </OpsPill>
                </div>
              </div>

              {OPS_PERMISSION_GROUPS.map((group) => (
                <div key={group.title} className="space-y-4 rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div>
                    <p className="font-medium text-foreground">{group.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {group.description}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {group.permissions.map((permission) => (
                      <div
                        key={permission.key}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-border/40 bg-background/70 p-4"
                      >
                        <div>
                          <p className="font-medium text-foreground">{permission.label}</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {permission.description}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{permission.key}</p>
                        </div>
                        <Switch
                          checked={Boolean(roleDraft[permission.key])}
                          onCheckedChange={(value) =>
                            setRoleDraft((current) => ({
                              ...current,
                              [permission.key]: Boolean(value),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 p-6 text-sm text-muted-foreground">
              No roles were returned for this organization.
            </div>
          )}
        </OpsSurface>

        <div className="space-y-6">
          <OpsSurface title="RBAC Posture" description="Keep an explicit view of whether the workspace is still in legacy mode or on a newer RBAC path.">
            {loading || !rbacState ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted/50" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>RBAC Mode</Label>
                  <Select
                    value={rbacState.rbac_mode}
                    onValueChange={(value) =>
                      void onSaveRbacMode(value as OpsRbacState['rbac_mode'])
                    }
                    disabled={savingRbac}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select RBAC mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="legacy">legacy</SelectItem>
                      <SelectItem value="shadow">shadow</SelectItem>
                      <SelectItem value="ideal">ideal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-2xl border border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
                  <p>Migration status: {rbacState.rbac_migration_status || 'not_started'}</p>
                  <p className="mt-2">
                    Version: {rbacState.rbac_migration_version || 'none'}
                  </p>
                  <p className="mt-2">
                    Last migrated: {rbacState.rbac_last_migrated_at || 'never'}
                  </p>
                </div>
              </div>
            )}
          </OpsSurface>

          <OpsSurface title="Effective Access Viewer" description="Answer the support question: what access does this user actually have right now?">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>User</Label>
                <Select value={effectiveUserId} onValueChange={setEffectiveUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a member" />
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

              <Button
                variant="outline"
                onClick={() => void loadEffectiveAccess()}
                disabled={effectiveUserId === '__none__' || loadingEffective}
              >
                <Eye className="mr-2 h-4 w-4" />
                {loadingEffective ? 'Inspecting...' : 'Inspect Access'}
              </Button>

              {effectiveAccess ? (
                <div className="space-y-4 rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <OpsPill tone="success">{effectiveAccess.role || 'No role'}</OpsPill>
                    <OpsPill tone={Object.keys(effectiveAccess.orgOverride || {}).length > 0 ? 'warning' : 'neutral'}>
                      {Object.keys(effectiveAccess.orgOverride || {}).length} override keys
                    </OpsPill>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">
                      {userNameById.get(effectiveUserId) || effectiveUserId}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(effectiveAccess.effective || {})
                        .filter(([, enabled]) => enabled)
                        .map(([key]) => (
                          <OpsPill key={key}>{key}</OpsPill>
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
                  Pick a user and inspect their role plus org-level overrides.
                </div>
              )}
            </div>
          </OpsSurface>

          <OpsSurface title="Direct Overrides" description="Overrides should stay rare. This surface helps ops see when exceptions are piling up.">
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted/50" />
                ))}
              </div>
            ) : overrides.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
                No direct access overrides were returned for this organization.
              </div>
            ) : (
              <div className="space-y-3">
                {overrides.slice(0, 6).map((override, index) => (
                  <div
                    key={`${override.user_id}_${override.department_id || 'org'}_${index}`}
                    className="rounded-2xl border border-border/50 bg-background/60 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {userNameById.get(override.user_id) || override.user_id}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Scope: {override.department_id ? override.department_id : 'Org-wide'}
                        </p>
                      </div>
                      <OpsPill tone="warning">
                        {Object.keys(override.permissions || {}).length} keys
                      </OpsPill>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </OpsSurface>
        </div>
      </div>
    </div>
  );
}
