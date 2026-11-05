import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

interface ResourceState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
}

export interface Resource<T> extends ResourceState<T> {
  /** Re-run the loader — used by the realtime refresh banner and after a mutation. */
  reload: () => void;
}

const MAX_CACHE_ENTRIES = 50;
const cache = new Map<string, { data: any; timestamp: number }>();
const activeRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30_000; // 30 seconds

let sessionGeneration = 0;

/** Wipes the ENTIRE cache (all users). Used during logout/session expiry. */
export function clearApiCache() {
  sessionGeneration++;
  cache.clear();
  activeRequests.clear();
}

/**
 * Invalidates specific cache keys for the CURRENT user.
 * Pass the exact rawKey (e.g., 'api:complaints:list').
 * If prefix is true, invalidates all keys starting with rawKey.
 */
export function invalidateApiCache(userId: string | undefined, rawKey: string, prefix = false) {
  const scopedKey = `${userId || 'anonymous'}:${rawKey}`;
  for (const key of cache.keys()) {
    if (prefix ? key.startsWith(scopedKey) : key === scopedKey) {
      cache.delete(key);
    }
  }
}

function setCacheEntry(key: string, data: any) {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, { data, timestamp: Date.now() });
}

function getCacheEntry<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp >= CACHE_TTL) {
    cache.delete(key);
    return undefined;
  }
  // Refresh LRU position on access
  cache.delete(key);
  cache.set(key, entry);
  return entry.data as T;
}

/**
 * Load data from the API and track loading/error/data.
 * Deduplicates concurrent requests, caches data with LRU eviction, and provides stale-while-revalidate.
 *
 * `rawKey` is a stable string describing the request (usually the query string). 
 * If `rawKey` is null, false, or `options.enabled` is false, fetching is disabled.
 * It is automatically prefixed with the user's ID to prevent cross-session data leaks.
 */
export interface UseApiResourceOptions {
  enabled?: boolean;
}

export function useApiResource<T>(
  rawKey: string | null | false,
  load: () => Promise<T>,
  options?: UseApiResourceOptions,
): Resource<T> {
  const { user } = useAuth();
  const userId = user?.id || 'anonymous';
  const isEnabled = Boolean(rawKey) && (options?.enabled ?? true);
  const key = isEnabled && rawKey ? `${userId}:${rawKey}` : null;

  const loadRef = useRef(load);
  loadRef.current = load;

  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<ResourceState<T>>(() => {
    if (!key) {
      return { data: null, error: null, loading: false };
    }
    const cached = getCacheEntry<T>(key);
    if (cached !== undefined) {
      return { data: cached, error: null, loading: false };
    }
    return { data: null, error: null, loading: true };
  });

  const prevKeyRef = useRef(key);

  useEffect(() => {
    if (!key) {
      setState({ data: null, error: null, loading: false });
      prevKeyRef.current = null;
      return;
    }

    let active = true;
    const requestGen = sessionGeneration;
    const requestUserId = userId;
    const keyChanged = prevKeyRef.current !== key;
    prevKeyRef.current = key;

    const cachedData = getCacheEntry<T>(key);
    if (nonce === 0 && cachedData !== undefined) {
      setState({ data: cachedData, error: null, loading: false });
      return;
    }

    // Stale-while-revalidate: if key didn't change (e.g. reload), preserve previous data.
    // If key did change and is not in cache, clear data so old resource isn't shown under new key.
    setState((prev) => ({
      data: keyChanged ? (cachedData !== undefined ? cachedData : null) : prev.data,
      error: null,
      loading: true,
    }));

    let promise = activeRequests.get(key);
    if (!promise) {
      promise = loadRef.current().then(
        (data) => {
          // Discard if session ended or user changed while request was in-flight
          if (sessionGeneration === requestGen && activeRequests.has(key)) {
            setCacheEntry(key, data);
            activeRequests.delete(key);
          }
          return data;
        },
        (error) => {
          if (sessionGeneration === requestGen) {
            activeRequests.delete(key);
          }
          throw error;
        },
      );
      activeRequests.set(key, promise);
    }

    promise.then(
      (data) => {
        // Only set state if component is still mounted AND user session has not changed
        if (active && sessionGeneration === requestGen && userId === requestUserId) {
          setState({ data: data as T, error: null, loading: false });
        }
      },
      (error: unknown) => {
        if (active && sessionGeneration === requestGen && userId === requestUserId) {
          setState((prev) => ({ data: prev.data, error, loading: false }));
        }
      },
    );

    return () => {
      active = false;
    };
  }, [key, nonce, userId]);

  const reload = useCallback(() => {
    if (!key) return;
    cache.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  return useMemo(
    () => ({
      data: state.data,
      error: state.error,
      loading: state.loading,
      reload,
    }),
    [state.data, state.error, state.loading, reload],
  );
}
