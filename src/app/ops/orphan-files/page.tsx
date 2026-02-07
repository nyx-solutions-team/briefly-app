"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useOpsPageHeader } from '@/components/ops/ops-header-context';

type OrphanSummary = {
  orgId: string;
  name: string;
  orphanFiles: number;
  storageBytes: number;
  docKeys: number;
  storageObjects: number;
  scannedAt?: string;
};

export default function OrphanStoragePage() {
  return (
    <SimpleOpsLayout showFilters={false}>
      <OrphanStorageContent />
    </SimpleOpsLayout>
  );
}

function OrphanStorageContent() {
  const [summary, setSummary] = useState<OrphanSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'name' | 'files' | 'storage'>('files');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [bucket, setBucket] = useState<string>('documents');

  useOpsPageHeader({
    title: 'Orphaned Storage',
    subtitle: 'Audit Supabase buckets for orphaned objects and drill into affected orgs.',
    backHref: '/ops',
    backLabel: 'Back to Ops',
  });

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const resp = await apiFetch<{ bucket: string; rows: OrphanSummary[] }>(`/ops/orphan-storage?bucket=${bucket}`, { skipCache: true });
      setSummary(resp?.rows || []);
    } catch (err) {
      console.error(err);
      setSummaryError(err instanceof Error ? err.message : 'Failed to load summary');
      setSummary([]);
    } finally {
      setSummaryLoading(false);
    }
  }, [bucket]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const sortedSummary = useMemo(() => {
    const rows = [...summary];
    return rows.sort((a, b) => {
      let compare = 0;
      if (sortField === 'name') compare = a.name.localeCompare(b.name);
      else if (sortField === 'files') compare = a.orphanFiles - b.orphanFiles;
      else compare = a.storageBytes - b.storageBytes;
      return sortDir === 'asc' ? compare : -compare;
    });
  }, [summary, sortField, sortDir]);

  const handleSort = (field: 'name' | 'files' | 'storage') => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="px-4 md:px-6 py-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Summary by Organization</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Use the View action to drill down into a dedicated detail page.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Bucket</span>
            <Select value={bucket} onValueChange={(val) => setBucket(val)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="documents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="documents">documents</SelectItem>
                <SelectItem value="previews">previews</SelectItem>
                <SelectItem value="extractions">extractions</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void loadSummary()}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, idx) => (
                <Skeleton key={idx} className="h-10" />
              ))}
            </div>
          ) : summaryError ? (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{summaryError}</AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                      Organization {sortField === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('files')}>
                      Orphan Files {sortField === 'files' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('storage')}>
                      Orphan Storage {sortField === 'storage' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSummary.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No orphaned storage found.
                      </TableCell>
                    </TableRow>
                  )}
                  {sortedSummary.map((row) => (
                    <TableRow key={row.orgId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.orphanFiles}</TableCell>
                      <TableCell>{formatBytes(row.storageBytes)}</TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/ops/orphan-files/${row.orgId}?bucket=${bucket}`}>
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
