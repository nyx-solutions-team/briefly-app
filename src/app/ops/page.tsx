"use client";

import Link from 'next/link';
import * as React from 'react';
import {
  AlertTriangle,
  Building2,
  HardDrive,
  Layers3,
  PlusSquare,
  RefreshCw,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { OpsMetricCard, OpsPageHeader, OpsPill, OpsSurface } from '@/components/ops/ops-primitives';
import {
  getOpsLifecycleLabel,
  getOpsOrgLifecycle,
  getOpsStorageUsagePercent,
  listOpsOrganizations,
  type OpsOrgListItem,
} from '@/lib/ops-api';
import { formatBytes, formatOpsDate } from '@/lib/utils';

function getAttentionReason(org: OpsOrgListItem) {
  const lifecycle = getOpsOrgLifecycle(org);
  const usagePercent = getOpsStorageUsagePercent(org.plan);

  if (lifecycle === 'setup_incomplete') return 'Setup incomplete';
  if (lifecycle === 'expired') return 'Plan expired';
  if (lifecycle === 'grace') return 'Within grace window';
  if (usagePercent !== null && usagePercent >= 90) return 'Storage close to full';
  if (usagePercent !== null && usagePercent >= 80) return 'Storage warning';
  return null;
}

function getToneForLifecycle(org: OpsOrgListItem) {
  const lifecycle = getOpsOrgLifecycle(org);
  if (lifecycle === 'active') return 'success' as const;
  if (lifecycle === 'setup_incomplete' || lifecycle === 'grace') return 'warning' as const;
  return 'danger' as const;
}

export default function OpsOverviewPage() {
  const [orgs, setOrgs] = React.useState<OpsOrgListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOpsOrganizations();
      setOrgs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load ops overview');
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const totals = React.useMemo(() => {
    const setupCount = orgs.filter((org) => getOpsOrgLifecycle(org) === 'setup_incomplete').length;
    const atRiskCount = orgs.filter((org) => getAttentionReason(org)).length;
    const totalStorageBytes = orgs.reduce((sum, org) => sum + Number(org.plan.storageUsedBytes || 0), 0);
    const totalDocuments = orgs.reduce((sum, org) => sum + Number(org.documents || 0), 0);
    return {
      totalOrgs: orgs.length,
      setupCount,
      atRiskCount,
      totalStorageBytes,
      totalDocuments,
    };
  }, [orgs]);

  const attentionRows = React.useMemo(() => {
    return orgs
      .map((org) => ({
        org,
        reason: getAttentionReason(org),
      }))
      .filter((row) => Boolean(row.reason))
      .sort((a, b) => {
        const aUsage = getOpsStorageUsagePercent(a.org.plan) || 0;
        const bUsage = getOpsStorageUsagePercent(b.org.plan) || 0;
        return bUsage - aUsage;
      })
      .slice(0, 8);
  }, [orgs]);

  const newestOrgs = React.useMemo(() => {
    return [...orgs]
      .sort((a, b) => {
        const aTime = a.plan.planStartedAt ? new Date(a.plan.planStartedAt).getTime() : 0;
        const bTime = b.plan.planStartedAt ? new Date(b.plan.planStartedAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 6);
  }, [orgs]);

  return (
    <div className="space-y-8">
      <OpsPageHeader
        title="Ops Overview"
        description="A clean starting point for the new internal platform console. Focus here is simple: which organizations need attention, which are incomplete, and where operators should go next."
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
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unable to load overview</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OpsMetricCard label="Organizations" value={loading ? '...' : totals.totalOrgs} hint="Current client workspaces" />
        <OpsMetricCard
          label="Needs Setup"
          value={loading ? '...' : totals.setupCount}
          hint="Orgs missing users or teams"
          tone={totals.setupCount > 0 ? 'warning' : 'success'}
        />
        <OpsMetricCard
          label="Needs Attention"
          value={loading ? '...' : totals.atRiskCount}
          hint="Setup, plan, or storage risk"
          tone={totals.atRiskCount > 0 ? 'warning' : 'default'}
        />
        <OpsMetricCard
          label="Storage Managed"
          value={loading ? '...' : formatBytes(totals.totalStorageBytes)}
          hint={`${totals.totalDocuments.toLocaleString()} documents across all orgs`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <OpsSurface
          title="Organizations Requiring Attention"
          description="This is the high-signal queue for the first ops milestone: setup gaps, plan issues, and storage pressure."
          actions={
            <Button variant="outline" asChild>
              <Link href="/ops/orgs">View all organizations</Link>
            </Button>
          }
        >
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-2xl border border-border/40 bg-background/60 p-4">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted/60" />
                </div>
              ))}
            </div>
          ) : attentionRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 p-6 text-sm text-muted-foreground">
              No organizations need attention right now. The next milestone is to expand this page with richer visibility metrics.
            </div>
          ) : (
            <div className="space-y-3">
              {attentionRows.map(({ org, reason }) => (
                <Link
                  key={org.orgId}
                  href={`/ops/orgs/${org.orgId}`}
                  className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-background/70 p-4 transition-colors hover:border-border hover:bg-background"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{org.name}</span>
                        <OpsPill tone={getToneForLifecycle(org)}>
                          {getOpsLifecycleLabel(getOpsOrgLifecycle(org))}
                        </OpsPill>
                      </div>
                      <p className="text-xs text-muted-foreground">{org.orgId}</p>
                    </div>
                    <OpsPill tone="warning">{reason}</OpsPill>
                  </div>
                  <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                    <span>{org.users} members</span>
                    <span>{org.teams} teams</span>
                    <span>{org.documents.toLocaleString()} documents</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </OpsSurface>

        <div className="space-y-6">
          <OpsSurface
            title="Freshly Provisioned Orgs"
            description="Most recently started plans. Useful when onboarding new clients and checking setup progress."
          >
            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border-border/40 bg-background/60 p-4">
                    <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
                  </div>
                ))
              ) : newestOrgs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No organizations found yet.</p>
              ) : (
                newestOrgs.map((org) => (
                  <div
                    key={org.orgId}
                    className="rounded-2xl border border-border/50 bg-background/70 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{org.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Started {formatOpsDate(org.plan.planStartedAt)}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/ops/orgs/${org.orgId}`}>Open</Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </OpsSurface>

          <OpsSurface title="Current Rollout Focus" description="This is the intentionally small slice we are building first.">
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3 rounded-2xl border border-border/50 bg-background/70 p-4">
                <Building2 className="mt-0.5 h-4 w-4 text-foreground" />
                <div>
                  <p className="font-medium text-foreground">Phase 1: Control plane</p>
                  <p>Organizations, setup, members, permissions, and feature controls.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-border/50 bg-background/70 p-4">
                <Layers3 className="mt-0.5 h-4 w-4 text-foreground" />
                <div>
                  <p className="font-medium text-foreground">Phase 2: Visibility</p>
                  <p>Usage, storage, activity, and ops audit after control flows are stable.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-border/50 bg-background/70 p-4">
                <HardDrive className="mt-0.5 h-4 w-4 text-foreground" />
                <div>
                  <p className="font-medium text-foreground">Phase 3: Intervention</p>
                  <p>Incidents, ingestion repair, access troubleshooting, and safe cleanup tools.</p>
                </div>
              </div>
            </div>
          </OpsSurface>
        </div>
      </div>
    </div>
  );
}
