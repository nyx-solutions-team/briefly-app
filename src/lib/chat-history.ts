import { apiFetch, getApiContext } from '@/lib/api';

export type ChatHistorySession = {
  id: string;
  org_id: string;
  user_id: string;
  title?: string | null;
  status?: 'active' | 'archived' | 'deleted' | string;
  frontend_context?: any;
  created_at: string;
  updated_at?: string | null;
  last_active_at?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
};

export type ChatHistoryRecentSessionsPage = {
  limit?: number | null;
  has_more?: boolean;
  next_cursor?: string | null;
};

export type ChatHistoryMessage = {
  id: string;
  org_id: string;
  session_id: string;
  sequence_num?: number | null;
  role: 'user' | 'assistant' | 'system' | 'tool' | string;
  content: string;
  citations?: any[] | null;
  created_at: string;
  updated_at?: string | null;
  client_message_id?: string | null;
  parent_message_id?: string | null;
  run_id?: string | null;
  model_id?: string | null;
  status?: 'streaming' | 'complete' | 'error' | string;
  raw_content?: string | null;
  augmented_content?: string | null;
  metadata?: any;
  usage?: any;
  processing_steps_json?: any;
  tools_json?: any;
  request_context_json?: any;
  attached_docs_json?: any;
  attached_doc_ids?: string[] | null;
  citation_anchors?: any;
  evidence_spans?: any;
  citation_version?: string | null;
  citation_metrics?: any;
  agent_info?: any;
  is_complete?: boolean;
  has_citations?: boolean;
  has_artifacts?: boolean;
  has_list_mode?: boolean;
  stream_started_at?: string | null;
  stream_completed_at?: string | null;
  stream_last_event_seq?: number | null;
  stream_last_event_ts?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
};

export type ChatHistoryListModeResult = {
  query_type?: string | null;
  query_yql?: string | null;
  columns: string[];
  results_data: Array<Record<string, any>>;
  total_count?: number | null;
  has_more?: boolean;
  fetch_all?: boolean;
  doc_type?: string | null;
  total_chunks?: number | null;
  updated_at?: string | null;
  message_client_id?: string | null;
};

export type ChatHistorySessionArtifact = {
  id: string;
  orgId: string;
  userId: string;
  sessionId?: string | null;
  clientArtifactId: string;
  artifactType?: string | null;
  templateType?: string | null;
  documentType?: string | null;
  schemaVersion?: string | null;
  title?: string | null;
  payloadJson?: any;
  payloadHash?: string | null;
  payloadSizeBytes?: number | null;
  status?: string | null;
  expiresAt?: string | null;
  promotedDocId?: string | null;
  lastSeenAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function requireOrgId() {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return orgId;
}

export async function upsertChatHistorySession(body: {
  session_id?: string;
  title?: string;
  status?: 'active' | 'archived' | 'deleted';
  frontend_context?: any;
}): Promise<{ session: ChatHistorySession }> {
  const orgId = requireOrgId();
  return apiFetch(`/orgs/${orgId}/chat/sessions/upsert`, {
    method: 'POST',
    body,
    skipCache: true,
  });
}

export async function patchChatHistorySession(
  sessionId: string,
  body: {
    title?: string | null;
    status?: 'active' | 'archived' | 'deleted';
    frontend_context?: any;
    last_active_at?: string;
  }
): Promise<{ session: ChatHistorySession }> {
  const orgId = requireOrgId();
  return apiFetch(`/orgs/${orgId}/chat/sessions/${sessionId}`, {
    method: 'PATCH',
    body,
    skipCache: true,
  });
}

export async function listRecentChatHistorySessions(
  limit = 20,
  options?: { cursor?: string | null; surface?: 'chatnew' | 'chat_workbench' | 'all' }
): Promise<{ sessions: ChatHistorySession[]; page?: ChatHistoryRecentSessionsPage | null }> {
  const orgId = requireOrgId();
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 100));
  const params = new URLSearchParams();
  params.set('limit', String(safeLimit));
  if (options?.cursor) params.set('cursor', String(options.cursor));
  if (options?.surface) params.set('surface', String(options.surface));
  return apiFetch(`/orgs/${orgId}/chat/sessions/recent?${params.toString()}`, { skipCache: true });
}

export async function getChatHistoryTranscript(
  sessionId: string,
  options?: { mode?: 'lite' | 'full'; limit?: number; before_sequence?: number }
): Promise<{
  session: ChatHistorySession;
  messages: ChatHistoryMessage[];
  page?: {
    mode?: 'lite' | 'full' | string;
    limit?: number | null;
    before_sequence?: number | null;
    has_more_before?: boolean;
    oldest_sequence?: number | null;
    newest_sequence?: number | null;
  } | null;
}> {
  const orgId = requireOrgId();
  const mode = options?.mode === 'lite' ? 'lite' : options?.mode === 'full' ? 'full' : undefined;
  const params = new URLSearchParams();
  if (mode) params.set('mode', mode);
  if (Number.isFinite(Number(options?.limit)) && Number(options?.limit) > 0) {
    params.set('limit', String(Math.floor(Number(options?.limit))));
  }
  if (Number.isFinite(Number(options?.before_sequence)) && Number(options?.before_sequence) > 0) {
    params.set('before_sequence', String(Math.floor(Number(options?.before_sequence))));
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch(`/orgs/${orgId}/chat/sessions/${sessionId}/transcript${qs}`, { skipCache: true });
}

export async function upsertChatHistoryMessage(
  sessionId: string,
  body: Record<string, any>
): Promise<{ message: ChatHistoryMessage }> {
  const orgId = requireOrgId();
  return apiFetch(`/orgs/${orgId}/chat/sessions/${sessionId}/messages/upsert`, {
    method: 'POST',
    body,
    skipCache: true,
  });
}

export async function getChatHistoryListModeResult(
  sessionId: string,
  clientMessageId: string
): Promise<ChatHistoryListModeResult> {
  const orgId = requireOrgId();
  const encodedSessionId = encodeURIComponent(sessionId);
  const encodedClientMessageId = encodeURIComponent(clientMessageId);
  return apiFetch(
    `/orgs/${orgId}/chat/sessions/${encodedSessionId}/messages/${encodedClientMessageId}/list-mode-result`,
    { skipCache: true }
  );
}

export async function listChatHistorySessionArtifacts(
  sessionId: string,
  limit = 50
): Promise<{ session_id: string; artifacts: ChatHistorySessionArtifact[] }> {
  const orgId = requireOrgId();
  const encodedSessionId = encodeURIComponent(sessionId);
  const safeLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  return apiFetch(`/orgs/${orgId}/chat/sessions/${encodedSessionId}/artifacts?limit=${safeLimit}`, {
    skipCache: true,
  });
}
