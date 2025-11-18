import type { ComponentType } from 'react';
import {
  LayoutDashboard,
  HardDrive,
  Workflow,
  FolderKanban,
  FolderArchive,
  AlertTriangle,
  ShieldCheck,
  PlusSquare,
} from 'lucide-react';

export type OpsNavItem = { href: string; label: string; Icon: ComponentType<{ className?: string }> };
export type OpsNavSection = { title: string; items: OpsNavItem[] };

export const OPS_NAV_SECTIONS: OpsNavSection[] = [
  {
    title: 'Overview',
    items: [{ href: '/ops', label: 'Dashboard', Icon: LayoutDashboard }],
  },
  {
    title: 'Operations',
    items: [
      { href: '/ops/storage', label: 'Storage', Icon: HardDrive },
      { href: '/ops/ingestion', label: 'Ingestion', Icon: Workflow },
      { href: '/ops/orgs', label: 'Organizations', Icon: FolderKanban },
      { href: '/ops/orphan-files', label: 'Orphaned Files', Icon: FolderArchive },
      { href: '/ops/incidents', label: 'Incidents', Icon: AlertTriangle },
    ],
  },
  {
    title: 'Security',
    items: [
      { href: '/ops/security', label: 'Security Center', Icon: ShieldCheck },
      { href: '/ops/new', label: 'Create Org', Icon: PlusSquare },
    ],
  },
];
