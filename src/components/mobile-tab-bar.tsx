"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Folder,
  CloudUpload,
  MessageSquare,
  MoreHorizontal,
  Activity,
  ListChecks,
  Trash2,
  Wrench,
  Settings,
  ArrowLeft,
  User,
  Palette,
  Building2,
  Users,
  UsersRound,
  Lock,
  Shield,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type NavLink = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  adminOnly?: boolean;
};

const BASE_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Home", Icon: LayoutDashboard },
  { href: "/documents", label: "Docs", Icon: Folder, permission: "pages.documents" },
  { href: "/documents/upload", label: "Upload", Icon: CloudUpload, permission: "pages.upload" },
  { href: "/chat", label: "Chat", Icon: MessageSquare, permission: "pages.chat" },
];

const MORE_LINKS: NavLink[] = [
  { href: "/audit", label: "Activity", Icon: Activity, permission: "pages.activity" },
  { href: "/queue", label: "Queue", Icon: ListChecks, permission: "pages.queue" },
  { href: "/recycle-bin", label: "Recycle Bin", Icon: Trash2, permission: "pages.recycle_bin" },
  { href: "/ops", label: "Ops", Icon: Wrench, permission: "org.manage_members" },
  { href: "/settings", label: "Settings", Icon: Settings },
];

const SETTINGS_ACCOUNT_LINKS: NavLink[] = [
  { href: "/settings/profile", label: "Profile", Icon: User },
  { href: "/settings/preferences", label: "Preferences", Icon: Palette },
];

const SETTINGS_ORG_LINKS: NavLink[] = [
  { href: "/settings/general", label: "General", Icon: Building2, adminOnly: true },
  { href: "/settings/members", label: "Members", Icon: Users, permission: "org.manage_members" },
  { href: "/settings/teams", label: "Teams", Icon: UsersRound },
  { href: "/settings/permissions", label: "Permissions", Icon: Lock, adminOnly: true },
  { href: "/settings/security", label: "Security", Icon: Shield, adminOnly: true },
];

function useFilteredLinks(links: NavLink[]) {
  const { bootstrapData } = useAuth();
  const permissions = bootstrapData?.permissions || {};
  const canUpload = permissions['pages.upload'] !== false;

  return useMemo(() => {
    return links.filter(({ permission }) => {
      if (!permission) return true;

      const isPagePermission = permission.startsWith('pages.');
      if (isPagePermission) {
        // Queue: if pages.queue is explicitly set, use it; otherwise fall back to pages.upload
        // This ensures backward compatibility with existing roles that don't have pages.queue
        if (permission === "pages.queue") {
          if (permissions[permission] === true) return true;
          if (permissions[permission] === undefined && canUpload) return true;
          return false;
        }
        if (permission === "pages.recycle_bin") {
          return permissions[permission] === true; // recycle bin opt-in
        }
        if (permissions[permission] === false) {
          return false;
        }
        return true;
      }

      // Non-page permissions must be explicitly granted
      return permissions[permission] === true;
    });
  }, [links, permissions, canUpload]);
}

import { getApiContext, apiFetch } from "@/lib/api";

