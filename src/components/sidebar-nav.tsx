"use client";

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Folder, CloudUpload, Activity, Trash2, Wrench, PlusSquare, ListChecks } from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarSeparator,
} from './ui/sidebar';

import { useAuth } from '@/hooks/use-auth';

const links = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/documents', label: 'Folders', Icon: Folder },
  { href: '/documents/upload', label: 'Upload Document', Icon: CloudUpload },
  { href: '/audit', label: 'Activity', Icon: Activity },
];

const adminLinks = [
  { href: '/queue', label: 'Queue', Icon: ListChecks },
  { href: '/recycle-bin', label: 'Recycle Bin', Icon: Trash2 },
  { href: '/chat', label: 'Chat Bot', Icon: Wrench },
];

export default function SidebarNav() {
  const pathname = usePathname();
  const { user, bootstrapData } = useAuth();
  const isManager = user?.role === 'systemAdmin' || user?.role === 'teamLead';
  const isAdmin = user?.role === 'systemAdmin';
  const isOps = pathname?.startsWith('/ops');
  
  // Get page permissions from bootstrap data
  const permissions = bootstrapData?.permissions || {};
  const canUpload = permissions['pages.upload'] !== false; // Default to true if not explicitly false
  const canViewDocuments = permissions['pages.documents'] !== false;
  const canViewActivity = permissions['pages.activity'] !== false;
  const canViewQueue = permissions['pages.queue'] !== false; // Default to true
  const canViewRecycleBin = permissions['pages.recycle_bin'] === true;
  const canChat = permissions['pages.chat'] !== false; // Default to true

  if (isOps) {
    const opsLinks = [
      { href: '/ops', label: 'Ops Overview', Icon: LayoutDashboard },
      { href: '/ops/orgs', label: 'Organizations', Icon: Folder },
      { href: '/ops/new', label: 'Create Org', Icon: PlusSquare },
      // Future: incidents, metrics, settings
      // { href: '/ops/incidents', label: 'Incidents', Icon: Activity },
    ];
    return (
      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-foreground/80 font-medium">Ops</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {opsLinks.map(({ href, label, Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === href}
                  tooltip={label}
                  className="hover-premium focus-premium data-[active=true]:bg-sidebar-accent data-[active=true]:shadow-sm"
                >
                  <Link href={href}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-foreground/80 font-medium">Main</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {links.slice(0, 4).filter(({ href }) => {
              // Filter links based on page permissions
              if (href === '/documents/upload' && !canUpload) return false;
              if (href === '/documents' && !canViewDocuments) return false;
              if (href === '/audit' && !canViewActivity) return false;
              return true;
            }).map(({ href, label, Icon, badge }: { href: string; label: string; Icon: any; badge?: string }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === href}
                  tooltip={label}
                  className="hover-premium focus-premium data-[active=true]:bg-sidebar-accent data-[active=true]:shadow-sm"
                >
                  <Link href={href}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
                {badge && (
                  <SidebarMenuBadge aria-hidden className="bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/30 dark:text-emerald-400 shadow-sm">
                    {badge}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {isManager && (
        <>
          <SidebarSeparator className="bg-sidebar-border/50" />
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/80 font-medium">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(isAdmin ? adminLinks : links.slice(4)).filter(({ href }) => {
                  // Team leads should not see audit
                  if (!isAdmin && href === '/audit') return false;
                  // Filter based on page permissions
                  if (href === '/queue' && !canViewQueue) return false;
                  if (href === '/recycle-bin' && !canViewRecycleBin) return false;  
                  if (href === '/chat' && !canChat) return false;
                  return true;
                }).map(({ href, label, Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === href}
                      tooltip={label}
                      className="hover-premium focus-premium data-[active=true]:bg-sidebar-accent data-[active=true]:shadow-sm"
                    >
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </>
      )}


    </>
  );
}