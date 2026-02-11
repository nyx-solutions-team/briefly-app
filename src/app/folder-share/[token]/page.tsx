"use client";

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  AlertTriangle,
  Archive,
  Download,
  FileText,
  ShieldCheck,
  Files,
  ExternalLink,
  Lock,
  Search,
  ChevronRight,
  ShieldAlert,
  Layout,
  Sun,
  Moon,
  Folder
} from 'lucide-react';
import { formatAppDateTime, formatBytes, cn } from '@/lib/utils';
import Link from 'next/link';

type FolderSharePayload = {
  share: {
    id: string;
    folderPath: string[];
    expiresAt: string;
    allowDownload: boolean;
    allowZipDownload: boolean;
    requiresPassword: boolean;
    viewsCount?: number | null;
  };
  summary: {
    totalFiles: number;
    totalFolders: number;
  };
  folders: Array<{
    id: string;
    title: string;
    folderPath: string[];
  }>;
  files: Array<{
    id: string;
    title: string;
    filename?: string | null;
    folderPath: string[];
    mimeType?: string | null;
    fileSizeBytes?: number | null;
    uploadedAt?: string | null;
  }>;
};

function isPathPrefix(path: string[], prefix: string[]) {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}

function normalizeFolderName(title?: string | null, fallback = 'Folder') {
  const raw = (title || fallback).trim();
  if (raw.startsWith('[Folder] ')) return raw.slice(9).trim() || fallback;
  return raw || fallback;
}

