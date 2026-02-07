"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useFolders } from '@/hooks/use-folders';
import { useDocuments } from '@/hooks/use-documents';
import type { StoredDocument } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Folder, FileText, X, ChevronRight } from 'lucide-react';

type Mode = 'folder' | 'doc';

export function SimplePicker({
  open,
  onClose,
  mode,
  onPick,
  initialPath = [],
}: {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  onPick: (payload: { path?: string[]; doc?: StoredDocument }) => void;
  initialPath?: string[];
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-4 top-4 left-4 md:left-auto md:w-[640px] bg-background border rounded-lg shadow-xl overflow-hidden">
        <Header onClose={onClose} title={mode === 'folder' ? 'Select Folder' : 'Select Document'} />
        <div className="p-3">
          {mode === 'folder' ? (
            <FolderPane onPick={(path)=>{ onPick({ path }); onClose(); }} initialPath={initialPath} />
          ) : (
            <DocPane onPick={(doc)=>{ onPick({ doc }); onClose(); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div className="text-sm font-medium">{title}</div>
      <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
    </div>
  );
}

function FolderPane({ onPick, initialPath }: { onPick: (p: string[]) => void; initialPath: string[] }) {
  const [path, setPath] = useState<string[]>(initialPath);
  const folders = useFolders();
  useEffect(() => { void folders.load(path); }, [path]);
  const children = folders.getChildren(path);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <button onClick={()=>setPath([])} className="hover:underline">/</button>
        {path.map((seg, idx) => (
          <React.Fragment key={idx}>
            <ChevronRight className="h-3 w-3" />
            <button onClick={()=>setPath(path.slice(0, idx+1))} className="hover:underline">{seg}</button>
          </React.Fragment>
        ))}
      </div>
      <ScrollArea className="max-h-[50vh] border rounded">
        <div className="p-2">
          {children.length === 0 ? (
            <div className="text-xs text-muted-foreground">No subfolders</div>
          ) : children.map((f) => (
            <button key={f.name} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted" onClick={()=>setPath([...path, f.name])}>
              <Folder className="h-4 w-4" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
      <div className="flex justify-end">
        <Button onClick={()=>onPick(path)}><Folder className="h-4 w-4 mr-1" />Choose this folder</Button>
      </div>
    </div>
  );
}

function DocPane({ onPick }: { onPick: (d: StoredDocument) => void }) {
  const { documents } = useDocuments();
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return documents;
    return documents.filter(d => (d.title||d.name||'').toLowerCase().includes(s) || (d.sender||'').toLowerCase().includes(s) || (d.documentType||d.type||'').toString().toLowerCase().includes(s));
  }, [documents, q]);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search documents by name/sender/type" />
      </div>
      <ScrollArea className="max-h-[50vh] border rounded">
        <div className="p-2">
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground">No documents</div>
          ) : filtered.slice(0, 200).map((d) => (
            <button key={d.id} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted" onClick={()=>onPick(d)}>
              <FileText className="h-4 w-4" />
              <div className="truncate">
                <div className="text-sm font-medium truncate">{d.title || d.name}</div>
                <div className="text-xs text-muted-foreground truncate">{d.sender || d.receiver || d.documentType || d.category || ''}</div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

