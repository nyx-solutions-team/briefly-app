"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/app-layout";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Building2,
  Download,
  Eye,
  FileSpreadsheet,
  FileStack,
  FileText,
  Loader2,
  PlaySquare,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ssePost } from "@/lib/api";
import {
  getChatHistoryTranscript,
  listChatHistorySessionArtifacts,
  type ChatHistoryMessage,
} from "@/lib/chat-history";
import { persistChatGeneratedArtifact } from "@/lib/chat-artifacts";
import { HtmlDocumentPreview } from "@/components/html-document-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type WorkbenchArtifactType = "document" | "sheet" | "deck";
type WorkbenchRightTab = "evidence" | "inspector" | "preview" | "run";
type WorkbenchExportFormat = "pdf" | "docx" | "xlsx" | "pptx";

type GeneratedDocumentMetadata = {
  type?: string;
  template?: string;
  token?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  preview_url?: string;
  download_url?: string;
  expires_at?: string;
  preview_text?: string;
};

type WorkbenchSourceRef = {
  docId?: string | null;
  doc_id?: string | null;
  file_name?: string | null;
  docName?: string | null;
  title?: string | null;
  snippet?: string | null;
  page?: number | null;
  page_number?: number | null;
  sourceType?: string | null;
  content?: string | null;
  relevance?: number | null;
};

type WorkbenchArtifactBase = {
  id: string;
  artifact_type: WorkbenchArtifactType;
  title: string;
  version?: number;
  status?: string;
  canvas_kind?: string | null;
  template_type?: string | null;
  document_type?: string | null;
  schema_version?: string | null;
  updated_at?: string | null;
  payload: Record<string, any>;
  source_refs?: WorkbenchSourceRef[];
  exports?: Record<string, any> | null;
  persisted_artifact_id?: string | null;
  expires_at?: string | null;
};

type WorkbenchMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "complete" | "error";
  createdAt: string;
  citations?: WorkbenchSourceRef[];
  metadata?: Record<string, any> | null;
};

type WorkbenchRunEvent = {
  id: string;
  type: "task_step" | "tool_usage" | "heartbeat" | "status";
  title: string;
  status?: string | null;
  description?: string | null;
  tsMs: number;
};

const STARTER_PROMPTS: Array<{
  title: string;
  description: string;
  prompt: string;
  artifactType: WorkbenchArtifactType;
}> = [
    {
      title: "Draft a possession letter",
      description: "Create a letterhead-ready document from the Greenfield Heights handover records.",
      prompt:
        "Draft a customer-ready possession letter for Unit B-1204 using the handover readiness tracker, snag closure confirmation, and possession package details. Keep it formal and ready for export on letterhead.",
      artifactType: "document",
    },
    {
      title: "Compare the Nyx lease pack",
      description: "Find legal and billing mismatches across proposal, lease, invoice, and receipt.",
      prompt:
        "Compare the Nyx Solutions final commercial proposal, final lease agreement, invoice, and receipt. Summarize mismatches in rent, CAM, deposit, and billing terms, and produce an editable comparison artifact.",
      artifactType: "sheet",
    },
    {
      title: "Analyze a rent roll",
      description: "Turn a CSV or workbook into a clean analysis surface with formulas and charts.",
      prompt:
        "Analyze the uploaded rent roll or payment tracker as a sheet artifact. Surface vacancy, overdue payments, average rent, and any notable outliers, then prepare it for XLSX export.",
      artifactType: "sheet",
    },
    {
      title: "Build a client deck",
      description: "Create a short presentation with evidence-backed slides and speaker notes.",
      prompt:
        "Create a 6-slide client presentation summarizing Greenfield Heights handover readiness, open risks, and next actions. Use only facts supported by the project documents and prepare a deck artifact for export.",
      artifactType: "deck",
    },
  ];

function toIsoString(value?: string | null): string {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function buildClientId(prefix: string): string {
  const cryptoApi = typeof crypto !== "undefined" ? crypto : null;
  if (cryptoApi?.randomUUID) {
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getGeneratedDocumentPreviewUrl(doc?: GeneratedDocumentMetadata | null): string | null {
  if (!doc || typeof doc !== "object") return null;
  if (typeof doc.preview_url === "string" && doc.preview_url.trim()) return doc.preview_url.trim();
  if (typeof doc.download_url === "string" && doc.download_url.trim()) return doc.download_url.trim();
  return null;
}

function normalizeSourceRef(input: any): WorkbenchSourceRef {
  if (!input || typeof input !== "object") return {};
  return {
    docId: typeof input.docId === "string" ? input.docId : typeof input.doc_id === "string" ? input.doc_id : null,
    doc_id: typeof input.doc_id === "string" ? input.doc_id : typeof input.docId === "string" ? input.docId : null,
    file_name: typeof input.file_name === "string" ? input.file_name : null,
    docName: typeof input.docName === "string" ? input.docName : typeof input.file_name === "string" ? input.file_name : null,
    title: typeof input.title === "string" ? input.title : typeof input.file_name === "string" ? input.file_name : null,
    snippet:
      typeof input.snippet === "string"
        ? input.snippet
        : typeof input.content === "string"
          ? input.content
          : null,
    content: typeof input.content === "string" ? input.content : null,
    page:
      Number.isFinite(Number(input.page)) && Number(input.page) > 0
        ? Number(input.page)
        : Number.isFinite(Number(input.page_number)) && Number(input.page_number) > 0
          ? Number(input.page_number)
          : null,
    page_number:
      Number.isFinite(Number(input.page_number)) && Number(input.page_number) > 0
        ? Number(input.page_number)
        : Number.isFinite(Number(input.page)) && Number(input.page) > 0
          ? Number(input.page)
          : null,
    sourceType: typeof input.sourceType === "string" ? input.sourceType : typeof input.source_type === "string" ? input.source_type : null,
    relevance: Number.isFinite(Number(input.relevance)) ? Number(input.relevance) : null,
  };
}

function normalizeArtifact(input: any): WorkbenchArtifactBase | null {
  if (!input || typeof input !== "object") return null;
  const artifactType = String(input.artifact_type || "").trim();
  if (!artifactType || !["document", "sheet", "deck"].includes(artifactType)) return null;
  const title = String(input.title || "Workbench artifact").trim() || "Workbench artifact";
  const payload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
    ? input.payload
    : {};
  return {
    id: String(input.id || buildClientId("artifact")).trim(),
    artifact_type: artifactType as WorkbenchArtifactType,
    title,
    version: Number.isFinite(Number(input.version)) ? Number(input.version) : 1,
    status: typeof input.status === "string" ? input.status : "draft",
    canvas_kind: typeof input.canvas_kind === "string" ? input.canvas_kind : artifactType,
    template_type: typeof input.template_type === "string" ? input.template_type : null,
    document_type: typeof input.document_type === "string" ? input.document_type : null,
    schema_version: typeof input.schema_version === "string" ? input.schema_version : null,
    updated_at: typeof input.updated_at === "string" ? input.updated_at : new Date().toISOString(),
    payload,
    source_refs: Array.isArray(input.source_refs) ? input.source_refs.map(normalizeSourceRef) : [],
    exports: input.exports && typeof input.exports === "object" ? input.exports : null,
    persisted_artifact_id: typeof input.persisted_artifact_id === "string" ? input.persisted_artifact_id : null,
    expires_at: typeof input.expires_at === "string" ? input.expires_at : null,
  };
}

function toPersistableArtifactPayload(artifact: WorkbenchArtifactBase): Omit<WorkbenchArtifactBase, "persisted_artifact_id" | "expires_at"> {
  const { persisted_artifact_id: _persistedArtifactId, expires_at: _expiresAt, ...persistable } = artifact;
  return persistable;
}

function serializePersistableArtifact(artifact: WorkbenchArtifactBase | null): string {
  if (!artifact) return "";
  try {
    return JSON.stringify(toPersistableArtifactPayload(artifact));
  } catch {
    return "";
  }
}

function mapPersistedMessage(message: ChatHistoryMessage): WorkbenchMessage | null {
  if (!message || (message.role !== "user" && message.role !== "assistant")) return null;
  return {
    id: String(message.client_message_id || message.id || buildClientId(message.role)),
    role: message.role,
    content: safeString(message.content),
    status: message.status === "error" ? "error" : message.status === "streaming" ? "streaming" : "complete",
    createdAt: toIsoString(message.created_at),
    citations: Array.isArray(message.citations) ? message.citations.map(normalizeSourceRef) : [],
    metadata: message.metadata && typeof message.metadata === "object" ? message.metadata : null,
  };
}

function buildSessionTitle(question: string, artifact: WorkbenchArtifactBase | null): string {
  if (artifact?.title) return artifact.title;
  const compact = question.trim();
  return compact.length > 96 ? `${compact.slice(0, 93)}...` : compact;
}

function buildConversation(messages: WorkbenchMessage[]): Array<{ role: string; content: string }> {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: safeString(message.content).slice(0, 4000),
    }));
}

