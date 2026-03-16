import fastDiff from "fast-diff";
import type { JSONContent } from "@tiptap/core";
import type { DiffSegment } from "./diff-types";

/**
 * Extract plain text from a TipTap JSONContent node
 */
export function extractPlainText(content: JSONContent): string {
    if (!content) return "";

    let text = "";

    // If node has text content
    if (content.text) {
        text += content.text;
    }

    // Recursively process child nodes
    if (content.content && Array.isArray(content.content)) {
        for (const child of content.content) {
            text += extractPlainText(child);
            // Add space between block-level elements
            if (child.type === "paragraph" || child.type === "heading") {
                text += "\n";
            }
        }
    }

    return text;
}

/**
 * Generate character-level diff between two text strings
 */
export function generateTextDiff(original: string, suggested: string): DiffSegment[] {
    const rawDiff = fastDiff(original, suggested);

    return rawDiff.map(([type, text]) => ({
        type: type === 1 ? "insert" : type === -1 ? "delete" : "equal",
        text,
    }));
}

/**
 * Generate diff for a block-level change
 */
/**
 * Generate diff for a block-level change
 * Currently configured for full block replacement logic (Antigravity style)
 */
export function generateBlockDiff(
    originalBlock: JSONContent,
    suggestedBlock: JSONContent
): DiffSegment[] {
    const originalText = extractPlainText(originalBlock);
    const suggestedText = extractPlainText(suggestedBlock);

    // If identical, return equal segment
    if (originalText === suggestedText) {
        return [{ type: "equal", text: originalText }];
    }

    // Return full block replacement: delete all original, insert all new
    // This creates the "Antigravity style" visual with full red/green blocks
    const segments: DiffSegment[] = [];

    if (originalText.length > 0) {
        segments.push({ type: "delete", text: originalText });
    }

    if (suggestedText.length > 0) {
        segments.push({ type: "insert", text: suggestedText });
    }

    return segments;
}

/**
 * Check if two JSONContent nodes are equivalent
 */
export function areNodesEqual(a: JSONContent, b: JSONContent): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Calculate the total character length of diff segments
 */
export function getDiffLength(segments: DiffSegment[]): number {
    return segments.reduce((sum, seg) => sum + seg.text.length, 0);
}

/**
 * Check if a diff has any actual changes
 */
export function hasChanges(segments: DiffSegment[]): boolean {
    return segments.some(seg => seg.type !== "equal");
}

