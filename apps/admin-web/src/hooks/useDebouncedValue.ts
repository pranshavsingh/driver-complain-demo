import { useEffect, useState } from 'react';

/**
 * Delay propagating a fast-changing value. Used by the complaints search box so typing
 * "brake" fires one request instead of five — and, because the search term also lives in the
 * URL, so it does not push five history entries either.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
