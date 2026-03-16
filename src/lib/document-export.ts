/**
 * Unified Document Export Utilities
 * Supports any template key, with optimized layouts for legacy built-ins.
 *
 * PDF  → Python HTML-first backend (`/document/pdf/v2`) with legacy fallback
 * DOCX → docx.js (client-side) with generic fallback for unknown templates
 */

// ─── Backend base URL ─────────────────────────────────────────────────────────
const BACKEND = process.env.NEXT_PUBLIC_PYSERVER_URL || 'http://localhost:8010';

// ─── Shared types ─────────────────────────────────────────────────────────────

const KNOWN_TEMPLATE_LABELS: Record<string, string> = {
    invoice: 'Invoice',
    purchase_order: 'Purchase Order',
    receipt: 'Receipt',
    quotation: 'Quotation',
    delivery_note: 'Delivery Note',
};

const KNOWN_TEMPLATE_NUMBER_KEYS: Record<string, string[]> = {
    invoice: ['invoice_number'],
    purchase_order: ['po_number', 'purchase_order_number'],
    receipt: ['receipt_number'],
    quotation: ['quote_number', 'quotation_number'],
    delivery_note: ['delivery_note_number', 'delivery_challan_number'],
};

export type TemplateType = string;

export function normalizeTemplateType(value: string): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function titleizeTemplateType(value: string): string {
    const normalized = normalizeTemplateType(value);
    if (!normalized) return 'Document';
    return normalized
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function getNestedValue(data: Record<string, any>, path: string): any {
    if (!path) return undefined;
    let current: any = data;
    for (const rawPart of String(path).split('.')) {
        const part = rawPart.trim();
        if (!part || current == null || typeof current !== 'object') return undefined;
        current = current[part];
    }
    return current;
}

function collectManifestNumberPaths(data: Record<string, any>): string[] {
    const manifest = data?._briefly_generation_context?.template_manifest;
    const effective = data?._briefly_generation_context?.effective_template;
    const generation = effective?.generation;
    const rendering = effective?.rendering;
    const candidateLists = [
        manifest?.number_keys,
        manifest?.numberKeys,
        generation?.number_keys,
        generation?.filename_keys,
        rendering?.number_keys,
        rendering?.filename_keys,
    ];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const list of candidateLists) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            const value = String(item || '').trim();
            if (!value || seen.has(value)) continue;
            seen.add(value);
            out.push(value);
        }
    }
    return out;
}

/** Detect template type from raw artifact data */
export function detectTemplateType(data: Record<string, any>): TemplateType | null {
    const directCandidates = [
        data.template_type,
        data.document_type,
        data.doc_type,
        data.template_id,
        data?._briefly_generation_context?.template_manifest?.template_key,
        data?._briefly_generation_context?.effective_template?.template_key,
    ];
    for (const candidate of directCandidates) {
        const normalized = normalizeTemplateType(String(candidate || ''));
        if (normalized) return normalized;
    }

    // Heuristic fallback
    if (data.invoice_number && data.items && data.totals) return 'invoice';
    if (data.po_number && data.items) return 'purchase_order';
    if (data.receipt_number && data.payment_method) return 'receipt';
    if (data.quote_number && data.items) return 'quotation';
    if (data.delivery_note_number && data.items) return 'delivery_note';

    for (const key of Object.keys(data || {})) {
        const normalizedKey = normalizeTemplateType(key);
        if (normalizedKey.endsWith('_number') && normalizedKey !== 'document_number') {
            return normalizedKey.slice(0, -'_number'.length);
        }
    }

    return null;
}

/** Human-readable label for a template type */
export function templateLabel(type: TemplateType): string {
    const normalized = normalizeTemplateType(type);
    return KNOWN_TEMPLATE_LABELS[normalized] || titleizeTemplateType(normalized);
}

