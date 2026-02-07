export type Document = {
  id: string;
  name: string;
  type: 'PDF' | 'Image' | 'Word' | 'Government Circular' | 'Invoice' | 'folder';
  uploadedAt: Date;
  version: number; // legacy field; prefer versionNumber
  keywords: string[];
  summary: string;
  semanticReady?: boolean;
  createdBy?: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  updatedBy?: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  // Extended metadata
  title?: string;
  filename?: string;
  sender?: string;
  receiver?: string;
  documentDate?: string; // ISO or human readable
  documentType?: string; // free text category/type
  folder?: string; // legacy single folder label
  folderPath?: string[]; // nested folders from root
  subject?: string;
  description?: string;
  category?: string;
  tags?: string[];
  departmentId?: string | null;
  // File info
  fileSizeBytes?: number;
  mimeType?: string;
  // AI summary details
  aiPurpose?: string;
  aiKeyPoints?: string[];
  aiContext?: string;
  aiOutcome?: string;
  aiKeywords?: string[];
  // Relationships
  linkedDocumentIds?: string[];
  // Versioning (new)
  versionGroupId?: string; // all versions share the same group id
  versionNumber?: number; // 1..N, supersedes legacy version
  isCurrentVersion?: boolean; // marking the active one within group
  supersedesId?: string; // optional direct predecessor id
  isDraft?: boolean;
  deletedAt?: string | null;
  purgeAfter?: string | null;
  // Vespa search indexing status
  vespaSyncStatus?: 'pending' | 'syncing' | 'synced' | 'failed' | null;
  vespaIndexedAt?: string | null;
  // Document Type Classification (V2)
  docTypeKey?: string | null;
  docTypeConfidence?: number | null;
  extractedMetadata?: Record<string, any> | null;
};

export type StoredDocument = Document & {
  content: string | null;
  contentHash?: string;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: { docId: string; docName?: string; snippet?: string; page?: number | null; chunkId?: string | null }[];
  csv?: string; // optional CSV payload for export
  linkedDocuments?: StoredDocument[]; // for linked document queries
  metadata?: {
    subject?: string;
    name?: string;
    sender?: string;
    receiver?: string;
    date?: string;
    reference?: string;
    documentType?: string;
    category?: string;
    filename?: string;
  }; // for metadata queries
  preview?: {
    docId: string;
    docName: string;
    lines: string[];
    title?: string;
    url?: string;
  }; // for document content preview
  agent?: {
    mode?: string;
    stages?: string[];
  }; // for agent status display
};
