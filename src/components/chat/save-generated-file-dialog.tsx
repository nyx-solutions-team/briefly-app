'use client';

import React from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiFetch, getApiContext } from '@/lib/api';
import type { StoredDocument } from '@/lib/types';
import { FolderPickerDialog, type FolderOption as PickerFolderOption } from '@/components/folder-picker-dialog';
import { saveGeneratedFileToDocuments } from '@/lib/generated-document-save';

type Department = {
  id: string;
  name: string;
};

type SaveGeneratedFileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  fileName: string;
  mimeType?: string | null;
  title?: string | null;
  textPreview?: string | null;
  allDocuments: StoredDocument[];
  allFolders?: string[][];
  onSaved?: (result: { docId: string; filename: string; ingestionStatus: string }) => void;
};

function trimExt(name: string) {
  return String(name || '').replace(/\.[a-z0-9]+$/i, '').trim();
}

function pathToLabel(path: string[]) {
  return path.length ? `/${path.join('/')}` : '/ (Root)';
}

function deriveFolderOptions(
  documents: StoredDocument[],
  folderPathsFromProvider?: string[][]
): Array<PickerFolderOption & { departmentId: string | null }> {
  const seen = new Set<string>();
  const out: Array<PickerFolderOption & { departmentId: string | null }> = [];

  const pushPath = (path: string[], departmentId: string | null) => {
    if (!Array.isArray(path) || !path.length) return;
    const key = `${departmentId || 'none'}::${path.join('/')}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: key,
      path,
      label: pathToLabel(path),
      name: path[path.length - 1] || 'Folder',
      departmentId,
    });
  };

  for (const raw of folderPathsFromProvider || []) {
    const fullPath = Array.isArray(raw) ? raw.filter(Boolean) : [];
    if (!fullPath.length) continue;
    for (let i = 1; i <= fullPath.length; i += 1) pushPath(fullPath.slice(0, i), null);
  }

  for (const doc of documents || []) {
    const fullPath = Array.isArray(doc.folderPath) ? doc.folderPath.filter(Boolean) : [];
    if (!fullPath.length) continue;
    const dept = doc.departmentId || null;
    for (let i = 1; i <= fullPath.length; i += 1) pushPath(fullPath.slice(0, i), dept);
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export default function SaveGeneratedFileDialog({
  open,
  onOpenChange,
  fileUrl,
  fileName,
  mimeType = null,
  title,
  textPreview = null,
  allDocuments,
  allFolders = [],
  onSaved,
}: SaveGeneratedFileDialogProps) {
  const { toast } = useToast();
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loadingDepartments, setLoadingDepartments] = React.useState(false);
  const [departmentId, setDepartmentId] = React.useState('');
  const [selectedFolderPath, setSelectedFolderPath] = React.useState<string[]>([]);
  const [folderPickerOpen, setFolderPickerOpen] = React.useState(false);
  const [resolvedTitle, setResolvedTitle] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const allFolderOptions = React.useMemo(
    () => deriveFolderOptions(allDocuments, allFolders),
    [allDocuments, allFolders]
  );

  const filteredFolderOptions = React.useMemo(() => {
    if (!departmentId) return allFolderOptions;
    const exact = allFolderOptions.filter((f) => f.departmentId === departmentId);
    return exact.length ? exact : allFolderOptions;
  }, [allFolderOptions, departmentId]);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setResolvedTitle(String(title || '').trim() || trimExt(fileName) || 'Generated Document');
    setSelectedFolderPath([]);

    let cancelled = false;
    const loadDepartments = async () => {
      const { orgId } = getApiContext();
      if (!orgId) {
        if (!cancelled) setError('No organization selected.');
        return;
      }
      setLoadingDepartments(true);
      try {
        const list = await apiFetch<Department[]>(`/orgs/${orgId}/departments?includeMine=1`);
        if (cancelled) return;
        const normalized = Array.isArray(list)
          ? list.filter((d) => d?.id && d?.name).sort((a, b) => String(a.name).localeCompare(String(b.name)))
          : [];
        setDepartments(normalized);
        setDepartmentId((prev) => (prev && normalized.some((d) => d.id === prev) ? prev : normalized[0]?.id || ''));
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Failed to load teams/departments.');
      } finally {
        if (!cancelled) setLoadingDepartments(false);
      }
    };
    void loadDepartments();
    return () => {
      cancelled = true;
    };
  }, [open, title, fileName]);

  React.useEffect(() => {
    if (!open) return;
    setSelectedFolderPath((prev) => (prev.length ? prev : filteredFolderOptions[0]?.path || []));
  }, [open, filteredFolderOptions]);

  const handleSave = React.useCallback(async () => {
    setError(null);
    if (!departmentId) {
      setError('Please choose a team/department.');
      return;
    }
    const normalizedTitle = String(resolvedTitle || '').trim();
    if (!normalizedTitle) {
      setError('Please enter a document title.');
      return;
    }
    setSubmitting(true);
    toast({
      title: 'Saving to Documents',
      description: 'Uploading generated file and starting ingestion.',
    });
    try {
      const result = await saveGeneratedFileToDocuments({
        fileUrl,
        title: normalizedTitle,
        filename: fileName,
        mimeType,
        departmentId,
        folderPath: selectedFolderPath,
        textPreview,
        autoAccept: true,
      });
      toast({
        title: 'Saved and Accepted',
        description: `${result.filename} was saved to Documents and auto-accepted.`,
      });
      onOpenChange(false);
      onSaved?.(result);
    } catch (e: any) {
      const message = e?.message || 'Failed to save generated file.';
      setError(message);
      toast({
        title: 'Save Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }, [departmentId, fileUrl, fileName, mimeType, onOpenChange, onSaved, resolvedTitle, selectedFolderPath, textPreview, toast]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Save Generated File</DialogTitle>
            <DialogDescription>
              Save this generated file to Documents so it can be indexed, shared, and reopened later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="generated-file-title">Document Title</Label>
              <Input
                id="generated-file-title"
                value={resolvedTitle}
                onChange={(e) => setResolvedTitle(e.target.value)}
                placeholder="Enter a title"
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">File: {fileName}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Team / Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId} disabled={loadingDepartments || submitting}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingDepartments ? 'Loading teams...' : 'Select team'} />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dep) => (
                      <SelectItem key={dep.id} value={dep.id}>
                        {dep.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Folder</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setFolderPickerOpen(true)}
                  disabled={submitting}
                >
                  <span className="truncate">{selectedFolderPath.length ? pathToLabel(selectedFolderPath) : '/ (Root)'}</span>
                </Button>
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={submitting || loadingDepartments}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save to Documents
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FolderPickerDialog
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        folders={filteredFolderOptions}
        currentPath={selectedFolderPath}
        onSelect={(path) => {
          setSelectedFolderPath(path);
          setFolderPickerOpen(false);
        }}
        title="Select Folder"
      />
    </>
  );
}