/** Primary document number field per template */
export function getPrimaryDocumentNumber(type: TemplateType, data: Record<string, any>): string {
    const normalized = normalizeTemplateType(type);
    const candidates = [
        ...(KNOWN_TEMPLATE_NUMBER_KEYS[normalized] || []),
        ...collectManifestNumberPaths(data),
        ...Object.keys(data || {}).filter((key) => normalizeTemplateType(key).endsWith('_number')),
        'document_number',
        'number',
        'id',
    ];
    const seen = new Set<string>();
    for (const path of candidates) {
        const candidatePath = String(path || '').trim();
        if (!candidatePath || seen.has(candidatePath)) continue;
        seen.add(candidatePath);
        const value = candidatePath.includes('.') ? getNestedValue(data, candidatePath) : data[candidatePath];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value !== undefined && value !== null && value !== '') return String(value);
    }
    return '';
}

function docNumber(type: TemplateType, data: Record<string, any>): string {
    return getPrimaryDocumentNumber(type, data) || normalizeTemplateType(type) || 'document';
}

// ─── PDF Export (backend) ─────────────────────────────────────────────────────

/**
 * Download a PDF for any template type.
 * Uses the HTML-first backend path and falls back to the legacy renderer when needed.
 */
export async function downloadDocumentPdf(
    type: TemplateType,
    data: Record<string, any>,
) {
    const { blob, fileName } = await buildDocumentPdfBlob(type, data);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

export async function buildDocumentPdfBlob(
    type: TemplateType,
    data: Record<string, any>,
): Promise<{ blob: Blob; fileName: string }> {
    const rendering = data?._briefly_generation_context?.effective_template?.rendering;
    const primaryRequestBody = {
        template_type: type,
        data,
        html_template: typeof rendering?.html_template === 'string' ? rendering.html_template : undefined,
        css: typeof rendering?.css === 'string' ? rendering.css : undefined,
        branding: rendering?.branding ?? undefined,
    };

    let res = await fetch(`${BACKEND}/document/pdf/v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(primaryRequestBody),
    });

    if (!res.ok) {
        res = await fetch(`${BACKEND}/document/pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_type: type, data }),
        });
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `PDF generation failed (${res.status})`);
    }

    const blob = await res.blob();
    return {
        blob,
        fileName: `${docNumber(type, data)}.pdf`,
    };
}

// ─── DOCX Export (client-side, docx.js) ──────────────────────────────────────

/**
 * Download a DOCX for any supported template type.
 */
