"use client";

import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ChevronRight, FileText, Folder, Search } from 'lucide-react';
import { useFolders, type FolderNode } from '@/hooks/use-folders';
import { useDocuments } from '@/hooks/use-documents';
import type { StoredDocument } from '@/lib/types';
import { cn } from '@/lib/utils';

type Mode = 'folder' | 'doc';
type PickerItem =
  | { kind: 'folder'; id: string; name: string; path: string[] }
  | { kind: 'doc'; id: string; title: string; subtitle: string; folderPath: string[]; doc: StoredDocument };

const EMPTY_PATH: string[] = [];
const EMPTY_DOC_IDS: string[] = [];

function sameStringArray(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizePath(path?: string[]) {
  return (path || []).filter(Boolean);
}

function folderPathFromNode(node: FolderNode, parentPath: string[]) {
  if (Array.isArray(node.fullPath) && node.fullPath.length > 0) {
    return node.fullPath.filter(Boolean);
  }
  return [...parentPath, node.name].filter(Boolean);
}

function docFolderPath(doc: StoredDocument) {
  return ((doc.folderPath || (doc as any).folder_path || []) as string[]).filter(Boolean);
}

function docTitle(doc: StoredDocument) {
  return String(doc.title || doc.name || (doc as any).filename || 'Untitled');
}

export function FinderPicker({
  open,
  onOpenChange,
  mode,
  maxDocs = 1,
  initialPath = EMPTY_PATH,
  initialSelectedDocIds = EMPTY_DOC_IDS,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  maxDocs?: number;
  initialPath?: string[];
  initialSelectedDocIds?: string[];
  onConfirm: (payload: { path?: string[]; docs?: StoredDocument[] }) => void;
}) {
  const { documents: allDocuments } = useDocuments();
  const folderExplorer = useFolders();

  const [query, setQuery] = useState('');
  const [viewingPath, setViewingPath] = useState<string[]>(normalizePath(initialPath));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(
    (initialSelectedDocIds || []).filter(Boolean).slice(0, Math.max(1, maxDocs))
  );
  const listRef = useRef<HTMLDivElement>(null);
  const loadFoldersRef = useRef(folderExplorer.load);

  useEffect(() => {
    loadFoldersRef.current = folderExplorer.load;
  }, [folderExplorer.load]);

  const navigateToPath = React.useCallback(
    (targetPath: string[]) => {
      setQuery('');
      setViewingPath(targetPath);
      setSelectedIndex(0);
      void loadFoldersRef.current(targetPath);
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    const normalizedPath = normalizePath(initialPath);
    const normalizedSelectedDocIds = (initialSelectedDocIds || [])
      .filter(Boolean)
      .slice(0, Math.max(1, maxDocs));

    setQuery('');
    setSelectedIndex(0);
    setViewingPath((prev) => (sameStringArray(prev, normalizedPath) ? prev : normalizedPath));
    setSelectedDocIds((prev) =>
      sameStringArray(prev, normalizedSelectedDocIds) ? prev : normalizedSelectedDocIds
    );

    void loadFoldersRef.current([]);
    void loadFoldersRef.current(normalizedPath);
  }, [open, initialPath, initialSelectedDocIds, maxDocs]);

  const currentFolders = useMemo(() => {
    const seen = new Set<string>();
    const nodes = folderExplorer.getChildren(viewingPath) || [];
    const mapped = nodes
      .map((node) => {
        const path = folderPathFromNode(node, viewingPath);
        return {
          kind: 'folder' as const,
          id: `${node.id || ''}|${path.join('/')}`,
          name: node.name || path[path.length - 1] || 'Folder',
          path,
        };
      })
      .filter((item) => {
        const key = item.path.join('/');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return mapped;
  }, [folderExplorer, viewingPath]);

  const docsInCurrentPath = useMemo(() => {
    const isRootView = viewingPath.length === 0;
    return allDocuments
      .filter((doc) => {
        if (doc.type === 'folder') return false;
        if (isRootView) return true;
        return sameStringArray(docFolderPath(doc), viewingPath);
      })
      .map((doc) => ({
        kind: 'doc' as const,
        id: doc.id,
        title: docTitle(doc),
        subtitle: String(doc.sender || doc.receiver || doc.documentType || doc.category || ''),
        folderPath: docFolderPath(doc),
        doc,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allDocuments, viewingPath]);

  const visibleItems = useMemo<PickerItem[]>(() => {
    const sourceItems: PickerItem[] =
      mode === 'doc'
        ? viewingPath.length === 0
          ? [...docsInCurrentPath, ...currentFolders]
          : [...currentFolders, ...docsInCurrentPath]
        : currentFolders;
    const q = query.trim().toLowerCase();
    if (!q) return sourceItems;
    return sourceItems.filter((item) => {
      if (item.kind === 'folder') {
        return item.name.toLowerCase().includes(q) || item.path.join('/').toLowerCase().includes(q);
      }
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.folderPath.join('/').toLowerCase().includes(q)
      );
    });
  }, [mode, currentFolders, docsInCurrentPath, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, viewingPath, visibleItems.length]);

  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectedDocs = useMemo(() => {
    const byId = new Map(allDocuments.map((d) => [d.id, d]));
    return selectedDocIds.map((id) => byId.get(id)).filter(Boolean) as StoredDocument[];
  }, [selectedDocIds, allDocuments]);

  const toggleDoc = React.useCallback(
    (docId: string) => {
      setSelectedDocIds((prev) => {
        if (prev.includes(docId)) return prev.filter((id) => id !== docId);
        if (prev.length >= Math.max(1, maxDocs)) return prev;
        return [...prev, docId];
      });
    },
    [maxDocs]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(visibleItems.length - 1, 0)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Backspace' && !query && viewingPath.length > 0) {
        e.preventDefault();
        navigateToPath(viewingPath.slice(0, -1));
        return;
      }
      if (e.key === 'Enter') {
        const item = visibleItems[selectedIndex];
        if (!item) return;
        e.preventDefault();
        if (item.kind === 'folder') {
          navigateToPath(item.path);
          return;
        }
        if (mode === 'doc') {
          toggleDoc(item.id);
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, visibleItems, selectedIndex, query, viewingPath, navigateToPath, mode, toggleDoc]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [{ name: 'Workspace', path: [] as string[] }];
    viewingPath.forEach((segment, index) => {
      crumbs.push({ name: segment, path: viewingPath.slice(0, index + 1) });
    });
    return crumbs;
  }, [viewingPath]);

  const handleChoose = () => {
    if (mode === 'folder') {
      onConfirm({ path: viewingPath });
      onOpenChange(false);
      return;
    }
    onConfirm({ docs: selectedDocs });
    onOpenChange(false);
  };

  const selectedSummary =
    selectedDocs.length === 0
      ? 'None'
      : selectedDocs
          .map((doc) => docTitle(doc))
          .slice(0, 1)
          .join(', ');

  const maxSelectable = Math.max(1, maxDocs);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {mode === 'folder' ? 'Select Folder' : 'Select Files'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Browse folders and choose files for chat context.
        </DialogDescription>

        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 h-12">
          <div className="flex items-center gap-1.5 text-sm overflow-x-auto flex-1 min-w-0">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb.path.join('/')}|${index}`}>
                {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                <button
                  onClick={() => navigateToPath(crumb.path)}
                  className={cn(
                    'px-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors shrink-0 text-sm leading-5',
                    index === breadcrumbs.length - 1
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-4 py-2 border-b border-border/40">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder={mode === 'doc' ? 'Search folders and files...' : 'Filter folders...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 h-8 p-0 bg-transparent focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
          />
          <div className="text-[11px] text-muted-foreground/60 border border-border/60 rounded px-1.5 py-0.5 shrink-0 hidden sm:block">
            ↵ to select
          </div>
        </div>

        <div ref={listRef} className="h-[360px] overflow-y-auto">
          {visibleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Folder className="h-10 w-10 mb-3 opacity-30" />
              <span className="text-sm">
                {query.trim()
                  ? `No matches for "${query.trim()}"`
                  : mode === 'doc'
                    ? 'No folders or files here'
                    : 'No subfolders'}
              </span>
            </div>
          ) : (
            <ul className="p-1.5 space-y-0.5">
              {visibleItems.map((item, index) => {
                const isFocused = selectedIndex === index;
                if (item.kind === 'folder') {
                  return (
                    <li
                      key={`folder-${item.id}`}
                      data-index={index}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => navigateToPath(item.path)}
                      className={cn(
                        'flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer select-none transition-colors text-sm leading-5',
                        isFocused && 'bg-muted/60'
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

                const isSelected = selectedDocIds.includes(item.id);
                const isAtLimit = !isSelected && selectedDocIds.length >= maxSelectable;
                return (
                  <li
                    key={`doc-${item.id}`}
                    data-index={index}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => {
                      if (mode !== 'doc' || isAtLimit) return;
                      toggleDoc(item.id);
                    }}
                    className={cn(
                      'flex items-center justify-between px-2.5 py-2 rounded-md select-none transition-colors text-sm leading-5',
                      mode === 'doc' && !isAtLimit ? 'cursor-pointer' : 'cursor-default',
                      isFocused && 'bg-muted/60',
                      isAtLimit && 'opacity-45'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-[18px] w-[18px] text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate text-sm leading-5">{item.title}</div>
                        <div className="text-xs text-muted-foreground/70 truncate leading-4">
                          {item.folderPath.length ? `/${item.folderPath.join('/')}` : '/Root'}
                          {item.subtitle ? ` • ${item.subtitle}` : ''}
                        </div>
                      </div>
                    </div>
                    {isSelected ? <Check className="h-4 w-4 text-muted-foreground shrink-0" /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-muted/20">
          <div className="min-w-0 flex-1 pr-3 text-xs text-muted-foreground/80 truncate">
            {mode === 'folder' ? (
              <>Selected: {viewingPath.length ? `/${viewingPath.join('/')}` : '/Root'}</>
            ) : (
              <>
                Selected {selectedDocs.length}/{maxSelectable}
                {selectedSummary !== 'None' ? ` • ${selectedSummary}${selectedDocs.length > 1 ? '…' : ''}` : ''}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={mode === 'doc' && selectedDocs.length === 0}
              onClick={handleChoose}
            >
              Choose
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
