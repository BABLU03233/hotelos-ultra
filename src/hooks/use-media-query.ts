"use client";

import * as React from "react";

/**
 * Tracks a CSS media query, SSR-safe.
 *
 * Built on useSyncExternalStore rather than a manual useState+useEffect pair
 * — the textbook fix for exactly this case (subscribing to a mutable value
 * that lives outside React, like matchMedia). The hand-rolled version this
 * replaced called setState synchronously inside its effect body to prime the
 * initial value, which this repo's react-hooks/set-state-in-effect rule
 * rejects outright (error, not warn — see the eslint config). This has no
 * effect and no setState call at all: subscribe/getSnapshot is the whole
 * hook, and useSyncExternalStore handles re-rendering internally.
 *
 * getServerSnapshot returns false — there is no viewport to query on the
 * server, so a docked-vs-Sheet layout choice like the CRM's contact panel
 * below defaults to the narrow-screen answer until the client corrects it
 * after mount, matching how every other responsive hook in React behaves.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  const getSnapshot = React.useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
