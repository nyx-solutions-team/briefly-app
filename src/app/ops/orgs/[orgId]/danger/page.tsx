"use client";

import * as React from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, PauseCircle, PlayCircle, RefreshCw, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { OpsMetricCard, OpsPageHeader, OpsPill, OpsSurface } from '@/components/ops/ops-primitives';
import { OpsOrgSubnav } from '@/components/ops/ops-org-subnav';
import { useToast } from '@/hooks/use-toast';
import {
  getOpsOrgDeletionPreflight,
  listOpsOrgDeletionJobs,
  requestOpsOrgDeletion,
  updateOpsOrgLifecycle,
  type OpsOrgDeletionJob,
  type OpsOrgDeletionPreflight,
} from '@/lib/ops-api';
import { formatBytes, formatOpsDate } from '@/lib/utils';

function getLifecycleTone(state: string | null | undefined) {
  if (state === 'deleting') return 'danger' as const;
  if (state === 'suspended') return 'warning' as const;
  return 'success' as const;
}

function getJobTone(status: OpsOrgDeletionJob['status']) {
  if (status === 'failed') return 'danger' as const;
  if (status === 'completed') return 'success' as const;
  if (status === 'queued' || status === 'preflight' || status === 'running') return 'warning' as const;
  return 'neutral' as const;
}

function sumBlockers(preflight: OpsOrgDeletionPreflight | null) {
  if (!preflight) return 0;
  const blockerValues = Object.values(preflight.blockers || {}) as Array<number | null | undefined>;
  return blockerValues.reduce<number>((sum, value) => sum + Number(value || 0), 0);
}

function getRecoveryLifecycleState(job: OpsOrgDeletionJob | null) {
  return job?.lifecycleBefore === 'suspended' ? 'suspended' : 'active';
}

