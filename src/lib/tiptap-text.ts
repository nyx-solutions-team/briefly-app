// Minimal plain-text extraction from TipTap JSONContent.
// Used for `contentText` when saving editor versions.

export function extractTextFromTiptap(node: any): string {
  const parts: string[] = [];

  function walk(n: any) {
    if (!n) return;
    if (typeof n === 'string') {
      parts.push(n);
      return;
    }
    const type = typeof n.type === "string" ? n.type : "";

    if (type === "hardBreak") {
      parts.push("\n");
      return;
    }

    // Render table rows with pipe separators so downstream prompts preserve structure.
    if (type === "tableRow") {
      const cells = Array.isArray(n.content) ? n.content : [];
      const row = cells
        .map((cell: any) => extractTextFromTiptap(cell).replace(/\n+/g, " ").trim())
        .join(" | ")
        .trim();
      if (row) parts.push(row);
      parts.push("\n");
      return;
    }

    if (typeof n.text === 'string') {
      parts.push(n.text);
    }
    const content = Array.isArray(n.content) ? n.content : null;
    if (content) {
      for (const child of content) walk(child);
      // add a newline between blocks to keep word boundaries sane
      if (type && ['paragraph', 'heading', 'blockquote', 'listItem', 'table'].includes(type)) {
        parts.push('\n');
      }
    }
  }

  walk(node);

  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
