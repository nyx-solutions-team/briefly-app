"use client";

import * as React from "react";
import { nanoid } from "nanoid";
import type { Editor } from "@tiptap/react";
import { Fragment } from "@tiptap/pm/model";
import type { DiffBlockState, DiffManagerState } from "./diff-types";

type DiffManagerContextValue = {
    activeDiffs: Map<string, DiffBlockState>;
    addDiff: (diff: Omit<DiffBlockState, "id" | "createdAt" | "status">) => string;
    acceptDiff: (diffId: string) => void;
    rejectDiff: (diffId: string) => void;
    clearAllDiffs: () => void;
    renderVersion: number;
    setEditor: (editor: Editor | null) => void;
};

const DiffManagerContext = React.createContext<DiffManagerContextValue | null>(null);

export function useDiffManager() {
    const context = React.useContext(DiffManagerContext);
    if (!context) {
        throw new Error("useDiffManager must be used within DiffManagerProvider");
    }
    return context;
}

type DiffManagerProviderProps = {
    editor: Editor | null;
    children: React.ReactNode;
};

export function DiffManagerProvider({ editor, children }: DiffManagerProviderProps) {
    const [state, setState] = React.useState<DiffManagerState>({
        activeDiffs: new Map(),
        renderVersion: 0,
    });
    const [editorInstance, setEditorInstance] = React.useState<Editor | null>(editor);

    React.useEffect(() => {
        if (editor) setEditorInstance(editor);
    }, [editor]);

    const addDiff = React.useCallback(
        (diff: Omit<DiffBlockState, "id" | "createdAt" | "status">) => {
            const id = nanoid();
            const newDiff: DiffBlockState = {
                ...diff,
                id,
                status: "pending",
                createdAt: Date.now(),
            };

            setState((prev) => ({
                activeDiffs: new Map(prev.activeDiffs).set(id, newDiff),
                renderVersion: prev.renderVersion + 1,
            }));

            return id;
        },
        []
    );

    const acceptDiff = React.useCallback(
        (diffId: string) => {
            if (!editorInstance) {
                console.warn("[Diff] No editor for acceptDiff");
                return;
            }

            // Read current state to find the diff
            const diff = state.activeDiffs.get(diffId);
            if (!diff) {
                console.warn("[Diff] Diff not found:", diffId);
                return;
            }

            let applied = false;

            try {
                // Step 1: Replace normalized range content in editor
                const tr = editorInstance.state.tr;
                const docSize = editorInstance.state.doc.content.size;
                const from = Math.max(0, Math.min(docSize, diff.normalizedFrom));
                const to = Math.max(from, Math.min(docSize, diff.normalizedTo));

                if (to <= from) {
                    console.warn("[Diff] Invalid normalized range", { from, to, diffId });
                    return;
                }

                const replacementNodes = (() => {
                    if (
                        diff.suggestedContent
                        && diff.suggestedContent.type === "doc"
                        && Array.isArray(diff.suggestedContent.content)
                    ) {
                        return diff.suggestedContent.content.map((nodeJson) => editorInstance.state.schema.nodeFromJSON(nodeJson));
                    }
                    return [editorInstance.state.schema.nodeFromJSON(diff.suggestedContent)];
                })();

                tr.replaceWith(from, to, Fragment.fromArray(replacementNodes));
                editorInstance.view.dispatch(tr);
                applied = true;

                console.log("[Diff] Accepted diff:", diffId);
            } catch (error) {
                console.error("[Diff] Failed to apply diff content:", error);
            }

            if (!applied) return;

            // Step 2: Remove diff from state (separate from editor operation)
            setState((prev) => {
                const next = new Map(prev.activeDiffs);
                next.delete(diffId);
                return {
                    activeDiffs: next,
                    renderVersion: prev.renderVersion + 1,
                };
            });
        },
        [editorInstance, state.activeDiffs]
    );

    const rejectDiff = React.useCallback((diffId: string) => {
        setState((prev) => {
            const next = new Map(prev.activeDiffs);
            next.delete(diffId);
            return {
                activeDiffs: next,
                renderVersion: prev.renderVersion + 1,
            };
        });
    }, []);

    const clearAllDiffs = React.useCallback(() => {
        setState({
            activeDiffs: new Map(),
            renderVersion: 0,
        });
    }, []);

    const value = React.useMemo(
        () => ({
            activeDiffs: state.activeDiffs,
            addDiff,
            acceptDiff,
            rejectDiff,
            clearAllDiffs,
            renderVersion: state.renderVersion,
            setEditor: setEditorInstance
        }),
        [state.activeDiffs, state.renderVersion, addDiff, acceptDiff, rejectDiff, clearAllDiffs, setEditorInstance]
    );

    return <DiffManagerContext.Provider value={value}>{children}</DiffManagerContext.Provider>;
}
