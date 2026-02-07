"use client";

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Loader2, AlertTriangle } from 'lucide-react';
import { formatAppDateTime } from '@/lib/utils';

type SharePayload = {
  share: {
    id: string;
    expiresAt: string;
    allowDownload: boolean;
    allowPreview: boolean;
    requiresPassword: boolean;
    maxViews?: number | null;
    viewsCount?: number | null;
  };
  document: {
    id: string;
    title: string;
    filename?: string | null;
    mimeType?: string | null;
    fileSizeBytes?: number | null;
    type?: string | null;
  };
};

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<SharePayload['share'] | null>(null);
  const [document, setDocument] = useState<SharePayload['document'] | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  useEffect(() => {
    let mounted = true;
    const loadShare = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<SharePayload>(`/shares/${token}`, { skipCache: true });
        if (!mounted) return;
        setShare(data.share);
        setDocument(data.document);
      } catch (err: any) {
        if (!mounted) return;
        if (err?.status === 410) {
          setError('This share link has expired.');
        } else if (err?.status === 404) {
          setError('This share link is invalid.');
        } else {
          setError(err?.message || 'Unable to load shared document.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadShare();
    return () => { mounted = false; };
  }, [token]);

  const downloadFile = async () => {
    if (!token) return;
    setDownloading(true);
    setPasswordError(null);
    try {
      const payload = password ? { password } : {};
      const data: any = await apiFetch(`/shares/${token}/file`, {
        method: 'POST',
        body: payload,
        skipCache: true,
      });
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener');
      }
    } catch (err: any) {
      if (err?.status === 401) {
        setPasswordError('Invalid password.');
      } else if (err?.status === 403) {
        setPasswordError('Downloads are disabled for this link.');
      } else if (err?.status === 410) {
        setError('This share link has expired.');
      } else {
        setPasswordError('Failed to download.');
      }
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading shared document...
        </div>
      </div>
    );
  }

  if (error || !document || !share) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Unable to open document</h1>
          <p className="text-sm text-muted-foreground">{error || 'This share link is no longer available.'}</p>
        </div>
      </div>
    );
  }

  const expiresAt = share.expiresAt ? new Date(share.expiresAt) : null;

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{document.title}</h1>
            <p className="text-sm text-muted-foreground">
              {document.filename || 'Shared document'}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {document.type || 'Document'}
            </Badge>
            {document.mimeType && (
              <Badge variant="outline" className="text-xs">
                {document.mimeType}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {formatSize(document.fileSizeBytes)}
            </Badge>
          </div>
          {expiresAt && (
            <div className="text-xs text-muted-foreground">
              Expires {formatAppDateTime(expiresAt)}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/40 p-4 space-y-3">
          {share.requiresPassword && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password required</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>
          )}

          {passwordError && (
            <div className="text-sm text-destructive">{passwordError}</div>
          )}

          <Button onClick={downloadFile} disabled={downloading || (!share.allowDownload && !share.allowPreview)}>
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download
              </>
            )}
          </Button>
          {!share.allowDownload && !share.allowPreview && (
            <div className="text-xs text-muted-foreground">
              Downloads are disabled for this link.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
