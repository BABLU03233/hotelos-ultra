"use client";

import { useEffect } from "react";
import { AuthTenant, AuthUser, useAuthStore } from "@/store/use-auth-store";

/** Hydrates the client-side auth store from the server-rendered session — no client fetch needed. */
export function AuthHydrator({ user, tenant }: { user: AuthUser; tenant: AuthTenant }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => {
    hydrate(user, tenant);
  }, [user, tenant, hydrate]);
  return null;
}
