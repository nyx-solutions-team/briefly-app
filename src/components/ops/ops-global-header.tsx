"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOpsFilters } from './ops-filters-context';
import OpsOrgPicker from './ops-org-picker';
import OpsTimeRangeSelect from './ops-time-range-select';
import OpsCommandMenu from './ops-command-menu';
import { useOpsHeader } from './ops-header-context';

const RANGE_LABELS: Record<string, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
};

type OpsGlobalHeaderProps = {
  showFilters?: boolean;
};

export default function OpsGlobalHeader({ showFilters = true }: OpsGlobalHeaderProps) {
  const { orgName, timeRange } = useOpsFilters();
  const { header } = useOpsHeader();
  const [commandOpen, setCommandOpen] = useState(false);
  const scopeLabel = `${orgName || 'All orgs'} · ${RANGE_LABELS[timeRange] || 'custom range'}`;
  const title = header.title || 'Control Center';
  const subtitle =
    header.subtitle ||
    `Monitoring ${(orgName || 'All orgs').toLowerCase()} · ${RANGE_LABELS[timeRange] || 'custom range'}`;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex flex-col gap-3 px-4 py-3 md:px-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            {header.backHref ? (
              <Link
                href={header.backHref}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                {header.backLabel || 'Back'}
              </Link>
            ) : (
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Operations</p>
            )}
            <div>
              <h1 className="text-lg font-semibold leading-tight truncate">{title}</h1>
              {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {header.meta ? <div className="text-xs text-muted-foreground">{header.meta}</div> : null}
          </div>
          {header.actions ? (
            <div className="flex flex-wrap items-center gap-2">{header.actions}</div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {showFilters ? (
            <div className="flex flex-wrap items-center gap-2">
              <OpsOrgPicker />
              <OpsTimeRangeSelect />
              <span className="text-xs text-muted-foreground">Scope: {scopeLabel}</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Scope: {scopeLabel}</div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setCommandOpen(true)}>
              Command
              <kbd className="rounded bg-muted px-1 text-[10px] font-medium">⌘K</kbd>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
              aria-label="Refresh data"
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button asChild>
              <Link href="/ops/new">
                <Plus className="mr-1 h-4 w-4" />
                New org
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <OpsCommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
    </header>
  );
}
