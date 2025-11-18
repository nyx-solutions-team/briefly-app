"use client";

import { DocumentsProvider } from '@/hooks/use-documents';
import { DepartmentsProvider } from '@/hooks/use-departments';
import { AuditProvider } from '@/hooks/use-audit';
import { SecurityProvider } from '@/hooks/use-security';
import { SettingsProvider } from '@/hooks/use-settings';
import { DashboardStatsProvider } from '@/hooks/use-dashboard-stats';
import { CategoriesProvider } from '@/hooks/use-categories';
import { useAuth } from '@/hooks/use-auth';
import ErrorBoundary from '@/components/error-boundary';
import { PlanBanner } from '@/components/plan-banner';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const { bootstrapData } = useAuth();

  return (
    <SettingsProvider
      bootstrapData={bootstrapData ? {
        userSettings: bootstrapData.userSettings,
        orgSettings: bootstrapData.orgSettings
      } : undefined}
    >
      <SecurityProvider
        bootstrapData={bootstrapData?.orgSettings ? {
          orgSettings: {
            ip_allowlist_enabled: bootstrapData.orgSettings?.ip_allowlist_enabled,
            ip_allowlist_ips: bootstrapData.orgSettings?.ip_allowlist_ips
          }
        } : undefined}
      >
        <CategoriesProvider
          bootstrapData={bootstrapData?.orgSettings ? {
            orgSettings: {
              categories: bootstrapData.orgSettings?.categories || []
            }
          } : undefined}
        >
          <AuditProvider>
            <DashboardStatsProvider>
              <DepartmentsProvider bootstrapData={bootstrapData ? { departments: bootstrapData.departments } : undefined}>
                <ErrorBoundary>
                  <DocumentsProvider>
                    <PlanBanner />
                    {children}
                  </DocumentsProvider>
                </ErrorBoundary>
              </DepartmentsProvider>
            </DashboardStatsProvider>
          </AuditProvider>
        </CategoriesProvider>
      </SecurityProvider>
    </SettingsProvider>
  );
}
