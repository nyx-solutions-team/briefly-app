"use client";

import * as React from 'react';
import Link from 'next/link';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { formatAppDateTime, cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { ViewAccessDenied } from '@/components/access-denied';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { FileText, Folder, Link2, RefreshCw, Trash2 } from 'lucide-react';

type SharedLinkScope = 'mine' | 'org';
type SharedLinkKind = 'document' | 'folder';

type SharedLinkRow = {
  id: string;
  kind: SharedLinkKind;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  views_count: number | null;
  requires_password: boolean;
  allow_download: boolean | null;
  allow_zip_download: boolean | null;
  allow_preview: boolean | null;
  max_views: number | null;
  folder_path: string[] | null;
  doc_id: string | null;
  doc_title: string | null;
  doc_filename: string | null;
};

type SharedLinksResponse = {
  scope: SharedLinkScope;
  links: SharedLinkRow[];
};

function isShareActive(row: SharedLinkRow) {
  if (row.revoked_at) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return false;
  if (row.max_views && Number(row.views_count || 0) >= Number(row.max_views)) return false;
  return true;
}

export default function SharedLinksSettingsPage() {
  const { hasPermission, isLoading: authLoading, bootstrapData } = useAuth();
  const { toast } = useToast();
  const canManageMembers = hasPermission('org.manage_members');
  const canShareDocuments = hasPermission('documents.share');
  const canUseSharedLinksPage = canManageMembers || canShareDocuments;
  const currentUserId = bootstrapData?.user?.id || null;

  const [orgId, setOrgId] = React.useState<string>(getApiContext().orgId || '');
  const [scope, setScope] = React.useState<SharedLinkScope>(canManageMembers ? 'org' : 'mine');
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const [links, setLinks] = React.useState<SharedLinkRow[]>([]);
  const [showInactive, setShowInactive] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = React.useState<SharedLinkRow | null>(null);
  const [confirmLoading, setConfirmLoading] = React.useState(false);

  React.useEffect(() => {
    const off = onApiContextChange(({ orgId }) => {
      setOrgId(orgId || '');
    });
    return () => { off(); };
  }, []);

  React.useEffect(() => {
    if (!canManageMembers) {
      setScope('mine');
      return;
    }
    setScope((prev) => prev || 'org');
  }, [canManageMembers]);

  const loadLinks = React.useCallback(async (opts?: { refreshOnly?: boolean }) => {
    if (!orgId) {
      setLinks([]);
      return;
    }
    const effectiveScope: SharedLinkScope = canManageMembers ? scope : 'mine';
    if (opts?.refreshOnly) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('scope', effectiveScope);
      params.set('includeInactive', showInactive ? '1' : '0');
      const payload = await apiFetch<SharedLinksResponse>(`/orgs/${orgId}/shared-links?${params.toString()}`, { skipCache: true });
      setLinks(Array.isArray(payload?.links) ? payload.links : []);
    } catch (err: any) {
      setLinks([]);
      setError(err?.message || 'Unable to load shared links');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, canManageMembers, scope, showInactive]);

  React.useEffect(() => {
    if (!canUseSharedLinksPage) return;
    void loadLinks();
  }, [canUseSharedLinksPage, loadLinks]);

  const updateLink = React.useCallback(async (row: SharedLinkRow) => {
    if (!orgId || !row?.id) return;
    setRevokingId(row.id);
    setError('');
    try {
      const result = await apiFetch<{ ok: boolean; action?: 'revoked' | 'deleted' }>(`/orgs/${orgId}/shared-links/${row.kind}/${row.id}`, { method: 'DELETE' });
      await loadLinks({ refreshOnly: true });
      return result?.action || (isShareActive(row) ? 'revoked' : 'deleted');
    } catch (err: any) {
      setError(err?.message || 'Failed to update link');
      throw err;
    } finally {
      setRevokingId(null);
    }
  }, [orgId, loadLinks]);

  const confirmUpdateLink = React.useCallback(async () => {
    if (!confirmTarget || confirmLoading) return;
    const row = confirmTarget;
    const rowLabel = row.kind === 'folder'
      ? `/${(row.folder_path || []).join('/') || '/'}`
      : (row.doc_title || row.doc_filename || 'document');

    setConfirmLoading(true);
    try {
      const action = await updateLink(row);
      setConfirmTarget(null);
      toast({
        title: action === 'deleted' ? 'Entry deleted' : 'Link revoked',
        description: action === 'deleted'
          ? `Removed inactive ${row.kind} link entry for ${rowLabel}.`
          : `Revoked ${row.kind} link for ${rowLabel}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Action failed',
        description: err?.message || 'Failed to update shared link.',
        variant: 'destructive',
      });
    } finally {
      setConfirmLoading(false);
    }
  }, [confirmTarget, confirmLoading, updateLink, toast]);

  const filteredLinks = React.useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return links;
    return links.filter((row) => {
      const folderPath = (row.folder_path || []).join('/').toLowerCase();
      const docTitle = (row.doc_title || row.doc_filename || '').toLowerCase();
      return folderPath.includes(query) || docTitle.includes(query);
    });
  }, [links, searchText]);

  if (!authLoading && !canUseSharedLinksPage) {
    return <ViewAccessDenied title="Access Not Allowed" message="You do not have permission to manage shared links." />;
  }

  return (
    <div className="min-h-screen bg-background/30">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="px-8 py-4">
          <h1 className="text-base font-semibold text-foreground tracking-tight">Shared Links</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Manage external file and folder links from one place.
          </p>
        </div>
      </header>

      <div className="p-6 space-y-5 max-w-6xl">
        <div className="rounded-lg border border-border/40 bg-card/40 p-4 flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Search by file name or folder path</label>
            <Input
              placeholder="e.g. Finance/Invoices or PO_2026.pdf"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="w-full md:w-52">
            <label className="text-xs text-muted-foreground">Scope</label>
            {canManageMembers ? (
              <Select value={scope} onValueChange={(value) => setScope(value as SharedLinkScope)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mine">My links</SelectItem>
                  <SelectItem value="org">Organization links</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="mt-1 h-10 rounded-md border border-border/60 bg-muted/20 px-3 text-sm flex items-center text-muted-foreground">
                My links
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-4 md:pt-0">
            <span className="text-sm text-muted-foreground">Show inactive</span>
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          </div>

          <div className="pt-4 md:pt-0">
            <Button variant="outline" onClick={() => { void loadLinks({ refreshOnly: true }); }} disabled={refreshing || loading}>
              {refreshing || loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-border/40 bg-card/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/30 bg-muted/20 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            External Links ({filteredLinks.length})
          </div>

          {loading ? (
            <div className="px-4 py-10 text-sm text-muted-foreground">Loading links...</div>
          ) : filteredLinks.length === 0 ? (
            <div className="px-4 py-10 text-sm text-muted-foreground">No links found for this scope.</div>
          ) : (
            <div className="divide-y divide-border/20">
              {filteredLinks.map((row) => {
                const active = isShareActive(row);
                const canRevoke = canManageMembers || (!!currentUserId && row.created_by === currentUserId);
                const pathLabel = (row.folder_path || []).join('/') || '/';
                const docLabel = row.doc_title || row.doc_filename || 'Untitled document';
                return (
                  <div key={row.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <Badge variant={active ? 'default' : 'outline'} className="text-[10px]">
                          {active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {row.kind === 'folder' ? 'Folder' : 'File'}
                        </Badge>
                        {row.requires_password && <Badge variant="outline" className="text-[10px]">Password</Badge>}
                        {row.allow_zip_download && <Badge variant="outline" className="text-[10px]">ZIP</Badge>}
                        {row.allow_preview && <Badge variant="outline" className="text-[10px]">Preview</Badge>}
                      </div>

                      {row.kind === 'folder' ? (
                        <div className="text-sm font-medium flex items-start gap-2 min-w-0">
                          <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <span className="min-w-0 break-all leading-snug" title={`/${pathLabel}`}>/{pathLabel}</span>
                        </div>
                      ) : (
                        <div className="text-sm font-medium flex items-start gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <span className="min-w-0 break-all leading-snug" title={docLabel}>{docLabel}</span>
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground mt-1">
                        Created {formatAppDateTime(row.created_at)}
                        {row.expires_at ? ` • Expires ${formatAppDateTime(row.expires_at)}` : ''}
                        {typeof row.views_count === 'number' ? ` • ${row.views_count} views` : ''}
                      </p>

                      <div className="mt-1">
                        {row.kind === 'folder' ? (
                          <Link
                            href={`/documents?path=${encodeURIComponent(pathLabel)}`}
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <Link2 className="h-3 w-3" />
                            Open folder
                          </Link>
                        ) : row.doc_id ? (
                          <Link
                            href={`/documents/${row.doc_id}`}
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <Link2 className="h-3 w-3" />
                            Open file
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    <div className={cn('flex items-center gap-2 md:justify-end', !canRevoke && 'opacity-70')}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full md:w-auto"
                        disabled={!canRevoke || revokingId === row.id}
                        onClick={() => setConfirmTarget(row)}
                      >
                        {revokingId === row.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        {active ? 'Revoke' : 'Delete entry'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open && !confirmLoading) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget && isShareActive(confirmTarget) ? 'Revoke shared link?' : 'Delete inactive entry?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget && isShareActive(confirmTarget)
                ? 'This link will stop working immediately.'
                : 'This only removes the inactive record from the list. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmLoading}
              onClick={(e) => {
                e.preventDefault();
                void confirmUpdateLink();
              }}
            >
              {confirmLoading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Processing...
                </>
              ) : (confirmTarget && isShareActive(confirmTarget) ? 'Revoke' : 'Delete entry')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
