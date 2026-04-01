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
const bootstrapCache = new Map<string, { data: any; timestamp: number }>();
const BOOTSTRAP_CACHE_TTL = 5_000;
let authFailureHandler: null | (() => void | Promise<void>) = null;
let authFailureHandled = false;

type BootstrapFetchOptions = {
  accessToken?: string;
  orgId?: string;
  force?: boolean;
};

export function clearBootstrapCache() {
  bootstrapCache.clear();
}

export function clearApiCache() {
  cache.clear();
}

export function setAuthFailureHandler(handler: null | (() => void | Promise<void>)) {
  authFailureHandler = handler;
}

export function resetAuthFailureState() {
  authFailureHandled = false;
}

async function handleAuthFailure() {
  clearBootstrapCache();
  if (authFailureHandled) return;
  authFailureHandled = true;

  try {
    await authFailureHandler?.();
  } catch (error) {
    console.warn('Auth failure handler failed:', error);
  }
}

async function hasActiveSupabaseSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('Supabase session lookup failed while resolving 401:', error);
      return false;
    }
    return !!data.session?.access_token;
  } catch (error) {
    console.warn('Unable to verify Supabase session while resolving 401:', error);
    return false;
  }
}

async function handleAuthFailureIfSessionMissing() {
  if (await hasActiveSupabaseSession()) {
    return;
  }
  await handleAuthFailure();
}

async function getSupabaseAccessToken(opts: { forceRefresh?: boolean } = {}): Promise<string | null> {
  const { forceRefresh = false } = opts;

  try {
    if (forceRefresh) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('Supabase session refresh failed:', error);
        return null;
      }
      return data.session?.access_token || null;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('Supabase session lookup failed:', error);
      return null;
    }

    const token = data.session?.access_token || null;
    const expiresAtMs = data.session?.expires_at ? Number(data.session.expires_at) * 1000 : null;
    const shouldRefreshSoon = Boolean(token && expiresAtMs && expiresAtMs <= Date.now() + 30_000);

    if (shouldRefreshSoon) {
      const refreshedToken = await getSupabaseAccessToken({ forceRefresh: true });
      return refreshedToken || token;
    }

    if (token) {
      resetAuthFailureState();
    }
    return token;
  } catch (error) {
    console.warn('Unable to resolve Supabase access token:', error);
    return null;
  }
}

export async function fetchBootstrapData<T = any>({
  accessToken,
  orgId,
  force = false,
}: BootstrapFetchOptions = {}): Promise<T> {
  let token: string | null = accessToken || null;

  if (!token) {
    token = await getSupabaseAccessToken();
  }

  if (!token) {
    throw new Error('Missing access token for bootstrap request');
  }

  const cacheKey = `bootstrap:${orgId || ''}:${token}`;

  if (!force) {
    const cached = bootstrapCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < BOOTSTRAP_CACHE_TTL) {
      return cached.data as T;
    }
    if (cached) {
      bootstrapCache.delete(cacheKey);
    }
  }

  return dedupRequest<T>(cacheKey, async () => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    if (orgId) {
      headers['X-Org-Id'] = orgId;
    }

    const res = await fetch(`${BASE_URL}/me/bootstrap`, { headers });
    if (!res.ok) {
      if (res.status === 401) {
        await handleAuthFailureIfSessionMissing();
      }
      let msg = `${res.status} ${res.statusText}`;
      try {
        const errorData = await res.json();
        msg = errorData.error || errorData.message || msg;
      } catch { }
      throw new Error(`Bootstrap request failed: ${msg}`);
    }

    const data = await res.json() as T;
    bootstrapCache.set(cacheKey, { data, timestamp: Date.now() });
    resetAuthFailureState();
    return data;
  });
}

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
    const bootstrap = await fetchBootstrapData();
    return bootstrap.permissions?.['security.ip_bypass'] === true;
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
  let changed = false;
  if (typeof ctx.orgId === 'string') {
    // Clear cache when switching orgs
    if (currentOrgId && currentOrgId !== ctx.orgId) {
      clearCacheForOrg(currentOrgId);
    }
    if (currentOrgId !== ctx.orgId) {
      currentOrgId = ctx.orgId;
      changed = true;
    }
  }

  if (!changed) {
    return;
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

  const attachAuthHeader = async (forceRefresh = false) => {
    if (!forceRefresh && headers['Authorization']) {
      return headers['Authorization'];
    }
    const token = await getSupabaseAccessToken({ forceRefresh });
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      return headers['Authorization'];
    }
    if (forceRefresh) {
      delete headers['Authorization'];
    }
    return null;
  };

  const sendRequest = () => fetch(url, {
    method,
    headers,
    body: opts.body !== undefined
      ? (headers['Content-Type'] === 'application/json' ? JSON.stringify(opts.body) : (opts.body as any))
      : undefined,
    signal: opts.signal,
  });

  await attachAuthHeader(false);

  let res: Response;
  try {
    res = await sendRequest();
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

  if (res.status === 401 && !opts.signal?.aborted) {
    const refreshedAuthHeader = await attachAuthHeader(true);
    if (refreshedAuthHeader) {
      try {
        const retryRes = await sendRequest();
        if (retryRes.ok || retryRes.status !== 401) {
          res = retryRes;
        }
      } catch (e: any) {
        if (e?.name === 'AbortError' || opts.signal?.aborted) {
          throw e;
        }
      }
    }
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

    if (res.status === 401 && !opts.signal?.aborted) {
      await handleAuthFailureIfSessionMissing();
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

  resetAuthFailureState();

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
  const isFormDataBody =
    typeof FormData !== 'undefined' &&
    restOpts.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(restOpts.headers || {}),
  };
  // Only set JSON content type when a body is provided (avoids Fastify empty JSON body error)
  // Also remove Content-Type if no body is provided to prevent Fastify errors
  if (restOpts.body !== undefined && !headers['Content-Type'] && !isFormDataBody) {
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
  const url = /^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`;
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
