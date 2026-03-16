"use client";

import * as React from "react";
import Link from "next/link";
import { LetterheadBuilderForm } from "./letterhead-types";
import { initialsFromName, getLetterheadLogoWidth, LetterheadThemeRenderer } from "./letterhead-templates";
import html2canvas from "html2canvas";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Download,
  FileImage,
  Landmark,
  Loader2,
  MoreHorizontal,
  Package2,
  PencilLine,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ViewAccessDenied } from "@/components/access-denied";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  OrgBankAccount,
  OrgCatalogItem,
  OrgDocumentProfile,
  OrgLetterhead,
  archiveDocumentProfile,
  activateLetterhead,
  createBankAccount,
  createCatalogItem,
  createDocumentProfile,
  createLetterhead,
  deleteBankAccount,
  deleteCatalogItem,
  deleteLetterhead,
  listDocumentAssets,
  setDefaultBankAccount,
  setDefaultDocumentProfile,
  signLetterheadUpload,
  updateBankAccount,
  updateCatalogItem,
  updateDocumentProfile,
  uploadFileToSignedUrl,
} from "@/lib/document-assets-api";

type ProfileForm = {
  name: string;
  legal_name: string;
  email: string;
  phone: string;
  website: string;
  tax_id: string;
  registration_id: string;
  default_currency: string;
  default_payment_terms: string;
  default_notes: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

type BankForm = {
  name: string;
  beneficiary_name: string;
  bank_name: string;
  branch_name: string;
  account_number: string;
  iban: string;
  swift_code: string;
  ifsc_code: string;
  currency: string;
  notes: string;
  is_default: boolean;
  is_active: boolean;
};

type CatalogForm = {
  sku: string;
  kind: "product" | "service";
  name: string;
  description: string;
  unit: string;
  unit_price: string;
  currency: string;
  tax_rate: string;
  tax_code: string;
  is_active: boolean;
};

type LetterheadForm = {
  name: string;
  page_format: string;
  placement: string;
  is_active: boolean;
};

function emptyProfileForm(): ProfileForm {
  return {
    name: "",
    legal_name: "",
    email: "",
    phone: "",
    website: "",
    tax_id: "",
    registration_id: "",
    default_currency: "INR",
    default_payment_terms: "",
    default_notes: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
    is_default: false,
  };
}

function emptyBankForm(): BankForm {
  return {
    name: "",
    beneficiary_name: "",
    bank_name: "",
    branch_name: "",
    account_number: "",
    iban: "",
    swift_code: "",
    ifsc_code: "",
    currency: "INR",
    notes: "",
    is_default: false,
    is_active: true,
  };
}

function emptyCatalogForm(): CatalogForm {
  return {
    sku: "",
    kind: "product",
    name: "",
    description: "",
    unit: "",
    unit_price: "",
    currency: "INR",
    tax_rate: "",
    tax_code: "",
    is_active: true,
  };
}

function emptyLetterheadForm(): LetterheadForm {
  return {
    name: "",
    page_format: "A4",
    placement: "header",
    is_active: false,
  };
}

function emptyLetterheadBuilderForm(profile?: OrgDocumentProfile | null): LetterheadBuilderForm {
  const addressLine = [profile?.address_line1, profile?.address_line2].filter(Boolean).join(", ");
  const cityLine = [profile?.city, profile?.state, profile?.postal_code, profile?.country].filter(Boolean).join(", ");
  const registrationLine = [
    profile?.tax_id ? `GSTIN ${profile.tax_id}` : "",
    profile?.registration_id || "",
  ]
    .filter(Boolean)
    .join("  |  ");

  return {
    brand_name: profile?.name || "Briefly Docs",
    tagline: "AI document workflows for modern teams",
    accent_color: "#f97316",
    text_color: "#0f172a",
    email: profile?.email || "",
    phone: profile?.phone || "",
    website: profile?.website || "",
    address_line: addressLine,
    city_line: cityLine,
    registration_line: registrationLine,
    monogram: initialsFromName(profile?.name || "Briefly Docs"),
    logo_data_url: "",
    logo_alignment: "left",
    logo_scale: "medium",
    theme: "modern",
  };
}

function profileToForm(profile: OrgDocumentProfile): ProfileForm {
  return {
    name: profile.name || "",
    legal_name: profile.legal_name || "",
    email: profile.email || "",
    phone: profile.phone || "",
    website: profile.website || "",
    tax_id: profile.tax_id || "",
    registration_id: profile.registration_id || "",
    default_currency: profile.default_currency || "INR",
    default_payment_terms: profile.default_payment_terms || "",
    default_notes: profile.default_notes || "",
    address_line1: profile.address_line1 || "",
    address_line2: profile.address_line2 || "",
    city: profile.city || "",
    state: profile.state || "",
    postal_code: profile.postal_code || "",
    country: profile.country || "",
    is_default: !!profile.is_default,
  };
}

function bankToForm(account: OrgBankAccount): BankForm {
  return {
    name: account.name || "",
    beneficiary_name: account.beneficiary_name || "",
    bank_name: account.bank_name || "",
    branch_name: account.branch_name || "",
    account_number: account.account_number || "",
    iban: account.iban || "",
    swift_code: account.swift_code || "",
    ifsc_code: account.ifsc_code || "",
    currency: account.currency || "INR",
    notes: account.notes || "",
    is_default: !!account.is_default,
    is_active: !!account.is_active,
  };
}

function catalogToForm(item: OrgCatalogItem): CatalogForm {
  return {
    sku: item.sku || "",
    kind: item.kind || "product",
    name: item.name || "",
    description: item.description || "",
    unit: item.unit || "",
    unit_price: item.unit_price == null ? "" : String(item.unit_price),
    currency: item.currency || "INR",
    tax_rate: item.tax_rate == null ? "" : String(item.tax_rate),
    tax_code: item.tax_code || "",
    is_active: !!item.is_active,
  };
}

function toNumberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function stripExtension(filename: string) {
  return filename.replace(/\.[a-z0-9]+$/i, "").trim();
}

function maskAccount(value: string | null) {
  const input = String(value || "").trim();
  if (!input) return "—";
  if (input.length <= 4) return input;
  return `${"*".repeat(Math.max(0, input.length - 4))}${input.slice(-4)}`;
}

function sanitizeFilenameBase(value: string) {
  return String(value || "letterhead")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "letterhead";
}

function getLetterheadExportWidth(pageFormat: string) {
  return pageFormat === "Letter" ? 1520 : 1440;
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

async function waitForNodeImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));
  if (images.length === 0) return;
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => {
            image.removeEventListener("load", done);
            image.removeEventListener("error", done);
            resolve();
          };
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
        }),
    ),
  );
}