export function MobileTabBar() {
  const pathname = usePathname();
  const primaryLinks = useFilteredLinks(BASE_LINKS).slice(0, 4);
  const moreLinks = useFilteredLinks(MORE_LINKS).filter((link) => link.href !== "/ops");
  const [moreOpen, setMoreOpen] = useState(false);

  const { user, signOut, bootstrapData, hasPermission } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [queueCount, setQueueCount] = useState(0);
  const [recycleCount, setRecycleCount] = useState(0);
  const isSettings = pathname?.startsWith("/settings");
  const permissions = bootstrapData?.permissions || {};
  const isAdmin = hasPermission("org.manage_members");
  const isTeamLead = (bootstrapData?.departments || []).some((d: any) => d?.is_lead);
  const canManageOrgMembers = permissions["org.manage_members"] === true;
  const canManageTeamMembers = permissions["departments.manage_members"] === true;

  const settingsOrgLinks = useMemo(() => {
    return SETTINGS_ORG_LINKS.filter((item) => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.permission === "org.manage_members" && !canManageOrgMembers) return false;
      if (item.href === "/settings/teams" && !(isAdmin || isTeamLead || canManageTeamMembers)) {
        return false;
      }
      return true;
    });
  }, [isAdmin, isTeamLead, canManageOrgMembers, canManageTeamMembers]);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setTheme(isDarkMode ? "dark" : "light");
  }, []);

  useEffect(() => {
    setTheme(settings.dark_mode ? "dark" : "light");
  }, [settings.dark_mode]);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    void updateSettings({ dark_mode: nextTheme === "dark" });
  };

  const handleSignOut = () => {
    setMoreOpen(false);
    signOut();
  };

  useEffect(() => {
    const fetchCounts = async () => {
      if (!user) return;
      const { orgId } = getApiContext();
      if (!orgId) return;

      try {
        // Fetch queue count
        const queueRes = await apiFetch<any>(`/orgs/${orgId}/ingestion-jobs?limit=1`);
        if (queueRes && queueRes.statusCounts) {
          const counts = queueRes.statusCounts;
          const count = (counts.pending || 0) + (counts.processing || 0) + (counts.needs_review || 0);
          setQueueCount(count);
        }

        // Fetch recycle bin count
        const recycleRes = await apiFetch<any>(`/orgs/${orgId}/recycle-bin?limit=1`);
        if (recycleRes) {
          if (typeof recycleRes.total === 'number') {
            setRecycleCount(recycleRes.total);
          } else if (Array.isArray(recycleRes)) {
            setRecycleCount(recycleRes.length);
          } else if (recycleRes.items && Array.isArray(recycleRes.items)) {
            setRecycleCount(recycleRes.total || recycleRes.items.length);
          }
        }
      } catch (e) {
        console.error('Failed to fetch mobile tab counts', e);
      }
    };

    fetchCounts();

    // Listen for updates
    const handleUpdate = () => fetchCounts();
    window.addEventListener('documentDeleted', handleUpdate);
    window.addEventListener('documentRestored', handleUpdate);
    window.addEventListener('documentPurged', handleUpdate);
    window.addEventListener('ingestionJobUpdated', handleUpdate);

    return () => {
      window.removeEventListener('documentDeleted', handleUpdate);
      window.removeEventListener('documentRestored', handleUpdate);
      window.removeEventListener('documentPurged', handleUpdate);
      window.removeEventListener('ingestionJobUpdated', handleUpdate);
    };
  }, [user]);

  // Check if we have any notifications in the "More" section
  const hasMoreNotifications = moreLinks.some(link => {
    if (link.href === '/queue') return queueCount > 0;
    if (link.href === '/recycle-bin') return recycleCount > 0;
    return false;
  });

  if (primaryLinks.length === 0 && moreLinks.length === 0) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/95 px-1 py-1.5 shadow-[0_-6px_30px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
        <nav className="grid h-14 grid-cols-5 gap-1">
          {primaryLinks.map(({ href, label, Icon }) => {
            const isActive =
              pathname === href ||
              (href !== "/dashboard" && pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center rounded-2xl text-[11px] font-medium transition-all",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    isActive
                      ? "text-primary drop-shadow-[0_3px_8px_rgba(59,130,246,0.45)]"
                      : ""
                  )}
                />
                <span className="mt-0.5">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center rounded-2xl text-[11px] font-medium transition-all relative",
              moreOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="More options"
          >
            <div className="relative">
              <MoreHorizontal className="h-5 w-5" />
              {hasMoreNotifications && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <span className="mt-0.5">More</span>
          </button>
        </nav>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden rounded-t-[32px] border-none px-0 pb-12 pt-6 shadow-2xl"
        >
          <SheetHeader className="px-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 rounded-2xl border bg-muted/40 px-3 py-2 shadow-sm">
                {theme === "light" ? (
                  <Sun className="h-4 w-4 text-amber-500" />
                ) : (
                  <Moon className="h-4 w-4 text-sky-400" />
                )}
                <Switch
                  checked={theme === "dark"}
                  onCheckedChange={toggleTheme}
                  aria-label="Toggle dark mode"
                />
              </div>
              <SheetTitle className="text-base font-semibold">
                Quick actions
              </SheetTitle>
            </div>
          </SheetHeader>

          <div className="mt-6 grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto px-6 pb-4">
            {moreLinks.map(({ href, label, Icon }) => {
              const isActive =
                pathname === href || pathname?.startsWith(`${href}/`);

              let badgeCount = 0;
              if (href === '/queue') badgeCount = queueCount;
              if (href === '/recycle-bin') badgeCount = recycleCount;
              const badgeText = badgeCount > 99 ? '99+' : badgeCount > 0 ? badgeCount.toString() : null;

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-muted/30 px-4 py-3 text-sm font-medium transition hover:border-primary/40 hover:bg-primary/5 relative overflow-hidden",
                    isActive && "border-primary/60 bg-primary/5 text-primary"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <span className="truncate">{label}</span>
                    {badgeText && (
                      <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                        {badgeText}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
            {moreLinks.length === 0 && (
              <div className="col-span-2 rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing extra to show yet.
              </div>
            )}
          </div>
          <div className="px-6 pb-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-center">Sign out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
