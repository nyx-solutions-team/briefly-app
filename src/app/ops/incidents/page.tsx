"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { RefreshCcw } from 'lucide-react';
import { formatOpsDate } from '@/lib/utils';
import { OpsHeaderSync } from '@/components/ops/ops-header-context';

type OrgSummary = { orgId: string; name: string };
type Incident = {
  id: string;
  org_id: string | null;
  type: string;
  ts: string;
  actor_user_id: string | null;
  note: string | null;
  doc_id?: string | null;
};

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'server.5xx', label: 'Server 5xx' },
  { value: 'rls.denied', label: 'RLS denials' },
  { value: 'ingest.error', label: 'Ingestion failures' },
  { value: 'ip.blocked', label: 'IP blocked' },
];

const SEVERITY_ORDER: Record<string, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

export default function IncidentsPage() {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const [type, setType] = useState<string>('all');
  const [since, setSince] = useState<string>('7');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [usersById, setUsersById] = useState<Record<string, { name: string | null; role: string | null }>>({});
  const fetchedOrgsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const loadOrgs = async () => {
      try {
        const list = await apiFetch<any[]>('/ops/orgs');
        setOrgs((list || []).map((o) => ({ orgId: o.orgId, name: o.name })));
      } catch (err) {
        console.error(err);
      }
    };
    void loadOrgs();
  }, []);

  const load = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      if (opts?.append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams({ type, since, limit: '50' });
        if (selectedOrg) params.set('orgId', selectedOrg);
        if (opts?.cursor) params.set('cursor', opts.cursor);
        const resp = await apiFetch<{ rows: Incident[]; nextCursor?: string | null } | Incident[]>(
          `/ops/incidents?${params.toString()}`
        );
        const payload = Array.isArray(resp)
          ? { rows: resp, nextCursor: null }
          : { rows: resp.rows || [], nextCursor: resp.nextCursor || null };
        setRows((prev) => (opts?.append ? [...prev, ...payload.rows] : payload.rows));
        setNextCursor(payload.nextCursor || null);
      } catch (e: any) {
        if (!opts?.append) {
          setRows([]);
        }
        setError(e?.message || 'Failed to load incidents');
      } finally {
        if (opts?.append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [selectedOrg, type, since]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const missingByOrg = new Map<string, Set<string>>();
    for (const row of rows) {
      const actor = row.actor_user_id;
      if (!actor || usersById[actor]) continue;
      if (!row.org_id) continue;
      missingByOrg.set(row.org_id, (missingByOrg.get(row.org_id) || new Set()).add(actor));
    }
    const targets = Array.from(missingByOrg.keys()).filter(
      (orgId) => !fetchedOrgsRef.current.has(orgId)
    );
    if (!targets.length) return;
    let cancelled = false;
    async function loadUsersForOrg(orgId: string) {
      try {
        const list = await apiFetch<any[]>(`/ops/orgs/${orgId}/users`);
        return list || [];
      } catch (err) {
        console.error('Failed to load org users', orgId, err);
        return [];
      }
    }
    (async () => {
      const entries = await Promise.all(targets.map(loadUsersForOrg));
      if (cancelled) return;
      fetchedOrgsRef.current = new Set([...fetchedOrgsRef.current, ...targets]);
      setUsersById((prev) => {
        const next = { ...prev };
        entries.forEach((list) => {
          for (const user of list) {
            if (!user?.userId) continue;
            next[user.userId] = { name: user.displayName || null, role: user.role || null };
          }
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, usersById]);

  const filteredRows = useMemo(() => {
    return rows
      .map((row) => ({ ...row, severity: deriveSeverity(row.type) }))
      .filter((row) => {
        if (severityFilter !== 'all' && row.severity !== severityFilter) return false;
        if (!search.trim()) return true;
        const needle = search.toLowerCase();
        return (
          (row.note || '').toLowerCase().includes(needle) ||
          (row.org_id || '').toLowerCase().includes(needle) ||
          (row.doc_id || '').toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        const sev = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
        if (sev !== 0) return sev;
        return new Date(b.ts).getTime() - new Date(a.ts).getTime();
      });
  }, [rows, search, severityFilter]);

  const orgNameMap = useMemo(() => {
    const map = new Map<string, string>();
    orgs.forEach((org) => map.set(org.orgId, org.name));
    return map;
  }, [orgs]);

  const stats = useMemo(() => {
    const total = filteredRows.length;
    const bySeverity = filteredRows.reduce(
      (acc, row) => {
        acc[row.severity] = (acc[row.severity] || 0) + 1;
        return acc;
      },
      { critical: 0, warning: 0, info: 0 } as Record<string, number>
    );
    return { total, bySeverity };
  }, [filteredRows]);

  const handleRetry = async (incident: Incident) => {
    if (!incident.org_id || !incident.doc_id) return;
    try {
      await apiFetch(`/ops/incidents/retry-ingest`, {
        method: 'POST',
        body: { orgId: incident.org_id, docId: incident.doc_id },
      });
      toast({ title: 'Reingest triggered', description: incident.doc_id });
    } catch (e: any) {
      toast({
        title: 'Retry failed',
        description: e?.message || 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const headerActions = useMemo(
    () => (
      <Button variant="outline" size="sm" onClick={() => void load()}>
        <RefreshCcw className="mr-1 h-4 w-4" />
        Refresh
      </Button>
    ),
    [load]
  );

  return (
    <SimpleOpsLayout showFilters={false}>
      <OpsHeaderSync
        title="Incidents"
        subtitle="Review incidents, filter by org, and trigger retries for ingestion failures."
        backHref="/ops"
        backLabel="Back to Ops"
        actions={headerActions}
      />
      <div className="px-4 md:px-6 py-6 space-y-6">

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile label="Total" value={stats.total.toLocaleString()} />
            <SummaryTile label="Critical" value={stats.bySeverity.critical.toLocaleString()} />
            <SummaryTile label="Warnings" value={stats.bySeverity.warning.toLocaleString()} />
            <SummaryTile label="Info" value={stats.bySeverity.info.toLocaleString()} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            <Select value={selectedOrg || 'all'} onValueChange={(val) => setSelectedOrg(val === 'all' ? '' : val)}>
              <SelectTrigger>
                <SelectValue placeholder="All orgs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All orgs</SelectItem>
                {orgs.map((org) => (
                  <SelectItem key={org.orgId} value={org.orgId}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={since} onValueChange={setSince}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={(val) => setSeverityFilter(val as typeof severityFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Incidents</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="h-12 animate-pulse rounded bg-muted/40" />
                ))}
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertTitle>Failed to load incidents</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Org</TableHead>
            <TableHead>Actor</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                          No incidents found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatOpsDate(row.ts, { withTime: true })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={severityBadgeVariant(row.severity)} className="capitalize">
                              {row.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.org_id ? orgNameMap.get(row.org_id) || '—' : '—'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatActor(row.actor_user_id, usersById)}
                          </TableCell>
                          <TableCell className="max-w-[320px] truncate text-xs">{row.note || '—'}</TableCell>
                          <TableCell className="text-xs space-x-2">
                            <Button variant="outline" size="sm" onClick={() => setSelected(row)}>
                              Details
                            </Button>
                            {row.type === 'ingest.error' && row.org_id && row.doc_id && (
                              <Button variant="ghost" size="sm" onClick={() => handleRetry(row)}>
                                Retry
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {nextCursor ? (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => load({ append: true, cursor: nextCursor })}
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <IncidentDialog incident={selected} onClose={() => setSelected(null)} orgNameMap={orgNameMap} />
    </SimpleOpsLayout>
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

function IncidentDialog({
  incident,
  onClose,
  orgNameMap,
}: {
  incident: Incident | null;
  onClose: () => void;
  orgNameMap: Map<string, string>;
}) {
  if (!incident) return null;
  const severity = deriveSeverity(incident.type);
  return (
    <Dialog open={!!incident} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Incident detail</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <Badge variant={severityBadgeVariant(severity)} className="capitalize">
              {incident.type}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatOpsDate(incident.ts, { withTime: true })}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Org</span>
            <div className="text-xs">{incident.org_id ? orgNameMap.get(incident.org_id) || '—' : '—'}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Actor</span>
            <div className="text-xs">{formatActor(incident.actor_user_id, usersById)}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Note</span>
            <p className="whitespace-pre-wrap text-sm">{incident.note || 'No details'}</p>
          </div>
          {incident.doc_id && (
            <div className="flex items-center justify-between text-xs">
              <span>Document</span>
              <Link href={`/documents/${incident.doc_id}`} className="text-primary hover:underline">
                {incident.doc_id}
              </Link>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function deriveSeverity(type: string): 'critical' | 'warning' | 'info' {
  if (type.includes('5xx') || type.includes('failed') || type.includes('ingest')) return 'critical';
  if (type.includes('rls') || type.includes('ip.blocked')) return 'warning';
  return 'info';
}

function formatActor(
  actorId: string | null,
  map: Record<string, { name: string | null; role: string | null }>
): React.ReactNode {
  if (!actorId) return 'system';
  const meta = map?.[actorId];
  if (!meta) return actorId;
  return (
    <>
      {meta.name || 'Unknown user'}
      {meta.role ? <span> · {meta.role}</span> : null}
    </>
  );
}

function severityBadgeVariant(sev: 'critical' | 'warning' | 'info') {
  if (sev === 'critical') return 'destructive';
  if (sev === 'warning') return 'outline';
  return 'secondary';
}
