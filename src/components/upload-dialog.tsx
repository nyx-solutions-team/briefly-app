"use client";

import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { UploadCloud, File, Loader, CheckCircle, AlertTriangle, FolderOpen } from 'lucide-react';
import { Progress } from './ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Document, StoredDocument } from '@/lib/types';
import { apiFetch, getApiContext } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useDocuments } from '@/hooks/use-documents';
import { useDepartments } from '@/hooks/use-departments';
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select';
import UploadFilePreview from './upload-file-preview';

type SignedUploadPayload = {
  signedUrl: string;
  storageKey: string;
  path?: string;
  token?: string | null;
  expiresAt?: string | null;
};

type AnalyzeSuccessResponse = {
  ocrText: string;
  metadata: any;
  geminiFile?: { fileId: string; fileUri: string; mimeType?: string };
};

type AnalyzeJobQueuedResponse = {
  jobId: string;
  status: string;
  expiresAt?: number;
};

type UploadAnalysisJobStatus = {
  jobId: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  result?: AnalyzeSuccessResponse;
  error?: string;
  fallback?: { ocrText: string; metadata: any } | null;
  httpStatus?: number;
  createdAt?: number;
  updatedAt?: number;
};

const uploadFileToSignedUrl = async (
  signedUrl: string,
  file: File,
  onProgress?: (progress: number) => void,
  retries = 3
): Promise<void> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            onProgress(percentComplete);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status: ${xhr.status} ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });

        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.send(file);
      });

      return;
    } catch (error) {
      if (attempt === retries) {
        throw error instanceof Error ? error : new Error('Upload failed');
      }

      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
};

const uploadFile = async (file: File, onProgress?: (progress: number) => void): Promise<{ storageKey: string }> => {
  const orgId = getApiContext().orgId || '';
  const signResp = await apiFetch<SignedUploadPayload>(`/orgs/${orgId}/uploads/sign`, {
    method: 'POST',
    body: {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
    },
  });

  if (!signResp?.signedUrl || !signResp.storageKey) {
    throw new Error('Failed to obtain signed upload URL');
  }

  await uploadFileToSignedUrl(signResp.signedUrl, file, onProgress, 3);
  return { storageKey: signResp.storageKey };
};

const waitForAnalysisJob = async (orgId: string, jobId: string): Promise<AnalyzeSuccessResponse> => {
  const maxWaitMs = 5 * 60 * 1000;
  const initialPollIntervalMs = 1500;
  const maxPollIntervalMs = 10000;
  const started = Date.now();
  let pollCount = 0;

  while (true) {
    const job = await apiFetch<UploadAnalysisJobStatus>(`/orgs/${orgId}/uploads/analyze/${jobId}`, { skipCache: true });

    if (job.status === 'succeeded' && job.result) {
      return job.result;
    }

    if (job.status === 'failed') {
      const err: any = new Error(job.error || 'AI analysis failed');
      err.status = job.httpStatus || 500;
      if (job.fallback) {
        err.data = { fallback: job.fallback };
      }
      throw err;
    }

    if (Date.now() - started > maxWaitMs) {
      const timeoutErr: any = new Error('AI analysis timed out');
      timeoutErr.status = 503;
      throw timeoutErr;
    }

    pollCount++;
    const backoffMultiplier = Math.min(Math.floor(pollCount / 5), 3);
    const currentInterval = Math.min(initialPollIntervalMs * Math.pow(2, backoffMultiplier), maxPollIntervalMs);
    await new Promise((resolve) => setTimeout(resolve, currentInterval));
  }
};

