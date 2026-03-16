"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckSquare, FileText, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/editor/home', label: 'Home', Icon: Home },
  { href: '/editor', label: 'Library', Icon: FileText },
  { href: '/approvals', label: 'Reviews', Icon: CheckSquare },
];

export function StudioModuleNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center p-0.5 bg-muted/30 border border-border/40 rounded-lg shrink-0">
      {links.map(({ href, label }) => {
        const isLibrary = href === '/editor';
        const isActive = isLibrary ? pathname === '/editor' : pathname === href;

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
