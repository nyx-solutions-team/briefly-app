"use client";

import * as React from 'react';
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
} from 'lucide-react';

function Section({
    icon: Icon,
    title,
    description,
    children,
}: {
    icon: React.ElementType;
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-border/40 bg-card/40 overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border/30 bg-muted/20">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/40">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                    <span className="text-[13px] font-semibold text-foreground tracking-tight">{title}</span>
                    {description && (
                        <p className="text-[12px] text-muted-foreground leading-none mt-0.5">{description}</p>
                    )}
                </div>
            </div>
            <div className="p-5">
                {children}
            </div>
        </div>
    );
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-border/20 last:border-0">
            <div className="flex items-center gap-3">
                {Icon && (
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/20">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                    </div>
                )}
                <span className="text-[13px] text-muted-foreground">{label}</span>
            </div>
            <span className="text-[13px] font-medium text-foreground">{value || '—'}</span>
        </div>
    );
}

export default function ProfilePage() {
    const { user, bootstrapData } = useAuth();
    const { toast } = useToast();
    const [editing, setEditing] = React.useState(false);
    const [displayName, setDisplayName] = React.useState('');
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (user) {
            setDisplayName(user.username || user.email?.split('@')[0] || '');
        }
    }, [user]);

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
        teamLead: 'Team Lead',
        contentManager: 'Content Manager',
        member: 'Member',
        contentViewer: 'Content Viewer',
        guest: 'Guest',
    };
    const roleLabel = (user?.role && roleLabels[user.role]) || user?.role || 'Unknown';

    const departments = bootstrapData?.departments || [];
    const userDepts = (user as any)?.departmentIds || [];
    const userDeptNames = departments
        .filter((d: any) => userDepts.includes(d.id))
        .map((d: any) => d.name)
        .join(', ');

    return (
        <div className="min-h-screen bg-background/30">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
                <div className="px-8 py-4">
                    <h1 className="text-base font-semibold text-foreground tracking-tight">Profile</h1>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                        Manage your account information and how you appear to others
                    </p>
                </div>
            </header>

            {/* Content */}
            <div className="px-8 py-6 space-y-6 max-w-6xl mx-auto md:mx-0">
                {/* Profile Card */}
                <div className="rounded-xl border border-border/40 bg-card/30 p-6 shadow-sm overflow-hidden relative">
                    {/* Subtle gradient accent */}
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />

                    <div className="flex items-center gap-5">
                        <Avatar className="h-16 w-16 rounded-xl border border-border/50">
                            <AvatarImage src="" />
                            <AvatarFallback className="rounded-xl bg-primary/15 text-primary text-xl font-semibold">
                                {user?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <div className="flex items-center gap-3">
                                {editing ? (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={displayName}
                                            onChange={(e) => setDisplayName(e.target.value)}
                                            className="h-8 text-[13px] w-48 bg-muted/30"
                                            placeholder="Display name"
                                        />
                                        <Button size="sm" className="h-8 text-[12px] px-3" onClick={handleSave} disabled={saving}>
                                            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
                                            {saving ? 'Saving' : 'Save'}
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-8 text-[12px] px-3" onClick={() => setEditing(false)}>
                                            Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <h2 className="text-lg font-semibold text-foreground tracking-tight">
                                            {user?.username || user?.email?.split('@')[0] || 'User'}
                                        </h2>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                            onClick={() => setEditing(true)}
                                        >
                                            <Edit2 className="h-3 w-3" />
                                        </Button>
                                    </>
                                )}
                            </div>
                            <p className="text-[13px] text-muted-foreground mt-0.5 font-normal">{user?.email}</p>
                            <div className="flex items-center gap-2 mt-3">
                                <Badge variant="secondary" className="text-[11px] font-medium h-5 rounded-md bg-muted/60 text-muted-foreground border-none">
                                    {roleLabel}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Account Details */}
                    <Section icon={User} title="Account Details" description="Information linked to your account">
                        <div className="space-y-0.5">
                            <InfoRow label="Email Address" value={user?.email} icon={Mail} />
                            <InfoRow label="Access Level" value={roleLabel} icon={Shield} />
                            <InfoRow
                                label="Member Since"
                                value={'—'}
                                icon={Calendar}
                            />
                        </div>
                    </Section>

                    {/* Workspace */}
                    <Section icon={Building2} title="Workspace" description="Enterprise details for your workplace">
                        <div className="space-y-0.5">
                            {(() => {
                                const currentOrg = bootstrapData?.orgs?.find(o => o.orgId === bootstrapData?.selectedOrgId);
                                return (
                                    <>
                                        <InfoRow label="Organization Name" value={currentOrg?.name || '—'} />
                                        <InfoRow
                                            label="My Teams"
                                            value={
                                                <div className="flex flex-wrap gap-1.5 justify-end">
                                                    {departments.filter((d: any) => userDepts.includes(d.id)).map((d: any) => (
                                                        <Badge key={d.id} variant="secondary" className="text-[10px] font-medium px-2 h-4.5 bg-muted/60 text-muted-foreground border-none">
                                                            {d.name}
                                                        </Badge>
                                                    ))}
                                                    {userDepts.length === 0 && <span className="text-muted-foreground font-normal">No teams</span>}
                                                </div>
                                            }
                                        />
                                    </>
                                );
                            })()}
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}

