"use client";
import React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { useDocuments } from '@/hooks/use-documents';
import { useAuth } from '@/hooks/use-auth';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useSettings } from '@/hooks/use-settings';
import Link from 'next/link';
import {
  FileText,
  HardDrive,
  Activity,
  Building2,
  User,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { getApiContext, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="min-h-screen">
        {/* Linear-style Header */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-6 py-4">
            <HeaderWithIdentity />
          </div>
        </header>

        {/* Main Content */}
        <main className="px-6 py-6">
          <MainSections />
        </main>
      </div>
    </AppLayout>
  );
}

function HeaderWithIdentity() {
  const { user, bootstrapData } = useAuth();

  const memberTeams = (bootstrapData?.departments || [])
    .filter((d: any) => d?.is_member || d?.is_lead)
    .map((d: any) => ({
      id: String(d.id),
      label: d?.is_lead ? `${d.name} (Lead)` : String(d.name || ''),
    }))
    .filter((d: any) => d.label);

  const uniqueTeams = Array.from(
    new Map(memberTeams.map((d: any) => [d.id, d])).values()
  );

  const roleText = (r?: string) => {
    if (!r) return '';
    const key = String(r);
    const lower = key.toLowerCase();
    const map: Record<string, string> = {
      owner: 'Owner',
      orgadmin: 'Organization Admin',
      teamlead: 'Team Lead',
      lead: 'Team Lead',
      manager: 'Manager',
      editor: 'Editor',
      contentmanager: 'Content Manager',
      contentviewer: 'Content Viewer',
      viewer: 'Viewer',
      member: 'Member',
      guest: 'Guest',
    };
    if (map[lower]) return map[lower];
    return key
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const displayName = bootstrapData?.user?.displayName || user?.username || user?.email?.split('@')[0] || 'User';

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="flex items-baseline gap-2 text-muted-foreground text-sm font-medium">
          <span>{getGreeting()},</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mt-0.5">
          {displayName}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="text-xs px-2 py-0.5 font-medium bg-primary/5 text-primary border-primary/20"
        >
          {roleText(user?.role)}
        </Badge>
        {uniqueTeams.slice(0, 3).map((team) => (
          <Badge
            key={team.id}
            variant="outline"
            className="text-xs px-2.5 py-0.5 h-7 font-medium bg-muted/50 text-muted-foreground border-border/50 rounded-full"
          >
            {team.label}
          </Badge>
        ))}
        {uniqueTeams.length > 3 && (
          <Badge
            variant="outline"
            className="text-xs px-2 py-0.5 font-medium bg-muted/30 text-muted-foreground border-border/50 rounded-full"
          >
            +{uniqueTeams.length - 3}
          </Badge>
        )}
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
          {displayName[0].toUpperCase()}
        </div>
      </div>
    </div>
  );
}

function MainSections() {
  const { bootstrapData } = useAuth();
  const permissions = bootstrapData?.permissions || {};

  const dashboardLevel = resolveDashboardLevel(permissions);
  const hasAdminDashboard = dashboardLevel === 'admin';
  const isTeamLead = (bootstrapData?.departments || []).some((d: any) => d?.is_lead);
  const showTeamLeadCards = !hasAdminDashboard && isTeamLead;

  return (
    <div className="space-y-10">
      {/* Stats Grid */}
      <StatsSection />

      {/* Team/Member Cards based on role */}
      {hasAdminDashboard && <AdminTeamCards />}
      {showTeamLeadCards && <TeamLeadMemberCards />}
    </div>
  );
}

function resolveDashboardLevel(permissions: Record<string, any>): string {
  const raw = permissions?.['dashboard.view'];
  if (raw === 'admin' || raw === 'regular') return raw;
  if (raw === true) return 'admin';
  if (raw === false) return 'regular';
  return permissions?.['org.manage_members'] === true ? 'admin' : 'regular';
}

// Linear-style Stats Section
function StatsSection() {
  const { stats, isLoading, error } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Overview" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-lg bg-card/50 border border-border/40 animate-pulse"
            >
              <div className="h-3 w-16 bg-muted/50 rounded mb-3" />
              <div className="h-7 w-12 bg-muted/50 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats || !stats.documents || !stats.activity) {
    return (
      <div className="p-4 rounded-lg bg-card/50 border border-border/40 text-center">
        <p className="text-sm text-muted-foreground">
          Unable to load statistics
        </p>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Total Documents',
      value: stats.documents.total,
      subtext: `+${stats.documents.recentUploads} this week`,
      Icon: FileText,
      trend: 'up',
    },
    {
      label: 'Storage Used',
      value: formatBytes(stats.documents.storageBytes),
      subtext: 'Total storage',
      Icon: HardDrive,
      trend: null,
    },
    {
      label: 'Recent Activity',
      value: stats.activity.count || stats.activity.recentEvents.length,
      subtext: 'Last 7 days',
      Icon: Activity,
      trend: null,
    },
    {
      label: 'This Week',
      value: stats.documents.recentUploads,
      subtext: 'New uploads',
      Icon: TrendingUp,
      trend: 'up',
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="Overview" />

      {/* Desktop View - Standard Cards */}
      <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map(({ label, value, subtext, Icon, trend }) => (
          <div
            key={label}
            className={cn(
              'group p-4 rounded-lg',
              'bg-card/50 border border-border/40',
              'hover:bg-accent/30 hover:border-border/60',
              'transition-all duration-150'
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
              <Icon className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground tabular-nums">
                {value}
              </span>
              {trend === 'up' && (
                <TrendingUp className="h-3 w-3 text-green-500" />
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {subtext}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile View - Expressive Cards */}
      <div className="grid md:hidden grid-cols-2 gap-3">
        {metrics.map(({ label, value, subtext, Icon, trend }, i) => (
          <div
            key={label}
            className={cn(
              'relative overflow-hidden rounded-[1.75rem] p-5 transition-all shadow-sm',
              // Custom pastel colors based on index
              i === 0 && 'bg-[#F2F0EB] dark:bg-[#1E1C1A] text-[#4A453F] dark:text-[#E0DED5]', // Beige
              i === 1 && 'bg-[#F0E4E4] dark:bg-[#2A2020] text-[#4A3838] dark:text-[#EAE0E0]', // Rose
              i === 2 && 'bg-white dark:bg-card border border-border/40', // White/Default
              i === 3 && 'bg-[#E4F0E6] dark:bg-[#1A251E] text-[#2D3F33] dark:text-[#D5E6DC]', // Sage
              // Fallback text colors for dark mode generally handled by utility overrides if needed
              'text-foreground'
            )}
          >
            {/* Watermark Icon */}
            <Icon
              className={cn(
                "absolute -bottom-5 -right-5 h-24 w-24 -rotate-12 opacity-[0.07] dark:opacity-[0.05]",
                "pointer-events-none select-none"
              )}
            />

            {/* Top Icon Bubble */}
            <div className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center mb-4 shadow-sm backdrop-blur-sm",
              "bg-white/80 dark:bg-black/20"
            )}>
              <Icon className="h-4.5 w-4.5 opacity-70" />
            </div>

            {/* Content */}
            <div className="relative z-10 flex flex-col h-full justify-between min-h-[50px]">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">
                  {label}
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl font-bold tracking-tight leading-none">
                    {value}
                  </span>
                  {trend === 'up' && (
                    <TrendingUp className="h-3.5 w-3.5 text-green-600/80 dark:text-green-400" />
                  )}
                </div>
              </div>

              <div className="mt-4 pt-1">
                <p className="text-[11px] font-medium opacity-60 truncate">
                  {subtext}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Linear-style Section Header
function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        {title}
      </h2>
      {action}
    </div>
  );
}

// Widget-style Circular Progress
function CircularProgress({ value, size = 60, strokeWidth = 6, color = "currentColor" }: { value: number, size?: number, strokeWidth?: number, color?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 w-full h-full">
        <circle
          className="text-muted/20"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={cn("transition-all duration-1000 ease-out", color)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <span className="absolute text-[10px] font-bold tabular-nums">
        {value}%
      </span>
    </div>
  );
}

// Widget-style Bar Chart
function MiniBarChart({ data, height = 24 }: { data: number[], height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-[2px] h-full" style={{ height }}>
      {data.map((val, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full bg-primary/20"
          style={{ height: `${(val / max) * 100}%` }}
        >
          <div
            className="w-full rounded-full bg-primary"
            style={{ height: `${Math.min((val / max) * 100, 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

// Admin Team Cards - Widget Style
function AdminTeamCards() {
  const { bootstrapData } = useAuth();
  const teams = bootstrapData?.dashboardSummary?.teams || [];
  const loading = !bootstrapData;

  if (loading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Teams" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 rounded-[1.5rem] bg-card/50 border border-border/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (teams.length === 0) return null;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Teams Overview"
        action={
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
            {teams.length} Active
          </span>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team, idx) => {
          // Calculate a "health" or "activity" percentage based on weekly goal (arbitrary 50 for demo)
          const activityPercent = Math.min(Math.round((team.docsThisWeek / 50) * 100), 100);

          return (
            <div
              key={team.id}
              className={cn(
                'group relative overflow-hidden rounded-[1.75rem] p-5 shadow-sm transition-all hover:shadow-md',
                'bg-card border border-border/50',
                // Alternating sub-styles for visual interest
                idx % 2 === 0 ? 'hover:border-primary/30' : 'hover:border-blue-400/30'
              )}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-semibold text-base text-foreground tracking-tight leading-none mb-1">
                    {team.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                    {team.memberCount} Members
                  </p>
                </div>
                {/* Visual Widget: Circular Progress for 'Activity Score' */}
                <CircularProgress
                  value={activityPercent}
                  size={48}
                  strokeWidth={5}
                  color={activityPercent > 70 ? "text-green-500" : "text-primary"}
                />
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
                    Today
                  </p>
                  <p className="text-xl font-bold tabular-nums leading-none">
                    {team.docsToday}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
                    Weekly
                  </p>
                  <div className="flex items-end justify-between">
                    <p className="text-xl font-bold tabular-nums leading-none text-primary">
                      {team.docsThisWeek}
                    </p>
                    {/* Tiny visual bar chart decoration */}
                    <div className="flex gap-0.5 h-3 items-end opacity-50">
                      <div className="w-1 bg-primary h-1 rounded-full" />
                      <div className="w-1 bg-primary h-2 rounded-full" />
                      <div className="w-1 bg-primary h-3 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Team Lead Member Cards - Linear style
function TeamLeadMemberCards() {
  const [members, setMembers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const fetchedRef = React.useRef(false);

  React.useEffect(() => {
    if (fetchedRef.current) return;

    const fetchMembers = async () => {
      try {
        fetchedRef.current = true;
        setLoading(true);
        const orgId = getApiContext().orgId;
        if (!orgId) return;

        const response = await apiFetch<any>(`/orgs/${orgId}/dashboard/members`);
        if (response.error) {
          setError(response.error);
        } else {
          setMembers(response.members || []);
        }
      } catch (err) {
        setError('Failed to load member statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Team Members" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-lg bg-card/50 border border-border/40 animate-pulse"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="h-8 w-8 rounded-full bg-muted/50" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-24 bg-muted/50 rounded" />
                  <div className="h-2.5 w-16 bg-muted/50 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-card/50 border border-border/40 text-center">
        <p className="text-[13px] text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (members.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Team Members"
        action={
          <span className="text-xs text-muted-foreground">
            {members.length} members
          </span>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {members.map((member) => {
          const hasRecentActivity =
            member.docsToday > 0 || member.docsYesterday > 0;
          const hasAnyActivity = member.docsThisWeek > 0;

          return (
            <div
              key={member.userId}
              className={cn(
                'group p-4 rounded-lg',
                'bg-card/50 border border-border/40',
                'hover:bg-accent/30 hover:border-border/60',
                'transition-all duration-150',
                !hasRecentActivity && 'opacity-75'
              )}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    hasRecentActivity
                      ? 'bg-green-500/10'
                      : hasAnyActivity
                        ? 'bg-primary/10'
                        : 'bg-muted/30'
                  )}
                >
                  <User
                    className={cn(
                      'h-4 w-4',
                      hasRecentActivity
                        ? 'text-green-600 dark:text-green-400'
                        : hasAnyActivity
                          ? 'text-primary'
                          : 'text-muted-foreground/50'
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground truncate">
                    {member.displayName}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground truncate">
                      {member.departmentName}
                    </span>
                    {hasRecentActivity && (
                      <span className="flex h-1.5 w-1.5 rounded-full bg-green-500" />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Today
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium tabular-nums',
                      member.docsToday > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-muted-foreground/40'
                    )}
                  >
                    {member.docsToday}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Yesterday
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium tabular-nums',
                      member.docsYesterday > 0
                        ? 'text-primary'
                        : 'text-muted-foreground/40'
                    )}
                  >
                    {member.docsYesterday}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    This Week
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium tabular-nums',
                      member.docsThisWeek > 0
                        ? 'text-foreground'
                        : 'text-muted-foreground/40'
                    )}
                  >
                    {member.docsThisWeek}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
