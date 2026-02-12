'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useAuth } from '@/hooks/use-auth';
import { AccessDenied } from '@/components/access-denied';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
// import removed old PromptInput UI
import { Loader } from '@/components/ai-elements/loader';
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from '@/components/ai-elements/task';
import { Shimmer } from '@/components/ai-elements/shimmer';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselItem,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselPrev,
  InlineCitationCarouselNext,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation';
import { apiFetch, getApiContext, ssePost } from '@/lib/api';
import MermaidDiagram from '@/components/ai-elements/mermaid-diagram';
import { DocumentResultsTable } from '@/components/ai-elements/document-results-table';
import { ResultsSidebar } from '@/components/ai-elements/results-sidebar';
import { useSettings } from '@/hooks/use-settings';
import { Bot, FileText, ChevronDown, Sparkles, Globe, FileSpreadsheet, FileArchive, FileImage, FileVideo, FileAudio, FileCode, File as FileGeneric, Eye, Layers, Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ChatContext } from '@/components/chat-context-selector';
import { createFolderChatEndpoint } from '@/lib/folder-utils';
import BrieflyChatBox from '@/components/ai-elements/briefly-chat-box';
import { FinderPicker } from '@/components/pickers/finder-picker';
import { useDocuments } from '@/hooks/use-documents';
import { ActionCenter, type CitationMeta, type ActionCenterTab } from '@/components/action-center';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

// Helper functions to improve citation display
function getHostname(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function getCitationDisplayTitle(citation: any): string {
  const rawTitle = citation?.title || citation?.name || citation?.docName;
  if (rawTitle) {
    const cleaned = rawTitle.includes(': ') ? rawTitle.split(': ').slice(1).join(': ') : rawTitle;
    if (cleaned.trim().length > 0 && cleaned !== `Document ${citation?.docId?.slice(0, 8)}...`) {
      return cleaned;
    }
  }

  const hostname = getHostname(citation?.url);
  if (hostname) {
    return hostname;
  }

  const fields = citation?.fields || {};
  const titleField = fields.title || fields.subject || fields.name;
  if (titleField) return titleField;

  return 'Referenced Document';
}

function getCitationDisplayDescription(citation: any): string {
  const snippet = citation?.snippet || citation?.description || citation?.summary;
  if (snippet && !/^referenced in/i.test(snippet)) {
    return snippet.length > 160 ? `${snippet.slice(0, 157)}...` : snippet;
  }

  if (citation?.url) {
    return citation.url;
  }

  const fields = citation?.fields || {};
  const usefulFields = ['description', 'excerpt', 'sender', 'receiver', 'date', 'category'];
  const parts: string[] = [];
  usefulFields.forEach(field => {
    if (fields[field]) {
      parts.push(`${field}: ${fields[field]}`);
    }
  });

  return parts.slice(0, 2).join(' • ') || 'Click to view document details';
}

function getCitationFileExtension(citation: any): string | undefined {
  const filename = citation?.filename || citation?.name || citation?.title || '';
  const url: string | undefined = citation?.url;
  const fromFilename = typeof filename === 'string' && filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : undefined;
  if (fromFilename) return fromFilename;
  if (typeof url === 'string') {
    try {
      const u = new URL(url);
      const last = u.pathname.split('/').pop() || '';
      if (last.includes('.')) {
        return last.split('.').pop()?.toLowerCase();
      }
    } catch {
      // ignore
    }
  }
  const mime = citation?.mimeType || citation?.contentType;
  if (typeof mime === 'string' && mime.includes('/')) {
    const subtype = mime.split('/')[1];
    if (subtype) return subtype.toLowerCase();
  }
  return undefined;
}

function getCitationIcon(citation: any, className?: string) {
  const isWeb = citation?.sourceType === 'web' || (!citation?.docId && !!citation?.url);
  if (isWeb) return <Globe className={className} />;

  const ext = getCitationFileExtension(citation);
  switch (ext) {
    case 'pdf':
      return <FileText className={className} />;
    case 'xlsx':
    case 'xls':
    case 'csv':
      return <FileSpreadsheet className={className} />;
    case 'zip':
    case 'rar':
    case '7z':
      return <FileArchive className={className} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return <FileImage className={className} />;
    case 'mp4':
    case 'mov':
    case 'webm':
      return <FileVideo className={className} />;
    case 'mp3':
    case 'wav':
      return <FileAudio className={className} />;
    case 'docx':
    case 'doc':
    case 'md':
    case 'txt':
      return <FileText className={className} />;
    case 'json':
    case 'ts':
    case 'tsx':
    case 'js':
    case 'py':
      return <FileCode className={className} />;
    default:
      return <FileGeneric className={className} />;
  }
}

function getDocPrimaryName(doc?: DocLike | null): string {
  const filename = String(doc?.filename || '').trim();
  if (filename) return filename;
  const name = String(doc?.name || '').trim();
  if (name) return name;
  const title = String(doc?.title || '').trim();
  if (title) return title;
  return 'Untitled';
}

function getDocSecondaryTitle(doc?: DocLike | null): string {
  const title = String(doc?.title || '').trim();
  if (!title) return '';
  const primary = getDocPrimaryName(doc);
  return title.toLowerCase() === primary.toLowerCase() ? '' : title;
}

function getDocFolderPath(doc?: DocLike | null): string[] {
  const raw = (doc?.folderPath || doc?.folder_path || []) as string[];
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}

function formatDocPathLabel(path?: string[] | null): string {
  const cleaned = Array.isArray(path) ? path.filter(Boolean) : [];
  return cleaned.length > 0 ? `/${cleaned.join('/')}` : '/Root';
}

function dedupeCitations(citations: CitationMeta[] = []): CitationMeta[] {
  const seenIndex = new Map<string, number>();
  const result: CitationMeta[] = [];

  for (const citation of citations) {
    if (!citation) continue;
    const chunkKey = citation.chunkId || citation.fields?.chunk_id || citation.fields?.chunkId;
    const pageKey = citation.page ?? citation.fields?.page_number ?? citation.fields?.page;
    const key = citation.docId
      ? `doc:${citation.docId}:${chunkKey || ''}:${pageKey || ''}`
      : citation.url
        ? `url:${citation.url}`
        : `text:${citation.docName || citation.title || citation.snippet || JSON.stringify(citation)}`;

    const existingIdx = seenIndex.get(key);
    if (existingIdx === undefined) {
      seenIndex.set(key, result.length);
      result.push(citation);
      continue;
    }

    const current = result[existingIdx];
    const merged: CitationMeta = { ...current };

    if ((!merged.snippet || String(merged.snippet).length < String(citation.snippet || '').length) && citation.snippet) {
      merged.snippet = citation.snippet;
    }
    if (!merged.page && citation.page) merged.page = citation.page;
    if (!merged.chunkId && citation.chunkId) merged.chunkId = citation.chunkId;
    if (!merged.bbox && citation.bbox) merged.bbox = citation.bbox;
    if (!merged.docName && citation.docName) merged.docName = citation.docName;

    const currentEvidence = Array.isArray((merged as any).evidenceIds) ? (merged as any).evidenceIds : [];
    const nextEvidence = Array.isArray((citation as any).evidenceIds) ? (citation as any).evidenceIds : [];
    const mergedEvidence = Array.from(new Set([...currentEvidence, ...nextEvidence].filter(Boolean)));
    if (mergedEvidence.length > 0) {
      (merged as any).evidenceIds = mergedEvidence;
      (merged as any).primaryEvidenceId = (merged as any).primaryEvidenceId || mergedEvidence[0];
    }

    const statusRank: Record<string, number> = { resolved: 1, partial: 2, unresolved: 3 };
    const currentStatus = String((merged as any).anchorStatus || '').toLowerCase();
    const nextStatus = String((citation as any).anchorStatus || '').toLowerCase();
    if ((statusRank[nextStatus] || 0) > (statusRank[currentStatus] || 0)) {
      (merged as any).anchorStatus = nextStatus;
    }
    const currentAnchors = Array.isArray((merged as any).anchorIds) ? (merged as any).anchorIds : [];
    const nextAnchors = Array.isArray((citation as any).anchorIds) ? (citation as any).anchorIds : [];
    const mergedAnchors = Array.from(new Set([...currentAnchors, ...nextAnchors].filter(Boolean)));
    if (mergedAnchors.length > 0) {
      (merged as any).anchorIds = mergedAnchors;
    }

    result[existingIdx] = merged;
  }

  return result;
}

type ProcessingStep = {
  step?: string;
  title?: string;
  status?: string;
  description?: string;
  task?: string;
  category?: string;
  startedAtMs?: number;
  endedAtMs?: number;
  updatedAtMs?: number;
};

type ToolUsage = {
  toolId?: string;
  name?: string;
  status?: string;
  description?: string;
  startedAtMs?: number;
  endedAtMs?: number;
  updatedAtMs?: number;
};

type CitationAnchor = {
  anchorId?: string;
  startChar?: number;
  endChar?: number;
  citationIds?: string[];
  evidenceIds?: string[];
  status?: 'resolved' | 'partial' | 'unresolved' | string;
  synthetic?: boolean;
};

type EvidenceSpan = {
  evidenceId?: string;
  docId?: string | null;
  chunkId?: string | null;
  page?: number | null;
  snippet?: string;
  charStart?: number | null;
  charEnd?: number | null;
  bbox?: { l: number; t: number; r: number; b: number; coord_origin?: string } | null;
  bboxArray?: number[] | null;
  bboxOrigin?: string | null;
  pageWidth?: number | null;
  pageHeight?: number | null;
  relevance?: number;
  toolName?: string;
};

type CitationMetrics = {
  anchor_count?: number;
  resolved_anchor_count?: number;
  partial_anchor_count?: number;
  unresolved_anchor_count?: number;
  anchor_resolution_rate?: number;
  citation_count?: number;
  evidence_count?: number;
  inline_marker_count?: number;
  has_inline_markers?: boolean;
  page_or_bbox_coverage?: number;
  highlightable_coverage?: number;
};

type UsageInfo = {
  tokensIn?: number;
  tokensOut?: number;
  tokensTotal?: number;
  model?: string;
  duration?: number;  // Run duration in seconds
  timeToFirstToken?: number;  // TTFT latency in seconds
  cacheReadTokens?: number;  // Tokens read from cache
  cacheWriteTokens?: number;  // Tokens written to cache
  reasoningTokens?: number;  // Reasoning tokens (o1 models)
  source?: string;  // Where metrics came from (event, session_metrics, aggregatedFromMembers)
};

type ActivityStatus = 'in_progress' | 'completed' | 'error';

const ACTIVITY_LABELS: Record<string, string> = {
  understand: 'Understanding request',
  delegate: 'Planning retrieval',
  delegate_task: 'Planning retrieval',
  execute_yql: 'Searching records',
  search_content: 'Searching document text',
  search_document_content: 'Searching selected files',
  get_full_document_content: 'Reading full document',
  get_document: 'Loading document details',
  get_page_content: 'Loading relevant pages',
  get_schema: 'Checking available fields',
  lookup_relationships: 'Finding related records',
  aggregate: 'Computing totals',
  get_available_doc_types: 'Checking available document types',
};

const STAGE_LABELS: Record<string, string> = {
  understand: 'Understanding request',
  plan: 'Planning retrieval',
  schema: 'Checking available fields',
  search: 'Searching records',
  read: 'Reading matched documents',
  relate: 'Finding related records',
  aggregate: 'Computing totals',
  respond: 'Preparing response',
};

const STAGE_ORDER = ['understand', 'plan', 'schema', 'search', 'read', 'relate', 'aggregate', 'respond'];

function normalizeActivityStatus(status?: string): ActivityStatus {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'completed' || value === 'done' || value === 'success') return 'completed';
  if (value === 'error' || value === 'failed' || value === 'failure') return 'error';
  return 'in_progress';
}

function stripLeadingDecorations(value?: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/^[^A-Za-z0-9]+/, '').trim();
}

function canonicalActivityKey(value?: string): string {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  const normalized = text
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized || normalized === 'processing') return '';
  if (normalized === 'delegate_task') return 'delegate';
  return normalized;
}

