"use client";
import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { apiFetch, getApiContext } from '@/lib/api';


type OrgRole = {
  org_id: string;
  key: string;
  name: string;
  description?: string | null;
  is_system: boolean;
  permissions: Record<string, boolean | string>;  // Allow string for dashboard.view
};

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
        description: 'Can upload new documents to the system',
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
        description: 'Can remove documents from the system',
        userFriendly: true
      },
      {
        key: 'documents.share',
        label: 'Share Documents',
        description: 'Can create external or internal share links for documents',
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

function groupBy<T, K extends string>(list: T[], getKey: (t: T) => K) {
  return list.reduce((acc, item) => {
    const k = getKey(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

function getDerivedPagePermission(rolePermissions: Record<string, boolean | string>, key: string) {
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
}

export default function RolesManagement() {
  const [roles, setRoles] = React.useState<OrgRole[]>([]);
  const [loading, setLoading] = React.useState(false);
  // Access is limited to core roles only; creation disabled
  const [creating] = React.useState(false);
  const [newRole] = React.useState({ key: '', name: '', description: '' });

  const refresh = React.useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await apiFetch<OrgRole[]>(`/orgs/${orgId}/roles`, { skipCache: true });
      const roleOrder = ['owner', 'orgAdmin', 'teamLead', 'contentManager', 'member', 'contentViewer', 'guest'];
      const sorted = (data || []).sort((a, b) => {
        const aSystem = a.is_system ? 0 : 1;
        const bSystem = b.is_system ? 0 : 1;
        if (aSystem !== bSystem) return aSystem - bSystem;
        const aIndex = roleOrder.indexOf(a.key);
        const bIndex = roleOrder.indexOf(b.key);
        if (aIndex === -1 && bIndex === -1) return (a.name || a.key).localeCompare(b.name || b.key);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
      setRoles(sorted);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const onToggle = async (role: OrgRole, permKey: string, value: boolean | string) => {
    const orgId = getApiContext().orgId || '';
    const nextPerms = { ...(role.permissions || {}), [permKey]: value };
    await apiFetch(`/orgs/${orgId}/roles/${encodeURIComponent(role.key)}`, {
      method: 'PATCH',
      body: { permissions: nextPerms },
    });
    setRoles(prev => prev.map(r => r.key === role.key ? { ...r, permissions: nextPerms } : r));
  };

  const onCreate = async () => {};

  const onDelete = async (_role: OrgRole) => {};

  // Filter permissions to only show user-friendly ones
  const getVisiblePermissions = (rolePermissions: Record<string, boolean | string>) => {
    const visible: Record<string, boolean | string> = {};
    Object.entries(rolePermissions).forEach(([key, value]) => {
      if (!HIDDEN_PERMISSIONS.includes(key)) {
        visible[key] = value;
      }
    });
    return visible;
  };

  const roleLabel = (key: string, name: string) => {
    switch (key) {
      case 'orgAdmin': return 'Admin';
      case 'teamLead': return 'Team Lead';
      case 'member': return 'Member';
      case 'contentManager': return 'Content Manager';
      case 'contentViewer': return 'Content Viewer';
      default: return name || key;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles & Permissions</CardTitle>
        <p className="text-sm text-muted-foreground">Core roles for this organization.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{roles.length} roles</div>
          {/* Role creation disabled in limited access mode */}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading roles…</div>) : (
          <div className="space-y-6">
            {roles.map(role => (
              <div key={role.key} className="border rounded-md p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {roleLabel(role.key, role.name)} <span className="text-muted-foreground text-xs">({role.key})</span>
                    </div>
                    {role.description && <div className="text-xs text-muted-foreground">{role.description}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">System</Badge>
                  </div>
                </div>
                <div className="mt-4 space-y-6">
                  {PERMISSION_CATEGORIES.map(category => {
                    const categoryPermissions = category.permissions.filter(p =>
                      getVisiblePermissions(role.permissions)[p.key] !== undefined
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
                            // Handle dashboard.view as select dropdown
                            if (p.key === 'dashboard.view') {
                              const permValue = role.permissions?.[p.key];
                              // Handle both string and boolean values (for backward compatibility)
                              const currentValue = typeof permValue === 'string' 
                                ? permValue 
                                : (typeof permValue === 'boolean' && permValue 
                                  ? 'admin'  // If true, treat as admin
                                  : 'regular');  // Default to regular
                              return (
                                <div key={p.key} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                  <div className="flex-1">
                                    <div className="text-sm font-medium mb-1">{p.label}</div>
                                    <div className="text-xs text-muted-foreground mb-2">{p.description}</div>
                                    <select
                                      value={currentValue}
                                      onChange={(e) => onToggle(role, p.key, e.target.value)}
                                      className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                                    >
                                      {p.options?.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            }
                            
                            // Regular boolean permission checkbox
                            const rawValue = role.permissions?.[p.key];
                            const derivedValue = p.key.startsWith('pages.') && rawValue === undefined
                              ? getDerivedPagePermission(role.permissions || {}, p.key)
                              : undefined;
                            const displayValue = typeof rawValue === 'boolean'
                              ? rawValue
                              : (derivedValue === undefined ? !!rawValue : derivedValue);
                            const isDerived = rawValue === undefined && derivedValue !== undefined;
                            return (
                              <div key={p.key} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    checked={displayValue === true}
                                    onCheckedChange={(v:any) => {
                                      onToggle(role, p.key, !!v);
                                    }}
                                  />
                                  <div>
                                    <div className="text-sm font-medium">{p.label}</div>
                                    <div className="text-xs text-muted-foreground">{p.description}</div>
                                    {isDerived && (
                                      <div className="text-[10px] text-muted-foreground/70 mt-1">Defaulted from functional permissions</div>
                                    )}
                                  </div>
                                </div>
                                <Badge variant={displayValue ? "default" : "secondary"}>
                                  {isDerived ? "Default" : (displayValue ? "Enabled" : "Disabled")}
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
            ))}
            {roles.length === 0 && <div className="text-sm text-muted-foreground">No roles yet.</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
