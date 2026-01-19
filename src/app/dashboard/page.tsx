"use client";
import React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useDepartments } from '@/hooks/use-departments';
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
  const { user } = useAuth();
  const { departments, selectedDepartmentId } = useDepartments();
  const team = departments.find((d) => d.id === selectedDepartmentId) || null;

  const roleText = (r?: string) => {
    switch ((r || '').toLowerCase()) {
      case 'systemadmin':
      case 'orgadmin':
        return 'Admin';
      case 'teamlead':
        return 'Team Lead';
      case 'member':
        return 'Member';
      case 'guest':
        return 'Guest';
      default:
        return r || '';
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Overview of your workspace
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="text-xs px-2 py-0.5 font-medium bg-primary/5 text-primary border-primary/20"
        >
          {roleText(user?.role)}
        </Badge>
        {team && (
          <Badge
            variant="outline"
            className="text-xs px-2 py-0.5 font-medium bg-muted/50 text-muted-foreground border-border/50"
          >
            {team.name}
          </Badge>
        )}
      </div>
    </div>
  );
}

function MainSections() {
  const { user, bootstrapData } = useAuth();
  const permissions = bootstrapData?.permissions || {};

  const dashboardLevel =
    permissions['dashboard.view'] || getDefaultDashboardLevel(user?.role);
  const hasAdminDashboard = dashboardLevel === 'admin';
  const isTeamLead = user?.role === 'teamLead';
  const showTeamLeadCards = !hasAdminDashboard && isTeamLead;

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <StatsSection />

      {/* Team/Member Cards based on role */}
      {hasAdminDashboard && <AdminTeamCards />}
      {showTeamLeadCards && <TeamLeadMemberCards />}
    </div>
  );
}

function getDefaultDashboardLevel(role?: string): string {
  switch (role) {
    case 'systemAdmin':
    case 'orgAdmin':
      return 'admin';
    default:
      return 'regular';
  }
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

  if (error || !stats) {
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </h2>
      {action}
    </div>
  );
}

// Admin Team Cards - Linear style
function AdminTeamCards() {
  const { bootstrapData } = useAuth();
  const teams = bootstrapData?.dashboardSummary?.teams || [];
  const loading = !bootstrapData;

  if (loading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Teams" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-lg bg-card/50 border border-border/40 animate-pulse"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="h-8 w-8 rounded-md bg-muted/50" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-20 bg-muted/50 rounded" />
                  <div className="h-2.5 w-14 bg-muted/50 rounded" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-2.5 w-full bg-muted/50 rounded" />
                <div className="h-2.5 w-3/4 bg-muted/50 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Teams"
        action={
          <span className="text-xs text-muted-foreground">
            {teams.length} teams
          </span>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {teams.map((team) => (
          <div
            key={team.id}
            className={cn(
              'group p-4 rounded-lg',
              'bg-card/50 border border-border/40',
              'hover:bg-accent/30 hover:border-border/60',
              'transition-all duration-150'
            )}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  {team.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {team.memberCount} members
                </p>
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
                    team.docsToday > 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-muted-foreground/50'
                  )}
                >
                  {team.docsToday}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  This Week
                </span>
                <span
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    team.docsThisWeek > 0
                      ? 'text-primary'
                      : 'text-muted-foreground/50'
                  )}
                >
                  {team.docsThisWeek}
                </span>
              </div>
            </div>

            {/* Activity indicator bar */}
            <div className="mt-3 pt-3 border-t border-border/30">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full transition-all"
                    style={{
                      width: `${Math.min((team.docsThisWeek / 10) * 100, 100)}%`,
                    }}
                  />
                </div>
                <Sparkles className="h-3 w-3 text-muted-foreground/30" />
              </div>
            </div>
          </div>
        ))}
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
