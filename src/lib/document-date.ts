import { format, isValid, parse } from 'date-fns';

const acceptedFormats = [
  'yyyy-MM-dd', 'd.M.yyyy', 'd.M.yy', 'M/d/yyyy', 'MM/dd/yyyy',
  'd MMM yyyy', 'd MMMM yyyy', 'MMMM d, yyyy',
];

export const DOCUMENT_DATE_ERROR = 'Enter a real calendar date, for example 2026-02-28 (YYYY-MM-DD).';

/** Parse supported document dates strictly, without JavaScript's invalid-date rollover. */
export function normalizeDocumentDate(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  for (const pattern of acceptedFormats) {
    const date = parse(raw, pattern, new Date(2000, 0, 1));
    if (isValid(date)) return format(date, 'yyyy-MM-dd');
  }
  throw new Error(DOCUMENT_DATE_ERROR);
}

export function getDocumentDateError(value: string | null | undefined): string | null {
  try { normalizeDocumentDate(value); return null; }
  catch { return DOCUMENT_DATE_ERROR; }
}
