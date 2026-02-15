import { apiFetch, getApiContext } from '@/lib/api';

export type MetadataSchemaField = {
  id?: string;
  field_name: string;
  field_label?: string;
  field_type?: 'text' | 'number' | 'date' | 'boolean' | 'array';
  is_required?: boolean;
  is_searchable?: boolean;
  is_displayed?: boolean;
  is_filterable?: boolean;
  display_order?: number;
  allowed_values?: string[] | null;
  validation_regex?: string | null;
  validation_message?: string | null;
  extraction_hint?: string | null;
  example_value?: string | null;
};

export type DocumentTypeListItem = {
  id: string;
  org_id?: string;
  name: string;
  key: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_system?: boolean;
  is_active?: boolean;
  document_count?: number;
  schema?: MetadataSchemaField[];
};

export type DocumentTypeSchemaResponse = {
  document_type_id: string;
  document_type_key: string;
  document_type_name: string;
  schema: MetadataSchemaField[];
};

export async function listDocumentTypes(params?: {
  includeSchema?: boolean;
  activeOnly?: boolean;
}): Promise<DocumentTypeListItem[]> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');

  const qs = new URLSearchParams();
  if (params?.includeSchema) qs.set('include_schema', 'true');
  if (params?.activeOnly === false) qs.set('is_active', 'false');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  const response = await apiFetch<{ document_types?: DocumentTypeListItem[] }>(
    `/orgs/${orgId}/document-types${suffix}`,
    { skipCache: true }
  );

  return Array.isArray(response?.document_types) ? response.document_types : [];
}

export async function getDocumentTypeSchema(typeId: string): Promise<DocumentTypeSchemaResponse> {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  if (!typeId) throw new Error('Document type id is required');

  return apiFetch<DocumentTypeSchemaResponse>(
    `/orgs/${orgId}/document-types/${typeId}/schema`,
    { skipCache: true }
  );
}
