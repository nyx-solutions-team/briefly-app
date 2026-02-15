"use client";

import * as React from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewAccessDenied } from "@/components/access-denied";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, getApiContext } from "@/lib/api";
import { Eye, FileSearch, FolderOpen, RefreshCw } from "lucide-react";

type CaseDoc = {
  id: string;
  filename: string;
  folderPath: string[];
  uploadedAt?: string;
  storageKey?: string;
};

type FileMetadata = {
  url: string;
};

type WorkflowRunLite = {
  id: string;
  status: string;
  input: Record<string, any> | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

type CompareGroup = {
  runId: string;
  status: string;
  caseFolder: string;
  startedAt?: string;
  ruleset: CaseDoc[];
  subject: CaseDoc[];
  report: CaseDoc[];
  artifactsJson: CaseDoc[];
  bundlesZip: CaseDoc[];
};

const BRIEFLY_LOCAL_ORG_ID = "5f4fa858-8ba2-4f46-988b-58ac0b2a948d";

function normalizeFolderPath(row: any): string[] {
  if (Array.isArray(row?.folderPath)) return row.folderPath;
  if (Array.isArray(row?.folder_path)) return row.folder_path;
  if (typeof row?.folderPath === "string") return row.folderPath.split("/").filter(Boolean);
  if (typeof row?.folder_path === "string") return row.folder_path.split("/").filter(Boolean);
  return [];
}

function normalizeFilename(row: any): string {
  return String(row?.filename || row?.name || row?.title || "");
}

function normalizeUploadedAt(row: any): string | undefined {
  return row?.uploadedAt || row?.uploaded_at || row?.created_at || undefined;
}

function normalizeStorageKey(row: any): string | undefined {
  const value = row?.storageKey || row?.storage_key;
  return typeof value === "string" ? value : undefined;
}

function isCase31SourceDoc(doc: CaseDoc): boolean {
  const path = doc.folderPath.join("/").toLowerCase();
  return path.startsWith("workflows/compliancecases/");
}

function isGeneratedComplianceReport(doc: CaseDoc): boolean {
  const path = doc.folderPath.join("/").toLowerCase();
  const name = doc.filename.toLowerCase();
  return (
    name.startsWith("compliance_report_case-") ||
    name.startsWith("compliance_submission_bundle_") ||
    name.endsWith(".json") ||
    path.includes("workflow_report") ||
    path.includes("workflow-report")
  );
}

function inferDocKind(doc: CaseDoc): "ruleset_doc" | "subject_packet" | "report_pdf" | "bundle_zip" | "artifact_json" | "other" {
  const path = doc.folderPath.join("/").toLowerCase();
  const name = doc.filename.toLowerCase();
  if (path.endsWith("/ruleset_doc")) return "ruleset_doc";
  if (path.endsWith("/subject_packet")) return "subject_packet";
  if (name.startsWith("compliance_submission_bundle_") || name.endsWith(".zip")) return "bundle_zip";
  if (name.endsWith(".json")) return "artifact_json";
  if (name.startsWith("compliance_report_case-") || name.endsWith(".pdf")) return "report_pdf";
  return "other";
}

function formatDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function extractCaseKey(doc: CaseDoc): string {
  const p = doc.folderPath;
  const folderJoined = p.join("/");
  const fromFolder = folderJoined.match(/(CASE-\d{3}_[A-Z]+)/i);
  if (fromFolder) return fromFolder[1].toUpperCase();
  const m = doc.filename.match(/(CASE-\d{3}_[A-Z]+)/i);
  if (m) return m[1].toUpperCase();
  return "UNMAPPED";
}

function shortId(id: string) {
  if (!id) return "";
  return id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
}

function trimMiddle(value: string, max = 68) {
  if (!value) return "";
  if (value.length <= max) return value;
  const keep = Math.max(8, Math.floor((max - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

function extractRunSuffix(reportName: string): string | null {
  const m = reportName.match(/_([0-9a-f]{8})\.[a-z0-9]+$/i);
  return m ? m[1].toLowerCase() : null;
}

function extractString(input: Record<string, any> | null, keys: string[]): string | null {
  if (!input) return null;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function extractStringArray(input: Record<string, any> | null, keys: string[]): string[] {
  if (!input) return [];
  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value)) {
      return value.filter((v) => typeof v === "string" && v.trim().length > 0).map((v) => String(v).trim());
    }
  }
  return [];
}

function getRunTone(runId: string) {
  const tones = [
    {
      block: "border-sky-300/30 bg-sky-50/40 dark:bg-sky-950/20",
      bundle: "border-sky-200/40 bg-sky-50/50 dark:bg-sky-950/25",
      section: "border-sky-200/40 bg-sky-50/30 dark:bg-sky-950/20",
    },
    {
      block: "border-emerald-300/30 bg-emerald-50/40 dark:bg-emerald-950/20",
      bundle: "border-emerald-200/40 bg-emerald-50/50 dark:bg-emerald-950/25",
      section: "border-emerald-200/40 bg-emerald-50/30 dark:bg-emerald-950/20",
    },
    {
      block: "border-amber-300/30 bg-amber-50/40 dark:bg-amber-950/20",
      bundle: "border-amber-200/40 bg-amber-50/50 dark:bg-amber-950/25",
      section: "border-amber-200/40 bg-amber-50/30 dark:bg-amber-950/20",
    },
    {
      block: "border-rose-300/30 bg-rose-50/40 dark:bg-rose-950/20",
      bundle: "border-rose-200/40 bg-rose-50/50 dark:bg-rose-950/25",
      section: "border-rose-200/40 bg-rose-50/30 dark:bg-rose-950/20",
    },
    {
      block: "border-violet-300/30 bg-violet-50/40 dark:bg-violet-950/20",
      bundle: "border-violet-200/40 bg-violet-50/50 dark:bg-violet-950/25",
      section: "border-violet-200/40 bg-violet-50/30 dark:bg-violet-950/20",
    },
  ];
  let hash = 0;
  for (let i = 0; i < runId.length; i += 1) hash = (hash * 31 + runId.charCodeAt(i)) >>> 0;
  return tones[hash % tones.length];
}

function prettyRunsIssue(message: string) {
  const raw = String(message || "").trim();
  if (!raw) return "";
  if (raw.toLowerCase().includes("internal server error")) {
    return "Workflow runs service returned Internal Server Error.";
  }
  if (raw.toLowerCase().includes("forbidden")) {
    return "Workflow runs are blocked by permissions/configuration.";
  }
  if (raw.toLowerCase().includes("no workflow runs found")) {
    return "No workflow runs found yet for this org.";
  }
  return raw.length > 140 ? `${raw.slice(0, 140)}...` : raw;
}

export default function Case31FilesPage() {
  const { toast } = useToast();
  const { hasPermission, isLoading: authLoading } = useAuth();
  const canReadDocuments = hasPermission("documents.read");

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [docs, setDocs] = React.useState<CaseDoc[]>([]);
  const [runs, setRuns] = React.useState<WorkflowRunLite[]>([]);
  const [runsLoadIssue, setRunsLoadIssue] = React.useState<string>("");
  const [orgId, setOrgId] = React.useState("");

  const loadDocs = React.useCallback(async () => {
    const currentOrgId = getApiContext().orgId;
    setOrgId(currentOrgId || "");
    if (!currentOrgId || currentOrgId !== BRIEFLY_LOCAL_ORG_ID) {
      setDocs([]);
      setRuns([]);
      setRunsLoadIssue("");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      let nextRunsIssue = "";
      setRunsLoadIssue("");
      const [docsResponse, runsResponse] = await Promise.all([
        apiFetch<any>(`/orgs/${currentOrgId}/documents`, { skipCache: true }),
        apiFetch<any>(`/orgs/${currentOrgId}/workflows/runs?limit=250`, { skipCache: true }).catch((err) => {
          nextRunsIssue = String(err?.message || "Workflow runs API unavailable");
          return { runs: [] };
        }),
      ]);
      const list = Array.isArray(docsResponse)
        ? docsResponse
        : Array.isArray(docsResponse?.items)
          ? docsResponse.items
          : [];

      const normalized: CaseDoc[] = list.map((row: any) => ({
        id: String(row.id),
        filename: normalizeFilename(row),
        folderPath: normalizeFolderPath(row),
        uploadedAt: normalizeUploadedAt(row),
        storageKey: normalizeStorageKey(row),
      }));

      const filtered = normalized.filter(
        (doc) => isCase31SourceDoc(doc) || isGeneratedComplianceReport(doc)
      );
      setDocs(filtered);

      const rawRuns = Array.isArray(runsResponse?.runs)
        ? runsResponse.runs
        : Array.isArray(runsResponse)
          ? runsResponse
          : [];
      const normalizedRuns: WorkflowRunLite[] = rawRuns
        .filter((row: any) => typeof row?.id === "string")
        .map((row: any) => ({
          id: String(row.id),
          status: String(row?.status || "unknown"),
          input: row?.input && typeof row.input === "object" ? row.input : null,
          startedAt: row?.started_at || row?.startedAt || null,
          completedAt: row?.completed_at || row?.completedAt || null,
        }))
        .sort((a: WorkflowRunLite, b: WorkflowRunLite) => {
          const aTime = new Date(a.startedAt || a.completedAt || 0).getTime();
          const bTime = new Date(b.startedAt || b.completedAt || 0).getTime();
          return bTime - aTime;
        });
      setRuns(normalizedRuns);
      if (nextRunsIssue) setRunsLoadIssue(nextRunsIssue);
      else if (normalizedRuns.length === 0) setRunsLoadIssue("No workflow runs found for this org yet.");
    } catch (e: any) {
      toast({
        title: "Failed to load Case files",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDocs();
  };

  const openPreview = async (docId: string) => {
    const currentOrgId = getApiContext().orgId;
    if (!currentOrgId || currentOrgId !== BRIEFLY_LOCAL_ORG_ID) return;
    try {
      const data = await apiFetch<FileMetadata>(`/orgs/${currentOrgId}/documents/${docId}/file`, { skipCache: true });
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({
        title: "Preview failed",
        description: e?.message || "Unable to open preview",
        variant: "destructive",
      });
    }
  };

  const openPreviewMany = async (docsToOpen: CaseDoc[]) => {
    for (const d of docsToOpen) {
      await openPreview(d.id);
    }
  };

  const openDocumentMany = (docsToOpen: CaseDoc[]) => {
    for (const d of docsToOpen) {
      window.open(`/documents/${d.id}`, "_blank", "noopener,noreferrer");
    }
  };

  const filteredDocs = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => {
      const folder = d.folderPath.join("/").toLowerCase();
      const caseKey = extractCaseKey(d).toLowerCase();
      return (
        d.filename.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        folder.includes(q) ||
        caseKey.includes(q)
      );
    });
  }, [docs, query]);

  const sourceDocs = filteredDocs.filter((d) => isCase31SourceDoc(d));
  const outputDocs = filteredDocs.filter((d) => isGeneratedComplianceReport(d));
  const runGroups = React.useMemo<CompareGroup[]>(() => {
    const docsById = new Map<string, CaseDoc>();
    for (const doc of docs) docsById.set(doc.id, doc);
    const allOutputDocs = docs.filter((d) => {
      const kind = inferDocKind(d);
      return kind === "report_pdf" || kind === "artifact_json" || kind === "bundle_zip";
    });

    const allGroups: CompareGroup[] = runs.map((run) => {
      const runInput = run.input;
      const caseFolder = extractString(runInput, ["caseFolder", "case_folder"]) || "";
      const rulesetDocId = extractString(runInput, ["ruleset_doc_id", "rulesetDocId"]);
      const subjectDocIds = extractStringArray(runInput, ["subject_packet_doc_ids", "subjectPacketDocIds"]);
      const runSuffix = run.id.slice(0, 8).toLowerCase();

      const rulesetDocs = rulesetDocId && docsById.has(rulesetDocId) ? [docsById.get(rulesetDocId)!] : [];
      const subjectDocs = subjectDocIds.map((id) => docsById.get(id)).filter(Boolean) as CaseDoc[];
      const matchedOutputs = allOutputDocs.filter((doc) => {
        const key = (doc.storageKey || "").toLowerCase();
        const reportSuffix = extractRunSuffix(doc.filename);
        return key.includes(run.id.toLowerCase()) || reportSuffix === runSuffix;
      });
      const matchedReports = matchedOutputs.filter((d) => inferDocKind(d) === "report_pdf");
      const matchedArtifactsJson = matchedOutputs.filter((d) => inferDocKind(d) === "artifact_json");
      const matchedBundlesZip = matchedOutputs.filter((d) => inferDocKind(d) === "bundle_zip");

      return {
        runId: run.id,
        status: run.status,
        caseFolder,
        startedAt: run.startedAt || undefined,
        ruleset: rulesetDocs,
        subject: subjectDocs,
        report: matchedReports,
        artifactsJson: matchedArtifactsJson,
        bundlesZip: matchedBundlesZip,
      };
    });

    const q = query.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups.filter((group) => {
      if (group.runId.toLowerCase().includes(q)) return true;
      if ((group.caseFolder || "").toLowerCase().includes(q)) return true;
      if ((group.status || "").toLowerCase().includes(q)) return true;
      const combined = [...group.ruleset, ...group.subject, ...group.report];
      return combined.some((doc) => {
        const folder = doc.folderPath.join("/").toLowerCase();
        return doc.filename.toLowerCase().includes(q) || doc.id.toLowerCase().includes(q) || folder.includes(q);
      });
    });
  }, [docs, runs, query]);

  const inferredGroups = React.useMemo<CompareGroup[]>(() => {
    const byCase = new Map<string, {
      ruleset: CaseDoc[];
      subject: CaseDoc[];
      report: CaseDoc[];
      artifactsJson: CaseDoc[];
      bundlesZip: CaseDoc[];
      caseFolder: string;
    }>();
    for (const doc of filteredDocs) {
      const key = extractCaseKey(doc);
      if (!byCase.has(key)) {
        byCase.set(key, { ruleset: [], subject: [], report: [], artifactsJson: [], bundlesZip: [], caseFolder: doc.folderPath.join("/") });
      }
      const g = byCase.get(key)!;
      const kind = inferDocKind(doc);
      if (kind === "ruleset_doc") g.ruleset.push(doc);
      if (kind === "subject_packet") g.subject.push(doc);
      if (kind === "report_pdf") g.report.push(doc);
      if (kind === "artifact_json") g.artifactsJson.push(doc);
      if (kind === "bundle_zip") g.bundlesZip.push(doc);
    }
    return Array.from(byCase.entries())
      .map(([caseKey, g]) => {
        const suffix = extractRunSuffix(g.report[0]?.filename || "");
        return {
          runId: suffix ? `inferred-${suffix}` : `inferred-${caseKey.toLowerCase()}`,
          status: "inferred",
          caseFolder: g.caseFolder,
          ruleset: g.ruleset,
          subject: g.subject,
          report: g.report,
          artifactsJson: g.artifactsJson || [],
          bundlesZip: g.bundlesZip || [],
        };
      })
      .filter((g) => g.ruleset.length > 0 || g.subject.length > 0 || g.report.length > 0 || g.artifactsJson.length > 0 || g.bundlesZip.length > 0);
  }, [filteredDocs]);

  const displayGroups = runGroups.length > 0 ? runGroups : inferredGroups;

  const promptSummary =
    "The workflow compares ruleset extraction text against subject packet extraction text and asks the model to return strict JSON with requirements, facts, assessment, citations, and recommendation.";

  if (authLoading) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6 space-y-3">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!canReadDocuments) {
    return (
      <AppLayout>
        <ViewAccessDenied
          title="No documents access"
          message="You need documents.read permission to inspect workflow case files."
          backHref="/dashboard"
          backLabel="Back to Dashboard"
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-4 md:px-6 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold truncate">Case-31 File Explorer</h1>
              <p className="text-xs text-muted-foreground truncate">
                Source docs are in <span className="font-mono">Workflows/ComplianceCases/*</span>; generated outputs are in <span className="font-mono">Workflows/ComplianceCases/&lt;CASE&gt;/workflow_reports</span>.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void onRefresh()} disabled={refreshing || loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>

        <main className="px-3 md:px-5 py-4">
          <div className="mx-auto max-w-7xl space-y-3">
            <Card className="border-border/40 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Quick Filter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {orgId && orgId !== BRIEFLY_LOCAL_ORG_ID && (
                  <div className="text-xs rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                    This page is restricted to org <span className="font-mono">{BRIEFLY_LOCAL_ORG_ID}</span>. Current org:{" "}
                    <span className="font-mono">{orgId}</span>
                  </div>
                )}
                <Input
                  placeholder="Search by filename, document id, or folder path"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">Total: {filteredDocs.length}</Badge>
                  <Badge variant="outline">Source Docs: {sourceDocs.length}</Badge>
                  <Badge variant="outline">Outputs: {outputDocs.length}</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/50">
              <CardHeader>
                <CardTitle className="text-sm">Execution Inputs</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="rounded-md border border-border/30 p-3 bg-background/50">
                  <div className="font-medium mb-1">Input Shape</div>
                  <div className="text-muted-foreground font-mono break-all">
                    {`{ caseFolder, ruleset_doc_id, subject_packet_doc_ids[], requiredOutputs[] }`}
                  </div>
                </div>
                <div className="rounded-md border border-border/30 p-3 bg-background/50">
                  <div className="font-medium mb-1">Prompt Used</div>
                  <div className="text-muted-foreground">{promptSummary}</div>
                </div>
                <div className="rounded-md border border-border/30 p-3 bg-background/50">
                  <div className="font-medium mb-1">Outputs</div>
                  <div className="text-muted-foreground font-mono break-all">
                    ruleset.json, subject_facts.json, assessment.json, compliance_report.pdf, compliance_submission_bundle.zip
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/50">
              <CardHeader>
                <CardTitle className="text-sm">Run-Based Compare View</CardTitle>
              </CardHeader>
              <CardContent>
                {runsLoadIssue ? (
                  <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    {prettyRunsIssue(runsLoadIssue)} Showing inferred bundles from existing files.
                  </div>
                ) : null}
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : displayGroups.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No matching files found for current organization context.</div>
                ) : (
                  <div className="space-y-2">
                    {displayGroups.map((group) => {
                      const tone = getRunTone(group.runId);
                      return (
                        <div key={group.runId} className={`rounded-md border p-2 space-y-2 ${tone.block}`}>
                          <div className="flex flex-wrap items-center gap-2 justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="font-mono text-[11px]">{group.runId}</Badge>
                              <Badge variant="secondary">{group.status}</Badge>
                              <Badge variant="outline">ruleset: {group.ruleset.length}</Badge>
                              <Badge variant="outline">subject: {group.subject.length}</Badge>
                              <Badge variant="outline">reports: {group.report.length}</Badge>
                              <Badge variant="outline">json: {group.artifactsJson.length}</Badge>
                              <Badge variant="outline">bundle: {group.bundlesZip.length}</Badge>
                              {group.caseFolder ? (
                                <Badge variant="outline" className="font-mono text-[11px]">
                                  {group.caseFolder}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {group.ruleset.length > 0 ? (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void openPreview(group.ruleset[0].id)}>
                                  <Eye className="h-3 w-3 mr-1" />
                                  Ruleset PDF
                                </Button>
                              ) : null}
                              {group.subject.length > 0 ? (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void openPreviewMany(group.subject)}>
                                  <Eye className="h-3 w-3 mr-1" />
                                  All Subject PDFs
                                </Button>
                              ) : null}
                              {group.subject.length > 0 || group.ruleset.length > 0 ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => openDocumentMany([...group.ruleset, ...group.subject])}
                                >
                                  <FileSearch className="h-3 w-3 mr-1" />
                                  Open Compare Docs
                                </Button>
                              ) : null}
                              {group.bundlesZip.length > 0 ? (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void openPreview(group.bundlesZip[0].id)}>
                                  <Eye className="h-3 w-3 mr-1" />
                                  Submission ZIP
                                </Button>
                              ) : null}
                            </div>
                          </div>

                          <div className="space-y-2">
                            {(group.report.length > 0 ? group.report : [{ id: "no-report", filename: "No report generated", folderPath: [] } as CaseDoc]).map((reportDoc) => (
                              <div key={reportDoc.id} className={`rounded-md border p-2 space-y-2 ${tone.bundle}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs text-muted-foreground">Comparison Bundle</div>
                                    <div className="text-sm font-medium break-all" title={reportDoc.filename}>{trimMiddle(reportDoc.filename, 74)}</div>
                                    {reportDoc.id !== "no-report" ? (
                                      <div className="text-[11px] text-muted-foreground font-mono break-all">{shortId(reportDoc.id)}</div>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {reportDoc.id !== "no-report" ? (
                                      <>
                                        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                                          <Link href={`/documents/${reportDoc.id}`}>
                                            <FileSearch className="h-3 w-3 mr-1" />
                                            Open Report
                                          </Link>
                                        </Button>
                                        <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => void openPreview(reportDoc.id)}>
                                          <Eye className="h-3 w-3 mr-1" />
                                          View Report
                                        </Button>
                                      </>
                                    ) : null}
                                    {group.ruleset.length > 0 ? (
                                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void openPreview(group.ruleset[0].id)}>
                                        <Eye className="h-3 w-3 mr-1" />
                                        View Ruleset
                                      </Button>
                                    ) : null}
                                    {group.subject.length > 0 ? (
                                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void openPreviewMany(group.subject)}>
                                        <Eye className="h-3 w-3 mr-1" />
                                        View Subjects
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                                  <div className={`rounded border p-2 ${tone.section}`}>
                                    <div className="text-muted-foreground mb-1">Ruleset</div>
                                    {group.ruleset[0] ? (
                                      <>
                                        <div className="font-medium break-all" title={group.ruleset[0].filename}>{trimMiddle(group.ruleset[0].filename, 56)}</div>
                                        <div className="text-[11px] text-muted-foreground font-mono break-all">{shortId(group.ruleset[0].id)}</div>
                                      </>
                                    ) : (
                                      <div className="text-muted-foreground">Missing</div>
                                    )}
                                  </div>

                                  <div className={`rounded border p-2 ${tone.section}`}>
                                    <div className="text-muted-foreground mb-1">Compared Subject Files</div>
                                    {group.subject.length > 0 ? (
                                      <div className="space-y-1">
                                        {group.subject.map((s) => (
                                          <div key={s.id}>
                                            <div className="font-medium break-all" title={s.filename}>{trimMiddle(s.filename, 56)}</div>
                                            <div className="text-[11px] text-muted-foreground font-mono break-all">{shortId(s.id)}</div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-muted-foreground">Missing</div>
                                    )}
                                  </div>

                                  <div className={`rounded border p-2 ${tone.section}`}>
                                    <div className="text-muted-foreground mb-1">Generated Report</div>
                                    {reportDoc.id !== "no-report" ? (
                                      <>
                                        <div className="font-medium break-all" title={reportDoc.filename}>{trimMiddle(reportDoc.filename, 56)}</div>
                                        <div className="text-[11px] text-muted-foreground font-mono break-all">{shortId(reportDoc.id)}</div>
                                      </>
                                    ) : (
                                      <div className="text-muted-foreground">Not generated for this run</div>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                  <div className={`rounded border p-2 ${tone.section}`}>
                                    <div className="text-muted-foreground mb-1">JSON Artifacts</div>
                                    {group.artifactsJson.length > 0 ? (
                                      <div className="space-y-1">
                                        {group.artifactsJson.map((j) => (
                                          <div key={j.id} className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                              <div className="font-medium break-all" title={j.filename}>{trimMiddle(j.filename, 48)}</div>
                                              <div className="text-[11px] text-muted-foreground font-mono">{shortId(j.id)}</div>
                                            </div>
                                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void openPreview(j.id)}>
                                              Open
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-muted-foreground">No JSON artifacts</div>
                                    )}
                                  </div>
                                  <div className={`rounded border p-2 ${tone.section}`}>
                                    <div className="text-muted-foreground mb-1">Submission Bundle (ZIP)</div>
                                    {group.bundlesZip.length > 0 ? (
                                      <div className="space-y-1">
                                        {group.bundlesZip.map((b) => (
                                          <div key={b.id} className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                              <div className="font-medium break-all" title={b.filename}>{trimMiddle(b.filename, 48)}</div>
                                              <div className="text-[11px] text-muted-foreground font-mono">{shortId(b.id)}</div>
                                            </div>
                                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void openPreview(b.id)}>
                                              Open ZIP
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-muted-foreground">No submission bundle yet</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </main>
      </div>
    </AppLayout>
  );
}
