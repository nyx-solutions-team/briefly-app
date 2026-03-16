/**
 * Invoice Export Utilities
 * Generates PDF and DOCX downloads that mirror the visual invoice preview.
 */

// ─── Types ───
export interface InvoiceParty {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
}

export interface InvoiceItem {
    description?: string;
    quantity?: number | string;
    unit_price?: number | string;
    line_total?: number | string;
}

export interface InvoiceTotals {
    subtotal?: number | string;
    tax_amount?: number | string;
    discount?: number | string;
    total_amount?: number | string;
}

export interface InvoiceIntegrity {
    status?: string;
    issues?: string[];
}

export interface InvoiceData {
    invoice_number?: string;
    date?: string;
    due_date?: string;
    currency?: string;
    template_id?: string;
    seller?: InvoiceParty;
    buyer?: InvoiceParty;
    items?: InvoiceItem[];
    totals?: InvoiceTotals;
    _integrity?: InvoiceIntegrity;
}

// ─── Computed totals helper ───
function computeTotals(data: InvoiceData) {
    const items = data.items || [];
    const totals = data.totals || {};
    const computedSubtotal = items.reduce((sum, item) => {
        const lt = Number(item?.line_total);
        return Number.isFinite(lt) ? sum + lt : sum;
    }, 0);
    const subtotal = totals.subtotal ?? (items.length > 0 ? computedSubtotal : null);
    const tax = totals.tax_amount ?? 0;
    const discount = totals.discount ?? 0;
    const total = totals.total_amount ?? (
        typeof subtotal === 'number'
            ? subtotal + (Number(tax) || 0) - (Number(discount) || 0)
            : null
    );
    return { subtotal, tax, discount, total };
}


