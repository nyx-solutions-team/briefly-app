"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import OpsAdminLayout from "@/components/layout/ops-admin-layout";
import { apiFetch } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface OrgSummary {
  teams: number;
  users: number;
  documents: number;
  overrides: number;
}

interface Diagnostic {
  id: string;
  severity: "error" | "warn" | "info";
  title: string;
  details?: any;
}

interface OrgDiag {
  orgId: string;
  summary: OrgSummary;
  diagnostics: Diagnostic[];
}

type SimpleOrg = {
  id: string;
  name: string;
  storageUsed: number;
  teamsCount: number;
  membersCount: number;
  docsUpdated?: number;
};

interface AnalyticsResult {
  org: { id: string; name?: string | null } | null;
  totals?: {
    documents: number;
    storageBytes: number;
    averageSizeBytes: number;
    members: number;
    teams: number;
  };
  documents?: {
    recentUploads7: number;
    uploads30: number;
    byTeam: Array<{
      teamId: string | null;
      teamName: string;
      leadUserId: string | null;
      documents: number;
      storageBytes: number;
      members: Array<{ userId: string; role: string | null; displayName: string | null }>;
    }>;
    topContributors: Array<{
      userId: string;
      displayName: string | null;
      orgRole: string | null;
      documents: number;
      storageBytes: number;
      teams: string[];
    }>;
  };
  members?: {
    total: number;
    active: number;
    expiring30: number;
    byTeam: Array<{
      teamId: string;
      teamName: string;
      leadUserId: string | null;
      leadName: string | null;
      members: Array<{
        userId: string;
        displayName: string | null;
        deptRole: string | null;
        orgRole: string | null;
        expiresAt: string | null;
      }>;
    }>;
  };
}

