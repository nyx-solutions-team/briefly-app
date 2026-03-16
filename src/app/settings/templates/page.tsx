"use client";

import * as React from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ViewAccessDenied } from "@/components/access-denied";
import {
  createTemplateRegistryVersion,
  getEffectiveTemplateRegistryTemplate,
  listTemplateRegistryTemplates,
  publishBindTemplateRegistryVersion,
  validateTemplateRegistryDefinition,
  type EffectiveTemplateResult,
  type TemplateRegistryListItem,
  type TemplateValidationError,
} from "@/lib/template-registry";
import { HtmlDocumentPreview } from "@/components/html-document-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, RefreshCw, Save, Search, Sparkles, TriangleAlert, X } from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { TemplatePathSuggestion, TemplateVisualSnapshot, VisualBlock } from "./template-visual-editor";

const TemplateVisualEditor = dynamic(() => import("./template-visual-editor"), { ssr: false });

type JsonObject = Record<string, any>;

const EMPTY_TEMPLATE_DEFINITION: JsonObject = {
  schema: { version: "1", fields: {}, required: [] },
  ui_schema: {},
  rules: {},
  rendering: { html_template: "", css: "", branding: {} },
  chat_hints: {},
};

const FIELD_TYPE_OPTIONS = [
  "string",
  "number",
  "integer",
  "boolean",
  "date",
  "datetime",
  "array",
  "object",
];

function formatJson(value: any): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function deepClone<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value ?? {}));
  } catch {
    return value;
  }
}

function parseDefinition(text: string): JsonObject {
  let parsed: any;
  try {
    parsed = JSON.parse(String(text || "{}"));
  } catch {
    throw new Error("Definition JSON is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Definition must be a JSON object.");
  }
  return parsed;
}

function ensureObject(value: any): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function ensureStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || "").trim()).filter(Boolean);
}

function shouldApplyVisualSnapshot(definition: JsonObject, snapshot: TemplateVisualSnapshot | null | undefined) {
  const rendering = ensureObject(definition.rendering);
  const existingBlocks = Array.isArray(rendering.visual_blocks) ? rendering.visual_blocks.length : 0;
  const snapshotBlocks = Array.isArray(snapshot?.blocks) ? snapshot.blocks.length : 0;
  return snapshotBlocks > 0 || existingBlocks > 0;
}

function mergeVisualSnapshotIntoDefinition(definition: JsonObject, snapshot: TemplateVisualSnapshot | null | undefined): JsonObject {
  const next = deepClone(definition);
  if (!shouldApplyVisualSnapshot(next, snapshot)) return next;
  const rendering = ensureObject(next.rendering);
  rendering.html_template = String(snapshot?.html || "");
  rendering.css = String(snapshot?.css || "");
  rendering.visual_blocks = Array.isArray(snapshot?.blocks) ? snapshot.blocks : [];
  next.rendering = rendering;
  return next;
}

function normalizeFieldKey(value: string): string {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "field";
}

function getErrorMessage(error: any): string {
  const status = Number(error?.status || 0);
  if (status === 400 && Array.isArray(error?.data?.validation_errors)) {
    const first = error.data.validation_errors[0];
    const msg = first?.message || first?.code || "Validation error";
    return `Validation failed: ${msg}`;
  }
  return String(error?.data?.error || error?.message || "Request failed");
}

type TemplateFieldGuideEntry = {
  path: string;
  type: string;
  required: boolean;
  description: string;
  constraints: string[];
};

function inferSchemaFieldType(raw: any): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "any";
  const explicit = String(raw.type || "").trim();
  if (explicit) return explicit.toLowerCase();
  if (raw.properties && typeof raw.properties === "object" && !Array.isArray(raw.properties)) return "object";
  if (raw.items && typeof raw.items === "object") return "array";
  if (Array.isArray(raw.enum) && raw.enum.length > 0) return "enum";
  return "any";
}

function collectSchemaConstraints(raw: any): string[] {
  const out: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const push = (label: string, value: any) => {
    if (value === null || value === undefined || value === "") return;
    out.push(`${label}: ${String(value)}`);
  };

  push("minimum", raw.minimum);
  push("maximum", raw.maximum);
  push("exclusiveMinimum", raw.exclusiveMinimum);
  push("exclusiveMaximum", raw.exclusiveMaximum);
  push("minLength", raw.minLength);
  push("maxLength", raw.maxLength);
  push("minItems", raw.minItems);
  push("maxItems", raw.maxItems);
  push("multipleOf", raw.multipleOf);
  push("format", raw.format);
  if (typeof raw.pattern === "string" && raw.pattern.trim()) {
    push("pattern", raw.pattern.length > 40 ? `${raw.pattern.slice(0, 37)}...` : raw.pattern);
  }
  if (Array.isArray(raw.enum) && raw.enum.length > 0) {
    const values = raw.enum.slice(0, 5).map((v: any) => String(v));
    const suffix = raw.enum.length > 5 ? "..." : "";
    out.push(`enum: ${values.join(", ")}${suffix}`);
  }
  return out;
}

