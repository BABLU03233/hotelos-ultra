import { describe, expect, it } from "vitest";
import { guestDateLooksPast } from "./date-safety";

// Fixed "today" for deterministic tests: Sunday, 9 August 2026.
const TODAY = new Date(2026, 7, 9);

describe("guestDateLooksPast", () => {
  it("catches the exact real incident: '4/8/2026' read day-first is already 5 days in the past", () => {
    expect(guestDateLooksPast("4/8/2026", TODAY)).toBe(true);
    expect(guestDateLooksPast("Can we check in on 4/8/2026?", TODAY)).toBe(true);
  });

  it("does not flag a clearly future date", () => {
    expect(guestDateLooksPast("25/12/2026", TODAY)).toBe(false);
    expect(guestDateLooksPast("15/8/2026", TODAY)).toBe(false);
  });

  it("handles dates with no year, defaulting to the current year", () => {
    expect(guestDateLooksPast("4/8", TODAY)).toBe(true); // Aug 4 this year, already passed
    expect(guestDateLooksPast("25/12", TODAY)).toBe(false); // Dec 25 this year, still ahead
  });

  it("handles a 2-digit year", () => {
    expect(guestDateLooksPast("4/8/26", TODAY)).toBe(true);
    expect(guestDateLooksPast("25/12/26", TODAY)).toBe(false);
  });

  it("accepts dash separators too", () => {
    expect(guestDateLooksPast("4-8-2026", TODAY)).toBe(true);
  });

  it("does not flag today itself as past", () => {
    expect(guestDateLooksPast("9/8/2026", TODAY)).toBe(false);
  });

  it("does not flag yesterday vs today boundary incorrectly -- catches yesterday", () => {
    expect(guestDateLooksPast("8/8/2026", TODAY)).toBe(true);
  });

  it("returns false for an implausible day-first date (month > 12) rather than guessing", () => {
    // "12/25" would only make sense as month-first (Dec 25); day-first it's
    // an invalid month, so this deliberately narrow check declines to guess.
    expect(guestDateLooksPast("12/25", TODAY)).toBe(false);
  });

  it("returns false when there's no numeric date in the text at all", () => {
    expect(guestDateLooksPast("this weekend works for us", TODAY)).toBe(false);
    expect(guestDateLooksPast("hello!", TODAY)).toBe(false);
  });

  it("returns false for an out-of-range day", () => {
    expect(guestDateLooksPast("35/8/2026", TODAY)).toBe(false);
  });
});
