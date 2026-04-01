'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/layout/app-layout';
import { useAuth } from '@/hooks/use-auth';
import { AccessDenied } from '@/components/access-denied';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { Skeleton } from '@/components/ui/skeleton';
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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useSettings } from '@/hooks/use-settings';
import { Bot, FileText, ChevronDown, Sparkles, Globe, FileSpreadsheet, FileArchive, FileImage, FileVideo, FileAudio, FileCode, File as FileGeneric, Eye, Layers, Check, Loader2, X, Download, Search, FilePlus, MessageSquare } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { CHAT_HISTORY_REFRESH_EVENT, CHAT_NEW_SESSION_EVENT } from '@/lib/chat-events';
import { apiFetch, getApiContext, ssePost } from '@/lib/api';
import { type ChatContext } from '@/components/chat-context-selector';
import { createFolderChatEndpoint } from '@/lib/folder-utils';
import { persistChatGeneratedArtifact } from '@/lib/chat-artifacts';
import {
  getWorkflowTemplateDefinition,
  listWorkflowTemplates,
  type WorkflowTemplate,
} from '@/lib/workflow-api';
import {
  getChatHistoryListModeResult,
  listChatHistorySessionArtifacts,
  getChatHistoryTranscript,
  listRecentChatHistorySessions,
  upsertChatHistoryMessage,
  upsertChatHistorySession,
} from '@/lib/chat-history';
import { useDocuments } from '@/hooks/use-documents';
import type { StoredDocument } from '@/lib/types';
import type { ActionCenterCanvas, ActionCenterJsonArtifact, CitationMeta, ActionCenterTab, GeneratedPdfPreview } from '@/components/action-center';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

const MermaidDiagram = dynamic(() => import('@/components/ai-elements/mermaid-diagram'), {
  ssr: false,
});
const DocumentResultsTable = dynamic(
  () => import('@/components/ai-elements/document-results-table').then((m) => m.DocumentResultsTable)
);
const ResultsSidebar = dynamic(
  () => import('@/components/ai-elements/results-sidebar').then((m) => m.ResultsSidebar)
);
const BrieflyChatBox = dynamic(() => import('@/components/ai-elements/briefly-chat-box'));
const LivingCharacter = dynamic(() => import('@/components/ai-elements/living-character').then(m => m.LivingCharacter), { ssr: false });
const TemplateTray = dynamic(
  () => import('@/components/chat/template-tray').then((m) => m.TemplateTray)
);
const loadFinderPicker = () => import('@/components/pickers/finder-picker');
const FinderPicker = dynamic(
  () => loadFinderPicker().then((m) => m.FinderPicker),
  { ssr: false }
);
const ActionCenter = dynamic(
  () => import('@/components/action-center').then((m) => m.ActionCenter),
  { ssr: false }
);

const JSON_ARTIFACT_WRITE_SOURCE_TOOLS = new Set([
  'save_file',
  'replace_file_chunk',
  'write_file',
  'overwrite_file',
  'generate_json_file',
  'generate_file',
]);

const CHAT_HISTORY_TITLE_REFRESH_DELAY_MS = 3500;
const ACTION_CENTER_DEFAULT_WIDTH = 560;
const ACTION_CENTER_MIN_WIDTH = 360;
const ACTION_CENTER_MAX_WIDTH = 760;
const ACTION_CENTER_STORAGE_KEY = 'briefly:chat:action-center-width';

function clampActionCenterWidth(width: number, viewportWidth: number) {
  const safeWidth = Number.isFinite(width) ? width : ACTION_CENTER_DEFAULT_WIDTH;
  const maxWidth = Math.min(
    ACTION_CENTER_MAX_WIDTH,
    Math.max(420, Math.floor(viewportWidth * 0.55))
  );
  return Math.max(
    ACTION_CENTER_MIN_WIDTH,
    Math.min(maxWidth, Math.round(safeWidth))
  );
}

function normalizeArtifactIdentityValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildStableGeneratedJsonArtifactId(params: {
  path?: unknown;
  filename?: unknown;
  title?: unknown;
  documentType?: unknown;
}) {
  const pathPart = normalizeArtifactIdentityValue(params.path);
  const filenamePart = normalizeArtifactIdentityValue(params.filename);
  const titlePart = normalizeArtifactIdentityValue(params.title);
  const documentTypePart = normalizeArtifactIdentityValue(params.documentType) || 'document';
  const identityPart = (pathPart || filenamePart || titlePart || 'artifact_json').replace(/\s+/g, ' ').trim();
  const prefix = `generated_doc_json:${documentTypePart}:`;
  const maxIdentityLength = Math.max(16, 255 - prefix.length);
  const trimmedIdentity =
    identityPart.length > maxIdentityLength ? identityPart.slice(identityPart.length - maxIdentityLength) : identityPart;
  return `${prefix}${trimmedIdentity}`;
}

function buildStableGeneratedTextArtifactId(params: {
  path?: unknown;
  filename?: unknown;
  title?: unknown;
  kind?: unknown;
}) {
  const pathPart = normalizeArtifactIdentityValue(params.path);
  const filenamePart = normalizeArtifactIdentityValue(params.filename);
  const titlePart = normalizeArtifactIdentityValue(params.title);
  const kindPart = normalizeArtifactIdentityValue(params.kind) || 'text';
  const identityPart = (pathPart || filenamePart || titlePart || 'artifact_text').replace(/\s+/g, ' ').trim();
  const prefix = `generated_doc_text:${kindPart}:`;
  const maxIdentityLength = Math.max(16, 255 - prefix.length);
  const trimmedIdentity =
    identityPart.length > maxIdentityLength ? identityPart.slice(identityPart.length - maxIdentityLength) : identityPart;
  return `${prefix}${trimmedIdentity}`;
}

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

function resolveDocIcon(fileName?: string | null, className?: string) {
  const ext = String(fileName || '').toLowerCase().split('.').pop() || '';
  switch (ext) {
    case 'pdf':
      return <FileText className={className} />;
    case 'doc':
    case 'docx':
      return <FileText className={className} />;
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileSpreadsheet className={className} />;
    case 'ppt':
    case 'pptx':
      return <Layers className={className} />;
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
    case 'zip':
    case 'rar':
    case '7z':
      return <FileArchive className={className} />;
    case 'js':
    case 'ts':
    case 'tsx':
    case 'json':
    case 'py':
    case 'md':
      return <FileCode className={className} />;
    default:
      return <FileGeneric className={className} />;
  }
}

function getGeneratedDocumentPreviewUrl(doc?: GeneratedDocumentMetadata | null): string | null {
  if (!doc) return null;
  if (typeof doc.preview_url === 'string' && doc.preview_url.trim()) return doc.preview_url.trim();
  if (typeof doc.token === 'string' && doc.token.trim()) {
    const format = getGeneratedDocumentFormat(doc);
    if (format === 'pdf') return `/api/generated-pdf/${doc.token.trim()}`;
    return `/api/generated-file/${doc.token.trim()}`;
  }
  return null;
}

function getGeneratedDocumentDownloadUrl(doc?: GeneratedDocumentMetadata | null): string | null {
  if (!doc) return null;
  if (typeof doc.download_url === 'string' && doc.download_url.trim()) return doc.download_url.trim();
  const previewUrl = getGeneratedDocumentPreviewUrl(doc);
  if (!previewUrl) return null;
  const separator = previewUrl.includes('?') ? '&' : '?';
  return `${previewUrl}${separator}download=1`;
}

function toGeneratedPdfPreview(doc?: GeneratedDocumentMetadata | null): GeneratedPdfPreview | null {
  const previewUrl = getGeneratedDocumentPreviewUrl(doc);
  if (!doc || !previewUrl) return null;
  return {
    title: doc.title || 'Generated Draft',
    fileName: doc.file_name || 'generated-document.pdf',
    previewUrl,
    downloadUrl: getGeneratedDocumentDownloadUrl(doc) || undefined,
    expiresAt: doc.expires_at,
    mimeType: doc.mime_type,
    format: getGeneratedDocumentFormat(doc),
    textPreview: typeof doc.preview_text === 'string' && doc.preview_text.trim() ? doc.preview_text : undefined,
  };
}

function getGeneratedDocumentFormat(doc?: GeneratedDocumentMetadata | null): string {
  if (!doc) return 'file';
  const explicitType = String(doc.type || '').trim().toLowerCase();
  if (explicitType && explicitType !== 'file') return explicitType;

  const mime = String(doc.mime_type || '').trim().toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'docx';
  if (mime.includes('spreadsheetml') || mime.includes('excel') || mime.includes('csv')) return 'xlsx';
  if (mime.includes('presentationml') || mime.includes('powerpoint')) return 'pptx';

  const fileName = String(doc.file_name || '').trim().toLowerCase();
  const dot = fileName.lastIndexOf('.');
  if (dot > -1 && dot < fileName.length - 1) {
    return fileName.slice(dot + 1);
  }
  return 'file';
}

function resolveAllowedLinkOrigin(rawUrl: string | undefined, defaultOrigin: string): string | null {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, defaultOrigin).origin;
  } catch {
    return null;
  }
}

function buildChatMarkdownAllowedLinkPrefixes(params: {
  citationLinkPrefix: string;
  defaultOrigin: string;
  pyserverUrl?: string;
  chatEndpoint?: string;
}): string[] {
  const prefixes = new Set<string>([
    params.citationLinkPrefix,
    '/generated-file/',
    '/generated-pdf/',
    '/api/generated-file/',
    '/api/generated-pdf/',
  ]);

  for (const candidate of [params.pyserverUrl, params.chatEndpoint]) {
    const origin = resolveAllowedLinkOrigin(candidate, params.defaultOrigin);
    if (!origin) continue;
    prefixes.add(`${origin}/generated-file/`);
    prefixes.add(`${origin}/generated-pdf/`);
  }

  return Array.from(prefixes);
}

type ChatWorkflowInvocationPayload = {
  templateId: string;
  templateVersion?: number;
  input?: Record<string, any>;
  context?: Record<string, any>;
  mode: 'run';
  invocationId?: string;
};

function parseWorkflowRunCommand(input: string): ChatWorkflowInvocationPayload | null {
  const trimmed = String(input || '').trim();
  const match = trimmed.match(/^\/workflow-run\s+([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\s+(.+))?$/i);
  if (!match) return null;

  const templateId = match[1];
  const rawInputPayload = String(match[2] || '').trim();
  let parsedInput: Record<string, any> = {};
  if (rawInputPayload) {
    try {
      const parsed = JSON.parse(rawInputPayload);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedInput = parsed as Record<string, any>;
      } else {
        parsedInput = { value: parsed };
      }
    } catch {
      parsedInput = { prompt: rawInputPayload };
    }
  }

  const invocationId = createClientRuntimeId();

  return {
    templateId,
    input: parsedInput,
    mode: 'run',
    invocationId,
  };
}

function createClientRuntimeId(): string {
  return typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
    ? (crypto as any).randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

type WorkflowInputFieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'doc'
  | 'doc_list'
  | 'folder';

type WorkflowInputField = {
  key: string;
  label: string;
  description?: string;
  kind: WorkflowInputFieldKind;
  required: boolean;
  enumOptions?: string[];
  defaultValue?: any;
  source: 'schema' | 'inferred';
};

function isPlainObjectRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeWorkflowInputKey(value: unknown): string {
  return String(value || '').trim();
}

function humanizeWorkflowInputKey(key: string): string {
  const raw = normalizeWorkflowInputKey(key);
  if (!raw) return 'Input';
  return raw
    .replace(/\[(\d+)\]/g, ' $1 ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseIndexedWorkflowInputKey(rawKey: string): { baseKey: string; index: number | null } {
  const normalized = normalizeWorkflowInputKey(rawKey);
  const match = normalized.match(/^([A-Za-z0-9_]+)\[(\d+)\]$/);
  if (!match) return { baseKey: normalized, index: null };
  return {
    baseKey: String(match[1] || '').trim(),
    index: Number(match[2]),
  };
}

function workflowFieldKindFromKey(rawKey: string): WorkflowInputFieldKind {
  const parsed = parseIndexedWorkflowInputKey(rawKey);
  const lower = parsed.baseKey.toLowerCase();
  if (lower === 'folder_path' || lower === 'folderpath' || lower.includes('folder')) return 'folder';
  if (lower === 'doc_id' || lower === 'docid' || (lower.includes('doc') && lower.endsWith('_id'))) return 'doc';
  if (
    lower === 'doc_ids'
    || lower === 'supporting_doc_ids'
    || lower === 'subject_packet_doc_ids'
    || lower.endsWith('_ids')
  ) {
    return parsed.index != null ? 'doc' : 'doc_list';
  }
  if (lower.includes('doc') && lower.endsWith('ids')) return parsed.index != null ? 'doc' : 'doc_list';
  if (lower.includes('date') || lower.endsWith('_at')) return 'date';
  if (lower.startsWith('is_') || lower.startsWith('has_') || lower.endsWith('_enabled') || lower.endsWith('_flag')) return 'boolean';
  if (lower.includes('description') || lower.includes('content') || lower.includes('notes') || lower.includes('body')) return 'textarea';
  return 'text';
}

function normalizeTemplateNodeTypeForInputs(node: any): string {
  const refKey = node?.node_ref && typeof node.node_ref === 'object'
    ? String(node.node_ref.key || '')
    : (node?.nodeRef && typeof node.nodeRef === 'object' ? String(node.nodeRef.key || '') : '');
  const raw = refKey || String(node?.node_type || node?.type || '');
  return raw.toLowerCase().trim();
}

function isTriggerNodeTypeForInputs(nodeTypeRaw: string): boolean {
  const nodeType = String(nodeTypeRaw || '').trim().toLowerCase();
  return nodeType === 'manual.trigger' || nodeType === 'chat.trigger';
}

function extractInputKeyFromTriggerStepPathForInputs(pathValue: string, nodeById: Map<string, any>): string | null {
  const raw = String(pathValue || '').trim();
  const match = raw.match(/^\$\.steps\.([A-Za-z0-9_-]+)\.output\.(.+)$/);
  if (!match) return null;
  const sourceNodeId = String(match[1] || '').trim();
  const sourceFieldPath = String(match[2] || '').trim();
  if (!sourceNodeId || !sourceFieldPath) return null;
  const sourceNode = nodeById.get(sourceNodeId);
  const sourceNodeType = normalizeTemplateNodeTypeForInputs(sourceNode);
  if (!isTriggerNodeTypeForInputs(sourceNodeType)) return null;
  const key = sourceFieldPath.split('.')[0]?.trim();
  return key || null;
}

function extractInputKeyFromPathForInputs(pathValue: string, nodeById: Map<string, any> = new Map()): string | null {
  const raw = String(pathValue || '').trim();
  if (raw.startsWith('$.input.')) {
    const remainder = raw.slice('$.input.'.length).trim();
    if (!remainder) return null;
    const key = remainder.split('.')[0]?.trim();
    return key || null;
  }
  if (raw.startsWith('$.steps.')) {
    return extractInputKeyFromTriggerStepPathForInputs(raw, nodeById);
  }
  return null;
}

function deriveWorkflowInputFieldsFromDefinition(definitionRaw: unknown): WorkflowInputField[] {
  const definition = isPlainObjectRecord(definitionRaw) ? definitionRaw : {};
  const fieldsByKey = new Map<string, WorkflowInputField>();

  const addField = (next: WorkflowInputField) => {
    const key = normalizeWorkflowInputKey(next.key);
    if (!key) return;
    const prev = fieldsByKey.get(key);
    if (!prev) {
      fieldsByKey.set(key, { ...next, key });
      return;
    }
    fieldsByKey.set(key, {
      ...prev,
      ...next,
      key,
      required: Boolean(prev.required || next.required),
      source: prev.source === 'schema' || next.source === 'schema' ? 'schema' : 'inferred',
      enumOptions: Array.isArray(next.enumOptions) && next.enumOptions.length > 0
        ? next.enumOptions
        : prev.enumOptions,
      defaultValue: next.defaultValue !== undefined ? next.defaultValue : prev.defaultValue,
      description: next.description || prev.description,
    });
  };

  const inputSchema = isPlainObjectRecord(definition.inputSchema)
    ? definition.inputSchema
    : (isPlainObjectRecord(definition.input_schema) ? definition.input_schema : null);
  const uiSchema = isPlainObjectRecord(definition.uiSchema)
    ? definition.uiSchema
    : (isPlainObjectRecord(definition.ui_schema) ? definition.ui_schema : null);
  const schemaProperties = isPlainObjectRecord(inputSchema?.properties) ? inputSchema.properties : {};
  const requiredSet = new Set(
    Array.isArray(inputSchema?.required)
      ? inputSchema.required.map((value) => String(value || '').trim()).filter(Boolean)
      : []
  );

  for (const [rawKey, rawSpec] of Object.entries(schemaProperties)) {
    const key = normalizeWorkflowInputKey(rawKey);
    if (!key) continue;
    const spec = isPlainObjectRecord(rawSpec) ? rawSpec : {};
    const uiSpec = uiSchema && isPlainObjectRecord(uiSchema[key]) ? uiSchema[key] : {};
    const enumOptions = Array.isArray(spec.enum)
      ? spec.enum.map((option) => String(option ?? '').trim()).filter(Boolean)
      : [];

    let kind: WorkflowInputFieldKind = workflowFieldKindFromKey(key);
    const schemaType = Array.isArray(spec.type)
      ? String(spec.type[0] || '').toLowerCase()
      : String(spec.type || '').toLowerCase();
    const schemaFormat = String(spec.format || '').toLowerCase();
    const uiWidget = String(uiSpec?.widget || uiSpec?.inputType || '').toLowerCase();

    if (enumOptions.length > 0) kind = 'select';
    else if (schemaType === 'boolean') kind = 'boolean';
    else if (schemaType === 'integer' || schemaType === 'number') kind = 'number';
    else if (schemaType === 'array') {
      if (kind === 'doc') kind = 'doc_list';
      if (kind !== 'doc_list') kind = 'textarea';
    } else if (schemaType === 'string' && (schemaFormat === 'date' || schemaFormat === 'date-time')) kind = 'date';
    else if (uiWidget === 'textarea' || uiWidget === 'markdown') kind = 'textarea';
    else if (uiWidget === 'date' || uiWidget === 'datetime') kind = 'date';
    else if (uiWidget === 'number') kind = 'number';
    else if (uiWidget === 'switch' || uiWidget === 'checkbox' || uiWidget === 'toggle') kind = 'boolean';

    addField({
      key,
      label: String(spec.title || uiSpec?.label || humanizeWorkflowInputKey(key)).trim() || humanizeWorkflowInputKey(key),
      description: String(spec.description || uiSpec?.description || '').trim() || undefined,
      kind,
      required: requiredSet.has(key),
      enumOptions: enumOptions.length > 0 ? enumOptions : undefined,
      defaultValue: spec.default,
      source: 'schema',
    });
  }

  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const nodeById = new Map<string, any>();
  for (const node of nodes) {
    const nodeId = String(node?.id || '').trim();
    if (!nodeId) continue;
    nodeById.set(nodeId, node);
  }

  for (const node of nodes) {
    const inputBindings = isPlainObjectRecord(node?.input_bindings) ? node.input_bindings : {};
    for (const rawPath of Object.values(inputBindings)) {
      const path = String(rawPath || '').trim();
      if (!path) continue;
      const inputKey = extractInputKeyFromPathForInputs(path, nodeById);
      if (!inputKey) continue;
      addField({
        key: inputKey,
        label: humanizeWorkflowInputKey(inputKey),
        kind: workflowFieldKindFromKey(inputKey),
        required: true,
        source: 'inferred',
      });
    }
  }

  const fields = Array.from(fieldsByKey.values());
  const kindWeight: Record<WorkflowInputFieldKind, number> = {
    doc: 1,
    doc_list: 2,
    folder: 3,
    text: 4,
    textarea: 5,
    number: 6,
    date: 7,
    select: 8,
    boolean: 9,
  };
  return fields.sort((a, b) => {
    const requiredDelta = Number(b.required) - Number(a.required);
    if (requiredDelta !== 0) return requiredDelta;
    const kindDelta = (kindWeight[a.kind] || 99) - (kindWeight[b.kind] || 99);
    if (kindDelta !== 0) return kindDelta;
    return a.label.localeCompare(b.label);
  });
}

function workflowInputHasValue(field: WorkflowInputField, value: unknown): boolean {
  if (field.kind === 'boolean') return typeof value === 'boolean';
  if (field.kind === 'number') return Number.isFinite(Number(value));
  if (field.kind === 'doc_list') return Array.isArray(value) && value.filter(Boolean).length > 0;
  if (field.kind === 'folder') {
    if (Array.isArray(value)) return value.filter(Boolean).length > 0;
    return String(value || '').trim().length > 0;
  }
  if (field.kind === 'doc') return String(value || '').trim().length > 0;
  if (value == null) return false;
  return String(value).trim().length > 0;
}

function normalizeWorkflowFieldValueForSubmit(field: WorkflowInputField, value: unknown): unknown {
  if (value == null) return value;
  if (field.kind === 'boolean') return Boolean(value);
  if (field.kind === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (field.kind === 'doc_list') {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
    return [String(value || '').trim()].filter(Boolean);
  }
  if (field.kind === 'doc') return String(value || '').trim();
  if (field.kind === 'folder') {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
    const raw = String(value || '').trim();
    return raw ? raw.split('/').map((item) => item.trim()).filter(Boolean) : [];
  }
  if (field.kind === 'date') return String(value || '').trim();
  if (field.kind === 'select') return String(value || '').trim();
  if (field.kind === 'textarea') return String(value || '').trim();
  return String(value || '').trim();
}

function buildWorkflowRunUserMessage(templateName: string, input: Record<string, any>): string {
  const safeTemplate = String(templateName || 'Workflow').trim() || 'Workflow';
  const keys = Object.keys(input || {});
  if (keys.length === 0) {
    return `Run workflow: ${safeTemplate}`;
  }
  const previewPairs = keys.slice(0, 3).map((key) => {
    const value = input[key];
    if (Array.isArray(value)) return `${key}=${value.length} item(s)`;
    if (typeof value === 'object' && value !== null) return `${key}=object`;
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return `${key}=blank`;
    return `${key}=${text.length > 40 ? `${text.slice(0, 37)}...` : text}`;
  });
  const remaining = keys.length - previewPairs.length;
  const suffix = remaining > 0 ? ` (+${remaining} more)` : '';
  return `Run workflow: ${safeTemplate} (${previewPairs.join(', ')}${suffix})`;
}

const TEXT_CANVAS_FORMATS = new Set([
  'txt',
  'text',
  'md',
  'markdown',
  'json',
  'csv',
  'tsv',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
]);

function isTextLikeGeneratedDocument(doc?: GeneratedDocumentMetadata | null): boolean {
  if (!doc) return false;
  const format = getGeneratedDocumentFormat(doc).toLowerCase();
  if (TEXT_CANVAS_FORMATS.has(format)) return true;
  const mime = String(doc.mime_type || '').toLowerCase();
  return mime.startsWith('text/') || mime.includes('json') || mime.includes('xml');
}

function getCanvasKindForGeneratedDocument(doc?: GeneratedDocumentMetadata | null): 'text' | 'markdown' {
  const format = getGeneratedDocumentFormat(doc).toLowerCase();
  return format === 'md' || format === 'markdown' ? 'markdown' : 'text';
}

const CHART_PALETTE = ['#FF7A30', '#FF9A5C', '#FFB37E', '#FFCBA1', '#F97316', '#FB923C'] as const;

function friendlyColumnName(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Value';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatExactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}

function normalizeChartSpec(metadata?: ChatResultsMetadata | null): ChatChartSpec | null {
  if (!metadata) return null;
  const candidate = metadata.chart_spec || metadata.chartSpec;
  if (!candidate || typeof candidate !== 'object') return null;

  const rawPoints = Array.isArray(candidate.points) ? candidate.points : [];
  const points = rawPoints
    .map((point: any, index: number): ChatChartPoint | null => {
      const numericValue = Number(point?.value);
      if (!Number.isFinite(numericValue)) return null;
      const rawLabel = String(point?.label || `Item ${index + 1}`).trim();
      return {
        label: rawLabel || `Item ${index + 1}`,
        value: numericValue,
      };
    })
    .filter((point): point is ChatChartPoint => Boolean(point));

  if (points.length < 2) return null;

  const requestedType = String(candidate.type || 'bar').toLowerCase();
  const chartType = requestedType === 'line' || requestedType === 'pie' ? requestedType : 'bar';

  return {
    type: chartType,
    title: typeof candidate.title === 'string' ? candidate.title : undefined,
    valueColumn: typeof candidate.valueColumn === 'string' ? candidate.valueColumn : undefined,
    labelColumn:
      typeof candidate.labelColumn === 'string'
        ? candidate.labelColumn
        : candidate.labelColumn === null
          ? null
          : undefined,
    points,
    truncated: Boolean(candidate.truncated),
  };
}

function getChartNotice(metadata?: ChatResultsMetadata | null): string | null {
  const notice = metadata?.chart_notice || metadata?.chartNotice;
  if (typeof notice !== 'string') return null;
  const trimmed = notice.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function InlineResponseChart({ spec }: { spec: ChatChartSpec }) {
  const points = Array.isArray(spec.points) ? spec.points : [];
  if (points.length < 2) return null;

  const chartType = spec.type === 'line' || spec.type === 'pie' ? spec.type : 'bar';
  const valueLabel = friendlyColumnName(spec.valueColumn || 'value');
  const title = spec.title || `${valueLabel} by ${friendlyColumnName(spec.labelColumn || 'label')}`;
  const chartData = points.map((point) => ({ label: point.label, value: point.value }));
  const totalValue = chartData.reduce((sum, entry) => sum + entry.value, 0);
  const highestEntry = chartData.reduce((best, entry) => (entry.value > best.value ? entry : best), chartData[0]);
  const lowestEntry = chartData.reduce((best, entry) => (entry.value < best.value ? entry : best), chartData[0]);
  const shareEnabled = totalValue > 0 && chartData.every((entry) => entry.value >= 0);
  const legendRows = chartData.map((entry, index) => {
    const share = shareEnabled ? entry.value / totalValue : null;
    return {
      ...entry,
      share,
      color: chartType === 'pie' ? CHART_PALETTE[index % CHART_PALETTE.length] : '#FF7A30',
    };
  });
  const chartConfig = useMemo(
    () => ({
      value: {
        label: valueLabel,
        color: '#FF7A30',
      },
    }),
    [valueLabel]
  );

  return (
    <div className="mt-2 sm:mt-3 rounded-xl border border-border/50 bg-muted/10 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs sm:text-sm font-semibold text-foreground">{title}</p>
        <Badge variant="outline" className="text-[10px] sm:text-xs">
          {points.length} point{points.length === 1 ? '' : 's'}
        </Badge>
      </div>

      <ChartContainer config={chartConfig} className="mt-2 h-[260px] w-full !aspect-auto">
        {chartType === 'line' ? (
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 6, bottom: 24 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              angle={-24}
              textAnchor="end"
              height={64}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(value) => formatCompactNumber(Number(value))}
            />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCompactNumber(Number(value))} />} />
            <Line dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 4 }} />
          </LineChart>
        ) : chartType === 'pie' ? (
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCompactNumber(Number(value))} />} />
            <Pie data={chartData} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={44} outerRadius={90} paddingAngle={2}>
              {chartData.map((entry, index) => (
                <Cell key={`${entry.label}-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 6, bottom: 24 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              angle={-24}
              textAnchor="end"
              height={64}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(value) => formatCompactNumber(Number(value))}
            />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCompactNumber(Number(value))} />} />
            <Bar dataKey="value" fill="var(--color-value)" radius={[8, 8, 0, 0]} />
          </BarChart>
        )}
      </ChartContainer>

      <div className="mt-3 rounded-lg border border-border/40 bg-background/50 p-2.5 sm:p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-border/50 bg-muted/40 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="text-xs sm:text-sm font-semibold text-foreground tabular-nums">{formatExactNumber(totalValue)}</p>
          </div>
          <div className="rounded-md border border-border/50 bg-muted/40 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Highest</p>
            <p className="truncate text-xs sm:text-sm font-semibold text-foreground" title={highestEntry.label}>
              {highestEntry.label}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">{formatExactNumber(highestEntry.value)}</p>
          </div>
          <div className="rounded-md border border-border/50 bg-muted/40 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Lowest</p>
            <p className="truncate text-xs sm:text-sm font-semibold text-foreground" title={lowestEntry.label}>
              {lowestEntry.label}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">{formatExactNumber(lowestEntry.value)}</p>
          </div>
        </div>

        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Data Details
        </p>
        <div className="space-y-1.5">
          {legendRows.map((entry, index) => (
            <div key={`${entry.label}-${index}`} className="flex items-center justify-between gap-3 text-xs sm:text-sm">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden
                />
                <span className="w-5 shrink-0 text-[11px] text-muted-foreground tabular-nums">{index + 1}.</span>
                <span className="truncate text-foreground" title={entry.label}>
                  {entry.label}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {entry.share !== null ? (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {formatPercent(entry.share)}
                  </span>
                ) : null}
                <span className="font-medium tabular-nums text-foreground">
                  {formatExactNumber(entry.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {spec.truncated ? (
        <p className="mt-2 text-[11px] sm:text-xs text-muted-foreground">Showing a subset of points for readability.</p>
      ) : null}
    </div>
  );
}

const TEMPLATE_SELECTOR_STATUSES = new Set(['ok', 'template_required', 'invalid_template']);
const DOCUMENT_WORKFLOW_AWAITING_INPUT_STATUSES = new Set([
  'collecting_details',
  'awaiting_details',
  'awaiting_missing_fields',
]);

function normalizeWorkflowFieldLabel(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[_()]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMissingFieldCandidates(
  missingField: string | { key?: string; label?: string }
): string[] {
  if (typeof missingField === 'string') {
    const normalized = normalizeWorkflowFieldLabel(missingField);
    return normalized ? [normalized] : [];
  }
  const tokens = [
    normalizeWorkflowFieldLabel(String(missingField?.key || '')),
    normalizeWorkflowFieldLabel(String(missingField?.label || '')),
  ].filter(Boolean);
  return Array.from(new Set(tokens));
}

function userInputLikelyFulfillsMissingFields(
  input: string,
  missingFields: Array<string | { key?: string; label?: string }>
): boolean {
  const text = String(input || '').trim();
  if (!text || !Array.isArray(missingFields) || missingFields.length === 0) return false;
  const normalizedInput = normalizeWorkflowFieldLabel(text);
  if (!normalizedInput) return false;

  return missingFields.every((field) => {
    const candidates = extractMissingFieldCandidates(field);
    if (candidates.length === 0) return false;
    return candidates.some((candidate) => {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const explicitPattern = new RegExp(`\\b${escaped}\\b\\s*(?::|=|\\bto\\b)`, 'i');
      if (explicitPattern.test(text)) return true;
      // Accept relaxed mentions for short trailing turns.
      return normalizedInput.includes(candidate);
    });
  });
}

function buildTemplateSelectPrompt(template: DocumentTemplateOption): string {
  return `Template selected: template_id "${template.template_id}". Continue document generation with this template.`;
}

function getIslandCategory(templateId: string): string {
  const id = templateId.toLowerCase();
  if (id.includes('sale_deed')) return 'Legal';
  if (id.includes('invoice') || id.includes('gst')) return 'Finance';
  if (id.includes('development')) return 'Legal';
  if (id.includes('tds')) return 'Tax';
  if (id.includes('payment')) return 'Finance';
  return 'Document';
}

function SelectedTemplateIsland({
  templateName,
  templateId,
  badge,
  hasCapturedValues,
  onAutofill,
}: {
  templateName: string;
  templateId: string;
  badge?: string;
  hasCapturedValues: boolean;
  onAutofill: () => void;
}) {
  const islandRef = React.useRef<HTMLDivElement>(null);
  const [autofillState, setAutofillState] = React.useState<'idle' | 'working' | 'done'>('idle');

  // Entrance animation
  React.useEffect(() => {
    const island = islandRef.current;
    if (!island) return;
    const t = setTimeout(() => {
      island.style.opacity = '1';
      island.style.transform = 'translateY(0) scale(1)';
    }, 300);
    return () => clearTimeout(t);
  }, []);

  // Use a ref to always have the latest onAutofill callback (avoids stale closure in setTimeout)
  const onAutofillRef = React.useRef(onAutofill);
  onAutofillRef.current = onAutofill;

  const handleAutofill = () => {
    if (autofillState !== 'idle') return;
    setAutofillState('working');

    // Fire autofill IMMEDIATELY — don't wait for animation (avoids stale closure bug)
    onAutofillRef.current();

    // Visual feedback only (decorative, does not block the actual call)
    setTimeout(() => {
      setAutofillState('done');

      // Haptic pulse on island
      const island = islandRef.current;
      if (island) {
        island.animate(
          [
            { transform: 'scale(1)', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04)' },
            { transform: 'scale(1.02)', boxShadow: '0 20px 50px rgba(255, 122, 48, 0.15)' },
            { transform: 'scale(1)', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04)' },
          ],
          { duration: 400, easing: 'cubic-bezier(0.19, 1, 0.22, 1)' }
        );
      }
    }, 1200);
  };

  const category = getIslandCategory(templateId);

  return (
    <div style={{ perspective: '1000px' }}>
      <style>{`
        @keyframes island-status-pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div
        ref={islandRef}
        style={{
          height: '52px',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 122, 48, 0.2)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '16px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(255, 255, 255, 0.5)',
          opacity: 0,
          transform: 'translateY(12px) scale(0.98)',
          transition: 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)',
          cursor: 'default',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 12px 40px rgba(255, 122, 48, 0.1)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(255, 255, 255, 0.5)';
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
        }}
      >
        {/* Left: Doc Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              background: '#FFF5F0',
              color: '#FF7A30',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileText style={{ width: '16px', height: '16px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                textTransform: 'uppercase' as const,
                color: '#6B7280',
                letterSpacing: '0.05em',
              }}
            >
              {category}
            </span>
            <h3
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#111827',
                margin: 0,
                whiteSpace: 'nowrap' as const,
              }}
            >
              {templateName}
            </h3>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', background: 'rgba(0,0,0,0.06)' }} />

        {/* Center: Prompt with Autofill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!hasCapturedValues ? (
            <p style={{ fontSize: '13px', color: '#6B7280', fontWeight: 500, margin: 0, whiteSpace: 'nowrap' as const }}>
              Add details or type{' '}
              <span
                onClick={handleAutofill}
                style={{
                  background: autofillState === 'working' ? '#111827' : autofillState === 'done' ? '#FF7A30' : '#FF7A30',
                  color: 'white',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '11px',
                  cursor: autofillState === 'idle' ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                  display: 'inline-block',
                  boxShadow: '0 4px 10px rgba(255, 122, 48, 0.2)',
                  pointerEvents: autofillState === 'idle' ? 'auto' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (autofillState === 'idle') {
                    e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                    e.currentTarget.style.filter = 'brightness(1.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.filter = '';
                }}
              >
                {autofillState === 'idle' ? 'autofill' : autofillState === 'working' ? 'AI Working...' : 'Autofilled ✓'}
              </span>
            </p>
          ) : (
            <p style={{ fontSize: '13px', color: '#6B7280', fontWeight: 500, margin: 0 }}>
              Fields captured
            </p>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', background: 'rgba(0,0,0,0.06)' }} />

        {/* Right: Status */}
        <div
          style={{
            background: '#F3F4F6',
            padding: '6px 12px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginLeft: 'auto',
          }}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              background: '#FF7A30',
              borderRadius: '50%',
              animation: 'island-status-pulse 2s infinite',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase' as const,
              color: '#111827',
              letterSpacing: '0.02em',
            }}
          >
            Selected
          </span>
        </div>
      </div>
    </div>
  );
}

