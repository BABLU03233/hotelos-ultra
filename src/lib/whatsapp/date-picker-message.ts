import { GuestLanguage, resolveLanguage, t } from "@/lib/i18n/guest-language";
import { todayMidnightIST } from "@/lib/india-time";

const MAX_ROWS = 10; // WhatsApp Cloud API: max 10 rows total across all sections
const ROW_TITLE_MAX = 24;
const ROW_DESCRIPTION_MAX = 72;

/**
 * A real, tappable calendar built out of ordinary List Messages.
 *
 * The native in-WhatsApp CalendarPicker (see flows/booking-flow.ts) is the
 * nicer surface, but publishing a Flow is gated behind Meta's account
 * integrity check — verified live: create and upload both succeed, publish
 * returns 139000/4233020 "Blocked by Integrity" while the phone number's
 * display name sits DECLINED. That gate can take days to clear and is
 * per-number, so every hotel onboarded would hit it before its guests could
 * ever pick a date.
 *
 * List Messages need no approval at all and are already this codebase's
 * proven idiom for real-data pickers (rooms, FAQs, offers). So the guest
 * gets concrete dates to tap either way, and the Flow becomes a nicety
 * rather than a prerequisite for booking.
 *
 * The existing DATE_QUICK_PICK ("Today", "This weekend", …) stays as the
 * fast path for a guest who just wants the obvious answer; this is what they
 * get when they want to see actual dates.
 */

export interface DatePickerMessage {
  type: "list";
  body: string;
  buttonText: string;
  sections: { rows: { id: string; title: string; description: string }[] }[];
}

export const CHECK_IN_PREFIX = "checkin_";
export const NIGHTS_PREFIX = "nights_";
/** DATE_QUICK_PICK's "Pick exact dates" row — the way IN to this picker. */
export const TYPE_DATES_ID = "dates_custom";

/**
 * The escape hatches, each with its OWN id.
 *
 * These originally reused TYPE_DATES_ID, which produced an infinite loop in
 * production on the first real conversation: TYPE_DATES_ID's handler opens a
 * picker, so tapping "Longer stay" inside the nights picker re-sent the
 * nights picker, and tapping it again re-sent it again. The guest could not
 * get out. Same defect on the check-in picker's "Another date".
 *
 * The rule this encodes: a row whose entire purpose is "none of these
 * options suit me" must never route back into the list it appears in.
 */
// Deliberately NOT "checkin_other"/"nights_more": those share the parsing
// prefixes above, so they'd fall into the date/nights parsing branches if
// the routing order were ever rearranged — parse to null, route to "open the
// picker", and reinstate the exact loop this is fixing. Distinct namespaces
// make that impossible rather than merely unlikely. Asserted in the tests.
export const CHECK_IN_OTHER_ID = "date_other";
export const NIGHTS_MORE_ID = "stay_longer";

/** yyyy-mm-dd for a Date, read in India time — the id that travels in the row. */
function isoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function human(d: Date): string {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * Check-in picker: the next 9 days plus an escape hatch, because 10 rows is
 * WhatsApp's hard cap. Nine days covers the overwhelming majority of real
 * enquiries here; anything further out falls to typing, which the AI's
 * DATES: marker already handles.
 *
 * Deliberately no 📅 emoji: on some phones' emoji fonts the calendar glyph
 * has an arbitrary date printed into its artwork, which reads as a real,
 * wrong date in exactly the context where that's least forgivable (the same
 * rule DATE_QUICK_PICK follows).
 */
export function buildCheckInPickerMessage(now: Date = new Date(), lang?: GuestLanguage | null): DatePickerMessage {
  const s = t(resolveLanguage(lang));
  const today = todayMidnightIST(now);
  const rows = Array.from({ length: MAX_ROWS - 1 }, (_, i) => {
    const d = addDays(today, i);
    const label = i === 0 ? s.labelToday : i === 1 ? s.labelTomorrow : "";
    return {
      id: `${CHECK_IN_PREFIX}${isoDay(d)}`,
      title: human(d).slice(0, ROW_TITLE_MAX),
      description: label,
    };
  });
  rows.push({ id: CHECK_IN_OTHER_ID, title: s.anotherDate, description: s.anotherDateDesc });

  return {
    type: "list",
    body: s.checkInPickerBody,
    buttonText: s.checkInPickerButton,
    sections: [{ rows }],
  };
}

/**
 * Nights picker — the check-out half of the range, asked as "how many
 * nights?" rather than a second date grid because that's how guests
 * actually think about a stay, and it makes an invalid range (check-out
 * before check-in) structurally impossible rather than something to
 * validate after the fact.
 */
