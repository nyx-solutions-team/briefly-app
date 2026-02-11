"use client";

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Download,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
  Lock,
  ChevronRight,
  ShieldAlert,
  Layout,
  Sun,
  Moon,
  Files
} from 'lucide-react';
import { formatBytes, cn } from '@/lib/utils';
import Link from 'next/link';

type SharePayload = {
  share: {
    id: string;
    expiresAt: string;
    allowDownload: boolean;
    allowPreview: boolean;
    requiresPassword: boolean;
    maxViews?: number | null;
    viewsCount?: number | null;
  };
  document: {
    id: string;
    title: string;
    filename?: string | null;
    mimeType?: string | null;
    fileSizeBytes?: number | null;
    type?: string | null;
  };
};

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<SharePayload['share'] | null>(null);
  const [document, setDocument] = useState<SharePayload['document'] | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Initial theme check
    if (typeof window !== 'undefined') {
      setIsDark(window.document.documentElement.classList.contains('dark'));
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (typeof window !== 'undefined') {
      if (next) {
        window.document.documentElement.classList.add('dark');
      } else {
        window.document.documentElement.classList.remove('dark');
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadShare = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<SharePayload>(`/shares/${token}`, { skipCache: true });
        if (!mounted) return;
        setShare(data.share);
        setDocument(data.document);
      } catch (err: any) {
        if (!mounted) return;
        if (err?.status === 410) {
          setError('This share link has expired.');
        } else if (err?.status === 404) {
          setError('This share link is invalid.');
        } else {
          setError(err?.message || 'Unable to load shared document.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadShare();
    return () => { mounted = false; };
  }, [token]);

  const downloadFile = async () => {
    if (!token) return;
    setDownloading(true);
    setPasswordError(null);
    try {
      const payload = password ? { password } : {};
      const data: any = await apiFetch(`/shares/${token}/file`, {
        method: 'POST',
        body: payload,
        skipCache: true,
      });
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener');
      }
    } catch (err: any) {
      if (err?.status === 401) {
        setPasswordError('Invalid access code. Please try again.');
      } else if (err?.status === 403) {
        setPasswordError('Downloads are disabled for this link.');
      } else if (err?.status === 410) {
        setError('This share link has expired.');
      } else {
        setPasswordError('Verification failed. Please try again.');
      }
    } finally {
      setDownloading(false);
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

  if (error || !document || !share) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md w-full bg-card border border-border/40 rounded-[2.5rem] p-10 md:p-12 shadow-sm text-center space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/5 border border-destructive/10">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Link Inactive</h1>
            <p className="text-muted-foreground text-[14px] leading-relaxed">
              {error || 'This shared document is no longer active or your access token is invalid.'}
            </p>
          </div>
          <Button asChild variant="outline" className="w-full h-12 rounded-xl bg-background hover:bg-muted/50 border-border/50">
            <Link href="https://briefly-docs.com/">Return to Homepage</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background/30 text-foreground selection:bg-primary/10">

      {/* Header - Aligned with Folder Share Portal */}
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
                Single Asset Share
              </Badge>
              <div className="space-y-3">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                  {document.title}
                </h1>
                <p className="text-muted-foreground text-[15px] leading-relaxed">
                  This document has been shared with you for secure review. All transmission is encrypted.
                </p>
              </div>
            </div>

            {/* Metadata Container */}
            <div className="group relative overflow-hidden rounded-[2rem] bg-card border border-border/40 p-6 shadow-sm transition-all hover:border-border/60">
              <div className="flex items-center gap-2 mb-6">
                <Layout className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Asset Details</span>
              </div>

              <div className="space-y-4">
                {/* Item Rows */}
                <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border/10 bg-background/40">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/30">
                      <Files className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                    <div>
                      <div className="text-[12px] font-bold text-foreground">Size</div>
                      <div className="text-[11px] text-muted-foreground">Hydrated Weight</div>
                    </div>
                  </div>
                  <span className="text-[13px] font-bold text-primary">{formatBytes(document.fileSizeBytes || 0)}</span>
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
                    {share.requiresPassword ? 'Authenticated' : 'Protected'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-8">
            <div className="bg-card border border-border/40 rounded-[2.5rem] p-8 md:p-16 shadow-lg flex flex-col items-center justify-center min-h-[400px]">
              <div className="max-w-md w-full mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

                {share.requiresPassword ? (
                  <div className="flex flex-col items-center text-center space-y-5">
                    <div className="h-20 w-20 rounded-3xl bg-primary/5 flex items-center justify-center border border-primary/20 shadow-inner">
                      <Lock className="h-10 w-10 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-bold tracking-tight">Identity Required</h2>
                      <p className="text-muted-foreground text-[14px] leading-relaxed">
                        This asset is protected. Please enter the secure access code to download.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center space-y-5">
                    <div className="h-20 w-20 rounded-3xl bg-primary/5 flex items-center justify-center border border-primary/20 shadow-inner">
                      <FileText className="h-10 w-10 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-bold tracking-tight">Ready for Download</h2>
                      <p className="text-muted-foreground text-[14px] leading-relaxed">
                        Click the button below to retrieve the shared asset.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {share.requiresPassword && (
                    <div className="space-y-3 px-1">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-1">Access Password</label>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-14 bg-background border-border/40 rounded-2xl text-center text-xl tracking-[0.4em] placeholder:tracking-normal focus:bg-muted/10 transition-all font-mono"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void downloadFile();
                        }}
                      />
                    </div>
                  )}

                  {passwordError && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/5 border border-destructive/10 text-[13px] font-semibold text-destructive animate-in shake-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {passwordError}
                    </div>
                  )}

                  <Button
                    onClick={downloadFile}
                    disabled={downloading || (!share.allowDownload && !share.allowPreview)}
                    className="w-full h-14 rounded-2xl font-bold text-base shadow-md group active:scale-[0.98] transition-all gap-2"
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Preparing...
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5" />
                        Download Asset {share.requiresPassword && <ChevronRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />}
                      </>
                    )}
                  </Button>

                  {!share.allowDownload && !share.allowPreview && (
                    <p className="text-center text-[12px] text-muted-foreground">
                      Downloads are currently disabled for this link.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Document Info Bar - Bottom of browser area look */}
            <div className="mt-8 px-8 py-5 bg-card/50 border border-border/30 rounded-[1.5rem] flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <Lock className="h-3 w-3" />
                <span>End-to-End Encryption Enabled</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/20" />
                  Secure Session
                </div>
                <span className="h-3 w-px bg-border" />
                <span>PID: {share.id.slice(0, 8)}</span>
              </div>
            </div>
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
