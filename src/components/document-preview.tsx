'use client';

/**
 * Unified Document Preview Components
 * Renders rich in-UI previews for all 5 supported template types.
 * Visual language is consistent across all templates.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Shared primitives ────────────────────────────────────────────────────────

function MetaLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            {children}
        </p>
    );
}

function MetaValue({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
    return (
        <p className={cn('text-sm font-semibold text-foreground', mono && 'font-mono text-base font-black')}>
            {children}
        </p>
    );
}

function PartyBlock({ label, name, address, phone, email }: {
    label: string; name?: string; address?: string; phone?: string; email?: string;
}) {
    return (
        <div className="px-5 py-4">
            <MetaLabel>{label}</MetaLabel>
            <p className="font-bold text-sm text-foreground">{name || '—'}</p>
            {address && <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{address}</p>}
            {phone && <p className="text-[11px] mt-2 text-foreground">{phone}</p>}
            {email && <p className="text-[11px] text-muted-foreground break-all">{email}</p>}
        </div>
    );
}

function TwoColMeta({ pairs }: { pairs: [string, string, boolean?][] }) {
    // pairs: [label, value, mono?]
    return (
        <div className={cn('grid border-b border-border', pairs.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
            {pairs.map(([lbl, val, mono], i) => (
                <div key={lbl} className={cn('px-5 py-4', i === 0 && pairs.length > 1 && 'border-r border-border')}>
                    <MetaLabel>{lbl}</MetaLabel>
                    <MetaValue mono={mono}>{val || '—'}</MetaValue>
                </div>
            ))}
        </div>
    );
}

function ItemsTable({ items, cols }: {
    items: any[];
    /** [header, key, align?] */
    cols: [string, string, 'right'?][];
}) {
    const colStyle = (align?: 'right') =>
        cn('text-right font-mono text-muted-foreground', !align && 'text-left font-medium text-foreground');

    const gridCols: Record<number, string> = {
        2: 'grid-cols-[1fr_80px]',
        3: 'grid-cols-[1fr_70px_80px]',
        4: 'grid-cols-[1fr_60px_80px_80px]',
    };
    const grid = gridCols[cols.length] ?? 'grid-cols-2';

    return (
        <div>
            <div className={cn('grid px-5 py-2 border-b border-border bg-muted/30 text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground', grid)}>
                {cols.map(([h, , a]) => (
                    <span key={h} className={a === 'right' ? 'text-right' : ''}>{h}</span>
                ))}
            </div>
            {items.length > 0 ? items.map((item: any, i: number) => (
                <div
                    key={i}
                    className={cn('grid px-5 py-3 border-b border-border/30 text-sm hover:bg-muted/10 transition-colors', grid)}
                >
                    {cols.map(([, key, align], ci) => (
                        <span key={ci} className={cn(align === 'right' ? 'text-right font-mono text-muted-foreground' : 'font-medium text-foreground pr-3', ci === cols.length - 1 && align === 'right' && 'text-foreground font-bold')}>
                            {item?.[key] ?? (key === 'description' ? `Item ${i + 1}` : '—')}
                        </span>
                    ))}
                </div>
            )) : (
                <div className="px-5 py-6 text-center text-xs text-muted-foreground">No line items</div>
            )}
        </div>
    );
}