async function getImageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ width: number | null; height: number | null }>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
      image.onerror = () => reject(new Error("Failed to read image dimensions"));
      image.src = objectUrl;
    });
    return dims;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-12 flex flex-col items-center justify-center text-center">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground mb-4 max-w-sm">{description}</div>
      {action}
    </div>
  );
}

/** Renders letterhead using ONLY inline styles so html2canvas can capture it correctly. */
function LetterheadBuilderInlineCanvas({
  builder,
  exportRef,
  exportWidth,
}: {
  builder: LetterheadBuilderForm;
  exportRef: React.RefObject<HTMLDivElement | null>;
  exportWidth: number;
}) {
  return (
    <div
      ref={exportRef}
      style={{
        width: exportWidth,
        overflow: "hidden",
        backgroundColor: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <LetterheadThemeRenderer builder={builder} />
    </div>
  );
}

/** Scaled visual preview for display inside the Sheet (no ref, no export). */
function LetterheadBuilderPreview({
  builder,
  exportWidth,
}: {
  builder: LetterheadBuilderForm;
  exportWidth: number;
}) {
  const accentHex = builder.accent_color || "#f97316";
  const textHex = builder.text_color || "#0f172a";
  const mono = builder.monogram || initialsFromName(builder.brand_name);
  const metaRows = [builder.email, builder.phone, builder.website].filter(Boolean);
  const hasLogo = Boolean(builder.logo_data_url);
  const logoWidth = getLetterheadLogoWidth(builder.logo_scale);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.5);
  const [containerHeight, setContainerHeight] = React.useState(200);

  React.useLayoutEffect(() => {
    if (!containerRef.current || !contentRef.current) return;

    let animationFrameId: number;
    const observer = new ResizeObserver(() => {
      // Use requestAnimationFrame to avoid "ResizeObserver loop limit exceeded" warning
      animationFrameId = requestAnimationFrame(() => {
        if (!containerRef.current || !contentRef.current) return;
        const parentWidth = containerRef.current.offsetWidth;
        // Calculate the scale needed to fit the content horizontally
        const computedScale = parentWidth / exportWidth;
        setScale(computedScale);

        // Calculate the actual scaled height of the content block
        const contentHeight = contentRef.current.offsetHeight;
        setContainerHeight(contentHeight * computedScale);
      });
    });

    observer.observe(containerRef.current);
    observer.observe(contentRef.current);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrameId);
    };
  }, [exportWidth, builder]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: containerHeight, overflow: "hidden" }}>
      {/* Scale-transform wrapper so large canvas fits preview pane perfectly without cutoff */}
      <div
        ref={contentRef}
        style={{
          width: exportWidth,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          overflow: "hidden",
          backgroundColor: "#ffffff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          boxShadow: "0 20px 60px rgba(15,23,42,0.15)",
          borderRadius: 24,
          border: "1px solid #e2e8f0",
        }}
      >
        <LetterheadThemeRenderer builder={builder} />
      </div>
    </div>
  );
}