function isDocumentCreationKickoffPrompt(input: string): boolean {
  const text = (input || '').toLowerCase();
  if (!text) return false;
  if (text.includes('template_id:')) return false;
  return (
    text.includes('create a document') ||
    text.includes('create document') ||
    text.includes('creating a document') ||
    text.includes('creating document') ||
    text.includes('help me create') ||
    text.includes('help me in creating') ||
    text.includes('create a document for me') ||
    text.includes('create document for me') ||
    text.includes('generate a document') ||
    text.includes('generate document') ||
    text.includes('show templates') ||
    text.includes('document templates')
  );
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

const SPREADSHEET_FILE_PICKER_DOC_TYPES = ['csv', 'excel', 'spreadsheetml'] as const;

function isSpreadsheetDocument(doc?: DocLike | null): boolean {
  const primaryName = getDocPrimaryName(doc).toLowerCase();
  const ext = primaryName.includes('.') ? primaryName.split('.').pop() || '' : '';
  if (ext === 'csv' || ext === 'xls' || ext === 'xlsx') return true;

  const mime = String(doc?.mime_type || doc?.mimeType || '').trim().toLowerCase();
  return mime.includes('csv') || mime.includes('spreadsheetml') || mime.includes('excel');
}

function buildSpreadsheetAnalystKickoffPrompt(attachedDocs: AttachedDocMeta[]): string {
  const names = attachedDocs
    .map((doc) => String(doc.filename || '').trim())
    .filter(Boolean)
    .slice(0, 2);

  const subject = names.length <= 1
    ? 'the attached spreadsheet'
    : `the attached spreadsheets (${names.join(', ')})`;

  return [
    `Analyze ${subject}.`,
    'Start by identifying the sheets or tables, the key columns and metrics, and any obvious data-quality issues.',
    'Then suggest and perform the most useful spreadsheet-specific analysis such as pivots, comparisons, trends, joins, or reconciliations grounded in the attached file(s).',
  ].join(' ');
}

function formatDocPathLabel(path?: string[] | null): string {
  const cleaned = Array.isArray(path) ? path.filter(Boolean) : [];
  return cleaned.length > 0 ? `/${cleaned.join('/')}` : '/Root';
}

function isFolderPathPrefix(path?: string[] | null, prefix?: string[] | null): boolean {
  const pathParts = Array.isArray(path) ? path.filter(Boolean) : [];
  const prefixParts = Array.isArray(prefix) ? prefix.filter(Boolean) : [];
  if (prefixParts.length === 0) return true;
  if (pathParts.length < prefixParts.length) return false;
  return prefixParts.every((segment, index) => String(pathParts[index]) === String(segment));
}

function normalizeNumericBbox(raw: any): number[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw) && raw.length === 4) {
    const values = raw.map((value) => Number(value));
    return values.every((value) => Number.isFinite(value)) ? values : undefined;
  }
  if (typeof raw === 'object') {
    const x = raw.x ?? raw.l;
    const y = raw.y ?? raw.t;
    const width = raw.width ?? ((raw.r != null && raw.l != null) ? Number(raw.r) - Number(raw.l) : null);
    const height = raw.height ?? ((raw.b != null && raw.t != null) ? Number(raw.b) - Number(raw.t) : null);
    const values = [Number(x), Number(y), Number(width), Number(height)];
    return values.every((value) => Number.isFinite(value)) ? values : undefined;
  }
  return undefined;
}

function normalizeStringArray(values: any): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const normalized = Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
  return normalized.length > 0 ? normalized : undefined;
}

function mapPyserverSourceRowToCitation(raw: any): CitationMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const nestedFields = raw.fields && typeof raw.fields === 'object' ? raw.fields : {};
  const n = Number.parseInt(String(raw?.citation_number ?? ''), 10);
  const pageParsed = typeof raw.page_number === 'number'
    ? raw.page_number
    : Number.parseInt(String(raw.page_number ?? nestedFields.page_number ?? ''), 10);
  const docId = typeof raw.doc_id === 'string' && raw.doc_id.trim()
    ? raw.doc_id.trim()
    : (typeof nestedFields.doc_id === 'string' && nestedFields.doc_id.trim()
      ? nestedFields.doc_id.trim()
      : (typeof raw.source_id === 'string' && raw.source_id.trim()
        ? raw.source_id.trim()
        : (typeof nestedFields.source_id === 'string' && nestedFields.source_id.trim() ? nestedFields.source_id.trim() : '')));
  const filename = typeof raw.source === 'string' && raw.source.trim()
    ? raw.source.trim()
    : (typeof raw.file_name === 'string' && raw.file_name.trim()
      ? raw.file_name.trim()
      : (typeof nestedFields.file_name === 'string' && nestedFields.file_name.trim()
        ? nestedFields.file_name.trim()
        : (docId || 'Unknown')));
  const sourceType = typeof raw.source_type === 'string' && raw.source_type.trim()
    ? raw.source_type.trim()
    : (typeof nestedFields.doc_type === 'string' && nestedFields.doc_type.trim() ? nestedFields.doc_type.trim() : 'document');
  const url = typeof raw.url === 'string' && raw.url.trim()
    ? raw.url.trim()
    : (typeof nestedFields.url === 'string' && nestedFields.url.trim() ? nestedFields.url.trim() : undefined);
  const chunkId = typeof raw.chunk_id === 'string' && raw.chunk_id.trim()
    ? raw.chunk_id.trim()
    : (typeof nestedFields.chunk_id === 'string' && nestedFields.chunk_id.trim() ? nestedFields.chunk_id.trim() : undefined);
  const chunkSequence = raw.chunk_sequence ?? nestedFields.chunk_sequence ?? undefined;
  const bbox = normalizeNumericBbox(raw.bbox ?? nestedFields.bbox);
  const bboxOrigin = typeof raw.bbox_origin === 'string' && raw.bbox_origin.trim()
    ? raw.bbox_origin.trim()
    : (typeof nestedFields.bbox_origin === 'string' && nestedFields.bbox_origin.trim() ? nestedFields.bbox_origin.trim() : undefined);
  const pageWidth = Number.isFinite(Number(raw.page_width ?? nestedFields.page_width)) ? Number(raw.page_width ?? nestedFields.page_width) : undefined;
  const pageHeight = Number.isFinite(Number(raw.page_height ?? nestedFields.page_height)) ? Number(raw.page_height ?? nestedFields.page_height) : undefined;
  const evidenceIds = normalizeStringArray(raw.evidence_ids ?? nestedFields.evidence_ids);
  const primaryEvidenceId = typeof raw.primary_evidence_id === 'string' && raw.primary_evidence_id.trim()
    ? raw.primary_evidence_id.trim()
    : (typeof nestedFields.primary_evidence_id === 'string' && nestedFields.primary_evidence_id.trim() ? nestedFields.primary_evidence_id.trim() : undefined);
  const anchorStatus = typeof raw.anchor_status === 'string' && raw.anchor_status.trim()
    ? raw.anchor_status.trim()
    : (typeof nestedFields.anchor_status === 'string' && nestedFields.anchor_status.trim() ? nestedFields.anchor_status.trim() : undefined);
  const anchorIds = normalizeStringArray(raw.anchor_ids ?? nestedFields.anchor_ids);

  return {
    citationId: Number.isFinite(n) && n > 0 ? `cite_${n}` : undefined,
    docId: docId || undefined,
    docName: filename,
    filename,
    title: filename,
    page: Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : null,
    chunkId,
    sourceType,
    docType: sourceType,
    relevance: raw.relevance ?? undefined,
    snippet: typeof raw.content_preview === 'string' ? raw.content_preview : undefined,
    excerpt: typeof raw.content_preview === 'string' ? raw.content_preview : undefined,
    url,
    bbox,
    ...(bboxOrigin ? { bbox_origin: bboxOrigin } : {}),
    ...(pageWidth ? { page_width: pageWidth } : {}),
    ...(pageHeight ? { page_height: pageHeight } : {}),
    ...(evidenceIds ? { evidenceIds } : {}),
    ...(primaryEvidenceId ? { primaryEvidenceId } : {}),
    ...(anchorStatus ? { anchorStatus } : {}),
    ...(anchorIds ? { anchorIds } : {}),
    fields: {
      ...(raw.fields && typeof raw.fields === 'object' ? raw.fields : {}),
      file_name: filename,
      page_number: Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : (raw.page_number ?? nestedFields.page_number),
      doc_type: sourceType,
      citation_number: raw.citation_number,
      citation_label: raw.citation_label,
      source_id: raw.source_id ?? nestedFields.source_id,
      doc_id: docId || undefined,
      chunk_id: chunkId,
      chunk_sequence: chunkSequence,
      bbox,
      bbox_origin: bboxOrigin,
      page_width: pageWidth,
      page_height: pageHeight,
      evidence_ids: evidenceIds,
      primary_evidence_id: primaryEvidenceId,
      anchor_status: anchorStatus,
      anchor_ids: anchorIds,
    },
  } as CitationMeta;
}

