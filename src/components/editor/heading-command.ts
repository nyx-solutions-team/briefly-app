import type { Editor } from "@tiptap/react";

function normalizeNewlines(value: string) {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function isFullSingleTextblockSelection(editor: Editor) {
  const sel = editor.state.selection;
  if (sel.empty) return true;

  const sameParent = sel.$from.sameParent(sel.$to);
  const parent = sel.$from.parent;
  if (!sameParent || !parent?.isTextblock) return false;

  const startsAtBlockStart = sel.$from.parentOffset === 0;
  const endsAtBlockEnd = sel.$to.parentOffset === parent.content.size;
  return startsAtBlockStart && endsAtBlockEnd;
}

export function applyHeadingLevel(editor: Editor, level: 1 | 2 | 3) {
  const sel = editor.state.selection;

  if (sel.empty || isFullSingleTextblockSelection(editor)) {
    return editor.chain().focus().toggleHeading({ level }).run();
  }

  const selectedText = normalizeNewlines(editor.state.doc.textBetween(sel.from, sel.to, "\n")).trim();
  if (!selectedText) {
    return editor.chain().focus().toggleHeading({ level }).run();
  }

  const lines = selectedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return editor.chain().focus().toggleHeading({ level }).run();
  }

  const headingNodes = lines.map((line) => ({
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text: line }],
  }));

  return editor
    .chain()
    .focus()
    .insertContentAt({ from: sel.from, to: sel.to }, headingNodes.length === 1 ? headingNodes[0] : headingNodes)
    .run();
}

