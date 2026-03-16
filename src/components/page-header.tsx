"use client";

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { H1, Muted } from '@/components/typography';

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  sticky?: boolean;
  className?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'accent';
  containerClassName?: string;
};

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'Back',
  actions,
  meta,
  sticky,
  className,
  icon,
  tone = 'default',
  containerClassName,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'w-full border-b bg-background/80',
        sticky && 'sticky top-0 z-10 backdrop-blur-sm',
        className
      )}
    >
      <div className={cn('px-3 sm:px-4 md:px-6', sticky ? 'py-2 sm:py-3' : 'pt-1 pb-2 sm:pb-4')}>
        <div className={cn('mx-auto', containerClassName || 'max-w-6xl')}>
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              {backHref && (
                <Link href={backHref} className="text-xs sm:text-sm text-muted-foreground hover:underline inline-flex items-center gap-1 mb-1">
                  <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">{backLabel}</span>
                </Link>
              )}
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                {icon && <span className="text-primary flex-shrink-0">{icon}</span>}
                <H1 className="truncate text-base sm:text-lg font-semibold leading-tight">{title}</H1>
              </div>
              {subtitle && (
                <Muted className="mt-0.5 sm:mt-1 text-xs sm:text-sm line-clamp-1 sm:line-clamp-none">
                  {subtitle}
                </Muted>
              )}
              {meta && (
                <div className="md:hidden text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2">
                  {meta}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {meta && <div className="hidden md:block text-xs text-muted-foreground mr-2">{meta}</div>}
              {actions}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

