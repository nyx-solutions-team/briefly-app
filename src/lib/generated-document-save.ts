import { apiFetch, getApiContext } from '@/lib/api';
import { markChatGeneratedArtifactPromoted } from '@/lib/chat-artifacts';
import {
  buildDocumentDocxBlob,
  buildDocumentPdfBlob,
  getPrimaryDocumentNumber as resolvePrimaryDocumentNumber,
  normalizeTemplateType,
  templateLabel,
  type TemplateType,
} from '@/lib/document-export';

type SaveFormat = 'pdf' | 'docx';

type SaveGeneratedDocumentParams = {
  templateType: TemplateType;
  data: Record<string, any>;
  format: SaveFormat;
  title: string;
  departmentId: string;
  folderPath: string[];
  ephemeralArtifactId?: string | null;
  autoAccept?: boolean;
};

type SaveGeneratedDocumentResult = {
  docId: string;
  filename: string;
  ingestionStatus: string;
};

type IngestionJobStatus = {
  status?: string;
  failure_reason?: string | null;
  last_error?: string | null;
};

type DraftDocumentCreateResponse = {
  id: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFilename(input: string) {
  return String(input || 'document')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 180) || 'document';
}

function withExt(name: string, ext: string) {
  const trimmed = String(name || '').trim();
  if (trimmed.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) return trimmed;
  return `${trimmed}.${ext}`;
}

function trimExt(name: string) {
  return String(name || '').replace(/\.[a-zA-Z0-9]+$/, '').trim();
}

function getPrimaryDocumentNumber(type: TemplateType, data: Record<string, any>) {
  return String(resolvePrimaryDocumentNumber(type, data) || '').trim();
}

function pickDate(data: Record<string, any>) {
  return (
    String(data.date || '').trim() ||
    String(data.invoice_date || '').trim() ||
    String(data.document_date || '').trim() ||
    ''
  );
}

function pickSenderReceiver(type: TemplateType, data: Record<string, any>) {
  const normalizedType = normalizeTemplateType(type);
  if (normalizedType === 'invoice') {
    return {
      sender: String(data.seller?.name || '').trim(),
      receiver: String(data.buyer?.name || '').trim(),
    };
  }
  if (normalizedType === 'purchase_order') {
    return {
      sender: String(data.buyer?.name || '').trim(),
      receiver: String(data.vendor?.name || '').trim(),
    };
  }
  if (normalizedType === 'quotation') {
    return {
      sender: String(data.company?.name || data.seller?.name || '').trim(),
      receiver: String(data.client?.name || '').trim(),
    };
  }
  if (normalizedType === 'delivery_note') {
    return {
      sender: String(data.sender?.name || '').trim(),
      receiver: String(data.receiver?.name || '').trim(),
    };
  }
  if (normalizedType === 'receipt') {
    return {
      sender: String(data.received_by || '').trim(),
      receiver: String(data.received_from || '').trim(),
    };
  }
  return {
    sender: String(
      data.sender?.name
      || data.seller?.name
      || data.company?.name
      || data.vendor?.name
      || data.received_by
      || ''
    ).trim(),
    receiver: String(
      data.receiver?.name
      || data.buyer?.name
      || data.client?.name
      || data.customer?.name
      || data.received_from
      || ''
    ).trim(),
  };
}

function numberOrEmpty(value: any) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
}

function pushLine(lines: string[], line?: string | null) {
  const text = String(line || '').trim();
  if (text) lines.push(text);
}

function pushParty(lines: string[], label: string, party: any) {
  if (!party || typeof party !== 'object') return;
  const contact = party.contact && typeof party.contact === 'object' ? party.contact : {};
  const parts = [
    party.name,
    party.address,
    party.phone || contact.phone,
    party.email || contact.email,
  ].filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
  if (parts.length === 0) return;
  lines.push(`${label}:`);
  for (const part of parts) lines.push(`- ${part}`);
}

function pushItems(lines: string[], items: any[]) {
  if (!Array.isArray(items) || items.length === 0) return;
  lines.push('Items:');
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object') continue;
    const desc = String(item.description || `Item ${index + 1}`).trim();
    const qty = numberOrEmpty(item.quantity);
    const unit = String(item.unit || '').trim();
    const unitPrice = numberOrEmpty(item.unit_price);
    const lineTotal = numberOrEmpty(item.line_total);
    lines.push(`${index + 1}. ${desc}`);
    if (qty) lines.push(`   Qty: ${qty}${unit ? ` ${unit}` : ''}`);
    if (unitPrice) lines.push(`   Unit Price: ${unitPrice}`);
    if (lineTotal) lines.push(`   Line Total: ${lineTotal}`);
  }
}

