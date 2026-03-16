"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import PermissionsManagement from '@/components/permissions-management';
import { ViewAccessDenied } from '@/components/access-denied';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PermissionsSettingsPage() {
    const router = useRouter();
    const { hasPermission, isLoading: authLoading } = useAuth();
    const isAdmin = hasPermission('org.manage_members');
    const [isMobile, setIsMobile] = React.useState(false);
    const [mobileShowDetails, setMobileShowDetails] = React.useState(false);

    React.useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (!authLoading && !isAdmin) {
        return <ViewAccessDenied />;
    }

    return (
        <div className="min-h-screen bg-background/30 flex flex-col">
            {/* Mobile Header */}
            {isMobile && (
                <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border/40 px-4 h-16 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => mobileShowDetails ? setMobileShowDetails(false) : router.back()}
                            className="h-9 w-9 -ml-1 rounded-full flex items-center justify-center text-muted-foreground active:scale-95 transition-all hover:bg-muted"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="font-bold text-[14px] text-foreground truncate tracking-tight">
                                {mobileShowDetails ? "Role Permissions" : "Permissions"}
                            </h1>
                            {!mobileShowDetails && (
                                <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.05em] leading-none mt-0.5">
                                    Configure Access
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop Header */}
            {!isMobile && (
                <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40 shrink-0">
                    <div className="px-8 py-4">
                        <h1 className="text-base font-semibold text-foreground tracking-tight">Permissions</h1>
                        <p className="text-[13px] text-muted-foreground mt-0.5">
                            Configure role-based access control and feature permissions
                        </p>
                    </div>
                </header>
            )}

            {/* Content */}
            <div className={cn(
                "flex-1 flex flex-col min-h-0",
                isMobile ? "p-0" : "p-6 h-[calc(100vh-140px)]"
            )}>
                <div className={cn(
                    "bg-card/40 overflow-hidden h-full flex flex-col",
                    isMobile ? "border-none" : "rounded-lg border border-border/40 shadow-sm"
                )}>
                    <PermissionsManagement
                        isMobile={isMobile}
                        mobileShowDetails={mobileShowDetails}
                        setMobileShowDetails={setMobileShowDetails}
                    />
                </div>
            </div>
        </div>
    );
}
