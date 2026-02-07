"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import AppLayout from "@/components/layout/app-layout";
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
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Eye,
  User,
  RefreshCw,
  RotateCw,
  Filter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, getApiContext } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatAppDateTime, parseFlexibleDate } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MobileFilterButton,
  FilterSection,
} from "@/components/mobile-filter-button";
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

// Helper to get file type icon and color
function getFileTypeIcon(
  mimeType?: string,
  filename?: string
): { icon: React.ElementType; color: string; bg: string } {
  const mime = (mimeType || "").toLowerCase();
  const ext = filename?.split(".").pop()?.toLowerCase() || "";

  if (mime.includes("pdf") || ext === "pdf") {
    return {
      icon: FileText,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/10",
    };
  }
  if (
    mime.includes("image") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)
  ) {
    return {
      icon: FileImage,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-500/10",
    };
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime.includes("csv") ||
    ["xlsx", "xls", "csv", "ods"].includes(ext)
  ) {
    return {
      icon: FileSpreadsheet,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-500/10",
    };
  }
  if (
    mime.includes("word") ||
    mime.includes("document") ||
    ["doc", "docx", "odt", "rtf"].includes(ext)
  ) {
    return {
      icon: FileType,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
    };
  }
  if (mime.includes("text") || ["txt", "md", "markdown"].includes(ext)) {
    return {
      icon: FileText,
      color: "text-muted-foreground",
      bg: "bg-muted/50",
    };
  }
  return { icon: File, color: "text-primary", bg: "bg-primary/10" };
}

// Linear-style list item skeleton
function ItemSkeleton() {
  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-border/20 animate-pulse">
      <div className="h-4 w-4 bg-muted/40 rounded" />
      <div className="h-8 w-8 bg-muted/40 rounded-md" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-48 bg-muted/40 rounded" />
        <div className="h-3 w-32 bg-muted/40 rounded" />
      </div>
      <div className="h-5 w-16 bg-muted/40 rounded-full" />
      <div className="h-5 w-20 bg-muted/40 rounded-full" />
      <div className="w-24">
        <div className="h-4 w-20 bg-muted/40 rounded" />
      </div>
      <div className="flex gap-1">
        <div className="h-7 w-7 bg-muted/40 rounded-md" />
        <div className="h-7 w-7 bg-muted/40 rounded-md" />
      </div>
    </div>
  );
}

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
  submitterName?: string | null;
  submitterEmail?: string | null;
  submitterRole?: string | null;
  department_id?: string | null;
  vespa_sync_status?: string | null;
  vespa_indexed_at?: string | null;
  vespa_steps_failed?: number | null;
  vespa_chunks_failed?: number | null;
  vespa_steps_total?: number | null;
  vespa_chunks_total?: number | null;
  document?: {
    id: string;
    title: string;
    filename: string;
    description?: string;
    uploaded_at: string;
    folder_path?: string[];
    department_id?: string | null;
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
  submitterName?: string | null;
  submitterEmail?: string | null;
  submitterRole?: string | null;
  vespaSyncStatus?: string;
  vespaStepsFailed?: number;
  vespaChunksFailed?: number;
};

const PAGE_SIZE = 20;

function mapIngestionJobToQueueDoc(job: IngestionJobResponse): QueueDoc {
  const docId = job.doc_id || job.id || job.document?.id || "";
  const docTitle =
    job.title || job.document?.title || job.filename || job.document?.filename || "";
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
    progress:
      mappedStatus === "ready"
        ? 100
        : mappedStatus === "processing"
          ? 70
          : mappedStatus === "pending"
            ? 40
            : 0,
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
    submitterName: job.submitterName || null,
    submitterEmail: job.submitterEmail || null,
    submitterRole: job.submitterRole || null,
    vespaSyncStatus: (job as any).vespa_sync_status,
    vespaStepsFailed: (job as any).vespa_steps_failed || 0,
    vespaChunksFailed: (job as any).vespa_chunks_failed || 0,
  };
}

