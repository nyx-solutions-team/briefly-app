"use client";

import React from 'react';
import { cn } from '@/lib/utils';

interface UploadFilePreviewProps {
  file: File;
  previewUrl?: string;
  className?: string;
  height?: number | string;
}

export default function UploadFilePreview({ 
  file, 
  previewUrl, 
  className,
  height = '60vh' 
}: UploadFilePreviewProps) {
  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  const isImage = ['png', 'jpg', 'jpeg'].includes(file.name.split('.').pop()?.toLowerCase() || '');
  
  // Use the provided previewUrl or create a blob URL
  const src = previewUrl || URL.createObjectURL(file);

  return (
    <div className={cn("w-full bg-muted/30 rounded-lg overflow-hidden", className)}>
      {isPdf ? (
        <div className="w-full" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
          <iframe
            src={src}
            className="w-full h-full border-0"
            title="PDF Preview"
            style={{ minHeight: typeof height === 'number' ? `${height}px` : height }}
          />
        </div>
      ) : isImage ? (
        <div className="w-full flex items-center justify-center" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
          <img
            src={src}
            alt="Document preview"
            className="max-w-full max-h-full object-contain"
            style={{ maxHeight: typeof height === 'number' ? `${height}px` : height }}
          />
        </div>
      ) : (
        <div 
          className="w-full flex items-center justify-center text-muted-foreground"
          style={{ height: typeof height === 'number' ? `${height}px` : height }}
        >
          <div className="text-center">
            <div className="text-4xl mb-2">📄</div>
            <div className="text-sm font-medium">{file.name}</div>
            <div className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
        </div>
      )}
    </div>
  );
}