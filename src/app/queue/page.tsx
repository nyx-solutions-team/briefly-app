"use client";

import React, { useMemo, useState, useEffect } from "react";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud,
  Check,
  FileText,
  User,
  UserCheck,
  Calendar,
  Bookmark,
  Hash,
  Tag,
  ListChecks,
  MessageSquare,
  FolderOpen,
  X,
  Grid2X2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from "@/components/ui/select";
import { apiFetch, getApiContext } from "@/lib/api";
import { useCategories } from "@/hooks/use-categories";
import { useUserDepartmentCategories } from "@/hooks/use-department-categories";
import { useDocuments } from "@/hooks/use-documents";
import { useDepartments } from "@/hooks/use-departments";
import { useRouter } from "next/navigation";
import { formatAppDateTime, parseFlexibleDate } from "@/lib/utils";
import FilePreview from "@/components/file-preview";

// API response can be either ingestion job structure or document structure
type IngestionJobResponse = {
  org_id: string;
  doc_id?: string; // May be at top level or nested
  id?: string; // Document id might be at top level
  status?: "needs_review" | "failed";
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
  // Document fields (may be at top level or nested)
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
  // Nested document (if present)
  document?: {
    id: string;
    title: string;
    filename: string;
    description?: string;
    uploaded_at: string;
    folder_path?: string[];
  };
};

type QueueDoc = {
  id: string;
  docId: string;
  title: string;
  filename: string;
  sender?: string;
  receiver?: string;
  documentDate?: string;
  category?: string;
  keywords?: string[];
  tags?: string[];
  folderPath?: string[];
  status: "ready" | "saving" | "success" | "error";
  progress: number;
  note?: string;
  storageKey?: string;
  mimeType?: string;
  extractionKey?: string;
  extractedMetadata?: IngestionJobResponse["extracted_metadata"];
  failureReason?: string | null;
  description?: string;
};

type FormData = {
  title: string;
  filename: string;
  sender: string;
  receiver: string;
  documentDate: string;
  documentType: string;
  folder: string;
  subject: string;
  description: string;
  category: string;
  keywords: string;
  tags: string;
};

const MAX_ITEMS = 10;

