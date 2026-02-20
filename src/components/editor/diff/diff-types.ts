import type { JSONContent } from "@tiptap/core";

export type DiffSegmentType = "equal" | "insert" | "delete";

export type DiffSegment = {
    type: DiffSegmentType;
    text: string;
};

export type DiffBlockStatus = "pending" | "accepted" | "rejected";

export type DiffPreviewKind = "block" | "range_replace";

export type DiffSelectionRange = {
    // User's raw selection (can be partial text inside a block).
    rawFrom: number;
    rawTo: number;
    // Expanded boundaries used for safe block/range replacement.
    normalizedFrom: number;
    normalizedTo: number;
};

export type DiffBlockState = DiffSelectionRange & {
    id: string;
    previewKind: DiffPreviewKind;
    originalContent: JSONContent;
    suggestedContent: JSONContent;
    diff: DiffSegment[];
    status: DiffBlockStatus;
    createdAt: number;
};

export type DiffManagerState = {
    activeDiffs: Map<string, DiffBlockState>;
    renderVersion: number;
};

