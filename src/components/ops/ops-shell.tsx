"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  ActivitySquare,
  ArrowLeft,
  BarChart3,
  Building2,
  DatabaseZap,
  FolderKanban,
  LayoutDashboard,
  PlusSquare,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { AccessDenied } from '@/components/access-denied';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useOpsAccess } from '@/components/ops/ops-provider';
import { OpsPill } from '@/components/ops/ops-primitives';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const CONTROL_NAV: NavItem[] = [
  { href: '/ops', label: 'Overview', icon: LayoutDashboard },
  { href: '/ops/orgs', label: 'Organizations', icon: Building2 },
  { href: '/ops/orgs/new', label: 'Create Org', icon: PlusSquare },
];

const VISIBILITY_NAV: NavItem[] = [
  { href: '/ops/usage', label: 'Usage', icon: BarChart3 },
  { href: '/ops/storage', label: 'Storage', icon: DatabaseZap },
  { href: '/ops/activity', label: 'Activity', icon: ActivitySquare },
];

const ALL_NAV = [...CONTROL_NAV, ...VISIBILITY_NAV];

export function OpsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { whoami, isLoading, error, refresh } = useOpsAccess();

  const activeLabel = useMemo(() => {
    const match = ALL_NAV.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.label || 'Overview';
  }, [pathname]);

  if (isLoading) {
    return <OpsShellLoadingState />;
  }

  if (error) {
    return (
      <div className="min-h-svh bg-background px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-2xl rounded-3xl border border-border/50 bg-card/90 p-8 shadow-sm">
          <div className="space-y-3">
            <OpsPill tone="warning">Ops Console</OpsPill>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Unable to load ops access
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">{error}</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to App
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!whoami?.enableOps || !whoami?.platformAdmin) {
    return (
      <AccessDenied
        title={whoami?.enableOps === false ? 'Ops Disabled' : 'Platform Admin Required'}
        message={
          whoami?.enableOps === false
            ? 'The ops console is disabled in the backend configuration.'
            : 'This workspace is restricted to platform admins configured in briefly-api.'
        }
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" variant="sidebar" className="border-r border-sidebar-border/10 bg-transparent">
        <SidebarHeader className="border-b border-sidebar-border/40 p-0">
          <div className="ops-sidebar-surface flex items-center gap-3 rounded-[1.35rem] border border-sidebar-border/40 px-3 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.08)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-accent-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-[11px] uppercase tracking-[0.2em] text-sidebar-foreground/60">
                Briefly
              </p>
              <p className="text-sm font-semibold text-sidebar-foreground">Ops Console</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="py-4">
          <SidebarGroup>
            <SidebarGroupLabel>Control Plane</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {CONTROL_NAV.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/ops' && pathname.startsWith(`${item.href}/`));
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Visibility</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {VISIBILITY_NAV.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/ops' && pathname.startsWith(`${item.href}/`));
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Next Up</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="space-y-3 px-2 group-data-[collapsible=icon]:hidden">
                <div className="rounded-[1.35rem] border border-sidebar-border/35 bg-sidebar/60 p-3">
                  <p className="text-sm font-medium text-sidebar-foreground">Intervention Layer</p>
                  <p className="mt-1 text-xs leading-5 text-sidebar-foreground/70">
                    Ingestion, incidents, and access troubleshooting are the next milestone after visibility.
                  </p>
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border/40 p-3">
          <div className="space-y-3 group-data-[collapsible=icon]:space-y-2">
            <div className="group-data-[collapsible=icon]:hidden">
              <OpsPill tone="success">Platform Admin</OpsPill>
              {whoami.ip ? (
                <p className="mt-2 text-xs text-sidebar-foreground/70">Current IP: {whoami.ip}</p>
              ) : null}
            </div>
            <Button variant="outline" className="w-full justify-start group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0" asChild>
              <Link href="/dashboard">
                <FolderKanban className="h-4 w-4" />
                <span className="group-data-[collapsible=icon]:hidden">Back to App</span>
              </Link>
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="ops-shell border border-border/30 bg-transparent md:rounded-[1.75rem]">
        <div className="ops-canvas min-h-svh bg-transparent">
          <header className="sticky top-0 z-10 border-b border-border/40 bg-background/70 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-4 sm:px-6">
              <SidebarTrigger className="h-8 w-8" />
              <div className="min-w-0 rounded-full border border-border/40 bg-background/70 px-3 py-2 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Internal Platform
                </p>
                <p className="truncate text-sm font-semibold text-foreground">{activeLabel}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <OpsPill tone="success">Live</OpsPill>
                <Button variant="outline" size="sm" onClick={() => void refresh()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Access
                </Button>
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function OpsShellLoadingState() {
  return (
    <div className="min-h-svh bg-background">
      <div className="grid min-h-svh md:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-border/50 bg-card/70 p-4 md:block">
          <div className="space-y-4">
            <Skeleton className="h-12 rounded-2xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        </aside>
        <section className="space-y-6 p-6">
          <Skeleton className="h-16 rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[420px] rounded-3xl" />
        </section>
      </div>
    </div>
  );
}
