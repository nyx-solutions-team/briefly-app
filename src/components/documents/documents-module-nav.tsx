"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderOpen, Home, CloudUpload, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/documents/home', label: 'Home', Icon: Home },
  { href: '/documents', label: 'Library', Icon: FolderOpen },
  { href: '/documents/upload', label: 'Upload', Icon: CloudUpload },
  { href: '/approvals', label: 'Reviews', Icon: CheckSquare },
];

export function DocumentsModuleNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map(({ href, label, Icon }) => {
        const isLibrary = href === '/documents';
        const isActive = isLibrary
          ? pathname === '/documents' || (pathname?.startsWith('/documents/') && !pathname.startsWith('/documents/home') && !pathname.startsWith('/documents/upload'))
          : pathname === href;

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
              isActive
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border/60 bg-background text-muted-foreground hover:border-primary/20 hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
