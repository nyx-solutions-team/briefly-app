"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFolders } from '@/hooks/use-folders';
import { FinderPicker } from '@/components/pickers/finder-picker';
import { type ChatContext } from './chat-context-selector';

export type ChatScope = 'org' | 'folder' | 'doc';

export function ScopePicker({
  initialDocId,
  value,
  onChange,
}: {
  initialDocId?: string | null;
  value: ChatContext;
  onChange: (ctx: ChatContext) => void;
}) {
  // Initialize from standardized ChatContext
  const [scope, setScope] = useState<ChatScope>(() => {
    if (value.type === 'document') return 'doc';
    if (value.type === 'folder') return 'folder';
    return 'org';
  });
  const [docId, setDocId] = useState<string>(() => {
    if (value.type === 'document') return value.id || initialDocId || '';
    return initialDocId || '';
  });
  const [folderPath, setFolderPath] = useState<string[]>(() => {
    if (value.type === 'folder') return value.folderPath || value.path || [];
    return [];
  });
  const [includeLinked, setIncludeLinked] = useState<boolean>(!!value.includeLinked);
  const [includeVersions, setIncludeVersions] = useState<boolean>(!!value.includeVersions);
  const [includeSubfolders, setIncludeSubfolders] = useState<boolean>(value.includeSubfolders ?? true);

  const folders = useFolders();
  const currentChildren = folders.getChildren(folderPath);
  useEffect(() => { void folders.load(folderPath); }, [folderPath]);

  // Emit changes to parent only when the effective context actually changes
  const [lastEmitted, setLastEmitted] = useState<string>('');
  useEffect(() => {
    // Map scope-based context to standardized ChatContext
    const mappedContext: ChatContext = {
      type: scope === 'doc' ? 'document' : scope === 'folder' ? 'folder' : 'org',
      id: scope === 'doc' ? docId : undefined,
      folderPath: scope === 'folder' ? folderPath : undefined,
      name: scope === 'folder' && folderPath.length > 0 ? folderPath[folderPath.length - 1] : undefined
    };
    
    const key = JSON.stringify(mappedContext);
    if (key !== lastEmitted) {
      setLastEmitted(key);
      onChange(mappedContext);
    }
  }, [scope, docId, folderPath, onChange, lastEmitted]);

  return (
    <div className="w-full rounded-md border p-3 md:p-4 bg-card/50">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <RadioGroup className="flex gap-4" value={scope} onValueChange={(v: ChatScope) => setScope(v)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem id="scope-org" value="org" />
              <Label htmlFor="scope-org">Org-wide</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem id="scope-folder" value="folder" />
              <Label htmlFor="scope-folder">Folder</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem id="scope-doc" value="doc" />
              <Label htmlFor="scope-doc">Document</Label>
            </div>
          </RadioGroup>
        </div>

        {scope === 'folder' && (
          <div className="flex flex-col gap-2">
            <div className="text-sm text-muted-foreground">Select folder path</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setFolderPath([])} disabled={folderPath.length === 0}>/
              </Button>
              {folderPath.map((seg, idx) => (
                <React.Fragment key={idx}>
                  <span className="text-muted-foreground">/</span>
                  <Button variant="outline" size="sm" onClick={() => setFolderPath(folderPath.slice(0, idx + 1))}>{seg}</Button>
                </React.Fragment>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {currentChildren.length === 0 ? (
                <div className="text-xs text-muted-foreground">No subfolders here</div>
              ) : currentChildren.map((child) => (
                <Button key={child.name} variant="secondary" size="sm" onClick={() => setFolderPath([...folderPath, child.name])}>
                  {child.name}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeSubfolders} onChange={(e) => setIncludeSubfolders(e.target.checked)} />
                Include subfolders
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeLinked} onChange={(e) => setIncludeLinked(e.target.checked)} />
                Include linked docs
              </label>
            </div>
          </div>
        )}

        {scope === 'doc' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
              <div className="flex items-center gap-2">
                <Label htmlFor="ctx-doc-id" className="min-w-[80px]">Doc ID</Label>
                <Input id="ctx-doc-id" value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="e.g. 5f2b..." />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={includeVersions} onChange={(e) => setIncludeVersions(e.target.checked)} />
                  Include versions
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={includeLinked} onChange={(e) => setIncludeLinked(e.target.checked)} />
                  Include linked docs
                </label>
              </div>
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}
