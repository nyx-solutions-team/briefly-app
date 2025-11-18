"use client";
import React, { useEffect, useState } from 'react';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { OpsHeaderSync } from '@/components/ops/ops-header-context';

type OrgStats = {
  id: string;
  name: string;
  storageUsed: number;
  teamsCount: number;
  membersCount: number;
  documentsCount: number;
};

export default function OrgsListPage() {
  const [orgs, setOrgs] = useState<OrgStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const data = await apiFetch<OrgStats[]>('/ops/simple-orgs');
        setOrgs(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load organizations');
      } finally {
        setLoading(false);
      }
    };

    fetchOrgs();
  }, []);

  return (
    <SimpleOpsLayout showFilters={false}>
      <OpsHeaderSync
        title="Organizations"
        subtitle="Review workspace growth, usage, and jump into detailed diagnostics."
        backHref="/ops"
        backLabel="Back to Ops"
      />
      <div className="px-4 md:px-6 py-4">
        {loading ? (
          <Card>
            <CardContent className="flex h-32 items-center justify-center">
              <div className="text-muted-foreground">Loading organizations...</div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="flex h-32 items-center justify-center">
              <div className="text-destructive">Error: {error}</div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Organization Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Storage Used</TableHead>
                    <TableHead>Teams</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Total documents</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(orgs) && orgs.length > 0 ? (
                    orgs.map((org) => (
                      <TableRow key={org.id}>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell>{formatBytes(org.storageUsed)}</TableCell>
                        <TableCell>{org.teamsCount}</TableCell>
                        <TableCell>{org.membersCount}</TableCell>
                      <TableCell>{org.documentsCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/ops/orgs/${org.id}`}>View</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No organizations found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </SimpleOpsLayout>
  );
}
