import { useCallback, useEffect, useRef, useState } from 'react';

interface ResourceState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
}

export interface Resource<T> extends ResourceState<T> {
  /** Re-run the loader — used by the realtime refresh banner and after a mutation. */
  reload: () => void;
}

/**
 * Load data from the API and track loading/error/data.
 *
 * `key` is a stable string describing the request (usually the query string). When it
 * changes, the loader re-runs; a response that arrives after the key changed is discarded, so
 * a slow page-1 response cannot overwrite the page-2 rows the admin is already looking at.
 *
 * The loader itself is held in a ref rather than a dependency, so callers can pass an inline
 * arrow function without the hook re-firing on every render.
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
