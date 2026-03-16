"use client";

import Link from 'next/link';
import * as React from 'react';
import { BarChart3, RefreshCw, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OpsMetricCard, OpsPageHeader, OpsPill, OpsSurface } from '@/components/ops/ops-primitives';
import {
  getOpsUsageOverview,
  type OpsUsageOverview,
} from '@/lib/ops-api';
import { formatBytes } from '@/lib/utils';

export default function OpsUsagePage() {
  const [usage, setUsage] = React.useState<OpsUsageOverview | null>(null);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const usageResponse = await getOpsUsageOverview();
      setUsage(usageResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load usage');
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return usage?.rows || [];
    return (usage?.rows || []).filter((row) => {
      return (
        row.name.toLowerCase().includes(needle) ||
        row.orgId.toLowerCase().includes(needle) ||
        String(row.planKey || '').toLowerCase().includes(needle)
      );
    });
  }, [search, usage?.rows]);

  const visibleTotals = React.useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.membersTotal += row.membersTotal;
        acc.membersActive += row.membersActive;
        acc.uploads30 += row.uploads30;
        if (row.featureFlags.editorEnabled) acc.editorEnabled += 1;
        if (row.featureFlags.workflowsEnabled) acc.workflowsEnabled += 1;
        return acc;
      },
      {
        membersTotal: 0,
        membersActive: 0,
        uploads30: 0,
        editorEnabled: 0,
        workflowsEnabled: 0,
      }
    );
  }, [rows]);

  const fastestGrowing = React.useMemo(() => {
    return [...rows].sort((a, b) => b.uploads30 - a.uploads30).slice(0, 5);
  }, [rows]);

  return (
    <div className="space-y-6">
      <OpsPageHeader
        eyebrow="Phase 2"
        title="Usage"
        description="This is the new cross-client usage lens: member footprint, recent upload activity, and feature adoption without leaving the ops console."
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load usage</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OpsMetricCard
          label="Active Members"
          value={loading ? '...' : visibleTotals.membersActive}
          hint={`${visibleTotals.membersTotal} total memberships across visible orgs`}
        />
        <OpsMetricCard
          label="Uploads 30d"
          value={loading ? '...' : visibleTotals.uploads30}
          hint="Recent document creation activity"
        />
        <OpsMetricCard
          label="Editor Enabled"
          value={loading ? '...' : visibleTotals.editorEnabled}
          hint="Organizations with controlled docs enabled"
          tone={visibleTotals.editorEnabled > 0 ? 'success' : 'default'}
        />
        <OpsMetricCard
          label="Workflows Enabled"
          value={loading ? '...' : visibleTotals.workflowsEnabled}
          hint="Organizations using workflow capability"
          tone={visibleTotals.workflowsEnabled > 0 ? 'success' : 'default'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <OpsSurface title="Usage Index" description="Search across clients and compare membership, documents, recent upload activity, and feature adoption.">
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search org name, id, or plan"
                className="pl-9"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Showing {rows.length} organizations
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Uploads</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={7}>
                        <div className="h-12 animate-pulse rounded-xl bg-muted/50" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      No organizations matched the current usage filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.orgId}>
                      <TableCell className="min-w-[220px]">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{row.name}</p>
                          <p className="text-xs text-muted-foreground">{row.orgId}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <p>{row.membersActive} active</p>
                        <p>{row.membersTotal} total</p>
                        <p>{row.expiring30} expiring in 30d</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <p>{row.documents.toLocaleString()} docs</p>
                        <p>{row.teams} teams</p>
                        <p>{row.planKey || 'Custom plan'}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <p>{row.uploads7} in 7d</p>
                        <p>{row.uploads30} in 30d</p>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="flex flex-wrap gap-2">
                          <OpsPill tone={row.featureFlags.editorEnabled ? 'success' : 'neutral'}>
                            Editor
                          </OpsPill>
                          <OpsPill tone={row.featureFlags.approvalsEnabled ? 'success' : 'neutral'}>
                            Approvals
                          </OpsPill>
                          <OpsPill tone={row.featureFlags.workflowsEnabled ? 'success' : 'neutral'}>
                            Workflows
                          </OpsPill>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[200px]">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-foreground">
                              {formatBytes(row.storageBytes)}
                            </span>
                            <span className="text-muted-foreground">
                              {row.usagePercent !== null ? `${row.usagePercent.toFixed(1)}%` : 'No limit'}
                            </span>
                          </div>
                          <Progress value={Math.min(100, row.usagePercent || 0)} className="h-2" />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/ops/orgs/${row.orgId}`}>
                            <BarChart3 className="mr-2 h-4 w-4" />
                            Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </OpsSurface>

        <OpsSurface title="Growth Signals" description="A compact ranking of which clients are generating the most recent usage momentum.">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          ) : fastestGrowing.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
              No recent usage signals were returned.
            </div>
          ) : (
            <div className="space-y-3">
              {fastestGrowing.map((row) => (
                <div
                  key={row.orgId}
                  className="rounded-2xl border border-border/50 bg-background/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.uploads30} uploads in 30d, {row.membersActive} active members
                      </p>
                    </div>
                    <OpsPill tone={row.uploads30 > 0 ? 'success' : 'neutral'}>
                      {row.uploads30} uploads
                    </OpsPill>
                  </div>
                </div>
              ))}
            </div>
          )}
        </OpsSurface>
      </div>
    </div>
  );
}
