"use client";

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import AppLayout from '@/components/layout/app-layout';
import { AccessDenied } from '@/components/access-denied';
import { StudioModuleNav } from '@/components/editor/studio-module-nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  getDocumentsHome,
  type DocumentsHomeContinueItem,
  type DocumentsHomeDocCard,
  type DocumentsHomeRecentComment,
  type DocumentsHomeResponse,
  type DocumentsHomeReturnedItem,
  type DocumentsHomeWaitingItem,
} from '@/lib/documents-home-api';
import { getOrgFeatures } from '@/lib/org-features';
import type { MyQueueItem } from '@/lib/approval-api';
import {
  FolderOpen,
  MessageSquareMore,
  PenSquare,
  RefreshCw,
  Search,
  LayoutDashboard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Plus,
  MessageCircle,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

function getDocumentLabel(doc?: DocumentsHomeDocCard | null) {
  return doc?.title || doc?.filename || 'Untitled document';
}

function formatWhen(value?: string | null) {
  if (!value) return 'Just now';
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return 'Recently';
  }
}

function getDocumentHref(doc?: DocumentsHomeDocCard | null, versionNumber?: number | null) {
  if (!doc?.id) return '/editor';
  const isEditorDoc = String(doc.type || '').toLowerCase() === 'editor';
  if (isEditorDoc && versionNumber) return `/editor/${doc.id}?version=${versionNumber}`;
  if (isEditorDoc) return `/editor/${doc.id}`;
  return `/editor/${doc.id}`;
}

function MinimalSection({ title, icon: Icon, action, children }: { title: string, icon: React.ElementType, action?: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="flex flex-col mb-8 w-full">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="flex flex-col w-full">
        {children}
      </div>
    </div>
  );
}

const CARD_COLORS = [
  "bg-red-400 dark:bg-red-500",
  "bg-amber-400 dark:bg-amber-500",
  "bg-teal-400 dark:bg-teal-500",
  "bg-blue-400 dark:bg-blue-500",
  "bg-indigo-400 dark:bg-indigo-500",
  "bg-pink-400 dark:bg-pink-500",
];

function ActionRow({
  title,
  badge,
  badgeColorClass,
  time,
  href,
  icon: Icon,
  iconColorClass
}: {
  title: string;
  badge?: React.ReactNode;
  badgeColorClass?: string;
  time: string;
  href: string;
  icon: React.ElementType;
  iconColorClass: string;
}) {
  return (
    <Link href={href} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors group">
      <div className="flex items-center gap-3">
        <Icon className={cn("h-[16px] w-[16px]", iconColorClass)} />
        <span className="text-[13px] font-bold text-foreground group-hover:text-primary transition-colors">{title}</span>
        {badge && <Badge className={cn("px-1.5 py-0 text-[10px] border-0 h-[22px]", badgeColorClass)}>{badge}</Badge>}
      </div>
      <div className="text-[11px] font-medium text-muted-foreground/80">
        {time}
      </div>
    </Link>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40 mb-3">
        <CheckCircle2 className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <div className="text-[13px] font-bold text-foreground">{title}</div>
      <div className="mt-1 text-[11px] text-muted-foreground/70 max-w-[250px]">{message}</div>
    </div>
  );
}

function PendingReviewRow({ item }: { item: MyQueueItem }) {
  const title = item.doc?.title || item.doc?.filename || 'Untitled document';
  const href = `/editor/${item.approval.doc_id}?version=${item.approval.submitted_version_number}`;

  return (
    <ActionRow
      title={title}
      badge="Needs Your Review"
      badgeColorClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
      time={formatWhen(item.assignment?.assigned_at)}
      href={href}
      icon={AlertTriangle}
      iconColorClass="text-amber-500"
    />
  );
}

function CommentRow({ item }: { item: DocumentsHomeRecentComment }) {
  return (
    <ActionRow
      title={getDocumentLabel(item.doc)}
      badge="Recent Comment"
      badgeColorClass="bg-red-500/10 text-red-600 dark:text-red-400"
      time={formatWhen(item.commentedAt)}
      href={getDocumentHref(item.doc, item.doc.approval?.submittedVersionNumber)}
      icon={MessageCircle}
      iconColorClass="text-red-500"
    />
  );
}

function ReturnedRow({ item }: { item: DocumentsHomeReturnedItem }) {
  return (
    <ActionRow
      title={getDocumentLabel(item.doc)}
      badge="Returned for Changes"
      badgeColorClass="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
      time={formatWhen(item.rejectedAt)}
      href={getDocumentHref(item.doc)}
      icon={AlertTriangle}
      iconColorClass="text-yellow-500"
    />
  );
}