export default function UploadDialog({ onNewDocument }: { onNewDocument: (doc: StoredDocument) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState<Document['type']>('PDF');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Folder and department selection
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('org.manage_members');
  const { folders, createFolder } = useDocuments();
  const { departments, selectedDepartmentId, setSelectedDepartmentId } = useDepartments();

  // Auto-select the first available department when none is selected (legacy behavior).
  useEffect(() => {
    if (!selectedDepartmentId && departments.length > 0) {
      setSelectedDepartmentId(departments[0].id);
    }
  }, [departments, selectedDepartmentId, setSelectedDepartmentId]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Check file size limit (50MB)
      const maxSizeBytes = 50 * 1024 * 1024; // 50MB in bytes
      if (selectedFile.size > maxSizeBytes) {
        toast({
          title: 'File too large',
          description: `Files must be smaller than 50MB. Your file is ${(selectedFile.size / 1024 / 1024).toFixed(1)}MB.`,
          variant: 'destructive'
        });
        // Clear the file input
        if (event.target) event.target.value = '';
        return;
      }

      setFile(selectedFile);
      setFileName(selectedFile.name);
      const extension = selectedFile.name.split('.').pop()?.toLowerCase();
      let docType: Document['type'] = 'PDF';
      if (['png', 'jpg', 'jpeg'].includes(extension || '')) docType = 'Image';
      setFileType(docType);
      setStatus('idle');
      setProgress(0);
    }
  };

  const handleUpload = async () => {
    if (!file) { toast({ title: 'No file selected', description: 'Please select a file to upload.', variant: 'destructive' }); return; }

    setStatus('uploading');
    setProgress(0);

    try {
      const { orgId } = getApiContext();
      if (!orgId) throw new Error('No organization set');

      // Upload file to Supabase Storage
      const uploadResult = await uploadFile(file, (percentComplete) => {
        setProgress(Math.min(percentComplete, 90));
      });

      const uploaded = { storageKey: uploadResult.storageKey };

      setProgress(100);
      setStatus('processing');

      // 2) Server-side analysis (avoid duplicate client AI)
      let analysisResult: AnalyzeSuccessResponse;
      try {
        const analyzeInitiated = await apiFetch<AnalyzeJobQueuedResponse | AnalyzeSuccessResponse>(
          `/orgs/${orgId}/uploads/analyze`,
          {
            method: 'POST',
            body: { storageKey: uploaded.storageKey, mimeType: file.type || 'application/octet-stream' },
          }
        );

        if ('jobId' in analyzeInitiated) {
          analysisResult = await waitForAnalysisJob(orgId, analyzeInitiated.jobId);
        } else {
          analysisResult = analyzeInitiated;
        }
      } catch (e: any) {
        const status = e?.status || 0;
        const fallback = e?.data?.fallback || null;
        if ((status === 503 || status === 413) && fallback && typeof fallback === 'object') {
          analysisResult = fallback as AnalyzeSuccessResponse;
          toast({
            title: 'AI processing limited',
            description: 'Metadata was prefilled from filename. You can edit later if needed.',
          });
        } else {
          throw e;
        }
      }

      // 3) Validate department selection for admins
      if (isAdmin && folderPath.length === 0 && !selectedDepartmentId) {
        toast({
          title: 'Department selection required',
          description: 'Please select a department before uploading documents.',
          variant: 'destructive'
        });
        return;
      }

      // 4) Ensure nested folders exist - create each level sequentially
      console.log('🔍 Creating folder structure for path:', folderPath);
      try {
        for (let i = 0; i < folderPath.length; i++) {
          const slice = folderPath.slice(0, i + 1);
          const parentPath = slice.slice(0, -1);
          const folderName = slice[slice.length - 1];

          console.log(`🔍 Level ${i + 1}: Creating folder "${folderName}" with parent path:`, parentPath);

          // Check if folder already exists before creating
          const existing = folders.find(f => JSON.stringify(f) === JSON.stringify(slice));
          if (!existing) {
            console.log(`🔍 Folder "${folderName}" doesn't exist, creating...`);
            const result = await createFolder(parentPath, folderName);
            console.log(`🔍 Folder creation result:`, result);
          } else {
            console.log(`🔍 Folder "${folderName}" already exists, skipping creation`);
          }
        }
        console.log('✅ Folder structure creation completed successfully');
      } catch (error) {
        console.error('❌ Failed to create folder structure:', error);
        toast({
          title: 'Folder creation failed',
          description: `Could not create folder structure: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'destructive'
        });
        return;
      }

      // 5) Create metadata row
      const metadata = analysisResult.metadata || {};
      const documentData = {
        title: metadata.title || file.name,
        filename: file.name,
        type: fileType,
        subject: metadata.subject || '',
        description: metadata.description || metadata.summary || '',
        category: metadata.category || 'General',
        tags: metadata.tags || [],
        sender: metadata.sender || '',
        receiver: metadata.receiver || '',
        document_date: metadata.documentDate || '',
        folderPath: folderPath,
        departmentId: selectedDepartmentId || undefined,
      };

      console.log('🔍 Creating document with folderPath:', folderPath, 'Type:', typeof folderPath, 'Is Array:', Array.isArray(folderPath));

      const created = await apiFetch<any>(`/orgs/${orgId}/documents`, {
        method: 'POST',
        body: documentData
      });

      // 6) Finalize with storage key, size, mime
      const finalized = await apiFetch<StoredDocument | any>(`/orgs/${orgId}/uploads/finalize`, {
        method: 'POST',
        body: {
          documentId: created.id,
          storageKey: uploaded.storageKey,
          fileSizeBytes: file.size,
          mimeType: file.type,
        }
      });

      const docRecord = finalized?.id ? finalized : created;
      if (!docRecord?.id) {
        throw new Error('Document record missing identifier after finalize');
      }

      const newDoc: StoredDocument = {
        id: docRecord.id,
        name: docRecord.name || file.name,
        type: (docRecord.type as Document['type']) || fileType,
        uploadedAt: docRecord.uploadedAt ? new Date(docRecord.uploadedAt) : new Date(),
        version: docRecord.version || 1,
        keywords: metadata.keywords,
        summary: metadata.summary,
        content: analysisResult.ocrText,
        folderPath: docRecord.folderPath || folderPath,
      };

      onNewDocument(newDoc);
      setStatus('success');
    } catch (e) {
      console.error(e);
      setStatus('error');
      toast({ title: 'Upload Failed', description: (e as Error).message || 'There was an error.', variant: 'destructive' });
    }
  };

  const reset = () => {
    setFile(null);
    setFileName('');
    setProgress(0);
    setStatus('idle');
    setFolderPath([]);
    fileInputRef.current && (fileInputRef.current.value = '');
  };
  const onOpenChange = (isOpen: boolean) => { if (!isOpen) reset(); setOpen(isOpen); };

  const renderStatus = () => {
    switch (status) {
      case 'uploading': return (<div className="space-y-4 text-center"><p>Uploading {fileName}...</p><Progress value={progress} /></div>);
      case 'processing': return (<div className="space-y-4 text-center flex flex-col items-center"><Loader className="h-10 w-10 animate-spin text-primary" /><p>Processing document with AI...</p><p className="text-sm text-muted-foreground">Extracting metadata and performing OCR.</p></div>);
      case 'success': return (<div className="space-y-4 text-center flex flex-col items-center"><CheckCircle className="h-10 w-10 text-green-500" /><p className='font-semibold'>Upload Successful!</p><p className="text-sm text-muted-foreground">{fileName} has been stored.</p></div>);
      case 'error': return (<div className="space-y-4 text-center flex flex-col items-center"><AlertTriangle className="h-10 w-10 text-destructive" /><p className='font-semibold'>Upload Failed</p><p className="text-sm text-muted-foreground">Could not process {fileName}. Please try again.</p></div>);
      default: return (
        <div className="space-y-4">
          {/* Folder and Department Selection */}
          <div className="space-y-3">
            {/* Folder Selection */}
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Upload Destination</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <UiSelect value={folderPath.length ? folderPath.join('/') : '__root__'} onValueChange={(v) => {
                if (v === '__root__') setFolderPath([]);
                else setFolderPath(v.split('/').filter(Boolean));
              }}>
                <UiSelectTrigger className="w-full">
                  <UiSelectValue placeholder={folderPath.length ? `/${folderPath.join('/')}` : "Root folder"} />
                </UiSelectTrigger>
                <UiSelectContent>
                  <UiSelectItem value="__root__">📁 Root</UiSelectItem>
                  {folders.map((p, idx) => (
                    <UiSelectItem key={idx} value={p.join('/')}>📁 {p.join('/')}</UiSelectItem>
                  ))}
                </UiSelectContent>
              </UiSelect>
              <input
                className="rounded-md border bg-background p-2 text-sm"
                placeholder="Custom path e.g., Finance/2025/Q1"
                value={folderPath.join('/')}
                onChange={(e) => setFolderPath(e.target.value.split('/').filter(Boolean))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Documents will be uploaded to: <span className="font-medium">/{folderPath.join('/') || 'Root'}</span>
              <br />
              New folders will be created automatically if they don't exist.
            </p>

            {/* Department Selection for Admins */}
            {isAdmin && folderPath.length === 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Department</span>
                </div>
                <UiSelect value={selectedDepartmentId || undefined as any} onValueChange={(v) => setSelectedDepartmentId(v)}>
                  <UiSelectTrigger className="w-full">
                    <UiSelectValue placeholder="Select department" />
                  </UiSelectTrigger>
                  <UiSelectContent>
                    {departments.map(d => (<UiSelectItem key={d.id} value={d.id}>{d.name}</UiSelectItem>))}
                  </UiSelectContent>
                </UiSelect>
              </div>
            )}
          </div>

          {/* File Upload Section */}
          <div className="border-t pt-4">
            <label htmlFor="file-upload" className="relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-background p-4 md:p-8 text-center hover:bg-accent">
              <UploadCloud className="h-10 w-10 text-muted-foreground" />
              <span className="font-semibold text-primary">Click to upload</span>
              <span className="text-sm text-muted-foreground">or drag and drop</span>
              <span className="text-xs text-muted-foreground">PDF, TXT, MD, CSV/XLS/XLSX, JPG, PNG</span>
              <input
                ref={fileInputRef}
                id="file-upload"
                type="file"
                className="sr-only"
                onChange={handleFileChange}
                accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.csv,.xls,.xlsx,application/pdf,text/plain,text/markdown,image/jpeg,image/png,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              />
            </label>
            {fileName && (
              <div className="flex items-center justify-center rounded-md border bg-muted/50 p-2 text-sm mt-4">
                <File className="mr-2 h-4 w-4" />
                <span className='truncate'>{fileName}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
  };

  // Check if user has permission to create documents
  const canCreateDocuments = hasPermission('documents.create');
  
  // If user doesn't have upload permission, show disabled button with tooltip
  if (!canCreateDocuments) {
    return (
      <Button disabled title="Upload permission not available">
        <UploadCloud className="mr-2 h-4 w-4" />
        Upload Document
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button><UploadCloud className="mr-2 h-4 w-4" />Upload Document</Button></DialogTrigger>
      <DialogContent className={cn("sm:max-w-6xl max-h-[90vh] overflow-y-auto", { 'sm:max-w-md': status !== 'idle' })}>
        <DialogHeader><DialogTitle>Upload a new document</DialogTitle><DialogDescription>Your file will be uploaded to storage and scanned by AI.</DialogDescription></DialogHeader>
        <div className="py-4">
          {status === 'idle' && file ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Left side - Upload form */}
              <div className="space-y-4">
                {renderStatus()}
              </div>
              {/* Right side - File preview */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-3">Document Preview</h3>
                  <UploadFilePreview file={file} height="50vh" />
                </div>
              </div>
            </div>
          ) : (
            renderStatus()
          )}
        </div>
        <DialogFooter>
          {(status === 'idle' || status === 'error') ? (
            <Button onClick={handleUpload} disabled={!fileName}>{status === 'error' ? 'Try Again' : 'Upload'}</Button>
          ) : status === 'success' ? (
            <DialogClose asChild><Button>Done</Button></DialogClose>
          ) : (
            <Button disabled><Loader className="mr-2 h-4 w-4 animate-spin" />Please wait</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
