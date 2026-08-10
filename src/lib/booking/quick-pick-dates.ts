import { todayMidnightIST } from "@/lib/india-time";

export type QuickPickKey = "dates_weekend" | "dates_nextweek";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Next occurrence of `targetDow` (0=Sun..6=Sat) at or after `now`; `forceAhead` skips a same-day match to the following week instead. */
function nextWeekday(now: Date, targetDow: number, forceAhead: boolean): Date {
  const currentDow = now.getDay();
  let diff = (targetDow - currentDow + 7) % 7;
  if (diff === 0 && forceAhead) diff = 7;
  return addDays(startOfDay(now), diff);
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Resolves a DATE_QUICK_PICK button tap to real, concrete dates in code --
 * deterministic and 100% reliable, unlike relying on the AI to interpret
 * "This weekend"/"Next week" itself (see date-marker.ts for the AI-assisted,
 * best-effort path used for free-typed dates instead). Both quick-picks
 * default to a 1-night stay; the guest can extend via normal chat.
 *
 * "This weekend" allows a same-day match (today counts if today IS
 * Saturday) since a guest can still book for tonight. "Next week"
 * deliberately does NOT allow a same-day match on Monday -- if today is
 * already Monday, "next week" should mean the following Monday, not today.
 *
 * "Today" is resolved in India Standard Time, not the server's own clock --
 * the server runs in UTC, and for ~5.5 hours every night it's still on
 * "yesterday" while India has already rolled over, which would otherwise
 * shift these quick-pick dates off by a day during exactly that window
 * (see india-time.ts).
 */
export function resolveQuickPickDates(key: QuickPickKey, now: Date = new Date()): { checkIn: Date; checkOut: Date; label: string } {
  const todayIST = todayMidnightIST(now);
  const checkIn = key === "dates_weekend" ? nextWeekday(todayIST, 6, false) : nextWeekday(todayIST, 1, true);
  const checkOut = addDays(checkIn, 1);
  const prefix = key === "dates_weekend" ? "This weekend" : "Next week";
  return { checkIn, checkOut, label: `${prefix} (${formatShort(checkIn)} – ${formatShort(checkOut)})` };
}
