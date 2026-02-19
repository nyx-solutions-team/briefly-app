"use client";

import * as React from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import SidebarNav from '@/components/sidebar-nav';
import { useDocuments } from '@/hooks/use-documents';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import {
  ChevronDown,
  LogOut,
  Moon,
  Settings,
  Sun,
  ChevronsUpDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';
import { useSettings } from '@/hooks/use-settings';
import { MobileTabBar } from '@/components/mobile-tab-bar';
import { cn } from '@/lib/utils';

export default function AppLayout({ children, collapseSidebar = false, flush = false }: { children: React.ReactNode; collapseSidebar?: boolean; flush?: boolean }) {
  const { documents } = useDocuments();
  const { isAuthenticated, user, signOut, isLoading } = useAuth();
  const { settings, updateSettings } = useSettings();
  const router = (typeof window !== 'undefined') ? require('next/navigation').useRouter() : null;

  // Derive theme directly from settings instead of maintaining separate state
  const theme = settings.dark_mode ? 'dark' : 'light';

  const toggleTheme = () => {
    const newDarkMode = !settings.dark_mode;
    void updateSettings({ dark_mode: newDarkMode });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-6 w-40" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={!collapseSidebar} open={collapseSidebar ? false : undefined}>
      <Sidebar variant="inset" collapsible="icon" className="border-r-0">
        {/* Linear-style Header - Workspace/Logo */}
        <SidebarHeader className="p-0">
          <div className="flex items-center gap-2 px-3 py-3 border-b border-sidebar-border/30 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 group-data-[collapsible=icon]:mb-1">
              <img src="/favicon.ico" alt="Briefly" className="h-4 w-4" />
            </div>
            <Link
              href="/dashboard"
              className="text-sm font-semibold text-sidebar-foreground hover:text-sidebar-foreground/80 transition-colors group-data-[collapsible=icon]:hidden"
            >
              Briefly
            </Link>
            <SidebarTrigger className="ml-auto h-6 w-6 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:ml-auto" />
          </div>
        </SidebarHeader>

        <SidebarContent className="py-2">
          <SidebarNav />
        </SidebarContent>

        {/* Linear-style Footer - User menu */}
        <SidebarFooter className="p-2 border-t border-sidebar-border/30">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    tooltip={user?.username || user?.email?.split('@')[0] || 'User'}
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground transition-all duration-200"
                  >
                    <Avatar className="h-8 w-8 rounded-md">
                      <AvatarImage src="" />
                      <AvatarFallback className="rounded-md bg-primary/10 text-primary text-xs font-semibold">
                        {user?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                      <div className="text-[13px] font-medium text-sidebar-foreground truncate">
                        {user?.username || user?.email?.split('@')[0] || 'User'}
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 truncate font-normal leading-tight">{user?.email}</p>
                    </div>
                    <ChevronsUpDown className="h-3.5 w-3.5 text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-60 p-1.5 bg-popover border-sidebar-border/50 shadow-xl" align="start" side="top" sideOffset={4}>
                  <DropdownMenuLabel className="px-2 py-2">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[13px] font-semibold text-foreground/90 leading-tight truncate">{user?.username || user?.email?.split('@')[0] || 'User'}</p>
                      <p className="text-[11px] text-muted-foreground/60 truncate font-normal leading-tight">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="mx-1 my-1 bg-sidebar-border/30" />
                  <DropdownMenuItem asChild className="rounded-md px-2 py-1.5 focus:bg-sidebar-accent/50 focus:text-sidebar-accent-foreground cursor-pointer transition-colors">
                    <Link href="/settings" className="flex items-center gap-2.5 w-full">
                      <Settings className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <span className="text-[13px] font-medium">Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={toggleTheme}
                    className="rounded-md px-2 py-1.5 focus:bg-sidebar-accent/50 focus:text-sidebar-accent-foreground cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5 w-full">
                      {theme === 'light' ? <Moon className="h-3.5 w-3.5 text-muted-foreground/50" /> : <Sun className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      <span className="text-[13px] font-medium">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="mx-1 my-1 bg-sidebar-border/30" />
                  <DropdownMenuItem
                    onClick={() => { signOut(); if (typeof window !== 'undefined') { window.location.href = '/signin'; } }}
                    className="rounded-md px-2 py-1.5 focus:bg-destructive/10 focus:text-destructive cursor-pointer transition-colors text-destructive"
                  >
                    <div className="flex items-center gap-2.5 w-full">
                      <LogOut className="h-3.5 w-3.5" />
                      <span className="text-[13px] font-medium">Sign out</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className={cn("pb-20 md:pb-0", flush && "m-0 ml-0 md:m-0 md:ml-0 rounded-none shadow-none h-svh overflow-hidden min-h-0")}>{children}</SidebarInset>
      <MobileTabBar />
    </SidebarProvider>
  );
}