function mapIngestionJobToQueueDoc(job: IngestionJobResponse): QueueDoc {
  // Handle both nested document structure and flat structure
  const docId = job.doc_id || job.id || job.document?.id || "";
  const docTitle = job.title || job.document?.title || job.filename || job.document?.filename || "";
  const docFilename = job.filename || job.document?.filename || "";
  const docFolderPath = job.folder_path || job.document?.folder_path || [];
  
  // Extract metadata from extracted_metadata or top-level fields
  const metadata = job.extracted_metadata || {};
  const status = job.status || "needs_review";
  
  return {
    id: docId,
    docId: docId,
    title: metadata.title || docTitle || docFilename,
    filename: docFilename,
    sender: metadata.sender || job.sender,
    receiver: metadata.receiver || job.receiver,
    documentDate: metadata.documentDate || job.document_date,
    category: metadata.category || job.category || "General",
    keywords: metadata.keywords || job.keywords || [],
    tags: metadata.tags || job.tags || [],
    folderPath: docFolderPath,
    status: status === "needs_review" ? "ready" : "error",
    progress: status === "needs_review" ? 100 : 0,
    note: job.failure_reason || undefined,
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

function mapQueueDocToFormData(doc: QueueDoc): FormData {
  return {
    title: doc.title || doc.filename,
    filename: doc.filename,
    sender: doc.sender || "",
    receiver: doc.receiver || "",
    documentDate: doc.documentDate || "",
    documentType: "Document",
    folder: doc.folderPath && doc.folderPath.length ? doc.folderPath.join("/") : "Root",
    subject: doc.extractedMetadata?.subject || "",
    description: doc.extractedMetadata?.description || doc.extractedMetadata?.summary || doc.description || "",
    category: doc.category || "General",
    keywords: Array.isArray(doc.keywords) ? doc.keywords.join(", ") : "",
    tags: Array.isArray(doc.tags) ? doc.tags.join(", ") : "",
  };
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<QueueDoc | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const { toast } = useToast();
  const { categories } = useCategories();
  const { getCategoriesForDepartment } = useUserDepartmentCategories();
  const { folders } = useDocuments();
  const { selectedDepartmentId } = useDepartments();
  const router = useRouter();

  // Get categories for the selected department, fallback to org categories
  const availableCategories = useMemo(() => {
    if (selectedDepartmentId) {
      return getCategoriesForDepartment(selectedDepartmentId);
    }
    return categories;
  }, [selectedDepartmentId, getCategoriesForDepartment, categories]);

  const fetchQueue = async (showLoading = true) => {
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

      const jobs = await apiFetch<IngestionJobResponse[]>(
        `/orgs/${orgId}/ingestion-jobs?status=needs_review,failed`,
        { skipCache: true }
      );

      const queueDocs = jobs.map(mapIngestionJobToQueueDoc);
      setItems(queueDocs.slice(0, MAX_ITEMS));
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
  };

  useEffect(() => {
    let mounted = true;
    
    // Initial load with loading state
    fetchQueue(true);
    
    // Auto-refresh every 5 seconds without showing loading state
    const interval = setInterval(() => {
      if (mounted) {
        fetchQueue(false);
      }
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openReviewModal = (doc: QueueDoc) => {
    setSelectedDoc({ ...doc });
    setFormData(mapQueueDocToFormData(doc));
    setFolderPath(doc.folderPath || []);
  };

  const openInUploader = (doc: QueueDoc) => {
    // Store document state in sessionStorage for upload page to read
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
      failureReason: doc.failureReason,
    };
    
    sessionStorage.setItem('queueDocumentState', JSON.stringify(documentState));
    
    // Navigate to upload page with folder path if available
    const pathParam = doc.folderPath && doc.folderPath.length > 0 
      ? `?path=${encodeURIComponent(doc.folderPath.join('/'))}&fromQueue=true`
      : '?fromQueue=true';
    
    router.push(`/documents/upload${pathParam}`);
  };

  const handleAccept = async () => {
    if (!selectedDoc || !formData) return;

    try {
      const orgId = getApiContext().orgId;
      if (!orgId) {
        toast({
          title: "Error",
          description: "No organization selected",
          variant: "destructive",
        });
        return;
      }

      setSelectedDoc((prev) => (prev ? { ...prev, status: "saving" } : prev));
      setItems((prev) =>
        prev.map((d) =>
          d.id === selectedDoc.id ? { ...d, status: "saving", progress: 30 } : d
        )
      );

      // Update document with form data before accepting
      const keywordsArray = (formData.keywords || "")
        .split(",")
        .map((k: string) => k.trim())
        .filter(Boolean);
      const tagsArray = (formData.tags || "")
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean);

      const patchPayload: any = {
        title: formData.title,
        filename: formData.filename,
        folder_path: folderPath,
        subject: formData.subject,
        description: formData.description,
        category: formData.category,
        tags: tagsArray,
        keywords: keywordsArray,
        sender: formData.sender || null,
        receiver: formData.receiver || null,
        document_date: formData.documentDate || null,
      };

      // Update the document first
      await apiFetch(`/orgs/${orgId}/documents/${selectedDoc.docId}`, {
        method: "PATCH",
        body: patchPayload,
      });

      setItems((prev) =>
        prev.map((d) =>
          d.id === selectedDoc.id ? { ...d, progress: 60 } : d
        )
      );

      // Then accept the job
      await apiFetch(`/orgs/${orgId}/ingestion-jobs/${selectedDoc.docId}/accept`, {
        method: "POST",
      });

      setItems((prev) =>
        prev.map((d) =>
          d.id === selectedDoc.id ? { ...d, status: "success", progress: 100 } : d
        )
      );

      toast({
        title: "Accepted",
        description: `${selectedDoc.filename} has been accepted.`,
      });

      setSelectedDoc(null);
      setFormData(null);
      setFolderPath([]);
      
      // Refresh the queue
      await fetchQueue();
    } catch (error) {
      console.error("Failed to accept job:", error);
      setItems((prev) =>
        prev.map((d) =>
          d.id === selectedDoc.id
            ? { ...d, status: "error", progress: 0, note: "Accept failed" }
            : d
        )
      );
      toast({
        title: "Failed to accept",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setSelectedDoc((prev) => (prev ? { ...prev, status: "error" } : prev));
    }
  };

  const readyCount = useMemo(
    () => items.filter((i) => i.status === "ready").length,
    [items]
  );
  const savedCount = useMemo(
    () => items.filter((i) => i.status === "success").length,
    [items]
  );

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((d) => d.id !== id));
  };

  const formatDocDate = (doc: QueueDoc) => {
    if (!doc.documentDate) return "—";
    const dt = parseFlexibleDate(doc.documentDate);
    if (!dt) return doc.documentDate;
    return formatAppDateTime(dt);
  };

  const getStatusBadgeVariant = (status: QueueDoc["status"]) => {
    switch (status) {
      case "ready":
        return "default";
      case "saving":
        return "secondary";
      case "success":
        return "default";
      case "error":
        return "destructive";
      default:
        return "secondary";
    }
  };

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
                <p className="text-xs text-muted-foreground mt-0.5">
                  Review and save up to {MAX_ITEMS} processed documents.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="px-4 md:px-6 space-y-6">

        {/* Queue list */}
        <Card className="rounded-xl card-premium">
          <CardHeader className="flex flex-col gap-3 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <UploadCloud className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold">
                    Queued Documents
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {loading
                      ? "Loading..."
                      : `${readyCount} of ${items.length}/${MAX_ITEMS} files ready to review`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {savedCount > 0 && <span>Accepted: {savedCount}</span>}
                {readyCount > 0 && <span>Ready: {readyCount}</span>}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground p-6 text-center">
                Loading queue...
              </div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground p-6 text-center">
                No queued documents.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((doc) => (
                  <Card
                    key={doc.id}
                    className="hover:shadow-md transition-all cursor-pointer group"
                    onClick={() => openReviewModal(doc)}
                  >
                    <CardContent className="p-5 space-y-4">
                      {/* Header with icon and status */}
                      <div className="flex items-center justify-between">
                        <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          <FileText className="h-5 w-5" />
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

                      {/* Sender → Receiver */}
                      <div className="rounded-md border p-2.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          <span className="text-foreground font-medium">
                            {doc.sender || "—"}
                          </span>
                          <span className="mx-1">→</span>
                          <UserCheck className="h-3 w-3" />
                          <span className="text-foreground font-medium">
                            {doc.receiver || "—"}
                          </span>
                        </div>
                      </div>

                      {/* Category and Date */}
                      <div className="flex items-center justify-between text-xs">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          <Bookmark className="h-3 w-3 mr-1" />
                          {doc.category || "General"}
                        </Badge>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDocDate(doc)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="pt-2 border-t flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openReviewModal(doc);
                          }}
                        >
                          Review & Accept
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openInUploader(doc);
                          }}
                        >
                          Edit in Upload Workspace
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Detailed View Dialog */}
        {selectedDoc && formData && (
          <Dialog
            open={!!selectedDoc}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedDoc(null);
                setFormData(null);
                setFolderPath([]);
              }
            }}
          >
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle>{selectedDoc.filename}</DialogTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openInUploader(selectedDoc)}
                    className="gap-2"
                  >
                    <UploadCloud className="h-4 w-4" />
                    Edit in Upload Workspace
                  </Button>
                </div>
              </DialogHeader>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                {/* Left side - Form */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Title
                      </label>
                      <input
                        className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                        value={formData.title}
                        onChange={(e) =>
                          setFormData({ ...formData, title: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Filename
                      </label>
                      <input
                        className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                        value={formData.filename}
                        onChange={(e) =>
                          setFormData({ ...formData, filename: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Sender
                      </label>
                      <input
                        className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                        value={formData.sender}
                        onChange={(e) =>
                          setFormData({ ...formData, sender: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <UserCheck className="h-3 w-3" />
                        Receiver
                      </label>
                      <input
                        className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                        value={formData.receiver}
                        onChange={(e) =>
                          setFormData({ ...formData, receiver: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Document Date
                      </label>
                      <input
                        className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                        value={formData.documentDate}
                        onChange={(e) =>
                          setFormData({ ...formData, documentDate: e.target.value })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        Subject
                      </label>
                      <input
                        className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                        value={formData.subject}
                        onChange={(e) =>
                          setFormData({ ...formData, subject: e.target.value })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Description
                      </label>
                      <textarea
                        rows={3}
                        className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm resize-none"
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({ ...formData, description: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                        <Bookmark className="h-3.5 w-3.5" />
                        Category
                      </label>
                      <UiSelect
                        value={formData.category || "General"}
                        onValueChange={(value) =>
                          setFormData({ ...formData, category: value })
                        }
                      >
                        <UiSelectTrigger className="mt-1 w-full">
                          <UiSelectValue placeholder="Select category..." />
                        </UiSelectTrigger>
                        <UiSelectContent>
                          {availableCategories.map((category) => (
                            <UiSelectItem key={category} value={category}>
                              {category}
                            </UiSelectItem>
                          ))}
                        </UiSelectContent>
                      </UiSelect>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                        <Hash className="h-3.5 w-3.5" />
                        Keywords (comma)
                      </label>
                      <input
                        className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                        value={formData.keywords}
                        onChange={(e) =>
                          setFormData({ ...formData, keywords: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                        <Tag className="h-3.5 w-3.5" />
                        Tags
                      </label>
                      <input
                        className="mt-1.5 rounded-lg border border-border/60 bg-background hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all p-2.5 w-full text-sm"
                        placeholder="Enter tags separated by commas"
                        value={formData.tags}
                        onChange={(e) =>
                          setFormData({ ...formData, tags: e.target.value })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                        <FolderOpen className="h-3.5 w-3.5" />
                        Upload Destination
                        {folderPath.length > 0 && (
                          <span className="ml-2 text-primary font-medium">
                            /{folderPath.join("/")}
                          </span>
                        )}
                      </label>
                      <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <UiSelect
                          value={folderPath.length ? folderPath.join("/") : "__root__"}
                          onValueChange={(v) => {
                            if (v === "__root__") setFolderPath([]);
                            else setFolderPath(v.split("/").filter(Boolean));
                          }}
                        >
                          <UiSelectTrigger className="w-full">
                            <UiSelectValue
                              placeholder={
                                folderPath.length
                                  ? `/${folderPath.join("/")}`
                                  : "Root folder"
                              }
                            />
                          </UiSelectTrigger>
                          <UiSelectContent>
                            <UiSelectItem value="__root__">📁 Root</UiSelectItem>
                            {folders.map((p, idx) => (
                              <UiSelectItem key={idx} value={p.join("/")}>
                                📁 {p.join("/")}
                              </UiSelectItem>
                            ))}
                          </UiSelectContent>
                        </UiSelect>
                        <input
                          className="rounded-md border bg-background p-2"
                          placeholder="Custom path e.g., Finance/2025/Q1"
                          value={folderPath.join("/")}
                          onChange={(e) =>
                            setFolderPath(e.target.value.split("/").filter(Boolean))
                          }
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Documents will be saved to:{" "}
                        <span className="font-medium">
                          /{folderPath.join("/") || "Root"}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right side - Preview */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium mb-3">Document Preview</h3>
                    {selectedDoc.docId ? (
                      <FilePreview
                        documentId={selectedDoc.docId}
                        mimeType={selectedDoc.mimeType}
                        extractedContent={
                          selectedDoc.extractedMetadata?.description ||
                          selectedDoc.extractedMetadata?.summary ||
                          ""
                        }
                      />
                    ) : (
                      <div className="w-full bg-muted/30 rounded-lg overflow-hidden flex items-center justify-center" style={{ height: "60vh" }}>
                        <div className="text-center text-muted-foreground">
                          <div className="text-4xl mb-2">📄</div>
                          <div className="text-sm font-medium">{selectedDoc.filename}</div>
                          <div className="text-xs mt-1">
                            {selectedDoc.mimeType}
                          </div>
                          <p className="text-xs mt-2 text-muted-foreground">
                            Preview unavailable for this document
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedDoc(null);
                    setFormData(null);
                    setFolderPath([]);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleAccept} disabled={selectedDoc.status === "saving"} className="gap-2">
                  {selectedDoc.status === "saving" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Accepting...
                    </>
                  ) : (
                    "Accept"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AppLayout>
  );
}
