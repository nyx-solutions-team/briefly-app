"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import PermissionsManagement from '@/components/permissions-management';
import { ViewAccessDenied } from '@/components/access-denied';

export default function PermissionsSettingsPage() {
    const { user, bootstrapData, isLoading: authLoading } = useAuth();

    const currentOrg = bootstrapData?.orgs.find(o => o.orgId === bootstrapData.selectedOrgId);
    const isOrgAdmin = currentOrg?.role === 'orgAdmin';
    const isAdmin = user?.role === 'systemAdmin' || isOrgAdmin;

    if (!authLoading && !isAdmin) {
        return <ViewAccessDenied />;
    }

    return (
        <div className="min-h-screen bg-background/30">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
                <div className="px-8 py-4">
                    <h1 className="text-base font-semibold text-foreground tracking-tight">Permissions</h1>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                        Configure role-based access control and feature permissions
                    </p>
                </div>
            </header>

            {/* Content */}
            <div className="p-6 h-[calc(100vh-140px)]">
                <div className="rounded-lg border border-border/40 bg-card/40 overflow-hidden shadow-sm h-full">
                    <PermissionsManagement />
                </div>
            </div>
        </div>
    );
}
