'use client';

import { useRef, useEffect, useState } from 'react';

/**
 * HtmlDocumentPreview — renders a Jinja2/HTML template with document data.
 *
 * Renders inside a sandboxed iframe so the template's CSS can't affect the app.
 * Primary path: asks pyserver to render HTML using real Jinja2 (same as PDF v2).
 * Fallback path: uses a minimal in-browser parser if backend render is unavailable.
 *
 * If htmlTemplate is not provided, pyserver can still resolve a built-in or
 * generic fallback template when `templateType` is supplied.
 * This component never crashes; it always provides a readable fallback.
 */

export interface HtmlDocumentPreviewBranding {
    primary_color?: string;
    accent_color?: string;
    font_family?: string;
    logo_url?: string | null;
}

export interface HtmlDocumentPreviewProps {
    /** Canonical template key when known (preferred over shape inference) */
    templateType?: string;
    /** Jinja2 HTML template string (from DB rendering.html_template) */
    htmlTemplate: string;
    /** Extra CSS to inject on top of template-embedded styles */
    css?: string | null;
    /** The raw document data object (same JSON the AI writer produced) */
    data: Record<string, any>;
    /** Branding overrides from DB template rendering.branding */
    branding?: HtmlDocumentPreviewBranding | null;
    className?: string;
}

// ─── Minimal Jinja2-compatible client-side renderer ──────────────────────────
//
// We support the subset of Jinja2 used in _INVOICE_DEFAULT_HTML_TEMPLATE:
//   {{ var }}              simple variable substitution
//   {{ obj.key }}          nested property access
//   {{ var | default(x) }} default filter
//   {% if expr %}...{% endif %}   conditionals
//   {% for item in list %}...{% endfor %}   loops (with loop.index)
//   {% if x is iterable and x is not string %}   type checks
//
// This is intentionally NOT a full Jinja2 engine. For complex templates, use
// server-rendered HTML from /document/html/render.

function resolveVar(path: string, ctx: Record<string, any>): any {
    const parts = path.trim().split('.');
    let cur: any = ctx;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return cur;
}

