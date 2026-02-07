"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { formatBytes, formatOpsDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { OpsHeaderSync } from '@/components/ops/ops-header-context';

type SimpleOrg = { id: string; name: string };
type OrphanRow = {
  path: string;
  size: number;
  mime_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  linkedDocId?: string | null;
};
type OrphanDetailResponse = {
  orgId: string;
  bucket: string;
  total: number;
  page: number;
  pageSize: number;
  rows: OrphanRow[];
  summary?: { total: number; storageBytes: number; docKeys: number; storageObjects: number; scannedAt: string };
};

const PAGE_SIZE = 25;

export default function OrphanStorageDetailPage() {
  const params = useParams<{ orgId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const orgId = params?.orgId;
  const initialBucket = searchParams?.get('bucket') ?? 'documents';

  const [bucket, setBucket] = useState(initialBucket);
  const [orgName, setOrgName] = useState('');
  const [data, setData] = useState<OrphanDetailResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setBucket(initialBucket);
    setPage(1);
  }, [initialBucket]);

  useEffect(() => {
    const loadOrgName = async () => {
      if (!orgId) return;
      try {
        const resp = await apiFetch<SimpleOrg[]>('/ops/simple-orgs', { skipCache: true });
        const match = resp?.find((org) => org.id === orgId);
        if (match) setOrgName(match.name);
      } catch (err) {
        console.error(err);
      }
    };
    void loadOrgName();
  }, [orgId]);

  const loadDetail = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ bucket, page: String(page), pageSize: String(PAGE_SIZE) }).toString();
      const resp = await apiFetch<OrphanDetailResponse>(`/ops/orgs/${orgId}/orphan-storage?${query}`, { skipCache: true });
      setData(resp);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load orphan storage');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [bucket, orgId, page]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.rows;
    const term = search.trim().toLowerCase();
    return data.rows.filter((row) => row.path.toLowerCase().includes(term));
  }, [data, search]);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const renderSummary = () => {
    if (!data?.summary) return null;
    const { total, storageBytes, docKeys, storageObjects, scannedAt } = data.summary;
    return (
      <div className="text-sm text-muted-foreground flex flex-wrap gap-4">
        <span>Orphan files: <strong>{total}</strong></span>
        <span>Orphan storage: <strong>{formatBytes(storageBytes)}</strong></span>
        <span>Storage objects: <strong>{storageObjects}</strong></span>
        <span>Doc keys: <strong>{docKeys}</strong></span>
        {scannedAt && <span>Scanned: {formatOpsDate(scannedAt, { withTime: true })}</span>}
      </div>
    );
  };

  const getFileKind = (row: OrphanRow): 'pdf' | 'image' | 'docx' | 'text' | null => {
    const mime = row.mime_type?.toLowerCase() || '';
    const fileName = row.path.split('/').pop() || row.path;
    const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';
    if (mime.includes('pdf') || ext === 'pdf') return 'pdf';
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
    if (mime.startsWith('image/') || imageExts.includes(ext)) return 'image';
    const docxMimes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (docxMimes.includes(mime) || ext === 'docx') return 'docx';
    const textExts = ['txt', 'md', 'markdown'];
    if (mime.startsWith('text/') || textExts.includes(ext)) return 'text';
    return null;
  };

  const buildPreviewHref = (row: OrphanRow): string | null => {
    if (!orgId) return null;
    const kind = getFileKind(row);
    if (!kind) return null;
    const params = new URLSearchParams({ bucket, key: row.path, kind });
    if (row.mime_type) params.set('mime', row.mime_type);
    if (row.linkedDocId) params.set('docId', row.linkedDocId);
    return `/ops/orphan-files/${orgId}/preview?${params.toString()}`;
  };

  const handleDelete = async (row: OrphanRow) => {
    if (!orgId) return;
    const confirmed = window.confirm(`Delete orphaned file "${row.path}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await apiFetch(`/ops/orgs/${orgId}/orphan-storage`, {
        method: 'DELETE',
        body: { bucket, storageKey: row.path, sizeBytes: row.size },
      });
      toast({ title: 'Deleted', description: `Removed ${row.path}` });
      void loadDetail();
    } catch (err) {
      console.error(err);
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete file',
        variant: 'destructive',
      });
    }
  };

  const handleBucketChange = (val: string) => {
    setBucket(val);
    setPage(1);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('bucket', val);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleRefresh = () => {
    setSearch('');
    setPage(1);
    if (page === 1) void loadDetail();
  };

  const orgLabel = orgName || orgId || 'Unknown org';

  return (
    <SimpleOpsLayout showFilters={false}>
      <OpsHeaderSync
        title={`Orphaned Storage – ${orgLabel}`}
        subtitle="Drill into orphan files for a single workspace."
        backHref="/ops/orphan-files"
        backLabel="Back to summary"
      />
      <div className="px-4 md:px-6 py-4 space-y-4">
        <Card>
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>{orgLabel}</CardTitle>
              {data && (
                <p className="text-sm text-muted-foreground mt-1">
                  {data.total} orphaned file(s) in {bucket} bucket
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={bucket} onValueChange={handleBucketChange}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="documents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="documents">documents</SelectItem>
                  <SelectItem value="previews">previews</SelectItem>
                  <SelectItem value="extractions">extractions</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleRefresh}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderSummary()}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Search path</p>
                <Input placeholder="e.g., orgId/uploads" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="text-sm text-muted-foreground">
                {data?.bucket ? `Viewing Supabase bucket: ${data.bucket}` : 'Bucket info unavailable'}
              </div>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, idx) => (
                  <Skeleton key={idx} className="h-10" />
                ))}
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Storage Key</TableHead>
                      <TableHead>Linked Doc</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No orphaned files found.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredRows.map((row) => {
                      const previewHref = buildPreviewHref(row);
                      return (
                        <TableRow key={row.path}>
                          <TableCell className="font-mono text-xs break-all">
                            {previewHref ? (
                              <Link href={previewHref} className="text-primary underline-offset-2 hover:underline">
                                {row.path}
                              </Link>
                            ) : (
                              row.path
                            )}
                          </TableCell>
                          <TableCell>
                            {row.linkedDocId ? (
                              <Badge variant="secondary" className="font-mono text-[11px]">
                                {row.linkedDocId}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
                          </TableCell>
                          <TableCell>{formatBytes(row.size || 0)}</TableCell>
                          <TableCell>{row.updated_at ? formatOpsDate(row.updated_at, { withTime: true }) : 'N/A'}</TableCell>
                          <TableCell>
                            <Button variant="destructive" size="sm" className="gap-1" onClick={() => handleDelete(row)}>
                              <Trash2 className="h-3 w-3" /> Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {data && data.total > PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Page {page} of {Math.max(1, totalPages)}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </SimpleOpsLayout>
  );
}
