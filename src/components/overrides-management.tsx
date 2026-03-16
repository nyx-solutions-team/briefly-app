"use client";
import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Check, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// User-friendly permission categories - hide technical details
const PERMISSION_CATEGORIES = [
  {
    title: 'Documents',
    description: 'What this user can do with documents',
    permissions: [
      {
        key: 'documents.read',
        label: 'View Documents',
        description: 'Can view and search documents',
        userFriendly: true
      },
      {
        key: 'documents.create',
        label: 'Upload Documents',
        description: 'Can upload new documents',
        userFriendly: true
      },
      {
        key: 'documents.update',
        label: 'Edit Documents',
        description: 'Can modify existing documents',
        userFriendly: true
      },
      {
        key: 'documents.delete',
        label: 'Delete Documents',
        description: 'Can remove documents',
        userFriendly: true
      }
    ]
  },
  {
    title: 'Organization',
    description: 'Administrative access',
    permissions: [
      {
        key: 'org.manage_members',
        label: 'Manage Users & Teams',
        description: 'Can manage user accounts and team membership',
        userFriendly: true
      },
      {
        key: 'departments.manage_members',
        label: 'Manage Team Members',
        description: 'Can add, remove, and manage users within their own teams',
        userFriendly: true
      }
    ]
  },
  {
    title: 'Security',
    description: 'Access control and security features',
    permissions: [
      {
        key: 'security.ip_bypass',
        label: 'Bypass IP Restrictions',
        description: 'Can access the organization from any IP address, bypassing IP allowlist restrictions',
        userFriendly: true
      }
    ]
  },
  {
    title: 'Advanced Features',
    description: 'Specialized capabilities',
    permissions: [
      {
        key: 'audit.read',
        label: 'View Activity Logs',
        description: 'Can see system activity and audit trail',
        userFriendly: true
      }
    ]
  }
];

// Technical permissions that should be hidden from end users but managed in backend
const HIDDEN_PERMISSIONS = [
  'org.update_settings',
  'documents.move',
  'documents.link',
  'documents.version.manage',
  'documents.bulk_delete',
  'storage.upload',
  'search.semantic'
];
const ORG_SCOPE = '__org__';

type Department = { id: string; name: string };
type OrgUser = { 
  userId: string; 
  displayName?: string | null; 
  email?: string | null; 
  role?: string; 
  departments?: Array<{ id: string; name: string; deptRole?: string }> 
};

function PermissionSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center gap-1">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export default function OverridesManagement() {
  const { refreshPermissions, hasPermission } = useAuth();
  const [users, setUsers] = React.useState<OrgUser[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [selectedUser, setSelectedUser] = React.useState<string>('');
  const [selectedDept, setSelectedDept] = React.useState<string>('');
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});
  const [pending, setPending] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(false);
  const [reloading, setReloading] = React.useState(false);
  const [usersLoading, setUsersLoading] = React.useState(false);
  const [deptsLoading, setDeptsLoading] = React.useState(false);
  const [effective, setEffective] = React.useState<Record<string, boolean>>({});
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [orgId, setOrgId] = React.useState<string>(getApiContext().orgId || '');
  React.useEffect(() => {
    const off = onApiContextChange(({ orgId }) => {
      setOrgId(orgId || '');
      // Clear selected user when switching organizations
      setSelectedUser('');
      setSelectedDept('');
      setOverrides({});
      setPending({});
      setEffective({});
      setDirty(false);
    });
    return () => { off(); };
  }, []);

  const refresh = React.useCallback(async () => {
    if (!orgId) return;
    setUsersLoading(true);
    setDeptsLoading(true);
    try {
      const u = await apiFetch<any[]>(`/orgs/${orgId}/users`);
      setUsers((u || []).map(r => ({ 
        userId: r.userId, 
        displayName: r.displayName || r.app_users?.display_name || '',
        email: r.email,
        role: r.role,
        departments: r.departments?.map((d: any) => ({ 
          id: d.id, 
          name: d.name, 
          deptRole: d.deptRole || d.role 
        })) || []
      })));
      const d = await apiFetch<any[]>(`/orgs/${orgId}/departments?includeMine=1`);
      // Filter out Core team for non-admin users
      const filteredDepartments = (d || []).filter((dept: any) => {
        if (dept.name === 'Core') {
          // Only show Core team to org admins
          return hasPermission('org.manage_members');
        }
        return true;
      });
      setDepartments(filteredDepartments.map((x:any) => ({ id: x.id, name: x.name })));
    } finally {
      setUsersLoading(false);
      setDeptsLoading(false);
    }
  }, [orgId, hasPermission]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  // When a user is selected, set default scope to their team if they have one
  React.useEffect(() => {
    if (selectedUser && users.length > 0) {
      const user = users.find(u => u.userId === selectedUser);
      if (user?.departments && user.departments.length > 0) {
        // Set to first team by default
        setSelectedDept(user.departments[0].id);
      } else {
        // No user teams, default to org-wide scope
        setSelectedDept(ORG_SCOPE);
      }
    }
  }, [selectedUser, users, departments]);

  const loadOverrides = React.useCallback(async () => {
    if (!selectedUser) { setOverrides({}); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('userId', selectedUser);
      if (selectedDept && selectedDept !== ORG_SCOPE) params.set('departmentId', selectedDept);
      const list = await apiFetch<any[]>(`/orgs/${orgId}/overrides?${params.toString()}`);
      const row = (list || [])[0];
      const base = row?.permissions || {};
      setOverrides(base);
      setPending(base);
      setDirty(false);
      // Also load effective permissions
      const eff = await apiFetch<any>(`/orgs/${orgId}/overrides/effective?${params.toString()}`);
      setEffective(eff?.effective || {});
    } finally { setLoading(false); }
  }, [orgId, selectedUser, selectedDept]);

  React.useEffect(() => { void loadOverrides(); }, [loadOverrides]);

  const onToggleLocal = (key: string, val: boolean) => {
    const next = { ...(pending || {}), [key]: val };
    setPending(next);
    setDirty(true);
  };

  const onReset = () => {
    setPending(overrides);
    setDirty(false);
  };

  const onSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await apiFetch(`/orgs/${orgId}/overrides`, {
        method: 'PUT',
        body: {
          userId: selectedUser,
          departmentId: selectedDept && selectedDept !== ORG_SCOPE ? selectedDept : null,
          permissions: pending,
        },
      });
      setOverrides(pending);
      setDirty(false);
      // Refresh effective after save
      await loadOverrides();
      // Refresh user permissions in the auth context so the UI updates immediately
      await refreshPermissions();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per‑User Overrides</CardTitle>
        <p className="text-sm text-muted-foreground">Override a person's role-based permissions for this organization or a specific department. When you check a permission here, it will override their role settings.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select value={selectedUser} onValueChange={v => setSelectedUser(v)} disabled={usersLoading}>
              <SelectTrigger className="w-full">
                {usersLoading ? (
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ) : (
                  <SelectValue placeholder="Select user" />
                )}
              </SelectTrigger>
              <SelectContent>
                {usersLoading ? (
                  <div className="p-2">
                    <Skeleton className="h-8 w-full mb-2" />
                    <Skeleton className="h-8 w-full mb-2" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (
                  users.map(u => (<SelectItem key={u.userId} value={u.userId}>{u.displayName || u.userId}</SelectItem>))
                )}
              </SelectContent>
            </Select>
            <Select value={selectedDept} onValueChange={v => setSelectedDept(v as any)} disabled={deptsLoading}>
              <SelectTrigger className="w-full">
                {deptsLoading ? (
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ) : (
                  <SelectValue placeholder="Scope" />
                )}
              </SelectTrigger>
              <SelectContent>
                {deptsLoading ? (
                  <div className="p-2">
                    <Skeleton className="h-8 w-full mb-2" />
                    <Skeleton className="h-8 w-full mb-2" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (
                  <>
                    <SelectItem value={ORG_SCOPE}>
                      <div className="flex items-center gap-2">
                        <span>Organization (All Teams)</span>
                      </div>
                    </SelectItem>
                    {departments.filter(d => {
                      // Only show departments where the user is a member
                      const selectedUserData = users.find(u => u.userId === selectedUser);
                      const userDeptMembership = selectedUserData?.departments?.find(dept => dept.id === d.id);
                      return !!userDeptMembership;
                    }).map(d => {
                      const selectedUserData = users.find(u => u.userId === selectedUser);
                      const userDeptMembership = selectedUserData?.departments?.find(dept => dept.id === d.id);
                      const deptRole = userDeptMembership?.deptRole;
                      
                      return (
                        <SelectItem key={d.id} value={d.id}>
                          <div className="flex items-center gap-2">
                            <span>{d.name === 'Core' ? 'Core (Admin Only)' : d.name}</span>
                            <div className="flex items-center gap-1">
                              <Badge variant={deptRole === 'lead' ? 'default' : 'secondary'} className="text-xs px-1.5 py-0.5">
                                {deptRole === 'lead' ? 'Lead' : 'Member'}
                              </Badge>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" disabled={reloading} onClick={async () => {
              setReloading(true);
              try {
                await refresh();
                await loadOverrides();
              } finally {
                setReloading(false);
              }
            }}>{reloading ? 'Reloading...' : 'Reload'}</Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-20" />
            </div>
            <div className="space-y-4">
              {PERMISSION_CATEGORIES.map(category => (
                <div key={category.title}>
                  <div className="mb-3">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {category.permissions.filter(p => !HIDDEN_PERMISSIONS.includes(p.key)).map(p => (
                      <PermissionSkeleton key={p.key} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Check the boxes above to override their role permissions. Unchecked boxes follow their role settings.</div>
            <div className="flex items-center gap-2">
              <Button onClick={onSave} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              <Button variant="outline" onClick={onReset} disabled={!dirty || saving}>Reset</Button>
            </div>
            <div className="space-y-4">
              {PERMISSION_CATEGORIES.map(category => {
                const categoryPermissions = category.permissions.filter(p =>
                  !HIDDEN_PERMISSIONS.includes(p.key)
                );

                if (categoryPermissions.length === 0) return null;

                return (
                  <div key={category.title}>
                    <div className="mb-3">
                      <div className="text-sm font-semibold">{category.title}</div>
                      <div className="text-xs text-muted-foreground">{category.description}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {categoryPermissions.map(p => {
                        const hasOverride = pending[p.key] !== undefined;
                        const hasEffectiveAccess = !!effective[p.key];
                        const overrideValue = !!pending[p.key];

                        return (
                          <div key={p.key} className="rounded-lg border bg-card p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Checkbox
                                  checked={hasOverride ? overrideValue : hasEffectiveAccess}
                                  onCheckedChange={(v:any) => onToggleLocal(p.key, !!v)}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate">{p.label}</div>
                                  <div className="text-xs text-muted-foreground truncate">{p.description}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs flex-shrink-0">
                                {hasOverride ? (
                                  <Badge variant={overrideValue ? "default" : "destructive"}>
                                    {overrideValue ? "Override: Yes" : "Override: No"}
                                  </Badge>
                                ) : (
                                  <Badge variant={hasEffectiveAccess ? "default" : "secondary"}>
                                    {hasEffectiveAccess ? "From Role" : "No Access"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
