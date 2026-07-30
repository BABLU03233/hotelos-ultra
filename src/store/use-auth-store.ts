import { create } from "zustand";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "STAFF";
}

export interface AuthTenant {
  id: string;
  name: string;
  slug: string;
}

interface AuthState {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  hydrate: (user: AuthUser, tenant: AuthTenant) => void;
}

/** Hydrated once from the server-rendered layout (see app/(app)/layout.tsx) — no client fetch needed. */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenant: null,
  hydrate: (user, tenant) => set({ user, tenant }),
}));
