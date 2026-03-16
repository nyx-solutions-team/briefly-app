
export interface IntentResult {
    mode: 'local' | 'section';
    needsOverview: boolean;
}

export function classifyIntent(prompt: string, hasSelection: boolean): IntentResult {
    // Simple regex detection

    // G2 (Expand) + G3 (Structure)
    const expandStructurePattern = /\b(add|detail|expand|elaborate|example|flesh out|write|generate|continue|transition|connect|logic|order|structure|organize)\b/i;

    // G1 (Refine/Fix)
    const refineFixPattern = /\b(improve|easier|clearer|simpler|better|flow|wordy|concise|shorten|fix|grammar|typo|spelling|rewrite|rephrase)\b/i;

    // 1. Refine/Fix -> local (Check this FIRST as it's more specific)
    if (refineFixPattern.test(prompt)) {
        return { mode: 'local', needsOverview: false };
    }

    // 2. Expand/Structure -> section + needsOverview
    if (expandStructurePattern.test(prompt)) {
        return { mode: 'section', needsOverview: true };
    }

    // 3. Default behavior
    if (!hasSelection) {
        return { mode: 'local', needsOverview: false };
    }

    // Has selection but no specific strong/weak signal -> Default to Section (context matters)
    return { mode: 'section', needsOverview: false };
}

