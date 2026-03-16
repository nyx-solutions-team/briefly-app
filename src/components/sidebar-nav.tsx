"use client";

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  Workflow,
  MessageSquare,
  // Settings icons
  ArrowLeft,
  User,
  Palette,
  Building2,
  Users,
  UsersRound,
  Link2,
  FileText,
  Package2,
  Lock,
  Shield,
  ShieldCheck,
  Home,
  Play,
  History,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHAT_HISTORY_REFRESH_EVENT, CHAT_NEW_SESSION_EVENT } from '@/lib/chat-events';

import { useAuth } from '@/hooks/use-auth';
import { listRecentChatHistorySessions, patchChatHistorySession, type ChatHistorySession } from '@/lib/chat-history';
import { getOrgFeatures } from '@/lib/org-features';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavCounts } from '@/hooks/use-nav-counts';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  useSidebar,
} from './ui/sidebar';
import { Input } from './ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

// Main navigation links (visible to all based on permissions)
const mainLinks = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/documents', label: 'Folders', Icon: Folder },
  { href: '/documents/upload', label: 'Upload Document', Icon: CloudUpload },
  { href: '/queue', label: 'Queue', Icon: ListChecks },
  { href: '/audit', label: 'Activity', Icon: Activity },
  { href: '/recycle-bin', label: 'Recycle Bin', Icon: Trash2 },
];

// Org feature/workspace links
const workspaceLinks = [
  { href: '/editor/home', label: 'Document Studio', Icon: FileText, permission: 'documents.read' },
  { href: '/workflows', label: 'Workflows', Icon: Workflow, permission: 'documents.read' },
  { href: '/chatnew', label: 'Chat', Icon: MessageSquare },
  { href: '/chat-workbench', label: 'Workbench', Icon: Wrench },
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
  { href: '/settings/document-assets', label: 'Business Profile', Icon: Package2, permission: 'org.update_settings' },
  { href: '/settings/templates', label: 'Document Templates', Icon: FileText, permission: 'org.update_settings' },
  { href: '/settings/approval-templates', label: 'Approval Flows', Icon: ShieldCheck, permission: 'org.update_settings' },
  { href: '/settings/permissions', label: 'Permissions', Icon: Lock, adminOnly: true },
  { href: '/settings/security', label: 'Security', Icon: Shield, adminOnly: true },
];

const workflowLinks = [
  { href: '/workflows', label: 'Home', Icon: Home },
  { href: '/workflows/my-workflows', label: 'Workflows', Icon: LayoutGrid },
  { href: '/workflows/templates', label: 'Templates', Icon: FileText },
  { href: '/workflows/run', label: 'Run', Icon: Play },
  { href: '/workflows/history', label: 'History', Icon: History },
  { href: '/workflows/builder', label: 'Builder', Icon: List },
];

const PREFETCH_DISABLED_PREFIXES = ['/audit', '/queue', '/recycle-bin', '/workflows', '/chatnew', '/chat-workbench', '/ops'];

