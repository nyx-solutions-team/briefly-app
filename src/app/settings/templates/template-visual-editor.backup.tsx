"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, GripVertical, Type, LayoutTemplate, List, AlignLeft, X, MoveUp, MoveDown, Heading, PenTool, Minus, Calculator, ListTree, FileText, Code2, Check, ChevronsUpDown, MessageSquareWarning, Scissors } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type BlockType = "header" | "heading" | "text" | "table" | "columns" | "spacer" | "signature" | "divider" | "totals" | "key_value" | "terms" | "html" | "page_break" | "callout";

export interface VisualBlock {
    id: string;
    type: BlockType;
    content?: string;
    props?: Record<string, any>;
}

interface TemplateVisualEditorProps {
    initialHtml: string;
    initialCss: string;
    initialBlocks?: VisualBlock[] | null;
    pathSuggestions?: string[];
    readOnly?: boolean;
    readOnlyReason?: string;
    onSave: (html: string, css: string, blocks: VisualBlock[]) => void;
}

function normalizeIncomingBlocks(value: VisualBlock[] | null | undefined): VisualBlock[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((item) => item && typeof item === "object")
        .map((item, idx) => ({
            id: typeof item.id === "string" && item.id.trim() ? item.id : `blk_loaded_${idx + 1}`,
            type: typeof item.type === "string" ? (item.type as BlockType) : "text",
            content: typeof item.content === "string" ? item.content : undefined,
            props: item.props && typeof item.props === "object" && !Array.isArray(item.props) ? item.props : {},
        }));
}

const AVAILABLE_BLOCKS: { type: BlockType; icon: any; label: string }[] = [
    { type: "header", icon: LayoutTemplate, label: "Invoice Header" },
    { type: "heading", icon: Heading, label: "Title / Heading" },
    { type: "text", icon: Type, label: "Text Block" },
    { type: "callout", icon: MessageSquareWarning, label: "Notice Box" },
    { type: "key_value", icon: ListTree, label: "Key-Value Details" },
    { type: "table", icon: List, label: "Data Table" },
    { type: "totals", icon: Calculator, label: "Totals Block" },
    { type: "columns", icon: AlignLeft, label: "Two Columns" },
    { type: "divider", icon: Minus, label: "Divider Line" },
    { type: "spacer", icon: GripVertical, label: "Vertical Spacer" },
    { type: "page_break", icon: Scissors, label: "Page Break" },
    { type: "terms", icon: FileText, label: "Terms & Conditions" },
    { type: "signature", icon: PenTool, label: "Signature Block" },
    { type: "html", icon: Code2, label: "Custom HTML" },
];

