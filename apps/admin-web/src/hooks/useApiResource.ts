import { useCallback, useEffect, useRef, useState } from 'react';
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

const cache = new Map<string, { data: any, timestamp: number }>();
const activeRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30_000; // 30 seconds

/** Wipes the ENTIRE cache (all users). Used during logout/session expiry. */
export function clearApiCache() {
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

/**
 * Load data from the API and track loading/error/data.
 * Deduplicates concurrent requests and caches data.
 *
 * `rawKey` is a stable string describing the request (usually the query string). 
 * It is automatically prefixed with the user's ID to prevent cross-session data leaks.
 */
export function useApiResource<T>(rawKey: string, load: () => Promise<T>): Resource<T> {
  const { user } = useAuth();
  const key = `${user?.id || 'anonymous'}:${rawKey}`;

  const loadRef = useRef(load);
  loadRef.current = load;

  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<ResourceState<T>>(() => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { data: cached.data as T, error: null, loading: false };
    }
    return { data: null, error: null, loading: true };
  });

  useEffect(() => {
    let active = true;

    const cached = cache.get(key);
    if (nonce === 0 && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // If we already set this synchronously in initial state for this exact key, 
      // we might not need to set it again, but just to be safe if key changed:
      setState({ data: cached.data as T, error: null, loading: false });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    let promise = activeRequests.get(key);
    if (!promise) {
      promise = loadRef.current().then(
        (data) => {
          cache.set(key, { data, timestamp: Date.now() });
          activeRequests.delete(key);
          return data;
        },
        (error) => {
          activeRequests.delete(key);
          throw error;
        }
      );
      activeRequests.set(key, promise);
    }

    promise.then(
      (data) => {
        if (active) setState({ data: data as T, error: null, loading: false });
      },
      (error: unknown) => {
        if (active) setState({ data: null, error, loading: false });
      },
    );

    return () => {
      active = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => {
    cache.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  return { ...state, reload };
}
