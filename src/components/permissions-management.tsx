"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { formatAppDateTime, cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Settings, Users, Shield, AlertTriangle, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';

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
      },
      {
        key: 'billing.manage',
        label: 'Manage Billing',
        description: 'Can manage billing, plan changes, and invoices',
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
      },
      {
        key: 'chat.access',
        label: 'Access Chat',
        description: 'Can use the chat/AI assistant',
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
const ORG_SCOPE = '__org__';

const PERMISSION_LABELS = new Map<string, string>(
  PERMISSION_CATEGORIES.flatMap(category =>
    category.permissions.map(p => [p.key, p.label] as [string, string])
  )
);

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

type RoleVersion = {
  id: string;
  role_key: string;
  action: string;
  changed_at: string;
  changed_by?: string | null;
  name?: string | null;
  description?: string | null;
  permissions?: Record<string, boolean | string>;
  is_system?: boolean;
};

type OverrideRow = {
  permissions?: Record<string, boolean | string>;
  expires_at?: string | null;
  revoked_at?: string | null;
  reason?: string | null;
};

interface PermissionsManagementProps {
  isMobile?: boolean;
  mobileShowDetails?: boolean;
  setMobileShowDetails?: (show: boolean) => void;
}

export default function PermissionsManagement({
  isMobile = false,
  mobileShowDetails = false,
  setMobileShowDetails
}: PermissionsManagementProps) {
  const { refreshPermissions, hasPermission } = useAuth();
  const [roles, setRoles] = React.useState<OrgRole[]>([]);
  const [users, setUsers] = React.useState<OrgUser[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);

  // General tab state
  const [selectedRole, setSelectedRole] = React.useState<string>('');
  const [roleVersions, setRoleVersions] = React.useState<RoleVersion[]>([]);
  const [roleVersionsLoading, setRoleVersionsLoading] = React.useState(false);
  const [impactOpen, setImpactOpen] = React.useState(false);
  const [impactLoading, setImpactLoading] = React.useState(false);
  const [impactData, setImpactData] = React.useState<any | null>(null);
  const [pendingRoleUpdate, setPendingRoleUpdate] = React.useState<{ role: OrgRole; permissions: Record<string, boolean | string> } | null>(null);
  const [roleSaving, setRoleSaving] = React.useState(false);
  const [revertTarget, setRevertTarget] = React.useState<RoleVersion | null>(null);
  const [revertLoading, setRevertLoading] = React.useState(false);
  const [detailsTargetId, setDetailsTargetId] = React.useState<string | null>(null);

  // Override tab state
  const [selectedUser, setSelectedUser] = React.useState<string>('');
  const [selectedDept, setSelectedDept] = React.useState<string>('');
  const [overrides, setOverrides] = React.useState<Record<string, boolean | string>>({});
  const [effective, setEffective] = React.useState<Record<string, boolean | string>>({});
  const [deptMembershipWarning, setDeptMembershipWarning] = React.useState<string>('');
  const [overrideRow, setOverrideRow] = React.useState<OverrideRow | null>(null);
  const [overrideExpiresAt, setOverrideExpiresAt] = React.useState('');
  const [overrideReason, setOverrideReason] = React.useState('');
  const [includeInactiveOverrides, setIncludeInactiveOverrides] = React.useState(false);
  const [revokeLoading, setRevokeLoading] = React.useState(false);

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
      setOverrideRow(null);
      setOverrideExpiresAt('');
      setOverrideReason('');
    });
    return () => { off(); };
  }, []);

  const toLocalInputValue = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const toIsoValue = (localValue?: string) => {
    if (!localValue) return null;
    const d = new Date(localValue);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const refreshRoles = React.useCallback(async () => {
    if (!orgId) return;
    setRolesLoading(true);
    try {
      const data = await apiFetch<OrgRole[]>(`/orgs/${orgId}/roles`, { skipCache: true });
      const roleOrder = ['owner', 'orgAdmin', 'teamLead', 'contentManager', 'member', 'contentViewer', 'guest'];
      const sortedRoles = (data || []).sort((a, b) => {
        const aSystem = a.is_system ? 0 : 1;
        const bSystem = b.is_system ? 0 : 1;
        if (aSystem !== bSystem) return aSystem - bSystem;
        const aIndex = roleOrder.indexOf(a.key);
        const bIndex = roleOrder.indexOf(b.key);
        if (aIndex === -1 && bIndex === -1) {
          return (a.name || a.key).localeCompare(b.name || b.key);
        }
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
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
        const roleOrder = { 'owner': 0, 'orgadmin': 1, 'teamlead': 2, 'contentmanager': 3, 'member': 4, 'contentviewer': 5, 'guest': 6 };
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
          return hasPermission('org.manage_members');
        }
        return true;
      });
      setDepartments(filteredDepartments.map((x: any) => ({ id: x.id, name: x.name })));
    } finally {
      setUsersLoading(false);
    }
  }, [orgId, hasPermission]);

  React.useEffect(() => {
    refreshRoles();
    refreshUsers();
  }, [refreshRoles, refreshUsers]);

  const loadRoleVersions = React.useCallback(async (roleKey: string) => {
    if (!orgId || !roleKey) {
      setRoleVersions([]);
      return;
    }
    setRoleVersionsLoading(true);
    try {
      const data = await apiFetch<RoleVersion[]>(`/orgs/${orgId}/roles/${encodeURIComponent(roleKey)}/versions?limit=20`);
      setRoleVersions(data || []);
    } finally {
      setRoleVersionsLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    if (selectedRole) {
      void loadRoleVersions(selectedRole);
    } else {
      setRoleVersions([]);
    }
  }, [selectedRole, loadRoleVersions]);

  const loadOverrides = React.useCallback(async () => {
    if (!selectedUser) {
      setOverrides({});
      setEffective({});
      setOverrideRow(null);
      setOverrideExpiresAt('');
      setOverrideReason('');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('userId', selectedUser);
      if (selectedDept && selectedDept !== ORG_SCOPE) params.set('departmentId', selectedDept);
      if (includeInactiveOverrides) params.set('includeInactive', '1');

      // Load current overrides
      const list = await apiFetch<OverrideRow[]>(`/orgs/${orgId}/overrides?${params.toString()}`);
      const row = (list || [])[0] || null;
      const base = row?.permissions || {};
      setOverrides(base);
      setOverrideRow(row);
      setOverrideExpiresAt(toLocalInputValue(row?.expires_at));
      setOverrideReason(row?.reason || '');

      // Load effective permissions (what the user actually has after role + overrides)
      const eff = await apiFetch<any>(`/orgs/${orgId}/overrides/effective?${params.toString()}`);
      setEffective(eff?.effective || {});
      setDeptMembershipWarning(eff?.note || '');
    } finally { setLoading(false); }
  }, [orgId, selectedUser, selectedDept, includeInactiveOverrides]);

  React.useEffect(() => { void loadOverrides(); }, [loadOverrides]);

  // When a user is selected, set default scope to their team if they have one
  React.useEffect(() => {
    if (selectedUser && users.length > 0) {
      const u = users.find(x => x.userId === selectedUser);
      if (u?.departments && u.departments.length > 0) {
        // Set to first team by default
        setSelectedDept(u.departments[0].id);
      } else {
        // No user teams, default to org-wide scope
        setSelectedDept(ORG_SCOPE);
      }
    }
  }, [selectedUser, users]);

  const applyRolePermissions = async (roleKey: string, nextPerms: Record<string, boolean | string>) => {
    const updated = await apiFetch<OrgRole>(`/orgs/${orgId}/roles/${encodeURIComponent(roleKey)}`, {
      method: 'PATCH',
      body: { permissions: nextPerms },
    });
    setRoles(prev => prev.map(r => r.key === roleKey ? updated : r));
    await refreshPermissions();
  };

  const onRoleToggle = async (role: OrgRole, permKey: string, value: boolean | string) => {
    if (impactLoading) return;
    const nextPerms = { ...(role.permissions || {}), [permKey]: value };
    setImpactLoading(true);
    try {
      const impact = await apiFetch<any>(`/orgs/${orgId}/roles/${encodeURIComponent(role.key)}/impact`, {
        method: 'POST',
        body: { permissions: nextPerms },
      });
      setImpactData(impact);
      setPendingRoleUpdate({ role, permissions: nextPerms });
      setImpactOpen(true);
    } finally {
      setImpactLoading(false);
    }
  };

  const onOverrideToggle = (key: string, val: boolean | string) => {
    setOverrides(prev => ({ ...prev, [key]: val }));
  };

  const onUserSelect = (userId: string) => {
    setSelectedUser(userId);
    setOverrides({});
    setEffective({});
    setDeptMembershipWarning('');
    setOverrideRow(null);
    setOverrideExpiresAt('');
    setOverrideReason('');
    setSelectedDept(''); // Will be updated by useEffect
  };

  const onSaveOverrides = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const deptValue = selectedDept && selectedDept !== ORG_SCOPE ? selectedDept : null;
      await apiFetch(`/orgs/${orgId}/overrides`, {
        method: 'PUT',
        body: {
          userId: selectedUser,
          departmentId: deptValue,
          permissions: overrides,
          expiresAt: toIsoValue(overrideExpiresAt),
          reason: overrideReason || null,
        },
      });
      // Refresh effective permissions after save
      await loadOverrides();
    } finally { setLoading(false); }
  };

  const onRevokeOverride = async () => {
    if (!selectedUser) return;
    setRevokeLoading(true);
    try {
      const deptValue = selectedDept && selectedDept !== ORG_SCOPE ? selectedDept : null;
      await apiFetch(`/orgs/${orgId}/overrides/revoke`, {
        method: 'POST',
        body: {
          userId: selectedUser,
          departmentId: deptValue,
          reason: overrideReason || undefined,
        },
      });
      await loadOverrides();
    } finally { setRevokeLoading(false); }
  };

  const confirmRoleUpdate = async () => {
    if (!pendingRoleUpdate) return;
    setRoleSaving(true);
    try {
      await applyRolePermissions(pendingRoleUpdate.role.key, pendingRoleUpdate.permissions);
      await loadRoleVersions(pendingRoleUpdate.role.key);
    } finally {
      setRoleSaving(false);
      setImpactOpen(false);
      setPendingRoleUpdate(null);
    }
  };

  const confirmRoleRevert = async () => {
    if (!revertTarget || !selectedRole) return;
    setRevertLoading(true);
    try {
      const updated = await apiFetch<OrgRole>(`/orgs/${orgId}/roles/${encodeURIComponent(selectedRole)}/revert`, {
        method: 'POST',
        body: { versionId: revertTarget.id },
      });
      setRoles(prev => prev.map(r => r.key === updated.key ? updated : r));
      await refreshPermissions();
      await loadRoleVersions(updated.key);
    } finally {
      setRevertLoading(false);
      setRevertTarget(null);
    }
  };

  const roleLabel = (key: string, name: string) => {
    switch (key) {
      case 'owner': return 'Owner';
      case 'orgAdmin': return 'Organization Administrator';
      case 'teamLead': return 'Team Lead';
      case 'member': return 'Team Member';
      case 'contentManager': return 'Content Manager';
      case 'contentViewer': return 'Content Viewer';
      case 'guest': return 'Guest';
      default: return name || key;
    }
  };

  const getOverrideStatus = (row: OverrideRow | null) => {
    if (!row) return { label: 'None', variant: 'secondary' as const };
    if (row.revoked_at) return { label: 'Revoked', variant: 'secondary' as const };
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return { label: 'Expired', variant: 'secondary' as const };
    }
    return { label: 'Active', variant: 'default' as const };
  };

  const roleDescription = (key: string) => {
    switch (key) {
      case 'owner': return 'Full access including billing and security controls';
      case 'orgAdmin': return 'Full organization access with administrative privileges';
      case 'teamLead': return 'Department lead with team-scoped management capabilities';
      case 'member': return 'Department member with full document capabilities within team';
      case 'contentManager': return 'Expanded content management privileges without administrative access';
      case 'contentViewer': return 'Read-only access with basic viewing permissions';
      case 'guest': return 'Limited access to shared content only';
      default: return 'Custom role with specific permissions';
    }
  };

  const formatUserRole = (role: string) => {
    switch (role) {
      case 'owner': return 'Owner';
      case 'orgAdmin': return 'Admin';
      case 'teamLead': return 'Lead';
      case 'member': return 'Member';
      case 'contentManager': return 'Content Manager';
      case 'contentViewer': return 'Viewer';
      case 'guest': return 'Guest';
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

  const formatPermissionValue = (value: boolean | string | undefined) => {
    if (value === undefined) return 'unset';
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    return value;
  };

  const diffRolePermissions = (before: Record<string, boolean | string> = {}, after: Record<string, boolean | string> = {}) => {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changes: Array<{ key: string; type: 'added' | 'removed' | 'changed'; from?: boolean | string; to?: boolean | string }> = [];
    for (const key of keys) {
      const from = before[key];
      const to = after[key];
      if (from === undefined && to !== undefined) {
        changes.push({ key, type: 'added', to });
      } else if (from !== undefined && to === undefined) {
        changes.push({ key, type: 'removed', from });
      } else if (from !== to) {
        changes.push({ key, type: 'changed', from, to });
      }
    }
    changes.sort((a, b) => a.key.localeCompare(b.key));
    return changes;
  };

  const summarizeChanges = (changes: Array<{ key: string; type: 'added' | 'removed' | 'changed'; from?: boolean | string; to?: boolean | string }>) => {
    if (!changes.length) return 'No permission changes';
    const display = changes.map(change => {
      const label = PERMISSION_LABELS.get(change.key) || change.key;
      if (change.type === 'added') {
        return `Added ${label}: ${formatPermissionValue(change.to)}`;
      }
      if (change.type === 'removed') {
        return `Removed ${label}: ${formatPermissionValue(change.from)}`;
      }
      return `${label}: ${formatPermissionValue(change.from)} → ${formatPermissionValue(change.to)}`;
    });
    const max = 3;
    const head = display.slice(0, max).join(' · ');
    if (display.length > max) {
      return `${head} · +${display.length - max} more`;
    }
    return head;
  };

  const formatActor = (actorId?: string | null) => {
    if (!actorId) return null;
    const u = users.find(user => user.userId === actorId);
    if (!u) return actorId.slice(0, 8);
    return u.displayName || u.email || actorId.slice(0, 8);
  };

  const getDerivedPagePermission = (rolePermissions: Record<string, boolean | string>, key: string) => {
    switch (key) {
      case 'pages.upload':
        return rolePermissions['documents.create'] === true;
      case 'pages.documents':
        return rolePermissions['documents.read'] === true;
      case 'pages.activity':
        return rolePermissions['audit.read'] === true;
      case 'pages.recycle_bin':
        return rolePermissions['documents.read'] === true;
      case 'pages.chat':
        return Object.prototype.hasOwnProperty.call(rolePermissions, 'chat.access')
          ? rolePermissions['chat.access'] === true
          : true;
      default:
        return undefined;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Tabs
        defaultValue="general"
        onValueChange={() => {
          if (isMobile && setMobileShowDetails) setMobileShowDetails(false);
        }}
        className="flex-1 flex flex-col min-h-0"
      >
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
          <div className={cn(
            "w-64 border-r bg-muted/5 flex flex-col min-h-0 shrink-0",
            isMobile ? (mobileShowDetails ? "hidden" : "w-full border-r-0") : "flex"
          )}>
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
                        onClick={() => {
                          setSelectedRole(role.key);
                          if (isMobile && setMobileShowDetails) setMobileShowDetails(true);
                        }}
                        className={cn(
                          "w-full p-2.5 text-left rounded-md transition-all duration-200 border",
                          selectedRole === role.key
                            ? 'bg-primary/10 text-primary border-primary/20 shadow-sm'
                            : 'bg-transparent border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <div className="font-semibold text-[13px] leading-tight flex items-center gap-1.5">
                          {roleLabel(role.key, role.name)}
                          {role.key === 'orgAdmin' && <Shield className="w-3 h-3 opacity-70" />}
                        </div>
                        <div className="text-[11px] opacity-60 mt-1">{roleDescription(role.key).split('with')[0]}</div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {/* Right Content Area */}
          <div className={cn(
            "flex-1 min-w-0 flex flex-col min-h-0",
            isMobile && !mobileShowDetails ? "hidden" : "flex"
          )}>
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
                                        <div key={p.key} className="p-3 rounded-lg border bg-card/40 border-border/40">
                                          <div className="flex-1 min-w-0">
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

                                    const rawValue = role.permissions?.[p.key];
                                    const derivedValue = p.key.startsWith('pages.') && rawValue === undefined
                                      ? getDerivedPagePermission(role.permissions || {}, p.key)
                                      : undefined;
                                    const displayValue = typeof rawValue === 'boolean'
                                      ? rawValue
                                      : (derivedValue === undefined ? !!rawValue : derivedValue);
                                    const isDerived = rawValue === undefined && derivedValue !== undefined;
                                    return (
                                      <div key={p.key} className="flex items-start justify-between p-3 rounded-lg border border-border/30 bg-card/20 hover:bg-card/40 transition-colors">
                                        <div className="flex items-start gap-3">
                                          <Checkbox
                                            checked={displayValue === true}
                                            onCheckedChange={(v: any) => {
                                              onRoleToggle(role, p.key, !!v);
                                            }}
                                            className="h-4 w-4"
                                          />
                                          <div className="min-w-0">
                                            <div className="text-[13px] font-medium leading-tight">{p.label}</div>
                                            <div className="text-[11px] text-muted-foreground mt-1.5">{p.description}</div>
                                            {isDerived && (
                                              <div className="text-[10px] text-muted-foreground/70 mt-1">Defaulted from functional permissions</div>
                                            )}
                                          </div>
                                        </div>
                                        <Badge
                                          variant={displayValue ? "default" : "secondary"}
                                          className="text-[9px] px-1.5 py-0 h-4 font-normal tracking-wide uppercase"
                                        >
                                          {isDerived ? "Default" : (displayValue ? "Yes" : "No")}
                                        </Badge>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="pt-6 border-t border-border/30 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">Role History</div>
                            {roleVersionsLoading && <span className="text-[11px] text-muted-foreground">Loading...</span>}
                          </div>
                          {roleVersionsLoading ? (
                            <div className="space-y-2">
                              {[1, 2, 3].map(i => (
                                <div key={i} className="p-3 rounded-lg border bg-card/40">
                                  <Skeleton className="h-3 w-32 mb-2" />
                                  <Skeleton className="h-2 w-48" />
                                </div>
                              ))}
                            </div>
                          ) : roleVersions.length > 0 ? (
                            <div className="space-y-2">
                              {roleVersions.map((v, idx) => {
                                const prev = roleVersions[idx + 1];
                                const changes = diffRolePermissions(prev?.permissions || {}, v.permissions || {});
                                const summary = summarizeChanges(changes);
                                const actor = formatActor(v.changed_by);
                                const showDetails = changes.length > 3;
                                return (
                                  <div key={v.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 bg-card/20">
                                    <div className="min-w-0">
                                      <div className="text-[12px] font-medium">
                                        <Badge variant="outline" className="mr-2 text-[9px] px-1 py-0 h-4 uppercase">{v.action}</Badge>
                                        {formatAppDateTime(v.changed_at)}
                                        {actor && (
                                          <span className="text-[10px] text-muted-foreground ml-2">by {actor}</span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground mt-1">
                                        {summary}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {showDetails && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 text-[11px]"
                                          onClick={() => setDetailsTargetId(v.id)}
                                        >
                                          <Eye className="w-3 h-3 mr-1" />
                                          View
                                        </Button>
                                      )}
                                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setRevertTarget(v)}>
                                        Revert
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-[12px] text-muted-foreground">No version history yet.</div>
                          )}
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
          <div className={cn(
            "w-64 border-r bg-muted/5 flex flex-col min-h-0 shrink-0",
            isMobile ? (mobileShowDetails ? "hidden" : "w-full border-r-0") : "flex"
          )}>
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
                        onClick={() => {
                          onUserSelect(user.userId);
                          if (isMobile && setMobileShowDetails) setMobileShowDetails(true);
                        }}
                        className={cn(
                          "w-full p-2 text-left rounded-md transition-all duration-200 border",
                          selectedUser === user.userId
                            ? 'bg-primary/10 text-primary border-primary/20 shadow-sm'
                            : 'bg-transparent border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7 border border-border/10">
                            <AvatarFallback className={cn(
                              "text-[10px] font-bold",
                              selectedUser === user.userId ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-muted-foreground'
                            )}>
                              {(user.displayName || user.email || '?')[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <div className="font-semibold text-[13px] leading-none">{user.displayName || 'Unknown User'}</div>
                            </div>
                            <div className="text-[11px] opacity-60 mt-1">{user.email}</div>
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
          <div className={cn(
            "flex-1 min-w-0 flex flex-col min-h-0",
            isMobile && !mobileShowDetails ? "hidden" : "flex"
          )}>
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
                            <Select value={selectedDept} onValueChange={(value) => setSelectedDept(value)}>
                              <SelectTrigger className="w-full mt-1.5 h-8 text-[12px] bg-background border-border/30">
                                <SelectValue placeholder="Global / Team" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={ORG_SCOPE} className="text-[12px]">
                                  <div className="flex items-center gap-2">
                                    <span>Organization (All Teams)</span>
                                  </div>
                                </SelectItem>
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

                        {(() => {
                          const status = getOverrideStatus(overrideRow);
                          const expiresLabel = overrideRow?.expires_at ? formatAppDateTime(overrideRow.expires_at) : null;
                          const revokedLabel = overrideRow?.revoked_at ? formatAppDateTime(overrideRow.revoked_at) : null;
                          const canRevoke = !!overrideRow && !overrideRow.revoked_at;
                          return (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-muted/10 p-4 rounded-lg border border-border/20">
                                <div className="md:col-span-2">
                                  <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest pl-0.5">EXPIRES AT</label>
                                  <Input
                                    type="datetime-local"
                                    value={overrideExpiresAt}
                                    onChange={(e) => setOverrideExpiresAt(e.target.value)}
                                    className="mt-1.5 h-8 text-[12px] bg-background border-border/30"
                                  />
                                </div>
                                <div className="md:col-span-3">
                                  <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest pl-0.5">REASON (OPTIONAL)</label>
                                  <Input
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                    placeholder="Add a note or reason"
                                    className="mt-1.5 h-8 text-[12px] bg-background border-border/30"
                                  />
                                </div>
                                <div className="flex items-end">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-8 text-[12px] w-full"
                                    onClick={onRevokeOverride}
                                    disabled={!canRevoke || revokeLoading}
                                  >
                                    {revokeLoading ? 'Revoking...' : 'Revoke Override'}
                                  </Button>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                  <span className="uppercase tracking-widest text-[10px] font-bold text-muted-foreground/70">Status</span>
                                  <Badge variant={status.variant} className="text-[9px] px-1.5 py-0 h-4 font-normal tracking-wide uppercase">
                                    {status.label}
                                  </Badge>
                                  {expiresLabel && (
                                    <span>Expires {expiresLabel}</span>
                                  )}
                                  {revokedLabel && (
                                    <span>Revoked {revokedLabel}</span>
                                  )}
                                </div>
                                <label className="flex items-center gap-2 text-[11px] text-muted-foreground pointer">
                                  <Checkbox
                                    checked={includeInactiveOverrides}
                                    onCheckedChange={(v: any) => setIncludeInactiveOverrides(!!v)}
                                    className="h-3.5 w-3.5"
                                  />
                                  Include inactive overrides
                                </label>
                              </div>
                            </div>
                          );
                        })()}

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
                                          <div className="flex items-start justify-between mb-2">
                                            <div className="min-w-0 flex-1">
                                              <div className="text-[13px] font-medium">{p.label}</div>
                                              <div className="text-[11px] text-muted-foreground">{p.description}</div>
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
                                        <div className="flex items-start justify-between">
                                          <div className="flex items-start gap-3 min-w-0 flex-1">
                                            <Checkbox
                                              checked={isOverrideTrue}
                                              onCheckedChange={(v: any) => onOverrideToggle(p.key, !!v)}
                                              className="h-4 w-4"
                                            />
                                            <div className="min-w-0 flex-1">
                                              <div className="text-[13px] font-medium leading-tight">{p.label}</div>
                                              <div className="text-[11px] text-muted-foreground mt-1.5">{p.description}</div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0 ml-4">
                                            {hasOverride ? (
                                              <Badge variant={isOverrideTrue ? "default" : "destructive"} className="text-[9px] px-1 py-0 h-4 font-normal tracking-wide uppercase">
                                                {isOverrideTrue ? "Forced: Yes" : "Forced: No"}
                                              </Badge>
                                            ) : (
                                              <Badge variant={isEffectiveTrue ? "outline" : "secondary"} className={cn(
                                                "text-[9px] px-1.5 py-0 h-4 font-normal tracking-wide uppercase",
                                                isEffectiveTrue ? 'text-primary border-primary/20 bg-primary/5' : ''
                                              )}>
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

      <AlertDialog open={impactOpen} onOpenChange={(open) => {
        if (!open) {
          setImpactOpen(false);
          setPendingRoleUpdate(null);
          setImpactData(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Review role change</AlertDialogTitle>
            <AlertDialogDescription>
              This will update permissions for everyone assigned to the selected role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Users affected</span>
              <Badge variant="outline" className="text-[11px]">{impactData?.usersAffected ?? 0}</Badge>
            </div>
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">Permission changes</div>
              {impactData?.diff?.total ? (
                <div className="space-y-1">
                  {[
                    ...(impactData?.diff?.added || []).map((c: any) => ({ ...c, kind: 'add' })),
                    ...(impactData?.diff?.removed || []).map((c: any) => ({ ...c, kind: 'remove' })),
                    ...(impactData?.diff?.changed || []).map((c: any) => ({ ...c, kind: 'change' })),
                  ].slice(0, 6).map((c: any, idx: number) => (
                    <div key={`${c.key}-${idx}`} className="flex items-center justify-between text-[12px]">
                      <span className="font-mono">{c.key}</span>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 uppercase">
                        {c.kind}
                      </Badge>
                    </div>
                  ))}
                  {impactData?.diff?.total > 6 && (
                    <div className="text-[11px] text-muted-foreground">+ {impactData.diff.total - 6} more</div>
                  )}
                </div>
              ) : (
                <div className="text-[12px] text-muted-foreground">No effective changes detected.</div>
              )}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={roleSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRoleUpdate} disabled={roleSaving}>
              {roleSaving ? 'Applying...' : 'Apply changes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!revertTarget} onOpenChange={(open) => {
        if (!open) setRevertTarget(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert role to this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore permissions from {revertTarget ? formatAppDateTime(revertTarget.changed_at) : 'the selected version'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revertLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRoleRevert} disabled={revertLoading}>
              {revertLoading ? 'Reverting...' : 'Revert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isMobile ? (
        <Sheet open={!!detailsTargetId} onOpenChange={(open) => {
          if (!open) setDetailsTargetId(null);
        }}>
          <SheetContent side="bottom" className="rounded-t-[32px] px-6 pb-12 pt-6">
            <SheetHeader className="text-left">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted" />
              <SheetTitle>Role change details</SheetTitle>
              <SheetDescription>
                Full list of permission changes for this version.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              {(() => {
                const idx = roleVersions.findIndex(v => v.id === detailsTargetId);
                if (idx === -1) {
                  return <div className="text-[12px] text-muted-foreground text-center py-8">No details available.</div>;
                }
                const current = roleVersions[idx];
                const prev = roleVersions[idx + 1];
                const changes = diffRolePermissions(prev?.permissions || {}, current?.permissions || {});
                if (changes.length === 0) {
                  return <div className="text-[12px] text-muted-foreground text-center py-8">No permission changes detected.</div>;
                }
                return (
                  <div className="max-h-[50vh] overflow-auto space-y-3 pr-2 custom-scrollbar">
                    {changes.map((change) => {
                      const label = PERMISSION_LABELS.get(change.key) || change.key;
                      const valueText = change.type === 'added'
                        ? formatPermissionValue(change.to)
                        : change.type === 'removed'
                          ? formatPermissionValue(change.from)
                          : `${formatPermissionValue(change.from)} → ${formatPermissionValue(change.to)}`;
                      const badgeLabel = change.type === 'added' ? 'Added' : (change.type === 'removed' ? 'Removed' : 'Changed');
                      return (
                        <div key={`${change.key}-${change.type}`} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/10 bg-muted/20">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[13px]">{label}</div>
                            <div className="text-[11px] text-muted-foreground mt-1">{valueText}</div>
                          </div>
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 uppercase shrink-0">
                            {badgeLabel}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            <SheetFooter className="mt-6">
              <Button className="w-full h-11 text-sm font-semibold rounded-2xl" onClick={() => setDetailsTargetId(null)}>
                Close
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <AlertDialog open={!!detailsTargetId} onOpenChange={(open) => {
          if (!open) setDetailsTargetId(null);
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Role change details</AlertDialogTitle>
              <AlertDialogDescription>
                Full list of permission changes for this version.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {(() => {
              const idx = roleVersions.findIndex(v => v.id === detailsTargetId);
              if (idx === -1) {
                return <div className="text-[12px] text-muted-foreground">No details available.</div>;
              }
              const current = roleVersions[idx];
              const prev = roleVersions[idx + 1];
              const changes = diffRolePermissions(prev?.permissions || {}, current?.permissions || {});
              if (changes.length === 0) {
                return <div className="text-[12px] text-muted-foreground">No permission changes detected.</div>;
              }
              return (
                <div className="max-h-[320px] overflow-auto space-y-2 text-[12px]">
                  {changes.map((change) => {
                    const label = PERMISSION_LABELS.get(change.key) || change.key;
                    const valueText = change.type === 'added'
                      ? formatPermissionValue(change.to)
                      : change.type === 'removed'
                        ? formatPermissionValue(change.from)
                        : `${formatPermissionValue(change.from)} → ${formatPermissionValue(change.to)}`;
                    const badgeLabel = change.type === 'added' ? 'Added' : (change.type === 'removed' ? 'Removed' : 'Changed');
                    return (
                      <div key={`${change.key}-${change.type}`} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">{label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{valueText}</div>
                        </div>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 uppercase">
                          {badgeLabel}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setDetailsTargetId(null)}>
                Close
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
