import { dateFieldsIST, todayMidnightIST } from "@/lib/india-time";

/**
 * Live production testing caught a serious bug: a guest typed "4/8/2026"
 * (4th August, the Indian day-first convention) and the AI read it as
 * "April 8th" (American month-first), then confidently offered availability
 * and a discount for a date that had already passed months earlier — with
 * no sanity-check at all. A prompt-only "read dates day-first, check
 * against today" instruction is not trusted alone here, matching every
 * other lesson from this session: this is a deterministic pre-call check
 * for the exact numeric-date pattern that caused the real incident, used to
 * inject a corrective instruction for that specific turn (see
 * pipeline.ts) rather than hoping the model remembers the rule.
 *
 * Deliberately narrow — only a numeric D/M or D/M/YYYY (or D-M[-YYYY])
 * pattern, read day-first. Month-name dates ("15th August") aren't
 * ambiguous the way digits are, so they're not in scope here.
 *
 * "Today" here means India's calendar date, not the server's -- the server
 * runs in UTC (see india-time.ts), and for ~5.5 hours every night the
 * server is still on "yesterday" while India has already rolled over,
 * which would otherwise silently reintroduce this exact same past-date bug
 * class through the server's own clock instead of the guest's phrasing.
 */
export function guestDateLooksPast(text: string, now: Date = new Date()): boolean {
  const match = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (!match) return false;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (day < 1 || day > 31 || month < 1 || month > 12) return false; // not a plausible day-first date

  let year = dateFieldsIST(now).year;
  if (match[3]) {
    year = parseInt(match[3], 10);
    if (match[3].length === 2) year += 2000;
  }

  const parsed = new Date(year, month - 1, day);
  const todayMidnight = todayMidnightIST(now);
  return parsed.getTime() < todayMidnight.getTime();
}
