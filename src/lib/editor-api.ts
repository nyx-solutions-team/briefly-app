import { apiFetch, getApiContext } from '@/lib/api';

export type EditorHead = {
  doc_id: string;
  org_id: string;
  current_version_number: number;
  last_edited_at: string | null;
  last_edited_by: string | null;
  word_count: number;
  character_count: number;
};

export type EditorVersion = {
  id: string;
  doc_id: string;
  org_id: string;
  version_number: number;
  base_version_number: number | null;
  content?: any;
  content_text?: string | null;
  commit_message?: string | null;
  created_by?: string | null;
  created_at: string;
};

export type EditorDocListItem = {
  id: string;
  org_id: string;
  owner_user_id: string | null;
  department_id: string | null;
  title: string | null;
  filename: string | null;
  type: string;
  folder_path: string[];
  mime_type: string | null;
  storage_key: string | null;
  uploaded_at: string;
  deleted_at: string | null;
  is_draft: boolean;
  head: EditorHead | null;
};

export type EditorDocsListResponse = { docs: EditorDocListItem[] };

export type EditorDocumentMeta = {
  id: string;
  title: string | null;
  filename: string | null;
  folderPath?: string[];
  folder_path?: string[];
};

export type CreateEditorDocBody = {
  title: string;
  folderPath?: string[];
  departmentId?: string;
  isDraft?: boolean;
  content: any;
  contentText?: string;
  commitMessage?: string;
};

export type CreateEditorDocResponse = {
  doc: any;
  head: EditorHead;
  version: { id: string; version_number: number; created_at: string };
};

export type CreateEditorDocShellBody = {
  title: string;
  folderPath?: string[];
  departmentId?: string;
  isDraft?: boolean;
};

export type CreateEditorDocShellResponse = {
  id: string;
  title: string | null;
  filename: string | null;
  folderPath?: string[];
  folder_path?: string[];
  isDraft?: boolean;
  is_draft?: boolean;
};

export type LatestEditorResponse = {
  head: EditorHead;
  version: EditorVersion | null;
};

export type CreateEditSessionResponse = {
  id: string;
  org_id: string;
  doc_id: string;
  editor_user_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_heartbeat_at: string | null;
};

export type EditorDraft = {
  id: string;
  org_id: string;
  doc_id: string;
  editor_user_id: string;
  session_id: string | null;
  base_version_number: number;
  content: any;
  content_text: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateEditSession409 = {
  error: string;
  activeSession?: CreateEditSessionResponse | null;
};

export async function listEditorDocs(params?: {
  ownerUserId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<EditorDocsListResponse> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  const qs = new URLSearchParams();
  if (params?.ownerUserId) qs.set('ownerUserId', params.ownerUserId);
  if (params?.q) qs.set('q', params.q);
  if (typeof params?.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiFetch(`/orgs/${orgId}/editor/docs${suffix}`, { skipCache: true });
}

export async function createEditorDoc(body: CreateEditorDocBody): Promise<CreateEditorDocResponse> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/docs`, { method: 'POST', body, skipCache: true });
}

export async function createEditorDocShell(body: CreateEditorDocShellBody): Promise<CreateEditorDocShellResponse> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');

  const title = String(body.title || '').trim() || 'Untitled';
  const filename = `${title}.md`;

  return apiFetch(`/orgs/${orgId}/documents`, {
    method: 'POST',
    skipCache: true,
    body: {
      title,
      filename,
      type: 'editor',
      folderPath: Array.isArray(body.folderPath) ? body.folderPath : [],
      departmentId: body.departmentId,
      isDraft: Boolean(body.isDraft),
      category: 'General',
      tags: [],
      keywords: [],
      sender: '',
      receiver: '',
      subject: '',
      description: '',
      mimeType: 'text/markdown',
    },
  });
}

export async function getEditorLatest(docId: string): Promise<LatestEditorResponse> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/docs/${docId}/latest`, { skipCache: true });
}

export async function getEditorDocumentMeta(docId: string): Promise<EditorDocumentMeta> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/documents/${docId}`, { skipCache: true });
}

export async function listEditorVersions(docId: string, limit = 50): Promise<{ versions: EditorVersion[] }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/docs/${docId}/versions?limit=${limit}`, { skipCache: true });
}

export async function getEditorVersion(docId: string, versionNumber: number): Promise<EditorVersion> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/docs/${docId}/versions/${versionNumber}`, { skipCache: true });
}

export async function createEditSession(docId: string, ttlSeconds = 120): Promise<CreateEditSessionResponse> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/docs/${docId}/sessions`, { method: 'POST', body: { ttlSeconds }, skipCache: true });
}

export async function heartbeatEditSession(sessionId: string, extendTtlSeconds = 120): Promise<CreateEditSessionResponse> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/sessions/${sessionId}/heartbeat`, { method: 'POST', body: { extendTtlSeconds }, skipCache: true });
}

export async function revokeEditSession(sessionId: string): Promise<{ ok: true; revoked_at?: string } | { ok: true }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/sessions/${sessionId}/revoke`, { method: 'POST', body: {}, skipCache: true });
}

export async function saveEditorVersion(docId: string, body: {
  sessionId: string;
  expectedCurrentVersion: number;
  commitMessage?: string;
  content: any;
  contentText?: string;
}): Promise<{ version: { id: string; version_number: number; created_at: string }; head: EditorHead }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/docs/${docId}/versions`, { method: 'POST', body, skipCache: true });
}

export async function restoreEditorVersion(docId: string, body: {
  sessionId: string;
  targetVersionNumber: number;
  expectedCurrentVersion: number;
  commitMessage?: string;
}): Promise<{ restoredFromVersionNumber: number; version: { id: string; version_number: number; created_at: string }; head: EditorHead }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/docs/${docId}/restore`, { method: 'POST', body, skipCache: true });
}

export async function getEditorDraft(docId: string): Promise<{ draft: EditorDraft }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/docs/${docId}/draft`, { skipCache: true });
}

export async function saveEditorDraft(docId: string, body: {
  sessionId: string;
  baseVersionNumber: number;
  content: any;
  contentText?: string;
}): Promise<{ draft: EditorDraft }> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return apiFetch(`/orgs/${orgId}/editor/docs/${docId}/draft`, { method: 'PUT', body, skipCache: true });
}
