"use client";
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User,
  Palette,
  Building2,
  Users,
  UsersRound,
  Lock,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

// Navigation data mirroring the sidebar
const SETTINGS_SECTIONS = [
  {
    title: 'My Account',
    items: [
      { href: '/settings/profile', label: 'Profile', Icon: User, description: 'Manage your personal info' },
      { href: '/settings/preferences', label: 'Preferences', Icon: Palette, description: 'Theme & display settings' },
    ]
  },
  {
    title: 'Organization',
    items: [
      { href: '/settings/general', label: 'General', Icon: Building2, adminOnly: true, description: 'Workspace details & branding' },
      { href: '/settings/members', label: 'Members', Icon: Users, permission: 'org.manage_members', description: 'Manage people & invites' },
      { href: '/settings/teams', label: 'Teams', Icon: UsersRound, description: 'Department structures' },
      { href: '/settings/permissions', label: 'Permissions', Icon: Lock, adminOnly: true, description: 'Access control & roles' },
      { href: '/settings/security', label: 'Security', Icon: Shield, adminOnly: true, description: 'SSO & Audit logs' },
    ]
  }
];

export default function SettingsIndexPage() {
  const router = useRouter();
  const { hasPermission, bootstrapData } = useAuth();

  // On Desktop, we still want to redirect to the first item (Profile) automatically
  // because this index page is primarily for Mobile navigation.
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    if (isDesktop) {
      router.replace('/settings/profile');
    }
  }, [router]);

  const isAdmin = hasPermission('org.manage_members');
  const isTeamLead = (bootstrapData?.departments || []).some((d: any) => d?.is_lead);
  const canManageTeamMembers = hasPermission('departments.manage_members');

  return (
    <div className="min-h-screen bg-background pb-20 md:p-10">
      {/* Mobile Header */}
      <div className="md:hidden sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40 px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
      </div>

      {/* Desktop Redirect Message (Hidden mostly, but good for perceived perf) */}
      <div className="hidden md:flex min-h-[50vh] items-center justify-center text-muted-foreground animate-pulse">
        Redirecting to Profile...
      </div>

      {/* Mobile Card Grid */}
      <div className="md:hidden px-4 py-6 space-y-8">
        {SETTINGS_SECTIONS.map((section) => {
          // Filter items based on permissions
          const visibleItems = section.items.filter(item => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.permission && !hasPermission(item.permission)) return false;
            if (item.href === '/settings/teams' && !(isAdmin || isTeamLead || canManageTeamMembers)) return false;
            return true;
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} className="space-y-3">
              <h2 className="px-1 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                {section.title}
              </h2>
              <div className="grid gap-3">
                {visibleItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/50 shadow-sm transition-all",
                      "active:scale-95 active:bg-accent/50"
                    )}
                  >
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary",
                      "group-active:scale-110 transition-transform"
                    )}>
                      <item.Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-foreground mb-0.5">
                        {item.label}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
