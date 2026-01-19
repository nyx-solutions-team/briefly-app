"use client";

import * as React from "react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Folder,
    ChevronRight,
    Plus,
    Search,
    Loader2,
    X,
    Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FolderOption = {
    id: string;
    path: string[];
    label: string;
    name: string;
    hasChildren?: boolean;
};

export type FolderNode = {
    name: string;
    fullPath: string[];
    id?: string;
    departmentId?: string | null;
    departmentName?: string | null;
    title?: string | null;
};

interface FolderPickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folders: FolderOption[];
    currentPath: string[];
    onSelect: (path: string[]) => void;
    onCreateFolder?: (parentPath: string[], name: string) => Promise<void>;
    onLoadChildren?: (path: string[]) => Promise<FolderNode[]>;
    loading?: boolean;
    title?: string;
}

export function FolderPickerDialog({
    open,
    onOpenChange,
    folders,
    currentPath,
    onSelect,
    onCreateFolder,
    onLoadChildren,
    loading = false,
    title = "Select Folder",
}: FolderPickerDialogProps) {
    const [filter, setFilter] = useState("");
    const [viewingPath, setViewingPath] = useState<string[]>([]); // Current navigation level
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isCreating, setIsCreating] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [createLoading, setCreateLoading] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);

    // Dynamic folder cache - stores folders discovered by API calls
    const [dynamicFolders, setDynamicFolders] = useState<Map<string, FolderOption[]>>(new Map());
    const [loadedPaths, setLoadedPaths] = useState<Set<string>>(new Set());

    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setViewingPath([]);
            setFilter("");
            setSelectedIndex(0);
            setIsCreating(false);
            setNewFolderName("");
            setDynamicFolders(new Map());
            setLoadedPaths(new Set());
            // Focus search input
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    // Load children when viewingPath changes
    useEffect(() => {
        if (!open || !onLoadChildren) return;

        const pathKey = viewingPath.join("/") || "__root__";

        // Already loaded this path
        if (loadedPaths.has(pathKey)) return;

        let cancelled = false;

        const loadChildren = async () => {
            setIsNavigating(true);
            try {
                const children = await onLoadChildren(viewingPath);
                if (cancelled) return;

                // Convert to FolderOptions
                const childFolders: FolderOption[] = (children || []).map((child) => {
                    const childPath = child.fullPath && child.fullPath.length > 0
                        ? child.fullPath
                        : [...viewingPath, child.name].filter(Boolean);
                    return {
                        id: child.id || childPath.join("/"),
                        path: childPath,
                        label: `/${childPath.join("/")}`,
                        name: child.name,
                    };
                });

                setDynamicFolders((prev) => {
                    const next = new Map(prev);
                    next.set(pathKey, childFolders);
                    return next;
                });

                setLoadedPaths((prev) => new Set([...prev, pathKey]));
            } catch (error) {
                console.warn("Failed to load folder children:", error);
            } finally {
                if (!cancelled) {
                    setIsNavigating(false);
                }
            }
        };

        loadChildren();
        return () => { cancelled = true; };
    }, [open, viewingPath, onLoadChildren, loadedPaths]);

    // Build folder structure from both static folders and dynamic loaded folders
    const allFoldersMap = useMemo(() => {
        const map = new Map<string, FolderOption>();

        // Add static folders (from documentFolders)
        folders.forEach((folder) => {
            if (folder.path.length > 0) {
                const pathStr = folder.path.join("/");
                if (!map.has(pathStr)) {
                    map.set(pathStr, {
                        ...folder,
                        name: folder.path[folder.path.length - 1],
                    });
                }
            }
        });

        // Add dynamic folders from API calls
        dynamicFolders.forEach((children) => {
            children.forEach((folder) => {
                const pathStr = folder.path.join("/");
                if (!map.has(pathStr)) {
                    map.set(pathStr, folder);
                }
            });
        });

        return map;
    }, [folders, dynamicFolders]);

    // Get children of current viewing path
    const currentChildren = useMemo(() => {
        const viewingPathStr = viewingPath.join("/");
        const pathKey = viewingPathStr || "__root__";
        const children: FolderOption[] = [];
        const seen = new Set<string>();

        // First, add children from dynamic load (these are authoritative from API)
        const dynamicChildren = dynamicFolders.get(pathKey) || [];
        dynamicChildren.forEach((folder) => {
            const pathStr = folder.path.join("/");
            if (!seen.has(pathStr)) {
                seen.add(pathStr);

                // Check if this folder has known children
                const hasChildren = Array.from(allFoldersMap.values()).some(
                    (f) => f.path.length === folder.path.length + 1 &&
                        f.path.slice(0, folder.path.length).join("/") === pathStr
                ) || dynamicFolders.has(pathStr);

                children.push({ ...folder, hasChildren });
            }
        });

        // Also add children from static folders that might not be in dynamic list
        allFoldersMap.forEach((folder) => {
            if (folder.path.length === viewingPath.length + 1) {
                const parentPath = folder.path.slice(0, -1).join("/");
                if (parentPath === viewingPathStr || (viewingPath.length === 0 && folder.path.length === 1)) {
                    const pathStr = folder.path.join("/");
                    if (!seen.has(pathStr)) {
                        seen.add(pathStr);

                        const hasChildren = Array.from(allFoldersMap.values()).some(
                            (f) => f.path.length > folder.path.length &&
                                f.path.slice(0, folder.path.length).join("/") === pathStr
                        );

                        children.push({ ...folder, hasChildren });
                    }
                }
            }
        });

        // Sort alphabetically
        children.sort((a, b) => a.name.localeCompare(b.name));
        return children;
    }, [allFoldersMap, dynamicFolders, viewingPath]);

    // Filter folders based on search
    const visibleFolders = useMemo(() => {
        if (!filter.trim()) {
            return currentChildren;
        }
        const lowerFilter = filter.toLowerCase();
        return currentChildren.filter((folder) =>
            folder.name.toLowerCase().includes(lowerFilter)
        );
    }, [currentChildren, filter]);

    // Reset selection when visible folders change
    useEffect(() => {
        setSelectedIndex(0);
    }, [visibleFolders.length, viewingPath]);

    // Handle selecting current folder (Move Here)
    const handleConfirm = useCallback(() => {
        onSelect(viewingPath);
        onOpenChange(false);
    }, [viewingPath, onSelect, onOpenChange]);

    // Handle entering a folder
    const enterFolder = useCallback((folderPath: string[]) => {
        setFilter("");
        setViewingPath(folderPath);
        setSelectedIndex(0);
    }, []);

    // Navigate up via breadcrumb
    const navigateToPath = useCallback((targetPath: string[]) => {
        setFilter("");
        setViewingPath(targetPath);
        setSelectedIndex(0);
    }, []);

    // Keyboard navigation
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isCreating) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, visibleFolders.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === "Enter" && visibleFolders[selectedIndex]) {
                e.preventDefault();
                const folder = visibleFolders[selectedIndex];
                // Check if folder is the current location
                if (folder.path.join("/") !== currentPath.join("/")) {
                    enterFolder(folder.path);
                }
            } else if (e.key === "Backspace" && !filter && viewingPath.length > 0) {
                e.preventDefault();
                navigateToPath(viewingPath.slice(0, -1));
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, selectedIndex, visibleFolders, filter, viewingPath, currentPath, isCreating, enterFolder, navigateToPath]);

    // Scroll selected item into view
    useEffect(() => {
        const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
        selectedEl?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    // Handle create folder
    const handleCreateFolder = useCallback(async () => {
        if (!newFolderName.trim() || !onCreateFolder) return;
        setCreateLoading(true);
        try {
            await onCreateFolder(viewingPath, newFolderName.trim());
            setIsCreating(false);
            setNewFolderName("");

            // Clear loaded paths to force reload
            const pathKey = viewingPath.join("/") || "__root__";
            setLoadedPaths((prev) => {
                const next = new Set(prev);
                next.delete(pathKey);
                return next;
            });

            // Navigate into the new folder
            enterFolder([...viewingPath, newFolderName.trim()]);
        } catch (error) {
            console.error("Failed to create folder:", error);
        } finally {
            setCreateLoading(false);
        }
    }, [viewingPath, newFolderName, onCreateFolder, enterFolder]);

    // Generate breadcrumbs
    const breadcrumbs = useMemo(() => {
        const crumbs = [{ name: "Workspace", path: [] as string[] }];
        viewingPath.forEach((segment, index) => {
            crumbs.push({
                name: segment,
                path: viewingPath.slice(0, index + 1),
            });
        });
        return crumbs;
    }, [viewingPath]);

    // Check if current folder is same as file's current location
    const isCurrentLocation = viewingPath.join("/") === currentPath.join("/");

    // Show loading when initial load or navigating
    const showLoading = loading || (isNavigating && !loadedPaths.has(viewingPath.join("/") || "__root__"));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
                <DialogTitle className="sr-only">{title}</DialogTitle>
                {/* Header with Breadcrumbs */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 h-12">
                    <div className="flex items-center gap-1.5 text-sm overflow-x-auto flex-1 min-w-0">
                        {breadcrumbs.map((crumb, index) => (
                            <React.Fragment key={index}>
                                {index > 0 && (
                                    <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                )}
                                <button
                                    onClick={() => navigateToPath(crumb.path)}
                                    className={cn(
                                        "px-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors shrink-0 text-sm",
                                        index === breadcrumbs.length - 1
                                            ? "text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {crumb.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Search Bar */}
                <div className="flex items-center gap-2.5 px-4 py-2 border-b border-border/40">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                        ref={inputRef}
                        placeholder="Filter folders..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="border-0 h-7 p-0 bg-transparent focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
                    />
                    <div className="text-[11px] text-muted-foreground/60 border border-border/60 rounded px-1.5 py-0.5 shrink-0 hidden sm:block">
                        ↵ to select
                    </div>
                </div>

                {/* Folder List */}
                <div ref={listRef} className="h-[320px] overflow-y-auto">
                    {showLoading ? (
                        <div className="p-3 space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="h-9 bg-muted/40 rounded-md animate-pulse"
                                    style={{ animationDelay: `${i * 100}ms` }}
                                />
                            ))}
                        </div>
                    ) : visibleFolders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Folder className="h-10 w-10 mb-3 opacity-30" />
                            <span className="text-sm">
                                {filter ? `No folders match "${filter}"` : "No subfolders"}
                            </span>
                        </div>
                    ) : (
                        <ul className="p-1.5 space-y-0.5">
                            {visibleFolders.map((folder, index) => {
                                const isSelected = selectedIndex === index;
                                const isCurrent = folder.path.join("/") === currentPath.join("/");

                                return (
                                    <li
                                        key={folder.id}
                                        data-index={index}
                                        onClick={() => {
                                            if (!isCurrent) {
                                                enterFolder(folder.path);
                                            }
                                        }}
                                        onMouseEnter={() => setSelectedIndex(index)}
                                        className={cn(
                                            "flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer select-none transition-colors text-sm",
                                            isSelected && !isCurrent && "bg-muted/60",
                                            isCurrent && "opacity-40 cursor-not-allowed"
                                        )}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <Folder className="h-[18px] w-[18px] text-muted-foreground shrink-0" />
                                            <span className="truncate">{folder.name}</span>
                                        </div>
                                        {isCurrent ? (
                                            <Check className="h-4 w-4 text-muted-foreground shrink-0" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-muted/20">
                    <div>
                        {isCreating ? (
                            <div className="flex items-center gap-2">
                                <Input
                                    placeholder="Folder name..."
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.stopPropagation();
                                            handleCreateFolder();
                                        } else if (e.key === "Escape") {
                                            setIsCreating(false);
                                            setNewFolderName("");
                                        }
                                    }}
                                    className="h-8 w-40 text-sm"
                                    autoFocus
                                    disabled={createLoading}
                                />
                                <Button
                                    size="sm"
                                    onClick={handleCreateFolder}
                                    disabled={!newFolderName.trim() || createLoading}
                                    className="h-8"
                                >
                                    {createLoading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        "Create"
                                    )}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setIsCreating(false);
                                        setNewFolderName("");
                                    }}
                                    disabled={createLoading}
                                    className="h-8"
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : onCreateFolder ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 text-muted-foreground hover:text-foreground h-8"
                                onClick={() => setIsCreating(true)}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                New Folder
                            </Button>
                        ) : null}
                    </div>

                    {!isCreating && (
                        <Button
                            size="sm"
                            onClick={handleConfirm}
                            disabled={isCurrentLocation}
                            className="h-8"
                        >
                            {isCurrentLocation ? "Current Folder" : "Select Here"}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog >
    );
}
