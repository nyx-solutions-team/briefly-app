import { Editor } from '@tiptap/react';

import { apiFetch, getApiContext } from '@/lib/api';

// Simple in-memory cache: docId:versionId -> bullets
const overviewCache = new Map<string, string[]>();

export function getCachedOverview(docId: string, versionId: number): string[] | null {
    const key = `${docId}:${versionId}`;
    return overviewCache.get(key) || null;
}

export function setCachedOverview(docId: string, versionId: number, bullets: string[]): void {
    const key = `${docId}:${versionId}`;
    overviewCache.set(key, bullets);
}

export async function generateOverview(editor: Editor): Promise<string[]> {
    const { doc } = editor.state;

    // 1. Extract Outline (H1-H3)
    let outlineText = "Document Outline:\n";
    doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
            const level = node.attrs.level;
            if (level <= 3) {
                const indent = "  ".repeat(level - 1);
                outlineText += `${indent}- ${node.textContent}\n`;
            }
        }
    });

    // 2. Extract First 5000 chars
    const introText = doc.textBetween(0, Math.min(doc.content.size, 5000), '\n');

    // 3. Construct Prompt
    const prompt = `
You are an AI assistant helping a user write a document.
Generate a concise, high-level summary of this document (6-8 bullet points).
Focus on: Product purpose, Target audience, Key topics, and Main goals.
Do not include specific minor details. Keep it strategic.

Document Outline:
${outlineText}

Document Content (First 5000 chars):
${introText}

Return ONLY a valid JSON array of strings, e.g. ["Bullet 1", "Bullet 2"].
`;

    // 4. Call AI via the actual chat endpoint
    const { orgId } = getApiContext();
    if (!orgId) {
        console.warn("No Org ID found for overview generation.");
        return [];
    }

    try {
        const response = await apiFetch<any>(`/orgs/${orgId}/editor/ai/chat`, {
            method: 'POST',
            body: {
                kind: 'plain',
                modelPrompt: prompt
            }
        });

        const text = response?.choices?.[0]?.message?.content || "";

        // Parse JSON array from text
        try {
            // cleans markdown code blocks if present
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const start = cleanText.indexOf('[');
            const end = cleanText.lastIndexOf(']');

            if (start !== -1 && end !== -1) {
                const jsonStr = cleanText.substring(start, end + 1);
                const bullets = JSON.parse(jsonStr);
                if (Array.isArray(bullets)) {
                    return bullets.map((b: any) => String(b));
                }
            }

            // If strictly asked for JSON but got bullet text, fallback to parsing lines
            if (text.includes('- ')) {
                return text.split('\n')
                    .map((l: string) => l.trim())
                    .filter((l: string) => l.startsWith('-') || l.startsWith('*') || /^\d+\./.test(l))
                    .map((l: string) => l.replace(/^[-*•\d\.]+\s*/, ''));
            }
        } catch (e) {
            console.warn("Failed to parse overview JSON", e);
        }

        return [];

    } catch (error) {
        console.error("Error generating overview:", error);
        return [];
    }
}