function ContinueCard({ item, index }: { item: DocumentsHomeContinueItem, index: number }) {
  const colorClass = CARD_COLORS[index % CARD_COLORS.length];
  const href = getDocumentHref(item.doc, item.doc.approval?.submittedVersionNumber);

  return (
    <Link href={href} className="group relative flex flex-col w-[200px] h-[130px] rounded-[10px] overflow-hidden bg-card border border-border/10 shadow-sm hover:border-border/30 transition-colors shrink-0">
      <div className={cn("h-[64px] w-full transition-opacity group-hover:opacity-90", colorClass)} />
      <div className="flex flex-col flex-1 p-3 bg-card border-t border-border/5">
        <div className="text-[13px] font-bold text-foreground truncate">{getDocumentLabel(item.doc)}</div>
        <div className="flex items-center gap-1.5 mt-auto text-[11px] text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span>{formatWhen(item.interactedAt)}</span>
        </div>
      </div>
    </Link>
  );
}

function WaitingRow({ item }: { item: DocumentsHomeWaitingItem }) {
  return (
    <ActionRow
      title={getDocumentLabel(item.doc)}
      badge="In Review"
      badgeColorClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
      time={formatWhen(item.submittedAt)}
      href={getDocumentHref(item.doc)}
      icon={Clock}
      iconColorClass="text-blue-500"
    />
  );
}

function AvailableCard({ item, index }: { item: DocumentsHomeDocCard, index: number }) {
  const colorClass = CARD_COLORS[index % CARD_COLORS.length];

  return (
    <Link href={getDocumentHref(item)} className="group relative flex flex-col w-[200px] h-[130px] rounded-[10px] overflow-hidden bg-card border border-border/10 shadow-sm hover:border-border/30 transition-colors shrink-0">
      <div className={cn("h-[64px] w-full transition-opacity group-hover:opacity-90", colorClass)} />
      <div className="flex flex-col flex-1 p-3 bg-card border-t border-border/5">
        <div className="text-[13px] font-bold text-foreground truncate">{getDocumentLabel(item)}</div>
        <div className="flex items-center gap-1.5 mt-auto text-[11px] text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span>{formatWhen(item.uploadedAt || item.head?.lastEditedAt)}</span>
        </div>
      </div>
    </Link>
  );
}

function NewPageCard({ canCreate }: { canCreate: boolean }) {
  if (!canCreate) return null;
  return (
    <Link href="/editor" className="group relative flex flex-col w-[200px] h-[130px] rounded-[10px] overflow-hidden bg-muted/30 border border-transparent hover:border-border/30 transition-colors shrink-0 justify-center items-center text-muted-foreground hover:text-foreground">
      <Plus className="h-5 w-5 mb-3 opacity-50 group-hover:opacity-100 transition-opacity" />
      <div className="flex flex-col w-full absolute bottom-0 p-3">
        <div className="text-[12px] font-medium text-foreground truncate">New page</div>
        <div className="flex items-center gap-1.5 mt-auto text-[10px] text-muted-foreground/70">
          <span>Just now</span>
        </div>
      </div>
    </Link>
  );
}

