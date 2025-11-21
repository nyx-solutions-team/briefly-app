"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Folder,
  CloudUpload,
  MessageSquare,
  MoreHorizontal,
  Activity,
  ListChecks,
  Trash2,
  Wrench,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth, type Role } from "@/hooks/use-auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type NavLink = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  roles?: Role[];
};

const BASE_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Home", Icon: LayoutDashboard },
  { href: "/documents", label: "Docs", Icon: Folder, permission: "pages.documents" },
  { href: "/documents/upload", label: "Upload", Icon: CloudUpload, permission: "pages.upload" },
  { href: "/chat", label: "Chat", Icon: MessageSquare, permission: "pages.chat" },
];

const MORE_LINKS: NavLink[] = [
  { href: "/audit", label: "Activity", Icon: Activity, permission: "pages.activity" },
  { href: "/queue", label: "Queue", Icon: ListChecks, permission: "pages.queue" },
  { href: "/recycle-bin", label: "Recycle Bin", Icon: Trash2, permission: "pages.recycle_bin", roles: ["systemAdmin", "teamLead"] },
  { href: "/ops", label: "Ops", Icon: Wrench, roles: ["systemAdmin"] },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function useFilteredLinks(links: NavLink[]) {
  const { user, bootstrapData } = useAuth();
  const permissions = bootstrapData?.permissions || {};

  return useMemo(() => {
    return links.filter(({ permission, roles }) => {
      if (permission && permissions[permission] === false) {
        return false;
      }
      if (permission === "pages.recycle_bin" && permissions[permission] !== true) {
        return false; // recycle bin opt-in
      }
      if (roles && !roles.includes(user?.role ?? "member")) {
        return false;
      }
      return true;
    });
  }, [links, permissions, user?.role]);
}

export function MobileTabBar() {
  const pathname = usePathname();
  const primaryLinks = useFilteredLinks(BASE_LINKS).slice(0, 4);
  const moreLinks = useFilteredLinks(MORE_LINKS).filter((link) => link.href !== "/ops");
  const [moreOpen, setMoreOpen] = useState(false);

  if (primaryLinks.length === 0 && moreLinks.length === 0) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/95 px-1 py-1.5 shadow-[0_-6px_30px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
        <nav className="grid h-14 grid-cols-5 gap-1">
          {primaryLinks.map(({ href, label, Icon }) => {
            const isActive =
              pathname === href ||
              (href !== "/dashboard" && pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center rounded-2xl text-[11px] font-medium transition-all",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    isActive
                      ? "text-primary drop-shadow-[0_3px_8px_rgba(59,130,246,0.45)]"
                      : ""
                  )}
                />
                <span className="mt-0.5">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center rounded-2xl text-[11px] font-medium text-muted-foreground transition-all hover:text-foreground"
            aria-label="More options"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="mt-0.5">More</span>
          </button>
        </nav>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden rounded-t-[32px] border-none px-0 pb-12 pt-6 shadow-2xl"
        >
          <SheetHeader className="px-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted" />
            <SheetTitle className="text-center text-base font-semibold">
              Quick actions
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto px-6 pb-4">
            {moreLinks.map(({ href, label, Icon }) => {
              const isActive =
                pathname === href || pathname?.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-muted/30 px-4 py-3 text-sm font-medium transition hover:border-primary/40 hover:bg-primary/5",
                    isActive && "border-primary/60 bg-primary/5 text-primary"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Link>
              );
            })}
            {moreLinks.length === 0 && (
              <div className="col-span-2 rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing extra to show yet.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

