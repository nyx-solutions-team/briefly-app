import { apiFetch, getApiContext } from '@/lib/api';
import type { MyQueueItem } from '@/lib/approval-api';
import { dedupRequest } from '@/lib/request-dedup';

export type DocumentsHomeInteraction = 'read' | 'edit' | 'review';

export type DocumentsHomeDocCard = {
  id: string;
  title: string | null;
  filename: string | null;
  type: string;
  folderPath: string[];
  departmentId: string | null;
  uploadedAt: string | null;
  isDraft: boolean;
  head: {
    currentVersionNumber: number;
    lastEditedAt: string | null;
    lastEditedBy: string | null;
    wordCount: number;
    characterCount: number;
  } | null;
  approval: {
    id: string;
    status: string;
    submittedAt: string | null;
    submittedVersionNumber: number | null;
    rejectionReason: string | null;
    currentStageInstanceId: string | null;
  } | null;
};

export type DocumentsHomeRecentComment = {
  threadId: string;
  approvalId: string;
  commentedAt: string;
  status: string;
  message: string;
  doc: DocumentsHomeDocCard;
};

export type DocumentsHomeReturnedItem = {
  approvalId: string;
  rejectedAt: string;
  submittedVersionNumber: number | null;
  rejectionReason: string | null;
  doc: DocumentsHomeDocCard;
};

export type DocumentsHomeContinueItem = {
  interaction: DocumentsHomeInteraction;
  interactedAt: string | null;
  doc: DocumentsHomeDocCard;
};

export type DocumentsHomeWaitingItem = {
  approvalId: string;
  submittedAt: string;
  submittedVersionNumber: number | null;
  currentStageOrder: number | null;
  openThreadCount: number;
  doc: DocumentsHomeDocCard;
};

export type DocumentsHomeResponse = {
  actionRequired: {
    pendingReviews: MyQueueItem[];
    recentComments: DocumentsHomeRecentComment[];
    returnedForChanges: DocumentsHomeReturnedItem[];
  };
  continueWorking: DocumentsHomeContinueItem[];
  waitingOnOthers: DocumentsHomeWaitingItem[];
  availableToMe: DocumentsHomeDocCard[];
};

const DOCUMENTS_HOME_CACHE_TTL_MS = 15_000;
const documentsHomeCache = new Map<string, { data: DocumentsHomeResponse; cachedAt: number }>();

function buildDocumentsHomeCacheKey(orgId: string) {
  return `documents-home:${orgId}`;
}

function readDocumentsHomeCache(cacheKey: string, force = false) {
  if (force) return null;
  const cached = documentsHomeCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > DOCUMENTS_HOME_CACHE_TTL_MS) {
    documentsHomeCache.delete(cacheKey);
    return null;
  }
  return cached.data;
}

function writeDocumentsHomeCache(cacheKey: string, data: DocumentsHomeResponse) {
  documentsHomeCache.set(cacheKey, { data, cachedAt: Date.now() });
}

export function invalidateDocumentsHomeCache(orgId?: string) {
  if (!orgId) {
    documentsHomeCache.clear();
    return;
  }
  documentsHomeCache.delete(buildDocumentsHomeCacheKey(orgId));
}

