import { todayMidnightIST } from "@/lib/india-time";

/**
 * Tier 2 date capture (see quick-pick-dates.ts for Tier 1, the fully
 * deterministic button-tap path). Free-typed dates ("15th to 17th August")
 * have no deterministic parse path, so the AI is asked to restate any dates
 * it's confident about as a structured `DATES: YYYY-MM-DD_YYYY-MM-DD` marker
 * -- mirroring the established IMAGE:/BUTTONS: idiom exactly (regex +
 * matchAll + strip). Deliberately best-effort: a missing or malformed marker
 * is not a failure, it just means no structured dates were captured for this
 * turn, identical to today's total lack of date capture -- this never blocks
 * or breaks the conversation, only availability-checking is unlocked when it
 * does fire (see availability.ts).
 */
const DATES_LINE = /^DATES:\s*(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\s*$/gim;

export function extractDatesMarker(text: string, now: Date = new Date()): { text: string; dates?: { checkIn: Date; checkOut: Date } } {
  const matches = [...text.matchAll(DATES_LINE)];
  const cleaned = text.replace(DATES_LINE, "").trim();
  if (!matches.length) return { text: cleaned };

  const [, checkInStr, checkOutStr] = matches[0];
  const checkIn = new Date(`${checkInStr}T00:00:00`);
  const checkOut = new Date(`${checkOutStr}T00:00:00`);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return { text: cleaned };
  if (checkOut.getTime() <= checkIn.getTime()) return { text: cleaned };

  // "Today" here means India's calendar date, not the server's own clock --
  // this was a live-caught gap this session found in every OTHER date/time
  // call site (india-time.ts) but missed here: the server runs in UTC, and
  // for ~5.5 hours nightly it's still on "yesterday" while India has already
  // rolled over, which would otherwise wrongly reject a guest's genuinely
  // valid same-day date, or wrongly accept one that's actually already past
  // in India -- exactly the failure class the original past-date booking bug
  // this whole session started from belongs to.
  const todayMidnight = todayMidnightIST(now);
  if (checkIn.getTime() < todayMidnight.getTime()) return { text: cleaned };

  return { text: cleaned, dates: { checkIn, checkOut } };
}
