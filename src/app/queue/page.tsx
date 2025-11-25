"use client";

import React, { useState, useEffect } from "react";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud,
  FileText,
  User,
  UserCheck,
  Calendar,
  Bookmark,
  ListChecks,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, getApiContext } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatAppDateTime, parseFlexibleDate } from "@/lib/utils";

// API response can be either ingestion job structure or document structure
type IngestionJobResponse = {
  org_id: string;
  doc_id?: string; // May be at top level or nested
  id?: string; // Document id might be at top level
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

type QueueDocStatus = "ready" | "pending" | "processing" | "error";

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

const MAX_ITEMS = 10;

function mapIngestionJobToQueueDoc(job: IngestionJobResponse): QueueDoc {
  // Handle both nested document structure and flat structure
  const docId = job.doc_id || job.id || job.document?.id || "";
  const docTitle = job.title || job.document?.title || job.filename || job.document?.filename || "";
  const docFilename = job.filename || job.document?.filename || "";
  const docFolderPath = job.folder_path || job.document?.folder_path || [];
  
  // Extract metadata from extracted_metadata or top-level fields
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
  const { toast } = useToast();
  const router = useRouter();

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
        `/orgs/${orgId}/ingestion-jobs?status=pending,processing,needs_review,failed`,
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
    
    // Navigate to upload page with folder path if available
    const pathParam = doc.folderPath && doc.folderPath.length > 0 
      ? `?path=${encodeURIComponent(doc.folderPath.join('/'))}&fromQueue=true`
      : '?fromQueue=true';
    
    router.push(`/documents/upload${pathParam}`);
  };

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
    case "error":
      return "destructive";
    case "processing":
    case "pending":
      return "secondary";
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
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 md:px-6 space-y-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <UploadCloud className="h-5 w-5 text-primary" />
            </div>
            <span>Ready for review</span>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground p-6 text-center border rounded-2xl">
              Loading queue...
            </div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground p-6 text-center border rounded-2xl">
              No queued documents.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((doc) => (
                <Card
                  key={doc.id}
                    className="hover:shadow-md transition-all group"
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

                      {/* Helper note */}
                      {doc.note && (
                        <div className="text-xs text-muted-foreground rounded border bg-muted/30 px-2 py-1">
                          {doc.note}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          disabled={!(doc.status === "ready" || doc.status === "error")}
                          onClick={(e) => {
                            e.stopPropagation();
                            openInUploader(doc);
                          }}
                        >
                          {doc.status === "ready" || doc.status === "error" ? "Review" : "Processing"}
                        </Button>
                      </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
