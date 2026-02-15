"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDurationMs, summarizeObjectForUi } from "@/lib/workflow-view-model";

type Props = {
  step: any | null;
  artifacts: any[];
  findings: any[];
  tasks: any[];
  labelForDoc?: (docId: string | null) => string;
};

function normalizeResult(value: any): "pass" | "fail" | "unknown" {
  const key = String(value || "").toLowerCase();
  if (key === "pass" || key === "passed" || key === "succeeded" || key === "compliant") return "pass";
  if (key === "fail" || key === "failed" || key === "error" || key === "non_compliant") return "fail";
  return "unknown";
}

function normalizeTaskOpen(statusValue: any): boolean {
  const key = String(statusValue || "").toLowerCase();
  return key !== "completed" && key !== "done" && key !== "cancelled" && key !== "failed";
}

function toTimeMs(value: any): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return ts;
}

function formatDateTime(value: any): string {
  const ts = toTimeMs(value);
  if (!ts) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function stepNarrative(statusRaw: string, findingCount: number, pendingTaskCount: number): string {
  const status = statusRaw.toLowerCase();
  if (status === "succeeded") {
    if (findingCount > 0) return "Step completed and produced findings for review.";
    return "Step completed successfully with no flagged findings.";
  }
  if (status === "failed") return "Step failed. Review advanced logs and output payload for root cause.";
  if (status === "running" || status === "waiting") return "Step is still in progress. Refresh to see latest evidence and output.";
  if (pendingTaskCount > 0) return "Step is waiting for human action to continue.";
  return "Step details are available below.";
}

function normalizeNodeType(value: any): string {
  return String(value || "").toLowerCase().trim();
}

function formatOutputValue(value: any): string {
  if (value == null) return "n/a";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => formatOutputValue(item)).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stripModelFields(value: any): any {
  if (Array.isArray(value)) return value.map((item) => stripModelFields(item));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, any> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (String(key).toLowerCase() === "model") continue;
    next[key] = stripModelFields(nested);
  }
  return next;
}

function compactJsonRows(obj: Record<string, any>, maxItems = 12): Array<{ key: string; value: string }> {
  const safeObj = stripModelFields(obj || {});
  const rows: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(safeObj)) {
    if (rows.length >= maxItems) break;
    const label = formatOutputValue(value);
    rows.push({ key, value: label.length > 180 ? `${label.slice(0, 177)}...` : label });
  }
  return rows;
}