export async function downloadDocumentDocx(
    type: TemplateType,
    data: Record<string, any>,
) {
    const { blob, fileName } = await buildDocumentDocxBlob(type, data);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export async function buildDocumentDocxBlob(
    type: TemplateType,
    data: Record<string, any>,
): Promise<{ blob: Blob; fileName: string }> {
    const docxLib = await import('docx');
    const {
        Document, Packer, Paragraph, Table, TableRow, TableCell,
        TextRun, WidthType, AlignmentType, BorderStyle,
    } = docxLib;

    // ── Shared helpers ────────────────────────────────────────────────────────
    const noBorder = {
        top: { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        left: { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        right: { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
    };
    const lightBorder = {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' },
        left: { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' },
        right: { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' },
    };
    const thickBorder = { style: BorderStyle.SINGLE, size: 3, color: '0f172a' };
    const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' };

    const label = (text: string) =>
        new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text, size: 14, font: 'Arial', color: '64748b', allCaps: true, bold: true })],
        });

    const value = (text: string, mono = false, size = 24) =>
        new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text, size, font: mono ? 'Courier New' : 'Arial', bold: true })],
        });

    const small = (text: string, muted = false) =>
        new Paragraph({
            spacing: { after: 20 },
            children: [new TextRun({ text, size: 18, font: 'Arial', color: muted ? '64748b' : '0f172a' })],
        });

    const monoBlock = (text: string) =>
        new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text, size: 18, font: 'Courier New', color: '0f172a' })],
        });

    const asText = (value: any): string => {
        if (value === undefined || value === null) return '';
        if (Array.isArray(value)) return value.map((v) => String(v)).join('\n');
        return String(value);
    };

    const divider = () =>
        new Paragraph({
            spacing: { before: 80, after: 80 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' } },
            children: [],
        });

    const metaGrid = (pairs: [string, string][]) =>
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: pairs.map(([lbl, val], i) =>
                        new TableCell({
                            width: { size: Math.floor(100 / pairs.length), type: WidthType.PERCENTAGE },
                            borders: i < pairs.length - 1
                                ? { ...noBorder, right: { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' } }
                                : noBorder,
                            children: [label(lbl), value(val)],
                        })
                    ),
                }),
            ],
        });

    const partyGrid = (parties: [string, Record<string, any> | null][]) =>
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: parties.map(([lbl, party], i) => {
                        const children: any[] = [label(lbl), value(party?.name || '—', false, 22)];
                        if (party?.address) children.push(small(party.address, true));
                        if (party?.phone) children.push(small(party.phone));
                        if (party?.email) children.push(small(party.email, true));
                        return new TableCell({
                            width: { size: Math.floor(100 / parties.length), type: WidthType.PERCENTAGE },
                            borders: i < parties.length - 1
                                ? { ...noBorder, right: { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' } }
                                : noBorder,
                            children,
                        });
                    }),
                }),
            ],
        });

    const itemsTable = (items: any[], columns: { lbl: string; key: string; align?: 'right' }[]) => {
        const headerRow = new TableRow({
            tableHeader: true,
            children: columns.map(col =>
                new TableCell({
                    borders: lightBorder,
                    shading: { fill: 'f1f5f9' },
                    children: [new Paragraph({
                        alignment: col.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [new TextRun({ text: col.lbl, size: 14, font: 'Arial', bold: true, color: '64748b' })],
                    })],
                })
            ),
        });
        const dataRows = (items || []).map((item: any, idx: number) =>
            new TableRow({
                children: columns.map(col =>
                    new TableCell({
                        borders: lightBorder,
                        children: [new Paragraph({
                            alignment: col.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                            spacing: { before: 40, after: 40 },
                            children: [new TextRun({
                                text: String(item[col.key] ?? (col.key === 'description' ? `Item ${idx + 1}` : '—')),
                                size: 20,
                                font: col.align === 'right' ? 'Courier New' : 'Arial',
                            })],
                        })],
                    })
                ),
            })
        );
        return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] });
    };

    const totalsBlock = (rows: [string, string, boolean?][], currency: string, total: any) => {
        const paras: any[] = rows.map(([lbl, val, isMinus]) =>
            new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 40 },
                children: [
                    new TextRun({ text: `${lbl}:  `, size: 20, font: 'Arial', color: '64748b' }),
                    new TextRun({ text: isMinus ? `-${val}` : val, size: 20, font: 'Courier New', color: isMinus ? '059669' : '0f172a' }),
                ],
            })
        );
        paras.push(
            new Paragraph({ spacing: { before: 100 }, border: { top: thickBorder }, children: [] }),
            new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 60 },
                children: [
                    new TextRun({ text: 'TOTAL DUE:  ', size: 22, font: 'Arial', bold: true }),
                    new TextRun({ text: `${currency} ${total ?? '—'}`, size: 30, font: 'Courier New', bold: true }),
                ],
            }),
        );
        return paras;
    };

    // ── Template-specific document builders ───────────────────────────────────
    let docSections: any[];
    let filename: string;
    const normalizedType = normalizeTemplateType(type);

    switch (normalizedType) {
        // ── INVOICE ──────────────────────────────────────────────────────────
        case 'invoice': {
            const items = data.items || [];
            const totals = data.totals || {};
            const currency = data.currency || '';
            const sub = Number(totals.subtotal ?? items.reduce((s: number, i: any) => s + Number(i.line_total || 0), 0));
            const tax = Number(totals.tax_amount || 0);
            const disc = Number(totals.discount || 0);
            const tot = Number(totals.total_amount ?? (sub + tax - disc));

            const totalRows: [string, string, boolean?][] = [
                ['Subtotal', String(sub)],
                ['Tax', String(tax)],
                ...(disc ? [['Discount', String(disc), true] as [string, string, boolean]] : []),
            ];
            filename = data.invoice_number || 'invoice';
            docSections = [{
                children: [
                    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'INVOICE', size: 44, font: 'Arial', bold: true })] }),
                    divider(),
                    metaGrid([['Invoice Number', data.invoice_number || '—'], ['Currency', currency || '—']]),
                    new Paragraph({ spacing: { before: 20, after: 20 }, children: [] }),
                    metaGrid([['Date', data.date || '—'], ['Due Date', data.due_date || '—']]),
                    divider(),
                    partyGrid([['From', data.seller], ['Bill To', data.buyer]]),
                    divider(),
                    itemsTable(items, [
                        { lbl: 'DESCRIPTION', key: 'description' },
                        { lbl: 'QTY', key: 'quantity', align: 'right' },
                        { lbl: 'RATE', key: 'unit_price', align: 'right' },
                        { lbl: 'AMOUNT', key: 'line_total', align: 'right' },
                    ]),
                    ...totalsBlock(totalRows, currency, tot),
                    ...(data.payment_terms ? [divider(), label('Payment Terms'), value(asText(data.payment_terms), false, 20)] : []),
                    ...(data.bank_details ? [divider(), label('Bank Details'), small(asText(data.bank_details))] : []),
                    ...(data._integrity?.issues?.length ? [
                        divider(),
                        new Paragraph({ children: [new TextRun({ text: '⚠ INTEGRITY NOTES', size: 16, font: 'Arial', bold: true, color: '92400e' })] }),
                        ...data._integrity.issues.map((iss: string) =>
                            new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: iss, size: 18, font: 'Arial', color: '92400e' })] })
                        ),
                    ] : []),
                    ...(data.notes ? [divider(), label('Notes'), small(asText(data.notes))] : []),
                ],
            }];
            break;
        }

        // ── PURCHASE ORDER ────────────────────────────────────────────────────
        case 'purchase_order': {
            const items = data.items || [];
            const currency = data.currency || '';
            const totals = data.totals || {};
            const deliveryDate = data.delivery_date || totals.delivery_date || '—';
            const buyer = data.buyer || {};
            const vendor = data.vendor || {};
            const buyerContact = buyer.contact || {};
            const vendorContact = vendor.contact || {};
            const sub = Number(totals.subtotal ?? items.reduce((s: number, i: any) => s + Number(i.line_total || 0), 0));
            const tax = Number(totals.tax_amount || 0);
            const ship = Number(totals.shipping_cost || data.shipping_cost || 0);
            const tot = Number(totals.total_amount ?? (sub + tax + ship));
            const totalRows: [string, string, boolean?][] = [
                ['Subtotal', String(sub)],
                ['Tax', String(tax)],
                ...(ship ? [['Shipping', String(ship)] as [string, string]] : []),
            ];
            filename = data.po_number || 'purchase_order';
            docSections = [{
                children: [
                    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'PURCHASE ORDER', size: 44, font: 'Arial', bold: true })] }),
                    divider(),
                    metaGrid([['PO Number', data.po_number || '—'], ['Currency', currency || '—']]),
                    new Paragraph({ spacing: { before: 20, after: 20 }, children: [] }),
                    metaGrid([['Date', data.date || '—'], ['Delivery Date', deliveryDate]]),
                    divider(),
                    partyGrid([
                        ['Buyer', {
                            name: buyer.name || data.buyer_name,
                            address: buyer.address || data.buyer_address,
                            phone: buyer.phone || buyerContact.phone,
                            email: buyer.email || buyerContact.email,
                        }],
                        ['Vendor', {
                            name: vendor.name || data.vendor_name,
                            address: vendor.address || data.vendor_address,
                            phone: vendor.phone || vendorContact.phone,
                            email: vendor.email || vendorContact.email,
                        }],
                    ]),
                    divider(),
                    itemsTable(items, [
                        { lbl: 'DESCRIPTION', key: 'description' },
                        { lbl: 'QTY', key: 'quantity', align: 'right' },
                        { lbl: 'UNIT PRICE', key: 'unit_price', align: 'right' },
                        { lbl: 'TOTAL', key: 'line_total', align: 'right' },
                    ]),
                    ...totalsBlock(totalRows, currency, tot),
                    ...(data.payment_terms ? [divider(), label('Payment Terms'), value(data.payment_terms, false, 20)] : []),
                    ...(data.shipping_method ? [divider(), label('Shipping Method'), value(asText(data.shipping_method), false, 20)] : []),
                    ...(data.authorized_by ? [divider(), label('Authorized By'), value(asText(data.authorized_by), false, 20)] : []),
                    ...(data.notes ? [divider(), label('Notes'), small(asText(data.notes))] : []),
                ],
            }];
            break;
        }

        // ── RECEIPT ───────────────────────────────────────────────────────────
        case 'receipt': {
            const currency = data.currency || '';
            filename = data.receipt_number || 'receipt';
            docSections = [{
                children: [
                    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'RECEIPT', size: 44, font: 'Arial', bold: true })] }),
                    divider(),
                    metaGrid([['Receipt Number', data.receipt_number || '—'], ['Date', data.date || '—']]),
                    divider(),
                    ...(data.received_from ? [label('Received From'), value(data.received_from, false, 22)] : []),
                    ...(data.received_by ? [label('Received By'), value(data.received_by, false, 22)] : []),
                    divider(),
                    metaGrid([
                        ['Amount', `${currency} ${data.amount || '—'}`],
                        ['Payment Method', data.payment_method || '—'],
                    ]),
                    ...(data.reference_number ? [new Paragraph({ spacing: { before: 20, after: 20 }, children: [] }), label('Reference'), value(data.reference_number)] : []),
                    ...(data.description ? [divider(), label('Description'), small(data.description)] : []),
                    ...(data.balance_due !== undefined ? [divider(), label('Balance Due'), value(`${currency} ${data.balance_due}`, true, 24)] : []),
                    ...(data.status ? [divider(), label('Status'), value(asText(data.status), false, 20)] : []),
                    ...(data.previous_balance !== undefined ? [label('Previous Balance'), value(`${currency} ${data.previous_balance}`, true, 20)] : []),
                    ...(data.notes ? [divider(), label('Notes'), small(asText(data.notes))] : []),
                ],
            }];
            break;
        }

        // ── QUOTATION ─────────────────────────────────────────────────────────
        case 'quotation': {
            const items = data.items || [];
            const currency = data.currency || '';
            const totals = data.totals || {};
            const fromParty = data.company || data.seller || {};
            const fromContact = fromParty.contact || {};
            const clientParty = data.client || {};
            const clientContact = clientParty.contact || {};
            const sub = Number(totals.subtotal ?? items.reduce((s: number, i: any) => s + Number(i.line_total || 0), 0));
            const tax = Number(totals.tax_amount || 0);
            const disc = Number(totals.discount || 0);
            const tot = Number(totals.total_amount ?? (sub + tax - disc));
            const totalRows: [string, string, boolean?][] = [
                ['Subtotal', String(sub)],
                ['Tax', String(tax)],
                ...(disc ? [['Discount', String(disc), true] as [string, string, boolean]] : []),
            ];
            filename = data.quote_number || 'quotation';
            docSections = [{
                children: [
                    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'QUOTATION', size: 44, font: 'Arial', bold: true })] }),
                    divider(),
                    metaGrid([['Quote Number', data.quote_number || '—'], ['Currency', currency || '—']]),
                    new Paragraph({ spacing: { before: 20, after: 20 }, children: [] }),
                    metaGrid([['Date', data.date || '—'], ['Valid Until', data.valid_until || '—']]),
                    divider(),
                    partyGrid([
                        ['From', {
                            name: fromParty.name || data.company_name,
                            address: fromParty.address || data.company_address,
                            phone: fromParty.phone || fromContact.phone,
                            email: fromParty.email || fromContact.email,
                        }],
                        ['Prepared For', {
                            name: clientParty.name || data.client_name,
                            address: clientParty.address || data.client_address,
                            phone: clientParty.phone || clientContact.phone,
                            email: clientParty.email || clientContact.email,
                        }],
                    ]),
                    divider(),
                    itemsTable(items, [
                        { lbl: 'DESCRIPTION', key: 'description' },
                        { lbl: 'QTY', key: 'quantity', align: 'right' },
                        { lbl: 'UNIT PRICE', key: 'unit_price', align: 'right' },
                        { lbl: 'TOTAL', key: 'line_total', align: 'right' },
                    ]),
                    ...totalsBlock(totalRows, currency, tot),
                    ...(data.terms_and_conditions ? [divider(), label('Terms & Conditions'), small(asText(data.terms_and_conditions))] : []),
                    ...(data.notes ? [divider(), label('Notes'), small(asText(data.notes))] : []),
                    ...(data.prepared_by ? [divider(), label('Prepared By'), value(data.prepared_by, false, 20)] : []),
                ],
            }];
            break;
        }

        // ── DELIVERY NOTE ─────────────────────────────────────────────────────
        case 'delivery_note': {
            const items = data.items || [];
            const sender = data.sender || {};
            const senderContact = sender.contact || {};
            const receiver = data.receiver || {};
            const receiverContact = receiver.contact || {};
            filename = data.delivery_note_number || 'delivery_note';
            docSections = [{
                children: [
                    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'DELIVERY NOTE', size: 44, font: 'Arial', bold: true })] }),
                    divider(),
                    metaGrid([['Delivery Note #', data.delivery_note_number || '—'], ['Date', data.date || '—']]),
                    ...(data.order_reference ? [new Paragraph({ spacing: { before: 20, after: 20 }, children: [] }), label('Order Reference'), value(data.order_reference, false, 20)] : []),
                    divider(),
                    partyGrid([
                        ['Sender', {
                            name: sender.name || data.sender_name,
                            address: sender.address || data.sender_address,
                            phone: sender.phone || senderContact.phone,
                            email: sender.email || senderContact.email,
                        }],
                        ['Receiver', {
                            name: receiver.name || data.receiver_name,
                            address: receiver.address || data.receiver_address,
                            phone: receiver.phone || receiverContact.phone,
                            email: receiver.email || receiverContact.email,
                        }],
                    ]),
                    divider(),
                    itemsTable(items, [
                        { lbl: 'DESCRIPTION', key: 'description' },
                        { lbl: 'QTY', key: 'quantity', align: 'right' },
                        { lbl: 'UNIT', key: 'unit', align: 'right' },
                    ]),
                    ...(data.total_packages ? [divider(), label('Total Packages'), value(String(data.total_packages))] : []),
                    ...(data.weight ? [label('Weight'), value(String(data.weight))] : []),
                    ...(data.shipping_method ? [label('Shipping Method'), value(data.shipping_method)] : []),
                    ...(data.driver_name ? [label('Driver'), value(data.driver_name)] : []),
                    divider(),
                    metaGrid([['Received By (Signature)', '____________________'], ['Date', '____________________']]),
                    ...(data.received_by_signature ? [label('Signature / Receipt Ref'), value(asText(data.received_by_signature), false, 20)] : []),
                    ...(data.notes ? [divider(), label('Notes'), small(asText(data.notes))] : []),
                ],
            }];
            break;
        }
        default: {
            const rawData = { ...(data || {}) };
            delete (rawData as any)._briefly_generation_context;
            filename = getPrimaryDocumentNumber(type, data) || normalizedType || 'document';
            const scalarEntries = Object.entries(rawData)
                .filter(([key, value]) => key !== 'items' && key !== 'totals' && key !== 'layout' && key !== 'visual_blocks')
                .filter(([, value]) => value == null || typeof value !== 'object')
                .slice(0, 12);
            const genericChildren: any[] = [
                new Paragraph({
                    spacing: { after: 40 },
                    children: [new TextRun({ text: templateLabel(type).toUpperCase(), size: 44, font: 'Arial', bold: true })],
                }),
                divider(),
            ];
            for (const [key, entryValue] of scalarEntries) {
                genericChildren.push(label(titleizeTemplateType(key)));
                genericChildren.push(value(String(entryValue ?? '—'), false, 20));
            }
            const items = Array.isArray(data.items) ? data.items : [];
            if (items.length > 0 && typeof items[0] === 'object') {
                const columns = Object.keys(items[0] || {})
                    .slice(0, 5)
                    .map((key) => ({
                        lbl: titleizeTemplateType(key),
                        key,
                        align: typeof (items[0] as any)[key] === 'number' ? ('right' as const) : undefined,
                    }));
                if (columns.length > 0) {
                    genericChildren.push(divider(), label('Items'), itemsTable(items, columns));
                }
            }
            if (data.totals && typeof data.totals === 'object') {
                genericChildren.push(divider(), label('Totals'), monoBlock(JSON.stringify(data.totals, null, 2)));
            }
            genericChildren.push(divider(), label('Structured Data Snapshot'), monoBlock(JSON.stringify(rawData, null, 2)));
            docSections = [{ children: genericChildren }];
            break;
        }
    }

    const doc = new Document({ sections: docSections });
    const blob = await Packer.toBlob(doc);
    return {
        blob,
        fileName: `${filename}.docx`,
    };
}
