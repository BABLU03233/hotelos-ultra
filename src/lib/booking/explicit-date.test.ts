import { describe, expect, it } from "vitest";
import { explicitDateIsPast, parseBookableExplicitDate, parseExplicitDate } from "./explicit-date";
import { guestDateLooksPast } from "@/lib/ai/date-safety";
import { deservesRealAnswer } from "@/lib/ai/interactive-prompts";
import { resolveTypedRelativeDates } from "./quick-pick-dates";

// 12 Aug 2026, mid-day IST.
const NOW = new Date("2026-08-12T06:00:00Z");

describe("the conversation that exposed this", () => {
  // Live: the app said "just type the date (e.g. 25 Aug)", the guest typed
  // "26jul", and nothing understood it — they got a generic "When are you
  // looking to stay?" instead. The app broke its own promise.
  it("understands the compact spelling the guest actually used", () => {
    const parsed = parseExplicitDate("26jul", NOW);
    expect(parsed?.date.getDate()).toBe(26);
    expect(parsed?.date.getMonth()).toBe(6); // July
  });

  it("treats it as a real answer rather than funnel filler", () => {
    // One word, no question mark, no question word — without an explicit
    // date check this falls straight into the funnel.
    expect(deservesRealAnswer("26jul")).toBe(true);
  });

  it("knows it has already passed", () => {
    expect(explicitDateIsPast("26jul", NOW)).toBe(true);
    expect(guestDateLooksPast("26jul", NOW)).toBe(true);
  });

  it("handles the follow-up spelling with a year attached", () => {
    // "27jul2026" — the month is followed immediately by a digit, so a
    // trailing \b never matched and this was invisible too.
    const parsed = parseExplicitDate("27jul2026", NOW);
    expect(parsed?.date.getFullYear()).toBe(2026);
    expect(parsed?.date.getMonth()).toBe(6);
    expect(parsed?.hadYear).toBe(true);
    expect(guestDateLooksPast("27jul2026", NOW)).toBe(true);
  });
});

describe("parseExplicitDate", () => {
  it("reads day-first spellings, spaced or not", () => {
    for (const s of ["26aug", "26 aug", "26august", "26 August", "26th Aug", "26 Aug 2026"]) {
      const p = parseExplicitDate(s, NOW);
      expect(p?.date.getDate(), s).toBe(26);
      expect(p?.date.getMonth(), s).toBe(7);
    }
  });

  it("reads month-first spellings", () => {
    for (const s of ["aug26", "Aug 26", "August 26th", "Aug 26 2026"]) {
      const p = parseExplicitDate(s, NOW);
      expect(p?.date.getDate(), s).toBe(26);
      expect(p?.date.getMonth(), s).toBe(7);
    }
  });

  it("uses the year when given, and the current year when not", () => {
    expect(parseExplicitDate("1 Jan 2027", NOW)?.date.getFullYear()).toBe(2027);
    expect(parseExplicitDate("1 Jan 2027", NOW)?.hadYear).toBe(true);
    expect(parseExplicitDate("20 Aug", NOW)?.date.getFullYear()).toBe(2026);
    expect(parseExplicitDate("20 Aug", NOW)?.hadYear).toBe(false);
  });

  it("rejects impossible dates instead of rolling them over", () => {
    // JavaScript would silently turn 31 Feb into 3 March.
    expect(parseExplicitDate("31feb", NOW)).toBeNull();
    expect(parseExplicitDate("32 Aug", NOW)).toBeNull();
    expect(parseExplicitDate("0 Aug", NOW)).toBeNull();
  });

  it("does not read ordinary messages as dates", () => {
    for (const s of ["2 people", "ok", "room 204", "may I know the price", "just me", "₹2000"]) {
      expect(parseExplicitDate(s, NOW), s).toBeNull();
    }
  });

  it("stays out of bare numeric dates, which are genuinely ambiguous", () => {
    // "26/7" could be 26 July or 26 Jul depending on convention; guessing is
    // how a guest gets booked on a date they never chose. Named months only.
    expect(parseExplicitDate("26/7", NOW)).toBeNull();
    expect(parseExplicitDate("4/8/2026", NOW)).toBeNull();
  });
});

describe("parseBookableExplicitDate", () => {
  it("resolves a future date", () => {
    expect(parseBookableExplicitDate("26aug", NOW)?.getDate()).toBe(26);
  });

  it("refuses a past date rather than rolling it to next year", () => {
    // "26 Jul" in August is far more often a mistake than an intention to
    // book eleven months out. Returning null sends them back to confirm.
    expect(parseBookableExplicitDate("26jul", NOW)).toBeNull();
    expect(parseBookableExplicitDate("27jul2026", NOW)).toBeNull();
  });

  it("accepts today", () => {
    expect(parseBookableExplicitDate("12 Aug", NOW)).not.toBeNull();
  });
});

describe("typed explicit dates become real bookable ranges", () => {
  it("resolves to a one-night stay, like the tapped rows do", () => {
    const r = resolveTypedRelativeDates("26aug", NOW);
    expect(r?.checkIn.getDate()).toBe(26);
    expect(r?.checkOut.getDate()).toBe(27);
  });

  it("never resolves a past date", () => {
    expect(resolveTypedRelativeDates("26jul", NOW)).toBeNull();
  });

  it("does not shadow the relative phrasings", () => {
    expect(resolveTypedRelativeDates("this weekend", NOW)).not.toBeNull();
    expect(resolveTypedRelativeDates("tomorrow", NOW)?.checkIn.getDate()).toBe(13);
  });
});
