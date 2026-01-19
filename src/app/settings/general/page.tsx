"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiFetch, getApiContext } from '@/lib/api';
import DepartmentCategoriesManagement from '@/components/department-categories-management';
import { Building2, Sparkles, RotateCcw } from 'lucide-react';
import { ViewAccessDenied } from '@/components/access-denied';

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
        <div className="rounded-lg border border-border/40 bg-card/40 overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border/30 bg-muted/20">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/40">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-foreground tracking-tight">{title}</span>
                        {badge && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium border border-primary/20">
                                {badge}
                            </span>
                        )}
                    </div>
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

export default function GeneralSettingsPage() {
    const { user, bootstrapData, isLoading: authLoading } = useAuth();
    const { toast } = useToast();
    const isAdmin = user?.role === 'systemAdmin';

    const [loading, setLoading] = React.useState(true);
    const [summaryPrompt, setSummaryPrompt] = React.useState<string>('');
    const [summaryLoading, setSummaryLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);

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
        <div className="min-h-screen bg-background/30">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
                <div className="px-8 py-4">
                    <h1 className="text-base font-semibold text-foreground tracking-tight">General</h1>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                        Organization-wide settings and workspace configurations
                    </p>
                </div>
            </header>

            {/* Content */}
            <div className="px-8 py-6 space-y-6 max-w-6xl mx-auto md:mx-0">
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
                                    className="w-full rounded-xl border border-border/30 bg-background/40 p-3.5 text-[13px] min-h-[140px] resize-none focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/10 transition-all shadow-inner"
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
                                    className="h-8 text-[12px] px-4 font-medium"
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
            </div>
        </div>
    );
}

