import { describe, expect, it } from "vitest";
import { currentHourIST, dateFieldsIST, todayMidnightIST } from "./india-time";

describe("currentHourIST", () => {
  it("reproduces the exact live-reported bug: 08:32 UTC is 2pm in India, not 8am", () => {
    const utc0832 = new Date(Date.UTC(2026, 7, 10, 8, 32));
    expect(currentHourIST(utc0832)).toBe(14);
  });

  it("handles the midnight-rollover window: UTC evening is already the next IST day", () => {
    // 20:00 UTC on Aug 9 = 01:30 IST on Aug 10 -- the exact ~5.5-hour daily
    // window where a bare `new Date().getHours()`/getDate() on a UTC server
    // would be wrong, the same failure class as the original past-date bug.
    const utcEvening = new Date(Date.UTC(2026, 7, 9, 20, 0));
    expect(currentHourIST(utcEvening)).toBe(1);
  });

  it("never returns 24 at the exact IST midnight boundary", () => {
    // 18:30 UTC = 00:00 IST exactly.
    const exactMidnight = new Date(Date.UTC(2026, 7, 9, 18, 30));
    expect(currentHourIST(exactMidnight)).toBe(0);
  });
});

describe("dateFieldsIST", () => {
  it("matches the UTC calendar date when well within the overlapping window", () => {
    const utc0832 = new Date(Date.UTC(2026, 7, 10, 8, 32));
    expect(dateFieldsIST(utc0832)).toEqual({ year: 2026, month: 8, day: 10 });
  });

  it("is already the next day in IST while UTC is still on the previous day", () => {
    const utcEvening = new Date(Date.UTC(2026, 7, 9, 20, 0)); // Aug 9 UTC
    expect(dateFieldsIST(utcEvening)).toEqual({ year: 2026, month: 8, day: 10 }); // Aug 10 IST
  });

  it("is still the same day one minute before the IST midnight rollover", () => {
    const justBefore = new Date(Date.UTC(2026, 7, 9, 18, 29));
    expect(dateFieldsIST(justBefore)).toEqual({ year: 2026, month: 8, day: 9 });
  });
});

describe("todayMidnightIST", () => {
  it("returns the correct IST calendar date even during the UTC-previous-day window", () => {
    const utcEvening = new Date(Date.UTC(2026, 7, 9, 20, 0));
    const midnight = todayMidnightIST(utcEvening);
    expect(midnight.getFullYear()).toBe(2026);
    expect(midnight.getMonth()).toBe(7); // August, 0-indexed
    expect(midnight.getDate()).toBe(10);
  });

  it("is usable for a same-method date-range comparison (checkIn already passed)", () => {
    const utcEvening = new Date(Date.UTC(2026, 7, 9, 20, 0)); // IST: Aug 10, 1:30am
    const midnight = todayMidnightIST(utcEvening);
    const guestSaidAug9 = new Date(2026, 7, 9); // a check-in date the guest typed, already IST-Aug-10 by now
    expect(guestSaidAug9.getTime() < midnight.getTime()).toBe(true);
  });
});