function pushTotals(lines: string[], totals: any) {
  if (!totals || typeof totals !== 'object') return;
  lines.push('Totals:');
  const totalEntries: Array<[string, any]> = [
    ['Subtotal', totals.subtotal],
    ['Tax Rate', totals.tax_rate],
    ['Tax Amount', totals.tax_amount ?? totals.tax_details?.tax_amount],
    ['Discount', totals.discount],
    ['Shipping', totals.shipping_cost],
    ['Total', totals.total_amount ?? totals.total_amount_due ?? totals.total],
  ];
  for (const [label, value] of totalEntries) {
    const text = numberOrEmpty(value);
    if (text) lines.push(`- ${label}: ${text}`);
  }
  if (totals.delivery_date) {
    lines.push(`- Delivery Date: ${String(totals.delivery_date)}`);
  }
}

function flattenGeneratedDocToText(type: TemplateType, data: Record<string, any>, title: string) {
  const lines: string[] = [];
  const normalizedType = normalizeTemplateType(type);
  const tLabel = templateLabel(type);
  const docNo = getPrimaryDocumentNumber(type, data);
  pushLine(lines, title || `${tLabel}${docNo ? ` ${docNo}` : ''}`);
  if (docNo) pushLine(lines, `${tLabel} Number: ${docNo}`);
  pushLine(lines, data.date ? `Date: ${String(data.date).trim()}` : '');
  pushLine(lines, data.currency ? `Currency: ${String(data.currency).trim()}` : '');

  switch (normalizedType) {
    case 'invoice':
      pushParty(lines, 'Seller', data.seller);
      pushParty(lines, 'Buyer', data.buyer);
      pushItems(lines, data.items || []);
      pushTotals(lines, data.totals);
      pushLine(lines, data.payment_terms ? `Payment Terms: ${String(data.payment_terms)}` : '');
      pushLine(lines, data.bank_details ? `Bank Details: ${String(data.bank_details)}` : '');
      break;
    case 'purchase_order':
      pushParty(lines, 'Buyer', data.buyer);
      pushParty(lines, 'Vendor', data.vendor);
      pushLine(lines, data.delivery_date ? `Delivery Date: ${String(data.delivery_date)}` : '');
      pushLine(lines, data.shipping_method ? `Shipping Method: ${String(data.shipping_method)}` : '');
      pushItems(lines, data.items || []);
      pushTotals(lines, data.totals);
      break;
    case 'receipt':
      pushLine(lines, data.received_from ? `Received From: ${String(data.received_from)}` : '');
      pushLine(lines, data.received_by ? `Received By: ${String(data.received_by)}` : '');
      pushLine(lines, data.payment_method ? `Payment Method: ${String(data.payment_method)}` : '');
      pushLine(lines, data.reference_number ? `Reference: ${String(data.reference_number)}` : '');
      pushLine(lines, data.amount !== undefined ? `Amount: ${numberOrEmpty(data.amount)}` : '');
      pushLine(lines, data.status ? `Status: ${String(data.status)}` : '');
      break;
    case 'quotation':
      pushParty(lines, 'Company', data.company || data.seller);
      pushParty(lines, 'Client', data.client);
      pushLine(lines, data.valid_until ? `Valid Until: ${String(data.valid_until)}` : '');
      pushItems(lines, data.items || []);
      pushTotals(lines, data.totals);
      pushLine(lines, data.prepared_by ? `Prepared By: ${String(data.prepared_by)}` : '');
      break;
    case 'delivery_note':
      pushParty(lines, 'Sender', data.sender);
      pushParty(lines, 'Receiver', data.receiver);
      pushLine(lines, data.order_reference ? `Order Reference: ${String(data.order_reference)}` : '');
      pushLine(lines, data.shipping_method ? `Shipping Method: ${String(data.shipping_method)}` : '');
      pushLine(lines, data.driver_name ? `Driver: ${String(data.driver_name)}` : '');
      pushLine(lines, data.total_packages !== undefined ? `Total Packages: ${numberOrEmpty(data.total_packages)}` : '');
      pushItems(lines, data.items || []);
      break;
    default: {
      const scalarEntries = Object.entries(data || {})
        .filter(([key, value]) => key !== '_briefly_generation_context' && key !== 'items' && key !== 'totals')
        .filter(([, value]) => value == null || typeof value !== 'object')
        .slice(0, 12);
      for (const [key, value] of scalarEntries) {
        pushLine(lines, `${String(key).replace(/_/g, ' ')}: ${String(value ?? '')}`.trim());
      }
      pushItems(lines, data.items || []);
      pushTotals(lines, data.totals);
      break;
    }
  }

  const notes = data.notes;
  if (Array.isArray(notes) && notes.length) {
    lines.push('Notes:');
    for (const note of notes) pushLine(lines, `- ${String(note)}`);
  } else if (typeof notes === 'string' && notes.trim()) {
    lines.push('Notes:');
    pushLine(lines, notes);
  }

  if (Array.isArray(data.terms_and_conditions) && data.terms_and_conditions.length) {
    lines.push('Terms and Conditions:');
    for (const term of data.terms_and_conditions) pushLine(lines, `- ${String(term)}`);
  } else if (typeof data.terms_and_conditions === 'string' && data.terms_and_conditions.trim()) {
    lines.push('Terms and Conditions:');
    pushLine(lines, data.terms_and_conditions);
  }

  // Add a raw-json backup section (without layout) so indexing remains robust even if schema varies.
  const rawData = { ...data };
  if ('layout' in rawData) delete (rawData as any).layout;
  lines.push('');
  lines.push('Structured Data Snapshot:');
  lines.push(JSON.stringify(rawData));

  return lines.join('\n');
}

