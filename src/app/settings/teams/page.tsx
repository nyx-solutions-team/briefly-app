"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import TeamsManagement from '@/components/teams-management-new';
import { ViewAccessDenied } from '@/components/access-denied';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TeamsSettingsPage() {
    const router = useRouter();
    const { bootstrapData, isLoading: authLoading } = useAuth();

    // Check permissions: Admin, Team Lead, or specialized permission
    const permissions = bootstrapData?.permissions || {};
    const leadDeptIds = (bootstrapData?.departments || []).filter((d: any) => d?.is_lead).map((d: any) => d.id);
    const isTeamLead = leadDeptIds.length > 0;
    const isAdmin = permissions['org.manage_members'] === true;
    const canManageTeams = permissions['departments.manage_members'] === true || isTeamLead;

    if (!authLoading && !isAdmin && !isTeamLead && !canManageTeams) {
        return <ViewAccessDenied />;
    }

    return (
        <div className="min-h-screen bg-background/30">
            {/* Header - Hidden on mobile, handled by TeamsManagement */}
            <header className="hidden md:block sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
                <div className="px-6 md:px-8 py-4 flex items-center gap-4">
                    <Link
                        href="/settings"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Link>
                    <div>
                        <h1 className="text-base font-semibold text-foreground tracking-tight">Teams</h1>
                        <p className="text-[13px] text-muted-foreground mt-0.5">
                            Manage departments, team structures, and group assignments
                        </p>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="px-5 py-6 md:p-6 max-w-6xl mx-auto md:mx-0">
                <div className="rounded-2xl md:rounded-lg border-none md:border md:border-border/40 bg-transparent md:bg-card/40 overflow-hidden md:shadow-sm">
                    <TeamsManagement onBack={() => router.push('/settings')} />
                </div>
            </div>
        </div>
    );
}
