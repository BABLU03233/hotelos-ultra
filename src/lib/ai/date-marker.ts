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

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (checkIn.getTime() < todayMidnight.getTime()) return { text: cleaned };

  return { text: cleaned, dates: { checkIn, checkOut } };
}
