"use client";

import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export type OpsHeaderConfig = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  meta?: ReactNode;
};

type OpsHeaderContextValue = {
  header: OpsHeaderConfig;
  setHeader: (config: OpsHeaderConfig) => void;
  resetHeader: () => void;
};

const DEFAULT_HEADER: OpsHeaderConfig = {
  title: 'Control Center',
  subtitle: 'Monitor organizations and unblock at-risk workspaces.',
};

const OpsHeaderContext = createContext<OpsHeaderContextValue | null>(null);

function headersEqual(a: OpsHeaderConfig, b: OpsHeaderConfig) {
  return (
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.actions === b.actions &&
    a.meta === b.meta &&
    a.backHref === b.backHref &&
    (a.backHref ? a.backLabel : 'Back') === (b.backHref ? b.backLabel : 'Back')
  );
}

export function OpsHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] = useState<OpsHeaderConfig>(DEFAULT_HEADER);

  const setHeader = useCallback((config: OpsHeaderConfig) => {
    const next: OpsHeaderConfig = {
      ...DEFAULT_HEADER,
      ...config,
      backLabel: config.backHref ? config.backLabel || 'Back' : undefined,
    };
    setHeaderState((prev) => (headersEqual(prev, next) ? prev : next));
  }, []);

  const resetHeader = useCallback(() => {
    setHeaderState(DEFAULT_HEADER);
  }, []);

  const value = useMemo(
    () => ({
      header,
      setHeader,
      resetHeader,
    }),
    [header, setHeader, resetHeader]
  );

  return <OpsHeaderContext.Provider value={value}>{children}</OpsHeaderContext.Provider>;
}

export function useOpsHeader() {
  const ctx = useContext(OpsHeaderContext);
  if (!ctx) throw new Error('useOpsHeader must be used within OpsHeaderProvider');
  return ctx;
}

export function useOpsPageHeader(config: OpsHeaderConfig) {
  const { setHeader, resetHeader } = useOpsHeader();
  const { title, subtitle, actions, meta, backHref, backLabel } = config;

  useEffect(() => {
    setHeader({ title, subtitle, actions, meta, backHref, backLabel });
    return () => {
      resetHeader();
    };
  }, [title, subtitle, actions, meta, backHref, backLabel, resetHeader, setHeader]);
}

export function OpsHeaderSync(props: OpsHeaderConfig) {
  useOpsPageHeader(props);
  return null;
}
