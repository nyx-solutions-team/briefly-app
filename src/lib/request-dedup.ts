"use client";

/**
 * Request deduplication utility
 * Prevents multiple simultaneous requests to the same endpoint
 */

const pendingRequests = new Map<string, Promise<any>>();

/**
 * Wraps an async function to deduplicate simultaneous calls with the same key
 * If a request with the same key is already in-flight, returns the existing promise
 */
export async function dedupRequest<T>(
    key: string,
    requestFn: () => Promise<T>
): Promise<T> {
    // If there's already a pending request for this key, return it
    const existing = pendingRequests.get(key);
    if (existing) {
        return existing as Promise<T>;
    }

    // Create new request and store it
    const request = requestFn().finally(() => {
        // Clean up after request completes
        pendingRequests.delete(key);
    });

    pendingRequests.set(key, request);
    return request;
}

/**
 * Clears all pending requests (useful for logout/cleanup)
 */
export function clearPendingRequests(): void {
    pendingRequests.clear();
}

/**
 * Check if a request is currently pending
 */
export function isRequestPending(key: string): boolean {
    return pendingRequests.has(key);
}
