import { dateFieldsIST, todayMidnightIST } from "@/lib/india-time";

/**
 * A date the guest typed out explicitly — "26jul", "26 July", "Jul 26",
 * "27jul2026", "5th Aug".
 *
 * Written after a live conversation where the app asked "just type the date
 * (e.g. 25 Aug)" and then failed to understand "26jul", answering with a
 * generic "When are you looking to stay?" — ignoring the very thing it had
 * just requested. The old month-name pattern required whitespace between the
 * day and the month, so every compact spelling was invisible, and a
 * one-word message carries no question marker, so it fell into the funnel.
 *
 * Only NAMED months are parsed here. "26/7" is deliberately out of scope:
 * day-first vs month-first is genuinely ambiguous in digits, and guessing it
 * is how a guest ends up booked on a date they never chose (see
 * date-safety.ts for the incident). A named month removes that ambiguity
 * completely, which is what makes deterministic parsing safe at all.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_ALT = MONTHS.join("|");

// Day-then-month ("26jul", "5th August", "27jul2026"). \s* not \s+ — the
// compact spelling is the one that broke. The optional trailing year has to
// be part of the match: with a bare \b after the month, "27jul2026" failed
// because "jul" is followed immediately by a digit and there is no word
// boundary there.
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(${MONTH_ALT})[a-z]*\\.?\\s*,?\\s*(\\d{4})?`, "i");
// Month-then-day ("Jul 26", "August 5th", "jul26").
const MONTH_FIRST = new RegExp(`\\b(${MONTH_ALT})[a-z]*\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})?`, "i");

export interface ExplicitDate {
  date: Date;
  /** True when the guest actually wrote a year, rather than it being inferred. */
  hadYear: boolean;
}

function build(day: number, month: number, yearText: string | undefined, now: Date): ExplicitDate | null {
  if (day < 1 || day > 31 || month < 0 || month > 11) return null;
  const hadYear = Boolean(yearText);
  const year = hadYear ? Number(yearText) : dateFieldsIST(now).year;
  const date = new Date(year, month, day);
  // Rejects impossible dates rather than letting JavaScript roll them over:
  // "31 Feb" would otherwise silently become 3 March.
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return { date, hadYear };
}

/** Parses an explicitly-typed, named-month date. Returns null when there isn't one. */
export function parseExplicitDate(text: string, now: Date = new Date()): ExplicitDate | null {
  const dayFirst = text.match(DAY_FIRST);
  if (dayFirst) {
    const built = build(Number(dayFirst[1]), MONTHS.indexOf(dayFirst[2].toLowerCase().slice(0, 3)), dayFirst[3], now);
    if (built) return built;
  }
  const monthFirst = text.match(MONTH_FIRST);
  if (monthFirst) {
    const built = build(Number(monthFirst[2]), MONTHS.indexOf(monthFirst[1].toLowerCase().slice(0, 3)), monthFirst[3], now);
    if (built) return built;
  }
  return null;
}

/**
 * The same date, but only when it's actually bookable — i.e. today or later.
 *
 * A bare "26 Jul" in August is deliberately NOT rolled forward to next year.
 * It is far more often a mistake or a typo than a genuine intention to book
 * eleven months out, and silently choosing the more optimistic reading is
 * exactly the past-date class of bug in reverse. Returning null sends the
 * guest back to confirm, which is the honest outcome.
 */
export function parseBookableExplicitDate(text: string, now: Date = new Date()): Date | null {
  const parsed = parseExplicitDate(text, now);
  if (!parsed) return null;
  return parsed.date.getTime() < todayMidnightIST(now).getTime() ? null : parsed.date;
}

/** True when the guest typed a named-month date that has already gone. */
export function explicitDateIsPast(text: string, now: Date = new Date()): boolean {
  const parsed = parseExplicitDate(text, now);
  return parsed ? parsed.date.getTime() < todayMidnightIST(now).getTime() : false;
}
