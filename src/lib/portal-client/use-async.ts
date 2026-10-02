'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatApiError } from '@/lib/client/api';

/**
 * Async data loading with honest loading / error / empty states.
 *
 * `reload` exists so a mutation can refresh the list it changed. Two guards keep
 * the UI truthful:
 *  - `loading` is only cleared for the request that is still current, so a slow
 *    first response cannot overwrite a newer one;
 *  - a failure sets `error` and clears `data`, so the UI never shows stale rows
 *    next to an error and implies they are current.
 */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (value: T | null) => void;
}

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[] = []
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (!mounted.current || id !== requestId.current) return;
      setData(result);
    } catch (caught) {
      if (!mounted.current || id !== requestId.current) return;
      setData(null);
      setError(formatApiError(caught));
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
    // The loader identity changes every render, so `deps` is the real contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
