import { useCallback, useEffect, useRef, useState } from 'react';

interface ResourceState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
}

export interface Resource<T> extends ResourceState<T> {
  /** Re-run the loader — pull-to-refresh, a retry after a failure, or after filing a complaint. */
  reload: () => void;
}

/**
 * Load data from the API and track loading/error/data.
 *
 * `key` is a stable string describing the request. When it changes the loader re-runs, and a
 * response that arrives after the key changed is discarded — on a slow mobile connection two
 * responses landing out of order is normal, not hypothetical.
 *
 * The loader is held in a ref rather than a dependency so callers can pass an inline arrow
 * function without the hook re-firing on every render.
 *
 * No cache: every mount re-fetches. For a driver checking whether their complaint moved, stale
 * data is worse than a one-second spinner.
 */
export function useApiResource<T>(key: string, load: () => Promise<T>): Resource<T> {
  const loadRef = useRef(load);
  loadRef.current = load;

  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    loadRef.current().then(
      (data) => {
        if (active) setState({ data, error: null, loading: false });
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
    setNonce((n) => n + 1);
  }, []);

  return { ...state, reload };
}
