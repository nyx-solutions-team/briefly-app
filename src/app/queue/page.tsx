"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  FileType,
  Calendar,
  Bookmark,
  ListChecks,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, getApiContext } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatAppDateTime, parseFlexibleDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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

// Helper to get file type icon and color based on mime type or filename
function getFileTypeIcon(mimeType?: string, filename?: string): { icon: React.ElementType; color: string; bg: string } {
  const mime = (mimeType || "").toLowerCase();
  const ext = filename?.split(".").pop()?.toLowerCase() || "";

  // PDF
  if (mime.includes("pdf") || ext === "pdf") {
    return { icon: FileText, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30" };
  }

  // Images
  if (mime.includes("image") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
    return { icon: FileImage, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" };
  }

  // Excel / Spreadsheets
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime.includes("csv") ||
    ["xlsx", "xls", "csv", "ods"].includes(ext)
  ) {
    return { icon: FileSpreadsheet, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30" };
  }

  // Word documents
  if (
    mime.includes("word") ||
    mime.includes("document") ||
    ["doc", "docx", "odt", "rtf"].includes(ext)
  ) {
    return { icon: FileType, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" };
  }

  // Plain text / Markdown
  if (mime.includes("text") || ["txt", "md", "markdown"].includes(ext)) {
    return { icon: FileText, color: "text-gray-600", bg: "bg-gray-100 dark:bg-gray-800" };
  }

  // Default
  return { icon: File, color: "text-primary", bg: "bg-primary/10" };
}

// Skeleton loader for queue cards
function QueueCardSkeleton() {
  return (
    <Card className="animate-in fade-in-50 duration-300">
      <CardContent className="p-5 space-y-4">
        {/* Header with icon and status badge */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>

        {/* Document title */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>


        {/* Category and Date */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Action buttons */}
        <div className="pt-2 border-t flex gap-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 flex-1 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

// Grid of skeleton loaders
function QueueSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <QueueCardSkeleton key={i} />
      ))}
    </div>
  );
}

// API response can be either ingestion job structure or document structure
type IngestionJobResponse = {
  org_id: string;
  doc_id?: string;
  id?: string;
  status?: "pending" | "processing" | "needs_review" | "failed";
  submitted_by?: string;
  submitted_at?: string;
  processing_started_at?: string;
  completed_at?: string;
  storage_key?: string;
  mime_type?: string;
  extraction_key?: string;
  extracted_metadata?: {
    title?: string;
    summary?: string;
    category?: string;
    tags?: string[];
    keywords?: string[];
    sender?: string;
    receiver?: string;
    documentDate?: string;
    subject?: string;
    description?: string;
  };
  failure_reason?: string | null;
  title?: string;
  filename?: string;
  description?: string;
  uploaded_at?: string;
  folder_path?: string[];
  subject?: string;
  category?: string;
  tags?: string[];
  keywords?: string[];
  sender?: string;
  receiver?: string;
  document_date?: string;
  type?: string;
  owner_user_id?: string;
  document?: {
    id: string;
    title: string;
    filename: string;
    description?: string;
    uploaded_at: string;
    folder_path?: string[];
  };
};

type PaginatedResponse = {
  items: IngestionJobResponse[];
  total: number;
  totalAll?: number;
  page: number;
  limit: number;
  totalPages: number;
  statusCounts?: {
    pending: number;
    processing: number;
    needs_review: number;
    failed: number;
  };
};

type QueueDocStatus = "ready" | "pending" | "processing" | "error";

type QueueDoc = {
  id: string;
  docId: string;
  title: string;
  filename: string;
  sender?: string;
  receiver?: string;
  documentDate?: string;
  submittedAt?: string;
  category?: string;
  keywords?: string[];
  tags?: string[];
  folderPath?: string[];
  status: QueueDocStatus;
  progress: number;
  note?: string;
  storageKey?: string;
  mimeType?: string;
  extractionKey?: string;
  extractedMetadata?: IngestionJobResponse["extracted_metadata"];
  failureReason?: string | null;
  description?: string;
};

const PAGE_SIZE = 9;

function mapIngestionJobToQueueDoc(job: IngestionJobResponse): QueueDoc {
  const docId = job.doc_id || job.id || job.document?.id || "";
  const docTitle = job.title || job.document?.title || job.filename || job.document?.filename || "";
  const docFilename = job.filename || job.document?.filename || "";
  const docFolderPath = job.folder_path || job.document?.folder_path || [];

  const metadata = job.extracted_metadata || {};
  const serverStatus = job.status || "pending";
  let mappedStatus: QueueDocStatus = "pending";
  let note: string | undefined;

  switch (serverStatus) {
    case "needs_review":
      mappedStatus = "ready";
      break;
    case "processing":
      mappedStatus = "processing";
      note = "Analyzing document…";
      break;
    case "failed":
      mappedStatus = "error";
      note = "Background processing failed.";
      break;
    case "pending":
      mappedStatus = "pending";
      note = "Queued and waiting for worker.";
      break;
    default:
      mappedStatus = "pending";
      break;
  }

  return {
    id: docId,
    docId: docId,
    title: metadata.title || docTitle || docFilename,
    filename: docFilename,
    sender: metadata.sender || job.sender,
    receiver: metadata.receiver || job.receiver,
    documentDate: metadata.documentDate || job.document_date,
    submittedAt: job.submitted_at,
    category: metadata.category || job.category || "General",
    keywords: metadata.keywords || job.keywords || [],
    tags: metadata.tags || job.tags || [],
    folderPath: docFolderPath,
    status: mappedStatus,
    progress: mappedStatus === "ready" ? 100 : mappedStatus === "processing" ? 70 : mappedStatus === "pending" ? 40 : 0,
    note,
    storageKey: job.storage_key || "",
    mimeType: job.mime_type || "",
    extractionKey: job.extraction_key,
    description: metadata.description || metadata.summary || job.description,
    extractedMetadata: {
      ...metadata,
      subject: metadata.subject || job.subject,
      description: metadata.description || metadata.summary || job.description,
    },
    failureReason: job.failure_reason,
  };
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [statusCounts, setStatusCounts] = useState<{
    pending: number;
    processing: number;
    needs_review: number;
    failed: number;
  }>({ pending: 0, processing: 0, needs_review: 0, failed: 0 });

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Status filter: 'all' | 'ready' | 'error' | 'processing' | 'pending'
  type StatusFilter = 'all' | 'ready' | 'error' | 'processing' | 'pending';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Bulk action state
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: 'accept' | 'reject' | null;
    count: number;
  }>({ open: false, action: null, count: 0 });

  // Single card action loading state - tracks which card(s) are being processed
  const [cardActionLoading, setCardActionLoading] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const router = useRouter();
  const fetchedRef = React.useRef(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to page 1 on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchQueue = useCallback(async (showLoading = true, page = 1, search = "", filter: 'all' | 'ready' | 'error' | 'processing' | 'pending' = 'all') => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const orgId = getApiContext().orgId;
      if (!orgId) {
        if (showLoading) {
          toast({
            title: "Error",
            description: "No organization selected",
            variant: "destructive",
          });
        }
        return;
      }

      // Map frontend status to backend status
      // Frontend: ready, error, processing, pending
      // Backend: needs_review, failed, processing, pending
      let statusApiParam = 'pending,processing,needs_review,failed';
      if (filter !== 'all') {
        const statusMap: Record<string, string> = {
          ready: 'needs_review',
          error: 'failed',
          processing: 'processing',
          pending: 'pending',
        };
        statusApiParam = statusMap[filter] || filter;
      }

      const searchParam = search ? `&q=${encodeURIComponent(search)}` : "";
      const response = await apiFetch<PaginatedResponse>(
        `/orgs/${orgId}/ingestion-jobs?status=${statusApiParam}&limit=${PAGE_SIZE}&page=${page}${searchParam}`,
        { skipCache: true }
      );

      // Handle both old array response and new paginated response
      if (Array.isArray(response)) {
        const queueDocs = response.map(mapIngestionJobToQueueDoc);
        setItems(queueDocs);
        setTotalItems(queueDocs.length);
        setTotalPages(1);
      } else {
        const queueDocs = (response.items || []).map(mapIngestionJobToQueueDoc);
        setItems(queueDocs);
        setTotalItems(response.total || 0);
        setTotalPages(response.totalPages || 1);
        // Update status counts from backend
        if (response.statusCounts) {
          setStatusCounts(response.statusCounts);
        }
      }
    } catch (error) {
      console.error("Failed to fetch queue:", error);
      if (showLoading) {
        toast({
          title: "Failed to load queue",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [toast]);

  // Unified fetch effect: handles initial load, page changes, search changes, filter changes, and auto-refresh
  useEffect(() => {
    let mounted = true;
    let isFirstFetch = !fetchedRef.current;

    // Fetch immediately on mount or when page/search/filter changes
    const doFetch = async () => {
      if (!mounted) return;
      // Only show loading on first fetch or explicit page/search/filter changes
      await fetchQueue(isFirstFetch || fetchedRef.current, currentPage, debouncedSearch, statusFilter);
      fetchedRef.current = true;
    };

    doFetch();

    // Auto-refresh every 10 seconds - uses current page, search, and filter values
    const interval = setInterval(() => {
      if (mounted) {
        fetchQueue(false, currentPage, debouncedSearch, statusFilter);
      }
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [currentPage, debouncedSearch, statusFilter, fetchQueue]);

  const openInUploader = (doc: QueueDoc) => {
    const documentState = {
      docId: doc.docId,
      title: doc.title,
      filename: doc.filename,
      sender: doc.sender || "",
      receiver: doc.receiver || "",
      documentDate: doc.documentDate || "",
      subject: doc.extractedMetadata?.subject || "",
      description: doc.extractedMetadata?.description || doc.extractedMetadata?.summary || doc.description || "",
      category: doc.category || "General",
      keywords: doc.keywords || [],
      tags: doc.tags || [],
      folderPath: doc.folderPath || [],
      storageKey: doc.storageKey,
      mimeType: doc.mimeType,
      extractedMetadata: doc.extractedMetadata,
      failureReason:
        doc.status === "error"
          ? doc.note || "Background processing failed. Please review and resubmit."
          : doc.status === "processing"
            ? doc.note || "Analyzing document…"
            : doc.status === "pending"
              ? doc.note || "Queued and waiting for worker."
              : undefined,
    };

    sessionStorage.setItem('queueDocumentState', JSON.stringify(documentState));

    const pathParam = doc.folderPath && doc.folderPath.length > 0
      ? `?path=${encodeURIComponent(doc.folderPath.join('/'))}&fromQueue=true`
      : '?fromQueue=true';

    router.push(`/documents/upload${pathParam}`);
  };

  const formatSubmittedDate = (doc: QueueDoc) => {
    if (!doc.submittedAt) return "—";
    const dt = parseFlexibleDate(doc.submittedAt);
    if (!dt) return doc.submittedAt;
    return formatAppDateTime(dt);
  };

  const getStatusBadgeVariant = (status: QueueDoc["status"]) => {
    switch (status) {
      case "ready":
        return "default";
      case "error":
        return "destructive";
      case "processing":
      case "pending":
        return "secondary";
      default:
        return "secondary";
    }
  };

  // Items are already filtered by backend based on statusFilter
  // We don't need client-side filtering anymore
  const filteredItems = items;

  // Get selected items for checking their statuses
  const selectedItems = items.filter(item => selectedIds.has(item.id));

  // Determine the "locked" status when items are selected
  // If error items are selected, can only select more error items
  // If ready items are selected, can only select more ready items
  const hasSelectedError = selectedItems.some(item => item.status === 'error');
  const hasSelectedReady = selectedItems.some(item => item.status === 'ready');
  const lockedStatus: 'error' | 'ready' | null = hasSelectedError ? 'error' : hasSelectedReady ? 'ready' : null;

  // Check if an item can be selected based on current selection
  const canSelectItem = (item: QueueDoc): boolean => {
    // Only ready and error can be selected
    if (item.status !== 'ready' && item.status !== 'error') return false;

    // If nothing selected, can select any ready/error item
    if (!lockedStatus) return true;

    // If already selected, can always toggle off
    if (selectedIds.has(item.id)) return true;

    // Can only select items matching the locked status
    return item.status === lockedStatus;
  };

  // Selection helpers
  const toggleSelection = (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item || !canSelectItem(item)) return;

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    // Only select items that match the current locked status, or all ready items if nothing locked
    const selectableItems = filteredItems.filter(item => {
      if (item.status !== 'ready' && item.status !== 'error') return false;
      if (!lockedStatus) return item.status === 'ready'; // Default to selecting ready items
      return item.status === lockedStatus;
    });
    const ids = selectableItems.map(item => item.id);
    setSelectedIds(new Set(ids));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Count selectableItems for "Select All"
  const selectableItems = filteredItems.filter(item => canSelectItem(item) || selectedIds.has(item.id));
  const isAllSelected = selectableItems.length > 0 && selectableItems.every(item => selectedIds.has(item.id));
  const selectedCount = selectedIds.size;

  // Can only accept if ALL selected items are 'ready' status
  const canAcceptSelected = selectedItems.length > 0 && selectedItems.every(item => item.status === 'ready');

  // Can reject any selected items (ready or error)
  const canRejectSelected = selectedItems.length > 0;

  // Bulk action handlers
  const handleBulkAccept = async () => {
    if (!canAcceptSelected) return;

    setBulkActionLoading(true);
    try {
      const orgId = getApiContext().orgId;
      const docIds = Array.from(selectedIds);

      const response = await apiFetch<{ ok: boolean; accepted: number; failed: number }>(
        `/orgs/${orgId}/ingestion-jobs/bulk-accept`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { docIds },
        }
      );

      toast({
        title: "Documents Accepted",
        description: `Successfully accepted ${response.accepted} document${response.accepted !== 1 ? 's' : ''}${response.failed > 0 ? `. ${response.failed} failed.` : ''}`,
      });

      clearSelection();
      fetchQueue(true, currentPage, debouncedSearch, statusFilter);
    } catch (error) {
      toast({
        title: "Bulk Accept Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBulkActionLoading(false);
      setConfirmDialog({ open: false, action: null, count: 0 });
    }
  };

  const handleBulkReject = async () => {
    if (!canRejectSelected) return;

    setBulkActionLoading(true);
    try {
      const orgId = getApiContext().orgId;
      const docIds = Array.from(selectedIds);

      const response = await apiFetch<{ ok: boolean; rejected: number; failed: number }>(
        `/orgs/${orgId}/ingestion-jobs/bulk-reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { docIds, reason: 'Bulk rejected from queue' },
        }
      );

      toast({
        title: "Documents Rejected",
        description: `Successfully rejected ${response.rejected} document${response.rejected !== 1 ? 's' : ''}${response.failed > 0 ? `. ${response.failed} failed.` : ''}`,
      });

      clearSelection();
      fetchQueue(true, currentPage, debouncedSearch, statusFilter);
    } catch (error) {
      toast({
        title: "Bulk Reject Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBulkActionLoading(false);
      setConfirmDialog({ open: false, action: null, count: 0 });
    }
  };

  // Single card action handlers
  const handleSingleAccept = async (docId: string) => {
    setCardActionLoading(prev => new Set(prev).add(docId));
    try {
      const orgId = getApiContext().orgId;
      await apiFetch<{ ok: boolean }>(
        `/orgs/${orgId}/ingestion-jobs/${docId}/accept`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      toast({
        title: "Document Accepted",
        description: "The document has been added to your library.",
      });

      fetchQueue(true, currentPage, debouncedSearch, statusFilter);
    } catch (error) {
      toast({
        title: "Accept Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCardActionLoading(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleSingleReject = async (docId: string) => {
    setCardActionLoading(prev => new Set(prev).add(docId));
    try {
      const orgId = getApiContext().orgId;
      await apiFetch<{ ok: boolean }>(
        `/orgs/${orgId}/ingestion-jobs/${docId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { reason: 'Rejected from queue' },
        }
      );

      toast({
        title: "Document Rejected",
        description: "The document has been removed from the queue.",
      });

      fetchQueue(true, currentPage, debouncedSearch, statusFilter);
    } catch (error) {
      toast({
        title: "Reject Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCardActionLoading(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  // Clear selection when filter or page changes
  useEffect(() => {
    clearSelection();
  }, [statusFilter, currentPage]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Sticky header */}
        <div className="bg-card/50 border-b border-border/50 backdrop-blur-sm sticky top-0 z-10 py-3 px-4 md:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <ListChecks className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-foreground truncate">
                  Queue
                </h1>
                <p className="text-xs text-muted-foreground">
                  {totalItems} item{totalItems !== 1 ? 's' : ''} total
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 md:px-6 space-y-4">
          {/* Search and Filters Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, filename..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {[
                { value: 'all', label: 'All', icon: Filter },
                { value: 'ready', label: 'Ready', icon: CheckCircle2, backendKey: 'needs_review' },
                { value: 'error', label: 'Failed', icon: XCircle, backendKey: 'failed' },
                { value: 'processing', label: 'Processing', icon: Loader2, backendKey: 'processing' },
                { value: 'pending', label: 'Pending', icon: Clock, backendKey: 'pending' },
              ].map(({ value, label, icon: Icon, backendKey }) => {
                // Use counts from backend statusCounts
                const count = value === 'all'
                  ? statusCounts.pending + statusCounts.processing + statusCounts.needs_review + statusCounts.failed
                  : statusCounts[backendKey as keyof typeof statusCounts] || 0;
                return (
                  <button
                    key={value}
                    onClick={() => {
                      setStatusFilter(value as typeof statusFilter);
                      setCurrentPage(1); // Reset to page 1 when changing filter
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${statusFilter === value
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${value === 'processing' && statusFilter === value ? 'animate-spin' : ''}`} />
                    <span className="hidden md:inline">{label}</span>
                    {count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusFilter === value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bulk Action Bar */}
          {!loading && filteredItems.length > 0 && (
            <div className="flex items-center justify-between bg-muted/30 border rounded-lg px-4 py-2">
              <div className="flex items-center gap-3">
                {/* Select All Checkbox */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={isAllSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        selectAll();
                      } else {
                        clearSelection();
                      }
                    }}
                  />
                  <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    {isAllSelected ? 'Deselect All' : 'Select All'}
                  </label>
                </div>

                {selectedCount > 0 && (
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    {selectedCount} selected
                    {lockedStatus && (
                      <Badge variant="outline" className={`text-[10px] ${lockedStatus === 'ready'
                        ? 'border-green-200 text-green-700 dark:border-green-800 dark:text-green-400'
                        : 'border-red-200 text-red-700 dark:border-red-800 dark:text-red-400'
                        }`}>
                        {lockedStatus === 'ready' ? 'Ready items' : 'Failed items'}
                      </Badge>
                    )}
                  </span>
                )}
              </div>

              {/* Bulk Action Buttons */}
              {selectedCount > 0 && (
                <div className="flex items-center gap-2">
                  {/* Accept Button - only show if ALL selected are 'ready' */}
                  {canAcceptSelected && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:hover:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                      onClick={() => setConfirmDialog({ open: true, action: 'accept', count: selectedCount })}
                      disabled={bulkActionLoading}
                    >
                      {bulkActionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Check className="h-4 w-4 mr-1" />
                      )}
                      Accept ({selectedCount})
                    </Button>
                  )}

                  {/* Reject Button - always available when items selected */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                    onClick={() => setConfirmDialog({ open: true, action: 'reject', count: selectedCount })}
                    disabled={bulkActionLoading}
                  >
                    {bulkActionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <X className="h-4 w-4 mr-1" />
                    )}
                    Reject ({selectedCount})
                  </Button>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <QueueSkeletonGrid count={9} />
          ) : filteredItems.length === 0 ? (
            <div className="text-sm text-muted-foreground p-6 text-center border rounded-2xl">
              {debouncedSearch
                ? `No results for "${debouncedSearch}"`
                : statusFilter !== 'all'
                  ? `No ${statusFilter} documents in queue.`
                  : 'No queued documents.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((doc) => {
                const { icon: FileIcon, color: iconColor, bg: iconBg } = getFileTypeIcon(doc.mimeType, doc.filename);
                const isSelected = selectedIds.has(doc.id);
                const canSelect = canSelectItem(doc);
                return (
                  <Card
                    key={doc.id}
                    className={`transition-all group ${isSelected
                      ? 'ring-2 ring-primary ring-offset-2'
                      : canSelect
                        ? 'hover:shadow-md cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                      }`}
                    onClick={() => canSelect && toggleSelection(doc.id)}
                  >
                    <CardContent className="p-5 space-y-4">
                      {/* Header with checkbox, icon and status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isSelected}
                            disabled={!canSelect && !isSelected}
                            onCheckedChange={() => toggleSelection(doc.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="data-[state=checked]:bg-primary"
                          />
                          <div className={`h-10 w-10 rounded-md ${iconBg} ${iconColor} flex items-center justify-center`}>
                            <FileIcon className="h-5 w-5" />
                          </div>
                        </div>
                        <Badge
                          variant={getStatusBadgeVariant(doc.status)}
                          className="capitalize text-xs"
                        >
                          {doc.status}
                        </Badge>
                      </div>

                      {/* Document name */}
                      <div className="space-y-1">
                        <div className="font-semibold line-clamp-2 text-sm" title={doc.title || doc.filename}>
                          {doc.title || doc.filename}
                        </div>
                      </div>


                      {/* Category and Date */}
                      <div className="flex items-center justify-between text-xs">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          <Bookmark className="h-3 w-3 mr-1" />
                          {doc.category || "General"}
                        </Badge>
                        <div className="flex items-center gap-1 text-muted-foreground" title="Submitted at">
                          <Calendar className="h-3 w-3" />
                          <span>{formatSubmittedDate(doc)}</span>
                        </div>
                      </div>

                      {/* Helper note */}
                      {doc.note && (
                        <div className="text-xs text-muted-foreground rounded border bg-muted/30 px-2 py-1">
                          {doc.note}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="pt-2 border-t">
                        {(doc.status === "ready" || doc.status === "error") ? (
                          <div className="flex gap-2">
                            {/* Accept button - only for ready documents */}
                            {doc.status === "ready" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 text-xs border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 hover:border-green-300 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/30"
                                disabled={cardActionLoading.has(doc.docId)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSingleAccept(doc.docId);
                                }}
                              >
                                {cardActionLoading.has(doc.docId) ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="h-3 w-3 mr-1" />
                                    Accept
                                  </>
                                )}
                              </Button>
                            )}

                            {/* Reject button - for both ready and error */}
                            <Button
                              variant="outline"
                              size="sm"
                              className={`${doc.status === "ready" ? "flex-1" : "flex-[2]"} text-xs border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-300 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30`}
                              disabled={cardActionLoading.has(doc.docId)}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSingleReject(doc.docId);
                              }}
                            >
                              {cardActionLoading.has(doc.docId) && doc.status === "error" ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <X className="h-3 w-3 mr-1" />
                                  Reject
                                </>
                              )}
                            </Button>

                            {/* Review button */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs"
                              disabled={cardActionLoading.has(doc.docId)}
                              onClick={(e) => {
                                e.stopPropagation();
                                openInUploader(doc);
                              }}
                            >
                              Review
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            disabled
                          >
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            {doc.status === "processing" ? "Processing…" : "Pending…"}
                          </Button>
                        )}
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
      </div>

      {/* Bulk Action Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, action: null, count: 0 })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirmDialog.action === 'accept' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Accept {confirmDialog.count} Document{confirmDialog.count !== 1 ? 's' : ''}?
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Reject {confirmDialog.count} Document{confirmDialog.count !== 1 ? 's' : ''}?
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === 'accept' ? (
                <>
                  This will accept the selected documents and move them out of the queue.
                  They will be available in your document library.
                </>
              ) : (
                <>
                  This will permanently delete the selected documents and their files.
                  <span className="font-medium text-destructive"> This action cannot be undone.</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkActionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDialog.action === 'accept' ? handleBulkAccept : handleBulkReject}
              disabled={bulkActionLoading}
              className={confirmDialog.action === 'accept'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
              }
            >
              {bulkActionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                confirmDialog.action === 'accept' ? 'Accept All' : 'Reject All'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
