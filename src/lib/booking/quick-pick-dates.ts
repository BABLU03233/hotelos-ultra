import { todayMidnightIST } from "@/lib/india-time";
import { parseBookableExplicitDate } from "./explicit-date";

export type QuickPickKey = "dates_today" | "dates_tomorrow" | "dates_weekend" | "dates_nextweek";

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
 * best-effort path used for free-typed dates instead). All four quick-picks
 * default to a 1-night stay; the guest can extend via normal chat.
 *
 * "This weekend" allows a same-day match (today counts if today IS
 * Saturday) since a guest can still book for tonight. "Next week"
 * deliberately does NOT allow a same-day match on Monday -- if today is
 * already Monday, "next week" should mean the following Monday, not today.
 *
 * "Today"/"now" is resolved in India Standard Time, not the server's own
 * clock -- the server runs in UTC, and for ~5.5 hours every night it's
 * still on "yesterday" while India has already rolled over, which would
 * otherwise shift these quick-pick dates off by a day during exactly that
 * window (see india-time.ts).
 */
export function resolveQuickPickDates(key: QuickPickKey, now: Date = new Date()): { checkIn: Date; checkOut: Date; label: string } {
  const todayIST = todayMidnightIST(now);

  let checkIn: Date;
  let prefix: string;
  switch (key) {
    case "dates_today":
      checkIn = todayIST;
      prefix = "Today";
      break;
    case "dates_tomorrow":
      checkIn = addDays(todayIST, 1);
      prefix = "Tomorrow";
      break;
    case "dates_weekend":
      checkIn = nextWeekday(todayIST, 6, false);
      prefix = "This weekend";
      break;
    case "dates_nextweek":
      checkIn = nextWeekday(todayIST, 1, true);
      prefix = "Next week";
      break;
  }

  const checkOut = addDays(checkIn, 1);
  return { checkIn, checkOut, label: `${prefix} (${formatShort(checkIn)} – ${formatShort(checkOut)})` };
}

/**
 * The same deterministic resolution, for the guest who TYPES one of these
 * instead of tapping the row — "this weekend", "kal", "अगले हफ्ते".
 *
 * Until now a typed relative date resolved to nothing. It satisfied the
 * hasStatedDates text scan and no more: no structured range was stored, so
 * availability could not be checked for it, the booking row got no dates,
 * and — since the scan only sees the last 12 messages — the moment that turn
 * scrolled out of the window the guest was asked for their dates all over
 * again. A soak across 100,000 conversations flagged ~500 runs doing exactly
 * that. The AI's `DATES:` marker (see date-marker.ts) was the only path to a
 * structured range, which makes the single most common phrasing in the whole
 * funnel depend on a free-tier model choosing to cooperate.
 *
 * These four phrasings are unambiguous enough to resolve in code, with the
 * same guarantees the tapped rows already have. Anything more specific ("the
 * 15th to the 17th") stays with the AI marker, which can actually parse it.
 *
 * Returns null when nothing matches — never a guess.
 */
export function resolveTypedRelativeDates(text: string, now: Date = new Date()): { checkIn: Date; checkOut: Date; label: string } | null {
  const t = text.toLowerCase();

  // Checked most-specific first: "next weekend" must not be read as "next
  // week", and "this weekend" must not be read as bare "today".
  const rules: { key: QuickPickKey; pattern: RegExp }[] = [
    { key: "dates_weekend", pattern: /\b(this |next |coming )?weekend\b|वीकेंड|వారాంతం/ },
    { key: "dates_nextweek", pattern: /\bnext week\b|\bagle\s*(hafte|hafta|week)\b|अगले\s*हफ्ते|వచ్చే వారం/ },
    { key: "dates_tomorrow", pattern: /\btomorrow\b|\bkal\b|कल|రేపు/ },
    { key: "dates_today", pattern: /\btonight\b|\btoday\b|\baaj\b|आज|ఈ ?రోజు|నేడు/ },
  ];

  for (const { key, pattern } of rules) {
    if (pattern.test(t)) return resolveQuickPickDates(key, now);
  }

  // "in 3 days" — wholly relative, zero ambiguity, so it resolves in code
  // rather than waiting on the model. Capped at a year out: a larger number
  // is far more likely a price or a typo than a genuine booking horizon.
  const inDays = t.match(/\bin (\d{1,3})\s*days?\b/);
  if (inDays) {
    const n = Number(inDays[1]);
    if (n >= 1 && n <= 365) {
      const checkIn = addDays(todayMidnightIST(now), n);
      const checkOut = addDays(checkIn, 1);
      return { checkIn, checkOut, label: `In ${n} day${n === 1 ? "" : "s"} (${formatShort(checkIn)} – ${formatShort(checkOut)})` };
    }
  }

  // A bare weekday ("friday", "on monday") means the NEXT one — never today,
  // even if today is that weekday: a guest naming a weekday is pointing at an
  // upcoming day, and resolving it to today risks the past-date class of bug
  // this file's other helpers guard so carefully against.
  const WEEKDAYS: [RegExp, number][] = [
    [/\bsun(day)?\b|रविवार|ఆదివారం/, 0],
    [/\bmon(day)?\b|सोमवार|సోమవారం/, 1],
    [/\btue(s|sday)?\b|मंगलवार|మంగళవారం/, 2],
    [/\bwed(nesday)?\b|बुधवार|బుధవారం/, 3],
    [/\bthu(r|rs|rsday)?\b|गुरुवार|గురువారం/, 4],
    [/\bfri(day)?\b|शुक्रवार|శుక్రవారం/, 5],
    [/\bsat(urday)?\b|शनिवार|శనివారం/, 6],
  ];
  for (const [pattern, dow] of WEEKDAYS) {
    if (pattern.test(t)) {
      const checkIn = nextWeekday(todayMidnightIST(now), dow, true);
      const checkOut = addDays(checkIn, 1);
      return { checkIn, checkOut, label: `${formatShort(checkIn)} – ${formatShort(checkOut)}` };
    }
  }

  // A typed, named-month date resolves here rather than waiting on the AI's
  // DATES: marker. The app explicitly invites this ("just type the date, e.g.
  // 25 Aug"), so failing to understand the reply breaks its own promise —
  // which is exactly what happened live with "26jul".
  //
  // Safe to do deterministically because a NAMED month carries no
  // day-first/month-first ambiguity; bare digits still don't resolve here.
  // parseBookableExplicitDate returns null for a past date, so this can
  // never quietly roll one forward into next year.
  const explicit = parseBookableExplicitDate(t, now);
  if (explicit) {
    const checkOut = addDays(explicit, 1);
    return { checkIn: explicit, checkOut, label: `${formatShort(explicit)} – ${formatShort(checkOut)}` };
  }

  // Anything more specific ("15th to 17th August", "20/09") is deliberately
  // left to the AI's DATES: marker. Day-first vs month-first is genuinely
  // ambiguous in free text and guessing it wrong is exactly how a guest ends
  // up booked on a date that has already passed — see date-safety.ts.
  return null;
}