export function WorkflowRunStepDetail({
  step,
  artifacts,
  findings,
  tasks,
  labelForDoc,
}: Props) {
  if (!step) {
    return (
      <div className="rounded-lg border border-border/50 bg-card/60 p-4 text-sm text-muted-foreground min-h-[320px]">
        Select a step from graph to inspect details.
      </div>
    );
  }

  const inputSummary = summarizeObjectForUi(step?.input || {}, 8);
  const safeOutput = stripModelFields(step?.output || {});
  const outputSummary = summarizeObjectForUi(safeOutput, 8);
  const nodeType = normalizeNodeType(step?.node_type || step?.node_id || "");
  const stepOutput = (safeOutput && typeof safeOutput === "object") ? safeOutput : {};
  const promptText = typeof stepOutput?.response_text === "string" ? stepOutput.response_text.trim() : "";
  const promptJson = stepOutput?.response_json && typeof stepOutput.response_json === "object" ? stepOutput.response_json : null;
  const promptFormat = typeof stepOutput?.response_format === "string" ? stepOutput.response_format : null;
  const classifyLabels = Array.isArray(stepOutput?.labels) ? stepOutput.labels : [];
  const classifyTopLabel = typeof stepOutput?.top_label === "string" ? stepOutput.top_label : null;
  const classifyConfidence = typeof stepOutput?.confidence === "number" ? stepOutput.confidence : null;
  const extractMissingFields = Array.isArray(stepOutput?.missing_fields) ? stepOutput.missing_fields : [];
  const validateErrors = Array.isArray(stepOutput?.errors) ? stepOutput.errors : [];
  const validateWarnings = Array.isArray(stepOutput?.warnings) ? stepOutput.warnings : [];
  const reconcileMismatches = Array.isArray(stepOutput?.mismatches) ? stepOutput.mismatches : [];
  const listFolderCount = Number.isFinite(Number(stepOutput?.count)) ? Number(stepOutput.count) : null;
  const metadataUpdatedCount = Number.isFinite(Number(stepOutput?.updated_count)) ? Number(stepOutput.updated_count) : null;
  const csvRowCount = Number.isFinite(Number(stepOutput?.row_count)) ? Number(stepOutput.row_count) : null;
  const branchRoute = typeof stepOutput?.route === "string" ? stepOutput.route : null;
  const branchMatched = typeof stepOutput?.matched === "boolean" ? stepOutput.matched : null;
  const createdDocTitle = typeof stepOutput?.generated_doc_title === "string"
    ? stepOutput.generated_doc_title
    : (typeof stepOutput?.generated_doc_filename === "string" ? stepOutput.generated_doc_filename : null);
  const createdDocId = typeof stepOutput?.generated_doc_id === "string" ? stepOutput.generated_doc_id : null;
  const promptJsonRows = promptJson ? compactJsonRows(promptJson, 12) : [];
  const stepStatus = String(step?.status || "unknown");
  const startedAt = step?.started_at || step?.created_at || step?.startedAt || null;
  const completedAt = step?.completed_at || step?.updated_at || step?.completedAt || null;
  const startMs = toTimeMs(startedAt);
  const endMs = toTimeMs(completedAt) ?? (startMs ? Date.now() : null);
  const durationLabel = startMs && endMs ? formatDurationMs(Math.max(0, endMs - startMs)) : "n/a";
  const pendingTasks = tasks.filter((task) => normalizeTaskOpen(task?.status));

  const findingRows = findings.map((finding, index) => {
    const result = normalizeResult(finding?.result || finding?.status);
    const severityRaw = String(finding?.severity || finding?.level || "").toLowerCase();
    const severity = severityRaw || (result === "fail" ? "high" : result === "unknown" ? "medium" : "low");
    const message = String(
      finding?.message ||
      finding?.reason ||
      finding?.summary ||
      `Finding ${index + 1}`
    );
    return {
      id: String(finding?.id || `finding-${index}`),
      result,
      severity,
      message,
    };
  });

  const findingCounts = findingRows.reduce(
    (acc, row) => {
      acc[row.result] += 1;
      return acc;
    },
    { pass: 0, fail: 0, unknown: 0 } as Record<"pass" | "fail" | "unknown", number>
  );
  const issuesCount = findingCounts.fail + findingCounts.unknown;

  return (
    <div className="rounded-lg border border-border/50 bg-card/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">Step Outcome</div>
          <div className="text-xs text-muted-foreground break-all">{String(step?.node_id || step?.id || "-")}</div>
          <div className="text-xs text-muted-foreground break-all">{String(step?.node_type || "-")}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">status: {stepStatus}</Badge>
          <Badge variant="outline">
            <Clock3 className="h-3 w-3 mr-1" />
            {durationLabel}
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-md border border-border/30 px-3 py-2 bg-background/70">
            <div className="text-xs text-muted-foreground">Findings</div>
            <div className="text-lg font-semibold leading-tight">{findingRows.length}</div>
          </div>
          <div className="rounded-md border border-border/30 px-3 py-2 bg-background/70">
            <div className="text-xs text-muted-foreground">Needs Action</div>
            <div className="text-lg font-semibold leading-tight text-amber-700 dark:text-amber-300">{issuesCount}</div>
          </div>
          <div className="rounded-md border border-border/30 px-3 py-2 bg-background/70">
            <div className="text-xs text-muted-foreground">Artifacts</div>
            <div className="text-lg font-semibold leading-tight">{artifacts.length}</div>
          </div>
          <div className="rounded-md border border-border/30 px-3 py-2 bg-background/70">
            <div className="text-xs text-muted-foreground">Pending Tasks</div>
            <div className="text-lg font-semibold leading-tight text-blue-700 dark:text-blue-300">{pendingTasks.length}</div>
          </div>
        </div>

        <div className="rounded-md border border-border/40 p-3 bg-background/60">
          <div className="text-sm font-medium mb-1">What Happened</div>
          <div className="text-sm text-muted-foreground">{stepNarrative(stepStatus, findingRows.length, pendingTasks.length)}</div>
          <div className="text-xs text-muted-foreground mt-2">
            Started {formatDateTime(startedAt)} • Completed {formatDateTime(completedAt)}
          </div>
        </div>

        <div className="rounded-md border border-border/40 p-3 bg-background/60">
          <div className="text-sm font-medium mb-2">Result</div>
          {nodeType === "ai.prompt" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">AI Prompt</Badge>
                {promptFormat ? <Badge variant="outline">format: {promptFormat}</Badge> : null}
              </div>
              {promptText ? (
                <div className="rounded-md border border-border/30 bg-background/70 p-3 text-sm whitespace-pre-wrap leading-6">
                  {promptText}
                </div>
              ) : promptJsonRows.length > 0 ? (
                <div className="rounded-md border border-border/30 bg-background/70 p-3 space-y-1">
                  {promptJsonRows.map((row) => (
                    <div key={row.key} className="text-sm">
                      <span className="text-muted-foreground">{row.key}:</span> {row.value}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No generated output for this step.</div>
              )}
            </div>
          ) : nodeType === "ai.classify" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">AI Classify</Badge>
                {classifyTopLabel ? <Badge variant="outline">Top Label: {classifyTopLabel}</Badge> : null}
                {typeof classifyConfidence === "number" ? <Badge variant="outline">Confidence: {classifyConfidence.toFixed(2)}</Badge> : null}
              </div>
              {classifyLabels.length > 0 ? (
                <div className="rounded-md border border-border/30 bg-background/70 p-3 space-y-1">
                  {classifyLabels.map((row: any, index: number) => (
                    <div key={`${String(row?.label || "label")}-${index}`} className="text-sm">
                      <span className="text-muted-foreground">{String(row?.label || "label")}:</span>{" "}
                      {typeof row?.score === "number" ? row.score.toFixed(2) : "n/a"}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No label output available for this step.</div>
              )}
            </div>
          ) : nodeType === "ai.extract" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">AI Extract</Badge>
                {extractMissingFields.length > 0 ? <Badge variant="outline">Missing Fields: {extractMissingFields.length}</Badge> : null}
              </div>
              {extractMissingFields.length > 0 ? (
                <div className="text-sm">
                  <span className="text-muted-foreground">Missing:</span> {extractMissingFields.join(", ")}
                </div>
              ) : null}
              {outputSummary.length > 0 ? (
                <div className="space-y-1">
                  {outputSummary.map((row) => (
                    <div key={row.key} className="text-sm">
                      <span className="text-muted-foreground">{row.key}:</span> {row.value}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No extraction output available.</div>
              )}
            </div>
          ) : nodeType === "system.validate" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Validate</Badge>
                <Badge variant={stepOutput?.valid === true ? "default" : "destructive"}>
                  {stepOutput?.valid === true ? "Valid" : "Invalid"}
                </Badge>
                <Badge variant="outline">Errors: {validateErrors.length}</Badge>
                <Badge variant="outline">Warnings: {validateWarnings.length}</Badge>
              </div>
              {validateErrors.length > 0 ? (
                <div className="rounded-md border border-border/30 bg-background/70 p-3 space-y-1">
                  {validateErrors.slice(0, 6).map((row: any, index: number) => (
                    <div key={`error-${index}`} className="text-sm">
                      <span className="text-muted-foreground">{String(row?.path || "field")}:</span> {String(row?.message || "Validation error")}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No validation errors.</div>
              )}
            </div>
          ) : nodeType === "system.reconcile" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Reconcile</Badge>
                <Badge variant={stepOutput?.matched === true ? "default" : "destructive"}>
                  {stepOutput?.matched === true ? "Matched" : "Mismatches Found"}
                </Badge>
                <Badge variant="outline">Mismatches: {reconcileMismatches.length}</Badge>
              </div>
              {reconcileMismatches.length > 0 ? (
                <div className="space-y-1">
                  {reconcileMismatches.slice(0, 5).map((row: any, index: number) => (
                    <div key={`mismatch-${index}`} className="text-sm">
                      <span className="text-muted-foreground">{String(row?.path || "field")}:</span> mismatch
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No mismatches detected.</div>
              )}
            </div>
          ) : nodeType === "dms.list_folder" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">List Folder</Badge>
                <Badge variant="outline">Documents: {listFolderCount ?? 0}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Folder: {Array.isArray(stepOutput?.folder_path) ? stepOutput.folder_path.join("/") || "/" : "/"}
              </div>
            </div>
          ) : nodeType === "dms.set_metadata" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Set Metadata</Badge>
                <Badge variant="outline">Updated: {metadataUpdatedCount ?? 0}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {metadataUpdatedCount && metadataUpdatedCount > 0 ? "Document metadata updated successfully." : "No metadata updates were applied."}
              </div>
            </div>
          ) : nodeType === "flow.branch" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Branch</Badge>
                {branchRoute ? <Badge variant="outline">Route: {branchRoute}</Badge> : null}
                {branchMatched != null ? <Badge variant={branchMatched ? "default" : "secondary"}>{branchMatched ? "Matched" : "Not Matched"}</Badge> : null}
              </div>
            </div>
          ) : nodeType === "artifact.export_csv" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Export CSV</Badge>
                <Badge variant="outline">Rows: {csvRowCount ?? 0}</Badge>
              </div>
              {createdDocId ? (
                <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                  <Link href={`/documents/${createdDocId}`}>Open CSV</Link>
                </Button>
              ) : null}
            </div>
          ) : nodeType === "dms.create_document" ? (
            <div className="space-y-2">
              <div className="text-sm">
                {createdDocTitle || "Document generated"}
              </div>
              {createdDocId ? (
                <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                  <Link href={`/documents/${createdDocId}`}>Open Generated Document</Link>
                </Button>
              ) : (
                <div className="text-sm text-muted-foreground">No generated document link available.</div>
              )}
            </div>
          ) : outputSummary.length > 0 ? (
            <div className="space-y-1">
              {outputSummary.map((row) => (
                <div key={row.key} className="text-sm">
                  <span className="text-muted-foreground">{row.key}:</span> {row.value}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No user-facing output for this step.</div>
          )}
        </div>

        <div className="rounded-md border border-border/40 p-3 bg-background/60">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-medium">Findings</div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">pass: {findingCounts.pass}</Badge>
              <Badge variant="outline">fail: {findingCounts.fail}</Badge>
              <Badge variant="outline">unknown: {findingCounts.unknown}</Badge>
            </div>
          </div>
          {findingRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No findings linked to this step.</div>
          ) : (
            <div className="space-y-2">
              {findingRows.map((row) => (
                <div key={row.id} className="rounded-md border border-border/30 p-2 bg-background/70">
                  <div className="flex items-center gap-2 mb-1">
                    {row.result === "pass" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    )}
                    <Badge
                      className={
                        row.result === "pass"
                          ? "bg-emerald-600"
                          : row.result === "fail"
                            ? "bg-red-600"
                            : "bg-amber-600"
                      }
                    >
                      {row.result}
                    </Badge>
                    <Badge variant="outline">severity: {row.severity}</Badge>
                  </div>
                  <div className="text-sm">{row.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md border border-border/40 p-3 bg-background/60">
            <div className="text-sm font-medium mb-2">Evidence Files</div>
            {artifacts.length === 0 ? (
              <div className="text-sm text-muted-foreground">No artifacts linked to this step.</div>
            ) : (
              <div className="space-y-2">
                {artifacts.map((artifact, artifactIndex) => {
                  const docId = typeof artifact?.doc_id === "string" ? artifact.doc_id : null;
                  return (
                    <div key={String(artifact?.id || `artifact-${artifactIndex}`)} className="rounded border border-border/30 p-2 bg-background/70">
                      <div className="text-sm font-medium">{String(artifact?.title || artifact?.artifact_type || "Artifact")}</div>
                      <div className="text-xs text-muted-foreground">type: {String(artifact?.artifact_type || "-")}</div>
                      {docId ? (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 text-xs text-muted-foreground truncate" title={docId}>
                            {labelForDoc ? labelForDoc(docId) : docId}
                          </div>
                          <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                            <Link href={`/documents/${docId}`}>Open</Link>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-md border border-border/40 p-3 bg-background/60">
            <div className="text-sm font-medium mb-2">Human Tasks</div>
            {tasks.length === 0 ? (
              <div className="text-sm text-muted-foreground">No human tasks for this step.</div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task, taskIndex) => (
                  <div key={String(task?.id || `task-${taskIndex}`)} className="rounded border border-border/30 p-2 bg-background/70">
                    <div className="text-sm font-medium">{String(task?.title || "Task")}</div>
                    <div className="text-xs text-muted-foreground">status: {String(task?.status || "-")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <details className="rounded-md border border-border/40 p-3 bg-background/60">
          <summary className="cursor-pointer text-sm font-medium">Developer Data (Optional)</summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded border border-border/30 p-2 bg-background/70">
                <div className="text-xs font-medium mb-1">Input Summary</div>
                {inputSummary.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No input fields.</div>
                ) : (
                  <div className="space-y-1">
                    {inputSummary.map((row) => (
                      <div key={row.key} className="text-xs">
                        <span className="text-muted-foreground">{row.key}:</span> {row.value}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded border border-border/30 p-2 bg-background/70">
                <div className="text-xs font-medium mb-1">Output Summary</div>
                {outputSummary.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No output fields.</div>
                ) : (
                  <div className="space-y-1">
                    {outputSummary.map((row) => (
                      <div key={row.key} className="text-xs">
                        <span className="text-muted-foreground">{row.key}:</span> {row.value}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <details className="rounded border border-border/30 p-2 bg-background/70">
              <summary className="cursor-pointer text-xs text-muted-foreground">Raw Step JSON (Developer)</summary>
              <pre className="text-xs overflow-auto rounded-md border border-border/30 p-3 bg-background/80 mt-2">
                {JSON.stringify(stripModelFields(step), null, 2)}
              </pre>
            </details>
          </div>
        </details>
      </div>
    </div>
  );
}
