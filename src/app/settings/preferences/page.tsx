"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
    Palette,
    Monitor,
    Moon,
    Sun,
    Calendar,
    Check,
    Sparkles,
    ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// Accent color values
const ACCENT_COLOR_VALUES: Record<string, string> = {
    'default': 'hsl(var(--primary))',
    'red': '#ef4444',
    'rose': '#f43f5e',
    'orange': '#f97316',
    'amber': '#f59e0b',
    'yellow': '#eab308',
    'lime': '#84cc16',
    'green': '#22c55e',
    'emerald': '#10b981',
    'teal': '#14b8a6',
    'cyan': '#06b6d4',
    'sky': '#0ea5e9',
    'blue': '#3b82f6',
    'indigo': '#6366f1',
    'violet': '#8b5cf6',
    'purple': '#a855f7',
    'fuchsia': '#d946ef',
    'pink': '#ec4899',
};

const ACCENT_COLORS = Object.keys(ACCENT_COLOR_VALUES);

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
        <div className={cn("relative group rounded-2xl md:rounded-lg border border-border/40 bg-card overflow-hidden shadow-sm transition-all hover:border-border/60 md:hover:border-border/40", className)}>
            <div className="flex items-center gap-3 px-5 py-3 md:px-5 md:py-3 border-b border-border/10 md:border-border/30 bg-muted/10 md:bg-muted/20">
                <div className="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-lg md:rounded-md bg-white/80 dark:bg-black/20 md:bg-muted/40 shadow-sm md:shadow-none">
                    <Icon className="h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground/70 md:text-muted-foreground" />
                </div>
                <div>
                    <span className="text-[13px] font-bold md:font-semibold text-foreground tracking-tight">{title}</span>
                    {description && (
                        <p className="hidden md:block text-[12px] text-muted-foreground leading-none mt-0.5">{description}</p>
                    )}
                </div>
            </div>
            <div className="p-5">
                {children}
            </div>
        </div>
    );
}

function SettingRow({
    icon: Icon,
    title,
    description,
    children,
}: {
    icon?: React.ElementType;
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn(
            "flex items-center justify-between gap-4 px-4 py-3 rounded-xl md:rounded-lg border border-border/10 md:border-border/20 bg-background/40",
            "hover:bg-muted/30 transition-colors"
        )}>
            <div className="flex items-center gap-3 min-w-0">
                {Icon && (
                    <div className="flex h-8 w-8 md:h-7 md:w-7 shrink-0 items-center justify-center rounded-lg md:rounded-md bg-muted/30">
                        <Icon className="h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground/70" />
                    </div>
                )}
                <div className="min-w-0">
                    <div className="text-[13px] font-bold md:font-medium text-foreground">{title}</div>
                    {description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{description}</p>
                    )}
                </div>
            </div>
            <div className="shrink-0 scale-90 md:scale-90 origin-right">
                {children}
            </div>
        </div>
    );
}

