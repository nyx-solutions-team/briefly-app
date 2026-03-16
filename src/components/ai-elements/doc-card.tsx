'use client';

import * as React from 'react';
import { ExternalLink, Calendar, Hash, Building2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DocMeta = {
  issuedOn?: string;
  referenceNo?: string;
  authority?: string;
  language?: string;
  location?: string;
  tags?: string[];
  version?: string;
};

export type DocResult = {
  id: string;
  title: string;
  url: string;
  tldr?: string;
  previewLines?: string[];
  meta?: DocMeta;
};

function Card({ className = '', children }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn('rounded-2xl border border-neutral-200/70 bg-white shadow-sm', className)}>{children}</div>
  );
}
function CardHeader({ className = '', children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cn('p-4 md:p-5', className)}>{children}</div>;
}
function CardContent({ className = '', children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cn('px-4 pb-4 md:px-5 md:pb-5', className)}>{children}</div>;
}
function Separator() {
  return <div className="my-3 h-px w-full bg-neutral-200" />;
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-[12px] leading-none text-neutral-700">
      {children}
    </span>
  );
}

export function DocCard({ doc, compact = true }: { doc: DocResult; compact?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a
              href={doc.url}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = doc.url;
              }}
              className="line-clamp-2 break-words text-base font-semibold hover:underline hover:decoration-neutral-700 hover:underline-offset-[3px]"
            >
              {doc.title}
            </a>
            {doc.tldr && <p className="mt-1 text-sm text-neutral-600">{doc.tldr}</p>}
          </div>
          <button
            title="Open"
            onClick={() => (window.location.href = doc.url)}
            className="inline-grid h-8 w-8 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="sr-only">Open</span>
          </button>
        </div>
        {!!doc.meta && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {doc.meta.issuedOn && (
              <Badge>
                <Calendar className="h-3.5 w-3.5" /> {doc.meta.issuedOn}
              </Badge>
            )}
            {doc.meta.referenceNo && (
              <Badge>
                <Hash className="h-3.5 w-3.5" /> {doc.meta.referenceNo}
              </Badge>
            )}
            {doc.meta.authority && (
              <Badge>
                <Building2 className="h-3.5 w-3.5" /> {doc.meta.authority}
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      {!compact && doc.previewLines?.length ? (
        <CardContent>
          <Separator />
          <p className="text-xs font-semibold tracking-wide text-neutral-700">Preview</p>
          <Preview lines={doc.previewLines} />
        </CardContent>
      ) : null}
    </Card>
  );
}

function Preview({ lines = [] as string[] }) {
  const [open, setOpen] = React.useState(false);
  const max = 2;
  const clipped = !open && lines.length > max;
  return (
    <div className="mt-1 space-y-1">
      {(clipped ? lines.slice(0, max) : lines).map((ln, i) => (
        <p key={i} className="leading-relaxed text-sm text-neutral-700">
          {ln}
        </p>
      ))}
      {lines.length > max && (
        <button className="-ml-1 mt-1 rounded-md px-1.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : `Show ${lines.length - max} more`}
        </button>
      )}
    </div>
  );
}

