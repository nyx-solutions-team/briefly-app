"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatBytes, formatOpsDate } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { RefreshCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOpsPageHeader } from '@/components/ops/ops-header-context';

type StorageUsageRow = {
  orgId: string;
  name: string;
  planKey: string | null;
  storageLimitGb: number | null;
  storageLimitBytes: number | null;
  storageBytes: number;
  usagePercent: number | null;
  usageCalculatedAt: string | null;
  planEndsAt: string | null;
  storageGraceUntil: string | null;
  status: 'ok' | 'warning' | 'limit' | 'expired' | 'grace';
};

type StorageUsageResponse = {
  totals: {
    orgs: number;
    totalBytes: number;
    averageUsagePercent: number | null;
  };
  rows: StorageUsageRow[];
};

const STATUS_LABEL: Record<StorageUsageRow['status'], string> = {
  ok: 'Healthy',
  warning: 'Warning',
  limit: 'At limit',
  expired: 'Expired',
  grace: 'Grace period',
};

export default function OpsStoragePage() {
  return (
    <SimpleOpsLayout showFilters={false}>
      <StoragePageContent />
    </SimpleOpsLayout>
  );
}

function StoragePageContent() {
  const [activeTab, setActiveTab] = useState<'usage' | 'orphans'>('usage');
  const [usageData, setUsageData] = useState<StorageUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  useOpsPageHeader({
    title: 'Storage',
    subtitle: 'Track plan usage and investigate orphaned objects across organizations.',
  });

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const resp = await apiFetch<StorageUsageResponse>('/ops/storage/usage', { skipCache: true });
      setUsageData(resp);
    } catch (err) {
      console.error(err);
      setUsageError(err instanceof Error ? err.message : 'Failed to load storage usage');
      setUsageData(null);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const topConsumers = useMemo(() => {
    if (!usageData?.rows) return [];
    return [...usageData.rows]
      .sort((a, b) => b.storageBytes - a.storageBytes)
      .slice(0, 5);
  }, [usageData?.rows]);

  return (
    <div className="px-4 md:px-6 py-6 space-y-6">
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)} className="space-y-4">
        <TabsList className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <TabsTrigger value="usage" className="flex-1">
            Usage overview
          </TabsTrigger>
          <TabsTrigger value="orphans" className="flex-1">
            Orphaned storage
          </TabsTrigger>
        </TabsList>
        <TabsContent value="usage">
          <UsageTab
            data={usageData}
            loading={usageLoading}
            error={usageError}
            onRefresh={loadUsage}
            topConsumers={topConsumers}
          />
        </TabsContent>
        <TabsContent value="orphans">
          <OrphanSummaryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsageTab({
  data,
  loading,
  error,
  onRefresh,
  topConsumers,
}: {
  data: StorageUsageResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  topConsumers: StorageUsageRow[];
}) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | StorageUsageRow['status']>('all');
  const [search, setSearch] = useState('');
  const [adjustRow, setAdjustRow] = useState<StorageUsageRow | null>(null);
  const [recalculating, setRecalculating] = useState<string | null>(null);

  const rows = data?.rows || [];
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      return (
        row.name.toLowerCase().includes(term) ||
        row.orgId.toLowerCase().includes(term) ||
        (row.planKey || '').toLowerCase().includes(term)
      );
    });
  }, [rows, search, statusFilter]);

  const handleRecalculate = async (row: StorageUsageRow) => {
    setRecalculating(row.orgId);
    try {
      await apiFetch(`/ops/orgs/${row.orgId}/storage/recalculate`, { method: 'POST' });
      toast({ title: 'Recalculation started', description: `${row.name} usage updated` });
      onRefresh();
    } catch (err) {
      console.error(err);
      toast({
        title: 'Failed to recalculate',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRecalculating(null);
    }
  };

  const openAdjustLimit = (row: StorageUsageRow) => {
    setAdjustRow(row);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Plan usage</CardTitle>
            <p className="text-sm text-muted-foreground">
              Aggregate storage totals sourced from org_usage. Use filters to spot orgs nearing limits before they hit
              errors.
            </p>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={loading} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <UsageSkeleton />
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load usage</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <>
              <UsageSummary data={data} />
              <TopConsumers rows={topConsumers} />
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 gap-2">
                  <Input
                    placeholder="Search org or plan"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-xs"
                  />
                  <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as typeof statusFilter)}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="warning">Warning (&gt;=80%)</SelectItem>
                      <SelectItem value="limit">At limit</SelectItem>
                      <SelectItem value="grace">Grace period</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="ok">Healthy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Showing {filteredRows.length} of {rows.length} organizations
                </p>
              </div>
              <UsageTable
                rows={filteredRows}
                onRecalculate={handleRecalculate}
                onAdjustLimit={openAdjustLimit}
                recalculatingId={recalculating}
              />
            </>
          )}
        </CardContent>
      </Card>
      <AdjustLimitDialog
        row={adjustRow}
        onClose={() => setAdjustRow(null)}
        onUpdated={() => {
          setAdjustRow(null);
          onRefresh();
        }}
      />
    </>
  );
}

