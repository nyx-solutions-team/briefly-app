"use client";

import * as React from "react";
import type { Editor } from "@tiptap/react";
import { AtSign, Loader2, X } from "lucide-react";
import { NodeSelection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { FinderPicker } from "@/components/pickers/finder-picker";
import { apiFetch, getApiContext } from "@/lib/api";
import type { StoredDocument } from "@/lib/types";
import { cn } from "@/lib/utils";
import { extractTextFromTiptap } from "@/lib/tiptap-text";

type ChatRole = "user" | "assistant";

type SuggestionStatus = "pending" | "applied" | "cancelled";

type TableJsonAction = "add_column" | "add_row" | "update_cell" | "delete_row" | "delete_column";

type TableJsonInstruction = {
  action: TableJsonAction;
  target: "table";
  data?: any;
};

type TableAction = "append_rows" | "insert_rows" | "update_rows" | "add_column" | "create_table";

type AssistantMeta =
  | {
      kind: "selection";
      status: SuggestionStatus;
      selectionFrom: number;
      selectionTo: number;
      sourceText?: string;
      validationError?: string;
    }
  | {
    kind: "plain";
    status: SuggestionStatus;
    insertPos: number;
    validationError?: string;
    applyLabel?: string;
  }
  | {
    kind: "table";
    status: SuggestionStatus;
    insertPos: number;
    action: TableAction;
    tableColumnCount: number;
    outputColumnCount: number;
    hasHeaderRow: boolean;
    bodyRowCount: number;
    headersLine: string;
    rows: string[][];
    parseError?: string;
    expectedFirstColumn?: string[];
    newColumnName?: string;
    insertAfterLabel?: string;
    insertBeforeLabel?: string;
  }
  | {
    kind: "table_json";
    status: SuggestionStatus;
    insertPos: number;
    tableLabel?: string;
    columns?: string[];
    rowKeys?: string[];
    instructionRaw: string;
    instruction?: TableJsonInstruction;
    instructionError?: string;
    preview?: string;
  }
  | {
    kind: "divider";
    status: SuggestionStatus;
    insertPos: number;
    label?: string;
  }
  | {
    kind: "move_section";
    status: SuggestionStatus;
    sourceTitle: string;
    targetTitle: string;
    direction: "above" | "below";
    from: number;
    to: number;
    dest: number;
    note?: string;
  }
  | {
    kind: "replace_document";
    status: SuggestionStatus;
    docText: string;
    validationError?: string;
  };

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  meta?: AssistantMeta;
  attachment?: { kind: "selection" | "cells" | "table" | "document" | "files"; label: string };
};

type RequestContext =
  | {
    kind: "selection";
    modelPrompt: string;
    selectionFrom: number;
    selectionTo: number;
    selectedText: string;
  }
  | {
    kind: "table_json";
    modelPrompt: string;
    insertPos: number;
    tableLabel?: string;
    columns: string[];
    rowKeys: string[];
    bodyRowCount: number;
    expectedAddRowCount?: number | null;
    selectedCells?: TableCellSnapshot[];
  }
  | {
    kind: "table";
    modelPrompt: string;
    insertPos: number;
    columnCount: number; // output column count
    tableColumnCount: number;
    headersLine: string;
    tableAction: TableAction;
    hasHeaderRow: boolean;
    bodyRowCount: number;
    expectedFirstColumn?: string[];
    newColumnName?: string;
    insertAfterLabel?: string;
    insertBeforeLabel?: string;
  }
  | {
    kind: "plain";
    modelPrompt: string;
    insertPos: number;
    applyLabel?: string;
    replaceDocument?: boolean;
  };

type AttachedContextSnapshot =
  | {
    kind: "selection";
    signature: string;
    label: string;
    selectionFrom: number;
    selectionTo: number;
    text: string;
  }
  | {
    kind: "cells";
    signature: string;
    label: string;
    tablePos: number;
    insertPos: number;
    hasHeaderRow: boolean;
    columnCount: number;
    columns: string[];
    rowKeys: string[];
    bodyRowCount: number;
    cells: TableCellSnapshot[];
  }
  | {
    kind: "table";
    signature: string;
    label: string;
    insertPos: number;
    columnCount: number;
    headersLine: string;
    tableText: string;
    hasHeaderRow: boolean;
    bodyRowCount: number;
    firstColumnValues: string[];
  }
  | {
    kind: "document";
    signature: string;
    label: string;
    text: string;
  };

type DocumentAttachment = Extract<AttachedContextSnapshot, { kind: "document" }>;

type ManualContextFile = {
  id: string;
  filename: string;
  title?: string;
  folderPath: string[];
  type?: string;
};

type TableCellSnapshot = {
  tableRowIndex: number;
  bodyRowIndex: number | null;
  rowKey: string | null;
  columnIndex: number;
  columnName: string | null;
  value: string;
};

type Props = {
  editor: Editor | null;
  className?: string;
};

function inferTableAction(userPrompt: string): TableAction {
  const t = String(userPrompt || "").toLowerCase();
  const addColumn = /(add|create|insert)\s+(a\s+)?(new\s+)?column\b/.test(t) || /\bnew\s+column\b/.test(t);
  if (addColumn) return "add_column";

  const updateSignals = /(increase|decrease|update|edit|change|complete|fill|replace|raise|lower|multiply|%|percent)/.test(t);
  if (updateSignals) return "update_rows";

  return "append_rows";
}

function extractExplicitAddRowCount(userPrompt: string): number | null {
  const raw = String(userPrompt || "");
  const lower = raw.toLowerCase();
  if (!/(add|insert|append|create)\b/.test(lower)) return null;

  const m = lower.match(/\b(\d{1,2})\s+(?:new\s+)?rows?\b/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 50) return null;
  return n;
}

function extractSetValue(userPrompt: string): string | null {
  const raw = String(userPrompt || "").trim();
  if (!raw) return null;

  const patterns: RegExp[] = [
    /\bto\s+["']?([^"'\n]+)["']?\s*$/i,
    /\bas\s+["']?([^"'\n]+)["']?\s*$/i,
    /=\s*["']?([^"'\n]+)["']?\s*$/i,
  ];

  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) return String(m[1]).trim();
  }
  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMentionedLabels(prompt: string, labels: string[]) {
  const text = String(prompt || "");
  const lower = text.toLowerCase();

  const matches: Array<{ label: string; index: number }> = [];
  for (const raw of labels) {
    const label = String(raw || "").trim();
    if (!label) continue;
    const re = new RegExp(`\\b${escapeRegExp(label.toLowerCase())}\\b`, "i");
    const m = lower.match(re);
    if (!m || typeof m.index !== "number") continue;
    matches.push({ label, index: m.index });
  }

  matches.sort((a, b) => a.index - b.index);

  // De-dup by label
  const out: Array<{ label: string; index: number }> = [];
  const seen = new Set<string>();
  for (const item of matches) {
    const key = item.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function inferInsertionAnchors(userPrompt: string, labels: string[]): { afterLabel?: string; beforeLabel?: string } {
  const t = String(userPrompt || "").toLowerCase();
  const mentioned = findMentionedLabels(userPrompt, labels);

  if (t.includes("between") && mentioned.length >= 2) {
    return { afterLabel: mentioned[0].label, beforeLabel: mentioned[1].label };
  }

  if ((t.includes("after") || t.includes("below")) && mentioned.length >= 1) {
    return { afterLabel: mentioned[0].label };
  }

  if ((t.includes("before") || t.includes("above")) && mentioned.length >= 1) {
    return { beforeLabel: mentioned[0].label };
  }

  return {};
}

function isDividerIntent(userPrompt: string) {
  const t = String(userPrompt || "").toLowerCase();
  return t.includes("divider") || t.includes("horizontal rule") || /\bhr\b/.test(t);
}

function extractDividerTarget(userPrompt: string): string | null {
  const raw = String(userPrompt || "");
  const m = raw.match(/\b(?:before|above)\s+["']([^"']+)["']/i);
  if (m?.[1]) return m[1].trim();
  if (/pricing\s+table/i.test(raw)) return "Pricing Table";
  return null;
}

function parseRelativeInsertionTarget(userPrompt: string): null | {
  direction: "before" | "after";
  query: string;
} {
  const raw = String(userPrompt || "").trim();
  if (!raw) return null;
  if (!/\b(add|insert|create|place|put|append)\b/i.test(raw)) return null;

  const patterns: RegExp[] = [
    /\b(before|above|after|below)\s+(?:the\s+)?["']([^"']+)["'](?:\s+section)?\b/i,
    /\b(before|above|after|below)\s+(?:the\s+)?([a-z0-9][a-z0-9 _-]{1,80}?)(?:\s+section)?(?:[\.\,\!\?]|$)/i,
  ];

  for (const re of patterns) {
    const match = raw.match(re);
    if (!match?.[1] || !match?.[2]) continue;
    const directionRaw = String(match[1] || "").toLowerCase();
    const direction = directionRaw === "before" || directionRaw === "above" ? "before" : "after";
    const query = String(match[2] || "").trim();
    if (!query) continue;
    return { direction, query };
  }

  return null;
}

function resolveRelativeInsertionPosition(editor: Editor, userPrompt: string): null | {
  insertPos: number;
  label: string;
} {
  const hint = parseRelativeInsertionTarget(userPrompt);
  if (!hint) return null;

  const headingIdx = getHeadingIndexByQuery(editor, hint.query);
  if (headingIdx == null) return null;

  const range = getSectionRangeByHeadingIndex(editor, headingIdx);
  if (!range) return null;

  if (hint.direction === "before") {
    return {
      insertPos: range.start,
      label: `Before "${range.title}"`,
    };
  }

  return {
    insertPos: range.end,
    label: `After "${range.title}"`,
  };
}

function findFirstHeadingContaining(editor: Editor, query: string): { pos: number; text: string } | null {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;
  let found: { pos: number; text: string } | null = null;

  editor.state.doc.descendants((node: any, pos: number) => {
    if (found) return false;
    if (node?.type?.name !== "heading") return true;
    const text = String(node.textContent || "").trim();
    if (!text) return false;
    if (text.toLowerCase().includes(q)) {
      found = { pos, text };
      return false;
    }
    return false;
  });

  return found;
}

function findLastHeadingBefore(editor: Editor, beforePos: number): { pos: number; text: string } | null {
  const limit = Math.max(0, Number(beforePos) || 0);
  let best: { pos: number; text: string } | null = null;

  editor.state.doc.descendants((node: any, pos: number) => {
    if (pos >= limit) return false;
    if (node?.type?.name === "heading") {
      const text = String(node.textContent || "").trim();
      if (text) best = { pos, text };
      return false;
    }
    return true;
  });

  return best;
}

function extractRequestedColumnName(userPrompt: string): string | null {
  const raw = String(userPrompt || "").trim();
  if (!raw) return null;

  const quoted = raw.match(/\b(?:called|named)\s+["']([^"']+)["']/i) || raw.match(/\bcolumn\s+["']([^"']+)["']/i);
  if (quoted?.[1]) return quoted[1].trim();

  const unquoted = raw.match(/\b(?:called|named)\s+([A-Za-z0-9][A-Za-z0-9 _\-]{1,40})/i);
  if (unquoted?.[1]) {
    return unquoted[1].trim().replace(/[\s\.]+$/, "");
  }

  return null;
}

function normalizeSectionKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bsection\b/g, " ")
    .replace(/\bsction\b/g, " ")
    .replace(/\bsecton\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoveSectionPrompt(userPrompt: string): null | {
  source: string;
  target: string;
  direction: "above" | "below";
} {
  const raw = String(userPrompt || "").trim();
  if (!raw) return null;

  const m = raw.match(/\bmove\s+(?:the\s+)?(.+?)\s+section\s+(above|below|before|after)\s+(?:the\s+)?(.+?)(?:\s+section)?\b/i);
  if (!m) return null;

  const source = String(m[1] || "").trim();
  const dirRaw = String(m[2] || "").trim().toLowerCase();
  const target = String(m[3] || "").trim();
  if (!source || !target) return null;

  const direction = dirRaw === "below" || dirRaw === "after" ? "below" : "above";
  return { source, target, direction };
}

function parseSectionEditTarget(userPrompt: string): string | null {
  const raw = String(userPrompt || "").trim();
  if (!raw) return null;

  const patterns: RegExp[] = [
    /\b(?:title|heading)\s+of\s+([a-z0-9][a-z0-9 _&-]{1,80})\b/i,
    /\b(?:content|section)\s+of\s+([a-z0-9][a-z0-9 _&-]{1,80})\b/i,
    /\b(?:in|for)\s+([a-z0-9][a-z0-9 _&-]{1,80})\s+section\b/i,
  ];

  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const query = String(m[1] || "").trim();
      if (query) return query;
    }
  }

  return null;
}

function getHeadingIndexByQuery(editor: Editor, query: string): number | null {
  const q = normalizeSectionKey(query);
  if (!q) return null;

  const headings: Array<{ pos: number; level: number; text: string }> = [];
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node?.type?.name !== "heading") return true;
    headings.push({ pos, level: Number(node.attrs?.level || 1), text: String(node.textContent || "").trim() });
    return false;
  });

  if (headings.length === 0) return null;

  let bestIdx: number | null = null;
  let bestScore = -1;

  for (let i = 0; i < headings.length; i += 1) {
    const h = headings[i];
    const key = normalizeSectionKey(h.text);
    if (!key) continue;
    if (!key.includes(q)) continue;

    // Prefer closer matches (shorter keys) and earlier headings.
    const score = 1000 - key.length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function getSectionRangeByHeadingIndex(editor: Editor, headingIndex: number): null | {
  start: number;
  end: number;
  title: string;
  level: number;
} {
  const headings: Array<{ pos: number; level: number; text: string }> = [];
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node?.type?.name !== "heading") return true;
    headings.push({ pos, level: Number(node.attrs?.level || 1), text: String(node.textContent || "").trim() });
    return false;
  });

  if (headingIndex < 0 || headingIndex >= headings.length) return null;
  const current = headings[headingIndex];
  const start = current.pos;
  let end = editor.state.doc.content.size;

  for (let i = headingIndex + 1; i < headings.length; i += 1) {
    const next = headings[i];
    if (next.level <= current.level) {
      end = next.pos;
      break;
    }
  }

  return {
    start,
    end,
    title: current.text || "Untitled",
    level: current.level,
  };
}

function isSummarizeDocumentIntent(userPrompt: string) {
  const t = String(userPrompt || "").toLowerCase();
  return t.includes("summarize") && (t.includes("document") || t.includes("entire") || t.includes("this"));
}

function isExecutiveSummaryIntent(userPrompt: string) {
  const t = String(userPrompt || "").toLowerCase();
  return t.includes("executive summary");
}

function isImproveDocumentIntent(userPrompt: string) {
  const t = String(userPrompt || "").toLowerCase();
  return (
    t.includes("improve this document") ||
    t.includes("improve the document") ||
    t === "improve this document" ||
    t.includes("rewrite this document") ||
    t.includes("polish this document")
  );
}

function isModifyExistingDocumentIntent(userPrompt: string) {
  const t = String(userPrompt || "").toLowerCase().trim();
  if (!t) return false;

  // If the user is clearly asking to create new content, don't force edit mode.
  if (/\b(create|write|draft|generate)\b/.test(t) && !/\b(change|update|edit|modify|replace|rename|retitle)\b/.test(t)) {
    return false;
  }

  return (
    /\b(change|update|edit|modify|replace|revise|adjust|rename|retitle)\b/.test(t) ||
    /\b(double|halve|increase|decrease|multiply|divide)\b/.test(t) ||
    /\bfix\b/.test(t) ||
    /\bcorrect\b/.test(t)
  );
}

function isAdditiveEditIntent(userPrompt: string) {
  const t = String(userPrompt || "").toLowerCase();
  return (
    /\badd\b/.test(t) ||
    /\bappend\b/.test(t) ||
    /\binsert\b/.test(t) ||
    /\bexpand\b/.test(t) ||
    /\binclude\b/.test(t) ||
    /\bmore\b/.test(t)
  );
}

function id() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeNewlines(text: string) {
  return String(text || "").replace(/\r\n?/g, "\n");
}

function compactOneLine(text: string) {
  return normalizeNewlines(text).replace(/\s+/g, " ").trim();
}

function truncate(text: string, max = 72) {
  const value = String(text || "");
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function formatFolderPath(path: string[]) {
  if (!Array.isArray(path) || path.length === 0) return "/Root";
  return `/${path.filter(Boolean).join("/")}`;
}

function buildManualContextLabel(files: ManualContextFile[]) {
  if (!Array.isArray(files) || files.length === 0) return "";
  if (files.length === 1) return `File: ${files[0].filename}`;
  return `Files (${files.length})`;
}

function stripTruncationMarker(text: string) {
  return String(text || "").replace(/\n?\[TRUNCATED\]\s*$/i, "").trim();
}

function validateFreeformAssistantOutput(text: string): string | null {
  const trimmed = normalizeNewlines(text).trim();
  if (!trimmed) return "No content returned.";

  const lower = trimmed.toLowerCase();
  const contextAsks = [
    "please provide",
    "could you provide",
    "can you provide",
    "i need the",
    "i would need",
    "need the existing",
    "existing table",
    "needs to be modified",
  ];
  if (contextAsks.some((p) => lower.includes(p))) {
    return "Assistant asked for missing context (invalid)";
  }

  // Block HTML-ish output (we insert TipTap nodes, not raw tags).
  if (/<\s*[a-z][^>]*>/i.test(trimmed)) {
    return "Assistant returned HTML (invalid)";
  }

  const commentaryStarts = ["ok", "okay", "sure", "alright"];
  if (commentaryStarts.some((s) => lower.startsWith(s)) && (lower.includes("plan") || lower.includes("first,"))) {
    return "Assistant returned commentary (invalid)";
  }

  return null;
}

function preserveSelectionFormattingStyle(sourceText: string, assistantText: string) {
  const source = normalizeNewlines(sourceText || "").trim();
  const revised = normalizeNewlines(assistantText || "").trim();
  if (!source || !revised) return revised;

  const sourceLines = source.split("\n");
  if (sourceLines.length < 2) return revised;

  const sourceHeading = sourceLines[0].trim();
  const sourceTailLines = sourceLines.slice(1).map((line) => line.trim()).filter(Boolean);
  const sourceTail = sourceTailLines.join(" ");
  const sourceInlineItems = sourceTail
    .split(/\s+(?=\d+\.\s+)/g)
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line));
  const sourceHasInlineNumberedTail = sourceTailLines.length === 1 && sourceInlineItems.length >= 2;

  if (!sourceHasInlineNumberedTail) return revised;

  const revisedLines = revised.split("\n").map((l) => l.trim()).filter(Boolean);
  if (revisedLines.length < 1) return revised;

  let revisedHeading = sourceHeading;
  let revisedBody = revisedLines.join(" ");

  const revisedStartsWithSourceHeading = revisedBody.startsWith(sourceHeading) &&
    revisedBody.length > sourceHeading.length &&
    /\s/.test(revisedBody[sourceHeading.length] || "");
  const revisedSecondLineIsItem = revisedLines.length >= 2 && /^\d+\.\s+/.test(revisedLines[1]);
  const revisedFirstLineIsItem = /^\d+\.\s+/.test(revisedLines[0]);

  if (revisedStartsWithSourceHeading) {
    revisedBody = revisedBody.slice(sourceHeading.length).trim();
  } else if (revisedLines[0] === sourceHeading) {
    revisedBody = revisedLines.slice(1).join(" ");
  } else if (revisedSecondLineIsItem) {
    revisedHeading = revisedLines[0];
    revisedBody = revisedLines.slice(1).join(" ");
  } else if (!revisedFirstLineIsItem) {
    revisedHeading = revisedLines[0];
    revisedBody = revisedLines.slice(1).join(" ");
  }

  const revisedItemLines = revisedBody
    .split(/\s+(?=\d+\.\s+)/g)
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line));

  if (revisedItemLines.length < 2) return revised;

  return `${revisedHeading}\n${revisedItemLines.join("  ")}`;
}

