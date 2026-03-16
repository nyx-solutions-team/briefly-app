"use client";

import * as React from 'react';
import { getOpsWhoAmI, type OpsWhoAmI } from '@/lib/ops-api';

type OpsContextValue = {
  whoami: OpsWhoAmI | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const OpsContext = React.createContext<OpsContextValue | undefined>(undefined);

export function OpsProvider({ children }: { children: React.ReactNode }) {
  const [whoami, setWhoAmI] = React.useState<OpsWhoAmI | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getOpsWhoAmI();
      setWhoAmI(data || null);
    } catch (err) {
      const status = (err as any)?.status;
      const data = (err as any)?.data;
      const message = err instanceof Error ? err.message : 'Unable to load ops access';

      if (status === 403) {
        const rawError = String(data?.error || message || '').toLowerCase();
        setWhoAmI({
          enableOps: !rawError.includes('ops disabled'),
          platformAdmin: false,
          userId: null,
          ip: null,
        });
        setError(null);
      } else {
        setWhoAmI(null);
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = React.useMemo(
    () => ({
      whoami,
      isLoading,
      error,
      refresh,
    }),
    [whoami, isLoading, error, refresh]
  );

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}

export function useOpsAccess() {
  const context = React.useContext(OpsContext);
  if (!context) {
    throw new Error('useOpsAccess must be used within an OpsProvider');
  }
  return context;
}