// Linear-style status badge
function StatusBadge({ status, note }: { status: QueueDocStatus; note?: string }) {
  const config = {
    ready: {
      icon: CheckCircle2,
      label: "Ready",
      className:
        "bg-green-500/10 text-green-600 dark:text-green-400 border-green-200/50 dark:border-green-800/50",
    },
    error: {
      icon: XCircle,
      label: "Failed",
      className:
        "bg-red-500/10 text-red-600 dark:text-red-400 border-red-200/50 dark:border-red-800/50",
    },
    processing: {
      icon: Loader2,
      label: "Processing",
      className:
        "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50",
    },
    pending: {
      icon: Clock,
      label: "Pending",
      className:
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/50",
    },
  };

  const { icon: Icon, label, className } = config[status];
  const isAnimated = status === "processing";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn("gap-1 text-xs font-medium border", className)}
          >
            <Icon className={cn("h-3 w-3", isAnimated && "animate-spin")} />
            {label}
          </Badge>
        </TooltipTrigger>
        {note && (
          <TooltipContent side="top" className="text-xs">
            {note}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileFilterView, setMobileFilterView] = useState<'main' | 'search' | 'status'>('main');
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [statusCounts, setStatusCounts] = useState<{
    pending: number;
    processing: number;
    needs_review: number;
    failed: number;
  }>({ pending: 0, processing: 0, needs_review: 0, failed: 0 });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  type StatusFilter = "all" | "ready" | "error" | "processing" | "pending";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkRetryLoading, setBulkRetryLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: "accept" | "reject" | null;
    count: number;
  }>({ open: false, action: null, count: 0 });

  const [rowActionLoading, setRowActionLoading] = useState<Set<string>>(new Set());
  const [vespaRetryLoading, setVespaRetryLoading] = useState<Set<string>>(new Set());
  const [ingestionRetryLoading, setIngestionRetryLoading] = useState<Set<string>>(new Set());
  const [isPageVisible, setIsPageVisible] = useState(true);

  const { toast } = useToast();
  const router = useRouter();
  const fetchedRef = useRef(false);
  const fetchInFlightRef = useRef(false);
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const updateVisibility = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  const fetchQueue = useCallback(
    async (
      showLoading = true,
      page = 1,
      search = "",
      filter: StatusFilter = "all"
    ) => {
      if (fetchInFlightRef.current && !showLoading) return;
      const seq = ++fetchSeqRef.current;
      fetchInFlightRef.current = true;
      try {
        if (showLoading) setLoading(true);
        const orgId = getApiContext().orgId;
        if (!orgId) {
          if (showLoading) {
            toast({
              title: "Error",
              description: "No organization selected",
              variant: "destructive",
            });
          }
          fetchInFlightRef.current = false;
          return;
        }

        let statusApiParam = "pending,processing,needs_review,failed";
        if (filter !== "all") {
          const statusMap: Record<string, string> = {
            ready: "needs_review",
            error: "failed",
            processing: "processing",
            pending: "pending",
          };
          statusApiParam = statusMap[filter] || filter;
        }

        const searchParam = search ? `&q=${encodeURIComponent(search)}` : "";
        const response = await apiFetch<PaginatedResponse>(
          `/orgs/${orgId}/ingestion-jobs?status=${statusApiParam}&limit=${PAGE_SIZE}&page=${page}${searchParam}`,
          { skipCache: true }
        );

        if (seq !== fetchSeqRef.current) return;

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
        if (seq === fetchSeqRef.current) {
          fetchInFlightRef.current = false;
        }
        if (showLoading) setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    let mounted = true;
    let isFirstFetch = !fetchedRef.current;

    const doFetch = async () => {
      if (!mounted) return;
      await fetchQueue(
        isFirstFetch || fetchedRef.current,
        currentPage,
        debouncedSearch,
        statusFilter
      );
      fetchedRef.current = true;
    };

    doFetch();

    const interval = setInterval(() => {
      if (mounted && isPageVisible) {
        fetchQueue(false, currentPage, debouncedSearch, statusFilter);
      }
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [currentPage, debouncedSearch, statusFilter, fetchQueue, isPageVisible]);

  const openInUploader = (doc: QueueDoc) => {
    const documentState = {
      docId: doc.docId,
      title: doc.title,
      filename: doc.filename,
      sender: doc.sender || "",
      receiver: doc.receiver || "",
      documentDate: doc.documentDate || "",
      subject: doc.extractedMetadata?.subject || "",
      description:
        doc.extractedMetadata?.description ||
        doc.extractedMetadata?.summary ||
        doc.description ||
        "",
      category: doc.category || "General",
      keywords: doc.keywords || [],
      tags: doc.tags || [],
      folderPath: doc.folderPath || [],
      storageKey: doc.storageKey,
      mimeType: doc.mimeType,
      extractedMetadata: doc.extractedMetadata,
      queueStatus: doc.status,
      queueNote: doc.note,
      failureReason:
        doc.status === "error"
          ? doc.note || "Background processing failed. Please review and resubmit."
          : doc.status === "processing"
            ? doc.note || "Analyzing document…"
            : doc.status === "pending"
              ? doc.note || "Queued and waiting for worker."
              : undefined,
    };

    sessionStorage.setItem("queueDocumentState", JSON.stringify(documentState));

    const pathParam =
      doc.folderPath && doc.folderPath.length > 0
        ? `?path=${encodeURIComponent(doc.folderPath.join("/"))}&fromQueue=true`
        : "?fromQueue=true";

    router.push(`/documents/upload${pathParam}`);
  };

  const formatSubmittedDate = (doc: QueueDoc) => {
    if (!doc.submittedAt) return "—";
    const dt = parseFlexibleDate(doc.submittedAt);
    if (!dt) return doc.submittedAt;
    return formatAppDateTime(dt);
  };

  const filteredItems = items;

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );
  const hasSelectedError = selectedItems.some((item) => item.status === "error");
  const hasSelectedReady = selectedItems.some((item) => item.status === "ready");
  const selectionType: "mixed" | "ready" | "error" | null =
    hasSelectedReady && hasSelectedError
      ? "mixed"
      : hasSelectedReady
        ? "ready"
        : hasSelectedError
          ? "error"
          : null;

  const hasVespaFailures = useCallback((doc: QueueDoc) => {
    return (
      doc.vespaSyncStatus === "failed" ||
      doc.vespaSyncStatus === "partial" ||
      (doc.vespaStepsFailed || 0) > 0 ||
      (doc.vespaChunksFailed || 0) > 0
    );
  }, []);

  const canSelectItem = (item: QueueDoc): boolean => {
    return item.status === "ready" || item.status === "error";
  };

  const toggleSelection = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || !canSelectItem(item)) return;

    setSelectedIds((prev) => {
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
    const selectableItems = filteredItems.filter((item) =>
      item.status === "ready" || item.status === "error"
    );
    const ids = selectableItems.map((item) => item.id);
    setSelectedIds(new Set(ids));
  };

  const selectByStatus = (status: "ready" | "error") => {
    const selectableItems = filteredItems.filter((item) => item.status === status);
    const ids = selectableItems.map((item) => item.id);
    setSelectedIds(new Set(ids));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectableItems = filteredItems.filter(
    (item) => canSelectItem(item) || selectedIds.has(item.id)
  );
  const isAllSelected =
    selectableItems.length > 0 &&
    selectableItems.every((item) => selectedIds.has(item.id));
  const selectedCount = selectedIds.size;

  const canAcceptSelected =
    selectedItems.length > 0 && selectedItems.every((item) => item.status === "ready");
  const canRejectSelected = selectedItems.length > 0;
  const selectedFailedItems = useMemo(
    () => selectedItems.filter((item) => item.status === "error"),
    [selectedItems]
  );
  const canRetrySelected = selectedFailedItems.length > 0;
  const isBulkAccepting = bulkActionLoading && confirmDialog.action === "accept";
  const isBulkRejecting = bulkActionLoading && confirmDialog.action === "reject";

  const handleBulkAccept = async () => {
    if (!canAcceptSelected) return;

    setBulkActionLoading(true);
    try {
      const orgId = getApiContext().orgId;
      const docIds = Array.from(selectedIds);

      const response = await apiFetch<{
        ok: boolean;
        accepted: number;
        failed: number;
      }>(`/orgs/${orgId}/ingestion-jobs/bulk-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { docIds },
      });

      toast({
        title: "Documents Accepted",
        description: `Successfully accepted ${response.accepted} document${response.accepted !== 1 ? "s" : ""}${response.failed > 0 ? `. ${response.failed} failed.` : ""}`,
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

      const response = await apiFetch<{
        ok: boolean;
        rejected: number;
        failed: number;
      }>(`/orgs/${orgId}/ingestion-jobs/bulk-reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { docIds, reason: "Bulk rejected from queue" },
      });

      toast({
        title: "Documents Rejected",
        description: `Successfully rejected ${response.rejected} document${response.rejected !== 1 ? "s" : ""}${response.failed > 0 ? `. ${response.failed} failed.` : ""}`,
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

  const handleSingleAccept = async (docId: string) => {
    setRowActionLoading((prev) => new Set(prev).add(docId));
    try {
      const orgId = getApiContext().orgId;
      await apiFetch<{ ok: boolean }>(
        `/orgs/${orgId}/ingestion-jobs/${docId}/accept`,
        {
          method: "POST",
          // Send empty object to satisfy Fastify's Content-Type validation
          // The backend doesn't use the body, but Fastify requires it if Content-Type is set
          body: {},
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
      setRowActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleSingleReject = async (docId: string) => {
    setRowActionLoading((prev) => new Set(prev).add(docId));
    try {
      const orgId = getApiContext().orgId;
      await apiFetch<{ ok: boolean }>(
        `/orgs/${orgId}/ingestion-jobs/${docId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: { reason: "Rejected from queue" },
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
      setRowActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleVespaRetry = async (docId: string) => {
    setVespaRetryLoading((prev) => new Set(prev).add(docId));
    try {
      const orgId = getApiContext().orgId;
      const response = await apiFetch<{
        success: boolean;
        message: string;
        stepsRetried: number;
        chunksRetried: number;
        stepsRetriedInOrder?: Array<{ stepName: string; stepSequence: number; status: string }>;
        stepErrors?: Array<{ stepName: string; error: string }>;
        summary?: {
          totalFailedSteps: number;
          totalFailedChunks: number;
          stepsSucceeded: number;
          chunksSucceeded: number;
        };
      }>(`/orgs/${orgId}/documents/${docId}/vespa/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        skipCache: true,
      });

      if (response.success) {
        toast({
          title: "Vespa Retry Initiated",
          description: response.message || `Retried ${response.stepsRetried} steps and ${response.chunksRetried} chunks`,
        });

        // Refresh queue after a short delay to show updated status
        setTimeout(() => {
          fetchQueue(true, currentPage, debouncedSearch, statusFilter);
        }, 2000);
      } else {
        throw new Error(response.message || "Retry failed");
      }
    } catch (error) {
      toast({
        title: "Vespa Retry Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setVespaRetryLoading((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleIngestionRetry = async (docId: string) => {
    setIngestionRetryLoading((prev) => new Set(prev).add(docId));
    try {
      const orgId = getApiContext().orgId;
      const response = await apiFetch<{
        success: boolean;
        message?: string;
        resetCount?: number;
      }>(`/orgs/${orgId}/documents/${docId}/ingestion-v2/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        skipCache: true,
      });

      if (response.success) {
        toast({
          title: "Ingestion Retry Initiated",
          description: response.message || "Failed steps have been reset.",
        });

        setTimeout(() => {
          fetchQueue(true, currentPage, debouncedSearch, statusFilter);
        }, 2000);
      } else {
        throw new Error(response.message || "Retry failed");
      }
    } catch (error) {
      toast({
        title: "Ingestion Retry Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIngestionRetryLoading((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleBulkRetry = async () => {
    if (!canRetrySelected) return;

    setBulkRetryLoading(true);
    try {
      const orgId = getApiContext().orgId;
      const failedItems = selectedFailedItems;

      const vespaIds = failedItems.filter(hasVespaFailures).map((d) => d.docId);
      const ingestionIds = failedItems.filter((d) => !hasVespaFailures(d)).map((d) => d.docId);

      let vespaResult = { retried: 0, skipped: 0, failed: 0 };
      let ingestionResult = { retried: 0, skipped: 0, failed: 0 };

      if (vespaIds.length > 0) {
        const res = await apiFetch<{
          success: boolean;
          retried: number;
          skipped: number;
          failed: number;
        }>(`/orgs/${orgId}/documents/vespa/retry-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: { docIds: vespaIds },
        });
        if (res?.success) {
          vespaResult = res;
        } else {
          throw new Error("Bulk Vespa retry failed");
        }
      }

      if (ingestionIds.length > 0) {
        const res = await apiFetch<{
          success: boolean;
          retried: number;
          skipped: number;
          failed: number;
        }>(`/orgs/${orgId}/documents/ingestion-v2/retry-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: { docIds: ingestionIds },
        });
        if (res?.success) {
          ingestionResult = res;
        } else {
          throw new Error("Bulk ingestion retry failed");
        }
      }

      const totalRetried = vespaResult.retried + ingestionResult.retried;
      const totalFailed = vespaResult.failed + ingestionResult.failed;
      const totalSkipped = vespaResult.skipped + ingestionResult.skipped;

      toast({
        title: "Retry Completed",
        description: `Retried ${totalRetried} document${totalRetried !== 1 ? "s" : ""}. ${totalFailed > 0 ? `${totalFailed} failed.` : ""} ${totalSkipped > 0 ? `${totalSkipped} skipped.` : ""}`.trim(),
      });

      clearSelection();
      setTimeout(() => {
        fetchQueue(true, currentPage, debouncedSearch, statusFilter);
      }, 2000);
    } catch (error) {
      toast({
        title: "Bulk Retry Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBulkRetryLoading(false);
    }
  };

  const checkVespaStatus = async (docId: string) => {
    try {
      const orgId = getApiContext().orgId;
      const response = await apiFetch<{
        steps: Array<{ step_name: string; status: string; failure_type?: string }>;
        summary: {
          failedSteps: number;
          retryableSteps: number;
        };
      }>(`/orgs/${orgId}/documents/${docId}/vespa/steps`, {
        skipCache: true,
      });

      return response;
    } catch (error) {
      console.error("Failed to check Vespa status:", error);
      return null;
    }
  };

  useEffect(() => {
    clearSelection();
  }, [statusFilter, currentPage]);

  const totalActive =
    statusCounts.pending +
    statusCounts.processing +
    statusCounts.needs_review +
    statusCounts.failed;
  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses", backendKey: null },
      { value: "ready", label: "Ready", backendKey: "needs_review" },
      { value: "pending", label: "Pending", backendKey: "pending" },
      { value: "processing", label: "Processing", backendKey: "processing" },
      { value: "error", label: "Failed", backendKey: "failed" },
    ],
    []
  );
  const mobileActiveCount =
    (statusFilter !== "all" ? 1 : 0) + (searchQuery.trim() ? 1 : 0);
  const mobileStatusLabel =
    statusOptions.find((opt) => opt.value === statusFilter)?.label ||
    "All statuses";

  return (
    <AppLayout>
      <div className="min-h-screen flex flex-col">
        {/* Header - Linear style */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <ListChecks className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">Queue</h1>
                  <p className="text-sm text-muted-foreground">
                    {loading ? (
                      <span className="inline-block w-32 h-4 bg-muted/30 rounded animate-pulse" />
                    ) : (
                      `${totalItems} items · ${totalActive} active`
                    )}
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchQueue(true, currentPage, debouncedSearch, statusFilter)}
                disabled={loading}
                className="gap-2 h-8 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                <span className="hidden sm:inline text-sm">Refresh</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Toolbar - Search & Status Tabs (Desktop) */}
        <div className="px-6 py-3 border-b border-border/30 bg-background/50">
          <div className="hidden md:flex flex-col md:flex-row items-start md:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 w-full md:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8 bg-muted/30 border-border/40 text-sm placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/30 overflow-x-auto w-full md:w-auto">
              <div className="flex items-center gap-0.5 min-w-max">
                {[
                  { value: "all", label: "All", backendKey: null },
                  {
                    value: "ready",
                    label: "Ready",
                    icon: CheckCircle2,
                    backendKey: "needs_review",
                  },
                  { value: "pending", label: "Pending", icon: Clock, backendKey: "pending" },
                  {
                    value: "processing",
                    label: "Processing",
                    icon: Loader2,
                    backendKey: "processing",
                  },
                  { value: "error", label: "Failed", icon: XCircle, backendKey: "failed" },
                ].map(({ value, label, icon: Icon, backendKey }) => {
                  const rawCount =
                    value === "all"
                      ? totalActive
                      : statusCounts[backendKey as keyof typeof statusCounts] ?? 0;
                  const count = Number(rawCount);
                  const showCount = Number.isFinite(count) && count > 0;
                  const isActive = statusFilter === value;

                  return (
                    <button
                      key={value}
                      onClick={() => {
                        setStatusFilter(value as StatusFilter);
                        setCurrentPage(1);
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all",
                        isActive
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {Icon && (
                        <Icon
                          className={cn(
                            "h-3.5 w-3.5",
                            value === "processing" && isActive && "animate-spin"
                          )}
                        />
                      )}
                      <span className="sm:hidden">{label}</span>
                      <span className="hidden sm:inline">{label}</span>
                      {showCount && (
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full tabular-nums",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "bg-muted/50 text-muted-foreground"
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile Summary + Filter Button */}
          <div className="md:hidden flex items-center justify-between text-xs text-muted-foreground">
            <div className="min-w-0 truncate">
              {mobileStatusLabel} · {totalActive} active
              {searchQuery.trim() && (
                <span className="ml-2 text-muted-foreground/70">
                  Search: "{searchQuery.trim()}"
                </span>
              )}
            </div>
          </div>

          <div className="md:hidden">
            <MobileFilterButton
              title="Filter Queue"
              description="Search and narrow by status"
              activeCount={mobileActiveCount}
              footer={
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <Button
                      variant="default"
                      className="flex-1 h-11 rounded-2xl font-bold tracking-tight shadow-md"
                      disabled={loading}
                      onClick={() => fetchQueue(true, currentPage, debouncedSearch, statusFilter)}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Filter className="h-4 w-4 mr-2" />
                      )}
                      Show results
                    </Button>
                    {mobileFilterView !== 'main' && (
                      <Button
                        variant="ghost"
                        className="h-11 w-11 p-0 rounded-2xl bg-muted/30"
                        onClick={() => setMobileFilterView('main')}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                    )}
                  </div>

                  {mobileActiveCount > 0 && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setStatusFilter("all");
                        setCurrentPage(1);
                        setMobileFilterView('main');
                      }}
                      className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors py-1 flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Clear active filters
                    </button>
                  )}
                </div>
              }
            >
              <div className="space-y-4">
                {mobileFilterView === 'main' ? (
                  <div className="flex flex-col gap-3">
                    {/* Search Card */}
                    <button
                      onClick={() => setMobileFilterView('search')}
                      className="group relative overflow-hidden rounded-[1.5rem] p-4 text-left transition-all active:scale-95 bg-[#E4EAEE] dark:bg-[#1C2026] border border-border/10 shadow-sm min-h-[80px]"
                    >
                      <Search className="absolute -bottom-2 -right-2 h-16 w-16 -rotate-12 opacity-[0.05] dark:opacity-[0.03]" />
                      <div className="relative z-10 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-white/80 dark:bg-black/20 flex items-center justify-center shadow-sm shrink-0">
                          <Search className={cn("h-5 w-5", searchQuery.trim() ? "text-primary" : "text-foreground/70")} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-foreground leading-tight">Search</h3>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-0.5 truncate">
                            {searchQuery.trim() ? `"${searchQuery.trim()}"` : "Search title or filename"}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                      </div>
                    </button>

                    {/* Status Card */}
                    <button
                      onClick={() => setMobileFilterView('status')}
                      className="group relative overflow-hidden rounded-[1.5rem] p-4 text-left transition-all active:scale-95 bg-[#F2F0EB] dark:bg-[#1E1C1A] border border-border/10 shadow-sm min-h-[80px]"
                    >
                      <ListChecks className="absolute -bottom-2 -right-2 h-16 w-16 -rotate-12 opacity-[0.05] dark:opacity-[0.03]" />
                      <div className="relative z-10 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-white/80 dark:bg-black/20 flex items-center justify-center shadow-sm shrink-0">
                          <ListChecks className={cn("h-5 w-5", statusFilter !== 'all' ? "text-primary" : "text-foreground/70")} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-foreground leading-tight">Job Status</h3>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-0.5">
                            {mobileStatusLabel}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                      </div>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center justify-between mb-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMobileFilterView('main')}
                        className="h-8 px-2 -ml-2 text-muted-foreground hover:bg-transparent"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        <span className="text-xs font-semibold">Back</span>
                      </Button>
                      <h2 className="text-sm font-bold text-foreground pr-8">
                        {mobileFilterView === 'search' && "Search Queue"}
                        {mobileFilterView === 'status' && "Filter by Status"}
                      </h2>
                      <div className="w-8" />
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0 -mx-2 px-2 pb-2">
                      {mobileFilterView === 'search' && (
                        <div className="space-y-4 pt-2">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                            <Input
                              placeholder="Search by title, filename, or submitter"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="pl-9 h-11 bg-muted/30 border-border/40 text-sm rounded-2xl placeholder:text-muted-foreground/50"
                              autoFocus
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground px-1 leading-relaxed">
                            Search matches document titles, filenames, and the names of users who submitted them.
                          </p>
                        </div>
                      )}

                      {mobileFilterView === 'status' && (
                        <div className="space-y-1">
                          {/* All Statuses Card */}
                          <div
                            className={cn(
                              "flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer mb-2",
                              statusFilter === "all" ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/30 hover:bg-muted/40"
                            )}
                            onClick={() => {
                              setStatusFilter("all");
                              setCurrentPage(1);
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", statusFilter === "all" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted-foreground/10 text-muted-foreground")}>
                                <ListChecks className="h-4 w-4" />
                              </div>
                              <span className="text-sm font-bold">All Statuses</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground tabular-nums font-medium">{totalActive}</span>
                              <Checkbox checked={statusFilter === "all"} onCheckedChange={() => setStatusFilter("all")} />
                            </div>
                          </div>

                          <div className="grid gap-1">
                            {statusOptions.filter(opt => opt.value !== 'all').map(({ value, label, backendKey }) => {
                              const rawCount = statusCounts[backendKey as keyof typeof statusCounts] ?? 0;
                              const count = Number(rawCount);
                              const checked = statusFilter === value;

                              // Map icons from config
                              const statusConfig = {
                                ready: CheckCircle2,
                                error: XCircle,
                                processing: Loader2,
                                pending: Clock,
                              };
                              const Icon = statusConfig[value as keyof typeof statusConfig] || ListChecks;

                              return (
                                <div
                                  key={value}
                                  className={cn(
                                    "flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer",
                                    checked ? "bg-card border border-primary/20 shadow-sm" : "hover:bg-muted/20"
                                  )}
                                  onClick={() => {
                                    setStatusFilter(value as StatusFilter);
                                    setCurrentPage(1);
                                  }}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-colors", checked ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground")}>
                                      <Icon className={cn("h-4 w-4", value === 'processing' && checked && "animate-spin")} />
                                    </div>
                                    <span className={cn("text-sm transition-colors", checked ? "text-foreground font-bold" : "text-muted-foreground font-medium")}>{label}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-muted-foreground tabular-nums font-medium">{count}</span>
                                    <Checkbox checked={checked} onCheckedChange={() => setStatusFilter(value as StatusFilter)} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </MobileFilterButton>
          </div>
        </div>

        {/* Bulk Actions (when items selected) */}
        {selectedCount > 0 && (
          <div className="px-6 py-2 border-b border-border/30 bg-primary/5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground tabular-nums">
                  {selectedCount} selected
                </span>
                {selectionType && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      selectionType === "ready"
                        ? "border-green-200/50 text-green-600 bg-green-500/10"
                        : selectionType === "error"
                          ? "border-red-200/50 text-red-600 bg-red-500/10"
                          : "border-amber-200/50 text-amber-700 bg-amber-500/10"
                    )}
                  >
                    {selectionType === "mixed"
                      ? "Mixed items"
                      : selectionType === "ready"
                        ? "Ready items"
                        : "Failed items"}
                  </Badge>
                )}
                {selectionType === "mixed" && (
                  <span className="text-xs text-muted-foreground">
                    Accept disabled for mixed selection
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-7 gap-1.5 text-sm",
                    canAcceptSelected
                      ? "text-green-600 hover:text-green-600 hover:bg-green-500/10"
                      : "text-green-600/40"
                  )}
                  onClick={() =>
                    canAcceptSelected &&
                    setConfirmDialog({ open: true, action: "accept", count: selectedCount })
                  }
                  disabled={bulkActionLoading || !canAcceptSelected}
                >
                  {isBulkAccepting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {isBulkAccepting ? "Accepting..." : "Accept"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-7 gap-1.5 text-sm",
                    isBulkRejecting
                      ? "text-red-500/80"
                      : "text-red-500 hover:text-red-500 hover:bg-red-500/10"
                  )}
                  onClick={() =>
                    setConfirmDialog({ open: true, action: "reject", count: selectedCount })
                  }
                  disabled={bulkActionLoading}
                >
                  {isBulkRejecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  {isBulkRejecting ? "Rejecting..." : "Reject"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-7 gap-1.5 text-sm",
                    canRetrySelected
                      ? "text-blue-600 hover:text-blue-600 hover:bg-blue-500/10"
                      : "text-blue-600/40"
                  )}
                  onClick={handleBulkRetry}
                  disabled={bulkRetryLoading || bulkActionLoading || !canRetrySelected}
                >
                  {bulkRetryLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Retry Failed
                </Button>
                {selectionType === "mixed" && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => selectByStatus("ready")}
                      disabled={bulkActionLoading}
                    >
                      Select Ready
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => selectByStatus("error")}
                      disabled={bulkActionLoading}
                    >
                      Select Failed
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* List Header */}
        <div className="hidden md:block px-6 py-2 border-b border-border/30 bg-muted/20">
          <div className="flex items-center gap-4">
            <div className="w-4">
              <Checkbox
                checked={isAllSelected && selectableItems.length > 0}
                onCheckedChange={(checked) => (checked ? selectAll() : clearSelection())}
                disabled={selectableItems.length === 0}
                className="h-3.5 w-3.5"
              />
            </div>
            <div className="w-8" />
            <div className="flex-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Document
              </span>
            </div>
            <div className="w-24">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </span>
            </div>
            <div className="hidden md:block w-24">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Category
              </span>
            </div>
            <div className="hidden lg:block w-28">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Submitted
              </span>
            </div>
            <div className="w-24">
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
              {Array.from({ length: 10 }).map((_, i) => (
                <ItemSkeleton key={i} />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/30 mb-4">
                <ListChecks className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">
                {debouncedSearch
                  ? "No matches found"
                  : statusFilter !== "all"
                    ? `No ${statusFilter} documents`
                    : "Queue is empty"}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                {debouncedSearch
                  ? "Try adjusting your search terms"
                  : "Documents awaiting review will appear here"}
              </p>
            </div>
          ) : (
            <div>
              {filteredItems.map((doc) => {
                const {
                  icon: FileIcon,
                  color: iconColor,
                  bg: iconBg,
                } = getFileTypeIcon(doc.mimeType, doc.filename);
                const isSelected = selectedIds.has(doc.id);
                const canSelect = canSelectItem(doc);
                const isActionLoading = rowActionLoading.has(doc.docId);
                const isVespaFailed = hasVespaFailures(doc);

                return (
                  <div
                    key={doc.id}
                    onClick={() => canSelect && toggleSelection(doc.id)}
                    className={cn(
                      "group px-4 md:px-6 py-0 md:py-3 md:border-b md:border-border/20",
                      "transition-colors",
                      isSelected
                        ? "md:bg-primary/5 md:hover:bg-primary/8"
                        : canSelect
                          ? "md:hover:bg-muted/30 cursor-pointer"
                          : "md:hover:bg-muted/20 opacity-70"
                    )}
                  >
                    {/* Desktop row */}
                    <div className="hidden md:flex items-center gap-4">
                      <div className="w-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          disabled={!canSelect && !isSelected}
                          onCheckedChange={() => toggleSelection(doc.id)}
                          className="h-3.5 w-3.5"
                        />
                      </div>
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                          iconBg,
                          iconColor
                        )}
                      >
                        <FileIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-medium text-foreground truncate max-w-[250px] sm:max-w-[350px] block"
                            title={doc.title || doc.filename}
                          >
                            {doc.title || doc.filename}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 overflow-hidden">
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {doc.filename}
                          </span>
                          {doc.submitterName && (
                            <>
                              <span className="text-muted-foreground/30 flex-shrink-0">
                                ·
                              </span>
                              <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                by {doc.submitterName}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="w-24">
                        <StatusBadge status={doc.status} note={doc.note} />
                      </div>
                      <div className="hidden md:block w-24">
                        <Badge
                          variant="outline"
                          className="text-xs font-normal border-border/50 text-muted-foreground bg-muted/30"
                        >
                          <Bookmark className="h-2.5 w-2.5 mr-1 opacity-60" />
                          {doc.category || "General"}
                        </Badge>
                      </div>
                      <div className="hidden lg:flex items-center gap-1.5 w-28">
                        <Calendar className="h-3 w-3 text-muted-foreground/60" />
                        <span className="text-xs text-muted-foreground">
                          {formatSubmittedDate(doc)}
                        </span>
                      </div>
                      <div
                        className="w-32 flex justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {doc.status === "ready" || doc.status === "error" ? (
                          <>
                            {doc.status === "ready" && (
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-green-600 hover:bg-green-500/10"
                                      disabled={isActionLoading}
                                      onClick={() => handleSingleAccept(doc.docId)}
                                    >
                                      {isActionLoading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Check className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Accept
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {isVespaFailed && (
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-blue-600 hover:bg-blue-500/10"
                                      disabled={isActionLoading || vespaRetryLoading.has(doc.docId)}
                                      onClick={() => handleVespaRetry(doc.docId)}
                                    >
                                      {vespaRetryLoading.has(doc.docId) ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <RotateCw className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Retry
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {doc.status === "error" && !isVespaFailed && (
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-blue-600 hover:bg-blue-500/10"
                                      disabled={isActionLoading || ingestionRetryLoading.has(doc.docId)}
                                      onClick={() => handleIngestionRetry(doc.docId)}
                                    >
                                      {ingestionRetryLoading.has(doc.docId) ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Retry
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
                                    className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                    disabled={isActionLoading}
                                    onClick={() => handleSingleReject(doc.docId)}
                                  >
                                    {isActionLoading && doc.status === "error" ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <X className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Reject
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    disabled={isActionLoading}
                                    onClick={() => openInUploader(doc)}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Review
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>
                              {doc.status === "processing" ? "Processing…" : "Pending…"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Mobile card */}
                    <div className="md:hidden">
                      <div
                        className={cn(
                          "py-3 border-b border-border/20",
                          isSelected ? "bg-muted/30" : "bg-transparent"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              disabled={!canSelect && !isSelected}
                              onCheckedChange={() => toggleSelection(doc.id)}
                              className="h-3.5 w-3.5 mt-1"
                            />
                          </div>
                          <div
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-lg",
                              iconBg,
                              iconColor
                            )}
                          >
                            <FileIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="min-w-0">
                              <div
                                className="text-sm font-medium text-foreground line-clamp-2 break-words"
                                title={doc.title || doc.filename}
                              >
                                {doc.title || doc.filename}
                              </div>
                              <div
                                className="text-xs text-muted-foreground/80 line-clamp-2 break-all"
                                title={doc.filename}
                              >
                                {doc.filename}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                              <StatusBadge status={doc.status} note={doc.note} />
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatSubmittedDate(doc)}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal border-border/50 text-muted-foreground bg-muted/30"
                              >
                                <Bookmark className="h-2.5 w-2.5 mr-1 opacity-60" />
                                {doc.category || "General"}
                              </Badge>
                              {doc.submitterName && (
                                <span className="inline-flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {doc.submitterName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground line-clamp-2">
                          {doc.note ||
                            (doc.status === "processing"
                              ? "Processing document…"
                              : doc.status === "pending"
                                ? "Queued and waiting for worker."
                                : doc.status === "error"
                                  ? doc.failureReason || "Processing failed."
                                  : "Ready for review.")}
                        </div>
                        <div
                          className="flex items-center gap-1.5 overflow-x-auto pb-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {doc.status === "ready" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-green-700 hover:bg-green-500/10 shrink-0"
                              disabled={isActionLoading}
                              onClick={() => handleSingleAccept(doc.docId)}
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Check className="h-3 w-3 mr-1" />
                              )}
                              Accept
                            </Button>
                          )}
                          {isVespaFailed && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-blue-700 hover:bg-blue-500/10 shrink-0"
                              disabled={isActionLoading || vespaRetryLoading.has(doc.docId)}
                              onClick={() => handleVespaRetry(doc.docId)}
                            >
                              {vespaRetryLoading.has(doc.docId) ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <RotateCw className="h-3 w-3 mr-1" />
                              )}
                              Retry
                            </Button>
                          )}
                          {doc.status === "error" && !isVespaFailed && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-blue-700 hover:bg-blue-500/10 shrink-0"
                              disabled={isActionLoading || ingestionRetryLoading.has(doc.docId)}
                              onClick={() => handleIngestionRetry(doc.docId)}
                            >
                              {ingestionRetryLoading.has(doc.docId) ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <RefreshCw className="h-3 w-3 mr-1" />
                              )}
                              Retry
                            </Button>
                          )}
                          {(doc.status === "ready" || doc.status === "error") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] hover:bg-muted/40 shrink-0"
                              disabled={isActionLoading}
                              onClick={() => openInUploader(doc)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Review
                            </Button>
                          )}
                          {(doc.status === "ready" || doc.status === "error") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-red-600 hover:bg-red-500/10 shrink-0"
                              disabled={isActionLoading}
                              onClick={() => handleSingleReject(doc.docId)}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
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
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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

      {/* Bulk Action Confirmation Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          !open &&
          !bulkActionLoading &&
          setConfirmDialog({ open: false, action: null, count: 0 })
        }
      >
        <AlertDialogContent className="max-w-md border-border/40">
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  confirmDialog.action === "accept"
                    ? "bg-green-500/10"
                    : "bg-red-500/10"
                )}
              >
                {confirmDialog.action === "accept" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                )}
              </div>
              <div>
                <AlertDialogTitle className="text-base font-semibold text-foreground">
                  {confirmDialog.action === "accept"
                    ? `Accept ${confirmDialog.count} document${confirmDialog.count !== 1 ? "s" : ""}?`
                    : `Reject ${confirmDialog.count} document${confirmDialog.count !== 1 ? "s" : ""}?`}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
                  {confirmDialog.action === "accept" ? (
                    <>
                      This will accept the selected documents and move them to your
                      library.
                    </>
                  ) : (
                    <>
                      This will permanently delete the selected documents.
                      <span className="block mt-2 text-red-500 font-medium">
                        This action cannot be undone.
                      </span>
                    </>
                  )}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
            <AlertDialogCancel disabled={bulkActionLoading} className="text-sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (bulkActionLoading) return;
                if (confirmDialog.action === "accept") handleBulkAccept();
                else handleBulkReject();
              }}
              disabled={bulkActionLoading}
              className={cn(
                "text-sm",
                confirmDialog.action === "accept"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-500 hover:bg-red-600 text-white"
              )}
            >
              {bulkActionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : confirmDialog.action === "accept" ? (
                "Accept All"
              ) : (
                "Reject All"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
