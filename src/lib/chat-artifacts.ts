import { apiFetch, getApiContext } from '@/lib/api';

export type PersistChatArtifactParams = {
  clientArtifactId: string;
  sessionId?: string | null;
  title?: string | null;
  artifactType?: string | null;
  templateType?: string | null;
  documentType?: string | null;
  schemaVersion?: string | null;
  payloadJson: any;
};

export type PersistedChatArtifact = {
  id: string;
  clientArtifactId: string;
  status: string;
  expiresAt?: string | null;
  promotedDocId?: string | null;
  updatedAt?: string | null;
};

function requireOrgId() {
  const { orgId } = getApiContext();
  if (!orgId) throw new Error('No organization selected');
  return orgId;
}

export async function persistChatGeneratedArtifact(params: PersistChatArtifactParams): Promise<PersistedChatArtifact> {
  const orgId = requireOrgId();
  const response = await apiFetch<{ artifact?: PersistedChatArtifact }>(`/orgs/${orgId}/chat/artifacts`, {
    method: 'POST',
    body: {
      client_artifact_id: params.clientArtifactId,
      session_id: params.sessionId || undefined,
      title: params.title || undefined,
      artifact_type: params.artifactType || 'generated_doc_json',
      template_type: params.templateType || undefined,
      document_type: params.documentType || undefined,
      schema_version: params.schemaVersion || undefined,
      payload_json: params.payloadJson,
    },
  });
  if (!response?.artifact?.id) {
    throw new Error('Failed to persist chat artifact');
  }
  return response.artifact;
}

export async function markChatGeneratedArtifactPromoted(artifactId: string, docId: string): Promise<PersistedChatArtifact> {
  const orgId = requireOrgId();
  const response = await apiFetch<{ artifact?: PersistedChatArtifact }>(`/orgs/${orgId}/chat/artifacts/${artifactId}/promote`, {
    method: 'POST',
    body: {
      doc_id: docId,
    },
  });
  if (!response?.artifact?.id) {
    throw new Error('Failed to mark artifact promoted');
  }
  return response.artifact;
}
