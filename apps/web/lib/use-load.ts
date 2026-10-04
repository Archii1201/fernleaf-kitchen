'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './api/client';

type Primitive = string | number | boolean | null | undefined;

/**
 * Loads data for a view and re-runs when any key changes. Keys must be
 * primitives so they can identify the request that produced the result.
 */
export function useLoad<T>(loader: () => Promise<T>, keys: Primitive[]) {
  const [nonce, setNonce] = useState(0);
  const requestKey = JSON.stringify([...keys, nonce]);
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(loader)
      .then(
        (data) => active && setState({ key: requestKey, data, error: null }),
        (error: unknown) =>
          active && setState((current) => ({ key: requestKey, data: current.data, error: errorMessage(error) })),
      );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const setData = useCallback(
    (update: (current: T | null) => T | null) =>
      setState((current) => ({ ...current, data: update(current.data) })),
    [],
  );

  return {
    data: state.data,
    error: state.key === requestKey ? state.error : null,
    loading: state.key !== requestKey && state.data === null,
    refreshing: state.key !== requestKey,
    reload,
    setData,
  };
}

/** Runs a mutation, tracking busy state and surfacing the backend message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(async <T,>(task: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await task();
      if (success) {
        setNotice(success);
      }
      return result;
    } catch (caught) {
      setError(errorMessage(caught));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { run, busy, error, notice, setError, setNotice };
}
