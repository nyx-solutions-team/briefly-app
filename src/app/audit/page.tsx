"use client";

import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { H1 } from '@/components/typography';
import { useAudit } from '@/hooks/use-audit';
import { useAuth } from '@/hooks/use-auth';
import { AccessDenied } from '@/components/access-denied';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { formatAppDateTime } from '@/lib/utils';
import { useUsers } from '@/hooks/use-users';
import { useDocuments } from '@/hooks/use-documents';
import { useSettings } from '@/hooks/use-settings';

import { apiFetch, getApiContext } from '@/lib/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/page-header';
import { MobileFilterButton, FilterSection } from '@/components/mobile-filter-button';
import { FileText, User, Calendar as CalendarIcon, Clock, Search, Filter, Eye, Edit, Trash2, Plus, Move, Link as LinkIcon, Unlink, Download, Upload, Activity, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { AuditFilters } from '@/hooks/use-audit';

const TYPE_LABEL: Record<string, string> = {
  login: 'Login',
  create: 'Created',
  edit: 'Edited',
  delete: 'Deleted',
  move: 'Moved',
  link: 'Linked',
  unlink: 'Unlinked',
  versionSet: 'Version Set',
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
  systemadmin: 'Admin',
  contentmanager: 'Manager',
  contentviewer: 'Viewer',
  guest: 'Guest',
  orgadmin: 'Admin',
  orgmanager: 'Manager',
  orgviewer: 'Viewer',
  orgguest: 'Guest',
  admin: 'Admin',
  manager: 'Manager',
  viewer: 'Viewer',
};

function normalizeRoleLabel(role?: string): string {
  if (!role) return '—';
  const key = String(role).toLowerCase();
  return ROLE_LABEL[key] || (role.charAt(0).toUpperCase() + role.slice(1));
}

function getThemeColors(accentColor: string) {
  const colorMap: Record<string, { from: string; to: string }> = {
    default: { from: 'from-blue-600', to: 'to-purple-700' },
    red: { from: 'from-red-600', to: 'to-pink-700' },
    rose: { from: 'from-rose-600', to: 'to-pink-700' },
    orange: { from: 'from-orange-600', to: 'to-red-700' },
    amber: { from: 'from-amber-600', to: 'to-orange-700' },
    yellow: { from: 'from-yellow-600', to: 'to-amber-700' },
    lime: { from: 'from-lime-600', to: 'to-green-700' },
    green: { from: 'from-green-600', to: 'to-emerald-700' },
    emerald: { from: 'from-emerald-600', to: 'to-teal-700' },
    teal: { from: 'from-teal-600', to: 'to-cyan-700' },
    cyan: { from: 'from-cyan-600', to: 'to-blue-700' },
    sky: { from: 'from-sky-600', to: 'to-blue-700' },
    blue: { from: 'from-blue-600', to: 'to-indigo-700' },
    indigo: { from: 'from-indigo-600', to: 'to-purple-700' },
    violet: { from: 'from-violet-600', to: 'to-purple-700' },
    purple: { from: 'from-purple-600', to: 'to-violet-700' },
    fuchsia: { from: 'from-fuchsia-600', to: 'to-pink-700' },
    pink: { from: 'from-pink-600', to: 'to-rose-700' },
  };
  return colorMap[accentColor] || colorMap.default;
}

function UserAvatar({ email, name }: { email?: string; name?: string }) {
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);
  const displayName = name || email?.split('@')[0] || 'U';
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // Force re-render by adding a key based on accent color
  const avatarKey = `${settings.accent_color}-${email}`;

  return (
    <div className="flex items-center gap-2">
      <div
        key={avatarKey}
        className={`w-8 h-8 rounded-full bg-gradient-to-br ${themeColors.from} ${themeColors.to} flex items-center justify-center text-white text-sm font-medium shadow-sm`}
      >
        {initials}
      </div>
      <div className="min-w-0">
        <div className="font-medium text-sm truncate" title={email || name}>
          {displayName}
        </div>
        {email && email !== displayName && (
          <div className="text-xs text-muted-foreground truncate" title={email}>
            {email}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium';
  const roleLower = role.toLowerCase();

  const cls = roleLower.includes('admin') || roleLower === 'systemadmin'
    ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
    : roleLower.includes('teamlead') || roleLower.includes('team lead') || roleLower === 'teamlead'
      ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800'
      : roleLower.includes('member') || roleLower === 'member'
        ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
        : roleLower.includes('guest') || roleLower === 'guest'
          ? 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800'
          : roleLower.includes('manager') || roleLower === 'manager'
            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800'
            : roleLower.includes('viewer') || roleLower === 'viewer'
              ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
              : 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800';

  return <span className={`${base} ${cls}`}>{role}</span>;
}

function TypeBadge({ t }: { t: string }) {
  const Icon = TYPE_ICONS[t];
  const base = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium';
  const cls = t === 'delete'
    ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
    : t === 'edit'
      ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
      : t === 'move' || t === 'link' || t === 'unlink'
        ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
        : t === 'login'
          ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800'
          : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800';

  return (
    <span className={`${base} ${cls}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {TYPE_LABEL[t] || t}
    </span>
  );
}

export default function AuditPage() {
  const {
    events, clear, includeSelf, setIncludeSelf, isLoading, hasLoaded, loadAudit,
    page, setPage, totalPages, totalCount, pageSize,
    availableActors, actorsLoading, loadActors
  } = useAudit();
  const { user } = useAuth();
  const { users } = useUsers();
  const { getDocumentById } = useDocuments();
  const [canViewAudit, setCanViewAudit] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Check if user can access audit logs on mount
  useEffect(() => {
    const checkAuditAccess = async () => {
      try {
        const { orgId } = getApiContext();
        if (!orgId) return;

        // Check if user can access audit logs (backend handles all access logic)
        const canAccess = await apiFetch<boolean>(`/orgs/${orgId}/audit/can-access`);
        setCanViewAudit(canAccess);
      } catch (error) {
        console.error('Error checking audit access:', error);
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

  // Load actors list when access is granted
  useEffect(() => {
    if (canViewAudit) {
      void loadActors();
    }
  }, [canViewAudit, loadActors]);

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const defaultEnd = fmt(today); // today
  const defaultStart = fmt(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)); // 30 days ago for better default

  const [q, setQ] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [actorsPick, setActorsPick] = useState<string[]>([]); // actor IDs
  const [start, setStart] = useState<string>(defaultStart); // yyyy-MM-dd
  const [end, setEnd] = useState<string>(defaultEnd);
  const [range, setRange] = useState<DateRange | undefined>({ from: new Date(defaultStart), to: new Date(defaultEnd) });

  // Helper to build current filters
  const buildFilters = useCallback((overrides: Partial<AuditFilters> = {}): AuditFilters => ({
    // Pass multiple types as comma-separated string (backend now supports this)
    type: selectedTypes.length > 0 ? selectedTypes.join(',') : undefined,
    actors: actorsPick.length > 0 ? actorsPick : undefined,
    from: start,
    to: end,
    excludeSelf: !includeSelf,
    page: overrides.page || page,
    limit: pageSize,
    ...overrides,
  }), [selectedTypes, actorsPick, start, end, includeSelf, page, pageSize]);

  // Reload data when filters change
  const reloadWithFilters = useCallback((newPage?: number) => {
    if (canViewAudit) {
      void loadAudit(buildFilters({ page: newPage || 1 }));
      if (newPage) setPage(newPage);
    }
  }, [canViewAudit, loadAudit, buildFilters, setPage]);

  // Initial load
  useEffect(() => {
    if (canViewAudit && hasLoaded === false) {
      void loadAudit(buildFilters({ page: 1 }));
    }
  }, [canViewAudit, hasLoaded, loadAudit, buildFilters]);

  // Auto-apply filters when any filter changes (debounced)
  useEffect(() => {
    if (!canViewAudit || !hasLoaded) return;

    const timer = setTimeout(() => {
      reloadWithFilters(1);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypes, actorsPick, start, end, includeSelf]);

  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (canViewAudit) {
      void loadAudit(buildFilters({ page: newPage }));
    }
  };

  // Client-side search filter (search is still client-side for quick filtering)
  const displayEvents = useMemo(() => {
    if (!q.trim()) return events;
    const s = q.toLowerCase();
    return events.filter(e => {
      const hay = [e.actor, e.type, e.title, e.docId, e.note, e.path].join(' ').toLowerCase();
      return hay.includes(s);
    });
  }, [events, q]);

  if (checkingAccess) {
    return (
      <AppLayout>
        <div className="px-3 pt-2 pb-24 md:px-6 md:pb-6">
          <div className="rounded-md border p-4 text-xs sm:text-sm text-muted-foreground">
            Checking access permissions...
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
      <div className="px-3 pt-2 pb-24 md:px-6 md:pb-6 space-y-5 md:space-y-6">
        <PageHeader
          title="Activity"
          subtitle={<span className="hidden sm:inline">Recent user and document actions</span>}
          meta={<span className="text-[10px] sm:text-xs">{displayEvents.length} shown • {totalCount} total results</span>}
          sticky
          icon={<FileText className="h-4 w-4 sm:h-5 sm:w-5" />}
        />
        <div className="max-w-6xl mx-auto w-full">

          <Card className="rounded-xl sm:rounded-2xl border border-border/60 shadow-md">
            <CardHeader className="p-4 sm:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-base sm:text-xl">Recent Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6 text-xs sm:text-sm">
              {/* Search Bar - Always Visible */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
                <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Input
                  className="flex-1 text-xs sm:text-sm"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search actor, document, note…"
                />
              </div>

              {/* Desktop Filters - Hidden on Mobile */}
              <div className="hidden md:flex flex-wrap items-center gap-4 rounded-lg border bg-muted/40 p-4 text-sm">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-40 h-9 justify-between text-sm">
                      <Filter className="h-4 w-4" />
                      Types {selectedTypes.length > 0 ? `(${selectedTypes.length})` : ''}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-64 p-3">
                    <div className="text-xs text-muted-foreground mb-3 font-medium">Select one or more activity types</div>
                    <div className="max-h-56 overflow-auto space-y-2">
                      <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50">
                        <Checkbox
                          id="all-types"
                          checked={selectedTypes.length === 0}
                          onCheckedChange={() => setSelectedTypes([])}
                        />
                        <label htmlFor="all-types" className="text-sm font-medium">All Types</label>
                      </div>
                      {Object.entries(TYPE_LABEL).map(([key, label]) => {
                        const Icon = TYPE_ICONS[key];
                        const checked = selectedTypes.includes(key);
                        return (
                          <div key={key} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                            <Checkbox
                              id={`type-${key}`}
                              checked={checked}
                              onCheckedChange={(v) => {
                                // Multi-select - add/remove from array
                                setSelectedTypes(prev => {
                                  if (v) return Array.from(new Set([...prev, key]));
                                  return prev.filter(x => x !== key);
                                });
                              }}
                            />
                            <div className="flex items-center gap-2 text-sm">
                              {Icon && <Icon className="h-3 w-3" />}
                              {label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {selectedTypes.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedTypes([])}
                          className="w-full text-xs"
                        >
                          Clear All
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-32 h-9 justify-between text-sm">
                      <User className="h-4 w-4" />
                      People {actorsPick.length > 0 ? `(${actorsPick.length})` : ''}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-64 p-3">
                    <div className="text-xs text-muted-foreground mb-3 font-medium">Select one or more users</div>
                    <div className="max-h-56 overflow-auto space-y-2">
                      {actorsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">Loading users...</span>
                        </div>
                      ) : availableActors.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-4">No users found</div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50">
                            <Checkbox id="all" checked={actorsPick.length === 0} onCheckedChange={() => setActorsPick([])} />
                            <label htmlFor="all" className="text-sm font-medium">All Users</label>
                          </div>
                          {availableActors.map(a => {
                            const checked = actorsPick.includes(a.id);
                            return (
                              <div key={a.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                                <Checkbox id={`act-${a.id}`} checked={checked} onCheckedChange={(v) => {
                                  setActorsPick(prev => {
                                    if (v) return Array.from(new Set([...prev, a.id]));
                                    return prev.filter(x => x !== a.id);
                                  });
                                }} />
                                <UserAvatar email={a.email} name={a.name} />
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                    {actorsPick.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActorsPick([])}
                          className="w-full text-xs"
                        >
                          Clear All
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                {/* Separator */}
                <div className="hidden sm:block h-8 w-px bg-border" />

                {(user?.role === 'systemAdmin') && (
                  <div className="flex items-center gap-3 px-2">
                    <Switch id="include-self" checked={includeSelf} onCheckedChange={(v) => setIncludeSelf(!!v)} />
                    <label htmlFor="include-self" className="text-sm whitespace-nowrap">Include my activity</label>
                  </div>
                )}

                {/* Separator */}
                <div className="hidden sm:block h-8 w-px bg-border" />

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-40 h-9 justify-between text-sm">
                      <CalendarIcon className="h-4 w-4" />
                      Date range
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-3 w-auto max-w-[calc(100vw-2rem)]" align="end">
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
                      <div className="flex flex-row sm:flex-col gap-2 text-xs sm:text-sm">
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { const d1 = new Date(); const d0 = new Date(d1.getTime() - 6 * 86400000); setRange({ from: d0, to: d1 }); setStart(fmt(d0)); setEnd(fmt(d1)); setPage(1); }}>Last 7 days</Button>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { const d1 = new Date(); const d0 = new Date(d1.getTime() - 13 * 86400000); setRange({ from: d0, to: d1 }); setStart(fmt(d0)); setEnd(fmt(d1)); setPage(1); }}>Last 14 days</Button>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { const d1 = new Date(); const d0 = new Date(d1.getTime() - 29 * 86400000); setRange({ from: d0, to: d1 }); setStart(fmt(d0)); setEnd(fmt(d1)); setPage(1); }}>Last 30 days</Button>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { const d1 = new Date(); const d0 = new Date(d1.getFullYear(), d1.getMonth(), 1); setRange({ from: d0, to: d1 }); setStart(fmt(d0)); setEnd(fmt(d1)); setPage(1); }}>This month</Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>



                {/* Spacer to push loading indicator to the right */}
                <div className="flex-1" />

                {/* Loading indicator (filters auto-apply) */}
                {isLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                )}
              </div>

              {/* Mobile Filter Button */}
              <MobileFilterButton
                title="Filter Activity"
                description="Filter by type, people, and date range"
                activeCount={selectedTypes.length + actorsPick.length + (start !== defaultStart || end !== defaultEnd ? 1 : 0)}
              >
                <div className="space-y-1">
                  {/* Type Filter */}
                  <FilterSection
                    title="Activity Types"
                    badge={selectedTypes.length}
                    defaultOpen={selectedTypes.length > 0}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50">
                        <Checkbox
                          id="mobile-all-types"
                          checked={selectedTypes.length === 0}
                          onCheckedChange={() => setSelectedTypes([])}
                        />
                        <label htmlFor="mobile-all-types" className="text-sm font-medium">All Types</label>
                      </div>
                      {Object.entries(TYPE_LABEL).map(([key, label]) => {
                        const Icon = TYPE_ICONS[key];
                        const checked = selectedTypes.includes(key);
                        return (
                          <div key={key} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                            <Checkbox
                              id={`mobile-type-${key}`}
                              checked={checked}
                              onCheckedChange={(v) => {
                                // Multi-select - add/remove from array
                                setSelectedTypes(prev => {
                                  if (v) return Array.from(new Set([...prev, key]));
                                  return prev.filter(x => x !== key);
                                });
                              }}
                            />
                            <div className="flex items-center gap-2 text-sm">
                              {Icon && <Icon className="h-3 w-3" />}
                              {label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </FilterSection>

                  {/* People Filter */}
                  <FilterSection
                    title="People"
                    badge={actorsPick.length}
                    defaultOpen={actorsPick.length > 0}
                  >
                    <div className="max-h-48 overflow-auto space-y-2">
                      {actorsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">Loading users...</span>
                        </div>
                      ) : availableActors.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-4">No users found</div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50">
                            <Checkbox id="mobile-all" checked={actorsPick.length === 0} onCheckedChange={() => setActorsPick([])} />
                            <label htmlFor="mobile-all" className="text-sm font-medium">All Users</label>
                          </div>
                          {availableActors.map(a => {
                            const checked = actorsPick.includes(a.id);
                            return (
                              <div key={a.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                                <Checkbox id={`mobile-act-${a.id}`} checked={checked} onCheckedChange={(v) => {
                                  setActorsPick(prev => {
                                    if (v) return Array.from(new Set([...prev, a.id]));
                                    return prev.filter(x => x !== a.id);
                                  });
                                }} />
                                <UserAvatar email={a.email} name={a.name} />
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </FilterSection>

                  {/* Date Range Filter */}
                  <FilterSection
                    title="Date Range"
                    badge={start !== defaultStart || end !== defaultEnd ? 1 : 0}
                    defaultOpen={start !== defaultStart || end !== defaultEnd}
                  >
                    <div className="space-y-3">
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
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { const d1 = new Date(); const d0 = new Date(d1.getTime() - 6 * 86400000); setRange({ from: d0, to: d1 }); setStart(fmt(d0)); setEnd(fmt(d1)); setPage(1); }}>Last 7 days</Button>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { const d1 = new Date(); const d0 = new Date(d1.getTime() - 13 * 86400000); setRange({ from: d0, to: d1 }); setStart(fmt(d0)); setEnd(fmt(d1)); setPage(1); }}>Last 14 days</Button>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { const d1 = new Date(); const d0 = new Date(d1.getTime() - 29 * 86400000); setRange({ from: d0, to: d1 }); setStart(fmt(d0)); setEnd(fmt(d1)); setPage(1); }}>Last 30 days</Button>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { const d1 = new Date(); const d0 = new Date(d1.getFullYear(), d1.getMonth(), 1); setRange({ from: d0, to: d1 }); setStart(fmt(d0)); setEnd(fmt(d1)); setPage(1); }}>This month</Button>
                      </div>
                    </div>
                  </FilterSection>

                  {/* Include Self Switch */}
                  {(user?.role === 'systemAdmin') && (
                    <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30 mt-2">
                      <label htmlFor="mobile-include-self" className="text-sm font-medium">Include my activity</label>
                      <Switch id="mobile-include-self" checked={includeSelf} onCheckedChange={(v) => setIncludeSelf(!!v)} />
                    </div>
                  )}



                  {/* Apply Filters Button - Mobile */}
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

              {/* Desktop Table Header - Hidden on mobile */}
              <div className="hidden md:grid md:grid-cols-6 text-xs font-semibold text-muted-foreground pt-3 pb-2 border-b">
                <div className="flex items-center gap-1"><Clock className="h-3 w-3" />When</div>
                <div className="flex items-center gap-1"><User className="h-3 w-3" />User</div>
                <div>Role</div>
                <div>Action</div>
                <div className="flex items-center gap-1"><FileText className="h-3 w-3" />Document</div>
                <div></div>
              </div>
              <div className="divide-y rounded-lg border border-border/40 bg-card/60">
                {displayEvents.map((e) => {
                  const u = users.find(x => x.email && e.actor && e.actor.toLowerCase() === x.email.toLowerCase());
                  const doc = e.docId ? getDocumentById(e.docId) : null;
                  const roleLabel = normalizeRoleLabel((e as any).actorRole) || normalizeRoleLabel(u?.role);
                  const actorName = u?.username || u?.email?.split('@')[0] || e.actor?.split('@')[0] || 'User';
                  const actorInitial = actorName?.[0]?.toUpperCase() || 'U';
                  return (
                    <div key={e.id} className="md:grid md:grid-cols-6 py-3 text-sm items-center hover:bg-muted/30 transition-colors">
                      {/* Mobile Card Layout */}
                      <div className="md:hidden rounded-lg border border-border/60 bg-card/70 p-3 space-y-3">
                        {/* Header: Time and Action Type */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-1 min-w-0">
                            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate" title={formatAppDateTime(new Date(e.ts))}>
                              {formatAppDateTime(new Date(e.ts))}
                            </span>
                          </div>
                          <TypeBadge t={e.type} />
                        </div>

                        {/* User + Role */}
                        <div className="flex items-center gap-2.5 flex-wrap text-xs">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-foreground/80">
                              {actorInitial}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{actorName}</p>
                              {(e as any).actorEmail && (
                                <p className="text-[11px] text-muted-foreground truncate">{(e as any).actorEmail}</p>
                              )}
                            </div>
                          </div>
                          <RoleBadge role={roleLabel} />
                        </div>

                        {/* Document Link with Better Truncation */}
                        <div className="min-w-0 space-y-1 text-xs">
                          {e.docId ? (
                            <Link
                              className="inline-flex items-start gap-1.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors font-medium"
                              href={`/documents/${e.docId}`}
                              title={e.title || doc?.title || doc?.name || e.docId}
                            >
                              <FileText className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                              <span className="line-clamp-2 break-words min-w-0 flex-1">
                                {e.title || doc?.title || doc?.name || e.docId}
                              </span>
                            </Link>
                          ) : (
                            <div className="flex items-start gap-1.5 text-muted-foreground">
                              <FileText className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 opacity-50" />
                              <span className="line-clamp-2 break-words">{e.title || '—'}</span>
                            </div>
                          )}
                        </div>

                        {/* Note if available */}
                        {e.note && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2" title={e.note}>
                            {e.note}
                          </p>
                        )}
                      </div>
                      {/* Desktop Table Layout */}
                      <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatAppDateTime(new Date(e.ts))}
                      </div>
                      <div className="hidden md:block">
                        <UserAvatar email={(e as any).actorEmail || e.actor} name={u?.email} />
                      </div>
                      <div className="hidden md:block"><RoleBadge role={roleLabel} /></div>
                      <div className="hidden md:block"><TypeBadge t={e.type} /></div>
                      <div className="hidden md:block truncate" title={e.title || e.docId || undefined}>
                        {e.docId ? (
                          <Link className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors" href={`/documents/${e.docId}`}>
                            <FileText className="h-3 w-3" />
                            {e.title || doc?.title || doc?.name || e.docId}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{e.title || '—'}</span>
                        )}
                      </div>
                      <div className="hidden md:block"></div>
                    </div>
                  );
                })}
                {displayEvents.length === 0 && (
                  <div className="py-8 text-xs sm:text-sm text-muted-foreground md:col-span-6 text-center">
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading activity...
                      </div>
                    ) : "No matching activity."}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 text-[11px] sm:text-xs text-muted-foreground border-t mt-4">
                <div className="text-center sm:text-left">
                  Showing page {page} of {totalPages} ({totalCount} total results)
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none text-xs" disabled={page <= 1 || isLoading} onClick={() => handlePageChange(page - 1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Prev
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none text-xs" disabled={page >= totalPages || isLoading} onClick={() => handlePageChange(page + 1)}>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
