'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

type PreviewProps = {
  lines: string[];
  maxLines?: number;
  className?: string;
};

export function Preview({ lines = [], maxLines = 2, className }: PreviewProps) {
  const [open, setOpen] = useState(false);
  
  if (!lines || lines.length === 0) return null;
  
  const clipped = !open && lines.length > maxLines;
  const displayLines = clipped ? lines.slice(0, maxLines) : lines;

  return (
    <div className={`mt-1 space-y-1 ${className}`}>
      {displayLines.map((line, i) => (
        <p key={i} className="leading-relaxed text-sm text-muted-foreground">
          {line}
        </p>
      ))}
      
      {lines.length > maxLines && (
        <Button 
          variant="ghost" 
          size="sm"
          className="-ml-1 mt-1 h-auto p-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50" 
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Show {lines.length - maxLines} more
            </>
          )}
        </Button>
      )}
    </div>
  );
}
