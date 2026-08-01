"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

/**
 * Minimal client data-fetching hook — the spec's stack is Zustand only, so this stands in for a query library.
 * Pass `intervalMs` to re-fetch on a timer (e.g. so a notification count or contact list feels live) — opt-in,
 * existing call sites are unaffected.
 */
export function useFetch<T>(url: string | null, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const key = `${url}#${reloadKey}`;
    apiFetch<T>(url)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
          setLoadedKey(key);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
          setLoadedKey(key);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, reloadKey]);

  useEffect(() => {
    if (!url || !intervalMs) return;
    const id = setInterval(() => setReloadKey((k) => k + 1), intervalMs);
    return () => clearInterval(id);
  }, [url, intervalMs]);

  const currentKey = url ? `${url}#${reloadKey}` : null;
  return {
    data,
    loading: !!url && loadedKey !== currentKey,
    error,
    reload: () => setReloadKey((k) => k + 1),
  };
}
