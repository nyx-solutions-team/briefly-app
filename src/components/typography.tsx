import * as React from 'react';
import { cn } from '@/lib/utils';

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement>;

export function H1({ className, ...props }: HeadingProps) {
  return (
    <h1
      className={cn('text-3xl md:text-4xl font-bold tracking-tight leading-tight', className)}
      {...props}
    />
  );
}

export function H2({ className, ...props }: HeadingProps) {
  return (
    <h2
      className={cn('text-2xl md:text-3xl font-semibold leading-tight', className)}
      {...props}
    />
  );
}

export function H3({ className, ...props }: HeadingProps) {
  return (
    <h3
      className={cn('text-xl md:text-2xl font-semibold', className)}
      {...props}
    />
  );
}

type TextProps = React.HTMLAttributes<HTMLParagraphElement>;

export function Lead({ className, ...props }: TextProps) {
  return (
    <p className={cn('text-lg text-muted-foreground leading-relaxed', className)} {...props} />
  );
}

export function Muted({ className, ...props }: TextProps) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
}

export function Overline({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('text-[11px] uppercase tracking-wide text-muted-foreground', className)} {...props} />
  );
}