function HomeLoading() {
  return (
    <div className="flex flex-col gap-10 max-w-5xl pt-4">
      {/* Recently Visited Skeletons */}
      <div className="flex flex-col mb-8 w-full">
        <div className="flex items-center gap-2 mb-4 px-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex overflow-x-auto gap-4 pb-4 scrollbar-hide">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-[200px] h-[130px] rounded-[10px]" />
          ))}
        </div>
      </div>

      {/* Action required Skeletons */}
      <div className="flex flex-col mb-8 w-full">
        <div className="flex items-center gap-2 mb-4 px-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-10 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DocumentsHomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { bootstrapData, hasPermission } = useAuth();
  const { editorEnabled, approvalsUsable } = getOrgFeatures(bootstrapData?.orgSettings);
  const canReadDocuments = hasPermission('documents.read');
  const canCreateDocuments = hasPermission('documents.create');

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [data, setData] = React.useState<DocumentsHomeResponse | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!bootstrapData) return;
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setLoadError(null);

    try {
      const next = await getDocumentsHome({ force: mode !== 'initial' });
      setData(next);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Unknown error');
      toast({
        title: 'Failed to load documents home',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bootstrapData, toast]);

  React.useEffect(() => {
    if (!bootstrapData || !canReadDocuments) return;
    void load('initial');
  }, [bootstrapData, canReadDocuments, load]);

  if (bootstrapData && !canReadDocuments) {
    return (
      <AppLayout>
        <AccessDenied
          title="Document Studio Not Available"
          message="You don't have permission to open the Document Studio workspace."
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout flush>
      <div className="min-h-screen flex flex-col bg-background">
        {/* Header - Linear style */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/40">
          <div className="px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <LayoutDashboard className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">
                    Document Studio
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {loading ? (
                      <span className="inline-block w-48 h-4 bg-muted/30 rounded animate-pulse" />
                    ) : (
                      "Review urgent work, reopen recent documents, and jump into the shared library"
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canCreateDocuments && editorEnabled ? (
                  <Button asChild size="sm" className="h-8 text-xs font-semibold">
                    <Link href="/editor">
                      <PenSquare className="mr-1.5 h-3.5 w-3.5" />
                      New doc
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        {/* Search & Actions Toolbar */}
        <div className="px-6 py-3 border-b border-border/30 bg-background/50">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-1 max-w-xs min-w-[200px]">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const trimmed = query.trim();
                    router.push(trimmed ? `/editor?q=${encodeURIComponent(trimmed)}` : '/editor');
                  }}
                >
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-9 h-8 bg-muted/30 border-border/40 text-sm placeholder:text-muted-foreground/50 w-full"
                    placeholder="Search documents..."
                  />
                </form>
              </div>

              {/* Module Nav */}
              <StudioModuleNav />
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-auto px-6 py-6 md:px-8 max-w-[1400px]">

          {loading ? (
            <HomeLoading />
          ) : !data ? (
            <Card className="border-border/40 shadow-sm mt-8">
              <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
                <div className="text-base font-semibold">Documents Home is unavailable right now</div>
                <div className="max-w-xl text-[13px] text-muted-foreground">
                  {loadError || 'We could not load your documents workspace.'}
                </div>
                <Button variant="outline" size="sm" onClick={() => void load('refresh')}>Try again</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-10 max-w-5xl pt-4">

              {(data.continueWorking.length > 0 || (canCreateDocuments && editorEnabled)) && (
                <MinimalSection title="Recently visited" icon={Clock}>
                  <div className="flex overflow-x-auto gap-4 pb-4 scrollbar-hide">
                    {data.continueWorking.slice(0, 4).map((item, i) => (
                      <ContinueCard key={`${item.doc.id}-${item.interaction}`} item={item} index={i} />
                    ))}
                    <NewPageCard canCreate={canCreateDocuments && editorEnabled} />
                  </div>
                </MinimalSection>
              )}

              {((data.actionRequired.pendingReviews?.length || 0) + (data.actionRequired.recentComments?.length || 0) + (data.actionRequired.returnedForChanges?.length || 0) > 0) && (
                <MinimalSection
                  title="Action required"
                  icon={Zap}
                  action={
                    approvalsUsable ? (
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" asChild>
                        <Link href="/approvals?tab=needs-review">View all</Link>
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="flex flex-col gap-0.5">
                    {data.actionRequired.pendingReviews.map((item) => (
                      <PendingReviewRow key={item.assignment.id} item={item} />
                    ))}
                    {data.actionRequired.recentComments.map((item) => (
                      <CommentRow key={item.threadId} item={item} />
                    ))}
                    {data.actionRequired.returnedForChanges.map((item) => (
                      <ReturnedRow key={item.approvalId} item={item} />
                    ))}
                  </div>
                </MinimalSection>
              )}

              {data.waitingOnOthers.length > 0 && (
                <MinimalSection
                  title="Waiting on others"
                  icon={Clock}
                  action={
                    approvalsUsable ? (
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" asChild>
                        <Link href="/approvals?tab=submitted">View all</Link>
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="flex flex-col gap-0.5">
                    {data.waitingOnOthers.map((item) => (
                      <WaitingRow key={item.approvalId} item={item} />
                    ))}
                  </div>
                </MinimalSection>
              )}

              {data.availableToMe.length > 0 && (
                <MinimalSection title="Available library" icon={FolderOpen}>
                  <div className="flex overflow-x-auto gap-4 pb-4 scrollbar-hide">
                    {data.availableToMe.map((item, i) => (
                      <AvailableCard key={item.id} item={item} index={i + 2} />
                    ))}
                  </div>
                </MinimalSection>
              )}

            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
