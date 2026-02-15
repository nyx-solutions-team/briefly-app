"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Users } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';

function TeamSkeleton() {
  return (
    <Card className="relative">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="flex items-center gap-1 mt-3">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex items-center gap-1 mt-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </CardContent>
    </Card>
  );
}

function MemberSkeleton() {
  return (
    <div className="flex items-center justify-between p-3 border-b">
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-8 w-8" />
      </div>
    </div>
  );
}

type Department = { 
  id: string; 
  org_id: string; 
  name: string; 
  lead_user_id?: string | null;
  member_count?: number;
  color?: string | null;
};

type OrgUser = { 
  userId: string; 
  displayName?: string | null; 
  email?: string | null;
};

const TEAM_COLORS = [
  { name: 'purple', class: 'bg-purple-500' },
  { name: 'blue', class: 'bg-blue-500' },
  { name: 'green', class: 'bg-green-500' },
  { name: 'orange', class: 'bg-orange-500' },
  { name: 'red', class: 'bg-red-500' },
  { name: 'pink', class: 'bg-pink-500' },
  { name: 'indigo', class: 'bg-indigo-500' },
  { name: 'teal', class: 'bg-teal-500' },
];

export default function TeamsManagement() {
  const { bootstrapData, hasPermission } = useAuth();
  const isAdmin = hasPermission('org.manage_members');
  const isTeamLead = (bootstrapData?.departments || []).some((d: any) => d?.is_lead);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState('purple');
  const [orgUsers, setOrgUsers] = React.useState<OrgUser[]>([]);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editColor, setEditColor] = React.useState<string>('purple');
  const [selected, setSelected] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<{ userId: string; role: 'lead'|'member'; displayName?: string|null; email?: string|null }[]>([]);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [userQuery, setUserQuery] = React.useState('');
  const [pendingAddUserId, setPendingAddUserId] = React.useState<string>('');
  const [pendingAddRole, setPendingAddRole] = React.useState<'lead'|'member'>('member');
  const [pendingAddPassword, setPendingAddPassword] = React.useState<string>('');
  const [setPasswordForExistingUser, setSetPasswordForExistingUser] = React.useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = React.useState<string>('');
  // Add user mode selection
  const [addUserMode, setAddUserMode] = React.useState<'existing' | 'invite' | null>(null);
  // Inline invite state for team leads/admins
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteName, setInviteName] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<'member'|'guest'>('member');
  const [invitePassword, setInvitePassword] = React.useState('');
  const [inviting, setInviting] = React.useState(false);
  const [operationInProgress, setOperationInProgress] = React.useState<string | null>(null);
  const { toast } = useToast();

  const refresh = React.useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setLoading(true);
    try {
      const list = await apiFetch<Department[]>(`/orgs/${orgId}/departments?withCounts=1&includeMine=1`);
      setDepartments(list || []);
      // Defer users fetch to reduce initial load; fetch on demand when user picker opens
    } finally { 
      setLoading(false); 
    }
  }, []);

  React.useEffect(() => { 
    void refresh(); 
  }, [refresh]);

  // Resolve current auth user id once for self-row checks
  React.useEffect(() => {
    (async () => {
      try {
        const sess = await supabase.auth.getSession();
        const uid = sess?.data?.session?.user?.id || '';
        setCurrentUserId(uid);
      } catch {}
    })();
  }, []);

  const loadMembers = React.useCallback(async (deptId: string) => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setMembersLoading(true);
    try {
      const rows = await apiFetch<any[]>(`/orgs/${orgId}/departments/${deptId}/users`);
      const mapped = (rows || []).map(r => ({ userId: r.userId, role: r.role, displayName: r.displayName, email: r.email }));
      setMembers(mapped);
      return mapped;
    } catch {
      setMembers([]);
      return [];
    } finally {
      setMembersLoading(false);
    }
  }, []);

  React.useEffect(() => { if (selected) void loadMembers(selected); }, [selected, loadMembers]);

  const removeMember = React.useCallback(async (userId: string) => {
    if (!selected || operationInProgress) return;

    const orgId = getApiContext().orgId || '';
    if (!orgId) throw new Error('No organization');

    const originalMembers = [...members];
    const originalMemberCount = departments.find(d => d.id === selected)?.member_count || 0;

    // Optimistic update
    setMembers(prev => prev.filter(m => m.userId !== userId));
    setDepartments(prev => prev.map(d =>
      d.id === selected ? { ...d, member_count: Math.max(0, (d.member_count || 0) - 1) } : d
    ));

    setOperationInProgress(`remove-${userId}`);

    try {
      await apiFetch(`/orgs/${orgId}/departments/${selected}/users/${userId}`, {
        method: 'DELETE'
      });

      toast({
        title: 'Member removed',
        description: 'User has been removed from the team.',
      });
    } catch (error: any) {
      // Rollback optimistic update
      setMembers(originalMembers);
      setDepartments(prev => prev.map(d =>
        d.id === selected ? { ...d, member_count: originalMemberCount } : d
      ));

      toast({
        title: 'Error removing member',
        description: error.message || 'Failed to remove team member. Please try again.',
        variant: 'destructive' as any,
      });
    } finally {
      setOperationInProgress(null);
    }
  }, [selected, members, departments, operationInProgress]);

  const onCreate = async () => {
    const orgId = getApiContext().orgId || '';
    if (!newName.trim() || operationInProgress) return;

    const teamName = newName.trim();
    const teamColor = newColor;
    setOperationInProgress('create');

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const optimisticDepartment = {
      id: tempId,
      org_id: orgId,
      name: teamName,
      color: teamColor,
      member_count: 0
    };

    setDepartments(prev => [...prev, optimisticDepartment]);
    setNewName('');
    setCreating(false);

    try {
      const response = await apiFetch(`/orgs/${orgId}/departments`, {
        method: 'POST',
        body: {
          name: teamName,
          color: teamColor
        }
      });

      // Replace optimistic update with real data
      setDepartments(prev => prev.map(d =>
        d.id === tempId ? { ...response, member_count: 0 } : d
      ));

      toast({
        title: 'Team created',
        description: `Team "${teamName}" has been created successfully.`,
      });
    } catch (error: any) {
      // Rollback optimistic update
      setDepartments(prev => prev.filter(d => d.id !== tempId));
      setNewName(teamName);
      setNewColor(teamColor);
      setCreating(true);

      toast({
        title: 'Error creating team',
        description: error.message || 'Failed to create team. Please try again.',
        variant: 'destructive' as any,
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const onRename = async (dept: Department, name: string) => {
    const orgId = getApiContext().orgId || '';
    if (operationInProgress) return;
    
    const originalName = dept.name;
    setOperationInProgress(`rename-${dept.id}`);

    // Optimistic update
    setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, name } : d));
    setEditing(null);

    try {
      await apiFetch(`/orgs/${orgId}/departments/${dept.id}`, {
        method: 'PATCH',
        body: { name }
      });

      toast({
        title: 'Team updated',
        description: `Team name has been updated to "${name}".`,
      });
    } catch (error: any) {
      // Rollback optimistic update
      setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, name: originalName } : d));
      setEditing(dept.id);
      setEditName(originalName);

      toast({
        title: 'Error updating team',
        description: error.message || 'Failed to update team. Please try again.',
        variant: 'destructive' as any,
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const onUpdate = async (dept: Department, name: string, color: string) => {
    const orgId = getApiContext().orgId || '';
    if (operationInProgress) return;
    
    const originalName = dept.name;
    const originalColor = dept.color;
    setOperationInProgress(`update-${dept.id}`);

    // Optimistic update
    setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, name, color } : d));
    setEditing(null);

    try {
      await apiFetch(`/orgs/${orgId}/departments/${dept.id}`, { method: 'PATCH', body: { name, color } });

      toast({ title: 'Team updated', description: 'Team details have been updated.' });
    } catch (error: any) {
      // Rollback optimistic update
      setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, name: originalName, color: originalColor } : d));
      setEditing(dept.id);
      setEditName(originalName);
      setEditColor(originalColor || 'purple');

      toast({ title: 'Error updating team', description: error.message || 'Failed to update team.', variant: 'destructive' as any });
    } finally {
      setOperationInProgress(null);
    }
  };

  const onDelete = async (dept: Department) => {
    const orgId = getApiContext().orgId || '';
    if (operationInProgress) return;

    // Store original state for rollback
    const originalDepartments = [...departments];
    const wasSelected = selected === dept.id;
    setOperationInProgress(`delete-${dept.id}`);

    // Optimistic update
    setDepartments(prev => prev.filter(d => d.id !== dept.id));
    if (wasSelected) {
      setSelected(null);
      setAddUserMode(null);
    }

    try {
      await apiFetch(`/orgs/${orgId}/departments/${dept.id}`, { method: 'DELETE' });

      toast({
        title: 'Team deleted',
        description: `Team "${dept.name}" has been deleted.`,
      });
    } catch (error: any) {
      // Rollback optimistic update
      setDepartments(originalDepartments);
      if (wasSelected) {
        setSelected(dept.id);
      }

      toast({
        title: 'Error deleting team',
        description: error.message || 'Failed to delete team. Please try again.',
        variant: 'destructive' as any,
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const startEdit = (dept: Department) => {
    setEditing(dept.id);
    setEditName(dept.name);
    setEditColor(dept.color || 'purple');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditName('');
  };

  const getTeamColor = (index: number) => {
    return TEAM_COLORS[index % TEAM_COLORS.length];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Teams</h2>
          <p className="text-sm text-muted-foreground">
            Create and organize teams for projects and departments.
          </p>
        </div>
        {isAdmin && (
          <Button 
            onClick={() => setCreating(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            + New Team
          </Button>
        )}
      </div>

      {/* Create New Team */}
      {isAdmin && creating && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Team</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Team Name</label>
                <Input
                  placeholder="Enter team name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && onCreate()}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Team Color</label>
                <Select value={newColor} onValueChange={setNewColor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_COLORS.map((color) => (
                      <SelectItem key={color.name} value={color.name}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full ${color.class}`} />
                          <span className="capitalize">{color.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={!newName.trim() || operationInProgress === 'create'}>
                {operationInProgress === 'create' ? 'Creating...' : 'Create Team'}
              </Button>
              <Button variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Teams Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <TeamSkeleton />
          <TeamSkeleton />
          <TeamSkeleton />
          <TeamSkeleton />
          <TeamSkeleton />
          <TeamSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept, index) => {
            const color = getTeamColor(index);
            return (
              <Card key={dept.id} className="relative">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${color.class} flex items-center justify-center text-white font-semibold`}>
                        {dept.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{dept.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {dept.name === 'Core' ? 'Primary workspace team' :
                           dept.name === 'Growth' ? 'Marketing & Growth' :
                           dept.name === 'Ops' ? 'Operations & Support' :
                           'Team workspace'}
                        </p>
                        <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span>{dept.member_count || 0} members</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isAdmin && dept.name !== 'Core' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(dept)}
                          disabled={operationInProgress !== null}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {dept.name !== 'Core' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelected(dept.id);
                            setAddUserMode(null); // Reset mode when switching teams
                            void loadMembers(dept.id);
                          }}
                          title="Manage members"
                        >
                          <Users className="w-4 h-4" />
                        </Button>
                      )}
                      {isAdmin && dept.name !== 'Core' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              disabled={operationInProgress !== null}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete team?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the "{dept.name}" team and remove all members. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(dept)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete Team
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {dept.name === 'Core' && (
                        <div className="px-3 py-1 bg-purple-100 text-purple-800 text-xs rounded-md border border-purple-200">
                          🔒 Restricted
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Members panel */}
      {selected && departments.find(d => d.id === selected)?.name !== 'Core' && (
        <div className="space-y-4">
            {/* Add User Options */}
            {!addUserMode && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Add Team Member</h4>
                {isAdmin ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setAddUserMode('existing')}
                      className="h-auto p-4 flex flex-col items-center gap-2"
                    >
                      <Users className="w-6 h-6" />
                      <div className="text-center">
                        <div className="font-medium">Add Existing User</div>
                        <div className="text-xs text-muted-foreground">Select from organization members</div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setAddUserMode('invite')}
                      className="h-auto p-4 flex flex-col items-center gap-2"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      <div className="text-center">
                        <div className="font-medium">Invite New User</div>
                        <div className="text-xs text-muted-foreground">Send invitation via email</div>
                      </div>
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => setAddUserMode('invite')}
                      className="h-auto p-4 flex flex-col items-center gap-2 min-w-[200px]"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      <div className="text-center">
                        <div className="font-medium">Invite New User</div>
                        <div className="text-xs text-muted-foreground">Send invitation via email</div>
                      </div>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Existing User Selection - Admin Only */}
            {addUserMode === 'existing' && isAdmin && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Add Existing User</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddUserMode(null);
                      setPendingAddUserId('');
                      setUserQuery('');
                      setPendingAddPassword('');
                      setSetPasswordForExistingUser(false);
                    }}
                  >
                    Back
                  </Button>
                </div>
            <div className="flex gap-2 items-end">
              <Input
                    placeholder="Search users..."
                className="w-48"
                value={userQuery}
                onChange={(e)=>setUserQuery(e.target.value)}
              />
              <Select value={pendingAddUserId} onValueChange={setPendingAddUserId} onOpenChange={async (open:boolean)=>{
                if (open && orgUsers.length === 0) {
                  try {
                    const orgId = getApiContext().orgId || '';
                    if (!orgId) return;
                    const users = await apiFetch<any[]>(`/orgs/${orgId}/users`);
                    setOrgUsers((users || []).map(u => ({ userId: u.userId, displayName: u.displayName || u.app_users?.display_name || '', email: u.email || '' })));
                  } catch {}
                }
              }}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  {orgUsers
                    .filter(u => !members.some(m => m.userId === u.userId))
                    .filter(u => (u.displayName || u.email || u.userId).toLowerCase().includes(userQuery.toLowerCase()))
                    .slice(0,50)
                    .map(u => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.displayName || u.email || u.userId}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={pendingAddRole} onValueChange={(value: 'lead'|'member') => {
                // Check if trying to select team lead when one already exists
                if (value === 'lead') {
                  const existingLead = members.find(member => member.role === 'lead');
                  if (existingLead) {
                    toast({
                      title: 'Cannot assign team lead',
                      description: `${existingLead.displayName || existingLead.email} is already the team lead. A team can only have one lead.`,
                      variant: 'destructive'
                    });
                    return;
                  }
                }
                setPendingAddRole(value);
              }}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  {isAdmin && (
                    <SelectItem
                      value="lead"
                      disabled={members.some(member => member.role === 'lead')}
                    >
                      Team Lead {members.some(member => member.role === 'lead') ? '(Already assigned)' : ''}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Password Setting Section */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="setPassword"
                  checked={setPasswordForExistingUser}
                  onChange={(e) => setSetPasswordForExistingUser(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="setPassword" className="text-sm font-medium">
                  Set password for this user
                </label>
              </div>
              {setPasswordForExistingUser && (
                <div className="flex gap-2 items-end">
                  <Input
                    type="password"
                    placeholder="Enter new password"
                    value={pendingAddPassword}
                    onChange={(e) => setPendingAddPassword(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPendingAddPassword('')}
                    disabled={!pendingAddPassword}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={async ()=>{
                if (!pendingAddUserId || operationInProgress) return;
                
                // Check if trying to add as team lead when one already exists
                if (pendingAddRole === 'lead') {
                  const existingLead = members.find(member => member.role === 'lead');
                  if (existingLead) {
                    toast({
                      title: 'Cannot assign team lead',
                      description: `${existingLead.displayName || existingLead.email} is already the team lead. A team can only have one lead.`,
                      variant: 'destructive'
                    });
                    return;
                  }
                }
                
                const orgId = getApiContext().orgId || '';
                const added = orgUsers.find(u => u.userId === pendingAddUserId);
                setOperationInProgress(`add-user-${pendingAddUserId}`);

                // Store original state for rollback
                const originalMembers = [...members];
                const originalMemberCount = departments.find(d => d.id === selected)?.member_count || 0;

                // Optimistic update
                if (added) {
                  setMembers(prev => prev.some(m => m.userId === added.userId) ? prev : prev.concat([{ userId: added.userId, role: pendingAddRole, displayName: added.displayName, email: added.email }]));
                  setDepartments(prev => prev.map(d => d.id === selected ? { ...d, member_count: (d.member_count || 0) + 1 } : d));
                }
                setPendingAddUserId('');
                setUserQuery('');
                setPendingAddPassword('');
                setSetPasswordForExistingUser(false);
                setAddUserMode(null);

                try {
                  // Ensure only valid department roles are sent (department API doesn't support 'guest')
                  const departmentRole = pendingAddRole === 'lead' || pendingAddRole === 'member' ? pendingAddRole : 'member';

                  // If password is being set, update the user's password first
                  if (setPasswordForExistingUser && pendingAddPassword.trim()) {
                    await apiFetch(`/orgs/${orgId}/users/${pendingAddUserId}`, {
                      method: 'PATCH',
                      body: { password: pendingAddPassword.trim() }
                    });
                  }

                  // Add user to department
                  await apiFetch(`/orgs/${orgId}/departments/${selected}/users`, { method: 'POST', body: { userId: pendingAddUserId, role: departmentRole } });

                  // Trigger org users changed event for other components
                  try { window.dispatchEvent(new CustomEvent('org-users-changed')); } catch {}
                } catch (error: any) {
                  // Rollback optimistic update
                  setMembers(originalMembers);
                  setDepartments(prev => prev.map(d => d.id === selected ? { ...d, member_count: originalMemberCount } : d));
                  setPendingAddUserId(pendingAddUserId);
                  setAddUserMode('existing');

                  toast({
                    title: 'Error adding member',
                    description: error.message || 'Failed to add team member. Please try again.',
                    variant: 'destructive' as any,
                  });
                } finally {
                  setOperationInProgress(null);
                }
              }} disabled={operationInProgress?.startsWith('add-user')}>{
                operationInProgress?.startsWith('add-user') ? 'Adding...' : 'Add'
              }</Button>
            </div>
              </div>
            )}
            {/* Invite New User */}
            {addUserMode === 'invite' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Invite New User</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddUserMode(null);
                      setInviteEmail('');
                      setInviteName('');
                      setInvitePassword('');
                      setInviteRole('member');
                    }}
                  >
                    Back
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <Input 
                placeholder="Invite email"
                value={inviteEmail}
                onChange={(e)=>setInviteEmail(e.target.value)}
              />
              <Input 
                placeholder="Display name (optional)"
                value={inviteName}
                onChange={(e)=>setInviteName(e.target.value)}
              />
              <Input 
                type="password"
                placeholder="Password (required)"
                value={invitePassword}
                onChange={(e)=>setInvitePassword(e.target.value)}
              />
              <Select value={inviteRole} onValueChange={(v: 'member'|'guest') => setInviteRole(v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="guest">Guest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={()=>{ setInviteEmail(''); setInviteName(''); setInvitePassword(''); setInviteRole('member'); }}>Clear</Button>
                <Button 
                  onClick={async ()=>{
                    const orgId = getApiContext().orgId || '';
                    if (!orgId || !inviteEmail.trim() || !invitePassword.trim() || !selected || operationInProgress) return;
                    setInviting(true);
                    setOperationInProgress('invite-user');
                    try {
                      const resp: any = await apiFetch(`/orgs/${orgId}/users`, {
                        method: 'POST',
                        body: {
                          email: inviteEmail.trim(),
                          display_name: inviteName.trim() || undefined,
                          role: inviteRole,
                          password: invitePassword.trim(),
                        },
                      });
                      const userId = resp?.user_id || resp?.userId;
                      if (userId) {
                        // Always add invited users as 'member' to department (regardless of their org role)
                        await apiFetch(`/orgs/${orgId}/departments/${selected}/users`, { method: 'POST', body: { userId, role: 'member' } });
                        setInviteEmail(''); setInviteName(''); setInvitePassword(''); setInviteRole('member');
                            setAddUserMode(null);
                        // Optimistic update for member count
                        setDepartments(prev => prev.map(d => d.id === selected ? { ...d, member_count: (d.member_count || 0) + 1 } : d));
                        // Add the new user to members list optimistically
                        setMembers(prev => [
                          ...prev,
                          {
                            userId,
                            role: 'member',
                            displayName: inviteName.trim() || undefined,
                            email: inviteEmail.trim()
                          }
                        ]);
                        try { window.dispatchEvent(new CustomEvent('org-users-changed')); } catch {}
                        toast({ title: 'Invited', description: 'User invited and added to team.' });
                      }
                    } catch (e: any) {
                      toast({ title: 'Invite failed', description: e?.message || 'Could not invite user', variant: 'destructive' as any });
                    } finally { 
                      setInviting(false);
                      setOperationInProgress(null);
                    }
                  }}
                  disabled={inviting || !inviteEmail.trim() || !invitePassword.trim() || operationInProgress === 'invite-user'}
                >{inviting || operationInProgress === 'invite-user' ? 'Inviting...' : 'Invite & Add'}</Button>
              </div>
            </div>
              </div>
            )}

            {/* Members List */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Team Members ({members.length})</h4>
              {membersLoading ? (
                <div className="space-y-3">
                  <MemberSkeleton />
                  <MemberSkeleton />
                  <MemberSkeleton />
                </div>
              ) : members.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-muted rounded-lg">
                  <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No members in this team yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => (
                    <div key={member.userId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                          {(member.displayName || member.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">
                            {member.displayName || 'Unknown User'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          variant={member.role === 'lead' ? 'default' : 'secondary'}
                          className="text-xs capitalize"
                        >
                          {member.role}
                        </Badge>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            onClick={() => removeMember(member.userId)}
                            disabled={operationInProgress?.startsWith('remove')}
                            title="Remove member"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>
      )}
      {selected && departments.find(d => d.id === selected)?.name === 'Core' && (
        <Card>
          <CardHeader>
            <CardTitle>Core Team</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span className="font-medium">Restricted Department</span>
              </div>
              <p>The Core department is managed exclusively by administrators. Team members cannot be added or removed from this department to maintain system integrity.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Team Modal */}
      {editing && (
        <AlertDialog open={!!editing} onOpenChange={(open)=>{ if(!open) cancelEdit(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit Team</AlertDialogTitle>
              <AlertDialogDescription>Update the team name and color.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <label className="text-sm font-medium">Team Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && onRename(departments.find(d => d.id === editing)!, editName)}
              />
              <div>
                <label className="text-sm font-medium">Team Color</label>
                <Select value={editColor} onValueChange={setEditColor}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEAM_COLORS.map((color) => (
                      <SelectItem key={color.name} value={color.name}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full ${color.class}`} />
                          <span className="capitalize">{color.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancelEdit}>Cancel</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button 
                  onClick={() => onUpdate(departments.find(d => d.id === editing)!, editName, editColor)} 
                  disabled={!editName.trim() || operationInProgress !== null}
                >
                  {operationInProgress?.startsWith('update-') ? 'Saving...' : 'Save Changes'}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {!loading && departments.length === 0 && (
        <div className="text-center py-8">
          <div className="text-sm text-muted-foreground">No teams created yet. Create your first team to get started.</div>
        </div>
      )}
    </div>
  );
}
