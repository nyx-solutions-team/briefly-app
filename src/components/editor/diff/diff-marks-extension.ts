import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { DiffBlockState } from "./diff-types";

export const diffMarksPluginKey = new PluginKey("diffMarks");

function inlineText(node: any): string {
    if (!node) return "";
    if (typeof node.text === "string") return node.text;
    if (node.type === "hardBreak") return "\n";
    if (!Array.isArray(node.content)) return "";
    return node.content.map((child: any) => inlineText(child)).join("");
}

function renderStructuredPreviewText(content: any): string {
    const lines: string[] = [];

    const addLine = (value: string) => {
        const text = String(value || "").replace(/\s+$/g, "");
        lines.push(text);
    };

    const renderListItem = (item: any, marker: string, indent = "") => {
        const children = Array.isArray(item?.content) ? item.content : [];
        const textParts: string[] = [];

        for (const child of children) {
            if (child?.type === "bulletList" || child?.type === "orderedList" || child?.type === "taskList") {
                continue;
            }
            const text = inlineText(child).replace(/\n+/g, " ").trim();
            if (text) textParts.push(text);
        }

        addLine(`${indent}${marker} ${textParts.join(" ")}`.trimEnd());

        for (const child of children) {
            if (child?.type === "bulletList" || child?.type === "orderedList" || child?.type === "taskList") {
                walk(child, `${indent}  `);
            }
        }
    };

    const walk = (node: any, indent = "") => {
        if (!node) return;
        const type = String(node.type || "");
        const children = Array.isArray(node.content) ? node.content : [];

        if (type === "doc") {
            for (const child of children) walk(child, indent);
            return;
        }

        if (type === "bulletList") {
            for (const item of children) renderListItem(item, "-", indent);
            return;
        }

        if (type === "orderedList") {
            const start = Number(node?.attrs?.start || 1);
            for (let i = 0; i < children.length; i += 1) {
                renderListItem(children[i], `${start + i}.`, indent);
            }
            return;
        }

        if (type === "taskList") {
            for (const item of children) {
                const checked = Boolean(item?.attrs?.checked);
                renderListItem(item, checked ? "- [x]" : "- [ ]", indent);
            }
            return;
        }

        if (type === "table") {
            for (const row of children) {
                if (String(row?.type || "") !== "tableRow") continue;
                const cells = Array.isArray(row?.content) ? row.content : [];
                const values = cells
                    .map((cell: any) => inlineText(cell).replace(/\n+/g, " ").trim())
                    .map((value: string) => value || "")
                    .join(" | ");
                addLine(`${indent}${values}`);
            }
            return;
        }

        if (type === "paragraph" || type === "heading" || type === "blockquote" || type === "codeBlock" || type === "callout") {
            const text = inlineText(node).trim();
            if (text) addLine(`${indent}${text}`);
            return;
        }

        if (children.length > 0) {
            for (const child of children) walk(child, indent);
            return;
        }

        const leafText = inlineText(node).trim();
        if (leafText) addLine(`${indent}${leafText}`);
    };

    walk(content);

    return lines
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export type DiffMarksOptions = {
    getActiveDiffs: () => Map<string, DiffBlockState>;
    onAccept: (diffId: string) => void;
    onReject: (diffId: string) => void;
};

export const DiffMarksExtension = Extension.create<DiffMarksOptions>({
    name: "diffMarks",

    addOptions() {
        return {
            getActiveDiffs: () => new Map(),
            onAccept: () => { },
            onReject: () => { },
        };
    },

    addProseMirrorPlugins() {
        const { getActiveDiffs, onAccept, onReject } = this.options;

        return [
            new Plugin({
                key: diffMarksPluginKey,

                state: {
                    init() {
                        return DecorationSet.empty;
                    },

                    apply(tr, oldSet, oldState, newState) {
                        // Get active diffs from external state
                        const activeDiffs = getActiveDiffs();

                        console.log(`[DiffExtension] apply() called, active diffs: ${activeDiffs.size}`);

                        if (activeDiffs.size === 0) {
                            return DecorationSet.empty;
                        }

                        const decorations: Decoration[] = [];

                        // Create decorations for each active diff
                        activeDiffs.forEach((diff) => {
                            try {
                                const docSize = newState.doc.content.size;
                                const rangeStart = Math.max(0, Math.min(docSize, diff.normalizedFrom));
                                const rangeEnd = Math.max(rangeStart, Math.min(docSize, diff.normalizedTo));
                                if (rangeEnd <= rangeStart) return;

                                console.log(`[DiffExtension] Processing diff ${diff.id} in range ${rangeStart}-${rangeEnd}`);

                                // Highlight original (to-be-replaced) content.
                                const contentStart = Math.max(rangeStart, Math.min(docSize, rangeStart + 1));
                                const contentEnd = Math.max(contentStart, Math.min(docSize, rangeEnd - 1));
                                if (contentEnd > contentStart) {
                                    decorations.push(
                                        Decoration.inline(contentStart, contentEnd, {
                                            class: "diff-block-delete",
                                        })
                                    );
                                }

                                const insertSegment = diff.diff.find(seg => seg.type === "insert");
                                const isRangeReplace = diff.previewKind === "range_replace";

                                if (isRangeReplace) {
                                    decorations.push(
                                        Decoration.widget(
                                            rangeEnd,
                                            () => {
                                                const truncateForPreview = (value: string, max = 1400) => {
                                                    const text = String(value || "");
                                                    if (text.length <= max) return text;
                                                    return `${text.slice(0, max)}\n\n[TRUNCATED]`;
                                                };

                                                const beforeText = truncateForPreview(renderStructuredPreviewText(diff.originalContent));
                                                const afterText = truncateForPreview(renderStructuredPreviewText(diff.suggestedContent));

                                                const container = document.createElement("div");
                                                container.className = "diff-block-insert";
                                                container.contentEditable = "false";
                                                container.style.cssText = `
                                                    border: 1px solid rgba(59, 130, 246, 0.25);
                                                    border-radius: 8px;
                                                    padding: 10px 12px;
                                                    margin: 8px 0;
                                                    background: rgba(59, 130, 246, 0.05);
                                                `;

                                                const title = document.createElement("div");
                                                title.style.cssText = "font-size: 11px; font-weight: 600; color: rgb(30 41 59); margin-bottom: 8px;";
                                                title.textContent = "Range Replace Preview";

                                                const beforeLabel = document.createElement("div");
                                                beforeLabel.style.cssText = "font-size: 10px; font-weight: 600; color: rgb(220 38 38); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.03em;";
                                                beforeLabel.textContent = "Before";

                                                const beforeBlock = document.createElement("pre");
                                                beforeBlock.style.cssText = "margin: 0 0 8px; padding: 8px; border-radius: 6px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.4;";
                                                beforeBlock.textContent = beforeText || "(empty)";

                                                const afterLabel = document.createElement("div");
                                                afterLabel.style.cssText = "font-size: 10px; font-weight: 600; color: rgb(22 163 74); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.03em;";
                                                afterLabel.textContent = "After";

                                                const afterBlock = document.createElement("pre");
                                                afterBlock.style.cssText = "margin: 0; padding: 8px; border-radius: 6px; background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.2); white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.4;";
                                                afterBlock.textContent = afterText || "(empty)";

                                                container.appendChild(title);
                                                container.appendChild(beforeLabel);
                                                container.appendChild(beforeBlock);
                                                container.appendChild(afterLabel);
                                                container.appendChild(afterBlock);
                                                return container;
                                            },
                                            { side: 1 }
                                        )
                                    );
                                } else if (insertSegment && insertSegment.text) {
                                    // Add widget showing the new text in green
                                    decorations.push(
                                        Decoration.widget(
                                            rangeEnd,
                                            () => {
                                                const container = document.createElement("div");
                                                container.className = "diff-block-insert";
                                                container.contentEditable = "false";
                                                container.style.cssText = `
                                                    background: linear-gradient(to right, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.25) 100%);
                                                    border: 1px solid rgba(34, 197, 94, 0.4);
                                                    border-radius: 4px;
                                                    padding: 12px 16px;
                                                    margin: 8px 0;
                                                    white-space: pre-wrap;
                                                    word-wrap: break-word;
                                                `;
                                                container.textContent = insertSegment.text;
                                                return container;
                                            },
                                            { side: 1 }
                                        )
                                    );
                                }

                                // Add action widget
                                decorations.push(
                                    Decoration.widget(
                                        rangeEnd,
                                        () => {
                                            const container = document.createElement("div");
                                            container.className = "diff-actions-container";
                                            container.contentEditable = "false";
                                            container.style.cssText = `
                                                display: flex;
                                                justify-content: flex-end;
                                                margin: 8px 0;
                                                user-select: none;
                                            `;

                                            // Create buttons
                                            const actionsWrapper = document.createElement("div");
                                            actionsWrapper.className =
                                                "inline-flex items-center gap-1 rounded-lg border border-border/40 bg-background/95 p-1 shadow-lg backdrop-blur-sm";
                                            actionsWrapper.style.cssText = "animation: fadeIn 0.2s ease;";

                                            // Primary apply/accept button
                                            const applyBtn = document.createElement("button");
                                            applyBtn.type = "button";
                                            applyBtn.className =
                                                "inline-flex h-7 items-center gap-1.5 rounded-md bg-green-50 px-2 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors";
                                            applyBtn.innerHTML = `
                                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                                </svg>
                                                <span>${isRangeReplace ? "Apply" : "Accept"}</span>
                                            `;
                                            applyBtn.onclick = (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                console.log(`[DiffExtension] ${isRangeReplace ? "Apply" : "Accept"} button clicked for diff:`, diff.id);
                                                onAccept(diff.id);
                                            };

                                            actionsWrapper.appendChild(applyBtn);

                                            const rejectBtn = document.createElement("button");
                                            rejectBtn.type = "button";
                                            rejectBtn.className =
                                                "inline-flex h-7 items-center gap-1.5 rounded-md bg-red-50 px-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors";
                                            rejectBtn.innerHTML = `
                                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                                <span>Reject</span>
                                            `;
                                            rejectBtn.onclick = (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                console.log("[DiffExtension] Reject button clicked for diff:", diff.id);
                                                onReject(diff.id);
                                            };
                                            actionsWrapper.appendChild(rejectBtn);

                                            container.appendChild(actionsWrapper);

                                            return container;
                                        },
                                        { side: 1 }
                                    )
                                );
                            } catch (error) {
                                console.error("Error creating diff decoration:", error);
                            }
                        });

                        return DecorationSet.create(newState.doc, decorations);
                    },
                },

                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                },
            }),
        ];
    },
});
