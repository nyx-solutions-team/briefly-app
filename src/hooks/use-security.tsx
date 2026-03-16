"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

export type NetworkPolicy = {
  enabled: boolean;
  ips: string[];
};

type SecurityContextValue = {
  policy: NetworkPolicy;
  loading: boolean;
  setEnabled: (v: boolean) => void;
  updateAllowlist: (patch: { enforced: boolean }) => Promise<void>;
  addIp: (ip: string) => Promise<void>;
  removeIp: (ip: string) => Promise<void>;
  replaceIps: (ips: string[]) => Promise<void>;
  getCurrentIp: () => Promise<string>;
  isIpAllowed: (ip: string, opts?: { bypass?: boolean }) => boolean;
  grantBypass: () => Promise<void>;
  revokeBypass: () => Promise<void>;
  activeBypass: { expiresAt: string } | null;
};

const SecurityContext = createContext<SecurityContextValue | undefined>(undefined);

// IP address validation functions
const isValidIPv4 = (ip: string): boolean => {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) return false;
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
};

const isValidIPv6 = (ip: string): boolean => {
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  return ipv6Regex.test(ip);
};

const isValidIP = (ip: string): boolean => {
  if (ip.includes('/')) {
    const [network, prefix] = ip.split('/');
    const prefixNum = parseInt(prefix, 10);
    if (!isValidIPv4(network) && !isValidIPv6(network)) return false;
    if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) return false;
    return true;
  }
  return isValidIPv4(ip) || isValidIPv6(ip);
};

export function SecurityProvider({
  children,
  bootstrapData
}: {
  children: React.ReactNode;
  bootstrapData?: any;
}) {
  const { refreshPermissions, user } = useAuth();
  const [policy, setPolicy] = useState<NetworkPolicy>({ enabled: false, ips: [] });
  const [loading, setLoading] = useState(true);
  const initializedRef = React.useRef(false);

  const loadFromServer = useCallback(async () => {
    try {
      setLoading(true);
      const { orgId } = getApiContext();
      if (!orgId) return;
      const s = await apiFetch<any>(`/orgs/${orgId}/settings`);
      setPolicy({
        enabled: !!s.ip_allowlist_enabled,
        ips: Array.isArray(s.ip_allowlist_ips) ? s.ip_allowlist_ips : []
      });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    if (bootstrapData?.orgSettings) {
      initializedRef.current = true;
      const s = bootstrapData.orgSettings;
      setPolicy({ enabled: !!s.ip_allowlist_enabled, ips: Array.isArray(s.ip_allowlist_ips) ? s.ip_allowlist_ips : [] });
      setLoading(false);
      return;
    }
    if (bootstrapData === undefined) return;
    initializedRef.current = true;
    void loadFromServer();
  }, [loadFromServer, bootstrapData]);

  useEffect(() => {
    const off = onApiContextChange(() => { void loadFromServer(); });
    return () => { off(); };
  }, [loadFromServer]);

  const persist = useCallback(async (next: NetworkPolicy) => {
    try {
      const { orgId } = getApiContext();
      if (!orgId) return;
      await apiFetch(`/orgs/${orgId}/settings`, {
        method: 'PUT',
        body: {
          ip_allowlist_enabled: next.enabled,
          ip_allowlist_ips: next.ips,
        },
      });
    } catch { }
  }, []);

  const setEnabled = useCallback((v: boolean) => setPolicy(prev => {
    const next = { ...prev, enabled: v };
    void persist(next);
    return next;
  }), [persist]);

  const updateAllowlist = useCallback(async (patch: { enforced: boolean }) => {
    setEnabled(patch.enforced);
  }, [setEnabled]);

  const addIp = useCallback(async (ip: string) => {
    const trimmed = ip.trim();
    if (!trimmed || !isValidIP(trimmed)) throw new Error(`Invalid IP address format: ${ip}`);
    setPolicy(prev => {
      const next = { ...prev, ips: Array.from(new Set([...prev.ips, trimmed])) };
      void persist(next);
      return next;
    });
  }, [persist]);

  const removeIp = useCallback(async (ip: string) => setPolicy(prev => {
    const next = { ...prev, ips: prev.ips.filter(x => x !== ip) };
    void persist(next);
    return next;
  }), [persist]);

  const replaceIps = useCallback(async (ips: string[]) => {
    const validatedIps = ips.map(ip => ip.trim()).filter(ip => ip && isValidIP(ip));
    setPolicy(prev => {
      const next = { ...prev, ips: Array.from(new Set(validatedIps)) };
      void persist(next);
      return next;
    });
  }, [persist]);

  const getCurrentIp = useCallback(async () => {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const { ip } = await res.json();
      return ip || '';
    } catch {
      return '';
    }
  }, []);

  const isIpAllowed = useCallback((ip: string, opts?: { bypass?: boolean }) => {
    if (!policy.enabled) return true;
    if (opts?.bypass) return true;
    return policy.ips.includes(ip);
  }, [policy]);

  const grantBypass = useCallback(async () => {
    const { orgId } = getApiContext();
    if (!orgId) return;
    await apiFetch(`/orgs/${orgId}/security/ip-bypass`, { method: 'POST' });
    await refreshPermissions();
  }, [refreshPermissions]);

  const revokeBypass = useCallback(async () => {
    const { orgId } = getApiContext();
    if (!orgId) return;
    await apiFetch(`/orgs/${orgId}/security/ip-bypass`, { method: 'DELETE' });
    await refreshPermissions();
  }, [refreshPermissions]);

  const activeBypass = useMemo(() => {
    if (user?.ipBypassExpiresAt) {
      return { expiresAt: user.ipBypassExpiresAt };
    }
    return null;
  }, [user?.ipBypassExpiresAt]);

  const value = useMemo(() => ({
    policy,
    loading,
    setEnabled,
    updateAllowlist,
    addIp,
    removeIp,
    replaceIps,
    getCurrentIp,
    isIpAllowed,
    grantBypass,
    revokeBypass,
    activeBypass
  }), [policy, loading, setEnabled, updateAllowlist, addIp, removeIp, replaceIps, getCurrentIp, isIpAllowed, grantBypass, revokeBypass, activeBypass]);

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export function useSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used within a SecurityProvider');
  return ctx;
}
