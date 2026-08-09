import { describe, expect, it } from "vitest";
import { resolveQuickPickDates } from "./quick-pick-dates";

// Fixed "now" values for deterministic tests, same convention as date-safety.test.ts.
const SUNDAY = new Date(2026, 7, 9); // Sun, 9 Aug 2026
const MONDAY = new Date(2026, 7, 10); // Mon, 10 Aug 2026
const SATURDAY = new Date(2026, 7, 15); // Sat, 15 Aug 2026

describe("resolveQuickPickDates", () => {
  it("resolves 'this weekend' to the upcoming Saturday-to-Sunday, from a Sunday", () => {
    const { checkIn, checkOut, label } = resolveQuickPickDates("dates_weekend", SUNDAY);
    expect(checkIn).toEqual(new Date(2026, 7, 15));
    expect(checkOut).toEqual(new Date(2026, 7, 16));
    expect(label).toContain("This weekend");
  });

  it("allows a same-day match for 'this weekend' when today already IS Saturday", () => {
    const { checkIn, checkOut } = resolveQuickPickDates("dates_weekend", SATURDAY);
    expect(checkIn).toEqual(new Date(2026, 7, 15));
    expect(checkOut).toEqual(new Date(2026, 7, 16));
  });

  it("resolves 'next week' to the upcoming Monday-to-Tuesday when today isn't Monday", () => {
    const { checkIn, checkOut, label } = resolveQuickPickDates("dates_nextweek", SUNDAY);
    expect(checkIn).toEqual(new Date(2026, 7, 10));
    expect(checkOut).toEqual(new Date(2026, 7, 11));
    expect(label).toContain("Next week");
  });

  it("skips to the FOLLOWING Monday for 'next week' when today already IS Monday (never today)", () => {
    const { checkIn, checkOut } = resolveQuickPickDates("dates_nextweek", MONDAY);
    expect(checkIn).toEqual(new Date(2026, 7, 17));
    expect(checkOut).toEqual(new Date(2026, 7, 18));
  });

  it("always resolves to a 1-night stay", () => {
    const weekend = resolveQuickPickDates("dates_weekend", SUNDAY);
    const nextWeek = resolveQuickPickDates("dates_nextweek", SUNDAY);
    expect(weekend.checkOut.getTime() - weekend.checkIn.getTime()).toBe(86_400_000);
    expect(nextWeek.checkOut.getTime() - nextWeek.checkIn.getTime()).toBe(86_400_000);
  });

  it("includes a human-readable date range in the label", () => {
    const { label } = resolveQuickPickDates("dates_weekend", SUNDAY);
    expect(label).toContain("Sat");
    expect(label).toContain("15 Aug");
    expect(label).toContain("Sun");
    expect(label).toContain("16 Aug");
  });
});
