/** Turn a table binding into Jinja while retaining filters and the row's item scope. */
export function getTableColumnTemplate(field: unknown, itemsPath: unknown): string {
  const raw = String(field ?? '').trim();
  if (!raw || raw.includes('{{') || raw.includes('{%')) return raw;

  const pipeIndex = raw.indexOf('|');
  const path = (pipeIndex < 0 ? raw : raw.slice(0, pipeIndex)).trim();
  const filters = pipeIndex < 0 ? '' : ` ${raw.slice(pipeIndex).trim()}`;
  const collection = String(itemsPath || 'items')
    .replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').split('|')[0].trim() || 'items';

  let expression: string;
  if (path === 'item' || path.startsWith('item.')) expression = path;
  else if (path.startsWith(`${collection}[].`)) expression = `item.${path.slice(collection.length + 3)}`;
  else if (path.startsWith(`${collection}.`)) expression = `item.${path.slice(collection.length + 1)}`;
  else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(path)) expression = `item.${path}`;
  else if (/^[A-Za-z_][A-Za-z0-9_.[\]]*$/.test(path)) expression = path;
  else return raw;

  return `{{ ${expression}${filters} }}`;
}
