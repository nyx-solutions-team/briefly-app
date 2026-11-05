/** Repair escaped newlines in rendered text, without changing HTML attributes or CSS. */
export function normalizePreviewLineBreaks(html: string): string {
  if (!/\\[rn]/.test(html)) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    // Preserve literal escapes in code samples and non-document content.
    if (!node.parentElement?.closest('script, style, code, textarea') && /\\[rn]/.test(node.textContent || '')) {
      textNodes.push(node as Text);
    }
  }
  if (!textNodes.length) return html;

  for (const textNode of textNodes) {
    const lines = textNode.data.split(/\\r\\n|\\n|\\r/);
    const fragment = doc.createDocumentFragment();
    lines.forEach((line, index) => {
      if (index > 0) fragment.appendChild(doc.createElement('br'));
      fragment.appendChild(doc.createTextNode(line));
    });
    textNode.replaceWith(fragment);
  }

  return `${doc.doctype ? '<!DOCTYPE html>\n' : ''}${doc.documentElement.outerHTML}`;
}
