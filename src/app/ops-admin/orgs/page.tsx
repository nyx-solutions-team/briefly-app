"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import OpsAdminLayout from "@/components/layout/ops-admin-layout";
import { apiFetch } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface OrgRow {
  id: string;
  name: string;
  storageUsed: number;
  teamsCount: number;
  membersCount: number;
  docsUpdated?: number;
}

export default function OpsAdminOrgsPage() {
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const who = await apiFetch<any>("/ops/whoami");
        const allowed = !!who?.platformAdmin;
        setIsAdmin(allowed);
        if (!allowed) {
          setError("Forbidden: You are not a platform admin.");
          return;
        }

        const data = await apiFetch<OrgRow[] | OrgRow | null>("/ops/simple-orgs");
        const next: OrgRow[] = Array.isArray(data) ? data : data ? [data] : [];
        setRows(next);
      } catch (err) {
        if (err && typeof err === "object" && "status" in err && (err as any).status === 403) {
          setIsAdmin(false);
        }
        setError(err instanceof Error ? err.message : "Failed to load organizations");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const totals = useMemo(() => {
    if (!rows.length) {
      return { orgs: 0, teams: 0, members: 0, storage: 0 };
    }
    return rows.reduce(
      (acc, org) => {
        acc.orgs += 1;
        acc.teams += org.teamsCount || 0;
        acc.members += org.membersCount || 0;
        acc.storage += org.storageUsed || 0;
        return acc;
      },
      { orgs: 0, teams: 0, members: 0, storage: 0 }
    );
  }, [rows]);

  const renderTable = () => (
    <div className="overflow-x-auto border rounded-lg bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organization</TableHead>
            <TableHead>Teams</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Storage Used</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((org, idx) => {
            const key = org.id || `${org.name}-${idx}`;
            return (
              <TableRow key={key}>
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell>{org.teamsCount}</TableCell>
                <TableCell>{org.membersCount}</TableCell>
                <TableCell>{formatBytes(org.storageUsed)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/ops-admin/orgs/${org.id}`}>View Details</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Organizations</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
          </Card>
        </div>
      );
    }

    if (isAdmin === false) {
      return <div className="text-sm text-yellow-700">Forbidden: You are not a platform admin.</div>;
    }

    if (error) {
      return <div className="text-sm text-red-600">Error: {error}</div>;
    }

    if (!rows.length) {
      return <div className="text-sm text-muted-foreground">No organizations found.</div>;
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Organizations</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{totals.orgs}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Teams</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{totals.teams}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Members</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{totals.members}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Storage Used</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{formatBytes(totals.storage)}</CardContent>
          </Card>
        </div>

        {renderTable()}
      </div>
    );
  };

  return (
    <OpsAdminLayout>
      <div className="min-h-screen bg-background text-foreground">
        <div className="border-b bg-muted/40">
          <div className="px-6 py-6">
            <h1 className="text-2xl font-semibold">Organizations</h1>
            <p className="text-sm text-muted-foreground">Inspect tenant health and open diagnostics.</p>
          </div>
        </div>
        <div className="px-6 py-6">{renderContent()}</div>
      </div>
    </OpsAdminLayout>
  );
}
