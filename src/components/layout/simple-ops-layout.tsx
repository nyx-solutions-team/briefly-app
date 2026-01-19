"use client";

import * as React from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import SimpleOpsSidebar from '@/components/simple-ops-sidebar';
import { OpsFiltersProvider } from '@/components/ops/ops-filters-context';
import OpsGlobalHeader from '@/components/ops/ops-global-header';
import { OpsHeaderProvider } from '@/components/ops/ops-header-context';

type SimpleOpsLayoutProps = {
  children: React.ReactNode;
  showFilters?: boolean;
};

export default function SimpleOpsLayout({
  children,
  showFilters = true,
}: SimpleOpsLayoutProps) {
  return (
    <SidebarProvider>
      <OpsFiltersProvider>
        <OpsHeaderProvider>
          <SimpleOpsSidebar />
          <SidebarInset className="flex min-h-svh flex-col bg-background">
            <OpsGlobalHeader showFilters={showFilters} />
            <main className="flex-1">{children}</main>
          </SidebarInset>
        </OpsHeaderProvider>
      </OpsFiltersProvider>
    </SidebarProvider>
  );
}