function applyFilters(value: any, filters: string[], ctx: Record<string, any>): string {
    let v = value;
    for (const filter of filters) {
        const defaultMatch = filter.match(/^default\(['"]?(.*?)['"]?\)$/);
        if (defaultMatch) {
            if (v == null || v === '' || v === undefined) v = defaultMatch[1];
            continue;
        }
        if (filter === 'join("\\n")' || filter === "join('\\n')") {
            if (Array.isArray(v)) v = v.join('\n');
            continue;
        }
    }
    if (v == null) return '';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
}

function renderJinja(template: string, ctx: Record<string, any>): string {
    let result = template;

    // ── {% for item in list %} ... {% endfor %} ──────────────────────────────
    result = result.replace(
        /\{%[-\s]*for\s+(\w+)\s+in\s+([\w.]+)\s*[-]?%\}([\s\S]*?)\{%[-\s]*endfor\s*[-]?%\}/g,
        (_, itemVar, listPath, body) => {
            const list = resolveVar(listPath, ctx);
            if (!Array.isArray(list) || list.length === 0) return '';
            return list
                .map((item, idx) => {
                    const loopCtx = { ...ctx, [itemVar]: item, loop: { index: idx + 1, index0: idx } };
                    // Recurse for nested expressions inside the loop body
                    return renderJinja(body, loopCtx);
                })
                .join('');
        }
    );

    // ── {% if expr %}...{% elif / else %}...{% endif %} ───────────────────────
    result = result.replace(
        /\{%[-\s]*if\s+([\s\S]+?)\s*[-]?%\}([\s\S]*?)\{%[-\s]*endif\s*[-]?%\}/g,
        (_, expr, body) => {
            // Split on {% else %}
            const elseIndex = body.search(/\{%[-\s]*else\s*[-]?%\}/);
            let ifBody = body;
            let elseBody = '';
            if (elseIndex !== -1) {
                ifBody = body.slice(0, elseIndex);
                elseBody = body.slice(elseIndex).replace(/\{%[-\s]*else\s*[-]?%\}/, '');
            }
            return evalJinjaCondition(expr, ctx) ? renderJinja(ifBody, ctx) : renderJinja(elseBody, ctx);
        }
    );

    // ── {{ var | filter }} ────────────────────────────────────────────────────
    result = result.replace(/\{\{\s*([\s\S]+?)\s*\}\}/g, (_, rawExpr) => {
        const parts = rawExpr.split('|').map((s: string) => s.trim());
        const varPath = parts[0];
        const filters = parts.slice(1);

        // Concatenation: "prefix" ~ var  or  var ~ "suffix"
        const concatParts = varPath.split(/\s*~\s*/);
        const resolved = concatParts
            .map((p: string) => {
                const stripped = p.replace(/^['"]|['"]$/g, '');
                if (stripped === p && !p.startsWith('"') && !p.startsWith("'")) {
                    // It's a variable path, not a literal
                    const v = resolveVar(p, ctx);
                    return v ?? '';
                }
                return stripped;
            })
            .join('');

        return applyFilters(resolved !== varPath ? resolved : resolveVar(varPath, ctx), filters, ctx);
    });

    return result;
}

function evalJinjaCondition(expr: string, ctx: Record<string, any>): boolean {
    const e = expr.trim();

    // "x is iterable and x is not string" → is array
    const iterableNotString = e.match(/^(\w[\w.]*)\s+is\s+iterable\s+and\s+\1\s+is\s+not\s+string$/);
    if (iterableNotString) {
        const v = resolveVar(iterableNotString[1], ctx);
        return Array.isArray(v);
    }

    // "and" / "or" compound
    if (/\s+and\s+/.test(e)) return e.split(/\s+and\s+/).every((s) => evalJinjaCondition(s, ctx));
    if (/\s+or\s+/.test(e)) return e.split(/\s+or\s+/).some((s) => evalJinjaCondition(s, ctx));

    // "not expr"
    if (e.startsWith('not ')) return !evalJinjaCondition(e.slice(4), ctx);

    // "x != 0" / "x == val"
    const neq = e.match(/^([\w.]+)\s*!=\s*(.+)$/);
    if (neq) return String(resolveVar(neq[1], ctx)) !== neq[2].replace(/^['"]|['"]$/g, '');
    const eq = e.match(/^([\w.]+)\s*==\s*(.+)$/);
    if (eq) return String(resolveVar(eq[1], ctx)) === eq[2].replace(/^['"]|['"]$/g, '');

    // Simple truthiness: variable path
    const v = resolveVar(e, ctx);
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'number') return v !== 0;
    return !!v;
}

function buildIframeDoc(renderedHtml: string, extraCss?: string | null): string {
    if (!extraCss) return renderedHtml;
    // Inject extra CSS before </head> or at top
    if (renderedHtml.includes('</head>')) {
        return renderedHtml.replace('</head>', `<style>${extraCss}</style></head>`);
    }
    return `<style>${extraCss}</style>${renderedHtml}`;
}

function sanitizePreviewHtml(html: string): string {
    let out = String(html || '');
    // Preview iframe is sandboxed without scripts; strip script blocks to avoid noisy console warnings.
    out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    // Strip javascript: href/src payloads for defense-in-depth in sandboxed preview.
    out = out.replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '');
    return out;
}

function inferTemplateType(data: Record<string, any>): string {
    const candidates = [
        data?.document_type,
        data?.doc_type,
        data?.template_id,
        data?.template_type,
    ];
    for (const raw of candidates) {
        const text = String(raw || '').trim().toLowerCase();
        if (text) return text;
    }
    if (data?.invoice_number) return 'invoice';
    if (data?.po_number || data?.purchase_order_number) return 'purchase_order';
    if (data?.receipt_number) return 'receipt';
    if (data?.quote_number || data?.quotation_number) return 'quotation';
    if (data?.delivery_note_number || data?.delivery_challan_number) return 'delivery_note';
    return 'invoice';
}

function hasUnresolvedTemplateSyntax(html: string): boolean {
    return /\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/.test(String(html || ''));
}

function previewErrorHtml(message: string): string {
    return `<html><body style="font-family:system-ui,sans-serif;padding:20px;color:#b91c1c;background:#fff7f7">
<h3 style="margin:0 0 8px;font-size:16px;">Preview unavailable</h3>
<p style="margin:0;font-size:13px;line-height:1.5;">${message}</p>
</body></html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HtmlDocumentPreview({
    templateType,
    htmlTemplate,
    css,
    data,
    branding,
    className,
}: HtmlDocumentPreviewProps) {
    const [height, setHeight] = useState(600);
    const [srcDoc, setSrcDoc] = useState<string>('');
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        const pyserverUrl = process.env.NEXT_PUBLIC_PYSERVER_URL || 'http://localhost:8010';
        const contextData: Record<string, any> =
            typeof data === 'object' && data !== null ? data : {};
        const resolvedTemplateType = String(templateType || inferTemplateType(contextData) || 'document').trim();

        const applyLegacyFallback = (reason: string) => {
            try {
                const rendered = renderJinja(htmlTemplate, {
                    ...contextData,
                    branding: branding ?? {},
                });
                const built = sanitizePreviewHtml(buildIframeDoc(rendered, css));
                if (!built.trim() || hasUnresolvedTemplateSyntax(built)) {
                    setSrcDoc(previewErrorHtml(`${reason}. The HTML uses Jinja syntax not supported by in-browser preview.`));
                    return;
                }
                setSrcDoc(built);
            } catch {
                setSrcDoc(previewErrorHtml(`${reason}. Please use PDF export for full-fidelity rendering.`));
            }
        };

        (async () => {
            try {
                const response = await fetch(`${pyserverUrl}/document/html/render`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        template_type: resolvedTemplateType,
                        data: contextData,
                        html_template: htmlTemplate,
                        css: css ?? undefined,
                        branding: branding ?? undefined,
                    }),
                    cache: 'no-store',
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error(`Server render failed (${response.status})`);
                }
                const payload = await response.json().catch(() => ({}));
                const renderedHtml = String(payload?.rendered_html || '');
                if (!renderedHtml.trim()) {
                    throw new Error('Server render returned empty HTML');
                }
                setSrcDoc(sanitizePreviewHtml(renderedHtml));
            } catch {
                if (controller.signal.aborted) return;
                applyLegacyFallback('Server HTML preview is unavailable');
            }
        })();

        return () => controller.abort();
    }, [templateType, htmlTemplate, data, branding, css]);

    // Auto-resize iframe to content height so no scroll bars appear in the preview.
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const onLoad = () => {
            try {
                const body = iframe.contentDocument?.body;
                const html = iframe.contentDocument?.documentElement;
                if (body && html) {
                    const h = Math.max(body.scrollHeight, html.scrollHeight, 300);
                    setHeight(h + 32);
                }
            } catch {
                // Cross-origin or sandboxed — keep default height
            }
        };
        iframe.addEventListener('load', onLoad);
        return () => iframe.removeEventListener('load', onLoad);
    }, [srcDoc]);

    return (
        <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            sandbox="allow-same-origin"
            title="Document preview"
            style={{ height: `${height}px` }}
            className={`w-full border-0 block ${className ?? ''}`}
        />
    );
}
