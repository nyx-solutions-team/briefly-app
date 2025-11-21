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
  LifeBuoy,
  LogOut,
  Moon,
  MoreHorizontal,
  Settings,
  Sun,
  User,
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState('light');
  const { documents } = useDocuments();
  const { isAuthenticated, user, signOut, isLoading } = useAuth();
  const { settings, updateSettings } = useSettings();
  const router = (typeof window !== 'undefined') ? require('next/navigation').useRouter() : null;

  React.useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setTheme(isDarkMode ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    // Persist via user settings; SettingsProvider will apply to DOM
    void updateSettings({ dark_mode: newTheme === 'dark' });
  };

  // Keep local theme state in sync with applied settings
  React.useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, [settings.dark_mode]);

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
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon" className="sidebar-premium">
        <SidebarHeader>
          <div className="flex w-full items-center justify-between p-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <img src="/favicon.ico" alt="Briefly" className="h-8 w-8" />
              <Link href="/dashboard" className="text-xl font-semibold hover:underline group-data-[collapsible=icon]:hidden transition-colors hover:text-primary/80">Briefly</Link>
            </div>
            <SidebarTrigger className="hidden md:flex hover-premium" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarNav />
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                    <Avatar className="size-8 ring-2 ring-sidebar-border">
                      <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="person" />
                      <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground font-semibold">
                        {user?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{user?.username || user?.email?.split('@')[0] || 'User'}</span>
                      <span className="truncate text-xs text-muted-foreground">{user?.email || ''}</span>
                    </div>
                    <MoreHorizontal className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="mb-2 w-64" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.username || user?.email?.split('@')[0] || 'User'}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                    {theme === 'light' ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                    <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => { signOut(); if (typeof window !== 'undefined') { window.location.href = '/signin'; } }}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="pb-20 md:pb-0">{children}</SidebarInset>
      <MobileTabBar />
    </SidebarProvider>
  );
}
