"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';

export type NetworkPolicy = {
  enabled: boolean;
  ips: string[]; // exact IPv4/IPv6 strings for demo
};

type SecurityContextValue = {
  policy: NetworkPolicy;
  setEnabled: (v: boolean) => void;
  addIp: (ip: string) => void;
  removeIp: (ip: string) => void;
  replaceIps: (ips: string[]) => void;
  getCurrentIp: () => Promise<string>;
  isIpAllowed: (ip: string, opts?: { bypass?: boolean }) => boolean;
};

const STORAGE_KEY = 'documind_ip_allowlist_v1';
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
  // Basic IPv6 validation (can be expanded for full RFC compliance)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  return ipv6Regex.test(ip);
};

const isValidIP = (ip: string): boolean => {
  // Check for CIDR notation (e.g., 192.168.1.0/24)
  if (ip.includes('/')) {
    const [network, prefix] = ip.split('/');
    const prefixNum = parseInt(prefix, 10);

    // Validate network part is a valid IP
    if (!isValidIPv4(network) && !isValidIPv6(network)) {
      return false;
    }

    // Validate prefix length
    if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) {
      return false;
    }

    return true;
  }

  // Standard IP validation
  return isValidIPv4(ip) || isValidIPv6(ip);
};

export function SecurityProvider({
  children,
  bootstrapData
}: {
  children: React.ReactNode;
  bootstrapData?: { orgSettings: { ip_allowlist_enabled: boolean; ip_allowlist_ips: string[] } }
}) {
  const [policy, setPolicy] = useState<NetworkPolicy>({ enabled: false, ips: [] });
  const initializedRef = React.useRef(false);

  const loadFromServer = useCallback(async () => {
    try {
      // Use bootstrap data if available, otherwise fall back to API call
      if (bootstrapData?.orgSettings) {
        const s = bootstrapData.orgSettings;
        setPolicy({ enabled: !!s.ip_allowlist_enabled, ips: Array.isArray(s.ip_allowlist_ips) ? s.ip_allowlist_ips : [] });
      } else {
        const { orgId } = getApiContext();
        if (!orgId) return;
        const s = await apiFetch<any>(`/orgs/${orgId}/settings`);
        setPolicy({ enabled: !!s.ip_allowlist_enabled, ips: Array.isArray(s.ip_allowlist_ips) ? s.ip_allowlist_ips : [] });
      }
    } catch { }
  }, [bootstrapData]);

  // Initialize with bootstrap data or fetch if needed
  useEffect(() => {
    if (initializedRef.current) return;

    // If we have bootstrap data, use it immediately
    if (bootstrapData?.orgSettings) {
      initializedRef.current = true;
      const s = bootstrapData.orgSettings;
      setPolicy({ enabled: !!s.ip_allowlist_enabled, ips: Array.isArray(s.ip_allowlist_ips) ? s.ip_allowlist_ips : [] });
      return;
    }

    // If bootstrapData is undefined, wait for it (auth still loading)
    if (bootstrapData === undefined) {
      return;
    }

    // bootstrapData is null or has no settings - need to fetch
    initializedRef.current = true;
    void loadFromServer();
  }, [loadFromServer, bootstrapData]);

  // Only listen for org context changes if we don't have bootstrap data
  useEffect(() => {
    if (bootstrapData?.orgSettings) {
      return; // Bootstrap data available, no need to listen
    }
    const off = onApiContextChange(() => { void loadFromServer(); });
    return () => { off(); };
  }, [loadFromServer, bootstrapData]);

  // No localStorage persistence; rely on backend settings only

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

  const setEnabled = useCallback((v: boolean) => setPolicy(prev => { const next = { ...prev, enabled: v }; void persist(next); return next; }), [persist]);

  const addIp = useCallback((ip: string) => {
    const trimmed = ip.trim();
    if (!trimmed || !isValidIP(trimmed)) {
      throw new Error(`Invalid IP address format: ${ip}`);
    }
    setPolicy(prev => {
      const next = { ...prev, ips: Array.from(new Set([...prev.ips, trimmed])) };
      void persist(next);
      return next;
    });
  }, [persist]);

  const removeIp = useCallback((ip: string) => setPolicy(prev => { const next = { ...prev, ips: prev.ips.filter(x => x !== ip) }; void persist(next); return next; }), [persist]);

  const replaceIps = useCallback((ips: string[]) => {
    const validatedIps = ips.map(ip => ip.trim()).filter(ip => ip && isValidIP(ip));
    if (validatedIps.length !== ips.filter(ip => ip.trim()).length) {
      throw new Error('One or more IP addresses have invalid format');
    }
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

  const value = useMemo(() => ({ policy, setEnabled, addIp, removeIp, replaceIps, getCurrentIp, isIpAllowed }), [policy, setEnabled, addIp, removeIp, replaceIps, getCurrentIp, isIpAllowed]);
  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export function useSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used within a SecurityProvider');
  return ctx;
}

