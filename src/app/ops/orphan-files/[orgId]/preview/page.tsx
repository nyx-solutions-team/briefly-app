"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { OpsHeaderSync } from '@/components/ops/ops-header-context';

type SignedUrlResponse = {
  bucket: string;
  storageKey: string;
  url: string;
  expiresAt: string;
};

export default function OrphanFilePreviewPage() {
  const params = useParams<{ orgId: string }>();
  const searchParams = useSearchParams();
  const orgId = params?.orgId;
  const bucket = searchParams?.get('bucket') ?? 'documents';
  const storageKey = searchParams?.get('key') ?? '';
  const mimeParam = (searchParams?.get('mime') ?? '').toLowerCase();
  const kindParam = (searchParams?.get('kind') ?? '').toLowerCase();
  const linkedDocId = searchParams?.get('docId') ?? '';

  const [data, setData] = useState<SignedUrlResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textContent, setTextContent] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);

  const loadSignedUrl = useCallback(async () => {
    if (!orgId || !storageKey) {
      setData(null);
      setError('Missing storage key');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ bucket, storageKey }).toString();
      const resp = await apiFetch<SignedUrlResponse>(`/ops/orgs/${orgId}/orphan-storage/sign?${query}`, { skipCache: true });
      setData(resp);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to fetch signed URL');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, bucket, storageKey]);

  useEffect(() => { void loadSignedUrl(); }, [loadSignedUrl]);

  const viewerType = useMemo(() => {
    const ext = storageKey.split('.').pop()?.toLowerCase() || '';
    const normalizedKind = ['pdf', 'image', 'docx', 'text'].includes(kindParam) ? kindParam : '';
    const normalizedMime = mimeParam || '';
    const textExts = ['txt', 'md', 'markdown'];
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];

    if (normalizedKind) return normalizedKind as 'pdf' | 'image' | 'docx' | 'text';
    if (normalizedMime.includes('pdf') || ext === 'pdf') return 'pdf';
    if (normalizedMime.startsWith('image/') || imageExts.includes(ext)) return 'image';
    if (normalizedMime.includes('wordprocessingml.document') || ext === 'docx') return 'docx';
    if (normalizedMime.startsWith('text/') || textExts.includes(ext)) return 'text';
    return 'unsupported';
  }, [kindParam, mimeParam, storageKey]);

  useEffect(() => {
    if (viewerType !== 'text' || !data?.url) {
      setTextContent('');
      setTextLoading(false);
      setTextError(null);
      return;
    }
    let cancelled = false;
    setTextLoading(true);
    setTextError(null);
    fetch(data.url)
      .then((resp) => {
        if (!resp.ok) throw new Error(`Failed to load text (HTTP ${resp.status})`);
        return resp.text();
      })
      .then((text) => {
        if (!cancelled) {
          setTextContent(text);
          setTextLoading(false);
        }
      })
      .catch((fetchErr) => {
        if (!cancelled) {
          console.error(fetchErr);
          setTextError(fetchErr instanceof Error ? fetchErr.message : 'Failed to load text');
          setTextLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [viewerType, data?.url]);

  const previewMessage = !storageKey
    ? 'No storage key provided.'
    : viewerType === 'unsupported'
      ? 'This file type cannot be previewed inline. Use the download button to inspect it manually.'
      : null;

  const backHref = `/ops/orphan-files/${orgId ?? ''}?bucket=${encodeURIComponent(bucket)}`;

  return (
    <SimpleOpsLayout showFilters={false}>
      <OpsHeaderSync
        title="Orphan File Preview"
        subtitle="Inspect or download an orphaned object before removal."
        backHref={backHref}
        backLabel="Back to details"
      />
      <div className="px-4 md:px-6 py-4 flex justify-center">
        <Card className="w-full max-w-5xl">
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base md:text-lg break-all">{storageKey || 'Unknown storage key'}</CardTitle>
              <p className="text-sm text-muted-foreground">Bucket: {bucket}</p>
              {linkedDocId && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Linked doc:</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {linkedDocId}
                  </Badge>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadSignedUrl()} disabled={loading}>
                Refresh link
              </Button>
              {data?.url && (
                <Button asChild>
                  <Link href={data.url} target="_blank" rel="noopener noreferrer">
                    Open in new tab
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {previewMessage && (
              <Alert>
                <AlertTitle>Preview info</AlertTitle>
                <AlertDescription>{previewMessage}</AlertDescription>
              </Alert>
            )}
            {loading && (
              <div className="space-y-2">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-[70vh] w-full" />
              </div>
            )}
            {!loading && !error && viewerType === 'pdf' && data?.url && (
              <div className="border rounded-md overflow-hidden">
                <iframe src={data.url} className="w-full h-[80vh]" title="PDF preview" />
              </div>
            )}
            {!loading && !error && viewerType === 'image' && data?.url && (
              <div className="border rounded-md overflow-hidden bg-muted/40 flex items-center justify-center">
                <img src={data.url} alt={storageKey} className="max-h-[80vh] w-auto" />
              </div>
            )}
            {!loading && !error && viewerType === 'docx' && data?.url && (
              <div className="border rounded-md overflow-hidden">
                <iframe
                  src={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(data.url)}`}
                  className="w-full h-[80vh]"
                  title="DOCX preview"
                />
              </div>
            )}
            {!loading && !error && viewerType === 'text' && (
              <div className="space-y-2">
                {textError && (
                  <Alert variant="destructive">
                    <AlertTitle>Preview error</AlertTitle>
                    <AlertDescription>{textError}</AlertDescription>
                  </Alert>
                )}
                {textLoading ? (
                  <Skeleton className="h-[40vh] w-full" />
                ) : (
                  <pre className="bg-muted rounded-md p-4 text-sm whitespace-pre-wrap overflow-auto max-h-[80vh] border">
                    {textContent}
                  </pre>
                )}
              </div>
            )}
            {!loading && !error && viewerType !== 'unsupported' && !data?.url && (
              <p className="text-sm text-muted-foreground">Signed URL not available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </SimpleOpsLayout>
  );
}
