"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Home, Building2, LogOut } from "lucide-react";

const navItems = [
  { href: "/ops-admin", label: "Home", Icon: Home },
  { href: "/ops-admin/orgs", label: "Organizations", Icon: Building2 },
];

export default function OpsAdminSidebar() {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = () => {
    signOut();
    router.push("/signin");
  };

  return (
    <Sidebar variant="inset" collapsible="icon" className="sidebar-premium">
      <SidebarHeader>
        <div className="flex w-full items-center gap-2 p-3 border-b border-border/50">
          <img src="/favicon.ico" alt="Briefly" className="h-8 w-8" />
          <span className="text-lg font-semibold group-data-[collapsible=icon]:hidden">Ops Admin</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map(({ href, label, Icon }) => (
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
      </SidebarContent>
      <SidebarFooter>
        <div className="w-full p-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 hover-premium"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
