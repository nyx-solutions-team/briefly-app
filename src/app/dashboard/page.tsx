"use client";
import React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { H1, Muted } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { useDepartments } from '@/hooks/use-departments';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDocuments } from '@/hooks/use-documents';
import { useAuth } from '@/hooks/use-auth';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useSettings } from '@/hooks/use-settings';
import Link from 'next/link';
import { UploadCloud, Sparkles, FolderOpenDot, MessageSquare, Eye, FileText, Users, HardDrive, Activity, TrendingUp, Calendar, UserCheck, Clock, Building2, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAppDateTime, formatBytes } from '@/lib/utils';
import { apiFetch, getApiContext } from '@/lib/api';

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="px-3 pt-2 pb-24 md:px-0 md:pb-0 space-y-6 md:space-y-8">
        <HeaderWithIdentity />
        <div className="px-1 sm:px-4 md:px-6">
          <MainSections />
        </div>
      </div>
    </AppLayout>
  );
}

function HeaderCTA() { return null; }

// Admin Team Cards Component
function AdminTeamCards() {
  const [teams, setTeams] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchTeams = async () => {
      try {
        setLoading(true);
        const orgId = getApiContext().orgId;
        if (!orgId) return;

        const response = await apiFetch<any>(`/orgs/${orgId}/dashboard/teams`);
        if (response.error) {
          setError(response.error);
        } else {
          setTeams(response.teams || []);
        }
      } catch (err) {
        setError('Failed to load team statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, []);

  if (loading) {
    return (
      <Card className="rounded-xl border border-border bg-card shadow-sm card-premium">
        <CardHeader>
          <CardTitle className="text-foreground text-lg font-semibold sm:text-xl">Team Statistics</CardTitle>
          <Skeleton className="h-4 w-40 sm:w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="p-4 sm:p-5">
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3.5 w-1/2" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rounded-xl border border-border bg-card shadow-sm card-premium">
        <CardContent className="p-6 text-center text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border border-border bg-card shadow-sm card-premium">
      <CardHeader>
        <CardTitle className="text-foreground text-lg font-semibold sm:text-xl">Team Statistics</CardTitle>
        <p className="text-xs text-muted-foreground sm:text-sm">Monitor document uploads and team performance</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {teams.map((team) => (
            <Card key={team.id} className="p-4 sm:p-5 hover:shadow-md transition-shadow">
              <div className="space-y-2.5 sm:space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-base sm:text-lg">{team.name}</h4>
                    <p className="text-xs text-muted-foreground sm:text-sm">{team.memberCount} members</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground sm:text-sm">Today</span>
                    <span className="text-sm font-medium text-green-600 sm:text-base">{team.docsToday}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground sm:text-sm">Yesterday</span>
                    <span className="text-sm font-medium text-blue-600 sm:text-base">{team.docsYesterday}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground sm:text-sm">This Week</span>
                    <span className="text-sm font-medium text-purple-600 sm:text-base">{team.docsThisWeek}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Team Lead Member Cards Component
function TeamLeadMemberCards() {
  const [members, setMembers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);


  React.useEffect(() => {
    const fetchMembers = async () => {
      try {
        setLoading(true);
        const orgId = getApiContext().orgId;
        if (!orgId) return;

        const response = await apiFetch<any>(`/orgs/${orgId}/dashboard/members`);
        if (response.error) {
          setError(response.error);
        } else {
          console.log('📊 [TEAM_LEAD_DASHBOARD] Members received from backend:', response.members?.length || 0);
          console.log('👥 Member details:', response.members?.map((m: any) => `${m.userId} -> ${m.displayName}`));
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
      <Card className="rounded-xl border border-border bg-card shadow-sm card-premium">
        <CardHeader>
          <CardTitle className="text-foreground text-lg font-semibold sm:text-xl">Team Member Statistics</CardTitle>
          <Skeleton className="h-4 w-48 sm:w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4 sm:p-5">
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3.5 w-1/2" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rounded-xl border border-border bg-card shadow-sm card-premium">
        <CardContent className="p-6 text-center text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    );
  }

  // Show all members by default
  const filteredMembers = members;

  return (
    <Card className="rounded-xl border border-border bg-card shadow-sm card-premium">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground text-lg font-semibold sm:text-xl">Active Members</CardTitle>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Track document uploads by your team members
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filteredMembers.map((member) => {
            const hasRecentActivity = member.docsToday > 0 || member.docsYesterday > 0;
            const hasAnyActivity = member.docsThisWeek > 0;
            return (
              <Card
                key={member.userId}
                className={`p-4 sm:p-5 hover:shadow-md transition-shadow ${
                  !hasRecentActivity ? 'opacity-75' : ''
                }`}
              >
              <div className="space-y-2.5 sm:space-y-3">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      hasRecentActivity
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : hasAnyActivity
                        ? 'bg-blue-100 dark:bg-blue-900/30'
                        : 'bg-gray-100 dark:bg-gray-900/30'
                    }`}>
                      <User className={`h-5 w-5 ${
                        hasRecentActivity
                          ? 'text-green-600 dark:text-green-400'
                          : hasAnyActivity
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`} />
                  </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-base sm:text-lg">
                        {member.displayName.startsWith('User ') || member.displayName.length > 20
                          ? `${member.displayName} (${member.role})`
                          : member.displayName
                        }
                      </h4>
                      <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground sm:text-sm">{member.departmentName}</p>
                        {hasRecentActivity ? (
                          <Badge variant="outline" className="text-[10px] sm:text-xs text-green-600 border-green-200">
                            Active
                          </Badge>
                        ) : hasAnyActivity ? (
                          <Badge variant="outline" className="text-[10px] sm:text-xs text-blue-600 border-blue-200">
                            This Week
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] sm:text-xs text-gray-500 border-gray-200">
                            New Member
                          </Badge>
                        )}
                      </div>
                    </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground sm:text-sm">Today</span>
                      <span className={`font-medium ${
                        member.docsToday > 0 ? 'text-green-600' : 'text-gray-400'
                      } text-sm sm:text-base`}>
                        {member.docsToday}
                      </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground sm:text-sm">Yesterday</span>
                      <span className={`font-medium ${
                        member.docsYesterday > 0 ? 'text-blue-600' : 'text-gray-400'
                      } text-sm sm:text-base`}>
                        {member.docsYesterday}
                      </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground sm:text-sm">This Week</span>
                      <span className={`font-medium ${
                        member.docsThisWeek > 0 ? 'text-purple-600' : 'text-gray-400'
                      } text-sm sm:text-base`}>
                        {member.docsThisWeek}
                      </span>
                    </div>
                </div>
              </div>
            </Card>
            );
          })}
        </div>
        {filteredMembers.length === 0 && members.length > 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No team members found</p>
            <p className="text-sm">Your team appears to be empty</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getThemeColors(accentColor: string) {
  const colorMap: Record<string, {
    primary: string;
    secondary: string;
    cardBg: string;
    cardBorder: string;
    progressBar: string;
    iconBg: string;
  }> = {
    default: {
      primary: 'text-blue-600 dark:text-blue-400',
      secondary: 'text-blue-700 dark:text-blue-300',
      cardBg: 'bg-blue-50/50 dark:bg-blue-900/30',
      cardBorder: 'border-blue-200 dark:border-blue-700',
      progressBar: 'bg-blue-500',
      iconBg: 'bg-blue-100 dark:bg-blue-800/40'
    },
    red: {
      primary: 'text-red-600 dark:text-red-400',
      secondary: 'text-red-700 dark:text-red-300',
      cardBg: 'bg-red-50/50 dark:bg-red-900/30',
      cardBorder: 'border-red-200 dark:border-red-700',
      progressBar: 'bg-red-500',
      iconBg: 'bg-red-100 dark:bg-red-800/40'
    },
    rose: {
      primary: 'text-rose-600 dark:text-rose-400',
      secondary: 'text-rose-700 dark:text-rose-300',
      cardBg: 'bg-rose-50/50 dark:bg-rose-900/30',
      cardBorder: 'border-rose-200 dark:border-rose-700',
      progressBar: 'bg-rose-500',
      iconBg: 'bg-rose-100 dark:bg-rose-800/40'
    },
    orange: {
      primary: 'text-orange-600 dark:text-orange-400',
      secondary: 'text-orange-700 dark:text-orange-300',
      cardBg: 'bg-orange-50/50 dark:bg-orange-900/30',
      cardBorder: 'border-orange-200 dark:border-orange-700',
      progressBar: 'bg-orange-500',
      iconBg: 'bg-orange-100 dark:bg-orange-800/40'
    },
    amber: {
      primary: 'text-amber-600 dark:text-amber-400',
      secondary: 'text-amber-700 dark:text-amber-300',
      cardBg: 'bg-amber-50/50 dark:bg-amber-900/30',
      cardBorder: 'border-amber-200 dark:border-amber-700',
      progressBar: 'bg-amber-500',
      iconBg: 'bg-amber-100 dark:bg-amber-800/40'
    },
    yellow: {
      primary: 'text-yellow-600 dark:text-yellow-400',
      secondary: 'text-yellow-700 dark:text-yellow-300',
      cardBg: 'bg-yellow-50/50 dark:bg-yellow-900/30',
      cardBorder: 'border-yellow-200 dark:border-yellow-700',
      progressBar: 'bg-yellow-500',
      iconBg: 'bg-yellow-100 dark:bg-yellow-800/40'
    },
    lime: {
      primary: 'text-lime-600 dark:text-lime-400',
      secondary: 'text-lime-700 dark:text-lime-300',
      cardBg: 'bg-lime-50/50 dark:bg-lime-900/30',
      cardBorder: 'border-lime-200 dark:border-lime-700',
      progressBar: 'bg-lime-500',
      iconBg: 'bg-lime-100 dark:bg-lime-800/40'
    },
    green: {
      primary: 'text-green-600 dark:text-green-400',
      secondary: 'text-green-700 dark:text-green-300',
      cardBg: 'bg-green-50/50 dark:bg-green-900/30',
      cardBorder: 'border-green-200 dark:border-green-700',
      progressBar: 'bg-green-500',
      iconBg: 'bg-green-100 dark:bg-green-800/40'
    },
    emerald: {
      primary: 'text-emerald-600 dark:text-emerald-400',
      secondary: 'text-emerald-700 dark:text-emerald-300',
      cardBg: 'bg-emerald-50/50 dark:bg-emerald-900/30',
      cardBorder: 'border-emerald-200 dark:border-emerald-700',
      progressBar: 'bg-emerald-500',
      iconBg: 'bg-emerald-100 dark:bg-emerald-800/40'
    },
    teal: {
      primary: 'text-teal-600 dark:text-teal-400',
      secondary: 'text-teal-700 dark:text-teal-300',
      cardBg: 'bg-teal-50/50 dark:bg-teal-900/30',
      cardBorder: 'border-teal-200 dark:border-teal-700',
      progressBar: 'bg-teal-500',
      iconBg: 'bg-teal-100 dark:bg-teal-800/40'
    },
    cyan: {
      primary: 'text-cyan-600 dark:text-cyan-400',
      secondary: 'text-cyan-700 dark:text-cyan-300',
      cardBg: 'bg-cyan-50/50 dark:bg-cyan-900/30',
      cardBorder: 'border-cyan-200 dark:border-cyan-700',
      progressBar: 'bg-cyan-500',
      iconBg: 'bg-cyan-100 dark:bg-cyan-800/40'
    },
    sky: {
      primary: 'text-sky-600 dark:text-sky-400',
      secondary: 'text-sky-700 dark:text-sky-300',
      cardBg: 'bg-sky-50/50 dark:bg-sky-900/30',
      cardBorder: 'border-sky-200 dark:border-sky-700',
      progressBar: 'bg-sky-500',
      iconBg: 'bg-sky-100 dark:bg-sky-800/40'
    },
    blue: {
      primary: 'text-blue-600 dark:text-blue-400',
      secondary: 'text-blue-700 dark:text-blue-300',
      cardBg: 'bg-blue-50/50 dark:bg-blue-900/30',
      cardBorder: 'border-blue-200 dark:border-blue-700',
      progressBar: 'bg-blue-500',
      iconBg: 'bg-blue-100 dark:bg-blue-800/40'
    },
    indigo: {
      primary: 'text-indigo-600 dark:text-indigo-400',
      secondary: 'text-indigo-700 dark:text-indigo-300',
      cardBg: 'bg-indigo-50/50 dark:bg-indigo-900/30',
      cardBorder: 'border-indigo-200 dark:border-indigo-700',
      progressBar: 'bg-indigo-500',
      iconBg: 'bg-indigo-100 dark:bg-indigo-800/40'
    },
    violet: {
      primary: 'text-violet-600 dark:text-violet-400',
      secondary: 'text-violet-700 dark:text-violet-300',
      cardBg: 'bg-violet-50/50 dark:bg-violet-900/30',
      cardBorder: 'border-violet-200 dark:border-violet-700',
      progressBar: 'bg-violet-500',
      iconBg: 'bg-violet-100 dark:bg-violet-800/40'
    },
    purple: {
      primary: 'text-purple-600 dark:text-purple-400',
      secondary: 'text-purple-700 dark:text-purple-300',
      cardBg: 'bg-purple-50/50 dark:bg-purple-900/30',
      cardBorder: 'border-purple-200 dark:border-purple-700',
      progressBar: 'bg-purple-500',
      iconBg: 'bg-purple-100 dark:bg-purple-800/40'
    },
    fuchsia: {
      primary: 'text-fuchsia-600 dark:text-fuchsia-400',
      secondary: 'text-fuchsia-700 dark:text-fuchsia-300',
      cardBg: 'bg-fuchsia-50/50 dark:bg-fuchsia-900/30',
      cardBorder: 'border-fuchsia-200 dark:border-fuchsia-700',
      progressBar: 'bg-fuchsia-500',
      iconBg: 'bg-fuchsia-100 dark:bg-fuchsia-800/40'
    },
    pink: {
      primary: 'text-pink-600 dark:text-pink-400',
      secondary: 'text-pink-700 dark:text-pink-300',
      cardBg: 'bg-pink-50/50 dark:bg-pink-900/30',
      cardBorder: 'border-pink-200 dark:border-pink-700',
      progressBar: 'bg-pink-500',
      iconBg: 'bg-pink-100 dark:bg-pink-800/40'
    },
  };
  return colorMap[accentColor] || colorMap.default;
}

function MainSections() {
  const { user, bootstrapData } = useAuth();
  const permissions = bootstrapData?.permissions || {};
  
  // Get dashboard permission level (defaults to role-based if not set)
  const dashboardLevel = permissions['dashboard.view'] || getDefaultDashboardLevel(user?.role);
  const hasAdminDashboard = dashboardLevel === 'admin';
  
  // For regular dashboard, show cards based on role
  const isTeamLead = user?.role === 'teamLead';
  const showTeamLeadCards = !hasAdminDashboard && isTeamLead;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Always show AdminStats (KPIs) for all users - filtered by dashboard level */}
      <AdminStats />

      {/* Show team cards for admin dashboard OR orgAdmin role */}
      {hasAdminDashboard && <AdminTeamCards />}

      {/* Show member cards for team leads with regular dashboard */}
      {showTeamLeadCards && <TeamLeadMemberCards />}
    </div>
  );
}

// Helper function to get default dashboard level based on role
function getDefaultDashboardLevel(role?: string): string {
  switch (role) {
    case 'systemAdmin':
    case 'orgAdmin':
      return 'admin';
    case 'teamLead':
      return 'regular';
    default:
      return 'regular';
  }
}

function HeaderWithIdentity() {
  const { user } = useAuth();
  const { departments, selectedDepartmentId } = useDepartments();
  const team = departments.find((d) => d.id === selectedDepartmentId) || null;
  const roleText = (r?: string) => {
    switch ((r || '').toLowerCase()) {
      case 'systemadmin': return 'Admin';
      case 'teamlead': return 'Team Lead';
      case 'member': return 'Member';
      case 'guest': return 'Guest';
      default: return r || '';
    }
  };
  return (
    <PageHeader
      title="Welcome to Briefly"
      subtitle={<span className="hidden sm:inline">Manage your documents, get AI insights, and streamline your workflows.</span>}
      sticky
      meta={(
        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5">{roleText(user?.role)}</Badge>
          {team && (
            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 capitalize" data-color={team.color || 'default'}>{team.name}</Badge>
          )}
        </div>
      )}
    />
  );
}

function QuickActions() {
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);

  return (
    <Card className="rounded-xl border border-border bg-card shadow-sm card-premium hover-premium">
      <CardHeader className="pb-4">
        <CardTitle className="text-foreground text-xl font-semibold">Quick Actions</CardTitle>
        <p className="text-sm text-muted-foreground">Your essential shortcuts</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <Link href="/documents" className="group flex flex-col items-center justify-center p-6 rounded-xl bg-secondary hover:bg-accent/60 transition-all border border-border/50 hover:border-border/80 hover:shadow-lg hover:scale-105 hover-premium focus-premium">
            <div className={`p-3 rounded-lg ${themeColors.iconBg} mb-3 group-hover:scale-110 transition-transform`}>
              <FolderOpenDot className={`h-8 w-8 ${themeColors.primary}`} />
            </div>
            <span className="font-medium text-foreground text-center text-sm">Browse Documents</span>
            <span className={`text-xs ${themeColors.primary} font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity`}>Open →</span>
          </Link>

          <Link href="/chat" className="group flex flex-col items-center justify-center p-6 rounded-xl bg-secondary hover:bg-accent/60 transition-all border border-border/50 hover:border-border/80 hover:shadow-lg hover:scale-105 hover-premium focus-premium">
            <div className={`p-3 rounded-lg ${themeColors.iconBg} mb-3 group-hover:scale-110 transition-transform`}>
              <MessageSquare className={`h-8 w-8 ${themeColors.primary}`} />
            </div>
            <span className="font-medium text-foreground text-center text-sm">Chat with AI</span>
            <span className={`text-xs ${themeColors.primary} font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity`}>Open →</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentDocuments({ className = '' }: { className?: string }) {
  const { documents } = useDocuments();
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);
  const recent = [...documents].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).slice(0, 3);

  return (
    <Card className={`rounded-xl border border-border bg-card shadow-sm card-premium hover-premium ${className}`}>
      <CardHeader className="flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <Sparkles className={`h-4 w-4 ${themeColors.primary}`} />
          <CardTitle className="text-foreground text-xl font-semibold">Recent Documents</CardTitle>
        </div>
        <Link href="/documents" className={`text-sm ${themeColors.primary} hover:underline font-medium transition-colors hover:text-primary/80`}>View All</Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {recent.length === 0 && (
          <div className="py-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
            <div className="text-sm text-muted-foreground">No documents yet. Upload your first one to get started.</div>
          </div>
        )}
        {recent.map((d) => (
          <Link key={d.id} href={`/documents/${d.id}`} className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-accent/60 transition-all border border-border/30 hover:border-border/60 hover:shadow-md hover:scale-[1.02] hover-premium focus-premium">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className={`h-5 w-5 ${themeColors.primary}`} />
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground" title={(d as any).title || (d as any).filename || d.name}>{(d as any).title || (d as any).filename || d.name}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className={`uppercase tracking-wide border-border/50 bg-background/50 text-muted-foreground`}>{d.type}</Badge>
                  <span>•</span>
                  <span>{formatAppDateTime(d.uploadedAt)}</span>
                </div>
              </div>
            </div>
            <Eye className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function AdminStats() {
  const { stats, isLoading, error } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="rounded-2xl">
            <CardContent className="p-4 sm:p-6">
              <Skeleton className="h-3.5 w-20 mb-2" />
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-6 text-center text-muted-foreground">
          Unable to load dashboard statistics
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics - Always visible for all users */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Total Documents"
          value={stats.documents.total}
          icon={FileText}
          trend={`+${stats.documents.recentUploads} this week`}
          color="blue"
        />
        <MetricCard
          title="Storage Used"
          value={formatBytes(stats.documents.storageBytes)}
          icon={HardDrive}
          trend="Total storage"
          color="green"
        />
                 {/* Active Users - Commented out for all views as requested */}
         {/* <MetricCard
           title="Active Users"
           value={stats.users.total}
           icon={Users}
           trend="All team members"
           color="purple"
         /> */}
        <MetricCard
          title="Recent Activity"
          value={stats.activity.recentEvents.length}
          icon={Activity}
          trend="Last 7 days"
          color="orange"
        />
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, trend, color }: {
  title: string;
  value: string | number;
  icon: any;
  trend: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);

  return (
    <Card className="rounded-xl border border-border bg-card shadow-sm card-premium hover-premium">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-0.5 sm:text-sm">{title}</p>
            <p className="text-2xl font-bold text-foreground mb-2 sm:text-3xl sm:mb-3">{value}</p>
            <div className="flex items-center gap-2">
              <div className={`w-10 sm:w-12 h-1 rounded-full ${themeColors.progressBar} shadow-sm`}></div>
              <p className="text-[11px] text-muted-foreground sm:text-xs">{trend}</p>
            </div>
          </div>
          <div className={`p-3 rounded-lg ${themeColors.iconBg} ml-4 border border-border/30 shadow-sm`}>
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${themeColors.primary}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

