"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setApiContext, onApiContextChange, getApiContext } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export type Role = string;

type AuthUser = {
  username: string;
  email: string;
  role: Role;
  ipBypassExpiresAt?: string | null;
};

type BootstrapData = {
  user: { id: string; displayName: string | null };
  orgs: Array<{ orgId: string; role: string; name: string; expiresAt?: string; joinedAt?: string }>;
  selectedOrgId: string;
  orgSettings: any;
  userSettings: any;
  permissions: Record<string, any>;
  permissionsMeta?: Record<string, any>;
  departments: Array<{
    id: string;
    org_id: string;
    name: string;
    lead_user_id?: string | null;
    color?: string | null;
    created_at?: string;
    updated_at?: string;
    is_member?: boolean;
    is_lead?: boolean;
  }>;
  plan?: {
    key: string;
    storageUsedBytes: number;
    storageLimitBytes: number;
    planStartedAt?: string | null;
    planEndsAt?: string | null;
    graceEndsAt?: string | null;
    expired?: boolean;
    storageFull?: boolean;
    withinGrace?: boolean;
    usageCalculatedAt?: string | null;
  };
  // Dashboard summary data from bootstrap (eliminates separate /dashboard/teams call)
  dashboardSummary?: {
    teams: Array<{
      id: string;
      name: string;
      memberCount: number;
      docsToday: number;
      docsThisWeek: number;
      leadUserId?: string | null;
    }>;
    stats?: {
      totalDocs: number;
      recentUploads: number;
      totalStorageBytes: number;
    } | null;
  } | null;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  user: AuthUser | null;
  bootstrapData: BootstrapData | null;
  signIn: (params: { username: string; password: string; email?: string }) => Promise<boolean>;
  signOut: () => void;
  isLoading: boolean;
  hasRoleAtLeast: (role: Role) => boolean;
  hasPermission: (permission: string) => boolean;
  refreshPermissions: () => Promise<void>;
};

