import {
  Check,
  ChevronDown,
  FileText,
  Folder,
  Globe,
  Send,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

// -------------------- Types --------------------
export type FolderOption = { id: string; name: string; path?: string[] };
export type DocumentOption = { id: string; name: string; folderId?: string };
export type ChatScope = "all" | "folder" | "document";

export type BrieflyChatBoxProps = {
  folders?: FolderOption[]; // options for folder mode
  documents?: DocumentOption[]; // options for document mode
  defaultMode?: ChatScope;
  defaultWebSearch?: boolean;
  defaultFolderId?: string | null;
  defaultDocumentId?: string | null;
  placeholder?: string;
  pinnedDocIds?: string[];
  onPinnedDocIdsChange?: (ids: string[]) => void;
  onRequestFilePicker?: () => void;
  webSearch?: boolean;
  onWebSearchChange?: (value: boolean) => void;
  // Fired when user presses Send or hits Enter (without Shift)
  onSend?: (payload: {
    text: string;
    mode: ChatScope;
    folderId?: string | null;
    documentId?: string | null;
    webSearch: boolean;
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
    desc: string;
    icon: any;
  }> = [
      { value: "all", label: "All (Global)", desc: "Search across everything", icon: Globe },
      { value: "folder", label: "Folder specific", desc: "Limit to one folder", icon: Folder },
      { value: "document", label: "Document specific", desc: "Limit to one document", icon: FileText },
    ];

  const current = items.find((i) => i.value === mode) ?? items[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 rounded-xl px-2 sm:px-3">
          <span className="flex items-center gap-1.5 sm:gap-2">
            <current.icon className="h-4 w-4" />
            {mode === 'all' ? (
              <>
                <span className="text-xs hidden sm:inline">{current.label}</span>
                <span className="text-xs sm:hidden">All</span>
              </>
            ) : (
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs hidden sm:inline">{current.label}</span>
                <span className="text-xs sm:hidden">Selected</span>
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-3" align="start">
        <div className="space-y-3">
          {/* Scope radio group */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Scope</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => {
                setMode(v as ChatScope);
                setOpen(false);
              }}
            >
              {items.map((i) => (
                <label
                  key={i.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/50",
                  )}
                >
                  <RadioGroupItem value={i.value} className="mt-0.5" />
                  <div className="flex flex-1 items-start gap-2">
                    <i.icon className="mt-0.5 h-4 w-4" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-none">{i.label}</div>
                      <div className="text-xs text-muted-foreground">{i.desc}</div>
                    </div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>
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
  defaultFolderId = null,
  defaultDocumentId = null,
  placeholder = "Ask anything…",
  pinnedDocIds = [],
  onPinnedDocIdsChange,
  onRequestFilePicker,
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
  const [text, setText] = useState("");
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashTokenStart, setSlashTokenStart] = useState<number | null>(null);

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
    if (!isWebSearchControlled) {
      setInternalWebSearch(defaultWebSearch);
    }
  }, [defaultWebSearch, isWebSearchControlled]);

  const effectiveWebSearch = isWebSearchControlled ? (webSearch as boolean) : internalWebSearch;

  const docNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of documents) m.set(d.id, d.name);
    return m;
  }, [documents]);

  const removeSlashToken = () => {
    setText((prev) => {
      if (slashTokenStart === null) return prev;
      const head = prev.slice(0, slashTokenStart);
      return head.replace(/\s+$/, "");
    });
    setSlashMenuOpen(false);
    setSlashTokenStart(null);
  };

  const triggerFilePicker = () => {
    removeSlashToken();
    onRequestFilePicker?.();
    // Keep focus for continued typing
    setTimeout(() => areaRef.current?.focus(), 0);
  };

  const handleWebSearchToggle = (next: boolean) => {
    if (!isWebSearchControlled) {
      setInternalWebSearch(next);
    }
    onWebSearchChange?.(next);
  };

  const canSend = useMemo(() => {
    if (!text.trim()) return false;
    if (mode === "folder" && !folderId) return false;
    if (mode === "document" && !documentId) return false;
    return true;
  }, [text, mode, folderId, documentId]);

  function handleSubmit() {
    if (!canSend || sending) return;
    onSend?.({
      text: text.trim(),
      mode,
      folderId: mode === "folder" ? folderId : null,
      documentId: mode === "document" ? documentId : null,
      webSearch: effectiveWebSearch,
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
      {/* Pinned Files */}
      {pinnedDocIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs text-muted-foreground">
            Pinned files (override scope)
          </div>
          {pinnedDocIds.slice(0, 2).map((id, idx) => (
            <div
              key={id}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1",
                "bg-muted/20"
              )}
            >
              <span className="text-xs font-medium">File {idx + 1}:</span>
              <span className="text-xs truncate max-w-[220px]">{docNameById.get(id) || "Untitled"}</span>
              {onPinnedDocIdsChange ? (
                <button
                  type="button"
                  className="rounded-full hover:bg-muted/60 p-1"
                  aria-label={`Remove file ${idx + 1}`}
                  onClick={() => onPinnedDocIdsChange(pinnedDocIds.filter((d) => d !== id))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))}
          {onPinnedDocIdsChange ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onPinnedDocIdsChange([])}
            >
              Clear
            </Button>
          ) : null}
        </div>
      )}

      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <ModePopover mode={mode} setMode={setMode} />

          {mode === "folder" && (
            <Combobox
              value={folderId}
              onChange={setFolderId}
              options={folders}
              placeholder="folders"
              empty="No folders found"
              icon={Folder}
              label="Scope"
              triggerLabel="folders"
            />
          )}

          {mode === "document" && (
            <Combobox
              value={documentId}
              onChange={setDocumentId}
              options={documents}
              placeholder="documents"
              empty="No documents found"
              icon={FileText}
              label="Scope"
              triggerLabel="documents"
            />
          )}
        </div>

      </div>

      {/* Input Row */}
      <div className="flex items-end gap-2 min-w-0">
        <div className="relative w-full flex-1 min-w-0">
          {slashMenuOpen && (
            <div className="absolute bottom-full mb-2 left-0 w-[240px] rounded-xl border bg-background shadow-lg p-1 z-20">
              <button
                type="button"
                className="w-full flex items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted/60"
                onMouseDown={(e) => {
                  // Keep focus in the textarea
                  e.preventDefault();
                  triggerFilePicker();
                }}
              >
                <FileText className="h-4 w-4 mt-0.5 opacity-80" />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-none">File</div>
                  <div className="text-xs text-muted-foreground">Pin up to 2 files for this chat</div>
                </div>
              </button>
            </div>
          )}
          <Textarea
            ref={areaRef}
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              // Slash command detection (token must start after whitespace or at beginning)
              const lastSlash = next.lastIndexOf("/");
              if (lastSlash === -1) {
                setSlashMenuOpen(false);
                setSlashTokenStart(null);
                return;
              }
              const before = lastSlash > 0 ? next[lastSlash - 1] : "";
              const validBoundary = lastSlash === 0 || /\s/.test(before);
              if (!validBoundary) {
                setSlashMenuOpen(false);
                setSlashTokenStart(null);
                return;
              }
              const tail = next.slice(lastSlash + 1);
              // Only show when cursor is at end-of-token (no spaces/newlines after slash)
              if (tail.includes(" ") || tail.includes("\n")) {
                setSlashMenuOpen(false);
                setSlashTokenStart(null);
                return;
              }
              const q = tail.trim().toLowerCase();
              if (q === "" || "file".startsWith(q)) {
                setSlashMenuOpen(true);
                setSlashTokenStart(lastSlash);
              } else {
                setSlashMenuOpen(false);
                setSlashTokenStart(null);
              }
            }}
            placeholder={placeholder}
            className={cn(
              "min-h-[60px] w-full flex-1 min-w-0 resize-none rounded-2xl border bg-muted/20 p-3 text-sm",
              "focus-visible:ring-1"
            )}
            onKeyDown={(e) => {
              if (slashMenuOpen && (e.key === "Enter" || e.key === "Tab")) {
                e.preventDefault();
                triggerFilePicker();
                return;
              }
              if (slashMenuOpen && e.key === "Escape") {
                e.preventDefault();
                setSlashMenuOpen(false);
                setSlashTokenStart(null);
                return;
              }
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

      {/* Helper Row removed per UX request */}
    </div>
  );
}

export default BrieflyChatBox;