export default function FolderSharePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [loading, setLoading] = useState(true);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [authorizedPassword, setAuthorizedPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [payload, setPayload] = useState<FolderSharePayload | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Initial theme check on client
    if (typeof document !== 'undefined') {
      setIsDark(document.documentElement.classList.contains('dark'));
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (typeof document !== 'undefined') {
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const folderLabel = useMemo(() => {
    const path = payload?.share?.folderPath || [];
    if (!path.length) return 'Shared Workspace';
    return path[path.length - 1] || 'Shared Workspace';
  }, [payload?.share?.folderPath]);

  const sharedRootPath = payload?.share?.folderPath || [];

  const visibleFolders = useMemo(() => {
    if (!payload?.folders) return [];
    const query = searchQuery.trim().toLowerCase();
    const unique = new Map<string, {
      id: string;
      name: string;
      fullPath: string[];
      relPath: string[];
    }>();

    for (const folder of payload.folders) {
      const fullPath = Array.isArray(folder.folderPath) ? folder.folderPath : [];
      if (!isPathPrefix(fullPath, sharedRootPath)) continue;

      const relPath = fullPath.slice(sharedRootPath.length);
      if (relPath.length === 0) continue; // shared root itself
      if (relPath.length !== currentPath.length + 1) continue;
      if (!isPathPrefix(relPath, currentPath)) continue;

      const key = relPath.join('/');
      if (unique.has(key)) continue;
      const name = normalizeFolderName(folder.title, relPath[relPath.length - 1] || 'Folder');
      if (query && !name.toLowerCase().includes(query)) continue;
      unique.set(key, { id: folder.id, name, fullPath, relPath });
    }

    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [payload?.folders, searchQuery, sharedRootPath, currentPath]);

  const visibleFiles = useMemo(() => {
    if (!payload?.files) return [];
    const query = searchQuery.trim().toLowerCase();
    return payload.files
      .filter((file) => {
        const filePath = Array.isArray(file.folderPath) ? file.folderPath : [];
        if (!isPathPrefix(filePath, sharedRootPath)) return false;
        const relPath = filePath.slice(sharedRootPath.length);
        if (relPath.length !== currentPath.length) return false;
        if (!isPathPrefix(relPath, currentPath)) return false;
        if (!query) return true;
        const text = (file.title || file.filename || '').toLowerCase();
        return text.includes(query);
      })
      .sort((a, b) => (a.title || a.filename || '').localeCompare(b.title || b.filename || ''));
  }, [payload?.files, searchQuery, sharedRootPath, currentPath]);

  const visibleItemCount = visibleFolders.length + visibleFiles.length;

  useEffect(() => {
    let mounted = true;

    const loadShare = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);

      try {
        const data = await apiFetch<FolderSharePayload>(`/folder-shares/${token}`, { skipCache: true });
        if (!mounted) return;

        setPayload(data);
        setPassword('');
        setAuthorizedPassword('');
        setIsUnlocked(!data?.share?.requiresPassword);
        setPasswordError(null);
        setCurrentPath([]);
        setSearchQuery('');
      } catch (err: any) {
        if (!mounted) return;
        if (err?.status === 410) setError('This shared folder link has expired.');
        else if (err?.status === 404) setError('This shared folder link is invalid.');
        else setError(err?.message || 'Unable to load shared folder.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadShare();
    return () => {
      mounted = false;
    };
  }, [token]);

  const unlockShare = async () => {
    if (!token || !payload?.share?.requiresPassword) return;
    if (!password.trim()) {
      setPasswordError('Please enter the password to continue.');
      return;
    }

    setUnlocking(true);
    setPasswordError(null);

    try {
      await apiFetch(`/folder-shares/${token}/authorize`, {
        method: 'POST',
        body: { password },
        skipCache: true,
      });
      setAuthorizedPassword(password);
      setIsUnlocked(true);
    } catch (err: any) {
      if (err?.status === 401) setPasswordError('Invalid password. Please try again.');
      else if (err?.status === 410) setError('This shared folder link has expired.');
      else setPasswordError('Verification failed. Please try again.');
    } finally {
      setUnlocking(false);
    }
  };

  const downloadZip = async () => {
    if (!token || !payload) return;
    if (payload.share.requiresPassword && !isUnlocked) return;

    setDownloadingZip(true);
    setPasswordError(null);

    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
      const requestBody = payload.share.requiresPassword
        ? { password: authorizedPassword || password }
        : {};

      const response = await fetch(`${base}/folder-shares/${token}/zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let msg = `${response.status} ${response.statusText}`;
        try {
          const err = await response.json();
          msg = err?.error || msg;
        } catch { /* no-op */ }
        throw new Error(msg);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename=\"([^\"]+)\"/i);
      const filename = match?.[1] || `${folderLabel.replace(/\s+/g, '-').toLowerCase()}-shared.zip`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setPasswordError(err?.message || 'Failed to prepare zip download.');
    } finally {
      setDownloadingZip(false);
    }
  };

  const downloadFile = async (docId: string) => {
    if (!token || !payload) return;
    if (payload.share.requiresPassword && !isUnlocked) return;

    setDownloadingFileId(docId);
    setPasswordError(null);
    try {
      const body = payload.share.requiresPassword
        ? { docId, password: authorizedPassword || password }
        : { docId };
      const data: any = await apiFetch(`/folder-shares/${token}/file`, {
        method: 'POST',
        body,
        skipCache: true,
      });
      if (data?.url) window.open(data.url, '_blank', 'noopener');
    } catch (err: any) {
      setPasswordError('Unable to download this file.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground/60">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-[13px] font-bold uppercase tracking-widest animate-pulse">Accessing Portal</p>
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md w-full bg-card border border-border/40 rounded-[2.5rem] p-10 md:p-12 shadow-sm text-center space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/5 border border-destructive/10">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Link Inactive</h1>
            <p className="text-muted-foreground text-[14px] leading-relaxed">
              {error || 'This shared workspace is no longer active or your access token is invalid.'}
            </p>
          </div>
          <Button asChild variant="outline" className="w-full h-12 rounded-xl bg-background hover:bg-muted/50 border-border/50">
            <Link href="https://briefly-docs.com/">Return to Homepage</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isPasswordLocked = payload.share.requiresPassword && !isUnlocked;
  const breadcrumbSegments = [folderLabel, ...currentPath];

  return (
    <div className="min-h-screen bg-background/30 text-foreground selection:bg-primary/10">

      {/* Header - Aligned with Settings Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/10 shadow-sm">
              <img src="/favicon.ico" alt="Briefly" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight">Shared Portal</h1>
              <p className="hidden sm:block text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">Verified by Briefly Docs</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all shadow-sm"
            >
              {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </Button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-[10px] md:text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Secure Access</span>
            </div>
            <Button variant="ghost" size="sm" className="h-9 rounded-lg text-muted-foreground hover:text-foreground hidden sm:flex" asChild>
              <Link href="https://briefly-docs.com/">About Briefly <ExternalLink className="ml-2 h-3 w-3" /></Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14">

          {/* Sidebar - Matching Preferences Overview Style */}
          <div className="lg:col-span-4 space-y-8 lg:sticky lg:top-28">
            <div className="space-y-5">
              <Badge variant="outline" className="px-3 py-1 rounded-full border-primary/20 bg-primary/5 text-primary text-[10px] uppercase font-bold tracking-[0.15em]">
                Active Workspace
              </Badge>
              <div className="space-y-3">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                  {folderLabel}
                </h1>
                <p className="text-muted-foreground text-[15px] leading-relaxed">
                  Personalized documentation access for your review. All assets are encrypted and served via secure portal.
                </p>
              </div>
            </div>

            {/* Metadata Container - Matching Section/SettingRow hybrid */}
            <div className="group relative overflow-hidden rounded-[2rem] bg-card border border-border/40 p-6 shadow-sm transition-all hover:border-border/60">
              <div className="flex items-center gap-2 mb-6">
                <Layout className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Workspace Details</span>
              </div>

              <div className="space-y-4">
                {/* Item Rows */}
                <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border/10 bg-background/40">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/30">
                      <Files className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                    <div>
                      <div className="text-[12px] font-bold text-foreground">Storage</div>
                      <div className="text-[11px] text-muted-foreground">Total Documents</div>
                    </div>
                  </div>
                  <span className="text-[13px] font-bold text-primary">{payload.summary.totalFiles}</span>
                </div>

                <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border/10 bg-background/40">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/30">
                      <Folder className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                    <div>
                      <div className="text-[12px] font-bold text-foreground">Structure</div>
                      <div className="text-[11px] text-muted-foreground">Total Folders</div>
                    </div>
                  </div>
                  <span className="text-[13px] font-bold text-primary">{payload.summary.totalFolders}</span>
                </div>

                <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border/10 bg-background/40">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/30">
                      <Lock className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                    <div>
                      <div className="text-[12px] font-bold text-foreground">Security</div>
                      <div className="text-[11px] text-muted-foreground">Access Level</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-foreground uppercase tracking-tighter">
                    {payload.share.requiresPassword ? 'Authenticated' : 'Protected'}
                  </span>
                </div>
              </div>

              {payload.share.allowZipDownload && !isPasswordLocked && (
                <div className="mt-6 pt-6 border-t border-border/10">
                  <Button
                    onClick={downloadZip}
                    disabled={downloadingZip}
                    className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[13px] shadow-sm gap-2"
                  >
                    {downloadingZip ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                    Download Archive (ZIP)
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-8">
            {isPasswordLocked ? (
              /* Password Entry - Matching Section Card style but more centered */
              <div className="bg-card border border-border/40 rounded-[2.5rem] p-8 md:p-16 shadow-lg border-t-8 border-t-primary">
                <div className="max-w-md mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="flex flex-col items-center text-center space-y-5">
                    <div className="h-20 w-20 rounded-3xl bg-primary/5 flex items-center justify-center border border-primary/20 shadow-inner">
                      <Lock className="h-10 w-10 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-bold tracking-tight">Identity Required</h2>
                      <p className="text-muted-foreground text-[14px] leading-relaxed">
                        This workspace is protected. Please enter the secure access code to view and download documentation.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3 px-1">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-1">Access Password</label>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-14 bg-background border-border/40 rounded-2xl text-center text-xl tracking-[0.4em] placeholder:tracking-normal focus:bg-muted/10 transition-all font-mono"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void unlockShare();
                        }}
                      />
                    </div>

                    {passwordError && (
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/5 border border-destructive/10 text-[13px] font-semibold text-destructive animate-in shake-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {passwordError}
                      </div>
                    )}

                    <Button
                      onClick={unlockShare}
                      disabled={unlocking || !password.trim()}
                      className="w-full h-14 rounded-2xl font-bold text-base shadow-md group active:scale-[0.98] transition-all"
                    >
                      {unlocking ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                          Verifying...
                        </>
                      ) : (
                        <>Unlock Secure Portal <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /></>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* File Browser - Matching Settings Table/List style */
              <div className="bg-card border border-border/40 rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col min-h-[600px] animate-in fade-in duration-500">

                {/* Browser Controls */}
                <div className="px-6 md:px-8 py-6 border-b border-border/30 bg-muted/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="w-full space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      {breadcrumbSegments.map((segment, idx) => {
                        const isLast = idx === breadcrumbSegments.length - 1;
                        return (
                          <div key={`${segment}-${idx}`} className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isLast}
                              onClick={() => setCurrentPath(idx === 0 ? [] : currentPath.slice(0, idx))}
                              className={cn(
                                'rounded-md px-1.5 py-0.5 transition-colors',
                                isLast
                                  ? 'text-foreground cursor-default'
                                  : 'hover:text-foreground hover:bg-muted/40'
                              )}
                            >
                              {segment}
                            </button>
                            {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
                          </div>
                        );
                      })}
                    </div>
                    <div className="relative w-full sm:w-96">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                      <Input
                        placeholder="Search current folder..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-11 bg-background border-border/30 rounded-xl text-sm focus:bg-muted/10"
                      />
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-3 py-1.5 rounded-lg border border-border/20 bg-background/50">
                    {visibleItemCount} item{visibleItemCount === 1 ? '' : 's'}
                  </div>
                </div>

                {/* File List */}
                <div className="flex-1">
                  {visibleItemCount === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center text-muted-foreground space-y-4">
                      <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center">
                        <Files className="h-8 w-8 opacity-20" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[15px] font-bold text-foreground/70">
                          {searchQuery ? 'No matching results' : 'This folder is empty'}
                        </p>
                        <p className="text-[12px] opacity-60 max-w-[240px]">
                          {searchQuery ? 'Try a different search term.' : 'No subfolders or files are available at this level.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/10">
                      {currentPath.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCurrentPath((prev) => prev.slice(0, -1))}
                          className="w-full text-left group flex items-center gap-4 px-6 md:px-8 py-4 hover:bg-muted/10 transition-colors"
                        >
                          <div className="h-10 w-10 shrink-0 rounded-xl bg-muted/20 border border-border/20 flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
                            <ChevronRight className="h-4 w-4 rotate-180" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-[14px] font-bold text-foreground tracking-tight">Back to parent folder</h3>
                          </div>
                        </button>
                      )}

                      {visibleFolders.map((folder) => (
                        <button
                          key={folder.id || folder.relPath.join('/')}
                          type="button"
                          onClick={() => setCurrentPath(folder.relPath)}
                          className="w-full text-left group flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 md:px-8 py-5 hover:bg-muted/10 transition-colors"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="h-12 w-12 shrink-0 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 group-hover:bg-amber-500/15 transition-all">
                              <Folder className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate text-[15px] font-bold text-foreground mb-0.5 tracking-tight">
                                {folder.name}
                              </h3>
                              <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                                Folder
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                            Open
                            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </button>
                      ))}

                      {visibleFiles.map((file) => (
                        <div
                          key={file.id}
                          className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 md:px-8 py-5 hover:bg-muted/10 transition-colors"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="h-12 w-12 shrink-0 rounded-xl bg-muted/20 border border-border/20 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/5 transition-all">
                              <FileText className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate text-[15px] font-bold text-foreground mb-0.5 tracking-tight">
                                {file.title || file.filename || 'Untitled'}
                              </h3>
                              <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                                <span className="font-bold">{file.fileSizeBytes ? formatBytes(file.fileSizeBytes) : 'DOCUMENT'}</span>
                                <span className="h-1 w-1 rounded-full bg-border" />
                                <span className="truncate max-w-[150px] opacity-70">{file.filename || (file as any).mimeType?.split('/')[1]?.toUpperCase() || 'ASSET'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadFile(file.id)}
                              disabled={!payload.share.allowDownload || downloadingFileId === file.id}
                              className="h-9 px-4 rounded-lg border-border/40 hover:bg-primary hover:text-primary-foreground hover:border-primary font-bold text-[11px] uppercase tracking-widest gap-2 shadow-sm active:scale-95 transition-all"
                            >
                              {downloadingFileId === file.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              <span>Download</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Portal Footer Info */}
                <div className="px-8 py-5 bg-muted/5 border-t border-border/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3 w-3" />
                    <span>End-to-End Encryption Enabled</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-emerald-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/20" />
                      Online Session
                    </div>
                    <span className="h-3 w-px bg-border" />
                    <span>PID: {payload.share.id.slice(0, 8)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Brand Integration Footer - Improved Marketing Section */}
        <footer className="mt-28 py-16 border-t border-border/40">
          <div className="flex flex-col items-center text-center space-y-10">
            <div className="flex flex-col items-center space-y-3">
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-card border border-border shadow-sm group hover:scale-105 transition-transform duration-500">
                <img src="/favicon.ico" alt="Briefly" className="h-4 w-4" />
                <span className="text-[13px] font-bold tracking-tight">Briefly Docs <span className="text-muted-foreground font-medium">Enterprise</span></span>
              </div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.3em]">Architectural Precision</p>
            </div>

            <div className="max-w-2xl space-y-6">
              <div className="space-y-3">
                <h3 className="text-xl md:text-2xl font-bold tracking-tight">Experience Smarter Document Workflows</h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed">
                  This portal was created using Briefly Docs — the premier intelligence platform for professional documentation.
                  Share assets securely, automate insights, and maintain full control over your organization's knowledge.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button variant="default" className="h-11 px-8 rounded-xl font-bold text-[13px] shadow-lg shadow-primary/10" asChild>
                  <Link href="https://briefly-docs.com/">Get Started for Free</Link>
                </Button>
                <Button variant="outline" className="h-11 px-8 rounded-xl font-bold text-[13px] border-border/60" asChild>
                  <Link href="https://calendly.com/team-briefly-docs/30min">Schedule a Demo</Link>
                </Button>
              </div>
            </div>

            <div className="pt-8 flex items-center gap-8 text-[11px] font-medium text-muted-foreground/40 uppercase tracking-widest">
              <span className="hover:text-foreground transition-colors cursor-default">Privacy First</span>
              <span className="hover:text-foreground transition-colors cursor-default">Global Delivery</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