function buildGeneratedExtractionMetadata(params: {
  templateType: TemplateType;
  data: Record<string, any>;
  title: string;
  filename: string;
  format: SaveFormat;
}) {
  const { templateType, data, title, filename, format } = params;
  const label = templateLabel(templateType);
  const number = getPrimaryDocumentNumber(templateType, data);
  const { sender, receiver } = pickSenderReceiver(templateType, data);
  const documentDate = pickDate(data);
  const summary = `${label}${number ? ` ${number}` : ''} generated by AI and saved from chat as ${format.toUpperCase()}.`;
  const keywords = [
    label.toLowerCase(),
    templateType,
    format,
    number || '',
    data.currency || '',
    sender || '',
    receiver || '',
  ].map((v) => String(v).trim()).filter(Boolean);
  const tags = Array.from(new Set([label, 'AI Generated', format.toUpperCase()]));

  return {
    title,
    filename,
    subject: title,
    description: summary,
    category: label,
    documentType: label,
    documentDate,
    sender,
    receiver,
    keywords,
    tags,
    summary,
    keyPointers: [
      `${label} generated from chat artifact`,
      format === 'pdf' ? 'Rendered PDF file saved to documents' : 'Rendered DOCX file saved to documents',
      'Structured JSON artifact used as source of truth',
    ],
    generated: true,
    generatedFormat: format,
    templateType,
    source: 'chat_artifact',
  };
}

function inferDocumentTypeForCreate(format: SaveFormat): 'PDF' | 'Word' {
  return format === 'pdf' ? 'PDF' : 'Word';
}

