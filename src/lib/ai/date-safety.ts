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
  return numericDateLooksPast(text, now) || monthNameDateLooksPast(text, now);
}

function numericDateLooksPast(text: string, now: Date): boolean {
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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Both branches allow the month name to continue past its 3-letter stem
// ([a-z]*). Without that on the day-first branch, "5 August" matched
// nothing: the trailing \b sat immediately after "aug", and "u" follows —
// both word characters, so there is no boundary there and the whole match
// failed. "5 Aug" worked, "5 August" didn't, which is the more common way
// to write it.
const MONTH_NAME_DATE =
  /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?)\b/i;

/**
 * "5 August" / "Aug 5th" when today is the 12th.
 *
 * The numeric check above was written for a day-first/month-first AMBIGUITY
 * incident, and its comment concluded month-name dates were out of scope
 * because they aren't ambiguous. True, and beside the point: an unambiguous
 * date can still be firmly in the past. That gap let a guest name a date
 * that had already gone and be walked forward into booking it — the exact
 * failure the numeric check exists to prevent, just reached through a
 * different phrasing.
 *
 * Bare "May" is excluded by requiring a day number alongside the month, so
 * an ordinary sentence containing the word "may" can't be read as a date.
 * A year is never inferred backwards: with no year given, this only fires
 * when the date is earlier in the CURRENT year, since "5 August" in
 * December plainly means next August.
 */
function monthNameDateLooksPast(text: string, now: Date): boolean {
  const m = text.match(MONTH_NAME_DATE);
  if (!m) return false;

  const day = parseInt(m[1] ?? m[4], 10);
  const monthToken = (m[2] ?? m[3]).toLowerCase().slice(0, 3);
  const month = MONTHS.indexOf(monthToken);
  if (month < 0 || !day || day < 1 || day > 31) return false;

  const { year } = dateFieldsIST(now);
  const parsed = new Date(year, month, day);
  return parsed.getTime() < todayMidnightIST(now).getTime();
}
