'use client';

import React from 'react';
import { Check, Copy, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { GeneratedDraftPayload } from '@/components/chat/create-draft-document-dialog';

type GeneratedDraftPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: GeneratedDraftPayload | null;
};

function renderInline(node: any, key: string): React.ReactNode {
  if (!node) return null;
  if (node.type === 'text') return <React.Fragment key={key}>{node.text || ''}</React.Fragment>;
  if (node.type === 'hardBreak') return <br key={key} />;
  const children = Array.isArray(node.content)
    ? node.content.map((child: any, index: number) => renderInline(child, `${key}-${index}`))
    : null;
  return <React.Fragment key={key}>{children}</React.Fragment>;
}

function renderBlock(node: any, key: string): React.ReactNode {
  if (!node) return null;

  if (node.type === 'heading') {
    const level = Number(node?.attrs?.level || 2);
    const className = level === 1
      ? 'text-2xl font-semibold tracking-tight'
      : level === 2
        ? 'text-xl font-semibold mt-4'
        : 'text-lg font-medium mt-3';
    const children = Array.isArray(node.content)
      ? node.content.map((child: any, index: number) => renderInline(child, `${key}-${index}`))
      : null;

    if (level === 1) return <h1 key={key} className={className}>{children}</h1>;
    if (level === 2) return <h2 key={key} className={className}>{children}</h2>;
    return <h3 key={key} className={className}>{children}</h3>;
  }

  if (node.type === 'paragraph') {
    const children = Array.isArray(node.content)
      ? node.content.map((child: any, index: number) => renderInline(child, `${key}-${index}`))
      : null;
    return <p key={key} className="text-sm leading-6 text-foreground/90">{children}</p>;
  }

  if (node.type === 'bulletList') {
    return (
      <ul key={key} className="list-disc pl-5 space-y-1.5">
        {(node.content || []).map((child: any, index: number) => renderBlock(child, `${key}-${index}`))}
      </ul>
    );
  }

  if (node.type === 'orderedList') {
    return (
      <ol key={key} className="list-decimal pl-5 space-y-1.5">
        {(node.content || []).map((child: any, index: number) => renderBlock(child, `${key}-${index}`))}
      </ol>
    );
  }

  if (node.type === 'listItem') {
    return (
      <li key={key} className="text-sm leading-6">
        {(node.content || []).map((child: any, index: number) => renderBlock(child, `${key}-${index}`))}
      </li>
    );
  }

  const children = Array.isArray(node.content)
    ? node.content.map((child: any, index: number) => renderBlock(child, `${key}-${index}`))
    : null;
  return <div key={key}>{children}</div>;
}

export default function GeneratedDraftPreviewDialog({
  open,
  onOpenChange,
  draft,
}: GeneratedDraftPreviewDialogProps) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = React.useCallback(async () => {
    if (!draft?.contentText) return;
    try {
      await navigator.clipboard.writeText(draft.contentText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [draft?.contentText]);

  const generatedAt = React.useMemo(() => {
    if (!draft?.generatedAtIso) return null;
    const date = new Date(draft.generatedAtIso);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
  }, [draft?.generatedAtIso]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Generated Draft Preview
          </DialogTitle>
          <DialogDescription>
            This draft is frontend-only for this session. It will not be saved to the database.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 space-y-1">
            <div className="text-sm font-medium">{draft?.title || 'Untitled Draft'}</div>
            <div className="text-xs text-muted-foreground">
              Type: {draft?.documentTypeName || 'Unknown'}
              {generatedAt ? ` • Generated: ${generatedAt}` : ''}
            </div>
          </div>

          <div className="space-y-3">
            {draft?.content?.content?.map((node: any, index: number) => renderBlock(node, `node-${index}`))}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={() => void handleCopy()} disabled={!draft?.contentText}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="ml-2">{copied ? 'Copied' : 'Copy Text'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
