import { apiFetch, getApiContext } from '@/lib/api';

export type TemplateCapabilities = {
  template_key: string;
  display_name: string;
  supports_chat: boolean;
  supports_editor: boolean;
  supports_export: boolean;
  supports_visual_builder?: boolean;
  preview_mode: string;
  requires_html_template: boolean;
  editor_seed_strategy: string;
  generation_mode?: string;
  validation_mode?: string;
  template_class?: string;
  number_fields: string[];
  doc_label: string;
};

export type TemplatePreviewConfig = {
  sample_data?: Record<string, any>;
  preview_data?: Record<string, any>;
  example_data?: Record<string, any>;
  default_data?: Record<string, any>;
  starter_blocks?: any[];
  visual_blocks?: any[];
  [key: string]: any;
};

export type TemplateEditorConfig = {
  starter_blocks?: any[];
  visual_blocks?: any[];
  sample_data?: Record<string, any>;
  preview_data?: Record<string, any>;
  seed_strategy?: string;
  allow_visual_override?: boolean;
  read_only?: boolean;
  [key: string]: any;
};

export type TemplateGenerationConfig = {
  mode?: string;
  strategy?: string;
  label?: string;
  skill_key?: string;
  schema_version?: string;
  template_version?: string;
  source_types?: string[];
  number_keys?: string[];
  filename_keys?: string[];
  default_values?: Record<string, any>;
  source_text_enabled?: boolean;
  source_data_enabled?: boolean;
  [key: string]: any;
};

export type TemplateValidationConfig = {
  profile?: string;
  mode?: string;
  skill_key?: string;
  required_sections?: string[];
  [key: string]: any;
};

export type CanonicalTemplateDefinition = {
  schema?: Record<string, any>;
  ui_schema?: Record<string, any>;
  rules?: Record<string, any> | any[];
  rendering?: Record<string, any>;
  chat_hints?: Record<string, any>;
  preview?: TemplatePreviewConfig;
  editor?: TemplateEditorConfig;
  generation?: TemplateGenerationConfig;
  validation?: TemplateValidationConfig;
  capabilities?: Record<string, any>;
  metadata?: Record<string, any>;
  [key: string]: any;
};

export type TemplateRegistryListItem = {
  id: string;
  namespace_type: 'system' | 'org';
  owner_org_id: string | null;
  template_key: string;
  name: string;
  description?: string | null;
  category?: string | null;
  template_family?: string | null;
  supports_chat: boolean;
  supports_editor: boolean;
  is_active: boolean;
  tags: string[];
  metadata?: Record<string, any>;
 capabilities?: TemplateCapabilities;
  published_versions?: {
    global?: { id: string; version: number; published_at?: string | null } | null;
    org?: { id: string; version: number; published_at?: string | null } | null;
    department_count?: number;
  };
};

export type EffectiveTemplateResult = {
  template_definition: {
    id: string;
    template_key: string;
    name: string;
    description?: string | null;
    namespace_type: 'system' | 'org';
    owner_org_id?: string | null;
    supports_chat?: boolean;
    supports_editor?: boolean;
 capabilities?: TemplateCapabilities;
  };
  effective_definition: CanonicalTemplateDefinition;
 capabilities?: TemplateCapabilities;
  provenance: {
    template_definition_id: string;
    template_key: string;
    layers_applied: Array<{
      scope_type: 'global' | 'org' | 'department';
      version_id: string | null;
      version_number: number | null;
      merge_strategy: string | null;
      binding_id: string | null;
    }>;
    resolution_mode: string;
    department_id?: string | null;
    has_effective_definition: boolean;
  };
  debug?: any;
};

export type TemplateValidationError = {
  path?: string;
  code?: string;
  message?: string;
  [key: string]: any;
};

export type TemplateVersionRow = {
  id: string;
  template_definition_id: string;
  scope_type: 'global' | 'org' | 'department';
  org_id?: string | null;
  department_id?: string | null;
  version: number;
  status: 'draft' | 'published' | 'archived';
  merge_strategy?: 'replace' | 'merge_patch' | 'deep_merge' | string;
  definition: Record<string, any>;
  is_valid?: boolean;
  validation_errors?: TemplateValidationError[];
  change_note?: string | null;
  metadata?: Record<string, any>;
  created_at?: string;
  published_at?: string | null;
  published_by?: string | null;
};

export type TemplateScopeBindingRow = {
  id: string;
  template_definition_id: string;
  version_id: string;
  scope_type: 'global' | 'org' | 'department';
  org_id?: string | null;
  department_id?: string | null;
  is_enabled: boolean;
  bind_reason?: string | null;
  config?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
};

export type ValidateTemplateRegistryDefinitionResponse = {
  valid: boolean;
  errors: TemplateValidationError[];
};

export type CreateTemplateRegistryVersionResponse = {
  template_definition?: EffectiveTemplateResult['template_definition'];
  template_version?: TemplateVersionRow;
  validation?: ValidateTemplateRegistryDefinitionResponse;
};

export type PublishTemplateRegistryVersionResponse = {
  template_version?: TemplateVersionRow;
  idempotent?: boolean;
  unchanged?: boolean;
};

export type BindTemplateRegistryVersionResponse = {
  template_definition?: EffectiveTemplateResult['template_definition'];
  template_version?: TemplateVersionRow;
  scope_binding?: TemplateScopeBindingRow;
  idempotent?: boolean;
  unchanged?: boolean;
};