function dedupeCitations(citations: CitationMeta[] = []): CitationMeta[] {
  const seenIndex = new Map<string, number>();
  const result: CitationMeta[] = [];

  for (const citation of citations) {
    if (!citation) continue;
    const chunkKey =
      citation.chunkId ||
      citation.fields?.chunk_id ||
      citation.fields?.chunkId ||
      citation.fields?.chunk_sequence ||
      citation.fields?.chunkSequence;
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
type WorkflowStepState = 'pending' | 'in_progress' | 'completed' | 'error';
type DocumentWorkflowStep = {
  key: 'extract' | 'create_pdf' | 'respond';
  label: string;
  state: WorkflowStepState;
  icon: React.ReactNode;
};

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

const DEEP_STAGE_LABELS: Record<string, string> = {
  intake: 'Deep research intake',
  planning: 'Planning deep research',
  retrieval: 'Gathering evidence',
  extraction: 'Extracting evidence',
  reasoning: 'Reasoning over evidence',
  verification: 'Verifying findings',
  synthesis: 'Synthesizing deep findings',
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
  const key = canonicalActivityKey(step.step || step.title || step.description);
  if (!label) return false;
  if (label === 'processing' || label === 'processing...' || label === 'working...' || label === 'working') {
    return false;
  }
  if (
    key === 'teamrunstarted' ||
    key === 'teamruncompleted' ||
    key === 'runstarted' ||
    key === 'runcompleted' ||
    key === 'modelrequeststarted' ||
    key === 'modelrequestcompleted' ||
    key === 'teammodelrequeststarted' ||
    key === 'teammodelrequestcompleted' ||
    key.startsWith('skill_')
  ) {
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
  if (
    toolKey === 'delegate_task_to_member' ||
    toolKey === 'get_skill_instructions' ||
    toolKey === 'get_skill_reference' ||
    toolKey === 'get_skill_script'
  ) {
    return false;
  }
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
      if (key.startsWith('get_skill_')) return null;
      if (key === 'delegate_task_to_member') return null;
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

  const fallback = steps.filter((step) => {
    const key = canonicalActivityKey(step.step || step.title || step.description);
    return Boolean(key && mapStageIdFromKey(key));
  });
  return fallback.slice(0, 6);
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

function hasAnyCapturedDocumentFields(workflow: any): boolean {
  const captured = workflow?.captured_fields;
  if (!captured || typeof captured !== 'object') return false;
  return Object.values(captured).some((value) => String(value || '').trim().length > 0);
}

function resolveWorkflowStepState(options: {
  completed: boolean;
  inProgress: boolean;
  errored?: boolean;
}): WorkflowStepState {
  if (options.errored) return 'error';
  if (options.completed) return 'completed';
  if (options.inProgress) return 'in_progress';
  return 'pending';
}

function buildDocumentWorkflowSteps(
  message: Message
): DocumentWorkflowStep[] | null {
  const workflow = message.metadata?.document_workflow;
  const workflowStatus = String(workflow?.status || '').trim().toLowerCase();
  const hasGeneratedDocument = Boolean(message.metadata?.generated_document);
  const documentTool = (message.tools || []).find((tool) => {
    const key = canonicalActivityKey(tool.toolId || tool.name || tool.description);
    return key === 'run_document_generation_tool';
  });
  const toolStatus = documentTool ? normalizeActivityStatus(documentTool.status) : null;
  const hasDocumentSignals = Boolean(workflow) || hasGeneratedDocument || Boolean(documentTool);
  if (!hasDocumentSignals) return null;
  const isTemplateSelectionStage = TEMPLATE_SELECTOR_STATUSES.has(workflowStatus);
  // Never show workflow progress while the user is still choosing a template.
  if (isTemplateSelectionStage) return null;

  const isStreaming = Boolean(message.isStreaming);
  const hasCapturedValues = hasAnyCapturedDocumentFields(workflow);
  const hasContent = String(message.content || '').trim().length > 0;
  const workflowIsComplete = ['completed', 'done', 'success'].includes(workflowStatus);
  const workflowCreatingPdf = ['creating_pdf', 'generating_pdf', 'rendering_pdf'].includes(workflowStatus);
  const waitingForInput = DOCUMENT_WORKFLOW_AWAITING_INPUT_STATUSES.has(workflowStatus);
  const workflowHasError =
    ['error', 'failed', 'failure'].includes(workflowStatus) ||
    workflowStatus.includes('failed') ||
    workflowStatus.includes('error') ||
    Boolean(workflow?.error) ||
    toolStatus === 'error';
  const workflowCanRender =
    hasGeneratedDocument ||
    workflowIsComplete ||
    workflowCreatingPdf ||
    workflowStatus === 'generating_response' ||
    workflowStatus === 'responding' ||
    workflowHasError;
  if (!workflowCanRender) return null;

  const extractCompleted = hasCapturedValues || workflowIsComplete || hasGeneratedDocument || workflowCreatingPdf;
  const extractInProgress =
    !extractCompleted && (isStreaming || toolStatus === 'in_progress' || waitingForInput);

  const createCompleted = hasGeneratedDocument || workflowIsComplete;
  const createInProgress =
    !createCompleted &&
    (
      (workflowCreatingPdf && (isStreaming || toolStatus === 'in_progress')) ||
      (
        hasCapturedValues &&
        !waitingForInput &&
        (isStreaming || toolStatus === 'in_progress')
      )
    );

  const responseCompleted = (workflowIsComplete || hasGeneratedDocument) && !isStreaming && hasContent;
  const responseInProgress =
    !responseCompleted &&
    (
      workflowStatus === 'generating_response' ||
      workflowStatus === 'responding' ||
      (isStreaming && (workflowCreatingPdf || createInProgress))
    );

  return [
    {
      key: 'extract',
      label: 'Extracting Info',
      icon: <Search className="h-3.5 w-3.5" />,
      state: resolveWorkflowStepState({
        completed: extractCompleted,
        inProgress: extractInProgress,
        errored: workflowHasError && !extractCompleted,
      }),
    },
    {
      key: 'create_pdf',
      label: 'Creating PDF',
      icon: <FilePlus className="h-3.5 w-3.5" />,
      state: resolveWorkflowStepState({
        completed: createCompleted,
        inProgress: createInProgress,
        errored: workflowHasError && extractCompleted && !createCompleted,
      }),
    },
    {
      key: 'respond',
      label: 'Generating Response',
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      state: resolveWorkflowStepState({
        completed: responseCompleted,
        inProgress: responseInProgress,
        errored: workflowHasError && createCompleted && !responseCompleted,
      }),
    },
  ];
}

function sanitizeAssistantContentForDisplay(message: Message): string {
  const raw = String(message.content || '');
  if (!raw) return '';
  return raw.replace(/\n{3,}/g, '\n\n').trim();
}

function deriveCanvasTitleFromMessage(message: Message, content: string): string {
  const generatedDocTitle = String(message.metadata?.generated_document?.title || '').trim();
  if (generatedDocTitle) return generatedDocTitle;

  const firstLine = String(content || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return 'Canvas Draft';

  const cleaned = firstLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^>\s+/, '')
    .trim();

  return (cleaned || 'Canvas Draft').slice(0, 80);
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
  const citationLinkPrefix = '/__briefly_citation__/';

  // Extract mermaid fenced blocks and replace with placeholders to avoid interfering with citation parsing
  const mermaidBlocks: string[] = [];
  const MERMAID_RE = /```mermaid\s*([\s\S]*?)```/g;
  let contentWithPlaceholders = content.replace(MERMAID_RE, (_m, code) => {
    const idx = mermaidBlocks.push(String(code || '').trim()) - 1;
    return `⟦⟦MMD:${idx}⟧⟧`;
  });

  // Protect markdown table blocks from inline citation substitution.
  // Splitting table markdown with React citation components breaks table parsing.
  const tableBlocks: string[] = [];
  const TABLE_DIVIDER_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
  const extractMarkdownTables = (input: string): string => {
    const lines = input.split('\n');
    const out: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const header = lines[i] || '';
      const divider = lines[i + 1] || '';
      const looksLikeTableStart = header.includes('|') && TABLE_DIVIDER_RE.test(divider.trim());

      if (!looksLikeTableStart) {
        out.push(header);
        i += 1;
        continue;
      }

      const block: string[] = [header, divider];
      i += 2;
      while (i < lines.length) {
        const row = lines[i] || '';
        if (!row.trim() || !row.includes('|')) break;
        block.push(row);
        i += 1;
      }

      const idx = tableBlocks.push(block.join('\n')) - 1;
      out.push(`⟦⟦TBL:${idx}⟧⟧`);
    }

    return out.join('\n');
  };
  contentWithPlaceholders = extractMarkdownTables(contentWithPlaceholders);

  // Preserve newlines exactly to avoid breaking markdown blocks (lists, headings)
  const preserveNewlines = (text: string) => text;

  const liftCitationMarkersFromInlineSpan = (
    input: string,
    pattern: RegExp,
    wrap: (cleaned: string, citations: string) => string
  ) =>
    input.replace(pattern, (full, inner: string) => {
      const markers: string[] = [];
      const cleanedInner = String(inner || '')
        .replace(/\s*(\[(?:\^)?\d+\])/g, (_marker, citationMarker: string) => {
          markers.push(citationMarker);
          return '';
        })
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

      if (markers.length === 0) return full;
      return `${wrap(cleanedInner, markers.join(' '))}`;
    });

  const normalizeInlineCitationFormatting = (input: string) => {
    let normalized = input;
    normalized = liftCitationMarkersFromInlineSpan(
      normalized,
      /\*\*([^*\n]+?)\*\*/g,
      (cleaned, citations) => `**${cleaned}** ${citations}`
    );
    normalized = liftCitationMarkersFromInlineSpan(
      normalized,
      /`([^`\n]+?)`/g,
      (cleaned, citations) => `\`${cleaned}\` ${citations}`
    );
    return normalized;
  };

  contentWithPlaceholders = normalizeInlineCitationFormatting(contentWithPlaceholders);

  const isInlineMarkdownChunk = (text: string) => {
    const value = String(text || '');
    if (!value.trim()) return true;
    if (/\n\s*\n/.test(value)) return false;
    return !/(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|~~~)/m.test(value);
  };

  const responseClassNameFor = (text: string) =>
    isInlineMarkdownChunk(text)
      ? "inline w-auto h-auto align-baseline [&>p]:inline [&>p]:m-0 [&>p]:whitespace-pre-wrap [&>p]:align-baseline [&>p]:leading-[inherit]"
      : "block w-auto h-auto align-baseline";

  const buildDuplicateCitationLabels = (matchedCitations: CitationMeta[]) => {
    const labels = new Set<string>();
    for (const citation of matchedCitations || []) {
      const candidates = [
        getCitationDisplayTitle(citation),
        (citation as any)?.filename,
        citation?.docName,
        citation?.title,
        citation?.name,
      ];
      for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) labels.add(value);
      }
    }
    return [...labels].sort((a, b) => b.length - a.length);
  };

  const stripTrailingDuplicateCitationText = (text: string, labels: string[]) => {
    const original = String(text || '');
    const trimmedRight = original.replace(/\s+$/, '');

    for (const label of labels) {
      const suffixes = [
        `**${label}**`,
        `**'${label}'**`,
        `**"${label}"**`,
        `'${label}'`,
        `"${label}"`,
        `\`${label}\``,
        label,
      ];

      for (const suffix of suffixes) {
        if (trimmedRight.toLowerCase().endsWith(suffix.toLowerCase())) {
          return trimmedRight.slice(0, trimmedRight.length - suffix.length).replace(/[ \t]+$/, '');
        }
      }
    }

    return original;
  };

  let markdownComponents: any = undefined;
  const markdownDefaultOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost:9002';
  const markdownAllowedLinkPrefixes = buildChatMarkdownAllowedLinkPrefixes({
    citationLinkPrefix,
    defaultOrigin: markdownDefaultOrigin,
    pyserverUrl: process.env.NEXT_PUBLIC_PYSERVER_URL,
    chatEndpoint: process.env.NEXT_PUBLIC_CHATNEW_ENDPOINT,
  });

  // Helper to render text while restoring protected placeholders.
  const renderTextWithPlaceholders = (text: string, keyPrefix: string) => {
    const elements: JSX.Element[] = [];
    const placeholderRe = /⟦⟦(MMD|TBL):(\d+)⟧⟧/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null = null;

    while ((match = placeholderRe.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const plainText = text.slice(lastIndex, match.index);
        if (plainText) {
          elements.push(
            <Response
              key={`${keyPrefix}-txt-${elements.length}`}
              className={responseClassNameFor(plainText)}
              components={markdownComponents}
              defaultOrigin={markdownDefaultOrigin}
              allowedLinkPrefixes={markdownAllowedLinkPrefixes}
            >
              {plainText}
            </Response>
          );
        }
      }

      const kind = match[1];
      const idx = parseInt(match[2], 10);
      if (kind === 'MMD') {
        const code = mermaidBlocks[idx] || '';
        elements.push(
          <div key={`${keyPrefix}-mmd-${elements.length}`} className="my-3 overflow-auto">
            <MermaidDiagram code={code} />
          </div>
        );
      } else {
        const tableMarkdown = cleanDanglingCitationMarkers(tableBlocks[idx] || '');
        if (tableMarkdown) {
          elements.push(
            <Response
              key={`${keyPrefix}-tbl-${elements.length}`}
              className="block w-full my-3"
              components={markdownComponents}
              defaultOrigin={markdownDefaultOrigin}
              allowedLinkPrefixes={markdownAllowedLinkPrefixes}
            >
              {tableMarkdown}
            </Response>
          );
        }
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const trailingText = text.slice(lastIndex);
      if (trailingText) {
        elements.push(
          <Response
            key={`${keyPrefix}-txt-${elements.length}`}
            className={responseClassNameFor(trailingText)}
            components={markdownComponents}
            defaultOrigin={markdownDefaultOrigin}
            allowedLinkPrefixes={markdownAllowedLinkPrefixes}
          >
            {trailingText}
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
  // Support both legacy footnote markers ([^1]) and backend-emitted inline markers ([1]).
  const individualCitationPattern = /\[(?:\^)?(\d+)\](?!\()/g;
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
  const citationData: Array<{ index: number; href: string; length: number; duplicateLabels: string[] }> = [];
  const citationGroupsByHref = new Map<string, CitationMeta[]>();

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
      })).filter(item => item.url);

      if (sourceData.length > 0) {
        const href = `${citationLinkPrefix}${group.citationNumbers.join(',')}`;
        citationGroupsByHref.set(href, matchedCitations);

        citationData.push({
          index: group.startIndex,
          length: group.length,
          duplicateLabels: buildDuplicateCitationLabels(matchedCitations),
          href,
        });
      }
    }
  }

  // If no citations found, clean and return
  if (citationData.length === 0) {
    const cleaned = cleanDanglingCitationMarkers(contentWithPlaceholders).trim();
    return <span className="inline">{renderTextWithPlaceholders(cleaned, `clean`)}</span>;
  }

  // Sort citations by index (forward order)
  citationData.sort((a, b) => a.index - b.index);

  markdownComponents = {
    a: ({ href, children, ...props }: any) => {
      const resolvedHref = String(href || '');
      if (!resolvedHref.startsWith(citationLinkPrefix)) {
        return <a href={href} {...props}>{children}</a>;
      }

      const matchedCitations = citationGroupsByHref.get(resolvedHref) || [];
      if (matchedCitations.length === 0) {
        return null;
      }

      const sourceData = matchedCitations
        .map((cit: any) => ({
          url: cit.docId ? `/documents/${cit.docId}` : (cit.url || ''),
          title: getCitationDisplayTitle(cit),
          citation: cit,
        }))
        .filter((item) => item.url);

      if (sourceData.length === 0) {
        return null;
      }

      const sourceUrls = sourceData.map((item) => item.url);
      const firstTitle = sourceData[0].title;
      const extraCount = sourceData.length > 1 ? sourceData.length - 1 : 0;

      return (
        <InlineCitation className="inline">
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
      );
    },
  };

  let transformedContent = '';
  let lastIndex = 0;

  for (const citation of citationData) {
    if (citation.index > lastIndex) {
      let textBefore = contentWithPlaceholders.slice(lastIndex, citation.index);
      textBefore = stripTrailingDuplicateCitationText(textBefore, citation.duplicateLabels);
      transformedContent += preserveNewlines(textBefore);
    }
    if (transformedContent.length > 0 && !/[\s(]$/.test(transformedContent)) {
      transformedContent += ' ';
    }
    transformedContent += `[source](${citation.href})`;
    lastIndex = citation.index + citation.length;
  }

  if (lastIndex < contentWithPlaceholders.length) {
    transformedContent += preserveNewlines(contentWithPlaceholders.slice(lastIndex));
  }

  const cleaned = cleanDanglingCitationMarkers(transformedContent).trim();
  const renderedParts = renderTextWithPlaceholders(cleaned, 'content');

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

type DocumentWorkflowArtifactRef = {
  artifact_id?: string;
  revision?: number;
  artifact_type?: string;
};

type DocumentTemplateOption = {
  template_id: string;
  name: string;
  description?: string;
  field_count?: number;
  sample_field_labels?: string[];
  accent_from?: string;
  accent_to?: string;
  badge?: string;
  publisher?: string;
};

type ChatChartPoint = {
  label: string;
  value: number;
};

type ChatChartSpec = {
  type?: string;
  title?: string;
  valueColumn?: string;
  labelColumn?: string | null;
  points?: ChatChartPoint[];
  truncated?: boolean;
};

type ChatResultsMetadata = {
  list_mode?: boolean;
  results_data?: Array<Record<string, any>>;
  columns?: string[];
  doc_type?: string | null;
  total_count?: number;
  has_more?: boolean;
  query_type?: string | null;
  chart_spec?: ChatChartSpec | null;
  chart_notice?: string | null;
  chartSpec?: ChatChartSpec | null;
  chartNotice?: string | null;
  generated_document?: GeneratedDocumentMetadata | null;
  workflow_invocation?: {
    template_id?: string;
    template_version?: number | null;
    invocation_id?: string | null;
    mode?: string | null;
    status?: string | null;
    run_id?: string | null;
    input?: Record<string, any>;
    context?: Record<string, any>;
  } | null;
  document_workflow?: {
    type?: string;
    status?: string;
    template_id?: string;
    template_name?: string;
    suggested_template_id?: string | null;
    templates?: DocumentTemplateOption[];
    missing_fields?: Array<string | { key?: string; label?: string }>;
    assistant_hint?: string;
    captured_fields?: Record<string, string>;
    attempted_fields?: Record<string, string>;
    artifact_ref?: DocumentWorkflowArtifactRef | null;
    requested_changes_unmet?: string[];
    ambiguous_references?: string[];
    warnings?: string[];
    error?: string;
  } | null;
  deep_research?: {
    requested?: boolean;
    enabled?: boolean;
    max_minutes?: number;
    strict_citations?: boolean;
    planner_model?: string | null;
    synth_model?: string | null;
  } | null;
};

type AttachedDocMeta = {
  id: string;
  filename: string;
  title?: string;
  folderPath?: string[];
};

type FileNavigatorMode = 'general' | 'spreadsheet';
type SpecializedChatMode = 'spreadsheet_analyst';

type ChatHistoryFrontendContextSnapshot = {
  version?: number;
  surface?: 'chatnew' | 'chat_workbench';
  chatContext?: ChatContext;
  pinnedDocIds?: string[];
  pinnedDocMetaById?: Record<string, AttachedDocMeta>;
  specializedMode?: SpecializedChatMode | null;
  webSearchEnabled?: boolean;
  deepResearchEnabled?: boolean;
};

type DocLike = {
  filename?: string | null;
  name?: string | null;
  title?: string | null;
  folderPath?: string[] | null;
  folder_path?: string[] | null;
  mime_type?: string | null;
  mimeType?: string | null;
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
const CHAT_HISTORY_TRANSCRIPT_INITIAL_LIMIT = 120;
const CHAT_HISTORY_TRANSCRIPT_OLDER_PAGE_SIZE = 120;
const CHAT_HISTORY_LIST_MODE_PREVIEW_ROWS = 10;
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
  const [activeSpecializedMode, setActiveSpecializedMode] = useState<SpecializedChatMode | null>(null);
  const [fileNavigatorMode, setFileNavigatorMode] = useState<FileNavigatorMode | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const [isWebSearchDialogOpen, setIsWebSearchDialogOpen] = useState(false);
  const [pendingWebSearchToggle, setPendingWebSearchToggle] = useState<boolean | null>(null);
  const chatWorkflowUiEnabled =
    String(process.env.NEXT_PUBLIC_CHAT_WORKFLOWS_ENABLED || 'true').toLowerCase() !== 'false';
  const chatWorkflowInputCardEnabled =
    chatWorkflowUiEnabled &&
    String(process.env.NEXT_PUBLIC_CHAT_WORKFLOW_INPUT_CARD_ENABLED || 'true').toLowerCase() !== 'false';
  const [isWorkflowDialogOpen, setIsWorkflowDialogOpen] = useState(false);
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([]);
  const [isWorkflowTemplatesLoading, setIsWorkflowTemplatesLoading] = useState(false);
  const [workflowTemplatesError, setWorkflowTemplatesError] = useState<string | null>(null);
  const [selectedWorkflowTemplateId, setSelectedWorkflowTemplateId] = useState<string>('');
  const [selectedWorkflowTemplateVersion, setSelectedWorkflowTemplateVersion] = useState<number | undefined>(undefined);
  const [workflowInputFields, setWorkflowInputFields] = useState<WorkflowInputField[]>([]);
  const [workflowInputValues, setWorkflowInputValues] = useState<Record<string, any>>({});
  const [workflowFormError, setWorkflowFormError] = useState<string | null>(null);
  const [isWorkflowDefinitionLoading, setIsWorkflowDefinitionLoading] = useState(false);
  const [workflowFieldPickerState, setWorkflowFieldPickerState] = useState<{
    open: boolean;
    key: string | null;
    kind: 'doc' | 'doc_list' | 'folder';
  }>({ open: false, key: null, kind: 'doc' });
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const workflowDraftHydratedKeyRef = useRef<string | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewDocPage, setPreviewDocPage] = useState<number | null>(null);
  const [previewCitation, setPreviewCitation] = useState<CitationMeta | null>(null);
  const [generatedPdfPreview, setGeneratedPdfPreview] = useState<GeneratedPdfPreview | null>(null);
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);
  const showTokenUsage = process.env.NEXT_PUBLIC_CHAT_USAGE_DEBUG === 'true';
  const hasAnyMessage = messages.length > 0;
  const hasUserMessage = messages.some(m => m.role === 'user');
  const {
    documents: allDocs,
    folders: allFolders,
    hasLoadedAll: hasLoadedAllDocuments,
    loadAllDocuments,
    getFolderMetadata,
  } = useDocuments();
  const { bootstrapData } = useAuth();
  const [loadingMoreByMessageId, setLoadingMoreByMessageId] = useState<Record<string, boolean>>({});
  const [emptyStateVariantIndex, setEmptyStateVariantIndex] = useState(0);
  const [chatHistoryHasMoreBefore, setChatHistoryHasMoreBefore] = useState(false);
  const [chatHistoryOldestSequence, setChatHistoryOldestSequence] = useState<number | null>(null);
  const [isLoadingOlderChatHistory, setIsLoadingOlderChatHistory] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  const activeStreamAbortControllerRef = useRef<AbortController | null>(null);
  const agentSessionIdRef = useRef<string | null>(null);
  const chatHistoryHydratedKeyRef = useRef<string | null>(null);
  const [isHydratingChatHistory, setIsHydratingChatHistory] = useState(false);
  const [hydratedChatSessionTitle, setHydratedChatSessionTitle] = useState<string | null>(null);
  const resetAgentSessionId = useCallback(() => {
    const nextAgentSessionId = createClientRuntimeId();
    agentSessionIdRef.current = nextAgentSessionId;
    return nextAgentSessionId;
  }, []);
  const ensureAgentSessionId = useCallback(() => {
    if (agentSessionIdRef.current) return agentSessionIdRef.current;
    return resetAgentSessionId();
  }, [resetAgentSessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const preload = () => {
      void loadFinderPicker();
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const handle = idleWindow.requestIdleCallback(preload, { timeout: 2000 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timeout = window.setTimeout(preload, 1200);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    ensureAgentSessionId();
  }, [ensureAgentSessionId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const lastListMessageId = useMemo(() => {
    const listMessages = messages.filter(m => m.metadata?.list_mode && Array.isArray(m.metadata?.results_data));
    return listMessages.length ? listMessages[listMessages.length - 1].id : null;
  }, [messages]);

  const selectedWorkflowTemplate = useMemo(() => {
    if (!selectedWorkflowTemplateId) return null;
    return workflowTemplates.find((template) => template.id === selectedWorkflowTemplateId) || null;
  }, [selectedWorkflowTemplateId, workflowTemplates]);

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

  const fetchPersistedListModeResultsForMessage = useCallback(async (chatSessionId: string, clientMessageId: string) => {
    try {
      return await getChatHistoryListModeResult(chatSessionId, clientMessageId);
    } catch (error) {
      console.warn('Failed to fetch persisted chat history list-mode result', error);
      return null;
    }
  }, []);

  const fetchAllResultsForMessage = useCallback(async (messageId: string) => {
    const { orgId } = getApiContext();
    if (!sessionId) return;
    const runtimeSessionId = agentSessionIdRef.current || sessionId;

    setLoadingMoreByMessageId(prev => ({ ...prev, [messageId]: true }));
    try {
      let data: any = null;
      let pyserverFetchFailed = false;
      if (orgId) {
        try {
          data = await apiFetch(`/orgs/${orgId}/chat/results`, {
            method: 'POST',
            body: {
              session_id: sessionId,
              agent_session_id: runtimeSessionId,
              fetch_all: true
            }
          });
        } catch (error) {
          pyserverFetchFailed = true;
          console.error('Failed to fetch full results', error);
        }
      }

      const hasRowsFromPrimary = Array.isArray(data?.results_data) && data.results_data.length > 0;
      if (!hasRowsFromPrimary) {
        const persisted = await fetchPersistedListModeResultsForMessage(sessionId, messageId);
        if (persisted) {
          data = {
            ...data,
            ...persisted,
            results_data: Array.isArray(persisted.results_data) ? persisted.results_data : [],
            columns: Array.isArray(persisted.columns) ? persisted.columns : (data?.columns || []),
          };
        } else if (!orgId && !pyserverFetchFailed) {
          return;
        }
      }

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
  }, [fetchPersistedListModeResultsForMessage, sessionId]);

  const openWorkflowDialog = useCallback(() => {
    if (!chatWorkflowInputCardEnabled) return;
    setWorkflowFormError(null);
    setWorkflowTemplatesError(null);
    setIsWorkflowDialogOpen(true);
  }, [chatWorkflowInputCardEnabled]);

  const closeWorkflowDialog = useCallback(() => {
    setIsWorkflowDialogOpen(false);
    setWorkflowFormError(null);
    setWorkflowFieldPickerState({ open: false, key: null, kind: 'doc' });
  }, []);

  const setWorkflowInputValue = useCallback((key: string, value: unknown) => {
    const normalizedKey = normalizeWorkflowInputKey(key);
    if (!normalizedKey) return;
    const hasInputField = (inputKey: string) => workflowInputFields.some(
      (field) => normalizeWorkflowInputKey(field.key) === inputKey
    );
    const normalizeDocIds = (raw: unknown): string[] => {
      if (Array.isArray(raw)) return raw.map((item) => String(item || '').trim()).filter(Boolean);
      const single = String(raw || '').trim();
      return single ? [single] : [];
    };

    setWorkflowInputValues((prev) => {
      const next: Record<string, any> = { ...prev, [normalizedKey]: value };
      if (normalizedKey === 'doc_id') {
        const docId = String(value || '').trim();
        if (hasInputField('doc_ids')) {
          next.doc_ids = docId ? [docId] : [];
        }
      } else if (normalizedKey === 'doc_ids') {
        const docIds = normalizeDocIds(value);
        if (hasInputField('doc_id')) {
          next.doc_id = docIds[0] || '';
        }
      }
      return next;
    });
    setWorkflowFormError(null);
  }, [workflowInputFields]);

  useEffect(() => {
    if (!isWorkflowDialogOpen || !chatWorkflowInputCardEnabled) return;
    let cancelled = false;
    (async () => {
      setIsWorkflowTemplatesLoading(true);
      setWorkflowTemplatesError(null);
      try {
        const response = await listWorkflowTemplates(false, true);
        if (cancelled) return;
        const templates = (Array.isArray(response?.templates) ? response.templates : [])
          .filter((template) => template?.is_active !== false)
          .sort((a, b) => {
            const aTime = Date.parse(String(a?.updated_at || a?.created_at || 0));
            const bTime = Date.parse(String(b?.updated_at || b?.created_at || 0));
            return bTime - aTime;
          });
        setWorkflowTemplates(templates);
        setSelectedWorkflowTemplateId((prev) => {
          if (prev && templates.some((template) => template.id === prev)) return prev;
          return templates[0]?.id || '';
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load workflow templates for chat', error);
        setWorkflowTemplates([]);
        setSelectedWorkflowTemplateId('');
        setWorkflowTemplatesError('Unable to load workflow templates right now.');
      } finally {
        if (!cancelled) {
          setIsWorkflowTemplatesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatWorkflowInputCardEnabled, isWorkflowDialogOpen]);

  useEffect(() => {
    if (!isWorkflowDialogOpen || !selectedWorkflowTemplateId) return;
    let cancelled = false;
    (async () => {
      setIsWorkflowDefinitionLoading(true);
      setWorkflowFormError(null);
      try {
        const response = await getWorkflowTemplateDefinition(selectedWorkflowTemplateId);
        if (cancelled) return;
        const definition = isPlainObjectRecord(response?.version?.definition) ? response.version.definition : {};
        const nextFields = deriveWorkflowInputFieldsFromDefinition(definition);
        const nextValues: Record<string, any> = {};
        nextFields.forEach((field) => {
          if (field.defaultValue !== undefined) {
            nextValues[field.key] = field.defaultValue;
          } else if (field.kind === 'boolean') {
            nextValues[field.key] = false;
          }
        });
        setWorkflowInputFields(nextFields);
        setWorkflowInputValues((prev) => {
          const merged: Record<string, any> = { ...nextValues };
          for (const field of nextFields) {
            if (Object.prototype.hasOwnProperty.call(prev, field.key)) {
              merged[field.key] = prev[field.key];
            }
          }
          return merged;
        });
        const parsedVersion = Number(response?.version?.version || 0);
        setSelectedWorkflowTemplateVersion(Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : undefined);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load workflow template definition for chat', error);
        setWorkflowInputFields([]);
        setWorkflowInputValues({});
        setSelectedWorkflowTemplateVersion(undefined);
        setWorkflowFormError('Failed to load workflow input contract. You can pick another workflow and retry.');
      } finally {
        if (!cancelled) {
          setIsWorkflowDefinitionLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isWorkflowDialogOpen, selectedWorkflowTemplateId]);

  const activeWorkflowPickerField = useMemo(() => {
    if (!workflowFieldPickerState.key) return null;
    return workflowInputFields.find((field) => field.key === workflowFieldPickerState.key) || null;
  }, [workflowFieldPickerState.key, workflowInputFields]);

  const [isActionCenterOpen, setIsActionCenterOpen] = useState(false);
  const [isActionCenterPinned, setIsActionCenterPinned] = useState(false);
  const [actionCenterWidth, setActionCenterWidth] = useState(ACTION_CENTER_DEFAULT_WIDTH);
  const [isActionCenterResizing, setIsActionCenterResizing] = useState(false);
  const [actionCenterTab, setActionCenterTab] = useState<ActionCenterTab>('sources');
  const [actionCenterCitations, setActionCenterCitations] = useState<CitationMeta[]>([]);
  const [messageScopedCitations, setMessageScopedCitations] = useState<CitationMeta[]>([]);
  const [actionCenterCitationsMode, setActionCenterCitationsMode] = useState<'global' | 'message'>('global');
  const [citationsModeLock, setCitationsModeLock] = useState<'global' | null>(null);
  const citationsModeLockRef = useRef<'global' | null>(null);
  const autoCanvasSourceRef = useRef<string | null>(null);
  const autoPinnedArtifactRef = useRef<string | null>(null);
  const persistedArtifactSyncRef = useRef<Record<string, string>>({});
  const [chatNewArtifactAutoPinEnabled, setChatNewArtifactAutoPinEnabled] = useState(true);
  const isSidebarOpen = isActionCenterOpen;
  const shouldRenderActionCenter = isActionCenterPinned || isSidebarOpen;
  const [teamMemory, setTeamMemory] = useState<string[]>([]);
  const [actionCenterCanvas, setActionCenterCanvas] = useState<ActionCenterCanvas | null>(null);
  const [actionCenterJsonArtifact, setActionCenterJsonArtifact] = useState<ActionCenterJsonArtifact | null>(null);
  const actionCenterLayoutStyle = useMemo(
    () => ({ '--action-center-width': `${actionCenterWidth}px` } as React.CSSProperties),
    [actionCenterWidth]
  );
  const searchParams = useSearchParams();
  const isChatNewRoute =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/chatnew');
  const requestedChatSessionId = useMemo(() => {
    if (!isChatNewRoute) return null;
    const raw = String(searchParams?.get('session') || '').trim();
    if (!raw) return null;
    return /^[0-9a-fA-F-]{36}$/.test(raw) ? raw : null;
  }, [isChatNewRoute, searchParams]);
  const workflowDraftStorageKey = useMemo(() => {
    const baseSessionId = requestedChatSessionId || sessionId;
    if (!baseSessionId) return null;
    return `briefly:chatnew:workflow-draft:${baseSessionId}`;
  }, [requestedChatSessionId, sessionId]);
  const shouldAutoCollapseLeftNav = isChatNewRoute && hasUserMessage;
  const previousRequestedChatSessionIdRef = useRef<string | null>(null);
  const handleActionCenterWidthChange = useCallback((nextWidth: number) => {
    if (typeof window === 'undefined') {
      setActionCenterWidth(nextWidth);
      return;
    }
    setActionCenterWidth(clampActionCenterWidth(nextWidth, window.innerWidth));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rawStoredWidth = window.localStorage.getItem(ACTION_CENTER_STORAGE_KEY);
    const storedWidth = rawStoredWidth == null ? Number.NaN : Number(rawStoredWidth);
    setActionCenterWidth(
      clampActionCenterWidth(
        Number.isFinite(storedWidth) ? storedWidth : ACTION_CENTER_DEFAULT_WIDTH,
        window.innerWidth
      )
    );
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACTION_CENTER_STORAGE_KEY, String(actionCenterWidth));
  }, [actionCenterWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setActionCenterWidth((currentWidth) =>
        clampActionCenterWidth(currentWidth, window.innerWidth)
      );
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!chatWorkflowInputCardEnabled || !isWorkflowDialogOpen || !workflowDraftStorageKey) return;
    if (typeof window === 'undefined') return;
    if (workflowDraftHydratedKeyRef.current === workflowDraftStorageKey) return;
    try {
      const raw = window.localStorage.getItem(workflowDraftStorageKey);
      if (!raw) {
        workflowDraftHydratedKeyRef.current = workflowDraftStorageKey;
        return;
      }
      const parsed = JSON.parse(raw);
      const templateId = normalizeWorkflowInputKey(parsed?.templateId);
      const templateVersion = Number(parsed?.templateVersion || 0);
      const inputValues = isPlainObjectRecord(parsed?.inputValues) ? parsed.inputValues : {};
      if (templateId) setSelectedWorkflowTemplateId(templateId);
      setSelectedWorkflowTemplateVersion(Number.isFinite(templateVersion) && templateVersion > 0 ? templateVersion : undefined);
      setWorkflowInputValues(inputValues);
      workflowDraftHydratedKeyRef.current = workflowDraftStorageKey;
    } catch (error) {
      console.warn('Failed to hydrate workflow input draft from storage', error);
      workflowDraftHydratedKeyRef.current = workflowDraftStorageKey;
    }
  }, [chatWorkflowInputCardEnabled, isWorkflowDialogOpen, workflowDraftStorageKey]);

  useEffect(() => {
    if (!chatWorkflowInputCardEnabled || !workflowDraftStorageKey) return;
    if (typeof window === 'undefined') return;
    const hasDraft = Boolean(selectedWorkflowTemplateId) || Object.keys(workflowInputValues).length > 0;
    if (!hasDraft) {
      window.localStorage.removeItem(workflowDraftStorageKey);
      return;
    }
    try {
      window.localStorage.setItem(workflowDraftStorageKey, JSON.stringify({
        templateId: selectedWorkflowTemplateId || null,
        templateVersion: selectedWorkflowTemplateVersion || null,
        inputValues: workflowInputValues,
        updatedAt: Date.now(),
      }));
    } catch (error) {
      console.warn('Failed to persist workflow input draft', error);
    }
  }, [
    chatWorkflowInputCardEnabled,
    selectedWorkflowTemplateId,
    selectedWorkflowTemplateVersion,
    workflowDraftStorageKey,
    workflowInputValues,
  ]);

  const emitChatHistoryRefresh = useCallback((detail?: { sessionId?: string; reason?: string }) => {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent(CHAT_HISTORY_REFRESH_EVENT, { detail }));
    } catch {
      window.dispatchEvent(new Event(CHAT_HISTORY_REFRESH_EVENT));
    }
  }, []);

  const mapPersistedChatHistoryMessageToUi = useCallback((stored: any): Message | null => {
    if (!stored || typeof stored !== 'object') return null;
    const role = stored.role === 'user' || stored.role === 'assistant' ? stored.role : null;
    if (!role) return null;
    const normalizePersistedCitation = (raw: any): CitationMeta | null => {
      if (!raw || typeof raw !== 'object') return null;

      // Already in UI citation shape (or close enough).
      if (
        typeof raw.docId === 'string' ||
        typeof raw.url === 'string' ||
        typeof raw.citationId === 'string'
      ) {
        return raw as CitationMeta;
      }

      // pyserver "sources" row shape persisted into chat_messages.citations via gateway enrichment.
      const hasPyserverSourceShape =
        typeof raw.source_id === 'string' ||
        typeof raw.source === 'string' ||
        raw.page_number !== undefined ||
        typeof raw.source_type === 'string';
      if (hasPyserverSourceShape) {
        return mapPyserverSourceRowToCitation(raw);
      }

      return raw as CitationMeta;
    };
    const citations = dedupeCitations(
      (Array.isArray(stored.citations) ? stored.citations : [])
        .map(normalizePersistedCitation)
        .filter((c: CitationMeta | null): c is CitationMeta => Boolean(c))
    );
    const toEpochMs = (value: unknown): number | undefined => {
      if (typeof value !== 'string' && !(value instanceof Date)) return undefined;
      const ts = new Date(value as any).getTime();
      return Number.isFinite(ts) ? ts : undefined;
    };
    const attachedDocs = Array.isArray(stored.attached_docs_json)
      ? stored.attached_docs_json.filter((d: any) => d && typeof d.id === 'string')
      : undefined;
    const attachedDocIds = Array.isArray(stored.attached_doc_ids)
      ? stored.attached_doc_ids.filter((id: any) => typeof id === 'string' && id)
      : (attachedDocs ? attachedDocs.map((d: any) => String(d.id)) : undefined);
    return {
      id: String(stored.client_message_id || stored.id),
      role,
      content: typeof stored.content === 'string' ? stored.content : '',
      citations,
      citationAnchors: Array.isArray(stored.citation_anchors) ? stored.citation_anchors : undefined,
      evidenceSpans: Array.isArray(stored.evidence_spans) ? stored.evidence_spans : undefined,
      citationVersion: typeof stored.citation_version === 'string' ? stored.citation_version : null,
      citationMetrics: stored.citation_metrics && typeof stored.citation_metrics === 'object' ? stored.citation_metrics : null,
      // Hydrated transcript messages are shown in settled mode; live streaming only applies
      // to the current in-flight turn.
      isStreaming: false,
      usage: stored.usage && typeof stored.usage === 'object' ? stored.usage : undefined,
      metadata: stored.metadata && typeof stored.metadata === 'object' ? stored.metadata : null,
      processingSteps: Array.isArray(stored.processing_steps_json) ? stored.processing_steps_json : [],
      tools: Array.isArray(stored.tools_json) ? stored.tools_json : [],
      agent: stored.agent_info ?? null,
      streamRunId: typeof stored.run_id === 'string' ? stored.run_id : null,
      streamStartedAtMs: toEpochMs(stored.stream_started_at),
      streamLastEventSeq: Number.isFinite(Number(stored.stream_last_event_seq))
        ? Number(stored.stream_last_event_seq)
        : undefined,
      streamLastEventTs: toEpochMs(stored.stream_last_event_ts),
      attachedDocIds,
      attachedDocs,
    };
  }, []);

  const shouldRetryDeferredChatHistoryEnrichment = useCallback((storedMessages: any[]): boolean => {
    if (!Array.isArray(storedMessages) || storedMessages.length === 0) return false;
    const latestAssistant = [...storedMessages].reverse().find((m: any) => m && m.role === 'assistant');
    if (!latestAssistant || typeof latestAssistant !== 'object') return false;
    if (String(latestAssistant.status || '') !== 'complete') return false;
    if (typeof latestAssistant.run_id !== 'string' || !latestAssistant.run_id.trim()) return false;

    const hasRichPayload =
      (Array.isArray(latestAssistant.citations) && latestAssistant.citations.length > 0) ||
      (latestAssistant.metadata && typeof latestAssistant.metadata === 'object') ||
      (Array.isArray(latestAssistant.processing_steps_json) && latestAssistant.processing_steps_json.length > 0) ||
      (Array.isArray(latestAssistant.tools_json) && latestAssistant.tools_json.length > 0) ||
      (Array.isArray(latestAssistant.citation_anchors) && latestAssistant.citation_anchors.length > 0) ||
      (Array.isArray(latestAssistant.evidence_spans) && latestAssistant.evidence_spans.length > 0);
    if (hasRichPayload) return false;

    const createdMs = new Date(String(latestAssistant.created_at || '')).getTime();
    const updatedMs = new Date(String(latestAssistant.updated_at || '')).getTime();
    if (!Number.isFinite(createdMs) || !Number.isFinite(updatedMs)) return true;
    return Math.abs(updatedMs - createdMs) <= 10000;
  }, []);

  useEffect(() => {
    if (!isChatNewRoute) return;
    // Only hydrate when an explicit ?session=xxx is provided.
    // Visiting /chatnew without a session param always starts a fresh chat.
    if (!requestedChatSessionId) return;
    if (!bootstrapData) return;
    const { orgId } = getApiContext();
    if (!orgId) return;
    if (chatHistoryHydratedKeyRef.current === requestedChatSessionId) return;
    setIsHydratingChatHistory(true);

    // If we already have messages and we're switching to a *different* session,
    // clear the current conversation state so the new session can be loaded.
    if (messagesRef.current.length > 0) {
      setMessages([]);
      setHydratedChatSessionTitle(null);
      messagesRef.current = [];
      setLastListDocIds([]);
      setIsLoading(false);
      setInputValue('');
      setPinnedDocIds([]);
      setPinnedDocMetaById({});
      setActiveSpecializedMode(null);
      setPreviewDocId(null);
      setGeneratedPdfPreview(null);
      setIsActionCenterOpen(false);
      setActionCenterTab('sources');
      setActionCenterCitationsMode('global');
      setActionCenterCitations([]);
      setMessageScopedCitations([]);
      setActionCenterCanvas(null);
      setActionCenterJsonArtifact(null);
      autoCanvasSourceRef.current = null;
      autoPinnedArtifactRef.current = null;
    }

    let cancelled = false;
    let deferredRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const transcript = await getChatHistoryTranscript(requestedChatSessionId, {
          mode: 'lite',
          limit: CHAT_HISTORY_TRANSCRIPT_INITIAL_LIMIT,
        });
        if (cancelled) return;
        const rawTranscriptMessages = Array.isArray(transcript?.messages) ? transcript.messages : [];
        setHydratedChatSessionTitle(
          typeof transcript?.session?.title === 'string' && transcript.session.title.trim().length > 0
            ? transcript.session.title
            : null
        );

        const snapshot = (transcript?.session?.frontend_context || null) as ChatHistoryFrontendContextSnapshot | null;
        if (snapshot?.chatContext && typeof snapshot.chatContext === 'object') {
          setChatContext(snapshot.chatContext as ChatContext);
        }
        if (Array.isArray(snapshot?.pinnedDocIds)) {
          const safePinned = snapshot!.pinnedDocIds!.filter((id) => typeof id === 'string' && id).slice(0, 2);
          setPinnedDocIds(safePinned);
        }
        if (snapshot?.pinnedDocMetaById && typeof snapshot.pinnedDocMetaById === 'object') {
          setPinnedDocMetaById(snapshot.pinnedDocMetaById);
        }
        setActiveSpecializedMode(snapshot?.specializedMode === 'spreadsheet_analyst' ? 'spreadsheet_analyst' : null);
        if (typeof snapshot?.webSearchEnabled === 'boolean') {
          setWebSearchEnabled(snapshot.webSearchEnabled);
        }
        if (typeof snapshot?.deepResearchEnabled === 'boolean') {
          setDeepResearchEnabled(snapshot.deepResearchEnabled);
        }

        const restoredMessages = rawTranscriptMessages
          .map(mapPersistedChatHistoryMessageToUi)
          .filter((m): m is Message => Boolean(m));

        setSessionId(String(transcript?.session?.id || requestedChatSessionId));
        setChatHistoryHasMoreBefore(Boolean(transcript?.page?.has_more_before));
        setChatHistoryOldestSequence(
          Number.isFinite(Number(transcript?.page?.oldest_sequence))
            ? Number(transcript?.page?.oldest_sequence)
            : null
        );
        if (restoredMessages.length > 0) {
          setMessages(restoredMessages);
          const restoredDocIds = Array.from(
            new Set(
              restoredMessages
                .flatMap((m) => (m.citations || []).map((c: any) => c?.docId))
                .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            )
          );
          if (restoredDocIds.length > 0) setLastListDocIds(restoredDocIds.slice(0, 5));
        }

        let restoredAnyArtifact = false;

        try {
          const artifactResp = await listChatHistorySessionArtifacts(requestedChatSessionId, 100);
          if (cancelled) return;
          const artifactRows = Array.isArray(artifactResp?.artifacts) ? artifactResp.artifacts : [];
          const latestAssistantMessage = [...restoredMessages].reverse().find((m) => m.role === 'assistant') || null;

          const latestJsonArtifact = artifactRows.find((row: any) =>
            row &&
            row.artifactType === 'generated_doc_json' &&
            row.payloadJson &&
            typeof row.payloadJson === 'object' &&
            !Array.isArray(row.payloadJson)
          );
          if (latestJsonArtifact) {
            const artifactData = latestJsonArtifact.payloadJson;
            const artifactTitle =
              (typeof latestJsonArtifact.title === 'string' && latestJsonArtifact.title.trim()) ||
              'Document JSON';
            const documentType =
              (typeof latestJsonArtifact.documentType === 'string' && latestJsonArtifact.documentType.trim()) ||
              (typeof artifactData?.document_type === 'string' && artifactData.document_type.trim()) ||
              (typeof artifactData?.doc_type === 'string' && artifactData.doc_type.trim()) ||
              null;
            const schemaVersion =
              (typeof latestJsonArtifact.schemaVersion === 'string' && latestJsonArtifact.schemaVersion.trim()) ||
              (typeof artifactData?.schema_version === 'string' && artifactData.schema_version.trim()) ||
              (typeof artifactData?.template_version === 'string' && artifactData.template_version.trim()) ||
              null;
            const artifactId =
              (typeof latestJsonArtifact.clientArtifactId === 'string' && latestJsonArtifact.clientArtifactId.trim()) ||
              buildStableGeneratedJsonArtifactId({
                title: artifactTitle,
                documentType,
              });
            try {
              persistedArtifactSyncRef.current[artifactId] = JSON.stringify(artifactData);
            } catch {
              // ignore serialization guard for history hydration
            }
            setActionCenterJsonArtifact((prev) => ({
              id: artifactId,
              title: artifactTitle,
              data: artifactData,
              documentType,
              schemaVersion,
              persistedArtifactId: typeof latestJsonArtifact.id === 'string' ? latestJsonArtifact.id : null,
              expiresAt: typeof latestJsonArtifact.expiresAt === 'string' ? latestJsonArtifact.expiresAt : null,
              sourceMessageId: latestAssistantMessage?.id || null,
              updatedAt: Number.isFinite(new Date(String(latestJsonArtifact.updatedAt || '')).getTime())
                ? new Date(String(latestJsonArtifact.updatedAt || '')).getTime()
                : Date.now(),
            }));
            restoredAnyArtifact = true;
          }

          const latestTextArtifact = artifactRows.find((row: any) =>
            row &&
            row.artifactType === 'generated_doc_text' &&
            row.payloadJson &&
            typeof row.payloadJson === 'object' &&
            typeof row.payloadJson.content === 'string'
          );
          if (latestTextArtifact) {
            const payload = latestTextArtifact.payloadJson || {};
            const artifactKind = payload.kind === 'markdown' ? 'markdown' : 'text';
            const artifactTitle =
              (typeof latestTextArtifact.title === 'string' && latestTextArtifact.title.trim()) ||
              (typeof payload.title === 'string' && payload.title.trim()) ||
              'Generated text';
            const artifactId =
              (typeof latestTextArtifact.clientArtifactId === 'string' && latestTextArtifact.clientArtifactId.trim()) ||
              buildStableGeneratedTextArtifactId({
                title: artifactTitle,
                kind: artifactKind,
              });
            try {
              persistedArtifactSyncRef.current[artifactId] = JSON.stringify(payload);
            } catch {
              // ignore serialization guard for history hydration
            }
            setActionCenterCanvas((prev) => ({
              id: artifactId,
              title: artifactTitle,
              content: String(payload.content || ''),
              kind: artifactKind,
              sourceMessageId: latestAssistantMessage?.id || null,
              updatedAt: Number.isFinite(new Date(String(latestTextArtifact.updatedAt || '')).getTime())
                ? new Date(String(latestTextArtifact.updatedAt || '')).getTime()
                : Date.now(),
            }));
            restoredAnyArtifact = true;
          }

        } catch (artifactErr) {
          console.warn('Failed to hydrate chatnew history artifacts', artifactErr);
        }

        if (shouldRetryDeferredChatHistoryEnrichment(rawTranscriptMessages)) {
          deferredRefreshTimer = setTimeout(async () => {
            try {
              if (cancelled) return;
              if (messagesRef.current.some((m) => m.isStreaming)) return;
              if (messagesRef.current.length !== restoredMessages.length) return;

              const refreshedTranscript = await getChatHistoryTranscript(requestedChatSessionId, {
                mode: 'lite',
                limit: CHAT_HISTORY_TRANSCRIPT_INITIAL_LIMIT,
              });
              if (cancelled) return;

              const refreshedMessages = (Array.isArray(refreshedTranscript?.messages) ? refreshedTranscript.messages : [])
                .map(mapPersistedChatHistoryMessageToUi)
                .filter((m): m is Message => Boolean(m));
              if (refreshedMessages.length > 0 && !messagesRef.current.some((m) => m.isStreaming)) {
                const currentCitationCount = messagesRef.current.reduce((sum, m) => sum + (m.citations?.length || 0), 0);
                const refreshedCitationCount = refreshedMessages.reduce((sum, m) => sum + (m.citations?.length || 0), 0);
                const currentMetadataCount = messagesRef.current.reduce((sum, m) => sum + (m.metadata ? 1 : 0), 0);
                const refreshedMetadataCount = refreshedMessages.reduce((sum, m) => sum + (m.metadata ? 1 : 0), 0);
                if (
                  refreshedMessages.length === messagesRef.current.length &&
                  (refreshedCitationCount > currentCitationCount || refreshedMetadataCount > currentMetadataCount)
                ) {
                  setMessages(refreshedMessages);
                  const refreshedDocIds = Array.from(
                    new Set(
                      refreshedMessages
                        .flatMap((m) => (m.citations || []).map((c: any) => c?.docId))
                        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
                    )
                  );
                  if (refreshedDocIds.length > 0) setLastListDocIds(refreshedDocIds.slice(0, 5));
                }
              }

              if (!restoredAnyArtifact) {
                try {
                  const artifactResp = await listChatHistorySessionArtifacts(requestedChatSessionId, 50);
                  if (cancelled) return;
                  const artifactRows = Array.isArray(artifactResp?.artifacts) ? artifactResp.artifacts : [];
                  const latestJsonArtifact = artifactRows.find((row: any) =>
                    row &&
                    row.artifactType === 'generated_doc_json' &&
                    row.payloadJson &&
                    typeof row.payloadJson === 'object' &&
                    !Array.isArray(row.payloadJson)
                  );
                  if (latestJsonArtifact) {
                    const artifactData = latestJsonArtifact.payloadJson;
                    const artifactTitle =
                      (typeof latestJsonArtifact.title === 'string' && latestJsonArtifact.title.trim()) ||
                      'Document JSON';
                    const documentType =
                      (typeof latestJsonArtifact.documentType === 'string' && latestJsonArtifact.documentType.trim()) ||
                      (typeof artifactData?.document_type === 'string' && artifactData.document_type.trim()) ||
                      (typeof artifactData?.doc_type === 'string' && artifactData.doc_type.trim()) ||
                      null;
                    const schemaVersion =
                      (typeof latestJsonArtifact.schemaVersion === 'string' && latestJsonArtifact.schemaVersion.trim()) ||
                      (typeof artifactData?.schema_version === 'string' && artifactData.schema_version.trim()) ||
                      (typeof artifactData?.template_version === 'string' && artifactData.template_version.trim()) ||
                      null;
                    const artifactId =
                      (typeof latestJsonArtifact.clientArtifactId === 'string' && latestJsonArtifact.clientArtifactId.trim()) ||
                      buildStableGeneratedJsonArtifactId({ title: artifactTitle, documentType });
                    setActionCenterJsonArtifact((prev) => prev ?? {
                      id: artifactId,
                      title: artifactTitle,
                      data: artifactData,
                      documentType,
                      schemaVersion,
                      persistedArtifactId: typeof latestJsonArtifact.id === 'string' ? latestJsonArtifact.id : null,
                      expiresAt: typeof latestJsonArtifact.expiresAt === 'string' ? latestJsonArtifact.expiresAt : null,
                      sourceMessageId: null,
                      updatedAt: Date.now(),
                    });
                  }

                } catch {
                  // ignore delayed artifact fetch failures
                }
              }
            } catch (refreshErr) {
              console.warn('Failed delayed refresh for chatnew history enrichment', refreshErr);
            }
          }, 1800);
        }

        chatHistoryHydratedKeyRef.current = requestedChatSessionId;
      } catch (error) {
        console.warn('Failed to hydrate chatnew history', error);
      } finally {
        if (!cancelled) {
          setIsHydratingChatHistory(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (deferredRefreshTimer) {
        clearTimeout(deferredRefreshTimer);
      }
    };
  }, [
    bootstrapData,
    isChatNewRoute,
    mapPersistedChatHistoryMessageToUi,
    requestedChatSessionId,
    shouldRetryDeferredChatHistoryEnrichment,
  ]);

  const loadOlderChatHistoryMessages = useCallback(async () => {
    if (!isChatNewRoute) return;
    const transcriptSessionId = requestedChatSessionId || sessionId;
    if (!transcriptSessionId) return;
    if (!chatHistoryHasMoreBefore) return;
    if (!chatHistoryOldestSequence || chatHistoryOldestSequence <= 1) return;
    if (isLoadingOlderChatHistory) return;

    setIsLoadingOlderChatHistory(true);
    try {
      const transcript = await getChatHistoryTranscript(transcriptSessionId, {
        mode: 'lite',
        limit: CHAT_HISTORY_TRANSCRIPT_OLDER_PAGE_SIZE,
        before_sequence: chatHistoryOldestSequence,
      });
      const olderMessages = (Array.isArray(transcript?.messages) ? transcript.messages : [])
        .map(mapPersistedChatHistoryMessageToUi)
        .filter((m): m is Message => Boolean(m));
      if (olderMessages.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const dedupedOlder = olderMessages.filter((m) => !seen.has(m.id));
          return dedupedOlder.length > 0 ? [...dedupedOlder, ...prev] : prev;
        });
      }
      setChatHistoryHasMoreBefore(Boolean(transcript?.page?.has_more_before));
      setChatHistoryOldestSequence(
        Number.isFinite(Number(transcript?.page?.oldest_sequence))
          ? Number(transcript?.page?.oldest_sequence)
          : null
      );
    } catch (error) {
      console.warn('Failed to load older chat history messages', error);
    } finally {
      setIsLoadingOlderChatHistory(false);
    }
  }, [
    chatHistoryHasMoreBefore,
    chatHistoryOldestSequence,
    isChatNewRoute,
    isLoadingOlderChatHistory,
    mapPersistedChatHistoryMessageToUi,
    requestedChatSessionId,
    sessionId,
  ]);

  // Results sidebar state for "View All" functionality
  const [resultsSidebarOpen, setResultsSidebarOpen] = useState(false);
  const [resultsSidebarData, setResultsSidebarData] = useState<{
    columns: string[];
    rows: Array<Record<string, any>>;
    totalCount?: number | null;
    docType?: string | null;
  } | null>(null);
  const [hasSelectedTemplateInFlow, setHasSelectedTemplateInFlow] = useState(false);
  const [selectedTemplateCard, setSelectedTemplateCard] = useState<DocumentTemplateOption | null>(null);
  const [selectedTemplateCardMessageId, setSelectedTemplateCardMessageId] = useState<string | null>(null);
  const activeArtifactRef = useMemo<DocumentWorkflowArtifactRef | null>(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const workflow = messages[i]?.metadata?.document_workflow;
      const artifactRef = workflow?.artifact_ref;
      if (artifactRef && String(artifactRef.artifact_id || '').trim()) {
        return {
          artifact_id: String(artifactRef.artifact_id || '').trim(),
          revision: Number(artifactRef.revision || 0),
          artifact_type: String(artifactRef.artifact_type || '').trim() || undefined,
        };
      }
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!shouldRenderActionCenter) return;
    if (hasLoadedAllDocuments) return;
    void loadAllDocuments();
  }, [hasLoadedAllDocuments, loadAllDocuments, shouldRenderActionCenter]);

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

  useEffect(() => {
    const latestAssistantWithTextArtifact = [...messages]
      .reverse()
      .find((message) => {
        if (message.role !== 'assistant') return false;
        if (message.isStreaming) return false;
        return isTextLikeGeneratedDocument(message.metadata?.generated_document);
      });

    if (!latestAssistantWithTextArtifact) return;

    const generatedDoc = latestAssistantWithTextArtifact.metadata?.generated_document;
    const previewUrl = getGeneratedDocumentPreviewUrl(generatedDoc);
    if (!previewUrl) return;

    const sourceKey = `${latestAssistantWithTextArtifact.id}:${previewUrl}`;
    if (autoCanvasSourceRef.current === sourceKey) return;

    const nextId = `canvas_${latestAssistantWithTextArtifact.id}`;
    const nextTitle =
      String(generatedDoc?.file_name || generatedDoc?.title || '').trim() ||
      deriveCanvasTitleFromMessage(
        latestAssistantWithTextArtifact,
        sanitizeAssistantContentForDisplay(latestAssistantWithTextArtifact)
      );
    const nextKind = getCanvasKindForGeneratedDocument(generatedDoc);
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(previewUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed to load generated file content (${res.status})`);
        const content = await res.text();
        if (controller.signal.aborted) return;
        const normalizedContent = String(content || '');
        if (!normalizedContent.trim()) return;

        autoCanvasSourceRef.current = sourceKey;
        setActionCenterCanvas((prev) => {
          if (
            prev &&
            prev.id === nextId &&
            prev.content === normalizedContent &&
            prev.title === nextTitle &&
            prev.kind === nextKind
          ) {
            return prev;
          }
          return {
            id: nextId,
            title: nextTitle,
            content: normalizedContent,
            kind: nextKind,
            sourceMessageId: latestAssistantWithTextArtifact.id,
            updatedAt: Date.now(),
          };
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Failed to auto-load generated text artifact into Canvas', error);
      }
    })();

    return () => controller.abort();
  }, [messages]);

  useEffect(() => {
    if (!isChatNewRoute) return;
    if (!chatNewArtifactAutoPinEnabled) return;
    const artifact = actionCenterJsonArtifact;
    if (!artifact) return;
    const artifactId = String(artifact.id || '').trim();
    if (!artifactId) return;
    if (autoPinnedArtifactRef.current === artifactId) return;

    autoPinnedArtifactRef.current = artifactId;
    setActionCenterTab('json');
    setIsActionCenterPinned(true);
    setIsActionCenterOpen(true);
  }, [actionCenterJsonArtifact, chatNewArtifactAutoPinEnabled, isChatNewRoute]);

  const handlePreviewDocument = useCallback((docId: string) => {
    setGeneratedPdfPreview(null);
    setPreviewDocId(docId);
    setPreviewDocPage(null);
    setPreviewCitation(null);
    setActionCenterTab('preview');
    setIsActionCenterOpen(true);
  }, []);

  const handlePreviewGeneratedPdf = useCallback((doc: GeneratedDocumentMetadata | null | undefined) => {
    const next = toGeneratedPdfPreview(doc);
    if (!next) return;
    setGeneratedPdfPreview(next);
    setPreviewDocId(null);
    setPreviewDocPage(null);
    setPreviewCitation(null);
    setActionCenterTab('preview');
    setIsActionCenterOpen(true);
  }, []);

  const handleActionCenterPinnedChange = useCallback((pinned: boolean) => {
    setIsActionCenterPinned(pinned);
    if (isChatNewRoute) {
      // If the user unpins, stop future auto-pinning until they pin again manually.
      setChatNewArtifactAutoPinEnabled(pinned ? true : false);
    }
  }, [isChatNewRoute]);

  const handlePreviewFromMessage = useCallback(
    (citation: CitationMeta, contextCitations: CitationMeta[] = []) => {
      setGeneratedPdfPreview(null);
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
    if (!sessionId) {
      openSidebar(currentColumns, currentRows, metadata.total_count ?? null, metadata.doc_type ?? null);
      return;
    }
    const runtimeSessionId = agentSessionIdRef.current || sessionId;

    setLoadingMoreByMessageId(prev => ({ ...prev, [messageId]: true }));
    try {
      let data: any = null;
      if (orgId) {
        try {
          data = await apiFetch(`/orgs/${orgId}/chat/results`, {
            method: 'POST',
            body: {
              session_id: sessionId,
              agent_session_id: runtimeSessionId,
              fetch_all: true
            }
          });
        } catch (error) {
          console.error('Failed to fetch full results for sidebar via /chat/results', error);
        }
      }

      const hasRowsFromPrimary = Array.isArray(data?.results_data) && data.results_data.length > 0;
      if (!hasRowsFromPrimary) {
        const persisted = await fetchPersistedListModeResultsForMessage(sessionId, messageId);
        if (persisted) {
          data = {
            ...data,
            ...persisted,
            results_data: Array.isArray(persisted.results_data) ? persisted.results_data : [],
            columns: Array.isArray(persisted.columns) ? persisted.columns : (data?.columns || []),
          };
        }
      }

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
  }, [fetchPersistedListModeResultsForMessage, messages, sessionId]);

  const resetChatSession = useCallback(() => {
    try {
      activeStreamAbortControllerRef.current?.abort();
    } catch {
      // Ignore abort failures while forcing a fresh chat session.
    }
    activeStreamAbortControllerRef.current = null;
    const initialMessages = buildInitialMessages();
    setMessages(initialMessages);
    messagesRef.current = initialMessages;
    chatHistoryHydratedKeyRef.current = null;
    workflowDraftHydratedKeyRef.current = null;
    setHydratedChatSessionTitle(null);
    setLastListDocIds([]);
    setLoadingMoreByMessageId({});
    setChatHistoryHasMoreBefore(false);
    setChatHistoryOldestSequence(null);
    setIsLoadingOlderChatHistory(false);
    setIsLoading(false);
    setInputValue('');
    setPinnedDocIds([]);
    setPinnedDocMetaById({});
    setActiveSpecializedMode(null);
    setFileNavigatorMode(null);
    setPreviewDocId(null);
    setPreviewDocPage(null);
    setPreviewCitation(null);
    setGeneratedPdfPreview(null);
    setIsActionCenterOpen(false);
    setActionCenterTab('sources');
    setActionCenterCitationsMode('global');
    setActionCenterCitations([]);
    setMessageScopedCitations([]);
    setActionCenterCanvas(null);
    setActionCenterJsonArtifact(null);
    setResultsSidebarOpen(false);
    setResultsSidebarData(null);
    setTeamMemory([]);
    setCitationsModeLock(null);
    citationsModeLockRef.current = null;
    autoCanvasSourceRef.current = null;
    autoPinnedArtifactRef.current = null;
    setHasSelectedTemplateInFlow(false);
    setSelectedTemplateCard(null);
    setSelectedTemplateCardMessageId(null);
    setIsWorkflowDialogOpen(false);
    setWorkflowFormError(null);
    setWorkflowFieldPickerState({ open: false, key: null, kind: 'doc' });
    const nextSessionId = createClientRuntimeId();
    setSessionId(nextSessionId);
    resetAgentSessionId();
  }, [resetAgentSessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isChatNewRoute) return;

    const handleStartNewChat = () => {
      resetChatSession();
    };

    window.addEventListener(CHAT_NEW_SESSION_EVENT, handleStartNewChat);
    return () => window.removeEventListener(CHAT_NEW_SESSION_EVENT, handleStartNewChat);
  }, [isChatNewRoute, resetChatSession]);

  useEffect(() => {
    if (!isChatNewRoute) {
      previousRequestedChatSessionIdRef.current = requestedChatSessionId;
      workflowDraftHydratedKeyRef.current = null;
      return;
    }
    const previousRequested = previousRequestedChatSessionIdRef.current;
    if (previousRequested && !requestedChatSessionId) {
      chatHistoryHydratedKeyRef.current = null;
      resetChatSession();
    }
    if (previousRequested !== requestedChatSessionId) {
      workflowDraftHydratedKeyRef.current = null;
      resetAgentSessionId();
    }
    previousRequestedChatSessionIdRef.current = requestedChatSessionId;
  }, [isChatNewRoute, requestedChatSessionId, resetAgentSessionId, resetChatSession]);

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
    if (normalized.length === 0) {
      setActiveSpecializedMode(null);
    }
  }, []);

  const buildAttachedDocMeta = useCallback((doc: StoredDocument): AttachedDocMeta => ({
    id: String(doc.id),
    filename: getDocPrimaryName(doc),
    title: getDocSecondaryTitle(doc) || undefined,
    folderPath: getDocFolderPath(doc),
  }), []);

  const selectedFolderId =
    chatContext.type === 'folder'
      ? chatContext.folderPath?.join('/') || chatContext.path?.join('/') || null
      : null;
  const selectedDocumentId =
    chatContext.type === 'document'
      ? chatContext.id || null
      : null;

  const chatNewRecentSessionsPanel = null;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      // `smooth` on every streamed update can cause jank; use a cheaper scroll
      // behavior while a response is actively streaming.
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: isLoading ? 'auto' : 'smooth'
      });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isChatNewRoute) return;

    const normalizeTitle = (value: string | null | undefined): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim().replace(/\s+/g, ' ');
      if (!trimmed) return null;
      return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
    };

    const explicitTitle = normalizeTitle(hydratedChatSessionTitle);
    const firstUserMessage = messages.find(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim().length > 0
    );
    const fallbackTitle = normalizeTitle(firstUserMessage?.content);
    const tabLabel = explicitTitle || fallbackTitle || 'New Chat';
    document.title = `${tabLabel} • Briefly`;
  }, [hydratedChatSessionTitle, isChatNewRoute, messages]);

  // Ensure a fresh sessionId per page load
  useEffect(() => {
    if (isChatNewRoute) return;
    setSessionId(createClientRuntimeId());
    resetAgentSessionId();
  }, [isChatNewRoute, resetAgentSessionId]);

  const handleSubmit = async (
    input: string,
    overrideContext?: ChatContext,
    overrideOptions?: {
      deepResearchEnabled?: boolean;
      skipUserMessage?: boolean;
      workflowInvocation?: ChatWorkflowInvocationPayload | null;
      attachedDocsOverride?: AttachedDocMeta[] | null;
      specializedMode?: SpecializedChatMode | null;
    }
  ) => {
    if (!input.trim() || isLoading) return;
    const isFirstUserMessageInChat = !hasUserMessage && !overrideOptions?.skipUserMessage;
    if (isChatNewRoute && isFirstUserMessageInChat) {
      // Keep focus on the conversation for the first prompt in /chatnew.
      setIsActionCenterOpen(false);
      setIsActionCenterPinned(false);
    }
    const isTemplateSelectionMessage = input.toLowerCase().includes('template_id');
    const parsedWorkflowInvocationCommand = overrideOptions?.workflowInvocation || parseWorkflowRunCommand(input);
    if (isDocumentCreationKickoffPrompt(input)) {
      setHasSelectedTemplateInFlow(false);
      setSelectedTemplateCardMessageId(null);
      setSelectedTemplateCard(null);
      // Close any open preview sidebar from a previous flow
      setGeneratedPdfPreview(null);
      setPreviewDocId(null);
      setPreviewDocPage(null);
      setPreviewCitation(null);
      setIsActionCenterOpen(false);
    }
    if (isTemplateSelectionMessage) {
      setHasSelectedTemplateInFlow(true);
    }

    const effectiveContext = overrideContext || chatContext;
    const effectiveDeepResearchEnabled =
      typeof overrideOptions?.deepResearchEnabled === 'boolean'
        ? overrideOptions.deepResearchEnabled
        : deepResearchEnabled;
    const specializedMode = typeof overrideOptions?.specializedMode === 'string'
      ? overrideOptions.specializedMode
      : activeSpecializedMode;
    const attachedDocsOverride = Array.isArray(overrideOptions?.attachedDocsOverride)
      ? overrideOptions.attachedDocsOverride
          .filter((doc): doc is AttachedDocMeta => Boolean(doc?.id))
          .slice(0, 2)
          .map((doc) => ({
            id: String(doc.id),
            filename: String(doc.filename || `Document ${String(doc.id).slice(0, 8)}`),
            title: doc.title,
            folderPath: Array.isArray(doc.folderPath) ? doc.folderPath.filter(Boolean) : [],
          }))
      : [];
    const normalizedPinnedDocIds = attachedDocsOverride.length > 0
      ? attachedDocsOverride.map((doc) => doc.id).filter(Boolean).slice(0, 2)
      : (pinnedDocIds || []).filter(Boolean).slice(0, 2);
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
      if (Array.isArray(folderPath)) {
        if (folderPath.length > 0) {
          contextPayload.folderPath = folderPath;
        }
        const folderScopedDocs = allDocs.filter((doc) => isFolderPathPrefix(getDocFolderPath(doc), folderPath));
        if (folderScopedDocs.length > 0) {
          contextPayload.folderDocumentCount = folderScopedDocs.length;
          contextPayload.folderDocumentIds = folderScopedDocs
            .map((doc) => String(doc.id || '').trim())
            .filter(Boolean)
            .slice(0, 100);
          contextPayload.folderDocuments = folderScopedDocs.slice(0, 50).map((doc) => ({
            id: String(doc.id || ''),
            filename: getDocPrimaryName(doc),
            title: String(doc.title || '').trim() || undefined,
            folderPath: getDocFolderPath(doc),
            docType: String((doc as any).doc_type_key || (doc as any).docType || (doc as any).type || '').trim() || undefined,
          }));
        }
      }
    }

    try {
      // Determine endpoint based on context using the new folder resolution system.
      // `/chatnew` can optionally override endpoint via NEXT_PUBLIC_CHATNEW_ENDPOINT.
      const endpointContext: ChatContext = normalizedPinnedDocIds.length > 0 ? { type: 'org' } : effectiveContext;
      const { orgId: apiOrgIdForTurn } = getApiContext();
      const useChatGatewayForTurn =
        isChatNewRoute &&
        Boolean(apiOrgIdForTurn) &&
        String(process.env.NEXT_PUBLIC_CHATNEW_USE_GATEWAY || 'true').toLowerCase() !== 'false';
      const chatNewEndpointOverride = String(
        process.env.NEXT_PUBLIC_CHATNEW_ENDPOINT || 'http://localhost:8010/chat/query'
      ).trim();
      const chatNewGatewayEndpoint = apiOrgIdForTurn
        ? String(
          process.env.NEXT_PUBLIC_CHATNEW_GATEWAY_ENDPOINT ||
          `/orgs/${apiOrgIdForTurn}/chat/stream`
        ).trim()
        : '';
      const endpoint = useChatGatewayForTurn && chatNewGatewayEndpoint
        ? chatNewGatewayEndpoint
        : (isChatNewRoute && chatNewEndpointOverride
          ? chatNewEndpointOverride
          : await createFolderChatEndpoint(endpointContext));
      const workflowInvocationForTurn = useChatGatewayForTurn ? parsedWorkflowInvocationCommand : null;
      if (parsedWorkflowInvocationCommand && !useChatGatewayForTurn) {
        throw new Error('Workflow runs from chat require chat gateway mode. Enable NEXT_PUBLIC_CHATNEW_USE_GATEWAY=true and try again.');
      }
      const attachedDocsSnapshot: AttachedDocMeta[] = attachedDocsOverride.length > 0
        ? attachedDocsOverride
        : normalizedPinnedDocIds
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
      let userMessageForPersistence: Message | null = null;

      if (!overrideOptions?.skipUserMessage) {
        // Add user message (capture attached docs at send time)
        const userMessage: Message = {
          id: `user_${Date.now()}`,
          role: 'user',
          content: input,
          attachedDocIds: normalizedPinnedDocIds.length > 0 ? [...normalizedPinnedDocIds] : undefined,
          attachedDocs: attachedDocsSnapshot.length > 0 ? attachedDocsSnapshot : undefined,
        };
        userMessageForPersistence = userMessage;
        setMessages(prev => [...prev, userMessage]);
      }
      const shouldRetainPinnedDocsAfterSend = specializedMode === 'spreadsheet_analyst';
      if (!shouldRetainPinnedDocsAfterSend) {
        handlePinnedDocIdsChange([]); // Clear from input box — docs now live in the sent message
      }
      setIsLoading(true);

      // Add assistant message placeholder
      const assistantId = `assistant_${Date.now()}`;
      const lastAssistantWorkflow = (() => {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const msg = messages[i];
          if (msg.role !== 'assistant') continue;
          const wf = msg.metadata?.document_workflow;
          const status = String(wf?.status || '').trim().toLowerCase();
          if (!status) continue;
          return {
            status,
            missingFields: Array.isArray(wf?.missing_fields) ? wf.missing_fields : [],
          };
        }
        return null;
      })();
      const hasActiveDocumentInputStep = Boolean(
        lastAssistantWorkflow?.status &&
        DOCUMENT_WORKFLOW_AWAITING_INPUT_STATUSES.has(lastAssistantWorkflow.status)
      );
      const finalDataSubmitted =
        hasActiveDocumentInputStep &&
        userInputLikelyFulfillsMissingFields(input, lastAssistantWorkflow?.missingFields || []);
      const shouldBootstrapDocWorkflow =
        !isTemplateSelectionMessage &&
        hasSelectedTemplateInFlow &&
        Boolean(selectedTemplateCard?.template_id) &&
        !isDocumentCreationKickoffPrompt(input) &&
        !overrideOptions?.skipUserMessage &&
        finalDataSubmitted;
      const bootstrapWorkflowStatus = 'creating_pdf';
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        processingSteps: [],
        tools: [],
        streamStartedAtMs: Date.now(),
        metadata: shouldBootstrapDocWorkflow
          ? {
            document_workflow: {
              status: bootstrapWorkflowStatus,
              template_id: selectedTemplateCard?.template_id,
              template_name: selectedTemplateCard?.name,
            },
          }
          : undefined,
      };
      if (isTemplateSelectionMessage) {
        setSelectedTemplateCardMessageId(assistantId);
      }

      setMessages(prev => [...prev, assistantMessage]);
      let chatHistorySessionIdForTurn: string | null = null;
      let chatGatewayManagedPersistenceForTurn = false;
      let chatGatewayOwnsArtifactPersistenceForTurn = false;
      let streamAbortController: AbortController | null = null;
      try {
        let streamingContent = '';
        let streamRunId: string | null = null;
        let streamLastEventSeq = 0;
        let streamLastEventTs = Date.now();
        let hasCompleted = false;
        let streamSteps: ProcessingStep[] = [];
        let streamTools: ToolUsage[] = [];
        streamAbortController = new AbortController();
        activeStreamAbortControllerRef.current = streamAbortController;

        const updateAssistantMessage = (updater: (message: Message) => Message) => {
          setMessages(prev => prev.map(m => (m.id === assistantId ? updater(m) : m)));
        };

        // Ensure a stable session id for this page session
        const ensuredSessionId = sessionId || createClientRuntimeId();
        const ensuredAgentSessionId = ensureAgentSessionId();
        chatHistorySessionIdForTurn = ensuredSessionId;
        if (!sessionId) setSessionId(ensuredSessionId);

        const frontendContextSnapshot: ChatHistoryFrontendContextSnapshot | null = isChatNewRoute ? {
          version: 1,
          surface: 'chatnew',
          chatContext: effectiveContext,
          pinnedDocIds: normalizedPinnedDocIds,
          pinnedDocMetaById: attachedDocsSnapshot.reduce<Record<string, AttachedDocMeta>>((acc, docMeta) => {
            if (docMeta?.id) acc[docMeta.id] = docMeta;
            return acc;
          }, {}),
          specializedMode,
          webSearchEnabled,
          deepResearchEnabled: effectiveDeepResearchEnabled,
        } : null;

        const sessionUpsertPayload = frontendContextSnapshot ? {
          session_id: ensuredSessionId,
          title: (!sessionId && userMessageForPersistence?.content)
            ? String(userMessageForPersistence.content).trim().slice(0, 120)
            : undefined,
          status: 'active' as const,
          frontend_context: frontendContextSnapshot,
        } : null;

        const userMessagePersistPayload = userMessageForPersistence ? {
          client_message_id: userMessageForPersistence.id,
          role: 'user' as const,
          content: userMessageForPersistence.content,
          raw_content: userMessageForPersistence.content,
          request_context_json: {
            contextPayload,
            effectiveContext,
          },
          attached_doc_ids: userMessageForPersistence.attachedDocIds || [],
          attached_docs_json: userMessageForPersistence.attachedDocs || [],
          status: 'complete' as const,
          is_complete: true,
        } : null;

        if (isChatNewRoute && !useChatGatewayForTurn) {
          try {
            // First message in a session: ensure the session exists before message writes.
            // Existing session: refresh metadata in the background so chat streaming starts faster.
            if (!sessionId && sessionUpsertPayload) {
              await upsertChatHistorySession(sessionUpsertPayload);
            } else if (sessionUpsertPayload) {
              void upsertChatHistorySession(sessionUpsertPayload).catch((persistErr) => {
                console.warn('Failed to refresh chatnew session metadata', persistErr);
              });
            }

            // Keep user-message persistence before streaming to preserve ordering.
            // Assistant placeholder persistence was removed from the blocking path because
            // it was adding a full extra round-trip before SSE start and could race with
            // the final assistant completion upsert.
            if (userMessagePersistPayload) {
              await upsertChatHistoryMessage(ensuredSessionId, {
                ...userMessagePersistPayload,
              });
            }
          } catch (persistErr) {
            console.warn('Failed to persist chatnew turn bootstrap state', persistErr);
          }
        }

        chatGatewayManagedPersistenceForTurn = Boolean(isChatNewRoute && useChatGatewayForTurn);
        // Gateway mode should own artifact persistence by default so the browser
        // doesn't block or duplicate writes with /chat/artifacts calls. Allow an
        // explicit opt-out for debugging/rollback.
        chatGatewayOwnsArtifactPersistenceForTurn = Boolean(
          chatGatewayManagedPersistenceForTurn &&
          String(process.env.NEXT_PUBLIC_CHATNEW_GATEWAY_OWNS_ARTIFACT_PERSISTENCE || 'true').toLowerCase() !== 'false'
        );

        await ssePost(endpoint, {
          session_id: ensuredSessionId,
          agent_session_id: ensuredAgentSessionId,
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
            sessionId: ensuredSessionId,
            agentSessionId: ensuredAgentSessionId,
          },
          context: contextPayload,
          filters: {},
          strictCitations: true,
          webSearchEnabled: webSearchEnabled,
          deepResearch: {
            enabled: effectiveDeepResearchEnabled,
            mode: 'auto',
            strictCitations: true,
            maxMinutes: 4,
          },
          ...(specializedMode ? { specializedMode } : {}),
          ...(workflowInvocationForTurn ? { workflowInvocation: workflowInvocationForTurn } : {}),
          ...(chatGatewayManagedPersistenceForTurn ? {
            history_persistence: {
              session: sessionUpsertPayload || undefined,
              user_message: userMessagePersistPayload || undefined,
              assistant_message: {
                client_message_id: assistantId,
              },
            },
          } : {}),
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
              } else if (data.type === 'deep_stage' || data.type === 'deep_progress') {
                const rawStage = String(data.stage || '').trim().toLowerCase();
                const stageKey = rawStage || 'deep';
                const stageLabel = DEEP_STAGE_LABELS[stageKey] || normalizeActivityLabel(stageKey.replace(/_/g, ' '), 'Deep research');
                const rawPercent = Number((data as any).percent);
                const percentLabel = Number.isFinite(rawPercent)
                  ? `${Math.max(0, Math.min(100, Math.round(rawPercent)))}%`
                  : null;
                const detail = String((data as any).detail || '').trim();
                const description = [detail, percentLabel].filter(Boolean).join(' • ');

                const nextStep: ProcessingStep = {
                  step: `deep_${stageKey}`,
                  title: stageLabel,
                  description: description || stageLabel,
                  status: normalizeActivityStatus(data.status || (data.type === 'deep_progress' ? 'in_progress' : undefined)),
                  category: 'deep_research',
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
              } else if (data.type === 'deep_warning') {
                const rawStage = String((data as any).stage || '').trim().toLowerCase();
                const stageKey = rawStage || 'warning';
                const stageLabel = rawStage
                  ? (DEEP_STAGE_LABELS[stageKey] || normalizeActivityLabel(stageKey.replace(/_/g, ' '), 'Deep research'))
                  : 'Deep research warning';
                const detail = String((data as any).detail || '').trim();
                const nextStep: ProcessingStep = {
                  step: rawStage ? `deep_${stageKey}` : 'deep_warning',
                  title: stageLabel,
                  description: detail || 'Deep research reported a warning.',
                  status: 'error',
                  category: 'deep_research',
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
              } else if (data.type === 'artifact_text' && data.artifact && typeof data.artifact === 'object') {
                const artifact = data.artifact as any;
                const artifactContent = typeof artifact.content === 'string' ? artifact.content : '';
                if (artifactContent.trim()) {
                  const sourceTool =
                    typeof artifact.source_tool === 'string' && artifact.source_tool.trim()
                      ? artifact.source_tool.trim()
                      : null;
                  const artifactKind = artifact.kind === 'markdown' ? 'markdown' : 'text';
                  const artifactTitle =
                    String(artifact.title || artifact.filename || 'Generated text').trim() || 'Generated text';
                  const artifactId = buildStableGeneratedTextArtifactId({
                    path: artifact.path,
                    filename: artifact.filename,
                    title: artifactTitle,
                    kind: artifactKind,
                  });

                  setActionCenterCanvas((prev) => {
                    if (
                      prev &&
                      prev.id === artifactId &&
                      prev.content === artifactContent &&
                      prev.title === artifactTitle &&
                      prev.kind === artifactKind
                    ) {
                      return prev;
                    }
                    return {
                      id: artifactId,
                      title: artifactTitle,
                      content: artifactContent,
                      kind: artifactKind,
                      sourceMessageId: assistantId,
                      updatedAt: streamLastEventTs || Date.now(),
                    };
                  });

                  try {
                    const textPayload = {
                      kind: artifactKind,
                      title: artifactTitle,
                      filename:
                        typeof artifact.filename === 'string' && artifact.filename.trim()
                          ? artifact.filename.trim()
                          : null,
                      path:
                        typeof artifact.path === 'string' && artifact.path.trim()
                          ? artifact.path.trim()
                          : null,
                      content: artifactContent,
                    };
                    const serializedForSync = JSON.stringify(textPayload);
                    const shouldPersistArtifact =
                      !sourceTool || JSON_ARTIFACT_WRITE_SOURCE_TOOLS.has(sourceTool);
                    if (shouldPersistArtifact && !chatGatewayOwnsArtifactPersistenceForTurn) {
                      const lastSerialized = persistedArtifactSyncRef.current[artifactId];
                      if (lastSerialized !== serializedForSync) {
                        persistedArtifactSyncRef.current[artifactId] = serializedForSync;
                        void persistChatGeneratedArtifact({
                          clientArtifactId: artifactId,
                          sessionId: ensuredSessionId,
                          title: artifactTitle,
                          artifactType: 'generated_doc_text',
                          payloadJson: textPayload,
                        }).catch((persistErr) => {
                          console.warn('Failed to persist chat text artifact', persistErr);
                        });
                      }
                    }
                  } catch {
                    // Ignore serialization/persistence errors in the UI path.
                  }
                }
              } else if (data.type === 'artifact_json' && data.artifact && typeof data.artifact === 'object') {
                const artifact = data.artifact as any;
                const artifactData = artifact.data;
                if (artifactData !== undefined && artifactData !== null) {
                  const sourceTool =
                    typeof artifact.source_tool === 'string' && artifact.source_tool.trim()
                      ? artifact.source_tool.trim()
                      : null;
                  const artifactDataObject =
                    artifactData && typeof artifactData === 'object' && !Array.isArray(artifactData)
                      ? (artifactData as Record<string, any>)
                      : null;
                  const artifactTitle =
                    String(artifact.title || artifact.filename || 'Document JSON').trim() || 'Document JSON';
                  const inferredDocumentType =
                    artifactDataObject &&
                      typeof artifactDataObject.invoice_number === 'string' &&
                      Array.isArray(artifactDataObject.items) &&
                      (artifactDataObject.totals || artifactDataObject.total_amount !== undefined)
                      ? 'invoice'
                      : null;
                  const documentType =
                    typeof artifact.document_type === 'string' && artifact.document_type.trim()
                      ? artifact.document_type.trim()
                      : typeof artifactDataObject?.document_type === 'string' && artifactDataObject.document_type.trim()
                        ? artifactDataObject.document_type.trim()
                        : typeof artifactDataObject?.doc_type === 'string' && artifactDataObject.doc_type.trim()
                          ? artifactDataObject.doc_type.trim()
                          : inferredDocumentType;
                  const schemaVersion =
                    typeof artifact.schema_version === 'string' && artifact.schema_version.trim()
                      ? artifact.schema_version.trim()
                      : typeof artifactDataObject?.schema_version === 'string' && artifactDataObject.schema_version.trim()
                        ? artifactDataObject.schema_version.trim()
                        : typeof artifactDataObject?.template_version === 'string' && artifactDataObject.template_version.trim()
                          ? artifactDataObject.template_version.trim()
                          : null;
                  const artifactId = buildStableGeneratedJsonArtifactId({
                    path: artifact.path,
                    filename: artifact.filename,
                    title: artifactTitle,
                    documentType,
                  });

                  setActionCenterJsonArtifact((prev) => {
                    const nextSerialized = JSON.stringify(artifactData);
                    const prevSerialized = prev ? JSON.stringify(prev.data) : null;
                    if (
                      prev &&
                      prev.id === artifactId &&
                      prev.title === artifactTitle &&
                      prev.documentType === documentType &&
                      prev.schemaVersion === schemaVersion &&
                      prevSerialized === nextSerialized
                    ) {
                      return prev;
                    }
                    return {
                      id: artifactId,
                      title: artifactTitle,
                      data: artifactData,
                      documentType,
                      schemaVersion,
                      persistedArtifactId: prev?.id === artifactId ? (prev.persistedArtifactId ?? null) : undefined,
                      expiresAt: prev?.id === artifactId ? (prev.expiresAt ?? null) : undefined,
                      sourceMessageId: assistantId,
                      updatedAt: streamLastEventTs || Date.now(),
                    };
                  });

                  // Persist ephemeral artifact (3-day TTL) so the server does not need
                  // durable local filesystem state for unsaved chat-generated docs.
                  try {
                    const serializedForSync = JSON.stringify(artifactData);
                    const shouldPersistArtifact =
                      !sourceTool || JSON_ARTIFACT_WRITE_SOURCE_TOOLS.has(sourceTool);
                    if (shouldPersistArtifact && !chatGatewayOwnsArtifactPersistenceForTurn) {
                      const lastSerialized = persistedArtifactSyncRef.current[artifactId];
                      if (lastSerialized !== serializedForSync) {
                        persistedArtifactSyncRef.current[artifactId] = serializedForSync;
                        const templateType =
                          typeof artifact.template_type === 'string' && artifact.template_type.trim()
                            ? artifact.template_type.trim()
                            : (typeof documentType === 'string' && documentType.trim() ? documentType.trim() : null);
                        void persistChatGeneratedArtifact({
                          clientArtifactId: artifactId,
                          sessionId: ensuredSessionId,
                          title: artifactTitle,
                          artifactType: 'generated_doc_json',
                          templateType,
                          documentType: typeof documentType === 'string' ? documentType : null,
                          schemaVersion: typeof schemaVersion === 'string' ? schemaVersion : null,
                          payloadJson: artifactData,
                        }).then((persisted) => {
                          setActionCenterJsonArtifact((prev) => {
                            if (!prev || prev.id !== artifactId) return prev;
                            if (
                              prev.persistedArtifactId === persisted.id &&
                              prev.expiresAt === (persisted.expiresAt || null)
                            ) {
                              return prev;
                            }
                            return {
                              ...prev,
                              persistedArtifactId: persisted.id,
                              expiresAt: persisted.expiresAt || null,
                            };
                          });
                        }).catch((persistErr) => {
                          console.warn('Failed to persist chat artifact', persistErr);
                        });
                      }
                    }
                  } catch {
                    // Ignore serialization/persistence errors in the UI path.
                  }
                }
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
              } else if (data.type === 'sources' && Array.isArray(data.sources) && data.sources.length > 0) {
                // Convert pyserver source objects → CitationMeta for the action center
                const sourceCitations: CitationMeta[] = data.sources
                  .filter((s: any) => s && (s.source_id || s.source))
                  .map((s: any) => mapPyserverSourceRowToCitation(s))
                  .filter((citation: CitationMeta | null): citation is CitationMeta => Boolean(citation));
                const deduped = dedupeCitations(sourceCitations);
                if (deduped.length > 0) {
                  setMessageScopedCitations(deduped);
                  updateAssistantMessage((m) => ({ ...m, citations: deduped }));
                  if (citationsModeLockRef.current !== 'global') {
                    setActionCenterCitationsMode('message');
                    setActionCenterCitations(deduped);
                  }
                  // Sources are stored in state but we do NOT auto-open the Action Center
                  // for them. The panel should only auto-open for artifacts/documents.
                  // Users can manually open it via the toggle button to view sources.
                }
              } else if (data.type === 'complete') {
                if (hasCompleted) return;
                hasCompleted = true;
                const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata as ChatResultsMetadata : null;
                // Safety: template listing responses must never carry a stale generated_document
                if (
                  meta?.document_workflow &&
                  (meta.document_workflow as any)?.status === 'ok' &&
                  Array.isArray((meta.document_workflow as any)?.templates)
                ) {
                  (meta as any).generated_document = null;
                }
                const listMode = Boolean(meta?.list_mode);
                // Prefer server-provided final content because it may include post-processing
                // such as citation marker repair/injection that is not present in streamed chunks.
                let finalContent = (
                  typeof data.full_content === 'string' && data.full_content.trim().length > 0
                    ? data.full_content
                    : streamingContent
                );
                if (listMode) {
                  finalContent = stripMarkdownTables(finalContent);
                }
                const citations = dedupeCitations(
                  data.citations || data.citationSources ||
                  // Fallback: convert pyserver sources array → CitationMeta if no explicit citations provided
                  (Array.isArray((data as any).sources) && !(data.citations?.length) ? (
                    (data as any).sources
                      .filter((s: any) => s && (s.source_id || s.source))
                      .map((s: any) => mapPyserverSourceRowToCitation(s))
                      .filter((citation: CitationMeta | null): citation is CitationMeta => Boolean(citation))
                  ) : [])
                );
                const citationAnchors = Array.isArray((data as any).citationAnchors) ? (data as any).citationAnchors as CitationAnchor[] : [];
                const evidenceSpans = Array.isArray((data as any).evidenceSpans) ? (data as any).evidenceSpans as EvidenceSpan[] : [];
                const citationVersion = typeof (data as any).citationVersion === 'string' ? (data as any).citationVersion as string : null;
                const citationMetrics = ((data as any).citationMetrics && typeof (data as any).citationMetrics === 'object')
                  ? (data as any).citationMetrics as CitationMetrics
                  : null;
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

                if (isChatNewRoute && !chatGatewayManagedPersistenceForTurn) {
                  const completedAtIso = new Date(
                    Number.isFinite(streamLastEventTs) && streamLastEventTs > 0 ? streamLastEventTs : Date.now()
                  ).toISOString();
                  const durationMs = assistantMessage.streamStartedAtMs
                    ? Math.max(0, (Number.isFinite(streamLastEventTs) && streamLastEventTs > 0 ? streamLastEventTs : Date.now()) - assistantMessage.streamStartedAtMs)
                    : undefined;
                  const fullListRows = (meta?.list_mode && Array.isArray(meta?.results_data))
                    ? meta.results_data
                    : [];
                  const listPreviewRows = fullListRows.slice(0, CHAT_HISTORY_LIST_MODE_PREVIEW_ROWS);
                  const listTotalCount = typeof meta?.total_count === 'number'
                    ? meta.total_count
                    : fullListRows.length;
                  const persistedHasMore = Boolean(meta?.has_more) || listTotalCount > listPreviewRows.length || fullListRows.length > listPreviewRows.length;
                  const persistedMetadata = meta
                    ? {
                      ...meta,
                      ...(meta.list_mode ? {
                        results_data: listPreviewRows,
                        total_count: listTotalCount,
                        has_more: persistedHasMore,
                      } : {}),
                    }
                    : null;
                  const persistedListModeResult = meta?.list_mode
                    ? {
                      query_type: typeof meta.query_type === 'string' ? meta.query_type : null,
                      query_yql: typeof (meta as any)?.query_yql === 'string'
                        ? (meta as any).query_yql
                        : (typeof (meta as any)?.yql_query === 'string' ? (meta as any).yql_query : null),
                      columns: Array.isArray(meta.columns) ? meta.columns : [],
                      results_data: fullListRows,
                      total_count: listTotalCount,
                      has_more: Boolean(meta.has_more),
                      fetch_all: typeof (meta as any)?.fetch_all === 'boolean'
                        ? Boolean((meta as any).fetch_all)
                        : !Boolean(meta.has_more),
                      doc_type: typeof meta.doc_type === 'string' ? meta.doc_type : null,
                      total_chunks: Number.isFinite(Number((meta as any)?.total_chunks))
                        ? Number((meta as any).total_chunks)
                        : null,
                    }
                    : null;
                  void upsertChatHistoryMessage(ensuredSessionId, {
                    client_message_id: assistantId,
                    role: 'assistant',
                    content: finalContent,
                    status: 'complete',
                    is_complete: true,
                    run_id: streamRunId || undefined,
                    citations,
                    metadata: persistedMetadata,
                    list_mode_result: persistedListModeResult,
                    usage: usage || null,
                    processing_steps_json: baseSteps,
                    tools_json: baseTools,
                    citation_anchors: citationAnchors,
                    evidence_spans: evidenceSpans,
                    citation_version: citationVersion,
                    citation_metrics: citationMetrics,
                    agent_info: data.agent ?? null,
                    has_citations: citations.length > 0,
                    has_list_mode: Boolean(meta?.list_mode),
                    stream_completed_at: completedAtIso,
                    stream_last_event_seq: streamLastEventSeq || 0,
                    stream_last_event_ts: completedAtIso,
                    completed_at: completedAtIso,
                    duration_ms: durationMs,
                  }).catch((persistErr) => {
                    console.warn('Failed to persist completed assistant message', persistErr);
                  });
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
                if (isChatNewRoute) {
                  const refreshSessionId = String(data.sessionId || data.session_id || ensuredSessionId || sessionId || '');
                  emitChatHistoryRefresh({
                    sessionId: refreshSessionId || undefined,
                    reason: 'assistant_complete',
                  });
                  window.setTimeout(() => {
                    emitChatHistoryRefresh({
                      sessionId: refreshSessionId || undefined,
                      reason: 'title_generation_followup',
                    });
                  }, CHAT_HISTORY_TITLE_REFRESH_DELAY_MS);
                }

                // Close the SSE stream promptly after a complete payload so the
                // input unlocks even if the backend keeps the connection open
                // briefly after sending the final message.
                try {
                  streamAbortController?.abort();
                } catch { }
              } else if (data.type === 'error') {
                hasCompleted = true;
                const errorContent = `${streamingContent}\n\n❌ **Error**: ${data.error || 'Unknown error'}`;
                updateAssistantMessage((m) => ({
                  ...m,
                  content: errorContent,
                  isStreaming: false,
                  processingSteps: dedupeSteps(streamSteps),
                  tools: dedupeTools(streamTools),
                  streamRunId: streamRunId || m.streamRunId || null,
                  streamLastEventSeq: streamLastEventSeq || m.streamLastEventSeq,
                  streamLastEventTs,
                }));
                if (isChatNewRoute && !chatGatewayManagedPersistenceForTurn) {
                  const errorAtIso = new Date(
                    Number.isFinite(streamLastEventTs) && streamLastEventTs > 0 ? streamLastEventTs : Date.now()
                  ).toISOString();
                  void upsertChatHistoryMessage(ensuredSessionId, {
                    client_message_id: assistantId,
                    role: 'assistant',
                    content: errorContent,
                    status: 'error',
                    is_complete: true,
                    run_id: streamRunId || undefined,
                    processing_steps_json: dedupeSteps(streamSteps),
                    tools_json: dedupeTools(streamTools),
                    stream_completed_at: errorAtIso,
                    stream_last_event_seq: streamLastEventSeq || 0,
                    stream_last_event_ts: errorAtIso,
                    completed_at: errorAtIso,
                  }).catch((persistErr) => {
                    console.warn('Failed to persist errored assistant message', persistErr);
                  });
                }
                try {
                  streamAbortController?.abort();
                } catch { }
              }
            } catch (error) {
              console.error('Error processing streaming data:', error, event.data);
              // Don't add unparsed data to content
            }
          }
        }, {
          signal: streamAbortController.signal,
        });
      } catch (error) {
        if (streamAbortController?.signal.aborted) {
          return;
        }
        console.error('Error:', error);
        const terminalErrorContent = `❌ **Error**: ${error instanceof Error ? error.message : 'Something went wrong'}`;
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? {
              ...m,
              content: terminalErrorContent,
              isStreaming: false
            }
            : m
        ));
        if (isChatNewRoute && chatHistorySessionIdForTurn && !chatGatewayManagedPersistenceForTurn) {
          void upsertChatHistoryMessage(chatHistorySessionIdForTurn, {
            client_message_id: assistantId,
            role: 'assistant',
            content: terminalErrorContent,
            status: 'error',
            is_complete: true,
          }).catch((persistErr) => {
            console.warn('Failed to persist terminal assistant error message', persistErr);
          });
        }
      } finally {
        if (streamAbortController && activeStreamAbortControllerRef.current === streamAbortController) {
          activeStreamAbortControllerRef.current = null;
        }
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

  const startSpreadsheetAnalystFlow = useCallback((docs: StoredDocument[]) => {
    const attachedDocs = (docs || [])
      .filter((doc) => Boolean(doc?.id) && isSpreadsheetDocument(doc))
      .slice(0, 2)
      .map((doc) => buildAttachedDocMeta(doc));

    if (attachedDocs.length === 0) return;

    const orgContext: ChatContext = { type: 'org' };
    setChatContext(orgContext);
    setDeepResearchEnabled(false);
    setPinnedDocMetaById((prev) => {
      const next = { ...prev };
      for (const doc of attachedDocs) {
        next[doc.id] = doc;
      }
      return next;
    });
    handlePinnedDocIdsChange(attachedDocs.map((doc) => doc.id));
    setActiveSpecializedMode('spreadsheet_analyst');
    void handleSubmit(
      buildSpreadsheetAnalystKickoffPrompt(attachedDocs),
      orgContext,
      {
        deepResearchEnabled: false,
        attachedDocsOverride: attachedDocs,
        specializedMode: 'spreadsheet_analyst',
      }
    );
  }, [buildAttachedDocMeta, handlePinnedDocIdsChange, handleSubmit]);

  const submitWorkflowInvocationFromDialog = useCallback(() => {
    if (!chatWorkflowInputCardEnabled) return;
    if (isLoading) {
      setWorkflowFormError('Please wait for the current response to finish before starting a workflow run.');
      return;
    }
    if (!isChatNewRoute) {
      setWorkflowFormError('Workflow-in-chat is currently available on the /chatnew experience.');
      return;
    }
    const { orgId } = getApiContext();
    const gatewayEnabled = String(process.env.NEXT_PUBLIC_CHATNEW_USE_GATEWAY || 'true').toLowerCase() !== 'false';
    if (!orgId || !gatewayEnabled) {
      setWorkflowFormError('Chat gateway mode is required for workflow runs. Please enable gateway mode and retry.');
      return;
    }
    if (!selectedWorkflowTemplate) {
      setWorkflowFormError('Select a workflow template to continue.');
      return;
    }

    const effectiveWorkflowInputValues: Record<string, any> = { ...workflowInputValues };
    const hasInputField = (inputKey: string) => workflowInputFields.some(
      (field) => normalizeWorkflowInputKey(field.key) === inputKey
    );
    const coerceDocIds = (raw: unknown): string[] => {
      if (Array.isArray(raw)) return raw.map((item) => String(item || '').trim()).filter(Boolean);
      const single = String(raw || '').trim();
      return single ? [single] : [];
    };
    if (hasInputField('doc_id') || hasInputField('doc_ids')) {
      const currentDocId = String(effectiveWorkflowInputValues.doc_id || '').trim();
      const currentDocIds = coerceDocIds(effectiveWorkflowInputValues.doc_ids);
      if (!currentDocId && currentDocIds.length > 0 && hasInputField('doc_id')) {
        effectiveWorkflowInputValues.doc_id = currentDocIds[0];
      }
      if (currentDocIds.length === 0 && currentDocId && hasInputField('doc_ids')) {
        effectiveWorkflowInputValues.doc_ids = [currentDocId];
      }
    }

    const missingRequired = workflowInputFields.filter((field) => {
      if (!field.required) return false;
      return !workflowInputHasValue(field, effectiveWorkflowInputValues[field.key]);
    });
    if (missingRequired.length > 0) {
      const missingLabel = missingRequired.slice(0, 3).map((field) => field.label).join(', ');
      const extra = missingRequired.length > 3 ? ` (+${missingRequired.length - 3} more)` : '';
      setWorkflowFormError(`Fill required inputs: ${missingLabel}${extra}`);
      return;
    }

    const normalizedInput: Record<string, any> = {};
    workflowInputFields.forEach((field) => {
      const rawValue = effectiveWorkflowInputValues[field.key];
      if (!workflowInputHasValue(field, rawValue)) return;
      normalizedInput[field.key] = normalizeWorkflowFieldValueForSubmit(field, rawValue);
    });

    const invocationId =
      typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
        ? (crypto as any).randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const workflowInvocation: ChatWorkflowInvocationPayload = {
      templateId: selectedWorkflowTemplate.id,
      templateVersion: selectedWorkflowTemplateVersion,
      input: normalizedInput,
      context: {
        source: 'chatnew.workflow_input_card',
        ui: 'workflow_input_card',
      },
      mode: 'run',
      invocationId,
    };

    const userMessage = buildWorkflowRunUserMessage(selectedWorkflowTemplate.name, normalizedInput);
    const orgContext: ChatContext = { type: 'org' };
    closeWorkflowDialog();
    if (typeof window !== 'undefined' && workflowDraftStorageKey) {
      window.localStorage.removeItem(workflowDraftStorageKey);
    }
    workflowDraftHydratedKeyRef.current = null;
    setWorkflowInputValues({});
    setWorkflowInputFields([]);
    setSelectedWorkflowTemplateId('');
    setSelectedWorkflowTemplateVersion(undefined);
    setChatContext(orgContext);
    void handleSubmit(userMessage, orgContext, {
      deepResearchEnabled: false,
      workflowInvocation,
    });
  }, [
    chatWorkflowInputCardEnabled,
    closeWorkflowDialog,
    handleSubmit,
    isChatNewRoute,
    isLoading,
    selectedWorkflowTemplate,
    selectedWorkflowTemplateVersion,
    workflowDraftStorageKey,
    workflowInputFields,
    workflowInputValues,
  ]);

  const startCreateDocumentFlow = useCallback(() => {
    setHasSelectedTemplateInFlow(false);
    setSelectedTemplateCard(null);
    setSelectedTemplateCardMessageId(null);
    const kickoffPrompt = [
      "Can you create a document for me?",
      "Show me available templates first and let me choose one.",
    ].join(' ');
    const orgContext: ChatContext = { type: 'org' };
    setChatContext(orgContext);
    handleSubmit(kickoffPrompt, orgContext, { deepResearchEnabled: false });
  }, [handleSubmit]);

  const handleTemplateCardSelect = useCallback((template: DocumentTemplateOption) => {
    setHasSelectedTemplateInFlow(true);
    setSelectedTemplateCard(template);
    setSelectedTemplateCardMessageId(null);
    const orgContext: ChatContext = { type: 'org' };
    setChatContext(orgContext);
    handleSubmit(buildTemplateSelectPrompt(template), orgContext, { deepResearchEnabled: false, skipUserMessage: true });
  }, [handleSubmit]);

  // Map template_id → sample PDF filename in public/templates/
  const TEMPLATE_PREVIEW_PDF_MAP: Record<string, string> = {
    sales_deed_v1: 'sales_deed_v2.pdf',
    gst_tax_invoice_v1: 'gst_invoice.pdf',
    development_agreement_v1: 'development_agreement.pdf',
    tds_certificate_v1: 'tds_certificate.pdf',
    payment_advice_v1: 'payment_advice.pdf',
  };

  const handleTemplatePreview = useCallback((template: DocumentTemplateOption) => {
    const pdfFile = TEMPLATE_PREVIEW_PDF_MAP[template.template_id];
    if (!pdfFile) return;
    setGeneratedPdfPreview({
      title: `${template.name} — Sample Preview`,
      fileName: pdfFile,
      previewUrl: `/templates/${pdfFile}`,
    });
    setActionCenterTab('preview');
    setIsActionCenterOpen(true);
  }, []);

  return (
    <AppLayout collapseSidebar={shouldAutoCollapseLeftNav}>
      <div className={cn("flex h-[100dvh] min-h-0 w-full overflow-hidden md:h-svh", isActionCenterPinned && "gap-0")}>
        <div
          className={cn(
            "mx-auto flex min-h-0 w-full max-w-[98%] flex-col overflow-hidden px-2 font-poppins text-sm sm:px-3 md:px-4",
            !isActionCenterResizing && 'transition-[margin] duration-300',
            !isActionCenterPinned && isSidebarOpen && 'sm:mr-[420px] lg:mr-[var(--action-center-width)]'
          )}
          style={actionCenterLayoutStyle}
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
                  setGeneratedPdfPreview(null);
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
          {isHydratingChatHistory ? (
            // Skeleton loader while chat history is being restored
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-2 sm:px-3 md:px-4 py-6 sm:py-8">
              <div className="w-full max-w-3xl mx-auto space-y-6">
                {/* Skeleton user message */}
                <div className="flex justify-end">
                  <Skeleton className="h-10 w-[60%] rounded-2xl" />
                </div>
                {/* Skeleton assistant message */}
                <div className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-[90%]" />
                    <Skeleton className="h-4 w-[75%]" />
                    <Skeleton className="h-4 w-[40%]" />
                  </div>
                </div>
                {/* Skeleton user message */}
                <div className="flex justify-end">
                  <Skeleton className="h-10 w-[45%] rounded-2xl" />
                </div>
                {/* Skeleton assistant message */}
                <div className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-[85%]" />
                    <Skeleton className="h-4 w-[60%]" />
                  </div>
                </div>
              </div>
            </div>
          ) : hasAnyMessage ? (
            // Main Chat Layout - Flex Column
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
              {chatNewRecentSessionsPanel ? (
                <div className="px-2 sm:px-3 md:px-4 pt-3 sm:pt-4 flex-shrink-0">
                  <div className="w-full max-w-4xl mx-auto">
                    {chatNewRecentSessionsPanel}
                  </div>
                </div>
              ) : null}

              {/* Messages Area - Flex Grow */}
              <div className="flex-1 overflow-x-hidden overflow-y-auto px-2 sm:px-3 md:px-4 scrollbar-hide" ref={scrollAreaRef}>
                <div className="w-full max-w-full mx-auto py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 md:space-y-8 min-h-full" style={{ overflowX: 'hidden' }}>
                  {isChatNewRoute && sessionId && chatHistoryHasMoreBefore ? (
                    <div className="w-full flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { void loadOlderChatHistoryMessages(); }}
                        disabled={isLoadingOlderChatHistory}
                        className="h-8 rounded-full px-3 text-xs"
                      >
                        {isLoadingOlderChatHistory ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : null}
                        {isLoadingOlderChatHistory ? 'Loading older messages...' : 'Load older messages'}
                      </Button>
                    </div>
                  ) : null}
                  {messages.map((message, idx) => {
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
                            <div className="flex-1 min-w-0 space-y-2 sm:space-y-3 md:space-y-4 overflow-hidden">
                              {/* Loading state */}
                              {message.isStreaming && !message.content && (
                                isChatNewRoute ? (
                                  <motion.span
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{
                                      opacity: 1,
                                      y: 0,
                                      backgroundPosition: ['100% 50%', '0% 50%'],
                                    }}
                                    transition={{
                                      opacity: { duration: 0.2, ease: 'easeOut' },
                                      y: { duration: 0.2, ease: 'easeOut' },
                                      backgroundPosition: {
                                        duration: 1.6,
                                        repeat: Infinity,
                                        ease: 'linear',
                                      },
                                    }}
                                    className={cn(
                                      "inline-block bg-[length:200%_100%] bg-clip-text text-[11px] font-medium uppercase tracking-[0.08em] text-transparent sm:text-xs",
                                      "bg-gradient-to-r from-muted-foreground/35 via-foreground/95 to-muted-foreground/35"
                                    )}
                                  >
                                    Thinking...
                                  </motion.span>
                                ) : (
                                  <div className="flex items-center gap-2 sm:gap-3 rounded-xl border border-border/30 bg-muted/20 p-3 sm:rounded-2xl sm:p-4">
                                    <div className="flex gap-1.5">
                                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60 sm:h-2 sm:w-2" style={{ animationDelay: '0ms' }} />
                                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60 sm:h-2 sm:w-2" style={{ animationDelay: '150ms' }} />
                                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60 sm:h-2 sm:w-2" style={{ animationDelay: '300ms' }} />
                                    </div>
                                    <Shimmer as="span" className="text-xs sm:text-sm" duration={2}>
                                      Working...
                                    </Shimmer>
                                  </div>
                                )
                              )}

                              {/* Agent activity using Task component */}
                              {(() => {
                                const { steps: activitySteps } = buildActivityInsights(message);
                                const hasOnlyRespondStage = activitySteps.length === 1 && activitySteps[0]?.step === 'respond';
                                const hasSteps = activitySteps.length > 0 && !hasOnlyRespondStage;

                                if (!hasSteps) return null;

                                return (
                                  <div className="space-y-3">
                                    {/* Primary trace (single natural flow, no separate tool bucket) */}
                                    {hasSteps && (
                                      <Task defaultOpen>
                                        <TaskTrigger title="Progress" />
                                        <TaskContent>
                                          {activitySteps.map((step: any, index: number) => {
                                            const duration = formatDurationMs(step.startedAtMs, step.endedAtMs);
                                            const statusLabel =
                                              step.status === 'error'
                                                ? 'Error'
                                                : step.status === 'in_progress'
                                                  ? 'Running'
                                                  : 'Done';

                                            return (
                                              <TaskItem key={`${step.step}-${index}`}>
                                                <div className="flex items-center justify-between gap-2">
                                                  <div className="min-w-0 flex items-center gap-2">
                                                    <span className={cn(
                                                      "shrink-0 flex items-center justify-center w-5 h-5 rounded-full",
                                                      step.status === 'error' && 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
                                                      step.status === 'in_progress' && 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
                                                      step.status === 'completed' && 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                    )}>
                                                      {step.status === 'error'
                                                        ? <X className="w-3 h-3" />
                                                        : step.status === 'in_progress'
                                                          ? <Loader2 className="w-3 h-3 animate-spin" />
                                                          : <Check className="w-3 h-3" />}
                                                    </span>
                                                    <span className="min-w-0 truncate">{step.description || step.title}</span>
                                                  </div>
                                                  <span className={cn(
                                                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                                                    step.status === 'error' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                                                    step.status === 'in_progress' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                                                    step.status === 'completed' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                  )}>
                                                    {statusLabel}
                                                    {step.status === 'completed' && duration ? ` • ${duration}` : ''}
                                                  </span>
                                                </div>
                                              </TaskItem>
                                            );
                                          })}
                                        </TaskContent>
                                      </Task>
                                    )}
                                  </div>
                                );
                              })()}

                              {(() => {
                                const workflowSteps = buildDocumentWorkflowSteps(message);
                                if (!workflowSteps) return null;

                                // Calculate progress for the neural line
                                const completedCount = workflowSteps.filter(s => s.state === 'completed').length;
                                const activeIdx = workflowSteps.findIndex(s => s.state === 'in_progress');
                                const totalSteps = workflowSteps.length;
                                // Line progress: completed steps fill segments, active step fills half
                                const lineProgress = activeIdx >= 0
                                  ? ((activeIdx + 0.5) / totalSteps) * 100
                                  : (completedCount / totalSteps) * 100;

                                const chipIcons: Record<string, React.ReactNode> = {
                                  extract: (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 18, height: 18 }}>
                                      <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M21 17v2a2 2 0 01-2 2h-2M7 12h10" />
                                    </svg>
                                  ),
                                  create_pdf: (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 18, height: 18 }}>
                                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                      <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                  ),
                                  respond: (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 18, height: 18 }}>
                                      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                                    </svg>
                                  ),
                                };

                                const statePercent = (state: WorkflowStepState) => {
                                  if (state === 'completed') return '100%';
                                  if (state === 'in_progress') return '...';
                                  if (state === 'error') return '!';
                                  return '0%';
                                };

                                return (
                                  <div style={{ position: 'relative', width: '100%', maxWidth: '850px', padding: '20px 0' }}>
                                    <style>{`
                                      @keyframes wf-ring-pulse {
                                        0% { transform: scale(1); opacity: 0.5; }
                                        100% { transform: scale(1.5); opacity: 0; }
                                      }
                                    `}</style>

                                    {/* Neural Thread SVG */}
                                    <svg
                                      style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '10%',
                                        width: '80%',
                                        zIndex: 0,
                                        transform: 'translateY(-50%)',
                                        overflow: 'visible',
                                      }}
                                      viewBox="0 0 400 2"
                                      fill="none"
                                    >
                                      {/* Background track */}
                                      <path d="M0 1H400" stroke="#FFDCC9" strokeWidth="2" />
                                      {/* Animated progress */}
                                      <path
                                        d="M0 1H400"
                                        stroke="#FF7A30"
                                        strokeWidth="2"
                                        strokeDasharray="400"
                                        strokeDashoffset={400 - (lineProgress / 100) * 400}
                                        style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
                                      />
                                    </svg>

                                    {/* Chips */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                                      {workflowSteps.map((step) => {
                                        const isActive = step.state === 'in_progress';
                                        const isCompleted = step.state === 'completed';
                                        const isError = step.state === 'error';

                                        return (
                                          <div
                                            key={step.key}
                                            style={{
                                              background: isCompleted ? '#FFF9F6' : '#FFFFFF',
                                              border: `1.5px solid ${isCompleted ? '#FF7A30' : isActive ? '#FFDCC9' : '#F1F5F9'}`,
                                              padding: '14px 24px',
                                              borderRadius: '20px',
                                              position: 'relative',
                                              transition: 'all 0.5s cubic-bezier(0.2, 1, 0.3, 1)',
                                              width: '200px',
                                              cursor: 'default',
                                              boxShadow: isActive
                                                ? '0 12px 20px -8px rgba(255, 122, 48, 0.15)'
                                                : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                              transform: isActive ? 'translateY(-4px)' : 'none',
                                            }}
                                          >
                                            {/* Chip Inner */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', position: 'relative', zIndex: 2 }}>
                                              {/* Icon Box */}
                                              <div
                                                style={{
                                                  width: '36px',
                                                  height: '36px',
                                                  borderRadius: '10px',
                                                  background: isCompleted ? '#FF7A30' : isActive ? '#FFF5F0' : '#F8FAFC',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  color: isCompleted ? 'white' : isActive ? '#FF7A30' : '#64748B',
                                                  position: 'relative',
                                                  transition: 'all 0.3s',
                                                }}
                                              >
                                                {chipIcons[step.key] || step.icon}
                                                {/* Pulse ring for active */}
                                                {isActive && (
                                                  <div
                                                    style={{
                                                      position: 'absolute',
                                                      width: '100%',
                                                      height: '100%',
                                                      borderRadius: '10px',
                                                      border: '2px solid #FF7A30',
                                                      animation: 'wf-ring-pulse 1.5s infinite',
                                                    }}
                                                  />
                                                )}
                                              </div>

                                              {/* Content */}
                                              <div>
                                                <span
                                                  style={{
                                                    display: 'block',
                                                    fontSize: '13px',
                                                    fontWeight: 700,
                                                    color: isError ? '#DC2626' : '#0F172A',
                                                    whiteSpace: 'nowrap',
                                                  }}
                                                >
                                                  {step.label}
                                                </span>
                                                <span
                                                  style={{
                                                    display: 'block',
                                                    fontSize: '11px',
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    color: isError ? '#DC2626' : '#FF7A30',
                                                    fontWeight: 800,
                                                    opacity: isActive || isCompleted || isError ? 1 : 0,
                                                    transition: 'opacity 0.3s',
                                                  }}
                                                >
                                                  {statePercent(step.state)}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Glow Layer */}
                                            {isCompleted && (
                                              <div
                                                style={{
                                                  position: 'absolute',
                                                  inset: 0,
                                                  borderRadius: '20px',
                                                  background: 'radial-gradient(circle at center, #FF7A30 0%, transparent 70%)',
                                                  opacity: 0.08,
                                                  zIndex: 1,
                                                }}
                                              />
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Main Response Content */}
                              {(() => {
                                const workflow = message.metadata?.document_workflow;
                                const templates = Array.isArray(workflow?.templates) ? workflow.templates : [];
                                const workflowStatus = String(workflow?.status || '').toLowerCase();
                                const showTemplateCards =
                                  templates.length > 0 &&
                                  TEMPLATE_SELECTOR_STATUSES.has(workflowStatus) &&
                                  !hasSelectedTemplateInFlow;
                                const contentForDisplay = sanitizeAssistantContentForDisplay(message);
                                if (!contentForDisplay || showTemplateCards) return null;
                                return (
                                  <div className="prose prose-sm max-w-none text-foreground dark:prose-invert [&>p]:leading-relaxed text-xs sm:text-sm break-words overflow-wrap-anywhere pl-1">
                                    {processContentWithCitations(
                                      contentForDisplay,
                                      message.citations,
                                      (citation, context) => handlePreviewFromMessage(citation, context)
                                    )}
                                  </div>
                                );
                              })()}

                              {(() => {
                                const workflow = message.metadata?.document_workflow;
                                if (!workflow) return null;
                                const status = String(workflow.status || '').trim().toLowerCase();
                                const unmet = Array.isArray(workflow.requested_changes_unmet)
                                  ? workflow.requested_changes_unmet
                                    .map((item) => String(item || '').trim())
                                    .filter(Boolean)
                                  : [];
                                const ambiguous = Array.isArray(workflow.ambiguous_references)
                                  ? workflow.ambiguous_references
                                    .map((item) => String(item || '').trim())
                                    .filter(Boolean)
                                  : [];
                                const showAlert =
                                  unmet.length > 0 ||
                                  ambiguous.length > 0 ||
                                  status === 'edit_postcondition_failed' ||
                                  status === 'edit_needs_clarification' ||
                                  status === 'edit_precondition_failed' ||
                                  status === 'revision_conflict';
                                if (!showAlert) return null;

                                const artifactRef = workflow.artifact_ref;
                                const artifactId = String(artifactRef?.artifact_id || '').trim();
                                const revisionValue = Number(artifactRef?.revision || 0);
                                const revisionLabel = Number.isFinite(revisionValue) && revisionValue > 0
                                  ? `rev ${revisionValue}`
                                  : null;

                                return (
                                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                                    <p className="text-[11px] sm:text-xs font-semibold text-amber-800">
                                      Document edit needs attention
                                    </p>
                                    {unmet.length > 0 ? (
                                      <ul className="mt-1 list-disc pl-5 text-[11px] sm:text-xs text-amber-800 space-y-0.5">
                                        {unmet.slice(0, 6).map((item, idx) => (
                                          <li key={`unmet-${idx}`}>{item}</li>
                                        ))}
                                      </ul>
                                    ) : null}
                                    {ambiguous.length > 0 ? (
                                      <div className="mt-1.5 text-[11px] sm:text-xs text-amber-800">
                                        <span className="font-semibold">Ambiguous:</span>{' '}
                                        {ambiguous.slice(0, 4).join('; ')}
                                      </div>
                                    ) : null}
                                    {artifactId ? (
                                      <div className="mt-1.5 text-[10px] sm:text-[11px] font-mono text-amber-700">
                                        Artifact {artifactId}{revisionLabel ? ` · ${revisionLabel}` : ''}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })()}

                              {(() => {
                                const workflow = message.metadata?.document_workflow;
                                const templates = Array.isArray(workflow?.templates) ? workflow.templates : [];
                                const workflowStatus = String(workflow?.status || '').toLowerCase();
                                const showTemplateCards =
                                  templates.length > 0 &&
                                  TEMPLATE_SELECTOR_STATUSES.has(workflowStatus) &&
                                  !hasSelectedTemplateInFlow;
                                if (!showTemplateCards) return null;

                                return (
                                  <TemplateTray
                                    templates={templates}
                                    onSelect={handleTemplateCardSelect}
                                    onPreview={handleTemplatePreview}
                                  />
                                );
                              })()}

                              {(() => {
                                const workflow = message.metadata?.document_workflow;
                                const workflowStatus = String(workflow?.status || '').toLowerCase();
                                const hasChosenTemplate = hasSelectedTemplateInFlow && Boolean(selectedTemplateCard);
                                const isSelectionStage = TEMPLATE_SELECTOR_STATUSES.has(workflowStatus);
                                const shouldShowInThisMessage = selectedTemplateCardMessageId === message.id;
                                if (!hasChosenTemplate || isSelectionStage || !shouldShowInThisMessage) return null;
                                const capturedFields = workflow?.captured_fields || {};
                                const hasCapturedValues = Object.values(capturedFields).some((value) => String(value || '').trim().length > 0);
                                return (
                                  <SelectedTemplateIsland
                                    templateName={selectedTemplateCard?.name || 'Template'}
                                    templateId={selectedTemplateCard?.template_id || ''}
                                    badge={selectedTemplateCard?.badge}
                                    hasCapturedValues={hasCapturedValues}
                                    onAutofill={() => {
                                      const orgContext: ChatContext = { type: 'org' };
                                      setChatContext(orgContext);
                                      handleSubmit('autofill', orgContext, { deepResearchEnabled: false });
                                    }}
                                  />
                                );
                              })()}

                              {(() => {
                                const generatedDoc = message.metadata?.generated_document;
                                if (!generatedDoc) return null;
                                const previewUrl = getGeneratedDocumentPreviewUrl(generatedDoc);
                                const downloadUrl = getGeneratedDocumentDownloadUrl(generatedDoc);
                                if (!previewUrl && !downloadUrl) return null;
                                const format = getGeneratedDocumentFormat(generatedDoc);
                                const formatBadge = String(format || 'file').toUpperCase();
                                const displayTitle = (generatedDoc.title || 'Generated Draft').replace(/\s*-\s*Draft$/i, '');
                                const fileName = generatedDoc.file_name || `document.${format || 'file'}`;
                                return (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      background: '#FFFFFF',
                                      border: '1px solid #E2E8F0',
                                      borderRadius: '16px',
                                      padding: '10px 14px',
                                      width: '100%',
                                      maxWidth: '720px',
                                      height: '56px',
                                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                                      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                    }}
                                    className="hover:border-[#FFDCC9] hover:shadow-[0_12px_24px_rgba(255,122,48,0.08)] hover:-translate-y-[1px]"
                                  >
                                    {/* File Branding */}
                                    <div style={{ marginRight: '16px' }}>
                                      <div style={{
                                        position: 'relative',
                                        width: '36px',
                                        height: '36px',
                                        background: '#FFF5F0',
                                        color: '#FF7A30',
                                        borderRadius: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}>
                                        {resolveDocIcon(fileName, 'w-[18px] h-[18px]')}
                                        <span style={{
                                          position: 'absolute',
                                          bottom: '-2px',
                                          right: '-4px',
                                          background: '#FF7A30',
                                          color: 'white',
                                          fontSize: '8px',
                                          fontWeight: 900,
                                          padding: '2px 4px',
                                          borderRadius: '4px',
                                          border: '2px solid white',
                                        }}>{formatBadge}</span>
                                      </div>
                                    </div>

                                    {/* File Details */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1px' }}>
                                        <h3 style={{
                                          fontSize: '14px',
                                          fontWeight: 700,
                                          color: '#0F172A',
                                          margin: 0,
                                          whiteSpace: 'nowrap',
                                        }}>{displayTitle}</h3>
                                        <span style={{
                                          fontSize: '10px',
                                          fontWeight: 800,
                                          textTransform: 'uppercase' as const,
                                          background: '#F1F5F9',
                                          color: '#64748B',
                                          padding: '2px 8px',
                                          borderRadius: '6px',
                                          flexShrink: 0,
                                        }}>Draft</span>
                                      </div>
                                      <p
                                        title={fileName}
                                        style={{
                                          fontSize: '12px',
                                          color: '#64748B',
                                          margin: 0,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          maxWidth: '300px',
                                        }}
                                      >{fileName}</p>
                                    </div>

                                    {/* Action Group */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '20px' }}>
                                      {previewUrl && (
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault();
                                            handlePreviewGeneratedPdf(generatedDoc);
                                          }}
                                          style={{
                                            background: 'transparent',
                                            border: '1px solid #E2E8F0',
                                            color: '#0F172A',
                                            height: '36px',
                                            padding: '0 14px',
                                            borderRadius: '10px',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            cursor: 'pointer',
                                            transition: '0.2s',
                                          }}
                                          className="hover:!bg-[#F8FAFC] hover:!border-[#CBD5E1]"
                                        >
                                          <Eye style={{ width: '15px', height: '15px' }} />
                                          <span>Preview</span>
                                        </button>
                                      )}
                                      {downloadUrl && (
                                        <a
                                          href={downloadUrl}
                                          style={{
                                            background: '#FF7A30',
                                            border: 'none',
                                            color: 'white',
                                            height: '36px',
                                            padding: '0 16px',
                                            borderRadius: '10px',
                                            fontSize: '13px',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 10px rgba(255, 122, 48, 0.2)',
                                            transition: '0.2s',
                                            textDecoration: 'none',
                                          }}
                                          className="hover:-translate-y-[1px] hover:shadow-[0_6px_14px_rgba(255,122,48,0.3)] hover:brightness-105"
                                        >
                                          <Download style={{ width: '15px', height: '15px' }} />
                                          <span>Download</span>
                                        </a>
                                      )}
                                    </div>
                                  </motion.div>
                                );
                              })()}

                              {/* Inline JSON artifact export card — shows when this message produced the document artifact */}
                              {(() => {
                                const artifact = actionCenterJsonArtifact;
                                if (!artifact || !artifact.data) return null;
                                // Only show on the message that produced this artifact
                                if (artifact.sourceMessageId !== message.id) return null;
                                const data = artifact.data as any;
                                const EXPORTABLE = ['invoice', 'purchase_order', 'receipt', 'quotation', 'delivery_note'] as const;
                                type ET = typeof EXPORTABLE[number];
                                const inferredType: ET | null = (() => {
                                  const dt = String(data?.document_type || data?.doc_type || '').toLowerCase();
                                  for (const t of EXPORTABLE) if (dt.includes(t.replace('_', ' ')) || dt.includes(t)) return t;
                                  if (data?.invoice_number && data?.items && (data?.totals || data?.total_amount !== undefined)) return 'invoice';
                                  if (data?.po_number && data?.items) return 'purchase_order';
                                  if (data?.receipt_number) return 'receipt';
                                  if (data?.quote_number && data?.items) return 'quotation';
                                  if (data?.delivery_note_number && data?.items) return 'delivery_note';
                                  return null;
                                })();
                                if (!inferredType) return null;
                                const labelMap: Record<ET, string> = {
                                  invoice: 'Invoice', purchase_order: 'Purchase Order',
                                  receipt: 'Receipt', quotation: 'Quotation', delivery_note: 'Delivery Note',
                                };
                                const docNum = data?.invoice_number || data?.po_number || data?.receipt_number || data?.quote_number || data?.delivery_note_number || '';
                                const displayTitle = artifact.title?.replace(/\.json$/i, '') || labelMap[inferredType];
                                return (
                                  <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                                    className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 shadow-sm hover:border-border hover:shadow-md transition-all duration-200 w-full max-w-[720px]"
                                  >
                                    {/* Icon */}
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                                      <FileText className="h-4 w-4" />
                                    </div>
                                    {/* Info */}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[13px] font-semibold text-foreground">{displayTitle}</p>
                                      {docNum && <p className="text-[11px] text-muted-foreground font-mono truncate">{docNum}</p>}
                                    </div>
                                    {/* Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="button"
                                        className="flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 text-[11px] font-semibold text-foreground/80 transition hover:bg-muted hover:text-foreground"
                                        onClick={async () => {
                                          try {
                                            const { downloadDocumentPdfV2 } = await import('@/lib/invoice-export');
                                            const rendering = data?._briefly_generation_context?.effective_template?.rendering;
                                            await downloadDocumentPdfV2({
                                              templateType: exportTemplateType as any,
                                              data,
                                              htmlTemplate: rendering?.html_template ?? null,
                                              css: rendering?.css ?? null,
                                              branding: rendering?.branding ?? null,
                                            });
                                          } catch (e) { console.error('PDF export failed:', e); }
                                        }}
                                      >
                                        <Download className="h-3 w-3" /> PDF
                                      </button>
                                      <button
                                        type="button"
                                        className="flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 text-[11px] font-semibold text-foreground/80 transition hover:bg-muted hover:text-foreground"
                                        onClick={async () => {
                                          try {
                                            const { downloadDocumentDocx } = await import('@/lib/document-export');
                                            await downloadDocumentDocx(exportTemplateType as any, data);
                                          } catch (e) { console.error('DOCX export failed:', e); }
                                        }}
                                      >
                                        <Download className="h-3 w-3" /> DOCX
                                      </button>
                                      <button
                                        type="button"
                                        className="flex h-8 items-center gap-1.5 rounded-full bg-orange-500 px-3 text-[11px] font-bold text-white shadow-sm transition hover:bg-orange-600 hover:shadow-md"
                                        onClick={() => {
                                          setActionCenterTab('json');
                                          setIsActionCenterOpen(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" /> View
                                      </button>
                                    </div>
                                  </motion.div>
                                );
                              })()}

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

                              {(() => {
                                const chartSpec = normalizeChartSpec(message.metadata);
                                if (chartSpec) {
                                  return <InlineResponseChart spec={chartSpec} />;
                                }
                                const chartNotice = getChartNotice(message.metadata);
                                if (!chartNotice) return null;
                                return (
                                  <div className="mt-2 sm:mt-3 rounded-xl border border-border/50 bg-muted/10 px-3 py-2.5 text-[11px] sm:text-xs text-muted-foreground">
                                    {chartNotice}
                                  </div>
                                );
                              })()}

                              {showTokenUsage && message.usage && (
                                <div className="text-[10px] sm:text-xs text-muted-foreground">
                                  Tokens: in {message.usage.tokensIn ?? 'n/a'} out {message.usage.tokensOut ?? 'n/a'} total {message.usage.tokensTotal ?? 'n/a'}
                                  {message.usage.duration ? ` • ${message.usage.duration.toFixed(2)}s` : ''}
                                  {message.usage.model ? ` • ${message.usage.model}` : ''}
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
                  {activeArtifactRef?.artifact_id ? (
                    <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] sm:text-xs text-amber-800">
                      <span className="font-semibold">Active draft:</span>{' '}
                      <span className="font-mono">
                        {activeArtifactRef.artifact_id}
                        {activeArtifactRef.revision && activeArtifactRef.revision > 0
                          ? ` · rev ${activeArtifactRef.revision}`
                          : ''}
                      </span>
                    </div>
                  ) : null}
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
                      defaultDeepResearch={deepResearchEnabled}
                      deepResearchEnabled={deepResearchEnabled}
                      onDeepResearchChange={setDeepResearchEnabled}
                      webSearch={webSearchEnabled}
                      onWebSearchChange={handleWebSearchChange}
                      defaultFolderId={selectedFolderId}
                      defaultDocumentId={selectedDocumentId}
                      defaultDocumentName={chatContext.type === 'document' ? chatContext.name || null : null}
                      pinnedDocIds={pinnedDocIds}
                      onPinnedDocIdsChange={handlePinnedDocIdsChange}
                      onRequestFilePicker={() => setFileNavigatorMode('general')}
                      onRequestAnalyzeSpreadsheet={() => setFileNavigatorMode('spreadsheet')}
                      onRequestCreateDraftDocument={startCreateDocumentFlow}
                      runWorkflowEnabled={chatWorkflowInputCardEnabled && isChatNewRoute}
                      onRequestRunWorkflow={openWorkflowDialog}
                      placeholder={
                        chatContext.type === 'document'
                          ? `Ask about "${chatContext.name || 'this document'}"...`
                          : chatContext.type === 'folder'
                            ? `Ask about documents in "${chatContext.name || 'this folder'}"...`
                            : 'Ask about clauses, dates, people, risks, or compliance...'
                      }
                      sending={isLoading}
                      onSend={({ text, mode, folderId, documentId, folderName, documentName, webSearch, deepResearch }) => {
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
                        setDeepResearchEnabled(deepResearch);
                        handleSubmit(text, nextContext, { deepResearchEnabled: deepResearch });
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
                  {chatNewRecentSessionsPanel ? (
                    <div className="mb-4 sm:mb-5 md:mb-6">
                      {chatNewRecentSessionsPanel}
                    </div>
                  ) : null}
                  {/* Welcome Message */}
                  <div className="mb-6 sm:mb-8 md:mb-12 text-center animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="mb-4 sm:mb-6 inline-flex items-center justify-center">
                      <LivingCharacter isThinking={isLoading} />
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
                  {activeArtifactRef?.artifact_id ? (
                    <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] sm:text-xs text-amber-800">
                      <span className="font-semibold">Active draft:</span>{' '}
                      <span className="font-mono">
                        {activeArtifactRef.artifact_id}
                        {activeArtifactRef.revision && activeArtifactRef.revision > 0
                          ? ` · rev ${activeArtifactRef.revision}`
                          : ''}
                      </span>
                    </div>
                  ) : null}
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
                      defaultDeepResearch={deepResearchEnabled}
                      deepResearchEnabled={deepResearchEnabled}
                      onDeepResearchChange={setDeepResearchEnabled}
                      webSearch={webSearchEnabled}
                      onWebSearchChange={handleWebSearchChange}
                      defaultFolderId={selectedFolderId}
                      defaultDocumentId={selectedDocumentId}
                      defaultDocumentName={chatContext.type === 'document' ? chatContext.name || null : null}
                      pinnedDocIds={pinnedDocIds}
                      onPinnedDocIdsChange={handlePinnedDocIdsChange}
                      onRequestFilePicker={() => setFileNavigatorMode('general')}
                      onRequestAnalyzeSpreadsheet={() => setFileNavigatorMode('spreadsheet')}
                      onRequestCreateDraftDocument={startCreateDocumentFlow}
                      runWorkflowEnabled={chatWorkflowInputCardEnabled && isChatNewRoute}
                      onRequestRunWorkflow={openWorkflowDialog}
                      placeholder={
                        chatContext.type === 'document'
                          ? `Ask about "${chatContext.name || 'this document'}"...`
                          : chatContext.type === 'folder'
                            ? `Ask about documents in "${chatContext.name || 'this folder'}"...`
                            : 'Ask about clauses, dates, people, risks, or compliance...'
                      }
                      sending={isLoading}
                      onSend={({ text, mode, folderId, documentId, folderName, documentName, webSearch, deepResearch }) => {
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
                        setDeepResearchEnabled(deepResearch);
                        handleSubmit(text, nextContext, { deepResearchEnabled: deepResearch });
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

        <Dialog
          open={isWorkflowDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeWorkflowDialog();
            } else {
              setIsWorkflowDialogOpen(true);
            }
          }}
        >
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Run Workflow In Chat</DialogTitle>
              <DialogDescription>
                Pick a workflow template, fill required inputs, and run it directly from this chat.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-[260px_1fr]">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-2">
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Templates
                </div>
                <div className="max-h-[44vh] space-y-1 overflow-auto pr-1">
                  {isWorkflowTemplatesLoading ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">Loading templates...</div>
                  ) : workflowTemplates.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">No active workflow templates found.</div>
                  ) : (
                    workflowTemplates.map((template) => {
                      const active = selectedWorkflowTemplateId === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => {
                            setSelectedWorkflowTemplateId(template.id);
                            setWorkflowFormError(null);
                          }}
                          className={cn(
                            'w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
                            active
                              ? 'border-primary/40 bg-primary/10'
                              : 'border-border/50 bg-background hover:bg-muted/50'
                          )}
                        >
                          <div className="truncate text-xs font-semibold">{template.name}</div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {template.description || 'No description'}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px]">v{template.latest_version || '-'}</Badge>
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                              {String(template.template_scope || 'org')}
                            </Badge>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-background p-3">
                {selectedWorkflowTemplate ? (
                  <div className="mb-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                    <div className="text-sm font-semibold">{selectedWorkflowTemplate.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedWorkflowTemplate.description || 'No description available.'}
                    </div>
                  </div>
                ) : null}

                {isWorkflowDefinitionLoading ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Loading workflow inputs...</div>
                ) : workflowInputFields.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
                    This workflow has no explicit inputs. You can run it directly.
                  </div>
                ) : (
                  <div className="max-h-[44vh] space-y-3 overflow-auto pr-1">
                    {workflowInputFields.map((field) => {
                      const rawValue = workflowInputValues[field.key];
                      const selectedDocName = field.kind === 'doc'
                        ? allDocMetaById.get(String(rawValue || ''))?.filename
                        : null;
                      const selectedDocIds = field.kind === 'doc_list' && Array.isArray(rawValue)
                        ? rawValue.map((value) => String(value || '').trim()).filter(Boolean)
                        : [];
                      const selectedFolderPath = field.kind === 'folder'
                        ? (Array.isArray(rawValue) ? rawValue.map((value) => String(value || '').trim()).filter(Boolean) : [])
                        : [];

                      return (
                        <div key={field.key} className="space-y-1.5 rounded-lg border border-border/50 bg-muted/10 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs font-semibold">
                              {field.label}
                              {field.required ? <span className="ml-1 text-destructive">*</span> : null}
                            </Label>
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase">
                              {field.kind}
                            </Badge>
                          </div>

                          {field.kind === 'text' && (
                            <Input
                              value={typeof rawValue === 'string' ? rawValue : ''}
                              onChange={(event) => setWorkflowInputValue(field.key, event.target.value)}
                              placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
                              className="h-9 text-xs"
                            />
                          )}

                          {field.kind === 'textarea' && (
                            <Textarea
                              value={typeof rawValue === 'string' ? rawValue : ''}
                              onChange={(event) => setWorkflowInputValue(field.key, event.target.value)}
                              placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
                              className="min-h-[90px] text-xs"
                            />
                          )}

                          {field.kind === 'number' && (
                            <Input
                              type="number"
                              value={rawValue == null ? '' : String(rawValue)}
                              onChange={(event) => setWorkflowInputValue(field.key, event.target.value)}
                              placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
                              className="h-9 text-xs"
                            />
                          )}

                          {field.kind === 'date' && (
                            <Input
                              type="date"
                              value={typeof rawValue === 'string' ? rawValue : ''}
                              onChange={(event) => setWorkflowInputValue(field.key, event.target.value)}
                              className="h-9 text-xs"
                            />
                          )}

                          {field.kind === 'boolean' && (
                            <div className="flex items-center justify-between rounded-md border border-border/50 bg-background px-3 py-2">
                              <div className="text-xs text-muted-foreground">Set {field.label.toLowerCase()}</div>
                              <Switch
                                checked={Boolean(rawValue)}
                                onCheckedChange={(checked) => setWorkflowInputValue(field.key, checked)}
                              />
                            </div>
                          )}

                          {field.kind === 'select' && (
                            <select
                              value={typeof rawValue === 'string' ? rawValue : ''}
                              onChange={(event) => setWorkflowInputValue(field.key, event.target.value)}
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                            >
                              <option value="">Select...</option>
                              {(field.enumOptions || []).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          )}

                          {(field.kind === 'doc' || field.kind === 'doc_list' || field.kind === 'folder') && (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setWorkflowFieldPickerState({
                                    open: true,
                                    key: field.key,
                                    kind: field.kind === 'folder' ? 'folder' : (field.kind === 'doc_list' ? 'doc_list' : 'doc'),
                                  })}
                                >
                                  {field.kind === 'folder' ? 'Choose folder' : (field.kind === 'doc_list' ? 'Choose files' : 'Choose file')}
                                </Button>
                                {workflowInputHasValue(field, rawValue) ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setWorkflowInputValue(field.key, field.kind === 'doc_list' ? [] : (field.kind === 'folder' ? [] : ''))}
                                  >
                                    Clear
                                  </Button>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {field.kind === 'doc' && selectedDocName
                                  ? selectedDocName
                                  : field.kind === 'doc' && rawValue
                                    ? `Selected document: ${String(rawValue)}`
                                    : null}
                                {field.kind === 'doc_list' && selectedDocIds.length > 0
                                  ? `Selected ${selectedDocIds.length} document(s): ${selectedDocIds.slice(0, 3).map((docId) => allDocMetaById.get(docId)?.filename || docId).join(', ')}${selectedDocIds.length > 3 ? ` (+${selectedDocIds.length - 3} more)` : ''}`
                                  : null}
                                {field.kind === 'folder' && selectedFolderPath.length > 0
                                  ? `Selected folder: /${selectedFolderPath.join('/')}`
                                  : null}
                              </div>
                            </div>
                          )}

                          {field.description ? (
                            <div className="text-[11px] text-muted-foreground">{field.description}</div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {workflowTemplatesError ? (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {workflowTemplatesError}
                  </div>
                ) : null}
                {workflowFormError ? (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {workflowFormError}
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={closeWorkflowDialog}>
                Cancel
              </Button>
              <Button
                onClick={submitWorkflowInvocationFromDialog}
                disabled={
                  isLoading ||
                  isWorkflowTemplatesLoading ||
                  isWorkflowDefinitionLoading ||
                  !selectedWorkflowTemplateId
                }
              >
                Run Workflow
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {fileNavigatorMode ? (
          <FinderPicker
            open
            onOpenChange={(open) => {
              if (!open) setFileNavigatorMode(null);
            }}
            mode="doc"
            maxDocs={2}
            docTypeFilter={fileNavigatorMode === 'spreadsheet' ? [...SPREADSHEET_FILE_PICKER_DOC_TYPES] : undefined}
            initialSelectedDocIds={fileNavigatorMode === 'spreadsheet' ? [] : pinnedDocIds}
            onConfirm={({ docs }) => {
              const activeFileNavigatorMode = fileNavigatorMode;
              setFileNavigatorMode(null);
              const selectedDocs = (docs || []).filter((d) => Boolean(d?.id)).slice(0, 2);
              if (activeFileNavigatorMode === 'spreadsheet') {
                startSpreadsheetAnalystFlow(selectedDocs);
                return;
              }
              const ids = selectedDocs.map((d) => String(d.id));
              setActiveSpecializedMode(null);
              setPinnedDocMetaById((prev) => {
                const next = { ...prev };
                for (const doc of selectedDocs) {
                  const attachedMeta = buildAttachedDocMeta(doc);
                  next[attachedMeta.id] = attachedMeta;
                }
                return next;
              });
              handlePinnedDocIdsChange(ids);
            }}
          />
        ) : null}

        {workflowFieldPickerState.open ? (
          <FinderPicker
            open
            onOpenChange={(open) => {
              if (!open) {
                setWorkflowFieldPickerState((prev) => ({ ...prev, open: false }));
              }
            }}
            mode={workflowFieldPickerState.kind === 'folder' ? 'folder' : 'doc'}
            maxDocs={workflowFieldPickerState.kind === 'doc' ? 1 : 10}
            initialSelectedDocIds={
              workflowFieldPickerState.kind === 'folder' || !workflowFieldPickerState.key
                ? []
                : workflowFieldPickerState.kind === 'doc'
                  ? [String(workflowInputValues[workflowFieldPickerState.key] || '').trim()].filter(Boolean)
                  : (Array.isArray(workflowInputValues[workflowFieldPickerState.key])
                    ? workflowInputValues[workflowFieldPickerState.key].map((value: unknown) => String(value || '').trim()).filter(Boolean)
                    : [])
            }
            initialPath={
              workflowFieldPickerState.kind === 'folder' && workflowFieldPickerState.key
                ? (Array.isArray(workflowInputValues[workflowFieldPickerState.key])
                  ? workflowInputValues[workflowFieldPickerState.key].map((value: unknown) => String(value || '').trim()).filter(Boolean)
                  : [])
                : []
            }
            onConfirm={({ path, docs }) => {
              const targetKey = workflowFieldPickerState.key;
              const targetField = activeWorkflowPickerField;
              if (!targetKey || !targetField) {
                setWorkflowFieldPickerState({ open: false, key: null, kind: 'doc' });
                return;
              }
              if (workflowFieldPickerState.kind === 'folder') {
                const nextPath = Array.isArray(path) ? path.map((value) => String(value || '').trim()).filter(Boolean) : [];
                setWorkflowInputValue(targetKey, nextPath);
                setWorkflowFieldPickerState({ open: false, key: null, kind: 'doc' });
                return;
              }
              const selectedDocs = Array.isArray(docs) ? docs.filter((doc) => Boolean(doc?.id)) : [];
              if (workflowFieldPickerState.kind === 'doc') {
                const docId = selectedDocs.length > 0 ? String(selectedDocs[0].id) : '';
                setWorkflowInputValue(targetKey, docId);
              } else {
                const docIds = selectedDocs.map((doc) => String(doc.id)).filter(Boolean);
                setWorkflowInputValue(targetKey, docIds);
              }
              setWorkflowFieldPickerState({ open: false, key: null, kind: 'doc' });
            }}
          />
        ) : null}

        {/* Action Center - render in flex container when pinned */}
        {shouldRenderActionCenter && isActionCenterPinned && (
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
                setGeneratedPdfPreview(null);
                setIsActionCenterPinned(false);
              }
            }}
            isPinned={isActionCenterPinned}
            onPinnedChange={(pinned) => {
              handleActionCenterPinnedChange(pinned);
              // When unpinning, keep the action center open in overlay mode
              // Use setTimeout to ensure the overlay component mounts before setting open state
              if (!pinned) {
                setTimeout(() => setIsActionCenterOpen(true), 0);
              }
            }}
            panelWidth={actionCenterWidth}
            onPanelWidthChange={handleActionCenterWidthChange}
            onResizeStateChange={setIsActionCenterResizing}
            activeDocumentId={previewDocId}
            activeDocumentPage={previewDocPage}
            onSelectDocument={handlePreviewDocument}
            onSelectCitation={setPreviewCitation}
            activeCitation={previewCitation}
            memoryDocIds={teamMemory}
            canvas={actionCenterCanvas}
            jsonArtifact={actionCenterJsonArtifact}
            citations={actionCenterCitations}
            allDocuments={allDocs}
            allFolders={allFolders}
            generatedPdfPreview={generatedPdfPreview}
            onClearGeneratedPdfPreview={() => setGeneratedPdfPreview(null)}
            activeTab={actionCenterTab}
            onTabChange={setActionCenterTab}
            citationsMode={actionCenterCitationsMode}
            onCitationsModeChange={handleSourcesModeChange}
            hasMessageScopedCitations={messageScopedCitations.length > 0}
          />
        )}
      </div>

      {/* Action Center - overlay mode when not pinned */}
      {shouldRenderActionCenter && !isActionCenterPinned && (
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
              setGeneratedPdfPreview(null);
              setIsActionCenterPinned(false);
            }
          }}
          isPinned={isActionCenterPinned}
          onPinnedChange={(pinned) => {
            handleActionCenterPinnedChange(pinned);
            // When pinning from overlay, close the overlay
            if (pinned) {
              setIsActionCenterOpen(false);
            }
          }}
          panelWidth={actionCenterWidth}
          onPanelWidthChange={handleActionCenterWidthChange}
          onResizeStateChange={setIsActionCenterResizing}
          activeDocumentId={previewDocId}
          activeDocumentPage={previewDocPage}
          onSelectDocument={handlePreviewDocument}
          onSelectCitation={setPreviewCitation}
          activeCitation={previewCitation}
          memoryDocIds={teamMemory}
          canvas={actionCenterCanvas}
          jsonArtifact={actionCenterJsonArtifact}
          citations={actionCenterCitations}
          allDocuments={allDocs}
          allFolders={allFolders}
          generatedPdfPreview={generatedPdfPreview}
          onClearGeneratedPdfPreview={() => setGeneratedPdfPreview(null)}
          activeTab={actionCenterTab}
          onTabChange={setActionCenterTab}
          citationsMode={actionCenterCitationsMode}
          onCitationsModeChange={handleSourcesModeChange}
          hasMessageScopedCitations={messageScopedCitations.length > 0}
        />
      )}
      {resultsSidebarData && resultsSidebarOpen ? (
          <ResultsSidebar
            open={resultsSidebarOpen}
            onOpenChange={setResultsSidebarOpen}
            columns={resultsSidebarData.columns}
            rows={resultsSidebarData.rows}
            totalCount={resultsSidebarData.totalCount}
            docType={resultsSidebarData.docType}
          />
      ) : null}
    </AppLayout >
  );
}