function resolveActivityLabel(key?: string, fallbackText?: string, fallbackLabel = 'Working'): string {
  const canonical = canonicalActivityKey(key);
  if (canonical && ACTIVITY_LABELS[canonical]) {
    return ACTIVITY_LABELS[canonical];
  }
  const cleaned = stripLeadingDecorations(fallbackText);
  return normalizeActivityLabel(cleaned || fallbackLabel, fallbackLabel);
}

function normalizeActivityLabel(value?: string, fallback = 'Working'): string {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function looksLikeNarrativeSentence(value?: string): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 8 || /[.!?]/.test(text);
}

function shouldKeepStep(step: ProcessingStep): boolean {
  const label = String(step.title || step.description || '').trim().toLowerCase();
  if (!label) return false;
  if (label === 'processing' || label === 'processing...' || label === 'working...' || label === 'working') {
    return false;
  }
  return true;
}

function shouldKeepTool(tool: ToolUsage): boolean {
  const toolKey = canonicalActivityKey(tool.toolId || tool.name);
  const name = normalizeActivityLabel(tool.name, '');
  const desc = normalizeActivityLabel(tool.description, '');
  if (!name && !desc) return false;
  if (toolKey === 'tool_call') return false;
  if (name === 'tool_call' && (!desc || looksLikeNarrativeSentence(desc))) return false;
  if (name === 'tool' && !desc) return false;
  if (name && looksLikeNarrativeSentence(name) && (!desc || desc === name)) return false;
  return true;
}

function dedupeSteps(steps: ProcessingStep[] = []): ProcessingStep[] {
  const orderedKeys: string[] = [];
  const byKey = new Map<string, ProcessingStep>();

  steps.forEach((step, idx) => {
    if (!step) return;
    const rawKey = String(step.step || step.title || step.description || `step-${idx}`);
    const canonicalKey = canonicalActivityKey(rawKey);
    const key = String(canonicalKey || rawKey).toLowerCase();
    const prev = byKey.get(key);
    const status = normalizeActivityStatus(step.status || prev?.status);
    const updatedAtMs = step.updatedAtMs ?? prev?.updatedAtMs;
    const startedAtMs = prev?.startedAtMs ?? step.startedAtMs ?? updatedAtMs;
    let endedAtMs = prev?.endedAtMs ?? step.endedAtMs;
    if (status === 'completed' || status === 'error') {
      endedAtMs = step.endedAtMs ?? updatedAtMs ?? endedAtMs;
    } else {
      endedAtMs = undefined;
    }

    if (!prev) orderedKeys.push(key);
    const merged: ProcessingStep = {
      ...(prev || {}),
      ...step,
      step: canonicalKey || step.step || rawKey,
      title: resolveActivityLabel(canonicalKey || step.step, step.title || step.description || step.step, 'Working'),
      description: resolveActivityLabel(canonicalKey || step.step, step.description || step.title || step.step, 'Working'),
      status,
      startedAtMs,
      endedAtMs,
      updatedAtMs,
    };
    if (shouldKeepStep(merged)) {
      byKey.set(key, merged);
    }
  });

  return orderedKeys
    .map((key) => byKey.get(key))
    .filter((step): step is ProcessingStep => Boolean(step));
}

function dedupeTools(tools: ToolUsage[] = []): ToolUsage[] {
  const orderedKeys: string[] = [];
  const byKey = new Map<string, ToolUsage>();

  tools.forEach((tool, idx) => {
    if (!tool) return;
    const rawKey = String(tool.toolId || tool.name || tool.description || `tool-${idx}`);
    const canonicalKey = canonicalActivityKey(rawKey);
    const key = String(canonicalKey || rawKey).toLowerCase();
    const prev = byKey.get(key);
    const status = normalizeActivityStatus(tool.status || prev?.status);
    const updatedAtMs = tool.updatedAtMs ?? prev?.updatedAtMs;
    const startedAtMs = prev?.startedAtMs ?? tool.startedAtMs ?? updatedAtMs;
    let endedAtMs = prev?.endedAtMs ?? tool.endedAtMs;
    if (status === 'completed' || status === 'error') {
      endedAtMs = tool.endedAtMs ?? updatedAtMs ?? endedAtMs;
    } else {
      endedAtMs = undefined;
    }

    if (!prev) orderedKeys.push(key);
    const merged: ToolUsage = {
      ...(prev || {}),
      ...tool,
      toolId: canonicalKey || prev?.toolId || undefined,
      name: resolveActivityLabel(canonicalKey || tool.toolId || tool.name, tool.name || tool.description, tool.name ? 'Tool call' : ''),
      description: normalizeActivityLabel(stripLeadingDecorations(tool.description), ''),
      status,
      startedAtMs,
      endedAtMs,
      updatedAtMs,
    };
    if (shouldKeepTool(merged)) {
      byKey.set(key, merged);
    }
  });

  return orderedKeys
    .map((key) => byKey.get(key))
    .filter((tool): tool is ToolUsage => Boolean(tool));
}

function settleActivityOnComplete<T extends ProcessingStep | ToolUsage>(items: T[], completedAtMs: number): T[] {
  return items.map((item) => {
    const status = normalizeActivityStatus(item.status);
    if (status === 'in_progress') {
      return {
        ...item,
        status: 'completed',
        endedAtMs: item.endedAtMs ?? completedAtMs,
        updatedAtMs: completedAtMs,
      };
    }
    return item;
  });
}

