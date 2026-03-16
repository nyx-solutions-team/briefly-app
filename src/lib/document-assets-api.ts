import { apiFetch, getApiContext } from '@/lib/api';

export type OrgDocumentProfile = {
  id: string;
  org_id: string;
  name: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  tax_id: string | null;
  registration_id: string | null;
  default_currency: string;
  default_payment_terms: string | null;
  default_notes: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type OrgBankAccount = {
  id: string;
  org_id: string;
  name: string;
  beneficiary_name: string | null;
  bank_name: string | null;
  branch_name: string | null;
  account_number: string | null;
  iban: string | null;
  swift_code: string | null;
  ifsc_code: string | null;
  currency: string;
  notes: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type OrgLetterhead = {
  id: string;
  org_id: string;
  name: string;
  storage_bucket: string;
  storage_key: string;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  page_format: string;
  placement: string;
  render_config: Record<string, any>;
  is_active: boolean;
  status: 'active' | 'archived';
  preview_url: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgCatalogItem = {
  id: string;
  org_id: string;
  sku: string | null;
  kind: 'product' | 'service';
  name: string;
  description: string | null;
  unit: string | null;
  unit_price: number | null;
  currency: string;
  tax_rate: number | null;
  tax_code: string | null;
  is_active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type DocumentAssetsResponse = {
  profiles: OrgDocumentProfile[];
  bankAccounts: OrgBankAccount[];
  letterheads: OrgLetterhead[];
  catalogItems: OrgCatalogItem[];
  defaults: {
    profileId: string | null;
    bankAccountId: string | null;
    letterheadId: string | null;
  };
};

export type LetterheadUploadSignResponse = {
  uploadType: 'direct';
  bucket: string;
  storageKey: string;
  signedUrl: string;
  path?: string | null;
  token?: string | null;
  expiresAt?: string | null;
};

function requireOrgId() {
  const { orgId } = getApiContext();
  if (!orgId) throw new Error('No organization selected');
  return orgId;
}

export async function listDocumentAssets() {
  const orgId = requireOrgId();
  return apiFetch<DocumentAssetsResponse>(`/orgs/${orgId}/document-assets`, { skipCache: true });
}

export async function createDocumentProfile(body: Record<string, any>) {
  const orgId = requireOrgId();
  return apiFetch<OrgDocumentProfile>(`/orgs/${orgId}/document-assets/profiles`, {
    method: 'POST',
    body,
    skipCache: true,
  });
}

export async function updateDocumentProfile(profileId: string, body: Record<string, any>) {
  const orgId = requireOrgId();
  return apiFetch<OrgDocumentProfile>(`/orgs/${orgId}/document-assets/profiles/${profileId}`, {
    method: 'PUT',
    body,
    skipCache: true,
  });
}

export async function setDefaultDocumentProfile(profileId: string) {
  const orgId = requireOrgId();
  return apiFetch<OrgDocumentProfile>(`/orgs/${orgId}/document-assets/profiles/${profileId}/default`, {
    method: 'POST',
    body: {},
    skipCache: true,
  });
}

export async function archiveDocumentProfile(profileId: string) {
  const orgId = requireOrgId();
  return apiFetch<{ ok: true }>(`/orgs/${orgId}/document-assets/profiles/${profileId}`, {
    method: 'DELETE',
    skipCache: true,
  });
}

export async function createBankAccount(body: Record<string, any>) {
  const orgId = requireOrgId();
  return apiFetch<OrgBankAccount>(`/orgs/${orgId}/document-assets/bank-accounts`, {
    method: 'POST',
    body,
    skipCache: true,
  });
}

export async function updateBankAccount(accountId: string, body: Record<string, any>) {
  const orgId = requireOrgId();
  return apiFetch<OrgBankAccount>(`/orgs/${orgId}/document-assets/bank-accounts/${accountId}`, {
    method: 'PUT',
    body,
    skipCache: true,
  });
}

export async function setDefaultBankAccount(accountId: string) {
  const orgId = requireOrgId();
  return apiFetch<OrgBankAccount>(`/orgs/${orgId}/document-assets/bank-accounts/${accountId}/default`, {
    method: 'POST',
    body: {},
    skipCache: true,
  });
}

export async function deleteBankAccount(accountId: string) {
  const orgId = requireOrgId();
  return apiFetch<{ ok: true }>(`/orgs/${orgId}/document-assets/bank-accounts/${accountId}`, {
    method: 'DELETE',
    skipCache: true,
  });
}

export async function signLetterheadUpload(filename: string, mimeType: string) {
  const orgId = requireOrgId();
  return apiFetch<LetterheadUploadSignResponse>(`/orgs/${orgId}/document-assets/letterheads/upload-sign`, {
    method: 'POST',
    body: { filename, mimeType },
    skipCache: true,
  });
}

export async function createLetterhead(body: Record<string, any>) {
  const orgId = requireOrgId();
  return apiFetch<OrgLetterhead>(`/orgs/${orgId}/document-assets/letterheads`, {
    method: 'POST',
    body,
    skipCache: true,
  });
}

export async function updateLetterhead(letterheadId: string, body: Record<string, any>) {
  const orgId = requireOrgId();
  return apiFetch<OrgLetterhead>(`/orgs/${orgId}/document-assets/letterheads/${letterheadId}`, {
    method: 'PUT',
    body,
    skipCache: true,
  });
}

export async function activateLetterhead(letterheadId: string) {
  const orgId = requireOrgId();
  return apiFetch<OrgLetterhead>(`/orgs/${orgId}/document-assets/letterheads/${letterheadId}/activate`, {
    method: 'POST',
    body: {},
    skipCache: true,
  });
}

export async function deleteLetterhead(letterheadId: string) {
  const orgId = requireOrgId();
  return apiFetch<{ ok: true }>(`/orgs/${orgId}/document-assets/letterheads/${letterheadId}`, {
    method: 'DELETE',
    skipCache: true,
  });
}

export async function createCatalogItem(body: Record<string, any>) {
  const orgId = requireOrgId();
  return apiFetch<OrgCatalogItem>(`/orgs/${orgId}/document-assets/catalog-items`, {
    method: 'POST',
    body,
    skipCache: true,
  });
}

export async function updateCatalogItem(itemId: string, body: Record<string, any>) {
  const orgId = requireOrgId();
  return apiFetch<OrgCatalogItem>(`/orgs/${orgId}/document-assets/catalog-items/${itemId}`, {
    method: 'PUT',
    body,
    skipCache: true,
  });
}

export async function deleteCatalogItem(itemId: string) {
  const orgId = requireOrgId();
  return apiFetch<{ ok: true }>(`/orgs/${orgId}/document-assets/catalog-items/${itemId}`, {
    method: 'DELETE',
    skipCache: true,
  });
}

export async function uploadFileToSignedUrl(signedUrl: string, file: File) {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status} ${res.statusText})`);
  }
}
