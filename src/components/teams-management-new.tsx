"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
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
import { cn } from '@/lib/utils';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ChevronRight, ChevronLeft as BackIcon, Loader2 } from 'lucide-react';

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
  orgRole?: 'owner' | 'orgAdmin' | 'contentManager' | 'contentViewer' | 'member' | 'guest';
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

export default function TeamsManagementNew({ onBack }: { onBack?: () => void }) {
  const router = useRouter();
  const { user, bootstrapData } = useAuth();
  const permissions = bootstrapData?.permissions || {};
  const canManageMembers = permissions['org.manage_members'] === true;
  const isAdmin = canManageMembers;
  const leadDeptIds = (bootstrapData?.departments || []).filter((d: any) => d?.is_lead).map((d: any) => d.id);
  const isTeamLead = leadDeptIds.length > 0;
  const currentUserId = bootstrapData?.user?.id;
  const canManageTeamMembers = isAdmin || permissions['departments.manage_members'] === true || leadDeptIds.length > 0;
  const canEditUsers = canManageMembers || canManageTeamMembers;

  // Debug logging for permissions
  console.log('Teams Management Debug:', {
    userId: currentUserId,
    canManageMembers,
    canManageTeamMembers,
    canEditUsers,
    allPermissions: permissions
  });

  // Teams state
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(null);

  // Mobile navigation state
  const [isMobile, setIsMobile] = React.useState(false);
  const [mobileShowDetails, setMobileShowDetails] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      // Ensure membersList is actually an array before setting state
      setMembers(Array.isArray(membersList) ? membersList : []);
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
    if (isMobile) {
      setMobileShowDetails(true);
    }
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
    if (!Array.isArray(members)) return null;
    return members.find(m => m.role === 'lead') || null;
  }, [members]);

  // Load organization users for adding existing members
  const loadOrgUsers = React.useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;

    try {
      const users = await apiFetch<OrgUser[]>(`/orgs/${orgId}/users`);
      setOrgUsers(Array.isArray(users) ? users : []);
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
      const roleChanged = editMemberRole !== (editingMember.role === 'lead' ? 'lead' : 'member');
      const nameChanged = editMemberName !== (editingMember.displayName || '');

      if (roleChanged && !(isTeamLead && editingMember?.userId === currentUserId)) {
        await apiFetch(`/orgs/${orgId}/departments/${selectedTeamId}/users`, {
          method: 'POST',
          body: { userId: editingMember.userId, role: editMemberRole }
        });
      }

      if (nameChanged) {
        await apiFetch(`/orgs/${orgId}/users/${editingMember.userId}`, {
          method: 'PATCH',
          body: { display_name: editMemberName === '' ? null : editMemberName }
        });
      }

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
  const canManageSelectedTeam = isAdmin || (!!selectedTeamId && leadDeptIds.includes(selectedTeamId));

  // Check if current user is a team lead of the selected team
  const isCurrentUserTeamLead = React.useMemo(() => {
    if (!selectedTeamId || !currentUserId || !Array.isArray(members)) return false;
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
    <div className={cn(
      "overflow-hidden",
      isMobile ? "h-auto border-none bg-transparent" : "h-[calc(100vh-200px)] md:h-[600px] border rounded-lg"
    )}>
      <div className="grid grid-cols-1 lg:grid-cols-3 h-full">
        {/* Left Panel - Teams List */}
        <div className={cn(
          "border-r-0 lg:border-r border-border/50 flex flex-col transition-all duration-300",
          isMobile && mobileShowDetails ? "hidden" : "flex"
        )}>
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
                      className={cn(
                        "group p-3 mb-2 rounded-2xl cursor-pointer border transition-all active:scale-[0.98]",
                        isSelected && !isMobile
                          ? 'border-primary/30 bg-primary/10 shadow-sm'
                          : 'border-border/30 bg-card/40 hover:bg-muted/40 shadow-sm'
                      )}
                      onClick={() => handleTeamSelect(team.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 shrink-0 rounded-xl ${color.class} flex items-center justify-center border border-white/10 shadow-sm`}>
                          <span className="text-white text-[14px] font-bold">
                            {team.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-[14px] text-foreground truncate tracking-tight">{team.name}</h4>
                            {isRestricted && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 uppercase bg-muted/30">Restricted</Badge>
                            )}
                          </div>
                          <p className="text-[12px] text-muted-foreground/60 mt-0.5 font-medium">
                            {team.member_count || 0} enrolled members
                          </p>
                        </div>
                        {isMobile && (
                          <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
                        )}
                        {isAdmin && !isRestricted && !isMobile && (
                          <DropdownMenu>
                            {/* Dropdown Menu Trigger and Content */}
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
        <div className={cn(
          "lg:col-span-2 flex flex-col transition-all duration-300 relative",
          isMobile && !mobileShowDetails ? "hidden" : "flex"
        )}>
          {/* Mobile Integrated Header */}
          {isMobile && (
            <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border/40 px-4 h-16 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 -ml-2.5 rounded-full text-muted-foreground active:scale-95 transition-all"
                  onClick={() => mobileShowDetails ? setMobileShowDetails(false) : (onBack ? onBack() : router.back())}
                >
                  <BackIcon className="h-5 w-5" />
                </Button>
                {mobileShowDetails && selectedTeamId && (
                  <div className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center border border-white/10 shadow-sm shrink-0",
                    selectedTeamColor.class
                  )}>
                    <span className="text-white font-bold text-xs">
                      {selectedTeam?.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="font-bold text-[14px] text-foreground truncate tracking-tight">
                    {mobileShowDetails ? selectedTeam?.name : "Teams"}
                  </h1>
                  {mobileShowDetails && (
                    <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.05em] leading-none mt-0.5">
                      {members.length} Members
                    </p>
                  )}
                </div>
              </div>
              {mobileShowDetails && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-xl text-primary active:scale-95 transition-all bg-primary/5 hover:bg-primary/10 border border-primary/20"
                  onClick={() => setShowAddMember(true)}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              )}
            </div>
          )}

          {selectedTeamId ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Lead Management Section */}
              {isAdmin && members.length > 0 && (
                <div className={cn(
                  "shrink-0",
                  isMobile ? "px-4 pt-4" : "p-3 border-b border-border/20 bg-muted/5"
                )}>
                  <div className={cn(
                    "flex flex-col gap-3 p-4 rounded-xl border border-border/40",
                    isMobile ? "bg-muted/20" : "bg-card/40"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/10 shadow-sm">
                          <Crown className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[13px] font-bold text-foreground tracking-tight">Department Lead</span>
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Manager</span>
                        </div>
                      </div>
                      {changingLead && (
                        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                      )}
                    </div>

                    <Select
                      value={currentTeamLead?.userId || 'none'}
                      onValueChange={(value) => {
                        const newLeadId = value === 'none' ? null : value;
                        handleChangeTeamLead(newLeadId);
                      }}
                      disabled={changingLead || membersLoading}
                    >
                      <SelectTrigger className="bg-background/50 border-border/40 h-10 w-full rounded-xl text-[13px] font-medium shadow-inner">
                        <div className="flex items-center gap-2 truncate">
                          {currentTeamLead ? (
                            <>
                              <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center text-[10px] font-bold text-amber-600 border border-amber-500/20 shrink-0">
                                {currentTeamLead.displayName?.charAt(0) || 'L'}
                              </div>
                              <SelectValue />
                            </>
                          ) : (
                            <span className="text-muted-foreground/50">Designate a team manager...</span>
                          )}
                        </div>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border/40 shadow-xl">
                        <SelectItem value="none" className="text-[13px]">No team lead</SelectItem>
                        {members.map((member) => (
                          <SelectItem key={member.userId} value={member.userId} className="text-[13px]">
                            {member.displayName || member.email || 'Unknown'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Team Members List Header */}
              <div className="flex items-center justify-between px-4 py-4 md:px-5 md:py-3 border-b border-border/20 bg-transparent">
                <div className="text-[14px] md:text-[13px] font-bold text-foreground tracking-tight flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground/70" />
                  Team Members
                </div>
                {!isMobile && (
                  <Button
                    size="sm"
                    className="h-8 px-3 text-[12px] font-medium gap-1.5"
                    onClick={() => setShowAddMember(true)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add Member
                  </Button>
                )}
              </div>

              {/* Members List Container */}
              <div className="flex-1 overflow-y-auto">
                {membersLoading ? (
                  <div className="p-4 space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <MemberSkeleton key={i} />
                    ))}
                  </div>
                ) : (!Array.isArray(members) || members.length === 0) ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center p-8">
                    <Users className="w-12 h-12 text-muted-foreground/30 mb-4" />
                    <h4 className="font-bold text-muted-foreground/50 mb-1">No members yet</h4>
                    <p className="text-xs text-muted-foreground/40 mb-4">Add team members to collaborate on projects</p>
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
                  <div className="px-4 pb-4 space-y-2">
                    {(Array.isArray(members) ? [...members] : []).sort((a, b) => {
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
                        className={cn(
                          "group flex items-center gap-3 p-2.5 rounded-xl transition-all border",
                          member.userId === currentUserId
                            ? 'bg-primary/5 border-primary/20 shadow-sm'
                            : 'bg-card/40 border-border/30 hover:border-border/60 hover:shadow-sm'
                        )}
                      >
                        <Avatar className={cn("border border-border/10 shadow-sm shrink-0", isMobile ? "h-10 w-10 rounded-xl" : "h-7 w-7")}>
                          <AvatarFallback className={cn("bg-muted/40 font-bold text-muted-foreground/80", isMobile ? "text-[13px]" : "text-[10px]")}>
                            {member.displayName?.charAt(0).toUpperCase() ||
                              member.email?.charAt(0).toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={cn("font-bold text-foreground truncate tracking-tight", isMobile ? "text-[14px]" : "text-[13px]")}>
                              {member.displayName || 'Unknown User'}
                              {member.userId === currentUserId && (
                                <span className="ml-1 text-[10px] text-primary/70 font-black uppercase tracking-tighter">(You)</span>
                              )}
                            </p>
                            {member.role === 'lead' && (
                              <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                          </div>
                          <div className="flex flex-col mt-0.5">
                            <p className="text-[12px] text-muted-foreground/50 truncate font-medium">
                              {member.email}
                            </p>
                            {member.role === 'guest' && member.expiresAt && (
                              <p className="text-xs text-orange-600 font-bold mt-1">
                                Expires: {new Date(member.expiresAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <Badge
                            variant={
                              member.role === 'lead' ? 'default' :
                                member.role === 'guest' ? 'outline' : 'secondary'
                            }
                            className="text-[10px] px-2 py-0 h-5 font-bold uppercase tracking-tight bg-muted/20 border-border/10"
                          >
                            {member.role === 'lead' ? 'Lead' :
                              member.role === 'guest' ? 'Guest' : 'Member'}
                          </Badge>
                          {(member.orgRole === 'orgAdmin' || member.orgRole === 'owner') && (
                            <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 font-bold uppercase tracking-tight text-red-600 border-red-500/20 bg-red-500/5">
                              Admin
                            </Badge>
                          )}
                        </div>
                        {(() => {
                          const isCurrentUser = member.userId === currentUserId;
                          const isOrgAdmin = member.orgRole === 'orgAdmin' || member.orgRole === 'owner';
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

                          // Non-admin logic: allow team leads to manage members within the selected team
                          const canManageThisMember = canManageSelectedTeam && !isOrgAdmin && (!isMemberTeamLead || isCurrentUser);

                          if (canManageThisMember && canEditUsers) {
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
            </div>
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
      {/* Add Member - Desktop (Dialog) */}
      <Dialog open={!isMobile && showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Add an existing user or invite a new one to the team.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
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
                    onClick={handleInviteUser}
                    disabled={!inviteEmail.trim() || !invitePassword.trim() || inviting}
                    className="w-full"
                  >
                    {inviting ? 'Inviting...' : 'Send Invitation'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Member - Mobile (Sheet) */}
      <Sheet open={isMobile && showAddMember} onOpenChange={setShowAddMember}>
        <SheetContent side="bottom" className="rounded-t-[2.5rem] p-6 pb-10 border-t-0 bg-background/95 backdrop-blur-xl">
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <SheetTitle className="text-[18px] font-bold tracking-tight">Add Member</SheetTitle>
                <SheetDescription className="text-[13px] text-muted-foreground">to {selectedTeam?.name}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-6">
            {!addMemberMode ? (
              <div className="grid grid-cols-1 gap-3">
                {isAdmin && (
                  <Button
                    variant="outline"
                    className="h-20 justify-start px-5 rounded-2xl border-border/30 bg-muted/20"
                    onClick={() => setAddMemberMode('existing')}
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mr-4">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-[14px]">Add Existing User</div>
                      <div className="text-[12px] text-muted-foreground">Select organization member</div>
                    </div>
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-20 justify-start px-5 rounded-2xl border-border/30 bg-muted/20"
                  onClick={() => setAddMemberMode('invite')}
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center mr-4">
                    <UserPlus className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-[14px]">Invite New User</div>
                    <div className="text-[12px] text-muted-foreground">Send email invitation</div>
                  </div>
                </Button>
              </div>
            ) : addMemberMode === 'existing' ? (
              <div className="space-y-5">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  <Input
                    className="h-12 pl-10 text-[14px] bg-muted/30 border-none rounded-2xl"
                    placeholder="Search name or email..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                  />
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {orgUsers
                    .filter(user => user.displayName?.toLowerCase().includes(userSearchQuery.toLowerCase()) || user.email?.toLowerCase().includes(userSearchQuery.toLowerCase()))
                    .map(user => (
                      <div
                        key={user.userId}
                        className={cn(
                          "p-3 rounded-2xl border transition-all active:scale-[0.98]",
                          selectedUserId === user.userId ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/20 bg-card/40'
                        )}
                        onClick={() => setSelectedUserId(user.userId)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 rounded-xl border border-border/10 shadow-sm"><AvatarFallback className="font-bold">{user.displayName?.charAt(0)}</AvatarFallback></Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[14px] truncate tracking-tight">{user.displayName || 'Unknown'}</p>
                            <p className="text-[11px] text-muted-foreground/60 truncate font-medium">{user.email}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="pt-2 flex flex-col gap-3">
                  <Button
                    size="lg"
                    className="w-full h-14 text-[15px] font-bold rounded-2xl shadow-xl shadow-primary/20"
                    onClick={handleAddExistingUser}
                    disabled={!selectedUserId}
                  >
                    Add to Team
                  </Button>
                  <Button variant="ghost" size="lg" className="w-full h-14 text-[14px] font-semibold text-muted-foreground" onClick={() => setAddMemberMode(null)}>Back</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-4">
                  <Input className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4" placeholder="Email Address" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                  <Input className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4" placeholder="Display Name" value={inviteName} onChange={e => setInviteName(e.target.value)} />
                  <Input type="password" className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4" placeholder="Password" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} />
                </div>
                <div className="pt-4 flex flex-col gap-3">
                  <Button size="lg" className="w-full h-14 text-[15px] font-bold rounded-2xl shadow-xl shadow-primary/20" onClick={handleInviteUser} disabled={!inviteEmail.trim() || !invitePassword.trim()}>Send Invitation</Button>
                  <Button variant="ghost" size="lg" className="w-full h-14 text-[14px] font-semibold text-muted-foreground" onClick={() => setAddMemberMode(null)}>Back</Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Member Role - Desktop (Dialog) */}
      <Dialog open={!isMobile && !!editingMember} onOpenChange={() => setEditingMember(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>Manage user role and display information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
              </div>
            </div>
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
            <div>
              <label className="text-sm font-medium">Display Name</label>
              <Input
                type="text"
                className="mt-1"
                placeholder="Enter display name"
                value={editMemberName}
                onChange={(e) => setEditMemberName(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditingMember(null)}>Cancel</Button>
              <Button onClick={handleEditMemberRole} disabled={operationInProgress === 'edit-member'}>
                {operationInProgress === 'edit-member' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Update Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Member - Mobile (Sheet) */}
      <Sheet open={isMobile && !!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <SheetContent side="bottom" className="rounded-t-[2.5rem] p-6 pb-10 border-t-0 bg-background/95 backdrop-blur-xl">
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Edit className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <SheetTitle className="text-[18px] font-bold tracking-tight">Edit Member</SheetTitle>
                <SheetDescription className="text-[13px] text-muted-foreground">Modify role and display name</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Team Role</label>
                <Select value={editMemberRole} onValueChange={(value: 'member' | 'lead') => setEditMemberRole(value)}>
                  <SelectTrigger className="h-12 bg-muted/30 border-none rounded-2xl px-4">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    {isAdmin && <SelectItem value="lead">Team Lead</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Display Name</label>
                <Input
                  className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4"
                  placeholder="e.g. John Doe"
                  value={editMemberName}
                  onChange={e => setEditMemberName(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              <Button
                size="lg"
                className="w-full h-14 text-[15px] font-bold rounded-2xl shadow-xl shadow-primary/20"
                onClick={handleEditMemberRole}
                disabled={operationInProgress === 'edit-member'}
              >
                {operationInProgress === 'edit-member' ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                Update Member
              </Button>
              <Button variant="ghost" size="lg" className="w-full h-14 text-[14px] font-semibold text-muted-foreground" onClick={() => setEditingMember(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Change Password - Desktop (Dialog) */}
      <Dialog
        open={!isMobile && !!changePasswordMember}
        onOpenChange={(open) => {
          if (!open) {
            setChangePasswordMember(null);
            setNewPassword('');
            setConfirmNewPassword('');
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Security</DialogTitle>
            <DialogDescription>Reset password for {changePasswordMember?.displayName || changePasswordMember?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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

            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <Input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} placeholder="Repeat password" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setChangePasswordMember(null)}>Cancel</Button>
              <Button
                onClick={handleChangePassword}
                disabled={
                  operationInProgress === 'change-password' ||
                  (newPassword && confirmNewPassword && newPassword !== confirmNewPassword) ||
                  !newPassword ||
                  !confirmNewPassword
                }
              >
                {operationInProgress === 'change-password' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Update Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password - Mobile (Sheet) */}
      <Sheet
        open={isMobile && !!changePasswordMember}
        onOpenChange={(open) => {
          if (!open) {
            setChangePasswordMember(null);
            setNewPassword('');
            setConfirmNewPassword('');
          }
        }}
      >
        <SheetContent side="bottom" className="rounded-t-[2.5rem] p-6 pb-10 border-t-0 bg-background/95 backdrop-blur-xl">
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <Key className="h-5 w-5 text-amber-600" />
              </div>
              <div className="text-left">
                <SheetTitle className="text-[18px] font-bold tracking-tight">Security</SheetTitle>
                <SheetDescription className="text-[13px] text-muted-foreground">Reset member password</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">New Password</label>
                <Input
                  type="password"
                  className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Confirm New Password</label>
                <Input
                  type="password"
                  className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4"
                  placeholder="Repeat new password"
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              <Button
                size="lg"
                className="w-full h-14 text-[15px] font-bold rounded-2xl shadow-xl shadow-amber-500/20 bg-amber-600 hover:bg-amber-700"
                onClick={handleChangePassword}
                disabled={
                  operationInProgress === 'change-password' ||
                  (newPassword && confirmNewPassword && newPassword !== confirmNewPassword) ||
                  !newPassword ||
                  !confirmNewPassword
                }
              >
                {operationInProgress === 'change-password' ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                Update Password
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full h-14 text-[14px] font-semibold text-muted-foreground"
                onClick={() => setChangePasswordMember(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Team Dialog */}
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

      {/* Remove Member Confirmation - Desktop (AlertDialog) */}
      <AlertDialog open={!isMobile && !!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToRemove?.displayName || memberToRemove?.email || 'this member'}</strong> from the team?
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
              {operationInProgress === 'remove-member' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Member Confirmation - Mobile (Sheet) */}
      <Sheet open={isMobile && !!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <SheetContent side="bottom" className="rounded-t-[2.5rem] p-6 pb-10 border-t-0 bg-background/95 backdrop-blur-xl">
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div className="text-left">
                <SheetTitle className="text-[18px] font-bold tracking-tight text-red-600">Remove Member?</SheetTitle>
                <SheetDescription className="text-[13px] text-muted-foreground">This action is permanent and cannot be undone.</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-muted/30 border border-border/20">
              <p className="text-[14px] leading-relaxed">
                Confirm removal of <span className="font-bold text-foreground">{memberToRemove?.displayName || memberToRemove?.email}</span> from the team.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                variant="destructive"
                className="w-full h-14 text-[15px] font-bold rounded-2xl shadow-xl shadow-red-500/20 bg-red-600 hover:bg-red-700"
                onClick={handleRemoveMember}
                disabled={operationInProgress === 'remove-member'}
              >
                {operationInProgress === 'remove-member' ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                Confirm Removal
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full h-14 text-[14px] font-semibold text-muted-foreground"
                onClick={() => setMemberToRemove(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