function shouldPrefetchLink(href: string) {
  return !PREFETCH_DISABLED_PREFIXES.some(
    (prefix) => href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`)
  );
}

// Linear-style nav item component
function NavItem({
  href,
  label,
  Icon,
  isActive,
  badgeCount,
  onClick,
}: {
  href: string;
  label: string;
  Icon: any;
  isActive: boolean;
  badgeCount?: number;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
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
        <Link href={href} prefetch={shouldPrefetchLink(href)} className="relative" onClick={onClick}>
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

function getChatSessionDisplayTitle(session: ChatHistorySession) {
  const title = String(session.title || '').trim();
  if (title) return title;
  const preview = String(session.last_message_preview || '').trim();
  if (preview) return preview.slice(0, 80);
  return 'Untitled chat';
}

function getChatSessionSortDate(session: ChatHistorySession): Date {
  const value = session.last_active_at || session.updated_at || session.created_at;
  const dt = value ? new Date(value) : new Date();
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

function groupChatSessionsByDate(sessions: ChatHistorySession[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  const groups: Array<{ label: string; items: ChatHistorySession[] }> = [];
  const pushToGroup = (label: string, session: ChatHistorySession) => {
    const group = groups.find((g) => g.label === label);
    if (group) group.items.push(session);
    else groups.push({ label, items: [session] });
  };
  for (const session of sessions) {
    const dt = getChatSessionSortDate(session);
    const dayStart = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
    const diffDays = Math.floor((today - dayStart) / oneDay);
    if (diffDays <= 0) pushToGroup('Today', session);
    else if (diffDays === 1) pushToGroup('Yesterday', session);
    else if (diffDays < 7) pushToGroup('Previous 7 Days', session);
    else if (diffDays < 30) pushToGroup('Previous 30 Days', session);
    else pushToGroup('Older', session);
  }
  return groups;
}

function ChatHistorySidebar({ pathname }: { pathname: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const [sessions, setSessions] = useState<ChatHistorySession[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWorkbenchRoute = Boolean(pathname?.startsWith('/chat-workbench'));
  const routeBase = isWorkbenchRoute ? '/chat-workbench' : '/chatnew';
  const surface = isWorkbenchRoute ? 'chat_workbench' : 'chatnew';
  const activeSessionId = (pathname?.startsWith('/chatnew') || isWorkbenchRoute)
    ? (searchParams?.get('session') || null)
    : null;
  const isNewChatActive = pathname === routeBase && !activeSessionId;

  const groupedSessions = useMemo(() => groupChatSessionsByDate(sessions), [sessions]);
  const [mutatingSessionId, setMutatingSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitleDraft, setEditingTitleDraft] = useState('');

  const loadSessions = useCallback(async (opts?: { cursor?: string | null; append?: boolean }) => {
    const append = Boolean(opts?.append);
    const cursor = opts?.cursor || null;
    if (append) setLoadingMore(true);
    else setLoadingInitial(true);
    if (!append) setError(null);
    try {
      const res = await listRecentChatHistorySessions(30, { cursor, surface });
      const incoming = Array.isArray(res?.sessions) ? res.sessions : [];
      setNextCursor(res?.page?.next_cursor || null);
      setSessions((prev) => {
        const merged = append ? [...prev, ...incoming] : [...incoming];
        const seen = new Set<string>();
        const deduped: ChatHistorySession[] = [];
        for (const item of merged) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          deduped.push(item);
        }
        return deduped;
      });
    } catch (e: any) {
      console.error('Failed to load chat history sidebar sessions', e);
      setError(e?.message || 'Failed to load chats');
    } finally {
      setLoadingInitial(false);
      setLoadingMore(false);
    }
  }, [surface]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadSessions({ append: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSessions, pathname]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      void loadSessions({ append: false });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadSessions]);

  const beginRenameSession = useCallback((session: ChatHistorySession) => {
    setEditingSessionId(session.id);
    setEditingTitleDraft(getChatSessionDisplayTitle(session));
  }, []);

  const cancelRenameSession = useCallback(() => {
    setEditingSessionId(null);
    setEditingTitleDraft('');
  }, []);

  const commitRenameSession = useCallback(async (session: ChatHistorySession) => {
    const currentTitle = getChatSessionDisplayTitle(session);
    const nextTitle = editingTitleDraft.trim();
    if (!nextTitle || nextTitle === currentTitle) {
      cancelRenameSession();
      return;
    }
    setMutatingSessionId(session.id);
    try {
      const res = await patchChatHistorySession(session.id, { title: nextTitle });
      const updated = res?.session;
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, ...(updated || {}), title: nextTitle } : s)));
      cancelRenameSession();
    } catch (e: any) {
      console.error('Failed to rename chat session', e);
      window.alert(e?.message || 'Failed to rename chat');
    } finally {
      setMutatingSessionId((prev) => (prev === session.id ? null : prev));
    }
  }, [cancelRenameSession, editingTitleDraft]);

  const deleteSession = useCallback(async (session: ChatHistorySession) => {
    const title = getChatSessionDisplayTitle(session);
    const ok = window.confirm(`Delete chat "${title}"?`);
    if (!ok) return;
    setMutatingSessionId(session.id);
    try {
      await patchChatHistorySession(session.id, { status: 'deleted' });
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      if (activeSessionId && activeSessionId === session.id) {
        router.push(routeBase);
      }
    } catch (e: any) {
      console.error('Failed to delete chat session', e);
      window.alert(e?.message || 'Failed to delete chat');
    } finally {
      setMutatingSessionId((prev) => (prev === session.id ? null : prev));
    }
  }, [activeSessionId, routeBase, router]);

  const handleNewSessionClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();

    if (!isWorkbenchRoute && typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent(CHAT_NEW_SESSION_EVENT, {
          detail: { surface: 'chatnew' },
        }));
      } catch {
        window.dispatchEvent(new Event(CHAT_NEW_SESSION_EVENT));
      }
    }

    router.push(routeBase);
  }, [isWorkbenchRoute, routeBase, router]);

  useEffect(() => {
    const onChatHistoryRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      void loadSessions({ append: false });
    };
    window.addEventListener(CHAT_HISTORY_REFRESH_EVENT, onChatHistoryRefresh);
    return () => window.removeEventListener(CHAT_HISTORY_REFRESH_EVENT, onChatHistoryRefresh);
  }, [loadSessions]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarMenu className="px-2 py-1">
        <BackNavItem href="/dashboard" label="Back to app" />
        <div className="my-2 h-px bg-sidebar-border/30 group-data-[collapsible=icon]:mx-1" />
        <NavItem
          href={routeBase}
          label={isWorkbenchRoute ? 'New Workbench' : 'New Chat'}
          Icon={PlusSquare}
          isActive={Boolean(isNewChatActive)}
          onClick={handleNewSessionClick}
        />
      </SidebarMenu>

      {!isCollapsed && (
        <>
          <div className="my-1 h-px bg-sidebar-border/20 mx-2" />
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <SectionLabel>Recent Chats</SectionLabel>
            {loadingInitial && sessions.length === 0 ? (
              <div className="px-2 py-2 text-xs text-sidebar-foreground/50">Loading chats...</div>
            ) : error && sessions.length === 0 ? (
              <div className="px-2 py-2 text-xs text-destructive/90">{error}</div>
            ) : sessions.length === 0 ? (
              <div className="px-2 py-2 text-xs text-sidebar-foreground/50">No chats yet</div>
            ) : (
              <SidebarMenu className="gap-1 p-0">
                {groupedSessions.map((group) => (
                  <div key={group.label} className="mb-2">
                    <SectionLabel>{group.label}</SectionLabel>
                    {group.items.map((session) => {
                      const title = getChatSessionDisplayTitle(session);
                      const isActive = Boolean(activeSessionId && activeSessionId === session.id);
                      const isMutating = mutatingSessionId === session.id;
                      const isEditing = editingSessionId === session.id;
                      return (
                        <SidebarMenuItem key={session.id}>
                          <div className="group/chat-row relative">
                            {isEditing ? (
                              <div
                                className={cn(
                                  "flex h-9 items-center gap-1 rounded-md border px-1.5",
                                  isActive
                                    ? "border-sidebar-accent bg-sidebar-accent/40"
                                    : "border-sidebar-border/40 bg-sidebar-background/50"
                                )}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                <Input
                                  autoFocus
                                  value={editingTitleDraft}
                                  disabled={isMutating}
                                  onChange={(e) => setEditingTitleDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      void commitRenameSession(session);
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      cancelRenameSession();
                                    }
                                  }}
                                  className="h-7 border-0 bg-transparent px-1 text-[12.5px] font-medium shadow-none focus-visible:ring-0"
                                />
                                <button
                                  type="button"
                                  aria-label="Save chat title"
                                  disabled={isMutating}
                                  className="rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void commitRenameSession(session);
                                  }}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Cancel rename"
                                  disabled={isMutating}
                                  className="rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    cancelRenameSession();
                                  }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <SidebarMenuButton
                                  asChild
                                  tooltip={title}
                                  isActive={isActive}
                                  className={cn(
                                    "h-9 text-left pr-9",
                                    isActive
                                      ? "bg-sidebar-accent/60 text-sidebar-accent-foreground"
                                      : "text-sidebar-foreground/75"
                                  )}
                                >
                                  <Link href={`${routeBase}?session=${encodeURIComponent(session.id)}`} prefetch={false}>
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-[12.5px] font-medium leading-4">
                                        {title}
                                      </div>
                                    </div>
                                  </Link>
                                </SidebarMenuButton>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      aria-label={`More options for ${title}`}
                                      disabled={isMutating}
                                      className={cn(
                                        "absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-md p-1.5",
                                        "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                                        "opacity-0 transition-opacity group-hover/chat-row:opacity-100 group-focus-within/chat-row:opacity-100",
                                        "focus-visible:opacity-100",
                                        isMutating && "cursor-not-allowed opacity-100"
                                      )}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    side="right"
                                    className="w-40"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.preventDefault();
                                        beginRenameSession(session);
                                      }}
                                      disabled={isMutating}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.preventDefault();
                                        void deleteSession(session);
                                      }}
                                      disabled={isMutating}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            )}
                          </div>
                        </SidebarMenuItem>
                      );
                    })}
                  </div>
                ))}

                {nextCursor && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => {
                        if (loadingMore) return;
                        void loadSessions({ append: true, cursor: nextCursor });
                      }}
                      className="h-9 justify-center text-sidebar-foreground/70"
                    >
                      <span>{loadingMore ? 'Loading...' : 'Load more chats'}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function SidebarNav() {
  const pathname = usePathname();
  const { user, bootstrapData, hasPermission } = useAuth();
  const isAdmin = hasPermission('org.manage_members');
  const isTeamLead = (bootstrapData?.departments || []).some((d: any) => d?.is_lead);
  const isOps = pathname?.startsWith('/ops');
  const isSettings = pathname?.startsWith('/settings');
  const isWorkflows = pathname?.startsWith('/workflows');
  const chatWorkbenchEnabled = bootstrapData?.labs?.chat_workbench === true;
  const isChat = pathname?.startsWith('/chatnew') || pathname?.startsWith('/chat-workbench') || pathname?.startsWith('/chat');

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

  const isMobile = useIsMobile();
  const { queueCount, recycleCount } = useNavCounts({
    enabled: Boolean(user) && !isMobile && !isSettings && !isOps && !isWorkflows && !isChat,
    canViewQueue,
    canViewRecycleBin,
  });

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
      { href: '/ops/orgs', label: 'Organizations', Icon: Folder },
      { href: '/ops/orgs/new', label: 'Create Org', Icon: PlusSquare },
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

  if (isChat) {
    return <ChatHistorySidebar pathname={pathname} />;
  }

  if (isWorkflows) {
    return (
      <SidebarMenu className="px-2 py-1">
        <BackNavItem href="/dashboard" label="Back to app" />
        <div className="my-2 h-px bg-sidebar-border/30 group-data-[collapsible=icon]:mx-1" />
        <SectionLabel>Workflows</SectionLabel>
        {workflowLinks.map(({ href, label, Icon }) => (
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
    if (href === '/documents/upload' && !canUpload) return false;
    if (href === '/documents' && !canViewDocuments) return false;
    if (href === '/audit' && !canViewActivity) return false;
    if (href === '/queue' && !canViewQueue) return false;
    if (href === '/recycle-bin' && !canViewRecycleBin) return false;
    return true;
  });

  const canAccessWorkflows = isAdmin || isTeamLead;
  const visibleWorkspaceLinks = workspaceLinks.filter(({ href }) => {
    const { editorEnabled, workflowsEnabled, approvalsUsable } = getOrgFeatures(bootstrapData?.orgSettings);
    if (href === '/editor/home' && (!canReadDocuments || !editorEnabled)) return false;
    if (href === '/workflows' && (!canReadDocuments || !workflowsEnabled || !canAccessWorkflows)) return false;
    if (href === '/recycle-bin' && !canViewRecycleBin) return false;
    if (href === '/chatnew' && !canChat) return false;
    if (href === '/chat-workbench' && (!canChat || !chatWorkbenchEnabled)) return false;
    return true;
  });

  const showWorkspaceSection = visibleWorkspaceLinks.length > 0;

  return (
    <SidebarMenu className="px-2 py-1">
      {visibleMainLinks.map(({ href, label, Icon }) => {
        let badgeCount = 0;
        if (href === '/queue') badgeCount = queueCount;
        if (href === '/recycle-bin') badgeCount = recycleCount;
        const isActive =
          href === '/workflows'
            ? (pathname === '/workflows' || pathname === '/workflows/builder')
            : pathname === href;

        return (
          <NavItem
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            isActive={isActive}
            badgeCount={badgeCount}
          />
        );
      })}

      {showWorkspaceSection && (
        <>
          <div className="my-2 h-px bg-sidebar-border/30 group-data-[collapsible=icon]:mx-1" />
          <SectionLabel>Workspace</SectionLabel>
          {visibleWorkspaceLinks.map(({ href, label, Icon }) => {
            let badgeCount = 0;
            if (href === '/recycle-bin') badgeCount = recycleCount;
            const isActive =
              href === '/editor/home'
                ? pathname === '/editor' || pathname === '/editor/home' || pathname?.startsWith('/editor/')
                : href === '/workflows'
                  ? (pathname === '/workflows' || pathname === '/workflows/builder')
                  : pathname === href;

            return (
              <NavItem
                key={href}
                href={href}
                label={label}
                Icon={Icon}
                isActive={isActive}
                badgeCount={badgeCount}
              />
            );
          })}
        </>
      )}
    </SidebarMenu>
  );
}
