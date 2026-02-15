import {
  Check,
  ChevronDown,
  FileText,
  FilePlus2,
  Folder,
  Globe,
  ArrowLeftRight,
  Send,
  Search,
  Sparkles,
  Settings2,
  X,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FinderPicker } from "@/components/pickers/finder-picker";

// -------------------- Types --------------------
export type FolderOption = { id: string; name: string; path?: string[] };
export type DocumentOption = {
  id: string;
  name: string;
  folderId?: string;
  subtitle?: string;
  pathLabel?: string;
};
export type ChatScope = "all" | "folder" | "document";

export type BrieflyChatBoxProps = {
  folders?: FolderOption[]; // options for folder mode
  documents?: DocumentOption[]; // options for document mode
  defaultMode?: ChatScope;
  defaultWebSearch?: boolean;
  defaultDeepResearch?: boolean;
  deepResearchEnabled?: boolean;
  onDeepResearchChange?: (value: boolean) => void;
  defaultFolderId?: string | null;
  defaultDocumentId?: string | null;
  defaultDocumentName?: string | null;
  placeholder?: string;
  pinnedDocIds?: string[];
  onPinnedDocIdsChange?: (ids: string[]) => void;
  onRequestFilePicker?: () => void;
  onRequestCreateDraftDocument?: () => void;
  webSearch?: boolean;
  onWebSearchChange?: (value: boolean) => void;
  // Fired when user presses Send or hits Enter (without Shift)
  onSend?: (payload: {
    text: string;
    mode: ChatScope;
    folderId?: string | null;
    documentId?: string | null;
    folderName?: string | null;
    documentName?: string | null;
    webSearch: boolean;
    deepResearch: boolean;
  }) => void;
  sending?: boolean; // external loading control
  className?: string;
};

