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
import {
  saveGeneratedDocumentToDocuments,
  type SaveFormat,
} from '@/lib/generated-document-save';
import { getPrimaryDocumentNumber, templateLabel, type TemplateType } from '@/lib/document-export';

type Department = {
  id: string;
  name: string;
};

type SaveGeneratedDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateType: TemplateType;
  data: Record<string, any>;
  artifactTitle?: string | null;
  ephemeralArtifactId?: string | null;
  allDocuments: StoredDocument[];
  allFolders?: string[][];
  onSaved?: (result: { docId: string; filename: string; ingestionStatus: string }) => void;
};

function trimExt(name: string) {
  return name.replace(/\.(json|pdf|docx)$/i, '').trim();
}

function pathToLabel(path: string[]) {
  return path.length ? `/${path.join('/')}` : '/ (Root)';
}

function inferDefaultTitle(templateType: TemplateType, data: Record<string, any>, artifactTitle?: string | null) {
  const cleanedArtifact = trimExt(String(artifactTitle || ''));
  if (cleanedArtifact) return cleanedArtifact;

  const base = templateLabel(templateType);
  const suffix = String(getPrimaryDocumentNumber(templateType, data) || '').trim();
  return suffix ? `${base} ${suffix}` : base;
}

function deriveFolderOptions(
  documents: StoredDocument[],
  folderPathsFromProvider?: string[][]
): Array<PickerFolderOption & { departmentId: string | null }> {
  const seen = new Set<string>();
  const out: Array<PickerFolderOption & { departmentId: string | null }> = [];

  const pushPath = (path: string[], departmentId: string | null) => {
    if (!Array.isArray(path) || !path.length) return;
    const dedupeKey = `${departmentId || 'none'}::${path.join('/')}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push({
      id: dedupeKey,
      path,
      label: pathToLabel(path),
      name: path[path.length - 1] || 'Folder',
      departmentId,
    });
  };

  // Prefer provider-backed folder tree if available (same source used by Documents pages).
  for (const raw of folderPathsFromProvider || []) {
    const fullPath = Array.isArray(raw) ? raw.filter(Boolean) : [];
    if (!fullPath.length) continue;
    for (let i = 1; i <= fullPath.length; i += 1) {
      pushPath(fullPath.slice(0, i), null);
    }
  }

  for (const doc of documents || []) {
    const fullPath = Array.isArray(doc.folderPath) ? doc.folderPath.filter(Boolean) : [];
    if (!fullPath.length) continue;
    const dept = doc.departmentId || null;

    // FolderPickerDialog navigates from root, so we must include ancestor folders too.
    for (let i = 1; i <= fullPath.length; i += 1) {
      pushPath(fullPath.slice(0, i), dept);
    }
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export default function SaveGeneratedDocumentDialog({
  open,
  onOpenChange,
  templateType,
  data,
  artifactTitle,
  ephemeralArtifactId = null,
  allDocuments,
  allFolders = [],
  onSaved,
}: SaveGeneratedDocumentDialogProps) {
  const { toast } = useToast();
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loadingDepartments, setLoadingDepartments] = React.useState(false);
  const [format, setFormat] = React.useState<SaveFormat>('pdf');
  const [title, setTitle] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [selectedFolderPath, setSelectedFolderPath] = React.useState<string[]>([]);
  const [folderPickerOpen, setFolderPickerOpen] = React.useState(false);
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
    setFormat('pdf');
    setTitle(inferDefaultTitle(templateType, data, artifactTitle));
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

        setDepartmentId((prev) => {
          if (prev && normalized.some((d) => d.id === prev)) return prev;
          const inferredFromFolder =
            filteredFolderOptions.find((f) => f.departmentId && normalized.some((d) => d.id === f.departmentId))?.departmentId || '';
          return inferredFromFolder || normalized[0]?.id || '';
        });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateType, artifactTitle]);

  React.useEffect(() => {
    if (!open) return;
    setSelectedFolderPath((prev) => {
      if (prev.length) return prev;
      const firstFolder = filteredFolderOptions[0]?.path || [];
      return firstFolder;
    });
  }, [open, filteredFolderOptions]);

  const handleSave = React.useCallback(async () => {
    setError(null);

    if (!departmentId) {
      setError('Please choose a team/department.');
      return;
    }

    const normalizedTitle = String(title || '').trim();
    if (!normalizedTitle) {
      setError('Please enter a document title.');
      return;
    }

    setSubmitting(true);
    toast({
      title: 'Saving to Documents',
      description: 'Uploading file, starting ingestion, and auto-accepting after indexing.',
    });

    try {
      const result = await saveGeneratedDocumentToDocuments({
        templateType,
        data,
        format,
        title: normalizedTitle,
        departmentId,
        folderPath: selectedFolderPath,
        ephemeralArtifactId,
        autoAccept: true,
      });

      toast({
        title: 'Saved and Accepted',
        description: `${result.filename} was saved to Documents and auto-accepted.`,
      });
      onOpenChange(false);
      onSaved?.(result);
    } catch (e: any) {
      const message = e?.message || 'Failed to save generated document.';
      setError(message);
      toast({
        title: 'Save Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }, [data, departmentId, ephemeralArtifactId, format, onOpenChange, onSaved, selectedFolderPath, templateType, title, toast]);

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            Save To Documents
          </DialogTitle>
          <DialogDescription>
            Save this generated {templateLabel(templateType).toLowerCase()} to your Documents library, run ingestion, and auto-accept it after indexing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="generated-doc-title">Document Title</Label>
            <Input
              id="generated-doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
              placeholder={`${templateLabel(templateType)} Draft`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="generated-doc-format">Save Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as SaveFormat)} disabled={submitting}>
                <SelectTrigger id="generated-doc-format">
                  <SelectValue placeholder="Choose format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="docx">DOCX</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="generated-doc-department">Team / Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId} disabled={submitting || loadingDepartments}>
                <SelectTrigger id="generated-doc-department">
                  <SelectValue placeholder={loadingDepartments ? 'Loading teams...' : 'Choose team'} />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="generated-doc-folder">Folder</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                {pathToLabel(selectedFolderPath)}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFolderPickerOpen(true)}
                disabled={submitting}
              >
                Choose Folder
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Folder picker shows existing folders only. Select root if you want to save at workspace root.
            </p>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={submitting || loadingDepartments}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-2">{submitting ? 'Saving…' : 'Save & Auto-Accept'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>

      <FolderPickerDialog
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        folders={filteredFolderOptions.map((folder) => ({
          id: folder.id,
          path: folder.path,
          label: folder.label,
          name: folder.name,
        }))}
        currentPath={selectedFolderPath}
        onSelect={(path) => setSelectedFolderPath(path)}
        loading={false}
        title="Select Folder"
      />
    </Dialog>
  );
}
