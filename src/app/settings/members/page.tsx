"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import UsersManagement from '@/components/users-management';
import { ViewAccessDenied } from '@/components/access-denied';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function MembersSettingsPage() {
    const { bootstrapData, isLoading: authLoading } = useAuth();

    const canManageOrgMembers = bootstrapData?.permissions?.['org.manage_members'] === true;

    if (!authLoading && !canManageOrgMembers) {
        return <ViewAccessDenied />;
    }

    return (
        <div className="min-h-screen bg-background/30">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
                <div className="px-6 md:px-8 py-4 flex items-center gap-4">
                    <Link
                        href="/settings"
                        className="md:hidden flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Link>
                    <div>
                        <h1 className="text-lg md:text-base font-bold md:font-semibold text-foreground tracking-tight">Members</h1>
                        <p className="hidden md:block text-[13px] text-muted-foreground mt-0.5">
                            Manage your organization members and their account status
                        </p>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="px-5 py-6 md:p-6 max-w-6xl mx-auto md:mx-0">
                <div className="rounded-2xl md:rounded-lg border-none md:border md:border-border/40 bg-transparent md:bg-card/40 overflow-hidden md:shadow-sm">
                    <UsersManagement />
                </div>
            </div>
        </div>
    );
}
