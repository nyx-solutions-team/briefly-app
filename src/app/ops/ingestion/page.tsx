"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import SimpleOpsLayout from '@/components/layout/simple-ops-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Link from 'next/link';
import { RefreshCcw, Eye, RotateCcw, XCircle, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useOpsFilters } from '@/components/ops/ops-filters-context';
import { formatOpsDate } from '@/lib/utils';
import { useOpsPageHeader } from '@/components/ops/ops-header-context';

type IngestionSummary = {
  counts: Record<string, number>;
  backlog: number;
  throughput24h: number;
  avgProcessingMs: number | null;
  avgReviewMs: number | null;
  updatedAt: string;
};

type IngestionJob = {
  orgId: string;
  orgName: string;
  docId: string;
  documentTitle: string | null;
  filename: string | null;
  status: string;
  submittedAt: string;
  processingStartedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  storageKey: string | null;
  mimeType: string | null;
};

type JobsResponse = {
  rows: IngestionJob[];
  nextCursor?: string | null;
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'failed', label: 'Failed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_VARIANT: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  processing: 'secondary',
  needs_review: 'outline',
  failed: 'destructive',
  accepted: 'secondary',
  rejected: 'outline',
};

export default function OpsIngestionPage() {
  return (
    <SimpleOpsLayout>
      <IngestionContent />
    </SimpleOpsLayout>
  );
}

