import { supabase } from '@/lib/supabase';
import { dedupRequest } from '@/lib/request-dedup';

export type ApiOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
  skipCache?: boolean;
};

// Flag to prevent infinite loops when checking permissions
let isCheckingPermissions = false;

// Helper function to check IP bypass permission more reliably
async function checkIpBypassPermission(): Promise<boolean> {
  // Prevent infinite loops
  if (isCheckingPermissions) {
    console.log('Already checking permissions, using localStorage fallback');
    const bootstrapData = JSON.parse(localStorage.getItem('bootstrapData') || '{}');
    return bootstrapData.permissions?.['security.ip_bypass'] === true;
  }

  try {
    isCheckingPermissions = true;

    // First try to get fresh bootstrap data from the auth context
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.access_token) return false;

    const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
    const res = await fetch(`${base}/me/bootstrap`, {
      headers: { Authorization: `Bearer ${sess.session.access_token}` }
    });

    if (res.ok) {
      const bootstrap = await res.json();
      return bootstrap.permissions?.['security.ip_bypass'] === true;
    }

    // Fallback to localStorage if API call fails
    const bootstrapData = JSON.parse(localStorage.getItem('bootstrapData') || '{}');
    return bootstrapData.permissions?.['security.ip_bypass'] === true;
  } catch (error) {
    console.error('Error checking IP bypass permission:', error);
    // Fallback to localStorage
    const bootstrapData = JSON.parse(localStorage.getItem('bootstrapData') || '{}');
    return bootstrapData.permissions?.['security.ip_bypass'] === true;
  } finally {
    isCheckingPermissions = false;
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';

let currentOrgId = process.env.NEXT_PUBLIC_ORG_ID || '';

type Cb = (ctx: { orgId: string }) => void;
const subscribers = new Set<Cb>();

// Simple cache for API responses
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
const CACHE_TTL = {
  short: 30 * 1000,    // 30 seconds
  medium: 5 * 60 * 1000, // 5 minutes
  long: 30 * 60 * 1000,  // 30 minutes
};

function getCacheKey(url: string, headers: Record<string, string> = {}): string {
  const orgId = headers['X-Org-Id'] || currentOrgId;
  return `${orgId}:${url}`;
}

function getCachedResponse<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data;
  }
  if (cached) {
    cache.delete(key); // Remove expired cache
  }
  return null;
}

function setCachedResponse(key: string, data: any, ttl: number = CACHE_TTL.medium): void {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

function clearCacheForOrg(orgId: string): void {
  for (const [key] of cache) {
    if (key.startsWith(`${orgId}:`)) {
      cache.delete(key);
    }
  }
}

export function setApiContext(ctx: { orgId?: string }) {
  if (typeof ctx.orgId === 'string') {
    // Clear cache when switching orgs
    if (currentOrgId && currentOrgId !== ctx.orgId) {
      clearCacheForOrg(currentOrgId);
    }
    currentOrgId = ctx.orgId;
  }
  const snapshot = { orgId: currentOrgId };
  subscribers.forEach(cb => {
    try { cb(snapshot); } catch { }
  });
}

export function getApiContext() {
  return { orgId: currentOrgId };
}

export function onApiContextChange(cb: Cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

// Core fetch implementation (used by apiFetch and dedupRequest)
async function performFetch<T = any>(
  path: string,
  opts: Omit<ApiOptions, 'skipCache'>,
  headers: Record<string, string>,
  method: string,
  cacheKey: string,
  skipCache: boolean
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  // Attach Supabase JWT automatically when available (client-side only)
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token && !headers['Authorization']) headers['Authorization'] = `Bearer ${token}`;
  } catch { }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined
        ? (headers['Content-Type'] === 'application/json' ? JSON.stringify(opts.body) : (opts.body as any))
        : undefined,
      signal: opts.signal,
    });
  } catch (e: any) {
    // Preserve cancellation semantics for callers. Many flows intentionally abort
    // in-flight requests on navigation or rapid re-fetch.
    if (e?.name === 'AbortError' || opts.signal?.aborted) {
      throw e;
    }
    const err = new Error(
      `API ${method} ${path} failed: could not reach server at ${BASE_URL}. ` +
      `Make sure briefly-api is running and reachable (try ${BASE_URL}/health).`
    );
    (err as any).cause = e;
    (err as any).isNetworkError = true;
    (err as any).url = url;
    throw err;
  }

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    let errorData: any = null;
    try {
      errorData = await res.json();
      msg = errorData.error || errorData.message || msg;
    } catch { }

    // Handle IP blocking specifically
    if (res.status === 403 && errorData?.code === 'IP_NOT_ALLOWED') {
      // Don't redirect if we're already on the IP blocked page or calling the IP check endpoint
      const isOnIpBlockedPage = typeof window !== 'undefined' && window.location.pathname === '/ip-blocked';
      const isIpCheckEndpoint = path.includes('/ip-check');

      if (!isOnIpBlockedPage && !isIpCheckEndpoint && typeof window !== 'undefined') {
        // Check if user has IP bypass permission before redirecting
        // Use a more reliable method to check permissions
        const hasIpBypass = await checkIpBypassPermission();

        if (!hasIpBypass) {
          window.location.href = '/ip-blocked';
          return undefined as T;
        } else {
          // User has bypass permission but still got IP blocked - this might be a backend issue
          console.warn('User has security.ip_bypass permission but still received IP_NOT_ALLOWED error');
        }
      }
    }

    const error = new Error(`API ${method} ${path} failed: ${msg}`);
    (error as any).status = res.status;
    (error as any).data = errorData;
    throw error;
  }

  const text = await res.text();
  if (!text) return undefined as unknown as T;

  let result: T;
  try {
    result = JSON.parse(text) as T;
  } catch {
    result = text as unknown as T;
  }

  // Cache successful GET responses
  if (method === 'GET' && res.ok && !skipCache) {
    // Determine TTL based on endpoint
    let ttl = CACHE_TTL.medium;
    if (path.includes('/documents')) {
      ttl = CACHE_TTL.short; // Documents change frequently
    } else if (path.includes('/me') || path.includes('/settings')) {
      ttl = CACHE_TTL.long; // User data changes less frequently
    } else if (path.includes('/orgs') || path.includes('/users')) {
      ttl = CACHE_TTL.medium;
    }

    setCachedResponse(cacheKey, result, ttl);
  }
  // Clear cache for related endpoints when modifying data
  else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && res.ok) {
    // Clear cache entries that might be affected by this modification
    const orgId = headers['X-Org-Id'] || currentOrgId;
    if (orgId) {
      // Clear cache for endpoints that might be affected by this change
      for (const [key] of cache) {
        const needsBust =
          key.startsWith(`${orgId}:`) && (
            key.includes('/departments/') ||
            key.includes('/users/') ||
            key.includes('/overrides') ||
            key.includes('/roles') ||
            key.includes('/recycle-bin') ||
            key.includes('/documents')
          );
        if (needsBust) {
          cache.delete(key);
        }
      }
    }
  }

  return result;
}