function inferArtifactTypeLabel(artifact: WorkbenchArtifactBase | null): string {
  if (!artifact) return "No artifact";
  if (artifact.artifact_type === "document") return "Document";
  if (artifact.artifact_type === "sheet") return "Sheet";
  if (artifact.artifact_type === "deck") return "Deck";
  return "Artifact";
}

function artifactTheme(artifact: WorkbenchArtifactBase | null): {
  badge: string;
  panel: string;
  icon: string;
  accent: string;
  border: string;
  muted: string;
  glow: string;
} {
  if (artifact?.artifact_type === "sheet") {
    return {
      badge: "border-emerald-200/50 bg-emerald-50/80 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-50",
      panel: "border-emerald-200/40 bg-white/95 dark:border-emerald-900/40 dark:bg-slate-950/95",
      icon: "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20",
      accent: "text-emerald-950 dark:text-emerald-50",
      border: "border-emerald-200/50 dark:border-emerald-800/40",
      muted: "text-emerald-800/70 dark:text-emerald-100/60",
      glow: "after:bg-emerald-500/10",
    };
  }
  if (artifact?.artifact_type === "deck") {
    return {
      badge: "border-sky-200/50 bg-sky-50/80 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-50",
      panel: "border-sky-200/40 bg-white/95 dark:border-sky-900/40 dark:bg-slate-950/95",
      icon: "bg-sky-500 text-white shadow-lg shadow-sky-500/20",
      accent: "text-sky-950 dark:text-sky-50",
      border: "border-sky-200/50 dark:border-sky-800/40",
      muted: "text-sky-800/70 dark:text-sky-100/60",
      glow: "after:bg-sky-500/10",
    };
  }
  if (artifact?.artifact_type === "document") {
    return {
      badge: "border-amber-200/50 bg-amber-50/80 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50",
      panel: "border-amber-200/40 bg-white/95 dark:border-amber-900/40 dark:bg-slate-950/95",
      icon: "bg-amber-500 text-white shadow-lg shadow-amber-500/20",
      accent: "text-amber-950 dark:text-amber-50",
      border: "border-amber-200/50 dark:border-amber-800/40",
      muted: "text-amber-800/70 dark:text-amber-100/60",
      glow: "after:bg-amber-500/10",
    };
  }
  return {
    badge: "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
    panel: "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950",
    icon: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950",
    accent: "text-slate-950 dark:text-slate-50",
    border: "border-slate-200 dark:border-slate-800",
    muted: "text-slate-700/80 dark:text-slate-300/80",
    glow: "",
  };
}


function formatTimeLabel(value?: string | number | null): string {
  if (value === null || value === undefined) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function eventTone(status?: string | null): {
  dot: string;
  badge: string;
  line: string;
} {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("error") || normalized.includes("fail")) {
    return {
      dot: "bg-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.12)]",
      badge: "border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100",
      line: "from-rose-200 via-rose-200/50 to-transparent dark:from-rose-500/30 dark:via-rose-500/10 dark:to-transparent",
    };
  }
  if (normalized.includes("complete") || normalized.includes("done") || normalized.includes("success")) {
    return {
      dot: "bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.12)]",
      badge: "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
      line: "from-emerald-200 via-emerald-200/50 to-transparent dark:from-emerald-500/30 dark:via-emerald-500/10 dark:to-transparent",
    };
  }
  if (normalized.includes("running") || normalized.includes("start") || normalized.includes("wait")) {
    return {
      dot: "bg-sky-500 shadow-[0_0_0_6px_rgba(14,165,233,0.12)]",
      badge: "border-sky-200/80 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100",
      line: "from-sky-200 via-sky-200/50 to-transparent dark:from-sky-500/30 dark:via-sky-500/10 dark:to-transparent",
    };
  }
  return {
    dot: "bg-slate-400 shadow-[0_0_0_6px_rgba(148,163,184,0.12)] dark:bg-slate-500",
    badge: "border-slate-200/80 bg-slate-50 text-slate-700 dark:border-slate-700/80 dark:bg-slate-800/90 dark:text-slate-200",
    line: "from-slate-200 via-slate-200/50 to-transparent dark:from-slate-700/80 dark:via-slate-700/30 dark:to-transparent",
  };
}

function artifactIcon(artifact: WorkbenchArtifactBase | null) {
  if (artifact?.artifact_type === "sheet") return FileSpreadsheet;
  if (artifact?.artifact_type === "deck") return FileStack;
  return FileText;
}

function latestAssistantMessage(messages: WorkbenchMessage[]): WorkbenchMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return messages[index];
  }
  return null;
}

function stringifyPretty(value: any): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function parseEditableJson(value: string, fallback: Record<string, any>): Record<string, any> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
  } catch { }
  return fallback;
}

function MessageBubble({ message }: { message: WorkbenchMessage }) {
  const isUser = message.role === "user";
  const timeLabel = formatTimeLabel(message.createdAt);
  return (
    <div className={cn("group flex w-full flex-col gap-2", isUser ? "items-end" : "items-start")}>
      <div className="flex items-center gap-2 px-1">
        <div className={cn(
          "h-1.5 w-1.5 rounded-full",
          isUser ? "bg-slate-300 dark:bg-slate-700" : "bg-emerald-500"
        )} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {isUser ? "You" : "Briefly Agent"}
        </span>
        <span className="text-[10px] text-slate-300 dark:text-slate-600">
          {timeLabel || "Just now"}
        </span>
      </div>
      <div
        className={cn(
          "relative max-w-[95%] rounded-[20px] px-5 py-4 text-[15px] leading-relaxed transition-all duration-300",
          isUser
            ? "bg-slate-100 text-slate-900 dark:bg-slate-800/50 dark:text-slate-100"
            : "border border-slate-200 bg-white shadow-sm dark:border-slate-800/50 dark:bg-slate-900/50 dark:text-slate-100"
        )}
      >
        <div className="whitespace-pre-wrap">{message.content || (message.status === "streaming" ? <div className="flex gap-1 py-1"><div className="h-1 w-1 animate-bounce rounded-full bg-slate-400" /><div className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:0.2s]" /><div className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:0.4s]" /></div> : "")}</div>

        {Array.isArray(message.citations) && message.citations.length > 0 && !isUser && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {message.citations.slice(0, 3).map((citation, i) => (
              <span key={i} className="flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <Search className="h-2.5 w-2.5" />
                {citation.title || "Source"}
              </span>
            ))}
            {message.citations.length > 3 && (
              <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-800">
                +{message.citations.length - 3} more
              </span>
            )}
          </div>
        )}

        {message.status === "error" && (
          <div className="mt-2 flex items-center gap-2 text-xs text-rose-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            Execution failed
          </div>
        )}
      </div>
    </div>
  );
}

