"use client";

import AppLayout from "@/components/layout/app-layout";
import { useAudit } from "@/hooks/use-audit";
import { useAuth } from "@/hooks/use-auth";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useMemo, useState, useEffect, useCallback } from "react";
import { formatAppDateTime } from "@/lib/utils";
import { useUsers } from "@/hooks/use-users";
import { useDocuments } from "@/hooks/use-documents";
import { useSettings } from "@/hooks/use-settings";
import { apiFetch, getApiContext } from "@/lib/api";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  MobileFilterButton,
  FilterSection,
} from "@/components/mobile-filter-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileText,
  User,
  Calendar as CalendarIcon,
  Clock,
  Search,
  Filter,
  Edit,
  Trash2,
  Plus,
  Move,
  Link as LinkIcon,
  Unlink,
  Download,
  Activity,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import type { AuditFilters } from "@/hooks/use-audit";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  login: "Login",
  create: "Created",
  edit: "Edited",
  delete: "Deleted",
  move: "Moved",
  link: "Linked",
  unlink: "Unlinked",
  versionSet: "Version Set",
};

const TYPE_ICONS: Record<string, any> = {
  login: User,
  create: Plus,
  edit: Edit,
  delete: Trash2,
  move: Move,
  link: LinkIcon,
  unlink: Unlink,
  versionSet: Download,
};

const ROLE_LABEL: Record<string, string> = {
  systemadmin: "Admin",
  contentmanager: "Manager",
  contentviewer: "Viewer",
  guest: "Guest",
  orgadmin: "Admin",
  orgmanager: "Manager",
  orgviewer: "Viewer",
  orgguest: "Guest",
  admin: "Admin",
  manager: "Manager",
  viewer: "Viewer",
};

function normalizeRoleLabel(role?: string): string {
  if (!role) return "—";
  const key = String(role).toLowerCase();
  return ROLE_LABEL[key] || role.charAt(0).toUpperCase() + role.slice(1);
}

function getThemeColors(accentColor: string) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    default: { bg: "bg-primary/10", text: "text-primary" },
    red: { bg: "bg-red-500/10", text: "text-red-500" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-500" },
    orange: { bg: "bg-orange-500/10", text: "text-orange-500" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-500" },
    yellow: { bg: "bg-yellow-500/10", text: "text-yellow-600" },
    lime: { bg: "bg-lime-500/10", text: "text-lime-600" },
    green: { bg: "bg-green-500/10", text: "text-green-600" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    teal: { bg: "bg-teal-500/10", text: "text-teal-600" },
    cyan: { bg: "bg-cyan-500/10", text: "text-cyan-600" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600" },
    blue: { bg: "bg-blue-500/10", text: "text-blue-600" },
    indigo: { bg: "bg-indigo-500/10", text: "text-indigo-600" },
    violet: { bg: "bg-violet-500/10", text: "text-violet-600" },
    purple: { bg: "bg-purple-500/10", text: "text-purple-600" },
    fuchsia: { bg: "bg-fuchsia-500/10", text: "text-fuchsia-600" },
    pink: { bg: "bg-pink-500/10", text: "text-pink-600" },
  };
  return colorMap[accentColor] || colorMap.default;
}

// Linear-style user avatar
function UserAvatar({ email, name }: { email?: string; name?: string }) {
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);
  const displayName = name || email?.split("@")[0] || "U";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium",
          themeColors.bg,
          themeColors.text
        )}
      >
        {initials}
      </div>
      <span
        className="text-sm font-medium text-foreground truncate max-w-[120px]"
        title={email || name}
      >
        {displayName}
      </span>
    </div>
  );
}

