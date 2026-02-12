"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useSecurity } from '@/hooks/use-security';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatAppDateTime, cn } from '@/lib/utils';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { Shield, ShieldAlert, Globe, Clock, Plus, Trash2, Key, Loader2, RefreshCw } from 'lucide-react';
import { ViewAccessDenied } from '@/components/access-denied';

function Section({
    icon: Icon,
    title,
    description,
    children,
    className,
}: {
    icon: React.ElementType;
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("rounded-lg border border-border/40 bg-card/40 overflow-hidden shadow-sm", className)}>
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

export default function SecuritySettingsPage() {
    const { hasPermission, isLoading: authLoading } = useAuth();
    const {
        policy,
        activeBypass,
        loading,
        updateAllowlist,
        addIp,
        removeIp,
        grantBypass,
        revokeBypass
    } = useSecurity();

    const isAdmin = hasPermission('org.update_settings');
    const [newIp, setNewIp] = React.useState('');
    const [actionLoading, setActionLoading] = React.useState(false);
    const [orgId, setOrgId] = React.useState<string>(getApiContext().orgId || '');
    const [grantsLoading, setGrantsLoading] = React.useState(false);
    const [grantsRefreshing, setGrantsRefreshing] = React.useState(false);
    const [grantsError, setGrantsError] = React.useState('');
    const [includeInactiveGrants, setIncludeInactiveGrants] = React.useState(false);
    const [grants, setGrants] = React.useState<Array<{
        id: string;
        org_id: string;
        user_id: string;
        granted_at: string;
        expires_at: string;
        revoked_at: string | null;
        granted_by: string | null;
        note?: string | null;
    }>>([]);
    const [userMap, setUserMap] = React.useState<Record<string, { name: string; email: string }>>({});
    const [revokeLoadingId, setRevokeLoadingId] = React.useState<string | null>(null);

    React.useEffect(() => {
        const off = onApiContextChange(({ orgId }) => {
            setOrgId(orgId || '');
        });
        return () => { off(); };
    }, []);

    const loadUsers = React.useCallback(async () => {
        if (!orgId) return;
        try {
            const data = await apiFetch<any[]>(`/orgs/${orgId}/users`);
            const nextMap: Record<string, { name: string; email: string }> = {};
            (data || []).forEach((u: any) => {
                const name = u.displayName || u.app_users?.display_name || '';
                const email = u.email || u.app_users?.email || '';
                nextMap[u.userId] = {
                    name: name || email || u.userId,
                    email: email || ''
                };
            });
            setUserMap(nextMap);
        } catch { }
    }, [orgId]);

    const loadGrants = React.useCallback(async () => {
        if (!orgId) return;
        setGrantsLoading(true);
        setGrantsError('');
        try {
            const params = new URLSearchParams();
            if (!includeInactiveGrants) params.set('active', 'true');
            const data = await apiFetch<any[]>(`/orgs/${orgId}/ip-bypass-grants?${params.toString()}`);
            setGrants(Array.isArray(data) ? data : []);
        } catch {
            setGrantsError('Unable to load IP bypass grants.');
        } finally {
            setGrantsLoading(false);
        }
    }, [orgId, includeInactiveGrants]);

    React.useEffect(() => {
        if (!isAdmin) return;
        void loadUsers();
        void loadGrants();
    }, [isAdmin, loadUsers, loadGrants]);

    const refreshGrants = React.useCallback(async () => {
        setGrantsRefreshing(true);
        try {
            await Promise.all([loadUsers(), loadGrants()]);
        } finally {
            setGrantsRefreshing(false);
        }
    }, [loadUsers, loadGrants]);

    const revokeGrant = React.useCallback(async (grantId: string) => {
        if (!orgId) return;
        setRevokeLoadingId(grantId);
        try {
            await apiFetch(`/orgs/${orgId}/ip-bypass-grants/${grantId}/revoke`, { method: 'POST' });
            await loadGrants();
        } finally {
            setRevokeLoadingId(null);
        }
    }, [orgId, loadGrants]);

    if (!authLoading && !isAdmin) {
        return <ViewAccessDenied />;
    }

    const handleAddIp = async () => {
        if (!newIp) return;
        setActionLoading(true);
        try {
            await addIp(newIp);
            setNewIp('');
        } catch {
            // handle error if needed
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background/30">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
                <div className="px-8 py-4">
                    <h1 className="text-base font-semibold text-foreground tracking-tight">Security</h1>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                        Manage network access, IP allowlists, and workspace security protocols
                    </p>
                </div>
            </header>

            {/* Content */}
            <div className="p-6 space-y-6 max-w-5xl">
                {/* IP Allowlist Status */}
                <div className={cn(
                    "rounded-xl border p-6 flex items-center justify-between gap-6 transition-all",
                    policy.enabled
                        ? "bg-primary/5 border-primary/20 shadow-sm shadow-primary/5"
                        : "bg-muted/30 border-border/40"
                )}>
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "h-10 w-10 shrink-0 flex items-center justify-center rounded-xl transition-colors",
                            policy.enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}>
                            <Shield className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-[15px] font-semibold text-foreground tracking-tight">IP Allowlist Enforcement</h3>
                            <p className="text-[13px] text-muted-foreground mt-0.5 max-w-md">
                                When enabled, only users connecting from approved IP addresses will be granted access to the workspace.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        <Switch
                            disabled={loading}
                            checked={policy.enabled}
                            onCheckedChange={(checked) => updateAllowlist({ enforced: checked })}
                        />
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-5">
                    {/* Management */}
                    <Section
                        icon={Globe}
                        title="Authorized IP Addresses"
                        description="Approve specific IP addresses or ranges"
                        className="md:col-span-3"
                    >
                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <Input
                                    className="h-9 text-[13px] bg-background/40 border-border/30 focus:border-primary/40 focus:ring-primary/10"
                                    placeholder="e.g. 192.168.1.1"
                                    value={newIp}
                                    onChange={(e) => setNewIp(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddIp()}
                                />
                                <Button
                                    size="sm"
                                    className="h-9 px-4 font-medium"
                                    onClick={handleAddIp}
                                    disabled={actionLoading || !newIp}
                                >
                                    {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                                    Add IP
                                </Button>
                            </div>

                            <div className="space-y-1 mt-4">
                                {policy.ips.length ? (
                                    policy.ips.map((ip: string) => (
                                        <div key={ip} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 border border-border/10 group hover:border-border/30 transition-colors">
                                            <span className="text-[13px] font-mono text-foreground">{ip}</span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                                                onClick={() => removeIp(ip)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-10 bg-muted/10 rounded-lg border border-dashed border-border/40">
                                        <Globe className="h-8 w-8 mx-auto mb-2 text-muted-foreground/20" />
                                        <p className="text-[12px] text-muted-foreground">No IP addresses added yet</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Section>

                    {/* Temporary Bypass */}
                    <Section
                        icon={Clock}
                        title="Emergency Bypass"
                        description="Grant temporary access for 24h"
                        className="md:col-span-2"
                    >
                        <div className="space-y-4">
                            {activeBypass ? (
                                <div className="space-y-4">
                                    <div className="p-4 rounded-xl border border-amber-200/50 bg-amber-50/10 text-amber-600 dark:text-amber-500">
                                        <div className="flex items-center gap-2 mb-2">
                                            <ShieldAlert className="h-4 w-4" />
                                            <span className="text-[13px] font-semibold">Active Bypass Enabled</span>
                                        </div>
                                        <p className="text-[11px] leading-relaxed opacity-90">
                                            Access is currently granted to all IPs until it expires or is revoked.
                                        </p>
                                        <div className="mt-4 flex items-center justify-between text-[11px] font-mono bg-amber-100/20 p-2 rounded border border-amber-200/30">
                                            <span className="opacity-70">Expires:</span>
                                            <span className="font-semibold">{formatAppDateTime(activeBypass.expiresAt)}</span>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="w-full h-9 text-[12px] font-medium border-amber-200/50 text-amber-600 hover:bg-amber-50/10"
                                        onClick={() => revokeBypass()}
                                    >
                                        Revoke Early
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-3.5 rounded-lg bg-muted/20 border border-border/10">
                                        <p className="text-[12px] text-muted-foreground leading-relaxed">
                                            Enable a 24-hour bypass to allow access from any IP address. Use this for emergency access or guest visits.
                                        </p>
                                    </div>
                                    <Button
                                        className="w-full h-9 text-[12px] font-medium"
                                        onClick={() => grantBypass()}
                                    >
                                        <Key className="h-3.5 w-3.5 mr-1.5" />
                                        Grant 24h Bypass
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Section>

                    {/* Active Bypass Grants */}
                    <Section
                        icon={ShieldAlert}
                        title="Active IP Bypass Grants"
                        description="Track time-limited bypass access across the org"
                        className="md:col-span-5"
                    >
                        <div className="space-y-4">
                            {(() => {
                                const now = Date.now();
                                const active = grants.filter((g) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at).getTime() > now));
                                const activeUserCount = new Set(active.map(g => g.user_id)).size;
                                const nextExpiry = active
                                    .filter(g => g.expires_at)
                                    .map(g => new Date(g.expires_at).getTime())
                                    .sort((a, b) => a - b)[0];
                                return (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                                            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Active users</div>
                                            <div className="text-[18px] font-semibold mt-1">{activeUserCount}</div>
                                        </div>
                                        <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                                            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Active grants</div>
                                            <div className="text-[18px] font-semibold mt-1">{active.length}</div>
                                        </div>
                                        <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                                            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Next expiry</div>
                                            <div className="text-[12px] font-mono mt-2">
                                                {nextExpiry ? formatAppDateTime(new Date(nextExpiry).toISOString()) : '—'}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-[11px] text-muted-foreground">
                                    This list shows time-limited IP bypass grants. Role or override-based bypass does not expire and won’t appear here.
                                </div>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                        <Switch
                                            checked={includeInactiveGrants}
                                            onCheckedChange={(v) => setIncludeInactiveGrants(!!v)}
                                        />
                                        Show inactive
                                    </label>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[12px]"
                                        onClick={refreshGrants}
                                        disabled={grantsRefreshing}
                                    >
                                        {grantsRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                                        Refresh
                                    </Button>
                                </div>
                            </div>

                            {grantsLoading ? (
                                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Loading grants…
                                </div>
                            ) : grantsError ? (
                                <div className="text-[12px] text-destructive">{grantsError}</div>
                            ) : grants.length === 0 ? (
                                <div className="text-center py-8 bg-muted/10 rounded-lg border border-dashed border-border/40">
                                    <ShieldAlert className="h-8 w-8 mx-auto mb-2 text-muted-foreground/20" />
                                    <p className="text-[12px] text-muted-foreground">No IP bypass grants found</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {grants.map((grant) => {
                                        const now = Date.now();
                                        const isRevoked = !!grant.revoked_at;
                                        const isExpired = grant.expires_at ? new Date(grant.expires_at).getTime() <= now : false;
                                        const status = isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Active';
                                        const statusClass = isRevoked
                                            ? 'text-destructive/80'
                                            : isExpired
                                                ? 'text-muted-foreground'
                                                : 'text-emerald-600';
                                        const user = userMap[grant.user_id];
                                        const displayName = user?.name || user?.email || grant.user_id;
                                        return (
                                            <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/30 bg-background/40 px-3 py-2.5">
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold truncate">{displayName}</div>
                                                    <div className="text-[11px] text-muted-foreground truncate">
                                                        {user?.email ? user.email : grant.user_id}
                                                    </div>
                                                </div>
                                                <div className="text-[11px] text-muted-foreground min-w-[180px] text-right">
                                                    <div className="font-mono">
                                                        Expires {grant.expires_at ? formatAppDateTime(grant.expires_at) : '—'}
                                                    </div>
                                                    <div className={cn("text-[10px] uppercase tracking-widest mt-1", statusClass)}>{status}</div>
                                                </div>
                                                {!isRevoked && !isExpired && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 text-[11px]"
                                                        onClick={() => revokeGrant(grant.id)}
                                                        disabled={revokeLoadingId === grant.id}
                                                    >
                                                        {revokeLoadingId === grant.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Revoke'}
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}
