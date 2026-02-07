'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Folder, Globe, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatContext } from './chat-context-selector';

interface ChatContextDisplayProps {
  context: ChatContext;
  onClear: () => void;
  className?: string;
}

export function ChatContextDisplay({ context, onClear, className }: ChatContextDisplayProps) {
  const getContextInfo = () => {
    switch (context.type) {
      case 'org':
        return {
          icon: Globe,
          text: 'All Documents',
          color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800'
        };
      case 'document':
        return {
          icon: FileText,
          text: context.name || 'Selected Document',
          color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800'
        };
      case 'folder':
        return {
          icon: Folder,
          text: context.name || 'Selected Folder',
          color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800'
        };
    }
  };

  const contextInfo = getContextInfo();
  const IconComponent = contextInfo.icon;

  return (
    <div className={cn("flex items-center gap-2 p-3 bg-gradient-to-r from-muted/30 to-muted/50 rounded-lg border shadow-sm", className)}>
      <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm", contextInfo.color)}>
        <IconComponent className="h-3.5 w-3.5" />
        <span className="truncate max-w-[200px]">{contextInfo.text}</span>
      </div>
      
      {context.type !== 'org' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 w-7 p-0 hover:bg-muted/80 rounded-full transition-colors"
          title="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
