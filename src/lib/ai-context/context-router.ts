import { Editor } from '@tiptap/react';
import { classifyIntent } from './intent-classifier';
import { buildLocalContext, buildSectionContext } from './context-builder';
import {
    getCachedOverview,
    setCachedOverview,
    generateOverview
} from './document-overview-cache';

export interface FinalPayload {
    mode: 'local' | 'section';
    content: string;
    docOverview?: string[];
}

export async function routeAndBuildPayload(
    prompt: string,
    editor: Editor,
    docId: string,
    versionId: number
): Promise<FinalPayload> {
    const { state } = editor;
    const { selection } = state;
    const hasSelection = selection.from !== selection.to;

    // 1. Initial Classification
    let { mode, needsOverview } = classifyIntent(prompt, hasSelection);

    // 2. Fallback / Override Logic for Implicit Context
    if (!hasSelection) {
        // A) Global / Doc-wide Questions -> Force Section + Overview
        const isGlobalDocQuestion = /\b(summarize|summary|purpose|vision|review|main idea|tone|consistency)\b|what is this about/i.test(prompt);

        // B) Strict Local Edits -> Maintain Local Mode (check against strict list)
        // Note: classifyIntent defaults to 'local' when !hasSelection. 
        // We verify if it's truly a local fix or just a generic query.
        const isStrictLocalEdit = /\b(fix|typo|grammar|spelling|rewrite|rephrase)\b/i.test(prompt);

        if (isGlobalDocQuestion) {
            mode = 'section';
            needsOverview = true;
        } else if (mode === 'local' && !isStrictLocalEdit) {
            // General query without selection (e.g., "Draft an intro", "What do you think?")
            // Treat as Section mode for context, with opportunistic overview.
            mode = 'section';
            needsOverview = false;
        }
    }

    console.log(`[ContextRouter] Final Mode: ${mode}, Needs Overview: ${needsOverview}`);

    // 3. Handle Local Mode
    if (mode === 'local') {
        const payload = await buildLocalContext(editor);
        return {
            mode: 'local',
            content: payload.content
        };
    }

    // 4. Handle Section Mode
    const payload = await buildSectionContext(editor);
    let docOverview: string[] = [];

    // Check Cache First (Opportunistic usage)
    const cached = getCachedOverview(docId, versionId);
    console.log(`[ContextRouter] Overview Cache Hit: ${Boolean(cached)}`);

    if (cached) {
        docOverview = cached;
    } else if (needsOverview) {
        // Only generate (block) if strictly required and not in cache
        console.log("[ContextRouter] Generating required overview...");
        try {
            docOverview = await generateOverview(editor);
            if (docOverview && docOverview.length > 0) {
                setCachedOverview(docId, versionId, docOverview);
            }
        } catch (e) {
            console.warn("Failed to generate overview, proceeding without it.", e);
        }
    }

    // Return final payload
    return {
        mode: 'section',
        content: payload.content,
        docOverview: docOverview.length > 0 ? docOverview : undefined
    };
}

