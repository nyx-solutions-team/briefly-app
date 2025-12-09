"use client";

import React, { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { apiFetch, getApiContext } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useSettings } from '@/hooks/use-settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Trash2, RotateCcw, RefreshCw, FileText, Clock, AlertTriangle, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatAppDateTime } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
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

function getThemeColors(accentColor: string) {
  const colorMap: Record<string, {
    primary: string;
    iconBg: string;
  }> = {
    default: {
      primary: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-100 dark:bg-blue-800/40'
    },
    red: {
      primary: 'text-red-600 dark:text-red-400',
      iconBg: 'bg-red-100 dark:bg-red-800/40'
    },
    rose: {
      primary: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-100 dark:bg-rose-800/40'
    },
    orange: {
      primary: 'text-orange-600 dark:text-orange-400',
      iconBg: 'bg-orange-100 dark:bg-orange-800/40'
    },
    amber: {
      primary: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-100 dark:bg-amber-800/40'
    },
    yellow: {
      primary: 'text-yellow-600 dark:text-yellow-400',
      iconBg: 'bg-yellow-100 dark:bg-yellow-800/40'
    },
    lime: {
      primary: 'text-lime-600 dark:text-lime-400',
      iconBg: 'bg-lime-100 dark:bg-lime-800/40'
    },
    green: {
      primary: 'text-green-600 dark:text-green-400',
      iconBg: 'bg-green-100 dark:bg-green-800/40'
    },
    emerald: {
      primary: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-100 dark:bg-emerald-800/40'
    },
    teal: {
      primary: 'text-teal-600 dark:text-teal-400',
      iconBg: 'bg-teal-100 dark:bg-teal-800/40'
    },
    cyan: {
      primary: 'text-cyan-600 dark:text-cyan-400',
      iconBg: 'bg-cyan-100 dark:bg-cyan-800/40'
    },
    sky: {
      primary: 'text-sky-600 dark:text-sky-400',
      iconBg: 'bg-sky-100 dark:bg-sky-800/40'
    },
    blue: {
      primary: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-100 dark:bg-blue-800/40'
    },
    indigo: {
      primary: 'text-indigo-600 dark:text-indigo-400',
      iconBg: 'bg-indigo-100 dark:bg-indigo-800/40'
    },
    violet: {
      primary: 'text-violet-600 dark:text-violet-400',
      iconBg: 'bg-violet-100 dark:bg-violet-800/40'
    },
    purple: {
      primary: 'text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-100 dark:bg-purple-800/40'
    },
    fuchsia: {
      primary: 'text-fuchsia-600 dark:text-fuchsia-400',
      iconBg: 'bg-fuchsia-100 dark:bg-fuchsia-800/40'
    },
    pink: {
      primary: 'text-pink-600 dark:text-pink-400',
      iconBg: 'bg-pink-100 dark:bg-pink-800/40'
    },
  };
  return colorMap[accentColor] || colorMap.default;
}

type BinDoc = {
  id: string;
  name: string;
  title?: string | null;
  filename?: string | null;
  deletedAt?: string | null;
  deleted_at?: string | null;
  purgeAfter?: string | null;
  purge_after?: string | null;
  departmentId?: string | null;
  department_id?: string | null;
};

