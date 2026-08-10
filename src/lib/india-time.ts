/**
 * Real, live-observed bug: the production server runs in UTC (confirmed via
 * `timedatectl` -- Etc/UTC), but every guest and the hotel itself are in
 * India (IST, UTC+5:30). Plain `new Date().getHours()`/`getDate()` etc.
 * return the SERVER's local calendar fields, not India's -- for
 * getHours() specifically this is wrong for the ~19 hours of every day
 * that aren't within the small overlap window, and for getDate() it's
 * wrong specifically during the ~5.5 hours of every night where UTC is
 * still on "yesterday" while IST has already rolled over to "today" (UTC
 * 18:30-23:59 = IST 00:00-05:29 the next day). That second case is a real
 * correctness risk, not just cosmetic: it's the exact same failure mode as
 * the original past-date booking bug this session already fixed once
 * (guest offered a room on a date that's already passed) -- just reached
 * through the server's clock instead of the guest's own phrasing this
 * time. Every place in this codebase that means "today, in India" must
 * derive it from these helpers, never from a bare `new Date()` field
 * getter.
 */
const IST_TIME_ZONE = "Asia/Kolkata";

/** The current hour (0-23) in India Standard Time, regardless of the server's own system timezone. */
export function currentHourIST(now: Date = new Date()): number {
  const hourStr = new Intl.DateTimeFormat("en-US", { timeZone: IST_TIME_ZONE, hour: "numeric", hour12: false }).format(now);
  return Number(hourStr) % 24;
}

/** { year, month (1-12), day } for `now` as observed in India Standard Time. */
export function dateFieldsIST(now: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: IST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    now
  );
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Midnight (00:00) of today's calendar date in India Standard Time, as a comparable Date. */
export function todayMidnightIST(now: Date = new Date()): Date {
  const { year, month, day } = dateFieldsIST(now);
  return new Date(year, month - 1, day);
}
