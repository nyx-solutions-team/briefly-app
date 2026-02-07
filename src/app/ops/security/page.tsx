"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import { formatOpsDate } from '@/lib/utils';
import { useOpsPageHeader } from '@/components/ops/ops-header-context';

type IpRule = {
  id: string;
  org_id: string;
  ip_address: string;
  label: string | null;
  enforced: boolean | null;
  updated_at: string | null;
};

type OverrideRow = {
  id: string;
  org_id: string;
  user_id: string;
  expires_at: string | null;
  created_at: string | null;
};

type Anomaly = {
  id: string;
  org_id: string | null;
  type: string;
  ts: string;
  actor_user_id: string | null;
  note: string | null;
};

type SecurityOverview = {
  ipAllowlist: IpRule[];
  overrides: OverrideRow[];
  anomalies: Anomaly[];
};

export default function OpsSecurityPage() {
  return (
    <SimpleOpsLayout showFilters={false}>
      <OpsSecurityContent />
    </SimpleOpsLayout>
  );
}

function OpsSecurityContent() {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch<SecurityOverview>('/ops/security/overview', { skipCache: true });
      setData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredAllowlist = useMemo(() => {
    const list = data?.ipAllowlist ?? [];
    return list.filter((rule) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        rule.ip_address.toLowerCase().includes(term) ||
        (rule.label || '').toLowerCase().includes(term) ||
        rule.org_id.toLowerCase().includes(term)
      );
    });
  }, [data, search]);

  const enforcedCount = filteredAllowlist.filter((r) => r.enforced).length;

  const headerActions = useMemo(
    () => (
      <Button variant="outline" size="sm" onClick={() => void load()}>
        <RefreshCcw className="mr-1 h-4 w-4" />
        Refresh
      </Button>
    ),
    [load]
  );

  useOpsPageHeader({
    title: 'Security Center',
    subtitle: 'Review network allowlists, overrides, and recent security anomalies.',
    actions: headerActions,
  });

  if (loading) {
    return (
      <div className="px-4 md:px-6 py-6 space-y-4">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Card key={idx}>
            <CardContent className="h-24 animate-pulse bg-muted/40" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 md:px-6 py-6">
        <Alert variant="destructive">
          <AlertTitle>Unable to load security overview</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="IP rules" value={filteredAllowlist.length.toLocaleString()} />
          <SummaryTile label="Enforced orgs" value={enforcedCount.toLocaleString()} />
          <SummaryTile label="Overrides" value={((data?.overrides ?? []).length).toLocaleString()} />
          <SummaryTile label="Recent anomalies" value={((data?.anomalies ?? []).length).toLocaleString()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>IP allowlist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search by IP, label, or org"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>IP address</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAllowlist.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No IP rules found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAllowlist.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-mono text-xs">{rule.org_id}</TableCell>
                      <TableCell className="font-mono text-xs">{rule.ip_address}</TableCell>
                      <TableCell>{rule.label || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={rule.enforced ? 'secondary' : 'outline'}>
                          {rule.enforced ? 'Enforced' : 'Bypass'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {rule.updated_at ? formatOpsDate(rule.updated_at, { withTime: true }) : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overrides</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto text-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.overrides ?? []).length ? (
                (data?.overrides ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.org_id}</TableCell>
                    <TableCell className="font-mono text-xs">{row.user_id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.created_at ? formatOpsDate(row.created_at, { withTime: true }) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.expires_at ? formatOpsDate(row.expires_at, { withTime: true }) : 'No expiry'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    No overrides recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent anomalies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.anomalies ?? []).length ? (
            (data?.anomalies ?? []).map((entry) => (
              <div key={entry.id} className="rounded border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{entry.type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatOpsDate(entry.ts, { withTime: true })}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Org: {entry.org_id || '—'} · Actor: {entry.actor_user_id || 'system'}
                </div>
                <p className="mt-1 text-sm">{entry.note || 'No additional context'}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No anomalies logged in the last 7 days.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );

}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
