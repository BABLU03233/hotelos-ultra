import { describe, expect, it } from "vitest";
import { completeBooking, PastDateBookingError } from "./complete-booking";
import { parseFlowDateRange } from "./parse-flow-response";
import { guestDateLooksPast } from "@/lib/ai/date-safety";
import { hasStatedDates } from "@/lib/ai/interactive-prompts";
import { todayMidnightIST } from "@/lib/india-time";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * A guest naming a date that has already gone was carried forward through
 * the funnel and booked. These cover every layer that had to fail for that
 * to happen, so no single regression can reopen it.
 */

const YESTERDAY = new Date(todayMidnightIST().getTime() - 86_400_000);
const LAST_WEEK = new Date(todayMidnightIST().getTime() - 7 * 86_400_000);
const TOMORROW = new Date(todayMidnightIST().getTime() + 86_400_000);
const NEXT_WEEK = new Date(todayMidnightIST().getTime() + 7 * 86_400_000);

function iso(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

describe("layer 1 — completeBooking refuses outright", () => {
  // The backstop. Every input path had a check and the one place that
  // creates the Booking row had none, so any missed caller booked a past
  // stay silently.
  const prisma = {} as PrismaClient;

  it("throws rather than creating a stay that already started", async () => {
    await expect(
      completeBooking(prisma, "t1", "c1", { roomId: "r1", checkIn: YESTERDAY, checkOut: TOMORROW })
    ).rejects.toBeInstanceOf(PastDateBookingError);
  });

  it("refuses a stay entirely in the past", async () => {
    await expect(completeBooking(prisma, "t1", "c1", { checkIn: LAST_WEEK, checkOut: YESTERDAY })).rejects.toBeInstanceOf(
      PastDateBookingError
    );
  });

  it("refuses before touching the database at all", async () => {
    // Proven by passing an empty client: reaching any query would throw a
    // different error than PastDateBookingError.
    const err = await completeBooking(prisma, "t1", "c1", { checkIn: YESTERDAY }).catch((e) => e);
    expect(err).toBeInstanceOf(PastDateBookingError);
  });

  it("allows today — a same-day booking is legitimate", async () => {
    // Reaches the DB and fails there, which proves the guard let it through.
    const err = await completeBooking(prisma, "t1", "c1", { checkIn: todayMidnightIST() }).catch((e) => e);
    expect(err).not.toBeInstanceOf(PastDateBookingError);
  });
});

describe("layer 2 — a past date is never 'dates known'", () => {
  it("does not treat a past date as a usable answer", () => {
    // Counting it as settled is what stopped the waterfall asking again and
    // marched the guest onward toward booking it.
    expect(hasStatedDates([], `${iso(YESTERDAY).slice(8)}/${iso(YESTERDAY).slice(5, 7)}`)).toBe(false);
  });

  it("still accepts a genuine future date", () => {
    expect(hasStatedDates([], "next week")).toBe(true);
    expect(hasStatedDates([], "this weekend")).toBe(true);
  });
});

describe("layer 3 — past-date detection covers how guests actually write dates", () => {
  const NOW = new Date("2026-08-12T06:00:00Z"); // 12 Aug 2026, IST mid-day

  it("catches numeric day-first dates", () => {
    expect(guestDateLooksPast("4/8/2026", NOW)).toBe(true);
    expect(guestDateLooksPast("5-8", NOW)).toBe(true);
  });

  it("catches month-name dates, which were previously invisible", () => {
    // The original check reasoned that month-name dates aren't ambiguous so
    // were out of scope — true, and beside the point: an unambiguous date
    // can still be firmly in the past.
    expect(guestDateLooksPast("5 August", NOW)).toBe(true);
    expect(guestDateLooksPast("5th Aug", NOW)).toBe(true);
    expect(guestDateLooksPast("Aug 3", NOW)).toBe(true);
    expect(guestDateLooksPast("book for 1st August", NOW)).toBe(true);
  });

  it("does not flag future dates", () => {
    expect(guestDateLooksPast("20 August", NOW)).toBe(false);
    expect(guestDateLooksPast("25/8", NOW)).toBe(false);
    expect(guestDateLooksPast("5 September", NOW)).toBe(false);
    expect(guestDateLooksPast("12 August", NOW)).toBe(false); // today
  });

  it("does not read an ordinary sentence as a date", () => {
    // "may" is a month name and an everyday word — flagging it would send
    // guests to the date picker mid-question.
    expect(guestDateLooksPast("may I know the price?", NOW)).toBe(false);
    expect(guestDateLooksPast("what time is check-in?", NOW)).toBe(false);
    expect(guestDateLooksPast("2 people", NOW)).toBe(false);
  });
});

describe("layer 4 — the Flow parser rejects a past range", () => {
  // A Flow submission goes straight to booking completion with no
  // conversational turn in between, so this was the least forgiving gap.
  it("rejects a past check-in", () => {
    expect(parseFlowDateRange({ start: iso(LAST_WEEK), end: iso(YESTERDAY) })).toBeNull();
  });

  it("accepts a future range", () => {
    const parsed = parseFlowDateRange({ start: iso(TOMORROW), end: iso(NEXT_WEEK) });
    expect(parsed).not.toBeNull();
  });

  it("still rejects an inverted range", () => {
    expect(parseFlowDateRange({ start: iso(NEXT_WEEK), end: iso(TOMORROW) })).toBeNull();
  });
});
