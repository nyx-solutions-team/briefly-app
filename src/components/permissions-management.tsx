"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Check, X, Settings, Users, Shield, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// User-friendly permission categories - hide technical details
const PERMISSION_CATEGORIES = [
  {
    title: 'Documents',
    description: 'What users can do with documents',
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
      },
      {
        key: 'documents.share',
        label: 'Share Documents',
        description: 'Can create external share links for documents',
        userFriendly: true
      }
    ]
  },
  {
    title: 'Organization',
    description: 'Administrative capabilities',
    permissions: [
      {
        key: 'org.manage_members',
        label: 'Manage Users & Teams',
        description: 'Can manage user accounts and team membership across the organization',
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
    description: 'Specialized functionality',
    permissions: [
      {
        key: 'audit.read',
        label: 'View Activity Logs',
        description: 'Can see system activity and audit trail',
        userFriendly: true
      }
    ]
  },
  {
    title: 'Page Access',
    description: 'Control which pages users can see and access',
    permissions: [
      {
        key: 'pages.upload',
        label: 'Upload Document Page',
        description: 'Can access the upload document page',
        userFriendly: true
      },
      {
        key: 'pages.documents',
        label: 'Folders & Documents Page',
        description: 'Can access the folders and documents browsing page',
        userFriendly: true
      },
      {
        key: 'pages.activity',
        label: 'Activity Page',
        description: 'Can access the activity and audit logs page',
        userFriendly: true
      },
      {
        key: 'pages.recycle_bin',
        label: 'Recycle Bin Page',
        description: 'Can access the recycle bin to view deleted documents',
        userFriendly: true
      },
      {
        key: 'pages.chat',
        label: 'Chat Bot Page',
        description: 'Can access the chat/chatbot page',
        userFriendly: true
      },
      {
        key: 'dashboard.view',
        label: 'Dashboard View Level',
        description: 'Controls which dashboard view is shown. "admin" shows org-wide stats and team cards. "regular" shows role-based dashboard.',
        userFriendly: true,
        customType: 'select',
        options: [
          { value: 'regular', label: 'Regular Dashboard (Role-based)' },
          { value: 'admin', label: 'Admin Dashboard (Org-wide)' }
        ]
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
  'search.semantic',
  'departments.read',
  'chat.save_sessions'
];

type OrgRole = {
  org_id: string;
  key: string;
  name: string;
  description?: string | null;
  is_system: boolean;
  permissions: Record<string, boolean | string>;  // Allow string for dashboard.view
};

type Department = { id: string; name: string };
type OrgUser = {
  userId: string;
  displayName?: string | null;
  email?: string | null;
  role?: string;
  departments?: Array<{ id: string; name: string; deptRole?: string }>
};

export default function PermissionsManagement() {
  const { user, refreshPermissions } = useAuth();
  const [roles, setRoles] = React.useState<OrgRole[]>([]);
  const [users, setUsers] = React.useState<OrgUser[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);

  // General tab state
  const [selectedRole, setSelectedRole] = React.useState<string>('');

  // Override tab state
  const [selectedUser, setSelectedUser] = React.useState<string>('');
  const [selectedDept, setSelectedDept] = React.useState<string>('');
  const [overrides, setOverrides] = React.useState<Record<string, boolean | string>>({});
  const [effective, setEffective] = React.useState<Record<string, boolean | string>>({});
  const [deptMembershipWarning, setDeptMembershipWarning] = React.useState<string>('');

  // Loading states
  const [loading, setLoading] = React.useState(false);
  const [rolesLoading, setRolesLoading] = React.useState(false);
  const [usersLoading, setUsersLoading] = React.useState(false);
  const [orgId, setOrgId] = React.useState<string>(getApiContext().orgId || '');

  React.useEffect(() => {
    const off = onApiContextChange(({ orgId }) => {
      setOrgId(orgId || '');
      // Clear selected user when switching organizations
      setSelectedUser('');
      setSelectedDept('');
      setOverrides({});
      setEffective({});
      setDeptMembershipWarning('');
    });
    return () => { off(); };
  }, []);

  const refreshRoles = React.useCallback(async () => {
    if (!orgId) return;
    setRolesLoading(true);
    try {
      const data = await apiFetch<OrgRole[]>(`/orgs/${orgId}/roles`);
      const allowed = new Set(['orgAdmin', 'teamLead', 'member', 'contentManager', 'contentViewer']);
      const filteredRoles = (data || []).filter(r => allowed.has(r.key));

      // Sort roles from highest to lowest authority
      const roleOrder = ['orgAdmin', 'teamLead', 'contentManager', 'member', 'contentViewer'];
      const sortedRoles = filteredRoles.sort((a, b) => {
        const aIndex = roleOrder.indexOf(a.key);
        const bIndex = roleOrder.indexOf(b.key);
        return aIndex - bIndex;
      });

      setRoles(sortedRoles);
    } finally {
      setRolesLoading(false);
    }
  }, [orgId]);

  const refreshUsers = React.useCallback(async () => {
    if (!orgId) return;
    setUsersLoading(true);
    try {
      const u = await apiFetch<any[]>(`/orgs/${orgId}/users`);
      const usersWithDepts = (u || []).map((r) => {
        return {
          userId: r.userId,
          displayName: r.displayName || r.app_users?.display_name || '',
          email: r.email,
          role: r.role,
          departments: r.departments?.map((d: any) => ({
            id: d.id,
            name: d.name,
            deptRole: d.deptRole || d.role
          })) || []
        };
      });
      // Sort users: Admin first, then Leads by name asc, then others by name asc
      const sortedUsers = usersWithDepts.sort((a, b) => {
        // Role priority: orgAdmin > teamLead > contentManager > member > contentViewer (case insensitive)
        const roleOrder = { 'orgadmin': 0, 'teamlead': 1, 'contentmanager': 2, 'member': 3, 'contentviewer': 4 };
        const aRolePriority = roleOrder[(a.role || '').toLowerCase() as keyof typeof roleOrder] ?? 999;
        const bRolePriority = roleOrder[(b.role || '').toLowerCase() as keyof typeof roleOrder] ?? 999;

        // If different roles, sort by role priority
        if (aRolePriority !== bRolePriority) {
          return aRolePriority - bRolePriority;
        }

        // Same role, sort alphabetically by display name
        const aName = (a.displayName || a.email || '').toLowerCase();
        const bName = (b.displayName || b.email || '').toLowerCase();
        return aName.localeCompare(bName);
      });

      setUsers(sortedUsers);
      const d = await apiFetch<any[]>(`/orgs/${orgId}/departments?includeMine=1`);
      // Filter out Core team for non-admin users
      const filteredDepartments = (d || []).filter((dept: any) => {
        if (dept.name === 'Core') {
          // Only show Core team to org admins
          return user?.role === 'systemAdmin';
        }
        return true;
      });
      setDepartments(filteredDepartments.map((x: any) => ({ id: x.id, name: x.name })));
    } finally {
      setUsersLoading(false);
    }
  }, [orgId, user]);

  React.useEffect(() => {
    refreshRoles();
    refreshUsers();
  }, [refreshRoles, refreshUsers]);

  const loadOverrides = React.useCallback(async () => {
    if (!selectedUser) {
      setOverrides({});
      setEffective({});
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('userId', selectedUser);
      if (selectedDept) params.set('departmentId', selectedDept);

      // Load current overrides
      const list = await apiFetch<any[]>(`/orgs/${orgId}/overrides?${params.toString()}`);
      const row = (list || [])[0];
      const base = row?.permissions || {};
      setOverrides(base);

      // Load effective permissions (what the user actually has after role + overrides)
      const eff = await apiFetch<any>(`/orgs/${orgId}/overrides/effective?${params.toString()}`);
      setEffective(eff?.effective || {});
      setDeptMembershipWarning(eff?.note || '');
    } finally { setLoading(false); }
  }, [orgId, selectedUser, selectedDept]);

  React.useEffect(() => { void loadOverrides(); }, [loadOverrides]);

  // When a user is selected, set default scope to their team if they have one
  React.useEffect(() => {
    if (selectedUser && users.length > 0) {
      const u = users.find(x => x.userId === selectedUser);
      if (u?.departments && u.departments.length > 0) {
        // Set to first team by default
        setSelectedDept(u.departments[0].id);
      } else if (departments.length > 0) {
        // No user teams, default to first available team
        setSelectedDept(departments[0].id);
      }
    }
  }, [selectedUser, users, departments]);

  const onRoleToggle = async (role: OrgRole, permKey: string, value: boolean | string) => {
    const nextPerms = { ...(role.permissions || {}), [permKey]: value };
    await apiFetch(`/orgs/${orgId}/roles/${encodeURIComponent(role.key)}`, {
      method: 'PATCH',
      body: { permissions: nextPerms },
    });
    setRoles(prev => prev.map(r => r.key === role.key ? { ...r, permissions: nextPerms } : r));
    // Refresh user permissions in the auth context so the UI updates immediately
    await refreshPermissions();
  };

  const onOverrideToggle = (key: string, val: boolean | string) => {
    setOverrides(prev => ({ ...prev, [key]: val }));
  };

  const onUserSelect = (userId: string) => {
    setSelectedUser(userId);
    setOverrides({});
    setEffective({});
    setDeptMembershipWarning('');
    setSelectedDept(''); // Will be updated by useEffect
  };

  const onSaveOverrides = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      await apiFetch(`/orgs/${orgId}/overrides`, {
        method: 'PUT',
        body: {
          userId: selectedUser,
          departmentId: selectedDept,
          permissions: overrides,
        },
      });
      // Refresh effective permissions after save
      await loadOverrides();
    } finally { setLoading(false); }
  };

  const roleLabel = (key: string, name: string) => {
    switch (key) {
      case 'orgAdmin': return 'Organization Administrator';
      case 'teamLead': return 'Team Lead';
      case 'member': return 'Team Member';
      case 'contentManager': return 'Content Manager';
      case 'contentViewer': return 'Content Viewer';
      default: return name || key;
    }
  };

  const roleDescription = (key: string) => {
    switch (key) {
      case 'orgAdmin': return 'Full organization access with administrative privileges';
      case 'teamLead': return 'Department lead with team-scoped management capabilities';
      case 'member': return 'Department member with full document capabilities within team';
      case 'contentManager': return 'Expanded content management privileges without administrative access';
      case 'contentViewer': return 'Read-only access with basic viewing permissions';
      default: return 'Custom role with specific permissions';
    }
  };

  const formatUserRole = (role: string) => {
    switch (role) {
      case 'orgAdmin': return 'Admin';
      case 'teamLead': return 'Lead';
      case 'member': return 'Member';
      case 'contentManager': return 'Content Manager';
      case 'contentViewer': return 'Viewer';
      default: return role;
    }
  };

  const getVisiblePermissions = (rolePermissions: Record<string, boolean | string>) => {
    const visible: Record<string, boolean | string> = {};
    Object.entries(rolePermissions).forEach(([key, value]) => {
      if (!HIDDEN_PERMISSIONS.includes(key)) {
        visible[key] = value;
      }
    });
    return visible;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
        <div className="border-b bg-muted/20 px-4 flex-shrink-0">
          <TabsList className="h-10 bg-transparent gap-6 p-0">
            <TabsTrigger
              value="general"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-3 text-[13px] font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground transition-none"
            >
              <Settings className="w-3.5 h-3.5 mr-2" />
              General Roles
            </TabsTrigger>
            <TabsTrigger
              value="override"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-3 text-[13px] font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground transition-none"
            >
              <Users className="w-3.5 h-3.5 mr-2" />
              User Overrides
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="flex-1 min-h-0 m-0 data-[state=active]:flex overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-64 border-r bg-muted/5 flex flex-col min-h-0">
            <div className="p-3 flex flex-col flex-1 min-h-0">
              <h3 className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2 px-2 flex-shrink-0">SYSTEM ROLES</h3>
              <ScrollArea className="flex-1">
                {rolesLoading ? (
                  <div className="space-y-1.5 px-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="p-3 rounded-lg border bg-card/40">
                        <Skeleton className="h-4 w-24 mb-1" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 px-1">
                    {roles.map(role => (
                      <button
                        key={role.key}
                        onClick={() => setSelectedRole(role.key)}
                        className={`w-full p-2.5 text-left rounded-md transition-all duration-200 border ${selectedRole === role.key
                          ? 'bg-primary/10 text-primary border-primary/20 shadow-sm'
                          : 'bg-transparent border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        <div className="font-semibold text-[13px] leading-tight flex items-center gap-1.5">
                          {roleLabel(role.key, role.name)}
                          {role.key === 'orgAdmin' && <Shield className="w-3 h-3 opacity-70" />}
                        </div>
                        <div className="text-[11px] opacity-60 mt-1 truncate">{roleDescription(role.key).split('with')[0]}</div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {selectedRole ? (
              <ScrollArea className="flex-1">
                <div className="p-6">
                  {(() => {
                    const role = roles.find(r => r.key === selectedRole);
                    if (!role) return null;

                    return (
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-primary/10">
                            <Shield className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <h2 className="text-[15px] font-semibold tracking-tight">{roleLabel(role.key, role.name)} Permissions</h2>
                            <p className="text-[12px] text-muted-foreground">Define access levels for the <span className="font-medium text-foreground">{role.name}</span> role</p>
                          </div>
                        </div>

                        <div className="space-y-8">
                          {PERMISSION_CATEGORIES.map(category => {
                            const categoryPermissions = category.permissions.filter(p =>
                              getVisiblePermissions(role.permissions)[p.key] !== undefined
                            );

                            if (categoryPermissions.length === 0) return null;

                            return (
                              <div key={category.title}>
                                <div className="mb-4">
                                  <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">{category.title}</div>
                                  <div className="text-[11px] text-muted-foreground/50 mt-0.5">{category.description}</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {categoryPermissions.map(p => {
                                    if (p.key === 'dashboard.view') {
                                      const permValue = role.permissions?.[p.key];
                                      const currentValue = typeof permValue === 'string'
                                        ? permValue
                                        : (typeof permValue === 'boolean' && permValue
                                          ? 'admin' : 'regular');
                                      return (
                                        <div key={p.key} className="flex items-center justify-between p-3 rounded-lg border bg-card/40 border-border/40">
                                          <div className="flex-1">
                                            <div className="text-[13px] font-medium mb-1">{p.label}</div>
                                            <div className="text-[11px] text-muted-foreground mb-3">{p.description}</div>
                                            <select
                                              value={currentValue}
                                              onChange={(e) => onRoleToggle(role, p.key, e.target.value)}
                                              className="w-full h-8 px-2 text-[12px] border rounded bg-background border-border/30"
                                            >
                                              {p.options?.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div key={p.key} className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-card/20 hover:bg-card/40 transition-colors">
                                        <div className="flex items-center gap-3">
                                          <Checkbox
                                            checked={!!role.permissions?.[p.key]}
                                            onCheckedChange={(v: any) => onRoleToggle(role, p.key, !!v)}
                                            className="h-4 w-4"
                                          />
                                          <div className="min-w-0">
                                            <div className="text-[13px] font-medium leading-none">{p.label}</div>
                                            <div className="text-[11px] text-muted-foreground mt-1.5 line-clamp-1">{p.description}</div>
                                          </div>
                                        </div>
                                        <Badge
                                          variant={role.permissions?.[p.key] ? "default" : "secondary"}
                                          className="text-[9px] px-1.5 py-0 h-4 font-normal tracking-wide uppercase"
                                        >
                                          {role.permissions?.[p.key] ? "Yes" : "No"}
                                        </Badge>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-6 bg-muted/5">
                <div className="max-w-[280px]">
                  <Shield className="w-10 h-10 mx-auto mb-4 text-muted-foreground/30" />
                  <h3 className="text-[14px] font-semibold mb-2">Select a Role</h3>
                  <p className="text-[12px] text-muted-foreground">Choose a system role from the left to manage organizational defaults</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="override" className="flex-1 min-h-0 m-0 data-[state=active]:flex overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-64 border-r bg-muted/5 flex flex-col min-h-0">
            <div className="p-3 flex flex-col flex-1 min-h-0">
              <h3 className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2 px-2 flex-shrink-0">ORG MEMBERS</h3>
              <ScrollArea className="flex-1">
                {usersLoading ? (
                  <div className="space-y-1.5 px-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="p-2.5 rounded-md border bg-card/40">
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-2 w-20" />
                            <Skeleton className="h-1.5 w-28" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 px-1">
                    {users.map(user => (
                      <button
                        key={user.userId}
                        onClick={() => onUserSelect(user.userId)}
                        className={`w-full p-2 text-left rounded-md transition-all duration-200 border ${selectedUser === user.userId
                          ? 'bg-primary/10 text-primary border-primary/20 shadow-sm'
                          : 'bg-transparent border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7 border border-border/10">
                            <AvatarFallback className={`text-[10px] font-bold ${selectedUser === user.userId
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted/50 text-muted-foreground'
                              }`}>
                              {(user.displayName || user.email || '?')[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <div className="font-semibold text-[13px] truncate leading-none">{user.displayName || 'Unknown User'}</div>
                            </div>
                            <div className="text-[11px] opacity-60 truncate mt-1">{user.email}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {selectedUser ? (
              <ScrollArea className="flex-1">
                <div className="p-6">
                  {(() => {
                    const u = users.find(x => x.userId === selectedUser);
                    if (!u) return null;

                    return (
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-amber-500/10">
                            <Users className="w-4 h-4 text-amber-600" />
                          </div>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8 border border-border/10">
                              <AvatarFallback className="text-[11px] font-bold bg-muted/50">
                                {(u.displayName || u.email || '?')[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h2 className="text-[15px] font-semibold tracking-tight leading-none">{u.displayName || 'Unknown User'}</h2>
                              <p className="text-[11px] text-muted-foreground mt-1">{u.email}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-muted/10 p-4 rounded-lg border border-border/20">
                          <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest pl-0.5">PERMISSION SCOPE</label>
                            <Select value={selectedDept} onValueChange={(value) => setSelectedDept(value as any)}>
                              <SelectTrigger className="w-full mt-1.5 h-8 text-[12px] bg-background border-border/30">
                                <SelectValue placeholder="Global / Team" />
                              </SelectTrigger>
                              <SelectContent>
                                {departments.filter(d => {
                                  const userDeptMembership = u.departments?.find(dept => dept.id === d.id);
                                  return !!userDeptMembership;
                                }).map(d => {
                                  const userDeptMembership = u.departments?.find(dept => dept.id === d.id);
                                  const deptRole = userDeptMembership?.deptRole;
                                  return (
                                    <SelectItem key={d.id} value={d.id} className="text-[12px]">
                                      <div className="flex items-center gap-2">
                                        <span>{d.name === 'Core' ? 'Default Organization' : d.name}</span>
                                        <Badge variant={deptRole === 'lead' ? 'default' : 'secondary'} className="text-[9px] px-1 py-0 h-3.5 uppercase font-medium">
                                          {deptRole === 'lead' ? 'Lead' : 'Member'}
                                        </Badge>
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end">
                            <Button variant="ghost" size="sm" className="h-8 text-[12px] w-full" onClick={loadOverrides}>
                              Reset
                            </Button>
                          </div>
                          <div className="flex items-end">
                            <Button size="sm" className="h-8 text-[12px] w-full px-6" onClick={onSaveOverrides} disabled={loading}>
                              {loading ? 'Saving...' : 'Apply Changes'}
                            </Button>
                          </div>
                        </div>

                        {deptMembershipWarning && (
                          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                              <div className="text-[12px] text-amber-600/90 font-medium">
                                {deptMembershipWarning}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="space-y-8">
                          {PERMISSION_CATEGORIES.map(category => {
                            const categoryPermissions = category.permissions.filter(p => !HIDDEN_PERMISSIONS.includes(p.key));
                            if (categoryPermissions.length === 0) return null;

                            return (
                              <div key={category.title}>
                                <div className="mb-4">
                                  <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">{category.title}</div>
                                  <div className="text-[11px] text-muted-foreground/50 mt-0.5">{category.description}</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {categoryPermissions.map(p => {
                                    const hasOverride = overrides.hasOwnProperty(p.key);
                                    const effectiveValueRaw = effective.hasOwnProperty(p.key) ? effective[p.key] : 'regular';
                                    const effectiveValue = typeof effectiveValueRaw === 'string' ? effectiveValueRaw : (effectiveValueRaw ? 'admin' : 'regular');
                                    const overrideValueRaw = hasOverride ? overrides[p.key] : effectiveValue;
                                    const overrideValue = typeof overrideValueRaw === 'string' ? overrideValueRaw : (overrideValueRaw ? 'admin' : 'regular');

                                    if (p.key === 'dashboard.view') {
                                      return (
                                        <div key={p.key} className="rounded-lg border bg-card/40 border-border/40 p-3">
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="min-w-0 flex-1">
                                              <div className="text-[13px] font-medium truncate">{p.label}</div>
                                              <div className="text-[11px] text-muted-foreground truncate">{p.description}</div>
                                            </div>
                                            {hasOverride && <Badge variant="default" className="text-[9px] px-1 py-0 h-3.5">Overridden</Badge>}
                                          </div>
                                          <select
                                            value={overrideValue}
                                            onChange={(e) => onOverrideToggle(p.key, e.target.value)}
                                            className="w-full h-8 px-2 text-[12px] border rounded bg-background border-border/30"
                                          >
                                            {p.options?.map(opt => (
                                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    }

                                    const isEffectiveTrue = typeof effectiveValueRaw === 'boolean' ? effectiveValueRaw : effectiveValueRaw === 'admin' || effectiveValueRaw === 'true';
                                    const isOverrideTrue = typeof overrideValueRaw === 'boolean' ? overrideValueRaw : overrideValueRaw === 'admin' || overrideValueRaw === 'true';

                                    return (
                                      <div key={p.key} className="rounded-lg border border-border/30 bg-card/20 p-3 hover:bg-card/40 transition-colors">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <Checkbox
                                              checked={isOverrideTrue}
                                              onCheckedChange={(v: any) => onOverrideToggle(p.key, !!v)}
                                              className="h-4 w-4"
                                            />
                                            <div className="min-w-0 flex-1">
                                              <div className="text-[13px] font-medium truncate leading-none">{p.label}</div>
                                              <div className="text-[11px] text-muted-foreground truncate mt-1.5">{p.description}</div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0 ml-4">
                                            {hasOverride ? (
                                              <Badge variant={isOverrideTrue ? "default" : "destructive"} className="text-[9px] px-1 py-0 h-4 font-normal tracking-wide uppercase">
                                                {isOverrideTrue ? "Forced: Yes" : "Forced: No"}
                                              </Badge>
                                            ) : (
                                              <Badge variant={isEffectiveTrue ? "outline" : "secondary"} className={`text-[9px] px-1.5 py-0 h-4 font-normal tracking-wide uppercase ${isEffectiveTrue ? 'text-primary border-primary/20 bg-primary/5' : ''}`}>
                                                {isEffectiveTrue ? "Inherited" : "None"}
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
                    );
                  })()}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-6 bg-muted/5">
                <div className="max-w-[280px]">
                  <Users className="w-10 h-10 mx-auto mb-4 text-muted-foreground/30" />
                  <h3 className="text-[14px] font-semibold mb-2">Select a User</h3>
                  <p className="text-[12px] text-muted-foreground">Choose a user from the left to manage individual permission overrides</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
