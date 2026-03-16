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