// Linear-style type badge
function TypeBadge({ t }: { t: string }) {
  const Icon = TYPE_ICONS[t];
  const styles: Record<string, string> = {
    delete:
      "bg-red-500/10 text-red-600 dark:text-red-400 border-red-200/50 dark:border-red-800/50",
    edit: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/50",
    move: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50",
    link: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50",
    unlink:
      "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200/50 dark:border-slate-800/50",
    login:
      "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200/50 dark:border-purple-800/50",
    create:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/50",
    versionSet:
      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-800/50",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-xs font-medium border",
        styles[t] ||
        "bg-muted/50 text-muted-foreground border-border/50"
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {TYPE_LABEL[t] || t}
    </Badge>
  );
}

// Linear-style list item skeleton
function ItemSkeleton() {
  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-border/20 animate-pulse">
      <div className="w-28 flex items-center gap-2">
        <div className="h-3 w-3 bg-muted/40 rounded" />
        <div className="h-4 w-20 bg-muted/40 rounded" />
      </div>
      <div className="flex items-center gap-2.5 w-36">
        <div className="h-7 w-7 bg-muted/40 rounded-full" />
        <div className="h-4 w-20 bg-muted/40 rounded" />
      </div>
      <div className="h-5 w-16 bg-muted/40 rounded-full" />
      <div className="flex-1">
        <div className="h-4 w-48 bg-muted/40 rounded" />
      </div>
    </div>
  );
}