type PaginatedResponse = {
  items: BinDoc[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function AccessDenied({ message }: { message: string }) {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <Card className="rounded-xl border border-border bg-card shadow-sm">
        <CardContent className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Access Denied</h3>
          <p className="text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

const PAGE_SIZE = 20;

export default function RecycleBinPage() {
  const { isAuthenticated, hasPermission, bootstrapData } = useAuth();
  const [items, setItems] = useState<BinDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'single' | 'bulk'; id?: string; count?: number } | null>(null);

  // Check page permission with fallback to functional permissions for backward compatibility
  const permissions = bootstrapData?.permissions || {};
  const canAccessRecycleBin = permissions['pages.recycle_bin'] === true;
  const canManageMembers = hasPermission('org.manage_members');
  const canDeleteDocuments = hasPermission('documents.delete');
  const hasAccess = canAccessRecycleBin || canManageMembers || canDeleteDocuments;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const refresh = useCallback(async (page = 1, search = "") => {
    setLoading(true);
    try {
      const { orgId } = getApiContext();
      const searchParam = search ? `&q=${encodeURIComponent(search)}` : "";
      const res = await apiFetch<PaginatedResponse | BinDoc[]>(
        `/orgs/${orgId}/recycle-bin?page=${page}&limit=${PAGE_SIZE}${searchParam}`
      );

      // Handle both old array and new paginated response
      if (Array.isArray(res)) {
        setItems(res || []);
        setTotalItems(res.length);
        setTotalPages(1);
      } else {
        setItems(res.items || []);
        setTotalItems(res.total || 0);
        setTotalPages(res.totalPages || 1);
      }

      setSelectedIds((prev) => {
        const validItems = Array.isArray(res) ? res : res.items || [];
        const valid = new Set(validItems.map((d) => d.id));
        return prev.filter((id) => valid.has(id));
      });
    } catch (e) {
      console.error('Failed to load recycle bin', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && hasAccess) {
      refresh(currentPage, debouncedSearch);
    }
  }, [isAuthenticated, hasAccess, currentPage, debouncedSearch, refresh]);

  // Show access denied if no permission
  if (!hasAccess && bootstrapData) {
    return (
      <AppLayout>
        <AccessDenied message="You don't have permission to access the recycle bin." />
      </AppLayout>
    );
  }

  useEffect(() => {
    const handleUpdate = () => refresh(currentPage, debouncedSearch);
    window.addEventListener('documentDeleted', handleUpdate);
    window.addEventListener('documentRestored', handleUpdate);
    window.addEventListener('documentPurged', handleUpdate);
    return () => {
      window.removeEventListener('documentDeleted', handleUpdate);
      window.removeEventListener('documentRestored', handleUpdate);
      window.removeEventListener('documentPurged', handleUpdate);
    };
  }, [refresh, currentPage, debouncedSearch]);

  const restore = async (id: string) => {
    setLoading(true);
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${id}/restore`, { method: 'POST' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('documentRestored', { detail: { id } }));
      }
      await refresh(currentPage, debouncedSearch);
    } catch (e) { console.error('restore failed', e); } finally { setLoading(false); }
  };

  // Open delete confirmation dialog for single document
  const confirmDelete = (id: string) => {
    setDeleteTarget({ type: 'single', id });
    setDeleteDialogOpen(true);
  };

  // Open delete confirmation dialog for bulk delete
  const confirmBulkDelete = () => {
    if (!selectedIds.length) return;
    setDeleteTarget({ type: 'bulk', count: selectedIds.length });
    setDeleteDialogOpen(true);
  };

  // Execute the delete action
  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleteDialogOpen(false);
    setLoading(true);

    try {
      const { orgId } = getApiContext();

      if (deleteTarget.type === 'single' && deleteTarget.id) {
        await apiFetch(`/orgs/${orgId}/documents/${deleteTarget.id}/permanent`, { method: 'DELETE' });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('documentPurged', { detail: { id: deleteTarget.id } }));
        }
      } else if (deleteTarget.type === 'bulk') {
        const result = await apiFetch<{ deleted: number; totalBytes: number }>(
          `/orgs/${orgId}/documents/bulk-delete`,
          {
            method: 'POST',
            body: { ids: selectedIds }
          }
        );
        console.log(`Bulk deleted ${result.deleted} documents`);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('documentPurged', { detail: { ids: selectedIds } }));
        }
        setSelectedIds([]);
      }

      await refresh(currentPage, debouncedSearch);
    } catch (e) {
      console.error('delete failed', e);
    } finally {
      setLoading(false);
      setDeleteTarget(null);
    }
  };

  const toggleSelect = (id: string, checked: boolean | string) => {
    const isChecked = checked === true;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isChecked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return Array.from(next);
    });
  };

  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const toggleSelectAll = (checked: boolean | string) => {
    const isChecked = checked === true;
    if (!items.length) return;
    if (isChecked) {
      setSelectedIds(items.map((d) => d.id));
    } else {
      setSelectedIds([]);
    }
  };

  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);

  if (loading && items.length === 0) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="rounded-xl border border-border bg-card shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-64" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Permanently Delete {deleteTarget?.type === 'bulk' ? 'Documents' : 'Document'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base">
                {deleteTarget?.type === 'bulk' ? (
                  <>
                    Are you sure you want to permanently delete <strong>{deleteTarget.count} document{(deleteTarget.count || 0) === 1 ? '' : 's'}</strong>?
                  </>
                ) : (
                  <>Are you sure you want to permanently delete this document?</>
                )}
                <br />
                <span className="text-destructive font-medium mt-2 block">
                  This action cannot be undone.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={executeDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Header with stats */}
        <Card className="rounded-xl border border-border bg-card shadow-sm card-premium">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-foreground text-xl font-semibold flex items-center gap-2">
                  <Trash2 className={`h-5 w-5 ${themeColors.primary}`} />
                  Trashed Documents
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalItems === 0 ? 'No documents in recycle bin' : `${totalItems} document${totalItems === 1 ? '' : 's'} scheduled for purge`}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => refresh(currentPage, debouncedSearch)}
                disabled={loading}
                className="gap-2 hover-premium focus-premium"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Bulk actions */}
        {items.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/80 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all documents"
              />
              <span className="text-sm text-muted-foreground">
                {selectedIds.length
                  ? `${selectedIds.length} selected`
                  : 'Select documents to enable bulk actions'}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={!selectedIds.length || loading}
                onClick={confirmBulkDelete}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete selected
              </Button>
            </div>
          </div>
        )}

        {/* Documents list */}
        {items.length === 0 ? (
          <Card className="rounded-xl border border-border bg-card shadow-sm card-premium">
            <CardContent className="p-12 text-center">
              <div className={`w-16 h-16 rounded-full ${themeColors.iconBg} flex items-center justify-center mx-auto mb-4`}>
                <Trash2 className={`h-8 w-8 ${themeColors.primary}`} />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {debouncedSearch ? 'No Results' : 'Recycle Bin is Empty'}
              </h3>
              <p className="text-muted-foreground">
                {debouncedSearch
                  ? `No documents matching "${debouncedSearch}"`
                  : 'Deleted documents will appear here before being permanently removed.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((d) => {
              const purgeDateString = d.purge_after || d.purgeAfter;
              const purgeDate = purgeDateString ? new Date(purgeDateString) : null;
              const daysUntilPurge = purgeDate ? Math.ceil((purgeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
              const isUrgent = daysUntilPurge !== null && daysUntilPurge <= 2;

              return (
                <Card key={d.id} className="rounded-xl border border-border bg-card shadow-sm card-premium hover-premium">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <Checkbox
                          checked={selectedIds.includes(d.id)}
                          onCheckedChange={(val) => toggleSelect(d.id, Boolean(val))}
                          aria-label={`Select ${d.title || d.filename || d.name || d.id}`}
                          className="mt-1"
                        />
                        <div className={`w-12 h-12 rounded-lg ${themeColors.iconBg} flex items-center justify-center border border-border/30 shadow-sm`}>
                          <FileText className={`h-6 w-6 ${themeColors.primary}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-foreground truncate" title={d.title || d.filename || d.name || d.id}>
                            {d.title || d.filename || d.name || d.id}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>Purge {purgeDate ? formatAppDateTime(purgeDate) : '—'}</span>
                            </div>
                            {daysUntilPurge !== null && (
                              <Badge
                                variant="outline"
                                className={`text-xs ${isUrgent
                                    ? 'text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20'
                                    : 'text-orange-600 border-orange-200 bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:bg-orange-900/20'
                                  }`}
                              >
                                {daysUntilPurge <= 0 ? 'Expired' : `${daysUntilPurge} day${daysUntilPurge === 1 ? '' : 's'} left`}
                              </Badge>
                            )}
                            {isUrgent && (
                              <Badge variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Urgent
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restore(d.id)}
                          disabled={loading}
                          className="gap-2 hover-premium focus-premium"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Restore
                        </Button>
                        {hasPermission('documents.delete') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => confirmDelete(d.id)}
                            disabled={loading}
                            className="gap-2"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || loading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loading}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
