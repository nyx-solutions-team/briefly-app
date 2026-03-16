import type { MetadataSchemaField } from '@/lib/document-types-api';

export type TipTapNode = {
  type: string;
  attrs?: Record<string, any>;
  content?: TipTapNode[];
  text?: string;
};

export type TipTapDocument = {
  type: 'doc';
  content: TipTapNode[];
};

export type DraftBuilderInput = {
  documentTypeName: string;
  documentTypeKey?: string;
  schema?: MetadataSchemaField[];
  answers: Record<string, string>;
  specialInstructions?: string;
};

function text(value: string): TipTapNode {
  return { type: 'text', text: value };
}

function paragraph(value: string): TipTapNode {
  return { type: 'paragraph', content: [text(value)] };
}

function heading(value: string, level = 2): TipTapNode {
  return { type: 'heading', attrs: { level }, content: [text(value)] };
}

function bulletList(items: string[]): TipTapNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  };
}

function fieldLabel(fieldName: string, schema?: MetadataSchemaField[]): string {
  const matched = (schema || []).find((item) => item.field_name === fieldName);
  if (matched?.field_label) return matched.field_label;
  return fieldName
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizedEntries(input: DraftBuilderInput): Array<{ key: string; label: string; value: string }> {
  return Object.entries(input.answers)
    .map(([key, value]) => [key, String(value || '').trim()] as const)
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => ({ key, label: fieldLabel(key, input.schema), value }));
}

function pickValue(
  entries: Array<{ key: string; label: string; value: string }>,
  candidates: string[]
): string | null {
  const lowerCandidates = candidates.map((item) => item.toLowerCase());
  const found = entries.find((entry) => {
    const k = entry.key.toLowerCase();
    return lowerCandidates.some((candidate) => k.includes(candidate));
  });
  return found?.value || null;
}

function isLegalLikeDocument(documentTypeKey?: string): boolean {
  const key = String(documentTypeKey || '').toLowerCase();
  return (
    key.includes('deed') ||
    key.includes('agreement') ||
    key.includes('contract') ||
    key.includes('notice') ||
    key.includes('lease')
  );
}

function isFinancialLikeDocument(documentTypeKey?: string): boolean {
  const key = String(documentTypeKey || '').toLowerCase();
  return key.includes('invoice') || key.includes('receipt') || key.includes('statement');
}

export function buildDraftDocumentTitle(input: DraftBuilderInput): string {
  const preferredKeys = [
    'document_title',
    'title',
    'deed_title',
    'agreement_title',
    'subject',
    'matter',
  ];

  for (const key of preferredKeys) {
    const value = String(input.answers?.[key] || '').trim();
    if (value) return value;
  }

  const buyer = String(input.answers?.buyer_name || input.answers?.buyer || '').trim();
  const seller = String(input.answers?.seller_name || input.answers?.seller || '').trim();
  if (buyer && seller) return `${input.documentTypeName}: ${seller} to ${buyer}`;

  return `${input.documentTypeName} Draft`;
}

function legalSections(entries: Array<{ key: string; label: string; value: string }>): TipTapNode[] {
  const parties =
    pickValue(entries, ['parties', 'party', 'buyer', 'seller', 'lessor', 'lessee', 'vendor', 'purchaser']) ||
    'List all involved parties with full legal names, addresses, and identifiers.';
  const property =
    pickValue(entries, ['property', 'plot', 'asset', 'schedule', 'address']) ||
    'Describe the property or subject matter clearly, including reference identifiers.';
  const consideration =
    pickValue(entries, ['amount', 'price', 'consideration', 'payment']) ||
    'State financial consideration, payment milestones, and tax treatment.';

  return [
    heading('Parties', 3),
    paragraph(parties),
    heading('Recitals and Background', 3),
    paragraph('Set out the factual background and intent of the parties in clear chronological order.'),
    heading('Subject Matter', 3),
    paragraph(property),
    heading('Consideration and Payment Terms', 3),
    paragraph(consideration),
    heading('Representations, Warranties, and Covenants', 3),
    paragraph('Capture obligations, risk allocation, and compliance requirements for each party.'),
    heading('Execution and Signatures', 3),
    paragraph('Include execution block, witness requirements, and date/place of execution.'),
  ];
}

function financialSections(entries: Array<{ key: string; label: string; value: string }>): TipTapNode[] {
  const amount =
    pickValue(entries, ['amount', 'total', 'value']) ||
    'Specify total amount, taxes, and payment status.';

  return [
    heading('Summary', 3),
    paragraph('Provide an executive summary of the financial document and key numbers.'),
    heading('Amounts and Taxation', 3),
    paragraph(amount),
    heading('Counterparty Details', 3),
    paragraph('Capture relevant buyer/seller/customer/vendor information and references.'),
    heading('Review Notes', 3),
    paragraph('Highlight any missing fields, reconciliations, and verification checkpoints.'),
  ];
}

function genericSections(): TipTapNode[] {
  return [
    heading('Purpose', 3),
    paragraph('State the objective and intended use of this document.'),
    heading('Core Details', 3),
    paragraph('Expand the provided inputs into complete, review-ready statements.'),
    heading('Terms and Conditions', 3),
    paragraph('Add obligations, assumptions, boundaries, and timelines as applicable.'),
    heading('Review Checklist', 3),
    paragraph('Validate names, dates, amounts, references, and approvals before finalization.'),
  ];
}

export function buildDraftDocumentContent(input: DraftBuilderInput): TipTapDocument {
  const now = new Date();
  const entries = normalizedEntries(input);
  const title = buildDraftDocumentTitle(input);
  const metadataLines = entries.map((entry) => `${entry.label}: ${entry.value}`);

  const bodySections = isLegalLikeDocument(input.documentTypeKey)
    ? legalSections(entries)
    : isFinancialLikeDocument(input.documentTypeKey)
      ? financialSections(entries)
      : genericSections();

  const content: TipTapNode[] = [
    heading(title, 1),
    paragraph(`Document Type: ${input.documentTypeName}`),
    paragraph(`Generated On: ${now.toLocaleString()}`),
    paragraph('AI-assisted draft generated from structured inputs. Legal/business review is required before execution.'),
    heading('Document Information', 2),
  ];

  if (metadataLines.length > 0) {
    content.push(bulletList(metadataLines));
  } else {
    content.push(paragraph('No structured fields were provided. Add details before finalizing this draft.'));
  }

  if (String(input.specialInstructions || '').trim()) {
    content.push(heading('Special Instructions', 2));
    content.push(paragraph(String(input.specialInstructions).trim()));
  }

  content.push(heading('Draft Body', 2));
  content.push(...bodySections);

  return {
    type: 'doc',
    content,
  };
}
