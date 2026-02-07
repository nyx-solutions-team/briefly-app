import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format as formatDateFns, parse as parseDateFns, isValid as isValidDateFns } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Compute a stable hash for a Blob/File or string. Uses Web Crypto when available.
export async function computeContentHash(input: Blob | string): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(await input.arrayBuffer());
  if (crypto && 'subtle' in crypto) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: simple incremental hash
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data[i];
    hash |= 0;
  }
  return `fallback-${Math.abs(hash)}`;
}

// Date formatting utilities
export const DATE_FORMAT_STORAGE_KEY = 'documind_date_format';

export function getAppDateFormat(): string {
  try {
    if (typeof window !== 'undefined' && (window as any).__APP_DATE_FORMAT) {
      return String((window as any).__APP_DATE_FORMAT);
    }
  } catch { }
  return 'd MMM yyyy';
}

export function formatAppDate(value: Date | string | number): string {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return formatDateFns(date, getAppDateFormat());
  } catch {
    return String(value);
  }
}

export function getAppDateTimeFormat(): string {
  const base = getAppDateFormat();
  const hasTimeTokens = /[Hhmsa]/.test(base);
  return hasTimeTokens ? base : `${base} hh:mm a`;
}

export function formatAppDateTime(value: Date | string | number): string {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);

    const now = new Date();
    const toYmd = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const todayYmd = toYmd(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const targetYmd = toYmd(date);

    const timePart = formatDateFns(date, 'hh:mm a');
    if (targetYmd === todayYmd) return `Today ${timePart}`;
    if (targetYmd === toYmd(yesterday)) return `Yesterday ${timePart}`;

    return formatDateFns(date, getAppDateTimeFormat());
  } catch {
    return String(value);
  }
}

export function parseFlexibleDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const fmts = [
    'd.M.yyyy',
    'd.M.yy',
    'M/d/yyyy',
    'MM/dd/yyyy',
    'd MMM yyyy',
    'd MMMM yyyy',
    'MMMM d, yyyy',
    'yyyy-MM-dd',
  ];
  for (const f of fmts) {
    try {
      const dt = parseDateFns(raw, f, new Date());
      if (isValidDateFns(dt)) return dt;
    } catch { }
  }
  const dt2 = new Date(raw);
  return isNaN(dt2.getTime()) ? null : dt2;
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

type OpsDateInput = string | number | Date | null | undefined;

export function formatOpsDate(value: OpsDateInput, opts: { withTime?: boolean } = {}): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const base = formatDateFns(date, "d MMM ''yy");
  if (!opts.withTime) return base;
  return `${base} · ${formatDateFns(date, 'h:mm a')}`;
}
