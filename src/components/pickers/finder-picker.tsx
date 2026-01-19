"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFolders } from '@/hooks/use-folders';
import { useDocuments } from '@/hooks/use-documents';
import { Folder, FileText, Search, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import type { StoredDocument } from '@/lib/types';

type Mode = 'folder' | 'doc';

export function FinderPicker({
  open,
  onOpenChange,
  mode,
  initialPath = [],
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  initialPath?: string[];
  onConfirm: (payload: { path?: string[]; doc?: StoredDocument }) => void;
}) {
  const [path, setPath] = useState<string[]>(initialPath);
  useEffect(() => { if (open) setPath(initialPath); }, [open, initialPath]);
  const folders = useFolders();
  const left = folders.getChildren([]);
  const center = folders.getChildren(path.slice(0, 1));
  const right = folders.getChildren(path);
  useEffect(() => { void folders.load([]); }, []);
  useEffect(() => { if (path.length >= 1) void folders.load(path.slice(0,1)); }, [path]);
  useEffect(() => { void folders.load(path); }, [path]);

  const { getDocumentsInPath } = useDocuments();
  const docsInPath = useMemo(() => getDocumentsInPath(path), [getDocumentsInPath, path]);
  const [query, setQuery] = useState('');
  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docsInPath;
    return docsInPath.filter(d => (d.title || d.name || '').toLowerCase().includes(q) || (d.sender||'').toLowerCase().includes(q));
  }, [query, docsInPath]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const selectedDoc = useMemo(() => filteredDocs.find(d => d.id === selectedDocId), [filteredDocs, selectedDocId]);

  const choose = () => {
    if (mode === 'folder') onConfirm({ path });
    else if (mode === 'doc' && selectedDoc) onConfirm({ doc: selectedDoc });
    onOpenChange(false);
  };

  const Crumb = ({ seg, idx }: { seg: string; idx: number }) => (
    <button
      className="text-sm px-2 py-1 rounded hover:bg-muted"
      onClick={() => setPath(path.slice(0, idx + 1))}
    >{seg}</button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[90vw] p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle>{mode === 'folder' ? 'Choose Folder' : 'Choose Document'}</DialogTitle>
        </DialogHeader>
        <div className="flex h-[60vh]">
          {/* Left: root folders */}
          <Pane title="Folders">
            <List>
              {left.map((f) => (
                <Row key={f.name} active={path[0] === f.name} onClick={() => setPath([f.name])} icon={<Folder className="h-4 w-4" />}>{f.name}</Row>
              ))}
            </List>
          </Pane>
          {/* Middle: subfolders of first seg */}
          <Pane title={path[0] || '—'}>
            <List>
              {center.map((f) => (
                <Row key={f.name} active={path.join('/') === [path[0], f.name].join('/')} onClick={() => setPath([path[0], f.name].filter(Boolean))} icon={<Folder className="h-4 w-4" />}>{f.name}</Row>
              ))}
            </List>
          </Pane>
          {/* Right: subfolders of current path and documents */}
          <Pane title={path.join('/') || '/'}>
            <div className="px-3 pb-2">
              <div className="flex items-center gap-2">
                <ChevronLeft className="h-4 w-4 opacity-60" />
                <button className="text-xs text-muted-foreground hover:underline" onClick={() => setPath([])}>/</button>
                {path.map((seg, idx) => (
                  <React.Fragment key={idx}>
                    <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                    <Crumb seg={seg} idx={idx} />
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="px-3 pb-2 flex items-center gap-2">
              <Search className="h-4 w-4 opacity-60" />
              <Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search in this folder" className="h-8" />
            </div>
            <div className="grid grid-cols-2 gap-2 h-[calc(100%-4rem)]">
              <ScrollArea className="border rounded ml-3">
                <div className="p-2">
                  {right.length === 0 ? <div className="text-xs text-muted-foreground">No subfolders</div> : right.map((f) => (
                    <Row key={f.name} onClick={() => setPath([...path, f.name])} icon={<Folder className="h-4 w-4" />}>{f.name}</Row>
                  ))}
                </div>
              </ScrollArea>
              <ScrollArea className="border rounded mr-3">
                <div className="p-2">
                  {filteredDocs.length === 0 ? <div className="text-xs text-muted-foreground">No documents</div> : filteredDocs.map((d) => (
                    <Row key={d.id} active={selectedDocId === d.id} onClick={() => setSelectedDocId(d.id)} icon={<FileText className="h-4 w-4" />}>
                      <div className="truncate">
                        <div className="text-sm font-medium truncate">{d.title || d.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{d.sender || d.receiver || d.documentType || d.category || ''}</div>
                      </div>
                    </Row>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </Pane>
        </div>
        <DialogFooter className="px-4 py-3 border-t flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {mode === 'folder' ? (
              <>Selected folder: <span className="font-medium">/{path.join('/')}</span></>
            ) : (
              <>Selected doc: <span className="font-medium">{selectedDoc?.title || selectedDoc?.name || 'None'}</span></>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={choose} disabled={mode==='doc' && !selectedDoc}><Check className="h-4 w-4 mr-1" />Choose</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-1/3 border-r flex flex-col">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">{title}</div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ScrollArea className="h-full"><div className="p-2 space-y-1">{children}</div></ScrollArea>;
}

function Row({ children, onClick, active, icon }: { children: React.ReactNode; onClick?: () => void; active?: boolean; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left ${active ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
      {icon}{children}
    </button>
  );
}

