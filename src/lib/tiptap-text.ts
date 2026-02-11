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
    if (typeof n.text === 'string') {
      parts.push(n.text);
    }
    const content = Array.isArray(n.content) ? n.content : null;
    if (content) {
      for (const child of content) walk(child);
      // add a newline between blocks to keep word boundaries sane
      if (n.type && ['paragraph', 'heading', 'blockquote', 'listItem', 'tableRow'].includes(String(n.type))) {
        parts.push('\n');
      }
    }
  }

  walk(node);

  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
