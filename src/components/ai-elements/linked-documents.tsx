'use client';

import { Badge } from '@/components/ui/badge';
import { Calendar, Hash, Building2, FileText, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoredDocument } from '@/lib/types';

type LinkedDocumentItem = {
  id: string;
  title: string;
  date?: string;
  version?: string;
  reference?: string;
  sender?: string;
  documentType?: string;
  category?: string;
  type?: string;
  url: string;
};

type LinkedDocumentsProps = {
  items: LinkedDocumentItem[];
  moreCount?: number;
  className?: string;
};

export function LinkedDocuments({ items, moreCount = 0, className }: LinkedDocumentsProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className={cn('mt-4', className)}>
      <div className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        Linked Documents
      </div>
      
      <ol className="relative ml-3 border-l border-border pl-5">
        {items.map((item, idx) => (
          <li key={item.id} className="relative mb-4 last:mb-0">
            <span className="absolute -left-[9px] top-1 grid h-4 w-4 place-items-center rounded-full border border-border bg-background">
              <span className="h-2 w-2 rounded-full bg-foreground" />
            </span>
            
            <a 
              href={item.url} 
              className="block rounded-lg p-0.5 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
              onClick={(e) => {
                e.preventDefault();
                window.location.href = item.url;
              }}
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-medium hover:underline hover:decoration-neutral-700 hover:underline-offset-[3px] text-foreground">
                    {item.title}
                  </span>
                  {item.version && (
                    <Badge variant="secondary" className="text-xs">
                      v{item.version}
                    </Badge>
                  )}
                  {item.reference && (
                    <Badge variant="secondary" className="text-xs">
                      <Hash className="h-3 w-3 mr-1" />
                      Ref {item.reference}
                    </Badge>
                  )}
                </div>
                
                {/* Metadata row */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {item.date && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {item.date}
                    </span>
                  )}
                  {item.sender && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {item.sender}
                    </span>
                  )}
                  {item.documentType && (
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {item.documentType}
                    </span>
                  )}
                  {item.category && (
                    <span className="inline-flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      {item.category}
                    </span>
                  )}
                  {item.type && (
                    <Badge variant="secondary" className="text-xs">
                      {item.type}
                    </Badge>
                  )}
                </div>
              </div>
            </a>
          </li>
        ))}
        
        {moreCount > 0 && (
          <li className="relative mt-2">
            <span className="absolute -left-[9px] top-1 grid h-4 w-4 place-items-center rounded-full border border-border bg-background">
              <span className="h-2 w-2 rounded-full bg-muted-foreground" />
            </span>
            <div className="text-[13px] text-muted-foreground">… and {moreCount} more</div>
          </li>
        )}
      </ol>
    </div>
  );
}

// Helper function to convert StoredDocument to LinkedDocumentItem
export function convertToLinkedDocumentItem(
  doc: StoredDocument, 
  baseUrl: string = '/documents'
): LinkedDocumentItem {
  return {
    id: doc.id,
    title: doc.title || doc.name || 'Untitled',
    date: doc.documentDate,
    version: doc.versionNumber?.toString(),
    reference: (doc as any).referenceNo,
    sender: doc.sender,
    documentType: doc.documentType || doc.type,
    category: doc.category,
    type: doc.type,
    url: `${baseUrl}/${doc.id}`,
  };
}