export default function DocumentAssetsSettingsPage() {
  const { hasPermission, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const canManage = hasPermission("org.update_settings");

  const [loading, setLoading] = React.useState(true);
  const [profiles, setProfiles] = React.useState<OrgDocumentProfile[]>([]);
  const [bankAccounts, setBankAccounts] = React.useState<OrgBankAccount[]>([]);
  const [letterheads, setLetterheads] = React.useState<OrgLetterhead[]>([]);
  const [catalogItems, setCatalogItems] = React.useState<OrgCatalogItem[]>([]);

  const [profileForm, setProfileForm] = React.useState<ProfileForm>(emptyProfileForm());
  const [bankForm, setBankForm] = React.useState<BankForm>(emptyBankForm());
  const [catalogForm, setCatalogForm] = React.useState<CatalogForm>(emptyCatalogForm());
  const [letterheadForm, setLetterheadForm] = React.useState<LetterheadForm>(emptyLetterheadForm());
  const [letterheadBuilderForm, setLetterheadBuilderForm] = React.useState<LetterheadBuilderForm>(emptyLetterheadBuilderForm());

  const [editingProfileId, setEditingProfileId] = React.useState<string | null>(null);
  const [editingBankId, setEditingBankId] = React.useState<string | null>(null);
  const [editingCatalogId, setEditingCatalogId] = React.useState<string | null>(null);

  const [isProfileSheetOpen, setIsProfileSheetOpen] = React.useState(false);
  const [isBankSheetOpen, setIsBankSheetOpen] = React.useState(false);
  const [isCatalogSheetOpen, setIsCatalogSheetOpen] = React.useState(false);
  const [isLetterheadSheetOpen, setIsLetterheadSheetOpen] = React.useState(false);
  const [letterheadSheetMode, setLetterheadSheetMode] = React.useState<"upload" | "builder">("upload");

  const [letterheadFile, setLetterheadFile] = React.useState<File | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const letterheadBuilderRef = React.useRef<HTMLDivElement | null>(null);
  const defaultProfile = React.useMemo(() => profiles.find((profile) => profile.is_default) || profiles[0] || null, [profiles]);
  const builderExportWidth = React.useMemo(() => getLetterheadExportWidth(letterheadForm.page_format), [letterheadForm.page_format]);

  const loadAssets = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await listDocumentAssets();
      setProfiles(response.profiles || []);
      setBankAccounts(response.bankAccounts || []);
      setLetterheads(response.letterheads || []);
      setCatalogItems(response.catalogItems || []);
    } catch (error: any) {
      toast({
        title: "Failed to load document assets",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (!canManage) return;
    void loadAssets();
  }, [canManage, loadAssets]);

  if (!authLoading && !canManage) {
    return <ViewAccessDenied title="Business Profile Not Available" message="You need organization settings access to manage company profiles, letterheads, bank accounts, and catalog items." backHref="/settings" backLabel="Back to Settings" />;
  }

  const openProfileSheet = (profile?: OrgDocumentProfile) => {
    if (profile) {
      setEditingProfileId(profile.id);
      setProfileForm(profileToForm(profile));
    } else {
      setEditingProfileId(null);
      setProfileForm(emptyProfileForm());
    }
    setIsProfileSheetOpen(true);
  };

  const openBankSheet = (account?: OrgBankAccount) => {
    if (account) {
      setEditingBankId(account.id);
      setBankForm(bankToForm(account));
    } else {
      setEditingBankId(null);
      setBankForm(emptyBankForm());
    }
    setIsBankSheetOpen(true);
  };

  const openCatalogSheet = (item?: OrgCatalogItem) => {
    if (item) {
      setEditingCatalogId(item.id);
      setCatalogForm(catalogToForm(item));
    } else {
      setEditingCatalogId(null);
      setCatalogForm(emptyCatalogForm());
    }
    setIsCatalogSheetOpen(true);
  };

  const openLetterheadSheet = (mode: "upload" | "builder" = "upload") => {
    const builderDefaults = emptyLetterheadBuilderForm(defaultProfile);
    setLetterheadSheetMode(mode);
    setLetterheadBuilderForm(builderDefaults);
    setLetterheadForm({
      ...emptyLetterheadForm(),
      name: builderDefaults.brand_name ? `${builderDefaults.brand_name} Letterhead` : "",
    });
    setLetterheadFile(null);
    setIsLetterheadSheetOpen(true);
  };

  const handleSaveProfile = async () => {
    setBusyKey("profile-save");
    try {
      if (editingProfileId) {
        await updateDocumentProfile(editingProfileId, profileForm);
        toast({ title: "Profile updated", description: "Company document profile saved." });
      } else {
        await createDocumentProfile(profileForm);
        toast({ title: "Profile created", description: "Company document profile added." });
      }
      setIsProfileSheetOpen(false);
      await loadAssets();
    } catch (error: any) {
      toast({
        title: "Failed to save profile",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveBank = async () => {
    setBusyKey("bank-save");
    try {
      if (editingBankId) {
        await updateBankAccount(editingBankId, bankForm);
        toast({ title: "Bank account updated", description: "Banking defaults saved." });
      } else {
        await createBankAccount(bankForm);
        toast({ title: "Bank account created", description: "Banking profile added." });
      }
      setIsBankSheetOpen(false);
      await loadAssets();
    } catch (error: any) {
      toast({
        title: "Failed to save bank account",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveCatalogItem = async () => {
    setBusyKey("catalog-save");
    try {
      const payload = {
        ...catalogForm,
        unit_price: toNumberOrNull(catalogForm.unit_price),
        tax_rate: toNumberOrNull(catalogForm.tax_rate),
      };
      if (editingCatalogId) {
        await updateCatalogItem(editingCatalogId, payload);
        toast({ title: "Catalog item updated", description: "Product or service details saved." });
      } else {
        await createCatalogItem(payload);
        toast({ title: "Catalog item created", description: "Product or service added." });
      }
      setIsCatalogSheetOpen(false);
      await loadAssets();
    } catch (error: any) {
      toast({
        title: "Failed to save catalog item",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const saveLetterheadFile = async (file: File, fallbackName?: string) => {
    try {
      const signed = await signLetterheadUpload(file.name, file.type);
      const dims = await getImageDimensions(file).catch(() => ({ width: null, height: null }));
      await uploadFileToSignedUrl(signed.signedUrl, file);
      await createLetterhead({
        name: letterheadForm.name.trim() || fallbackName || stripExtension(file.name),
        storage_key: signed.storageKey,
        storage_bucket: signed.bucket,
        mime_type: file.type,
        width_px: dims.width,
        height_px: dims.height,
        page_format: letterheadForm.page_format,
        placement: letterheadForm.placement,
        is_active: letterheadForm.is_active,
      });
      toast({ title: "Letterhead uploaded", description: "The letterhead is ready for document defaults." });
      setIsLetterheadSheetOpen(false);
      await loadAssets();
    } catch (error: any) {
      toast({
        title: "Failed to save letterhead",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUploadLetterhead = async () => {
    if (!letterheadFile) {
      toast({ title: "Choose a file", description: "Upload a PNG, JPG, or WebP letterhead image.", variant: "destructive" });
      return;
    }
    setBusyKey("letterhead-upload");
    try {
      await saveLetterheadFile(letterheadFile);
    } finally {
      setBusyKey(null);
    }
  };

  const renderBuilderCanvas = async () => {
    const exportNode = letterheadBuilderRef.current;
    if (!exportNode) throw new Error("Letterhead preview is not ready yet.");
    if (typeof document !== "undefined" && "fonts" in document) {
      try {
        await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
      } catch {
        // continue anyway
      }
    }
    await waitForNodeImages(exportNode);
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
    const nodeWidth = exportNode.offsetWidth || builderExportWidth;
    const nodeHeight = exportNode.offsetHeight || 220;
    const canvas = await html2canvas(exportNode, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      width: nodeWidth,
      height: nodeHeight,
    });
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      const dataUrl = canvas.toDataURL("image/png");
      blob = await fetch(dataUrl).then((res) => res.blob());
    }
    if (!blob) throw new Error("Failed to export the letterhead image.");
    return blob;
  };

  const handleSaveBuiltLetterhead = async () => {
    if (!letterheadBuilderForm.brand_name.trim()) {
      toast({ title: "Add a brand name", description: "The builder needs a company or brand name before export.", variant: "destructive" });
      return;
    }
    setBusyKey("letterhead-builder-save");
    try {
      const blob = await renderBuilderCanvas();
      const baseName = sanitizeFilenameBase(letterheadForm.name.trim() || `${letterheadBuilderForm.brand_name} letterhead`);
      const file = new File([blob], `${baseName}.png`, { type: "image/png" });
      await saveLetterheadFile(file, letterheadForm.name.trim() || `${letterheadBuilderForm.brand_name} Letterhead`);
    } catch (error: any) {
      toast({
        title: "Failed to save built letterhead",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleDownloadBuiltLetterhead = async () => {
    setBusyKey("letterhead-builder-download");
    try {
      const blob = await renderBuilderCanvas();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${sanitizeFilenameBase(letterheadForm.name.trim() || `${letterheadBuilderForm.brand_name} letterhead`)}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1500);
    } catch (error: any) {
      toast({
        title: "Failed to download letterhead",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-background/30 pb-10">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="px-6 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="md:hidden">
              <Link href="/settings">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Business Profile</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Manage company profiles, default letterheads, banking details, and product defaults for document generation.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 md:px-8">
        <Tabs defaultValue="profiles" className="space-y-6">
          <TabsList className="w-full justify-start overflow-x-auto bg-transparent border-b rounded-none p-0 h-10 space-x-6">
            <TabsTrigger value="profiles" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none p-0 pb-2">Profiles</TabsTrigger>
            <TabsTrigger value="letterheads" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none p-0 pb-2">Letterheads</TabsTrigger>
            <TabsTrigger value="banking" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none p-0 pb-2">Banking</TabsTrigger>
            <TabsTrigger value="catalog" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none p-0 pb-2">Products & Services</TabsTrigger>
          </TabsList>

          {/* Profiles Tab */}
          <TabsContent value="profiles" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Saved Profiles</h2>
                <p className="text-sm text-muted-foreground">Company identities used across templates.</p>
              </div>
              <Button onClick={() => openProfileSheet()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Profile
              </Button>
            </div>

            <div className="rounded-xl border border-border/50 bg-card/70 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : profiles.length === 0 ? (
                <EmptyState
                  title="No profiles yet"
                  description="Create your first company profile to seed document defaults."
                  action={
                    <Button onClick={() => openProfileSheet()}>
                      <Plus className="mr-2 h-4 w-4" /> Create Profile
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profile Name</TableHead>
                      <TableHead>Legal Entity</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map((profile) => (
                      <TableRow key={profile.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{profile.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{profile.legal_name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {[profile.city, profile.country].filter(Boolean).join(", ") || "—"}
                        </TableCell>
                        <TableCell>
                          {profile.is_default ? <Badge variant="secondary">Default</Badge> : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openProfileSheet(profile)}>
                                <PencilLine className="mr-2 h-4 w-4" />
                                Edit profile
                              </DropdownMenuItem>
                              {!profile.is_default && (
                                <DropdownMenuItem
                                  onClick={async () => {
                                    try {
                                      await setDefaultDocumentProfile(profile.id);
                                      toast({ title: "Default profile updated", description: `${profile.name} is now the active default.` });
                                      await loadAssets();
                                    } catch (error: any) {
                                      toast({ title: "Failed to set default", description: error?.message || "Please try again.", variant: "destructive" });
                                    }
                                  }}
                                >
                                  <Star className="mr-2 h-4 w-4" />
                                  Make default
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={async () => {
                                  try {
                                    await archiveDocumentProfile(profile.id);
                                    toast({ title: "Profile archived", description: `${profile.name} was archived.` });
                                    await loadAssets();
                                  } catch (error: any) {
                                    toast({ title: "Failed to archive profile", description: error?.message || "Please try again.", variant: "destructive" });
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Archive profile
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Letterheads Tab */}
          <TabsContent value="letterheads" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Saved Letterheads</h2>
                <p className="text-sm text-muted-foreground">One default letterhead is used for document flows.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => openLetterheadSheet("upload")}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Letterhead
                </Button>
                <Button onClick={() => openLetterheadSheet("builder")}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Build Letterhead
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Skeleton className="h-52 rounded-xl" />
                <Skeleton className="h-52 rounded-xl" />
              </div>
            ) : letterheads.length === 0 ? (
              <EmptyState
                title="No letterheads yet"
                description="Upload an image letterhead or build a simple branded one and save it as a PNG."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="outline" onClick={() => openLetterheadSheet("upload")}>
                      <Upload className="mr-2 h-4 w-4" /> Upload
                    </Button>
                    <Button onClick={() => openLetterheadSheet("builder")}>
                      <Sparkles className="mr-2 h-4 w-4" /> Build
                    </Button>
                  </div>
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {letterheads.map((letterhead) => (
                  <div key={letterhead.id} className="group overflow-hidden rounded-xl border border-border/50 bg-card/70 shadow-sm transition-all hover:border-border/80">
                    <div className="aspect-[16/7] bg-muted/20 relative">
                      {letterhead.preview_url ? (
                        <img src={letterhead.preview_url} alt={letterhead.name} className="h-full w-full object-contain bg-white" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Preview unavailable</div>
                      )}

                      <div className="absolute top-2 right-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="secondary" size="icon" className="h-8 w-8 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!letterhead.is_active && (
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    await activateLetterhead(letterhead.id);
                                    toast({ title: "Default letterhead updated", description: `${letterhead.name} is now the default letterhead.` });
                                    await loadAssets();
                                  } catch (error: any) {
                                    toast({ title: "Failed to set default", description: error?.message || "Please try again.", variant: "destructive" });
                                  }
                                }}
                              >
                                <BadgeCheck className="mr-2 h-4 w-4" />
                                Set as default
                              </DropdownMenuItem>
                            )}
                            {(!letterhead.is_active) && <DropdownMenuSeparator />}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={async () => {
                                try {
                                  await deleteLetterhead(letterhead.id);
                                  toast({ title: "Letterhead deleted" });
                                  await loadAssets();
                                } catch (error: any) {
                                  toast({ title: "Failed to delete", description: error?.message || "Please try again.", variant: "destructive" });
                                }
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="font-medium text-foreground truncate min-w-0 text-sm">{letterhead.name}</div>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1.5">
                          <FileImage className="h-3 w-3 shrink-0" />
                          <span>{letterhead.page_format} • {letterhead.placement}</span>
                        </div>
                      </div>
                      {letterhead.is_active ? <Badge variant="secondary" className="shrink-0">Default</Badge> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Banking Tab */}
          <TabsContent value="banking" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Saved Bank Accounts</h2>
                <p className="text-sm text-muted-foreground">Reusable bank details for invoices and receipts.</p>
              </div>
              <Button onClick={() => openBankSheet()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Account
              </Button>
            </div>

            <div className="rounded-xl border border-border/50 bg-card/70 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : bankAccounts.length === 0 ? (
                <EmptyState
                  title="No bank accounts yet"
                  description="Add a bank account so invoices and receipts can pull payment details consistently."
                  action={
                    <Button onClick={() => openBankSheet()}>
                      <Plus className="mr-2 h-4 w-4" /> Add Account
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bankAccounts.map((account) => (
                      <TableRow key={account.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{account.name}</span>
                            {account.is_default ? <Badge variant="secondary">Default</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{account.bank_name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{maskAccount(account.account_number)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("bg-transparent", account.is_active ? "text-emerald-500 border-emerald-500/30" : "text-muted-foreground")}>
                            {account.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openBankSheet(account)}>
                                <PencilLine className="mr-2 h-4 w-4" />
                                Edit account
                              </DropdownMenuItem>
                              {!account.is_default && (
                                <DropdownMenuItem
                                  onClick={async () => {
                                    try {
                                      await setDefaultBankAccount(account.id);
                                      toast({ title: "Default bank updated", description: `${account.name} is now the default account.` });
                                      await loadAssets();
                                    } catch (error: any) {
                                      toast({ title: "Failed to set default", description: error?.message || "Please try again.", variant: "destructive" });
                                    }
                                  }}
                                >
                                  <Star className="mr-2 h-4 w-4" />
                                  Make default
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={async () => {
                                  try {
                                    await deleteBankAccount(account.id);
                                    toast({ title: "Bank account removed", description: `${account.name} was deleted.` });
                                    await loadAssets();
                                  } catch (error: any) {
                                    toast({ title: "Failed to delete bank account", description: error?.message || "Please try again.", variant: "destructive" });
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete account
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Catalog Tab */}
          <TabsContent value="catalog" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Products & Services</h2>
                <p className="text-sm text-muted-foreground">Reusable catalog for fast quotation building.</p>
              </div>
              <Button onClick={() => openCatalogSheet()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>

            <div className="rounded-xl border border-border/50 bg-card/70 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : catalogItems.length === 0 ? (
                <EmptyState
                  title="No catalog items yet"
                  description="Add products or services so teams can reuse prices and units in business documents."
                  action={
                    <Button onClick={() => openCatalogSheet()}>
                      <Plus className="mr-2 h-4 w-4" /> Add Item
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogItems.map((item) => (
                      <TableRow key={item.id} className="group">
                        <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.sku || "—"}</TableCell>
                        <TableCell className="text-muted-foreground capitalize">{item.kind}</TableCell>
                        <TableCell className="text-right">
                          {item.unit_price == null ? "—" : <span className="font-mono">{item.currency} {item.unit_price}</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn("bg-transparent", item.is_active ? "text-emerald-500 border-emerald-500/30" : "text-muted-foreground")}>
                            {item.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openCatalogSheet(item)}>
                                <PencilLine className="mr-2 h-4 w-4" />
                                Edit item
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={async () => {
                                  try {
                                    await deleteCatalogItem(item.id);
                                    toast({ title: "Catalog item removed", description: `${item.name} was deleted.` });
                                    await loadAssets();
                                  } catch (error: any) {
                                    toast({ title: "Failed to delete item", description: error?.message || "Please try again.", variant: "destructive" });
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete item
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Profile Form Sheet */}
      <Sheet open={isProfileSheetOpen} onOpenChange={setIsProfileSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{editingProfileId ? "Edit Company Profile" : "Create Company Profile"}</SheetTitle>
            <SheetDescription>
              Set the company identity, address, and terms used by templates and letterhead flows.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Profile name</Label>
              <Input value={profileForm.name} onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Primary company profile" />
            </div>
            <div className="space-y-2">
              <Label>Legal name</Label>
              <Input value={profileForm.legal_name} onChange={(e) => setProfileForm((prev) => ({ ...prev, legal_name: e.target.value }))} placeholder="Legal entity name" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profileForm.email} onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="billing@company.com" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={profileForm.phone} onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="+91..." />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={profileForm.website} onChange={(e) => setProfileForm((prev) => ({ ...prev, website: e.target.value }))} placeholder="https://company.com" />
            </div>
            <div className="space-y-2">
              <Label>Default currency</Label>
              <Input value={profileForm.default_currency} onChange={(e) => setProfileForm((prev) => ({ ...prev, default_currency: e.target.value }))} placeholder="INR" />
            </div>
            <div className="space-y-2">
              <Label>Tax ID</Label>
              <Input value={profileForm.tax_id} onChange={(e) => setProfileForm((prev) => ({ ...prev, tax_id: e.target.value }))} placeholder="GST / VAT / EIN" />
            </div>
            <div className="space-y-2">
              <Label>Registration ID</Label>
              <Input value={profileForm.registration_id} onChange={(e) => setProfileForm((prev) => ({ ...prev, registration_id: e.target.value }))} placeholder="Company registration" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address line 1</Label>
              <Input value={profileForm.address_line1} onChange={(e) => setProfileForm((prev) => ({ ...prev, address_line1: e.target.value }))} placeholder="Street address" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address line 2</Label>
              <Input value={profileForm.address_line2} onChange={(e) => setProfileForm((prev) => ({ ...prev, address_line2: e.target.value }))} placeholder="Additional address information" />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={profileForm.city} onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={profileForm.state} onChange={(e) => setProfileForm((prev) => ({ ...prev, state: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Postal code</Label>
              <Input value={profileForm.postal_code} onChange={(e) => setProfileForm((prev) => ({ ...prev, postal_code: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={profileForm.country} onChange={(e) => setProfileForm((prev) => ({ ...prev, country: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Default payment terms</Label>
              <Textarea rows={3} value={profileForm.default_payment_terms} onChange={(e) => setProfileForm((prev) => ({ ...prev, default_payment_terms: e.target.value }))} placeholder="Net 30 / payment instructions" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Default notes</Label>
              <Textarea rows={4} value={profileForm.default_notes} onChange={(e) => setProfileForm((prev) => ({ ...prev, default_notes: e.target.value }))} placeholder="Reusable footer notes or disclaimers" />
            </div>
          </div>
          <div className="mt-8 flex flex-wrap flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/20 w-full sm:w-auto">
              <Switch checked={profileForm.is_default} onCheckedChange={(checked) => setProfileForm((prev) => ({ ...prev, is_default: checked }))} />
              <span className="text-sm font-medium">Set as default profile</span>
            </div>
            <Button className="w-full sm:w-auto" onClick={() => void handleSaveProfile()} disabled={busyKey === "profile-save" || !profileForm.name.trim()}>
              {busyKey === "profile-save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingProfileId ? "Save Profile" : "Create Profile"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bank Form Sheet */}
      <Sheet open={isBankSheetOpen} onOpenChange={setIsBankSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{editingBankId ? "Edit Bank Account" : "Add Bank Account"}</SheetTitle>
            <SheetDescription>
              Keep reusable banking details for invoices, receipts, and quotations.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={bankForm.name} onChange={(e) => setBankForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Primary settlement account" />
            </div>
            <div className="space-y-2">
              <Label>Beneficiary name</Label>
              <Input value={bankForm.beneficiary_name} onChange={(e) => setBankForm((prev) => ({ ...prev, beneficiary_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Bank name</Label>
              <Input value={bankForm.bank_name} onChange={(e) => setBankForm((prev) => ({ ...prev, bank_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Input value={bankForm.branch_name} onChange={(e) => setBankForm((prev) => ({ ...prev, branch_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Account number</Label>
              <Input value={bankForm.account_number} onChange={(e) => setBankForm((prev) => ({ ...prev, account_number: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={bankForm.currency} onChange={(e) => setBankForm((prev) => ({ ...prev, currency: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>IFSC</Label>
              <Input value={bankForm.ifsc_code} onChange={(e) => setBankForm((prev) => ({ ...prev, ifsc_code: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>SWIFT</Label>
              <Input value={bankForm.swift_code} onChange={(e) => setBankForm((prev) => ({ ...prev, swift_code: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>IBAN</Label>
              <Input value={bankForm.iban} onChange={(e) => setBankForm((prev) => ({ ...prev, iban: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={bankForm.notes} onChange={(e) => setBankForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional payment instructions" />
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 border rounded-md p-3 bg-muted/20">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch checked={bankForm.is_default} onCheckedChange={(checked) => setBankForm((prev) => ({ ...prev, is_default: checked }))} />
                Default account
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch checked={bankForm.is_active} onCheckedChange={(checked) => setBankForm((prev) => ({ ...prev, is_active: checked }))} />
                Active item
              </label>
            </div>
            <div className="flex justify-end mt-2">
              <Button className="w-full sm:w-auto" onClick={() => void handleSaveBank()} disabled={busyKey === "bank-save" || !bankForm.name.trim()}>
                {busyKey === "bank-save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingBankId ? "Save Account" : "Add Account"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Catalog Form Sheet */}
      <Sheet open={isCatalogSheetOpen} onOpenChange={setIsCatalogSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{editingCatalogId ? "Edit Catalog Item" : "Add Catalog Item"}</SheetTitle>
            <SheetDescription>
              Build a reusable product and service catalog with pricing defaults.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={catalogForm.name} onChange={(e) => setCatalogForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Annual support plan" />
            </div>
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input value={catalogForm.sku} onChange={(e) => setCatalogForm((prev) => ({ ...prev, sku: e.target.value }))} placeholder="SUPPORT-ANNUAL" />
            </div>
            <div className="space-y-2">
              <Label>Kind</Label>
              <Select value={catalogForm.kind} onValueChange={(value: "product" | "service") => setCatalogForm((prev) => ({ ...prev, kind: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Input value={catalogForm.unit} onChange={(e) => setCatalogForm((prev) => ({ ...prev, unit: e.target.value }))} placeholder="pcs / hours / months" />
            </div>
            <div className="space-y-2">
              <Label>Unit price</Label>
              <Input value={catalogForm.unit_price} onChange={(e) => setCatalogForm((prev) => ({ ...prev, unit_price: e.target.value }))} placeholder="4999.00" />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={catalogForm.currency} onChange={(e) => setCatalogForm((prev) => ({ ...prev, currency: e.target.value }))} placeholder="INR" />
            </div>
            <div className="space-y-2">
              <Label>Tax rate</Label>
              <Input value={catalogForm.tax_rate} onChange={(e) => setCatalogForm((prev) => ({ ...prev, tax_rate: e.target.value }))} placeholder="18" />
            </div>
            <div className="space-y-2">
              <Label>Tax code</Label>
              <Input value={catalogForm.tax_code} onChange={(e) => setCatalogForm((prev) => ({ ...prev, tax_code: e.target.value }))} placeholder="HSN / SAC" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Textarea rows={3} value={catalogForm.description} onChange={(e) => setCatalogForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Reusable scope or item description" />
            </div>
          </div>
          <div className="mt-8 flex flex-wrap flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <label className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/20 w-full sm:w-auto text-sm font-medium">
              <Switch checked={catalogForm.is_active} onCheckedChange={(checked) => setCatalogForm((prev) => ({ ...prev, is_active: checked }))} />
              Active item
            </label>
            <Button className="w-full sm:w-auto" onClick={() => void handleSaveCatalogItem()} disabled={busyKey === "catalog-save" || !catalogForm.name.trim()}>
              {busyKey === "catalog-save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingCatalogId ? "Save Item" : "Add Item"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Letterhead Form Sheet */}
      <Sheet open={isLetterheadSheetOpen} onOpenChange={setIsLetterheadSheetOpen}>
        <SheetContent className={cn("w-full overflow-y-auto", letterheadSheetMode === "builder" ? "sm:max-w-[1180px]" : "sm:max-w-xl")}>
          <SheetHeader className="mb-4">
            <SheetTitle>Create Letterhead</SheetTitle>
            <SheetDescription>
              Upload an existing image or build a clean branded header and save it as a reusable PNG.
            </SheetDescription>
          </SheetHeader>
          <Tabs value={letterheadSheetMode} onValueChange={(value) => setLetterheadSheetMode(value as "upload" | "builder")} className="space-y-4">
            <div className="flex items-center justify-between pb-1">
              <TabsList className="grid h-9 w-full sm:w-[240px] grid-cols-2">
                <TabsTrigger value="upload" className="text-xs">Upload Image</TabsTrigger>
                <TabsTrigger value="builder" className="text-xs">Build Simple</TabsTrigger>
              </TabsList>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-4 rounded-xl border border-border/50 bg-muted/10 p-4">
              <div className="space-y-2">
                <Label className="text-xs">Letterhead name</Label>
                <Input
                  className="h-9 text-sm"
                  value={letterheadForm.name}
                  onChange={(e) => setLetterheadForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Primary letterhead"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Page format</Label>
                <Select value={letterheadForm.page_format} onValueChange={(value) => setLetterheadForm((prev) => ({ ...prev, page_format: value }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Placement</Label>
                <Select value={letterheadForm.placement} onValueChange={(value) => setLetterheadForm((prev) => ({ ...prev, placement: value }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="header">Header</SelectItem>
                    <SelectItem value="footer">Footer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="upload" className="space-y-5">
              <div className="space-y-2">
                <Label>Image file</Label>
                <Input
                  className="cursor-pointer"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setLetterheadFile(file);
                    if (file && !letterheadForm.name.trim()) {
                      setLetterheadForm((prev) => ({ ...prev, name: stripExtension(file.name) }));
                    }
                  }}
                />
                {letterheadFile ? <div className="ml-1 mt-1.5 text-xs text-muted-foreground">Selected: {letterheadFile.name}</div> : null}
              </div>

              <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                Upload a finished PNG, JPG, or WebP file when your letterhead is already designed elsewhere.
              </div>
            </TabsContent>

            <TabsContent value="builder" className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                <div className="rounded-2xl border border-border/40 bg-card/40 overflow-hidden hide-scrollbar">
                  <Accordion type="single" collapsible defaultValue="brand" className="px-2 pb-2 pt-1 w-full">
                    {/* Branding Section */}
                    <AccordionItem value="brand" className="border-b border-border/50 last:border-0 px-2 overflow-hidden">
                      <AccordionTrigger className="hover:no-underline py-3 text-sm font-medium">Branding & Logo</AccordionTrigger>
                      <AccordionContent className="space-y-3 pt-1 pb-3">
                        <div className="space-y-2 mb-4 pb-4 border-b border-border/40">
                          <Label>Design Theme</Label>
                          <Select
                            value={letterheadBuilderForm.theme || "modern"}
                            onValueChange={(value) => setLetterheadBuilderForm((prev) => ({ ...prev, theme: value as any }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="modern">Modern Gradient</SelectItem>
                              <SelectItem value="minimal">Minimalist Line</SelectItem>
                              <SelectItem value="professional">Centered Professional</SelectItem>
                              <SelectItem value="elegant">Elegant Serif</SelectItem>
                              <SelectItem value="bold">Bold Block</SelectItem>
                              <SelectItem value="clean">Clean Corporate</SelectItem>
                              <SelectItem value="classic">Classic Two-Column</SelectItem>
                              <SelectItem value="creative">Creative Sidebar</SelectItem>
                              <SelectItem value="tech">Tech Startup</SelectItem>
                              <SelectItem value="organic">Organic Earth</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Brand name</Label>
                          <Input
                            value={letterheadBuilderForm.brand_name}
                            onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, brand_name: e.target.value }))}
                            placeholder="Briefly Docs"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Tagline</Label>
                          <Textarea
                            value={letterheadBuilderForm.tagline}
                            onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, tagline: e.target.value }))}
                            placeholder="AI document workflows for modern teams"
                            rows={2}
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Accent color</Label>
                            <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/80 px-3 py-2">
                              <Input
                                type="color"
                                value={letterheadBuilderForm.accent_color}
                                onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, accent_color: e.target.value }))}
                                className="h-7 w-12 cursor-pointer border-0 bg-transparent p-0"
                              />
                              <Input
                                value={letterheadBuilderForm.accent_color}
                                onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, accent_color: e.target.value }))}
                                className="h-7 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Text color</Label>
                            <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/80 px-3 py-2">
                              <Input
                                type="color"
                                value={letterheadBuilderForm.text_color}
                                onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, text_color: e.target.value }))}
                                className="h-7 w-12 cursor-pointer border-0 bg-transparent p-0"
                              />
                              <Input
                                value={letterheadBuilderForm.text_color}
                                onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, text_color: e.target.value }))}
                                className="h-7 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Monogram</Label>
                          <Input
                            value={letterheadBuilderForm.monogram}
                            maxLength={3}
                            onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, monogram: e.target.value.toUpperCase().slice(0, 3) }))}
                            placeholder="BD"
                          />
                        </div>

                        <div className="space-y-3 mt-5 pt-4 border-t border-border/40">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <Label>Logo image (Optional)</Label>
                              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                Replaces monogram if uploaded.
                              </p>
                            </div>
                            {letterheadBuilderForm.logo_data_url ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setLetterheadBuilderForm((prev) => ({ ...prev, logo_data_url: "" }))}
                              >
                                Remove
                              </Button>
                            ) : null}
                          </div>

                          <Input
                            className="cursor-pointer text-xs h-8"
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={async (e) => {
                              const file = e.target.files?.[0] || null;
                              if (!file) return;
                              try {
                                const dataUrl = await readFileAsDataUrl(file);
                                setLetterheadBuilderForm((prev) => ({ ...prev, logo_data_url: dataUrl }));
                              } catch (error: any) {
                                toast({
                                  title: "Failed to load logo",
                                  description: error?.message || "Please try another image.",
                                  variant: "destructive",
                                });
                              } finally {
                                e.currentTarget.value = "";
                              }
                            }}
                          />

                          {letterheadBuilderForm.logo_data_url ? (
                            <div className="flex flex-col gap-3 mt-3">
                              <div className="flex h-12 w-20 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-white">
                                <img src={letterheadBuilderForm.logo_data_url} alt="Logo" className="max-h-8 max-w-16 object-contain" />
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Alignment</Label>
                                  <Select
                                    value={letterheadBuilderForm.logo_alignment}
                                    onValueChange={(value) => setLetterheadBuilderForm((prev) => ({ ...prev, logo_alignment: value as "left" | "right" }))}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="left">Left</SelectItem>
                                      <SelectItem value="right">Right</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Size</Label>
                                  <Select
                                    value={letterheadBuilderForm.logo_scale}
                                    onValueChange={(value) => setLetterheadBuilderForm((prev) => ({ ...prev, logo_scale: value as "small" | "medium" | "large" }))}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="small">Small</SelectItem>
                                      <SelectItem value="medium">Medium</SelectItem>
                                      <SelectItem value="large">Large</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Contact Section */}
                    <AccordionItem value="contact" className="border-b border-border/50 last:border-0 px-2 overflow-hidden">
                      <AccordionTrigger className="hover:no-underline py-3 text-sm font-medium">Contact Details</AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-1 pb-4">
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input
                            value={letterheadBuilderForm.email}
                            onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, email: e.target.value }))}
                            placeholder="support@briefly.local"
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input
                              value={letterheadBuilderForm.phone}
                              onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, phone: e.target.value }))}
                              placeholder="+91 80 4567 8901"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Website</Label>
                            <Input
                              value={letterheadBuilderForm.website}
                              onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, website: e.target.value }))}
                              placeholder="briefly.local"
                            />
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Legal / Address Section */}
                    <AccordionItem value="address" className="border-b border-border/50 last:border-0 px-2 overflow-hidden">
                      <AccordionTrigger className="hover:no-underline py-3 text-sm font-medium">Address & Legal</AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-1 pb-4">
                        <div className="space-y-2">
                          <Label>Address line</Label>
                          <Input
                            value={letterheadBuilderForm.address_line}
                            onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, address_line: e.target.value }))}
                            placeholder="8th Floor, Brigade Tech Gardens"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>City / region line</Label>
                          <Input
                            value={letterheadBuilderForm.city_line}
                            onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, city_line: e.target.value }))}
                            placeholder="Bengaluru, Karnataka, 560048, India"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Registration line</Label>
                          <Input
                            value={letterheadBuilderForm.registration_line}
                            onChange={(e) => setLetterheadBuilderForm((prev) => ({ ...prev, registration_line: e.target.value }))}
                            placeholder="GSTIN 29ABCDE1234F1Z5 | CIN-DEMO-EX"
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/50 bg-card/60 p-4">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Live Preview</div>
                        <div className="mt-1 text-xs text-muted-foreground">This preview exports exactly as a PNG when you save it.</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => void handleDownloadBuiltLetterhead()} disabled={busyKey === "letterhead-builder-download"}>
                        {busyKey === "letterhead-builder-download" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download PNG
                      </Button>
                    </div>
                    <div className="overflow-x-auto rounded-2xl bg-muted/20 p-3">
                      {/* Scaled visual-only preview – no ref, not exported */}
                      <LetterheadBuilderPreview
                        builder={letterheadBuilderForm}
                        exportWidth={builderExportWidth}
                      />
                      {/* Off-screen inline-styled canvas used by html2canvas for export */}
                      <div
                        aria-hidden
                        style={{
                          position: "fixed",
                          top: 0,
                          left: -99999,
                          pointerEvents: "none",
                          zIndex: -1,
                          opacity: 0,
                        }}
                      >
                        <LetterheadBuilderInlineCanvas
                          builder={letterheadBuilderForm}
                          exportRef={letterheadBuilderRef}
                          exportWidth={builderExportWidth}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-8 flex flex-wrap flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex w-full items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 sm:w-auto">
              <Switch checked={letterheadForm.is_active} onCheckedChange={(checked) => setLetterheadForm((prev) => ({ ...prev, is_active: checked }))} />
              <span className="text-sm font-medium">
                {letterheadSheetMode === "builder" ? "Set as default after saving" : "Set as default after upload"}
              </span>
            </div>
            {letterheadSheetMode === "builder" ? (
              <Button className="w-full sm:w-auto" onClick={() => void handleSaveBuiltLetterhead()} disabled={busyKey === "letterhead-builder-save"}>
                {busyKey === "letterhead-builder-save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Export and Save Image
              </Button>
            ) : (
              <Button className="w-full sm:w-auto" onClick={() => void handleUploadLetterhead()} disabled={busyKey === "letterhead-upload" || !letterheadFile}>
                {busyKey === "letterhead-upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload Letterhead
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