function buildTemplateFieldGuide(schema: JsonObject): TemplateFieldGuideEntry[] {
  const fieldsRaw = schema?.fields;
  const rootRequired = new Set(ensureStringArray(schema?.required));
  const rows: TemplateFieldGuideEntry[] = [];

  const normalizeObject = (value: any): Record<string, any> => (
    value && typeof value === "object" && !Array.isArray(value) ? value : {}
  );

  const visit = (fieldsValue: any, prefix: string, localRequired: Set<string>) => {
    const fieldsObj = normalizeObject(fieldsValue);
    for (const [rawKey, rawDef] of Object.entries(fieldsObj)) {
      const key = String(rawKey || "").trim();
      if (!key) continue;

      const def =
        rawDef && typeof rawDef === "object" && !Array.isArray(rawDef)
          ? rawDef
          : ({ type: typeof rawDef === "string" ? rawDef : "any" } as JsonObject);

      const path = prefix ? `${prefix}.${key}` : key;
      const type = inferSchemaFieldType(def);
      const required = localRequired.has(key) || rootRequired.has(path) || rootRequired.has(key);
      const description = String(def.description || def.label || "").trim();
      const constraints = collectSchemaConstraints(def);

      rows.push({
        path,
        type,
        required,
        description,
        constraints,
      });

      if (type === "object") {
        const childRequired = new Set(ensureStringArray(def.required));
        visit(def.properties, path, childRequired);
      }

      if (type === "array") {
        const itemDef = normalizeObject(def.items);
        if (Object.keys(itemDef).length === 0) continue;
        const itemType = inferSchemaFieldType(itemDef);
        const itemPath = `${path}[]`;
        rows.push({
          path: itemPath,
          type: itemType,
          required: false,
          description: String(itemDef.description || "").trim(),
          constraints: collectSchemaConstraints(itemDef),
        });
        if (itemType === "object") {
          const childRequired = new Set(ensureStringArray(itemDef.required));
          visit(itemDef.properties, itemPath, childRequired);
        }
      }
    }
  };

  visit(fieldsRaw, "", rootRequired);

  const dedup = new Map<string, TemplateFieldGuideEntry>();
  for (const row of rows) {
    if (!dedup.has(row.path)) {
      dedup.set(row.path, row);
      continue;
    }
    const prev = dedup.get(row.path)!;
    dedup.set(row.path, {
      ...prev,
      required: prev.required || row.required,
      description: prev.description || row.description,
      constraints: prev.constraints.length > 0 ? prev.constraints : row.constraints,
      type: prev.type !== "any" ? prev.type : row.type,
    });
  }

  return Array.from(dedup.values()).sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
}

function extractDataPaths(sample: any): string[] {
  const out = new Set<string>();
  const visit = (value: any, prefix: string) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      if (prefix) out.add(prefix);
      if (value.length > 0) {
        visit(value[0], `${prefix}[]`);
      }
      return;
    }
    for (const [k, v] of Object.entries(value)) {
      const key = String(k || "").trim();
      if (!key) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      out.add(path);
      visit(v, path);
    }
  };
  visit(sample, "");
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

function getFirstConfiguredObject(...values: any[]): JsonObject | null {
  for (const value of values) {
    const obj = ensureObject(value);
    if (Object.keys(obj).length > 0) return deepClone(obj);
  }
  return null;
}

function getFirstConfiguredBlocks(...values: any[]): VisualBlock[] | null {
  for (const value of values) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const blocks = value.filter((item) => item && typeof item === "object") as VisualBlock[];
    if (blocks.length > 0) return deepClone(blocks);
  }
  return null;
}

