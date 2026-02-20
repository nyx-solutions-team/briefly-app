import { Editor } from '@tiptap/react';

export interface LocalContextPayload {
    mode: 'local';
    content: string;
}

export interface SectionContextPayload {
    mode: 'section';
    content: string;
}

export async function buildLocalContext(editor: Editor): Promise<LocalContextPayload> {
    const { state } = editor;
    const { selection, doc } = state;
    const { $from } = selection;

    // 1. Current selection
    const selectedText = state.doc.textBetween(selection.from, selection.to, '\n');

    // 2. Previous block
    let prevBlockText = '';
    const prevBlockPos = $from.before(1); // Approximate previous block pos
    if (prevBlockPos > 0) {
        try {
            const resolvedPrev = doc.resolve(prevBlockPos - 1);
            const prevNode = resolvedPrev.parent;
            // Simple check to ensure we grab text content if it's a block
            if (prevNode && prevNode.isBlock) {
                prevBlockText = prevNode.textContent;
            }
        } catch (e) {
            // Ignore range errors at start of doc
        }
    }

    // 3. Next block
    let nextBlockText = '';
    // Attempt to find next block by jumping after current node
    const afterPos = $from.after(1);
    if (afterPos < doc.content.size) {
        try {
            const resolvedNext = doc.resolve(afterPos + 1);
            const nextNode = resolvedNext.parent;
            if (nextNode && nextNode.isBlock) {
                nextBlockText = nextNode.textContent;
            }
        } catch (e) {
            // Ignore range errors at end
        }
    }

    // Combine simple text
    const content = `Previous Context:\n${prevBlockText}\n\nSelected/Current:\n${selectedText || $from.parent.textContent}\n\nNext Context:\n${nextBlockText}`;

    return { mode: 'local', content };
}


export async function buildSectionContext(editor: Editor): Promise<SectionContextPayload> {
    const { state } = editor;
    const { doc, selection } = state;
    const { $from } = selection;

    // 1. Find nearest heading above
    let startPos = 0;
    let headingLevel = 0;

    // Scan backwards from cursor
    let foundStart = false;
    doc.nodesBetween(0, $from.pos, (node, pos) => {
        if (node.type.name === 'heading') {
            startPos = pos;
            headingLevel = node.attrs.level;
            foundStart = true;
        }
    });

    // 2. Find end (next heading of same/higher level)
    let endPos = doc.content.size;

    if (foundStart) {
        // Scan forwards from startPos + nodeSize
        // We can't easily use nodesBetween from a specific pos without a range, 
        // but we can iterate from startPos forward.
        // For simplicity in this minimal implementation, we'll extract everything from startPos
        // until we hit a heading <= headingLevel

        // Simpler approach: Just grab text from startPos to end of doc, 
        // then truncate at next heading in text? No, use nodes behavior.

        let stop = false;
        doc.nodesBetween(startPos + 1, doc.content.size, (node, pos) => {
            if (stop) return false;
            if (node.type.name === 'heading' && node.attrs.level <= headingLevel) {
                endPos = pos;
                stop = true;
                return false;
            }
        });
    }

    // 3. Extract text
    const content = doc.textBetween(startPos, endPos, '\n');

    return { mode: 'section', content };
}

