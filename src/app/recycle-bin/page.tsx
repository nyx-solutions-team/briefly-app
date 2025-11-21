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
import { Trash2, RotateCcw, RefreshCw, FileText, Clock, AlertTriangle } from 'lucide-react';
import { formatAppDateTime } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

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

export default function RecycleBinPage() {
  const { isAuthenticated, hasPermission, bootstrapData } = useAuth();
  const [items, setItems] = useState<BinDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Check page permission with fallback to functional permissions for backward compatibility
  const permissions = bootstrapData?.permissions || {};
  const canAccessRecycleBin = permissions['pages.recycle_bin'] === true;
  const canManageMembers = hasPermission('org.manage_members');
  const canDeleteDocuments = hasPermission('documents.delete');
  const hasAccess = canAccessRecycleBin || canManageMembers || canDeleteDocuments;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { orgId } = getApiContext();
      const res = await apiFetch<BinDoc[]>(`/orgs/${orgId}/recycle-bin`);
      setItems(res || []);
      setSelectedIds((prev) => {
        const valid = new Set((res || []).map((d) => d.id));
        return prev.filter((id) => valid.has(id));
      });
    } catch (e) {
      console.error('Failed to load recycle bin', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && hasAccess) refresh();
  }, [isAuthenticated, hasAccess, refresh]);
  
  // Show access denied if no permission
  if (!hasAccess && bootstrapData) {
    return (
      <AppLayout>
        <AccessDenied message="You don't have permission to access the recycle bin." />
      </AppLayout>
    );
  }

  useEffect(() => {
    const handleUpdate = () => refresh();
    window.addEventListener('documentDeleted', handleUpdate);
    window.addEventListener('documentRestored', handleUpdate);
    window.addEventListener('documentPurged', handleUpdate);
    return () => {
      window.removeEventListener('documentDeleted', handleUpdate);
      window.removeEventListener('documentRestored', handleUpdate);
      window.removeEventListener('documentPurged', handleUpdate);
    };
  }, [refresh]);

  const restore = async (id: string) => {
    setLoading(true);
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${id}/restore`, { method: 'POST' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('documentRestored', { detail: { id } }));
      }
      await refresh();
    } catch (e) { console.error('restore failed', e); } finally { setLoading(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Permanently delete this document? This cannot be undone.')) return;
    setLoading(true);
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${id}/permanent`, { method: 'DELETE' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('documentPurged', { detail: { id } }));
      }
      await refresh();
    } catch (e) { console.error('permanent delete failed', e); } finally { setLoading(false); }
  };

  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Permanently delete ${selectedIds.length} document${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setLoading(true);
    try {
      const { orgId } = getApiContext();
      await Promise.all(
        selectedIds.map((id) =>
          apiFetch(`/orgs/${orgId}/documents/${id}/permanent`, { method: 'DELETE' }).catch((err) => {
            console.error('bulk delete failed for', id, err);
          })
        )
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('documentPurged', { detail: { ids: selectedIds } }));
      }
      setSelectedIds([]);
      await refresh();
    } catch (e) {
      console.error('bulk delete failed', e);
    } finally {
      setLoading(false);
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

  if (loading) {
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
                  {items.length === 0 ? 'No documents in recycle bin' : `${items.length} document${items.length === 1 ? '' : 's'} scheduled for purge`}
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={refresh} 
                disabled={loading}
                className="gap-2 hover-premium focus-premium"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
        </Card>

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
                onClick={bulkDelete}
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
              <h3 className="text-lg font-semibold text-foreground mb-2">Recycle Bin is Empty</h3>
              <p className="text-muted-foreground">Deleted documents will appear here before being permanently removed.</p>
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
                                className={`text-xs ${
                                  isUrgent 
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
                            onClick={() => del(d.id)} 
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
      </div>
    </AppLayout>
  );
}
