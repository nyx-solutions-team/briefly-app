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
import { formatAppDate, formatAppDateTime } from "@/lib/utils";
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
import { format as formatDateFns, parse as parseDateFns, isValid as isValidDateFns } from "date-fns";
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

type FilterMode = "all" | "custom" | "none";
type DateMode = "default" | "custom" | "all" | "pending";

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
  const { user, hasPermission } = useAuth();
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
  const fmt = (d: Date) => formatDateFns(d, "yyyy-MM-dd");
  const parseYmd = (value: string) => {
    const parsed = parseDateFns(value, "yyyy-MM-dd", new Date());
    if (isValidDateFns(parsed)) return parsed;
    return new Date(value);
  };
  const formatYmdLabel = (value: string) => {
    const parsed = parseDateFns(value, "yyyy-MM-dd", new Date());
    if (!isValidDateFns(parsed)) return value;
    return formatAppDate(parsed);
  };
  const defaultEnd = fmt(today);
  const defaultStart = fmt(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));

  const [q, setQ] = useState("");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileFilterView, setMobileFilterView] = useState<'main' | 'types' | 'actors' | 'date'>('main');
  const [typesMode, setTypesMode] = useState<FilterMode>("all");
  const [actorsMode, setActorsMode] = useState<FilterMode>("all");
  const [dateMode, setDateMode] = useState<DateMode>("default");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [actorsPick, setActorsPick] = useState<string[]>([]);
  const [start, setStart] = useState<string>(defaultStart);
  const [end, setEnd] = useState<string>(defaultEnd);
  const [range, setRange] = useState<DateRange | undefined>({
    from: parseYmd(defaultStart),
    to: parseYmd(defaultEnd),
  });
  const allTypeKeys = useMemo(() => Object.keys(TYPE_LABEL), []);
  const allActorIds = useMemo(
    () => availableActors.map((a) => a.id),
    [availableActors]
  );

  const resetDateRange = useCallback(() => {
    setDateMode("default");
    setStart(defaultStart);
    setEnd(defaultEnd);
    setRange({
      from: parseYmd(defaultStart),
      to: parseYmd(defaultEnd),
    });
    setPage(1);
  }, [defaultStart, defaultEnd, setPage]);

  const toggleAllTime = useCallback(() => {
    if (dateMode === "all") {
      resetDateRange();
      return;
    }
    setDateMode("all");
    setRange(undefined);
    setPage(1);
  }, [dateMode, resetDateRange, setPage]);

  const applyDateRange = useCallback(
    (next?: DateRange) => {
      if (!next || (!next.from && !next.to)) {
        resetDateRange();
        return;
      }
      if (next.from && !next.to) {
        setRange({ from: next.from, to: undefined });
        setDateMode("pending");
        return;
      }
      const rawFrom = next.from ?? next.to;
      const rawTo = next.to ?? next.from;
      if (!rawFrom || !rawTo) return;
      const from = rawFrom <= rawTo ? rawFrom : rawTo;
      const to = rawFrom <= rawTo ? rawTo : rawFrom;
      const nextStart = fmt(from);
      const nextEnd = fmt(to);
      setStart(nextStart);
      setEnd(nextEnd);
      setRange({ from, to });
      setDateMode(
        nextStart === defaultStart && nextEnd === defaultEnd ? "default" : "custom"
      );
      setPage(1);
    },
    [defaultStart, defaultEnd, fmt, resetDateRange, setPage]
  );

  const applyTypeSelection = useCallback(
    (next: string[]) => {
      const unique = Array.from(new Set(next));
      if (unique.length === 0) {
        setTypesMode("none");
        setSelectedTypes([]);
        return;
      }
      if (unique.length >= allTypeKeys.length) {
        setTypesMode("all");
        setSelectedTypes([]);
        return;
      }
      setTypesMode("custom");
      setSelectedTypes(unique);
    },
    [allTypeKeys.length]
  );

  const applyActorSelection = useCallback(
    (next: string[]) => {
      const unique = Array.from(new Set(next));
      if (unique.length === 0) {
        setActorsMode("none");
        setActorsPick([]);
        return;
      }
      if (unique.length >= allActorIds.length && allActorIds.length > 0) {
        setActorsMode("all");
        setActorsPick([]);
        return;
      }
      setActorsMode("custom");
      setActorsPick(unique);
    },
    [allActorIds.length]
  );

  const toggleAllTypes = useCallback(() => {
    if (typesMode === "all") {
      setTypesMode("none");
      setSelectedTypes([]);
      return;
    }
    setTypesMode("all");
    setSelectedTypes([]);
  }, [typesMode]);

  const toggleAllActors = useCallback(() => {
    if (actorsMode === "all") {
      setActorsMode("none");
      setActorsPick([]);
      return;
    }
    setActorsMode("all");
    setActorsPick([]);
  }, [actorsMode]);

  const toggleType = useCallback(
    (key: string) => {
      if (typesMode === "all") {
        applyTypeSelection(allTypeKeys.filter((k) => k !== key));
        return;
      }
      if (typesMode === "none") {
        applyTypeSelection([key]);
        return;
      }
      const next = selectedTypes.includes(key)
        ? selectedTypes.filter((x) => x !== key)
        : [...selectedTypes, key];
      applyTypeSelection(next);
    },
    [typesMode, allTypeKeys, selectedTypes, applyTypeSelection]
  );

  const toggleActor = useCallback(
    (id: string) => {
      if (actorsMode === "all") {
        applyActorSelection(allActorIds.filter((x) => x !== id));
        return;
      }
      if (actorsMode === "none") {
        applyActorSelection([id]);
        return;
      }
      const next = actorsPick.includes(id)
        ? actorsPick.filter((x) => x !== id)
        : [...actorsPick, id];
      applyActorSelection(next);
    },
    [actorsMode, allActorIds, actorsPick, applyActorSelection]
  );

  const buildFilters = useCallback(
    (overrides: Partial<AuditFilters> = {}): AuditFilters => {
      const typeFilter =
        typesMode === "all"
          ? undefined
          : typesMode === "none"
            ? "__none__"
            : selectedTypes.join(",");
      const actorFilter =
        actorsMode === "all"
          ? undefined
          : actorsMode === "none"
            ? ["__none__"]
            : actorsPick;
      const fromFilter = dateMode === "all" ? undefined : start;
      const toFilter = dateMode === "all" ? undefined : end;
      return {
        type: typeFilter,
        actors: actorFilter,
        from: fromFilter,
        to: toFilter,
        excludeSelf: !includeSelf,
        page: overrides.page || page,
        limit: pageSize,
        ...overrides,
      };
    },
    [typesMode, selectedTypes, actorsMode, actorsPick, dateMode, start, end, includeSelf, page, pageSize]
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
    if (dateMode === "pending") return;

    const timer = setTimeout(() => {
      reloadWithFilters(1);
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesMode, selectedTypes, actorsMode, actorsPick, dateMode, start, end, includeSelf]);

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

  const dateFilterCount =
    dateMode === "default" || dateMode === "pending" ? 0 : 1;
  const typeFilterCount = typesMode === "custom" ? selectedTypes.length : 0;
  const actorFilterCount = actorsMode === "custom" ? actorsPick.length : 0;
  const activeFilterCount = typeFilterCount + actorFilterCount + dateFilterCount;
  const hasActiveFilters =
    typesMode !== "all" || actorsMode !== "all" || dateFilterCount > 0;
  const mobileActiveCount = hasActiveFilters
    ? Math.max(activeFilterCount, 1)
    : 0;
  const typesBadge = typesMode === "none" ? "None" : typeFilterCount;
  const actorsBadge = actorsMode === "none" ? "None" : actorFilterCount;
  const dateBadge =
    dateMode === "all"
      ? "All"
      : dateMode === "custom"
        ? "Custom"
        : dateMode === "pending"
          ? "Start"
          : 0;
  const dateLabel =
    dateMode === "all"
      ? "All time"
      : dateMode === "default"
        ? "Last 30 days"
        : dateMode === "pending"
          ? `Start: ${range?.from ? formatAppDate(range.from) : "Select"}`
          : `${formatYmdLabel(start)} – ${formatYmdLabel(end)}`;

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
                      typesMode !== "all"
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Types
                    {typesMode !== "all" && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded-full">
                        {typesBadge}
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
                        typesMode === "all"
                          ? "bg-primary/10"
                          : "hover:bg-muted/50"
                      )}
                      onClick={toggleAllTypes}
                    >
                      <Checkbox
                        checked={typesMode === "all"}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-sm">All Types</span>
                    </div>
                    {Object.entries(TYPE_LABEL).map(([key, label]) => {
                      const Icon = TYPE_ICONS[key];
                      const checked =
                        typesMode === "all" || selectedTypes.includes(key);
                      return (
                        <div
                          key={key}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                            checked ? "bg-primary/10" : "hover:bg-muted/50"
                          )}
                          onClick={() => toggleType(key)}
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
                      actorsMode !== "all"
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    <User className="h-3.5 w-3.5" />
                    People
                    {actorsMode !== "all" && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded-full">
                        {actorsBadge}
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
                            actorsMode === "all"
                              ? "bg-primary/10"
                              : "hover:bg-muted/50"
                          )}
                          onClick={toggleAllActors}
                        >
                          <Checkbox
                            checked={actorsMode === "all"}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-sm">All Users</span>
                        </div>
                        {availableActors.map((a) => {
                          const checked =
                            actorsMode === "all" || actorsPick.includes(a.id);
                          return (
                            <div
                              key={a.id}
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                                checked ? "bg-primary/10" : "hover:bg-muted/50"
                              )}
                              onClick={() => toggleActor(a.id)}
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
                      dateMode !== "default"
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Date
                    <span className="hidden lg:inline ml-1 text-xs text-muted-foreground/80">
                      {dateLabel}
                    </span>
                    {dateMode !== "default" && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded-full">
                        {dateBadge}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-3 w-auto" align="start">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Calendar
                      mode="range"
                      selected={range}
                      onSelect={applyDateRange}
                      numberOfMonths={1}
                    />
                    <div className="flex flex-col gap-1.5">
                      {dateMode === "pending" && (
                        <div className="text-[11px] text-muted-foreground">
                          Select an end date to apply the range.
                        </div>
                      )}
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Quick Select
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs justify-start text-muted-foreground hover:text-foreground"
                        onClick={toggleAllTime}
                      >
                        All time
                      </Button>
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
                            applyDateRange({ from: d0, to: d1 });
                          }}
                        >
                          {label}
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs justify-start text-muted-foreground hover:text-foreground"
                        onClick={resetDateRange}
                      >
                        Reset to last 30 days
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {hasPermission('org.manage_members') && (
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

              {hasActiveFilters && (
                <>
                  <div className="w-px h-4 bg-border/50" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setTypesMode("all");
                      setActorsMode("all");
                      setSelectedTypes([]);
                      setActorsPick([]);
                      resetDateRange();
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
                activeCount={mobileActiveCount}
                open={mobileFilterOpen}
                onOpenChange={(nextOpen) => {
                  setMobileFilterOpen(nextOpen);
                  if (!nextOpen) {
                    setMobileFilterView("main");
                  }
                }}
                footer={
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <Button
                        variant="default"
                        className="flex-1 h-11 rounded-2xl font-bold tracking-tight shadow-md"
                        disabled={isLoading || dateMode === "pending"}
                        onClick={() => {
                          reloadWithFilters(1);
                          setMobileFilterOpen(false);
                          setMobileFilterView("main");
                        }}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Filter className="h-4 w-4 mr-2" />
                        )}
                        Apply Filters
                      </Button>
                      {mobileFilterView !== 'main' && (
                        <Button
                          variant="ghost"
                          className="h-11 w-11 p-0 rounded-2xl bg-muted/30"
                          onClick={() => setMobileFilterView('main')}
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </Button>
                      )}
                    </div>

                    {hasActiveFilters && (
                      <button
                        onClick={() => {
                          setTypesMode("all");
                          setActorsMode("all");
                          setSelectedTypes([]);
                          setActorsPick([]);
                          resetDateRange();
                          reloadWithFilters(1);
                          setMobileFilterOpen(false);
                          setMobileFilterView("main");
                        }}
                        className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors py-1 flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Clear active filters
                      </button>
                    )}
                  </div>
                }
              >
                <div className="space-y-4">
                  {mobileFilterView === 'main' ? (
                    <div className="flex flex-col gap-3">
                      {/* Activity Types Card */}
                      <button
                        onClick={() => setMobileFilterView('types')}
                        className="group relative overflow-hidden rounded-[1.5rem] p-4 text-left transition-all active:scale-95 bg-[#F2F0EB] dark:bg-[#1E1C1A] border border-border/10 shadow-sm min-h-[80px]"
                      >
                        <Zap className="absolute -bottom-2 -right-2 h-16 w-16 -rotate-12 opacity-[0.05] dark:opacity-[0.03]" />
                        <div className="relative z-10 flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-white/80 dark:bg-black/20 flex items-center justify-center shadow-sm shrink-0">
                            <Zap className={cn("h-5 w-5", typesMode !== 'all' ? "text-primary" : "text-foreground/70")} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold text-foreground leading-tight">Activity Types</h3>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-0.5">
                              {typesBadge} active
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                        </div>
                      </button>

                      {/* People Card */}
                      <button
                        onClick={() => setMobileFilterView('actors')}
                        className="group relative overflow-hidden rounded-[1.5rem] p-4 text-left transition-all active:scale-95 bg-[#F0E4E4] dark:bg-[#2A2020] border border-border/10 shadow-sm min-h-[80px]"
                      >
                        <User className="absolute -bottom-2 -right-2 h-16 w-16 -rotate-12 opacity-[0.05] dark:opacity-[0.03]" />
                        <div className="relative z-10 flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-white/80 dark:bg-black/20 flex items-center justify-center shadow-sm shrink-0">
                            <User className={cn("h-5 w-5", actorsMode !== 'all' ? "text-primary" : "text-foreground/70")} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold text-foreground leading-tight">People</h3>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-0.5">
                              {actorsBadge} selected
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                        </div>
                      </button>

                      {/* Date Card */}
                      <button
                        onClick={() => setMobileFilterView('date')}
                        className="group relative overflow-hidden rounded-[1.5rem] p-4 text-left transition-all active:scale-95 bg-[#E4EAF0] dark:bg-[#1C2026] border border-border/10 shadow-sm min-h-[80px]"
                      >
                        <CalendarIcon className="absolute -bottom-2 -right-2 h-16 w-16 -rotate-12 opacity-[0.05] dark:opacity-[0.03]" />
                        <div className="relative z-10 flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-white/80 dark:bg-black/20 flex items-center justify-center shadow-sm shrink-0">
                            <CalendarIcon className={cn("h-5 w-5", dateMode !== 'default' ? "text-primary" : "text-foreground/70")} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold text-foreground leading-tight">Date Range</h3>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-0.5">
                              {dateLabel}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
                      <div className="flex items-center justify-between mb-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMobileFilterView('main')}
                          className="h-8 px-2 -ml-2 text-muted-foreground hover:bg-transparent"
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          <span className="text-xs font-semibold">Back</span>
                        </Button>
                        <h2 className="text-sm font-bold text-foreground pr-8">
                          {mobileFilterView === 'types' && "Select Activity Types"}
                          {mobileFilterView === 'actors' && "Filter by People"}
                          {mobileFilterView === 'date' && "Select Date Range"}
                        </h2>
                        <div className="w-8" /> {/* Spacer for centering */}
                      </div>

                      <div className="flex-1 overflow-y-auto min-h-0 -mx-2 px-2 pb-2">
                        {mobileFilterView === 'types' && (
                          <div className="space-y-1">
                            {/* All Types Toggle */}
                            <div
                              className={cn(
                                "flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer mb-2",
                                typesMode === "all" ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/30 hover:bg-muted/40"
                              )}
                              onClick={() => toggleAllTypes()}
                            >
                              <div className="flex items-center gap-3">
                                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", typesMode === "all" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted-foreground/10 text-muted-foreground")}>
                                  <Activity className="h-4 w-4" />
                                </div>
                                <span className="text-sm font-bold">All Activity Types</span>
                              </div>
                              <Checkbox checked={typesMode === "all"} />
                            </div>

                            <div className="grid gap-1.5">
                              {Object.entries(TYPE_LABEL).map(([key, label]) => {
                                const Icon = TYPE_ICONS[key];
                                const checked = typesMode === "all" || selectedTypes.includes(key);
                                return (
                                  <div
                                    key={key}
                                    className={cn(
                                      "flex items-center justify-between p-3 rounded-xl transition-all duration-200 cursor-pointer border",
                                      checked
                                        ? "bg-card border-primary/20 shadow-sm"
                                        : "bg-transparent border-transparent hover:bg-muted/20"
                                    )}
                                    onClick={() => toggleType(key)}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-colors", checked ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground")}>
                                        {Icon && <Icon className="h-4 w-4" />}
                                      </div>
                                      <span className={cn("text-sm font-medium transition-colors", checked ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                                    </div>
                                    <Checkbox
                                      checked={checked}
                                      className={cn("transition-opacity", (typesMode === "all" && !selectedTypes.includes(key)) ? "opacity-30" : "opacity-100")}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {mobileFilterView === 'actors' && (
                          <div className="space-y-1">
                            <div
                              className={cn(
                                "flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer mb-2",
                                actorsMode === "all" ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/30 hover:bg-muted/40"
                              )}
                              onClick={() => toggleAllActors()}
                            >
                              <div className="flex items-center gap-3">
                                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", actorsMode === "all" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted-foreground/10 text-muted-foreground")}>
                                  <User className="h-4 w-4" />
                                </div>
                                <span className="text-sm font-bold">All People</span>
                              </div>
                              <Checkbox checked={actorsMode === "all"} />
                            </div>

                            <div className="grid gap-1">
                              {actorsLoading ? (
                                <div className="flex items-center justify-center py-12">
                                  <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
                                </div>
                              ) : (
                                availableActors.map((a) => {
                                  const checked = actorsMode === "all" || actorsPick.includes(a.id);
                                  return (
                                    <div
                                      key={a.id}
                                      className={cn(
                                        "flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer",
                                        checked ? "bg-primary/5" : "hover:bg-muted/20"
                                      )}
                                      onClick={() => toggleActor(a.id)}
                                    >
                                      <UserAvatar email={a.email} name={a.name} />
                                      <Checkbox checked={checked} />
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {mobileFilterView === 'date' && (
                          <div className="space-y-6 pt-2">
                            <div className="flex flex-wrap gap-2 justify-center">
                              <Button
                                variant={dateMode === "all" ? "default" : "secondary"}
                                size="sm"
                                className="h-9 px-6 rounded-full text-xs font-bold"
                                onClick={toggleAllTime}
                              >
                                All time
                              </Button>
                              <Button
                                variant={dateMode === "default" ? "default" : "secondary"}
                                size="sm"
                                className="h-9 px-6 rounded-full text-xs font-bold"
                                onClick={resetDateRange}
                              >
                                Last 30 days
                              </Button>
                            </div>

                            <div className="p-3 border border-border/40 rounded-3xl bg-card/50 shadow-inner">
                              {dateMode === "pending" && (
                                <div className="text-[10px] text-center font-bold text-primary mb-3 bg-primary/10 py-1.5 rounded-lg">
                                  PLEASE SELECT END DATE
                                </div>
                              )}
                              <Calendar
                                mode="range"
                                selected={range}
                                onSelect={applyDateRange}
                                numberOfMonths={1}
                                className="mx-auto"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </MobileFilterButton>
            </div>
          </div>
        </div>

        {/* List Header */}
        <div className="hidden md:block px-6 py-2 border-b border-border/30 bg-muted/20">
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
                      "group px-4 md:px-6 py-3 border-b border-border/20",
                      "hover:bg-muted/30 transition-colors"
                    )}
                  >
                    {/* Desktop row */}
                    <div className="hidden md:flex items-center gap-4">
                      <div className="w-28 flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground/60" />
                        <span className="text-xs text-muted-foreground">
                          {formatAppDateTime(new Date(e.ts))}
                        </span>
                      </div>
                      <div className="w-36">
                        <UserAvatar
                          email={(e as any).actorEmail || e.actor}
                          name={u?.email}
                        />
                      </div>
                      <div className="w-24">
                        <TypeBadge t={e.type} />
                      </div>
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

                    {/* Mobile card */}
                    <div className="md:hidden space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 text-muted-foreground/60" />
                          <span>{formatAppDateTime(new Date(e.ts))}</span>
                        </div>
                        <TypeBadge t={e.type} />
                      </div>
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          email={(e as any).actorEmail || e.actor}
                          name={u?.email}
                        />
                        {roleLabel && roleLabel !== "—" && (
                          <span className="text-[11px] text-muted-foreground">
                            {roleLabel}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        {e.docId ? (
                          <Link
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors min-w-0"
                            href={`/documents/${e.docId}`}
                          >
                            <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60" />
                            <span className="truncate max-w-[240px] sm:max-w-[320px]">
                              {e.title || doc?.title || doc?.name || e.docId}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {e.title || "—"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="sticky bottom-0 px-4 md:px-6 py-3 border-t border-border/40 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="hidden md:inline text-sm text-muted-foreground tabular-nums">
                Page {page} of {totalPages} · {totalCount} total
              </span>
              <div className="flex items-center justify-start md:justify-end gap-2 w-full md:w-auto">
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
                <span className="md:hidden text-[11px] text-muted-foreground tabular-nums ml-1">
                  Page {page} of {totalPages}
                </span>
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
