type ResolveValue = (path: string) => unknown;

function resolveArgument(expression: string, resolve: ResolveValue): unknown {
  const raw = expression.trim();
  const quoted = raw.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) return quoted[2];
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return resolve(raw);
}

/** Filters supported by the browser fallback; arguments can reference the current row. */
export function applyPreviewFilters(value: unknown, filters: string[], resolve: ResolveValue): string {
  let current = value;
  for (const filter of filters) {
    const fallback = filter.match(/^default\s*\(\s*([\s\S]*?)\s*\)$/);
    if (fallback) {
      if (current == null || current === '') current = resolveArgument(fallback[1], resolve);
      continue;
    }
    const money = filter.match(/^money\s*\(\s*([\s\S]*?)\s*\)$/);
    if (money) {
      if (current == null || current === '') continue;
      const amount = Number(current);
      if (!Number.isFinite(amount)) continue;
      const currency = String(resolveArgument(money[1], resolve) ?? '').trim().toUpperCase();
      const isInr = currency === 'INR' || currency === '₹';
      const formatted = new Intl.NumberFormat(isInr ? 'en-IN' : 'en-US', {
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(amount);
      current = isInr ? `₹${formatted}` : currency ? `${currency} ${formatted}` : formatted;
      continue;
    }
    if (filter === 'join("\\n")' || filter === "join('\\n')") {
      if (Array.isArray(current)) current = current.join('\n');
    }
  }
  if (current == null) return '';
  return Array.isArray(current) ? current.join(', ') : String(current);
}
