import { randomInt } from "crypto";

/** Owner-set prefix if configured, else the first letters of the hotel name, else a generic fallback. */
export function derivePrefix(profile: { bookingCodePrefix?: string | null; name?: string | null } | null): string {
  if (profile?.bookingCodePrefix) return profile.bookingCodePrefix;
  const letters = (profile?.name ?? "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  return letters.slice(0, 3) || "STAY";
}

/** e.g. "IVR-4821" — a 4-digit random suffix is plenty of entropy given the create-then-retry-on-collision loop in complete-booking.ts. */
export function randomReferenceCode(prefix: string): string {
  return `${prefix}-${randomInt(1000, 10000)}`;
}
