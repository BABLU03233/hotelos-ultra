import { describe, expect, it } from "vitest";
import { buildOccupancyGrid, dayRange, isoDayIST, occupancyRate, type OccupancyBooking } from "./occupancy";

const ROOMS = [
  { id: "r1", name: "Classic Room" },
  { id: "r2", name: "Deluxe Room" },
];

// 06:00 UTC = 11:30 IST — safely mid-day, so no timezone boundary ambiguity.
const START = new Date("2026-09-10T06:00:00Z");
const DAYS = dayRange(START, 5); // 10th .. 14th

function booking(over: Partial<OccupancyBooking> = {}): OccupancyBooking {
  return {
    id: "b1",
    roomId: "r1",
    referenceCode: "HOT-1234",
    status: "PENDING",
    checkIn: new Date("2026-09-11T06:00:00Z"),
    checkOut: new Date("2026-09-13T06:00:00Z"),
    contactName: "Asha",
    ...over,
  };
}

describe("buildOccupancyGrid", () => {
  it("occupies every night of the stay except the check-out day", () => {
    const [classic] = buildOccupancyGrid(ROOMS, [booking()], DAYS);
    expect(classic.cells.map((c) => Boolean(c.booking))).toEqual([false, true, true, false, false]);
  });

  it("marks only the first night as the start of the block", () => {
    const [classic] = buildOccupancyGrid(ROOMS, [booking()], DAYS);
    expect(classic.cells.map((c) => c.isStart)).toEqual([false, true, false, false, false]);
  });

  it("leaves other rooms untouched", () => {
    const [, deluxe] = buildOccupancyGrid(ROOMS, [booking()], DAYS);
    expect(deluxe.cells.every((c) => c.booking === null)).toBe(true);
  });

  it("ignores cancelled bookings — a cancelled room is sellable", () => {
    const rows = buildOccupancyGrid(ROOMS, [booking({ status: "CANCELLED" })], DAYS);
    expect(rows[0].cells.every((c) => c.booking === null)).toBe(true);
  });

  it("ignores bookings with no dates, exactly as the availability check does", () => {
    const rows = buildOccupancyGrid(ROOMS, [booking({ checkIn: null, checkOut: null })], DAYS);
    expect(rows[0].cells.every((c) => c.booking === null)).toBe(true);
  });

  it("ignores bookings with no room", () => {
    const rows = buildOccupancyGrid(ROOMS, [booking({ roomId: null })], DAYS);
    expect(rows.every((r) => r.cells.every((c) => c.booking === null))).toBe(true);
  });

  it("lets a back-to-back stay start the day the previous one checks out", () => {
    // The check-out day is free, so this must NOT read as a double-booking.
    const first = booking({ id: "b1", checkIn: new Date("2026-09-10T06:00:00Z"), checkOut: new Date("2026-09-12T06:00:00Z") });
    const second = booking({ id: "b2", checkIn: new Date("2026-09-12T06:00:00Z"), checkOut: new Date("2026-09-14T06:00:00Z") });
    const [classic] = buildOccupancyGrid(ROOMS, [first, second], DAYS);
    expect(classic.cells.map((c) => c.booking?.id ?? null)).toEqual(["b1", "b1", "b2", "b2", null]);
    expect(classic.cells.map((c) => c.isStart)).toEqual([true, false, true, false, false]);
  });
});

describe("occupancyRate", () => {
  it("is the share of room-nights sold", () => {
    // 2 rooms × 5 nights = 10; the booking sells 2 of them.
    expect(occupancyRate(buildOccupancyGrid(ROOMS, [booking()], DAYS))).toBe(20);
  });

  it("is 0 with nothing booked and 0 with no rooms at all", () => {
    expect(occupancyRate(buildOccupancyGrid(ROOMS, [], DAYS))).toBe(0);
    expect(occupancyRate(buildOccupancyGrid([], [booking()], DAYS))).toBe(0);
  });
});

describe("isoDayIST", () => {
  it("uses India's calendar date, not the server's", () => {
    // 20:00 UTC on the 9th is already 01:30 IST on the 10th — the ~5.5-hour
    // window where a server-local date would be a day behind the hotel.
    expect(isoDayIST(new Date("2026-09-09T20:00:00Z"))).toBe("2026-09-10");
  });
});

describe("dayRange", () => {
  it("returns consecutive days from the start", () => {
    expect(dayRange(START, 3)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
  });
});