export default function OpsAdminOrgDetailPage() {
  const params = useParams();
  const orgId = String(params?.orgId || "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [orgName, setOrgName] = useState<string>(orgId);
  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);
  const [orgsSnapshot, setOrgsSnapshot] = useState<SimpleOrg[]>([]);

  useEffect(() => {
    if (!orgId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const who = await apiFetch<any>("/ops/whoami");
        const allowed = !!who?.platformAdmin;
        setIsAdmin(allowed);
        if (!allowed) {
          setError("Forbidden: You are not a platform admin.");
          return;
        }

        const [diagData, analyticsData, simpleOrgs] = await Promise.all([
          apiFetch<OrgDiag>(`/ops/orgs/${orgId}`),
          apiFetch<AnalyticsResult>(`/ops/orgs/${orgId}/analytics`),
          apiFetch<SimpleOrg[] | SimpleOrg | null>("/ops/simple-orgs"),
        ]);

        setSummary(diagData.summary);
        setDiagnostics(diagData.diagnostics || []);
        setAnalytics(analyticsData);
        const normalized: SimpleOrg[] = Array.isArray(simpleOrgs) ? simpleOrgs : simpleOrgs ? [simpleOrgs] : [];
        setOrgsSnapshot(normalized);
        const matched = normalized.find((org) => org.id === orgId);
        const derivedName = analyticsData?.org?.name || matched?.name;
        setOrgName(derivedName || orgId);
      } catch (err) {
        if (err && typeof err === "object" && "status" in err && (err as any).status === 403) {
          setIsAdmin(false);
        }
        setError(err instanceof Error ? err.message : "Failed to load organization details");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [orgId]);

  const severityColors: Record<Diagnostic["severity"], string> = {
    error: "bg-destructive/10 text-destructive",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
    info: "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-200",
  };

  const actionableDiagnostics = useMemo(
    () => diagnostics.filter((diag) => diag.severity !== "info"),
    [diagnostics]
  );

  const totals = analytics?.totals;
  const documents = analytics?.documents;
  const members = analytics?.members;
  const totalDocumentCount = documents?.byTeam.reduce((sum, t) => sum + t.documents, 0) || 0;

  const teamBreakdown = useMemo(() => {
    if (!documents?.byTeam) return [] as Array<{
      teamId: string | null;
      teamName: string;
      leadUserId: string | null;
      documents: number;
      storageBytes: number;
      members: Array<{ userId: string; role: string | null; displayName: string | null }>;
      storageLabel: string;
      docShare: number;
    }>;
    return documents.byTeam.map((team) => ({
      ...team,
      storageLabel: formatBytes(team.storageBytes),
      docShare: totalDocumentCount > 0 ? Math.round((team.documents / totalDocumentCount) * 100) : 0,
    }));
  }, [documents, totalDocumentCount]);

  const renderDiagnostics = () => {
    if (!actionableDiagnostics.length) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionableDiagnostics.map((diag) => (
            <div key={diag.id} className="border rounded-md p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{diag.title}</div>
                <Badge className={severityColors[diag.severity]}>{diag.severity}</Badge>
              </div>
              {diag.details && (
                <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {JSON.stringify(diag.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  const renderContent = () => {
    if (loading) {
      return <div className="text-sm text-muted-foreground">Loading organization details…</div>;
    }

    if (isAdmin === false) {
      return <div className="text-sm text-yellow-700">Forbidden: You are not a platform admin.</div>;
    }

    if (error) {
      return <div className="text-sm text-red-600">Error: {error}</div>;
    }

    if (!summary || !analytics) {
      return <div className="text-sm text-muted-foreground">No analytics available for this organization.</div>;
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Teams</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.teams}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Members</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.users}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Documents</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.documents}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Avg. File Size</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{formatBytes(totals?.averageSizeBytes || 0)}</CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Storage Used</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{formatBytes(totals?.storageBytes || 0)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Recent Uploads (7d)</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{documents?.recentUploads7 ?? "—"}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Uploads (30d)</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{documents?.uploads30 ?? "—"}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Document Distribution by Team</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Members</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamBreakdown.map((team) => (
                  <TableRow key={team.teamId ?? "org-wide"}>
                    <TableCell className="font-medium">{team.teamName}</TableCell>
                    <TableCell>{team.documents}</TableCell>
                    <TableCell>{team.docShare}%</TableCell>
                    <TableCell>{team.storageLabel}</TableCell>
                    <TableCell>{team.members.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Contributors</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Org Role</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead>Teams</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(documents?.topContributors?.length ?? 0) ? (
                    documents!.topContributors.map((user) => (
                      <TableRow key={user.userId}>
                        <TableCell className="font-medium">{user.displayName || user.userId}</TableCell>
                        <TableCell>{user.orgRole || "—"}</TableCell>
                        <TableCell>{user.documents}</TableCell>
                        <TableCell>{formatBytes(user.storageBytes)}</TableCell>
                        <TableCell>{user.teams.length ? user.teams.join(", ") : "—"}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        No contributor data available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><span>Total members</span><span className="font-medium">{members?.total ?? "—"}</span></div>
              <div className="flex items-center justify-between"><span>Active</span><span className="font-medium">{members?.active ?? "—"}</span></div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Members by Team</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {members?.byTeam?.length ? (
              members!.byTeam.map((team) => (
                <div key={team.teamId} className="border rounded-lg">
                  <div className="px-4 py-3 bg-muted/60 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{team.teamName}</div>
                      <div className="text-xs text-muted-foreground">Lead: {team.leadName || "—"}</div>
                    </div>
                    <Badge variant="secondary">{team.members.length} members</Badge>
                  </div>
                  <div className="px-4 py-3 space-y-2 text-sm">
                    {team.members.length ? team.members.map((member) => (
                      <div key={member.userId} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{member.displayName || member.userId}</span>
                        <Separator orientation="vertical" className="h-4" />
                        <span className="text-muted-foreground">Dept role: {member.deptRole || "member"}</span>
                        {member.orgRole && (
                          <>
                            <Separator orientation="vertical" className="h-4" />
                            <span className="text-muted-foreground">Org role: {member.orgRole}</span>
                          </>
                        )}
                        {member.expiresAt && (
                          <>
                            <Separator orientation="vertical" className="h-4" />
                            <span className="text-muted-foreground">Expires {new Date(member.expiresAt).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    )) : (
                      <div className="text-muted-foreground text-sm">No members assigned.</div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No team membership data available.</div>
            )}
          </CardContent>
        </Card>

        {renderDiagnostics()}
      </div>
    );
  };

  return (
    <OpsAdminLayout>
      <div className="min-h-screen bg-background text-foreground">
        <div className="border-b bg-muted/40">
          <div className="px-6 py-6">
            <h1 className="text-2xl font-semibold">{orgName}</h1>
            <p className="text-sm text-muted-foreground">Organization health, contribution, and adoption metrics.</p>
          </div>
        </div>
        <div className="px-6 py-6">{renderContent()}</div>
      </div>
    </OpsAdminLayout>
  );
}
