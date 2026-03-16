"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface AccessDeniedProps {
  title?: string;
  message?: string;
  backHref?: string;
  backLabel?: string;
  icon?: React.ReactNode;
}

export function AccessDenied({
  title = "Access Not Allowed",
  message = "You don't have permission to access this resource.",
  backHref = "/dashboard",
  backLabel = "Back to Dashboard",
  icon
}: AccessDeniedProps) {
  return (
    <div className="p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        <Card className="rounded-xl border border-border bg-card shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col items-center justify-center text-center py-8">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                {icon || <Shield className="h-8 w-8 text-muted-foreground" />}
              </div>
              <h1 className="text-xl font-semibold text-foreground mb-2">
                {title}
              </h1>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                {message}
              </p>
              <Button variant="outline" asChild>
                <Link href={backHref}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {backLabel}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Legacy component name for backward compatibility
export const ViewAccessDenied = AccessDenied;
