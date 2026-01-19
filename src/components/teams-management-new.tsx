"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Crown,
  User,
  Mail,
  UserPlus,
  UserCheck,
  X,
  Key,
  AlertTriangle
} from 'lucide-react';
import { clearCacheForEndpoint } from '@/lib/api';
import { apiFetch, getApiContext } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

type Department = {
  id: string;
  org_id: string;
  name: string;
  lead_user_id?: string | null;
  member_count?: number;
  color?: string | null;
};

type TeamMember = {
  userId: string;
  role: 'lead' | 'member' | 'guest';
  orgRole?: 'orgAdmin' | 'teamLead' | 'member';
  displayName?: string | null;
  email?: string | null;
  avatar?: string | null;
  expiresAt?: string | null;
};

type OrgUser = {
  userId: string;
  displayName?: string | null;
  email?: string | null;
};

const TEAM_COLORS = [
  { name: 'purple', class: 'bg-purple-500', bgClass: 'bg-purple-100', textClass: 'text-purple-800' },
  { name: 'blue', class: 'bg-blue-500', bgClass: 'bg-blue-100', textClass: 'text-blue-800' },
  { name: 'green', class: 'bg-green-500', bgClass: 'bg-green-100', textClass: 'text-green-800' },
  { name: 'orange', class: 'bg-orange-500', bgClass: 'bg-orange-100', textClass: 'text-orange-800' },
  { name: 'red', class: 'bg-red-500', bgClass: 'bg-red-100', textClass: 'text-red-800' },
  { name: 'pink', class: 'bg-pink-500', bgClass: 'bg-pink-100', textClass: 'text-pink-800' },
  { name: 'indigo', class: 'bg-indigo-500', bgClass: 'bg-indigo-100', textClass: 'text-indigo-800' },
  { name: 'teal', class: 'bg-teal-500', bgClass: 'bg-teal-100', textClass: 'text-teal-800' },
];

function TeamSkeleton() {
  return (
    <div className="p-3 border-b border-border/50 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="flex-1 min-w-0">
          <Skeleton className="h-4 w-24 mb-1" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="w-6 h-6 rounded-full" />
      </div>
    </div>
  );
}

function MemberSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 border-b border-border/50">
      <Skeleton className="w-8 h-8 rounded-full" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-4 w-32 mb-1" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="w-16 h-6 rounded-full" />
    </div>
  );
}

function getTeamColor(dept: Department) {
  const color = TEAM_COLORS.find(c => c.name === dept.color);
  return color || TEAM_COLORS[0];
}

