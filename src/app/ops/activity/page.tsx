"use client";

import * as React from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OpsMetricCard, OpsPageHeader, OpsPill, OpsSurface } from '@/components/ops/ops-primitives';
import { getOpsActivity, type OpsActivityKind, type OpsActivityResponse } from '@/lib/ops-api';
import { formatOpsDate } from '@/lib/utils';

function getKindTone(kind: OpsActivityKind) {
  if (kind === 'ops') return 'success' as const;
  if (kind === 'security') return 'warning' as const;
  if (kind === 'documents') return 'neutral' as const;
  if (kind === 'auth') return 'neutral' as const;
  return 'neutral' as const;
}

export default function OpsActivityPage() {
  const [activity, setActivity] = React.useState<OpsActivityResponse | null>(null);
  const [search, setSearch] = React.useState('');
  const [kindFilter, setKindFilter] = React.useState<'all' | OpsActivityKind>('all');
  const [orgFilter, setOrgFilter] = React.useState<'all' | string>('all');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const activityResponse = await getOpsActivity({ limit: 200 });
      setActivity(activityResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load activity');
      setActivity(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (activity?.rows || []).filter((row) => {
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false;
      if (orgFilter !== 'all' && row.orgId !== orgFilter) return false;
      if (!needle) return true;
      return (
        row.orgName.toLowerCase().includes(needle) ||
        row.actorDisplayName.toLowerCase().includes(needle) ||
        row.type.toLowerCase().includes(needle) ||
        String(row.note || '').toLowerCase().includes(needle)
      );
    });
  }, [activity?.rows, kindFilter, orgFilter, search]);

  const totals = React.useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.kind] += 1;
        return acc;
      },
      {
        total: 0,
        ops: 0,
        security: 0,
        documents: 0,
        auth: 0,
        other: 0,
      }
    );
  }, [rows]);

  const orgs = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of activity?.rows || []) {
      if (!row.orgId) continue;
      if (!map.has(row.orgId)) {
        map.set(row.orgId, row.orgName);
      }
    }
    return Array.from(map.entries())
      .map(([orgId, name]) => ({ orgId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activity?.rows]);

  return (
    <div className="space-y-6">
      <OpsPageHeader
        eyebrow="Phase 2"
        title="Activity"
        description="This visibility layer answers the simplest but most important ops question: what changed recently across clients and who did it?"
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load activity</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <OpsMetricCard label="Visible Events" value={loading ? '...' : totals.total} hint="Filtered recent audit events" />
        <OpsMetricCard label="Ops" value={loading ? '...' : totals.ops} hint="Platform and admin actions" tone={totals.ops > 0 ? 'success' : 'default'} />
        <OpsMetricCard label="Security" value={loading ? '...' : totals.security} hint="Security and allowlist signals" tone={totals.security > 0 ? 'warning' : 'default'} />
        <OpsMetricCard label="Documents" value={loading ? '...' : totals.documents} hint="Document and storage activity" />
        <OpsMetricCard label="Auth" value={loading ? '...' : totals.auth} hint="Login and auth-related signals" />
      </div>

      <OpsSurface title="Recent Activity" description="Filter by org or activity kind to understand recent change history across the platform.">
        <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search org, actor, type, or note"
                className="pl-9"
              />
            </div>
            <Select value={kindFilter} onValueChange={(value) => setKindFilter(value as 'all' | OpsActivityKind)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="ops">Ops</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="documents">Documents</SelectItem>
                <SelectItem value="auth">Auth</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={orgFilter} onValueChange={(value) => setOrgFilter(value)}>
              <SelectTrigger className="w-full md:w-56">
                <SelectValue placeholder="Organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All organizations</SelectItem>
                {orgs.map((org) => (
                  <SelectItem key={org.orgId} value={org.orgId}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">Showing {rows.length} events</p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={6}>
                      <div className="h-12 animate-pulse rounded-xl bg-muted/50" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No activity matched the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="min-w-[180px] text-sm text-muted-foreground">
                      {formatOpsDate(row.ts, { withTime: true })}
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <div>
                        <p className="font-medium text-foreground">{row.orgName}</p>
                        {row.orgId ? (
                          <p className="text-xs text-muted-foreground">{row.orgId}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[180px] text-sm text-muted-foreground">
                      {row.actorDisplayName}
                    </TableCell>
                    <TableCell>
                      <OpsPill tone={getKindTone(row.kind)}>{row.kind}</OpsPill>
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      <p className="font-medium text-foreground">{row.type}</p>
                    </TableCell>
                    <TableCell className="min-w-[260px] text-sm text-muted-foreground">
                      {row.note || 'No note'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </OpsSurface>
    </div>
  );
}