// -------------------- Combobox --------------------
function Combobox<T extends { id: string; name: string; path?: string[] }>({
  value,
  onChange,
  options,
  placeholder,
  empty,
  icon: Icon,
  label,
  triggerLabel,
}: {
  value?: string | null;
  onChange: (id: string | null) => void;
  options: T[];
  placeholder?: string;
  empty?: string;
  icon?: any;
  label?: string;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.find((o) => o.id === value) || null,
    [options, value]
  );
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => {
      const raw = (o as any).path ? ((o as any).path as string[]).join("/") : o.name;
      return (raw || "").toLowerCase().includes(q);
    });
  }, [options, query]);

  const formatName = (opt: T) => {
    const raw = (opt as any).path ? ((opt as any).path as string[]).join(" / ") : opt.name || "";
    return raw.replace(/^\s*\[folder\]\s*/i, "");
  };

  const shorten = (text: string, max = 60) => {
    if (!text) return text;
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      {label ? (
        <Label className="text-xs text-muted-foreground">{label}</Label>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-9 min-w-[120px] sm:min-w-[220px] w-full max-w-full justify-between rounded-xl border-dashed px-2 sm:px-3"
          >
            <span className="flex items-center gap-2 min-w-0">
              {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
              <span className="truncate">
                {selected ? (
                  <span className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    <span className="hidden sm:inline">{shorten(formatName(selected as T))}</span>
                    <span className="sm:hidden">Selected</span>
                  </span>
                ) : triggerLabel}
              </span>
            </span>
            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="p-2">
            <div className="flex items-center gap-2 px-1 pb-2">
              <Search className="h-4 w-4 opacity-50" />
              <Input
                placeholder={`Search ${placeholder || "items"}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ScrollArea className="max-h-64">
              {filtered.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  {empty || "No results found."}
                </div>
              ) : (
                <div className="py-1">
                  {filtered.map((opt) => (
                    <button
                      key={opt.id}
                      className="w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-muted/60 flex items-center gap-2"
                      onClick={() => {
                        onChange(opt.id);
                        setOpen(false);
                      }}
                      type="button"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === opt.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{formatName(opt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </PopoverContent>
      </Popover>
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          aria-label="Clear selection"
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

// -------------------- Mode Popover --------------------
function ModePopover({
  mode,
  setMode,
}: {
  mode: ChatScope;
  setMode: (m: ChatScope) => void;
}) {
  const [open, setOpen] = useState(false);

  const items: Array<{
    value: ChatScope;
    label: string;
    helper: string;
    icon: any;
  }> = [
      { value: "all", label: "Global", helper: "Entire workspace", icon: Globe },
      { value: "folder", label: "Folder", helper: "One folder only", icon: Folder },
      { value: "document", label: "File", helper: "One file only", icon: FileText },
    ];

  const current = items.find((i) => i.value === mode) ?? items[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-8 min-w-[100px] rounded-lg px-2.5 text-xs justify-between"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <current.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{current.label}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-1.5" align="start" sideOffset={6}>
        <div className="space-y-1">
          {items.map((i) => {
            const active = i.value === mode;
            return (
              <button
                key={i.value}
                type="button"
                onClick={() => {
                  setMode(i.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                  "hover:bg-muted/50",
                  active
                    ? "border-primary/30 bg-primary/5"
                    : "border-transparent"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <i.icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{i.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{i.helper}</div>
                    </div>
                  </div>
                  <Check className={cn("h-3.5 w-3.5 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// -------------------- Main Component --------------------
export function BrieflyChatBox({
  folders = [],
  documents = [],
  defaultMode = "all",
  defaultWebSearch = false,
  defaultDeepResearch = false,
  deepResearchEnabled,
  onDeepResearchChange,
  defaultFolderId = null,
  defaultDocumentId = null,
  defaultDocumentName = null,
  placeholder = "Ask anything…",
  pinnedDocIds = [],
  onPinnedDocIdsChange,
  onRequestFilePicker,
  onRequestCreateDraftDocument,
  webSearch,
  onWebSearchChange,
  onSend,
  sending = false,
  className,
}: BrieflyChatBoxProps) {
  const [mode, setMode] = useState<ChatScope>(defaultMode);
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId);
  const [documentId, setDocumentId] = useState<string | null>(defaultDocumentId);
  const isWebSearchControlled = typeof webSearch === 'boolean';
  const [internalWebSearch, setInternalWebSearch] = useState(defaultWebSearch);
  const isDeepResearchControlled = typeof deepResearchEnabled === 'boolean';
  const [internalDeepResearch, setInternalDeepResearch] = useState(defaultDeepResearch);
  const [text, setText] = useState("");
  const [selectionHint, setSelectionHint] = useState<string | null>(null);
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [selectedDocumentMeta, setSelectedDocumentMeta] = useState<DocumentOption | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    setFolderId(defaultFolderId);
  }, [defaultFolderId]);

  useEffect(() => {
    setDocumentId(defaultDocumentId);
  }, [defaultDocumentId]);

  useEffect(() => {
    if (!documentId) {
      setSelectedDocumentMeta(null);
      return;
    }
    const found = documents.find((d) => d.id === documentId) || null;
    if (found) {
      setSelectedDocumentMeta(found);
    }
  }, [documentId, documents]);

  useEffect(() => {
    if (!isWebSearchControlled) {
      setInternalWebSearch(defaultWebSearch);
    }
  }, [defaultWebSearch, isWebSearchControlled]);

  useEffect(() => {
    if (!isDeepResearchControlled) {
      setInternalDeepResearch(defaultDeepResearch);
    }
  }, [defaultDeepResearch, isDeepResearchControlled]);

  // Keep scope state clean: switching modes drops stale selections from other modes.
  useEffect(() => {
    if (mode === "all") {
      setFolderId(null);
      setDocumentId(null);
      setSelectedDocumentMeta(null);
      setSelectionHint(null);
      return;
    }
    if (mode === "folder") {
      setDocumentId(null);
      setSelectedDocumentMeta(null);
      setSelectionHint(null);
      return;
    }
    if (mode === "document") {
      setFolderId(null);
      setSelectionHint(null);
    }
  }, [mode]);

  const effectiveWebSearch = isWebSearchControlled ? (webSearch as boolean) : internalWebSearch;
  const effectiveDeepResearch = isDeepResearchControlled
    ? (deepResearchEnabled as boolean)
    : internalDeepResearch;

  const docMetaById = useMemo(() => {
    const m = new Map<string, DocumentOption>();
    for (const d of documents) m.set(d.id, d);
    return m;
  }, [documents]);

  const triggerFilePicker = () => {
    onRequestFilePicker?.();
    // Keep focus for continued typing
    setTimeout(() => areaRef.current?.focus(), 0);
  };

  const triggerCreateDraftDocument = () => {
    onRequestCreateDraftDocument?.();
    setTimeout(() => areaRef.current?.focus(), 0);
  };

  const handleWebSearchToggle = (next: boolean) => {
    if (!isWebSearchControlled) {
      setInternalWebSearch(next);
    }
    onWebSearchChange?.(next);
  };

  const handleDeepResearchToggle = (next: boolean) => {
    if (!isDeepResearchControlled) {
      setInternalDeepResearch(next);
    }
    onDeepResearchChange?.(next);
  };

  const canSend = useMemo(() => {
    return Boolean(text.trim());
  }, [text]);

  const selectedFolderPath = useMemo(() => (folderId || "").split("/").filter(Boolean), [folderId]);
  const selectedFolder = useMemo(() => {
    if (!folderId) return null;
    const matched = folders.find((f) => f.id === folderId);
    const title = matched?.name || selectedFolderPath[selectedFolderPath.length - 1] || "Root";
    const pathLabel = selectedFolderPath.length > 0 ? `/${selectedFolderPath.join("/")}` : "/Root";
    return { title, pathLabel };
  }, [folderId, folders, selectedFolderPath]);

  const selectedDocument = useMemo(() => {
    if (!documentId) return null;
    const fromOptions = documents.find((d) => d.id === documentId);
    if (fromOptions) return fromOptions;
    if (selectedDocumentMeta?.id === documentId) return selectedDocumentMeta;
    if (defaultDocumentName) {
      return {
        id: documentId,
        name: defaultDocumentName,
      } as DocumentOption;
    }
    return null;
  }, [defaultDocumentName, documentId, documents, selectedDocumentMeta]);

  useEffect(() => {
    if (mode === "folder" && folderId) setSelectionHint(null);
    if (mode === "document" && documentId) setSelectionHint(null);
    if (mode === "all") setSelectionHint(null);
  }, [mode, folderId, documentId]);

  function handleSubmit() {
    if (!canSend || sending) return;
    if (mode === "folder" && !folderId) {
      setSelectionHint("Choose a folder, or switch scope to Global.");
      return;
    }
    if (mode === "document" && !documentId) {
      setSelectionHint("Choose a file, or switch scope to Global.");
      return;
    }

    setSelectionHint(null);
    onSend?.({
      text: text.trim(),
      mode,
      folderId: mode === "folder" ? folderId : null,
      documentId: mode === "document" ? documentId : null,
      folderName: mode === "folder" ? selectedFolder?.title || null : null,
      documentName: mode === "document" ? selectedDocument?.name || defaultDocumentName || null : null,
      webSearch: effectiveWebSearch,
      deepResearch: effectiveDeepResearch,
    });
    setText("");
    // Keep selection but you can reset if desired:
    // setFolderId(null); setDocumentId(null);
    areaRef.current?.focus();
  }

  return (
    <div
      className={cn(
        "w-full rounded-2xl border bg-background p-3 shadow-sm sm:p-4",
        "flex flex-col gap-3",
        className
      )}
    >
      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <ModePopover mode={mode} setMode={setMode} />
          {pinnedDocIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {pinnedDocIds.slice(0, 2).map((id) => {
                const docMeta = docMetaById.get(id);
                const name = docMeta?.name || "Untitled";
                const subtitle = docMeta?.subtitle?.trim() || "";
                const ext = name.includes(".")
                  ? name.split(".").pop()?.toUpperCase().slice(0, 4) || "FILE"
                  : "FILE";
                return (
                  <div
                    key={id}
                    className={cn(
                      "flex max-w-[260px] items-start gap-2 rounded-xl border border-border bg-muted/70 px-2.5 py-1.5",
                      "shadow-sm transition-all hover:bg-muted"
                    )}
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium leading-tight">{name}</div>
                      {subtitle ? (
                        <div className="truncate text-[10px] leading-tight text-muted-foreground">
                          {subtitle}
                        </div>
                      ) : null}
                    </div>
                    <span className="rounded border border-border/50 bg-background/60 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                      {ext}
                    </span>
                    {onPinnedDocIdsChange ? (
                      <button
                        type="button"
                        className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Remove file"
                        onClick={() => onPinnedDocIdsChange(pinnedDocIds.filter((d) => d !== id))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {mode !== "all" && (
            <div className="flex items-center gap-1.5 min-w-0">
              {mode === "folder" && selectedFolder && (
                <div className="max-w-[220px] rounded-md border bg-muted/20 px-2 py-1">
                  <div className="text-[11px] font-medium leading-tight truncate">{selectedFolder.title}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight truncate">{selectedFolder.pathLabel}</div>
                </div>
              )}

              {mode === "document" && selectedDocument && (
                <div className="max-w-[220px] rounded-md border bg-muted/20 px-2 py-1">
                  <div className="text-[11px] font-medium leading-tight truncate">{selectedDocument.name || "Selected file"}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight truncate">
                    {selectedDocument.subtitle || selectedDocument.pathLabel || "File selected"}
                  </div>
                </div>
              )}

              {mode === "folder" && !selectedFolder && (
                <div className="text-[11px] text-muted-foreground px-1">No folder selected</div>
              )}
              {mode === "document" && !selectedDocument && (
                <div className="text-[11px] text-muted-foreground px-1">No file selected</div>
              )}

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-md"
                onClick={() => setScopePickerOpen(true)}
                aria-label={mode === "folder" ? (selectedFolder ? "Change folder" : "Choose folder") : (selectedDocument ? "Change file" : "Choose file")}
                title={mode === "folder" ? (selectedFolder ? "Change folder" : "Choose folder") : (selectedDocument ? "Change file" : "Choose file")}
              >
                {(mode === "folder" ? Boolean(selectedFolder) : Boolean(selectedDocument)) ? (
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                ) : mode === "folder" ? (
                  <Folder className="h-3.5 w-3.5" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
              </Button>

              {((mode === "folder" && selectedFolder) || (mode === "document" && selectedDocument)) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md"
                  aria-label="Clear scope selection"
                  onClick={() => {
                    if (mode === "folder") setFolderId(null);
                    if (mode === "document") {
                      setDocumentId(null);
                      setSelectedDocumentMeta(null);
                    }
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={effectiveDeepResearch ? "default" : "outline"}
            size="sm"
            className="h-9 rounded-xl px-3"
            onClick={() => handleDeepResearchToggle(!effectiveDeepResearch)}
            title="Toggle deep research mode"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="ml-1.5 text-xs font-medium">Deep</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-xl"
                title="Add actions"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  triggerFilePicker();
                }}
              >
                <FileText className="h-4 w-4" />
                <span>Ask About Files</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!onRequestCreateDraftDocument}
                onSelect={(event) => {
                  event.preventDefault();
                  triggerCreateDraftDocument();
                }}
              >
                <FilePlus2 className="h-4 w-4" />
                <span>Create Document</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selectionHint ? (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          {selectionHint}
        </div>
      ) : null}

      {/* Input Row */}
      <div className="flex items-end gap-2 min-w-0">
        <div className="relative w-full flex-1 min-w-0">
          <Textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            className={cn(
              "min-h-[60px] w-full flex-1 min-w-0 resize-none border-0 bg-transparent p-3 text-sm shadow-none focus-visible:ring-0",
              "pl-0"
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>
        <Button
          type="button"
          disabled={!canSend || sending}
          onClick={handleSubmit}
          className="h-10 w-11 sm:w-auto rounded-2xl px-0 sm:px-4 justify-center"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only sm:hidden">{sending ? "Sending…" : "Send"}</span>
          <span className="hidden sm:inline ml-2">{sending ? "Sending…" : "Send"}</span>
        </Button>
      </div>

      <FinderPicker
        open={scopePickerOpen && mode !== "all"}
        onOpenChange={setScopePickerOpen}
        mode={mode === "folder" ? "folder" : "doc"}
        maxDocs={1}
        initialPath={mode === "folder" ? selectedFolderPath : []}
        initialSelectedDocIds={mode === "document" && documentId ? [documentId] : []}
        onConfirm={({ path, docs }) => {
          if (mode === "folder") {
            const nextPath = Array.isArray(path) ? path.filter(Boolean) : [];
            setFolderId(nextPath.length > 0 ? nextPath.join("/") : null);
            setSelectionHint(null);
            return;
          }
          const firstDoc = Array.isArray(docs) ? docs[0] : null;
          if (!firstDoc?.id) {
            setDocumentId(null);
            setSelectedDocumentMeta(null);
            setSelectionHint(null);
            return;
          }
          const filename = String((firstDoc as any)?.filename || (firstDoc as any)?.name || (firstDoc as any)?.title || "Selected file");
          const title = String((firstDoc as any)?.title || "").trim();
          const subtitle = title && title.toLowerCase() !== filename.toLowerCase() ? title : undefined;
          const folderPath = Array.isArray((firstDoc as any)?.folderPath)
            ? ((firstDoc as any).folderPath as string[]).filter(Boolean)
            : [];
          const pathLabel = folderPath.length > 0 ? `/${folderPath.join("/")}` : "/Root";
          setSelectedDocumentMeta({
            id: firstDoc.id,
            name: filename,
            subtitle,
            pathLabel,
          });
          setDocumentId(firstDoc.id);
          setSelectionHint(null);
        }}
      />
    </div>
  );
}

export default BrieflyChatBox;
