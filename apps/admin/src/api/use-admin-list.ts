import { useCallback, useEffect, useState } from "react";

import { ApiError } from "./client.js";
import { adminApiClient } from "./client.js";

interface ListState<T> {
  items: T[];
  loading: boolean;
  error: string | undefined;
  reload: () => void;
}

/** Generic loader for admin list endpoints that return `{ items }`. */
export function useAdminList<T>(path: string, enabled = true): ListState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError(undefined);
    void adminApiClient
      .request<{ items: T[] }>(path)
      .then((data) => {
        if (active) setItems(data.items);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof ApiError ? cause.message : "加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, enabled, nonce]);

  return { items, loading, error, reload };
}