function validateBulletList(text: string, minBullets: number) {
  const lines = normalizeNewlines(text)
    .split("\n")
    .map((l) => l.trim());
  const bulletLines = lines.filter((l) => l.startsWith("- ") && l.length > 2);
  if (bulletLines.length < minBullets) {
    return `Expected at least ${minBullets} bullet points.`;
  }
  return null;
}

function assistantTextToTiptapContent(text: string) {
  const normalized = normalizeNewlines(text).trim();
  if (!normalized) return null;

  const blocks = normalized.split(/\n{2,}/g);
  const nodes: any[] = [];

  const trimLine = (line: string) => String(line || "").replace(/\s+$/g, "");
  const isBulletLine = (line: string) => /^[-*]\s+/.test(String(line || "").trim());
  const isOrderedLine = (line: string) => /^\d+[.)]\s+/.test(String(line || "").trim());
  const isTaskLine = (line: string) => /^[-*]\s+\[(?: |x|X)\]\s+/.test(String(line || "").trim());
  const isQuoteLine = (line: string) => /^>\s?/.test(String(line || "").trim());
  const isDividerLine = (line: string) => /^(?:-{3,}|\*{3,}|_{3,})$/.test(String(line || "").trim());

  const stripBullet = (line: string) => String(line || "").trim().replace(/^[-*]\s+/, "");
  const stripOrdered = (line: string) => String(line || "").trim().replace(/^\d+[.)]\s+/, "");
  const stripQuote = (line: string) => String(line || "").trim().replace(/^>\s?/, "");

  const parseTask = (line: string): { checked: boolean; text: string } | null => {
    const m = String(line || "").trim().match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (!m) return null;
    return { checked: m[1].toLowerCase() === "x", text: String(m[2] || "").trim() };
  };

  const parseOrdered = (line: string): { index: number; text: string } | null => {
    const m = String(line || "").trim().match(/^(\d+)[.)]\s+(.*)$/);
    if (!m) return null;
    return {
      index: Number(m[1] || 1) || 1,
      text: String(m[2] || "").trim(),
    };
  };

  const splitInlineOrderedItems = (line: string): string[] => {
    const raw = String(line || "").trim();
    if (!raw) return [];
    const markers = raw.match(/\d+[.)]\s+/g);
    if (!markers || markers.length < 2) return [];

    let parts = raw.split(/\s{2,}(?=\d+[.)]\s+)/g);
    if (parts.length < 2) {
      parts = raw.split(/\s+(?=\d+[.)]\s+)/g);
    }

    return parts
      .map((p) => p.trim())
      .filter((p) => /^\d+[.)]\s+/.test(p))
      .map(stripOrdered)
      .filter(Boolean);
  };

  const parseHeading = (line: string): { level: 1 | 2 | 3; text: string } | null => {
    const raw = String(line || "").trim();
    if (!raw) return null;

    const markdown = raw.match(/^(#{1,3})\s+(.+)$/);
    if (markdown) {
      const level = markdown[1].length as 1 | 2 | 3;
      return { level, text: String(markdown[2] || "").trim() };
    }

    const shorthand = raw.match(/^h([123])\s*:\s+(.+)$/i);
    if (shorthand) {
      return {
        level: Number(shorthand[1]) as 1 | 2 | 3,
        text: String(shorthand[2] || "").trim(),
      };
    }

    if (/^executive summary:?$/i.test(raw) || /^summary:?$/i.test(raw)) {
      return { level: 2, text: raw.replace(/:$/, "").trim() };
    }

    return null;
  };

  const parseCalloutStart = (line: string): { tone: "tip" | "note" | "warning" | "success"; text: string } | null => {
    const m = String(line || "").trim().match(/^(tip|note|warning|success)\s*:\s*(.*)$/i);
    if (!m) return null;
    const tone = String(m[1] || "").toLowerCase() as "tip" | "note" | "warning" | "success";
    return {
      tone: tone || "tip",
      text: String(m[2] || "").trim(),
    };
  };

  const paragraphNodeFromLines = (lines: string[]) => {
    const cleaned = lines.map(trimLine).filter((line) => String(line || "").trim().length > 0);
    const content: any[] = [];
    for (let i = 0; i < cleaned.length; i += 1) {
      if (i > 0) content.push({ type: "hardBreak" });
      content.push({ type: "text", text: cleaned[i] });
    }
    return { type: "paragraph", content: content.length ? content : undefined };
  };

  const bulletListNode = (lines: string[]) => ({
    type: "bulletList",
    content: lines.map((l) => ({
      type: "listItem",
      content: [paragraphNodeFromLines([stripBullet(l)])],
    })),
  });

  const orderedListNode = (lines: string[]) => {
    const parsed = lines
      .map(parseOrdered)
      .filter((item): item is { index: number; text: string } => Boolean(item));
    if (parsed.length === 0) return null;

    const start = Math.max(1, Number(parsed[0]?.index || 1));
    return {
      type: "orderedList",
      ...(start > 1 ? { attrs: { start } } : {}),
      content: parsed.map((item) => ({
        type: "listItem",
        content: [paragraphNodeFromLines([item.text])],
      })),
    };
  };

  const taskListNode = (lines: string[]) => {
    const parsed = lines.map(parseTask).filter((item): item is { checked: boolean; text: string } => Boolean(item));
    if (parsed.length === 0) return null;
    return {
      type: "taskList",
      content: parsed.map((item) => ({
        type: "taskItem",
        attrs: { checked: item.checked },
        content: [paragraphNodeFromLines([item.text])],
      })),
    };
  };

  for (const block of blocks) {
    const lines = block.split("\n").map(trimLine);
    const trimmedLines = lines.map((l) => l.trim());
    const nonEmpty = trimmedLines.filter(Boolean);
    if (nonEmpty.length === 0) continue;

    const blockRaw = block.trim();

    // Fenced code block support when the model still emits markdown.
    if (blockRaw.startsWith("```") && blockRaw.endsWith("```")) {
      const codeText = blockRaw
        .replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "")
        .replace(/\n?```$/, "");
      nodes.push({
        type: "codeBlock",
        content: codeText
          ? [{ type: "text", text: codeText }]
          : undefined,
      });
      continue;
    }

    if (nonEmpty.length === 1 && isDividerLine(nonEmpty[0])) {
      nodes.push({ type: "horizontalRule" });
      continue;
    }

    const pipeTable = tryParsePipeTable(blockRaw);
    if (pipeTable && pipeTable.rows.length >= 2) {
      const firstPipeLineIndex = nonEmpty.findIndex((line) => line.includes("|"));
      const leadingLines = firstPipeLineIndex > 0 ? nonEmpty.slice(0, firstPipeLineIndex) : [];
      if (leadingLines.length > 0) {
        const maybeHeading = parseHeading(leadingLines[0]);
        if (maybeHeading) {
          nodes.push({
            type: "heading",
            attrs: { level: maybeHeading.level },
            content: maybeHeading.text ? [{ type: "text", text: maybeHeading.text }] : undefined,
          });
          if (leadingLines.length > 1) {
            nodes.push(paragraphNodeFromLines(leadingLines.slice(1)));
          }
        } else if (leadingLines.length === 1 && leadingLines[0].length <= 80) {
          nodes.push({
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: leadingLines[0].replace(/:$/, "").trim() }],
          });
        } else {
          nodes.push(paragraphNodeFromLines(leadingLines));
        }
      }

      const makeParagraph = (value: string) => {
        const t = String(value || "").trim();
        return t
          ? { type: "paragraph", content: [{ type: "text", text: t }] }
          : { type: "paragraph" };
      };

      const header = pipeTable.rows[0];
      const body = pipeTable.rows.slice(1);
      nodes.push({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: header.map((v) => ({ type: "tableHeader", content: [makeParagraph(v)] })),
          },
          ...body.map((row) => ({
            type: "tableRow",
            content: row.map((v) => ({ type: "tableCell", content: [makeParagraph(v)] })),
          })),
        ],
      });
      continue;
    }

    const callout = parseCalloutStart(nonEmpty[0]);
    if (callout) {
      const calloutLines = [
        ...(callout.text ? [callout.text] : []),
        ...nonEmpty.slice(1),
      ];
      nodes.push({
        type: "callout",
        attrs: { tone: callout.tone },
        content: [paragraphNodeFromLines(calloutLines)],
      });
      continue;
    }

    if (nonEmpty.every(isTaskLine)) {
      const taskNode = taskListNode(nonEmpty);
      if (taskNode) nodes.push(taskNode);
      continue;
    }

    if (nonEmpty.every(isOrderedLine)) {
      const orderedNode = orderedListNode(nonEmpty);
      if (orderedNode) nodes.push(orderedNode);
      continue;
    }

    if (nonEmpty.length === 1) {
      const inlineOrderedItems = splitInlineOrderedItems(nonEmpty[0]);
      if (inlineOrderedItems.length >= 2) {
        nodes.push({
          type: "orderedList",
          content: inlineOrderedItems.map((item) => ({
            type: "listItem",
            content: [paragraphNodeFromLines([item])],
          })),
        });
        continue;
      }
    }

    if (nonEmpty.every(isBulletLine)) {
      nodes.push(bulletListNode(nonEmpty));
      continue;
    }

    if (nonEmpty.every(isQuoteLine)) {
      nodes.push({
        type: "blockquote",
        content: [paragraphNodeFromLines(nonEmpty.map(stripQuote))],
      });
      continue;
    }

    const explicitHeading = parseHeading(nonEmpty[0]);
    const tailLines = nonEmpty.slice(1);
    const tailIsList =
      tailLines.length > 0 &&
      (tailLines.every(isTaskLine) || tailLines.every(isOrderedLine) || tailLines.every(isBulletLine));
    const implicitHeading = !explicitHeading &&
      nonEmpty.length >= 2 &&
      tailIsList &&
      nonEmpty[0].length <= 80 &&
      !isBulletLine(nonEmpty[0]) &&
      !isOrderedLine(nonEmpty[0]) &&
      !isTaskLine(nonEmpty[0]) &&
      !isQuoteLine(nonEmpty[0])
      ? { level: 2 as const, text: nonEmpty[0].replace(/:$/, "").trim() }
      : null;
    const heading = explicitHeading || implicitHeading;

    if (heading) {
      nodes.push({
        type: "heading",
        attrs: { level: heading.level },
        content: heading.text ? [{ type: "text", text: heading.text }] : undefined,
      });

      const tail = tailLines;
      if (tail.length > 0) {
        if (tail.every(isTaskLine)) {
          const taskNode = taskListNode(tail);
          if (taskNode) nodes.push(taskNode);
        } else if (tail.every(isOrderedLine)) {
          const orderedNode = orderedListNode(tail);
          if (orderedNode) nodes.push(orderedNode);
        } else if (tail.every(isBulletLine)) {
          nodes.push(bulletListNode(tail));
        } else if (tail.every(isQuoteLine)) {
          nodes.push({
            type: "blockquote",
            content: [paragraphNodeFromLines(tail.map(stripQuote))],
          });
        } else {
          nodes.push(paragraphNodeFromLines(tail));
        }
      }
      continue;
    }

    nodes.push(paragraphNodeFromLines(nonEmpty));
  }

  return nodes.length ? nodes : null;
}

function assistantTextToInlineContent(text: string) {
  const normalized = normalizeNewlines(text);
  if (!normalized.trim()) return null;

  const lines = normalized.replace(/\n+$/g, "").split("\n");
  const content: any[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) content.push({ type: "hardBreak" });
    const line = lines[i];
    if (line) content.push({ type: "text", text: line });
  }
  return content.length ? content : null;
}

function getSelectedText(editor: Editor, from: number, to: number) {
  try {
    const text = editor.state.doc.textBetween(from, to, "\n");
    return normalizeNewlines(text);
  } catch {
    return "";
  }
}

function nodePlainText(node: any) {
  try {
    const size = node?.content?.size ?? 0;
    const text = typeof node?.textBetween === "function"
      ? node.textBetween(0, size, " ")
      : node?.textContent;
    return normalizeNewlines(String(text || "")).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function extractTableText(tableNode: any): {
  columnCount: number;
  headersLine: string;
  tableText: string;
  hasHeaderRow: boolean;
  rowMatrix: string[][];
} {
  if (!tableNode || tableNode.type?.name !== "table") {
    return { columnCount: 0, headersLine: "", tableText: "", hasHeaderRow: false, rowMatrix: [] };
  }

  let columnCount = 0;
  let headerCells: string[] | null = null;
  const matrix: string[][] = [];

  for (let r = 0; r < tableNode.childCount; r += 1) {
    const row = tableNode.child(r);
    if (row?.type?.name !== "tableRow") continue;
    const cells: string[] = [];
    const cellTypes: string[] = [];
    for (let c = 0; c < row.childCount; c += 1) {
      const cell = row.child(c);
      const cellType = cell?.type?.name;
      if (cellType !== "tableCell" && cellType !== "tableHeader") continue;
      cellTypes.push(String(cellType));
      cells.push(nodePlainText(cell));
    }
    if (!headerCells && cellTypes.some((t) => t === "tableHeader")) {
      headerCells = cells.slice();
    }
    columnCount = Math.max(columnCount, cells.length);
    matrix.push(cells);
  }

  const rowMatrix = matrix.map((row) =>
    Array.from({ length: columnCount }, (_, i) => String(row[i] ?? "").trim())
  );

  const lines: string[] = rowMatrix.map((cells) => cells.join(" | "));

  const headers = (headerCells && headerCells.length)
    ? headerCells
    : Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);

  const headersLine = headers
    .slice(0, Math.max(0, columnCount))
    .map((h) => String(h || "").trim())
    .join(" | ");

  return {
    columnCount,
    headersLine,
    tableText: lines.join("\n"),
    hasHeaderRow: Boolean(headerCells && headerCells.length),
    rowMatrix,
  };
}

function getTableContext(editor: Editor): null | {
  insertPos: number;
  columnCount: number;
  headersLine: string;
  tableText: string;
  hasHeaderRow: boolean;
  rowMatrix: string[][];
} {
  const { selection } = editor.state;

  // If the entire table node is selected, attach that table.
  if (selection instanceof NodeSelection && selection.node?.type?.name === "table") {
    const extracted = extractTableText(selection.node);
    const insertPos = selection.from + selection.node.nodeSize - 1;
    return {
      insertPos,
      columnCount: extracted.columnCount,
      headersLine: extracted.headersLine,
      tableText: extracted.tableText,
      hasHeaderRow: extracted.hasHeaderRow,
      rowMatrix: extracted.rowMatrix,
    };
  }

  const $from = selection.$from;

  let tableDepth: number | null = null;
  let rowDepth: number | null = null;

  for (let d = $from.depth; d > 0; d -= 1) {
    const name = $from.node(d)?.type?.name;
    if (!rowDepth && name === "tableRow") rowDepth = d;
    if (!tableDepth && name === "table") tableDepth = d;
  }

  if (tableDepth == null || rowDepth == null) return null;

  const tableNode = $from.node(tableDepth);
  if (!tableNode) return null;

  const extracted = extractTableText(tableNode);
  const insertPos = $from.after(rowDepth);

  return {
    insertPos,
    columnCount: extracted.columnCount,
    headersLine: extracted.headersLine,
    tableText: extracted.tableText,
    hasHeaderRow: extracted.hasHeaderRow,
    rowMatrix: extracted.rowMatrix,
  };
}

function parseTableRows(raw: string, columnCount: number): {
  rows: string[][];
  parseError?: string;
} {
  const invalid = { rows: [], parseError: "AI returned invalid table structure" };

  if (columnCount <= 0) {
    return { rows: [], parseError: "Could not determine table column count." };
  }

  const trimmed = normalizeNewlines(raw).trim();
  if (!trimmed) {
    return invalid;
  }

  if (trimmed.includes("FORMAT_ERROR")) {
    return invalid;
  }

  if (trimmed === "FORMAT_ERROR") {
    return invalid;
  }

  if (trimmed.includes("```")) {
    return invalid;
  }

  const lines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return invalid;
  }

  const rows: string[][] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^\|+/, "").replace(/\|+$/, "").trim();
    const parts = cleaned.split("|").map((p) => p.trim());
    // Skip markdown separator rows like "--- | ---".
    const dashOnly = parts.length > 0 && parts.every((p) => /^-+$/.test(String(p || "").replace(/\s+/g, "")));
    if (dashOnly) continue;
    if (parts.length !== columnCount) {
      return invalid;
    }
    rows.push(parts);
  }

  if (rows.length === 0) {
    return invalid;
  }

  return { rows };
}

