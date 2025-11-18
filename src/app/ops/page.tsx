"use client";

import Link from 'next/link';
import { type ComponentType, useEffect, useMemo, useState } from 'react';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiFetch } from '@/lib/api';
import { useOpsFilters } from '@/components/ops/ops-filters-context';
import { formatOpsDate } from '@/lib/utils';
import { useOpsPageHeader } from '@/components/ops/ops-header-context';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  Folder,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from 'lucide-react';

type WhoAmI = { platformAdmin?: boolean | null };
type AuditEvent = {
  id: string;
  org_id: string | null;
  actor_user_id: string | null;
  type: string;
  ts: string;
  note: string | null;
};
type Overview = {
  totals: { orgs: number; documents: number; orgUsers: number };
  recentOps: AuditEvent[];
  recentActivity: AuditEvent[];
};

export default function OpsOverviewPage() {
  return (
    <SimpleOpsLayout>
      <OpsOverviewContent />
    </SimpleOpsLayout>
  );
}

function OpsOverviewContent() {
  const { orgId, orgName, timeRange } = useOpsFilters();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [whoami, setWhoami] = useState<WhoAmI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const orgLabel = orgId ? orgName || orgId : 'all orgs';

  useOpsPageHeader({
    title: 'Ops Control Center',
    subtitle: `Insights for ${orgLabel} · ${timeRange.toUpperCase()}`,
    backHref: '/dashboard',
    backLabel: 'Back to dashboard',
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [me, ov] = await Promise.all([
          apiFetch<WhoAmI>('/ops/whoami'),
          apiFetch<Overview>('/ops/simple-overview'),
        ]);
        if (cancelled) return;
        setWhoami(me);
        setOverview(ov || null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load Ops overview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredOps = useMemo(
    () => filterByOrg(overview?.recentOps || [], orgId),
    [overview?.recentOps, orgId]
  );
  const filteredActivity = useMemo(
    () => filterByOrg(overview?.recentActivity || [], orgId),
    [overview?.recentActivity, orgId]
  );
  const attentionItems = useMemo(
    () =>
      filteredActivity
        .filter((event) => {
          const sev = getSeverity(event);
          return sev === 'critical' || sev === 'warning';
        })
        .slice(0, 4),
    [filteredActivity]
  );

  const blocked = whoami && whoami.platformAdmin === false;

  if (loading) {
    return (
      <div className="px-4 md:px-6 py-6">
        <OpsDashboardSkeleton />
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="px-4 md:px-6 py-6">
        <Alert>
          <AlertTitle>Access denied</AlertTitle>
          <AlertDescription>You must be a platform admin to view this workspace.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-6 space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load overview</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <KpiGrid overview={overview} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Attention needed</CardTitle>
              <p className="text-sm text-muted-foreground">
                Surfaced from recent activity matching errors, incidents, or policy warnings.
              </p>
            </div>
            <Badge variant="secondary">{attentionItems.length || 0} open</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {attentionItems.length === 0 && (
              <p className="text-sm text-muted-foreground">No alerts in the selected window.</p>
            )}
            {attentionItems.map((event) => {
              const severity = getSeverity(event);
              return (
                <div
                  key={event.id}
                  className="flex items-start justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{event.type}</div>
                    <div className="text-xs text-muted-foreground">
                      {event.org_id || 'unknown org'} · {formatEventDate(event.ts)}
                    </div>
                    {event.note && <p className="mt-1 text-xs">{event.note}</p>}
                  </div>
                  <Badge
                    variant={severity === 'critical' ? 'destructive' : 'secondary'}
                    className="shrink-0"
                  >
                    {severity}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <QuickAction
              href="/ops/orgs"
              label="Organizations"
              description="See org statistics & diagnostics"
              Icon={Folder}
            />
            <QuickAction
              href="/ops/orphan-files"
              label="Orphan storage"
              description="Audit unused Supabase objects"
              Icon={Database}
            />
            <QuickAction
              href="/ops/storage"
              label="Usage monitor"
              description="Plan usage & limit overrides"
              Icon={BarChart3}
            />
            <QuickAction
              href="/ops/security"
              label="Security center"
              description="IP allowlists & overrides"
              Icon={ShieldCheck}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EventTable
          title="Recent Ops actions"
          description="Operator initiated events (ops.* audit log entries)"
          events={filteredOps}
        />
        <EventTable
          title="Recent activity"
          description="Latest platform signals flowing through audit events"
          events={filteredActivity}
        />
      </div>
    </div>
  );
}

function filterByOrg(events: AuditEvent[], orgId: string) {
  if (!orgId) return events;
  return events.filter((event) => event.org_id === orgId);
}

function formatEventDate(value: string) {
  return formatOpsDate(value, { withTime: true });
}

function getSeverity(event: AuditEvent): 'critical' | 'warning' | 'info' {
  const type = event.type?.toLowerCase() || '';
  if (type.includes('error') || type.includes('incident') || type.includes('fail')) return 'critical';
  if (type.includes('rls') || type.includes('ip.') || type.includes('warn')) return 'warning';
  return 'info';
}

function OpsDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={idx} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-52" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
    </div>
  );
}

function KpiGrid({ overview }: { overview: Overview | null }) {
  const totals = overview?.totals;
  const cards = [
    { label: 'Organizations', value: totals?.orgs ?? '—', Icon: LayoutDashboard },
    { label: 'Org users', value: totals?.orgUsers ?? '—', Icon: Users },
    { label: 'Documents', value: totals?.documents ?? '—', Icon: Activity },
    { label: 'Active modules', value: 'Storage · Ingestion · Security', Icon: ShieldCheck },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, Icon }) => (
        <Card key={label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{label}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QuickAction({
  href,
  label,
  description,
  Icon,
}: {
  href: string;
  label: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Button asChild variant="outline" className="w-full justify-start gap-3 py-4">
      <Link href={href}>
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="flex flex-col items-start">
          <span className="font-medium leading-tight">{label}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </span>
      </Link>
    </Button>
  );
}

function EventTable({
  title,
  description,
  events,
}: {
  title: string;
  description: string;
  events: AuditEvent[];
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="secondary">{events.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries for the selected filter.</p>
        ) : (
          events.slice(0, 8).map((event) => (
            <div key={event.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatEventDate(event.ts)}</span>
                <span>{event.org_id || '—'}</span>
              </div>
              <div className="mt-1 font-medium">{event.type}</div>
              {event.note && <p className="text-xs text-muted-foreground">{event.note}</p>}
              <div className="mt-1 text-xs">
                Actor: <span className="font-mono">{event.actor_user_id || 'system'}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
