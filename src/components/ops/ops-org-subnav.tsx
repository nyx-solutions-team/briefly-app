"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getOpsOrganization } from '@/lib/ops-api';
import { cn } from '@/lib/utils';

const ORG_NAV_ITEMS = [
  { hrefSuffix: '', label: 'Overview' },
  { hrefSuffix: '/settings', label: 'Settings' },
  { hrefSuffix: '/teams', label: 'Teams' },
  { hrefSuffix: '/members', label: 'Members' },
  { hrefSuffix: '/permissions', label: 'Permissions' },
  { hrefSuffix: '/danger', label: 'Danger Zone' },
];

export function OpsOrgSubnav({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName?: string | null;
}) {
  const pathname = usePathname();
  const [resolvedOrgName, setResolvedOrgName] = React.useState<string | null>(orgName || null);
  const [loadingName, setLoadingName] = React.useState(false);

  React.useEffect(() => {
    if (orgName && orgName.trim()) {
      setResolvedOrgName(orgName);
      setLoadingName(false);
      return;
    }

    if (!orgId) {
      setResolvedOrgName(null);
      setLoadingName(false);
      return;
    }

    let cancelled = false;
    setLoadingName(true);

    void getOpsOrganization(orgId)
      .then((detail) => {
        if (cancelled) return;
        setResolvedOrgName(detail?.orgName || null);
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedOrgName(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingName(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, orgName]);

  const displayOrgName = resolvedOrgName || (loadingName ? 'Loading organization...' : 'Organization');

  return (
    <div className="space-y-3 rounded-[28px] border border-border/45 bg-background/65 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[22px] border border-border/40 bg-background/80 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">
            Organization
          </p>
          <p className="truncate text-base font-semibold text-foreground">
            {displayOrgName}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{orgId}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ORG_NAV_ITEMS.map((item) => {
          const href = `/ops/orgs/${orgId}${item.hrefSuffix}`;
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'rounded-full border px-4 py-2 text-sm transition-colors',
                isActive
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground'
                  : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