function buildPreviewData(templateKey: string, definition: JsonObject): JsonObject {
  const preview = ensureObject(definition?.preview);
  const editor = ensureObject(definition?.editor);
  const rendering = ensureObject(definition?.rendering);
  const hints = ensureObject(definition?.chat_hints);
  const fromTemplateConfig = getFirstConfiguredObject(
    preview.sample_data,
    preview.preview_data,
    preview.example_data,
    preview.default_data,
    editor.sample_data,
    editor.preview_data,
    rendering.sample_data,
    rendering.preview_data,
    hints.preview_data,
    hints.example_data,
    hints.sample_data
  );
  if (fromTemplateConfig) return fromTemplateConfig;

  const key = String(templateKey || "").trim().toLowerCase();
  if (key === "invoice") {
    const totals = { subtotal: 4000, tax_rate: 5, tax_amount: 200, discount: 0, total_amount: 4200 };
    const seller = { name: "Acme Labs", address: "12 Market Street", email: "billing@acme.com", phone: "+1 555 100 2000" };
    const buyer = { name: "Northwind LLC", address: "44 Pine Avenue", email: "accounts@northwind.com", phone: "+1 555 400 5000" };
    return {
      template_type: "invoice",
      template_id: "invoice",
      doc_type: "invoice",
      invoice_number: "INV-2026-001",
      date: "2026-02-27",
      due_date: "2026-03-29",
      payment_terms: "Net 30",
      currency: "USD",
      seller,
      buyer,
      seller_name: seller.name,
      seller_address: seller.address,
      seller_email: seller.email,
      seller_phone: seller.phone,
      buyer_name: buyer.name,
      buyer_address: buyer.address,
      buyer_email: buyer.email,
      buyer_phone: buyer.phone,
      items: [
        { description: "Implementation Sprint", quantity: 1, unit_price: 3200, line_total: 3200 },
        { description: "Support Retainer", quantity: 1, unit_price: 800, line_total: 800 },
      ],
      totals,
      subtotal: totals.subtotal,
      tax_rate: totals.tax_rate,
      tax_amount: totals.tax_amount,
      discount: totals.discount,
      total_amount: totals.total_amount,
      left_content: "Billing contact details",
      right_content: "Shipping and delivery notes",
    };
  }

  if (key === "purchase_order") {
    const totals = { subtotal: 5400, tax_amount: 270, shipping_cost: 150, total_amount: 5820, delivery_date: "2026-03-05" };
    const buyer = { name: "Northwind LLC", address: "44 Pine Avenue", email: "procurement@northwind.com", phone: "+1 555 400 5000" };
    const vendor = { name: "Acme Supplies", address: "27 Harbor Road", email: "sales@acmesupplies.com", phone: "+1 555 200 3000" };
    return {
      template_type: "purchase_order",
      template_id: "purchase_order",
      doc_type: "purchase_order",
      po_number: "PO-2026-014",
      date: "2026-02-28",
      delivery_date: totals.delivery_date,
      currency: "USD",
      payment_terms: "Net 15",
      shipping_method: "Air Freight",
      authorized_by: "Jane Smith",
      buyer,
      vendor,
      buyer_name: buyer.name,
      buyer_address: buyer.address,
      vendor_name: vendor.name,
      vendor_address: vendor.address,
      items: [
        { description: "Premium Widget A", quantity: 20, unit_price: 180, line_total: 3600 },
        { description: "Premium Widget B", quantity: 10, unit_price: 180, line_total: 1800 },
      ],
      totals,
      subtotal: totals.subtotal,
      tax_amount: totals.tax_amount,
      shipping_cost: totals.shipping_cost,
      total_amount: totals.total_amount,
      notes: "Please pack securely and include item labels.",
    };
  }

  if (key === "receipt") {
    return {
      template_type: "receipt",
      template_id: "receipt",
      doc_type: "receipt",
      receipt_number: "RCPT-2026-055",
      date: "2026-02-28",
      currency: "USD",
      amount: 4200,
      payment_method: "Bank Transfer",
      reference_number: "INV-2026-001",
      received_from: "Northwind LLC",
      received_by: "Acme Labs",
      description: "Payment received for implementation services.",
      balance_due: 0,
      previous_balance: 4200,
      status: "paid",
      notes: "Thank you for your business.",
    };
  }

  if (key === "quotation") {
    const totals = { subtotal: 6500, tax_amount: 325, discount: 250, total_amount: 6575 };
    const company = { name: "Acme Labs", address: "12 Market Street", email: "sales@acme.com", phone: "+1 555 100 2000" };
    const client = { name: "Northwind LLC", address: "44 Pine Avenue", email: "ops@northwind.com", phone: "+1 555 400 5000" };
    return {
      template_type: "quotation",
      template_id: "quotation",
      doc_type: "quotation",
      quote_number: "QT-2026-009",
      date: "2026-02-28",
      valid_until: "2026-03-15",
      currency: "USD",
      company,
      client,
      company_name: company.name,
      company_address: company.address,
      client_name: client.name,
      client_address: client.address,
      items: [
        { description: "Platform setup", quantity: 1, unit_price: 3000, line_total: 3000 },
        { description: "Integration services", quantity: 2, unit_price: 1750, line_total: 3500 },
      ],
      totals,
      subtotal: totals.subtotal,
      tax_amount: totals.tax_amount,
      discount: totals.discount,
      total_amount: totals.total_amount,
      terms_and_conditions: "Price valid for 15 days. Delivery timeline: 2 weeks from approval.",
      prepared_by: "Alex Johnson",
      notes: "Support package can be added separately.",
    };
  }

  if (key === "delivery_note") {
    const sender = { name: "Acme Warehouse", address: "10 Logistics Way", email: "dispatch@acme.com", phone: "+1 555 220 3300" };
    const receiver = { name: "Northwind Receiving", address: "44 Pine Avenue", email: "receiving@northwind.com", phone: "+1 555 410 5100" };
    return {
      template_type: "delivery_note",
      template_id: "delivery_note",
      doc_type: "delivery_note",
      delivery_note_number: "DN-2026-032",
      date: "2026-02-28",
      order_reference: "PO-2026-014",
      sender,
      receiver,
      sender_name: sender.name,
      sender_address: sender.address,
      receiver_name: receiver.name,
      receiver_address: receiver.address,
      items: [
        { description: "Premium Widget A", quantity: 20, unit: "pcs" },
        { description: "Premium Widget B", quantity: 10, unit: "pcs" },
      ],
      total_packages: 5,
      weight: "78 kg",
      shipping_method: "Road",
      driver_name: "Chris Martin",
      received_by_signature: "NW-RCV-88912",
      notes: "Inspect packages on delivery.",
      left_content: `${sender.name}\n${sender.address}\n${sender.phone}`,
      right_content: `${receiver.name}\n${receiver.address}\n${receiver.phone}`,
    };
  }

  return {};
}


