"use client";
import React, { useEffect, useMemo, useState } from "react";
import OpsAdminLayout from "@/components/layout/ops-admin-layout";
import { apiFetch } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Overview = {
  totals: { orgs: number; documents: number; orgUsers: number };
  recentOps: Array<{ id: string; org_id: string | null; actor_user_id: string | null; type: string; ts: string; note: string | null }>;
  recentActivity: Array<{ id: string; org_id: string | null; actor_user_id: string | null; type: string; ts: string; note: string | null }>;
};

type SimpleOrg = {
  id: string;
  name: string;
  storageUsed: number;
  teamsCount: number;
  membersCount: number;
  docsUpdated?: number;
};

export default function OpsAdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [orgs, setOrgs] = useState<SimpleOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const who = await apiFetch<any>("/ops/whoami");
        const allowed = !!who?.platformAdmin;
        setIsAdmin(allowed);
        if (!allowed) {
          setError("Forbidden: You are not a platform admin.");
          return;
        }

        const [ov, orgRows] = await Promise.all([
          apiFetch<Overview>("/ops/simple-overview"),
          apiFetch<SimpleOrg[] | SimpleOrg | null>("/ops/simple-orgs"),
        ]);

        setOverview(ov);
        const normalized: SimpleOrg[] = Array.isArray(orgRows) ? orgRows : orgRows ? [orgRows] : [];
        setOrgs(normalized);
      } catch (err) {
        if (err && typeof err === "object" && "status" in err && (err as any).status === 403) {
          setIsAdmin(false);
        }
        setError(err instanceof Error ? err.message : "Failed to load overview");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const topOrgsByStorage = useMemo(() => {
    return [...orgs].sort((a, b) => (b.storageUsed || 0) - (a.storageUsed || 0)).slice(0, 5);
  }, [orgs]);

  const topOrgsByVelocity = useMemo(() => {
    return [...orgs]
      .sort((a, b) => (b.docsUpdated || 0) - (a.docsUpdated || 0))
      .slice(0, 5)
      .map((org) => ({ ...org, docsUpdated: org.docsUpdated ?? 0 }));
  }, [orgs]);

  const renderContent = () => {
    if (loading) return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;
    if (isAdmin === false) return <div className="text-sm text-yellow-700">Forbidden: You are not a platform admin.</div>;
    if (error) return <div className="text-sm text-red-600">Error: {error}</div>;
    if (!overview) return <div className="text-sm text-muted-foreground">No data available yet.</div>;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Organizations</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{overview.totals.orgs}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Documents</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{overview.totals.documents}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Users</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{overview.totals.orgUsers}</CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Organizations by Storage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {topOrgsByStorage.length ? (
                topOrgsByStorage.map((org) => (
                  <div key={org.id} className="border rounded-md p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{org.name}</div>
                      <div className="text-xs text-muted-foreground">Teams: {org.teamsCount} • Members: {org.membersCount}</div>
                    </div>
                    <div className="text-sm font-semibold">{formatBytes(org.storageUsed)}</div>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">No organizations found.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Most Active (Docs Updated 30d)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {topOrgsByVelocity.length ? (
                topOrgsByVelocity.map((org) => (
                  <div key={org.id} className="border rounded-md p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{org.name}</div>
                      <div className="text-xs text-muted-foreground">Teams: {org.teamsCount} • Members: {org.membersCount}</div>
                    </div>
                    <div className="text-sm font-semibold">{org.docsUpdated ?? 0} docs</div>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">No activity recorded.</div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    );
  };

  return (
    <OpsAdminLayout>
      <div className="min-h-screen bg-background text-foreground">
        <div className="border-b bg-muted/40">
          <div className="px-6 py-6">
            <h1 className="text-2xl font-semibold">Ops Admin Overview</h1>
            <p className="text-sm text-muted-foreground">Cross-tenant metrics and platform signals.</p>
          </div>
        </div>
        <div className="px-6 py-6">{renderContent()}</div>
      </div>
    </OpsAdminLayout>
  );
}
