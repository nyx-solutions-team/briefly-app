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
  Users,
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
        {uniqueTeams.slice(0, 3).map((team: any) => (
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
      label: 'Active Documents',
      value: stats.documents.total,
      subtext: 'Current non-draft files',
      Icon: FileText,
      trend: 'up',
    },
    {
      label: 'Live Storage',
      value: formatBytes(stats.documents.storageBytes),
      subtext: 'Storage for active files',
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
      subtext: 'New active uploads',
      Icon: TrendingUp,
      trend: 'up',
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Overview"
        action={
          <span className="text-[10px] font-medium text-muted-foreground/70">
            Excludes drafts and recycle bin items
          </span>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(({ label, value, subtext, Icon, trend }, i) => (
          <div
            key={label}
            className={cn(
              'relative overflow-hidden rounded-[1.75rem] p-5 transition-all shadow-sm',
              'hover:shadow-md hover:scale-[1.02] transform-gpu',
              // Custom pastel colors based on index
              i === 0 && 'bg-[#F2F0EB] dark:bg-[#1E1C1A] text-[#4A453F] dark:text-[#E0DED5]', // Beige
              i === 1 && 'bg-[#F0E4E4] dark:bg-[#2A2020] text-[#4A3838] dark:text-[#EAE0E0]', // Rose
              i === 2 && 'bg-[#E6E9F0] dark:bg-[#1A1D25] text-[#3F4554] dark:text-[#D5DEE6]', // Blue
              i === 3 && 'bg-[#E4F0E6] dark:bg-[#1A251E] text-[#2D3F33] dark:text-[#D5E6DC]', // Sage
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
                  <span className="text-2xl font-bold tracking-tight leading-none tabular-nums">
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

// Admin Team Cards - Expressive Widget Style
function AdminTeamCards() {
  const { bootstrapData } = useAuth();
  const teams = bootstrapData?.dashboardSummary?.teams || [];
  const loading = !bootstrapData;

  if (loading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Teams" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 rounded-[1.75rem] bg-card/50 border border-border/40 animate-pulse" />
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
          <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest bg-muted/50 px-3 py-1 rounded-full">
            {teams.length} Units
          </span>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team: any) => {

          return (
            <div
              key={team.id}
              className={cn(
                'group relative flex flex-col rounded-[1.75rem] p-5 transition-all duration-200',
                'bg-card border border-border/40 shadow-sm hover:shadow-md hover:border-border/80',
                'hover:-translate-y-0.5'
              )}
            >
              {/* Header */}
              <div className="flex items-center gap-3.5 mb-5">
                <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 border border-border/20">
                  <Users className="h-5 w-5 text-muted-foreground/70" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate tracking-tight text-foreground">
                    {team.name}
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    {team.memberCount} Mbrs
                  </p>
                </div>
              </div>

              {/* Stats Grid - High Density */}
              <div className="grid grid-cols-2 gap-2 mt-auto">
                <div className="rounded-2xl p-3 bg-muted/20 border border-border/10">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Today</p>
                  <p className="text-xl font-bold tabular-nums tracking-tight text-foreground truncate">{team.docsToday || 0}</p>
                </div>
                <div className="rounded-2xl p-3 bg-muted/20 border border-border/10">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Weekly</p>
                  <div className="flex items-center justify-between min-w-0">
                    <p className="text-xl font-bold tabular-nums tracking-tight text-foreground truncate">
                      {team.docsThisWeek || 0}
                    </p>
                    <TrendingUp className="h-3 w-3 text-muted-foreground/40 shrink-0 ml-1" />
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
        title="Member Performance"
        action={
          <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest bg-muted/50 px-3 py-1 rounded-full">
            Performance
          </span>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {members.map((member, mIdx) => {
          const hasRecentActivity = member.docsToday > 0 || member.docsYesterday > 0;
          const initials = (member.displayName || 'U').split(' ').map((s: any) => s[0]).join('').toUpperCase().slice(0, 2);

          return (
            <div
              key={member.userId}
              className={cn(
                'group relative flex flex-col rounded-[1.5rem] p-5 transition-all duration-200',
                'bg-card border border-border/40 shadow-sm hover:shadow-md hover:border-border/80',
                !hasRecentActivity && 'opacity-70'
              )}
            >
              {/* Header */}
              <div className="flex items-center gap-3.5 mb-5">
                <div className={cn(
                  "relative h-10 w-10 rounded-xl flex items-center justify-center font-bold text-[11px] shadow-sm border border-border/10",
                  mIdx % 2 === 0 ? "bg-primary/5 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {initials}
                  {hasRecentActivity && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border border-card shadow-sm" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-bold text-foreground truncate tracking-tight">
                    {member.displayName}
                  </h3>
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest opacity-60 truncate">
                    {member.departmentName}
                  </p>
                </div>
              </div>

              {/* Stats Block */}
              <div className="flex items-center gap-2 mt-auto">
                <div className="flex-1 bg-muted/20 rounded-xl p-2.5 text-center border border-border/5">
                  <p className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-0.5">Today</p>
                  <p className={cn("text-sm font-bold tabular-nums truncate", member.docsToday > 0 ? "text-foreground" : "text-muted-foreground/30")}>
                    {member.docsToday || 0}
                  </p>
                </div>
                <div className="flex-1 bg-muted/20 rounded-xl p-2.5 text-center border border-border/5">
                  <p className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-0.5">Weekly</p>
                  <p className={cn("text-sm font-bold tabular-nums truncate", member.docsThisWeek > 0 ? "text-foreground" : "text-muted-foreground/30")}>
                    {member.docsThisWeek || 0}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