function buildStarterVisualBlocks(templateKey: string, definition?: JsonObject): VisualBlock[] {
  const preview = ensureObject(definition?.preview);
  const editor = ensureObject(definition?.editor);
  const rendering = ensureObject(definition?.rendering);
  const configured = getFirstConfiguredBlocks(
    editor.starter_blocks,
    editor.visual_blocks,
    preview.starter_blocks,
    preview.visual_blocks,
    rendering.starter_visual_blocks,
    rendering.starter_blocks
  );
  if (configured) return configured;

  const key = String(templateKey || "").trim().toLowerCase();
  if (key === "invoice") {
    return [
      {
        id: "blk_header_1",
        type: "header",
        content: "Invoice Header",
        props: { companyPath: "seller_name", addressPath: "seller_address", emailPath: "seller_email" },
      },
      {
        id: "blk_title_1",
        type: "heading",
        content: "Invoice",
        props: {},
      },
      {
        id: "blk_kv_1",
        type: "key_value",
        content: "Invoice #: {{ invoice_number }}\nDate: {{ date }}\nDue Date: {{ due_date }}\nPayment Terms: {{ payment_terms }}",
        props: {},
      },
      {
        id: "blk_table_1",
        type: "table",
        props: {
          itemsPath: "items",
          columns: "Description, Quantity, Unit Price, Line Total",
          dataKeys: "description, quantity, unit_price, line_total",
        },
      },
      {
        id: "blk_totals_1",
        type: "totals",
        props: { subtotalPath: "{{ subtotal }}", taxPath: "{{ tax_amount }}", totalPath: "{{ total_amount }}" },
      },
      {
        id: "blk_terms_1",
        type: "terms",
        content: "Please pay by the due date. Thank you for your business.",
        props: {},
      },
    ];
  }

  if (key === "purchase_order") {
    return [
      {
        id: "blk_header_po_1",
        type: "header",
        content: "PO Header",
        props: { companyPath: "vendor_name", addressPath: "vendor_address", emailPath: "vendor_email" },
      },
      {
        id: "blk_title_po_1",
        type: "heading",
        content: "Purchase Order",
        props: {},
      },
      {
        id: "blk_kv_po_1",
        type: "key_value",
        content: "PO #: {{ po_number }}\nDate: {{ date }}\nDelivery Date: {{ delivery_date }}\nPayment Terms: {{ payment_terms }}",
        props: {},
      },
      {
        id: "blk_table_po_1",
        type: "table",
        props: {
          itemsPath: "items",
          columns: "Description, Quantity, Unit Price, Line Total",
          dataKeys: "description, quantity, unit_price, line_total",
        },
      },
      {
        id: "blk_totals_po_1",
        type: "totals",
        props: { subtotalPath: "{{ subtotal }}", taxPath: "{{ tax_amount }}", totalPath: "{{ total_amount }}" },
      },
      {
        id: "blk_terms_po_1",
        type: "terms",
        content: "Delivery as per agreed timeline. Please mention PO number on all shipping labels.",
        props: {},
      },
    ];
  }

  if (key === "quotation") {
    return [
      {
        id: "blk_header_qt_1",
        type: "header",
        content: "Quote Header",
        props: { companyPath: "company_name", addressPath: "company_address", emailPath: "company_email" },
      },
      {
        id: "blk_title_qt_1",
        type: "heading",
        content: "Quotation",
        props: {},
      },
      {
        id: "blk_kv_qt_1",
        type: "key_value",
        content: "Quote #: {{ quote_number }}\nDate: {{ date }}\nValid Until: {{ valid_until }}\nPrepared By: {{ prepared_by }}",
        props: {},
      },
      {
        id: "blk_table_qt_1",
        type: "table",
        props: {
          itemsPath: "items",
          columns: "Description, Quantity, Unit Price, Line Total",
          dataKeys: "description, quantity, unit_price, line_total",
        },
      },
      {
        id: "blk_totals_qt_1",
        type: "totals",
        props: { subtotalPath: "{{ subtotal }}", taxPath: "{{ tax_amount }}", totalPath: "{{ total_amount }}" },
      },
      {
        id: "blk_terms_qt_1",
        type: "terms",
        content: "This quote is valid until the specified date and is subject to acceptance of terms.",
        props: {},
      },
    ];
  }

  if (key === "receipt") {
    return [
      {
        id: "blk_title_rcp_1",
        type: "heading",
        content: "Receipt",
        props: {},
      },
      {
        id: "blk_kv_rcp_1",
        type: "key_value",
        content: "Receipt #: {{ receipt_number }}\nDate: {{ date }}\nPayment Method: {{ payment_method }}\nReference: {{ reference_number }}",
        props: {},
      },
      {
        id: "blk_text_rcp_1",
        type: "text",
        content: "Received From: {{ received_from }}\nReceived By: {{ received_by }}",
        props: {},
      },
      {
        id: "blk_kv_rcp_2",
        type: "key_value",
        content: "Amount: {{ currency }} {{ amount }}\nStatus: {{ status }}\nBalance Due: {{ currency }} {{ balance_due }}",
        props: {},
      },
      {
        id: "blk_terms_rcp_1",
        type: "terms",
        content: "This receipt confirms the payment listed above.",
        props: {},
      },
    ];
  }

  if (key === "delivery_note") {
    return [
      {
        id: "blk_title_dn_1",
        type: "heading",
        content: "Delivery Note",
        props: {},
      },
      {
        id: "blk_kv_dn_1",
        type: "key_value",
        content: "Delivery Note #: {{ delivery_note_number }}\nDate: {{ date }}\nOrder Ref: {{ order_reference }}\nShipping Method: {{ shipping_method }}",
        props: {},
      },
      {
        id: "blk_cols_dn_1",
        type: "columns",
        props: {},
      },
      {
        id: "blk_table_dn_1",
        type: "table",
        props: {
          itemsPath: "items",
          columns: "Description, Quantity, Unit",
          dataKeys: "description, quantity, unit",
        },
      },
      {
        id: "blk_sig_dn_1",
        type: "signature",
        content: "Receiver Signature",
        props: {},
      },
      {
        id: "blk_terms_dn_1",
        type: "terms",
        content: "Goods received in good condition unless otherwise noted.",
        props: {},
      },
    ];
  }

  return [
    {
      id: "blk_title_1",
      type: "heading",
      content: String(templateKey || "Document"),
      props: {},
    },
    {
      id: "blk_body_1",
      type: "text",
      content: "Add your content using blocks, then click Use This Design.",
      props: {},
    },
  ];
}