function UsageSummary({ data }: { data: StorageUsageResponse | null }) {
  if (!data) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryTile label="Tracked organizations" value={data.totals.orgs.toLocaleString()} />
      <SummaryTile label="Total storage" value={formatBytes(data.totals.totalBytes)} />
      <SummaryTile
        label="Average plan utilization"
        value={
          typeof data.totals.averageUsagePercent === 'number'
            ? `${data.totals.averageUsagePercent.toFixed(1)}%`
            : '—'
        }
      />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function TopConsumers({ rows }: { rows: StorageUsageRow[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="mb-3 text-sm font-medium">Top consumers</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.orgId} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div>
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-muted-foreground">Plan: {row.planKey || 'n/a'}</div>
            </div>
            <div className="text-right text-sm font-semibold">{formatBytes(row.storageBytes)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageTable({
  rows,
  onRecalculate,
  onAdjustLimit,
  recalculatingId,
}: {
  rows: StorageUsageRow[];
  onRecalculate: (row: StorageUsageRow) => void;
  onAdjustLimit: (row: StorageUsageRow) => void;
  recalculatingId: string | null;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No organizations found.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organization</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead>Storage used</TableHead>
            <TableHead>Limit</TableHead>
            <TableHead>Calculated</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.orgId}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>
                {row.planKey ? (
                  <Badge variant={planBadgeVariant(row.planKey)} className="capitalize">
                    {row.planKey.replace(/_/g, ' ')}
                  </Badge>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell>
                {typeof row.usagePercent === 'number' ? (
                  <span className="font-medium">{row.usagePercent.toFixed(1)}%</span>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell>{formatBytes(row.storageBytes)}</TableCell>
              <TableCell>
                {row.storageLimitBytes ? formatBytes(row.storageLimitBytes) : <span className="text-xs">Unlimited</span>}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.usageCalculatedAt ? formatOpsDate(row.usageCalculatedAt, { withTime: true }) : 'n/a'}
              </TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell className="text-right space-x-2 text-xs">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/ops/orgs/${row.orgId}`}>View org</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRecalculate(row)}
                  disabled={recalculatingId === row.orgId}
                >
                  {recalculatingId === row.orgId ? 'Recalculating…' : 'Recalculate'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onAdjustLimit(row)}>
                  Adjust limit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function planBadgeVariant(planKey: string): 'default' | 'secondary' | 'outline' {
  if (!planKey) return 'outline';
  if (planKey === 'free') return 'secondary';
  if (planKey.startsWith('paid')) return 'default';
  return 'outline';
}

function StatusBadge({ status }: { status: StorageUsageRow['status'] }) {
  const variant =
    status === 'ok'
      ? 'secondary'
      : status === 'warning'
      ? 'outline'
      : status === 'limit'
      ? 'destructive'
      : status === 'expired'
      ? 'destructive'
      : 'outline';
  return (
    <Badge variant={variant} className="text-xs">
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton key={idx} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-20" />
      <Skeleton className="h-[320px]" />
    </div>
  );
}

type OrphanSummaryRow = {
  orgId: string;
  name: string;
  orphanFiles: number;
  storageBytes: number;
  scannedAt?: string;
};

function OrphanSummaryTab() {
  const [bucket, setBucket] = useState('documents');
  const [rows, setRows] = useState<OrphanSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'name' | 'files' | 'storage'>('files');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch<{ bucket: string; rows: OrphanSummaryRow[] }>(
        `/ops/orphan-storage?bucket=${bucket}`,
        { skipCache: true }
      );
      setRows(resp?.rows || []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load orphan summary');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      let result = 0;
      if (sortField === 'name') result = a.name.localeCompare(b.name);
      else if (sortField === 'files') result = a.orphanFiles - b.orphanFiles;
      else result = a.storageBytes - b.storageBytes;
      return sortDir === 'asc' ? result : -result;
    });
    return list;
  }, [rows, sortField, sortDir]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Orphan summary</CardTitle>
          <p className="text-sm text-muted-foreground">
            Supabase objects that are not linked to documents. Drill into an org to delete or inspect.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={bucket} onValueChange={(val) => setBucket(val)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Bucket" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="documents">documents</SelectItem>
              <SelectItem value="previews">previews</SelectItem>
              <SelectItem value="extractions">extractions</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <Skeleton key={idx} className="h-10" />
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load orphan summary</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                      Organization {sortField === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('files')}>
                      Orphan files {sortField === 'files' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('storage')}>
                      Orphan storage {sortField === 'storage' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </TableHead>
                    <TableHead>Last scan</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        No orphaned storage found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedRows.map((row) => (
                    <TableRow key={row.orgId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.orphanFiles}</TableCell>
                      <TableCell>{formatBytes(row.storageBytes)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.scannedAt ? formatOpsDate(row.scannedAt, { withTime: true }) : 'n/a'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/ops/orphan-files/${row.orgId}?bucket=${bucket}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdjustLimitDialog({
  row,
  onClose,
  onUpdated,
}: {
  row: StorageUsageRow | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState<string>(row?.storageLimitGb?.toString() || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(row?.storageLimitGb?.toString() || '');
  }, [row]);

  const submit = async () => {
    if (!row) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast({ title: 'Invalid limit', description: 'Enter a non-negative number', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/ops/orgs/${row.orgId}/storage/limit`, {
        method: 'PATCH',
        body: { storageLimitGb: parsed },
      });
      toast({ title: 'Limit updated', description: `${row.name} storage limit set to ${parsed} GB` });
      onUpdated();
    } catch (err) {
      console.error(err);
      toast({
        title: 'Failed to update limit',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust storage limit</DialogTitle>
          <DialogDescription>
            Update the storage allowance for <span className="font-medium">{row?.name}</span>. Leave at zero for
            unlimited.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="limit-input">Storage limit (GB)</Label>
          <Input
            id="limit-input"
            type="number"
            min={0}
            step="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Current usage: {row ? formatBytes(row.storageBytes) : '—'}
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
