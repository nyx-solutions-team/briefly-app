"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { DATE_FORMAT_STORAGE_KEY } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

export type UserSettings = {
  date_format: string;
  accent_color: string;
  dark_mode: boolean;
  chat_filters_enabled: boolean;
  ui_scale?: 'sm' | 'md' | 'lg';
};

export type OrgSettings = {
  date_format: string;
  accent_color: string;
  dark_mode: boolean;
  chat_filters_enabled: boolean;
  ui_scale?: 'sm' | 'md' | 'lg';
};

type SettingsContextValue = {
  settings: OrgSettings;
  updateSettings: (patch: Partial<OrgSettings>) => Promise<void>;
};

const DEFAULTS: OrgSettings = {
  date_format: 'd MMM yyyy',
  accent_color: 'default',
  dark_mode: false,
  chat_filters_enabled: false,
  ui_scale: 'md',
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({
  children,
  bootstrapData
}: {
  children: React.ReactNode;
  bootstrapData?: {
    userSettings: UserSettings;
    orgSettings: any;
  }
}) {
  const [settings, setSettings] = useState<OrgSettings>(DEFAULTS);
  const initializedRef = React.useRef(false);

  const applySettingsData = useCallback((settingsData: any) => {
    const next: OrgSettings = {
      date_format: settingsData.date_format || DEFAULTS.date_format,
      accent_color: settingsData.accent_color || DEFAULTS.accent_color,
      dark_mode: !!settingsData.dark_mode,
      chat_filters_enabled: !!settingsData.chat_filters_enabled,
      ui_scale: undefined,
    };

    try {
      if (typeof window !== 'undefined') {
        const ui = window.localStorage.getItem('ui_scale');
        next.ui_scale = (ui === 'sm' || ui === 'md' || ui === 'lg') ? ui : DEFAULTS.ui_scale;
      }
    } catch { }

    setSettings(next);
    applyToDom(next);
    try { if (typeof window !== 'undefined') (window as any).__APP_DATE_FORMAT = next.date_format; } catch { }
  }, []);

  const load = useCallback(async () => {
    try {
      // Use bootstrap data if available, otherwise fall back to API call
      if (bootstrapData?.userSettings) {
        applySettingsData(bootstrapData.userSettings);
      } else {
        // Guard: require a session before calling
        const sess = await supabase.auth.getSession();
        if (!sess.data.session) return;
        const settingsData = await apiFetch<any>(`/me/settings`);
        applySettingsData(settingsData);
      }
    } catch { }
  }, [bootstrapData, applySettingsData]);

  // Initialize with bootstrap data or fetch if needed
  useEffect(() => {
    if (initializedRef.current) return;

    // If we have bootstrap data, use it immediately
    if (bootstrapData?.userSettings) {
      initializedRef.current = true;
      applySettingsData(bootstrapData.userSettings);
      return;
    }

    // If bootstrapData is undefined, wait for it (auth still loading)
    if (bootstrapData === undefined) {
      return;
    }

    // bootstrapData is null or has no settings - need to fetch
    initializedRef.current = true;
    void load();
  }, [load, bootstrapData, applySettingsData]);

  // Only listen for org context changes if we don't have bootstrap data
  useEffect(() => {
    if (bootstrapData?.userSettings) {
      return; // Bootstrap data available, no need to listen
    }
    const off = onApiContextChange(() => { void load(); });
    return () => { off(); };
  }, [load, bootstrapData]);

  const updateSettings = useCallback(async (patch: Partial<OrgSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await apiFetch(`/me/settings`, {
        method: 'PUT', body: {
          date_format: next.date_format,
          accent_color: next.accent_color,
          dark_mode: next.dark_mode,
          chat_filters_enabled: next.chat_filters_enabled,
        }
      });
    } catch { }
    applyToDom(next);
    try { if (typeof window !== 'undefined') (window as any).__APP_DATE_FORMAT = next.date_format; } catch { }
  }, [settings]);

  function applyToDom(next: OrgSettings) {
    try { if (typeof document !== 'undefined') document.documentElement.setAttribute('data-color', next.accent_color); } catch { }
    try { if (typeof document !== 'undefined') document.documentElement.setAttribute('data-chat-filters', next.chat_filters_enabled ? '1' : '0'); } catch { }
    try {
      if (typeof document !== 'undefined') {
        if (next.dark_mode) document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark');
      }
    } catch { }
    try {
      if (typeof document !== 'undefined') {
        const scale = next.ui_scale || DEFAULTS.ui_scale!;
        document.documentElement.setAttribute('data-ui-scale', scale);
        // Adjust root font-size to scale typography and spacing (Tailwind uses rem)
        const size = scale === 'sm' ? 15 : scale === 'lg' ? 18 : 16; // px
        (document.documentElement as HTMLElement).style.fontSize = `${size}px`;
        if (typeof window !== 'undefined') window.localStorage.setItem('ui_scale', scale);
      }
    } catch { }
  }

  const value = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}