export default function TeamsManagementNew() {
  const { user, bootstrapData } = useAuth();
  const isAdmin = user?.role === 'systemAdmin';
  const isTeamLead = user?.role === 'teamLead';
  const currentUserId = bootstrapData?.user?.id;
  const canManageMembers = bootstrapData?.permissions?.['org.manage_members'] === true;
  const canManageTeamMembers = bootstrapData?.permissions?.['departments.manage_members'] === true;
  const canEditUsers = canManageMembers || canManageTeamMembers;

  // Debug logging for permissions
  console.log('Teams Management Debug:', {
    userId: currentUserId,
    canManageMembers,
    canManageTeamMembers,
    canEditUsers,
    allPermissions: bootstrapData?.permissions
  });

  // Teams state
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(null);

  // Members state
  const [members, setMembers] = React.useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = React.useState(false);

  // Create team state
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [newTeamName, setNewTeamName] = React.useState('');
  const [newTeamColor, setNewTeamColor] = React.useState('purple');
  const [creating, setCreating] = React.useState(false);

  // Edit team state
  const [editingTeam, setEditingTeam] = React.useState<Department | null>(null);
  const [editTeamName, setEditTeamName] = React.useState('');
  const [editTeamColor, setEditTeamColor] = React.useState('purple');

  // Search state
  const [searchQuery, setSearchQuery] = React.useState('');

  // Add member state
  const [showAddMember, setShowAddMember] = React.useState(false);
  const [addMemberMode, setAddMemberMode] = React.useState<'existing' | 'invite' | null>(null);
  const [orgUsers, setOrgUsers] = React.useState<OrgUser[]>([]);
  const [userSearchQuery, setUserSearchQuery] = React.useState('');

  // Remove member confirmation state
  const [memberToRemove, setMemberToRemove] = React.useState<TeamMember | null>(null);
  const [selectedUserId, setSelectedUserId] = React.useState<string>('');
  const [selectedRole, setSelectedRole] = React.useState<'member' | 'lead'>('member');

  // Invite user state
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteName, setInviteName] = React.useState('');
  const [invitePassword, setInvitePassword] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<'member' | 'lead'>('member');
  const [inviting, setInviting] = React.useState(false);

  // Edit member state
  const [editingMember, setEditingMember] = React.useState<TeamMember | null>(null);
  const [editMemberRole, setEditMemberRole] = React.useState<'member' | 'lead'>('member');
  const [editMemberName, setEditMemberName] = React.useState('');
  // Change password modal state
  const [changePasswordMember, setChangePasswordMember] = React.useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmNewPassword, setConfirmNewPassword] = React.useState('');

  // Loading states
  const [operationInProgress, setOperationInProgress] = React.useState<string | null>(null);

  const { toast } = useToast();

  // Load teams
  const loadTeams = React.useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;

    setLoading(true);
    try {
      const list = await apiFetch<Department[]>(`/orgs/${orgId}/departments?withCounts=1&includeMine=1`);
      setDepartments(list || []);
    } catch (error) {
      console.error('Failed to load teams:', error);
      toast({
        title: 'Error',
        description: 'Failed to load teams',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load team members
  const loadTeamMembers = React.useCallback(async (teamId: string) => {
    setMembersLoading(true);
    try {
      const orgId = getApiContext().orgId || '';
      const membersList = await apiFetch<TeamMember[]>(`/orgs/${orgId}/departments/${teamId}/users`);
      setMembers(membersList || []);
    } catch (error) {
      console.error('Failed to load team members:', error);
      toast({
        title: 'Error',
        description: 'Failed to load team members',
        variant: 'destructive'
      });
    } finally {
      setMembersLoading(false);
    }
  }, [toast]);

  // Create team
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;

    setCreating(true);
    try {
      const orgId = getApiContext().orgId || '';
      await apiFetch(`/orgs/${orgId}/departments`, {
        method: 'POST',
        body: { name: newTeamName.trim(), color: newTeamColor }
      });

      toast({
        title: 'Success',
        description: `Team "${newTeamName}" created successfully`
      });

      setNewTeamName('');
      setNewTeamColor('purple');
      setShowCreateForm(false);
      await loadTeams();
    } catch (error) {
      console.error('Failed to create team:', error);
      toast({
        title: 'Error',
        description: 'Failed to create team',
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  // Update team
  const handleUpdateTeam = async () => {
    if (!editingTeam || !editTeamName.trim()) return;

    try {
      const orgId = getApiContext().orgId || '';
      await apiFetch(`/orgs/${orgId}/departments/${editingTeam.id}`, {
        method: 'PATCH',
        body: { name: editTeamName.trim(), color: editTeamColor }
      });

      toast({
        title: 'Success',
        description: `Team updated successfully`
      });

      setEditingTeam(null);
      await loadTeams();
    } catch (error) {
      console.error('Failed to update team:', error);
      toast({
        title: 'Error',
        description: 'Failed to update team',
        variant: 'destructive'
      });
    }
  };

  // Delete team
  const handleDeleteTeam = async (team: Department) => {
    try {
      const orgId = getApiContext().orgId || '';
      await apiFetch(`/orgs/${orgId}/departments/${team.id}`, {
        method: 'DELETE'
      });

      toast({
        title: 'Success',
        description: `Team "${team.name}" deleted successfully`
      });

      if (selectedTeamId === team.id) {
        setSelectedTeamId(null);
        setMembers([]);
      }
      await loadTeams();
    } catch (error) {
      console.error('Failed to delete team:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete team',
        variant: 'destructive'
      });
    }
  };

  // Handle team selection
  const handleTeamSelect = (teamId: string) => {
    setSelectedTeamId(teamId);
    loadTeamMembers(teamId);
    // Reset member-related states when switching teams
    setShowAddMember(false);
    setAddMemberMode(null);
    setEditingMember(null);
  };

  // Change team lead
  const [changingLead, setChangingLead] = React.useState(false);

  const handleChangeTeamLead = async (newLeadUserId: string | null) => {
    if (!selectedTeamId || changingLead) return;

    setChangingLead(true);
    try {
      const orgId = getApiContext().orgId || '';

      // Get current lead's user id if any
      const currentLead = members.find(m => m.role === 'lead');

      // If setting a new lead (not removing)
      if (newLeadUserId) {
        // Set the new user's role to lead
        await apiFetch(`/orgs/${orgId}/departments/${selectedTeamId}/users`, {
          method: 'POST',
          body: { userId: newLeadUserId, role: 'lead' }
        });

        // If there was a previous lead (different from new), demote them to member
        if (currentLead && currentLead.userId !== newLeadUserId) {
          await apiFetch(`/orgs/${orgId}/departments/${selectedTeamId}/users`, {
            method: 'POST',
            body: { userId: currentLead.userId, role: 'member' }
          });
        }
      } else {
        // Removing lead - just demote current lead to member
        if (currentLead) {
          await apiFetch(`/orgs/${orgId}/departments/${selectedTeamId}/users`, {
            method: 'POST',
            body: { userId: currentLead.userId, role: 'member' }
          });
        }
      }

      toast({
        title: 'Success',
        description: newLeadUserId ? 'Team lead changed successfully' : 'Team lead removed'
      });

      // Clear caches and reload
      clearCacheForEndpoint(`/orgs/${orgId}/departments/${selectedTeamId}/users`);
      clearCacheForEndpoint(`/orgs/${orgId}/departments?withCounts=1&includeMine=1`);
      await loadTeamMembers(selectedTeamId);
      await loadTeams();
    } catch (error) {
      console.error('Failed to change team lead:', error);
      toast({
        title: 'Error',
        description: 'Failed to change team lead',
        variant: 'destructive'
      });
    } finally {
      setChangingLead(false);
    }
  };

  // Get current team lead
  const currentTeamLead = React.useMemo(() => {
    return members.find(m => m.role === 'lead') || null;
  }, [members]);

  // Load organization users for adding existing members
  const loadOrgUsers = React.useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;

    try {
      const users = await apiFetch<OrgUser[]>(`/orgs/${orgId}/users`);
      setOrgUsers(users || []);
    } catch (error) {
      console.error('Failed to load organization users:', error);
    }
  }, [toast]);

  // Add existing user to team
  const handleAddExistingUser = async () => {
    if (!selectedUserId || !selectedTeamId || operationInProgress) return;

    setOperationInProgress('add-user');
    try {
      const orgId = getApiContext().orgId || '';
      const user = orgUsers.find(u => u.userId === selectedUserId);

      // Optimistic update
      if (user) {
        setMembers(prev => [...prev, {
          userId: user.userId,
          role: selectedRole,
          displayName: user.displayName,
          email: user.email
        }]);
      }

      await apiFetch(`/orgs/${orgId}/departments/${selectedTeamId}/users`, {
        method: 'POST',
        body: { userId: selectedUserId, role: selectedRole }
      });

      toast({
        title: 'Success',
        description: `${user?.displayName || user?.email || 'User'} added to team`
      });

      // Update department count locally for instant feedback
      setDepartments(prev => prev.map(dept =>
        dept.id === selectedTeamId
          ? { ...dept, member_count: (dept.member_count || 0) + 1 }
          : dept
      ));

      // Reset form
      setSelectedUserId('');
      setSelectedRole('member');
      setAddMemberMode(null);
      setShowAddMember(false);

      // Clear caches and refresh from server
      const currentOrgId = getApiContext().orgId || '';
      if (currentOrgId && selectedTeamId) {
        clearCacheForEndpoint(`/orgs/${currentOrgId}/departments/${selectedTeamId}/users`);
        clearCacheForEndpoint(`/orgs/${currentOrgId}/departments?withCounts=1&includeMine=1`);
      }

      // Refresh data from server
      await loadTeamMembers(selectedTeamId);
      await loadTeams();

    } catch (error) {
      console.error('Failed to add user to team:', error);
      toast({
        title: 'Error',
        description: 'Failed to add user to team',
        variant: 'destructive'
      });
      // Revert optimistic update
      // Clear cache before reloading to ensure we get fresh data
      const currentOrgId = getApiContext().orgId || '';
      if (currentOrgId && selectedTeamId) {
        clearCacheForEndpoint(`/orgs/${currentOrgId}/departments/${selectedTeamId}/users`);
      }
      await loadTeamMembers(selectedTeamId);
    } finally {
      setOperationInProgress(null);
    }
  };

  // Invite new user to team
  const handleInviteUser = async () => {
    if (!inviteEmail.trim() || !invitePassword.trim() || !selectedTeamId || operationInProgress) return;

    setInviting(true);
    setOperationInProgress('invite-user');
    try {
      const orgId = getApiContext().orgId || '';

      const response = await apiFetch(`/orgs/${orgId}/users`, {
        method: 'POST',
        body: {
          email: inviteEmail.trim(),
          display_name: inviteName.trim() || undefined,
          role: inviteRole === 'lead' ? 'member' : inviteRole,
          password: invitePassword
        }
      });

      const userId = response?.user_id || response?.userId;
      if (userId) {
        await apiFetch(`/orgs/${orgId}/departments/${selectedTeamId}/users`, {
          method: 'POST',
          body: { userId, role: inviteRole === 'lead' ? 'lead' : 'member' }
        });

        // Update department count locally for instant feedback
        setDepartments(prev => prev.map(dept =>
          dept.id === selectedTeamId
            ? { ...dept, member_count: (dept.member_count || 0) + 1 }
            : dept
        ));

        toast({
          title: 'Success',
          description: 'User invited and added to team'
        });

        // Reset form
        setInviteEmail('');
        setInviteName('');
        setInvitePassword('');
        setInviteRole('member');
        setAddMemberMode(null);
        setShowAddMember(false);

        // Clear caches and refresh from server
        const currentOrgId = getApiContext().orgId || '';
        if (currentOrgId && selectedTeamId) {
          clearCacheForEndpoint(`/orgs/${currentOrgId}/departments/${selectedTeamId}/users`);
          clearCacheForEndpoint(`/orgs/${currentOrgId}/departments?withCounts=1&includeMine=1`);
        }

        // Refresh data from server
        await loadTeamMembers(selectedTeamId);
        await loadTeams();
      }
    } catch (error) {
      console.error('Failed to invite user:', error);
      toast({
        title: 'Error',
        description: 'Failed to invite user',
        variant: 'destructive'
      });
      // Clear cache before reloading to ensure we get fresh data
      const currentOrgId = getApiContext().orgId || '';
      if (currentOrgId && selectedTeamId) {
        clearCacheForEndpoint(`/orgs/${currentOrgId}/departments/${selectedTeamId}/users`);
      }
      // Reload team members to revert optimistic update
      await loadTeamMembers(selectedTeamId);
    } finally {
      setInviting(false);
      setOperationInProgress(null);
    }
  };

  // Change password for member
  const handleChangePassword = async () => {
    if (!changePasswordMember || !selectedTeamId || operationInProgress) return;

    // Validate password fields
    if (!newPassword || !confirmNewPassword) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in both password fields',
        variant: 'destructive'
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast({
        title: 'Validation Error',
        description: 'Passwords do not match',
        variant: 'destructive'
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Validation Error',
        description: 'Password must be at least 6 characters long',
        variant: 'destructive'
      });
      return;
    }

    setOperationInProgress('change-password');
    try {
      const orgId = getApiContext().orgId || '';

      console.log('🔐 Frontend: Attempting to change password for user:', changePasswordMember.userId);

      // Update password
      const response = await apiFetch(`/orgs/${orgId}/users/${changePasswordMember.userId}`, {
        method: 'PATCH',
        body: {
          password: newPassword
        }
      });

      console.log('🔐 Frontend: Password change response:', response);

      toast({
        title: 'Success',
        description: 'Password changed successfully'
      });

      // Reset form and close modal
      setNewPassword('');
      setConfirmNewPassword('');
      setChangePasswordMember(null);

    } catch (error) {
      console.error('Failed to change password:', error);
      toast({
        title: 'Error',
        description: 'Failed to change password. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  // Edit member role
  const handleEditMemberRole = async () => {
    if (!editingMember || !selectedTeamId || operationInProgress) return;



    setOperationInProgress('edit-member');
    try {
      const orgId = getApiContext().orgId || '';

      // Prepare update data
      const updateData: any = {};

      // Only include role if it's editable (not hidden for team leads editing themselves)
      if (!(isTeamLead && editingMember?.userId === currentUserId)) {
        updateData.role = editMemberRole === 'lead' ? 'teamLead' : 'member';
      }

      // Add name if changed
      if (editMemberName !== (editingMember.displayName || '')) {
        updateData.display_name = editMemberName === '' ? null : editMemberName;
      }

      // Update user role, expiration, name, and/or password
      await apiFetch(`/orgs/${orgId}/users/${editingMember.userId}`, {
        method: 'PATCH',
        body: updateData
      });

      toast({
        title: 'Success',
        description: 'Member details updated successfully'
      });

      // Explicitly clear cache and refresh member data
      const currentOrgId = getApiContext().orgId || '';
      if (currentOrgId && selectedTeamId) {
        clearCacheForEndpoint(`/orgs/${currentOrgId}/departments/${selectedTeamId}/users`);
      }
      if (selectedTeamId) {
        await loadTeamMembers(selectedTeamId);
      }

      setEditingMember(null);

    } catch (error) {
      console.error('Failed to update member role:', error);
      toast({
        title: 'Error',
        description: 'Failed to update member role',
        variant: 'destructive'
      });
      // Clear cache before reloading to ensure we get fresh data
      const currentOrgId = getApiContext().orgId || '';
      if (currentOrgId && selectedTeamId) {
        clearCacheForEndpoint(`/orgs/${currentOrgId}/departments/${selectedTeamId}/users`);
      }
      // Reload team members to revert optimistic update
      if (selectedTeamId) {
        await loadTeamMembers(selectedTeamId);
      }
    } finally {
      setOperationInProgress(null);
    }
  };

  // Show remove member confirmation
  const showRemoveMemberConfirmation = (member: TeamMember) => {
    setMemberToRemove(member);
  };

  // Remove member from team (called from confirmation modal)
  const handleRemoveMember = async () => {
    if (!selectedTeamId || !memberToRemove || operationInProgress) return;

    setOperationInProgress('remove-member');
    try {
      const orgId = getApiContext().orgId || '';

      await apiFetch(`/orgs/${orgId}/departments/${selectedTeamId}/users/${memberToRemove.userId}`, {
        method: 'DELETE'
      });

      toast({
        title: 'Success',
        description: `${memberToRemove.displayName || memberToRemove.email || 'Member'} removed from team`
      });

      // Update local state first for instant UI feedback
      setMembers(prev => prev.filter(m => m.userId !== memberToRemove.userId));

      // Update department count locally for instant feedback
      setDepartments(prev => prev.map(dept =>
        dept.id === selectedTeamId
          ? { ...dept, member_count: Math.max(0, (dept.member_count || 0) - 1) }
          : dept
      ));

      // Clear caches and refresh from server
      const currentOrgId = getApiContext().orgId || '';
      if (currentOrgId && selectedTeamId) {
        clearCacheForEndpoint(`/orgs/${currentOrgId}/departments/${selectedTeamId}/users`);
        clearCacheForEndpoint(`/orgs/${currentOrgId}/departments?withCounts=1&includeMine=1`);
      }

      // Refresh data from server (will correct any local state discrepancies)
      await loadTeams();

    } catch (error) {
      console.error('Failed to remove member:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove member from team',
        variant: 'destructive'
      });
      // Clear cache to ensure fresh data on reload
      const currentOrgId = getApiContext().orgId || '';
      if (currentOrgId && selectedTeamId) {
        clearCacheForEndpoint(`/orgs/${currentOrgId}/departments/${selectedTeamId}/users`);
      }
    } finally {
      setOperationInProgress(null);
      setMemberToRemove(null); // Close the modal
    }
  };

  // Load org users when showing add member interface
  React.useEffect(() => {
    if (showAddMember && addMemberMode === 'existing') {
      loadOrgUsers();
    }
  }, [showAddMember, addMemberMode, loadOrgUsers]);

  // Load team members when selected team changes
  React.useEffect(() => {
    if (selectedTeamId) {
      loadTeamMembers(selectedTeamId);
    }
  }, [selectedTeamId, loadTeamMembers]);

  // Filter teams based on search
  const filteredTeams = departments.filter(team =>
    team.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedTeam = departments.find(d => d.id === selectedTeamId);
  const selectedTeamColor = selectedTeam ? getTeamColor(selectedTeam) : TEAM_COLORS[0];

  // Check if current user is a team lead of the selected team
  const isCurrentUserTeamLead = React.useMemo(() => {
    if (!selectedTeamId || !currentUserId) return false;
    const currentUserInTeam = members.find(member => member.userId === currentUserId);
    return currentUserInTeam?.role === 'lead';
  }, [selectedTeamId, currentUserId, members]);

  React.useEffect(() => {
    loadTeams();
  }, [loadTeams, canManageTeamMembers]); // Reload when permissions change

  // Auto-select first team when teams tab is opened
  React.useEffect(() => {
    if (!selectedTeamId && departments.length > 0 && !loading) {
      const firstTeam = departments[0];
      handleTeamSelect(firstTeam.id);
    }
  }, [selectedTeamId, departments, loading]);

  return (
    <div className="h-[calc(100vh-200px)] md:h-[600px] border rounded-lg overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-3 h-full">
        {/* Left Panel - Teams List */}
        <div className="border-r-0 lg:border-r border-border/50 flex flex-col">
          {/* Header */}
          <div className="p-3 border-b border-border/50">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="font-semibold text-[13px] tracking-tight uppercase text-muted-foreground/70">
                {isTeamLead ? 'Your Team' : 'Departments'}
              </h3>
              {isAdmin && (
                <Button
                  size="sm"
                  onClick={() => setShowCreateForm(true)}
                  className="h-6 w-6 p-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Search - Only show for admins */}
            {!isTeamLead && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <Input
                  placeholder="Filter teams..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-[12px] bg-background/50 focus-visible:ring-primary/20"
                />
              </div>
            )}

            {/* Team lead info */}
            {isTeamLead && (
              <div className="text-sm text-muted-foreground">
                You have access to manage your team members and settings.
              </div>
            )}
          </div>

          {/* Create Team Form */}
          {showCreateForm && (
            <div className="p-4 border-b border-border/50 bg-muted/20">
              <div className="space-y-3">
                <div>
                  <Input
                    placeholder="Team name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateTeam()}
                    className="h-9"
                  />
                </div>
                <div>
                  <Select value={newTeamColor} onValueChange={setNewTeamColor}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEAM_COLORS.map((color) => (
                        <SelectItem key={color.name} value={color.name}>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${color.class}`} />
                            <span className="capitalize">{color.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCreateTeam}
                    disabled={!newTeamName.trim() || creating}
                    className="flex-1"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewTeamName('');
                      setNewTeamColor('purple');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Teams List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <TeamSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="p-2">
                {filteredTeams.map((team) => {
                  const color = getTeamColor(team);
                  const isSelected = selectedTeamId === team.id;
                  const isRestricted = team.name === 'Core';

                  return (
                    <div
                      key={team.id}
                      className={`group p-2 mx-1 rounded-md cursor-pointer border transition-all ${isSelected
                        ? 'border-primary/30 bg-primary/10 shadow-sm'
                        : 'border-transparent hover:bg-muted/40'
                        }`}
                      onClick={() => handleTeamSelect(team.id)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-6 h-6 shrink-0 rounded-md ${color.class} flex items-center justify-center border border-white/10 shadow-sm`}>
                          <span className="text-white text-[10px] font-bold">
                            {team.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-semibold text-[13px] text-foreground truncate leading-none">{team.name}</h4>
                            {isRestricted && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 uppercase bg-muted/30">Restricted</Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5 font-medium">
                            {team.member_count || 0} members
                          </p>
                        </div>
                        {isAdmin && !isRestricted && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTeam(team);
                                  setEditTeamName(team.name);
                                  setEditTeamColor(team.color || 'purple');
                                }}
                              >
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => e.stopPropagation()}
                                className="text-red-600"
                              >
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={(e) => e.preventDefault()}
                                      className="text-red-600 w-full p-0"
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete team?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete the "{team.name}" team and remove all members. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteTeam(team)}
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        Delete Team
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Team Members */}
        <div className="lg:col-span-2 flex flex-col">
          {selectedTeamId ? (
            <>
              {/* Members Header */}
              <div className="p-3 border-b border-border/20 bg-muted/5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 shrink-0 rounded-lg ${selectedTeamColor.class} flex items-center justify-center border border-white/10 shadow-sm`}>
                      <span className="text-white text-sm font-bold">
                        {selectedTeam?.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-foreground truncate tracking-tight leading-none">
                        {isTeamLead ? `Your Team: ${selectedTeam?.name}` : selectedTeam?.name}
                      </h3>
                      <p className="text-[11px] font-medium text-muted-foreground/70 mt-1">
                        {members.length} member{members.length !== 1 ? 's' : ''} enrolled
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-[12px] font-medium gap-1.5 px-3"
                    onClick={() => setShowAddMember(true)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add Member
                  </Button>
                </div>

                {/* Team Lead Selector - Admin Only */}
                {isAdmin && members.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-border/20 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Crown className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Department Lead</span>
                    </div>
                    <Select
                      value={currentTeamLead?.userId || 'none'}
                      onValueChange={(value) => {
                        const newLeadId = value === 'none' ? null : value;
                        handleChangeTeamLead(newLeadId);
                      }}
                      disabled={changingLead || membersLoading}
                    >
                      <SelectTrigger className="w-[180px] h-7 text-[12px] bg-background/50 border-border/30">
                        <SelectValue placeholder="Select lead..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-[12px]">No team lead</SelectItem>
                        {members.map((member) => (
                          <SelectItem key={member.userId} value={member.userId} className="text-[12px]">
                            {member.displayName || member.email || 'Unknown'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {changingLead && (
                      <span className="text-[10px] text-muted-foreground animate-pulse">Updating...</span>
                    )}
                  </div>
                )}
              </div>

              {/* Members List */}
              <div className="flex-1 overflow-y-auto">
                {membersLoading ? (
                  <div className="p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <MemberSkeleton key={i} />
                    ))}
                  </div>
                ) : members.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <Users className="w-12 h-12 text-muted-foreground mb-4" />
                    <h4 className="font-medium text-muted-foreground mb-2">No members yet</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Add team members to collaborate on projects
                    </p>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowAddMember(true)}
                    >
                      <UserPlus className="w-4 h-4" />
                      Add First Member
                    </Button>
                  </div>
                ) : (
                  <div className="p-2">
                    {/* Sort members: lead first, then by name ascending */}
                    {[...members].sort((a, b) => {
                      // Lead always comes first
                      if (a.role === 'lead' && b.role !== 'lead') return -1;
                      if (b.role === 'lead' && a.role !== 'lead') return 1;

                      // For non-lead members, sort by name ascending
                      const aName = (a.displayName ?? a.email ?? '').toString();
                      const bName = (b.displayName ?? b.email ?? '').toString();
                      return aName.localeCompare(bName);
                    }).map((member) => (
                      <div
                        key={member.userId}
                        className={`group flex items-center gap-2.5 p-2 rounded-md transition-all duration-200 border border-transparent ${member.userId === currentUserId
                          ? 'bg-primary/5 border-primary/20'
                          : 'hover:bg-muted/30 hover:border-border/10'
                          }`}
                      >
                        <Avatar className="h-7 w-7 border border-border/10">
                          <AvatarFallback className="text-[10px] bg-muted/40 font-medium text-muted-foreground/80">
                            {member.displayName?.charAt(0).toUpperCase() ||
                              member.email?.charAt(0).toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 h-4">
                            <p className="font-semibold text-[13px] text-foreground truncate leading-none">
                              {member.displayName || 'Unknown User'}
                              {member.userId === currentUserId && (
                                <span className="ml-1 text-[10px] text-primary/70 font-normal tracking-wide uppercase">(You)</span>
                              )}
                            </p>
                            {member.role === 'lead' && (
                              <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                            )}
                          </div>
                          <div className="flex flex-col mt-0.5">
                            <p className="text-[11px] text-muted-foreground/60 truncate font-medium">
                              {member.email}
                            </p>
                            {member.role === 'guest' && member.expiresAt && (
                              <p className="text-xs text-orange-600">
                                Expires: {new Date(member.expiresAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <Badge
                            variant={
                              member.role === 'lead' ? 'default' :
                                member.role === 'guest' ? 'outline' : 'secondary'
                            }
                            className="text-[10px] px-1.5 py-0 h-4 font-normal tracking-tight bg-muted/20 border-border/10"
                          >
                            {member.role === 'lead' ? 'Lead' :
                              member.role === 'guest' ? 'Guest' : 'Member'}
                          </Badge>
                          {member.orgRole === 'orgAdmin' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal tracking-tight text-red-600 border-red-200 bg-red-50/10">
                              Admin
                            </Badge>
                          )}
                        </div>
                        {(() => {
                          const isCurrentUser = member.userId === currentUserId;
                          const isOrgAdmin = member.orgRole === 'orgAdmin';
                          const isMemberTeamLead = member.role === 'lead';

                          // System admins can modify anyone except other org admins
                          if (isAdmin) {
                            const canModifyCurrentUser = !isOrgAdmin;
                            if (canModifyCurrentUser && canEditUsers) {
                              return (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {canEditUsers && (
                                      <>
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setEditingMember(member);
                                            setEditMemberRole(member.role === 'lead' ? 'lead' : 'member');
                                            setEditMemberName(member.displayName || '');
                                          }}
                                        >
                                          <Edit className="w-4 h-4 mr-2" />
                                          Edit Details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => setChangePasswordMember(member)}
                                        >
                                          <Key className="w-4 h-4 mr-2" />
                                          Change Password
                                        </DropdownMenuItem>
                                        {!isCurrentUser && (
                                          <DropdownMenuItem
                                            className="text-red-600"
                                            onClick={() => showRemoveMemberConfirmation(member)}
                                          >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Remove from Team
                                          </DropdownMenuItem>
                                        )}
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              );
                            } else {
                              return null;
                            }
                          }

                          // Non-system admin logic (existing logic)
                          // Users with team management permissions can modify members in their teams
                          // Team leads can modify themselves but not org admins or other team leads
                          // Others cannot modify team leads, org admins, or themselves
                          const canModifyCurrentUser = (isTeamLead || canManageTeamMembers) ?
                            (isCurrentUser || (!isOrgAdmin && !isMemberTeamLead)) :
                            (!isMemberTeamLead && !isCurrentUser && !isOrgAdmin);

                          if (canModifyCurrentUser && canEditUsers) {
                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {canEditUsers && (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setEditingMember(member);
                                          setEditMemberRole(member.role === 'lead' ? 'lead' : 'member');
                                          setEditMemberName(member.displayName || '');
                                        }}
                                      >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Edit Details
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => setChangePasswordMember(member)}
                                      >
                                        <Key className="w-4 h-4 mr-2" />
                                        Change Password
                                      </DropdownMenuItem>
                                      {!isCurrentUser && (
                                        <DropdownMenuItem
                                          className="text-red-600"
                                          onClick={() => showRemoveMemberConfirmation(member)}
                                        >
                                          <Trash2 className="w-4 h-4 mr-2" />
                                          Remove from Team
                                        </DropdownMenuItem>
                                      )}
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          } else {
                            // Cannot modify this user - show nothing
                            return null;
                          }
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Users className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">
                {isTeamLead ? 'Loading Your Team' : 'Select a Team'}
              </h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                {isTeamLead
                  ? 'Your team is being loaded automatically'
                  : 'Choose a team from the list to view and manage its members'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add Member Dialog */}
      {
        showAddMember && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Add Team Member</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddMember(false);
                      setAddMemberMode(null);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {!addMemberMode ? (
                  <div className="space-y-3">
                    {isAdmin && (
                      <Button
                        variant="outline"
                        className="w-full justify-start h-auto p-4"
                        onClick={() => setAddMemberMode('existing')}
                      >
                        <Users className="w-5 h-5 mr-3" />
                        <div className="text-left">
                          <div className="font-medium">Add Existing User</div>
                          <div className="text-sm text-muted-foreground">Select from organization members</div>
                        </div>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto p-4"
                      onClick={() => setAddMemberMode('invite')}
                    >
                      <UserPlus className="w-5 h-5 mr-3" />
                      <div className="text-left">
                        <div className="font-medium">Invite New User</div>
                        <div className="text-sm text-muted-foreground">Send invitation via email</div>
                      </div>
                    </Button>
                  </div>
                ) : addMemberMode === 'existing' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Search Users</label>
                      <Input
                        placeholder="Search by name or email..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {orgUsers
                        .filter(user =>
                          user.displayName?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                          user.email?.toLowerCase().includes(userSearchQuery.toLowerCase())
                        )
                        .map(user => (
                          <div
                            key={user.userId}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedUserId === user.userId
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted/50'
                              }`}
                            onClick={() => setSelectedUserId(user.userId)}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="text-xs">
                                  {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || '?'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {user.displayName || 'Unknown User'}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>

                    {selectedUserId && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium">Role</label>
                          <Select value={selectedRole} onValueChange={(value: 'member' | 'lead') => setSelectedRole(value)}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              {isAdmin && <SelectItem value="lead">Team Lead</SelectItem>}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedUserId('');
                              setSelectedRole('member');
                            }}
                          >
                            Clear
                          </Button>
                          <Button
                            onClick={handleAddExistingUser}
                            disabled={operationInProgress === 'add-user'}
                          >
                            {operationInProgress === 'add-user' ? 'Adding...' : 'Add to Team'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Email Address</label>
                      <Input
                        type="email"
                        placeholder="user@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Display Name (Optional)</label>
                      <Input
                        placeholder="John Doe"
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Password</label>
                      <Input
                        type="password"
                        placeholder="Enter a password for the user"
                        value={invitePassword}
                        onChange={(e) => setInvitePassword(e.target.value)}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        User will need this password to login
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Team Role</label>
                      <Select value={inviteRole} onValueChange={(value: 'member' | 'lead') => setInviteRole(value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="lead">Team Lead</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setInviteEmail('');
                          setInviteName('');
                          setInvitePassword('');
                          setInviteRole('member');
                        }}
                      >
                        Clear
                      </Button>
                      <Button
                        onClick={handleInviteUser}
                        disabled={!inviteEmail.trim() || !invitePassword.trim() || inviting}
                      >
                        {inviting ? 'Inviting...' : 'Send Invitation'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* Edit Member Role Dialog */}
      {editingMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden border border-border/40 flex flex-col">
            <div className="p-5 border-b border-border/20 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight">Edit Member</h3>
                <p className="text-[11px] text-muted-foreground">Manage user role and display information</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={() => setEditingMember(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl border border-border/20">
                <Avatar className="h-12 w-12 border border-border/10">
                  <AvatarFallback className="text-[15px] font-bold bg-primary/10 text-primary">
                    {editingMember?.displayName?.charAt(0).toUpperCase() ||
                      editingMember?.email?.charAt(0).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold text-[14px] leading-tight truncate">{editingMember?.displayName || 'Unknown User'}</p>
                  <p className="text-[12px] text-muted-foreground mt-1 truncate">{editingMember?.email}</p>
                  {editingMember?.role === 'guest' && editingMember?.expiresAt && (
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-orange-600 font-medium px-2 py-0.5 rounded bg-orange-500/5 border border-orange-500/10">
                      <AlertTriangle className="h-3 w-3" />
                      Expires: {new Date(editingMember.expiresAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Hide role field for team leads editing themselves */}
              {!(isTeamLead && editingMember?.userId === currentUserId) && (
                <div>
                  <label className="text-sm font-medium">Role</label>
                  <Select value={editMemberRole} onValueChange={(value: 'member' | 'lead') => setEditMemberRole(value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      {isAdmin && <SelectItem value="lead">Team Lead</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Display Name</label>
                <Input
                  type="text"
                  className="mt-1"
                  placeholder="Enter display name"
                  value={editMemberName}
                  onChange={(e) => setEditMemberName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to keep current name
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditingMember(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleEditMemberRole}
                  disabled={operationInProgress === 'edit-member'}
                >
                  {operationInProgress === 'edit-member' ? 'Updating...' : 'Update Member'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Dialog */}
      {changePasswordMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden border border-border/40 flex flex-col">
            <div className="p-5 border-b border-border/20 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight">Security</h3>
                <p className="text-[11px] text-muted-foreground">Reset member password</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={() => {
                  setChangePasswordMember(null);
                  setNewPassword('');
                  setConfirmNewPassword('');
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl border border-border/20">
                <Avatar className="h-12 w-12 border border-border/10">
                  <AvatarFallback className="text-[15px] font-bold bg-amber-500/10 text-amber-600">
                    {changePasswordMember?.displayName?.charAt(0).toUpperCase() ||
                      changePasswordMember?.email?.charAt(0).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold text-[14px] leading-tight truncate">{changePasswordMember?.displayName || 'Unknown User'}</p>
                  <p className="text-[12px] text-muted-foreground mt-1 truncate">{changePasswordMember?.email}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">New Password</label>
                <Input
                  type="password"
                  className="mt-1"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Password must be at least 6 characters long
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Confirm Password</label>
                <Input
                  type="password"
                  className="mt-1"
                  placeholder="Confirm new password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                />
                {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
                  <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setChangePasswordMember(null);
                    setNewPassword('');
                    setConfirmNewPassword('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={
                    operationInProgress === 'change-password' ||
                    (newPassword && confirmNewPassword && newPassword !== confirmNewPassword) ||
                    !newPassword ||
                    !confirmNewPassword
                  }
                >
                  {operationInProgress === 'change-password' ? 'Updating...' : 'Change Password'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Team Dialog */}
      {editingTeam && (
        <AlertDialog open={!!editingTeam} onOpenChange={() => setEditingTeam(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit Team</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Team Name</label>
                <Input
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  placeholder="Team name"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Team Color</label>
                <Select value={editTeamColor} onValueChange={setEditTeamColor}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_COLORS.map((color) => (
                      <SelectItem key={color.name} value={color.name}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${color.class}`} />
                          <span className="capitalize">{color.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleUpdateTeam}>
                Update Team
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Remove Member Confirmation Modal */}
      {memberToRemove && (
        <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove team member?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove <strong>{memberToRemove.displayName || memberToRemove.email || 'this member'}</strong> from the team?
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveMember}
                className="bg-red-600 hover:bg-red-700"
                disabled={operationInProgress === 'remove-member'}
              >
                {operationInProgress === 'remove-member' ? 'Removing...' : 'Remove Member'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}