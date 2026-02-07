"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Trash2,
  RotateCcw,
  RefreshCw,
  FileText,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Clock,
  AlertCircle,
  Archive,
  XCircle,
  Eye,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch, getApiContext } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type BinDoc = {
  id: string;
  name: string;
  title?: string | null;
  filename?: string | null;
  deleted_at?: string | null;
  purge_after?: string | null;
  department_id?: string | null;
  submitterName?: string;
  departmentName?: string;
};

type PaginatedResponse = {
  items: BinDoc[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const PAGE_SIZE = 20;

// Linear-style list item skeleton
function ItemSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border/20 animate-pulse">
      <div className="h-4 w-4 bg-muted/40 rounded" />
      <div className="h-8 w-8 bg-muted/40 rounded-md" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-48 bg-muted/40 rounded" />
        <div className="h-3 w-32 bg-muted/40 rounded" />
      </div>
      <div className="h-5 w-16 bg-muted/40 rounded-full" />
      <div className="flex gap-1">
        <div className="h-7 w-7 bg-muted/40 rounded-md" />
        <div className="h-7 w-7 bg-muted/40 rounded-md" />
      </div>
    </div>
  );
}

export default function RecycleBinPage() {
  const { isAuthenticated, hasPermission, bootstrapData } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<BinDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type: "single" | "bulk";
    id?: string;
    count?: number;
  }>({ open: false, type: "single" });

  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const permissions = bootstrapData?.permissions || {};
  const hasAccess =
    permissions["pages.recycle_bin"] === true ||
    hasPermission("org.manage_members") ||
    hasPermission("documents.delete");

  const fetchBin = useCallback(
    async (showLoading = true, page = 1, search = "") => {
      try {
        if (showLoading) setLoading(true);
        const { orgId } = getApiContext();
        const searchParam = search ? `&q=${encodeURIComponent(search)}` : "";
        const res = await apiFetch<PaginatedResponse | BinDoc[]>(
          `/orgs/${orgId}/recycle-bin?page=${page}&limit=${PAGE_SIZE}${searchParam}`,
          { skipCache: true }
        );

        if (Array.isArray(res)) {
          setItems(res || []);
          setTotalItems(res.length);
          setTotalPages(1);
        } else {
          setItems(res.items || []);
          setTotalItems(res.total || 0);
          setTotalPages(res.totalPages || 1);
        }
      } catch (e) {
        console.error("Failed to load recycle bin", e);
        toast({
          title: "Error",
          description: "Failed to load recycle bin items",
          variant: "destructive",
        });
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (isAuthenticated && hasAccess) {
      fetchBin(true, currentPage, debouncedSearch);
    }
  }, [isAuthenticated, hasAccess, currentPage, debouncedSearch, fetchBin]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleRestore = async (id: string) => {
    setActionLoading((prev) => new Set(prev).add(id));
    try {
      const { orgId } = getApiContext();
      await apiFetch(`/orgs/${orgId}/documents/${id}/restore`, {
        method: "POST",
      });
      toast({
        title: "Document Restored",
        description: "The document has been moved back to your library.",
      });
      fetchBin(true, currentPage, debouncedSearch);
      window.dispatchEvent(new CustomEvent("documentRestored"));
    } catch (e) {
      toast({
        title: "Restore Failed",
        description: "Could not restore the document.",
        variant: "destructive",
      });
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const { orgId } = getApiContext();
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/orgs/${orgId}/documents/${id}/restore`, { method: "POST" })
        )
      );
      toast({ title: `${ids.length} documents restored` });
      setSelectedIds(new Set());
      fetchBin(true, currentPage, debouncedSearch);
      window.dispatchEvent(new CustomEvent("documentRestored"));
    } catch (e) {
      toast({
        title: "Restore Failed",
        description: "Some documents could not be restored.",
        variant: "destructive",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const executeDelete = async () => {
    const { type, id } = deleteDialog;
    setDeleteDialog((prev) => ({ ...prev, open: false }));

    if (type === "bulk") setBulkLoading(true);
    else if (id) setActionLoading((prev) => new Set(prev).add(id));

    try {
      const { orgId } = getApiContext();
      if (type === "single" && id) {
        await apiFetch(`/orgs/${orgId}/documents/${id}/permanent`, {
          method: "DELETE",
        });
        toast({ title: "Deleted Permanently" });
      } else if (type === "bulk") {
        const ids = Array.from(selectedIds);
        await apiFetch(`/orgs/${orgId}/documents/bulk-delete`, {
          method: "POST",
          body: { ids },
        });
        toast({ title: `${ids.length} documents deleted permanently` });
        setSelectedIds(new Set());
      }
      fetchBin(true, currentPage, debouncedSearch);
      window.dispatchEvent(new CustomEvent("documentPurged"));
    } catch (e) {
      toast({
        title: "Deletion Failed",
        description: "Could not permanently delete items.",
        variant: "destructive",
      });
    } finally {
      setBulkLoading(false);
      if (id)
        setActionLoading((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Access denied state
  if (!hasAccess && bootstrapData) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 mx-auto mb-4">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">
              Access Denied
            </h3>
            <p className="text-sm text-muted-foreground">
              You don&apos;t have permission to access the recycle bin. Contact
              your administrator if you believe this is an error.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen flex flex-col">
        {/* Header - Linear style */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10">
                  <Trash2 className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">
                    Recycle Bin
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {loading ? (
                      <span className="inline-block w-32 h-4 bg-muted/30 rounded animate-pulse" />
                    ) : totalItems === 0 ? (
                      "No items in trash"
                    ) : (
                      `${totalItems} item${totalItems !== 1 ? "s" : ""} · Auto-deleted after 30 days`
                    )}
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchBin(true, currentPage, debouncedSearch)}
                disabled={loading}
                className="gap-2 h-8 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", loading && "animate-spin")}
                />
                <span className="hidden sm:inline text-sm">Refresh</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Toolbar - Search & Bulk Actions */}
        <div className="px-6 py-3 border-b border-border/30 bg-background/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Search deleted items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8 bg-muted/30 border-border/40 text-sm placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {selectedIds.size} selected
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearSelection}
                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
                <div className="w-px h-4 bg-border/50" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleBulkRestore}
                  disabled={bulkLoading}
                  className="h-7 gap-1.5 text-sm text-primary hover:text-primary hover:bg-primary/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDeleteDialog({
                      open: true,
                      type: "bulk",
                      count: selectedIds.size,
                    })
                  }
                  disabled={bulkLoading}
                  className="h-7 gap-1.5 text-sm text-red-500 hover:text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* List Header */}
        <div className="hidden md:block px-6 py-2 border-b border-border/30 bg-muted/20">
          <div className="flex items-center gap-4">
            <div className="w-4">
              <Checkbox
                checked={items.length > 0 && selectedIds.size === items.length}
                onCheckedChange={toggleSelectAll}
                disabled={items.length === 0}
                className="h-3.5 w-3.5"
              />
            </div>
            <div className="w-8" /> {/* Icon spacer */}
            <div className="flex-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Document
              </span>
            </div>
            <div className="hidden md:block w-28">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Team
              </span>
            </div>
            <div className="w-24">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Expires
              </span>
            </div>
            <div className="w-20">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right block">
                Actions
              </span>
            </div>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1">
          {loading ? (
            <div>
              {Array.from({ length: 8 }).map((_, i) => (
                <ItemSkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
                <Archive className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">
                {debouncedSearch ? "No matches found" : "Recycle bin is empty"}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                {debouncedSearch
                  ? "Try adjusting your search terms"
                  : "Deleted documents will appear here and be automatically removed after 30 days"}
              </p>
            </div>
          ) : (
            <div>
              {items.map((doc) => {
                const isSelected = selectedIds.has(doc.id);
                const isActionLoading = actionLoading.has(doc.id);
                const purgeDate = doc.purge_after
                  ? new Date(doc.purge_after)
                  : null;
                const daysLeft = purgeDate
                  ? Math.ceil(
                    (purgeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  )
                  : null;
                const isUrgent = daysLeft !== null && daysLeft <= 3;
                const isCritical = daysLeft !== null && daysLeft <= 1;

                return (
                  <div
                    key={doc.id}
                    className={cn(
                      "group px-4 md:px-6 py-3 border-b border-border/20",
                      "hover:bg-muted/30 transition-colors",
                      isSelected && "bg-primary/5 hover:bg-primary/8"
                    )}
                  >
                    {/* Desktop row */}
                    <div className="hidden md:flex items-center gap-4">
                      <div className="w-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelection(doc.id)}
                          className="h-3.5 w-3.5"
                        />
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/40 group-hover:bg-muted/60 transition-colors">
                        <FileText className="h-4 w-4 text-muted-foreground/70" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-medium text-foreground truncate max-w-[280px] sm:max-w-[350px] md:max-w-[400px] block"
                            title={doc.title || doc.name}
                          >
                            {doc.title || doc.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 overflow-hidden">
                          <span className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-[280px] md:max-w-[320px]">
                            {doc.filename || "No filename"}
                          </span>
                          {doc.submitterName && (
                            <>
                              <span className="text-muted-foreground/30 flex-shrink-0">·</span>
                              <span className="text-xs text-muted-foreground truncate max-w-[100px] sm:max-w-[150px]">
                                by {doc.submitterName}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="hidden md:flex items-center gap-1.5 w-28">
                        <span className="flex h-1.5 w-1.5 rounded-full bg-primary/60" />
                        <span className="text-sm text-muted-foreground truncate">
                          {doc.departmentName || "Unassigned"}
                        </span>
                      </div>
                      <div className="w-24">
                        {daysLeft !== null ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs font-normal gap-1",
                              isCritical
                                ? "border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
                                : isUrgent
                                  ? "border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-400"
                                  : "border-border/50 text-muted-foreground bg-muted/30"
                            )}
                          >
                            {isCritical && <AlertCircle className="h-3 w-3" />}
                            <Clock
                              className={cn(
                                "h-3 w-3",
                                !isCritical && "opacity-60"
                              )}
                            />
                            {daysLeft <= 0 ? "Today" : `${daysLeft}d`}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">
                            —
                          </span>
                        )}
                      </div>
                      <div className="w-20 flex justify-end gap-1">
                        {hasPermission("documents.read") && (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                >
                                  <Link href={`/documents/${doc.id}`}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                View
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => handleRestore(doc.id)}
                                disabled={isActionLoading}
                              >
                                {isActionLoading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Restore
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {hasPermission("documents.delete") && (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                  onClick={() =>
                                    setDeleteDialog({
                                      open: true,
                                      type: "single",
                                      id: doc.id,
                                    })
                                  }
                                  disabled={isActionLoading}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Delete permanently
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>

                    {/* Mobile card */}
                    <div className="md:hidden space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelection(doc.id)}
                            className="h-3.5 w-3.5 mt-1"
                          />
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40">
                            <FileText className="h-4 w-4 text-muted-foreground/70" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground truncate">
                              {doc.title || doc.name}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {doc.filename || "No filename"}
                            </div>
                            {doc.submitterName && (
                              <div className="text-[11px] text-muted-foreground truncate">
                                by {doc.submitterName}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {hasPermission("documents.read") && (
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            >
                              <Link href={`/documents/${doc.id}`}>
                                <Eye className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={() => handleRestore(doc.id)}
                            disabled={isActionLoading}
                          >
                            {isActionLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          {hasPermission("documents.delete") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                              onClick={() =>
                                setDeleteDialog({
                                  open: true,
                                  type: "single",
                                  id: doc.id,
                                })
                              }
                              disabled={isActionLoading}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                            {doc.departmentName || "Unassigned"}
                          </span>
                        </div>
                        <div>
                          {daysLeft !== null ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px] font-normal gap-1",
                                isCritical
                                  ? "border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
                                  : isUrgent
                                    ? "border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-400"
                                    : "border-border/50 text-muted-foreground bg-muted/30"
                              )}
                            >
                              {isCritical && <AlertCircle className="h-3 w-3" />}
                              <Clock className={cn("h-3 w-3", !isCritical && "opacity-60")} />
                              {daysLeft <= 0 ? "Today" : `${daysLeft}d`}
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/50">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="sticky bottom-0 px-4 md:px-6 py-3 border-t border-border/40 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="hidden md:inline text-sm text-muted-foreground tabular-nums">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center justify-start md:justify-end gap-2 w-full md:w-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || loading}
                  className="h-8 gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                <span className="md:hidden text-[11px] text-muted-foreground tabular-nums ml-1">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage >= totalPages || loading}
                  className="h-8 gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          !open && setDeleteDialog((prev) => ({ ...prev, open: false }))
        }
      >
        <AlertDialogContent className="max-w-md border-border/40">
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <AlertDialogTitle className="text-base font-semibold text-foreground">
                  Delete{" "}
                  {deleteDialog.type === "bulk"
                    ? `${deleteDialog.count} items`
                    : "item"}{" "}
                  permanently?
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
                  This will permanently delete{" "}
                  {deleteDialog.type === "bulk"
                    ? `these ${deleteDialog.count} documents`
                    : "this document"}{" "}
                  and all associated data.
                  <span className="block mt-2 text-red-500 font-medium">
                    This action cannot be undone.
                  </span>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
            <AlertDialogCancel className="text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              className="bg-red-500 hover:bg-red-600 text-white text-sm"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