function formatDurationMs(startedAtMs?: number, endedAtMs?: number): string | null {
  if (!startedAtMs || !endedAtMs || endedAtMs <= startedAtMs) return null;
  const durationMs = endedAtMs - startedAtMs;
  if (durationMs < 1000) return '<1s';
  if (durationMs < 10_000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${Math.round(durationMs / 1000)}s`;
}

function mergeActivityStatus(current: ActivityStatus, next: ActivityStatus): ActivityStatus {
  if (current === 'error' || next === 'error') return 'error';
  if (current === 'in_progress' || next === 'in_progress') return 'in_progress';
  return 'completed';
}

function minTimestamp(...values: Array<number | undefined>): number | undefined {
  const nums = values.filter((v): v is number => Number.isFinite(v));
  if (nums.length === 0) return undefined;
  return Math.min(...nums);
}

function maxTimestamp(...values: Array<number | undefined>): number | undefined {
  const nums = values.filter((v): v is number => Number.isFinite(v));
  if (nums.length === 0) return undefined;
  return Math.max(...nums);
}

function mapStageIdFromKey(key: string): string | null {
  switch (key) {
    case 'understand':
    case 'understanding_request':
      return 'understand';
    case 'delegate':
    case 'planning_retrieval':
      return 'plan';
    case 'get_schema':
    case 'get_available_doc_types':
    case 'checking_available_fields':
      return 'schema';
    case 'execute_yql':
    case 'search_content':
    case 'search_document_content':
    case 'searching_records':
    case 'searching_document_text':
    case 'searching_selected_files':
      return 'search';
    case 'get_document':
    case 'get_page_content':
    case 'get_full_document_content':
    case 'loading_document_details':
    case 'loading_relevant_pages':
    case 'reading_full_document':
    case 'reading_matched_documents':
      return 'read';
    case 'lookup_relationships':
    case 'finding_related_records':
      return 'relate';
    case 'aggregate':
    case 'computing_totals':
      return 'aggregate';
    case 'respond':
    case 'preparing_response':
      return 'respond';
    default:
      if (key.startsWith('search_')) return 'search';
      if (key.startsWith('get_')) return 'read';
      return null;
  }
}

function buildStageTimeline(
  steps: ProcessingStep[],
  tools: ToolUsage[],
  message: Message
): ProcessingStep[] {
  const byStage = new Map<string, ProcessingStep>();
  const seenOrder: string[] = [];

  const upsert = (
    stageId: string,
    status: ActivityStatus,
    startedAtMs?: number,
    endedAtMs?: number,
    updatedAtMs?: number
  ) => {
    if (!byStage.has(stageId)) {
      seenOrder.push(stageId);
    }
    const prev = byStage.get(stageId);
    byStage.set(stageId, {
      step: stageId,
      title: STAGE_LABELS[stageId] || resolveActivityLabel(stageId, stageId, 'Working'),
      description: STAGE_LABELS[stageId] || resolveActivityLabel(stageId, stageId, 'Working'),
      status: prev ? mergeActivityStatus(normalizeActivityStatus(prev.status), status) : status,
      startedAtMs: minTimestamp(prev?.startedAtMs, startedAtMs),
      endedAtMs: maxTimestamp(prev?.endedAtMs, endedAtMs),
      updatedAtMs: maxTimestamp(prev?.updatedAtMs, updatedAtMs),
    });
  };

  steps.forEach((step) => {
    const key = canonicalActivityKey(step.step || step.title || step.description);
    if (!key) return;
    const stageId = mapStageIdFromKey(key);
    if (!stageId) return;
    upsert(
      stageId,
      normalizeActivityStatus(step.status),
      step.startedAtMs,
      step.endedAtMs,
      step.updatedAtMs
    );
  });

  tools.forEach((tool) => {
    const key = canonicalActivityKey(tool.toolId || tool.name || tool.description);
    if (!key) return;
    const stageId = mapStageIdFromKey(key);
    if (!stageId) return;
    upsert(
      stageId,
      normalizeActivityStatus(tool.status),
      tool.startedAtMs,
      tool.endedAtMs,
      tool.updatedAtMs
    );
  });

  const hasActivityEvidence = steps.length > 0
    || tools.length > 0
    || Boolean(message.streamRunId || message.streamStartedAtMs || message.streamLastEventSeq);

  if (hasActivityEvidence && String(message.content || '').trim()) {
    upsert(
      'respond',
      message.isStreaming ? 'in_progress' : 'completed',
      message.streamStartedAtMs,
      message.isStreaming ? undefined : message.streamLastEventTs,
      message.streamLastEventTs
    );
  }

  const orderedStageIds = [
    ...STAGE_ORDER.filter((id) => byStage.has(id)),
    ...seenOrder.filter((id) => !STAGE_ORDER.includes(id)),
  ];

  const staged = orderedStageIds
    .map((id) => byStage.get(id))
    .filter((step): step is ProcessingStep => Boolean(step));

  if (staged.length > 0) return staged.slice(0, 6);
  return steps.slice(0, 6);
}

function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '<1s';
  if (seconds < 1) return '<1s';
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

function getMessageDurationSeconds(message: Message): number | null {
  const usageDuration = Number(message.usage?.duration);
  if (Number.isFinite(usageDuration) && usageDuration > 0) {
    return usageDuration;
  }
  const start = Number(message.streamStartedAtMs);
  const end = Number(message.streamLastEventTs);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return (end - start) / 1000;
  }
  return null;
}

function pluralizeDocType(docType: string, count: number): string {
  const base = String(docType || 'record').trim().toLowerCase() || 'record';
  if (count === 1) return base;
  if (base.endsWith('s')) return base;
  return `${base}s`;
}

function derivePrimaryStatus(
  message: Message,
  stageSteps: ProcessingStep[]
): { label: string | null; state: ActivityStatus } {
  if (stageSteps.some((step) => normalizeActivityStatus(step.status) === 'error')) {
    return { label: 'Completed with issues', state: 'error' };
  }

  const active = stageSteps.find((step) => normalizeActivityStatus(step.status) === 'in_progress');
  if (active) {
    return {
      label: active.title || active.description || 'Working on your answer',
      state: 'in_progress',
    };
  }

  if (message.isStreaming) {
    return { label: 'Working on your answer', state: 'in_progress' };
  }

  const totalCount = Number(message.metadata?.total_count);
  if (message.metadata?.list_mode && Number.isFinite(totalCount) && totalCount >= 0) {
    const noun = pluralizeDocType(String(message.metadata?.doc_type || 'record'), totalCount);
    return { label: `Found ${totalCount} ${noun}`, state: 'completed' };
  }

  const durationSeconds = getMessageDurationSeconds(message);
  if (durationSeconds !== null) {
    return { label: `Completed in ${formatDurationSeconds(durationSeconds)}`, state: 'completed' };
  }

  if (stageSteps.length > 0) {
    return { label: 'Completed', state: 'completed' };
  }

  return { label: null, state: 'completed' };
}

function buildActivityInsights(
  message: Message
) {
  const dedupedSteps = dedupeSteps(message.processingSteps || []);
  const dedupedTools = dedupeTools(message.tools || []);
  const stageSteps = buildStageTimeline(dedupedSteps, dedupedTools, message);
  const primary = derivePrimaryStatus(message, stageSteps);
  return {
    steps: stageSteps,
    tools: dedupedTools,
    primaryStatus: primary.label,
    primaryStatusState: primary.state,
  };
}

// Function to render assistant content with inline citation components
function processContentWithCitations(
  content: string,
  citations: CitationMeta[] = [],
  onOpenCitation?: (citation: CitationMeta, context: CitationMeta[]) => void
) {
  if (!content || typeof content !== 'string') return content;
  const normalizedCitations = dedupeCitations(citations);

  const cleanDanglingCitationMarkers = (text: string): string =>
    (text || '')
      .replace(/\s*\[\^\d+\]/g, '')
      .replace(/\s*\[\^\d+(?:\s*,\s*\^?\d+)*\]/g, '')
      .replace(/\s*\[\^\?\]/g, '')
      .replace(/\s*\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/gi, '')
      .replace(/^\[\^\d+\]:.*$/gm, '');

  // Extract mermaid fenced blocks and replace with placeholders to avoid interfering with citation parsing
  const mermaidBlocks: string[] = [];
  const MERMAID_RE = /```mermaid\s*([\s\S]*?)```/g;
  let contentWithPlaceholders = content.replace(MERMAID_RE, (_m, code) => {
    const idx = mermaidBlocks.push(String(code || '').trim()) - 1;
    return `⟦⟦MMD:${idx}⟧⟧`;
  });

  // Preserve newlines exactly to avoid breaking markdown blocks (lists, headings)
  const preserveNewlines = (text: string) => text;

  // Helper to render text while replacing mermaid placeholders with diagrams
  const renderTextWithMermaid = (text: string, keyPrefix: string) => {
    const elements: JSX.Element[] = [];
    const parts = text.split(/(⟦⟦MMD:(\d+)⟧⟧)/g);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const placeholderMatch = part && part.match(/^⟦⟦MMD:(\d+)⟧⟧$/);
      if (placeholderMatch) {
        const idx = parseInt(placeholderMatch[1], 10);
        const code = mermaidBlocks[idx] || '';
        elements.push(
          <div key={`${keyPrefix}-mmd-${i}`} className="my-3 overflow-auto">
            <MermaidDiagram code={code} />
          </div>
        );
      } else if (part) {
        elements.push(
          <Response
            key={`${keyPrefix}-txt-${i}`}
            className="block w-auto h-auto align-baseline"
          >
            {part}
          </Response>
        );
      }
    }
    return elements;
  };

  // Create a map of citation numbers to citation objects.
  // Prefer backend-stable citationId (cite_N); fallback to index-based numbering.
  const citationMap = new Map<number, any>();
  normalizedCitations.forEach((citation, index) => {
    const rawCitationId = String((citation as any)?.citationId || '');
    const parsed = rawCitationId.match(/^cite_(\d+)$/i);
    const citationNumber = parsed ? parseInt(parsed[1], 10) : (index + 1);
    if (Number.isFinite(citationNumber) && citationNumber > 0) {
      citationMap.set(citationNumber, citation);
    }
  });

  // Collect all individual citation markers first
  const individualCitationPattern = /\[\^(\d+)\]/g;
  const allMatches: Array<{ index: number; length: number; citationNumber: number }> = [];
  let match;

  while ((match = individualCitationPattern.exec(contentWithPlaceholders)) !== null) {
    const citationNumber = parseInt(match[1], 10);
    if (!isNaN(citationNumber) && citationMap.has(citationNumber)) {
      allMatches.push({
        index: match.index,
        length: match[0].length,
        citationNumber
      });
    }
  }

  // Group consecutive citations (those separated only by whitespace)
  const citationGroups: Array<{
    startIndex: number;
    endIndex: number;
    length: number;
    citationNumbers: number[];
  }> = [];

  for (let i = 0; i < allMatches.length; i++) {
    const current = allMatches[i];
    const citationNumbers = [current.citationNumber];
    let startIndex = current.index;
    let endIndex = current.index + current.length;

    // Check if the next citation is consecutive (only whitespace between them)
    while (i + 1 < allMatches.length) {
      const next = allMatches[i + 1];
      const textBetween = contentWithPlaceholders.slice(endIndex, next.index);

      // If only whitespace between citations, they're consecutive
      if (textBetween.trim() === '') {
        citationNumbers.push(next.citationNumber);
        endIndex = next.index + next.length;
        i++;
      } else {
        break;
      }
    }

    citationGroups.push({
      startIndex,
      endIndex,
      length: endIndex - startIndex,
      citationNumbers
    });
  }

  // Create citation components from groups
  const citationData: Array<{ index: number; component: JSX.Element; length: number }> = [];

  for (const group of citationGroups) {
    // Get citations for these numbers
    const matchedCitations = group.citationNumbers
      .map(num => citationMap.get(num))
      .filter(Boolean);

    if (matchedCitations.length > 0) {
      // Create URLs and titles for the citations
      const sourceData = matchedCitations.map((cit: any) => ({
        url: cit.docId ? `/documents/${cit.docId}` : (cit.url || ''),
        title: getCitationDisplayTitle(cit),
        citation: cit
      })).filter(item => item.url);

      if (sourceData.length > 0) {
        const sourceUrls = sourceData.map(item => item.url);
        const firstTitle = sourceData[0].title;
        const extraCount = sourceData.length > 1 ? sourceData.length - 1 : 0;

        citationData.push({
          index: group.startIndex,
          length: group.length,
          component: (
            <InlineCitation key={`citation-${group.startIndex}`} className="inline">
              <InlineCitationCard>
                <InlineCitationCardTrigger
                  sources={sourceUrls}
                  title={firstTitle}
                  extraCount={extraCount}
                />
                <InlineCitationCardBody>
                  <InlineCitationCarousel>
                    <InlineCitationCarouselHeader>
                      <InlineCitationCarouselPrev />
                      <InlineCitationCarouselNext />
                      <InlineCitationCarouselIndex />
                    </InlineCitationCarouselHeader>
                    <InlineCitationCarouselContent>
                      {matchedCitations.map((cit: any, idx: number) => (
                        <InlineCitationCarouselItem key={`${cit.docId || cit.url || 'citation'}-${idx}`}>
                          <InlineCitationSource
                            title={getCitationDisplayTitle(cit)}
                            url={cit.docId ? `/documents/${cit.docId}` : cit.url}
                            description={getCitationDisplayDescription(cit)}
                            actions={
                              cit.docId && onOpenCitation ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 border"
                                  onClick={() => onOpenCitation(cit, normalizedCitations)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  <span className="sr-only">Preview document</span>
                                </Button>
                              ) : undefined
                            }
                          />
                        </InlineCitationCarouselItem>
                      ))}
                    </InlineCitationCarouselContent>
                  </InlineCitationCarousel>
                </InlineCitationCardBody>
              </InlineCitationCard>
            </InlineCitation>
          )
        });
      }
    }
  }

  // If no citations found, clean and return
  if (citationData.length === 0) {
    const cleaned = cleanDanglingCitationMarkers(contentWithPlaceholders).trim();
    return <span className="inline">{renderTextWithMermaid(cleaned, `clean`)}</span>;
  }

  // Sort citations by index (forward order)
  citationData.sort((a, b) => a.index - b.index);

  // Build parts array by splitting at citation positions
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;

  for (const citation of citationData) {
    // Add text before citation
    if (citation.index > lastIndex) {
      let textBefore = contentWithPlaceholders.slice(lastIndex, citation.index);
      textBefore = cleanDanglingCitationMarkers(textBefore);
      textBefore = preserveNewlines(textBefore);
      if (textBefore) {
        parts.push(textBefore);
      }
    }

    // Add citation component
    parts.push(citation.component);

    lastIndex = citation.index + citation.length;
  }

  // Add remaining text after last citation
  if (lastIndex < contentWithPlaceholders.length) {
    const textAfter = cleanDanglingCitationMarkers(contentWithPlaceholders.slice(lastIndex));
    if (textAfter) {
      parts.push(textAfter);
    }
  }

  // Render: combine consecutive strings, render markdown blocks together
  // Keep everything inline to prevent line breaks
  const renderedParts: JSX.Element[] = [];
  let currentText = '';

  for (const part of parts) {
    if (typeof part === 'string') {
      currentText += part;
    } else {
      // Render accumulated text as markdown
      if (currentText) {
        renderTextWithMermaid(currentText, `chunk-${renderedParts.length}`).forEach(el => renderedParts.push(el));
        currentText = '';
      }
      // Add citation component (already inline)
      renderedParts.push(part);
    }
  }

  // Render any remaining text
  if (currentText) {
    renderTextWithMermaid(currentText, `tail-${renderedParts.length}`).forEach(el => renderedParts.push(el));
  }

  return <span className="inline">{renderedParts}</span>;
}

function stripMarkdownTables(text: string): string {
  if (!text) return text;
  const lines = text.split('\n');
  const cleaned: string[] = [];
  for (const line of lines) {
    const pipeCount = (line.match(/\|/g) || []).length;
    const trimmed = line.trim();
    const isTableDivider = /^(\|?\s*:?-+:?\s*)+\|?$/.test(trimmed);
    const isTableRow = pipeCount >= 2 && trimmed.startsWith('|');
    if (isTableDivider || isTableRow) {
      continue;
    }
    cleaned.push(line);
  }
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function getThemeColors(accentColor: string) {
  const colorMap: Record<string, {
    primary: string;
    secondary: string;
    gradient: string;
    iconBg: string;
    buttonBg: string;
    buttonHover: string;
  }> = {
    default: {
      primary: 'text-blue-600 dark:text-blue-400',
      secondary: 'text-blue-700 dark:text-blue-300',
      gradient: 'from-blue-600 to-purple-600',
      iconBg: 'bg-blue-100 dark:bg-blue-800/40',
      buttonBg: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700',
      buttonHover: 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
    },
    red: {
      primary: 'text-red-600 dark:text-red-400',
      secondary: 'text-red-700 dark:text-red-300',
      gradient: 'from-red-600 to-pink-600',
      iconBg: 'bg-red-100 dark:bg-red-800/40',
      buttonBg: 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700',
      buttonHover: 'hover:bg-red-50 dark:hover:bg-red-900/20'
    },
    rose: {
      primary: 'text-rose-600 dark:text-rose-400',
      secondary: 'text-rose-700 dark:text-rose-300',
      gradient: 'from-rose-600 to-pink-600',
      iconBg: 'bg-rose-100 dark:bg-rose-800/40',
      buttonBg: 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700',
      buttonHover: 'hover:bg-rose-50 dark:hover:bg-rose-900/20'
    },
    orange: {
      primary: 'text-orange-600 dark:text-orange-400',
      secondary: 'text-orange-700 dark:text-orange-300',
      gradient: 'from-orange-600 to-red-600',
      iconBg: 'bg-orange-100 dark:bg-orange-800/40',
      buttonBg: 'bg-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700',
      buttonHover: 'hover:bg-orange-50 dark:hover:bg-orange-900/20'
    },
    amber: {
      primary: 'text-amber-600 dark:text-amber-400',
      secondary: 'text-amber-700 dark:text-amber-300',
      gradient: 'from-amber-600 to-orange-600',
      iconBg: 'bg-amber-100 dark:bg-amber-800/40',
      buttonBg: 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700',
      buttonHover: 'hover:bg-amber-50 dark:hover:bg-amber-900/20'
    },
    yellow: {
      primary: 'text-yellow-600 dark:text-yellow-400',
      secondary: 'text-yellow-700 dark:text-yellow-300',
      gradient: 'from-yellow-600 to-amber-600',
      iconBg: 'bg-yellow-100 dark:bg-yellow-800/40',
      buttonBg: 'bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-700',
      buttonHover: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
    },
    lime: {
      primary: 'text-lime-600 dark:text-lime-400',
      secondary: 'text-lime-700 dark:text-lime-300',
      gradient: 'from-lime-600 to-green-600',
      iconBg: 'bg-lime-100 dark:bg-lime-800/40',
      buttonBg: 'bg-lime-600 hover:bg-lime-700 dark:bg-lime-600 dark:hover:bg-lime-700',
      buttonHover: 'hover:bg-lime-50 dark:hover:bg-lime-900/20'
    },
    green: {
      primary: 'text-green-600 dark:text-green-400',
      secondary: 'text-green-700 dark:text-green-300',
      gradient: 'from-green-600 to-emerald-600',
      iconBg: 'bg-green-100 dark:bg-green-800/40',
      buttonBg: 'bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700',
      buttonHover: 'hover:bg-green-50 dark:hover:bg-green-900/20'
    },
    emerald: {
      primary: 'text-emerald-600 dark:text-emerald-400',
      secondary: 'text-emerald-700 dark:text-emerald-300',
      gradient: 'from-emerald-600 to-teal-600',
      iconBg: 'bg-emerald-100 dark:bg-emerald-800/40',
      buttonBg: 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700',
      buttonHover: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
    },
    teal: {
      primary: 'text-teal-600 dark:text-teal-400',
      secondary: 'text-teal-700 dark:text-teal-300',
      gradient: 'from-teal-600 to-cyan-600',
      iconBg: 'bg-teal-100 dark:bg-teal-800/40',
      buttonBg: 'bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-700',
      buttonHover: 'hover:bg-teal-50 dark:hover:bg-teal-900/20'
    },
    cyan: {
      primary: 'text-cyan-600 dark:text-cyan-400',
      secondary: 'text-cyan-700 dark:text-cyan-300',
      gradient: 'from-cyan-600 to-blue-600',
      iconBg: 'bg-cyan-100 dark:bg-cyan-800/40',
      buttonBg: 'bg-cyan-600 hover:bg-cyan-700 dark:bg-cyan-600 dark:hover:bg-cyan-700',
      buttonHover: 'hover:bg-cyan-50 dark:hover:bg-cyan-900/20'
    },
    sky: {
      primary: 'text-sky-600 dark:text-sky-400',
      secondary: 'text-sky-700 dark:text-sky-300',
      gradient: 'from-sky-600 to-blue-600',
      iconBg: 'bg-sky-100 dark:bg-sky-800/40',
      buttonBg: 'bg-sky-600 hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-700',
      buttonHover: 'hover:bg-sky-50 dark:hover:bg-sky-900/20'
    },
    blue: {
      primary: 'text-blue-600 dark:text-blue-400',
      secondary: 'text-blue-700 dark:text-blue-300',
      gradient: 'from-blue-600 to-indigo-600',
      iconBg: 'bg-blue-100 dark:bg-blue-800/40',
      buttonBg: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700',
      buttonHover: 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
    },
    indigo: {
      primary: 'text-indigo-600 dark:text-indigo-400',
      secondary: 'text-indigo-700 dark:text-indigo-300',
      gradient: 'from-indigo-600 to-purple-600',
      iconBg: 'bg-indigo-100 dark:bg-indigo-800/40',
      buttonBg: 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700',
      buttonHover: 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
    },
    violet: {
      primary: 'text-violet-600 dark:text-violet-400',
      secondary: 'text-violet-700 dark:text-violet-300',
      gradient: 'from-violet-600 to-purple-600',
      iconBg: 'bg-violet-100 dark:bg-violet-800/40',
      buttonBg: 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-700',
      buttonHover: 'hover:bg-violet-50 dark:hover:bg-violet-900/20'
    },
    purple: {
      primary: 'text-purple-600 dark:text-purple-400',
      secondary: 'text-purple-700 dark:text-purple-300',
      gradient: 'from-purple-600 to-violet-600',
      iconBg: 'bg-purple-100 dark:bg-purple-800/40',
      buttonBg: 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700',
      buttonHover: 'hover:bg-purple-50 dark:hover:bg-purple-900/20'
    },
    fuchsia: {
      primary: 'text-fuchsia-600 dark:text-fuchsia-400',
      secondary: 'text-fuchsia-700 dark:text-fuchsia-300',
      gradient: 'from-fuchsia-600 to-pink-600',
      iconBg: 'bg-fuchsia-100 dark:bg-fuchsia-800/40',
      buttonBg: 'bg-fuchsia-600 hover:bg-fuchsia-700 dark:bg-fuchsia-600 dark:hover:bg-fuchsia-700',
      buttonHover: 'hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20'
    },
    pink: {
      primary: 'text-pink-600 dark:text-pink-400',
      secondary: 'text-pink-700 dark:text-pink-300',
      gradient: 'from-pink-600 to-rose-600',
      iconBg: 'bg-pink-100 dark:bg-pink-800/40',
      buttonBg: 'bg-pink-600 hover:bg-pink-700 dark:bg-pink-600 dark:hover:bg-pink-700',
      buttonHover: 'hover:bg-pink-50 dark:hover:bg-pink-900/20'
    },
  };
  return colorMap[accentColor] || colorMap.default;
}



type ChatResultsMetadata = {
  list_mode?: boolean;
  results_data?: Array<Record<string, any>>;
  columns?: string[];
  doc_type?: string | null;
  total_count?: number;
  has_more?: boolean;
  query_type?: string | null;
};

type AttachedDocMeta = {
  id: string;
  filename: string;
  title?: string;
  folderPath?: string[];
};

type DocLike = {
  filename?: string | null;
  name?: string | null;
  title?: string | null;
  folderPath?: string[] | null;
  folder_path?: string[] | null;
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: CitationMeta[];
  citationAnchors?: CitationAnchor[];
  evidenceSpans?: EvidenceSpan[];
  citationVersion?: string | null;
  citationMetrics?: CitationMetrics | null;
  isStreaming?: boolean;
  usage?: UsageInfo;
  metadata?: ChatResultsMetadata | null;
  processingSteps?: ProcessingStep[];
  tools?: ToolUsage[];
  reasoning?: string | null;
  agent?: string | { name?: string; type?: string; confidence?: number } | null;
  streamRunId?: string | null;
  streamStartedAtMs?: number;
  streamLastEventSeq?: number;
  streamLastEventTs?: number;
  attachedDocIds?: string[];
  attachedDocs?: AttachedDocMeta[];
}

const buildInitialMessages = (): Message[] => [];
const EMPTY_STATE_VARIANT_KEY = 'briefly.chat.empty_state_variant_idx.v1';
const EMPTY_STATE_VARIANTS = [
  {
    headline: 'Find the answer hidden in your docs',
    subline: 'Drop files in and ask one sharp question.',
    suggestions: ['Summarize file', 'Compare docs', 'Check compliance'],
  },
  {
    headline: 'Turn document clutter into clarity',
    subline: 'Ask for facts, gaps, and decisions.',
    suggestions: ['Extract key dates', 'List obligations', 'Find risks'],
  },
  {
    headline: 'Cross-check docs in one shot',
    subline: 'I can compare rules vs your plan with citations.',
    suggestions: ['Rule vs dossier', 'What is missing?', 'Where not compliant?'],
  },
  {
    headline: 'Ask less. Decide faster.',
    subline: 'Get concise answers grounded in your files.',
    suggestions: ['Top 5 takeaways', 'What changed?', 'Action items'],
  },
  {
    headline: 'From files to findings',
    subline: 'Search, summarize, and verify instantly.',
    suggestions: ['Find clause', 'Summarize section', 'Who is mentioned?'],
  },
];

export default function TestAgentEnhancedPage() {
  const [messages, setMessages] = useState<Message[]>(() => buildInitialMessages());

  const [isLoading, setIsLoading] = useState(false);
  const [lastListDocIds, setLastListDocIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [chatContext, setChatContext] = useState<ChatContext>({ type: 'org' });
  const [pinnedDocIds, setPinnedDocIds] = useState<string[]>([]);
  const [pinnedDocMetaById, setPinnedDocMetaById] = useState<Record<string, AttachedDocMeta>>({});
  const [fileNavigatorOpen, setFileNavigatorOpen] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [isWebSearchDialogOpen, setIsWebSearchDialogOpen] = useState(false);
  const [pendingWebSearchToggle, setPendingWebSearchToggle] = useState<boolean | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewDocPage, setPreviewDocPage] = useState<number | null>(null);
  const [previewCitation, setPreviewCitation] = useState<CitationMeta | null>(null);
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);
  const showTokenUsage = process.env.NEXT_PUBLIC_CHAT_USAGE_DEBUG === 'true';
  const hasUserMessage = messages.some(m => m.role === 'user');
  const { documents: allDocs, folders: allFolders, getFolderMetadata } = useDocuments();
  const { bootstrapData } = useAuth();
  const [loadingMoreByMessageId, setLoadingMoreByMessageId] = useState<Record<string, boolean>>({});
  const [emptyStateVariantIndex, setEmptyStateVariantIndex] = useState(0);

  const lastListMessageId = useMemo(() => {
    const listMessages = messages.filter(m => m.metadata?.list_mode && Array.isArray(m.metadata?.results_data));
    return listMessages.length ? listMessages[listMessages.length - 1].id : null;
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const variantsCount = EMPTY_STATE_VARIANTS.length;
    if (variantsCount <= 1) {
      setEmptyStateVariantIndex(0);
      return;
    }

    const prevRaw = window.sessionStorage.getItem(EMPTY_STATE_VARIANT_KEY);
    const prev = Number.isFinite(Number(prevRaw)) ? Number(prevRaw) : -1;
    const candidates: number[] = [];
    for (let i = 0; i < variantsCount; i += 1) {
      if (i !== prev) candidates.push(i);
    }
    const next = candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
    setEmptyStateVariantIndex(next);
    window.sessionStorage.setItem(EMPTY_STATE_VARIANT_KEY, String(next));
  }, []);

  const emptyStateVariant = EMPTY_STATE_VARIANTS[emptyStateVariantIndex] || EMPTY_STATE_VARIANTS[0];

  const fetchAllResultsForMessage = useCallback(async (messageId: string) => {
    const { orgId } = getApiContext();
    if (!orgId || !sessionId) return;

    setLoadingMoreByMessageId(prev => ({ ...prev, [messageId]: true }));
    try {
      const data = await apiFetch(`/orgs/${orgId}/chat/results`, {
        method: 'POST',
        body: {
          session_id: sessionId,
          fetch_all: true
        }
      });
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const nextMeta = {
          ...(m.metadata || {}),
          results_data: data?.results_data || [],
          columns: data?.columns || m.metadata?.columns || [],
          total_count: data?.total_count,
          has_more: data?.has_more
        };
        return { ...m, metadata: nextMeta };
      }));
    } catch (error) {
      console.error('Failed to fetch full results', error);
    } finally {
      setLoadingMoreByMessageId(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }
  }, [sessionId]);
  const [isActionCenterOpen, setIsActionCenterOpen] = useState(false);
  const [isActionCenterPinned, setIsActionCenterPinned] = useState(false);
  const [actionCenterTab, setActionCenterTab] = useState<ActionCenterTab>('sources');
  const [actionCenterCitations, setActionCenterCitations] = useState<CitationMeta[]>([]);
  const [messageScopedCitations, setMessageScopedCitations] = useState<CitationMeta[]>([]);
  const [actionCenterCitationsMode, setActionCenterCitationsMode] = useState<'global' | 'message'>('global');
  const [citationsModeLock, setCitationsModeLock] = useState<'global' | null>(null);
  const citationsModeLockRef = useRef<'global' | null>(null);
  const isSidebarOpen = isActionCenterOpen;
  const [teamMemory, setTeamMemory] = useState<string[]>([]);

  // Results sidebar state for "View All" functionality
  const [resultsSidebarOpen, setResultsSidebarOpen] = useState(false);
  const [resultsSidebarData, setResultsSidebarData] = useState<{
    columns: string[];
    rows: Array<Record<string, any>>;
    totalCount?: number | null;
    docType?: string | null;
  } | null>(null);

  const aggregatedCitations = useMemo(
    () => messages.flatMap((m) => m.citations || []),
    [messages]
  );

  useEffect(() => {
    citationsModeLockRef.current = citationsModeLock;
  }, [citationsModeLock]);

  useEffect(() => {
    if (actionCenterCitationsMode === 'global') {
      setActionCenterCitations(aggregatedCitations);
    }
  }, [aggregatedCitations, actionCenterCitationsMode]);

  useEffect(() => {
    if (actionCenterCitationsMode === 'message') {
      setActionCenterCitations(messageScopedCitations);
    }
  }, [messageScopedCitations, actionCenterCitationsMode]);

  const openActionCenter = useCallback(
    (tab: ActionCenterTab, options?: { citations?: CitationMeta[]; mode?: 'global' | 'message' }) => {
      if (options?.citations) {
        const normalized = dedupeCitations(options.citations);
        setMessageScopedCitations(normalized);
        setActionCenterCitations(normalized);
        setActionCenterCitationsMode(options.mode ?? 'message');
      } else {
        setMessageScopedCitations([]);
        setActionCenterCitationsMode('global');
        setActionCenterCitations(aggregatedCitations);
      }
      setActionCenterTab(tab);
      setIsActionCenterOpen(true);
    },
    [aggregatedCitations]
  );

  const handlePreviewDocument = useCallback((docId: string) => {
    setPreviewDocId(docId);
    setPreviewDocPage(null);
    setPreviewCitation(null);
    setActionCenterTab('preview');
    setIsActionCenterOpen(true);
  }, []);

  const handlePreviewFromMessage = useCallback(
    (citation: CitationMeta, contextCitations: CitationMeta[] = []) => {
      if (citation?.docId) {
        setPreviewDocId(citation.docId);
        setPreviewCitation(citation);
        const citationPage =
          typeof citation.page === 'number'
            ? citation.page
            : typeof citation.fields?.page === 'number'
              ? citation.fields.page
              : typeof citation.fields?.page_number === 'number'
                ? citation.fields.page_number
                : typeof citation.fields?.pageNumber === 'number'
                  ? citation.fields.pageNumber
                  : null;
        setPreviewDocPage(citationPage);
      }
      const normalized = dedupeCitations(
        contextCitations && contextCitations.length > 0 ? contextCitations : [citation]
      );
      setMessageScopedCitations(normalized);
      setActionCenterCitations(normalized);
      setActionCenterCitationsMode('message');
      setActionCenterTab('preview');
      setIsActionCenterOpen(true);
    },
    []
  );

  // Handler to open full results in sidebar.
  // If only preview rows are loaded, fetch all rows first via /chat/results.
  const handleViewAllInSidebar = useCallback(async (messageId: string) => {
    const targetMessage = messages.find(m => m.id === messageId);
    const metadata = targetMessage?.metadata;
    if (!metadata) return;

    const currentRows = Array.isArray(metadata.results_data) ? metadata.results_data : [];
    const currentColumns = Array.isArray(metadata.columns) ? metadata.columns : [];
    const currentTotal =
      typeof metadata.total_count === 'number' ? metadata.total_count : currentRows.length;
    const needsFetchAll = Boolean(metadata.has_more) || currentTotal > currentRows.length;

    const openSidebar = (
      columns: string[],
      rows: Array<Record<string, any>>,
      totalCount?: number | null,
      docType?: string | null
    ) => {
      setResultsSidebarData({
        columns,
        rows,
        totalCount,
        docType
      });
      setResultsSidebarOpen(true);
    };

    if (!needsFetchAll) {
      openSidebar(currentColumns, currentRows, metadata.total_count ?? null, metadata.doc_type ?? null);
      return;
    }

    const { orgId } = getApiContext();
    if (!orgId || !sessionId) {
      openSidebar(currentColumns, currentRows, metadata.total_count ?? null, metadata.doc_type ?? null);
      return;
    }

    setLoadingMoreByMessageId(prev => ({ ...prev, [messageId]: true }));
    try {
      const data = await apiFetch(`/orgs/${orgId}/chat/results`, {
        method: 'POST',
        body: {
          session_id: sessionId,
          fetch_all: true
        }
      });

      const nextRows = Array.isArray(data?.results_data) ? data.results_data : currentRows;
      const nextColumns = Array.isArray(data?.columns) && data.columns.length > 0
        ? data.columns
        : currentColumns;
      const nextTotal =
        typeof data?.total_count === 'number' ? data.total_count : metadata.total_count;
      const nextDocType = data?.doc_type ?? metadata.doc_type ?? null;
      const nextHasMore =
        typeof data?.has_more === 'boolean' ? data.has_more : metadata.has_more;

      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          metadata: {
            ...(m.metadata || {}),
            results_data: nextRows,
            columns: nextColumns,
            total_count: nextTotal,
            has_more: nextHasMore,
            doc_type: nextDocType
          }
        };
      }));

      openSidebar(nextColumns, nextRows, nextTotal ?? null, nextDocType);
    } catch (error) {
      console.error('Failed to fetch full results for sidebar', error);
      openSidebar(currentColumns, currentRows, metadata.total_count ?? null, metadata.doc_type ?? null);
    } finally {
      setLoadingMoreByMessageId(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }
  }, [messages, sessionId]);

  const resetChatSession = useCallback(() => {
    setMessages(buildInitialMessages());
    setLastListDocIds([]);
    setIsLoading(false);
    setInputValue('');
    setPinnedDocIds([]);
    setPinnedDocMetaById({});
    setFileNavigatorOpen(false);
    setPreviewDocId(null);
    setPreviewDocPage(null);
    setPreviewCitation(null);
    setIsActionCenterOpen(false);
    setActionCenterTab('sources');
    setActionCenterCitationsMode('global');
    setActionCenterCitations([]);
    setMessageScopedCitations([]);
    setCitationsModeLock(null);
    citationsModeLockRef.current = null;
    const nextSessionId =
      typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
        ? (crypto as any).randomUUID()
        : Math.random().toString(36).slice(2);
    setSessionId(nextSessionId);
  }, []);

  const handleSourcesModeChange = useCallback(
    (mode: 'global' | 'message') => {
      if (mode === 'global') {
        setCitationsModeLock('global');
        citationsModeLockRef.current = 'global';
        setActionCenterCitationsMode('global');
        setActionCenterCitations(aggregatedCitations);
        return;
      }
      if (messageScopedCitations.length === 0) return;
      setCitationsModeLock(null);
      citationsModeLockRef.current = null;
      setActionCenterCitationsMode('message');
      setActionCenterCitations(messageScopedCitations);
    },
    [aggregatedCitations, messageScopedCitations]
  );

  const handleWebSearchChange = useCallback((nextValue: boolean) => {
    if (nextValue === webSearchEnabled) return;
    if (nextValue) {
      if (!hasUserMessage) {
        resetChatSession();
        setWebSearchEnabled(true);
        return;
      }
      setPendingWebSearchToggle(true);
      setIsWebSearchDialogOpen(true);
    } else {
      setWebSearchEnabled(false);
    }
  }, [hasUserMessage, resetChatSession, webSearchEnabled]);

  const confirmWebSearchEnable = useCallback(() => {
    if (pendingWebSearchToggle) {
      resetChatSession();
      setWebSearchEnabled(true);
    }
    setPendingWebSearchToggle(null);
    setIsWebSearchDialogOpen(false);
  }, [pendingWebSearchToggle, resetChatSession]);

  const cancelWebSearchEnable = useCallback(() => {
    setPendingWebSearchToggle(null);
    setIsWebSearchDialogOpen(false);
  }, []);

  // Check page permission with fallback for backward compatibility
  const permissions = bootstrapData?.permissions || {};
  const canAccessChat = permissions['pages.chat'] !== false; // Default true if not set

  // Show access denied if no permission
  if (!canAccessChat && bootstrapData) {
    return (
      <AppLayout>
        <AccessDenied message="You don't have permission to access the chat page." />
      </AppLayout>
    );
  }
  const folderOptions = allFolders
    .filter(p => p.length > 0)
    .map(p => {
      const id = p.join('/');
      const meta = getFolderMetadata(p);
      return { id, name: meta?.title || p[p.length - 1] || id, path: p };
    });
  const allDocMetaById = useMemo(() => {
    const map = new Map<string, AttachedDocMeta>();
    for (const doc of allDocs) {
      if (!doc?.id) continue;
      map.set(doc.id, {
        id: doc.id,
        filename: getDocPrimaryName(doc),
        title: getDocSecondaryTitle(doc) || undefined,
        folderPath: getDocFolderPath(doc),
      });
    }
    return map;
  }, [allDocs]);

  const resolveAttachedDocMeta = useCallback(
    (docId: string): AttachedDocMeta | undefined => {
      return pinnedDocMetaById[docId] || allDocMetaById.get(docId);
    },
    [allDocMetaById, pinnedDocMetaById]
  );

  const documentOptions = useMemo(() => {
    const merged = new Map<string, { id: string; name: string; subtitle?: string; pathLabel?: string }>();

    for (const [id, meta] of allDocMetaById.entries()) {
      merged.set(id, {
        id,
        name: meta.filename,
        subtitle: meta.title,
        pathLabel: formatDocPathLabel(meta.folderPath),
      });
    }

    for (const [id, meta] of Object.entries(pinnedDocMetaById)) {
      if (merged.has(id)) continue;
      merged.set(id, {
        id,
        name: meta.filename || `Document ${id.slice(0, 8)}`,
        subtitle: meta.title,
        pathLabel: formatDocPathLabel(meta.folderPath),
      });
    }

    return Array.from(merged.values());
  }, [allDocMetaById, pinnedDocMetaById]);

  const handlePinnedDocIdsChange = useCallback((ids: string[]) => {
    const normalized = (ids || []).filter(Boolean).slice(0, 2);
    setPinnedDocIds(normalized);
    setPinnedDocMetaById((prev) => {
      const next: Record<string, AttachedDocMeta> = {};
      for (const id of normalized) {
        if (prev[id]) next[id] = prev[id];
      }
      return next;
    });
  }, []);

  const selectedFolderId =
    chatContext.type === 'folder'
      ? chatContext.folderPath?.join('/') || chatContext.path?.join('/') || null
      : null;
  const selectedDocumentId =
    chatContext.type === 'document'
      ? chatContext.id || null
      : null;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // Ensure a fresh sessionId per page load
  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  const handleSubmit = async (input: string, overrideContext?: ChatContext) => {
    if (!input.trim() || isLoading) return;

    const effectiveContext = overrideContext || chatContext;
    const normalizedPinnedDocIds = (pinnedDocIds || []).filter(Boolean).slice(0, 2);
    console.log('Submitting message:', input, 'Context:', effectiveContext);
    console.log('🔍 ChatContext details:', {
      type: effectiveContext.type,
      id: effectiveContext.id,
      name: effectiveContext.name,
      folderPath: effectiveContext.folderPath,
      path: effectiveContext.path
    });

    const scopeType =
      normalizedPinnedDocIds.length > 0
        ? 'org'
        : effectiveContext.type === 'folder'
          ? 'folder'
          : effectiveContext.type === 'document'
            ? 'document'
            : 'org';

    const contextPayload: any = {
      scope: scopeType,
      includeSubfolders: true,
      includeLinked: false,
      includeVersions: false
    };

    // Always send pinnedDocIds so backend can set/clear session state deterministically.
    contextPayload.pinnedDocIds = normalizedPinnedDocIds;

    if (scopeType === 'document') {
      if (effectiveContext.id) {
        contextPayload.docId = effectiveContext.id;
      }
    } else if (scopeType === 'folder') {
      if (effectiveContext.id) {
        contextPayload.folderId = effectiveContext.id;
      }
      const folderPath = effectiveContext.folderPath || effectiveContext.path;
      if (folderPath?.length) {
        contextPayload.folderPath = folderPath;
      }
    }

    try {
      // Determine endpoint based on context using the new folder resolution system
      const endpointContext: ChatContext = normalizedPinnedDocIds.length > 0 ? { type: 'org' } : effectiveContext;
      const endpoint = await createFolderChatEndpoint(endpointContext);
      console.log('✅ Using endpoint:', endpoint);

      const attachedDocsSnapshot: AttachedDocMeta[] = normalizedPinnedDocIds
        .map((docId) => {
          const meta = resolveAttachedDocMeta(docId);
          return {
            id: docId,
            filename: meta?.filename || `Document ${docId.slice(0, 8)}`,
            title: meta?.title,
            folderPath: meta?.folderPath || [],
          };
        })
        .filter((item) => Boolean(item.id));

      // Add user message (capture attached docs at send time)
      const userMessage: Message = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: input,
        attachedDocIds: normalizedPinnedDocIds.length > 0 ? [...normalizedPinnedDocIds] : undefined,
        attachedDocs: attachedDocsSnapshot.length > 0 ? attachedDocsSnapshot : undefined,
      };

      setMessages(prev => [...prev, userMessage]);
      handlePinnedDocIdsChange([]); // Clear from input box — docs now live in the sent message
      setIsLoading(true);

      // Add assistant message placeholder
      const assistantId = `assistant_${Date.now()}`;
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        processingSteps: [],
        tools: [],
        streamStartedAtMs: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      console.log('Added assistant message placeholder');

      try {
        let streamingContent = '';
        let streamRunId: string | null = null;
        let streamLastEventSeq = 0;
        let streamLastEventTs = Date.now();
        let hasCompleted = false;
        let streamSteps: ProcessingStep[] = [];
        let streamTools: ToolUsage[] = [];

        const updateAssistantMessage = (updater: (message: Message) => Message) => {
          setMessages(prev => prev.map(m => (m.id === assistantId ? updater(m) : m)));
        };

        // Ensure a stable session id for this page session
        const ensuredSessionId = sessionId || (typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2));
        if (!sessionId) setSessionId(ensuredSessionId);

        await ssePost(endpoint, {
          session_id: ensuredSessionId,
          question: input,
          conversation: messages.map(m => {
            const rawCitations = Array.isArray((m as any).citations) ? (m as any).citations : [];
            const sanitizedCitations = rawCitations.filter((c: any) => typeof c?.docId === 'string' && c.docId);
            return {
              role: m.role,
              content: m.content,
              citations: sanitizedCitations
            };
          }),
          memory: {
            lastListDocIds: lastListDocIds,
            focusDocIds: [],
            lastCitedDocIds: [],
            sessionId: ensuredSessionId
          },
          context: contextPayload,
          filters: {},
          strictCitations: false,
          webSearchEnabled: webSearchEnabled
        }, (event) => {
          if (event.event === 'message' && event.data) {
            try {
              // Ensure we have a proper data object
              let data;
              if (typeof event.data === 'string') {
                // Try to parse as JSON
                try {
                  data = JSON.parse(event.data);
                } catch (jsonError) {
                  console.warn('Failed to parse JSON data:', event.data);
                  return; // Skip this event
                }
              } else if (typeof event.data === 'object' && event.data !== null) {
                data = event.data;
              } else {
                console.warn('Invalid event data type:', typeof event.data, event.data);
                return; // Skip this event
              }

              // Ensure data has a type property
              if (!data || typeof data !== 'object' || !data.type) {
                console.warn('Invalid data object:', data);
                return; // Skip this event
              }

              const eventSeq = Number((data as any).event_seq);
              if (Number.isFinite(eventSeq) && eventSeq > 0) {
                if (eventSeq <= streamLastEventSeq) {
                  return;
                }
                streamLastEventSeq = eventSeq;
              }

              const eventTs = Number((data as any).ts_ms);
              if (Number.isFinite(eventTs) && eventTs > 0) {
                streamLastEventTs = eventTs;
              }

              const incomingRunId = typeof (data as any).run_id === 'string' ? String((data as any).run_id) : null;
              if (incomingRunId) {
                if (!streamRunId) {
                  streamRunId = incomingRunId;
                } else if (streamRunId !== incomingRunId) {
                  console.warn('Ignoring stream event from different run', { expected: streamRunId, received: incomingRunId });
                  return;
                }
              }

              if (hasCompleted && data.type !== 'error') {
                return;
              }

              console.log('Processing streaming data:', data.type, data);
              console.log('Current streamingContent:', streamingContent);

              if (data.type === 'start') {
                updateAssistantMessage((m) => ({
                  ...m,
                  streamRunId: streamRunId || m.streamRunId || null,
                  streamStartedAtMs: m.streamStartedAtMs || streamLastEventTs || Date.now(),
                  streamLastEventSeq: streamLastEventSeq || m.streamLastEventSeq,
                  streamLastEventTs,
                }));
              } else if (data.type === 'task_step') {
                const nextStep: ProcessingStep = {
                  step: data.step || data.step_id || data.title || `step_${streamSteps.length + 1}`,
                  title: data.title || data.description || data.message || 'Working',
                  description: data.description || data.message || data.title,
                  status: normalizeActivityStatus(data.status),
                  task: data.task,
                  category: data.category,
                  updatedAtMs: streamLastEventTs,
                };
                streamSteps = dedupeSteps([...streamSteps, nextStep]);
                updateAssistantMessage((m) => ({
                  ...m,
                  processingSteps: streamSteps,
                  tools: streamTools,
                  streamRunId: streamRunId || m.streamRunId || null,
                  streamLastEventSeq: streamLastEventSeq || m.streamLastEventSeq,
                  streamLastEventTs,
                }));
              } else if (data.type === 'tool_usage') {
                const rawToolId = data.name || data.tool || data.tool_name || 'tool';
                const nextTool: ToolUsage = {
                  toolId: canonicalActivityKey(rawToolId) || rawToolId,
                  name: data.name || data.tool || data.tool_name || 'tool',
                  status: normalizeActivityStatus(data.status || 'running'),
                  description: data.description || data.message,
                  updatedAtMs: streamLastEventTs,
                };
                streamTools = dedupeTools([...streamTools, nextTool]);
                updateAssistantMessage((m) => ({
                  ...m,
                  processingSteps: streamSteps,
                  tools: streamTools,
                  streamRunId: streamRunId || m.streamRunId || null,
                  streamLastEventSeq: streamLastEventSeq || m.streamLastEventSeq,
                  streamLastEventTs,
                }));
              } else if (data.type === 'tool_call') {
                const rawToolId = data.tool_name || data.name || 'tool_call';
                const nextTool: ToolUsage = {
                  toolId: canonicalActivityKey(rawToolId) || rawToolId,
                  name: data.tool_name || data.name || 'tool_call',
                  status: normalizeActivityStatus(data.status || 'running'),
                  description: data.message || data.description || 'Tool call in progress',
                  updatedAtMs: streamLastEventTs,
                };
                streamTools = dedupeTools([...streamTools, nextTool]);
                updateAssistantMessage((m) => ({
                  ...m,
                  processingSteps: streamSteps,
                  tools: streamTools,
                  streamRunId: streamRunId || m.streamRunId || null,
                  streamLastEventSeq: streamLastEventSeq || m.streamLastEventSeq,
                  streamLastEventTs,
                }));
              } else if (data.type === 'content' && data.chunk) {
                streamingContent += data.chunk;
                updateAssistantMessage((m) => ({
                  ...m,
                  content: streamingContent,
                  processingSteps: streamSteps,
                  tools: streamTools,
                  streamRunId: streamRunId || m.streamRunId || null,
                  streamLastEventSeq: streamLastEventSeq || m.streamLastEventSeq,
                  streamLastEventTs,
                }));
              } else if (data.type === 'complete') {
                if (hasCompleted) return;
                hasCompleted = true;
                const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata as ChatResultsMetadata : null;
                const listMode = Boolean(meta?.list_mode);
                let finalContent = data.full_content || streamingContent;
                if (listMode) {
                  finalContent = stripMarkdownTables(finalContent);
                }
                const citations = dedupeCitations(data.citations || data.citationSources || []);
                const citationAnchors = Array.isArray((data as any).citationAnchors) ? (data as any).citationAnchors as CitationAnchor[] : [];
                const evidenceSpans = Array.isArray((data as any).evidenceSpans) ? (data as any).evidenceSpans as EvidenceSpan[] : [];
                const citationVersion = typeof (data as any).citationVersion === 'string' ? (data as any).citationVersion as string : null;
                const citationMetrics = ((data as any).citationMetrics && typeof (data as any).citationMetrics === 'object')
                  ? (data as any).citationMetrics as CitationMetrics
                  : null;
                console.debug('[Chat] Received citations', {
                  count: citations.length,
                  withChunkId: citations.filter((c: any) => c?.chunkId || c?.fields?.chunk_id).length,
                  anchors: citationAnchors.length,
                  evidenceSpans: evidenceSpans.length,
                });
                const usage = data.usage && typeof data.usage === 'object' ? data.usage : null;
                const incomingSteps = Array.isArray(data.processingSteps) && data.processingSteps.length > 0
                  ? data.processingSteps.map((step: ProcessingStep) => ({ ...step, updatedAtMs: streamLastEventTs }))
                  : [];
                const incomingTools = Array.isArray(data.tools) && data.tools.length > 0
                  ? data.tools.map((tool: ToolUsage) => {
                    const rawToolId = tool.toolId || tool.name || tool.description || '';
                    return {
                      ...tool,
                      toolId: canonicalActivityKey(rawToolId) || tool.toolId || rawToolId || undefined,
                      updatedAtMs: streamLastEventTs
                    };
                  })
                  : [];

                const baseSteps = dedupeSteps(
                  settleActivityOnComplete(
                    dedupeSteps([...streamSteps, ...incomingSteps]),
                    streamLastEventTs
                  )
                );
                const baseTools = dedupeTools(
                  settleActivityOnComplete(
                    dedupeTools([...streamTools, ...incomingTools]),
                    streamLastEventTs
                  )
                );
                streamSteps = baseSteps;
                streamTools = baseTools;

                setMessageScopedCitations(citations);
                if (citations.length > 0) {
                  if (citationsModeLockRef.current !== 'global') {
                    setActionCenterCitationsMode('message');
                    setActionCenterCitations(citations);
                  }
                } else if (citationsModeLockRef.current !== 'global') {
                  setActionCenterCitationsMode('global');
                }

                updateAssistantMessage((m) => ({
                  ...m,
                  content: finalContent,
                  citations,
                  citationAnchors,
                  evidenceSpans,
                  citationVersion,
                  citationMetrics,
                  isStreaming: false,
                  tools: baseTools,
                  reasoning: data.reasoning || data.agentInsights?.join('\n'),
                  agent: data.agent || 'Smart Assistant',
                  processingSteps: baseSteps,
                  usage: usage || undefined,
                  metadata: meta,
                  streamRunId: streamRunId || m.streamRunId || null,
                  streamLastEventSeq: streamLastEventSeq || m.streamLastEventSeq,
                  streamLastEventTs,
                }));

                if (showTokenUsage && usage) {
                  console.info('Chat token usage', usage);
                }

                // Keep the processing steps and tools visible in the message
                // Don't clear them - they should remain visible

                // Update lastListDocIds for follow-up questions
                if (citations.length > 0) {
                  const docOnlyIds = citations
                    .map((c: any) => c.docId)
                    .filter((id: string | null | undefined): id is string => Boolean(id));
                  if (docOnlyIds.length > 0) {
                    setLastListDocIds(docOnlyIds.slice(0, 5));
                  }
                }

                // Update team memory from backend response
                if (data.memory && Array.isArray(data.memory)) {
                  setTeamMemory(data.memory);
                }

                // Persist session id for continuity
                if (data.sessionId || data.session_id) {
                  setSessionId(data.sessionId || data.session_id);
                }
              } else if (data.type === 'error') {
                hasCompleted = true;
                updateAssistantMessage((m) => ({
                  ...m,
                  content: `${streamingContent}\n\n❌ **Error**: ${data.error || 'Unknown error'}`,
                  isStreaming: false,
                  processingSteps: dedupeSteps(streamSteps),
                  tools: dedupeTools(streamTools),
                  streamRunId: streamRunId || m.streamRunId || null,
                  streamLastEventSeq: streamLastEventSeq || m.streamLastEventSeq,
                  streamLastEventTs,
                }));
              } else {
                // Handle any other data types - don't add to content
                console.log('Unhandled data type:', data.type, data);
              }
            } catch (error) {
              console.error('Error processing streaming data:', error, event.data);
              // Don't add unparsed data to content
            }
          }
        });
      } catch (error) {
        console.error('Error:', error);
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? {
              ...m,
              content: `❌ **Error**: ${error instanceof Error ? error.message : 'Something went wrong'}`,
              isStreaming: false
            }
            : m
        ));
      } finally {
        setIsLoading(false);
        setInputValue(''); // Clear input after submission
        // Don't clear task steps and tools - they should remain visible in the message
      }
    } catch (error) {
      console.error('Error in endpoint resolution:', error);
      setIsLoading(false);
      setInputValue('');
    }
  };

  return (
    <AppLayout collapseSidebar={isActionCenterPinned}>
      <div className={cn("flex w-full h-full", isActionCenterPinned && "gap-0")}>
        <div
          className={cn(
            "flex flex-col h-[100dvh] md:h-svh overflow-hidden w-full max-w-[98%] mx-auto px-2 sm:px-3 md:px-4 font-poppins text-sm transition-all duration-300",
            !isActionCenterPinned && isSidebarOpen && 'sm:mr-[420px] lg:mr-[clamp(360px,40vw,560px)]'
          )}
        >
          {/* Minimal Header */}
          <div className="flex items-center justify-end py-2 sm:py-3 md:py-4 border-b border-border/40 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (isActionCenterOpen) {
                  setIsActionCenterOpen(false);
                  setPreviewDocId(null);
                  setActionCenterCitationsMode('global');
                  setActionCenterCitations(aggregatedCitations);
                } else {
                  openActionCenter('sources');
                }
              }}
              className={cn("transition-colors h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0", isSidebarOpen && "bg-accent text-accent-foreground")}
              title="Toggle Action Center"
            >
              <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>

          {/* Chat Area */}
          {hasUserMessage ? (
            // Main Chat Layout - Flex Column
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">

              {/* Messages Area - Flex Grow */}
              <div className="flex-1 overflow-y-auto px-2 sm:px-3 md:px-4 scrollbar-hide" ref={scrollAreaRef}>
                <div className="w-full max-w-[98%] mx-auto py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 md:space-y-8 min-h-full">
                  {messages.map((message, idx) => {
                    console.log('Rendering message:', message);
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "animate-in fade-in slide-in-from-bottom-4 duration-700",
                          "group w-full flex gap-2 sm:gap-3 md:gap-4"
                        )}
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        {message.role === 'user' ? (
                          <>
                            {/* User Message - Right aligned */}
                            <div className="flex-1 flex flex-col items-end gap-2">
                              {/* Attached document cards — shown above the message text */}
                              {message.attachedDocIds && message.attachedDocIds.length > 0 && (
                                <div className="flex flex-wrap justify-end gap-2 max-w-[90%] sm:max-w-[85%] md:max-w-[75%]">
                                  {message.attachedDocIds.map((docId) => {
                                    const attachedMeta = message.attachedDocs?.find((d) => d.id === docId);
                                    const resolvedMeta = attachedMeta || resolveAttachedDocMeta(docId);
                                    const filename = attachedMeta?.filename || resolvedMeta?.filename || `Document ${docId.slice(0, 8)}`;
                                    const title = getDocSecondaryTitle({
                                      filename,
                                      title: attachedMeta?.title || resolvedMeta?.title || '',
                                    });
                                    const ext = filename.includes('.') ? filename.split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE' : 'FILE';
                                    return (
                                      <div
                                        key={docId}
                                        className={cn(
                                          "flex items-start gap-2 rounded-xl border border-border bg-muted/80 px-3 py-2",
                                          "shadow-sm transition-all hover:bg-muted"
                                        )}
                                      >
                                        <FileText className="h-4 w-4 text-primary shrink-0" />
                                        <div className="min-w-0 flex-1">
                                          <div className="text-xs font-medium text-foreground truncate max-w-[180px]">
                                            {filename}
                                          </div>
                                          {title ? (
                                            <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                                              {title}
                                            </div>
                                          ) : null}
                                        </div>
                                        <span className="text-[9px] font-bold tracking-wider text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded border border-border/50 uppercase">
                                          {ext}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <div className={cn(
                                "max-w-[90%] sm:max-w-[85%] md:max-w-[75%]",
                                "rounded-2xl rounded-tr-md px-3 sm:px-4 py-2.5 sm:py-3.5",
                                "bg-gradient-to-br from-primary/90 to-primary",
                                "text-primary-foreground shadow-lg shadow-primary/25",
                                "border border-primary/20",
                                "transition-all duration-300 hover:shadow-xl hover:shadow-primary/30",
                                "backdrop-blur-sm"
                              )}>
                                <div className="prose prose-sm max-w-none text-primary-foreground [&>*]:text-primary-foreground text-xs sm:text-sm break-words">
                                  {message.content}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* AI Message - Left aligned with avatar */}
                            <div className="flex-shrink-0">
                              <div className={cn(
                                "w-7 h-7 sm:w-8 sm:h-9 rounded-xl flex items-center justify-center",
                                "bg-gradient-to-br shadow-md border border-border/50",
                                themeColors.gradient.includes('blue') && "from-blue-500/10 via-indigo-500/10 to-purple-500/10",
                                themeColors.gradient.includes('green') && "from-green-500/10 via-emerald-500/10 to-teal-500/10",
                                themeColors.gradient.includes('purple') && "from-purple-500/10 via-fuchsia-500/10 to-pink-500/10",
                                !themeColors.gradient.includes('blue') && !themeColors.gradient.includes('green') && !themeColors.gradient.includes('purple') && "from-muted/50 to-muted/30"
                              )}>
                                <Bot className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", themeColors.primary)} />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0 space-y-2 sm:space-y-3 md:space-y-4">
                              {/* Agent activity using Task component */}
                              {(() => {
                                const { steps: activitySteps, tools, primaryStatus, primaryStatusState } = buildActivityInsights(message);
                                const hasOnlyRespondStage = activitySteps.length === 1 && activitySteps[0]?.step === 'respond';
                                const hasSteps = activitySteps.length > 0 && !hasOnlyRespondStage;
                                const hasTools = tools.length > 0;

                                if (!primaryStatus && !hasSteps && !hasTools) return null;

                                return (
                                  <div className="space-y-3">
                                    {primaryStatus && (
                                      <div className={cn(
                                        "inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                                        primaryStatusState === 'error' && 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300',
                                        primaryStatusState === 'in_progress' && 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300',
                                        primaryStatusState === 'completed' && 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
                                      )}>
                                        <span className={cn(
                                          "h-1.5 w-1.5 shrink-0 rounded-full",
                                          primaryStatusState === 'error' && 'bg-red-500',
                                          primaryStatusState === 'in_progress' && 'bg-amber-500 animate-pulse',
                                          primaryStatusState === 'completed' && 'bg-emerald-500'
                                        )} />
                                        <span className="truncate">{primaryStatus}</span>
                                      </div>
                                    )}

                                    {/* Processing Steps Task */}
                                    {hasSteps && (() => {
                                      // Group steps by task or show as single task
                                      const hasMultipleTasks = activitySteps.some((step: any) => step.task || step.category);

                                      if (hasMultipleTasks) {
                                        // Group by task/category
                                        const grouped = activitySteps.reduce((acc: any, step: any) => {
                                          const key = step.task || step.category || 'general';
                                          if (!acc[key]) {
                                            acc[key] = [];
                                          }
                                          acc[key].push(step);
                                          return acc;
                                        }, {});

                                        return (
                                          <>
                                            {Object.entries(grouped).map(([taskKey, steps]: [string, any]) => (
                                              <Task key={taskKey} defaultOpen={taskKey === Object.keys(grouped)[0]}>
                                                <TaskTrigger title={steps[0]?.task || steps[0]?.category || 'Processing'} />
                                                <TaskContent>
                                                  {steps.map((step: any, index: number) => (
                                                    <TaskItem key={`${step.step}-${index}`}>
                                                      <div className="flex items-center justify-between gap-2">
                                                        <span className="min-w-0 truncate">{step.description || step.title}</span>
                                                        <span className={cn(
                                                          "shrink-0 flex items-center justify-center w-5 h-5 rounded-full",
                                                          step.status === 'error' && 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
                                                          step.status === 'in_progress' && 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
                                                          step.status === 'completed' && 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                        )}>
                                                          {step.status === 'error' ? <X className="w-3 h-3" /> : step.status === 'in_progress' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                        </span>
                                                      </div>
                                                    </TaskItem>
                                                  ))}
                                                </TaskContent>
                                              </Task>
                                            ))}
                                          </>
                                        );
                                      }

                                      // Single task with all steps
                                      return (
                                        <Task defaultOpen={Boolean(message.isStreaming)}>
                                          <TaskTrigger title="Activity" />
                                          <TaskContent>
                                            {activitySteps.map((step: any, index: number) => (
                                              <TaskItem key={`${step.step}-${index}`}>
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="min-w-0 truncate">{step.description || step.title}</span>
                                                  <span className={cn(
                                                    "shrink-0 flex items-center justify-center w-5 h-5 rounded-full",
                                                    step.status === 'error' && 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
                                                    step.status === 'in_progress' && 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
                                                    step.status === 'completed' && 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                  )}>
                                                    {step.status === 'error' ? <X className="w-3 h-3" /> : step.status === 'in_progress' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                  </span>
                                                </div>
                                              </TaskItem>
                                            ))}
                                          </TaskContent>
                                        </Task>
                                      );
                                    })()}

                                    {/* Tools Task */}
                                    {hasTools && (
                                      <Task defaultOpen={false}>
                                        <TaskTrigger title="Tool Calls" />
                                        <TaskContent>
                                          {tools.map((tool: any, index: number) => (
                                            <TaskItem key={`tool-${tool.name}-${index}`}>
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="min-w-0 truncate">
                                                  {tool.name || tool.tool}
                                                  {tool.description && tool.description !== tool.name && ` - ${tool.description}`}
                                                </span>
                                                <span className={cn(
                                                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                                                  tool.status === 'error' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                                                  tool.status === 'in_progress' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                                                  tool.status === 'completed' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                )}>
                                                  {tool.status === 'error' ? 'Error' : tool.status === 'in_progress' ? 'Running' : 'Done'}
                                                  {tool.status === 'completed' && formatDurationMs(tool.startedAtMs, tool.endedAtMs) ? ` • ${formatDurationMs(tool.startedAtMs, tool.endedAtMs)}` : ''}
                                                </span>
                                              </div>
                                            </TaskItem>
                                          ))}
                                        </TaskContent>
                                      </Task>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Main Response Content - Enhanced typography */}
                              {message.content && (
                                <div className="prose prose-sm max-w-none text-foreground dark:prose-invert [&>p]:leading-relaxed text-xs sm:text-sm break-words overflow-wrap-anywhere pl-1">
                                  {processContentWithCitations(
                                    message.content,
                                    message.citations,
                                    (citation, context) => handlePreviewFromMessage(citation, context)
                                  )}
                                </div>
                              )}

                              {message.metadata?.list_mode && Array.isArray(message.metadata?.results_data) && message.metadata.results_data.length > 0 && (
                                <DocumentResultsTable
                                  columns={message.metadata?.columns || []}
                                  rows={message.metadata?.results_data || []}
                                  totalCount={message.metadata?.total_count ?? null}
                                  hasMore={Boolean(message.metadata?.has_more) && message.id === lastListMessageId}
                                  isLoadingMore={Boolean(loadingMoreByMessageId[message.id])}
                                  previewLimit={10}
                                  onViewAllInSidebar={() => handleViewAllInSidebar(message.id)}
                                  onViewMore={
                                    message.id === lastListMessageId
                                      ? () => fetchAllResultsForMessage(message.id)
                                      : undefined
                                  }
                                  className="mt-2 sm:mt-3"
                                />
                              )}

                              {showTokenUsage && message.usage && (
                                <div className="text-[10px] sm:text-xs text-muted-foreground">
                                  Tokens: in {message.usage.tokensIn ?? 'n/a'} out {message.usage.tokensOut ?? 'n/a'} total {message.usage.tokensTotal ?? 'n/a'}
                                  {message.usage.duration ? ` • ${message.usage.duration.toFixed(2)}s` : ''}
                                  {message.usage.model ? ` • ${message.usage.model}` : ''}
                                </div>
                              )}

                              {/* Loading State - Shimmer animation */}
                              {message.isStreaming && !message.content && (
                                <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-muted/20 border border-border/30">
                                  <div className="flex gap-1.5">
                                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '300ms' }} />
                                  </div>
                                  <Shimmer as="span" className="text-xs sm:text-sm" duration={2}>
                                    Working...
                                  </Shimmer>
                                </div>
                              )}

                              {message.citations && message.citations.length > 0 && (
                                <div className={cn(
                                  "rounded-xl sm:rounded-2xl border border-border/40 p-3 sm:p-4",
                                  "bg-gradient-to-br from-muted/20 to-transparent",
                                  "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4",
                                  "transition-all duration-300 hover:border-border/60 hover:shadow-sm"
                                )}>
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className={cn(
                                      "w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center",
                                      "bg-gradient-to-br from-primary/10 to-primary/5",
                                      "border border-primary/20"
                                    )}>
                                      <FileText className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", themeColors.primary)} />
                                    </div>
                                    <div>
                                      <p className="text-xs sm:text-sm font-semibold text-foreground">Sources</p>
                                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                                        {message.citations.length} reference{message.citations.length > 1 ? 's' : ''} cited in this response.
                                        {typeof message.citationMetrics?.unresolved_anchor_count === 'number' && message.citationMetrics.unresolved_anchor_count > 0
                                          ? ` ${message.citationMetrics.unresolved_anchor_count} unresolved anchor${message.citationMetrics.unresolved_anchor_count > 1 ? 's' : ''}.`
                                          : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn("rounded-full px-3 sm:px-4 text-xs sm:text-sm h-8 sm:h-9", themeColors.buttonHover)}
                                    onClick={() => openActionCenter('sources', { citations: message.citations || [] })}
                                  >
                                    <span className="hidden sm:inline">View in Action Center</span>
                                    <span className="sm:hidden">View Sources</span>
                                  </Button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}

                </div>
              </div>

              <div className="flex-shrink-0 z-20 bg-background pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] relative">
                {/* Gradient Fade Top */}
                <div className="absolute -top-10 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent pointer-events-none" />

                <div className="w-full max-w-4xl mx-auto px-2 sm:px-3 md:px-4">
                  <div className={cn(
                    "animate-in fade-in slide-in-from-bottom-4 duration-500",
                    "shadow-2xl shadow-black/10 dark:shadow-black/40",
                    "rounded-2xl sm:rounded-3xl"
                  )}>
                    <BrieflyChatBox
                      folders={folderOptions}
                      documents={documentOptions}
                      defaultMode={chatContext.type === 'folder' ? 'folder' : chatContext.type === 'document' ? 'document' : 'all'}
                      defaultWebSearch={webSearchEnabled}
                      webSearch={webSearchEnabled}
                      onWebSearchChange={handleWebSearchChange}
                      defaultFolderId={selectedFolderId}
                      defaultDocumentId={selectedDocumentId}
                      defaultDocumentName={chatContext.type === 'document' ? chatContext.name || null : null}
                      pinnedDocIds={pinnedDocIds}
                      onPinnedDocIdsChange={handlePinnedDocIdsChange}
                      onRequestFilePicker={() => setFileNavigatorOpen(true)}
                      placeholder={
                        chatContext.type === 'document'
                          ? `Ask about "${chatContext.name || 'this document'}"...`
                          : chatContext.type === 'folder'
                            ? `Ask about documents in "${chatContext.name || 'this folder'}"...`
                            : 'Ask about clauses, dates, people, risks, or compliance...'
                      }
                      sending={isLoading}
                      onSend={({ text, mode, folderId, documentId, folderName, documentName, webSearch }) => {
                        let nextContext: ChatContext = { type: 'org' };
                        if (mode === 'folder' && folderId) {
                          const path = folderId.split('/').filter(Boolean);
                          const meta = getFolderMetadata(path);
                          nextContext = { type: 'folder', id: meta?.id, name: meta?.title || folderName || folderId, folderPath: path };
                        } else if (mode === 'document' && documentId) {
                          const doc = allDocs.find(d => d.id === documentId);
                          const resolvedDocName = doc
                            ? getDocPrimaryName(doc)
                            : documentName || chatContext.name || `Document ${documentId.slice(0, 8)}`;
                          nextContext = { type: 'document', id: documentId, name: resolvedDocName };
                        }
                        setChatContext(nextContext);
                        setWebSearchEnabled(webSearch);
                        handleSubmit(text, nextContext);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Beautiful empty state with centered input
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 flex items-center justify-center py-4 sm:py-8 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-8">
                <div className="w-full max-w-5xl mx-auto px-2 sm:px-3 md:px-4">
                  {/* Welcome Message */}
                  <div className="mb-6 sm:mb-8 md:mb-12 text-center animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="mb-4 sm:mb-6 inline-flex items-center justify-center">
                      <div className={cn(
                        "w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl flex items-center justify-center",
                        "bg-gradient-to-br shadow-2xl shadow-primary/30 border-2 border-primary/30",
                        "animate-in zoom-in duration-1000",
                        themeColors.gradient.includes('blue') && "from-blue-500/20 via-indigo-500/20 to-purple-500/20",
                        themeColors.gradient.includes('green') && "from-green-500/20 via-emerald-500/20 to-teal-500/20",
                        themeColors.gradient.includes('purple') && "from-purple-500/20 via-fuchsia-500/20 to-pink-500/20",
                        !themeColors.gradient.includes('blue') && !themeColors.gradient.includes('green') && !themeColors.gradient.includes('purple') && "from-primary/20 via-primary/10 to-primary/20"
                      )}>
                        <Sparkles className={cn("h-8 w-8 sm:h-10 sm:w-10", themeColors.primary)} />
                      </div>
                    </div>
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-2 sm:mb-3 tracking-tight px-2">
                      {emptyStateVariant.headline}
                    </h2>
                    <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2">
                      {emptyStateVariant.subline}
                    </p>

                    {/* Quick action suggestions */}
                    <div className="mt-6 sm:mt-8 flex flex-wrap justify-center gap-2 sm:gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 px-2">
                      {emptyStateVariant.suggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => setInputValue(suggestion)}
                          className={cn(
                            "px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium",
                            "border border-border/50 bg-muted/30",
                            "transition-all duration-300",
                            "hover:border-primary/50 hover:bg-primary/5 hover:shadow-md hover:-translate-y-0.5",
                            "active:translate-y-0"
                          )}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Input Box */}
                  <div className={cn(
                    "animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300",
                    "shadow-2xl shadow-black/10 dark:shadow-black/40",
                    "rounded-2xl sm:rounded-3xl"
                  )}>
                    <BrieflyChatBox
                      folders={folderOptions}
                      documents={documentOptions}
                      defaultMode={chatContext.type === 'folder' ? 'folder' : chatContext.type === 'document' ? 'document' : 'all'}
                      defaultWebSearch={webSearchEnabled}
                      webSearch={webSearchEnabled}
                      onWebSearchChange={handleWebSearchChange}
                      defaultFolderId={selectedFolderId}
                      defaultDocumentId={selectedDocumentId}
                      defaultDocumentName={chatContext.type === 'document' ? chatContext.name || null : null}
                      pinnedDocIds={pinnedDocIds}
                      onPinnedDocIdsChange={handlePinnedDocIdsChange}
                      onRequestFilePicker={() => setFileNavigatorOpen(true)}
                      placeholder={
                        chatContext.type === 'document'
                          ? `Ask about "${chatContext.name || 'this document'}"...`
                          : chatContext.type === 'folder'
                            ? `Ask about documents in "${chatContext.name || 'this folder'}"...`
                            : 'Ask about clauses, dates, people, risks, or compliance...'
                      }
                      sending={isLoading}
                      onSend={({ text, mode, folderId, documentId, folderName, documentName, webSearch }) => {
                        let nextContext: ChatContext = { type: 'org' };
                        if (mode === 'folder' && folderId) {
                          const path = folderId.split('/').filter(Boolean);
                          const meta = getFolderMetadata(path);
                          nextContext = { type: 'folder', id: meta?.id, name: meta?.title || folderName || folderId, folderPath: path };
                        } else if (mode === 'document' && documentId) {
                          const doc = allDocs.find(d => d.id === documentId);
                          const resolvedDocName = doc
                            ? getDocPrimaryName(doc)
                            : documentName || chatContext.name || `Document ${documentId.slice(0, 8)}`;
                          nextContext = { type: 'document', id: documentId, name: resolvedDocName };
                        }
                        setChatContext(nextContext);
                        setWebSearchEnabled(webSearch);
                        handleSubmit(text, nextContext);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <Dialog
          open={isWebSearchDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              cancelWebSearchEnable();
            } else {
              setIsWebSearchDialogOpen(true);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enable web search?</DialogTitle>
              <DialogDescription>
                Turning on web search starts a fresh chat session so the assistant can cite live articles.
                Continue and reset the current conversation?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
              <Button variant="outline" onClick={cancelWebSearchEnable}>
                Cancel
              </Button>
              <Button onClick={confirmWebSearchEnable}>
                Enable web search
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <FinderPicker
          open={fileNavigatorOpen}
          onOpenChange={setFileNavigatorOpen}
          mode="doc"
          maxDocs={2}
          initialSelectedDocIds={pinnedDocIds}
          onConfirm={({ docs }) => {
            const selectedDocs = (docs || []).filter((d) => Boolean(d?.id)).slice(0, 2);
            const ids = selectedDocs.map((d) => String(d.id));
            setPinnedDocMetaById((prev) => {
              const next = { ...prev };
              for (const doc of selectedDocs) {
                const docId = String(doc.id);
                next[docId] = {
                  id: docId,
                  filename: getDocPrimaryName(doc),
                  title: getDocSecondaryTitle(doc) || undefined,
                  folderPath: getDocFolderPath(doc),
                };
              }
              return next;
            });
            handlePinnedDocIdsChange(ids);
          }}
        />

        {/* Action Center - render in flex container when pinned */}
        {isActionCenterPinned && (
          <ActionCenter
            open={true} // Always open when pinned
            onOpenChange={(open) => {
              if (!isActionCenterPinned) {
                setIsActionCenterOpen(open);
              }
              if (!open) {
                setPreviewDocId(null);
                setPreviewDocPage(null);
                setPreviewCitation(null);
                setIsActionCenterPinned(false);
              }
            }}
            isPinned={isActionCenterPinned}
            onPinnedChange={(pinned) => {
              setIsActionCenterPinned(pinned);
              // When unpinning, keep the action center open in overlay mode
              // Use setTimeout to ensure the overlay component mounts before setting open state
              if (!pinned) {
                setTimeout(() => setIsActionCenterOpen(true), 0);
              }
            }}
            activeDocumentId={previewDocId}
            activeDocumentPage={previewDocPage}
            onSelectDocument={handlePreviewDocument}
            onSelectCitation={setPreviewCitation}
            activeCitation={previewCitation}
            memoryDocIds={teamMemory}
            citations={actionCenterCitations}
            allDocuments={allDocs}
            activeTab={actionCenterTab}
            onTabChange={setActionCenterTab}
            citationsMode={actionCenterCitationsMode}
            onCitationsModeChange={handleSourcesModeChange}
            hasMessageScopedCitations={messageScopedCitations.length > 0}
          />
        )}
      </div>

      {/* Action Center - overlay mode when not pinned */}
      {!isActionCenterPinned && (
        <ActionCenter
          open={isSidebarOpen}
          onOpenChange={(open) => {
            if (!isActionCenterPinned) {
              setIsActionCenterOpen(open);
            }
            if (!open) {
              setPreviewDocId(null);
              setPreviewDocPage(null);
              setPreviewCitation(null);
              setIsActionCenterPinned(false);
            }
          }}
          isPinned={isActionCenterPinned}
          onPinnedChange={(pinned) => {
            setIsActionCenterPinned(pinned);
            // When pinning from overlay, close the overlay
            if (pinned) {
              setIsActionCenterOpen(false);
            }
          }}
          activeDocumentId={previewDocId}
          activeDocumentPage={previewDocPage}
          onSelectDocument={handlePreviewDocument}
          onSelectCitation={setPreviewCitation}
          activeCitation={previewCitation}
          memoryDocIds={teamMemory}
          citations={actionCenterCitations}
          allDocuments={allDocs}
          activeTab={actionCenterTab}
          onTabChange={setActionCenterTab}
          citationsMode={actionCenterCitationsMode}
          onCitationsModeChange={handleSourcesModeChange}
          hasMessageScopedCitations={messageScopedCitations.length > 0}
        />
      )}
      {
        resultsSidebarData && (
          <ResultsSidebar
            open={resultsSidebarOpen}
            onOpenChange={setResultsSidebarOpen}
            columns={resultsSidebarData.columns}
            rows={resultsSidebarData.rows}
            totalCount={resultsSidebarData.totalCount}
            docType={resultsSidebarData.docType}
          />
        )
      }
    </AppLayout >
  );
}
