'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Hash, Building2, User2, MessageSquareText, Mail, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

type MetaListProps = {
  subject?: string;
  name?: string;
  sender?: string;
  receiver?: string;
  date?: string;
  reference?: string;
  documentType?: string;
  category?: string;
  filename?: string;
  className?: string;
};

export function MetaList({ 
  subject, 
  name, 
  sender, 
  receiver, 
  date, 
  reference, 
  documentType,
  category,
  filename,
  className 
}: MetaListProps) {
  return (
    <div className={cn('mt-4 p-3 rounded-lg border border-border/30 bg-muted/20', className)}>
      <div className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        Document Details
      </div>
      
      {/* 2x2 Grid Layout */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {subject && (
          <div className="flex items-start gap-2">
            <MessageSquareText className="mt-0.5 h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</dt>
              <dd className="text-[13px] leading-tight truncate" title={subject}>{subject}</dd>
            </div>
          </div>
        )}
        
        {name && (
          <div className="flex items-start gap-2">
            <User2 className="mt-0.5 h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</dt>
              <dd className="text-[13px] leading-tight truncate" title={name}>{name}</dd>
            </div>
          </div>
        )}
        
        {sender && (
          <div className="flex items-start gap-2">
            <Building2 className="mt-0.5 h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Sender</dt>
              <dd className="text-[13px] leading-tight truncate" title={sender}>{sender}</dd>
            </div>
          </div>
        )}
        
        {receiver && (
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Receiver</dt>
              <dd className="text-[13px] leading-tight truncate" title={receiver}>{receiver}</dd>
            </div>
          </div>
        )}
        
        {filename && (
          <div className="flex items-start gap-2 col-span-2">
            <FileText className="mt-0.5 h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Filename</dt>
              <dd className="text-[13px] leading-tight truncate" title={filename}>{filename}</dd>
            </div>
          </div>
        )}
      </div>
      
      {/* Compact Metadata badges */}
      {(date || reference || documentType || category) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {date && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              <Calendar className="h-3 w-3 mr-1" />
              {date}
            </Badge>
          )}
          {reference && (
            <Badge variant="outline" className="text-xs px-2 py-0.5">
              <Hash className="h-3 w-3 mr-1" />
              Ref {reference}
            </Badge>
          )}
          {documentType && (
            <Badge variant="outline" className="text-xs px-2 py-0.5">
              <FileText className="h-3 w-3 mr-1" />
              {documentType}
            </Badge>
          )}
          {category && (
            <Badge variant="outline" className="text-xs px-2 py-0.5">
              <Hash className="h-3 w-3 mr-1" />
              {category}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