export function buildNightsPickerMessage(checkIn: Date, lang?: GuestLanguage | null): DatePickerMessage {
  const s = t(resolveLanguage(lang));
  const rows = Array.from({ length: 7 }, (_, i) => {
    const nights = i + 1;
    const out = addDays(checkIn, nights);
    return {
      id: `${NIGHTS_PREFIX}${nights}`,
      title: s.night(nights).slice(0, ROW_TITLE_MAX),
      description: s.checkOutOn(human(out)).slice(0, ROW_DESCRIPTION_MAX),
    };
  });
  rows.push({ id: NIGHTS_MORE_ID, title: s.longerStay, description: s.longerStayDesc });

  return {
    type: "list",
    body: s.nightsBody(human(checkIn)),
    buttonText: s.nightsButton,
    sections: [{ rows }],
  };
}

/**
 * Resolves a tapped check-in row back to a real Date.
 *
 * Parsed as a plain calendar date rather than an instant: the id is already
 * an India-local day, so letting the server's own timezone reinterpret it
 * would shift the booking by a day for the ~5.5 hours nightly that UTC and
 * IST disagree — the exact failure class india-time.ts exists to prevent.
 * Returns null for anything malformed or already past, never a guess.
 */
export function parseCheckInId(id: string, now: Date = new Date()): Date | null {
  if (!id.startsWith(CHECK_IN_PREFIX)) return null;
  const m = id.slice(CHECK_IN_PREFIX.length).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  // The shape check above is not enough: JavaScript's Date constructor
  // silently ROLLS OVER out-of-range parts rather than rejecting them, so
  // "2026-13-45" becomes a perfectly valid 13 Feb 2027 — a malformed id
  // turning into a plausible future booking nobody chose. Round-tripping the
  // components is what actually rejects it.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  if (d.getTime() < todayMidnightIST(now).getTime()) return null;
  return d;
}

/** Resolves a tapped nights row to a check-out date. Null if it isn't one. */
export function parseNightsId(id: string, checkIn: Date): Date | null {
  if (!id.startsWith(NIGHTS_PREFIX)) return null;
  const n = Number(id.slice(NIGHTS_PREFIX.length));
  if (!Number.isInteger(n) || n < 1 || n > 30) return null;
  return addDays(checkIn, n);
}

/** Human label for a settled stay, for the confirmation line. */
export function describeStay(checkIn: Date, checkOut: Date): string {
  return `${human(checkIn)} → ${human(checkOut)}`;
}

const NIGHT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, che: 6, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10, dus: 10,
};

/**
 * A stay length typed in the guest's own words, once "Longer stay" has sent
 * them to free text: "10 nights", "2 raat", "a week", "10".
 *
 * The escape hatch is worthless if what it leads to can't be understood —
 * the guest would land right back in the prose loop the picker exists to
 * avoid. A bare number is accepted only when we've just asked how many
 * nights, the same restriction extractGuestCount applies to a bare count.
 *
 * Capped at 30: beyond that it's a typo or a long-stay enquiry that wants a
 * human, not a silent month-long booking.
 */
export function parseNightsFromText(text: string, opts: { answeringNightsQuestion?: boolean } = {}): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  const inRange = (n: number) => (Number.isInteger(n) && n >= 1 && n <= 30 ? n : null);

  // "a week" / "one week" / "2 weeks"
  const weeks = t.match(/\b(\d{1,2})\s*(weeks?|hafte|hafta)\b/);
  if (weeks) return inRange(Number(weeks[1]) * 7);
  if (/\b(a|one)\s*(week|hafta)\b/.test(t)) return 7;

  // "10 nights" / "2 raat" / "3 din"
  const digit = t.match(/\b(\d{1,2})\s*(nights?|raat(?:ein|en)?|din|రాత్రు?ల?ు?|रात(?:ें|ों)?)\b/);
  if (digit) return inRange(Number(digit[1]));

  // "ten nights" / "do raat"
  const word = t.match(/\b([a-z]+)\s*(nights?|raat(?:ein|en)?|din)\b/);
  if (word && NIGHT_WORDS[word[1]] !== undefined) return inRange(NIGHT_WORDS[word[1]]);

  // Bare number, only right after being asked.
  if (opts.answeringNightsQuestion) {
    const bare = t.match(/^(\d{1,2})[.!]?$/);
    if (bare) return inRange(Number(bare[1]));
    const bareWord = t.match(/^([a-z]+)[.!]?$/);
    if (bareWord && NIGHT_WORDS[bareWord[1]] !== undefined) return inRange(NIGHT_WORDS[bareWord[1]]);
  }

  return null;
}

/** Check-out for a stay of `nights` from `checkIn`. */
export function checkOutAfterNights(checkIn: Date, nights: number): Date {
  return addDays(checkIn, nights);
}