function PathCombobox({
    value,
    onChange,
    suggestions,
    placeholder,
    className
}: {
    value: string;
    onChange: (v: string) => void;
    suggestions: string[];
    placeholder?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const list = useMemo(() => Array.from(new Set([...suggestions, value].filter(Boolean))), [suggestions, value]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    title={value || placeholder}
                    className={cn("w-full justify-between h-8 text-[11px] px-2 font-mono text-muted-foreground bg-background hover:bg-muted focus:ring-1 focus:ring-primary/20", className)}
                >
                    {value ? <span className="truncate text-foreground max-w-[150px]">{value}</span> : <span className="truncate opacity-50">{placeholder || "Select field..."}</span>}
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[240px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search or type path..." value={search} onValueChange={setSearch} className="h-8 text-[11px] font-mono" />
                    <CommandList>
                        {search && !list.includes(search) ? (
                            <div className="p-1 border-b border-border/40">
                                <Button variant="ghost" className="w-full justify-start text-[11px] h-8 px-2 text-primary font-mono" onClick={() => { onChange(search); setOpen(false); setSearch(""); }}>
                                    Use "{search}"
                                </Button>
                            </div>
                        ) : null}
                        <CommandEmpty className="py-2 text-center text-[10px] text-muted-foreground">No matches found.</CommandEmpty>
                        <CommandGroup>
                            {list.map((path) => (
                                <CommandItem
                                    key={path}
                                    value={path}
                                    onSelect={() => {
                                        onChange(path);
                                        setOpen(false);
                                        setSearch("");
                                    }}
                                    className="text-[11px] font-mono cursor-pointer"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-3 w-3",
                                            value === path ? "opacity-100 text-primary" : "opacity-0"
                                        )}
                                    />
                                    {path}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

function SmartInput({
    value,
    onChange,
    suggestions,
    placeholder,
    className
}: {
    value: string;
    onChange: (v: string) => void;
    suggestions: string[];
    placeholder?: string;
    className?: string;
}) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const insertVariable = (variable: string) => {
        const insertText = `{{ ${variable} }}`;
        if (inputRef.current) {
            const start = inputRef.current.selectionStart || value.length;
            const end = inputRef.current.selectionEnd || value.length;
            const newValue = value.slice(0, start) + insertText + value.slice(end);
            onChange(newValue);
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.setSelectionRange(start + insertText.length, start + insertText.length);
            }, 0);
        } else {
            onChange(value + insertText);
        }
        setOpen(false);
        setSearch("");
    };

    return (
        <div className="relative flex items-center w-full">
            <Input
                ref={inputRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className={cn("pr-8 h-8 text-[11px] font-mono", className)}
            />
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 h-full w-8 text-muted-foreground hover:text-primary px-0 rounded-l-none">
                        <Code2 className="h-3.5 w-3.5" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-0" align="end">
                    <Command>
                        <CommandInput placeholder="Search variable..." value={search} onValueChange={setSearch} className="h-8 text-[11px] font-mono" />
                        <CommandList>
                            <CommandEmpty className="py-2 text-center text-[10px] text-muted-foreground">No matches found.</CommandEmpty>
                            <CommandGroup>
                                {suggestions.map((path) => (
                                    <CommandItem key={path} value={path} onSelect={() => insertVariable(path)} className="text-[11px] font-mono cursor-pointer">
                                        <Code2 className="mr-2 h-3.5 w-3.5 opacity-50" />
                                        {path}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}

export default function TemplateVisualEditor({
    initialHtml,
    initialCss,
    initialBlocks,
    pathSuggestions,
    readOnly = false,
    readOnlyReason,
    onSave,
}: TemplateVisualEditorProps) {
    const initialBlocksSignature = useMemo(() => JSON.stringify(normalizeIncomingBlocks(initialBlocks)), [initialBlocks]);
    const [blocks, setBlocks] = useState<VisualBlock[]>(() => normalizeIncomingBlocks(initialBlocks));
    const hasLegacyHtml = useMemo(() => String(initialHtml || "").trim().length > 0, [initialHtml]);
    const resolvedPathSuggestions = useMemo(
        () => Array.from(new Set((pathSuggestions || []).map((v) => String(v || "").trim()).filter(Boolean))).slice(0, 300),
        [pathSuggestions]
    );

    useEffect(() => {
        try {
            setBlocks(JSON.parse(initialBlocksSignature) as VisualBlock[]);
        } catch {
            setBlocks([]);
        }
    }, [initialBlocksSignature]);

    const addBlock = (type: BlockType) => {
        const newBlock: VisualBlock = {
            id: "blk_" + Math.random().toString(36).substr(2, 9),
            type,
            props: {}
        };
        if (type === "header") {
            newBlock.content = "Logo & Details";
            newBlock.props = { companyPath: "{{ seller_name }}", addressPath: "{{ seller_address }}", emailPath: "{{ seller_email }}" };
        }
        if (type === "heading") newBlock.content = "Heading";
        if (type === "text") newBlock.content = "Enter your text here...";
        if (type === "table") {
            newBlock.props = { itemsPath: "items", columns: "Description, Quantity, Unit Price, Total", dataKeys: "description, quantity, unit_price, amount" };
        }
        if (type === "key_value") newBlock.content = "Date: {{ date }}\nInvoice #: {{ invoice_number }}";
        if (type === "terms") newBlock.content = "Terms and conditions apply. Payment is due within 30 days.";
        if (type === "signature") newBlock.content = "Authorized Signature";
        if (type === "html") newBlock.content = `<div style="margin-top: 1rem;">\n  <!-- Add custom HTML/Jinja here -->\n</div>`;
        if (type === "page_break") newBlock.content = "page_break";
        if (type === "callout") newBlock.content = "Important Note: Please review the following details.";
        if (type === "totals") {
            newBlock.props = { subtotalPath: "{{ subtotal }}", taxPath: "{{ tax_amount }}", totalPath: "{{ total_amount }}" };
        }
        setBlocks([...blocks, newBlock]);
    };

    const removeBlock = (id: string) => {
        setBlocks(blocks.filter(b => b.id !== id));
    };

    const moveBlock = (index: number, direction: -1 | 1) => {
        const newBlocks = [...blocks];
        if (index + direction >= 0 && index + direction < newBlocks.length) {
            const temp = newBlocks[index];
            newBlocks[index] = newBlocks[index + direction];
            newBlocks[index + direction] = temp;
            setBlocks(newBlocks);
        }
    };

    const updateBlock = (id: string, updates: Partial<VisualBlock>) => {
        setBlocks(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
    };

    const generateJinjaHtml = () => {
        let html = `<div class="document-container">\n`;
        blocks.forEach(b => {
            switch (b.type) {
                case "header":
                    const companyPath = b.props?.companyPath || "{{ seller_name }}";
                    const addressPath = b.props?.addressPath || "{{ seller_address }}";
                    const emailPath = b.props?.emailPath || "{{ seller_email }}";
                    html += `
  <div class="header" style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 2rem;">
    <div class="header-logo">
      {% if branding.logo_url %}
        <img src="{{ branding.logo_url }}" alt="Logo" style="max-height: 60px;" />
      {% else %}
        <h2>${companyPath}</h2>
      {% endif %}
    </div>
    <div class="header-details" style="text-align: right; color: #64748b;">
      <p style="margin: 0;">${addressPath}</p>
      <p style="margin: 0;">${emailPath}</p>
    </div>
  </div>\n`;
                    break;
                case "heading":
                    html += `  <h1 style="color: {{ branding.primary_color | default('#0f172a') }}; margin-top: 1.5rem; margin-bottom: 1rem; font-size: 1.5rem;">${b.content}</h1>\n`;
                    break;
                case "text":
                    html += `  <p style="margin-bottom: 1rem; color: #334155; line-height: 1.5; white-space: pre-wrap;">${b.content}</p>\n`;
                    break;
                case "callout":
                    html += `
  <div style="background-color: #f8fafc; border-left: 4px solid {{ branding.primary_color | default('#3b82f6') }}; padding: 1rem; margin-bottom: 1.5rem; border-radius: 0 0.375rem 0.375rem 0;">
    <p style="margin: 0; color: #334155; font-size: 0.875rem; white-space: pre-wrap;">${b.content}</p>
  </div>\n`;
                    break;
                case "spacer":
                    html += `  <div style="height: 2rem;"></div>\n`;
                    break;
                case "table":
                    const itemsPath = b.props?.itemsPath || "items";
                    const cols = (b.props?.columns || "Col1, Col2").split(",").map((s: string) => s.trim());
                    const dataKeys = (b.props?.dataKeys || "col1, col2").split(",").map((s: string) => s.trim());

                    let tableHtml = `  <table style="width: 100%; border-collapse: collapse; margin-top: 1.5rem; margin-bottom: 1.5rem;">\n`;
                    tableHtml += `    <thead>\n      <tr style="border-bottom: 2px solid {{ branding.primary_color | default('#e2e8f0') }};">\n`;
                    cols.forEach((c: string) => {
                        tableHtml += `        <th style="padding: 0.75rem; text-align: left; font-size: 0.875rem; color: #64748b;">${c}</th>\n`;
                    });
                    tableHtml += `      </tr>\n    </thead>\n`;
                    tableHtml += `    <tbody>\n`;
                    tableHtml += `      {% for row in ${itemsPath} %}\n`;
                    tableHtml += `      <tr style="border-bottom: 1px solid #e2e8f0;">\n`;
                    cols.forEach((_c: string, i: number) => {
                        const key = dataKeys[i] || `col${i + 1}`;
                        tableHtml += `        <td style="padding: 0.75rem; color: #334155;">{{ row.${key} | default('...') }}</td>\n`;
                    });
                    tableHtml += `      </tr>\n`;
                    tableHtml += `      {% endfor %}\n`;
                    tableHtml += `    </tbody>\n  </table>\n`;
                    html += tableHtml;
                    break;
                case "columns":
                    const leftTitle = b.props?.leftTitle || "Left Column";
                    const rightTitle = b.props?.rightTitle || "Right Column";
                    const leftPath = b.props?.leftPath || "{{ left_content }}";
                    const rightPath = b.props?.rightPath || "{{ right_content }}";
                    html += `
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 1.5rem;">
    <div>
      <h3 style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">${leftTitle}</h3>
      <p style="color: #334155; white-space: pre-wrap;">${leftPath}</p>
    </div>
    <div>
      <h3 style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">${rightTitle}</h3>
      <p style="color: #334155; white-space: pre-wrap;">${rightPath}</p>
    </div>
  </div>\n`;
                    break;
                case "signature":
                    html += `
  <div style="margin-top: 3rem; display: flex; justify-content: flex-end;">
    <div style="width: 250px; text-align: center;">
      <div style="border-bottom: 1px solid #000; height: 40px; margin-bottom: 0.5rem;"></div>
      <p style="color: #64748b; font-size: 0.875rem;">${b.content || 'Authorized Signature'}</p>
    </div>
  </div>\n`;
                    break;
                case "divider":
                    html += `  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0;" />\n`;
                    break;
                case "page_break":
                    html += `  <div style="page-break-after: always;"></div>\n`;
                    break;
                case "totals":
                    const subtotalPath = b.props?.subtotalPath || "{{ subtotal }}";
                    const taxPath = b.props?.taxPath || "{{ tax_amount }}";
                    const totalPath = b.props?.totalPath || "{{ total_amount }}";
                    html += `
  <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
    <table style="width: 250px; border-collapse: collapse;">
      <tr>
        <td style="padding: 0.5rem; color: #64748b;">Subtotal</td>
        <td style="padding: 0.5rem; text-align: right; color: #334155;">${subtotalPath}</td>
      </tr>
      <tr>
        <td style="padding: 0.5rem; color: #64748b;">Tax</td>
        <td style="padding: 0.5rem; text-align: right; color: #334155;">${taxPath}</td>
      </tr>
      <tr>
        <td style="padding: 0.5rem; font-weight: bold; color: #0f172a; border-top: 1px solid #e2e8f0;">Total</td>
        <td style="padding: 0.5rem; text-align: right; font-weight: bold; color: #0f172a; border-top: 1px solid #e2e8f0;">${totalPath}</td>
      </tr>
    </table>
  </div>\n`;
                    break;
                case "key_value":
                    html += `  <div style="margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem;">\n`;
                    (b.content || "").split("\n").filter(Boolean).forEach(line => {
                        const idx = line.indexOf(":");
                        if (idx !== -1) {
                            const label = line.slice(0, idx).trim();
                            const val = line.slice(idx + 1).trim();
                            html += `    <div style="display: flex;">
      <strong style="width: 150px; color: #64748b; font-size: 0.875rem;">${label}:</strong>
      <span style="color: #334155; font-size: 0.875rem;">${val}</span>
    </div>\n`;
                        }
                    });
                    html += `  </div>\n`;
                    break;
                case "terms":
                    html += `
  <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
    <h4 style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; margin-bottom: 0.5rem;">Terms & Conditions</h4>
    <p style="font-size: 0.75rem; color: #94a3b8; line-height: 1.5; white-space: pre-wrap;">${b.content}</p>
  </div>\n`;
                    break;
                case "html":
                    html += `${b.content || ""}\n`;
                    break;
            }
        });
        html += `</div>`;
        return html;
    };

    const handleSave = () => {
        if (readOnly) return;
        const generatedHtml = generateJinjaHtml();
        // Default base css to ensure formatting looks good out of the box
        const css = initialCss || `
.document-container {
  font-family: inherit;
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
p { margin: 0; }
`;
        onSave(generatedHtml, css, blocks);
    };

    return (
        <div className="flex flex-col space-y-4">
            {readOnly ? (
                <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                    {readOnlyReason || "Visual editing is locked for this template. Convert it to visual mode first."}
                </div>
            ) : null}
            <fieldset disabled={readOnly} className={`min-w-0 border-0 p-0 m-0 space-y-4 ${readOnly ? "opacity-70" : ""}`}>
                <div className="flex justify-between items-center rounded-md border border-border/40 bg-card/40 p-4">
                    <div>
                        <h3 className="text-sm font-semibold">Visual Builder</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            Drag and arrange blocks to design your template. Click save to update the template HTML.
                        </p>
                    </div>
                    <Button onClick={handleSave} className="gap-2 shrink-0">
                        <Save className="h-4 w-4" />
                        Use This Design
                    </Button>
                </div>

                <div className="flex gap-6 items-start h-[700px]">
                    {/* Left Sidebar Toolbox */}
                    <div className="w-[220px] shrink-0 space-y-3 h-full overflow-y-auto pb-4 pr-2">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Components</div>
                        {AVAILABLE_BLOCKS.map(b => (
                            <button
                                key={b.type}
                                type="button"
                                onClick={() => addBlock(b.type)}
                                className="w-full flex items-center gap-3 p-3 rounded-md border border-border/50 bg-background hover:bg-muted/80 hover:border-border transition-all text-left group shadow-sm"
                            >
                                <div className="p-2 rounded bg-muted group-hover:bg-background group-hover:text-primary transition-colors text-muted-foreground">
                                    <b.icon className="h-4 w-4" />
                                </div>
                                <span className="text-xs font-medium">{b.label}</span>
                            </button>
                        ))}
                        <div className="p-4 rounded-md bg-sky-50/50 border border-sky-100 mt-6 shadow-sm">
                            <p className="text-[10px] text-sky-800 leading-relaxed">
                                <strong>Tip:</strong> For tables, set the data list path (for example <code>items</code>).
                            </p>
                        </div>
                    </div>

                    {/* Canvas */}
                    <div className="flex-1 bg-muted/20 border border-border/60 rounded-xl overflow-y-auto h-full p-8 shadow-inner relative">
                        <div className="max-w-[800px] mx-auto bg-background rounded-sm shadow-md border border-border min-h-full p-10 space-y-4 relative">
                            {blocks.length === 0 ? (
                                <div className="h-full absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                                    <LayoutTemplate className="h-12 w-12 mb-4 opacity-10" />
                                    <p className="text-sm font-medium">Your canvas is empty.</p>
                                    <p className="text-xs mt-1">
                                        {readOnly ? "Convert this template to visual draft to start building." : "Click components on the left to start building."}
                                    </p>
                                    {hasLegacyHtml ? (
                                        <p className="text-[11px] mt-2 max-w-sm text-center text-amber-700">
                                            Existing HTML template detected. You can still edit visually. HTML changes only after you click Use This Design.
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}

                            {blocks.map((block, idx) => (
                                <div key={block.id} className="relative group p-4 border-2 border-dashed border-transparent hover:border-muted-foreground/30 focus-within:border-primary/40 focus-within:bg-primary/5 hover:bg-muted/30 rounded-lg transition-all mb-4">
                                    {/* Controls */}
                                    <div className="absolute -left-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex flex-col gap-1.5 p-1 bg-background border shadow-sm rounded-md">
                                        <button onClick={() => moveBlock(idx, -1)} disabled={idx === 0} className="p-1.5 text-muted-foreground hover:bg-muted rounded hover:text-foreground disabled:opacity-30"><MoveUp className="h-3.5 w-3.5" /></button>
                                        <button onClick={() => moveBlock(idx, 1)} disabled={idx === blocks.length - 1} className="p-1.5 text-muted-foreground hover:bg-muted rounded hover:text-foreground disabled:opacity-30"><MoveDown className="h-3.5 w-3.5" /></button>
                                    </div>
                                    <button
                                        onClick={() => removeBlock(block.id)}
                                        className="absolute -right-3 -top-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity p-1.5 rounded-full bg-destructive text-destructive-foreground shadow-sm hover:scale-105"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>

                                    {/* Render Block Content Inline Elements */}
                                    {block.type === "header" && (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-start opacity-70 pointer-events-none select-none">
                                                <div className="h-16 w-32 bg-slate-200 rounded flex items-center justify-center text-[10px] uppercase font-bold text-slate-500">Logo Space</div>
                                                <div className="text-right space-y-2">
                                                    <div className="h-3 w-40 bg-slate-200 rounded" />
                                                    <div className="h-2 w-32 bg-slate-200 rounded ml-auto" />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-4">
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Company Name</label>
                                                    <SmartInput
                                                        value={block.props?.companyPath || "{{ seller_name }}"}
                                                        onChange={val => updateBlock(block.id, { props: { ...block.props, companyPath: val } })}
                                                        suggestions={resolvedPathSuggestions}
                                                        placeholder="Company Name"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Address</label>
                                                    <SmartInput
                                                        value={block.props?.addressPath || "{{ seller_address }}"}
                                                        onChange={val => updateBlock(block.id, { props: { ...block.props, addressPath: val } })}
                                                        suggestions={resolvedPathSuggestions}
                                                        placeholder="Address"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Email</label>
                                                    <SmartInput
                                                        value={block.props?.emailPath || "{{ seller_email }}"}
                                                        onChange={val => updateBlock(block.id, { props: { ...block.props, emailPath: val } })}
                                                        suggestions={resolvedPathSuggestions}
                                                        placeholder="Email"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {block.type === "heading" && (
                                        <Input
                                            value={block.content || ""}
                                            onChange={e => updateBlock(block.id, { content: e.target.value })}
                                            className="text-2xl font-bold border-transparent shadow-none px-2 h-auto focus-visible:ring-1 focus-visible:ring-primary/20 bg-transparent placeholder:text-muted-foreground/40"
                                            placeholder="Enter heading..."
                                        />
                                    )}

                                    {block.type === "text" && (
                                        <Textarea
                                            value={block.content || ""}
                                            onChange={e => updateBlock(block.id, { content: e.target.value })}
                                            className="border-transparent shadow-none text-base resize-none min-h-[80px] px-2 focus-visible:ring-1 focus-visible:ring-primary/20 bg-transparent placeholder:text-muted-foreground/40 leading-relaxed"
                                            placeholder="Start typing your text paragraph..."
                                        />
                                    )}

                                    {block.type === "callout" && (
                                        <div className="flex gap-3 bg-slate-50 border-l-4 border-l-primary/40 rounded-r-md p-3">
                                            <MessageSquareWarning className="h-5 w-5 text-primary/60 shrink-0 mt-0.5" />
                                            <Textarea
                                                value={block.content || ""}
                                                onChange={e => updateBlock(block.id, { content: e.target.value })}
                                                className="border-transparent shadow-none text-sm resize-none min-h-[60px] p-0 focus-visible:ring-1 focus-visible:ring-primary/20 bg-transparent placeholder:text-muted-foreground/40 leading-relaxed"
                                                placeholder="Enter important notice or note here..."
                                            />
                                        </div>
                                    )}

                                    {block.type === "spacer" && (
                                        <div className="h-8 flex items-center justify-center select-none pointer-events-none">
                                            <div className="w-full border-t border-dashed border-border/80" />
                                            <span className="absolute text-[10px] text-muted-foreground bg-background px-2 font-mono uppercase">2rem Spacer</span>
                                        </div>
                                    )}

                                    {block.type === "page_break" && (
                                        <div className="h-10 flex items-center justify-center select-none pointer-events-none mx-[-20px] bg-amber-500/5 relative">
                                            <div className="w-full border-t-[3px] border-double border-amber-500/30" />
                                            <span className="absolute text-[10px] text-amber-500/80 font-bold bg-amber-500/5 px-3 py-1 font-mono uppercase rounded-full">Page Break / New Page</span>
                                        </div>
                                    )}

                                    {block.type === "table" && (() => {
                                        const cols = (block.props?.columns || "Title, Quantity").split(",").map((s: string) => s.trim());
                                        const keys = (block.props?.dataKeys || "title, qty").split(",").map((s: string) => s.trim());
                                        const pairsCount = Math.max(cols.length, keys.length, 1);
                                        const columnsList = Array.from({ length: pairsCount }).map((_, i) => ({
                                            header: cols[i] || "",
                                            key: keys[i] || ""
                                        }));

                                        const commitPairs = (newColumns: { header: string; key: string; }[]) => {
                                            updateBlock(block.id, {
                                                props: {
                                                    ...block.props,
                                                    columns: newColumns.map(c => c.header).join(", "),
                                                    dataKeys: newColumns.map(c => c.key).join(", ")
                                                }
                                            });
                                        };

                                        return (
                                            <div className="space-y-4 bg-card/60 p-5 rounded-md border border-border/50 shadow-sm">
                                                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-4 select-none pointer-events-none">
                                                    <List className="h-3.5 w-3.5" />
                                                    Dynamic Data Table
                                                </div>
                                                <div className="space-y-1.5 pb-4 border-b border-border/50">
                                                    <label className="text-[10px] uppercase font-bold text-muted-foreground">List Variable Path (ex: `items`)</label>
                                                    <PathCombobox
                                                        value={block.props?.itemsPath || "items"}
                                                        onChange={val => updateBlock(block.id, { props: { ...block.props, itemsPath: val } })}
                                                        suggestions={resolvedPathSuggestions}
                                                        placeholder="items"
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Column Mappings</label>
                                                    <div className="grid grid-cols-12 gap-2 mb-1 pl-2 pr-12">
                                                        <div className="col-span-6 text-[10px] font-semibold text-muted-foreground/70 uppercase">Column Header Text</div>
                                                        <div className="col-span-6 text-[10px] font-semibold text-muted-foreground/70 uppercase">Data Variable Path</div>
                                                    </div>
                                                    {columnsList.map((col, i) => (
                                                        <div key={i} className="flex gap-2 items-center group/col relative">
                                                            <div className="grid grid-cols-12 gap-2 flex-1">
                                                                <div className="col-span-6">
                                                                    <Input
                                                                        value={col.header}
                                                                        onChange={e => {
                                                                            const newCols = [...columnsList];
                                                                            newCols[i].header = e.target.value;
                                                                            commitPairs(newCols);
                                                                        }}
                                                                        className="h-8 text-[11px] bg-background border-border/60"
                                                                        placeholder="Header Name"
                                                                    />
                                                                </div>
                                                                <div className="col-span-6">
                                                                    <PathCombobox
                                                                        value={col.key}
                                                                        onChange={val => {
                                                                            const newCols = [...columnsList];
                                                                            newCols[i].key = val;
                                                                            commitPairs(newCols);
                                                                        }}
                                                                        suggestions={resolvedPathSuggestions}
                                                                        placeholder="Property path"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col ml-1 w-8 shrink-0 overflow-hidden">
                                                                <button type="button" onClick={() => commitPairs(columnsList.filter((_, idx) => idx !== i))} disabled={columnsList.length <= 1} className="p-1 rounded text-red-400 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent">
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div className="pt-2">
                                                        <Button type="button" variant="outline" size="sm" onClick={() => commitPairs([...columnsList, { header: "New Col", key: "new_path" }])} className="h-7 text-[10px] border-dashed">
                                                            + Add Column
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {block.type === "columns" && (
                                        <div className="space-y-4 bg-card/60 p-5 rounded-md border border-border/50 shadow-sm">
                                            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-4 select-none pointer-events-none">
                                                <AlignLeft className="h-3.5 w-3.5" /> Two Columns
                                            </div>
                                            <div className="grid grid-cols-2 gap-8">
                                                <div className="space-y-3 p-4 rounded-md border border-transparent hover:border-border/60 bg-slate-50 dark:bg-slate-900 transition-colors">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Left Column Heading</label>
                                                        <Input value={block.props?.leftTitle || "Left Column"} onChange={e => updateBlock(block.id, { props: { ...block.props, leftTitle: e.target.value } })} className="h-8 text-[11px] bg-background border-border/60" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Content</label>
                                                        <SmartInput value={block.props?.leftPath || "{{ left_content }}"} onChange={val => updateBlock(block.id, { props: { ...block.props, leftPath: val } })} suggestions={resolvedPathSuggestions} placeholder="{{ left_content }}" />
                                                    </div>
                                                </div>
                                                <div className="space-y-3 p-4 rounded-md border border-transparent hover:border-border/60 bg-slate-50 dark:bg-slate-900 transition-colors">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Right Column Heading</label>
                                                        <Input value={block.props?.rightTitle || "Right Column"} onChange={e => updateBlock(block.id, { props: { ...block.props, rightTitle: e.target.value } })} className="h-8 text-[11px] bg-background border-border/60" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Content</label>
                                                        <SmartInput value={block.props?.rightPath || "{{ right_content }}"} onChange={val => updateBlock(block.id, { props: { ...block.props, rightPath: val } })} suggestions={resolvedPathSuggestions} placeholder="{{ right_content }}" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {block.type === "signature" && (
                                        <div className="mt-4 flex justify-end opacity-70 pointer-events-none select-none">
                                            <div className="w-[200px] text-center">
                                                <div className="border-b border-foreground/50 h-8 mb-2"></div>
                                                <Input
                                                    value={block.content || ""}
                                                    onChange={e => updateBlock(block.id, { content: e.target.value })}
                                                    className="h-6 text-xs text-center border-transparent shadow-none bg-transparent pointer-events-auto"
                                                    placeholder="Signature Title"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {block.type === "divider" && (
                                        <div className="flex h-4 items-center justify-center select-none pointer-events-none opacity-50">
                                            <div className="w-full border-t border-solid border-slate-300" />
                                        </div>
                                    )}

                                    {block.type === "totals" && (
                                        <div className="flex justify-end pt-4 space-y-2">
                                            <div className="w-[300px] space-y-2 bg-card/40 p-3 rounded-md border border-border/50">
                                                <div className="flex justify-between items-center gap-3">
                                                    <span className="text-[10px] uppercase font-bold text-muted-foreground shrink-0 w-16">Subtotal</span>
                                                    <SmartInput value={block.props?.subtotalPath || "{{ subtotal }}"} onChange={val => updateBlock(block.id, { props: { ...block.props, subtotalPath: val } })} suggestions={resolvedPathSuggestions} />
                                                </div>
                                                <div className="flex justify-between items-center gap-3">
                                                    <span className="text-[10px] uppercase font-bold text-muted-foreground shrink-0 w-16">Tax</span>
                                                    <SmartInput value={block.props?.taxPath || "{{ tax_amount }}"} onChange={val => updateBlock(block.id, { props: { ...block.props, taxPath: val } })} suggestions={resolvedPathSuggestions} />
                                                </div>
                                                <div className="flex justify-between items-center border-t border-border/60 pt-2 gap-3">
                                                    <span className="text-[10px] uppercase font-bold text-foreground shrink-0 w-16">Total</span>
                                                    <SmartInput value={block.props?.totalPath || "{{ total_amount }}"} onChange={val => updateBlock(block.id, { props: { ...block.props, totalPath: val } })} suggestions={resolvedPathSuggestions} />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {block.type === "key_value" && (() => {
                                        const parseKV = (content: string) => {
                                            return (content || "").split("\n").filter(Boolean).map(line => {
                                                const idx = line.indexOf(":");
                                                let label = "";
                                                let path = "";
                                                if (idx !== -1) {
                                                    label = line.slice(0, idx).trim();
                                                    path = line.slice(idx + 1).trim();
                                                } else {
                                                    label = line.trim();
                                                }
                                                return { label, path };
                                            });
                                        };
                                        const commitKV = (pairs: { label: string, path: string }[]) => {
                                            updateBlock(block.id, {
                                                content: pairs.map(p => `${p.label}: ${p.path}`).join("\n")
                                            });
                                        };

                                        const pairs = parseKV(block.content || "");
                                        if (pairs.length === 0) pairs.push({ label: "Key", path: "" });

                                        return (
                                            <div className="space-y-4 bg-card/60 p-5 rounded-md border border-border/50 shadow-sm max-w-[450px]">
                                                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-4 select-none pointer-events-none">
                                                    <ListTree className="h-3.5 w-3.5" /> Key-Value Details
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="grid grid-cols-12 gap-2 mb-1 pl-2 pr-10">
                                                        <div className="col-span-5 text-[10px] font-semibold text-muted-foreground/70 uppercase">Label</div>
                                                        <div className="col-span-7 text-[10px] font-semibold text-muted-foreground/70 uppercase">Data Variable Path</div>
                                                    </div>
                                                    {pairs.map((pair, i) => (
                                                        <div key={i} className="flex gap-2 items-center group/kv relative">
                                                            <div className="grid grid-cols-12 gap-2 flex-1">
                                                                <div className="col-span-5">
                                                                    <Input
                                                                        value={pair.label}
                                                                        onChange={e => {
                                                                            const newPairs = [...pairs];
                                                                            newPairs[i].label = e.target.value;
                                                                            commitKV(newPairs);
                                                                        }}
                                                                        className="h-8 text-[11px] bg-background border-border/60"
                                                                        placeholder="Label"
                                                                    />
                                                                </div>
                                                                <div className="col-span-7">
                                                                    <SmartInput
                                                                        value={pair.path}
                                                                        onChange={val => {
                                                                            const newPairs = [...pairs];
                                                                            newPairs[i].path = val;
                                                                            commitKV(newPairs);
                                                                        }}
                                                                        suggestions={resolvedPathSuggestions}
                                                                        placeholder="Value logic"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col ml-1 w-6 shrink-0 overflow-hidden">
                                                                <button type="button" onClick={() => commitKV(pairs.filter((_, idx) => idx !== i))} disabled={pairs.length <= 1} className="p-1 rounded text-red-400 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent">
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div className="pt-2">
                                                        <Button type="button" variant="outline" size="sm" onClick={() => commitKV([...pairs, { label: "New Key", path: "" }])} className="h-7 text-[10px] border-dashed">
                                                            + Add Key-Value
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {block.type === "terms" && (
                                        <div className="border-t border-slate-200 mt-4 pt-2">
                                            <div className="text-[10px] uppercase font-bold text-muted-foreground ml-2 mb-1 pointer-events-none select-none">Terms & Conditions</div>
                                            <Textarea
                                                value={block.content || ""}
                                                onChange={e => updateBlock(block.id, { content: e.target.value })}
                                                className="border-transparent shadow-none text-xs text-muted-foreground resize-none min-h-[60px] px-2 focus-visible:ring-1 focus-visible:ring-primary/20 bg-transparent placeholder:text-muted-foreground/40 leading-relaxed"
                                                placeholder="Enter terms and conditions..."
                                            />
                                        </div>
                                    )}

                                    {block.type === "html" && (
                                        <div className="space-y-2">
                                            <div className="text-[10px] uppercase font-bold text-muted-foreground ml-2 mb-1">Custom HTML / Jinja</div>
                                            <Textarea
                                                value={block.content || ""}
                                                onChange={e => updateBlock(block.id, { content: e.target.value })}
                                                className="font-mono text-xs min-h-[120px] bg-background"
                                                placeholder="<div>{{ field_name }}</div>"
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </fieldset>
        </div>
    );
}
