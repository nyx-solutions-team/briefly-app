"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import TeamsManagement from '@/components/teams-management-new';
import { ViewAccessDenied } from '@/components/access-denied';

export default function TeamsSettingsPage() {
    const { user, bootstrapData, isLoading: authLoading } = useAuth();

    // Check permissions: Admin, Team Lead, or specialized permission
    const currentOrg = bootstrapData?.orgs.find(o => o.orgId === bootstrapData.selectedOrgId);
    const isOrgAdmin = currentOrg?.role === 'orgAdmin';
    const isTeamLead = user?.role === 'teamLead';
    const isAdmin = user?.role === 'systemAdmin' || isOrgAdmin;
    const canManageTeams = bootstrapData?.permissions?.['departments.manage_members'] === true;

    if (!authLoading && !isAdmin && !isTeamLead && !canManageTeams) {
        return <ViewAccessDenied />;
    }

    return (
        <div className="min-h-screen bg-background/30">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
                <div className="px-8 py-4">
                    <h1 className="text-base font-semibold text-foreground tracking-tight">Teams</h1>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                        Manage departments, team structures, and group assignments
                    </p>
                </div>
            </header>

            {/* Content */}
            <div className="p-6">
                <div className="rounded-lg border border-border/40 bg-card/40 overflow-hidden shadow-sm">
                    <TeamsManagement />
                </div>
            </div>
        </div>
    );
}