function IngestionContent() {
  const { toast } = useToast();
  const { orgId } = useOpsFilters();

  const [summary, setSummary] = useState<IngestionSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [actionJobId, setActionJobId] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const resp = await apiFetch<IngestionSummary>('/ops/ingestion/summary', { skipCache: true });
      setSummary(resp);
    } catch (err) {
      console.error(err);
      setSummaryError(err instanceof Error ? err.message : 'Failed to load summary');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const fetchJobs = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const params = new URLSearchParams();
      if (orgId) params.set('orgId', orgId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (opts?.cursor) params.set('cursor', opts.cursor);
      setJobsLoading(!opts?.append);
      setJobsError(null);
      try {
        const resp = await apiFetch<JobsResponse>(`/ops/ingestion/jobs?${params.toString()}`, {
          skipCache: true,
        });
        setNextCursor(resp.nextCursor || null);
        setJobs((prev) => (opts?.append ? [...prev, ...(resp.rows || [])] : resp.rows || []));
      } catch (err) {
        console.error(err);
        setJobsError(err instanceof Error ? err.message : 'Failed to load jobs');
        if (!opts?.append) setJobs([]);
      } finally {
        setJobsLoading(false);
      }
    },
    [orgId, statusFilter]
  );

  const headerActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" className="gap-2" onClick={() => void fetchJobs()}>
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </Button>
        <Select value={autoRefresh ? 'on' : 'off'} onValueChange={(val) => setAutoRefresh(val === 'on')}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="on">Auto-refresh</SelectItem>
            <SelectItem value="off">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>
    ),
    [autoRefresh, fetchJobs]
  );

  useOpsPageHeader({
    title: 'Ingestion Monitor',
    subtitle: 'Live view of document ingestion queues, failures, and reviewer workloads.',
    actions: headerActions,
  });

  useEffect(() => {
    void fetchSummary();
    const interval = setInterval(() => {
      if (autoRefresh) void fetchSummary();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchSummary, autoRefresh]);

  useEffect(() => {
    void fetchJobs();
    const interval = setInterval(() => {
      if (autoRefresh) void fetchJobs();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchJobs, autoRefresh]);

  const filteredJobs = useMemo(() => {
    if (!search.trim()) return jobs;
    const needle = search.toLowerCase();
    return jobs.filter((job) => {
      return (
        job.documentTitle?.toLowerCase().includes(needle) ||
        job.filename?.toLowerCase().includes(needle) ||
        job.orgName.toLowerCase().includes(needle) ||
        job.docId.toLowerCase().includes(needle)
      );
    });
  }, [jobs, search]);

  const groupedByOrg = useMemo(() => {
    const map = new Map<string, IngestionJob[]>();
    for (const job of filteredJobs) {
      const list = map.get(job.orgId) || [];
      list.push(job);
      map.set(job.orgId, list);
    }
    return Array.from(map.entries()).map(([org, list]) => {
      const sorted = [...list].sort((a, b) => {
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      });
      return [org, sorted] as [string, IngestionJob[]];
    });
  }, [filteredJobs]);

  const handleRetry = async (job: IngestionJob) => {
    setActionJobId(job.docId);
    try {
      await apiFetch(`/ops/ingestion/jobs/${job.orgId}/${job.docId}/retry`, { method: 'POST' });
      toast({ title: 'Retry queued', description: `${job.documentTitle || job.docId} set to pending` });
      void fetchJobs();
    } catch (err) {
      console.error(err);
      toast({
        title: 'Retry failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setActionJobId(null);
    }
  };

  const handleCancel = async (job: IngestionJob) => {
    setActionJobId(job.docId);
    try {
      await apiFetch(`/ops/ingestion/jobs/${job.orgId}/${job.docId}/cancel`, { method: 'POST' });
      toast({ title: 'Job removed', description: `${job.documentTitle || job.docId} removed from queue` });
      void fetchJobs();
    } catch (err) {
      console.error(err);
      toast({
        title: 'Cancel failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setActionJobId(null);
    }
  };

  return (
      <div className="px-4 md:px-6 py-6 space-y-6">
        <SummarySection summary={summary} loading={summaryLoading} error={summaryError} />

        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Job backlog</CardTitle>
              <p className="text-sm text-muted-foreground">
                Filter by status or org and take action on failing or stuck jobs.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Search org or doc"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-64"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {jobsLoading ? (
              <JobTableSkeleton />
            ) : jobsError ? (
              <Alert variant="destructive">
                <AlertTitle>Failed to load jobs</AlertTitle>
                <AlertDescription>{jobsError}</AlertDescription>
              </Alert>
            ) : (
              <>
                <JobTable
                  rows={filteredJobs}
                  actionJobId={actionJobId}
                  onRetry={handleRetry}
                  onCancel={handleCancel}
                />
                {nextCursor ? (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => fetchJobs({ append: true, cursor: nextCursor })}>
                      Load more
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Timeline groupedByOrg={groupedByOrg} />
      </div>
  );
}

function SummarySection({
  summary,
  loading,
  error,
}: {
  summary: IngestionSummary | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={idx} className="h-24" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load summary</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!summary) return null;
  const cards = [
    { label: 'Pending', value: summary.counts.pending?.toLocaleString() ?? '0' },
    { label: 'Processing', value: summary.counts.processing?.toLocaleString() ?? '0' },
    { label: 'Needs review', value: summary.counts.needs_review?.toLocaleString() ?? '0' },
    { label: 'Failures', value: summary.counts.failed?.toLocaleString() ?? '0' },
    { label: 'Backlog', value: summary.backlog.toLocaleString() },
    { label: '24h throughput', value: summary.throughput24h.toLocaleString() },
    {
      label: 'Avg processing',
      value: summary.avgProcessingMs ? formatDuration(summary.avgProcessingMs) : 'n/a',
    },
    {
      label: 'Avg review',
      value: summary.avgReviewMs ? formatDuration(summary.avgReviewMs) : 'n/a',
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border bg-muted/40 p-4">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="mt-1 text-2xl font-semibold">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function JobTable({
  rows,
  onRetry,
  onCancel,
  actionJobId,
}: {
  rows: IngestionJob[];
  onRetry: (job: IngestionJob) => void;
  onCancel: (job: IngestionJob) => void;
  actionJobId: string | null;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No ingestion jobs match these filters.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead className="hidden md:table-cell">Organization</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead className="hidden lg:table-cell">Duration</TableHead>
            <TableHead>Failure</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((job) => (
            <TableRow key={`${job.orgId}-${job.docId}`}>
              <TableCell className="max-w-[220px]">
                <div className="font-medium truncate">{job.documentTitle || job.filename || 'Untitled document'}</div>
                <div className="text-xs text-muted-foreground truncate">{job.docId}</div>
              </TableCell>
              <TableCell className="hidden md:table-cell">{job.orgName}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[job.status] || 'outline'} className="text-xs capitalize">
                  {job.status.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {job.submittedAt ? formatOpsDate(job.submittedAt, { withTime: true }) : 'n/a'}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-xs">
                {job.completedAt && job.submittedAt
                  ? formatDuration(new Date(job.completedAt).getTime() - new Date(job.submittedAt).getTime())
                  : '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {job.failureReason ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Info className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="max-w-sm text-xs">
                      <p className="whitespace-pre-wrap">{job.failureReason}</p>
                    </PopoverContent>
                  </Popover>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-right space-x-1">
                <Button asChild variant="ghost" size="icon">
                  <Link href={`/documents/${job.docId}`}>
                    <Eye className="h-4 w-4" />
                    <span className="sr-only">View</span>
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRetry(job)}
                  disabled={actionJobId === job.docId}
                >
                  <RotateCcw className="h-4 w-4" />
                  <span className="sr-only">Retry</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onCancel(job)}
                  disabled={actionJobId === job.docId}
                >
                  <XCircle className="h-4 w-4" />
                  <span className="sr-only">Cancel</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Timeline({ groupedByOrg }: { groupedByOrg: Array<[string, IngestionJob[]]> }) {
  if (!groupedByOrg.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Org timelines</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible>
          {groupedByOrg.map(([orgId, jobs]) => (
            <AccordionItem key={orgId} value={orgId}>
              <AccordionTrigger>
                <span className="text-sm font-medium">{jobs[0]?.orgName || orgId}</span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <div key={job.docId} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{job.documentTitle || job.filename || 'Untitled document'}</div>
                          <div className="text-xs text-muted-foreground">{job.docId}</div>
                        </div>
                        <Badge variant={STATUS_VARIANT[job.status] || 'outline'} className="text-xs capitalize">
                          {job.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <span>Submitted: {job.submittedAt ? formatOpsDate(job.submittedAt, { withTime: true }) : 'n/a'}</span>
                        <span>
                          Processing: {job.processingStartedAt ? formatOpsDate(job.processingStartedAt, { withTime: true }) : 'n/a'}
                        </span>
                        <span>Completed: {job.completedAt ? formatOpsDate(job.completedAt, { withTime: true }) : 'n/a'}</span>
                        <span>Failure: {job.failureReason || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function JobTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, idx) => (
        <Skeleton key={idx} className="h-12" />
      ))}
    </div>
  );
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
