"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, FileText, Search, X, Folder, Check } from "lucide-react";
import type { StoredDocument } from "@/lib/types";
import { cn } from "@/lib/utils";

type Item =
  | { kind: "folder"; path: string[]; name: string; hasChildren: boolean }
  | { kind: "doc"; doc: StoredDocument; displayTitle: string; folderPath: string[] };

export function VersionLinkPickerDialog({
  open,
  onOpenChange,
  title = "Select document to link as new version",
  documents,
  folders,
  initialPath = [],
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  documents: StoredDocument[];
  folders: string[][];
  initialPath?: string[];
  selectedId?: string | null;
  onSelect: (docId: string) => void;
}) {
  const [mode, setMode] = useState<"all" | "browse">("browse");
  const [query, setQuery] = useState("");
  const [viewingPath, setViewingPath] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [limit, setLimit] = useState(120);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode("browse");
    setQuery("");
    setViewingPath(initialPath);
    setSelectedIndex(0);
    setLimit(120);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, initialPath]);

  // Reset pagination when search changes
  useEffect(() => {
    setLimit(120);
  }, [query]);

  const allDocs = useMemo(() => {
    return documents
      .filter((d) => (d as any)?.type !== "folder")
      .map((doc) => {
        const displayTitle = String((doc.title || doc.name || (doc as any).filename || "Untitled") ?? "Untitled");
        const folderPath = ((doc.folderPath || (doc as any).folder_path || []) as string[]).filter(Boolean);
        return { kind: "doc" as const, doc, displayTitle, folderPath };
      })
      .sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
  }, [documents]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [{ name: "Workspace", path: [] as string[] }];
    viewingPath.forEach((segment, index) => {
      crumbs.push({ name: segment, path: viewingPath.slice(0, index + 1) });
    });
    return crumbs;
  }, [viewingPath]);

  const folderChildren = useMemo(() => {
    const key = viewingPath.join("/");
    const children = folders
      .filter((p) => p.length === viewingPath.length + 1 && viewingPath.every((seg, i) => seg === p[i]))
      .map((p) => {
        const pathStr = p.join("/");
        const hasChildren = folders.some(
          (other) =>
            other.length > p.length && other.slice(0, p.length).join("/") === pathStr
        );
        return {
          kind: "folder" as const,
          path: p,
          name: p[p.length - 1] || "Folder",
          hasChildren,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return children;
  }, [folders, viewingPath]);

  const docsInViewingPath = useMemo(() => {
    const filtered = allDocs.filter((d) => {
      const p = d.folderPath;
      return p.join("/") === viewingPath.join("/");
    });
    const mapped = filtered
      .map((d) => d)
      .sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
    return mapped;
  }, [allDocs, viewingPath]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = allDocs
      .map((item) => {
        const doc: any = item.doc as any;
        const pathStr = item.folderPath.join("/");
        const extra = [
          doc.filename,
          doc.name,
          doc.title,
          doc.subject,
          doc.sender,
          doc.receiver,
          Array.isArray(doc.tags) ? doc.tags.join(" ") : doc.tags,
          Array.isArray(doc.keywords) ? doc.keywords.join(" ") : doc.keywords,
        ]
          .filter(Boolean)
          .join(" ");
        const hay = `${item.displayTitle} ${pathStr} ${extra}`.toLowerCase();
        if (!hay.includes(q)) return null;
        return item;
      })
      .filter(Boolean) as Array<Extract<Item, { kind: "doc" }>>;
    return scored;
  }, [allDocs, query]);

  const visibleItems: Item[] = useMemo(() => {
    if (query.trim()) {
      return searchResults.slice(0, limit);
    }
    if (mode === "all") {
      return allDocs.slice(0, limit);
    }
    return [...folderChildren, ...docsInViewingPath];
  }, [query, searchResults, limit, mode, allDocs, folderChildren, docsInViewingPath]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, viewingPath, visibleItems.length]);

  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const navigateToPath = useCallback((target: string[]) => {
    setQuery("");
    setViewingPath(target);
    setSelectedIndex(0);
  }, []);

  const enterFolder = useCallback((path: string[]) => {
    setQuery("");
    setViewingPath(path);
    setSelectedIndex(0);
  }, []);

  const handleChooseDoc = useCallback(
    (docId: string) => {
      onSelect(docId);
      onOpenChange(false);
    },
    [onSelect, onOpenChange]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(visibleItems.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (mode === "browse" && e.key === "Backspace" && !query && viewingPath.length > 0) {
        e.preventDefault();
        navigateToPath(viewingPath.slice(0, -1));
        return;
      }
      if (e.key === "Enter") {
        const item = visibleItems[selectedIndex];
        if (!item) return;
        e.preventDefault();
        if (mode === "browse" && item.kind === "folder") {
          enterFolder(item.path);
        } else {
          if (item.kind === "doc") handleChooseDoc(item.doc.id);
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, visibleItems, selectedIndex, query, viewingPath, navigateToPath, enterFolder, handleChooseDoc, mode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">{title}</DialogTitle>

        {/* Header w/ breadcrumbs */}
        <div className="flex items-center justify-between pl-4 pr-12 py-3 border-b border-border/40 h-12">
          <div className="flex items-center gap-1.5 text-sm overflow-x-auto flex-1 min-w-0">
            {(mode === "browse" ? breadcrumbs : [{ name: "All documents", path: [] as string[] }]).map((crumb, index) => (
              <React.Fragment key={index}>
                {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                <button
                  onClick={() => {
                    if (mode !== "browse") {
                      setMode("browse");
                      setViewingPath([]);
                      setSelectedIndex(0);
                      return;
                    }
                    navigateToPath(crumb.path);
                  }}
                  className={cn(
                    "px-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors shrink-0 text-sm",
                    index === breadcrumbs.length - 1 ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 px-2 text-xs", mode === "browse" ? "bg-muted/60" : "text-muted-foreground")}
              onClick={() => { setMode("browse"); setSelectedIndex(0); }}
            >
              Browse
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 px-2 text-xs", mode === "all" ? "bg-muted/60" : "text-muted-foreground")}
              onClick={() => { setMode("all"); setSelectedIndex(0); }}
            >
              All
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2.5 px-4 py-2 border-b border-border/40">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            placeholder="Search documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 h-7 p-0 bg-transparent focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
          />
          <div className="text-[11px] text-muted-foreground/60 border border-border/60 rounded px-1.5 py-0.5 shrink-0 hidden sm:block">
            ↵ to select
          </div>
        </div>

        {/* List */}
        <div ref={listRef} className="h-[340px] overflow-y-auto">
          {visibleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="h-10 w-10 mb-3 opacity-30" />
              <span className="text-sm">
                {query.trim()
                  ? `No documents match "${query.trim()}"`
                  : mode === "browse"
                    ? "No documents here"
                    : "No documents found"}
              </span>
            </div>
          ) : (
            <ul className="p-1.5 space-y-0.5">
              {visibleItems.map((item, index) => {
                const isSelected = selectedIndex === index;
                if (item.kind === "folder") {
                  return (
                    <li
                      key={`folder-${item.path.join("/")}`}
                      data-index={index}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => enterFolder(item.path)}
                      className={cn(
                        "flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer select-none transition-colors text-sm",
                        isSelected && "bg-muted/60"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Folder className="h-[18px] w-[18px] text-muted-foreground shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </li>
                  );
                }

                const doc = item.doc;
                const ver = (doc as any).versionNumber || (doc as any).version || 1;
                const pathStr = item.folderPath.length ? `/${item.folderPath.join("/")}` : "/Root";
                const isChosen = !!selectedId && selectedId === doc.id;

                return (
                  <li
                    key={`doc-${doc.id}`}
                    data-index={index}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => handleChooseDoc(doc.id)}
                    className={cn(
                      "flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer select-none transition-colors text-sm",
                      isSelected && "bg-muted/60"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-[18px] w-[18px] text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate">{item.displayTitle}</div>
                        <div className="text-[11px] text-muted-foreground/70 truncate">
                          {pathStr} • v{ver}
                        </div>
                      </div>
                    </div>
                    {isChosen ? (
                      <Check className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer: show-more for large orgs */}
        {(mode === "all" || query.trim()) && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/20">
            <div className="text-[11px] text-muted-foreground/70">
              {query.trim()
                ? `Showing ${visibleItems.length} result${visibleItems.length !== 1 ? "s" : ""}`
                : `Showing ${visibleItems.length} document${visibleItems.length !== 1 ? "s" : ""}`}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setLimit((p) => p + 200)}
            >
              Show more
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

