"use client";

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { TriangleAlert } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

function formatBytes(bytes?: number | null) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < UNITS.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx === 0 ? 0 : value >= 10 ? 1 : 2)} ${UNITS[idx]}`;
}

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

export function PlanBanner() {
  const { bootstrapData } = useAuth();
  const plan = bootstrapData?.plan;
  if (!plan) return null;

  const limitBytes = Number(plan.storageLimitBytes || 0);
  const usageBytes = Number(plan.storageUsedBytes || 0);
  const usagePercent = limitBytes > 0 ? Math.min(1, usageBytes / limitBytes) : 0;

  const expired = !!plan.expired;
  const storageFull = !!plan.storageFull;
  const withinGrace = !!plan.withinGrace && !expired;
  if (!expired && !storageFull && !withinGrace) return null;

  const limitDisplay = limitBytes > 0 ? formatBytes(limitBytes) : null;
  const usageDisplay = usageBytes > 0 ? formatBytes(usageBytes) : '0 B';
  const planEndDisplay = formatDate(plan.planEndsAt);
  const graceDisplay = formatDate(plan.graceEndsAt);

  let title = '';
  let description = '';
  if (storageFull) {
    title = 'Storage limit reached';
    description = limitDisplay
      ? `You've used ${usageDisplay} of your ${limitDisplay} allotment. Please contact our team to increase your storage.`
      : `You've used ${usageDisplay}. Please contact our team to increase your storage.`;
  } else if (expired) {
    title = 'Plan expired';
    description = `Your plan ended${planEndDisplay ? ` on ${planEndDisplay}` : ''}. Reach out to renew access.`;
  } else if (withinGrace) {
    title = 'Plan elapsed';
    description = `Your plan term ended${planEndDisplay ? ` on ${planEndDisplay}` : ''}. Service continues temporarily until ${graceDisplay || 'the grace period ends'}, so please contact us to renew.`;
  }

  return (
    <Alert variant="destructive" className="mb-4">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}{' '}
        <a className="underline" href="mailto:support@brieflydocs.com?subject=Plan%20upgrade">
          Contact support
        </a>
        . {limitBytes > 0 && `Usage: ${(usagePercent * 100).toFixed(1)}%`}
        {limitBytes > 0 && (
          <div className="mt-3">
            <Progress value={usagePercent * 100} />
            <p className="text-xs text-muted-foreground mt-1">
              {usageDisplay} / {limitDisplay} used
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
