"use client";

import * as React from 'react';
import { format as formatDateFns } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiFetch, getApiContext } from '@/lib/api';
import {
    User,
    Mail,
    Building2,
    Calendar,
    Shield,
    Edit2,
    Loader2,
    ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';

function Section({
    icon: Icon,
    title,
    children,
}: {
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="relative group rounded-2xl md:rounded-lg border border-border/40 bg-card/40 md:bg-card/40 overflow-hidden shadow-sm transition-all hover:border-border/60 md:hover:border-border/40">
            <div className="flex items-center gap-3 px-5 py-3 md:px-5 md:py-3 border-b border-border/10 md:border-border/30 bg-muted/10 md:bg-muted/20">
                <div className="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-lg md:rounded-md bg-white/80 dark:bg-black/20 md:bg-muted/40 shadow-sm md:shadow-none">
                    <Icon className="h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground/70 md:text-muted-foreground" />
                </div>
                <div>
                    <span className="text-[13px] font-bold md:font-semibold text-foreground tracking-tight">{title}</span>
                </div>
            </div>
            <div className="px-5 py-3 md:p-5">
                {children}
            </div>
        </div>
    );
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
    return (
        <div className="flex items-center justify-between py-2 md:py-2.5 border-b border-border/10 last:border-0 border-dashed md:border-solid">
            <div className="flex items-center gap-2.5">
                {Icon && (
                    <Icon className="h-3.5 w-3.5 text-muted-foreground/40 md:text-muted-foreground/60" />
                )}
                <span className="text-[12px] md:text-[13px] text-muted-foreground font-medium md:font-normal">{label}</span>
            </div>
            <span className="text-[12px] md:text-[13px] font-semibold md:font-medium text-foreground text-right truncate max-w-[180px] md:max-w-none">{value || '—'}</span>
        </div>
    );
}

function formatDateSafe(value?: string | Date | null) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    try {
        return formatDateFns(date, 'd MMM yyyy');
    } catch {
        return null;
    }
}

