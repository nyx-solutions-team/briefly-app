"use client";

import * as React from "react";
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";
import OpsAdminSidebar from "@/components/ops-admin-sidebar";

export default function OpsAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <OpsAdminSidebar />
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
