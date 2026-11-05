export type ShareKind = 'document' | 'folder';
export type PublicShareReference = {
  id?: string;
  token?: string | null;
  public_url?: string | null;
  publicUrl?: string | null;
  share_url?: string | null;
  shareUrl?: string | null;
  url?: string | null;
};
export type ShareScope = { userId: string; orgId: string; kind: ShareKind };
const rememberedUrls = new Map<string, string>();

function publicOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
      || host === '::1' || host === '::' || /^(?:fc|fd)[0-9a-f]*:|^fe80:/i.test(host)) return null;
    const octets = host.split('.').map(Number);
    if (octets.length === 4 && octets.every(Number.isFinite)) {
      const [a, b] = octets;
      if (a === 0 || a === 127 || a === 10 || (a === 192 && b === 168)
        || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)
        || (a === 100 && b >= 64 && b <= 127)) return null;
    }
    return url.origin;
  } catch { return null; }
}

export function getPublicShareOrigin(currentOrigin: string, configuredUrl = process.env.NEXT_PUBLIC_APP_URL || ''): string | null {
  // A configured deployment is authoritative, including when the app runs locally.
  return configuredUrl.trim() ? publicOrigin(configuredUrl.trim()) : publicOrigin(currentOrigin);
}

export function getPublicShareUrl(
  row: PublicShareReference,
  kind: ShareKind,
  origin: string,
  configuredUrl = process.env.NEXT_PUBLIC_APP_URL || '',
): string | null {
  const shareOrigin = getPublicShareOrigin(origin, configuredUrl);
  if (!shareOrigin) return null;
  const prefix = kind === 'folder' ? '/folder-share/' : '/share/';
  for (const candidate of [row.public_url, row.publicUrl, row.share_url, row.shareUrl, row.url]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate, shareOrigin);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      if (url.pathname.startsWith(prefix) && url.pathname.slice(prefix.length) && !url.pathname.slice(prefix.length).includes('/')) {
        // Repair cached/API URLs from localhost while retaining the exact token and query.
        return new URL(`${url.pathname}${url.search}${url.hash}`, shareOrigin).href;
      }
    } catch { /* Try the next representation. */ }
  }
  const token = typeof row.token === 'string' ? row.token.trim() : '';
  if (!token || ['undefined', 'null'].includes(token)) return null;
  return new URL(`${prefix}${encodeURIComponent(token)}`, shareOrigin).href;
}

function cacheKey(scope: ShareScope, id: string) {
  return `briefly:public-share:${JSON.stringify([scope.userId, scope.orgId, scope.kind, id])}`;
}

export function rememberPublicShare(scope: ShareScope, id: string | undefined, url: string) {
  if (!id || !scope.userId || !scope.orgId) return;
  const key = cacheKey(scope, id);
  rememberedUrls.set(key, url);
  try { sessionStorage.setItem(key, url); } catch { /* Keep the in-memory fallback. */ }
}

export function readPublicShare(scope: ShareScope, id: string | undefined): string | null {
  if (!id || !scope.userId || !scope.orgId) return null;
  const key = cacheKey(scope, id);
  try { return sessionStorage.getItem(key) || rememberedUrls.get(key) || null; }
  catch { return rememberedUrls.get(key) || null; }
}

export function forgetPublicShare(scope: ShareScope, id: string) {
  const key = cacheKey(scope, id);
  rememberedUrls.delete(key);
  try { sessionStorage.removeItem(key); } catch { }
}
