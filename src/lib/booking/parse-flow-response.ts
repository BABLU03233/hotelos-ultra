import { todayMidnightIST } from "@/lib/india-time";

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Defensive parser for a WhatsApp Flow CalendarPicker (range mode)'s
 * submitted value -- the exact shape Meta sends hasn't been confirmed
 * against a real payload yet (see booking-flow.ts), so this tries several
 * plausible shapes rather than assuming one: an object with start/end (or
 * start_date/end_date, or from/to) keys, or a "start,end" / "start to end"
 * string. Returns null on anything it can't confidently parse into two
 * valid, ordered dates -- fail-soft, same philosophy as every other new
 * capture point this session: a miss just means the guest falls through to
 * the normal AI queue instead of a wrong or silently broken booking.
 */
export function parseFlowDateRange(raw: unknown): { checkIn: Date; checkOut: Date } | null {
  let startStr: string | undefined;
  let endStr: string | undefined;

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    startStr = asString(obj.start ?? obj.start_date ?? obj.from);
    endStr = asString(obj.end ?? obj.end_date ?? obj.to);
  } else if (typeof raw === "string") {
    const parts = raw
      .split(/,| to /)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 2) [startStr, endStr] = parts;
  }

  if (!startStr || !endStr) return null;
  const checkIn = new Date(startStr);
  const checkOut = new Date(endStr);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return null;
  if (checkOut.getTime() <= checkIn.getTime()) return null;
  // Every other date-capture path rejects a past check-in (the DATES:
  // marker, the picker taps, the quick-picks) and this one didn't — a gap
  // that mattered because a Flow submission goes straight to booking
  // completion with no conversational turn in between to catch it. India's
  // calendar date, not the server's: for ~5.5 hours nightly UTC is still on
  // yesterday, which would reject a genuinely valid same-day booking.
  if (checkIn.getTime() < todayMidnightIST().getTime()) return null;
  return { checkIn, checkOut };
}