// ─── PDF Export (ReportLab via Python backend — LEGACY, kept for rollback) ───
export async function downloadInvoicePdf(data: InvoiceData) {
    const pyserverUrl = process.env.NEXT_PUBLIC_PYSERVER_URL || 'http://localhost:8010';
    const res = await fetch(`${pyserverUrl}/invoice/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const details = typeof err?.details === 'string' && err.details.trim()
            ? ` ${err.details.trim()}`
            : '';
        const policy = err?.renderer_policy
            ? ` renderer_policy=${JSON.stringify(err.renderer_policy)}`
            : '';
        throw new Error((err.error || `PDF generation failed (${res.status})`) + details + policy);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.invoice_number || 'invoice'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── PDF Export v2 (WeasyPrint HTML-template renderer — Option A) ─────────────
// Uses /document/pdf/v2 which:
//   • Falls back to old ReportLab if PYSERVER_HTML_PDF_ENABLED=0 on server
//   • Falls back to old ReportLab if html_template not provided / render fails
//   • Passes branding from DB template so colors/fonts match the in-app preview
export interface DocumentPdfV2Options {
    templateType: string;
    data: Record<string, any>;
    /** Jinja2 HTML template from DB (rendering.html_template). If absent, server uses built-in default. */
    htmlTemplate?: string | null;
    /** Extra CSS string from DB (rendering.css) */
    css?: string | null;
    /** Branding config from DB (rendering.branding) */
    branding?: Record<string, any> | null;
    /** Override download filename (without .pdf extension) */
    filename?: string | null;
}

export async function downloadDocumentPdfV2(opts: DocumentPdfV2Options): Promise<void> {
    const pyserverUrl = process.env.NEXT_PUBLIC_PYSERVER_URL || 'http://localhost:8010';
    const res = await fetch(`${pyserverUrl}/document/pdf/v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            template_type: opts.templateType,
            data: opts.data,
            html_template: opts.htmlTemplate ?? undefined,
            css: opts.css ?? undefined,
            branding: opts.branding ?? undefined,
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const details = typeof err?.details === 'string' && err.details.trim()
            ? ` ${err.details.trim()}`
            : '';
        const policy = err?.renderer_policy
            ? ` renderer_policy=${JSON.stringify(err.renderer_policy)}`
            : '';
        throw new Error((err.error || `PDF generation failed (${res.status})`) + details + policy);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const renderer = res.headers.get('X-Briefly-Renderer') || 'reportlab';
    console.debug(`[briefly:pdf] renderer=${renderer}`);
    a.download = `${opts.filename || (opts.data as any)?.invoice_number || opts.templateType || 'document'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
}




// ─── DOCX Export (docx library) ───
export async function downloadInvoiceDocx(data: InvoiceData) {
    const docxLib = await import('docx');
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, BorderStyle, HeadingLevel } = docxLib;

    const items = data.items || [];
    const { subtotal, tax, discount, total } = computeTotals(data);
    const currency = data.currency || '';

    const noBorder = {
        top: { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        left: { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
        right: { style: BorderStyle.NONE, size: 0, color: 'ffffff' },
    };

    const lightBorder = {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'e5e5e5' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e5e5e5' },
        left: { style: BorderStyle.SINGLE, size: 1, color: 'e5e5e5' },
        right: { style: BorderStyle.SINGLE, size: 1, color: 'e5e5e5' },
    };

    // Helper: meta row
    const metaBlock = (label: string, value: string) => [
        new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: label, size: 16, font: 'Arial', color: '888888', allCaps: true, bold: true })],
        }),
        new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: value, size: 24, font: 'Arial', bold: true })],
        }),
    ];

    // Helper: party block
    const partyBlock = (label: string, party?: InvoiceParty) => {
        const lines: any[] = [
            new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: label, size: 16, font: 'Arial', color: '888888', allCaps: true, bold: true })],
            }),
            new Paragraph({
                spacing: { after: 40 },
                children: [new TextRun({ text: party?.name || '—', size: 22, font: 'Arial', bold: true })],
            }),
        ];
        if (party?.address) {
            lines.push(new Paragraph({
                spacing: { after: 20 },
                children: [new TextRun({ text: party.address, size: 18, font: 'Arial', color: '666666' })],
            }));
        }
        if (party?.phone) {
            lines.push(new Paragraph({
                spacing: { after: 20 },
                children: [new TextRun({ text: party.phone, size: 18, font: 'Arial' })],
            }));
        }
        if (party?.email) {
            lines.push(new Paragraph({
                spacing: { after: 20 },
                children: [new TextRun({ text: party.email, size: 18, font: 'Arial', color: '666666' })],
            }));
        }
        return lines;
    };

    // Items table header
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: lightBorder,
                shading: { fill: 'f5f5f5' },
                children: [new Paragraph({ children: [new TextRun({ text: 'DESCRIPTION', size: 16, font: 'Arial', bold: true, color: '888888' })] })],
            }),
            new TableCell({
                width: { size: 12, type: WidthType.PERCENTAGE },
                borders: lightBorder,
                shading: { fill: 'f5f5f5' },
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'QTY', size: 16, font: 'Arial', bold: true, color: '888888' })] })],
            }),
            new TableCell({
                width: { size: 18, type: WidthType.PERCENTAGE },
                borders: lightBorder,
                shading: { fill: 'f5f5f5' },
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'RATE', size: 16, font: 'Arial', bold: true, color: '888888' })] })],
            }),
            new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                borders: lightBorder,
                shading: { fill: 'f5f5f5' },
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'AMOUNT', size: 16, font: 'Arial', bold: true, color: '888888' })] })],
            }),
        ],
    });

    // Items rows
    const itemRows = items.map((item, idx) => new TableRow({
        children: [
            new TableCell({
                borders: lightBorder,
                children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun({ text: item.description || `Item ${idx + 1}`, size: 20, font: 'Arial' })] })],
            }),
            new TableCell({
                borders: lightBorder,
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 40, after: 40 }, children: [new TextRun({ text: String(item.quantity ?? '—'), size: 20, font: 'Courier New', color: '666666' })] })],
            }),
            new TableCell({
                borders: lightBorder,
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 40, after: 40 }, children: [new TextRun({ text: String(item.unit_price ?? '—'), size: 20, font: 'Courier New', color: '666666' })] })],
            }),
            new TableCell({
                borders: lightBorder,
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 40, after: 40 }, children: [new TextRun({ text: String(item.line_total ?? '—'), size: 20, font: 'Courier New', bold: true })] })],
            }),
        ],
    }));

    const itemsTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...itemRows],
    });

    // Totals section
    const totalLines: any[] = [
        new Paragraph({
            spacing: { before: 200 }, alignment: AlignmentType.RIGHT, children: [
                new TextRun({ text: `Subtotal:  `, size: 20, font: 'Arial', color: '666666' }),
                new TextRun({ text: String(subtotal ?? '—'), size: 20, font: 'Courier New' }),
            ]
        }),
        new Paragraph({
            alignment: AlignmentType.RIGHT, children: [
                new TextRun({ text: `Tax:  `, size: 20, font: 'Arial', color: '666666' }),
                new TextRun({ text: String(tax ?? '0.00'), size: 20, font: 'Courier New' }),
            ]
        }),
    ];

    if (discount && discount !== 0) {
        totalLines.push(new Paragraph({
            alignment: AlignmentType.RIGHT, children: [
                new TextRun({ text: `Discount:  `, size: 20, font: 'Arial', color: '666666' }),
                new TextRun({ text: `-${discount}`, size: 20, font: 'Courier New', color: '059669' }),
            ]
        }));
    }

    totalLines.push(
        new Paragraph({ spacing: { before: 120 }, alignment: AlignmentType.RIGHT, border: { top: { style: BorderStyle.SINGLE, size: 3, color: '1a1a1a' } }, children: [] }),
        new Paragraph({
            alignment: AlignmentType.RIGHT, spacing: { before: 80 }, children: [
                new TextRun({ text: `TOTAL DUE:  `, size: 24, font: 'Arial', bold: true, allCaps: true }),
                new TextRun({ text: `${currency} ${total ?? '—'}`, size: 32, font: 'Courier New', bold: true }),
            ]
        }),
    );

    // Build meta table
    const metaTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'e5e5e5' } },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: noBorder,
                        children: [...metaBlock('Invoice Number', data.invoice_number || '—'), ...metaBlock('Date', data.date || '—')],
                    }),
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: noBorder,
                        children: [...metaBlock('Currency', data.currency || '—'), ...metaBlock('Due Date', data.due_date || '—')],
                    }),
                ],
            }),
        ],
    });

    // Party table
    const partyTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'e5e5e5' } },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: noBorder,
                        children: partyBlock('From', data.seller),
                    }),
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: noBorder,
                        children: partyBlock('Bill To', data.buyer),
                    }),
                ],
            }),
        ],
    });

    // Integrity notes
    const integrityParagraphs: any[] = [];
    if (data._integrity?.issues && data._integrity.issues.length > 0) {
        integrityParagraphs.push(
            new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: '⚠ INTEGRITY NOTES', size: 16, font: 'Arial', bold: true, color: '92400e', allCaps: true })] }),
            ...data._integrity.issues.map(issue => new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: issue, size: 18, font: 'Arial', color: '92400e' })],
            })),
        );
    }

    const doc = new Document({
        sections: [{
            children: [
                // Title
                new Paragraph({
                    spacing: { after: 40 },
                    children: [new TextRun({ text: 'INVOICE', size: 44, font: 'Arial', bold: true })],
                }),
                new Paragraph({
                    spacing: { after: 200 },
                    border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: '1a1a1a' } },
                    children: [new TextRun({ text: data.template_id || 'Standard Template', size: 18, font: 'Arial', color: '888888' })],
                }),
                // Meta
                metaTable,
                new Paragraph({ spacing: { before: 100, after: 100 }, border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e5e5e5' } }, children: [] }),
                // Parties
                partyTable,
                new Paragraph({ spacing: { before: 100, after: 100 }, border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e5e5e5' } }, children: [] }),
                // Items
                new Paragraph({ spacing: { before: 100, after: 60 }, children: [new TextRun({ text: 'LINE ITEMS', size: 16, font: 'Arial', bold: true, color: '888888', allCaps: true })] }),
                itemsTable,
                // Totals
                ...totalLines,
                // Integrity
                ...integrityParagraphs,
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${data.invoice_number || 'invoice'}.docx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