function normalizeDocCard(raw: any): DocumentsHomeDocCard {
  return {
    id: String(raw?.id || ''),
    title: raw?.title ?? null,
    filename: raw?.filename ?? null,
    type: String(raw?.type || 'document'),
    folderPath: Array.isArray(raw?.folder_path) ? raw.folder_path : Array.isArray(raw?.folderPath) ? raw.folderPath : [],
    departmentId: raw?.department_id ?? raw?.departmentId ?? null,
    uploadedAt: raw?.uploaded_at ?? raw?.uploadedAt ?? null,
    isDraft: Boolean(raw?.is_draft ?? raw?.isDraft),
    head: raw?.head ? {
      currentVersionNumber: Number(raw.head.current_version_number || raw.head.currentVersionNumber || 0) || 0,
      lastEditedAt: raw.head.last_edited_at ?? raw.head.lastEditedAt ?? null,
      lastEditedBy: raw.head.last_edited_by ?? raw.head.lastEditedBy ?? null,
      wordCount: Number(raw.head.word_count || raw.head.wordCount || 0) || 0,
      characterCount: Number(raw.head.character_count || raw.head.characterCount || 0) || 0,
    } : null,
    approval: raw?.approval ? {
      id: String(raw.approval.id),
      status: String(raw.approval.status || ''),
      submittedAt: raw.approval.submitted_at ?? raw.approval.submittedAt ?? null,
      submittedVersionNumber: Number(raw.approval.submitted_version_number || raw.approval.submittedVersionNumber || 0) || null,
      rejectionReason: raw.approval.rejection_reason ?? raw.approval.rejectionReason ?? null,
      currentStageInstanceId: raw.approval.current_stage_instance_id ?? raw.approval.currentStageInstanceId ?? null,
    } : null,
  };
}

export async function getDocumentsHome(options: { force?: boolean } = {}): Promise<DocumentsHomeResponse> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const force = options.force === true;
  const cacheKey = buildDocumentsHomeCacheKey(orgId);
  const cached = readDocumentsHomeCache(cacheKey, force);
  if (cached) return cached;

  return dedupRequest(cacheKey, async () => {
    const raw = await apiFetch<any>(`/orgs/${orgId}/documents/home${force ? '?force=1' : ''}`, { skipCache: true });
    const normalized: DocumentsHomeResponse = {
    actionRequired: {
      pendingReviews: Array.isArray(raw?.action_required?.pending_reviews) ? raw.action_required.pending_reviews : [],
      recentComments: Array.isArray(raw?.action_required?.recent_comments)
        ? raw.action_required.recent_comments.map((item: any) => ({
          threadId: String(item?.thread_id || ''),
          approvalId: String(item?.approval_id || ''),
          commentedAt: item?.commented_at || '',
          status: String(item?.status || 'open'),
          message: String(item?.message || ''),
          doc: normalizeDocCard(item?.doc),
        }))
        : [],
      returnedForChanges: Array.isArray(raw?.action_required?.returned_for_changes)
        ? raw.action_required.returned_for_changes.map((item: any) => ({
          approvalId: String(item?.approval_id || ''),
          rejectedAt: item?.rejected_at || '',
          submittedVersionNumber: Number(item?.submitted_version_number || 0) || null,
          rejectionReason: item?.rejection_reason ?? null,
          doc: normalizeDocCard(item?.doc),
        }))
        : [],
    },
    continueWorking: Array.isArray(raw?.continue_working)
      ? raw.continue_working.map((item: any) => ({
        interaction: (['read', 'edit', 'review'].includes(String(item?.interaction)) ? String(item.interaction) : 'read') as DocumentsHomeInteraction,
        interactedAt: item?.interacted_at ?? null,
        doc: normalizeDocCard(item?.doc),
      }))
      : [],
    waitingOnOthers: Array.isArray(raw?.waiting_on_others)
      ? raw.waiting_on_others.map((item: any) => ({
        approvalId: String(item?.approval_id || ''),
        submittedAt: item?.submitted_at || '',
        submittedVersionNumber: Number(item?.submitted_version_number || 0) || null,
        currentStageOrder: Number(item?.current_stage_order || 0) || null,
        openThreadCount: Number(item?.open_thread_count || 0) || 0,
        doc: normalizeDocCard(item?.doc),
      }))
      : [],
    availableToMe: Array.isArray(raw?.available_to_me)
      ? raw.available_to_me.map((item: any) => normalizeDocCard(item))
      : [],
    };
    writeDocumentsHomeCache(cacheKey, normalized);
    return normalized;
  });
}

export async function recordDocumentRecent(docId: string, interaction: DocumentsHomeInteraction): Promise<{ ok: true }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  invalidateDocumentsHomeCache(orgId);
  return apiFetch(`/orgs/${orgId}/documents/${docId}/recent`, {
    method: 'POST',
    body: { interaction },
    skipCache: true,
  });
}