export default function ProfilePage() {
    const { user, bootstrapData } = useAuth();
    const { toast } = useToast();
    const [editing, setEditing] = React.useState(false);
    const [displayName, setDisplayName] = React.useState('');
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (user) {
            setDisplayName(
                bootstrapData?.user?.displayName ||
                user.username ||
                user.email?.split('@')[0] ||
                ''
            );
        }
    }, [user, bootstrapData?.user?.displayName]);

    const handleSave = async () => {
        if (!displayName.trim()) {
            toast({ title: 'Display name is required', variant: 'destructive' });
            return;
        }
        setSaving(true);
        try {
            const { orgId } = getApiContext();
            await apiFetch(`/orgs/${orgId}/users/me`, {
                method: 'PATCH',
                body: { displayName: displayName.trim() },
            });
            toast({ title: 'Profile updated' });
            setEditing(false);
        } catch (error: any) {
            toast({
                title: 'Failed to update profile',
                description: error?.message || 'Please try again.',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const roleLabels: Record<string, string> = {
        systemAdmin: 'System Admin',
        orgAdmin: 'Organization Admin',
        owner: 'Owner',
        teamLead: 'Team Lead',
        manager: 'Manager',
        editor: 'Editor',
        contentManager: 'Content Manager',
        member: 'Member',
        contentViewer: 'Content Viewer',
        guest: 'Guest',
    };
    const humanizeRole = (role?: string | null) => {
        if (!role) return null;
        const key = String(role);
        if (roleLabels[key]) return roleLabels[key];
        return key
            .replace(/[_-]+/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\b\w/g, (m) => m.toUpperCase());
    };
    const roleLabel = humanizeRole(user?.role) || 'Unknown';

    const departments = bootstrapData?.departments || [];
    const legacyUserDepts = (user as any)?.departmentIds || [];
    const myDepartments = departments.filter((d: any) => d?.is_member || legacyUserDepts.includes(d.id));
    const userDeptNames = myDepartments.map((d: any) => d.name).join(', ');
    const currentOrg = bootstrapData?.orgs?.find(o => o.orgId === bootstrapData?.selectedOrgId);
    const memberSinceLabel = currentOrg?.joinedAt ? formatDateSafe(currentOrg.joinedAt) : null;

    return (
        <div className="min-h-screen bg-background/30">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
                <div className="px-6 md:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/settings"
                            className="md:hidden flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Link>
                        <div>
                            <h1 className="text-lg md:text-base font-bold md:font-semibold text-foreground tracking-tight">Profile</h1>
                            <p className="hidden sm:block text-xs md:text-[13px] text-muted-foreground mt-0.5">
                                Your account identity and settings
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="px-5 py-6 md:px-8 md:py-6 space-y-5 md:space-y-6 max-w-5xl md:max-w-6xl mx-auto md:mx-0">
                {/* Profile Card */}
                <div className="group relative overflow-hidden rounded-[2rem] md:rounded-xl bg-[#F2F0EB] dark:bg-[#1E1C1A] md:bg-card/30 border border-border/10 md:border-border/40 p-6 md:p-6 shadow-sm">
                    {/* Subtle gradient accent for desktop */}
                    <div className="hidden md:block absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />

                    <User className="md:hidden absolute -bottom-4 -right-4 h-24 w-24 -rotate-12 opacity-[0.03] pointer-events-none" />

                    <div className="flex flex-row items-center gap-5">
                            <Avatar className="h-16 w-16 md:h-16 md:w-16 rounded-2xl md:rounded-xl border border-white dark:border-border/10 shadow-lg md:shadow-none">
                                <AvatarImage src="" />
                                <AvatarFallback className="rounded-2xl md:rounded-xl bg-primary md:bg-primary/15 text-primary-foreground md:text-primary text-xl md:text-xl font-bold md:font-semibold">
                                {displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                            </Avatar>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                {editing ? (
                                    <div className="flex items-center gap-2 w-full max-w-md">
                                        <Input
                                            value={displayName}
                                            onChange={(e) => setDisplayName(e.target.value)}
                                            className="h-8 text-[13px] bg-white/80 dark:bg-black/20 md:bg-muted/30 rounded-lg w-full md:w-48"
                                            placeholder="Display name"
                                            autoFocus
                                        />
                                        <Button size="sm" className="h-8 rounded-lg px-3 text-[12px]" onClick={handleSave} disabled={saving}>
                                            Save
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <h2 className="text-lg md:text-lg font-bold md:font-semibold text-foreground tracking-tight truncate">
                                            {displayName || user?.email?.split('@')[0] || 'User'}
                                        </h2>
                                        <button
                                            className="text-xs text-muted-foreground/60 hover:text-primary transition-colors p-1"
                                            onClick={() => setEditing(true)}
                                        >
                                            <Edit2 className="h-3 w-3" />
                                        </button>
                                    </>
                                )}
                            </div>
                            <p className="text-[12px] md:text-[13px] font-medium md:font-normal text-muted-foreground/60 md:text-muted-foreground truncate">{user?.email}</p>

                            <div className="flex flex-wrap gap-1.5 mt-2 md:mt-3">
                                <Badge className="text-[9px] md:text-[11px] uppercase md:capitalize tracking-wider md:tracking-normal font-bold md:font-medium px-2 py-0.5 h-auto md:h-5 rounded-md bg-primary/10 md:bg-muted/60 text-primary md:text-muted-foreground border-none">
                                    {roleLabel}
                                </Badge>
                                {userDeptNames && (
                                    <Badge variant="outline" className="hidden sm:inline-flex text-[10px] md:text-[11px] uppercase md:capitalize tracking-widest md:tracking-normal font-bold md:font-medium px-2 py-0 h-auto md:h-5 rounded-md border-border/40 md:border-none text-muted-foreground">
                                        {userDeptNames}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Account Details */}
                    <Section icon={User} title="Account Details">
                        <div className="space-y-0.5">
                            <InfoRow label="Email Address" value={user?.email} icon={Mail} />
                            <InfoRow label="Access Level" value={roleLabel} icon={Shield} />
                            {memberSinceLabel && (
                                <InfoRow
                                    label="Member Since"
                                    value={memberSinceLabel}
                                    icon={Calendar}
                                />
                            )}
                        </div>
                    </Section>

                    {/* Workspace */}
                    <Section icon={Building2} title="Workspace">
                        <div className="space-y-0.5">
                            <InfoRow label="Organization Name" value={currentOrg?.name || '—'} />
                            <InfoRow
                                label="My Teams"
                                value={
                                    <div className="flex flex-wrap gap-1.5 justify-end">
                                        {myDepartments.map((d: any) => (
                                            <Badge key={d.id} variant="secondary" className="text-[10px] font-medium px-2 h-4.5 bg-muted/60 text-muted-foreground border-none">
                                                {d.name}
                                            </Badge>
                                        ))}
                                        {myDepartments.length === 0 && <span className="text-muted-foreground font-normal">No teams</span>}
                                    </div>
                                }
                            />
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}