function requireOrgId() {
  const orgId = getApiContext().orgId;
  if (!orgId) throw new Error('No org selected');
  return orgId;
}

export async function listTemplateRegistryTemplates(params?: {
  supports?: 'chat' | 'editor';
  includeSystem?: boolean;
  activeOnly?: boolean;
  limit?: number;
}): Promise<{ templates: TemplateRegistryListItem[] }> {
  const orgId = requireOrgId();
  const qs = new URLSearchParams();
  if (params?.supports) qs.set('supports', params.supports);
  if (params?.includeSystem !== undefined) qs.set('include_system', String(params.includeSystem));
  if (params?.activeOnly !== undefined) qs.set('active_only', String(params.activeOnly));
  if (typeof params?.limit === 'number') qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/orgs/${orgId}/template-registry/templates${suffix}`, { skipCache: true });
}

export async function getEffectiveTemplateRegistryTemplate(templateKey: string, params?: {
  departmentId?: string;
  mode?: 'strict' | 'fallback';
  debug?: boolean;
}): Promise<EffectiveTemplateResult> {
  const orgId = requireOrgId();
  const key = String(templateKey || '').trim();
  if (!key) throw new Error('templateKey is required');
  const qs = new URLSearchParams();
  if (params?.departmentId) qs.set('departmentId', params.departmentId);
  if (params?.mode) qs.set('mode', params.mode);
  if (params?.debug !== undefined) qs.set('debug', String(params.debug));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/orgs/${orgId}/template-registry/templates/${encodeURIComponent(key)}/effective${suffix}`, { skipCache: true });
}

export async function validateTemplateRegistryDefinition(
  definition: Record<string, any>
): Promise<ValidateTemplateRegistryDefinitionResponse> {
  const orgId = requireOrgId();
  return apiFetch(`/orgs/${orgId}/template-registry/templates/validate`, {
    method: 'POST',
    body: { definition },
    skipCache: true,
  });
}

export async function createTemplateRegistryVersion(
  templateKey: string,
  payload: {
    scopeType?: 'org' | 'department';
    departmentId?: string | null;
    mergeStrategy?: 'replace' | 'merge_patch' | 'deep_merge';
    definition: Record<string, any>;
    changeNote?: string | null;
    metadata?: Record<string, any>;
  }
): Promise<CreateTemplateRegistryVersionResponse> {
  const orgId = requireOrgId();
  const key = String(templateKey || '').trim();
  if (!key) throw new Error('templateKey is required');
  return apiFetch(`/orgs/${orgId}/template-registry/templates/${encodeURIComponent(key)}/versions`, {
    method: 'POST',
    body: {
      scope_type: payload.scopeType || 'org',
      department_id: payload.departmentId || null,
      merge_strategy: payload.mergeStrategy || 'replace',
      definition: payload.definition,
      change_note: payload.changeNote || null,
      metadata: payload.metadata || {},
    },
    skipCache: true,
  });
}

export async function publishTemplateRegistryVersion(
  templateKey: string,
  versionId: string,
  status: 'published' | 'archived' = 'published'
): Promise<PublishTemplateRegistryVersionResponse> {
  const orgId = requireOrgId();
  const key = String(templateKey || '').trim();
  const vid = String(versionId || '').trim();
  if (!key) throw new Error('templateKey is required');
  if (!vid) throw new Error('versionId is required');
  return apiFetch(`/orgs/${orgId}/template-registry/templates/${encodeURIComponent(key)}/versions/${encodeURIComponent(vid)}/publish`, {
    method: 'POST',
    body: { status },
    skipCache: true,
  });
}

export async function bindTemplateRegistryVersion(
  templateKey: string,
  payload: {
    versionId: string;
    scopeType?: 'org' | 'department';
    departmentId?: string | null;
    isEnabled?: boolean;
    bindReason?: string | null;
    config?: Record<string, any>;
  }
): Promise<BindTemplateRegistryVersionResponse> {
  const orgId = requireOrgId();
  const key = String(templateKey || '').trim();
  if (!key) throw new Error('templateKey is required');
  if (!payload?.versionId) throw new Error('versionId is required');
  return apiFetch(`/orgs/${orgId}/template-registry/templates/${encodeURIComponent(key)}/bind`, {
    method: 'POST',
    body: {
      version_id: payload.versionId,
      scope_type: payload.scopeType || 'org',
      department_id: payload.departmentId || null,
      is_enabled: payload.isEnabled !== false,
      bind_reason: payload.bindReason || null,
      config: payload.config || {},
    },
    skipCache: true,
  });
}

export async function publishBindTemplateRegistryVersion(templateKey: string, payload: any) {
  const orgId = requireOrgId();
  const key = String(templateKey ? templateKey : '').trim();
  if (!key) throw new Error('templateKey is required');
  if (!payload) throw new Error('versionId is required');
  if (!payload.versionId) throw new Error('versionId is required');
  return apiFetch(`/orgs/${orgId}/template-registry/templates/${encodeURIComponent(key)}/publish-bind`, {
    method: 'POST',
    body: {
      version_id: payload.versionId,
      scope_type: payload.scopeType ? payload.scopeType : 'org',
      department_id: payload.departmentId ? payload.departmentId : null,
      is_enabled: payload.isEnabled !== false,
      bind_reason: payload.bindReason ? payload.bindReason : null,
      config: payload.config ? payload.config : {},
    },
    skipCache: true,
  });
}
