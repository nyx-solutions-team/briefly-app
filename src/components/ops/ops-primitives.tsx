import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function OpsPageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = 'Back',
  eyebrow = 'Ops Console',
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  eyebrow?: string;
}) {
  return (
    <div className="ops-page-header flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          {backHref ? (
            <Button variant="ghost" size="sm" className="h-8 rounded-full border border-border/40 bg-background/70 px-3 text-muted-foreground shadow-sm" asChild>
              <Link href={backHref}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                {backLabel}
              </Link>
            </Button>
          ) : null}
          <Badge variant="outline" className="ops-kicker rounded-full border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
            {eyebrow}
          </Badge>
        </div>
        <div className="space-y-1">
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-foreground sm:text-[2.7rem]">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-[15px]">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function OpsMetricCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClasses =
    tone === 'danger'
      ? 'border-red-500/20 bg-red-500/5'
      : tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/5'
        : tone === 'success'
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-border/50 bg-card/80';

  return (
    <Card className={cn('rounded-2xl shadow-sm', toneClasses)}>
      <CardHeader className="pb-3">
        <CardDescription className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-semibold tracking-tight text-foreground">{value}</div>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function OpsSurface({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('rounded-2xl border-border/50 bg-card/85 shadow-sm', className)}>
      <CardHeader className="flex flex-col gap-3 border-b border-border/40 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-xl">{title}</CardTitle>
          {description ? <CardDescription className="leading-6">{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}

export function OpsPill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneClasses =
    tone === 'danger'
      ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
      : tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : tone === 'success'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-border/60 bg-muted/40 text-muted-foreground';

  return (
    <Badge variant="outline" className={cn('rounded-full px-2.5 py-0.5', toneClasses)}>
      {children}
    </Badge>
  );
}
