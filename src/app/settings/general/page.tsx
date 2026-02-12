"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiFetch, getApiContext } from '@/lib/api';
import DepartmentCategoriesManagement from '@/components/department-categories-management';
import { Building2, Sparkles, RotateCcw, ChevronLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import { ViewAccessDenied } from '@/components/access-denied';
import { getOrgFeatures } from '@/lib/org-features';

const BRIEFLY_DEMO_ORG_ID = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d';

function Section({
    icon: Icon,
    title,
    description,
    badge,
    children,
}: {
    icon: React.ElementType;
    title: string;
    description?: string;
    badge?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="relative group md:rounded-lg border-none md:border md:border-border/40 bg-transparent md:bg-card overflow-hidden md:shadow-sm transition-all md:hover:border-border/60">
            <div className="flex items-center gap-3 px-0 py-4 md:px-5 md:py-3 border-none md:border-b md:border-border/30 bg-transparent md:bg-muted/20">
                <div className="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-lg md:rounded-md bg-muted/40 md:bg-muted/40 shadow-sm md:shadow-none">
                    <Icon className="h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground/70 md:text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold md:font-semibold text-foreground tracking-tight">{title}</span>
                        {badge && (
                            <span className="text-[9px] md:text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold md:font-medium border border-primary/20">
                                {badge}
                            </span>
                        )}
                    </div>
                    {description && (
                        <p className="hidden md:block text-[12px] text-muted-foreground leading-none mt-0.5">{description}</p>
                    )}
                </div>
            </div>
            <div className="px-0 md:p-5">
                {children}
            </div>
        </div>
    );
}

export default function GeneralSettingsPage() {
    const { hasPermission, bootstrapData, isLoading: authLoading, refreshPermissions } = useAuth();
    const { toast } = useToast();
    const isAdmin = hasPermission('org.update_settings');
    const features = getOrgFeatures(bootstrapData?.orgSettings);

    const [loading, setLoading] = React.useState(true);
    const [summaryPrompt, setSummaryPrompt] = React.useState<string>('');
    const [summaryLoading, setSummaryLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);

    const [editorEnabled, setEditorEnabled] = React.useState(false);
    const [approvalsEnabled, setApprovalsEnabled] = React.useState(false);
    const [featuresSaving, setFeaturesSaving] = React.useState(false);

    React.useEffect(() => {
        setEditorEnabled(Boolean(bootstrapData?.orgSettings?.editor_enabled));
        setApprovalsEnabled(Boolean(bootstrapData?.orgSettings?.approvals_enabled));
    }, [bootstrapData?.orgSettings?.approvals_enabled, bootstrapData?.orgSettings?.editor_enabled]);

    const showDmsFeatureFlags = Boolean(
        isAdmin &&
        bootstrapData?.selectedOrgId &&
        (
            bootstrapData.selectedOrgId === BRIEFLY_DEMO_ORG_ID ||
            bootstrapData?.orgSettings?.editor_enabled ||
            bootstrapData?.orgSettings?.approvals_enabled
        )
    );

    const featuresDirty = Boolean(
        editorEnabled !== Boolean(bootstrapData?.orgSettings?.editor_enabled) ||
        approvalsEnabled !== Boolean(bootstrapData?.orgSettings?.approvals_enabled)
    );

    const resetFeatures = () => {
        setEditorEnabled(Boolean(bootstrapData?.orgSettings?.editor_enabled));
        setApprovalsEnabled(Boolean(bootstrapData?.orgSettings?.approvals_enabled));
    };

    const saveFeatures = async () => {
        const orgId = getApiContext().orgId || '';
        if (!orgId) return;
        setFeaturesSaving(true);
        try {
            await apiFetch(`/orgs/${orgId}/settings`, {
                method: 'PUT',
                body: {
                    editor_enabled: editorEnabled,
                    approvals_enabled: editorEnabled ? approvalsEnabled : false,
                },
            });
            toast({ title: 'Saved', description: 'Document features updated.' });
            await refreshPermissions();
        } catch (error: any) {
            toast({
                title: 'Failed to save',
                description: error?.message || 'Please try again.',
                variant: 'destructive'
            });
        } finally {
            setFeaturesSaving(false);
        }
    };

    // Load org settings
    React.useEffect(() => {
        if (!isAdmin) {
            setLoading(false);
            setSummaryLoading(false);
            return;
        }
        const loadSettings = async () => {
            try {
                const orgId = getApiContext().orgId || '';
                if (!orgId) return;
                const priv = await apiFetch<any>(`/orgs/${orgId}/private-settings`);
                setSummaryPrompt(priv?.summary_prompt || '');
            } catch {
                // silent
            } finally {
                setLoading(false);
                setSummaryLoading(false);
            }
        };
        loadSettings();
    }, [isAdmin]);

    const handleSaveSummaryPrompt = async () => {
        const orgId = getApiContext().orgId || '';
        if (!orgId) return;
        setSaving(true);
        try {
            await apiFetch(`/orgs/${orgId}/private-settings`, {
                method: 'PUT',
                body: { summary_prompt: summaryPrompt }
            });
            toast({ title: 'Saved', description: 'Summary prompt updated.' });
        } catch (error: any) {
            toast({
                title: 'Failed to save',
                description: error?.message || 'Please try again.',
                variant: 'destructive'
            });
        } finally {
            setSaving(false);
        }
    };

    if (!authLoading && !isAdmin) {
        return <ViewAccessDenied />;
    }

    return (
        <div className="min-h-screen bg-background/30 pb-10">
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
                        <h1 className="text-lg md:text-base font-bold md:font-semibold text-foreground tracking-tight">General</h1>
                        <p className="hidden md:block text-[13px] text-muted-foreground mt-0.5">
                            Organization-wide settings and workspace configurations
                        </p>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="px-5 py-6 md:px-8 md:py-6 space-y-5 md:space-y-6 max-w-5xl md:max-w-6xl mx-auto md:mx-0">
                {/* Department Categories */}
                <Section
                    icon={Building2}
                    title="Department Categories"
                    badge="Admin Only"
                    description="Configure document categorization rules for your departments"
                >
                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-24 w-full rounded-xl" />
                            <Skeleton className="h-24 w-full rounded-xl" />
                        </div>
                    ) : (
                        <DepartmentCategoriesManagement
                            departments={bootstrapData?.departments || []}
                        />
                    )}
                </Section>

                {/* AI Summary Prompt */}
                <Section
                    icon={Sparkles}
                    title="AI Configuration"
                    badge="Admin Only"
                    description="Customize the document analysis and summarization behavior"
                >
                    {summaryLoading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-32 w-full rounded-xl" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Summrization Prompt</label>
                                <textarea
                                    className="w-full rounded-2xl md:rounded-xl border border-border/20 md:border-border/30 bg-background/40 p-4 md:p-3.5 text-[13px] min-h-[140px] md:min-h-[140px] resize-none focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/10 transition-all shadow-inner"
                                    placeholder="Write a concise summary (<= 300 words) of the document text. Focus on essential facts and outcomes."
                                    value={summaryPrompt}
                                    onChange={(e) => setSummaryPrompt(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center justify-end gap-2.5 pt-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-[12px] text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                        setSummaryPrompt('Write a concise summary (<= 300 words) of the document text. Focus on essential facts and outcomes.');
                                    }}
                                >
                                    <RotateCcw className="h-3 w-3 mr-1.5" />
                                    Reset to default
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-10 md:h-8 rounded-xl md:rounded-md text-[13px] md:text-[12px] px-6 md:px-4 font-bold md:font-medium shadow-lg md:shadow-none"
                                    onClick={handleSaveSummaryPrompt}
                                    disabled={saving}
                                >
                                    {saving && <Sparkles className="h-3 w-3 mr-1.5 animate-pulse" />}
                                    {saving ? 'Saving...' : 'Save AI Settings'}
                                </Button>
                            </div>
                        </div>
                    )}
                </Section>

                {showDmsFeatureFlags && (
                    <Section
                        icon={FileText}
                        title="Document Workflows"
                        badge="Internal"
                        description="Enable controlled documents and approval workflows for this organization"
                    >
                        <div className="space-y-4">
                            <div className="flex items-center justify-between rounded-2xl md:rounded-xl border border-border/20 md:border-border/30 bg-background/40 px-4 py-3">
                                <div className="min-w-0 pr-3">
                                    <div className="text-[13px] font-semibold text-foreground">Controlled Docs (Editor)</div>
                                    <div className="text-[12px] text-muted-foreground mt-0.5">
                                        Create and version controlled documents in the editor.
                                    </div>
                                </div>
                                <Switch
                                    checked={editorEnabled}
                                    onCheckedChange={(v) => {
                                        setEditorEnabled(v);
                                        if (!v) setApprovalsEnabled(false);
                                    }}
                                />
                            </div>

                            <div className="flex items-center justify-between rounded-2xl md:rounded-xl border border-border/20 md:border-border/30 bg-background/40 px-4 py-3">
                                <div className="min-w-0 pr-3">
                                    <div className="text-[13px] font-semibold text-foreground">Approval Workflows</div>
                                    <div className="text-[12px] text-muted-foreground mt-0.5">
                                        Submit versions for review and track approvals. Requires Editor.
                                    </div>
                                </div>
                                <Switch
                                    checked={approvalsEnabled}
                                    disabled={!editorEnabled}
                                    onCheckedChange={(v) => setApprovalsEnabled(v)}
                                />
                            </div>

                            <div className="text-[11px] text-muted-foreground px-1">
                                Current status: <span className="font-medium">{features.editorEnabled ? 'Editor enabled' : 'Editor disabled'}</span>
                                {' '}·{' '}
                                <span className="font-medium">{features.approvalsUsable ? 'Approvals enabled' : 'Approvals disabled'}</span>
                            </div>

                            <div className="flex items-center justify-end gap-2.5 pt-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-[12px] text-muted-foreground hover:text-foreground"
                                    onClick={resetFeatures}
                                    disabled={!featuresDirty || featuresSaving}
                                >
                                    <RotateCcw className="h-3 w-3 mr-1.5" />
                                    Reset
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-10 md:h-8 rounded-xl md:rounded-md text-[13px] md:text-[12px] px-6 md:px-4 font-bold md:font-medium shadow-lg md:shadow-none"
                                    onClick={saveFeatures}
                                    disabled={!featuresDirty || featuresSaving}
                                >
                                    {featuresSaving ? 'Saving...' : 'Save Document Settings'}
                                </Button>
                            </div>
                        </div>
                    </Section>
                )}
            </div>
        </div>
    );
}