export async function apiFetch<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { skipCache = false, ...restOpts } = opts;
  const headers: Record<string, string> = {
    ...(restOpts.headers || {}),
  };
  // Only set JSON content type when a body is provided (avoids Fastify empty JSON body error)
  // Also remove Content-Type if no body is provided to prevent Fastify errors
  if (restOpts.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  } else if (restOpts.body === undefined && headers['Content-Type'] === 'application/json') {
    // Remove Content-Type header if no body is provided to avoid Fastify empty JSON body error
    delete headers['Content-Type'];
  }
  if (currentOrgId && !headers['X-Org-Id']) headers['X-Org-Id'] = currentOrgId;

  // Check cache for GET requests only
  const method = restOpts.method || 'GET';
  const cacheKey = getCacheKey(path, headers);

  if (method === 'GET' && !skipCache) {
    const cached = getCachedResponse<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Use request deduplication for GET requests to prevent duplicate in-flight requests
    // This ensures multiple components requesting the same data only trigger one network request
    return dedupRequest<T>(cacheKey, async () => {
      return performFetch<T>(path, restOpts, headers, method, cacheKey, skipCache);
    });
  }

  // For non-GET requests, just perform the fetch directly
  return performFetch<T>(path, restOpts, headers, method, cacheKey, skipCache);
}

// Function to explicitly clear cache for a specific endpoint
export function clearCacheForEndpoint(path: string): void {
  const orgId = currentOrgId;
  if (orgId) {
    const cacheKey = getCacheKey(path, { 'X-Org-Id': orgId });
    cache.delete(cacheKey);
  }
}

// SSE post utility for streaming chat responses with optional cancellation support
export async function ssePost(
  path: string,
  body: any,
  onEvent: (evt: { event: string; data: any }) => void,
  opts?: { signal?: AbortSignal }
) {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch { }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts?.signal });
  if (!res.ok || !res.body) throw new Error(`SSE request failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let seenEnd = false;

  // Support early cancellation via AbortSignal
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    try { reader.cancel(); } catch { }
  };
  if (opts?.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }
  const cleanup = () => {
    if (opts?.signal) opts.signal.removeEventListener('abort', onAbort);
  };

  try {
    while (true) {
      if (aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const lines = chunk.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) {
            if (data !== '') data += '\n';  // Add newline between data lines
            data += line.slice(5).trim();  // Trim to remove leading space
          }
          // For continuation lines that don't start with event: or data:, 
          // append to the current data with a newline
          else if (data !== '' && line.trim() !== '') {
            data += '\n' + line;
          }
        }
        try {
          onEvent({ event, data: JSON.parse(data) });
        } catch (parseError) {
          console.warn('Failed to parse SSE data:', data, parseError);
          // Don't pass unparsed data to avoid showing raw JSON in UI
        }
        if (event === 'end') { seenEnd = true; aborted = true; break; }
      }
      if (aborted) break;
    }
  } catch (err) {
    // Swallow network errors if we already saw 'end' or we aborted intentionally.
    if (!seenEnd && !aborted) throw err;
  } finally {
    cleanup();
  }
}
