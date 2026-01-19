"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import UsersManagement from '@/components/users-management';
import { ViewAccessDenied } from '@/components/access-denied';

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
                <div className="px-8 py-4">
                    <h1 className="text-base font-semibold text-foreground tracking-tight">Members</h1>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                        Manage your organization members and their account status
                    </p>
                </div>
            </header>

            {/* Content */}
            <div className="p-6">
                <div className="rounded-lg border border-border/40 bg-card/40 overflow-hidden shadow-sm">
                    <UsersManagement />
                </div>
            </div>
        </div>
    );
}
