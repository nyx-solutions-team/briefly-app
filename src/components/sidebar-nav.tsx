"use client";

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Folder,
  CloudUpload,
  Activity,
  Trash2,
  Wrench,
  PlusSquare,
  ListChecks,
  // Settings icons
  ArrowLeft,
  User,
  Palette,
  Building2,
  Users,
  UsersRound,
  Link2,
  // FileText,
  Lock,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { useAuth } from '@/hooks/use-auth';
import { getApiContext, apiFetch } from '@/lib/api';
import { getOrgFeatures } from '@/lib/org-features';
import { useState, useEffect } from 'react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  useSidebar,
} from './ui/sidebar';

// Main navigation links (visible to all based on permissions)
const mainLinks = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/documents', label: 'Folders', Icon: Folder },
  // Temporarily hidden for deployment. Keep entry for easy restore.
  // { href: '/editor', label: 'Editor', Icon: FileText, permission: 'documents.read' },
  { href: '/documents/upload', label: 'Upload Document', Icon: CloudUpload },
  // Temporarily hidden for deployment. Keep entry for easy restore.
  // { href: '/approvals', label: 'Approvals', Icon: PlusSquare, permission: 'documents.read' },
  { href: '/queue', label: 'Queue', Icon: ListChecks },
  { href: '/audit', label: 'Activity', Icon: Activity },
  { href: '/recycle-bin', label: 'Recycle Bin', Icon: Trash2 },
];

// Admin-only links
const adminLinks = [
  { href: '/chat', label: 'Chat Bot', Icon: Wrench },
];

// Settings navigation links
const settingsAccountLinks = [
  { href: '/settings/profile', label: 'Profile', Icon: User },
  { href: '/settings/preferences', label: 'Preferences', Icon: Palette },
  { href: '/settings/shared-links', label: 'Shared Links', Icon: Link2 },
];

const settingsOrgLinks = [
  { href: '/settings/general', label: 'General', Icon: Building2, adminOnly: true },
  { href: '/settings/members', label: 'Members', Icon: Users, permission: 'org.manage_members' },
  { href: '/settings/teams', label: 'Teams', Icon: UsersRound },
  // Temporarily hidden for deployment. Keep entry for easy restore.
  // { href: '/settings/approval-templates', label: 'Approval Templates', Icon: FileText, permission: 'org.update_settings' },
  { href: '/settings/permissions', label: 'Permissions', Icon: Lock, adminOnly: true },
  { href: '/settings/security', label: 'Security', Icon: Shield, adminOnly: true },
];

// Linear-style nav item component
function NavItem({
  href,
  label,
  Icon,
  isActive,
  badgeCount
}: {
  href: string;
  label: string;
  Icon: any;
  isActive: boolean;
  badgeCount?: number;
}) {
  const { state } = useSidebar();
  const badgeText = badgeCount && badgeCount > 0
    ? (badgeCount > 99 ? '99+' : badgeCount.toString())
    : null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={label}
        className={cn(
          "h-9 transition-all duration-200",
          isActive ? "bg-sidebar-accent/60 text-sidebar-accent-foreground" : "text-sidebar-foreground/70"
        )}
      >
        <Link href={href} className="relative">
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-r-full group-data-[collapsible=icon]:hidden" />
          )}
          <Icon className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            isActive ? "text-primary" : "text-sidebar-foreground/40"
          )} />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {badgeText && (
        <SidebarMenuBadge className="bg-primary/10 text-primary group-data-[collapsible=icon]:hidden">
          {badgeText}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

// Linear-style section label
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">
      {children}
    </div>
  );
}

