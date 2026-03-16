"use client";

import Link from 'next/link';
import * as React from 'react';
import { PlusSquare, RefreshCw, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OpsPageHeader, OpsPill, OpsSurface } from '@/components/ops/ops-primitives';
import {
  getOpsLifecycleLabel,
  getOpsOrgLifecycle,
  getOpsStorageUsagePercent,
  listOpsOrganizations,
  type OpsOrgLifecycle,
  type OpsOrgListItem,
} from '@/lib/ops-api';
import { formatBytes, formatOpsDate } from '@/lib/utils';

function getStatusTone(status: OpsOrgLifecycle) {
  if (status === 'active') return 'success' as const;
  if (status === 'setup_incomplete' || status === 'grace') return 'warning' as const;
  return 'danger' as const;
}

export default function OpsOrganizationsPage() {
  const [orgs, setOrgs] = React.useState<OpsOrgListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | OpsOrgLifecycle>('all');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOpsOrganizations();
      setOrgs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load organizations');
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return orgs.filter((org) => {
      const status = getOpsOrgLifecycle(org);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!term) return true;
      return (
        org.name.toLowerCase().includes(term) ||
        org.orgId.toLowerCase().includes(term) ||
        String(org.plan.key || '').toLowerCase().includes(term)
      );
    });
  }, [orgs, search, statusFilter]);

  return (
    <div className="space-y-8">
      <OpsPageHeader
        title="Organizations"
        description="The new ops console starts with clean client management. This screen is the index for provisioning, reviewing, and opening client workspaces."
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button asChild>
              <Link href="/ops/orgs/new">
                <PlusSquare className="mr-2 h-4 w-4" />
                Create Organization
              </Link>
            </Button>
          </>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load organizations</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <OpsSurface
        title="Client Workspace Index"
        description="Filter by status, search by org name or id, and drill into an individual client workspace."
      >
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by org name, id, or plan"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | OpsOrgLifecycle)}>
              <SelectTrigger className="w-full md:w-56">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="setup_incomplete">Setup Incomplete</SelectItem>
                <SelectItem value="grace">Grace Window</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Showing {filtered.length} of {orgs.length} organizations
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Footprint</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={6}>
                      <div className="h-12 animate-pulse rounded-xl bg-muted/50" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No organizations matched the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((org) => {
                  const status = getOpsOrgLifecycle(org);
                  const usagePercent = getOpsStorageUsagePercent(org.plan);
                  return (
                    <TableRow key={org.orgId}>
                      <TableCell className="min-w-[260px]">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{org.name}</p>
                          <p className="text-xs text-muted-foreground">{org.orgId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <OpsPill tone={getStatusTone(status)}>{getOpsLifecycleLabel(status)}</OpsPill>
                      </TableCell>
                      <TableCell className="min-w-[200px]">
                        <div className="space-y-1 text-sm">
                          <p className="font-medium text-foreground">{org.plan.key || 'Custom'}</p>
                          <p className="text-xs text-muted-foreground">
                            Ends {formatOpsDate(org.plan.planEndsAt)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[180px] text-sm text-muted-foreground">
                        <div className="space-y-1">
                          <p>{org.users} members</p>
                          <p>{org.teams} teams</p>
                          <p>{org.documents.toLocaleString()} docs</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-foreground">
                              {formatBytes(org.plan.storageUsedBytes || 0)}
                            </span>
                            <span className="text-muted-foreground">
                              {usagePercent !== null ? `${usagePercent.toFixed(1)}%` : 'No limit'}
                            </span>
                          </div>
                          <Progress value={Math.min(100, usagePercent || 0)} className="h-2" />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/ops/orgs/${org.orgId}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </OpsSurface>
    </div>
  );
}