export default function OpsOrganizationDangerPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId || '';
  const { toast } = useToast();

  const [preflight, setPreflight] = React.useState<OpsOrgDeletionPreflight | null>(null);
  const [jobs, setJobs] = React.useState<OpsOrgDeletionJob[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lifecycleReason, setLifecycleReason] = React.useState('');
  const [deleteReason, setDeleteReason] = React.useState('');
  const [confirmationText, setConfirmationText] = React.useState('');
  const [lifecycleSaving, setLifecycleSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    const [preflightResult, jobsResult] = await Promise.allSettled([
      getOpsOrgDeletionPreflight(orgId),
      listOpsOrgDeletionJobs(orgId, 8),
    ]);

    if (preflightResult.status === 'fulfilled') {
      setPreflight(preflightResult.value);
      setLifecycleReason(preflightResult.value?.org?.lifecycle?.reason || '');
    } else {
      setPreflight(null);
    }

    let nextJobs: OpsOrgDeletionJob[] = [];
    if (jobsResult.status === 'fulfilled') {
      nextJobs = Array.isArray(jobsResult.value.rows) ? jobsResult.value.rows : [];
      setJobs(nextJobs);
    } else {
      setJobs([]);
    }

    if (preflightResult.status === 'rejected' && jobsResult.status === 'rejected') {
      setError(preflightResult.reason instanceof Error ? preflightResult.reason.message : 'Unable to load danger zone');
    } else if (preflightResult.status === 'rejected' && jobsResult.status === 'fulfilled') {
      const latestKnownJob = nextJobs[0] || null;
      if (latestKnownJob?.status === 'completed') {
        setError(null);
      } else {
        const message = preflightResult.reason instanceof Error ? preflightResult.reason.message : 'Organization no longer exists';
        setError(message);
      }
    }

    setLoading(false);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const latestJob = jobs[0] || preflight?.latestJob || null;
  const preflightOrg = preflight?.org || null;
  const preflightLifecycle = preflightOrg?.lifecycle || null;
  const preflightName = preflightOrg?.name || '';
  const currentLifecycle = preflightLifecycle?.state || null;
  const lifecycleReasonText = preflightLifecycle?.reason || lifecycleReason || null;
  const activeJob = Boolean(latestJob && ['queued', 'preflight', 'running'].includes(latestJob.status));
  const canRecoverDeleteLock =
    currentLifecycle === 'deleting' &&
    !activeJob &&
    latestJob?.status === 'failed';
  const orgDeleted = !preflight && latestJob?.status === 'completed';
  const blockerTotal = sumBlockers(preflight);
  const deleteDisabled =
    !preflight ||
    deleting ||
    activeJob ||
    confirmationText.trim() !== preflightName.trim();

  React.useEffect(() => {
    if (!activeJob) return;
    const timer = window.setInterval(() => {
      void load();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeJob, load]);

  const onToggleLifecycle = async () => {
    if (!orgId || !preflight) return;
    const nextState = canRecoverDeleteLock
      ? getRecoveryLifecycleState(latestJob)
      : currentLifecycle === 'suspended'
        ? 'active'
        : 'suspended';
    setLifecycleSaving(true);
    try {
      const next = await updateOpsOrgLifecycle(orgId, {
        state: nextState,
        reason: nextState === 'suspended' ? lifecycleReason.trim() || undefined : undefined,
      });
      setPreflight((current) =>
        current
          ? {
              ...current,
              org: {
                ...current.org,
                lifecycle: next,
              },
            }
          : current
      );
      toast({
        title: canRecoverDeleteLock
          ? 'Deletion lock removed'
          : nextState === 'suspended'
            ? 'Organization suspended'
            : 'Organization resumed',
        description:
          canRecoverDeleteLock
            ? 'The org was restored to its previous lifecycle state after a failed deletion job.'
            : nextState === 'suspended'
            ? 'Write operations are now locked for this client.'
            : 'Client writes are allowed again.',
      });
      await load();
    } catch (err) {
      toast({
        title: 'Unable to change lifecycle state',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLifecycleSaving(false);
    }
  };

  const onDelete = async () => {
    if (!orgId || !preflight) return;
    setDeleting(true);
    try {
      const job = await requestOpsOrgDeletion(orgId, {
        confirmationText: confirmationText.trim(),
        reason: deleteReason.trim() || undefined,
      });
      setJobs((current) => [job, ...current.filter((row) => row.id !== job.id)]);
      setPreflight((current) =>
        current
          ? {
              ...current,
              latestJob: job,
              org: {
                ...current.org,
                lifecycle: {
                  state: 'deleting',
                  reason: deleteReason.trim() || 'Permanent deletion queued',
                  updatedAt: new Date().toISOString(),
                },
              },
            }
          : current
      );
      toast({
        title: 'Deletion job started',
        description: 'The org is now locked and the permanent deletion job is running.',
      });
      setConfirmationText('');
      await load();
    } catch (err) {
      toast({
        title: 'Unable to start deletion',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (!orgId) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Missing organization id</AlertTitle>
        <AlertDescription>Open this page from the organizations index.</AlertDescription>
      </Alert>
    );
  }

  if (orgDeleted) {
    return (
      <div className="space-y-8">
        <OpsPageHeader
          eyebrow="Danger Zone"
          title="Deletion Complete"
          description="The organization has been permanently removed. This page now shows the retained deletion job history only."
          backHref="/ops/orgs"
          backLabel="Organizations"
          actions={
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          }
        />

        <Alert>
          <AlertTitle>Organization delete completed</AlertTitle>
          <AlertDescription>
            The org row is gone. Only the deletion job record is retained here for audit and troubleshooting.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-3">
          <OpsMetricCard label="Final Status" value={latestJob?.status || 'completed'} tone="success" />
          <OpsMetricCard
            label="Started"
            value={formatOpsDate(latestJob?.startedAt, { withTime: true })}
            hint="Deletion job start time"
          />
          <OpsMetricCard
            label="Finished"
            value={formatOpsDate(latestJob?.finishedAt, { withTime: true })}
            hint="Deletion job completion time"
          />
        </div>

        <OpsSurface title="Deletion Jobs" description="The job record remains even after the organization itself is gone.">
          <div className="space-y-3">
            {jobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
                No deletion jobs were found for this organization id.
              </div>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{job.status}</p>
                      <p className="text-sm text-muted-foreground">
                        Created {formatOpsDate(job.createdAt, { withTime: true })}
                      </p>
                    </div>
                    <OpsPill tone={getJobTone(job.status)}>{job.status}</OpsPill>
                  </div>
                  {job.reason ? <p className="mt-3 text-sm text-muted-foreground">{job.reason}</p> : null}
                  {job.error ? <p className="mt-3 text-sm text-red-600 dark:text-red-300">{job.error}</p> : null}
                </div>
              ))
            )}
          </div>
        </OpsSurface>
      </div>
    );
  }

  return (
    <div className="space-y-8">
        <OpsPageHeader
          eyebrow="Danger Zone"
          title={preflightName ? `${preflightName} Danger Zone` : 'Organization Danger Zone'}
          description="Use this area for high-risk org controls only: lifecycle locks, permanent delete preflight, and deletion job tracking."
          backHref={`/ops/orgs/${orgId}`}
          backLabel="Overview"
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <OpsOrgSubnav orgId={orgId} orgName={preflightName} />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Danger zone status</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OpsMetricCard
          label="Lifecycle"
          value={loading ? '...' : preflightLifecycle?.state || latestJob?.status || 'Unknown'}
          hint={lifecycleReasonText || 'No lifecycle reason'}
          tone={currentLifecycle === 'deleting' ? 'danger' : currentLifecycle === 'suspended' ? 'warning' : 'success'}
        />
        <OpsMetricCard
          label="Delete Blockers"
          value={loading ? '...' : blockerTotal}
          hint="Active jobs that should be cancelled before purge"
          tone={blockerTotal > 0 ? 'warning' : 'success'}
        />
        <OpsMetricCard
          label="Storage Footprint"
          value={
            loading
              ? '...'
              : formatBytes(
                  Number(preflight?.storage.documentsBucketBytes || 0) +
                    Number(preflight?.storage.extractionsBucketBytes || 0)
                )
          }
          hint="Visible documents + extraction buckets"
        />
        <OpsMetricCard
          label="Latest Job"
          value={loading ? '...' : latestJob?.status || 'None'}
          hint={latestJob?.updatedAt ? `Updated ${formatOpsDate(latestJob.updatedAt, { withTime: true })}` : 'No deletion job yet'}
          tone={latestJob?.status === 'failed' ? 'danger' : latestJob?.status === 'completed' ? 'success' : latestJob ? 'warning' : 'default'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <OpsSurface title="Lifecycle Lock" description="Suspend an organization to block writes without deleting it. This uses the same write lock that permanent deletion relies on.">
          <div className="space-y-5">
            <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">
                    Current state: {preflightLifecycle?.state || 'Unknown'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Updated {formatOpsDate(preflightLifecycle?.updatedAt, { withTime: true })}
                  </p>
                </div>
                <OpsPill tone={getLifecycleTone(preflightLifecycle?.state)}>
                  {preflightLifecycle?.state || 'unknown'}
                </OpsPill>
              </div>
              {lifecycleReasonText ? (
                <p className="mt-3 text-sm text-muted-foreground">{lifecycleReasonText}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lifecycle-reason">Suspend reason</Label>
              <Textarea
                id="lifecycle-reason"
                value={lifecycleReason}
                onChange={(event) => setLifecycleReason(event.target.value)}
                placeholder="Why are we locking this org?"
                rows={4}
              />
            </div>

            <Button
              variant={currentLifecycle === 'suspended' || canRecoverDeleteLock ? 'outline' : 'secondary'}
              onClick={() => void onToggleLifecycle()}
              disabled={lifecycleSaving || (currentLifecycle === 'deleting' && !canRecoverDeleteLock) || !preflight}
            >
              {currentLifecycle === 'suspended' || canRecoverDeleteLock ? (
                <PlayCircle className="mr-2 h-4 w-4" />
              ) : (
                <PauseCircle className="mr-2 h-4 w-4" />
              )}
              {lifecycleSaving
                ? 'Saving...'
                : canRecoverDeleteLock
                  ? 'Recover Organization'
                  : currentLifecycle === 'suspended'
                  ? 'Resume Organization'
                  : 'Suspend Organization'}
            </Button>

            {currentLifecycle === 'deleting' ? (
              canRecoverDeleteLock ? (
                <Alert>
                  <AlertTitle>Deletion lock can be recovered</AlertTitle>
                  <AlertDescription>
                    The latest deletion job failed. Recovering here will restore the organization to its prior lifecycle state so normal support work can continue.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <AlertTitle>Deletion lock is active</AlertTitle>
                  <AlertDescription>
                    The org is already in deletion mode, so normal lifecycle changes are disabled until the deletion job finishes or you explicitly recover it through ops.
                  </AlertDescription>
                </Alert>
              )
            ) : null}
          </div>
        </OpsSurface>

        <OpsSurface title="Deletion Preflight" description="This is the reality check before permanent deletion: what data exists, what background work is still active, and how much storage will be purged.">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Documents</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{preflight?.summary.documents ?? '...'}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Members</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{preflight?.summary.members ?? '...'}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Workflows + Approvals</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {(preflight?.summary.workflows ?? 0) + (preflight?.summary.approvals ?? 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Chats + Ingestion</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {(preflight?.summary.chats ?? 0) + (preflight?.summary.ingestion ?? 0)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              ['Legacy ingestion', preflight?.blockers.activeLegacyIngestion || 0],
              ['Ingestion v2', preflight?.blockers.activeIngestionV2 || 0],
              ['Workflow runs', preflight?.blockers.activeWorkflowRuns || 0],
              ['Upload analysis', preflight?.blockers.activeUploadAnalysis || 0],
              ['Chat outbox', preflight?.blockers.activeChatOutbox || 0],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/70 px-4 py-3"
              >
                <p className="text-sm text-muted-foreground">{label}</p>
                <OpsPill tone={Number(value) > 0 ? 'warning' : 'success'}>{value}</OpsPill>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Documents bucket</p>
              <p className="mt-1">
                {preflight?.storage.documentsBucketObjects ?? 0} objects,{' '}
                {formatBytes(preflight?.storage.documentsBucketBytes || 0)}
              </p>
              <p className="mt-1">Tracked document keys: {preflight?.storage.trackedDocumentKeys ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Extractions bucket</p>
              <p className="mt-1">
                {preflight?.storage.extractionsBucketObjects ?? 0} objects,{' '}
                {formatBytes(preflight?.storage.extractionsBucketBytes || 0)}
              </p>
              <p className="mt-1">
                Tracked extraction keys: {(preflight?.storage.trackedExtractionKeys ?? 0) + (preflight?.storage.derivedExtractionKeys ?? 0)}
              </p>
            </div>
          </div>
        </OpsSurface>
      </div>

      <OpsSurface title="Permanent Delete" description="This is irreversible. It locks the org, cancels active background work, purges storage, removes Vespa chunks, and finally deletes the org row.">
        <div className="space-y-5">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Use only for true permanent removal</AlertTitle>
            <AlertDescription>
              This should be used when the client workspace must be removed from the platform entirely, not just disabled.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="delete-reason">Reason for permanent deletion</Label>
              <Textarea
                id="delete-reason"
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Why are we permanently deleting this org?"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">
                Type <span className="font-semibold text-foreground">{preflightName || 'the organization name'}</span> to confirm
              </Label>
              <Input
                id="delete-confirmation"
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder={preflightName || 'Organization name'}
              />
              <p className="text-sm text-muted-foreground">
                The permanent delete button stays locked until the name matches exactly.
              </p>
            </div>
          </div>

          <Button variant="destructive" onClick={() => void onDelete()} disabled={deleteDisabled}>
            <Trash2 className="mr-2 h-4 w-4" />
            {deleting ? 'Starting Delete...' : 'Start Permanent Delete'}
          </Button>
        </div>
      </OpsSurface>

      <OpsSurface title="Deletion Jobs" description="Every permanent delete attempt is stored here so you can see progress, failures, and the final tombstone outcome.">
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
              No deletion jobs have been created for this organization yet.
            </div>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="rounded-2xl border border-border/50 bg-background/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{job.status}</p>
                    <p className="text-sm text-muted-foreground">
                      Created {formatOpsDate(job.createdAt, { withTime: true })}
                    </p>
                  </div>
                  <OpsPill tone={getJobTone(job.status)}>{job.status}</OpsPill>
                </div>
                {job.reason ? (
                  <p className="mt-3 text-sm text-muted-foreground">{job.reason}</p>
                ) : null}
                {job.error ? (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-300">{job.error}</p>
                ) : null}
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <p>Started {formatOpsDate(job.startedAt, { withTime: true })}</p>
                  <p>Finished {formatOpsDate(job.finishedAt, { withTime: true })}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </OpsSurface>
    </div>
  );
}