export default function PreferencesPage() {
    const { settings, updateSettings } = useSettings();
    const { toast } = useToast();

    const applyColor = async (value: string) => {
        try {
            await updateSettings({ accent_color: value });
        } catch (error: any) {
            toast({
                title: 'Failed to update accent color',
                description: error?.message || 'Please try again.',
                variant: 'destructive'
            });
        }
    };

    const onToggleDarkMode = async (enabled: boolean) => {
        try {
            await updateSettings({ dark_mode: enabled });
        } catch (error: any) {
            toast({
                title: 'Failed to update theme',
                description: error?.message || 'Please try again.',
                variant: 'destructive'
            });
        }
    };

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
                        <h1 className="text-lg md:text-base font-bold md:font-semibold text-foreground tracking-tight">Preferences</h1>
                        <p className="hidden md:block text-[13px] text-muted-foreground mt-0.5">
                            Customize your interface and display settings
                        </p>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="px-5 py-6 md:px-8 md:py-6 space-y-5 md:space-y-6 max-w-5xl md:max-w-6xl mx-auto md:mx-0">
                {/* Current Settings Overview */}
                <div className="group relative overflow-hidden rounded-[2rem] md:rounded-xl bg-[#F2F0EB] dark:bg-[#1E1C1A] md:bg-card/30 border border-border/10 md:border-border/40 p-6 md:p-6 shadow-sm">
                    {/* Subtle gradient accent for desktop */}
                    <div className="hidden md:block absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />

                    <div className="flex items-center gap-2 mb-6 md:mb-5">
                        <Sparkles className="h-4 w-4 md:h-3.5 md:w-3.5 text-primary" />
                        <span className="text-[11px] md:text-[12px] font-bold md:font-semibold text-foreground uppercase tracking-widest opacity-70">Current Appearance</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-6">
                        <div className="text-left">
                            <div className="text-[15px] font-bold md:font-semibold text-primary tracking-tight">
                                {settings.ui_scale === 'sm' ? 'Compact' : 'Comfort'}
                            </div>
                            <div className="text-[10px] md:text-[11px] text-muted-foreground/60 mt-1 uppercase tracking-widest font-bold">Interface</div>
                        </div>
                        <div className="text-left">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-4 h-4 rounded-full border border-white dark:border-border/20 shadow-sm"
                                    style={{ backgroundColor: ACCENT_COLOR_VALUES[settings.accent_color] || ACCENT_COLOR_VALUES['default'] }}
                                />
                                <span className="text-[15px] font-bold md:font-semibold text-foreground tracking-tight capitalize">
                                    {settings.accent_color || 'Default'}
                                </span>
                            </div>
                            <div className="text-[10px] md:text-[11px] text-muted-foreground/60 mt-1 uppercase tracking-widest font-bold">Accent</div>
                        </div>
                        <div className="text-left">
                            <div className="text-[15px] font-bold md:font-semibold text-foreground tracking-tight">
                                {settings.dark_mode ? 'Dark' : 'Light'}
                            </div>
                            <div className="text-[10px] md:text-[11px] text-muted-foreground/60 mt-1 uppercase tracking-widest font-bold">Theme</div>
                        </div>
                        <div className="text-left">
                            <div className="text-[13px] md:text-[13px] font-mono text-foreground font-bold md:font-medium">
                                {settings.date_format === 'd MMM yyyy' ? '12 Jan 2025' :
                                    settings.date_format === 'yyyy-MM-dd' ? '2025-01-12' :
                                        settings.date_format === 'MM/dd/yyyy' ? '01/12/2025' :
                                            settings.date_format === 'd.M.yyyy' ? '12.1.2025' : '12 Jan 2025'}
                            </div>
                            <div className="text-[10px] md:text-[11px] text-muted-foreground/60 mt-1 uppercase tracking-widest font-bold">Date</div>
                        </div>
                    </div>
                </div>

                {/* Settings Grid */}
                <div className="grid grid-cols-2 md:grid-cols-2 gap-4 md:gap-6">
                    {/* Interface Size - Mobile Binary card / Desktop Section */}
                    <div className="md:contents">
                        <div className="md:hidden group relative overflow-hidden rounded-2xl border border-border/10 bg-card p-4 shadow-sm active:scale-95 transition-all"
                            onClick={async () => {
                                try {
                                    await updateSettings({ ui_scale: settings.ui_scale === 'sm' ? 'md' : 'sm' });
                                } catch (error: any) {
                                    toast({ title: 'Failed to update', variant: 'destructive' });
                                }
                            }}
                        >
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <Monitor className="h-5 w-5" />
                                </div>
                                <div className="text-center">
                                    <div className="text-[12px] font-bold text-foreground">
                                        {settings.ui_scale === 'sm' ? 'Compact' : 'Comfort'}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground/60 uppercase tracking-tight font-bold">Size</div>
                                </div>
                            </div>
                            {/* State indicator dot */}
                            <div className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary" />
                        </div>

                        <div className="hidden md:block">
                            <Section icon={Monitor} title="Interface Size" description="Control text size and element spacing">
                                <div className="grid grid-cols-2 gap-3">
                                    {(['sm', 'md'] as const).map(s => (
                                        <button
                                            key={s}
                                            onClick={async () => {
                                                try {
                                                    await updateSettings({ ui_scale: s });
                                                } catch (error: any) {
                                                    toast({
                                                        title: 'Failed to update',
                                                        description: error?.message || 'Please try again.',
                                                        variant: 'destructive'
                                                    });
                                                }
                                            }}
                                            className={cn(
                                                "flex flex-col items-center justify-center gap-1.5 p-4 rounded-lg border transition-all relative overflow-hidden",
                                                settings.ui_scale === s
                                                    ? "border-primary/50 bg-primary/5 text-primary"
                                                    : "border-border/30 hover:border-border/60 hover:bg-muted/30"
                                            )}
                                        >
                                            <Monitor className={cn("h-4 w-4", settings.ui_scale === s ? "text-primary" : "text-muted-foreground/60")} />
                                            <span className="text-[13px] font-medium tracking-tight">{s === 'sm' ? 'Compact' : 'Comfort'}</span>
                                            <span className="text-[11px] text-muted-foreground/70">{s === 'sm' ? 'Smaller UI' : 'Standard UI'}</span>
                                            {settings.ui_scale === s && (
                                                <div className="absolute top-1 right-1">
                                                    <Check className="h-3 w-3 text-primary" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </Section>
                        </div>
                    </div>

                    {/* Display Mode - Mobile Binary card / Desktop Section */}
                    <div className="md:contents">
                        <div className="md:hidden group relative overflow-hidden rounded-2xl border border-border/10 bg-card p-4 shadow-sm active:scale-95 transition-all outline-none"
                            onClick={() => onToggleDarkMode(!settings.dark_mode)}
                        >
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    {settings.dark_mode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                                </div>
                                <div className="text-center">
                                    <div className="text-[12px] font-bold text-foreground capitalize">
                                        {settings.dark_mode ? 'Dark' : 'Light'}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground/60 uppercase tracking-tight font-bold">Theme</div>
                                </div>
                            </div>
                            {/* State indicator dot */}
                            <div className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary" />
                        </div>

                        <div className="hidden md:block">
                            <Section icon={Moon} title="Display Mode" description="Choose your preferred viewing experience">
                                <SettingRow
                                    icon={settings.dark_mode ? Moon : Sun}
                                    title="Dark Mode"
                                    description="Use a darker interface for low light"
                                >
                                    <Switch
                                        checked={!!settings.dark_mode}
                                        onCheckedChange={onToggleDarkMode}
                                    />
                                </SettingRow>
                            </Section>
                        </div>
                    </div>

                    {/* Accent Color - Full Width */}
                    <Section icon={Palette} title="Accent Color" className="col-span-2 md:col-span-2">
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-3 md:gap-2.5">
                                {ACCENT_COLORS.map((c) => (
                                    <TooltipProvider key={c} delayDuration={300}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={() => applyColor(c)}
                                                    className={cn(
                                                        "relative h-10 w-10 md:h-8 md:w-8 rounded-xl md:rounded-lg border-2 transition-all active:scale-95 md:hover:scale-110",
                                                        settings.accent_color === c
                                                            ? "border-primary md:border-foreground ring-4 md:ring-2 ring-primary/20 shadow-md md:shadow-sm scale-105"
                                                            : "border-transparent hover:border-muted-foreground/30"
                                                    )}
                                                >
                                                    <div
                                                        className="w-full h-full rounded-[8px] md:rounded-[4px]"
                                                        style={{ backgroundColor: ACCENT_COLOR_VALUES[c] }}
                                                    />
                                                    {settings.accent_color === c && (
                                                        <Check className="absolute inset-0 w-4 h-4 md:w-3 md:h-3 m-auto text-white drop-shadow-md" />
                                                    )}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="hidden md:block text-[10px] px-2 py-1 uppercase tracking-wider font-medium bg-popover border-border/40 shadow-md">{c}</TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground/50 font-medium">
                                Effects buttons, highlights, and secondary UI elements.
                            </p>
                        </div>
                    </Section>

                    {/* Date Format */}
                    <Section icon={Calendar} title="Date Format" className="col-span-2 md:col-span-2">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Select value={settings.date_format} onValueChange={async (v) => {
                                try {
                                    await updateSettings({ date_format: v });
                                } catch (error: any) {
                                    toast({
                                        title: 'Failed to update',
                                        description: error?.message || 'Please try again.',
                                        variant: 'destructive'
                                    });
                                }
                            }}>
                                <SelectTrigger className="h-9 text-[13px] bg-background/40 border-border/30">
                                    <SelectValue placeholder="Select format" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="d MMM yyyy" className="text-[13px]">
                                        <div className="flex items-center justify-between w-full gap-4">
                                            <span className="font-mono">12 Jan 2025</span>
                                            <Badge variant="outline" className="text-[10px] h-4 font-normal text-muted-foreground border-border/50">Default</Badge>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="yyyy-MM-dd" className="text-[13px]">
                                        <div className="flex items-center justify-between w-full gap-4">
                                            <span className="font-mono">2025-01-12</span>
                                            <Badge variant="outline" className="text-[10px] h-4 font-normal text-muted-foreground border-border/50">ISO</Badge>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="MM/dd/yyyy" className="text-[13px]">
                                        <div className="flex items-center justify-between w-full gap-4">
                                            <span className="font-mono">01/12/2025</span>
                                            <Badge variant="outline" className="text-[10px] h-4 font-normal text-muted-foreground border-border/50">US</Badge>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="d.M.yyyy" className="text-[13px]">
                                        <div className="flex items-center justify-between w-full gap-4">
                                            <span className="font-mono">12.1.2025</span>
                                            <Badge variant="outline" className="text-[10px] h-4 font-normal text-muted-foreground border-border/50">EU</Badge>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/20 border border-border/20">
                                <span className="text-[11px] text-muted-foreground uppercase tracking-tight font-medium">Preview</span>
                                <span className="font-mono text-[13px] text-foreground font-medium ml-auto">
                                    {settings.date_format === 'd MMM yyyy' ? '12 Jan 2025' :
                                        settings.date_format === 'yyyy-MM-dd' ? '2025-01-12' :
                                            settings.date_format === 'MM/dd/yyyy' ? '01/12/2025' :
                                                settings.date_format === 'd.M.yyyy' ? '12.1.2025' : '12 Jan 2025'}
                                </span>
                            </div>
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}

