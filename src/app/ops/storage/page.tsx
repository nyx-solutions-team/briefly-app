"use client";

import Link from 'next/link';
import * as React from 'react';
import { DatabaseZap, RefreshCw, Save, Search } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import {
  getOpsStorageUsage,
  listOpsOrphanStorageSummary,
  recalculateOpsStorage,
  updateOpsStorageLimit,
  type OpsOrphanStorageSummary,
  type OpsStorageUsageResponse,
  type OpsStorageUsageRow,
} from '@/lib/ops-api';
import { formatBytes, formatOpsDate } from '@/lib/utils';

function getStatusTone(status: OpsStorageUsageRow['status']) {
  if (status === 'ok') return 'success' as const;
  if (status === 'warning' || status === 'grace') return 'warning' as const;
  return 'danger' as const;
}

export default function OpsStoragePage() {
  const { toast } = useToast();
  const [storage, setStorage] = React.useState<OpsStorageUsageResponse | null>(null);
  const [orphans, setOrphans] = React.useState<OpsOrphanStorageSummary | null>(null);
  const [search, setSearch] = React.useState('');
  const [limitDrafts, setLimitDrafts] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [orphansLoading, setOrphansLoading] = React.useState(false);
  const [orphansLoaded, setOrphansLoaded] = React.useState(false);
  const [recalculatingFor, setRecalculatingFor] = React.useState<string | null>(null);
  const [savingLimitFor, setSavingLimitFor] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadStorage = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const storageResponse = await getOpsStorageUsage();
      setStorage(storageResponse);
      setLimitDrafts(
        Object.fromEntries(
          (storageResponse.rows || []).map((row) => [row.orgId, String(row.storageLimitGb || 0)])
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load storage');
      setStorage(null);
      setLimitDrafts({});
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrphans = React.useCallback(async () => {
    setOrphansLoading(true);
    try {
      const orphanResponse = await listOpsOrphanStorageSummary();
      setOrphans(orphanResponse);
      setOrphansLoaded(true);
    } catch (err) {
      toast({
        title: 'Unable to load orphan summary',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setOrphansLoading(false);
    }
  }, [toast]);

  const refresh = React.useCallback(async () => {
    await loadStorage();
    if (orphansLoaded) {
      await loadOrphans();
    }
  }, [loadOrphans, loadStorage, orphansLoaded]);

  React.useEffect(() => {
    void loadStorage();
  }, [loadStorage]);

  const rows = React.useMemo(() => {
    const allRows = storage?.rows || [];
    const needle = search.trim().toLowerCase();
    if (!needle) return allRows;
    return allRows.filter((row) => {
      return (
        row.name.toLowerCase().includes(needle) ||
        row.orgId.toLowerCase().includes(needle) ||
        String(row.planKey || '').toLowerCase().includes(needle)
      );
    });
  }, [search, storage?.rows]);

  const riskCount = React.useMemo(() => {
    return rows.filter((row) => row.status !== 'ok').length;
  }, [rows]);

  const orphanTotals = React.useMemo(() => {
    return (orphans?.rows || []).reduce(
      (acc, row) => {
        acc.files += row.orphanFiles;
        acc.storageBytes += row.storageBytes;
        return acc;
      },
      { files: 0, storageBytes: 0 }
    );
  }, [orphans?.rows]);

  const topOrphans = React.useMemo(() => {
    return [...(orphans?.rows || [])]
      .filter((row) => row.orphanFiles > 0)
      .sort((a, b) => b.storageBytes - a.storageBytes)
      .slice(0, 5);
  }, [orphans?.rows]);

  const onRecalculate = React.useCallback(async (orgId: string) => {
    setRecalculatingFor(orgId);
    try {
      await recalculateOpsStorage(orgId);
      toast({
        title: 'Usage recalculated',
        description: 'Fresh storage usage has been written for the organization.',
      });
      await loadStorage();
      if (orphansLoaded) {
        await loadOrphans();
      }
    } catch (err) {
      toast({
        title: 'Unable to recalculate storage',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRecalculatingFor(null);
    }
  }, [loadOrphans, loadStorage, orphansLoaded, toast]);

  const onSaveLimit = React.useCallback(async (orgId: string) => {
    const value = Number(limitDrafts[orgId] || 0);
    if (!Number.isFinite(value) || value < 0) return;
    setSavingLimitFor(orgId);
    try {
      await updateOpsStorageLimit(orgId, value);
      toast({
        title: 'Storage limit updated',
        description: 'The new storage cap is now active for the organization.',
      });
      await loadStorage();
      if (orphansLoaded) {
        await loadOrphans();
      }
    } catch (err) {
      toast({
        title: 'Unable to update storage limit',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingLimitFor(null);
    }
  }, [limitDrafts, loadOrphans, loadStorage, orphansLoaded, toast]);

  return (
    <div className="space-y-6">
      <OpsPageHeader
        eyebrow="Phase 2"
        title="Storage"
        description="Track storage posture across clients, repair stale usage counts, and adjust limits without leaving the new ops console."
        actions={
          <Button variant="outline" onClick={() => void refresh()} disabled={loading || orphansLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load storage</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OpsMetricCard
          label="Managed Storage"
          value={loading ? '...' : formatBytes(storage?.totals.totalBytes || 0)}
          hint="Total stored bytes across visible orgs"
        />
        <OpsMetricCard
          label="At Risk"
          value={loading ? '...' : riskCount}
          hint="Warning, grace, expired, or limit state"
          tone={riskCount > 0 ? 'warning' : 'success'}
        />
        <OpsMetricCard
          label="Average Usage"
          value={
            loading
              ? '...'
              : storage?.totals.averageUsagePercent !== null &&
                  storage?.totals.averageUsagePercent !== undefined
                ? `${storage.totals.averageUsagePercent.toFixed(1)}%`
                : 'N/A'
          }
          hint="Average against configured limits"
        />
        <OpsMetricCard
          label="Orphan Files"
          value={loading ? '...' : orphansLoaded ? orphanTotals.files : 'On demand'}
          hint={orphansLoaded ? formatBytes(orphanTotals.storageBytes) : 'Load summary only when needed'}
          tone={orphansLoaded && orphanTotals.files > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <OpsSurface title="Storage Index" description="Search across clients, inspect current limit posture, and run safe storage fixes.">
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
            <p className="text-sm text-muted-foreground">Showing {rows.length} organizations</p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Calculated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={6}>
                        <div className="h-12 animate-pulse rounded-xl bg-muted/50" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      No organizations matched the current storage filters.
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
                      <TableCell className="min-w-[220px]">
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
                      <TableCell className="min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            value={limitDrafts[row.orgId] ?? String(row.storageLimitGb || 0)}
                            onChange={(event) =>
                              setLimitDrafts((current) => ({
                                ...current,
                                [row.orgId]: event.target.value,
                              }))
                            }
                          />
                          <span className="text-sm text-muted-foreground">GB</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <OpsPill tone={getStatusTone(row.status)}>{row.status}</OpsPill>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatOpsDate(row.usageCalculatedAt, { withTime: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={recalculatingFor === row.orgId}
                            onClick={() => void onRecalculate(row.orgId)}
                          >
                            <DatabaseZap className="mr-2 h-4 w-4" />
                            {recalculatingFor === row.orgId ? 'Recalculating...' : 'Recalc'}
                          </Button>
                          <Button
                            size="sm"
                            disabled={savingLimitFor === row.orgId}
                            onClick={() => void onSaveLimit(row.orgId)}
                          >
                            <Save className="mr-2 h-4 w-4" />
                            {savingLimitFor === row.orgId ? 'Saving...' : 'Save Limit'}
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/ops/orgs/${row.orgId}`}>Open</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </OpsSurface>

        <OpsSurface
          title="Orphan Storage Signals"
          description="Load this only when you need it. The summary scans storage across clients, so it stays off the critical path for the main storage page."
          actions={
            <Button variant="outline" onClick={() => void loadOrphans()} disabled={orphansLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {orphansLoaded ? 'Refresh Summary' : 'Load Summary'}
            </Button>
          }
        >
          {orphansLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          ) : !orphansLoaded ? (
            <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
              The orphan summary is deferred on purpose so the storage page opens fast. Load it only when you are actively investigating storage drift.
            </div>
          ) : topOrphans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
              No orphan storage was detected in the current summary run.
            </div>
          ) : (
            <div className="space-y-3">
              {topOrphans.map((row) => (
                <div
                  key={row.orgId}
                  className="rounded-2xl border border-border/50 bg-background/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.orphanFiles} orphan files, {formatBytes(row.storageBytes)}
                      </p>
                    </div>
                    <OpsPill tone="warning">Needs review</OpsPill>
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