function EvidencePane({ sources }: { sources: WorkbenchSourceRef[] }) {
  if (!sources.length) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-white/5 dark:bg-white/5">
        <Search className="mb-4 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-500">No evidence grounded yet.</p>
        <p className="mt-1 text-xs text-slate-400">Citations will appear here after the agent researches documents.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Retrieved Sources ({sources.length})</h3>
        <Badge variant="outline" className="h-5 rounded-md text-[10px] dark:border-white/10 text-emerald-500 border-emerald-500/20 bg-emerald-500/5">Grounded</Badge>
      </div>
      <div className="grid gap-4">
        {sources.map((source, index) => (
          <div
            key={`${source.docId || source.doc_id || source.file_name || "source"}-${index}`}
            className="group relative flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 dark:border-white/5 dark:bg-slate-900/50 dark:hover:border-white/10"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 dark:bg-white/5">
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                  {source.title || source.docName || source.file_name || `Source ${index + 1}`}
                </span>
              </div>
              {source.relevance && (
                <span className="text-[10px] font-mono text-emerald-500">{(source.relevance * 100).toFixed(0)}% MATCH</span>
              )}
            </div>
            <div className="relative">
              <div className="absolute -left-4 top-0 bottom-0 w-1 bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-4 italic">
                "{source.snippet || source.content || "No snippet available."}"
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-slate-50 pt-2 dark:border-white/5">
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">
                {source.page || source.page_number ? `Page ${source.page || source.page_number}` : "Full Document"}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{source.docId?.slice(0, 8) || "REF-ID"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function DocumentInspector({
  artifact,
  onChange,
}: {
  artifact: WorkbenchArtifactBase;
  onChange: (next: WorkbenchArtifactBase) => void;
}) {
  const payload = artifact.payload || {};
  const [fieldsText, setFieldsText] = React.useState(() => stringifyPretty(payload.fields || {}));

  React.useEffect(() => {
    setFieldsText(stringifyPretty(artifact.payload?.fields || {}));
  }, [artifact.id, artifact.updated_at, artifact.version]);

  const commitFields = React.useCallback(() => {
    onChange({
      ...artifact,
      updated_at: new Date().toISOString(),
      payload: {
        ...artifact.payload,
        fields: parseEditableJson(fieldsText, artifact.payload?.fields || {}),
      },
    });
  }, [artifact, fieldsText, onChange]);

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.88))] p-5 shadow-[0_24px_50px_-36px_rgba(180,83,9,0.38)] dark:border-amber-500/20 dark:bg-[linear-gradient(135deg,rgba(120,53,15,0.25),rgba(2,6,23,0.75))]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700/80 dark:text-amber-100/70">Document source model</div>
            <div className="mt-1 text-lg font-semibold text-amber-950 dark:text-amber-50">Editable drafting surface</div>
          </div>
          <Badge className="rounded-full border-amber-200 bg-white/80 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50">
            {safeString(payload.mode, "rich_text")}
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-amber-800/70 dark:text-amber-100/70">Title</div>
            <Input
              value={artifact.title}
              onChange={(event) =>
                onChange({
                  ...artifact,
                  title: event.target.value,
                  updated_at: new Date().toISOString(),
                })
              }
              className="border-amber-200/80 bg-white/85 dark:border-amber-500/20 dark:bg-slate-950/70"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-amber-800/70 dark:text-amber-100/70">Mode</div>
            <Input
              value={safeString(payload.mode, "rich_text")}
              onChange={(event) =>
                onChange({
                  ...artifact,
                  updated_at: new Date().toISOString(),
                  payload: {
                    ...artifact.payload,
                    mode: event.target.value,
                  },
                })
              }
              className="border-amber-200/80 bg-white/85 dark:border-amber-500/20 dark:bg-slate-950/70"
            />
          </div>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Body copy</div>
            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Rich text draft</span>
          </div>
          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_24px_50px_-34px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-950/75">
            <Textarea
              value={safeString(payload.content_markdown)}
              onChange={(event) =>
                onChange({
                  ...artifact,
                  updated_at: new Date().toISOString(),
                  payload: {
                    ...artifact.payload,
                    content_markdown: event.target.value,
                  },
                })
              }
              className="min-h-[460px] resize-none border-0 bg-transparent px-1 font-[ui-serif,Georgia,Cambria,Times_New_Roman,Times,serif] text-[15px] leading-8 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Structured fields</div>
            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">JSON envelope</span>
          </div>
          <div className="rounded-[28px] border border-slate-200/80 bg-slate-950 p-4 shadow-[0_26px_52px_-34px_rgba(15,23,42,0.45)] dark:border-slate-800">
            <Textarea
              value={fieldsText}
              onChange={(event) => setFieldsText(event.target.value)}
              onBlur={commitFields}
              className="min-h-[460px] resize-none border-0 bg-transparent font-mono text-xs leading-6 text-slate-100 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SheetInspector({
  artifact,
  onChange,
}: {
  artifact: WorkbenchArtifactBase;
  onChange: (next: WorkbenchArtifactBase) => void;
}) {
  const payload = artifact.payload || {};
  const [formulaText, setFormulaText] = React.useState(() => stringifyPretty(payload.formulas || {}));

  React.useEffect(() => {
    setFormulaText(stringifyPretty(artifact.payload?.formulas || {}));
  }, [artifact.id, artifact.updated_at, artifact.version]);

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.92),rgba(255,255,255,0.88))] p-5 shadow-[0_24px_50px_-36px_rgba(5,150,105,0.32)] dark:border-emerald-500/20 dark:bg-[linear-gradient(135deg,rgba(6,78,59,0.28),rgba(2,6,23,0.75))]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800/80 dark:text-emerald-100/70">Analysis surface</div>
            <div className="mt-1 text-lg font-semibold text-emerald-950 dark:text-emerald-50">Workbook controls</div>
          </div>
          <Badge className="rounded-full border-emerald-200 bg-white/80 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-50">
            {`${payload.total_rows ?? 0} rows`}
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-800/70 dark:text-emerald-100/70">Workbook</div>
            <Input
              value={safeString(payload.workbook_name, artifact.title)}
              onChange={(event) =>
                onChange({
                  ...artifact,
                  updated_at: new Date().toISOString(),
                  payload: {
                    ...artifact.payload,
                    workbook_name: event.target.value,
                  },
                })
              }
              className="border-emerald-200/80 bg-white/85 dark:border-emerald-500/20 dark:bg-slate-950/70"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-800/70 dark:text-emerald-100/70">Total rows</div>
            <Input value={String(payload.total_rows ?? 0)} readOnly className="border-emerald-200/80 bg-white/85 dark:border-emerald-500/20 dark:bg-slate-950/70" />
          </div>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Analysis summary</div>
          <div className="rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_24px_50px_-34px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-950/75">
            <Textarea
              value={safeString(payload.analysis_summary)}
              onChange={(event) =>
                onChange({
                  ...artifact,
                  updated_at: new Date().toISOString(),
                  payload: {
                    ...artifact.payload,
                    analysis_summary: event.target.value,
                  },
                })
              }
              className="min-h-[200px] resize-none border-0 bg-transparent px-1 text-sm leading-7 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Formulas and metrics</div>
          <div className="rounded-[28px] border border-slate-200/80 bg-slate-950 p-4 shadow-[0_26px_52px_-34px_rgba(15,23,42,0.45)] dark:border-slate-800">
            <Textarea
              value={formulaText}
              onChange={(event) => setFormulaText(event.target.value)}
              onBlur={() =>
                onChange({
                  ...artifact,
                  updated_at: new Date().toISOString(),
                  payload: {
                    ...artifact.payload,
                    formulas: parseEditableJson(formulaText, artifact.payload?.formulas || {}),
                  },
                })
              }
              className="min-h-[200px] resize-none border-0 bg-transparent font-mono text-xs leading-6 text-slate-100 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
      </div>
      {Array.isArray(payload.rows_preview) && payload.rows_preview.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Rows preview</div>
            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">First 8 rows</span>
          </div>
          <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/92 shadow-[0_24px_50px_-34px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-950/75">
            <Table>
              <TableHeader className="bg-slate-50/85 dark:bg-slate-900/80">
                <TableRow>
                  {Array.isArray(payload.columns) && payload.columns.length > 0
                    ? payload.columns.map((column: string) => <TableHead key={column} className="h-11 font-semibold text-slate-600 dark:text-slate-300">{column}</TableHead>)
                    : Object.keys(payload.rows_preview[0] || {}).map((column) => <TableHead key={column} className="h-11 font-semibold text-slate-600 dark:text-slate-300">{column}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {payload.rows_preview.slice(0, 8).map((row: Record<string, any>, rowIndex: number) => (
                  <TableRow key={rowIndex} className="border-slate-200/70 dark:border-slate-800">
                    {(Array.isArray(payload.columns) && payload.columns.length > 0 ? payload.columns : Object.keys(row || {})).map((column: string) => (
                      <TableCell key={`${rowIndex}-${column}`} className="py-3 text-sm text-slate-600 dark:text-slate-300">{String(row?.[column] ?? "")}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeckInspector({
  artifact,
  onChange,
}: {
  artifact: WorkbenchArtifactBase;
  onChange: (next: WorkbenchArtifactBase) => void;
}) {
  const payload = artifact.payload || {};
  const slides = Array.isArray(payload.slides) ? payload.slides : [];

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-sky-200/80 bg-[linear-gradient(135deg,rgba(239,246,255,0.92),rgba(255,255,255,0.88))] p-5 shadow-[0_24px_50px_-36px_rgba(2,132,199,0.28)] dark:border-sky-500/20 dark:bg-[linear-gradient(135deg,rgba(12,74,110,0.28),rgba(2,6,23,0.75))]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-800/80 dark:text-sky-100/70">Presentation surface</div>
            <div className="mt-1 text-lg font-semibold text-sky-950 dark:text-sky-50">Slide story and notes</div>
          </div>
          <Badge className="rounded-full border-sky-200 bg-white/80 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-50">
            {slides.length} slide{slides.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-800/70 dark:text-sky-100/70">Summary</div>
          <Textarea
            value={safeString(payload.summary)}
            onChange={(event) =>
              onChange({
                ...artifact,
                updated_at: new Date().toISOString(),
                payload: {
                  ...artifact.payload,
                  summary: event.target.value,
                },
              })
            }
            className="min-h-[140px] border-sky-200/80 bg-white/85 dark:border-sky-500/20 dark:bg-slate-950/70"
          />
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Slides</div>
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Edit one slide at a time</span>
        </div>
        {slides.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-300/80 bg-white/70 p-5 text-sm text-slate-600 dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-slate-300">
            No slides yet. Ask the deck agent to draft an outline from the source documents.
          </div>
        ) : (
          slides.map((slide: Record<string, any>, index: number) => (
            <Card
              key={String(slide.id || index)}
              className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/86 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950/75"
            >
              <CardHeader className="pb-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                  Slide {index + 1}
                </div>
                <Input
                  value={safeString(slide.title, `Slide ${index + 1}`)}
                  onChange={(event) => {
                    const nextSlides = slides.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, title: event.target.value } : entry
                    );
                    onChange({
                      ...artifact,
                      updated_at: new Date().toISOString(),
                      payload: {
                        ...artifact.payload,
                        slides: nextSlides,
                      },
                    });
                  }}
                  className="border-slate-200/80 bg-slate-50/80 text-base font-medium dark:border-slate-700 dark:bg-slate-900"
                />
              </CardHeader>
              <CardContent className="pt-0">
                <Textarea
                  value={safeString(slide.notes)}
                  onChange={(event) => {
                    const nextSlides = slides.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, notes: event.target.value } : entry
                    );
                    onChange({
                      ...artifact,
                      updated_at: new Date().toISOString(),
                      payload: {
                        ...artifact.payload,
                        slides: nextSlides,
                      },
                    });
                  }}
                  className="min-h-[160px] border-slate-200/80 bg-slate-50/65 leading-7 dark:border-slate-700 dark:bg-slate-900"
                />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function PreviewPane({
  artifact,
  generatedDocument,
}: {
  artifact: WorkbenchArtifactBase | null;
  generatedDocument: GeneratedDocumentMetadata | null;
}) {
  const previewUrl = getGeneratedDocumentPreviewUrl(generatedDocument);

  if (previewUrl) {
    return (
      <div className="space-y-4">
        <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.82))] p-4 shadow-[0_20px_45px_-32px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.9),rgba(2,6,23,0.85))]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Preview surface</div>
              <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">{generatedDocument?.title || artifact?.title || "Generated preview"}</div>
            </div>
            <Badge className="rounded-full border-slate-200 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {generatedDocument?.mime_type || "generated file"}
            </Badge>
          </div>
          <div>
            <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{generatedDocument?.file_name || generatedDocument?.mime_type || "Generated file"}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">The export preview is live from the latest workbench state.</div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            {generatedDocument?.download_url ? (
              <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-white/85 dark:border-slate-700 dark:bg-slate-900">
                <a href={generatedDocument.download_url} target="_blank" rel="noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
            ) : null}
            <Button asChild size="sm" className="rounded-full bg-slate-950 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200">
              <a href={previewUrl} target="_blank" rel="noreferrer">
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Open
              </a>
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_55px_-34px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950">
          <iframe
            src={previewUrl}
            title={generatedDocument?.title || artifact?.title || "Workbench preview"}
            className="h-[720px] w-full bg-white"
          />
        </div>
      </div>
    );
  }

  if (artifact?.artifact_type === "document") {
    const fields = artifact.payload?.fields && typeof artifact.payload.fields === "object" ? artifact.payload.fields : {};
    const templateType =
      artifact.template_type ||
      artifact.document_type ||
      safeString(artifact.payload?.render_template?.template_id, "letterhead_letter");
    return (
      <div className="space-y-4">
        <div className="rounded-[24px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.9))] p-4 shadow-[0_20px_45px_-32px_rgba(120,53,15,0.26)] dark:border-amber-500/20 dark:bg-[linear-gradient(135deg,rgba(120,53,15,0.25),rgba(2,6,23,0.8))]">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700/80 dark:text-amber-100/70">Live preview</div>
          <div className="mt-1 text-lg font-semibold text-amber-950 dark:text-amber-50">Document render from the editable source model</div>
          <div className="mt-2 text-sm leading-6 text-amber-900/80 dark:text-amber-100/75">Exported PDF or DOCX will be generated from the current canvas state, not from a detached file copy.</div>
        </div>
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_24px_55px_-34px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950">
          <HtmlDocumentPreview
            templateType={templateType}
            htmlTemplate={safeString(artifact.payload?.render_template?.html_template)}
            css={safeString(artifact.payload?.render_template?.css) || null}
            branding={artifact.payload?.render_template?.branding ?? null}
            data={{
              ...(fields || {}),
              body: safeString(artifact.payload?.content_markdown),
              content_markdown: safeString(artifact.payload?.content_markdown),
            }}
            className="max-h-[760px] overflow-auto"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-dashed border-slate-300/80 bg-white/70 p-5 text-sm text-slate-600 dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-slate-300">
      No preview available yet. Generate a document artifact or request an export from the current workbench state.
    </div>
  );
}

function RunPane({ events, isStreaming }: { events: WorkbenchRunEvent[]; isStreaming: boolean }) {
  if (!events.length) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-white/5 dark:bg-white/5">
        <PlaySquare className="mb-4 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-500">No events recorded.</p>
        <p className="mt-1 text-xs text-slate-400">Agent execution telemetry will stream here.</p>
      </div>
    );
  }
  return (
    <div className="relative space-y-0.5">
      <div className="absolute left-[19px] top-4 bottom-4 w-px bg-slate-100 dark:bg-white/5" />
      {events.map((event, index) => {
        const tone = eventTone(event.status);
        return (
          <div key={event.id} className="group relative flex gap-4 p-3 transition-colors hover:bg-slate-50/50 dark:hover:bg-white/5 rounded-xl">
            <div className={cn("relative z-10 mt-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-slate-200 shadow-sm dark:border-slate-950", tone.dot === "bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.12)]" ? "bg-emerald-500" : tone.dot === "bg-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.12)]" ? "bg-rose-500" : "bg-slate-400")} />
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{event.type.replace("_", " ")}</span>
                <span className="text-[10px] font-mono text-slate-300 dark:text-slate-600">{formatTimeLabel(event.tsMs)}</span>
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{event.title}</h4>
              {event.description && (
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{event.description}</p>
              )}
            </div>
          </div>
        );
      })}
      {isStreaming && (
        <div className="flex items-center gap-3 p-3">
          <div className="flex h-3.5 w-3.5 animate-pulse items-center justify-center rounded-full bg-emerald-500/20">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </div>
          <span className="text-xs font-semibold text-emerald-500 animate-pulse uppercase tracking-widest">Awaiting Upstream...</span>
        </div>
      )}
    </div>
  );
}

export default function ChatWorkbenchPage() {
  const { bootstrapData } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSessionId = React.useMemo(() => {
    const raw = searchParams?.get("session");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const orgId = bootstrapData?.selectedOrgId || "";
  const workbenchEnabled = bootstrapData?.labs?.chat_workbench === true;

  const [sessionId, setSessionId] = React.useState<string | null>(requestedSessionId);
  const [messages, setMessages] = React.useState<WorkbenchMessage[]>([]);
  const [composer, setComposer] = React.useState("");
  const [activeArtifact, setActiveArtifact] = React.useState<WorkbenchArtifactBase | null>(null);
  const [generatedDocument, setGeneratedDocument] = React.useState<GeneratedDocumentMetadata | null>(null);
  const [rightTab, setRightTab] = React.useState<WorkbenchRightTab>("preview");
  const [leftWidth, setLeftWidth] = React.useState(480);
  const [isResizing, setIsResizing] = React.useState(false);

  const startResizing = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = Math.min(Math.max(320, e.clientX), 800);
      setLeftWidth(newWidth);
    }
  }, [isResizing]);

  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
      // Prevent text selection during resize
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, resize, stopResizing]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [isHydrating, setIsHydrating] = React.useState(false);
  const [runEvents, setRunEvents] = React.useState<WorkbenchRunEvent[]>([]);
  const [sources, setSources] = React.useState<WorkbenchSourceRef[]>([]);
  const [saveInFlight, setSaveInFlight] = React.useState(false);

  const transcriptRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const messagesRef = React.useRef<WorkbenchMessage[]>([]);
  const artifactRef = React.useRef<WorkbenchArtifactBase | null>(null);
  const sessionIdRef = React.useRef<string | null>(requestedSessionId);
  const rightTabRef = React.useRef<WorkbenchRightTab>("preview");
  const sourcesRef = React.useRef<WorkbenchSourceRef[]>([]);
  const generatedDocumentRef = React.useRef<GeneratedDocumentMetadata | null>(null);
  const hydrateSkipSessionRef = React.useRef<string | null>(null);
  const persistedArtifactSyncRef = React.useRef<string>("");

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    artifactRef.current = activeArtifact;
  }, [activeArtifact]);

  React.useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  React.useEffect(() => {
    rightTabRef.current = rightTab;
  }, [rightTab]);

  React.useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  React.useEffect(() => {
    generatedDocumentRef.current = generatedDocument;
  }, [generatedDocument]);

  React.useEffect(() => {
    return () => {
      try {
        abortRef.current?.abort();
      } catch { }
    };
  }, []);

  React.useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, runEvents]);

  React.useEffect(() => {
    setSessionId(requestedSessionId);
  }, [requestedSessionId]);

  React.useEffect(() => {
    if (!requestedSessionId) {
      setMessages([]);
      setActiveArtifact(null);
      setGeneratedDocument(null);
      setSources([]);
      setRunEvents([]);
      persistedArtifactSyncRef.current = "";
      return;
    }

    if (
      hydrateSkipSessionRef.current &&
      hydrateSkipSessionRef.current === requestedSessionId &&
      messagesRef.current.length > 0
    ) {
      hydrateSkipSessionRef.current = null;
      return;
    }

    let cancelled = false;
    setIsHydrating(true);

    (async () => {
      try {
        const transcript = await getChatHistoryTranscript(requestedSessionId, {
          mode: "lite",
          limit: 80,
        });
        if (cancelled) return;

        const restoredMessages = (Array.isArray(transcript?.messages) ? transcript.messages : [])
          .map(mapPersistedMessage)
          .filter((message): message is WorkbenchMessage => Boolean(message));
        setMessages(restoredMessages);
        setSessionId(String(transcript?.session?.id || requestedSessionId));

        const lastAssistant = latestAssistantMessage(restoredMessages);
        const metadataArtifact = normalizeArtifact(lastAssistant?.metadata?.workbench_artifact);
        const metadataPreview =
          lastAssistant?.metadata?.generated_document &&
            typeof lastAssistant.metadata.generated_document === "object"
            ? (lastAssistant.metadata.generated_document as GeneratedDocumentMetadata)
            : null;
        const metadataSources = Array.isArray(lastAssistant?.citations) ? lastAssistant.citations : [];

        try {
          const artifactResp = await listChatHistorySessionArtifacts(requestedSessionId, 50);
          if (cancelled) return;
          const rows = Array.isArray(artifactResp?.artifacts) ? artifactResp.artifacts : [];
          const persistedWorkbenchArtifact = rows.find((row: any) => {
            const artifactType = String(row?.artifactType || "");
            return artifactType.startsWith("workbench_") && row?.payloadJson && typeof row.payloadJson === "object";
          });

          const hydratedArtifact = persistedWorkbenchArtifact
            ? normalizeArtifact({
              ...(persistedWorkbenchArtifact.payloadJson || {}),
              persisted_artifact_id: persistedWorkbenchArtifact.id,
              expires_at: persistedWorkbenchArtifact.expiresAt,
            })
            : metadataArtifact;

          setActiveArtifact(hydratedArtifact);
          if (hydratedArtifact) {
            persistedArtifactSyncRef.current = serializePersistableArtifact(hydratedArtifact);
          }
        } catch (artifactError) {
          console.warn("Failed to hydrate workbench artifact", artifactError);
          setActiveArtifact(metadataArtifact);
          if (metadataArtifact) {
            persistedArtifactSyncRef.current = serializePersistableArtifact(metadataArtifact);
          }
        }

        setGeneratedDocument(metadataPreview);
        setSources(metadataSources.map(normalizeSourceRef));
      } catch (error: any) {
        if (!cancelled) {
          toast({
            title: "Failed to load workbench session",
            description: error?.message || "Unknown error",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestedSessionId, toast]);

  React.useEffect(() => {
    if (!activeArtifact || !sessionId || isStreaming) return;
    const serialized = serializePersistableArtifact(activeArtifact);
    if (!serialized || serialized === persistedArtifactSyncRef.current) return;

    const timer = window.setTimeout(async () => {
      try {
        const persisted = await persistChatGeneratedArtifact({
          clientArtifactId: activeArtifact.id,
          sessionId,
          title: activeArtifact.title,
          artifactType: `workbench_${activeArtifact.artifact_type}`,
          templateType: activeArtifact.template_type || undefined,
          documentType: activeArtifact.document_type || undefined,
          schemaVersion: activeArtifact.schema_version || undefined,
          payloadJson: toPersistableArtifactPayload(activeArtifact),
        });
        persistedArtifactSyncRef.current = serialized;
        setActiveArtifact((current) => {
          if (!current || current.id !== activeArtifact.id) return current;
          return {
            ...current,
            persisted_artifact_id: persisted.id,
            expires_at: persisted.expiresAt || null,
          };
        });
      } catch (error) {
        console.warn("Failed to autosave workbench artifact", error);
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeArtifact, isStreaming, sessionId]);

  const upsertLocalMessage = React.useCallback((messageId: string, updater: (message: WorkbenchMessage) => WorkbenchMessage) => {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? updater(message) : message))
    );
  }, []);

  const pushRunEvent = React.useCallback((event: Omit<WorkbenchRunEvent, "id">) => {
    setRunEvents((current) => [
      ...current,
      {
        id: buildClientId("run"),
        ...event,
      },
    ]);
  }, []);

  const persistNow = React.useCallback(async () => {
    if (!activeArtifact || !sessionId) return;
    setSaveInFlight(true);
    try {
      const serialized = serializePersistableArtifact(activeArtifact);
      const persisted = await persistChatGeneratedArtifact({
        clientArtifactId: activeArtifact.id,
        sessionId,
        title: activeArtifact.title,
        artifactType: `workbench_${activeArtifact.artifact_type}`,
        templateType: activeArtifact.template_type || undefined,
        documentType: activeArtifact.document_type || undefined,
        schemaVersion: activeArtifact.schema_version || undefined,
        payloadJson: toPersistableArtifactPayload(activeArtifact),
      });
      persistedArtifactSyncRef.current = serialized;
      setActiveArtifact((current) => {
        if (!current || current.id !== activeArtifact.id) return current;
        return {
          ...current,
          persisted_artifact_id: persisted.id,
          expires_at: persisted.expiresAt || null,
        };
      });
      toast({ title: "Snapshot saved", description: "Workbench artifact persisted for this chat session." });
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message || "Could not persist workbench artifact.",
        variant: "destructive",
      });
    } finally {
      setSaveInFlight(false);
    }
  }, [activeArtifact, sessionId, toast]);

  const submitPrompt = React.useCallback(
    async (questionOverride?: string, options?: { requestedExport?: WorkbenchExportFormat | null; preserveComposer?: boolean }) => {
      if (!orgId) {
        toast({
          title: "No organization selected",
          description: "Select an organization before using the workbench.",
          variant: "destructive",
        });
        return;
      }

      const question = String(questionOverride ?? composer).trim();
      if (!question || isStreaming) return;

      const userMessageId = buildClientId("user");
      const assistantMessageId = buildClientId("assistant");
      const nowIso = new Date().toISOString();

      setMessages((current) => [
        ...current,
        {
          id: userMessageId,
          role: "user",
          content: question,
          status: "complete",
          createdAt: nowIso,
        },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          status: "streaming",
          createdAt: nowIso,
          citations: [],
          metadata: null,
        },
      ]);
      setIsStreaming(true);
      setRunEvents([]);
      if (!options?.preserveComposer) {
        setComposer("");
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const priorMessages = messagesRef.current.slice();

      try {
        await ssePost(
          `/orgs/${orgId}/chat-workbench/stream`,
          {
            question,
            session_id: sessionIdRef.current || undefined,
            strictCitations: true,
            conversation: buildConversation(priorMessages),
            workbench_context: {
              active_artifact: artifactRef.current || undefined,
              selected_artifact_id: artifactRef.current?.id || null,
              requested_export: options?.requestedExport || null,
              surface_state: {
                active_tab: rightTabRef.current,
              },
            },
            history_persistence: {
              session: {
                session_id: sessionIdRef.current || undefined,
                title: buildSessionTitle(question, artifactRef.current),
                status: "active",
                frontend_context: {
                  surface: "chat_workbench",
                  active_tab: rightTabRef.current,
                  selected_artifact_id: artifactRef.current?.id || null,
                  artifact_type: artifactRef.current?.artifact_type || null,
                },
              },
              user_message: {
                client_message_id: userMessageId,
                role: "user",
                content: question,
                status: "complete",
                is_complete: true,
                metadata: options?.requestedExport
                  ? {
                    workbench_action: "export",
                    requested_export: options.requestedExport,
                  }
                  : null,
              },
              assistant_message: {
                client_message_id: assistantMessageId,
              },
            },
          },
          ({ event, data }) => {
            if (!data || typeof data !== "object") return;

            if (data.type === "start") {
              if (typeof data.session_id === "string" && data.session_id.trim()) {
                const nextSessionId = data.session_id.trim();
                setSessionId(nextSessionId);
                sessionIdRef.current = nextSessionId;
                hydrateSkipSessionRef.current = nextSessionId;
                router.replace(`/chat-workbench?session=${encodeURIComponent(nextSessionId)}`);
              }
              pushRunEvent({
                type: "status",
                title: "Run started",
                status: safeString(data.status, "started"),
                description: safeString(data.kind, "Workbench run initialized"),
                tsMs: Number(data.ts_ms) || Date.now(),
              });
              return;
            }

            if (data.type === "task_step") {
              pushRunEvent({
                type: "task_step",
                title: safeString(data.title, safeString(data.step, "Step")),
                status: safeString(data.status, "running"),
                description: safeString(data.description),
                tsMs: Number(data.ts_ms) || Date.now(),
              });
              return;
            }

            if (data.type === "tool_usage") {
              pushRunEvent({
                type: "tool_usage",
                title: safeString(data.name, "Tool"),
                status: safeString(data.status, "running"),
                description: safeString(data.description),
                tsMs: Number(data.ts_ms) || Date.now(),
              });
              return;
            }

            if (data.type === "heartbeat") {
              pushRunEvent({
                type: "heartbeat",
                title: "Heartbeat",
                status: safeString(data.status, "waiting"),
                description: "Waiting for the next upstream chunk.",
                tsMs: Number(data.ts_ms) || Date.now(),
              });
              return;
            }

            if (data.type === "content" && typeof data.chunk === "string") {
              upsertLocalMessage(assistantMessageId, (message) => ({
                ...message,
                content: `${message.content || ""}${data.chunk}`,
                status: "streaming",
              }));
              return;
            }

            if (data.type === "sources" && Array.isArray(data.sources)) {
              const normalized = data.sources.map(normalizeSourceRef);
              setSources(normalized);
              upsertLocalMessage(assistantMessageId, (message) => ({
                ...message,
                citations: normalized,
              }));
              return;
            }

            if (data.type === "artifact_snapshot" && data.artifact) {
              const artifact = normalizeArtifact(data.artifact);
              if (artifact) {
                setActiveArtifact(artifact);
                setRightTab((current) => (current === "run" ? current : artifact.artifact_type === "document" ? "preview" : "inspector"));
                if (artifact.persisted_artifact_id) {
                  persistedArtifactSyncRef.current = serializePersistableArtifact(artifact);
                }
              }
              return;
            }

            if (data.type === "preview_ready" && data.generated_document && typeof data.generated_document === "object") {
              setGeneratedDocument(data.generated_document as GeneratedDocumentMetadata);
              setRightTab("preview");
              return;
            }

            if (data.type === "complete") {
              const citations = Array.isArray(data.citations) ? data.citations.map(normalizeSourceRef) : sourcesRef.current;
              const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
              const artifact = normalizeArtifact(metadata.workbench_artifact);
              const preview =
                metadata.generated_document && typeof metadata.generated_document === "object"
                  ? (metadata.generated_document as GeneratedDocumentMetadata)
                  : generatedDocumentRef.current;
              if (artifact) {
                setActiveArtifact(artifact);
                if (artifact.persisted_artifact_id) {
                  persistedArtifactSyncRef.current = serializePersistableArtifact(artifact);
                }
              }
              if (preview) {
                setGeneratedDocument(preview);
              }
              if (citations.length > 0) {
                setSources(citations);
              }
              upsertLocalMessage(assistantMessageId, (message) => ({
                ...message,
                content: typeof data.full_content === "string" ? data.full_content : message.content,
                status: "complete",
                citations,
                metadata,
              }));
              pushRunEvent({
                type: "status",
                title: "Run complete",
                status: "complete",
                description: "Workbench artifact and response were finalized.",
                tsMs: Number(data.ts_ms) || Date.now(),
              });
              return;
            }

            if (data.type === "error") {
              const errorText = safeString(data.error, "Workbench request failed");
              upsertLocalMessage(assistantMessageId, (message) => ({
                ...message,
                content: message.content ? `${message.content}\n\n${errorText}` : errorText,
                status: "error",
              }));
              pushRunEvent({
                type: "status",
                title: "Run failed",
                status: "error",
                description: errorText,
                tsMs: Number(data.ts_ms) || Date.now(),
              });
            }

            if (event === "end") {
              setIsStreaming(false);
            }
          },
          { signal: controller.signal }
        );
      } catch (error: any) {
        upsertLocalMessage(assistantMessageId, (message) => ({
          ...message,
          status: "error",
          content: message.content
            ? `${message.content}\n\n${error?.message || "Workbench request failed."}`
            : error?.message || "Workbench request failed.",
        }));
        pushRunEvent({
          type: "status",
          title: "Run failed",
          status: "error",
          description: error?.message || "Workbench request failed.",
          tsMs: Date.now(),
        });
        toast({
          title: "Workbench request failed",
          description: error?.message || "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [composer, isStreaming, orgId, router, sources, toast, upsertLocalMessage, pushRunEvent]
  );

  const requestExport = React.useCallback(
    (format: WorkbenchExportFormat) => {
      if (!artifactRef.current) return;
      const question = format === "docx"
        ? "Export the current workbench artifact as DOCX."
        : format === "pdf"
          ? "Render the current workbench artifact as PDF preview."
          : format === "xlsx"
            ? "Export the current workbench artifact as XLSX."
            : "Export the current workbench artifact as PPTX.";
      void submitPrompt(question, {
        requestedExport: format,
        preserveComposer: true,
      });
    },
    [submitPrompt]
  );

  const handleArtifactChange = React.useCallback((next: WorkbenchArtifactBase) => {
    setActiveArtifact({
      ...next,
      updated_at: new Date().toISOString(),
    });
  }, []);

  const ArtifactIcon = artifactIcon(activeArtifact);
  const theme = artifactTheme(activeArtifact);
  const sessionLabel = sessionId ? `Session ${sessionId.slice(0, 8)}…` : "New workbench session";
  const persistenceLabel = activeArtifact?.persisted_artifact_id
    ? activeArtifact.expires_at
      ? `Saved until ${new Date(activeArtifact.expires_at).toLocaleDateString()}`
      : "Saved to session history"
    : activeArtifact
      ? "Local draft"
      : "No artifact yet";

  if (!workbenchEnabled) {
    return (
      <AppLayout>
        <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[linear-gradient(180deg,#f5efe7_0%,#edf3ef_46%,#eef3f9_100%)] px-6 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_60%,#111827_100%)]">
          <div className="absolute inset-0">
            <div className="absolute left-[-6rem] top-[-5rem] h-64 w-64 rounded-full bg-emerald-300/25 blur-3xl dark:bg-emerald-500/10" />
            <div className="absolute right-[-7rem] top-8 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />
          </div>
          <div className="relative mx-auto flex min-h-[calc(100vh-10rem)] max-w-4xl items-center justify-center">
            <Card className="w-full overflow-hidden rounded-[32px] border-white/80 bg-white/78 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/78">
              <CardHeader className="border-b border-slate-200/70 pb-6 dark:border-slate-800">
                <div className="mb-4 flex items-center gap-2">
                  <Badge className="rounded-full border-slate-200 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    Experimental surface
                  </Badge>
                  <Badge className="rounded-full border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    disabled
                  </Badge>
                </div>
                <CardTitle className="text-3xl tracking-tight text-slate-950 dark:text-slate-50">Chat Workbench</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                  This page stays hidden until `bootstrap.labs.chat_workbench` is enabled for the current organization. The current chat experience remains untouched until that flag is turned on.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                <Button asChild className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200">
                  <a href="/chatnew">Return to chat</a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout flush>
      <div className="relative flex h-full flex-col overflow-hidden bg-white dark:bg-[#0a0a0a]">
        {/* Premium Gradient Backgrounds */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[40%] rounded-full bg-emerald-500/5 blur-[120px] dark:bg-emerald-500/10" />
          <div className="absolute -right-[10%] bottom-[10%] h-[40%] w-[40%] rounded-full bg-sky-500/5 blur-[120px] dark:bg-sky-500/10" />
        </div>

        {/* Sleek Top Navigation */}
        <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200/60 bg-white/80 px-4 backdrop-blur-md dark:border-white/5 dark:bg-black/40">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black">
                <Bot className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Briefly Workbench</span>
            </div>
            <Separator orientation="vertical" className="h-4 bg-slate-200 dark:bg-white/10" />
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="max-w-[120px] truncate sm:max-w-[200px]">{sessionLabel}</span>
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:border-white/10">
                BETA
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeArtifact && (
              <div className="hidden items-center gap-1.5 md:flex">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status:</span>
                <Badge className={cn("h-5 rounded-full px-2 text-[10px] font-medium", theme.badge)}>
                  {activeArtifact.status || "Draft"}
                </Badge>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void persistNow()}
              disabled={!activeArtifact || !sessionId || saveInFlight}
              className="h-8 rounded-full text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5"
            >
              {saveInFlight ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Save Snapshot
            </Button>
            <Button
              size="sm"
              onClick={() => router.push("/chat-workbench")}
              className="h-8 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            >
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              New Session
            </Button>
          </div>
        </header>

        {/* Main Container */}
        <main className="relative flex flex-1 overflow-hidden">
          {/* Left Column: Conversation */}
          <div
            className="relative hidden flex-col bg-slate-50/30 dark:bg-transparent md:flex"
            style={{ width: `${leftWidth}px` }}
          >
            <div className="flex h-full flex-col overflow-hidden border-r border-slate-200/60 dark:border-white/5">
              <div className="flex flex-1 flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div ref={transcriptRef} className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
                    {isHydrating ? (
                      <div className="flex h-32 items-center justify-center gap-2 text-sm text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Hydrating context...
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col gap-8 py-12 text-center text-slate-500">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/5">
                          <Sparkles className="h-8 w-8 text-emerald-500" />
                        </div>
                        <div className="space-y-2">
                          <h2 className="text-xl font-semibold text-slate-900 dark:text-white text-center">Ready for your next draft?</h2>
                          <p className="text-sm leading-relaxed max-w-xs mx-auto text-center">
                            Ask me to draft a document, compare lease terms, analyze a dataset, or build a presentation.
                          </p>
                        </div>
                        <div className="grid gap-2">
                          {STARTER_PROMPTS.map((p) => (
                            <button
                              key={p.title}
                              onClick={() => setComposer(p.prompt)}
                              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-emerald-500/30 hover:bg-emerald-50/30 dark:border-white/5 dark:bg-slate-900/50 dark:hover:bg-emerald-500/5 text-slate-800"
                            >
                              <span className="text-sm font-medium dark:text-slate-100">{p.title}</span>
                              <ArrowRight className="h-4 w-4 text-slate-300" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      messages.map((m) => <MessageBubble key={m.id} message={m} />)
                    )}
                    {isStreaming && latestAssistantMessage(messages)?.status === "streaming" && (
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-50/50 p-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:bg-emerald-500/5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Agent is working
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Input Surface */}
                <div className="border-t border-slate-200/60 bg-white/80 p-4 backdrop-blur-md dark:border-white/5 dark:bg-black/40">
                  <div className="mx-auto max-w-2xl space-y-3">
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all focus-within:ring-2 focus-within:ring-slate-900/5 dark:border-white/10 dark:bg-slate-900">
                      <Textarea
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        placeholder="Message the workbench..."
                        className="min-h-[100px] w-full resize-none border-0 bg-transparent p-4 text-[15px] focus:ring-0 active:ring-0 dark:text-white"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void submitPrompt();
                          }
                        }}
                      />
                      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-white/5 dark:bg-black/20">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Attach Evidence">
                            <FileText className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          onClick={() => void submitPrompt()}
                          disabled={isStreaming || !composer.trim()}
                          className="h-8 rounded-full bg-slate-900 px-4 text-xs font-bold text-white transition-all hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                        >
                          {isStreaming ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                          Send
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] items-center justify-center">
                      <span className="text-slate-400 uppercase font-black tracking-tighter">Quick Export:</span>
                      <button onClick={() => requestExport("pdf")} className="hover:underline text-slate-500 dark:text-slate-400">PDF</button>
                      <span className="text-slate-200 dark:text-slate-800">•</span>
                      <button onClick={() => requestExport("docx")} className="hover:underline text-slate-500 dark:text-slate-400">DOCX</button>
                      <span className="text-slate-200 dark:text-slate-800">•</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Resizer Handle */}
          <div
            onMouseDown={startResizing}
            className={cn(
              "group relative z-30 w-[1px] cursor-col-resize transition-all hover:w-1.5",
              isResizing ? "bg-slate-900 w-1.5 dark:bg-white" : "bg-slate-200/40 hover:bg-slate-300 dark:bg-white/5 dark:hover:bg-white/10"
            )}
          >
            {/* Visual Indicator */}
            <div className="absolute inset-y-0 left-1/2 -ml-[0.5px] w-[1px] bg-slate-200 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute inset-y-0 -left-2 -right-2" />
          </div>

          {/* Right Column: Canvas & Console */}
          <div className="relative flex flex-1 flex-col overflow-hidden bg-white dark:bg-[#080808]">
            <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as WorkbenchRightTab)} className="flex h-full flex-col">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/60 bg-white/50 px-6 backdrop-blur-sm dark:border-white/5 dark:bg-black/20">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shadow-sm", theme.icon)}>
                    <ArtifactIcon className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {activeArtifact?.title || "Draft Surface"}
                  </h2>
                </div>
                <TabsList className="h-9 gap-1 bg-slate-100/50 p-1 dark:bg-white/5">
                  <TabsTrigger value="preview" className="h-7 rounded-sm px-3 text-[11px] font-bold uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-white/10">Preview</TabsTrigger>
                  <TabsTrigger value="inspector" className="h-7 rounded-sm px-3 text-[11px] font-bold uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-white/10">Editor</TabsTrigger>
                  <TabsTrigger value="evidence" className="h-7 rounded-sm px-3 text-[11px] font-bold uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-white/10">Evidence</TabsTrigger>
                  <TabsTrigger value="run" className="h-7 rounded-sm px-3 text-[11px] font-bold uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-white/10">Events</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="mx-auto max-w-5xl p-6 lg:p-10">
                    <TabsContent value="preview" className="m-0 border-0 p-0 outline-none">
                      <PreviewPane artifact={activeArtifact} generatedDocument={generatedDocument} />
                    </TabsContent>
                    <TabsContent value="inspector" className="m-0 border-0 p-0 outline-none">
                      {!activeArtifact ? (
                        <div className="flex h-[400px] flex-col items-center justify-center gap-4 text-center">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-white/5 dark:bg-white/5">
                            <Bot className="mx-auto h-12 w-12 text-slate-300" />
                            <p className="mt-4 text-sm font-medium text-slate-500">Produce a draft to activate the editor.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                          {activeArtifact.artifact_type === "document" ? (
                            <DocumentInspector artifact={activeArtifact} onChange={handleArtifactChange} />
                          ) : activeArtifact.artifact_type === "sheet" ? (
                            <SheetInspector artifact={activeArtifact} onChange={handleArtifactChange} />
                          ) : (
                            <DeckInspector artifact={activeArtifact} onChange={handleArtifactChange} />
                          )}
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value="evidence" className="m-0 border-0 p-0 outline-none">
                      <EvidencePane sources={sources} />
                    </TabsContent>
                    <TabsContent value="run" className="m-0 border-0 p-0 outline-none">
                      <RunPane events={runEvents} isStreaming={isStreaming} />
                    </TabsContent>
                  </div>
                </ScrollArea>
              </div>
            </Tabs>
          </div>
        </main>
      </div>
    </AppLayout>
  );
}