export default function AuditPage() {
  const {
    events,
    includeSelf,
    setIncludeSelf,
    isLoading,
    hasLoaded,
    loadAudit,
    page,
    setPage,
    totalPages,
    totalCount,
    pageSize,
    availableActors,
    actorsLoading,
    loadActors,
  } = useAudit();
  const { user } = useAuth();
  const { users } = useUsers();
  const { getDocumentById } = useDocuments();
  const [canViewAudit, setCanViewAudit] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    const checkAuditAccess = async () => {
      try {
        const { orgId } = getApiContext();
        if (!orgId) return;

        const canAccess = await apiFetch<boolean>(
          `/orgs/${orgId}/audit/can-access`
        );
        setCanViewAudit(canAccess);
      } catch (error) {
        console.error("Error checking audit access:", error);
        setCanViewAudit(false);
      } finally {
        setCheckingAccess(false);
      }
    };

    if (user) {
      checkAuditAccess();
    } else {
      setCheckingAccess(false);
    }
  }, [user]);

  useEffect(() => {
    if (canViewAudit) {
      void loadActors();
    }
  }, [canViewAudit, loadActors]);

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const defaultEnd = fmt(today);
  const defaultStart = fmt(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));

  const [q, setQ] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [actorsPick, setActorsPick] = useState<string[]>([]);
  const [start, setStart] = useState<string>(defaultStart);
  const [end, setEnd] = useState<string>(defaultEnd);
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(defaultStart),
    to: new Date(defaultEnd),
  });

  const buildFilters = useCallback(
    (overrides: Partial<AuditFilters> = {}): AuditFilters => ({
      type: selectedTypes.length > 0 ? selectedTypes.join(",") : undefined,
      actors: actorsPick.length > 0 ? actorsPick : undefined,
      from: start,
      to: end,
      excludeSelf: !includeSelf,
      page: overrides.page || page,
      limit: pageSize,
      ...overrides,
    }),
    [selectedTypes, actorsPick, start, end, includeSelf, page, pageSize]
  );

  const reloadWithFilters = useCallback(
    (newPage?: number) => {
      if (canViewAudit) {
        void loadAudit(buildFilters({ page: newPage || 1 }));
        if (newPage) setPage(newPage);
      }
    },
    [canViewAudit, loadAudit, buildFilters, setPage]
  );

  useEffect(() => {
    if (canViewAudit && hasLoaded === false) {
      void loadAudit(buildFilters({ page: 1 }));
    }
  }, [canViewAudit, hasLoaded, loadAudit, buildFilters]);

  useEffect(() => {
    if (!canViewAudit || !hasLoaded) return;

    const timer = setTimeout(() => {
      reloadWithFilters(1);
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypes, actorsPick, start, end, includeSelf]);

  const handlePageChange = (newPage: number) => {
    if (canViewAudit) {
      void loadAudit(buildFilters({ page: newPage }));
    }
  };

  const displayEvents = useMemo(() => {
    if (!q.trim()) return events;
    const s = q.toLowerCase();
    return events.filter((e) => {
      const hay = [e.actor, e.type, e.title, e.docId, e.note, e.path]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [events, q]);

  const activeFilterCount =
    selectedTypes.length +
    actorsPick.length +
    (start !== defaultStart || end !== defaultEnd ? 1 : 0);

  if (checkingAccess) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Checking access permissions...</span>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!canViewAudit) {
    return (
      <AppLayout>
        <AccessDenied
          title="Activity Access Restricted"
          message="You do not have access to activity logs. Only organization admins and team leads can view audit logs."
          backHref="/dashboard"
          backLabel="Back to Dashboard"
          icon={<Activity className="h-8 w-8 text-muted-foreground" />}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen flex flex-col">
        {/* Header - Linear style */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Activity className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">
                    Activity
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {isLoading ? (
                      <span className="inline-block w-32 h-4 bg-muted/30 rounded animate-pulse" />
                    ) : (
                      `${displayEvents.length} shown · ${totalCount} total events`
                    )}
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => reloadWithFilters(page)}
                disabled={isLoading}
                className="gap-2 h-8 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
                />
                <span className="hidden sm:inline text-sm">Refresh</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Search & Filters Toolbar */}
        <div className="px-6 py-3 border-b border-border/30 bg-background/50">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Search activity..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9 h-8 bg-muted/30 border-border/40 text-sm placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Desktop Filters */}
            <div className="hidden md:flex items-center gap-2">
              {/* Types Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 gap-1.5 text-sm",
                      selectedTypes.length > 0
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Types
                    {selectedTypes.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded-full">
                        {selectedTypes.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
                    Activity Types
                  </div>
                  <div className="max-h-64 overflow-auto space-y-0.5">
                    <div
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                        selectedTypes.length === 0
                          ? "bg-primary/10"
                          : "hover:bg-muted/50"
                      )}
                      onClick={() => setSelectedTypes([])}
                    >
                      <Checkbox
                        checked={selectedTypes.length === 0}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-sm">All Types</span>
                    </div>
                    {Object.entries(TYPE_LABEL).map(([key, label]) => {
                      const Icon = TYPE_ICONS[key];
                      const checked = selectedTypes.includes(key);
                      return (
                        <div
                          key={key}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                            checked ? "bg-primary/10" : "hover:bg-muted/50"
                          )}
                          onClick={() =>
                            setSelectedTypes((prev) =>
                              checked
                                ? prev.filter((x) => x !== key)
                                : [...prev, key]
                            )
                          }
                        >
                          <Checkbox checked={checked} className="h-3.5 w-3.5" />
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* People Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 gap-1.5 text-sm",
                      actorsPick.length > 0
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    <User className="h-3.5 w-3.5" />
                    People
                    {actorsPick.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded-full">
                        {actorsPick.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
                    Filter by User
                  </div>
                  <div className="max-h-64 overflow-auto space-y-0.5">
                    {actorsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">
                          Loading...
                        </span>
                      </div>
                    ) : availableActors.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-6">
                        No users found
                      </div>
                    ) : (
                      <>
                        <div
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                            actorsPick.length === 0
                              ? "bg-primary/10"
                              : "hover:bg-muted/50"
                          )}
                          onClick={() => setActorsPick([])}
                        >
                          <Checkbox
                            checked={actorsPick.length === 0}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-sm">All Users</span>
                        </div>
                        {availableActors.map((a) => {
                          const checked = actorsPick.includes(a.id);
                          return (
                            <div
                              key={a.id}
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                                checked ? "bg-primary/10" : "hover:bg-muted/50"
                              )}
                              onClick={() =>
                                setActorsPick((prev) =>
                                  checked
                                    ? prev.filter((x) => x !== a.id)
                                    : [...prev, a.id]
                                )
                              }
                            >
                              <Checkbox
                                checked={checked}
                                className="h-3.5 w-3.5"
                              />
                              <UserAvatar email={a.email} name={a.name} />
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <div className="w-px h-4 bg-border/50" />

              {/* Date Range */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 gap-1.5 text-sm",
                      start !== defaultStart || end !== defaultEnd
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Date
                    {(start !== defaultStart || end !== defaultEnd) && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded-full">
                        1
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-3 w-auto" align="start">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Calendar
                      mode="range"
                      selected={range}
                      onSelect={(r) => {
                        setRange(r);
                        if (r?.from) setStart(fmt(r.from));
                        if (r?.to) setEnd(fmt(r.to));
                        setPage(1);
                      }}
                      numberOfMonths={1}
                    />
                    <div className="flex flex-col gap-1.5">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Quick Select
                      </div>
                      {[
                        { label: "Last 7 days", days: 6 },
                        { label: "Last 14 days", days: 13 },
                        { label: "Last 30 days", days: 29 },
                      ].map(({ label, days }) => (
                        <Button
                          key={label}
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs justify-start text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const d1 = new Date();
                            const d0 = new Date(
                              d1.getTime() - days * 86400000
                            );
                            setRange({ from: d0, to: d1 });
                            setStart(fmt(d0));
                            setEnd(fmt(d1));
                            setPage(1);
                          }}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {user?.role === "systemAdmin" && (
                <>
                  <div className="w-px h-4 bg-border/50" />
                  <div className="flex items-center gap-2">
                    <Switch
                      id="include-self"
                      checked={includeSelf}
                      onCheckedChange={(v) => setIncludeSelf(!!v)}
                      className="scale-90"
                    />
                    <label
                      htmlFor="include-self"
                      className="text-xs text-muted-foreground cursor-pointer"
                    >
                      Include my activity
                    </label>
                  </div>
                </>
              )}

              {activeFilterCount > 0 && (
                <>
                  <div className="w-px h-4 bg-border/50" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSelectedTypes([]);
                      setActorsPick([]);
                      setStart(defaultStart);
                      setEnd(defaultEnd);
                      setRange({
                        from: new Date(defaultStart),
                        to: new Date(defaultEnd),
                      });
                    }}
                  >
                    Clear filters
                  </Button>
                </>
              )}
            </div>

            {/* Mobile Filter Button */}
            <div className="md:hidden">
              <MobileFilterButton
                title="Filter Activity"
                description="Filter by type, people, and date range"
                activeCount={activeFilterCount}
              >
                <div className="space-y-1">
                  <FilterSection
                    title="Activity Types"
                    badge={selectedTypes.length}
                    defaultOpen={selectedTypes.length > 0}
                  >
                    <div className="space-y-1">
                      {Object.entries(TYPE_LABEL).map(([key, label]) => {
                        const Icon = TYPE_ICONS[key];
                        const checked = selectedTypes.includes(key);
                        return (
                          <div
                            key={key}
                            className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                setSelectedTypes((prev) =>
                                  v
                                    ? [...prev, key]
                                    : prev.filter((x) => x !== key)
                                )
                              }
                            />
                            <div className="flex items-center gap-2 text-sm">
                              {Icon && <Icon className="h-3.5 w-3.5" />}
                              {label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </FilterSection>

                  <FilterSection
                    title="People"
                    badge={actorsPick.length}
                    defaultOpen={actorsPick.length > 0}
                  >
                    <div className="max-h-48 overflow-auto space-y-1">
                      {actorsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">
                            Loading...
                          </span>
                        </div>
                      ) : (
                        availableActors.map((a) => {
                          const checked = actorsPick.includes(a.id);
                          return (
                            <div
                              key={a.id}
                              className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  setActorsPick((prev) =>
                                    v
                                      ? [...prev, a.id]
                                      : prev.filter((x) => x !== a.id)
                                  )
                                }
                              />
                              <UserAvatar email={a.email} name={a.name} />
                            </div>
                          );
                        })
                      )}
                    </div>
                  </FilterSection>

                  <FilterSection
                    title="Date Range"
                    badge={
                      start !== defaultStart || end !== defaultEnd ? 1 : 0
                    }
                    defaultOpen={start !== defaultStart || end !== defaultEnd}
                  >
                    <Calendar
                      mode="range"
                      selected={range}
                      onSelect={(r) => {
                        setRange(r);
                        if (r?.from) setStart(fmt(r.from));
                        if (r?.to) setEnd(fmt(r.to));
                        setPage(1);
                      }}
                      numberOfMonths={1}
                    />
                  </FilterSection>

                  <Button
                    variant="default"
                    className="w-full mt-4"
                    disabled={isLoading}
                    onClick={() => reloadWithFilters(1)}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Filter className="h-4 w-4 mr-2" />
                    )}
                    Apply Filters
                  </Button>
                </div>
              </MobileFilterButton>
            </div>
          </div>
        </div>

        {/* List Header */}
        <div className="px-6 py-2 border-b border-border/30 bg-muted/20">
          <div className="flex items-center gap-4">
            <div className="w-28">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                When
              </span>
            </div>
            <div className="w-36">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                User
              </span>
            </div>
            <div className="w-24">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Action
              </span>
            </div>
            <div className="flex-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Document
              </span>
            </div>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1">
          {isLoading && displayEvents.length === 0 ? (
            <div>
              {Array.from({ length: 10 }).map((_, i) => (
                <ItemSkeleton key={i} />
              ))}
            </div>
          ) : displayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
                <Activity className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">
                No activity found
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                {q
                  ? "Try adjusting your search or filters"
                  : "Activity will appear here as users interact with documents"}
              </p>
            </div>
          ) : (
            <div>
              {displayEvents.map((e) => {
                const u = users.find(
                  (x) =>
                    x.email &&
                    e.actor &&
                    e.actor.toLowerCase() === x.email.toLowerCase()
                );
                const doc = e.docId ? getDocumentById(e.docId) : null;
                const roleLabel =
                  normalizeRoleLabel((e as any).actorRole) ||
                  normalizeRoleLabel(u?.role);

                return (
                  <div
                    key={e.id}
                    className={cn(
                      "group flex items-center gap-4 px-6 py-3 border-b border-border/20",
                      "hover:bg-muted/30 transition-colors"
                    )}
                  >
                    {/* When */}
                    <div className="w-28 flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground/60" />
                      <span className="text-xs text-muted-foreground">
                        {formatAppDateTime(new Date(e.ts))}
                      </span>
                    </div>

                    {/* User */}
                    <div className="w-36">
                      <UserAvatar
                        email={(e as any).actorEmail || e.actor}
                        name={u?.email}
                      />
                    </div>

                    {/* Action */}
                    <div className="w-24">
                      <TypeBadge t={e.type} />
                    </div>

                    {/* Document */}
                    <div className="flex-1 min-w-0">
                      {e.docId ? (
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors max-w-[300px] truncate"
                                href={`/documents/${e.docId}`}
                              >
                                <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60" />
                                <span className="truncate">
                                  {e.title ||
                                    doc?.title ||
                                    doc?.name ||
                                    e.docId}
                                </span>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {e.title || doc?.title || doc?.name || e.docId}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {e.title || "—"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="sticky bottom-0 px-6 py-3 border-t border-border/40 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground tabular-nums">
                Page {page} of {totalPages} · {totalCount} total
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1 || isLoading}
                  className="h-8 gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages || isLoading}
                  className="h-8 gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
