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
const MAX_KEY_VERSIONS = 100;
const cache = new Map<string, { data: any; timestamp: number }>();
const activeRequests = new Map<string, Promise<any>>();
const keyVersions = new Map<string, number>();

const STALE_TIME = 10_000; // 10 seconds: completely fresh, return immediately without revalidation
const CACHE_TTL = 30_000;  // 30 seconds: total cache retention, between 10s and 30s it returns stale data + background revalidates

let sessionGeneration = 0;

function getKeyVersion(key: string): number {
  return keyVersions.get(key) || 0;
}

function bumpKeyVersion(key: string) {
  const nextVer = (keyVersions.get(key) || 0) + 1;
  if (keyVersions.has(key)) {
    // Refresh LRU position
    keyVersions.delete(key);
  } else if (keyVersions.size >= MAX_KEY_VERSIONS) {
    // Evict oldest version entry, protecting keys that currently have active in-flight requests
    let evicted = false;
    for (const k of keyVersions.keys()) {
      if (!activeRequests.has(k)) {
        keyVersions.delete(k);
        evicted = true;
        break;
      }
    }
    // Fallback if all are in activeRequests
    if (!evicted) {
      const oldestKey = keyVersions.keys().next().value;
      if (oldestKey !== undefined) {
        keyVersions.delete(oldestKey);
      }
    }
  }
  keyVersions.set(key, nextVer);
}

/** Wipes the ENTIRE cache (all users). Used during logout/session expiry. */
export function clearApiCache() {
  sessionGeneration++;
  cache.clear();
  activeRequests.clear();
  keyVersions.clear();
}

/**
 * Invalidates specific cache keys for the CURRENT user.
 * Pass the exact rawKey (e.g., 'api:complaints:list').
 * If prefix is true, invalidates all keys starting with rawKey.
 */
export function invalidateApiCache(userId: string | undefined, rawKey: string, prefix = false) {
  const scopedKey = `${userId || 'anonymous'}:${rawKey}`;
  const keysToBump = new Set<string>();

  for (const key of Array.from(cache.keys())) {
    if (prefix ? key.startsWith(scopedKey) : key === scopedKey) {
      cache.delete(key);
      keysToBump.add(key);
    }
  }
  for (const key of Array.from(activeRequests.keys())) {
    if (prefix ? key.startsWith(scopedKey) : key === scopedKey) {
      activeRequests.delete(key);
      keysToBump.add(key);
    }
  }
  if (!prefix && keysToBump.size === 0) {
    keysToBump.add(scopedKey);
  }

  for (const key of keysToBump) {
    bumpKeyVersion(key);
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

function getCacheEntry<T>(key: string): { data: T; isStale: boolean } | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  const age = Date.now() - entry.timestamp;
  if (age >= CACHE_TTL) {
    cache.delete(key);
    return undefined;
  }
  // Refresh LRU position on access
  cache.delete(key);
  cache.set(key, entry);
  return {
    data: entry.data as T,
    isStale: age >= STALE_TIME,
  };
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

  // Synchronous key tracking during render to prevent stale data frames across user/key changes
  const [prevKey, setPrevKey] = useState<string | null>(key);
  const [state, setState] = useState<ResourceState<T>>(() => {
    if (!key) {
      return { data: null, error: null, loading: false };
    }
    const cached = getCacheEntry<T>(key);
    if (cached !== undefined) {
      return { data: cached.data, error: null, loading: false };
    }
    return { data: null, error: null, loading: true };
  });

  // Adjust state during render if key changed (logout, account switch, route/filter change)
  if (key !== prevKey) {
    setPrevKey(key);
    const cached = key ? getCacheEntry<T>(key) : undefined;
    setState({
      data: cached ? cached.data : null,
      error: null,
      loading: Boolean(key && !cached),
    });
  }

  const prevEffectKeyRef = useRef(key);

  useEffect(() => {
    if (!key) {
      setState({ data: null, error: null, loading: false });
      prevEffectKeyRef.current = null;
      return;
    }

    let active = true;
    const requestGen = sessionGeneration;
    const requestUserId = userId;
    const requestKeyVer = getKeyVersion(key);
    const keyChanged = prevEffectKeyRef.current !== key;
    prevEffectKeyRef.current = key;

    const cached = getCacheEntry<T>(key);

    // If data is in cache and still fresh, and not a manual reload: no fetch needed
    if (nonce === 0 && cached && !cached.isStale && !keyChanged) {
      setState({ data: cached.data, error: null, loading: false });
      return;
    }

    // Stale-while-revalidate:
    // If cached data exists (even if stale): display cached data immediately with loading: false
    // If no cached data exists: set loading: true (show skeleton/spinner)
    if (cached) {
      setState(() => ({
        data: cached.data,
        error: null,
        loading: false,
      }));
    } else {
      setState((prev) => ({
        data: keyChanged ? null : prev.data,
        error: null,
        loading: true,
      }));
    }

    let promise = activeRequests.get(key);
    if (!promise) {
      promise = loadRef.current().then(
        (data) => {
          // Discard if session ended, key was invalidated, or user changed while request was in-flight
          if (
            sessionGeneration === requestGen &&
            userId === requestUserId &&
            getKeyVersion(key) === requestKeyVer &&
            activeRequests.has(key)
          ) {
            setCacheEntry(key, data);
            activeRequests.delete(key);
          }
          return data;
        },
        (error) => {
          if (sessionGeneration === requestGen && getKeyVersion(key) === requestKeyVer) {
            activeRequests.delete(key);
          }
          throw error;
        },
      );
      activeRequests.set(key, promise);
    }

    promise.then(
      (data) => {
        // Only set state if component is still mounted AND user session has not changed AND key was not invalidated
        if (
          active &&
          sessionGeneration === requestGen &&
          userId === requestUserId &&
          getKeyVersion(key) === requestKeyVer
        ) {
          setState({ data: data as T, error: null, loading: false });
        }
      },
      (error: unknown) => {
        if (
          active &&
          sessionGeneration === requestGen &&
          userId === requestUserId &&
          getKeyVersion(key) === requestKeyVer
        ) {
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
    activeRequests.delete(key);
    bumpKeyVersion(key);
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

export function _getInternalCacheForTesting() {
  return {
    cache,
    activeRequests,
    keyVersions,
    get sessionGeneration() {
      return sessionGeneration;
    },
    setCacheEntry,
    getCacheEntry,
    bumpKeyVersion,
    getKeyVersion,
  };
}