function TotalsBlock({ rows, currency, total }: {
    rows: [string, any, 'discount'?][];
    currency?: string;
    total: any;
}) {
    return (
        <div className="px-5 py-5">
            <div className="ml-auto w-full max-w-[280px] space-y-1.5">
                {rows.map(([lbl, val, variant]) => (
                    <div key={lbl} className="flex justify-between text-[12px] text-muted-foreground">
                        <span>{lbl}</span>
                        <span className={cn('font-mono', variant === 'discount' && 'text-emerald-600')}>
                            {variant === 'discount' ? `-${val}` : (val ?? '—')}
                        </span>
                    </div>
                ))}
                <div className="border-t-2 border-foreground pt-3 mt-2">
                    <div className="flex justify-between items-baseline">
                        <span className="text-sm font-black uppercase tracking-tight">Total Due</span>
                        <span className="text-xl font-black font-mono text-foreground">
                            {currency} {total ?? '—'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DocFooter({ number, current, total }: { number: string; current: number; total: number }) {
    return (
        <div className="flex items-center justify-between px-5 py-2 border-t border-border bg-muted/20 text-[9px] text-muted-foreground">
            <span>{number}</span>
            <span className="font-mono">Page {current + 1} of {total}</span>
        </div>
    );
}

function IntegrityBox({ issues }: { issues?: string[] }) {
    if (!issues?.length) return null;
    return (
        <div className="border-t border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-5 py-4 text-[11px] text-amber-800 dark:text-amber-200">
            <p className="font-bold uppercase tracking-wider text-[9px] mb-2 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" /> Integrity Notes
            </p>
            <ul className="list-disc pl-4 space-y-1">
                {issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
        </div>
    );
}

function PageNav({
    currentPage, totalPages, onPrev, onNext, onGoto,
}: {
    currentPage: number; totalPages: number;
    onPrev: () => void; onNext: () => void; onGoto: (i: number) => void;
}) {
    if (totalPages <= 1) return null;
    return (
        <div className="flex items-center justify-between">
            <button type="button" disabled={currentPage === 0} onClick={onPrev}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <div className="flex items-center gap-1.5">
                {Array.from({ length: totalPages }).map((_, i) => (
                    <button key={i} type="button" onClick={() => onGoto(i)}
                        className={cn('h-2 rounded-full transition-all duration-200',
                            i === currentPage ? 'w-6 bg-foreground' : 'w-2 bg-border hover:bg-muted-foreground/50')} />
                ))}
            </div>
            <button type="button" disabled={currentPage === totalPages - 1} onClick={onNext}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

// ─── Invoice Preview ──────────────────────────────────────────────────────────

function InvoicePreview({ data }: { data: any }) {
    const [page, setPage] = useState(0);

    const allItems: any[] = Array.isArray(data?.items) ? data.items : [];
    const ITEMS_P1 = 5; const ITEMS_PN = 12;
    type PG = { items: any[]; offset: number; isFirst: boolean; isLast: boolean };
    const pages: PG[] = [];
    if (allItems.length === 0) {
        pages.push({ items: [], offset: 0, isFirst: true, isLast: true });
    } else {
        pages.push({ items: allItems.slice(0, ITEMS_P1), offset: 0, isFirst: true, isLast: false });
        let off = ITEMS_P1;
        while (off < allItems.length) {
            pages.push({ items: allItems.slice(off, off + ITEMS_PN), offset: off, isFirst: false, isLast: false });
            off += ITEMS_PN;
        }
        pages[pages.length - 1].isLast = true;
        if (pages.length === 1) pages[0].isLast = true;
    }
    const totalPages = pages.length;
    const cp = Math.max(0, Math.min(page, totalPages - 1));
    const pg = pages[cp];

    const totals = data?.totals || {};
    const seller = data?.seller && typeof data.seller === 'object' ? data.seller : {};
    const buyer = data?.buyer && typeof data.buyer === 'object' ? data.buyer : {};
    const sub = totals.subtotal ?? allItems.reduce((s: number, i: any) => s + (Number(i?.line_total) || 0), 0);
    const tax = totals.tax_amount ?? 0;
    const disc = totals.discount ?? 0;
    const tot = totals.total_amount ?? (typeof sub === 'number' ? sub + Number(tax) - Number(disc) : null);
    const currency = data?.currency || totals?.currency || '';
    const dueDate = data?.due_date || totals?.due_date;
    const paymentTerms = data?.payment_terms || totals?.payment_terms;
    const sellerName = seller?.name || data?.seller_name || data?.vendor_name || data?.company_name;
    const sellerAddress = seller?.address || data?.seller_address || data?.vendor_address || data?.company_address;
    const sellerPhone = seller?.phone || data?.seller_phone || data?.vendor_phone || data?.company_phone;
    const sellerEmail = seller?.email || data?.seller_email || data?.vendor_email || data?.company_email;
    const buyerName = buyer?.name || data?.buyer_name || data?.client_name || data?.customer_name;
    const buyerAddress = buyer?.address || data?.buyer_address || data?.client_address || data?.customer_address;
    const buyerPhone = buyer?.phone || data?.buyer_phone || data?.client_phone || data?.customer_phone;
    const buyerEmail = buyer?.email || data?.buyer_email || data?.client_email || data?.customer_email;

    const totRows: [string, any, 'discount'?][] = [
        ['Subtotal', sub], ['Tax', tax ?? '0'],
        ...(disc && disc !== 0 ? [['Discount', disc, 'discount'] as [string, any, 'discount']] : []),
    ];

    return (
        <div className="space-y-3">
            <PageNav currentPage={cp} totalPages={totalPages}
                onPrev={() => setPage(p => Math.max(0, p - 1))}
                onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                onGoto={setPage} />

            <section className="border border-border bg-background shadow-lg">
                {pg.isFirst ? (
                    <>
                        {/* Header */}
                        <div className="border-b border-border px-5 py-5">
                            <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Invoice</h3>
                        </div>
                        {/* Meta */}
                        <TwoColMeta pairs={[
                            ['Invoice Number', data?.invoice_number, true],
                            ['Currency', currency],
                        ]} />
                        <TwoColMeta pairs={[
                            ['Date', data?.date],
                            ['Due Date', dueDate],
                        ]} />
                        {/* Parties */}
                        <div className="grid grid-cols-2 border-b border-border">
                            <div className="border-r border-border">
                                <PartyBlock label="From" name={sellerName} address={sellerAddress}
                                    phone={sellerPhone} email={sellerEmail} />
                            </div>
                            <PartyBlock label="Bill To" name={buyerName} address={buyerAddress}
                                phone={buyerPhone} email={buyerEmail} />
                        </div>
                    </>
                ) : (
                    <div className="border-b border-border px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="text-sm font-black uppercase tracking-tight">Invoice</h3>
                            <span className="text-[11px] font-mono text-muted-foreground">{data?.invoice_number}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground italic">Continued</span>
                    </div>
                )}

                <div className={pg.isLast && pg.items.length > 0 ? 'border-b border-border' : ''}>
                    <ItemsTable items={pg.items.map((it, i) => ({ ...it, _idx: pg.offset + i }))}
                        cols={[['Description', 'description'], ['Qty', 'quantity', 'right'], ['Rate', 'unit_price', 'right'], ['Amount', 'line_total', 'right']]} />
                </div>

                {pg.isLast && <TotalsBlock rows={totRows} currency={currency} total={tot} />}
                {pg.isLast && (
                    (paymentTerms || data?.bank_details || data?.notes) ? (
                        <div className="border-t border-border px-5 py-4 space-y-3">
                            {paymentTerms && (
                                <div>
                                    <MetaLabel>Payment Terms</MetaLabel>
                                    <p className="text-sm text-foreground">{String(paymentTerms)}</p>
                                </div>
                            )}
                            {data.bank_details && (
                                <div>
                                    <MetaLabel>Bank Details</MetaLabel>
                                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                        {Array.isArray(data.bank_details) ? data.bank_details.map((v: any) => String(v)).join('\n') : String(data.bank_details)}
                                    </p>
                                </div>
                            )}
                            {data.notes && (
                                <div>
                                    <MetaLabel>Notes</MetaLabel>
                                    {Array.isArray(data.notes) ? (
                                        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                                            {data.notes.map((note: any, idx: number) => (
                                                <li key={`inv_note_${idx}`}>{String(note)}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">{String(data.notes)}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : null
                )}
                {pg.isLast && <IntegrityBox issues={data?._integrity?.issues} />}
                <DocFooter number={data?.invoice_number || 'Invoice'} current={cp} total={totalPages} />
            </section>

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button type="button" disabled={cp === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
                        className="h-8 w-8 flex items-center justify-center border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-[11px] font-mono text-muted-foreground px-2">{cp + 1} / {totalPages}</span>
                    <button type="button" disabled={cp === totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        className="h-8 w-8 flex items-center justify-center border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Purchase Order Preview ───────────────────────────────────────────────────

function PurchaseOrderPreview({ data }: { data: any }) {
    const [page, setPage] = useState(0);

    const allItems: any[] = Array.isArray(data?.items) ? data.items : [];
    const ITEMS_P1 = 7; const ITEMS_PN = 14;
    type PG = { items: any[]; offset: number; isFirst: boolean; isLast: boolean };
    const pages: PG[] = [];
    if (allItems.length === 0) {
        pages.push({ items: [], offset: 0, isFirst: true, isLast: true });
    } else {
        pages.push({ items: allItems.slice(0, ITEMS_P1), offset: 0, isFirst: true, isLast: false });
        let off = ITEMS_P1;
        while (off < allItems.length) {
            pages.push({ items: allItems.slice(off, off + ITEMS_PN), offset: off, isFirst: false, isLast: false });
            off += ITEMS_PN;
        }
        pages[pages.length - 1].isLast = true;
        if (pages.length === 1) pages[0].isLast = true;
    }
    const totalPages = pages.length;
    const cp = Math.max(0, Math.min(page, totalPages - 1));
    const pg = pages[cp];

    const totals = data?.totals || {};
    const currency = data?.currency || '';
    const deliveryDate = data?.delivery_date ?? totals?.delivery_date ?? null;
    const buyer = data?.buyer || {};
    const vendor = data?.vendor || {};
    const buyerContact = buyer?.contact || {};
    const vendorContact = vendor?.contact || {};
    const sub = totals.subtotal ?? allItems.reduce((s: number, i: any) => s + (Number(i?.line_total) || 0), 0);
    const tax = totals.tax_amount ?? 0;
    const ship = totals.shipping_cost ?? data?.shipping_cost ?? 0;
    const tot = totals.total_amount ?? (typeof sub === 'number' ? Number(sub) + Number(tax) + Number(ship) : null);

    const totRows: [string, any, 'discount'?][] = [
        ['Subtotal', sub], ['Tax', tax],
        ...(ship ? [['Shipping', ship] as [string, any]] : []),
    ];

    return (
        <div className="space-y-3">
            <PageNav currentPage={cp} totalPages={totalPages}
                onPrev={() => setPage(p => Math.max(0, p - 1))}
                onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                onGoto={setPage} />

            <section className="border border-border bg-background shadow-lg">
                {pg.isFirst ? (
                    <>
                        <div className="border-b border-border px-5 py-5">
                            <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Purchase Order</h3>
                        </div>
                        <TwoColMeta pairs={[
                            ['PO Number', data?.po_number, true],
                            ['Currency', currency],
                        ]} />
                        <TwoColMeta pairs={[
                            ['Date', data?.date],
                            ['Delivery Date', deliveryDate],
                        ]} />
                        <div className="grid grid-cols-2 border-b border-border">
                            <div className="border-r border-border">
                                <PartyBlock
                                    label="Buyer"
                                    name={buyer?.name || data?.buyer_name}
                                    address={buyer?.address || data?.buyer_address}
                                    phone={buyer?.phone || buyerContact?.phone}
                                    email={buyer?.email || buyerContact?.email}
                                />
                            </div>
                            <PartyBlock
                                label="Vendor"
                                name={vendor?.name || data?.vendor_name}
                                address={vendor?.address || data?.vendor_address}
                                phone={vendor?.phone || vendorContact?.phone}
                                email={vendor?.email || vendorContact?.email}
                            />
                        </div>
                    </>
                ) : (
                    <div className="border-b border-border px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="text-sm font-black uppercase tracking-tight">Purchase Order</h3>
                            <span className="text-[11px] font-mono text-muted-foreground">{data?.po_number}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground italic">Continued</span>
                    </div>
                )}

                <div className={pg.isLast && pg.items.length > 0 ? 'border-b border-border' : ''}>
                    <ItemsTable items={pg.items}
                        cols={[['Description', 'description'], ['Qty', 'quantity', 'right'], ['Unit Price', 'unit_price', 'right'], ['Total', 'line_total', 'right']]} />
                </div>

                {pg.isLast && (
                    <>
                        <TotalsBlock rows={totRows} currency={currency} total={tot} />
                        {(data?.payment_terms || data?.shipping_method || data?.authorized_by || data?.notes) && (
                            <div className="border-t border-border px-5 py-4 space-y-3">
                                {data.payment_terms && (
                                    <div><MetaLabel>Payment Terms</MetaLabel><p className="text-sm text-foreground">{data.payment_terms}</p></div>
                                )}
                                {data.shipping_method && (
                                    <div><MetaLabel>Shipping Method</MetaLabel><p className="text-sm text-foreground">{data.shipping_method}</p></div>
                                )}
                                {data.authorized_by && (
                                    <div><MetaLabel>Authorized By</MetaLabel><p className="text-sm font-semibold text-foreground">{data.authorized_by}</p></div>
                                )}
                                {data.notes && (
                                    <div>
                                        <MetaLabel>Notes</MetaLabel>
                                        {Array.isArray(data.notes) ? (
                                            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                                                {data.notes.map((note: any, idx: number) => (
                                                    <li key={`po_note_${idx}`}>{String(note)}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">{String(data.notes)}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
                <DocFooter number={data?.po_number || 'Purchase Order'} current={cp} total={totalPages} />
            </section>
        </div>
    );
}

// ─── Receipt Preview ──────────────────────────────────────────────────────────

function ReceiptPreview({ data }: { data: any }) {
    const currency = data?.currency || '';
    const amount = data?.amount ?? '—';

    return (
        <section className="border border-border bg-background shadow-lg">
            {/* Header */}
            <div className="border-b border-border px-5 py-5">
                <div className="flex items-start justify-between">
                    <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Receipt</h3>
                    {data?.payment_method && (
                        <span className="text-[10px] font-bold uppercase tracking-wider border border-border px-2 py-0.5 text-muted-foreground">
                            {data.payment_method}
                        </span>
                    )}
                </div>
            </div>

            {/* Receipt # + Date */}
            <TwoColMeta pairs={[
                ['Receipt Number', data?.receipt_number, true],
                ['Date', data?.date],
            ]} />

            {/* Received from / by */}
            {(data?.received_from || data?.received_by) && (
                <div className={cn('grid border-b border-border', data?.received_by ? 'grid-cols-2' : 'grid-cols-1')}>
                    {data?.received_from && (
                        <div className={cn('px-5 py-4', data?.received_by && 'border-r border-border')}>
                            <MetaLabel>Received From</MetaLabel>
                            <p className="text-sm font-bold text-foreground">{data.received_from}</p>
                        </div>
                    )}
                    {data?.received_by && (
                        <div className="px-5 py-4">
                            <MetaLabel>Received By</MetaLabel>
                            <p className="text-sm font-bold text-foreground">{data.received_by}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Amount block — hero */}
            <div className="border-b border-border px-5 py-6 bg-muted/20">
                <MetaLabel>Amount Received</MetaLabel>
                <p className="text-3xl font-black font-mono text-foreground mt-1">
                    {currency} {amount}
                </p>
            </div>

            {/* Reference + Description */}
            {(data?.reference_number || data?.description) && (
                <div className="border-b border-border px-5 py-4 space-y-3">
                    {data.reference_number && (
                        <div>
                            <MetaLabel>Reference Number</MetaLabel>
                            <p className="text-sm font-mono font-bold text-foreground">{data.reference_number}</p>
                        </div>
                    )}
                    {data.description && (
                        <div>
                            <MetaLabel>Description</MetaLabel>
                            <p className="text-sm text-foreground">{data.description}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Balance due */}
            {data?.balance_due !== undefined && data?.balance_due !== null && (
                <div className="border-b border-border px-5 py-4 flex items-center justify-between">
                    <MetaLabel>Balance Due</MetaLabel>
                    <p className="text-base font-black font-mono text-foreground">
                        {currency} {data.balance_due}
                    </p>
                </div>
            )}

            {(data?.status || data?.previous_balance !== undefined) && (
                <div className="border-b border-border px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {data?.status && (
                        <div>
                            <MetaLabel>Status</MetaLabel>
                            <p className="text-sm font-semibold text-foreground">{String(data.status)}</p>
                        </div>
                    )}
                    {data?.previous_balance !== undefined && data?.previous_balance !== null && (
                        <div>
                            <MetaLabel>Previous Balance</MetaLabel>
                            <p className="text-sm font-mono text-foreground">{currency} {String(data.previous_balance)}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Notes */}
            {data?.notes && (
                <div className="border-b border-border px-5 py-4">
                    <MetaLabel>Notes</MetaLabel>
                    {Array.isArray(data.notes) ? (
                        <ul className="text-xs text-muted-foreground mt-1 space-y-1 list-disc pl-4">
                            {data.notes.map((note: any, idx: number) => (
                                <li key={`rec_note_${idx}`}>{String(note)}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-muted-foreground mt-1">{String(data.notes)}</p>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-2 border-t border-border bg-muted/20 text-[9px] text-muted-foreground">
                <span>{data?.receipt_number || 'Receipt'}</span>
                <span className="font-mono">Page 1 of 1</span>
            </div>
        </section>
    );
}

// ─── Quotation Preview ────────────────────────────────────────────────────────

function QuotationPreview({ data }: { data: any }) {
    const [page, setPage] = useState(0);

    const allItems: any[] = Array.isArray(data?.items) ? data.items : [];
    const ITEMS_P1 = 6; const ITEMS_PN = 14;
    type PG = { items: any[]; offset: number; isFirst: boolean; isLast: boolean };
    const pages: PG[] = [];
    if (allItems.length === 0) {
        pages.push({ items: [], offset: 0, isFirst: true, isLast: true });
    } else {
        pages.push({ items: allItems.slice(0, ITEMS_P1), offset: 0, isFirst: true, isLast: false });
        let off = ITEMS_P1;
        while (off < allItems.length) {
            pages.push({ items: allItems.slice(off, off + ITEMS_PN), offset: off, isFirst: false, isLast: false });
            off += ITEMS_PN;
        }
        pages[pages.length - 1].isLast = true;
        if (pages.length === 1) pages[0].isLast = true;
    }
    const totalPages = pages.length;
    const cp = Math.max(0, Math.min(page, totalPages - 1));
    const pg = pages[cp];

    const totals = data?.totals || {};
    const currency = data?.currency || '';
    const fromParty = data?.company || data?.seller || {};
    const clientParty = data?.client || {};
    const fromContact = fromParty?.contact || {};
    const clientContact = clientParty?.contact || {};
    const sub = totals.subtotal ?? allItems.reduce((s: number, i: any) => s + (Number(i?.line_total) || 0), 0);
    const tax = totals.tax_amount ?? 0;
    const disc = totals.discount ?? 0;
    const tot = totals.total_amount ?? (typeof sub === 'number' ? Number(sub) + Number(tax) - Number(disc) : null);

    const totRows: [string, any, 'discount'?][] = [
        ['Subtotal', sub], ['Tax', tax],
        ...(disc && disc !== 0 ? [['Discount', disc, 'discount'] as [string, any, 'discount']] : []),
    ];

    return (
        <div className="space-y-3">
            <PageNav currentPage={cp} totalPages={totalPages}
                onPrev={() => setPage(p => Math.max(0, p - 1))}
                onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                onGoto={setPage} />

            <section className="border border-border bg-background shadow-lg">
                {pg.isFirst ? (
                    <>
                        <div className="border-b border-border px-5 py-5 flex items-start justify-between">
                            <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Quotation</h3>
                            {data?.valid_until && (
                                <div className="text-right">
                                    <MetaLabel>Valid Until</MetaLabel>
                                    <p className="text-sm font-semibold text-foreground">{data.valid_until}</p>
                                </div>
                            )}
                        </div>
                        <TwoColMeta pairs={[
                            ['Quote Number', data?.quote_number, true],
                            ['Date', data?.date],
                        ]} />
                        {currency && (
                            <div className="border-b border-border px-5 py-3">
                                <MetaLabel>Currency</MetaLabel>
                                <MetaValue>{currency}</MetaValue>
                            </div>
                        )}
                        <div className="grid grid-cols-2 border-b border-border">
                            <div className="border-r border-border">
                                <PartyBlock
                                    label="From"
                                    name={fromParty?.name || data?.company_name}
                                    address={fromParty?.address || data?.company_address}
                                    phone={fromParty?.phone || fromContact?.phone}
                                    email={fromParty?.email || fromContact?.email}
                                />
                            </div>
                            <PartyBlock
                                label="Prepared For"
                                name={clientParty?.name || data?.client_name}
                                address={clientParty?.address || data?.client_address}
                                phone={clientParty?.phone || clientContact?.phone}
                                email={clientParty?.email || clientContact?.email}
                            />
                        </div>
                    </>
                ) : (
                    <div className="border-b border-border px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="text-sm font-black uppercase tracking-tight">Quotation</h3>
                            <span className="text-[11px] font-mono text-muted-foreground">{data?.quote_number}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground italic">Continued</span>
                    </div>
                )}

                <div className={pg.isLast && pg.items.length > 0 ? 'border-b border-border' : ''}>
                    <ItemsTable items={pg.items}
                        cols={[['Description', 'description'], ['Qty', 'quantity', 'right'], ['Unit Price', 'unit_price', 'right'], ['Total', 'line_total', 'right']]} />
                </div>

                {pg.isLast && (
                    <>
                        <TotalsBlock rows={totRows} currency={currency} total={tot} />
                        {(data?.terms_and_conditions || data?.notes || data?.prepared_by) && (
                            <div className="border-t border-border px-5 py-4 space-y-3">
                                {data.terms_and_conditions && (
                                    <div>
                                        <MetaLabel>Terms & Conditions</MetaLabel>
                                        {Array.isArray(data.terms_and_conditions) ? (
                                            <ul className="text-xs text-muted-foreground mt-1 leading-relaxed space-y-1 list-disc pl-4">
                                                {data.terms_and_conditions.map((t: any, idx: number) => (
                                                    <li key={`quote_term_${idx}`}>{String(t)}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{String(data.terms_and_conditions)}</p>
                                        )}
                                    </div>
                                )}
                                {data.notes && (
                                    <div>
                                        <MetaLabel>Notes</MetaLabel>
                                        {Array.isArray(data.notes) ? (
                                            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                                                {data.notes.map((note: any, idx: number) => (
                                                    <li key={`quote_note_${idx}`}>{String(note)}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">{String(data.notes)}</p>
                                        )}
                                    </div>
                                )}
                                {data.prepared_by && (
                                    <div>
                                        <MetaLabel>Prepared By</MetaLabel>
                                        <p className="text-sm font-semibold">{data.prepared_by}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
                <DocFooter number={data?.quote_number || 'Quotation'} current={cp} total={totalPages} />
            </section>
        </div>
    );
}

// ─── Delivery Note Preview ────────────────────────────────────────────────────

function DeliveryNotePreview({ data }: { data: any }) {
    const [page, setPage] = useState(0);

    const allItems: any[] = Array.isArray(data?.items) ? data.items : [];
    const ITEMS_P1 = 8; const ITEMS_PN = 16;
    type PG = { items: any[]; offset: number; isFirst: boolean; isLast: boolean };
    const pages: PG[] = [];
    if (allItems.length === 0) {
        pages.push({ items: [], offset: 0, isFirst: true, isLast: true });
    } else {
        pages.push({ items: allItems.slice(0, ITEMS_P1), offset: 0, isFirst: true, isLast: false });
        let off = ITEMS_P1;
        while (off < allItems.length) {
            pages.push({ items: allItems.slice(off, off + ITEMS_PN), offset: off, isFirst: false, isLast: false });
            off += ITEMS_PN;
        }
        pages[pages.length - 1].isLast = true;
        if (pages.length === 1) pages[0].isLast = true;
    }
    const totalPages = pages.length;
    const cp = Math.max(0, Math.min(page, totalPages - 1));
    const pg = pages[cp];
    const sender = data?.sender || {};
    const receiver = data?.receiver || {};
    const senderContact = sender?.contact || {};
    const receiverContact = receiver?.contact || {};

    return (
        <div className="space-y-3">
            <PageNav currentPage={cp} totalPages={totalPages}
                onPrev={() => setPage(p => Math.max(0, p - 1))}
                onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                onGoto={setPage} />

            <section className="border border-border bg-background shadow-lg">
                {pg.isFirst ? (
                    <>
                        <div className="border-b border-border px-5 py-5">
                            <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Delivery Note</h3>
                        </div>
                        <TwoColMeta pairs={[
                            ['Delivery Note #', data?.delivery_note_number, true],
                            ['Date', data?.date],
                        ]} />
                        {data?.order_reference && (
                            <div className="border-b border-border px-5 py-3">
                                <MetaLabel>Order Reference</MetaLabel>
                                <MetaValue mono>{data.order_reference}</MetaValue>
                            </div>
                        )}
                        <div className="grid grid-cols-2 border-b border-border">
                            <div className="border-r border-border">
                                <PartyBlock
                                    label="Sender"
                                    name={sender?.name || data?.sender_name}
                                    address={sender?.address || data?.sender_address}
                                    phone={sender?.phone || senderContact?.phone}
                                    email={sender?.email || senderContact?.email}
                                />
                            </div>
                            <PartyBlock
                                label="Receiver"
                                name={receiver?.name || data?.receiver_name}
                                address={receiver?.address || data?.receiver_address}
                                phone={receiver?.phone || receiverContact?.phone}
                                email={receiver?.email || receiverContact?.email}
                            />
                        </div>
                    </>
                ) : (
                    <div className="border-b border-border px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="text-sm font-black uppercase tracking-tight">Delivery Note</h3>
                            <span className="text-[11px] font-mono text-muted-foreground">{data?.delivery_note_number}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground italic">Continued</span>
                    </div>
                )}

                {/* Items — no price columns for delivery notes */}
                <ItemsTable items={pg.items}
                    cols={[['Description', 'description'], ['Qty', 'quantity', 'right'], ['Unit', 'unit']]} />

                {pg.isLast && (
                    <>
                        {/* Shipment meta */}
                        {(data?.total_packages || data?.weight || data?.shipping_method || data?.driver_name) && (
                            <div className="border-t border-border px-5 py-4 grid grid-cols-2 gap-4">
                                {data.total_packages && (
                                    <div><MetaLabel>Total Packages</MetaLabel><MetaValue>{data.total_packages}</MetaValue></div>
                                )}
                                {data.weight && (
                                    <div><MetaLabel>Weight</MetaLabel><MetaValue>{data.weight}</MetaValue></div>
                                )}
                                {data.shipping_method && (
                                    <div><MetaLabel>Shipping Method</MetaLabel><MetaValue>{data.shipping_method}</MetaValue></div>
                                )}
                                {data.driver_name && (
                                    <div><MetaLabel>Driver</MetaLabel><MetaValue>{data.driver_name}</MetaValue></div>
                                )}
                            </div>
                        )}

                        {/* Signature line */}
                        <div className="border-t border-border px-5 py-5 flex items-end justify-between">
                            <div>
                                <MetaLabel>Received By (Signature)</MetaLabel>
                                <div className="mt-6 border-b border-foreground/30 w-40" />
                            </div>
                            <div className="text-right">
                                <MetaLabel>Date</MetaLabel>
                                <div className="mt-6 border-b border-foreground/30 w-28" />
                            </div>
                        </div>

                        {data?.received_by_signature && (
                            <div className="border-t border-border px-5 py-4">
                                <MetaLabel>Signature/Receipt Reference</MetaLabel>
                                <p className="text-xs text-muted-foreground mt-1">{String(data.received_by_signature)}</p>
                            </div>
                        )}

                        {data?.notes && (
                            <div className="border-t border-border px-5 py-4">
                                <MetaLabel>Notes</MetaLabel>
                                {Array.isArray(data.notes) ? (
                                    <ul className="text-xs text-muted-foreground mt-1 space-y-1 list-disc pl-4">
                                        {data.notes.map((note: any, idx: number) => (
                                            <li key={`dn_note_${idx}`}>{String(note)}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-muted-foreground mt-1">{String(data.notes)}</p>
                                )}
                            </div>
                        )}
                    </>
                )}

                <DocFooter number={data?.delivery_note_number || 'Delivery Note'} current={cp} total={totalPages} />
            </section>
        </div>
    );
}

// ─── Unified Dispatcher ───────────────────────────────────────────────────────

export type SupportedTemplateType =
    | 'invoice'
    | 'purchase_order'
    | 'receipt'
    | 'quotation'
    | 'delivery_note';

interface DocumentPreviewProps {
    templateType: SupportedTemplateType;
    data: Record<string, any>;
}

export function DocumentPreview({ templateType, data }: DocumentPreviewProps) {
    switch (templateType) {
        case 'invoice': return <InvoicePreview data={data} />;
        case 'purchase_order': return <PurchaseOrderPreview data={data} />;
        case 'receipt': return <ReceiptPreview data={data} />;
        case 'quotation': return <QuotationPreview data={data} />;
        case 'delivery_note': return <DeliveryNotePreview data={data} />;
        default: return null;
    }
}