export default function SettingsTemplatesPage() {
  const { hasPermission, isLoading: authLoading } = useAuth();
  const canManage = hasPermission("org.update_settings");
  const { toast } = useToast();

  const [loadingTemplates, setLoadingTemplates] = React.useState(true);
  const [loadingEffective, setLoadingEffective] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savingAction, setSavingAction] = React.useState<"draft" | "publish" | null>(null);
  const [validating, setValidating] = React.useState(false);

  const [templates, setTemplates] = React.useState<TemplateRegistryListItem[]>([]);
  const [query, setQuery] = React.useState("");
  const [selectedKey, setSelectedKey] = React.useState<string>("");
  const [templateMeta, setTemplateMeta] = React.useState<EffectiveTemplateResult["template_definition"] | null>(null);
  const [validationErrors, setValidationErrors] = React.useState<TemplateValidationError[]>([]);

  const [definitionDraft, setDefinitionDraft] = React.useState<JsonObject>(deepClone(EMPTY_TEMPLATE_DEFINITION));
  const [definitionText, setDefinitionText] = React.useState<string>(formatJson(EMPTY_TEMPLATE_DEFINITION));
  const [jsonParseError, setJsonParseError] = React.useState<string>("");
  const [workspaceTab, setWorkspaceTab] = React.useState<"builder" | "preview">("builder");
  const visualSnapshotRef = React.useRef<(() => TemplateVisualSnapshot) | null>(null);
  const [visualDraftSnapshot, setVisualDraftSnapshot] = React.useState<TemplateVisualSnapshot | null>(null);

  const [changeNote, setChangeNote] = React.useState("");
  const [mergeStrategy, setMergeStrategy] = React.useState<"replace" | "merge_patch" | "deep_merge">("replace");
  const [loadWarning, setLoadWarning] = React.useState<string>("");

  const visibleTemplates = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      const hay = `${t.template_key} ${t.name} ${t.description || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, templates]);

  const selectedTemplate = React.useMemo(
    () => templates.find((t) => t.template_key === selectedKey) || null,
    [templates, selectedKey]
  );

  const selectedCapabilities = React.useMemo(() => {
    if (templateMeta && typeof templateMeta === "object") {
      const fromMeta = (templateMeta as any).capabilities;
      if (fromMeta && typeof fromMeta === "object") return fromMeta as any;
    }
    if (selectedTemplate && typeof selectedTemplate === "object") {
      const fromTemplate = (selectedTemplate as any).capabilities;
      if (fromTemplate && typeof fromTemplate === "object") return fromTemplate as any;
    }
 return null;
 }, [selectedTemplate, templateMeta]);

 const schemaObj = React.useMemo(() => ensureObject(definitionDraft.schema), [definitionDraft]);
  const fieldsObj = React.useMemo(() => ensureObject(schemaObj.fields), [schemaObj]);
  const resolvedDefinitionDraft = React.useMemo(
    () => mergeVisualSnapshotIntoDefinition(definitionDraft, visualDraftSnapshot),
    [definitionDraft, visualDraftSnapshot],
  );
  const renderingObj = React.useMemo(() => ensureObject(resolvedDefinitionDraft.rendering), [resolvedDefinitionDraft]);
  const brandingObj = React.useMemo(() => ensureObject(renderingObj.branding), [renderingObj]);
  const previewData = React.useMemo(() => buildPreviewData(selectedKey, definitionDraft), [selectedKey, definitionDraft]);
  const fieldGuide = React.useMemo(() => buildTemplateFieldGuide(schemaObj), [schemaObj]);
  const sampleDataPaths = React.useMemo(() => extractDataPaths(previewData), [previewData]);
  const pathSuggestions = React.useMemo<TemplatePathSuggestion[]>(() => {
    const merged = new Map<string, TemplatePathSuggestion>();

    for (const field of fieldGuide) {
      const path = String(field.path || "").trim();
      if (!path) continue;
      merged.set(path, {
        path,
        type: field.type || "any",
        required: Boolean(field.required),
        description: field.description || "",
        constraints: Array.isArray(field.constraints) ? field.constraints : [],
        source: "schema",
      });
    }

    for (const samplePath of sampleDataPaths) {
      const path = String(samplePath || "").trim();
      if (!path) continue;
      const existing = merged.get(path);
      if (existing) {
        merged.set(path, { ...existing, source: "schema" });
        continue;
      }
      merged.set(path, {
        path,
        type: "any",
        required: false,
        description: "",
        constraints: [],
        source: "sample",
      });
    }

    return Array.from(merged.values())
      .sort((a, b) => {
        if (Boolean(a.required) !== Boolean(b.required)) return a.required ? -1 : 1;
        return a.path.localeCompare(b.path);
      })
      .slice(0, 1000);
  }, [fieldGuide, sampleDataPaths]);
  const htmlTemplate = React.useMemo(() => String(renderingObj.html_template || ""), [renderingObj]);
  const cssTemplate = React.useMemo(
    () => (typeof renderingObj.css === "string" ? renderingObj.css : ""),
    [renderingObj]
  );
  const visualBlocks = React.useMemo(
    () => (Array.isArray(renderingObj.visual_blocks) ? renderingObj.visual_blocks : []),
    [renderingObj]
  );
  const hasVisualBlocks = visualBlocks.length > 0;
  const hasHtmlTemplate = htmlTemplate.trim().length > 0;
  const canPreviewTemplate = Boolean(selectedKey);
  const templateEditMode = React.useMemo<"visual_native" | "legacy_html" | "empty">(() => {
    if (hasVisualBlocks) return "visual_native";
    if (hasHtmlTemplate) return "legacy_html";
    return "empty";
  }, [hasVisualBlocks, hasHtmlTemplate]);
  // Legacy HTML templates can still be edited via visual blocks without
  // immediately overwriting canonical HTML. Overwrite only happens on Apply.
  const visualReadOnly = false;

  React.useEffect(() => {
    setWorkspaceTab("builder");
  }, [selectedKey]);

  React.useEffect(() => {
    visualSnapshotRef.current = null;
    setVisualDraftSnapshot(null);
  }, [selectedKey]);

  React.useEffect(() => {
    if (!canPreviewTemplate && workspaceTab === "preview") {
      setWorkspaceTab("builder");
    }
  }, [canPreviewTemplate, workspaceTab]);

  const applyGuidedUpdate = React.useCallback((mutator: (draft: JsonObject) => void) => {
    const next = deepClone(definitionDraft);
    mutator(next);
    setDefinitionDraft(next);
    setDefinitionText(formatJson(next));
    setJsonParseError("");
  }, [definitionDraft]);

  const loadTemplates = React.useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await listTemplateRegistryTemplates({
        includeSystem: true,
        activeOnly: false,
        limit: 200,
      });
      const rows = Array.isArray(res?.templates) ? res.templates : [];
      setTemplates(rows);
      setSelectedKey((prev) => {
        if (prev && rows.some((r) => r.template_key === prev)) return prev;
        return rows[0]?.template_key || "";
      });
    } catch (error: any) {
      toast({
        title: "Failed to load templates",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoadingTemplates(false);
    }
  }, [toast]);

  const loadEffective = React.useCallback(
    async (templateKey: string) => {
      const key = String(templateKey || "").trim();
      if (!key) return;
      setLoadingEffective(true);
      setValidationErrors([]);
      setLoadWarning("");
      try {
        const res = await getEffectiveTemplateRegistryTemplate(key, { mode: "fallback" });
        const definition = ensureObject(res?.effective_definition);
        const text = formatJson(definition);
        setTemplateMeta(res?.template_definition || null);
        setDefinitionDraft(definition);
        setDefinitionText(text);
        setJsonParseError("");
      } catch (error: any) {
        const fallbackMeta = error?.data?.template_definition;
        if (fallbackMeta && typeof fallbackMeta === "object") {
          setTemplateMeta(fallbackMeta);
        } else {
          const fromList = templates.find((t) => t.template_key === key);
          if (fromList) {
            setTemplateMeta({
              id: fromList.id,
              template_key: fromList.template_key,
              name: fromList.name,
              description: fromList.description || null,
              namespace_type: fromList.namespace_type,
              owner_org_id: fromList.owner_org_id,
              supports_chat: fromList.supports_chat,
              supports_editor: fromList.supports_editor,
            });
          } else {
            setTemplateMeta(null);
          }
        }
        const fallback = deepClone(EMPTY_TEMPLATE_DEFINITION);
        setDefinitionDraft(fallback);
        setDefinitionText(formatJson(fallback));
        setJsonParseError("");
        setLoadWarning(
          error?.status === 404
            ? "No effective published version found. Starting from a scaffold."
            : `Could not load effective version: ${getErrorMessage(error)}`
        );
      } finally {
        setLoadingEffective(false);
      }
    },
    [templates]
  );

  React.useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  React.useEffect(() => {
    if (!selectedKey) return;
    void loadEffective(selectedKey);
  }, [selectedKey, loadEffective]);

  const getInitialBlocks = React.useCallback((jsonText: string) => {
    try {
      const parsed = parseDefinition(jsonText);
      return parsed?.rendering?.visual_blocks || null;
    } catch {
      return null;
    }
  }, []);

  const getInitialHtml = React.useCallback((jsonText: string) => {
    try {
      const parsed = parseDefinition(jsonText);
      return parsed?.rendering?.html_template || "";
    } catch {
      return "";
    }
  }, []);

  const getInitialCss = React.useCallback((jsonText: string) => {
    try {
      const parsed = parseDefinition(jsonText);
      return parsed?.rendering?.css || "";
    } catch {
      return "";
    }
  }, []);

  const initialBuilderBlocks = React.useMemo(() => getInitialBlocks(definitionText), [definitionText, getInitialBlocks]);
  const initialBuilderHtml = React.useMemo(() => getInitialHtml(definitionText), [definitionText, getInitialHtml]);
  const initialBuilderCss = React.useMemo(() => getInitialCss(definitionText), [definitionText, getInitialCss]);
  const registerVisualSnapshot = React.useCallback((fn: () => TemplateVisualSnapshot) => {
    visualSnapshotRef.current = fn;
  }, []);

  const onConvertLegacyToVisual = React.useCallback(() => {
    if (templateEditMode !== "legacy_html") return;
    applyGuidedUpdate((draft) => {
      const rendering = ensureObject(draft.rendering);
      const existing = Array.isArray(rendering.visual_blocks) ? rendering.visual_blocks : [];
      if (existing.length > 0) return;
      rendering.visual_blocks = buildStarterVisualBlocks(selectedKey, draft);
      draft.rendering = rendering;
    });
    toast({
      title: "Visual draft created",
      description: "Your current design is safe. Builder changes now apply automatically when you save or publish.",
    });
  }, [applyGuidedUpdate, selectedKey, templateEditMode, toast]);

  const onDefinitionTextChange = (nextText: string) => {
    setDefinitionText(nextText);
    try {
      const parsed = parseDefinition(nextText);
      setDefinitionDraft(parsed);
      setJsonParseError("");
    } catch (error: any) {
      setJsonParseError(error.message || "Definition JSON is invalid.");
    }
  };

  const resolveDefinitionForSubmit = React.useCallback((): JsonObject => {
    const parsed = parseDefinition(definitionText);
    const liveSnapshot = visualSnapshotRef.current ? visualSnapshotRef.current() : visualDraftSnapshot;
    return mergeVisualSnapshotIntoDefinition(parsed, liveSnapshot);
  }, [definitionText, visualDraftSnapshot]);

  const validateDefinitionForPublish = React.useCallback(async (definition: JsonObject) => {
    setValidating(true);
    try {
      const result = await validateTemplateRegistryDefinition(definition);
      const errs = Array.isArray(result?.errors) ? result.errors : [];
      setValidationErrors(errs);
      if (!result?.valid) {
        toast({
          title: "Publish blocked by validation",
          description: errs.length > 0 ? `${errs.length} issue(s) need fixing before publish.` : "Validation failed.",
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch (error: any) {
      toast({
        title: "Validation request failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      return false;
    } finally {
      setValidating(false);
    }
  }, [toast]);

  const onSaveDraft = React.useCallback(async () => {
    const key = String(selectedKey || "").trim();
    if (!key) return;
    let definition: JsonObject;
    try {
      definition = resolveDefinitionForSubmit();
    } catch (error: any) {
      toast({ title: "JSON parse failed", description: error.message, variant: "destructive" });
      return;
    }
    setSaving(true);
    setSavingAction("draft");
    try {
      const createRes = await createTemplateRegistryVersion(key, {
        scopeType: "org",
        mergeStrategy,
        definition,
        changeNote: changeNote || null,
      });
      const validation = createRes?.validation;
      const errs = Array.isArray(validation?.errors) ? validation.errors : [];
      setValidationErrors(errs);
      setChangeNote("");
      const versionNo = createRes?.template_version?.version;
      toast({
        title: "Draft saved",
        description:
          validation?.valid === false
            ? `Draft${typeof versionNo === "number" ? ` v${versionNo}` : ""} saved with ${errs.length} validation issue(s).`
            : typeof versionNo === "number"
              ? `Draft v${versionNo} saved.`
              : "Draft saved.",
      });
    } catch (error: any) {
      toast({
        title: "Save draft failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setSavingAction(null);
    }
  }, [changeNote, mergeStrategy, resolveDefinitionForSubmit, selectedKey, toast]);

  const onPublish = React.useCallback(async () => {
    const key = String(selectedKey || "").trim();
    if (!key) return;
    let definition: JsonObject;
    try {
      definition = resolveDefinitionForSubmit();
    } catch (error: any) {
      toast({ title: "JSON parse failed", description: error.message, variant: "destructive" });
      return;
    }

    const rendering = ensureObject(definition.rendering);
    const rawHtmlTemplate = rendering.html_template;
    const normalizedHtml = typeof rawHtmlTemplate === "string" ? rawHtmlTemplate.trim() : "";
    const hasVisualDraft = Array.isArray(rendering.visual_blocks) ? rendering.visual_blocks.length > 0 : false;
    const requiresHtmlTemplate = (() => {
      if (selectedCapabilities && typeof selectedCapabilities.requires_html_template === "boolean") {
        return selectedCapabilities.requires_html_template;
      }
      const rawPreviewMode = selectedCapabilities ? selectedCapabilities.preview_mode : "";
      const previewMode = String(rawPreviewMode == null ? "" : rawPreviewMode).trim().toLowerCase();
      if (previewMode === "html") return true;
      return hasVisualDraft;
    })();

    if (requiresHtmlTemplate && !normalizedHtml) {
      toast({
        title: "Template HTML is required",
        description: "Builder changes apply automatically on publish, but this template still needs HTML or visual blocks before publishing.",
        variant: "destructive",
      });
      return;
    }

    const isValid = await validateDefinitionForPublish(definition);
    if (!isValid) return;

    setSaving(true);
    setSavingAction("publish");
    try {
      const createRes = await createTemplateRegistryVersion(key, {
        scopeType: "org",
        mergeStrategy,
        definition,
        changeNote: changeNote || null,
      });
      const versionId = String(createRes?.template_version?.id || "").trim();
      if (!versionId) throw new Error("Version creation succeeded but no version id was returned.");

      const createErrors = Array.isArray(createRes?.validation?.errors) ? createRes.validation.errors : [];
      setValidationErrors(createErrors);

      await publishBindTemplateRegistryVersion(key, {
        versionId,
        scopeType: "org",
        isEnabled: true,
      });

      setChangeNote("");
      const versionNo = createRes?.template_version?.version;
      toast({
        title: "Template published",
        description:
          typeof versionNo === "number"
            ? `Published and bound org version v${versionNo}.`
            : "Published and bound org version.",
      });

      setVisualDraftSnapshot(null);
      visualSnapshotRef.current = null;
      await loadTemplates();
      await loadEffective(key);
    } catch (error: any) {
      toast({
        title: "Publish failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setSavingAction(null);
    }
  }, [changeNote, loadEffective, loadTemplates, mergeStrategy, resolveDefinitionForSubmit, selectedCapabilities, selectedKey, toast, validateDefinitionForPublish]);

  const onAddField = () => {
    applyGuidedUpdate((draft) => {
      const schema = ensureObject(draft.schema);
      const fields = ensureObject(schema.fields);
      let idx = Object.keys(fields).length + 1;
      let candidate = `field_${idx}`;
      while (fields[candidate]) {
        idx += 1;
        candidate = `field_${idx}`;
      }
      fields[candidate] = { type: "string", label: `Field ${idx}` };
      schema.fields = fields;
      schema.required = ensureStringArray(schema.required);
      draft.schema = schema;
    });
  };

  const onRenameField = (oldKey: string, rawKey: string) => {
    const newKey = normalizeFieldKey(rawKey);
    if (!newKey || newKey === oldKey) return;
    if (fieldsObj[newKey]) {
      toast({
        title: "Field key already exists",
        description: `A field named '${newKey}' already exists.`,
        variant: "destructive",
      });
      return;
    }
    applyGuidedUpdate((draft) => {
      const schema = ensureObject(draft.schema);
      const fields = ensureObject(schema.fields);
      const current = fields[oldKey];
      if (current === undefined) return;
      delete fields[oldKey];
      fields[newKey] = current;
      schema.fields = fields;
      const required = ensureStringArray(schema.required).map((k) => (k === oldKey ? newKey : k));
      schema.required = Array.from(new Set(required));
      draft.schema = schema;
    });
  };

  const onRemoveField = (fieldKey: string) => {
    applyGuidedUpdate((draft) => {
      const schema = ensureObject(draft.schema);
      const fields = ensureObject(schema.fields);
      delete fields[fieldKey];
      schema.fields = fields;
      schema.required = ensureStringArray(schema.required).filter((k) => k !== fieldKey);
      draft.schema = schema;
    });
  };

  const onUpdateFieldProperty = (fieldKey: string, property: string, value: string) => {
    applyGuidedUpdate((draft) => {
      const schema = ensureObject(draft.schema);
      const fields = ensureObject(schema.fields);
      const field = ensureObject(fields[fieldKey]);
      if (!value.trim()) {
        delete field[property];
      } else {
        field[property] = value;
      }
      fields[fieldKey] = field;
      schema.fields = fields;
      draft.schema = schema;
    });
  };

  const onToggleRequired = (fieldKey: string, required: boolean) => {
    applyGuidedUpdate((draft) => {
      const schema = ensureObject(draft.schema);
      const next = new Set(ensureStringArray(schema.required));
      if (required) next.add(fieldKey);
      else next.delete(fieldKey);
      schema.required = Array.from(next);
      draft.schema = schema;
    });
  };

  const onSetSchemaVersion = (value: string) => {
    applyGuidedUpdate((draft) => {
      const schema = ensureObject(draft.schema);
      schema.version = value || "1";
      draft.schema = schema;
    });
  };

  const onSetRenderingValue = (key: string, value: string) => {
    applyGuidedUpdate((draft) => {
      const rendering = ensureObject(draft.rendering);
      rendering[key] = value;
      draft.rendering = rendering;
    });
  };

  const onSetBrandingValue = (key: string, value: string) => {
    applyGuidedUpdate((draft) => {
      const rendering = ensureObject(draft.rendering);
      const branding = ensureObject(rendering.branding);
      if (!value.trim()) {
        delete branding[key];
      } else {
        branding[key] = value;
      }
      rendering.branding = branding;
      draft.rendering = rendering;
    });
  };

  const onSetChatHintValue = (key: string, value: string) => {
    applyGuidedUpdate((draft) => {
      const hints = ensureObject(draft.chat_hints);
      if (!value.trim()) delete hints[key];
      else hints[key] = value;
      draft.chat_hints = hints;
    });
  };

  const onCopyPath = React.useCallback(async (path: string) => {
    const value = String(path || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Path copied", description: value });
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy path to clipboard.",
        variant: "destructive",
      });
    }
  }, [toast]);

  if (!authLoading && !canManage) {
    return <ViewAccessDenied />;
  }

  return (
    <div className="min-h-screen bg-background/30 pb-20">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="px-6 py-2.5 flex items-center gap-3">
          {/* Template selector */}
          <Select value={selectedKey || ""} onValueChange={(v) => setSelectedKey(v)}>
            <SelectTrigger className="w-[240px] h-8 bg-background text-xs">
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent className="max-h-[60vh]">
              <div className="p-2 pb-1 sticky top-0 bg-background z-10">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search templates..."
                  className="h-8 text-xs"
                />
              </div>
              {visibleTemplates.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">No templates found.</div>
              ) : (
                visibleTemplates.map((t) => (
                  <SelectItem key={t.template_key} value={t.template_key}>
                    <div className="flex items-center justify-between gap-4 w-full">
                      <span className="font-medium truncate">{t.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">{t.template_key}</span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          {/* Divider */}
          <div className="h-5 w-px bg-border/60" />

          {/* Mode badge */}
          {selectedKey && !loadingEffective ? (
            <span className="text-[11px] text-muted-foreground">
              Mode:
              <span className="ml-1 font-medium text-foreground">
                {templateEditMode === "visual_native" ? "Visual" : templateEditMode === "legacy_html" ? "HTML" : "Empty"}
              </span>
            </span>
          ) : null}

          {/* Builder / Preview tab switcher */}
          {selectedKey && !loadingEffective && canPreviewTemplate ? (
            <div className="flex bg-muted/60 p-0.5 rounded-md border border-border/50">
              <button
                type="button"
                onClick={() => setWorkspaceTab("builder")}
                className={cn("px-3 py-1 text-xs rounded-sm font-medium transition-colors", workspaceTab === "builder" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >Builder</button>
              <button
                type="button"
                onClick={() => setWorkspaceTab("preview")}
                className={cn("px-3 py-1 text-xs rounded-sm font-medium transition-colors", workspaceTab === "preview" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >Preview</button>
            </div>
          ) : null}

          {/* Legacy → Visual convert */}
          {selectedKey && !loadingEffective && templateEditMode === "legacy_html" ? (
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onConvertLegacyToVisual}>
              Start Visual Editing
            </Button>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {selectedKey && !loadingEffective ? (
              <>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void onSaveDraft()} disabled={saving || validating}>
                  {saving && savingAction === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Draft
                </Button>
                <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void onPublish()} disabled={saving || validating}>
                  {saving && savingAction === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Publish
                </Button>
              </>
            ) : null}
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void loadTemplates()} disabled={loadingTemplates || saving}>
              {loadingTemplates ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6 max-w-[1400px] mx-auto w-full">
        {loadWarning ? (
          <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 mb-4 text-[12px] text-amber-900 flex items-start gap-2">
            <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{loadWarning}</span>
          </div>
        ) : null}

        <div className="space-y-4">
          {!selectedKey ? (
            <div className="text-sm text-muted-foreground">Select a template from the left to start editing.</div>
          ) : loadingEffective ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-[420px] w-full" />
            </div>
          ) : (
            <>
              {templateEditMode === "legacy_html" ? (
                <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  This template already has custom HTML. Preview/download stay the same until you publish a visual version.
                </div>
              ) : null}

              <div className={cn(workspaceTab === "builder" ? "block" : "hidden")}>
                <TemplateVisualEditor
                  initialHtml={initialBuilderHtml}
                  initialCss={initialBuilderCss}
                  initialBlocks={initialBuilderBlocks}
                  pathSuggestions={pathSuggestions}
                  previewData={previewData}
                  readOnly={visualReadOnly}
                  readOnlyReason="Visual editing is temporarily unavailable."
                  onSnapshotChange={setVisualDraftSnapshot}
                  onRegisterSnapshot={registerVisualSnapshot}
                />
              </div>
              <div className={cn(workspaceTab === "preview" ? "block" : "hidden")}>
                {canPreviewTemplate ? (
                  <div className="rounded-xl border border-border/60 bg-card/70 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/50">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Preview (Same As Download)</p>
                      {!hasHtmlTemplate ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Using pyserver fallback preview because `rendering.html_template` is empty.
                        </p>
                      ) : null}
                    </div>
                    <HtmlDocumentPreview
                      templateType={selectedKey}
                      htmlTemplate={htmlTemplate}
                      css={cssTemplate || null}
                      data={previewData}
                      branding={brandingObj}
                    />
                  </div>
                ) : (
                  <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                    Preview is unavailable until a template is selected.
                  </div>
                )}
              </div>


            </>
          )}
        </div>
      </div>

      {/* Sticky bottom validation errors */}
      {selectedKey && !loadingEffective && validationErrors.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-destructive/20 bg-destructive/5 backdrop-blur-md">
          <div className="px-8 py-2">
            <div className="max-w-[1400px] mx-auto space-y-0.5">
              <div className="text-[11px] font-medium text-destructive">Validation errors</div>
              {validationErrors.slice(0, 3).map((err, idx) => (
                <div key={`val-err-${idx}`} className="text-[10px] text-destructive/80">
                  {err.path ? `${err.path}: ` : ""}{err.message || err.code || "Unknown error"}
                </div>
              ))}
              {validationErrors.length > 3 ? (
                <div className="text-[10px] text-destructive/60">+{validationErrors.length - 3} more errors</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}













