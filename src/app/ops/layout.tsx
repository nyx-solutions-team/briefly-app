"use client";

import { OpsProvider } from '@/components/ops/ops-provider';
import { OpsShell } from '@/components/ops/ops-shell';

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <OpsProvider>
      <OpsShell>{children}</OpsShell>
    </OpsProvider>
  );
}
