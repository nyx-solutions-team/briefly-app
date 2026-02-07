"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Mail, Trash2, Lock, Users, X, UserPlus, Loader2 } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useUsers } from '@/hooks/use-users';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type OrgRole = {
  key: string;
  name: string;
  is_system?: boolean;
  description?: string | null;
};

function UserSkeleton() {
  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="ml-4 space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton className="h-6 w-16 rounded-full" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton className="h-8 w-16" />
      </td>
    </tr>
  );
}

export default function UsersManagement() {
  const { users, addUser, removeUser, updateUser } = useUsers();
  const { toast } = useToast();
  const { bootstrapData } = useAuth();
  const canManageOrgMembers = bootstrapData?.permissions?.['org.manage_members'] === true;
  const isAdmin = canManageOrgMembers;
  const isTeamLead = (bootstrapData?.departments || []).some((d: any) => d?.is_lead);
  const [form, setForm] = React.useState({
    username: '',
    email: '',
    role: 'member',
    password: ''
  });
  const [inviting, setInviting] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [orgUsers, setOrgUsers] = React.useState<any[]>([]);
  const [orgRoles, setOrgRoles] = React.useState<OrgRole[]>([]);
  const [rolesLoading, setRolesLoading] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const roleOrder = ['owner', 'orgAdmin', 'teamLead', 'contentManager', 'member', 'contentViewer', 'guest'];
  const fallbackRoles: OrgRole[] = [
    { key: 'owner', name: 'Owner', is_system: true },
    { key: 'orgAdmin', name: 'Organization Admin', is_system: true },
    { key: 'teamLead', name: 'Team Lead', is_system: true },
    { key: 'contentManager', name: 'Content Manager', is_system: true },
    { key: 'member', name: 'Member', is_system: true },
    { key: 'contentViewer', name: 'Content Viewer', is_system: true },
    { key: 'guest', name: 'Guest', is_system: true },
  ];

  const sortedRoles = React.useMemo(() => {
    const source = orgRoles.length > 0 ? orgRoles : fallbackRoles;
    return [...source].sort((a, b) => {
      const aIndex = roleOrder.indexOf(a.key);
      const bIndex = roleOrder.indexOf(b.key);
      if (aIndex === -1 && bIndex === -1) return (a.name || a.key).localeCompare(b.name || b.key);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [orgRoles]);

  const assignableRoles = React.useMemo(() => {
    const roles = sortedRoles.filter((r) => r.key !== 'owner');
    if (isAdmin) return roles;
    const allowed = new Set(['member', 'guest']);
    return roles.filter((r) => allowed.has(r.key));
  }, [sortedRoles, isAdmin]);

  const roleNameMap = React.useMemo(() => {
    return new Map((sortedRoles || []).map((r) => [r.key, r.name || r.key]));
  }, [sortedRoles]);

  // Password change modal state
  const [passwordModal, setPasswordModal] = React.useState<{
    isOpen: boolean;
    user: any;
  }>({ isOpen: false, user: null });
  const [passwordForm, setPasswordForm] = React.useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [changingPassword, setChangingPassword] = React.useState(false);

  // Delete user modal state
  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    user: any;
  }>({ isOpen: false, user: null });
  const [deletingUser, setDeletingUser] = React.useState(false);

  const onDeleteUser = async () => {
    if (!deleteModal.user) return;
    setDeletingUser(true);
    try {
      const u = deleteModal.user;
      const orgId = getApiContext().orgId || '';
      if (orgId) await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' });
      removeUser(u.username);
      toast({ title: 'Member removed' });
      setDeleteModal({ isOpen: false, user: null });
    } catch {
      toast({ title: 'Failed to remove member', variant: 'destructive' });
    } finally {
      setDeletingUser(false);
    }
  };

  // Note: Backend already filters users for team leads, no frontend filtering needed

  // Load org users from backend for admin/manager visibility
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const orgId = getApiContext().orgId || '';
        if (!orgId) {
          setLoading(false);
          return;
        }
        const list = await apiFetch<any[]>(`/orgs/${orgId}/users`);
        setOrgUsers(list || []);

        // The backend already filters users for team leads, so no additional filtering needed
        const filteredList = list;

        // Map to the directory shape while keeping real values for table
        const mapped = filteredList.map(u => ({
          username: u.userId, // keep true id to address DELETE /users/:userId
          displayName: u.displayName || u.app_users?.display_name || '',
          email: u.email || '',
          role: u.role,
          password: '',
          expiresAt: u.expires_at || undefined,
          departments: Array.isArray(u.departments) ? u.departments : [],
        }));
        // Reset then add
        mapped.forEach(m => addUser(m));
      } catch (error) {
        console.error('Error loading users:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [addUser]);

  // Listen for team membership changes to refresh team badges
  useEffect(() => {
    const onChanged = () => { void refreshUsers(); };
    window.addEventListener('org-users-changed', onChanged);
    return () => window.removeEventListener('org-users-changed', onChanged);
  }, []);

  const refreshUsers = async () => {
    try {
      const orgId = getApiContext().orgId || '';
      if (!orgId) return;
      const list = await apiFetch<any[]>(`/orgs/${orgId}/users`);

      // The backend already filters users for team leads, so no additional filtering needed
      const filteredList = list;

      const mapped = filteredList.map(u => ({
        username: u.userId,
        displayName: u.displayName || u.app_users?.display_name || '',
        email: u.email || '',
        role: u.role,
        password: '',
        expiresAt: u.expires_at || undefined,
      }));
      mapped.forEach((m) => {
        const existing = users.find(x => x.username === m.username);
        if (!existing) addUser(m);
        else updateUser(m.username, () => m);
      });
    } catch { }
  };

  const refreshRoles = async () => {
    if (!isAdmin) {
      setOrgRoles([]);
      return;
    }
    try {
      const orgId = getApiContext().orgId || '';
      if (!orgId) return;
      setRolesLoading(true);
      const data = await apiFetch<OrgRole[]>(`/orgs/${orgId}/roles`);
      setOrgRoles(data || []);
    } catch {
      setOrgRoles([]);
    } finally {
      setRolesLoading(false);
    }
  };

  useEffect(() => {
    void refreshRoles();
  }, [isAdmin, bootstrapData?.selectedOrgId]);

  const onCreate = async () => {
    const username = form.username.trim();
    if (!username) return;
    if (form.password && form.password.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters.',
        variant: 'destructive' as any
      });
      return;
    }
    // Call backend invite endpoint first; only add to list on success
    try {
      const orgId = getApiContext().orgId || '';
      if (form.email.trim() && orgId) {
        const resp: any = await apiFetch(`/orgs/${orgId}/users`, {
          method: 'POST',
          body: {
            email: form.email.trim(),
            display_name: form.username.trim() || undefined,
            role: form.role,
            password: form.password ? form.password : undefined,
          },
        });
        // Use authoritative user_id from server to avoid duplicate phantom rows
        const userId = resp?.user_id || resp?.userId || null;
        addUser({
          username: userId || username,
          displayName: form.username.trim(),
          email: form.email.trim(),
          role: form.role as any,
          password: form.password || 'Temp#1234',
        });

        toast({
          title: 'User invited',
          description: `${form.email.trim()} has been invited to the organization.`,
        });

        setForm({ username: '', email: '', role: 'member', password: '' });
        setInviting(false);
        // Refresh users to pull authoritative display names from server for pickers
        await refreshUsers();
      }
    } catch (e: any) {
      const msg = (e as Error)?.message?.replace(/^API.*failed:\s*/, '') || 'Failed to create user';
      toast({
        title: 'Could not create user',
        description: msg,
        variant: 'destructive' as any
      });
      return; // Don't clear the form on failure
    }
  };

  const onChangePassword = async () => {
    if (!passwordModal.user) return;

    const { newPassword, confirmPassword } = passwordForm;

    // Validation
    if (!newPassword.trim()) {
      toast({
        title: 'Password required',
        description: 'Please enter a new password.',
        variant: 'destructive' as any
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters.',
        variant: 'destructive' as any
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure both password fields match.',
        variant: 'destructive' as any
      });
      return;
    }

    try {
      setChangingPassword(true);
      const orgId = getApiContext().orgId || '';
      if (!orgId) throw new Error('Organization context not found');

      await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(passwordModal.user.username)}`, {
        method: 'PATCH',
        body: { password: newPassword },
      });

      toast({
        title: 'Password updated',
        description: `Password for ${passwordModal.user.email || passwordModal.user.username} has been changed successfully.`,
      });

      // Reset form and close modal
      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setPasswordModal({ isOpen: false, user: null });

    } catch (e: any) {
      const msg = (e as Error)?.message?.replace(/^API.*failed:\s*/, '') || 'Failed to change password';
      toast({
        title: 'Could not change password',
        description: msg,
        variant: 'destructive' as any
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const getRoleLabel = (role: string) => {
    if (roleNameMap.has(role)) return roleNameMap.get(role) as string;
    switch (role) {
      case 'owner': return 'Owner';
      case 'orgAdmin': return 'Organization Admin';
      case 'contentManager': return 'Content Manager';
      case 'contentViewer': return 'Content Viewer';
      case 'guest': return 'Guest';
      case 'member': return 'Member';
      default: return role;
    }
  };

  const getRoleColor = (role: string) => {
    const roleLower = role.toLowerCase();
    switch (true) {
      case roleLower.includes('admin') || roleLower === 'systemadmin' || roleLower === 'owner':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case roleLower.includes('member') || roleLower === 'member':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case roleLower.includes('manager') || roleLower === 'manager':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400';
      case roleLower.includes('viewer') || roleLower === 'viewer':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const getTeamBadges = (user: any) => {
    const depts = Array.isArray(user.departments) ? user.departments : [];
    return depts.slice(0, 2);
  };

  return (
    <div className="space-y-4">
      {/* Search and Action Bar */}
      <div className="flex items-center justify-between px-0 md:px-4 py-4 md:py-3 border-b-0 md:border-b border-border/20 bg-transparent md:bg-muted/5">
        <div className="relative">
          <div className="text-[14px] md:text-[13px] font-bold md:font-semibold text-foreground tracking-tight flex items-center gap-2">
            <Users className="h-4 w-4 md:h-4 md:w-4 text-primary md:text-muted-foreground/70" />
            Member Directory
          </div>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => setInviting(!inviting)}
            className={cn(
              "h-9 md:h-8 px-4 md:px-3 text-[13px] md:text-[12px] font-bold md:font-medium rounded-xl md:rounded-md shadow-lg md:shadow-none transition-all active:scale-95",
              inviting ? "bg-muted text-muted-foreground border-border/20" : "bg-primary hover:bg-primary/90"
            )}
            variant={inviting ? "outline" : "default"}
          >
            {inviting ? <X className="h-4 w-4 md:h-3.5 md:w-3.5 mr-2 md:mr-1.5" /> : <Mail className="h-4 w-4 md:h-3.5 md:w-3.5 mr-2 md:mr-1.5" />}
            {inviting ? "Cancel" : "Invite"}
          </Button>
        )}
      </div>

      {/* Invite User Form - Desktop (Inline Card) */}
      {isAdmin && inviting && !isMobile && (
        <Card className="border-border/30 bg-card/20 md:bg-card/20 shadow-sm overflow-hidden border-dashed rounded-2xl md:rounded-lg">
          <CardHeader className="px-4 py-3 border-b border-border/10 bg-muted/5">
            <div className="text-[13px] font-bold md:font-semibold text-foreground tracking-tight flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Invite New User
            </div>
          </CardHeader>
          <CardContent className="p-4 md:p-4 space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div className="space-y-1.5">
                  <label className="md:hidden text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Username</label>
                  <Input
                    className="h-10 md:h-8 text-[13px] md:text-[12px] bg-background/50 rounded-xl md:rounded-md"
                    placeholder="Username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="md:hidden text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Email</label>
                  <Input
                    className="h-10 md:h-8 text-[13px] md:text-[12px] bg-background/50 rounded-xl md:rounded-md"
                    placeholder="Email address"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="md:hidden text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Role</label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="h-10 md:h-8 text-[13px] md:text-[12px] bg-background/50 border-border/30 rounded-xl md:rounded-md">
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {rolesLoading && (
                        <div className="px-2 py-1 text-[11px] text-muted-foreground">Loading roles…</div>
                      )}
                      {assignableRoles.map((role) => (
                        <SelectItem key={role.key} value={role.key} className="text-[12px]">
                          {role.name || role.key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="md:hidden text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Password</label>
                  <Input
                    className="h-10 md:h-8 text-[13px] md:text-[12px] bg-background/50 rounded-xl md:rounded-md"
                    placeholder="Password (optional, min 6)"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              </div>
              {form.password && form.password.length < 6 && (
                <p className="text-[10px] text-destructive italic mt-1 font-medium">Minimum 6 characters required.</p>
              )}
              <div className="flex justify-end gap-2.5 pt-2">
                <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setInviting(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="h-8 text-[12px] px-6 font-medium" onClick={onCreate} disabled={!!form.password && form.password.length < 6}>
                  Send Invitation
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite User Form - Mobile (Bottom Sheet) */}
      <Sheet open={isAdmin && inviting && isMobile} onOpenChange={setInviting}>
        <SheetContent side="bottom" className="rounded-t-[2.5rem] p-6 pb-10 border-t-0 bg-background/95 backdrop-blur-xl">
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <SheetTitle className="text-[18px] font-bold tracking-tight">Invite Member</SheetTitle>
                <SheetDescription className="text-[13px] text-muted-foreground">Add someone to your organization workspace</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Username</label>
                <Input
                  className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4"
                  placeholder="e.g. johndoe"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Email Address</label>
                <Input
                  className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4"
                  placeholder="e.g. john@briefly.ai"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Assigned Role</label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {assignableRoles.map((role) => (
                      <SelectItem key={role.key} value={role.key} className="text-[13px] py-3">
                        {role.name || role.key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Temporary Password</label>
                <Input
                  type="password"
                  className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4"
                  placeholder="Required minimum 6 chars"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>
            {form.password && form.password.length < 6 && (
              <p className="text-[11px] text-destructive italic font-medium ml-1">Password must be at least 6 characters.</p>
            )}
            <div className="pt-4 flex flex-col gap-3">
              <Button
                size="lg"
                className="w-full h-14 text-[15px] font-bold rounded-2xl shadow-xl shadow-primary/20 active:scale-[0.98] transition-all"
                onClick={onCreate}
                disabled={!!form.password && form.password.length < 6}
              >
                Send Invitation
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full h-14 text-[14px] font-semibold text-muted-foreground rounded-2xl"
                onClick={() => setInviting(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Users Table */}
      <Card className="border-none md:border border-border/20 bg-transparent md:bg-card shadow-none md:shadow-sm">
        <CardContent className="p-0">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/10 bg-muted/5">
                  <th className="text-left py-2 px-4 font-bold text-[11px] text-muted-foreground/70 uppercase tracking-widest">User</th>
                  <th className="text-left py-2 px-4 font-bold text-[11px] text-muted-foreground/70 uppercase tracking-widest">Email</th>
                  <th className="text-left py-2 px-4 font-bold text-[11px] text-muted-foreground/70 uppercase tracking-widest">Teams</th>
                  <th className="text-left py-2 px-4 font-bold text-[11px] text-muted-foreground/70 uppercase tracking-widest">Role</th>
                  <th className="text-right py-2 px-4 font-bold text-[11px] text-muted-foreground/70 uppercase tracking-widest">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {loading ? (
                  // Show skeleton loaders while loading
                  <>
                    <UserSkeleton />
                    <UserSkeleton />
                    <UserSkeleton />
                    <UserSkeleton />
                    <UserSkeleton />
                  </>
                ) : (
                  users.map(u => (
                    <tr key={u.username} className="hover:bg-muted/5 transition-all duration-200">
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-md bg-muted/30 text-muted-foreground/80 flex items-center justify-center text-[10px] font-bold border border-border/10">
                            {(u.displayName || u.username).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-foreground truncate tracking-tight">{u.displayName || u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-[13px] text-muted-foreground font-medium">
                        {u.email || '—'}
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {getTeamBadges(u).map((d: any) => (
                            <Badge key={d.id} variant="outline" className="px-1.5 py-0 h-4.5 text-[10px] uppercase font-bold tracking-tight border-border/40 bg-muted/20" data-color={d.color || 'default'}>
                              {d.name}
                            </Badge>
                          ))}
                          {Array.isArray(u.departments) && u.departments.length > 2 && (
                            <span className="text-[10px] font-bold text-muted-foreground/40 ml-0.5">+{u.departments.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-4">
                        {isAdmin ? (
                          <Select
                            value={u.role as any}
                            onValueChange={async (v) => {
                              try {
                                const orgId = getApiContext().orgId || '';
                                if (orgId) {
                                  await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(u.username)}`, {
                                    method: 'PATCH',
                                    body: { role: v },
                                  });
                                }
                                updateUser(u.username, prev => ({ ...prev, role: v as any }));
                                toast({
                                  title: 'Role updated',
                                  description: `${u.email || u.username} is now ${getRoleLabel(v)}.`
                                });
                              } catch (e: any) {
                                const msg = (e as Error)?.message?.replace(/^API.*failed:\s*/, '') || 'Failed to update role';
                                toast({
                                  title: 'Could not update role',
                                  description: msg,
                                  variant: 'destructive' as any
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 w-[130px] text-[12px] bg-background/50 border-border/30 focus:ring-1 focus:ring-primary/20">
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                              {rolesLoading && (
                                <div className="px-2 py-1 text-[11px] text-muted-foreground">Loading roles…</div>
                              )}
                              {assignableRoles.map((role) => (
                                <SelectItem key={role.key} value={role.key} className="text-[12px]">
                                  {role.name || role.key}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-[12px] font-semibold text-muted-foreground/80 uppercase tracking-widest">{getRoleLabel(u.role as any)}</div>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Change Password Button */}
                          {(isAdmin || isTeamLead) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-primary transition-colors"
                              onClick={() => setPasswordModal({ isOpen: true, user: u })}
                              disabled={(u.role === 'orgAdmin' || u.role === 'owner') && u.username !== bootstrapData?.user?.id}
                            >
                              <Lock className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {/* Delete Button */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700"
                                disabled={
                                  (u.role === 'orgAdmin' || u.role === 'owner') ||
                                  (!isAdmin && !isTeamLead) ||
                                  (u.username === bootstrapData?.user?.id) // Cannot delete self
                                }
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove user from organization?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will revoke access for {u.email || u.username}. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction asChild>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={u.role === 'orgAdmin' || u.role === 'owner'}
                                    onClick={async () => {
                                      try {
                                        const orgId = getApiContext().orgId || '';
                                        if (orgId) await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' });
                                      } catch { }
                                      removeUser(u.username);
                                      toast({
                                        title: 'User removed',
                                        description: `${u.email || u.username} no longer has access.`
                                      });
                                    }}
                                  >
                                    Delete
                                  </Button>
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-2xl border border-border/10 bg-card p-4 space-y-4 shadow-sm animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted/40" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-32 bg-muted/40 rounded" />
                        <div className="h-3 w-48 bg-muted/20 rounded" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <div className="h-6 w-16 bg-muted/30 rounded-full" />
                      <div className="flex gap-2">
                        <div className="h-8 w-8 bg-muted/20 rounded-lg" />
                        <div className="h-8 w-8 bg-muted/20 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-[13px] text-muted-foreground font-medium">No members found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {users.map(u => (
                  <div key={u.username} className="group relative overflow-hidden rounded-[1.5rem] border border-border/40 bg-card/60 p-4 shadow-sm transition-all active:scale-[0.99]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/5 text-primary flex items-center justify-center text-[14px] font-bold border border-primary/10">
                          {(u.displayName || u.username).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[14px] font-bold text-foreground truncate tracking-tight">
                            {u.displayName || u.username}
                          </div>
                          <div className="text-[11px] font-medium text-muted-foreground/60 truncate">
                            {u.email || 'No email attached'}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons Hub */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {(isAdmin || isTeamLead) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-xl bg-muted/30 text-muted-foreground active:text-primary active:bg-primary/10 transition-colors"
                            onClick={() => setPasswordModal({ isOpen: true, user: u })}
                            disabled={(u.role === 'orgAdmin' || u.role === 'owner') && u.username !== bootstrapData?.user?.id}
                          >
                            <Lock className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-xl bg-destructive/5 text-destructive active:bg-destructive/20 transition-colors"
                          disabled={!isAdmin || u.role === 'orgAdmin' || u.role === 'owner' || u.username === bootstrapData?.user?.id}
                          onClick={() => setDeleteModal({ isOpen: true, user: u })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      {/* Teams display */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getTeamBadges(u).map((d: any) => (
                          <Badge key={d.id} variant="outline" className="px-2 py-0 h-5 text-[10px] font-bold uppercase tracking-tight border-border/40 bg-muted/20">
                            {d.name}
                          </Badge>
                        ))}
                        {Array.isArray(u.departments) && u.departments.length > 2 && (
                          <span className="text-[10px] font-bold text-muted-foreground/40">+{u.departments.length - 2}</span>
                        )}
                      </div>

                      {/* Responsive Role Picker */}
                      <div className="shrink-0">
                        {isAdmin ? (
                          <Select
                            value={u.role as any}
                            onValueChange={async (v) => {
                              try {
                                const orgId = getApiContext().orgId || '';
                                if (orgId) await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(u.username)}`, { method: 'PATCH', body: { role: v } });
                                updateUser(u.username, prev => ({ ...prev, role: v as any }));
                                toast({ title: 'Role updated' });
                              } catch (e: any) {
                                toast({ title: 'Update failed', variant: 'destructive' as any });
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 w-[110px] text-[11px] font-bold bg-primary/5 border-none rounded-lg text-primary">
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {assignableRoles.map((role) => (
                                <SelectItem key={role.key} value={role.key} className="text-[12px] font-medium">
                                  {role.name || role.key}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-bold uppercase py-0.5 border-primary/20 bg-primary/5 text-primary">
                            {getRoleLabel(u.role as any)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Change Password Modal - Desktop */}
      {!isMobile && (
        <Dialog
          open={passwordModal.isOpen}
          onOpenChange={(open) => {
            if (!open) {
              setPasswordModal({ isOpen: false, user: null });
              setPasswordForm({ newPassword: '', confirmPassword: '' });
            }
          }}
        >
          <DialogContent className="max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="text-[15px] font-semibold tracking-tight">Change Password</DialogTitle>
              <DialogDescription className="text-[12px] text-muted-foreground leading-relaxed mt-1">
                Reset the account password for <span className="text-foreground font-medium">{passwordModal.user?.email || passwordModal.user?.username}</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-muted-foreground/80 tracking-tight pl-0.5">NEW PASSWORD</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="h-8 text-[13px] bg-background/50 border-border/30 focus-visible:ring-primary/20"
                />
                {passwordForm.newPassword && passwordForm.newPassword.length < 6 && (
                  <p className="text-[11px] text-destructive mt-1 font-medium">Minimum 6 characters.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-muted-foreground/80 tracking-tight pl-0.5">CONFIRM PASSWORD</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="h-8 text-[13px] bg-background/50 border-border/30 focus-visible:ring-primary/20"
                />
                {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                  <p className="text-[11px] text-destructive mt-1 font-medium">Passwords do not match.</p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-[12px]"
                onClick={() => {
                  setPasswordModal({ isOpen: false, user: null });
                  setPasswordForm({ newPassword: '', confirmPassword: '' });
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-9 text-[12px] px-6"
                onClick={onChangePassword}
                disabled={
                  changingPassword ||
                  !passwordForm.newPassword.trim() ||
                  !passwordForm.confirmPassword.trim() ||
                  passwordForm.newPassword !== passwordForm.confirmPassword ||
                  passwordForm.newPassword.length < 6
                }
              >
                {changingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Update Password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Change Password Modal - Mobile (Bottom Sheet) */}
      <Sheet
        open={passwordModal.isOpen && isMobile}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordModal({ isOpen: false, user: null });
            setPasswordForm({ newPassword: '', confirmPassword: '' });
          }
        }}
      >
        <SheetContent side="bottom" className="rounded-t-[2.5rem] p-6 pb-10 border-t-0 bg-background/95 backdrop-blur-xl">
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <SheetTitle className="text-[18px] font-bold tracking-tight">Security Reset</SheetTitle>
                <SheetDescription className="text-[13px] text-muted-foreground mr-4">Update login credentials for {passwordModal.user?.displayName || passwordModal.user?.username}</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="space-y-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">New Password</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                />
                {passwordForm.newPassword && passwordForm.newPassword.length < 6 && (
                  <p className="text-[11px] text-destructive mt-1 font-medium ml-1">Minimum 6 characters required.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Confirm New Password</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  className="h-12 text-[14px] bg-muted/30 border-none rounded-2xl px-4"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                />
                {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                  <p className="text-[11px] text-destructive mt-1 font-medium ml-1">The passwords you entered do not match.</p>
                )}
              </div>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              <Button
                size="lg"
                className="w-full h-14 text-[15px] font-bold rounded-2xl shadow-xl shadow-primary/20 active:scale-[0.98] transition-all"
                onClick={onChangePassword}
                disabled={
                  changingPassword ||
                  !passwordForm.newPassword.trim() ||
                  !passwordForm.confirmPassword.trim() ||
                  passwordForm.newPassword !== passwordForm.confirmPassword ||
                  passwordForm.newPassword.length < 6
                }
              >
                {changingPassword ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                Reset Password
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full h-14 text-[14px] font-semibold text-muted-foreground rounded-2xl"
                onClick={() => {
                  setPasswordModal({ isOpen: false, user: null });
                  setPasswordForm({ newPassword: '', confirmPassword: '' });
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Member Confirmation - Mobile (Bottom Sheet) */}
      <Sheet
        open={deleteModal.isOpen && isMobile}
        onOpenChange={(open) => {
          if (!open) setDeleteModal({ isOpen: false, user: null });
        }}
      >
        <SheetContent side="bottom" className="rounded-t-[2.5rem] p-6 pb-10 border-t-0 bg-background/95 backdrop-blur-xl">
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div className="text-left">
                <SheetTitle className="text-[18px] font-bold tracking-tight text-destructive">Remove Member?</SheetTitle>
                <SheetDescription className="text-[13px] text-muted-foreground mr-4">
                  This will revoke all workspace access for <span className="font-bold text-foreground">{deleteModal.user?.displayName || deleteModal.user?.username}</span>. This action is irreversible.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="pt-4 flex flex-col gap-3">
            <Button
              size="lg"
              variant="destructive"
              className="w-full h-14 text-[15px] font-bold rounded-2xl shadow-xl shadow-red-500/20 active:scale-[0.98] transition-all"
              onClick={onDeleteUser}
              disabled={deletingUser}
            >
              {deletingUser ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              Delete Member
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="w-full h-14 text-[14px] font-semibold text-muted-foreground rounded-2xl"
              onClick={() => setDeleteModal({ isOpen: false, user: null })}
            >
              Keep Member
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