const STORAGE_KEY = 'docustore_auth_v1';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoginLoggedAt, setLastLoginLoggedAt] = useState<number>(0);
  const router = useRouter();

  // Consolidated auth initialization - single API call
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;

        if (!token) {
          if (mounted) setIsLoading(false);
          return;
        }

        const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
        const res = await fetch(`${base}/me/bootstrap`, { headers: { Authorization: `Bearer ${token}` } });

        if (!res.ok) {
          if (mounted) setIsLoading(false);
          return;
        }

        const bootstrap = await res.json();
        if (!mounted) return; // Component unmounted

        const now = Date.now();
        const orgs = Array.isArray(bootstrap.orgs) ? bootstrap.orgs : [];
        const activeOrgs = orgs.filter((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now);
        const firstActiveOrg = activeOrgs[0]?.orgId || '';

        // Set both user and org context in one go
        setApiContext({ orgId: firstActiveOrg });

        if (!firstActiveOrg) {
          try { router.push('/no-access'); } catch { }
          return;
        }

        const roleOrder: Record<string, number> = { guest: 0, contentViewer: 1, viewer: 1, contentManager: 2, member: 2, editor: 2, teamLead: 2, manager: 3, orgAdmin: 4, owner: 5 };
        const best = activeOrgs.reduce(
          (acc: any, r: any) => ((roleOrder[r.role] ?? -1) > (roleOrder[acc.role] ?? -1) ? r : acc),
          activeOrgs[0] || { role: 'member' }
        );
        const backendRole = best?.role || 'member';
        const email = sess.session?.user?.email || sess.session?.user?.id || '';
        const bypassMeta = bootstrap.permissionsMeta?.security?.ip_bypass;
        const bypassExpiresAt = bypassMeta?.source === 'timedGrant' ? (bypassMeta.expiresAt as string | undefined) : undefined;

        // Store bootstrap data for use by other providers
        setBootstrapData(bootstrap);


        setUser({
          username: email,
          email,
          role: backendRole,
          ipBypassExpiresAt: bypassExpiresAt ?? null
        });



      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [router]);

  // Remove localStorage persistence; rely on Supabase session + /me

  const signIn = useCallback(async ({ username, password }: { username: string; password: string; email?: string }) => {
    const emailLike = username.trim();
    const pass = password.trim();
    // Use Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailLike, password: pass });
    if (error || !data.session) return false;

    // Persist auth cookie marker for middleware gating
    try {
      if (typeof document !== 'undefined') {
        const maxAge = 60 * 60 * 24 * 30; // 30 days
        document.cookie = `docustore_auth_v1=1; path=/; max-age=${maxAge}`;
      }
    } catch { }

    // Fetch bootstrap data from backend with Authorization bearer token
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
      const res = await fetch(`${base}/me/bootstrap`, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      if (!res.ok) throw new Error('profile fetch failed');
      const bootstrap = await res.json();

      const now = Date.now();
      const orgs = Array.isArray(bootstrap.orgs) ? bootstrap.orgs : [];
      const firstActiveOrg = orgs.find((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now)?.orgId || '';

      setApiContext({ orgId: firstActiveOrg });
      if (!firstActiveOrg) {
        try { router.push('/no-access'); } catch { }
      }
      // Record login audit for the selected org (prevent duplicates within 60 seconds)
      // Make this non-blocking to speed up login
      if (firstActiveOrg) {
        const now = Date.now();
        const timeSinceLastLogin = now - lastLoginLoggedAt;
        if (timeSinceLastLogin > 60000) { // 60 seconds
          // Don't await - fire and forget for faster login
          fetch(`${base}/orgs/${firstActiveOrg}/audit/login`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          }).then(() => {
            setLastLoginLoggedAt(now);
          }).catch(() => {
            // non-blocking, ignore errors
          });
        }
      }
      // Map highest org role to app role
      const roleOrder: Record<string, number> = { guest: 0, contentViewer: 1, viewer: 1, contentManager: 2, member: 2, editor: 2, teamLead: 2, manager: 3, orgAdmin: 4, owner: 5 };
      const activeOrgs = orgs.filter((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now);
      const best = (activeOrgs.length > 0 ? activeOrgs : orgs).reduce(
        (acc: any, r: any) => ((roleOrder[r.role] ?? -1) > (roleOrder[acc.role] ?? -1) ? r : acc),
        activeOrgs[0] || orgs[0] || { role: 'member' }
      );
      const backendRole = best?.role || 'member';
      const bypassMeta = bootstrap.permissionsMeta?.security?.ip_bypass;
      const bypassExpiresAt = bypassMeta?.source === 'timedGrant' ? (bypassMeta.expiresAt as string | undefined) : undefined;
      const signedInUser: AuthUser = {
        username: data.user.email || data.user.id,
        email: data.user.email || data.user.id,
        role: backendRole,
        ipBypassExpiresAt: bypassExpiresAt ?? null,
      };

      // Store bootstrap data for use by other providers
      setBootstrapData(bootstrap);
      setUser(signedInUser);
      return true;
    } catch {
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setBootstrapData(null); // Clear bootstrap data
    // Clear API org context quickly to stop org-scoped calls
    try { setApiContext({ orgId: '' }); } catch { }
    // Clear Supabase session and localStorage
    try {
      void supabase.auth.signOut();
      // Also clear any remaining Supabase localStorage keys
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
      }
    } catch { }
    // Clear our cookie
    try {
      if (typeof document !== 'undefined') {
        document.cookie = 'docustore_auth_v1=; Max-Age=0; path=/';
      }
    } catch { }
    // Hard redirect to ensure clean state and middleware run
    try {
      if (typeof window !== 'undefined') {
        window.location.replace('/signin');
        return;
      }
    } catch { }
    try { router.replace('/signin'); } catch { }
  }, [router]);

  const hasRoleAtLeast = useCallback((role: Role) => {
    if (!bootstrapData?.permissions) return false;
    const perms = bootstrapData.permissions || {};
    switch (role) {
      case 'systemAdmin':
      case 'orgAdmin':
      case 'owner':
        return perms['org.manage_members'] === true;
      case 'teamLead':
        return perms['departments.manage_members'] === true;
      case 'contentManager':
        return perms['documents.update'] === true || perms['documents.create'] === true;
      case 'contentViewer':
      case 'guest':
      case 'member':
        return perms['documents.read'] === true;
      default:
        return perms['documents.read'] === true;
    }
  }, [bootstrapData]);

  // Refresh permissions when organization context changes
  const refreshPermissionsForCurrentOrg = useCallback(async () => {
    if (!bootstrapData || !getApiContext().orgId) return;

    // When org context changes, we need to refresh the bootstrap data
    // to get the permissions for the new organization
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session?.access_token) return;

      const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
      const currentOrgId = getApiContext().orgId;

      // Fetch fresh bootstrap data with the current org context
      const res = await fetch(`${base}/me/bootstrap`, {
        headers: {
          Authorization: `Bearer ${sess.session.access_token}`,
          'X-Org-Id': currentOrgId
        }
      });

      if (res.ok) {
        const freshBootstrap = await res.json();
        setBootstrapData(freshBootstrap);
        setUser(prev => {
          if (!prev) return prev;
          const now = Date.now();
          const orgs = Array.isArray(freshBootstrap.orgs) ? freshBootstrap.orgs : [];
          const activeOrgs = orgs.filter((o: any) => !o.expiresAt || new Date(o.expiresAt).getTime() > now);
          const roleOrder: Record<string, number> = { guest: 0, contentViewer: 1, viewer: 1, contentManager: 2, member: 2, editor: 2, teamLead: 2, manager: 3, orgAdmin: 4, owner: 5 };
          const best = (activeOrgs.length > 0 ? activeOrgs : orgs).reduce(
            (acc: any, r: any) => ((roleOrder[r.role] ?? -1) > (roleOrder[acc.role] ?? -1) ? r : acc),
            activeOrgs[0] || orgs[0] || { role: prev.role }
          );
          const backendRole = best?.role || 'member';
          const bypassMeta = freshBootstrap.permissionsMeta?.security?.ip_bypass;
          const bypassExpiresAt = bypassMeta?.source === 'timedGrant' ? (bypassMeta.expiresAt as string | undefined) : undefined;
          return {
            ...prev,
            role: backendRole,
            ipBypassExpiresAt: bypassExpiresAt ?? null,
          };
        });
      }
    } catch (error) {
      console.error('Failed to refresh permissions for current org:', error);
    }
  }, [bootstrapData]);

  // Listen for organization context changes and refresh permissions
  useEffect(() => {
    const off = onApiContextChange(({ orgId }) => {

      refreshPermissionsForCurrentOrg();
    });
    return () => { off(); };
  }, [refreshPermissionsForCurrentOrg]);

  const hasPermission = useCallback((permission: string) => {
    if (!bootstrapData?.permissions) return false;
    return !!bootstrapData.permissions[permission];
  }, [bootstrapData]);

  // Auto-logout when a timed IP bypass expires (client-side safeguard; server should also enforce)
  // Optimized expiration check - only check when needed
  useEffect(() => {
    if (!user?.ipBypassExpiresAt) return;

    const checkAndLogout = () => {
      if (!user?.ipBypassExpiresAt) return;
      const end = new Date(user.ipBypassExpiresAt).getTime();
      if (!Number.isFinite(end)) return;
      if (end <= Date.now()) {
        signOut();
      }
    };

    checkAndLogout();
    const intervalId = setInterval(checkAndLogout, 60_000);
    return () => clearInterval(intervalId);
  }, [user?.ipBypassExpiresAt, signOut]);

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated: !!user,
    user,
    bootstrapData,
    signIn,
    signOut,
    isLoading,
    hasRoleAtLeast,
    hasPermission,
    refreshPermissions: refreshPermissionsForCurrentOrg
  }), [user, bootstrapData, signIn, signOut, isLoading, hasRoleAtLeast, hasPermission, refreshPermissionsForCurrentOrg]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