// Back navigation item
function BackNavItem({ href, label }: { href: string; label: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={label}
        className="h-9 text-sidebar-foreground/70"
      >
        <Link href={href}>
          <ArrowLeft className="h-4 w-4 shrink-0 text-sidebar-foreground/40" />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export default function SidebarNav() {
  const pathname = usePathname();
  const { user, bootstrapData, hasPermission } = useAuth();
  const isAdmin = hasPermission('org.manage_members');
  const isTeamLead = (bootstrapData?.departments || []).some((d: any) => d?.is_lead);
  const isOps = pathname?.startsWith('/ops');
  const isSettings = pathname?.startsWith('/settings');

  // Get page permissions from bootstrap data
  const permissions = bootstrapData?.permissions || {};
  const canUpload = permissions['pages.upload'] !== false;
  const canViewDocuments = permissions['pages.documents'] !== false;
  const canViewActivity = permissions['pages.activity'] !== false;
  const canViewQueue = permissions['pages.queue'] === true ||
    (permissions['pages.queue'] === undefined && canUpload);
  const canViewRecycleBin = permissions['pages.recycle_bin'] === true;
  const canChat = permissions['pages.chat'] !== false;
  const canManageOrgMembers = permissions['org.manage_members'] === true;
  const canManageTeamMembers = permissions['departments.manage_members'] === true;
  const canReadDocuments = permissions['documents.read'] === true;
  const canShareDocuments = permissions['documents.share'] === true || canManageOrgMembers;

  const [queueCount, setQueueCount] = useState(0);
  const [recycleCount, setRecycleCount] = useState(0);

  useEffect(() => {
    const fetchCounts = async () => {
      if (!user) return;
      const { orgId } = getApiContext();
      if (!orgId) return;

      try {
        if (canViewQueue) {
          const queueRes = await apiFetch<any>(`/orgs/${orgId}/ingestion-jobs?limit=1`);
          if (queueRes && queueRes.statusCounts) {
            const counts = queueRes.statusCounts;
            const count = (counts.pending || 0) + (counts.processing || 0) + (counts.needs_review || 0);
            setQueueCount(count);
          }
        }

        if (canViewRecycleBin) {
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
        }
      } catch (e) {
        console.error('Failed to fetch sidebar counts', e);
      }
    };

    fetchCounts();

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
  }, [user, pathname, canViewQueue, canViewRecycleBin]);

  // Settings sidebar
  if (isSettings) {
    const { approvalsUsable } = getOrgFeatures(bootstrapData?.orgSettings);
    const visibleAccountLinks = settingsAccountLinks.filter((item) => {
      if (item.href === '/settings/shared-links' && !canShareDocuments) return false;
      return true;
    });
    // Filter org settings links based on permissions
    const visibleOrgLinks = settingsOrgLinks.filter(item => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.permission === 'org.manage_members' && !canManageOrgMembers) return false;
      if (item.permission === 'org.update_settings' && permissions['org.update_settings'] !== true) return false;
      if (item.href === '/settings/approval-templates' && !approvalsUsable) return false;
      // Teams: visible to admins, team leads, or those with team member management permission
      if (item.href === '/settings/teams' && !(isAdmin || isTeamLead || canManageTeamMembers)) return false;
      return true;
    });

    return (
      <SidebarMenu className="px-2 py-1">
        {/* Back to main app */}
        <BackNavItem href="/dashboard" label="Back to app" />

        <div className="my-2 h-px bg-sidebar-border/30 group-data-[collapsible=icon]:mx-1" />

        {/* My Account Section */}
        <SectionLabel>My Account</SectionLabel>
        {visibleAccountLinks.map(({ href, label, Icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            isActive={pathname === href}
          />
        ))}

        {/* Organization Section */}
        {visibleOrgLinks.length > 0 && (
          <>
            <div className="my-2 h-px bg-sidebar-border/30 group-data-[collapsible=icon]:mx-1" />
            <SectionLabel>Organization</SectionLabel>
            {visibleOrgLinks.map(({ href, label, Icon }) => (
              <NavItem
                key={href}
                href={href}
                label={label}
                Icon={Icon}
                isActive={pathname === href}
              />
            ))}
          </>
        )}
      </SidebarMenu>
    );
  }

  // Ops sidebar
  if (isOps) {
    const opsLinks = [
      { href: '/ops', label: 'Ops Overview', Icon: LayoutDashboard },
      { href: '/ops/orgs', label: 'Organizations', Icon: Folder },
      { href: '/ops/new', label: 'Create Org', Icon: PlusSquare },
    ];
    return (
      <SidebarMenu className="p-2">
        <SectionLabel>Ops</SectionLabel>
        {opsLinks.map(({ href, label, Icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            isActive={pathname === href}
          />
        ))}
      </SidebarMenu>
    );
  }

  // Filter main links based on permissions
  const visibleMainLinks = mainLinks.filter(({ href }) => {
    const { editorEnabled, approvalsUsable } = getOrgFeatures(bootstrapData?.orgSettings);
    if (href === '/documents/upload' && !canUpload) return false;
    if (href === '/documents' && !canViewDocuments) return false;
    if (href === '/editor' && (!canReadDocuments || !editorEnabled)) return false;
    if (href === '/approvals' && (!canReadDocuments || !approvalsUsable)) return false;
    if (href === '/audit' && !canViewActivity) return false;
    if (href === '/queue' && !canViewQueue) return false;
    if (href === '/recycle-bin' && !canViewRecycleBin) return false;
    return true;
  });

  // Filter admin links based on permissions
  const visibleAdminLinks = adminLinks.filter(({ href }) => {
    if (href === '/recycle-bin' && !canViewRecycleBin) return false;
    if (href === '/chat' && !canChat) return false;
    return true;
  });

  const showAdminSection = isAdmin && visibleAdminLinks.length > 0;

  return (
    <SidebarMenu className="px-2 py-1">
      {visibleMainLinks.map(({ href, label, Icon }) => {
        let badgeCount = 0;
        if (href === '/queue') badgeCount = queueCount;
        if (href === '/recycle-bin') badgeCount = recycleCount;

        return (
          <NavItem
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            isActive={pathname === href}
            badgeCount={badgeCount}
          />
        );
      })}

      {showAdminSection && (
        <>
          <div className="my-2 h-px bg-sidebar-border/30 group-data-[collapsible=icon]:mx-1" />
          <SectionLabel>Admin</SectionLabel>
          {visibleAdminLinks.map(({ href, label, Icon }) => {
            let badgeCount = 0;
            if (href === '/recycle-bin') badgeCount = recycleCount;

            return (
              <NavItem
                key={href}
                href={href}
                label={label}
                Icon={Icon}
                isActive={pathname === href}
                badgeCount={badgeCount}
              />
            );
          })}
        </>
      )}
    </SidebarMenu>
  );
}
