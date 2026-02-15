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

  const addExistingUser = React.useCallback(async () => {
    if (!selected || !pendingAddUserId || operationInProgress) return;

    const orgId = getApiContext().orgId || '';
    if (!orgId) throw new Error('No organization');

    const originalMembers = [...members];
    const originalMemberCount = departments.find(d => d.id === selected)?.member_count || 0;

    // Optimistic update
    const userToAdd = orgUsers.find(u => u.userId === pendingAddUserId);
    if (userToAdd) {
      setMembers(prev => [
        ...prev,
        {
          userId: userToAdd.userId,
          role: pendingAddRole,
          displayName: userToAdd.displayName || undefined,
          email: userToAdd.email || undefined,
        }
      ]);
      setDepartments(prev => prev.map(d =>
        d.id === selected ? { ...d, member_count: (d.member_count || 0) + 1 } : d
      ));
    }

    setOperationInProgress('add-user');

    try {
      await apiFetch(`/orgs/${orgId}/departments/${selected}/users`, {
        method: 'POST',
        body: { userId: pendingAddUserId, role: pendingAddRole }
      });

      // Reset state
      setPendingAddUserId('');
      setPendingAddRole('member');
      setAddUserMode(null);

      toast({
        title: 'Member added',
        description: 'User has been added to the team.',
      });
    } catch (error: any) {
      // Rollback optimistic update
      setMembers(originalMembers);
      setDepartments(prev => prev.map(d =>
        d.id === selected ? { ...d, member_count: originalMemberCount } : d
      ));

      toast({
        title: 'Error adding member',
        description: error.message || 'Failed to add team member. Please try again.',
        variant: 'destructive' as any,
      });
    } finally {
      setOperationInProgress(null);
    }
  }, [selected, pendingAddUserId, pendingAddRole, members, departments, orgUsers, operationInProgress]);

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
          <h2 className="text-2xl font-bold">Team Management</h2>
          <p className="text-sm text-muted-foreground">
            Organize your teams and manage team members efficiently.
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

      {/* Two-Column Layout: Teams Sidebar + Members Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[600px]">
        {/* Left Panel: Teams List */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Teams</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {departments.length} teams
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  <TeamSkeleton />
                  <TeamSkeleton />
                  <TeamSkeleton />
                </div>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {departments.map((dept, index) => {
                    const color = getTeamColor(index);
                    const isSelected = selected === dept.id;
                    return (
                      <div
                        key={dept.id}
                        className={`p-3 mx-2 rounded-lg cursor-pointer transition-all duration-200 ${
                          isSelected
                            ? 'bg-primary/10 border border-primary/20 shadow-sm'
                            : 'hover:bg-muted/50 border border-transparent'
                        }`}
                        onClick={() => {
                          setSelected(dept.id);
                          setAddUserMode(null);
                          void loadMembers(dept.id);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`w-8 h-8 rounded-full ${color.class} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}>
                              {dept.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-medium text-sm truncate">{dept.name}</h4>
                              <p className="text-xs text-muted-foreground truncate">
                                {dept.name === 'Core' ? 'Primary workspace' :
                                 dept.name === 'Growth' ? 'Marketing & Growth' :
                                 dept.name === 'Ops' ? 'Operations & Support' :
                                 'Team workspace'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="w-3 h-3" />
                              <span>{dept.member_count || 0}</span>
                            </div>
                            {dept.name === 'Core' && (
                              <div className="text-xs text-purple-600">🔒</div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons for selected team */}
                        {isSelected && (
                          <div className="flex items-center gap-1 mt-3 pt-2 border-t border-border/50">
                            {isAdmin && dept.name !== 'Core' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEdit(dept);
                                }}
                                disabled={operationInProgress !== null}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                            )}
                            {isAdmin && dept.name !== 'Core' && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={operationInProgress !== null}
                                  >
                                    <Trash2 className="w-3 h-3" />
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
                          </div>
                        )}
                      </div>
                    );
                  })}
        </div>
      )}

      {/* Right Panel: Team Members */}
      <div className="lg:col-span-2">
        {selected ? (
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {(() => {
                    const selectedDept = departments.find(d => d.id === selected);
                    if (!selectedDept) return null;
                    const color = getTeamColor(departments.indexOf(selectedDept));
                    return (
                      <>
                        <div className={`w-8 h-8 rounded-full ${color.class} flex items-center justify-center text-white font-semibold text-sm`}>
                          {selectedDept.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <CardTitle className="text-lg">{selectedDept.name} Team</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {selectedDept.member_count || 0} members
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {membersLoading ? (
                <div className="space-y-3">
                  <MemberSkeleton />
                  <MemberSkeleton />
                  <MemberSkeleton />
                </div>
              ) : (
                <>
                  {/* Members List */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {members.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">No team members yet</p>
                        <p className="text-xs">Add members to get started</p>
                      </div>
                    ) : (
                      members.map((member) => (
                        <div key={member.userId} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
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
                      ))
                    )}
                  </div>

                  {/* Add Member Section */}
                  {departments.find(d => d.id === selected)?.name !== 'Core' && (
                    <div className="space-y-4 pt-4 border-t">
          
                      {!addUserMode && (
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium">Add Team Member</h4>
                          <div className="flex gap-2">
                            {isAdmin && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAddUserMode('existing')}
                                className="flex-1"
                              >
                                <Users className="w-4 h-4 mr-2" />
                                Add Existing User
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setAddUserMode('invite')}
                              className="flex-1"
                            >
                              <Users className="w-4 h-4 mr-2" />
                              Invite New User
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Existing User Selection */}
                      {addUserMode === 'existing' && isAdmin && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium">Add Existing User</h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAddUserMode(null)}
                            >
                              Back
                            </Button>
                          </div>
                          <div className="space-y-3">
                            <Input
                              placeholder="Search users by name or email..."
                              value={userQuery}
                              onChange={(e) => setUserQuery(e.target.value)}
                            />
                            <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
                              {orgUsers
                                .filter(u => !members.some(m => m.userId === u.userId))
                                .filter(u =>
                                  !userQuery ||
                                  (u.displayName || '').toLowerCase().includes(userQuery.toLowerCase()) ||
                                  (u.email || '').toLowerCase().includes(userQuery.toLowerCase())
                                )
                                .slice(0, 10)
                                .map(u => (
                                  <div key={u.userId} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
                                        {(u.displayName || u.email || 'U').charAt(0).toUpperCase()}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium">{u.displayName || 'Unknown'}</p>
                                        <p className="text-xs text-muted-foreground">{u.email}</p>
                                      </div>
                                    </div>
                                    <Select
                                      value={pendingAddRole}
                                      onValueChange={(v: 'lead'|'member') => {
                                        setPendingAddRole(v);
                                        setPendingAddUserId(u.userId);
                                      }}
                                    >
                                      <SelectTrigger className="w-24 h-8">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="member">Member</SelectItem>
                                        <SelectItem value="lead">Lead</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ))}
                              {orgUsers.filter(u => !members.some(m => m.userId === u.userId)).length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-2">No available users</p>
                              )}
                            </div>
                            {pendingAddUserId && (
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    await addExistingUser();
                                    setPendingAddUserId('');
                                    setPendingAddRole('member');
                                  }}
                                  disabled={operationInProgress?.startsWith('add-user')}
                                >
                                  {operationInProgress?.startsWith('add-user') ? 'Adding...' : 'Add User'}
                                </Button>
                              </div>
                            )}
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
                              onClick={() => setAddUserMode(null)}
                            >
                              Back
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <Input
                              placeholder="Email address"
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                            />
                            <Input
                              placeholder="Display name (optional)"
                              value={inviteName}
                              onChange={(e) => setInviteName(e.target.value)}
                            />
                            <Input
                              placeholder="Password (optional)"
                              type="password"
                              value={invitePassword}
                              onChange={(e) => setInvitePassword(e.target.value)}
                            />
                            <Select value={inviteRole} onValueChange={(v: 'member'|'guest') => setInviteRole(v)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="guest">Guest</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => {
                              setInviteEmail('');
                              setInviteName('');
                              setInvitePassword('');
                              setInviteRole('member');
                            }}>
                              Clear
                            </Button>
                            <Button
                              onClick={async () => {
                                if (!inviteEmail.trim()) return;
                                setInviting(true);
                                setOperationInProgress('invite-user');
                                try {
                                  const orgId = getApiContext().orgId || '';
                                  if (!orgId) throw new Error('No organization');

                                  const resp: any = await apiFetch(`/orgs/${orgId}/users`, {
                                    method: 'POST',
                                    body: {
                                      email: inviteEmail.trim(),
                                      display_name: inviteName.trim() || undefined,
                                      role: inviteRole,
                                      password: invitePassword.trim() || undefined,
                                    },
                                  });

                                  const userId = resp?.user_id || resp?.userId;
                                  if (userId) {
                                    await apiFetch(`/orgs/${orgId}/departments/${selected}/users`, {
                                      method: 'POST',
                                      body: { userId, role: 'member' }
                                    });

                                    // Update UI optimistically
                                    setDepartments(prev => prev.map(d =>
                                      d.id === selected ? { ...d, member_count: (d.member_count || 0) + 1 } : d
                                    ));
                                    setMembers(prev => [
                                      ...prev,
                                      {
                                        userId,
                                        role: 'member',
                                        displayName: inviteName.trim() || undefined,
                                        email: inviteEmail.trim()
                                      }
                                    ]);

                                    // Reset form
                                    setInviteEmail('');
                                    setInviteName('');
                                    setInvitePassword('');
                                    setInviteRole('member');
                                    setAddUserMode(null);

                                    toast({ title: 'Invited', description: 'User invited and added to team.' });
                                  }
                                } catch (error) {
                                  console.error('Invite error:', error);
                                  toast({
                                    title: 'Error inviting user',
                                    description: error instanceof Error ? error.message : 'Failed to invite user',
                                    variant: 'destructive'
                                  });
                                } finally {
                                  setInviting(false);
                                  setOperationInProgress(null);
                                }
                              }}
                              disabled={inviting || !inviteEmail.trim()}
                            >
                              {inviting ? 'Inviting...' : 'Send Invite'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="h-full">
            <CardContent className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center text-muted-foreground">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">Select a Team</h3>
                <p className="text-sm">Choose a team from the sidebar to view and manage its members.</p>
              </div>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