function tryParsePipeTable(text: string): null | { columnCount: number; rows: string[][] } {
  const trimmed = normalizeNewlines(text).trim();
  if (!trimmed) return null;
  if (trimmed.includes("```")) return null;
  if (trimmed.includes("FORMAT_ERROR")) return null;

  const lines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: string[][] = [];
  let columnCount: number | null = null;

  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cleaned = line.replace(/^\|+/, "").replace(/\|+$/, "").trim();
    const parts = cleaned.split("|").map((p) => p.trim());
    if (parts.length < 2) continue;
    const dashOnly = parts.every((p) => /^-+$/.test(String(p || "").replace(/\s+/g, "")));
    if (dashOnly) continue;
    if (columnCount == null) columnCount = parts.length;
    if (parts.length !== columnCount) return null;
    rows.push(parts);
  }

  if (!columnCount || rows.length < 2) return null;
  if (columnCount > 10) return null;
  return { columnCount, rows };
}

function stripCodeFences(text: string) {
  let t = normalizeNewlines(text).trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z0-9_-]*\s*/m, "");
    t = t.replace(/```\s*$/m, "");
  }
  return t.trim();
}

function getPlainEditorFormattingRules() {
  return [
    "Formatting requirements:",
    "- Return plain editor-ready text (no markdown syntax).",
    "- Do NOT use markdown markers like #, ##, **, __, or code fences.",
    "- For heading levels, use explicit prefixes: 'H1: ', 'H2: ', or 'H3: '.",
    "- Use section titles as plain text lines.",
    "- Numbered items must use '1. ...' style with one item per line.",
    "- Bullet items must use '- ...' style with one bullet per line.",
    "- For checklist items, use '- [ ] ...' or '- [x] ...'.",
    "- For callouts, start a block with 'Tip:', 'Note:', 'Warning:', or 'Success:'.",
    "- For quotes, start each quoted line with '> '.",
    "- For a divider line, use exactly '---' on its own line.",
    "- For tables, use plain pipe-row format like 'Col A | Col B' followed by data rows.",
    "- Keep one blank line between major sections.",
    "- Do not include commentary before or after the document.",
  ].join("\n");
}

function tryParseJsonObjectFromText(text: string): { jsonText: string | null; value: any | null; error?: string } {
  const cleaned = stripCodeFences(text);
  if (!cleaned) return { jsonText: null, value: null, error: "Empty response" };

  const direct = cleaned.trim();
  const candidates: string[] = [];

  if (direct.startsWith("{") && direct.endsWith("}")) {
    candidates.push(direct);
  }

  const first = direct.indexOf("{");
  const last = direct.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    candidates.push(direct.slice(first, last + 1));
  }

  for (const jsonText of candidates) {
    try {
      const value = JSON.parse(jsonText);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return { jsonText, value };
      }
    } catch (e: any) {
      void e;
    }
  }

  return { jsonText: null, value: null, error: "Invalid JSON" };
}

function normalizeAction(value: any): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function normalizeTarget(value: any): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function pickFirstString(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickFirstArray(obj: any, keys: string[]): any[] | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v)) return v;
  }
  return null;
}

function isPrimitiveCellValue(value: any): boolean {
  return value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function validateAndNormalizeTableInstruction(
  parsed: any,
  table: { columns: string[]; rowKeys: string[]; bodyRowCount: number },
  opts?: { expectedAddRowCount?: number | null }
): { instruction: TableJsonInstruction | null; error?: string } {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { instruction: null, error: "Invalid JSON" };
  }

  const action = normalizeAction(parsed.action);
  const targetNorm = normalizeTarget(parsed.target);
  const isTableTarget = !targetNorm || targetNorm === "table" || targetNorm.includes("table");

  if (!isTableTarget) {
    return { instruction: null, error: "Expected target=table" };
  }

  let data: any = parsed.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    // Some providers omit `data` and return fields at the top level.
    const copy: any = { ...parsed };
    delete copy.action;
    delete copy.target;
    delete copy.data;
    data = copy;
  }

  const allowed: TableJsonAction[] = ["add_column", "add_row", "update_cell", "delete_row", "delete_column"];
  if (!allowed.includes(action as any)) {
    return { instruction: null, error: "Unsupported table action" };
  }

  if (action === "add_column") {
    const columnName = pickFirstString(data, ["column_name", "columnName", "name", "column"]) || "";
    const values = pickFirstArray(data, ["values", "column_values", "columnValues"]) || null;
    if (!columnName) return { instruction: null, error: "Missing column_name" };
    if (!values) return { instruction: null, error: "Missing values" };
    if (values.length !== table.bodyRowCount) return { instruction: null, error: "AI returned invalid table structure" };

    return {
      instruction: {
        action: "add_column",
        target: "table",
        data: {
          column_name: columnName,
          values,
        },
      },
    };
  }

  if (action === "add_row") {
    const rows = pickFirstArray(data, ["rows"]) || null;
    const row = data?.row ?? data?.values ?? null;
    let payloadRows = rows || (row != null ? [row] : null);

    // Some models return `rows` as a single flat row array. Normalize to row-list shape.
    if (rows && rows.length > 0 && rows.every((cell) => isPrimitiveCellValue(cell))) {
      payloadRows = [rows];
    }

    if (!payloadRows || payloadRows.length === 0) return { instruction: null, error: "Missing row" };

    const expected = typeof opts?.expectedAddRowCount === "number" ? opts.expectedAddRowCount : null;
    if (expected != null && payloadRows.length !== expected) {
      return { instruction: null, error: `Expected ${expected} row(s)` };
    }

    return {
      instruction: {
        action: "add_row",
        target: "table",
        data: {
          rows: payloadRows,
          after_row: data?.after_row ?? data?.after_row_key ?? data?.afterRow ?? data?.afterRowKey ?? null,
          before_row: data?.before_row ?? data?.before_row_key ?? data?.beforeRow ?? data?.beforeRowKey ?? null,
        },
      },
    };
  }

  if (action === "update_cell") {
    const updates = pickFirstArray(data, ["updates"]) || null;
    if (updates && updates.length > 0) {
      return {
        instruction: {
          action: "update_cell",
          target: "table",
          data: { updates },
        },
      };
    }

    if (data?.row == null || data?.column == null || data?.value == null) {
      return { instruction: null, error: "Missing row/column/value" };
    }

    return {
      instruction: {
        action: "update_cell",
        target: "table",
        data: { row: data.row, column: data.column, value: data.value },
      },
    };
  }

  if (action === "delete_row") {
    const rows = pickFirstArray(data, ["rows"]) || null;
    const row = data?.row ?? null;
    const payloadRows = rows || (row != null ? [row] : null);
    if (!payloadRows || payloadRows.length === 0) return { instruction: null, error: "Missing row" };
    return {
      instruction: {
        action: "delete_row",
        target: "table",
        data: { rows: payloadRows },
      },
    };
  }

  // delete_column
  const cols = pickFirstArray(data, ["columns"]) || null;
  const col = data?.column ?? null;
  const payloadCols = cols || (col != null ? [col] : null);
  if (!payloadCols || payloadCols.length === 0) return { instruction: null, error: "Missing column" };
  return {
    instruction: {
      action: "delete_column",
      target: "table",
      data: { columns: payloadCols },
    },
  };
}

function describeTableInstruction(instruction: TableJsonInstruction): { title: string; preview?: string; button: string } {
  const data = instruction.data || {};

  if (instruction.action === "add_column") {
    const name = String(data.column_name || "").trim();
    const values = Array.isArray(data.values) ? data.values : [];
    return {
      title: name ? `Add column: ${name}` : "Add column",
      preview: values.length ? `Prepared ${values.length} value(s).` : undefined,
      button: "Apply Table Edit",
    };
  }

  if (instruction.action === "add_row") {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    return {
      title: `Add ${rows.length || 1} row(s)`,
      preview: rows.length ? `Prepared ${rows.length} row(s).` : undefined,
      button: "Apply Table Edit",
    };
  }

  if (instruction.action === "update_cell") {
    const updates = Array.isArray(data.updates) ? data.updates : null;
    const count = updates ? updates.length : 1;
    return {
      title: `Update ${count} cell(s)`,
      preview: `Prepared ${count} update(s).`,
      button: "Apply Table Edit",
    };
  }

  if (instruction.action === "delete_row") {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    return {
      title: `Delete ${rows.length || 1} row(s)`,
      preview: rows.length ? rows.map((r: any) => String(r)).join("\n") : undefined,
      button: "Apply Table Edit",
    };
  }

  const cols = Array.isArray(data.columns) ? data.columns : [];
  return {
    title: `Delete ${cols.length || 1} column(s)`,
    preview: cols.length ? `Prepared ${cols.length} column reference(s).` : undefined,
    button: "Apply Table Edit",
  };
}

type PreviewTableData = {
  headers: string[];
  rows: string[][];
};

function splitHeaderLine(headersLine: string, fallbackCount: number): string[] {
  const parts = String(headersLine || "")
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length > 0) return parts;
  const count = Math.max(1, Number(fallbackCount) || 1);
  return Array.from({ length: count }, (_, i) => `Column ${i + 1}`);
}

function buildTablePreviewFromMeta(meta: Extract<AssistantMeta, { kind: "table" }>): PreviewTableData | null {
  if (!Array.isArray(meta.rows) || meta.rows.length === 0) return null;

  if (meta.action === "create_table") {
    if (meta.rows.length >= 2) {
      const headers = (meta.rows[0] || []).map((v) => coerceCellValue(v));
      const body = meta.rows.slice(1).map((r) =>
        Array.from({ length: headers.length }, (_, i) => coerceCellValue(r?.[i]))
      );
      return { headers, rows: body };
    }
    const headers = splitHeaderLine(meta.headersLine, meta.outputColumnCount);
    const rows = meta.rows.map((r) => Array.from({ length: headers.length }, (_, i) => coerceCellValue(r?.[i])));
    return { headers, rows };
  }

  if (meta.action === "add_column") {
    const rowKeys = Array.isArray(meta.expectedFirstColumn) ? meta.expectedFirstColumn : [];
    const colName = String(meta.newColumnName || "").trim() || "Value";
    const rows = meta.rows.map((r, i) => [
      String(rowKeys[i] || `Row ${i + 1}`),
      coerceCellValue(r?.[0]),
    ]);
    return { headers: ["Row", colName], rows };
  }

  const headers = splitHeaderLine(meta.headersLine, meta.outputColumnCount);
  const rows = meta.rows.map((r) =>
    Array.from({ length: headers.length }, (_, i) => coerceCellValue(r?.[i]))
  );
  return { headers, rows };
}

function buildTableJsonPreviewFromMeta(meta: Extract<AssistantMeta, { kind: "table_json" }>): PreviewTableData | null {
  const instruction = meta.instruction;
  if (!instruction) return null;

  const data: any = instruction.data || {};
  const columns = Array.isArray(meta.columns) && meta.columns.length > 0
    ? meta.columns.map((c) => String(c || "").trim() || "Column")
    : [];
  const rowKeys = Array.isArray(meta.rowKeys) ? meta.rowKeys : [];

  if (instruction.action === "add_row") {
    const rowsRaw = Array.isArray(data.rows) ? data.rows : [];
    const normalizedRows = rowsRaw.length > 0 && rowsRaw.every((cell: any) => isPrimitiveCellValue(cell))
      ? [rowsRaw]
      : rowsRaw;
    if (normalizedRows.length === 0) return null;

    const maxLen = normalizedRows.reduce((acc: number, row: any) => {
      if (Array.isArray(row)) return Math.max(acc, row.length);
      return Math.max(acc, columns.length || 0);
    }, 0);
    const headers = columns.length > 0
      ? columns
      : Array.from({ length: Math.max(1, maxLen) }, (_, i) => `Column ${i + 1}`);
    const rows = normalizedRows.map((row: any) => (
      Array.isArray(row)
        ? Array.from({ length: headers.length }, (_, i) => coerceCellValue(row?.[i]))
        : mapRowObjectToValues(headers, row)
    ));
    return { headers, rows };
  }

  if (instruction.action === "add_column") {
    const values = Array.isArray(data.values) ? data.values : [];
    if (values.length === 0) return null;
    const colName = String(data.column_name || "").trim() || "Value";
    const rows = values.map((v: any, i: number) => [String(rowKeys[i] || `Row ${i + 1}`), coerceCellValue(v)]);
    return { headers: ["Row", colName], rows };
  }

  if (instruction.action === "update_cell") {
    const updates = Array.isArray(data.updates) ? data.updates : [data];
    const rows = updates
      .filter((u: any) => u && (u.row != null || u.column != null || u.value != null))
      .map((u: any) => [
        String(u.row ?? ""),
        String(u.column ?? ""),
        coerceCellValue(u.value),
      ]);
    if (rows.length === 0) return null;
    return { headers: ["Row", "Column", "Value"], rows };
  }

  if (instruction.action === "delete_row") {
    const rowsRef = Array.isArray(data.rows) ? data.rows : [];
    const rows = rowsRef.map((r: any) => [String(r ?? "")]).filter((r: string[]) => r[0].trim());
    if (rows.length === 0) return null;
    return { headers: ["Rows to Delete"], rows };
  }

  if (instruction.action === "delete_column") {
    const colsRef = Array.isArray(data.columns) ? data.columns : [];
    const rows = colsRef.map((c: any) => [String(c ?? "")]).filter((r: string[]) => r[0].trim());
    if (rows.length === 0) return null;
    return { headers: ["Columns to Delete"], rows };
  }

  return null;
}

function buildSelectionAttachment(editor: Editor): AttachedContextSnapshot | null {
  const sel = editor.state.selection;
  if (sel instanceof NodeSelection && sel.node?.type?.name === "table") return null;
  if (sel instanceof CellSelection) return null;

  if (sel.empty) {
    // Notion-like: treat the current heading block as attachable context.
    const $from = sel.$from;
    const parent = $from?.parent;
    if (parent?.type?.name !== "heading") return null;

    const from = $from.start();
    const to = from + (parent.content?.size ?? 0);
    const text = normalizeNewlines(String(parent.textContent || "")).trim();
    if (!text) return null;

    const label = `Heading: ${truncate(compactOneLine(text), 56)}`;
    const signature = `heading:${from}-${to}:${label}`;

    return {
      kind: "selection",
      signature,
      label,
      selectionFrom: from,
      selectionTo: to,
      text,
    };
  }

  const raw = getSelectedText(editor, sel.from, sel.to);
  const text = normalizeNewlines(raw).trim();
  if (!text) return null;

  const label = truncate(compactOneLine(text), 56);
  const signature = `sel:${sel.from}-${sel.to}:${label}`;

  return {
    kind: "selection",
    signature,
    label,
    selectionFrom: sel.from,
    selectionTo: sel.to,
    text,
  };
}

function describeCellForLabel(cell: TableCellSnapshot) {
  const row = cell.rowKey ? truncate(cell.rowKey, 22) : `Row ${cell.tableRowIndex + 1}`;
  const col = cell.columnName ? truncate(cell.columnName, 22) : `Col ${cell.columnIndex + 1}`;
  return `${row} / ${col}`;
}

function buildCellsAttachment(editor: Editor): AttachedContextSnapshot | null {
  const sel: any = editor.state.selection as any;
  if (sel instanceof NodeSelection && sel.node?.type?.name === "table") return null;

  const isCellSel = sel instanceof CellSelection;
  const wantsActiveCell = !isCellSel && Boolean(sel?.empty) && editor.isActive("table");
  if (!isCellSel && !wantsActiveCell) return null;

  const $anchorCell = isCellSel ? (sel.$anchorCell || sel.$anchor || null) : null;
  const $headCell = isCellSel ? (sel.$headCell || sel.$head || null) : null;
  const $pos = isCellSel
    ? ($anchorCell || sel.$from)
    : sel.$from;

  const findTablePos = (resolved: any) => {
    try {
      for (let d = resolved.depth; d > 0; d -= 1) {
        if (resolved.node(d)?.type?.name === "table") return resolved.before(d);
      }
    } catch {
      // ignore
    }
    return null;
  };

  const findCellPos = (resolved: any) => {
    try {
      for (let d = resolved.depth; d > 0; d -= 1) {
        const name = resolved.node(d)?.type?.name;
        if (name === "tableCell" || name === "tableHeader") return resolved.before(d);
      }
    } catch {
      // ignore
    }
    return null;
  };

  const tablePos = findTablePos($pos);
  if (tablePos == null) return null;

  const info = getTableRuntimeInfoByTablePos(editor, tablePos);
  if (!info) return null;

  const tableNode = editor.state.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type?.name !== "table") return null;
  const tableStart = tablePos + 1;
  const map = TableMap.get(tableNode);

  let cellRelPositions: Array<{ relPos: number; rowIndex: number; colIndex: number }> = [];

  if (isCellSel) {
    const anchorCellPos = ($anchorCell && typeof $anchorCell.pos === "number")
      ? $anchorCell.pos
      : (sel.$anchor ? findCellPos(sel.$anchor) : null);
    const headCellPos = ($headCell && typeof $headCell.pos === "number")
      ? $headCell.pos
      : (sel.$head ? findCellPos(sel.$head) : anchorCellPos);
    if (anchorCellPos == null || headCellPos == null) return null;

    let aRect: any;
    let hRect: any;
    try {
      aRect = map.findCell(anchorCellPos - tableStart);
      hRect = map.findCell(headCellPos - tableStart);
    } catch {
      return null;
    }

    const left = Math.min(aRect.left, hRect.left);
    const right = Math.max(aRect.right, hRect.right);
    const top = Math.min(aRect.top, hRect.top);
    const bottom = Math.max(aRect.bottom, hRect.bottom);

    const seen = new Set<number>();
    for (let r = top; r < bottom; r += 1) {
      for (let c = left; c < right; c += 1) {
        const relPos = map.map[r * map.width + c];
        if (seen.has(relPos)) continue;
        seen.add(relPos);
        const rect = map.findCell(relPos);
        cellRelPositions.push({ relPos, rowIndex: rect.top, colIndex: rect.left });
      }
    }
  } else {
    const cellPos = findCellPos($pos);
    if (cellPos == null) return null;
    try {
      const rect = map.findCell(cellPos - tableStart);
      cellRelPositions = [{ relPos: cellPos - tableStart, rowIndex: rect.top, colIndex: rect.left }];
    } catch {
      return null;
    }
  }

  if (cellRelPositions.length === 0) return null;

  // Map to snapshots.
  const bodyStart = info.hasHeaderRow ? 1 : 0;
  const cells: TableCellSnapshot[] = cellRelPositions
    .map(({ relPos, rowIndex, colIndex }) => {
      const tableRowIndex = rowIndex;
      const bodyRowIndex = tableRowIndex >= bodyStart ? tableRowIndex - bodyStart : null;
      const rowKey = bodyRowIndex != null ? (info.rowKeys[bodyRowIndex] || null) : null;
      const columnName = colIndex >= 0 && colIndex < info.columns.length ? info.columns[colIndex] : null;
      const cellNode = editor.state.doc.nodeAt(tableStart + relPos);
      const value = cellNode ? nodePlainText(cellNode) : "";
      return {
        tableRowIndex,
        bodyRowIndex,
        rowKey,
        columnIndex: colIndex,
        columnName,
        value,
      };
    })
    // De-dupe by row/col
    .filter((c, idx, arr) => arr.findIndex((x) => x.tableRowIndex === c.tableRowIndex && x.columnIndex === c.columnIndex) === idx);

  const prefix = cells.length === 1 ? "Cell" : `Cells (${cells.length})`;
  const labelCore = cells.length === 1
    ? describeCellForLabel(cells[0])
    : truncate(cells.slice(0, 3).map(describeCellForLabel).join(", "), 56);
  const label = info.heading
    ? `${prefix}: ${labelCore} - ${truncate(info.heading, 32)}`
    : `${prefix}: ${labelCore}`;

  const signature = `cells:${info.tablePos}:${cells.map((c) => `${c.tableRowIndex}:${c.columnIndex}`).join(",")}`;

  return {
    kind: "cells",
    signature,
    label,
    tablePos: info.tablePos,
    insertPos: info.insertPos,
    hasHeaderRow: info.hasHeaderRow,
    columnCount: info.columnCount,
    columns: info.columns,
    rowKeys: info.rowKeys,
    bodyRowCount: info.bodyRows.length,
    cells,
  };
}

function buildTableAttachment(editor: Editor): AttachedContextSnapshot | null {
  const ctx = getTableContext(editor);
  if (!ctx || ctx.columnCount <= 0) return null;

  const headerPreview = ctx.headersLine ? truncate(ctx.headersLine, 48) : `Table (${ctx.columnCount} cols)`;
  const label = `Table (${ctx.columnCount} cols): ${headerPreview}`;
  const signature = `table:${ctx.insertPos}:${ctx.columnCount}:${ctx.headersLine}:${ctx.hasHeaderRow}`;

  const bodyStart = ctx.hasHeaderRow ? 1 : 0;
  const bodyRows = ctx.rowMatrix.slice(bodyStart);
  const firstColumnValues = bodyRows
    .map((r) => String(r?.[0] ?? "").trim());
  const bodyRowCount = bodyRows.length;

  return {
    kind: "table",
    signature,
    label,
    insertPos: ctx.insertPos,
    columnCount: ctx.columnCount,
    headersLine: ctx.headersLine,
    tableText: ctx.tableText,
    hasHeaderRow: ctx.hasHeaderRow,
    bodyRowCount,
    firstColumnValues,
  };
}

function buildDocumentAttachmentFull(editor: Editor): DocumentAttachment | null {
  try {
    const textFull = extractTextFromTiptap(editor.getJSON());
    const text = textFull.length > 24000
      ? `${textFull.slice(0, 24000)}\n\n[TRUNCATED]`
      : textFull;

    let firstHeading: string | null = null;
    editor.state.doc.descendants((node: any) => {
      if (firstHeading) return false;
      if (node?.type?.name !== "heading") return true;
      const t = String(node.textContent || "").trim();
      if (t) firstHeading = t;
      return false;
    });

    const label = firstHeading
      ? `Document: ${truncate(firstHeading, 48)}`
      : "Document";
    const signature = `doc:${text.length}:${label}`;

    return {
      kind: "document",
      signature,
      label,
      text,
    };
  } catch {
    return null;
  }
}

function buildDocumentAttachmentLite(editor: Editor): DocumentAttachment | null {
  try {
    let firstHeading: string | null = null;
    editor.state.doc.descendants((node: any) => {
      if (firstHeading) return false;
      if (node?.type?.name !== "heading") return true;
      const t = String(node.textContent || "").trim();
      if (t) firstHeading = t;
      return false;
    });

    const label = firstHeading
      ? `Document: ${truncate(firstHeading, 48)}`
      : "Document";
    const signature = `doc-lite:${editor.state.doc.content.size}:${label}`;

    return {
      kind: "document",
      signature,
      label,
      text: "",
    };
  } catch {
    return null;
  }
}

const MAX_MANUAL_CONTEXT_DOC_CHARS = 8000;
const MAX_MANUAL_CONTEXT_TOTAL_CHARS = 22000;

function normalizePickedDoc(doc: StoredDocument): ManualContextFile {
  const filename = String((doc as any)?.filename || (doc as any)?.name || (doc as any)?.title || "Untitled");
  const rawTitle = String((doc as any)?.title || "").trim();
  const title = rawTitle && rawTitle.toLowerCase() !== filename.toLowerCase() ? rawTitle : undefined;
  const folderPath = Array.isArray((doc as any)?.folderPath)
    ? ((doc as any).folderPath as string[]).filter(Boolean)
    : Array.isArray((doc as any)?.folder_path)
      ? ((doc as any).folder_path as string[]).filter(Boolean)
      : [];
  const type = typeof (doc as any)?.type === "string" ? String((doc as any).type) : undefined;

  return {
    id: doc.id,
    filename,
    title,
    folderPath,
    type,
  };
}

async function loadManualFileText(orgId: string, file: ManualContextFile): Promise<string> {
  const docId = String(file.id || "").trim();
  if (!orgId || !docId) return "";

  let text = "";
  let docType = String(file.type || "").toLowerCase();

  // 1) Document record (can include inline content for editor/text docs).
  try {
    const doc = await apiFetch<any>(`/orgs/${orgId}/documents/${docId}`, { skipCache: true });
    if (typeof doc?.type === "string" && doc.type) docType = String(doc.type).toLowerCase();
    const inlineContent = typeof doc?.content === "string" ? doc.content : "";
    if (inlineContent.trim()) text = inlineContent;
  } catch {
    // ignore; fallback below
  }

  // 2) Extraction payload for regular uploaded docs (PDF, images, etc.).
  if (!text.trim()) {
    try {
      const extraction = await apiFetch<any>(`/orgs/${orgId}/documents/${docId}/extraction`, {
        skipCache: true,
      });

      const extractionTextCandidates = [
        extraction?.ocrText,
        extraction?.text,
        extraction?.content,
        extraction?.extractedText,
        extraction?.metadata?.summary,
      ];

      for (const candidate of extractionTextCandidates) {
        const value = typeof candidate === "string" ? candidate.trim() : "";
        if (value) {
          text = value;
          break;
        }
      }
    } catch {
      // ignore; fallback below
    }
  }

  // 3) Editor latest version for editor docs.
  if (!text.trim() && (docType === "editor" || file.filename.toLowerCase().endsWith(".md"))) {
    try {
      const latest = await apiFetch<any>(`/orgs/${orgId}/editor/docs/${docId}/latest`, { skipCache: true });
      const contentText = typeof latest?.version?.content_text === "string" ? latest.version.content_text : "";
      if (contentText.trim()) {
        text = contentText;
      } else if (latest?.version?.content && typeof latest.version.content === "object") {
        const fromJson = extractTextFromTiptap(latest.version.content);
        if (fromJson.trim()) text = fromJson;
      }
    } catch {
      // ignore
    }
  }

  return normalizeNewlines(String(text || "").trim());
}

async function buildManualContextPromptSection(orgId: string, files: ManualContextFile[]) {
  if (!orgId || !Array.isArray(files) || files.length === 0) return "";

  const loaded = await Promise.all(
    files.map(async (file) => {
      const text = await loadManualFileText(orgId, file);
      return { file, text };
    })
  );

  const sections: string[] = [];
  let used = 0;

  for (const { file, text } of loaded) {
    const cleaned = stripTruncationMarker(text);
    if (!cleaned) continue;
    if (used >= MAX_MANUAL_CONTEXT_TOTAL_CHARS) break;

    const remaining = Math.max(0, MAX_MANUAL_CONTEXT_TOTAL_CHARS - used);
    const budget = Math.max(0, Math.min(MAX_MANUAL_CONTEXT_DOC_CHARS, remaining));
    if (budget <= 0) break;

    const clipped = cleaned.length > budget
      ? `${cleaned.slice(0, budget)}\n\n[TRUNCATED]`
      : cleaned;

    sections.push(
      [
        `File: ${file.filename}`,
        file.title ? `Title: ${file.title}` : "",
        `Path: ${formatFolderPath(file.folderPath)}`,
        `Content:`,
        clipped,
      ]
        .filter(Boolean)
        .join("\n")
    );
    used += clipped.length;
  }

  if (sections.length === 0) return "";

  return `Attached file context:\nUse these files as supporting context.\n\n${sections.join("\n\n---\n\n")}`;
}

type TableRuntimeInfo = {
  tablePos: number;
  insertPos: number;
  hasHeaderRow: boolean;
  columnCount: number;
  columns: string[];
  bodyRows: string[][];
  rowKeys: string[];
  heading?: string;
};

function isLikelyTableEditPrompt(userPrompt: string) {
  const t = String(userPrompt || "").toLowerCase();
  if (/(add|insert|delete|remove|update|edit|change|increase|decrease)\s+.*\b(column|row|cell)\b/.test(t)) return true;
  if (t.includes("pricing table") || t.includes("feature comparison")) return true;
  if (t.includes("table") && /(column|row|cell|price|plan|users|storage|support)/.test(t)) return true;
  return false;
}

function extractTableQueryFromPrompt(userPrompt: string): string | null {
  const raw = String(userPrompt || "");
  const m = raw.match(/\b([A-Za-z0-9][A-Za-z0-9 _\-]{1,40})\s+table\b/i);
  if (m?.[1]) return m[1].trim();
  if (/pricing\s+table/i.test(raw)) return "pricing";
  if (/feature\s+comparison/i.test(raw)) return "feature";
  return null;
}

function collectTablesWithHeadings(editor: Editor): Array<{ pos: number; node: any; heading?: string }> {
  const tables: Array<{ pos: number; node: any; heading?: string }> = [];
  let lastHeading: string | undefined;

  editor.state.doc.descendants((node: any, pos: number) => {
    if (node?.type?.name === "heading") {
      const text = String(node.textContent || "").trim();
      if (text) lastHeading = text;
      return false;
    }
    if (node?.type?.name === "table") {
      tables.push({ pos, node, heading: lastHeading });
      return false;
    }
    return true;
  });

  return tables;
}

function getTableRuntimeInfoByTablePos(editor: Editor, tablePos: number): TableRuntimeInfo | null {
  const tableNode = editor.state.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type?.name !== "table") return null;

  const extracted = extractTableText(tableNode);
  const columnCount = Math.max(extracted.columnCount, getMaxTableColumns(tableNode));
  const hasHeaderRow = detectHasHeaderRow(tableNode);
  const bodyStart = hasHeaderRow ? 1 : 0;

  const matrix = extracted.rowMatrix.length
    ? extracted.rowMatrix
    : [];

  const normalizedMatrix = matrix.map((row) =>
    Array.from({ length: columnCount }, (_, i) => String(row?.[i] ?? "").trim())
  );

  const columns = hasHeaderRow
    ? Array.from({ length: columnCount }, (_, i) => {
      const headerRow = normalizedMatrix[0] || [];
      return String(headerRow[i] ?? `Column ${i + 1}`).trim() || `Column ${i + 1}`;
    })
    : Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);

  const bodyRows = normalizedMatrix.slice(bodyStart);
  const rowKeys = bodyRows.map((r) => String(r?.[0] ?? "").trim());
  const insertPos = tablePos + tableNode.nodeSize - 1;
  const heading = findLastHeadingBefore(editor, tablePos)?.text;

  return {
    tablePos,
    insertPos,
    hasHeaderRow,
    columnCount,
    columns,
    bodyRows,
    rowKeys,
    heading,
  };
}

function findBestTableForPrompt(editor: Editor, userPrompt: string): TableRuntimeInfo | null {
  const tables = collectTablesWithHeadings(editor);
  if (tables.length === 0) return null;
  if (tables.length === 1) {
    return getTableRuntimeInfoByTablePos(editor, tables[0].pos);
  }

  const query = normalizeSectionKey(extractTableQueryFromPrompt(userPrompt) || "");
  const promptLower = normalizeSectionKey(userPrompt);

  let best: { score: number; pos: number } | null = null;

  for (const t of tables) {
    const info = getTableRuntimeInfoByTablePos(editor, t.pos);
    if (!info) continue;
    let score = 0;
    const headingKey = normalizeSectionKey(t.heading || "");
    if (query && headingKey.includes(query)) score += 10;

    const columnsKey = normalizeSectionKey(info.columns.join(" "));
    if (query && columnsKey.includes(query)) score += 6;

    for (const col of info.columns) {
      const ck = normalizeSectionKey(col);
      if (ck && promptLower.includes(ck)) score += 1;
    }

    // Prefer tables whose headings are mentioned.
    if (headingKey && promptLower.includes(headingKey)) score += 8;

    // Slight preference for earlier tables.
    score += Math.max(0, 3 - Math.floor(t.pos / 5000));

    if (!best || score > best.score) best = { score, pos: t.pos };
  }

  return best ? getTableRuntimeInfoByTablePos(editor, best.pos) : null;
}

function buildTableJsonUserPrompt(
  userPrompt: string,
  table: TableRuntimeInfo,
  opts?: { selectedCells?: TableCellSnapshot[]; expectedAddRowCount?: number | null }
) {
  const selectedCells = Array.isArray(opts?.selectedCells) ? opts?.selectedCells : [];
  const expectedAddRowCount = typeof opts?.expectedAddRowCount === "number" ? opts.expectedAddRowCount : null;

  const context = {
    heading: table.heading || null,
    column_count: table.columnCount,
    columns: table.columns,
    body_row_count: table.bodyRows.length,
    row_keys: table.rowKeys,
    rows: table.bodyRows,
    selected_cells: selectedCells.slice(0, 12).map((c) => ({
      table_row_index: c.tableRowIndex,
      body_row_index: c.bodyRowIndex,
      row_key: c.rowKey,
      column_index: c.columnIndex,
      column_name: c.columnName,
      value: c.value,
    })),
  };

  const rowAddConstraint = expectedAddRowCount != null
    ? `- If adding rows: data.rows MUST include exactly ${expectedAddRowCount} row(s).`
    : "- If adding rows: include the correct number of rows based on the instruction.";

  return `Table context (read-only):\n${JSON.stringify(context, null, 2)}\n\nInstruction:\n${userPrompt}\n\nReturn ONLY valid JSON (no markdown, no code fences).\n\nOutput schema (exact shape):\n{\n  "action": "add_column | add_row | update_cell | delete_row | delete_column",\n  "target": "table",\n  "data": { }\n}\n\nRules:\n- target MUST be exactly "table".\n- Prefer row identification by row key (first column string). If you must use indices, use 0-based body row index (0..${Math.max(0, table.bodyRows.length - 1)}).\n- Prefer column identification by column name. If you must use indices, use 0-based column index (0..${Math.max(0, table.columnCount - 1)}).\n- If the instruction refers to "this cell" / "these cells" / "selected cells", use selected_cells.\n\nAction-specific requirements:\n- add_column: data = { column_name: string, values: string[] } and values length must be exactly ${table.bodyRows.length}.\n${rowAddConstraint}\n- update_cell: data = { updates: [{ row, column, value }] } (row/column can be keys or indices).\n- delete_row: data = { rows: [row_key_or_index] }\n- delete_column: data = { columns: [column_name_or_index] }`;
}

function tryBuildLocalTableJsonInstruction(
  userPrompt: string,
  table: TableRuntimeInfo,
  selectedCells?: TableCellSnapshot[]
): TableJsonInstruction | null {
  const value = extractSetValue(userPrompt);
  if (!value) return null;

  const lower = String(userPrompt || "").toLowerCase();
  const hasVerb = /(set|change|update|replace|make)\b/.test(lower);
  if (!hasVerb) return null;

  const rowMentions = findMentionedLabels(userPrompt, (table.rowKeys || []).filter(Boolean));
  const colMentions = findMentionedLabels(userPrompt, (table.columns || []).filter(Boolean));

  if (rowMentions.length === 1 && colMentions.length === 1) {
    return {
      action: "update_cell",
      target: "table",
      data: {
        row: rowMentions[0].label,
        column: colMentions[0].label,
        value,
      },
    };
  }

  const cells = Array.isArray(selectedCells) ? selectedCells : [];
  const usable = cells.filter((c) => c.bodyRowIndex != null);
  if (usable.length > 0 && rowMentions.length === 0 && colMentions.length === 0) {
    return {
      action: "update_cell",
      target: "table",
      data: {
        updates: usable.map((c) => ({
          row: c.rowKey ?? c.bodyRowIndex,
          column: c.columnName ?? c.columnIndex,
          value,
        })),
      },
    };
  }

  return null;
}

function isPosInsideTable(editor: Editor, pos: number) {
  try {
    const $pos = editor.state.doc.resolve(pos);
    for (let d = $pos.depth; d > 0; d -= 1) {
      if ($pos.node(d)?.type?.name === "table") return true;
    }
    return false;
  } catch {
    return false;
  }
}

function buildTableRowNodes(rows: string[][], columnCount: number) {
  return rows.map((cells) => ({
    type: "tableRow",
    content: Array.from({ length: columnCount }, (_, i) => {
      const text = String(cells[i] ?? "").trim();
      const paragraph: any = { type: "paragraph" };
      if (text) paragraph.content = [{ type: "text", text }];
      return { type: "tableCell", content: [paragraph] };
    }),
  }));
}

function resolveTableAnchorFromInsertPos(editor: Editor, insertPos: number): null | {
  tablePos: number;
  rowIndex: number;
} {
  try {
    const doc = editor.state.doc;
    const $pos = doc.resolve(insertPos);
    let tableDepth: number | null = null;
    for (let d = $pos.depth; d > 0; d -= 1) {
      if ($pos.node(d)?.type?.name === "table") {
        tableDepth = d;
        break;
      }
    }
    if (tableDepth == null) return null;

    const tablePos = $pos.before(tableDepth);
    const insertIndex = $pos.index(tableDepth);
    const rowIndex = Math.max(0, insertIndex - 1);

    return { tablePos, rowIndex };
  } catch {
    return null;
  }
}

function getRowStartPos(tableNode: any, tablePos: number, rowIndex: number) {
  const tableStart = tablePos + 1;
  let pos = tableStart;
  for (let i = 0; i < rowIndex; i += 1) {
    const child = tableNode.child(i);
    pos += child.nodeSize;
  }
  return pos;
}

function getCellStartPos(rowNode: any, rowPos: number, cellIndex: number) {
  let pos = rowPos + 1;
  for (let i = 0; i < cellIndex; i += 1) {
    const child = rowNode.child(i);
    pos += child.nodeSize;
  }
  return pos;
}

function safeTextSelectionPosForCell(cellPos: number, cellNode: any) {
  const min = cellPos + 2;
  const max = cellPos + Math.max(2, (cellNode?.nodeSize ?? 2) - 2);
  return Math.min(min, max);
}

function buildCellParagraphContent(value: string) {
  const text = String(value || "").trim();
  if (!text) return [{ type: "paragraph" }];
  return [{ type: "paragraph", content: [{ type: "text", text }] }];
}

function fillTableRow(editor: Editor, tablePos: number, rowIndex: number, values: string[], columnCount: number) {
  const doc = editor.state.doc;
  const tableNode = doc.nodeAt(tablePos);
  if (!tableNode) return false;
  if (rowIndex < 0 || rowIndex >= tableNode.childCount) return false;

  const rowPos = getRowStartPos(tableNode, tablePos, rowIndex);
  const rowNode = tableNode.child(rowIndex);
  if (!rowNode || rowNode.childCount < columnCount) return false;

  // Fill right-to-left so earlier positions don't shift.
  for (let c = columnCount - 1; c >= 0; c -= 1) {
    const latestDoc = editor.state.doc;
    const latestTable = latestDoc.nodeAt(tablePos);
    if (!latestTable) return false;
    if (rowIndex < 0 || rowIndex >= latestTable.childCount) return false;

    const latestRowPos = getRowStartPos(latestTable, tablePos, rowIndex);
    const latestRow = latestTable.child(rowIndex);
    if (!latestRow || latestRow.childCount < columnCount) return false;

    const cellPos = getCellStartPos(latestRow, latestRowPos, c);
    const cellNode = latestRow.child(c);
    const from = cellPos + 1;
    const to = cellPos + cellNode.nodeSize - 1;

    editor.commands.insertContentAt({ from, to }, buildCellParagraphContent(values[c] ?? "") as any);
  }

  return true;
}

function detectHasHeaderRow(tableNode: any): boolean {
  if (!tableNode || tableNode.type?.name !== "table") return false;
  if (tableNode.childCount === 0) return false;
  const firstRow = tableNode.child(0);
  if (!firstRow) return false;

  for (let c = 0; c < firstRow.childCount; c += 1) {
    const cell = firstRow.child(c);
    if (cell?.type?.name === "tableHeader") return true;
  }

  return false;
}

function getMaxTableColumns(tableNode: any): number {
  if (!tableNode || tableNode.type?.name !== "table") return 0;
  let max = 0;
  for (let r = 0; r < tableNode.childCount; r += 1) {
    const row = tableNode.child(r);
    max = Math.max(max, row?.childCount || 0);
  }
  return max;
}

function getRightmostCellLocation(tableNode: any): { rowIndex: number; columnIndex: number } | null {
  if (!tableNode || tableNode.type?.name !== "table" || tableNode.childCount === 0) return null;

  let targetRowIndex = -1;
  let maxColumns = 0;
  for (let r = 0; r < tableNode.childCount; r += 1) {
    const row = tableNode.child(r);
    const cols = row?.childCount || 0;
    if (cols > maxColumns) {
      maxColumns = cols;
      targetRowIndex = r;
    }
  }

  if (targetRowIndex < 0 || maxColumns <= 0) return null;
  return { rowIndex: targetRowIndex, columnIndex: maxColumns - 1 };
}

function fillTableCell(editor: Editor, tablePos: number, rowIndex: number, columnIndex: number, value: string) {
  try {
    const latestDoc = editor.state.doc;
    const latestTable = latestDoc.nodeAt(tablePos);
    if (!latestTable) return false;
    if (rowIndex < 0 || rowIndex >= latestTable.childCount) return false;
    const rowNode = latestTable.child(rowIndex);
    if (!rowNode) return false;
    if (columnIndex < 0 || columnIndex >= rowNode.childCount) return false;

    const rowPos = getRowStartPos(latestTable, tablePos, rowIndex);
    const cellPos = getCellStartPos(rowNode, rowPos, columnIndex);
    const cellNode = rowNode.child(columnIndex);
    const from = cellPos + 1;
    const to = cellPos + cellNode.nodeSize - 1;
    editor.commands.insertContentAt({ from, to }, buildCellParagraphContent(value) as any);
    return true;
  } catch {
    return false;
  }
}

function resolveColumnIndex(columns: string[], ref: any): number | null {
  const n = typeof ref === "number" ? ref : (typeof ref === "string" && ref.trim().match(/^\d+$/) ? Number(ref.trim()) : NaN);
  if (Number.isFinite(n)) {
    if (n >= 0 && n < columns.length) return n;
    if (n >= 1 && n <= columns.length) return n - 1;
  }

  const name = typeof ref === "string" ? ref.trim() : "";
  if (!name) return null;
  const key = normalizeSectionKey(name);
  if (!key) return null;
  for (let i = 0; i < columns.length; i += 1) {
    if (normalizeSectionKey(columns[i]) === key) return i;
  }
  return null;
}

function resolveBodyRowIndex(rowKeys: string[], ref: any): number | null {
  const n = typeof ref === "number" ? ref : (typeof ref === "string" && ref.trim().match(/^\d+$/) ? Number(ref.trim()) : NaN);
  if (Number.isFinite(n)) {
    if (n >= 0 && n < rowKeys.length) return n;
    if (n >= 1 && n <= rowKeys.length) return n - 1;
  }

  const keyRaw = typeof ref === "string" ? ref.trim() : "";
  if (!keyRaw) return null;
  const key = normalizeSectionKey(keyRaw);
  if (!key) return null;
  for (let i = 0; i < rowKeys.length; i += 1) {
    if (normalizeSectionKey(rowKeys[i]) === key) return i;
  }
  return null;
}

function coerceCellValue(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function mapRowObjectToValues(columns: string[], rowObj: any): string[] {
  const out: string[] = [];
  const obj = rowObj && typeof rowObj === "object" && !Array.isArray(rowObj) ? rowObj : {};

  const entries = Object.entries(obj).map(([k, v]) => [normalizeSectionKey(k), v] as const);

  for (let i = 0; i < columns.length; i += 1) {
    const colKey = normalizeSectionKey(columns[i]);
    const match = entries.find(([k]) => k === colKey);
    out.push(coerceCellValue(match ? match[1] : ""));
  }

  return out;
}

export function AiSidebar({ editor, className }: Props) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const promptRef = React.useRef<HTMLTextAreaElement | null>(null);
  const mentionMenuRef = React.useRef<HTMLDivElement | null>(null);

  const [attached, setAttached] = React.useState<AttachedContextSnapshot | null>(null);
  const [autoCandidate, setAutoCandidate] = React.useState<AttachedContextSnapshot | null>(null);
  const [suppressedSignature, setSuppressedSignature] = React.useState<string | null>(null);
  const [manualFiles, setManualFiles] = React.useState<ManualContextFile[]>([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [mentionOpen, setMentionOpen] = React.useState(false);

  const requestAbortRef = React.useRef<AbortController | null>(null);
  const abortReasonRef = React.useRef<"user" | "timeout" | null>(null);
  const timeoutRef = React.useRef<number | null>(null);

  const stop = React.useCallback(() => {
    abortReasonRef.current = "user";
    requestAbortRef.current?.abort();
  }, []);

  React.useEffect(() => {
    return () => {
      abortReasonRef.current = "user";
      requestAbortRef.current?.abort();
    };
  }, []);

  React.useEffect(() => {
    if (!loading) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, stop]);

  React.useEffect(() => {
    if (!mentionOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (mentionMenuRef.current?.contains(target)) return;
      setMentionOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [mentionOpen]);

  const refreshAutoContext = React.useCallback(() => {
    if (!editor) {
      setAutoCandidate(null);
      setAttached(null);
      return;
    }

    const selectionCtx = buildSelectionAttachment(editor);
    const cellsCtx = buildCellsAttachment(editor);
    const tableCtx = buildTableAttachment(editor);
    const docCtx = buildDocumentAttachmentLite(editor);
    const candidate = selectionCtx || cellsCtx || tableCtx || docCtx;

    setAutoCandidate(candidate);

    if (!candidate) {
      setAttached(null);
      return;
    }

    if (candidate.signature === suppressedSignature) {
      setAttached(null);
      return;
    }

    setAttached(candidate);
  }, [editor, suppressedSignature]);

  React.useEffect(() => {
    if (!editor) return;
    refreshAutoContext();
    editor.on("selectionUpdate", refreshAutoContext);
    editor.on("update", refreshAutoContext);
    return () => {
      editor.off("selectionUpdate", refreshAutoContext);
      editor.off("update", refreshAutoContext);
    };
  }, [editor, refreshAutoContext]);

  const canSend = Boolean(prompt.trim());

  React.useEffect(() => {
    if (messages.length === 0 && !loading) return;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [loading, messages.length]);

  const updateAssistantStatus = React.useCallback((messageId: string, status: SuggestionStatus) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      if (!m.meta) return m;
      return { ...m, meta: { ...(m.meta as any), status } as any };
    }));
  }, []);

  const applySelection = React.useCallback((messageId: string, meta: Extract<AssistantMeta, { kind: "selection" }>, text: string) => {
    if (!editor) {
      setError("Editor is not ready.");
      return;
    }
    if (!editor.isEditable) {
      setError("Editor is read-only.");
      return;
    }

    if (meta.validationError) {
      setError(meta.validationError);
      return;
    }

    const normalizedText = preserveSelectionFormattingStyle(meta.sourceText || "", text);
    const inline = assistantTextToInlineContent(normalizedText);
    if (!inline) {
      setError("Nothing to apply.");
      return;
    }

    editor
      .chain()
      .focus()
      .insertContentAt({ from: meta.selectionFrom, to: meta.selectionTo }, inline as any)
      .run();

    updateAssistantStatus(messageId, "applied");
  }, [editor, updateAssistantStatus]);

  const applyPlain = React.useCallback((messageId: string, meta: Extract<AssistantMeta, { kind: "plain" }>, text: string) => {
    if (!editor) {
      setError("Editor is not ready.");
      return;
    }
    if (!editor.isEditable) {
      setError("Editor is read-only.");
      return;
    }

    if (meta.validationError) {
      setError(meta.validationError);
      return;
    }

    const content = assistantTextToTiptapContent(text);
    if (!content) {
      setError("Nothing to apply.");
      return;
    }

    editor
      .chain()
      .focus()
      .insertContentAt(meta.insertPos, content as any)
      .run();

    updateAssistantStatus(messageId, "applied");
  }, [editor, updateAssistantStatus]);

  const applyReplaceDocument = React.useCallback((messageId: string, meta: Extract<AssistantMeta, { kind: "replace_document" }>) => {
    if (!editor) {
      setError("Editor is not ready.");
      return;
    }
    if (!editor.isEditable) {
      setError("Editor is read-only.");
      return;
    }
    if (meta.validationError) {
      setError(meta.validationError);
      return;
    }

    const content = assistantTextToTiptapContent(meta.docText);
    if (!content) {
      setError("Nothing to apply.");
      return;
    }

    editor.commands.setContent({ type: "doc", content } as any);
    editor.commands.focus("start");
    updateAssistantStatus(messageId, "applied");
  }, [editor, updateAssistantStatus]);

  const applyMoveSection = React.useCallback((messageId: string, meta: Extract<AssistantMeta, { kind: "move_section" }>) => {
    if (!editor) {
      setError("Editor is not ready.");
      return;
    }
    if (!editor.isEditable) {
      setError("Editor is read-only.");
      return;
    }

    const { state, view } = editor;
    const docSize = state.doc.content.size;
    const from = Math.max(0, Math.min(docSize, meta.from));
    const to = Math.max(from, Math.min(docSize, meta.to));
    let dest = Math.max(0, Math.min(docSize, meta.dest));

    if (to <= from) {
      setError("Could not apply: invalid section range.");
      return;
    }
    if (dest >= from && dest <= to) {
      setError("Could not apply: destination overlaps moved content.");
      return;
    }

    let tr = state.tr;
    const slice = tr.doc.slice(from, to);
    tr = tr.delete(from, to);
    if (dest > to) dest -= (to - from);
    dest = Math.max(0, Math.min(tr.doc.content.size, dest));
    tr = tr.insert(dest, slice.content);

    view.dispatch(tr.scrollIntoView());
    updateAssistantStatus(messageId, "applied");
  }, [editor, updateAssistantStatus]);

  const applyDivider = React.useCallback((messageId: string, meta: Extract<AssistantMeta, { kind: "divider" }>) => {
    if (!editor) {
      setError("Editor is not ready.");
      return;
    }
    if (!editor.isEditable) {
      setError("Editor is read-only.");
      return;
    }

    editor.chain().focus().insertContentAt(meta.insertPos, { type: "horizontalRule" } as any).run();
    updateAssistantStatus(messageId, "applied");
  }, [editor, updateAssistantStatus]);

  const applyTable = React.useCallback((messageId: string, meta: Extract<AssistantMeta, { kind: "table" }>) => {
    if (!editor) {
      setError("Editor is not ready.");
      return;
    }
    if (!editor.isEditable) {
      setError("Editor is read-only.");
      return;
    }

    if (meta.action === "create_table") {
      if (meta.parseError) {
        setError(meta.parseError);
        return;
      }
      if (!meta.rows || meta.rows.length < 2) {
        setError("No rows to apply.");
        return;
      }

      for (const row of meta.rows) {
        if (!Array.isArray(row) || row.length !== meta.outputColumnCount) {
          setError("AI returned invalid table structure");
          return;
        }
      }

      const makeParagraph = (value: string) => {
        const t = String(value || "").trim();
        return t
          ? { type: "paragraph", content: [{ type: "text", text: t }] }
          : { type: "paragraph" };
      };

      const header = meta.rows[0];
      const body = meta.rows.slice(1);

      const tableNode: any = {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: header.map((v) => ({ type: "tableHeader", content: [makeParagraph(v)] })),
          },
          ...body.map((row) => ({
            type: "tableRow",
            content: row.map((v) => ({ type: "tableCell", content: [makeParagraph(v)] })),
          })),
        ],
      };

      editor.chain().focus().insertContentAt(meta.insertPos, tableNode).run();
      updateAssistantStatus(messageId, "applied");
      return;
    }

    if (meta.parseError) {
      setError(meta.parseError);
      return;
    }
    if (!meta.rows || meta.rows.length === 0) {
      setError("No rows to apply.");
      return;
    }
    for (const row of meta.rows) {
      if (!Array.isArray(row) || row.length !== meta.outputColumnCount) {
        setError("AI returned invalid table structure");
        return;
      }
    }
    if (!isPosInsideTable(editor, meta.insertPos)) {
      setError("Could not apply: table position is no longer valid.");
      return;
    }

    const anchor = resolveTableAnchorFromInsertPos(editor, meta.insertPos);
    if (!anchor) {
      setError("Could not apply: unable to resolve table context.");
      return;
    }

    const tableNode = editor.state.doc.nodeAt(anchor.tablePos);
    if (!tableNode || tableNode.type?.name !== "table") {
      setError("Could not apply: table was not found.");
      return;
    }
    if (tableNode.childCount === 0) {
      setError("Could not apply: table has no rows.");
      return;
    }

    const hasHeaderRow = detectHasHeaderRow(tableNode);
    const bodyStart = hasHeaderRow ? 1 : 0;
    const bodyRowCountCurrent = Math.max(0, tableNode.childCount - bodyStart);

    if (meta.action === "update_rows") {
      if (meta.rows.length !== bodyRowCountCurrent) {
        setError("AI returned invalid table structure");
        return;
      }

      if (meta.expectedFirstColumn && meta.expectedFirstColumn.length === meta.rows.length) {
        for (let i = 0; i < meta.rows.length; i += 1) {
          const expected = String(meta.expectedFirstColumn[i] || "").trim();
          const actual = String(meta.rows[i]?.[0] || "").trim();
          if (expected && actual && expected !== actual) {
            setError("AI returned invalid table structure");
            return;
          }
        }
      }

      for (let i = 0; i < meta.rows.length; i += 1) {
        const rowValues = meta.rows[i];
        if (!rowValues || rowValues.length !== meta.tableColumnCount) {
          setError("AI returned invalid table structure");
          return;
        }
        const filled = fillTableRow(editor, anchor.tablePos, bodyStart + i, rowValues, meta.tableColumnCount);
        if (!filled) {
          setError("Could not apply: failed to update table.");
          return;
        }
      }
    } else if (meta.action === "add_column") {
      if (!meta.newColumnName) {
        setError("Could not apply: missing column name.");
        return;
      }
      if (meta.rows.length !== bodyRowCountCurrent) {
        setError("AI returned invalid table structure");
        return;
      }

      const loc = getRightmostCellLocation(tableNode);
      if (!loc) {
        setError("Could not apply: failed to find table cell.");
        return;
      }

      const rowPos = getRowStartPos(tableNode, anchor.tablePos, loc.rowIndex);
      const rowNode = tableNode.child(loc.rowIndex);
      const cellPos = getCellStartPos(rowNode, rowPos, loc.columnIndex);
      const cellNode = rowNode.child(loc.columnIndex);
      const selectionPos = safeTextSelectionPosForCell(cellPos, cellNode);

      const added = editor.chain().focus().setTextSelection(selectionPos).addColumnAfter().run();
      if (!added) {
        setError("Could not apply: failed to add column.");
        return;
      }

      const newColIndex = loc.columnIndex + 1;

      if (hasHeaderRow) {
        const ok = fillTableCell(editor, anchor.tablePos, 0, newColIndex, meta.newColumnName);
        if (!ok) {
          setError("Could not apply: failed to set column header.");
          return;
        }
      }

      for (let i = 0; i < meta.rows.length; i += 1) {
        const value = String(meta.rows[i]?.[0] ?? "");
        const ok = fillTableCell(editor, anchor.tablePos, bodyStart + i, newColIndex, value);
        if (!ok) {
          setError("Could not apply: failed to fill column values.");
          return;
        }
      }
    } else if (meta.action === "insert_rows") {
      const labels = {
        after: String(meta.insertAfterLabel || "").trim(),
        before: String(meta.insertBeforeLabel || "").trim(),
      };

      const findRowIndexByFirstCell = (label: string) => {
        const target = String(label || "").trim().toLowerCase();
        if (!target) return null;
        for (let r = bodyStart; r < tableNode.childCount; r += 1) {
          const row = tableNode.child(r);
          if (!row || row.childCount === 0) continue;
          const cell = row.child(0);
          const cellText = nodePlainText(cell).toLowerCase();
          if (cellText === target) return r;
        }
        return null;
      };

      let anchorRowIndex: number | null = null;
      let mode: "after" | "before" = "after";

      if (labels.after) {
        const idx = findRowIndexByFirstCell(labels.after);
        if (idx != null) {
          anchorRowIndex = idx;
          mode = "after";
        }
      }
      if (anchorRowIndex == null && labels.before) {
        const idx = findRowIndexByFirstCell(labels.before);
        if (idx != null) {
          anchorRowIndex = idx;
          mode = "before";
        }
      }
      if (anchorRowIndex == null) {
        // Fallback to current row.
        anchorRowIndex = anchor.rowIndex;
        mode = "after";
      }

      const focusSelectionForRow = (rowIndex: number) => {
        const latestTable = editor.state.doc.nodeAt(anchor.tablePos);
        if (!latestTable) return null;
        if (rowIndex < 0 || rowIndex >= latestTable.childCount) return null;
        const rowPos = getRowStartPos(latestTable, anchor.tablePos, rowIndex);
        const rowNode = latestTable.child(rowIndex);
        if (!rowNode || rowNode.childCount === 0) return null;
        const cellPos = getCellStartPos(rowNode, rowPos, 0);
        const cellNode = rowNode.child(0);
        return safeTextSelectionPosForCell(cellPos, cellNode);
      };

      if (mode === "after") {
        let afterRowIndex = anchorRowIndex;
        for (const rowValues of meta.rows) {
          const selPos = focusSelectionForRow(afterRowIndex);
          if (selPos == null) {
            setError("Could not apply: failed to find table cell.");
            return;
          }

          const inserted = editor.chain().focus().setTextSelection(selPos).addRowAfter().run();
          if (!inserted) {
            setError("Could not apply: failed to insert row.");
            return;
          }

          const insertedRowIndex = afterRowIndex + 1;
          const filled = fillTableRow(editor, anchor.tablePos, insertedRowIndex, rowValues, meta.tableColumnCount);
          if (!filled) {
            setError("Could not apply: failed to fill new row.");
            return;
          }

          afterRowIndex = insertedRowIndex;
        }
      } else {
        let beforeRowIndex = anchorRowIndex;
        for (const rowValues of meta.rows) {
          const selPos = focusSelectionForRow(beforeRowIndex);
          if (selPos == null) {
            setError("Could not apply: failed to find table cell.");
            return;
          }

          const inserted = editor.chain().focus().setTextSelection(selPos).addRowBefore().run();
          if (!inserted) {
            setError("Could not apply: failed to insert row.");
            return;
          }

          const filled = fillTableRow(editor, anchor.tablePos, beforeRowIndex, rowValues, meta.tableColumnCount);
          if (!filled) {
            setError("Could not apply: failed to fill new row.");
            return;
          }

          // The original anchor row shifts down.
          beforeRowIndex += 1;
        }
      }
    } else {
      // append_rows
      let afterRowIndex = anchor.rowIndex;

      for (const rowValues of meta.rows) {
        const latestTable = editor.state.doc.nodeAt(anchor.tablePos);
        if (!latestTable || latestTable.type?.name !== "table") {
          setError("Could not apply: table was not found.");
          return;
        }
        if (latestTable.childCount === 0) {
          setError("Could not apply: table has no rows.");
          return;
        }
        if (afterRowIndex >= latestTable.childCount) {
          afterRowIndex = latestTable.childCount - 1;
        }

        const rPos = getRowStartPos(latestTable, anchor.tablePos, afterRowIndex);
        const rNode = latestTable.child(afterRowIndex);
        if (!rNode || rNode.childCount === 0) {
          setError("Could not apply: invalid table row.");
          return;
        }

        const cPos = getCellStartPos(rNode, rPos, 0);
        const cNode = rNode.child(0);
        const selPos = safeTextSelectionPosForCell(cPos, cNode);

        const inserted = editor.chain().focus().setTextSelection(selPos).addRowAfter().run();
        if (!inserted) {
          setError("Could not apply: failed to insert row.");
          return;
        }

        const insertedRowIndex = afterRowIndex + 1;
        const filled = fillTableRow(editor, anchor.tablePos, insertedRowIndex, rowValues, meta.tableColumnCount);
        if (!filled) {
          setError("Could not apply: failed to fill new row.");
          return;
        }

        afterRowIndex = insertedRowIndex;
      }
    }

    updateAssistantStatus(messageId, "applied");
  }, [editor, updateAssistantStatus]);

  const applyTableJson = React.useCallback((messageId: string, meta: Extract<AssistantMeta, { kind: "table_json" }>) => {
    if (!editor) {
      setError("Editor is not ready.");
      return;
    }
    if (!editor.isEditable) {
      setError("Editor is read-only.");
      return;
    }
    if (meta.instructionError) {
      setError(meta.instructionError);
      return;
    }
    if (!meta.instruction) {
      setError("AI returned invalid table instruction");
      return;
    }

    const anchor = resolveTableAnchorFromInsertPos(editor, meta.insertPos);
    if (!anchor) {
      setError("Could not apply: unable to resolve table context.");
      return;
    }

    const tableNode = editor.state.doc.nodeAt(anchor.tablePos);
    if (!tableNode || tableNode.type?.name !== "table") {
      setError("Could not apply: table was not found.");
      return;
    }

    const hasHeaderRow = detectHasHeaderRow(tableNode);
    const bodyStart = hasHeaderRow ? 1 : 0;
    const columnCount = Math.max(getMaxTableColumns(tableNode), 1);

    const columns = hasHeaderRow
      ? Array.from({ length: columnCount }, (_, i) => {
        const headerRow = tableNode.child(0);
        const cell = headerRow?.child(i);
        const txt = cell ? nodePlainText(cell) : "";
        return txt || `Column ${i + 1}`;
      })
      : Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);

    const bodyRows: string[][] = [];
    for (let r = bodyStart; r < tableNode.childCount; r += 1) {
      const row = tableNode.child(r);
      const cells: string[] = [];
      for (let c = 0; c < columnCount; c += 1) {
        const cell = row?.child(c);
        cells.push(cell ? nodePlainText(cell) : "");
      }
      bodyRows.push(cells);
    }
    const rowKeys = bodyRows.map((r) => String(r?.[0] ?? "").trim());

    const setSelectionInCell = (rowIndex: number, colIndex: number) => {
      const latest = editor.state.doc.nodeAt(anchor.tablePos);
      if (!latest) return null;
      if (rowIndex < 0 || rowIndex >= latest.childCount) return null;
      const row = latest.child(rowIndex);
      if (!row) return null;
      if (colIndex < 0 || colIndex >= row.childCount) return null;
      const rowPos = getRowStartPos(latest, anchor.tablePos, rowIndex);
      const cellPos = getCellStartPos(row, rowPos, colIndex);
      const cellNode = row.child(colIndex);
      return safeTextSelectionPosForCell(cellPos, cellNode);
    };

    const action = meta.instruction.action;
    const data = meta.instruction.data || {};

    if (action === "add_column") {
      const columnName = String(data.column_name || "").trim();
      const values = Array.isArray(data.values) ? data.values : null;
      if (!columnName || !values) {
        setError("AI returned invalid table instruction");
        return;
      }

      const bodyRowCount = Math.max(0, tableNode.childCount - bodyStart);
      if (values.length !== bodyRowCount) {
        setError("AI returned invalid table structure");
        return;
      }

      // If column exists, update it instead of adding a duplicate.
      let existingColIndex: number | null = null;
      if (hasHeaderRow) {
        const key = normalizeSectionKey(columnName);
        for (let i = 0; i < columns.length; i += 1) {
          if (normalizeSectionKey(columns[i]) === key) {
            existingColIndex = i;
            break;
          }
        }
      }

      let targetColIndex: number;

      if (existingColIndex != null) {
        targetColIndex = existingColIndex;
      } else {
        const loc = getRightmostCellLocation(tableNode);
        if (!loc) {
          setError("Could not apply: failed to find table cell.");
          return;
        }

        const selectionPos = setSelectionInCell(loc.rowIndex, loc.columnIndex);
        if (selectionPos == null) {
          setError("Could not apply: failed to find table cell.");
          return;
        }

        const added = editor.chain().focus().setTextSelection(selectionPos).addColumnAfter().run();
        if (!added) {
          setError("Could not apply: failed to add column.");
          return;
        }

        targetColIndex = loc.columnIndex + 1;

        if (hasHeaderRow) {
          const ok = fillTableCell(editor, anchor.tablePos, 0, targetColIndex, columnName);
          if (!ok) {
            setError("Could not apply: failed to set column header.");
            return;
          }
        }
      }

      for (let i = 0; i < values.length; i += 1) {
        const rowIndex = bodyStart + i;
        const ok = fillTableCell(editor, anchor.tablePos, rowIndex, targetColIndex, coerceCellValue(values[i]));
        if (!ok) {
          setError("Could not apply: failed to fill column values.");
          return;
        }
      }

      updateAssistantStatus(messageId, "applied");
      return;
    }

    if (action === "add_row") {
      const rowsRaw = Array.isArray(data.rows) ? data.rows : [];
      const rowsPayload = rowsRaw.length > 0 && rowsRaw.every((cell: any) => isPrimitiveCellValue(cell))
        ? [rowsRaw]
        : rowsRaw;
      if (rowsPayload.length === 0) {
        setError("AI returned invalid table instruction");
        return;
      }

      const afterRef = data.after_row;
      const beforeRef = data.before_row;

      let anchorBodyIndex: number | null = null;
      let mode: "after" | "before" = "after";

      if (afterRef != null) {
        const idx = resolveBodyRowIndex(rowKeys, afterRef);
        if (idx != null) {
          anchorBodyIndex = idx;
          mode = "after";
        }
      }
      if (anchorBodyIndex == null && beforeRef != null) {
        const idx = resolveBodyRowIndex(rowKeys, beforeRef);
        if (idx != null) {
          anchorBodyIndex = idx;
          mode = "before";
        }
      }

      if (anchorBodyIndex == null) {
        // Default: append after last body row.
        anchorBodyIndex = Math.max(0, rowKeys.length - 1);
        mode = "after";
      }

      let anchorRowIndex = bodyStart + anchorBodyIndex;

      for (const rowPayload of rowsPayload) {
        const selectionPos = setSelectionInCell(anchorRowIndex, 0);
        if (selectionPos == null) {
          setError("Could not apply: failed to find table cell.");
          return;
        }

        const inserted = mode === "before"
          ? editor.chain().focus().setTextSelection(selectionPos).addRowBefore().run()
          : editor.chain().focus().setTextSelection(selectionPos).addRowAfter().run();

        if (!inserted) {
          setError("Could not apply: failed to insert row.");
          return;
        }

        const insertedRowIndex = mode === "before" ? anchorRowIndex : anchorRowIndex + 1;

        let values: string[];
        if (Array.isArray(rowPayload)) {
          values = Array.from({ length: columnCount }, (_, i) => coerceCellValue(rowPayload[i]));
        } else {
          values = mapRowObjectToValues(columns, rowPayload);
        }

        const filled = fillTableRow(editor, anchor.tablePos, insertedRowIndex, values, columnCount);
        if (!filled) {
          setError("Could not apply: failed to fill new row.");
          return;
        }

        if (mode === "before") {
          // Original anchor row shifts down.
          anchorRowIndex = insertedRowIndex + 1;
        } else {
          anchorRowIndex = insertedRowIndex;
        }
      }

      updateAssistantStatus(messageId, "applied");
      return;
    }

    if (action === "update_cell") {
      const updates = Array.isArray(data.updates) ? data.updates : [data];
      for (const u of updates) {
        if (!u) continue;
        const rowRef = u.row;
        const colRef = u.column;
        const value = u.value;
        const bodyIndex = resolveBodyRowIndex(rowKeys, rowRef);
        const colIndex = resolveColumnIndex(columns, colRef);
        if (bodyIndex == null || colIndex == null) {
          setError("AI returned invalid table instruction");
          return;
        }
        const ok = fillTableCell(editor, anchor.tablePos, bodyStart + bodyIndex, colIndex, coerceCellValue(value));
        if (!ok) {
          setError("Could not apply: failed to update cell.");
          return;
        }
      }

      updateAssistantStatus(messageId, "applied");
      return;
    }

    if (action === "delete_row") {
      const rowsRefs = Array.isArray(data.rows) ? data.rows : [];
      if (rowsRefs.length === 0) {
        setError("AI returned invalid table instruction");
        return;
      }

      // Delete bottom-up by resolved indices to avoid shifting.
      const indices = rowsRefs
        .map((r: any) => resolveBodyRowIndex(rowKeys, r))
        .filter((v: any) => typeof v === "number")
        .sort((a: number, b: number) => b - a);

      for (const bodyIndex of indices) {
        const rowIndex = bodyStart + bodyIndex;
        const selectionPos = setSelectionInCell(rowIndex, 0);
        if (selectionPos == null) {
          setError("Could not apply: failed to find table cell.");
          return;
        }
        const ok = editor.chain().focus().setTextSelection(selectionPos).deleteRow().run();
        if (!ok) {
          setError("Could not apply: failed to delete row.");
          return;
        }
      }

      updateAssistantStatus(messageId, "applied");
      return;
    }

    if (action === "delete_column") {
      const colsRefs = Array.isArray(data.columns) ? data.columns : [];
      if (colsRefs.length === 0) {
        setError("AI returned invalid table instruction");
        return;
      }

      const indices = colsRefs
        .map((c: any) => resolveColumnIndex(columns, c))
        .filter((v: any) => typeof v === "number")
        .sort((a: number, b: number) => b - a);

      for (const colIndex of indices) {
        const rowIndex = hasHeaderRow ? 0 : Math.min(bodyStart, Math.max(0, tableNode.childCount - 1));
        const selectionPos = setSelectionInCell(rowIndex, colIndex);
        if (selectionPos == null) {
          setError("Could not apply: failed to find table cell.");
          return;
        }
        const ok = editor.chain().focus().setTextSelection(selectionPos).deleteColumn().run();
        if (!ok) {
          setError("Could not apply: failed to delete column.");
          return;
        }
      }

      updateAssistantStatus(messageId, "applied");
      return;
    }

    setError("AI returned invalid table instruction");
  }, [editor, updateAssistantStatus]);

  const send = React.useCallback(async () => {
    const userPrompt = prompt.trim();
    if (!userPrompt || loading) return;

    setError(null);
    setMentionOpen(false);

    if (!editor) {
      setError("Editor is not ready.");
      return;
    }

    const liveCandidate =
      buildSelectionAttachment(editor) ||
      buildCellsAttachment(editor) ||
      buildTableAttachment(editor) ||
      buildDocumentAttachmentLite(editor);
    const docIntent =
      isSummarizeDocumentIntent(userPrompt) ||
      isExecutiveSummaryIntent(userPrompt) ||
      isImproveDocumentIntent(userPrompt);
    const docAttachment = docIntent ? buildDocumentAttachmentFull(editor) : null;
    const effectiveAttachment =
      docAttachment ||
      attached ||
      (liveCandidate && liveCandidate.signature !== suppressedSignature ? liveCandidate : null);

    const cursorPos = editor.state.selection.to;
    const relativeInsertion = resolveRelativeInsertionPosition(editor, userPrompt);
    const defaultInsertPos = relativeInsertion?.insertPos ?? cursorPos;
    const insertionDirective = relativeInsertion
      ? `\nInsertion target:\n- ${relativeInsertion.label}\n- Return ONLY the new content to insert at this location.\n- Do NOT repeat existing document sections from context.\n`
      : "";

    // Local structural command: move section.
    const move = parseMoveSectionPrompt(userPrompt);
    if (move) {
      const sourceIdx = getHeadingIndexByQuery(editor, move.source);
      const targetIdx = getHeadingIndexByQuery(editor, move.target);
      if (sourceIdx == null || targetIdx == null) {
        setError("Could not find one of the sections by heading.");
        return;
      }

      const sourceRange = getSectionRangeByHeadingIndex(editor, sourceIdx);
      const targetRange = getSectionRangeByHeadingIndex(editor, targetIdx);
      if (!sourceRange || !targetRange) {
        setError("Could not resolve section ranges.");
        return;
      }

      const dest = move.direction === "above" ? targetRange.start : targetRange.end;
      const userMessage: ChatMessage = {
        id: id(),
        role: "user",
        content: userPrompt,
        createdAt: Date.now(),
        attachment: effectiveAttachment
          ? { kind: effectiveAttachment.kind, label: effectiveAttachment.label }
          : undefined,
      };

      const assistantMessage: ChatMessage = {
        id: id(),
        role: "assistant",
        content: `Move \"${sourceRange.title}\" ${move.direction} \"${targetRange.title}\".`,
        createdAt: Date.now(),
        meta: {
          kind: "move_section",
          status: "pending",
          sourceTitle: sourceRange.title,
          targetTitle: targetRange.title,
          direction: move.direction,
          from: sourceRange.start,
          to: sourceRange.end,
          dest,
        },
      };

      setMessages((prev) => prev.concat(userMessage, assistantMessage));
      setPrompt("");
      return;
    }

    // Local structural command: divider insertion (avoid raw <hr> text).
    if (isDividerIntent(userPrompt)) {
      const target = extractDividerTarget(userPrompt);
      let insertPos = cursorPos;
      let label: string | undefined;

      if (target) {
        const heading = findFirstHeadingContaining(editor, target);
        if (heading) {
          insertPos = heading.pos;
          label = `Before "${heading.text}"`;
        }
      }

      if (!label && (effectiveAttachment?.kind === "table" || effectiveAttachment?.kind === "cells")) {
        const tableAnchor = resolveTableAnchorFromInsertPos(editor, effectiveAttachment.insertPos);
        if (tableAnchor) {
          const nearestHeading = findLastHeadingBefore(editor, tableAnchor.tablePos);
          if (nearestHeading) {
            insertPos = nearestHeading.pos;
            label = `Before "${nearestHeading.text}"`;
          }
        }
      }

      const userMessage: ChatMessage = {
        id: id(),
        role: "user",
        content: userPrompt,
        createdAt: Date.now(),
        attachment: effectiveAttachment
          ? { kind: effectiveAttachment.kind, label: effectiveAttachment.label }
          : undefined,
      };

      const assistantMessage: ChatMessage = {
        id: id(),
        role: "assistant",
        content: label ? `Divider - ${label}` : "Divider",
        createdAt: Date.now(),
        meta: {
          kind: "divider",
          status: "pending",
          insertPos,
          label,
        },
      };

      setMessages((prev) => prev.concat(userMessage, assistantMessage));
      setPrompt("");
      return;
    }

    let request: RequestContext;
    let inferredSectionSelection:
      | { selectionFrom: number; selectionTo: number; text: string }
      | null = null;

    if (!effectiveAttachment || effectiveAttachment.kind === "document") {
      const sectionQuery = parseSectionEditTarget(userPrompt);
      if (sectionQuery) {
        const headingIdx = getHeadingIndexByQuery(editor, sectionQuery);
        const range = headingIdx != null ? getSectionRangeByHeadingIndex(editor, headingIdx) : null;
        if (range) {
          const text = normalizeNewlines(getSelectedText(editor, range.start, range.end)).trim();
          if (text) {
            inferredSectionSelection = {
              selectionFrom: range.start,
              selectionTo: range.end,
              text,
            };
          }
        }
      }
    }

    const inTable = editor.isActive("table");
    const hasCellsAttachment = effectiveAttachment?.kind === "cells";
    const hasTableAttachment = effectiveAttachment?.kind === "table";
    const likelyTableEdit = isLikelyTableEditPrompt(userPrompt);

    // For table edits: ALWAYS use JSON-only mode (no pipe-table fallback).
    const tableJsonIntent = !docIntent && (inTable || hasCellsAttachment || hasTableAttachment || likelyTableEdit);

    if (tableJsonIntent) {
      let tableInfo: TableRuntimeInfo | null = null;
      let selectedCells: TableCellSnapshot[] | undefined;

      if (effectiveAttachment?.kind === "cells") {
        tableInfo = getTableRuntimeInfoByTablePos(editor, effectiveAttachment.tablePos);
        selectedCells = effectiveAttachment.cells;
      }

      if (!tableInfo && editor.isActive("table")) {
        const $from = editor.state.selection.$from;
        for (let d = $from.depth; d > 0; d -= 1) {
          if ($from.node(d)?.type?.name === "table") {
            tableInfo = getTableRuntimeInfoByTablePos(editor, $from.before(d));
            break;
          }
        }
      }

      if (!tableInfo && effectiveAttachment?.kind === "table") {
        const anchor = resolveTableAnchorFromInsertPos(editor, effectiveAttachment.insertPos);
        if (anchor) tableInfo = getTableRuntimeInfoByTablePos(editor, anchor.tablePos);
      }

      if (!tableInfo) {
        tableInfo = findBestTableForPrompt(editor, userPrompt);
      }

      if (!tableInfo) {
        setError("No table found to edit.");
        return;
      }

      const expectedAddRowCount = extractExplicitAddRowCount(userPrompt);

      const tableLabel = effectiveAttachment?.kind === "cells"
        ? effectiveAttachment.label
        : tableInfo.heading
          ? `Table: ${tableInfo.heading}`
          : `Table (${tableInfo.columnCount} cols)`;

      const localInstruction = tryBuildLocalTableJsonInstruction(userPrompt, tableInfo, selectedCells);
      if (localInstruction) {
        const userMessage: ChatMessage = {
          id: id(),
          role: "user",
          content: userPrompt,
          createdAt: Date.now(),
          attachment: { kind: effectiveAttachment?.kind === "cells" ? "cells" : "table", label: tableLabel },
        };

        const desc = describeTableInstruction(localInstruction);
        const assistantMessage: ChatMessage = {
          id: id(),
          role: "assistant",
          content: desc.title,
          createdAt: Date.now(),
          meta: {
            kind: "table_json",
            status: "pending",
            insertPos: tableInfo.insertPos,
            tableLabel,
            instructionRaw: JSON.stringify(localInstruction),
            instruction: localInstruction,
            preview: desc.preview,
          },
        };

        setMessages((prev) => prev.concat(userMessage, assistantMessage));
        setPrompt("");
        return;
      }

      request = {
        kind: "table_json",
        modelPrompt: buildTableJsonUserPrompt(userPrompt, tableInfo, { selectedCells, expectedAddRowCount }),
        insertPos: tableInfo.insertPos,
        tableLabel,
        columns: tableInfo.columns,
        rowKeys: tableInfo.rowKeys,
        bodyRowCount: tableInfo.bodyRows.length,
        expectedAddRowCount,
        selectedCells,
      };
    } else if (effectiveAttachment?.kind === "selection" || inferredSectionSelection) {
      const selected = effectiveAttachment?.kind === "selection"
        ? {
          selectionFrom: effectiveAttachment.selectionFrom,
          selectionTo: effectiveAttachment.selectionTo,
          text: effectiveAttachment.text,
        }
        : inferredSectionSelection;

      if (!selected) {
        setError("Could not resolve section to edit.");
        return;
      }
      request = {
        kind: "selection",
        modelPrompt: `Edit the following text:\n\n${selected.text}\n\nInstruction:\n${userPrompt}\n\nRules:\n- Return the FULL revised text (not a fragment).\n- Keep the existing content and structure unless the instruction explicitly asks to remove/rewrite.\n- Preserve the current formatting style (line breaks, numbering layout, and spacing style) unless explicitly asked to reformat.\n- If adding content, include the original text plus additions.\n- Return plain editor text only (no markdown syntax).\n- Do NOT use markdown markers like #, ##, **, __, \` or code fences.\n- If you add a list, use plain lines with '1. ...' or '- ...'.\n\nReturn only edited text.`,
        selectionFrom: selected.selectionFrom,
        selectionTo: selected.selectionTo,
        selectedText: selected.text,
      };
    } else if (effectiveAttachment?.kind === "document") {
      const docText = docAttachment?.text || buildDocumentAttachmentFull(editor)?.text || "";
      if (docText.trim()) {
        if (isSummarizeDocumentIntent(userPrompt)) {
          request = {
            kind: "plain",
            modelPrompt: `Summarize the following document in at least 5 bullet points.\n\nDocument:\n${docText}\n\nReturn ONLY bullet points. Each bullet must start with "- ".`,
            insertPos: defaultInsertPos,
            applyLabel: "Insert Summary",
          };
        } else if (isExecutiveSummaryIntent(userPrompt)) {
          request = {
            kind: "plain",
            modelPrompt: `Write an executive summary for the following document.\n\nDocument:\n${docText}\n\nReturn ONLY the content in this format:\nExecutive Summary\n- bullet\n- bullet\n- bullet\n\nUse at least 5 bullets.`,
            insertPos: 0,
            applyLabel: "Insert at Top",
          };
        } else if (isImproveDocumentIntent(userPrompt)) {
          request = {
            kind: "plain",
            modelPrompt: `Improve the following document for clarity, structure, and professionalism. Preserve the meaning and existing section order unless explicitly asked. Do NOT add commentary. Return ONLY the improved document text.\n\nDocument:\n${docText}`,
            insertPos: 0,
            replaceDocument: true,
          };
        } else if (isModifyExistingDocumentIntent(userPrompt)) {
          request = {
            kind: "plain",
            modelPrompt: `Edit the following document according to the instruction.\n\nInstruction:\n${userPrompt}\n\nDocument:\n${docText}\n\nRules:\n- Return the FULL revised document.\n- Preserve existing structure, section order, and formatting unless the instruction explicitly asks otherwise.\n- Keep all unchanged content intact.\n- Apply ONLY the requested modifications.\n- For numeric/currency updates, keep values internally consistent (line items, subtotal, tax, total).\n\n${getPlainEditorFormattingRules()}\n\nReturn ONLY the revised document text.`,
            insertPos: 0,
            replaceDocument: true,
          };
        } else {
          request = {
            kind: "plain",
            modelPrompt: `Write content for:\n\n${userPrompt}${insertionDirective}\n\nDocument context:\n${docText}\n\n${getPlainEditorFormattingRules()}\n\nReturn only text.`,
            insertPos: defaultInsertPos,
          };
        }
      } else {
        // Empty document: still allow generation from prompt-only instead of hard failing.
        if (isExecutiveSummaryIntent(userPrompt)) {
          request = {
            kind: "plain",
            modelPrompt: `Draft an executive summary for this request:\n\n${userPrompt}\n\nReturn ONLY the content in this format:\nExecutive Summary\n- bullet\n- bullet\n- bullet\n\nUse at least 5 bullets.`,
            insertPos: 0,
            applyLabel: "Insert at Top",
          };
        } else if (isSummarizeDocumentIntent(userPrompt)) {
          request = {
            kind: "plain",
            modelPrompt: `Create a concise summary for this request in at least 5 bullet points:\n\n${userPrompt}\n\nReturn ONLY bullet points. Each bullet must start with "- ".`,
            insertPos: defaultInsertPos,
            applyLabel: "Insert Summary",
          };
        } else if (isImproveDocumentIntent(userPrompt)) {
          request = {
            kind: "plain",
            modelPrompt: `The current document is empty. Create a polished first draft for:\n\n${userPrompt}\n\n${getPlainEditorFormattingRules()}\n\nReturn ONLY the document text.`,
            insertPos: 0,
          };
        } else {
          request = {
            kind: "plain",
            modelPrompt: `Write content for:\n\n${userPrompt}${insertionDirective}\n\n${getPlainEditorFormattingRules()}\n\nReturn only text.`,
            insertPos: defaultInsertPos,
          };
        }
      }
    } else {
      const docText = buildDocumentAttachmentFull(editor)?.text || "";
      const colMatch = userPrompt.match(/(\d+)\s*[- ]?column\b/i);
      const wantsTable = /\btable\b/i.test(userPrompt) && Boolean(colMatch);
      const columnCount = colMatch ? Number(colMatch[1]) : NaN;

      if (wantsTable && Number.isFinite(columnCount) && columnCount >= 2 && columnCount <= 10) {
        const exampleRow = Array.from({ length: columnCount }, (_, i) => `value${i + 1}`).join(" | ");
        const placeholderHeaders = Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`).join(" | ");

        request = {
          kind: "table",
          modelPrompt: `The table has ${columnCount} columns.\n\nInstruction:\n${userPrompt}\n\nThe FIRST row must be the column headers.\nReturn at least 2 rows total.\nEach row must have EXACTLY ${columnCount} columns separated by |.\nDo NOT return markdown.\n\nReturn ONLY rows in format:\n${exampleRow}`,
          insertPos: defaultInsertPos,
          columnCount,
          tableColumnCount: columnCount,
          headersLine: placeholderHeaders,
          tableAction: "create_table",
          hasHeaderRow: true,
          bodyRowCount: 0,
        };
      } else {
        request = {
          kind: "plain",
          modelPrompt: docText.trim()
            ? `Write content for:\n\n${userPrompt}${insertionDirective}\n\nDocument context:\n${docText}\n\n${getPlainEditorFormattingRules()}\n\nReturn only text.`
            : `Write content for:\n\n${userPrompt}${insertionDirective}\n\n${getPlainEditorFormattingRules()}\n\nReturn only text.`,
          insertPos: defaultInsertPos,
        };
      }
    }

    const orgId = String(getApiContext().orgId || "").trim();
    if (!orgId) {
      setError(
        "No organization selected. Please select an org and try again."
      );
      return;
    }

    if (manualFiles.length > 0 && request.kind !== "table_json") {
      const extraContext = await buildManualContextPromptSection(orgId, manualFiles);
      if (extraContext.trim()) {
        request = {
          ...request,
          modelPrompt: `${request.modelPrompt}\n\n${extraContext}`,
        } as RequestContext;
      }
    }

    const baseAttachment = request.kind === "table_json"
      ? {
        kind: request.selectedCells && request.selectedCells.length > 0 ? "cells" : "table",
        label: request.tableLabel || "Table",
      }
      : effectiveAttachment
        ? { kind: effectiveAttachment.kind, label: effectiveAttachment.label }
        : undefined;

    const manualContextLabel = buildManualContextLabel(manualFiles);
    const userAttachment = (() => {
      if (baseAttachment && manualContextLabel) {
        return {
          kind: baseAttachment.kind,
          label: `${baseAttachment.label} + ${manualContextLabel}`,
        } as ChatMessage["attachment"];
      }
      if (baseAttachment) return baseAttachment as ChatMessage["attachment"];
      if (manualContextLabel) {
        return {
          kind: "files",
          label: manualContextLabel,
        } as ChatMessage["attachment"];
      }
      return undefined;
    })();

    const userMessage: ChatMessage = {
      id: id(),
      role: "user",
      content: userPrompt,
      createdAt: Date.now(),
      attachment: userAttachment,
    };

    setMessages((prev) => prev.concat(userMessage));
    setPrompt("");
    setLoading(true);

    // Abort protection + timeout so the UI never spins forever.
    const controller = new AbortController();
    requestAbortRef.current = controller;
    abortReasonRef.current = null;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      abortReasonRef.current = "timeout";
      controller.abort();
    }, 90000);

    try {
      const postOnce = async (opts: { forceNoJsonMode?: boolean } = {}) => {
        const bodyObj: any = {
          kind: request.kind,
          modelPrompt: request.modelPrompt,
          ...(request.kind === "table" ? { tableColumnCount: request.columnCount } : {}),
          ...(request.kind === "table_json" && opts.forceNoJsonMode ? { forceNoJsonMode: true } : {}),
        };
        try {
          const data = await apiFetch<any>(`/orgs/${orgId}/editor/ai/chat`, {
            method: "POST",
            signal: controller.signal,
            skipCache: true,
            body: bodyObj,
          });
          return {
            ok: true,
            status: 200,
            data,
            text: data ? JSON.stringify(data) : "",
          };
        } catch (error: any) {
          const status = Number(error?.status || 500);
          const data = error?.data || null;
          const text = data ? JSON.stringify(data) : String(error?.message || "");
          return { ok: false, status, data, text };
        }
      };

      const extractAssistantText = (data: any) =>
        String(data?.choices?.[0]?.message?.content ?? "").trim();

      const formatOpenRouterError = (status: number, data: any, text: string) => {
        void data;
        void text;

        if (status === 429) {
          return "Assistant is busy right now. Please try again in a moment.";
        }
        if (status === 408 || status === 504) {
          return "Assistant timed out. Please retry.";
        }
        if (request.kind === "table_json" && status >= 400 && status < 500) {
          return "Assistant could not produce a valid table edit. Please retry.";
        }
        if (status >= 500) {
          return "Assistant is temporarily unavailable. Please retry.";
        }
        return "Assistant request failed. Please retry.";
      };

      let result = await postOnce();
      let retriedNoJsonMode = false;

      // Some OpenRouter providers error on response_format; retry once without it.
      if (!result.ok && request.kind === "table_json" && result.status === 400) {
        result = await postOnce({ forceNoJsonMode: true });
        retriedNoJsonMode = true;
      }

      // Some providers return empty content (often with finish_reason=length).
      // Retry once without strict JSON response mode to recover a usable answer.
      if (result.ok && request.kind === "table_json" && !extractAssistantText(result.data) && !retriedNoJsonMode) {
        result = await postOnce({ forceNoJsonMode: true });
        retriedNoJsonMode = true;
      }

      if (!result.ok) {
        throw new Error(formatOpenRouterError(result.status, result.data, result.text));
      }

      const data = result.data;
      if (!data) {
        throw new Error("Invalid provider response.");
      }

      const assistantText = extractAssistantText(data);
      if (!assistantText) {
        throw new Error("Assistant returned an incomplete response. Please retry.");
      }

      let meta: AssistantMeta;
      let displayText = assistantText;

      if (request.kind === "table_json") {
        const parsed = tryParseJsonObjectFromText(assistantText);
        const validated = parsed.value
          ? validateAndNormalizeTableInstruction(
            parsed.value,
            {
              columns: request.columns,
              rowKeys: request.rowKeys,
              bodyRowCount: request.bodyRowCount,
            },
            { expectedAddRowCount: request.expectedAddRowCount ?? null }
          )
          : { instruction: null, error: parsed.error || "Invalid JSON" };

        let instruction = validated.instruction;
        let instructionError = validated.error
          ? `${validated.error}. JSON required for table edits.`
          : undefined;

        // If the user has selected specific cells and the prompt implies a scoped edit,
        // ensure the model only updates those cells.
        if (!instructionError && instruction && instruction.action === "update_cell" && request.selectedCells && request.selectedCells.length > 0) {
          const mentionsRow = findMentionedLabels(userPrompt, (request.rowKeys || []).filter(Boolean)).length > 0;
          const mentionsCol = findMentionedLabels(userPrompt, (request.columns || []).filter(Boolean)).length > 0;
          const t = String(userPrompt || "").toLowerCase();
          const promptImpliesScope =
            /\b(this|these|selected|highlighted)\b/.test(t) && /\bcell\b|\bcells\b/.test(t);

          if (promptImpliesScope && !mentionsRow && !mentionsCol) {
            const allowed = new Set(
              request.selectedCells
                .filter((c) => typeof c.bodyRowIndex === "number")
                .map((c) => `${c.bodyRowIndex}:${c.columnIndex}`)
            );

            const data = instruction.data || {};
            const updates = Array.isArray(data.updates) ? data.updates : [data];

            for (const u of updates) {
              const bodyIndex = resolveBodyRowIndex(request.rowKeys, u?.row);
              const colIndex = resolveColumnIndex(request.columns, u?.column);
              if (bodyIndex == null || colIndex == null || !allowed.has(`${bodyIndex}:${colIndex}`)) {
                instructionError = "Instruction must only update the selected cell(s).";
                break;
              }
            }
          }
        }

        const desc = instruction ? describeTableInstruction(instruction) : null;

        meta = {
          kind: "table_json",
          status: "pending",
          insertPos: request.insertPos,
          tableLabel: request.tableLabel,
          columns: request.columns,
          rowKeys: request.rowKeys,
          instructionRaw: assistantText,
          instruction: instruction || undefined,
          instructionError,
          preview: desc?.preview,
        };

        displayText = desc?.title || "Invalid table instruction (JSON required)";
      } else if (request.kind === "table") {
        const parsed = parseTableRows(assistantText, request.columnCount);

        let rows = parsed.rows;
        let parseError = parsed.parseError;

        // Normalize common mistakes: header row accidentally included.
        if (!parseError && request.tableAction === "update_rows" && rows.length === request.bodyRowCount + 1) {
          const headerParts = request.headersLine.split("|").map((p) => p.trim()).filter(Boolean);
          if (headerParts.length === request.columnCount) {
            const first = rows[0].map((p) => p.trim());
            const matchesHeader = headerParts.every((h, i) => String(h) === String(first[i] || ""));
            if (matchesHeader) rows = rows.slice(1);
          }
        }
        if (!parseError && request.tableAction === "add_column" && rows.length === request.bodyRowCount + 1) {
          const maybeHeader = String(rows[0]?.[0] || "").trim();
          if (maybeHeader && request.newColumnName && maybeHeader === String(request.newColumnName).trim()) {
            rows = rows.slice(1);
          }
        }

        if (!parseError) {
          if (request.tableAction === "update_rows") {
            if (rows.length !== request.bodyRowCount) {
              parseError = "AI returned invalid table structure";
            } else if (request.expectedFirstColumn && request.expectedFirstColumn.length === rows.length) {
              for (let i = 0; i < rows.length; i += 1) {
                const expected = String(request.expectedFirstColumn[i] || "").trim();
                const actual = String(rows[i]?.[0] || "").trim();
                if (expected && actual && expected !== actual) {
                  parseError = "AI returned invalid table structure";
                  break;
                }
              }
            }
          }

          if (request.tableAction === "add_column") {
            if (rows.length !== request.bodyRowCount) {
              parseError = "AI returned invalid table structure";
            }
          }
        }

        meta = {
          kind: "table",
          status: "pending",
          insertPos: request.insertPos,
          action: request.tableAction,
          tableColumnCount: request.tableColumnCount,
          outputColumnCount: request.columnCount,
          hasHeaderRow: request.hasHeaderRow,
          bodyRowCount: request.bodyRowCount,
          headersLine: request.headersLine,
          rows,
          parseError,
          expectedFirstColumn: request.expectedFirstColumn,
          newColumnName: request.newColumnName,
          insertAfterLabel: request.insertAfterLabel,
          insertBeforeLabel: request.insertBeforeLabel,
        };
      } else if (request.kind === "selection") {
        let validationError = validateFreeformAssistantOutput(assistantText);
        if (!validationError && isAdditiveEditIntent(userPrompt)) {
          const original = normalizeNewlines(request.selectedText || "").trim();
          const revised = normalizeNewlines(assistantText || "").trim();
          const originalLines = original ? original.split("\n").filter((l) => l.trim().length > 0).length : 0;
          const revisedLines = revised ? revised.split("\n").filter((l) => l.trim().length > 0).length : 0;
          const tooShort = revised.length < Math.max(24, Math.floor(original.length * 0.45));
          const tooFewLines = originalLines >= 3 && revisedLines < Math.max(1, Math.floor(originalLines * 0.5));

          if (original.length >= 80 && (tooShort || tooFewLines)) {
            validationError = "Assistant response looks incomplete for an add/expand instruction. Please retry.";
          }
        }
        meta = {
          kind: "selection",
          status: "pending",
          selectionFrom: request.selectionFrom,
          selectionTo: request.selectionTo,
          sourceText: request.selectedText,
          validationError: validationError || undefined,
        };
      } else {
        if (request.replaceDocument) {
          const validationError = validateFreeformAssistantOutput(assistantText);
          meta = {
            kind: "replace_document",
            status: "pending",
            docText: assistantText,
            validationError: validationError || undefined,
          };
        } else {
          // No longer auto-convert pipe tables to table inserts.
          // Only JSON table instructions (table_json) or explicit table creation requests are allowed.
          let validationError = validateFreeformAssistantOutput(assistantText);
          if (!validationError && request.applyLabel === "Insert Summary") {
            validationError = validateBulletList(assistantText, 5);
          }
          if (!validationError && request.applyLabel === "Insert at Top") {
            const lower = normalizeNewlines(assistantText).trim().toLowerCase();
            if (!lower.startsWith("executive summary")) {
              validationError = "Expected an Executive Summary section.";
            } else {
              validationError = validateBulletList(assistantText, 5);
            }
          }

          meta = {
            kind: "plain",
            status: "pending",
            insertPos: request.insertPos,
            validationError: validationError || undefined,
            applyLabel: request.applyLabel,
          };
        }
      }

      const assistantMessage: ChatMessage = {
        id: id(),
        role: "assistant",
        content: displayText,
        createdAt: Date.now(),
        meta,
      };

      setMessages((prev) => prev.concat(assistantMessage));
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setError(abortReasonRef.current === "timeout" ? "Request timed out. Please retry." : "Request cancelled.");
      } else {
        setError(e?.message || "Request failed.");
      }
    } finally {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
      abortReasonRef.current = null;
      setLoading(false);
    }
  }, [attached, editor, loading, manualFiles, prompt, suppressedSignature]);

  return (
    <div className={cn("flex h-full flex-col rounded-xl border border-border/40 bg-background/60", className)}>
      <div className="shrink-0 px-4 py-4 border-b border-border/40 bg-background/80">
        <div className="text-base font-semibold">AI Assistant</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Prototype
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 border-b border-border/40 bg-destructive/5 text-destructive text-xs">
          {error}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-lg border border-border/50 bg-muted/10 p-3 text-xs text-muted-foreground">
              Select text, place your cursor in a table, or ask for new content.
            </div>
          ) : null}

          {messages.map((m, idx) => {
            const isUser = m.role === "user";
            const meta = m.meta;
            const isPending = meta && meta.status === "pending";
            const tablePreview = !isUser && meta?.kind === "table" ? buildTablePreviewFromMeta(meta) : null;
            const tableJsonPreview = !isUser && meta?.kind === "table_json" ? buildTableJsonPreviewFromMeta(meta) : null;
            const relatedUserPrompt = (() => {
              for (let i = idx - 1; i >= 0; i -= 1) {
                const prev = messages[i];
                if (prev?.role === "user") return prev.content;
              }
              return null;
            })();

            return (
              <div key={m.id} className={cn("flex min-w-0", isUser ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "min-w-0 rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
                    isUser
                      ? "max-w-[92%] bg-primary/10 text-foreground border border-border/40"
                      : cn(
                        "bg-background border border-border/60",
                        meta?.kind === "table" || meta?.kind === "table_json" ? "max-w-full" : "max-w-[92%]"
                      )
                  )}
                >
                  {isUser && m.attachment && (
                    <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                      <span className="truncate max-w-[260px]">{m.attachment.label}</span>
                    </div>
                  )}
                  {m.content}

                  {!isUser && meta?.kind === "table" && (
                    <div className="mt-2 rounded-md border border-border/50 bg-muted/10 p-2">
                      <div className="text-[11px] text-muted-foreground mb-1">
                        {meta.action === "update_rows"
                          ? "Preview updates"
                          : meta.action === "add_column"
                            ? `Preview values${meta.newColumnName ? ` (${meta.newColumnName})` : ""}`
                            : meta.action === "create_table"
                              ? "Preview table"
                              : meta.action === "insert_rows"
                                ? "Preview inserted rows"
                                : "Preview rows"}
                      </div>
                      {tablePreview ? (
                        <div className="w-full max-w-full overflow-x-auto rounded-lg border border-border/40 bg-background/50 shadow-inner">
                          <table className="w-max min-w-full table-auto text-[11px] md:text-xs">
                            <thead className="bg-muted/60">
                              <tr>
                                {tablePreview.headers.map((h, i) => (
                                  <th key={`${m.id}-table-h-${i}`} className="border-b border-r border-border/30 px-3 py-1.5 text-left font-semibold last:border-r-0 text-muted-foreground">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tablePreview.rows.map((row, ri) => (
                                <tr key={`${m.id}-table-r-${ri}`} className="align-top hover:bg-muted/20 transition-colors">
                                  {tablePreview.headers.map((_, ci) => (
                                    <td key={`${m.id}-table-c-${ri}-${ci}`} className="border-b border-r border-border/20 px-3 py-1.5 whitespace-normal break-words last:border-r-0">
                                      {coerceCellValue(row?.[ci])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : meta.rows.length > 0 ? (
                        <div className="text-xs whitespace-pre-wrap font-mono">
                          {(meta.rows || []).map((r) => r.join(" | ")).join("\n")}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No valid rows parsed.</div>
                      )}
                      {meta.parseError && (
                        <div className="mt-2 text-[11px] text-destructive">{meta.parseError}</div>
                      )}
                    </div>
                  )}

                  {!isUser && meta?.kind === "table_json" && (
                    <div className="mt-2 rounded-md border border-border/50 bg-muted/10 p-2">
                      <div className="text-[11px] text-muted-foreground mb-1">Table instruction</div>
                      {tableJsonPreview ? (
                        <div className="w-full max-w-full overflow-x-auto rounded-lg border border-border/40 bg-background/50 shadow-inner">
                          <table className="w-max min-w-full table-auto text-[11px] md:text-xs">
                            <thead className="bg-muted/60">
                              <tr>
                                {tableJsonPreview.headers.map((h, i) => (
                                  <th key={`${m.id}-json-h-${i}`} className="border-b border-r border-border/30 px-3 py-1.5 text-left font-semibold last:border-r-0 text-muted-foreground">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tableJsonPreview.rows.map((row, ri) => (
                                <tr key={`${m.id}-json-r-${ri}`} className="align-top hover:bg-muted/20 transition-colors">
                                  {tableJsonPreview.headers.map((_, ci) => (
                                    <td key={`${m.id}-json-c-${ri}-${ci}`} className="border-b border-r border-border/20 px-3 py-1.5 whitespace-normal break-words last:border-r-0">
                                      {coerceCellValue(row?.[ci])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : meta.preview ? (
                        <div className="text-xs text-muted-foreground">{meta.preview}</div>
                      ) : null}
                      {meta.instructionError && (
                        <div className="mt-2 text-[11px] text-destructive">{meta.instructionError}</div>
                      )}
                    </div>
                  )}

                  {!isUser && meta && (meta.kind === "selection" || meta.kind === "plain" || meta.kind === "replace_document") && meta.validationError && (
                    <div className="mt-2 text-[11px] text-destructive">{meta.validationError}</div>
                  )}

                  {!isUser && meta && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {isPending && meta.kind === "table_json" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => applyTableJson(m.id, meta)}
                          disabled={Boolean(meta.instructionError) || !meta.instruction}
                        >
                          Apply Table Edit
                        </Button>
                      )}

                      {isPending && meta.kind === "table_json" && Boolean(meta.instructionError) && relatedUserPrompt && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setPrompt(relatedUserPrompt);
                            window.setTimeout(() => promptRef.current?.focus(), 0);
                          }}
                        >
                          Retry
                        </Button>
                      )}

                      {isPending && meta.kind === "table" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => applyTable(m.id, meta)}
                          disabled={Boolean(meta.parseError) || meta.rows.length === 0}
                        >
                          {meta.action === "update_rows"
                            ? "Apply Updates"
                            : meta.action === "add_column"
                              ? "Add Column"
                              : meta.action === "create_table"
                                ? "Insert Table"
                                : meta.action === "insert_rows"
                                  ? "Insert Rows"
                                  : "Add Rows"}
                        </Button>
                      )}

                      {isPending && meta.kind === "divider" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => applyDivider(m.id, meta)}
                        >
                          Insert Divider
                        </Button>
                      )}

                      {isPending && meta.kind === "table" && Boolean(meta.parseError) && relatedUserPrompt && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setPrompt(relatedUserPrompt);
                            window.setTimeout(() => promptRef.current?.focus(), 0);
                          }}
                        >
                          Retry
                        </Button>
                      )}

                      {isPending && meta.kind === "selection" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => applySelection(m.id, meta, m.content)}
                          disabled={Boolean(meta.validationError)}
                        >
                          Replace Selection
                        </Button>
                      )}

                      {isPending && meta.kind === "selection" && Boolean(meta.validationError) && relatedUserPrompt && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setPrompt(relatedUserPrompt);
                            window.setTimeout(() => promptRef.current?.focus(), 0);
                          }}
                        >
                          Retry
                        </Button>
                      )}

                      {isPending && meta.kind === "plain" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => applyPlain(m.id, meta, m.content)}
                          disabled={Boolean(meta.validationError)}
                        >
                          {meta.applyLabel || "Insert Below"}
                        </Button>
                      )}

                      {isPending && meta.kind === "replace_document" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => applyReplaceDocument(m.id, meta)}
                          disabled={Boolean(meta.validationError)}
                        >
                          Replace Document
                        </Button>
                      )}

                      {isPending && meta.kind === "replace_document" && Boolean(meta.validationError) && relatedUserPrompt && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setPrompt(relatedUserPrompt);
                            window.setTimeout(() => promptRef.current?.focus(), 0);
                          }}
                        >
                          Retry
                        </Button>
                      )}

                      {isPending && meta.kind === "move_section" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => applyMoveSection(m.id, meta)}
                        >
                          Move Section
                        </Button>
                      )}

                      {isPending && meta.kind === "plain" && Boolean(meta.validationError) && relatedUserPrompt && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setPrompt(relatedUserPrompt);
                            window.setTimeout(() => promptRef.current?.focus(), 0);
                          }}
                        >
                          Retry
                        </Button>
                      )}

                      {isPending && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => updateAssistantStatus(m.id, "cancelled")}
                        >
                          Cancel
                        </Button>
                      )}

                      {meta.status === "applied" && (
                        <div className="text-[11px] text-muted-foreground">Applied</div>
                      )}
                      {meta.status === "cancelled" && (
                        <div className="text-[11px] text-muted-foreground">Cancelled</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[92%] rounded-2xl px-3 py-2 text-sm bg-background border border-border/60 inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking...
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={stop}
                >
                  Stop
                </Button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border/40 p-3 bg-background/80">
        {(attached || manualFiles.length > 0) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {attached && (
              <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-2.5 py-1 text-xs">
                <span className="text-muted-foreground">Attached</span>
                <span className="max-w-[240px] truncate">{attached.label}</span>
                <button
                  type="button"
                  className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted"
                  aria-label="Remove attachment"
                  onClick={() => {
                    setSuppressedSignature(attached.signature);
                    setAttached(null);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {manualFiles.map((file) => (
              <div key={file.id} className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-2.5 py-1 text-xs">
                <span className="text-muted-foreground">File</span>
                <span className="max-w-[220px] truncate" title={`${file.filename} - ${formatFolderPath(file.folderPath)}`}>
                  {file.filename}
                </span>
                <button
                  type="button"
                  className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted"
                  aria-label={`Remove file ${file.filename}`}
                  onClick={() => {
                    setManualFiles((prev) => prev.filter((f) => f.id !== file.id));
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2">
          {mentionOpen && (
            <div
              ref={mentionMenuRef}
              className="absolute bottom-[calc(100%+8px)] left-0 z-20 min-w-[220px] rounded-lg border border-border/60 bg-background shadow-lg p-1.5"
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/70"
                onClick={() => {
                  setMentionOpen(false);
                  setPickerOpen(true);
                }}
              >
                <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Add file context</span>
              </button>
            </div>
          )}

          <div className="relative flex-1">
            <Textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask the assistant... (type @ to attach files)"
              className="min-h-[44px] max-h-40 resize-none pr-10"
              onKeyDown={(e) => {
                if (e.key === "@" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  e.preventDefault();
                  setMentionOpen(true);
                  return;
                }
                if (e.key !== "Enter") return;
                if (e.nativeEvent.isComposing) return;
                if (e.shiftKey) return;
                e.preventDefault();
                void send();
              }}
              disabled={loading}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1.5 h-7 w-7 rounded-md text-muted-foreground"
              aria-label="Attach files"
              title="Attach files (@)"
              onClick={() => {
                setMentionOpen(false);
                setPickerOpen(true);
              }}
              disabled={loading}
            >
              <AtSign className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            className="h-10 px-3"
            onClick={() => {
              if (loading) stop();
              else void send();
            }}
            disabled={!loading && !canSend}
          >
            {loading ? "Stop" : "Send"}
          </Button>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Enter to send - Shift+Enter for newline - Esc to stop - @ to attach files
        </div>

        <FinderPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          mode="doc"
          maxDocs={8}
          docSource="editor"
          initialSelectedDocIds={manualFiles.map((file) => file.id)}
          onConfirm={({ docs }) => {
            const next = Array.isArray(docs)
              ? docs
                  .filter((doc): doc is StoredDocument => Boolean(doc?.id))
                  .map((doc) => normalizePickedDoc(doc))
              : [];
            setManualFiles(next);
          }}
        />
      </div>
    </div>
  );
}