async function uploadBlobToSignedUrl(url: string, blob: Blob, mimeType: string) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status} ${res.statusText})`);
  }
}

async function waitForIngestionAndAutoAccept(orgId: string, docId: string) {
  const startedAt = Date.now();
  const timeoutMs = 8 * 60 * 1000;
  let lastStatus = 'pending';

  while (Date.now() - startedAt < timeoutMs) {
    const job = await apiFetch<IngestionJobStatus>(`/orgs/${orgId}/ingestion-jobs/${docId}`, { skipCache: true });
    const status = String(job?.status || '').toLowerCase() || 'pending';
    lastStatus = status;

    if (status === 'accepted' || status === 'completed') {
      return { status };
    }
    if (status === 'failed') {
      throw new Error(job?.failure_reason || job?.last_error || 'Ingestion failed');
    }

    if (status === 'needs_review') {
      try {
        await apiFetch(`/orgs/${orgId}/ingestion-jobs/${docId}/accept`, {
          method: 'POST',
          body: {},
        });
      } catch (error: any) {
        // Vespa gate not done yet; keep polling.
        if (error?.status !== 409) throw error;
      }
    }

    await sleep(2000);
  }

  throw new Error(`Timed out waiting for ingestion/auto-accept (last status: ${lastStatus})`);
}

export async function saveGeneratedDocumentToDocuments(
  params: SaveGeneratedDocumentParams,
): Promise<SaveGeneratedDocumentResult> {
  const { orgId } = getApiContext();
  if (!orgId) throw new Error('No organization selected');

  const {
    templateType,
    data,
    format,
    title,
    departmentId,
    folderPath,
    ephemeralArtifactId = null,
    autoAccept = true,
  } = params;

  const normalizedTitle = String(title || '').trim() || `${templateLabel(templateType)} ${getPrimaryDocumentNumber(templateType, data) || ''}`.trim();

  const built =
    format === 'pdf'
      ? await buildDocumentPdfBlob(templateType, data)
      : await buildDocumentDocxBlob(templateType, data);

  const blob = built.blob;
  const mimeType = format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  // Keep the saved file name aligned with the user-entered title from the modal.
  const filenameBase = normalizedTitle.replace(/\.(pdf|docx)$/i, '').trim() || built.fileName.replace(/\.(pdf|docx)$/i, '');
  const filename = sanitizeFilename(withExt(filenameBase, format));

  const signResp = await apiFetch<{ signedUrl: string; storageKey: string }>(`/orgs/${orgId}/uploads/sign`, {
    method: 'POST',
    body: {
      filename,
      mimeType,
    },
  });
  if (!signResp?.signedUrl || !signResp?.storageKey) {
    throw new Error('Failed to create signed upload URL');
  }

  await uploadBlobToSignedUrl(signResp.signedUrl, blob, mimeType);

  const extractionMetadata = buildGeneratedExtractionMetadata({
    templateType,
    data,
    title: normalizedTitle,
    filename,
    format,
  });
  const extractionText = flattenGeneratedDocToText(templateType, data, normalizedTitle);

  const created = await apiFetch<DraftDocumentCreateResponse>(`/orgs/${orgId}/documents`, {
    method: 'POST',
    body: {
      title: normalizedTitle,
      filename,
      type: inferDocumentTypeForCreate(format),
      folderPath: Array.isArray(folderPath) ? folderPath : [],
      subject: normalizedTitle,
      description: extractionMetadata.summary || '',
      category: extractionMetadata.category || 'General',
      tags: Array.isArray(extractionMetadata.tags) ? extractionMetadata.tags : [],
      keywords: Array.isArray(extractionMetadata.keywords) ? extractionMetadata.keywords : [],
      sender: extractionMetadata.sender || '',
      receiver: extractionMetadata.receiver || '',
      document_date: extractionMetadata.documentDate || '',
      departmentId,
      isDraft: true,
    },
  });

  if (!created?.id) {
    throw new Error('Failed to create draft document');
  }

  const docId = created.id;

  await apiFetch(`/orgs/${orgId}/uploads/finalize`, {
    method: 'POST',
    body: {
      documentId: docId,
      storageKey: signResp.storageKey,
      fileSizeBytes: blob.size,
      mimeType,
    },
  });

  // Write extraction first so V2 fast lane can reuse it and skip OCR/upload-analysis work.
  await apiFetch(`/orgs/${orgId}/documents/${docId}/extraction`, {
    method: 'POST',
    body: {
      ocrText: extractionText,
      metadata: extractionMetadata,
    },
  });

  await apiFetch(`/orgs/${orgId}/ingestion-v2/start`, {
    method: 'POST',
    body: {
      docId,
      storageKey: signResp.storageKey,
      mimeType,
    },
  });

  if (typeof ephemeralArtifactId === 'string' && ephemeralArtifactId.trim()) {
    try {
      await markChatGeneratedArtifactPromoted(ephemeralArtifactId.trim(), docId);
    } catch (error) {
      // Promotion linkage is best-effort. The artifact remains ephemeral and will
      // still be cleaned up by TTL if this call fails.
      console.warn('Failed to mark chat artifact promoted', error);
    }
  }

  let ingestionStatus = 'queued';
  if (autoAccept) {
    const accepted = await waitForIngestionAndAutoAccept(orgId, docId);
    ingestionStatus = accepted.status;
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('ingestionJobUpdated'));
    } catch {
      // noop
    }
  }

  return {
    docId,
    filename,
    ingestionStatus,
  };
}

type SaveGeneratedFileToDocumentsParams = {
  fileUrl: string;
  title: string;
  filename: string;
  mimeType?: string | null;
  departmentId: string;
  folderPath: string[];
  textPreview?: string | null;
  autoAccept?: boolean;
};

function inferDocumentTypeFromMimeAndFilename(mimeType: string, filename: string): string {
  const mime = String(mimeType || '').toLowerCase();
  const lowerName = String(filename || '').toLowerCase();
  if (mime.includes('pdf') || lowerName.endsWith('.pdf')) return 'PDF';
  if (mime.includes('wordprocessingml') || mime.includes('msword') || lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) return 'Word';
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lowerName)) return 'Image';
  return 'Word';
}

function buildGeneratedFileExtractionMetadata(params: {
  title: string;
  filename: string;
  mimeType: string;
}) {
  const { title, filename, mimeType } = params;
  const summary = `Generated file saved from chat artifact (${mimeType || 'application/octet-stream'}).`;
  return {
    title,
    filename,
    subject: title,
    description: summary,
    category: 'Generated',
    documentType: inferDocumentTypeFromMimeAndFilename(mimeType, filename),
    sender: '',
    receiver: '',
    keywords: ['generated', 'chat', filename].filter(Boolean),
    tags: ['Generated', 'Chat Artifact'],
    summary,
    keyPointers: ['Generated file saved from chat artifact'],
    generated: true,
    source: 'chat_generated_file',
  };
}

export async function saveGeneratedFileToDocuments(
  params: SaveGeneratedFileToDocumentsParams,
): Promise<SaveGeneratedDocumentResult> {
  const { orgId } = getApiContext();
  if (!orgId) throw new Error('No organization selected');

  const {
    fileUrl,
    title,
    filename,
    mimeType = null,
    departmentId,
    folderPath,
    textPreview = null,
    autoAccept = true,
  } = params;

  const normalizedTitle = String(title || '').trim() || trimExt(String(filename || '').trim()) || 'Generated Document';
  const requestedName = String(filename || '').trim() || `${normalizedTitle}.docx`;

  const fileRes = await fetch(fileUrl, { method: 'GET' });
  if (!fileRes.ok) {
    throw new Error(`Failed to fetch generated file (${fileRes.status} ${fileRes.statusText})`);
  }

  const blob = await fileRes.blob();
  const resolvedMime = String(mimeType || blob.type || '').trim() || 'application/octet-stream';
  const extMatch = requestedName.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch?.[1]?.toLowerCase() || (resolvedMime.includes('pdf') ? 'pdf' : 'docx');
  const finalFilename = sanitizeFilename(withExt(trimExt(requestedName) || normalizedTitle, ext));

  const signResp = await apiFetch<{ signedUrl: string; storageKey: string }>(`/orgs/${orgId}/uploads/sign`, {
    method: 'POST',
    body: {
      filename: finalFilename,
      mimeType: resolvedMime,
    },
  });
  if (!signResp?.signedUrl || !signResp?.storageKey) {
    throw new Error('Failed to create signed upload URL');
  }

  await uploadBlobToSignedUrl(signResp.signedUrl, blob, resolvedMime);

  const created = await apiFetch<DraftDocumentCreateResponse>(`/orgs/${orgId}/documents`, {
    method: 'POST',
    body: {
      title: normalizedTitle,
      filename: finalFilename,
      type: inferDocumentTypeFromMimeAndFilename(resolvedMime, finalFilename),
      folderPath: Array.isArray(folderPath) ? folderPath : [],
      subject: normalizedTitle,
      description: `Generated file saved from chat artifact (${ext.toUpperCase()}).`,
      category: 'Generated',
      tags: ['Generated', 'Chat Artifact'],
      keywords: [finalFilename, ext, 'generated', 'chat'].filter(Boolean),
      sender: '',
      receiver: '',
      document_date: '',
      departmentId,
      isDraft: true,
      mimeType: resolvedMime,
      fileSizeBytes: blob.size,
    },
  });
  if (!created?.id) {
    throw new Error('Failed to create draft document');
  }

  const docId = created.id;

  await apiFetch(`/orgs/${orgId}/uploads/finalize`, {
    method: 'POST',
    body: {
      documentId: docId,
      storageKey: signResp.storageKey,
      fileSizeBytes: blob.size,
      mimeType: resolvedMime,
    },
  });

  const extractionText = String(textPreview || '').trim();
  if (extractionText) {
    const extractionMetadata = buildGeneratedFileExtractionMetadata({
      title: normalizedTitle,
      filename: finalFilename,
      mimeType: resolvedMime,
    });
    try {
      await apiFetch(`/orgs/${orgId}/documents/${docId}/extraction`, {
        method: 'POST',
        body: {
          ocrText: extractionText,
          metadata: extractionMetadata,
        },
      });
    } catch (error) {
      console.warn('Failed to write extraction for generated file (continuing)', error);
    }
  }

  await apiFetch(`/orgs/${orgId}/ingestion-v2/start`, {
    method: 'POST',
    body: {
      docId,
      storageKey: signResp.storageKey,
      mimeType: resolvedMime,
    },
  });

  let ingestionStatus = 'queued';
  if (autoAccept) {
    const accepted = await waitForIngestionAndAutoAccept(orgId, docId);
    ingestionStatus = accepted.status;
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('ingestionJobUpdated'));
    } catch {
      // noop
    }
  }

  return {
    docId,
    filename: finalFilename,
    ingestionStatus,
  };
}

export type { SaveFormat };
