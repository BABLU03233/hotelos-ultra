/**
 * Turns Booking rows into the room × day grid the staff occupancy calendar
 * renders. Pure and DB-free so it's unit-testable; the caller does the query.
 *
 * A stay occupies every night from check-in up to but NOT including
 * check-out — the same half-open interval the availability overlap check
 * uses (`checkIn < otherCheckOut && checkOut > otherCheckIn`). Getting this
 * wrong in either direction is a real operational error: closing the
 * check-out day would show the hotel as full on a day it can still sell,
 * and the calendar would disagree with what Anushka tells guests.
 */

export interface OccupancyBooking {
  id: string;
  roomId: string | null;
  referenceCode: string;
  status: string;
  checkIn: Date | null;
  checkOut: Date | null;
  contactName: string | null;
}

export interface OccupancyCell {
  /** ISO yyyy-mm-dd for this night. */
  date: string;
  booking: OccupancyBooking | null;
  /** True on the first night of a stay — lets the UI label the block once. */
  isStart: boolean;
}

export interface OccupancyRow {
  roomId: string;
  roomName: string;
  cells: OccupancyCell[];
}

/** yyyy-mm-dd in India time — the calendar is for a hotel in Hyderabad, not for the server's timezone. */
export function isoDayIST(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Every yyyy-mm-dd from `start` for `days` nights. */
export function dayRange(start: Date, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(isoDayIST(new Date(start.getTime() + i * 86_400_000)));
  }
  return out;
}

/**
 * Builds the grid. Bookings with no dates (legacy rows, or confirmed before
 * structured dates were captured) occupy nothing — the same NULL-is-not-a-
 * conflict rule availability.ts applies, so the two never disagree about
 * whether a room is free.
 */
export function buildOccupancyGrid(
  rooms: { id: string; name: string }[],
  bookings: OccupancyBooking[],
  days: string[]
): OccupancyRow[] {
  const active = bookings.filter((b) => b.status !== "CANCELLED" && b.roomId && b.checkIn && b.checkOut);

  return rooms.map((room) => {
    const mine = active.filter((b) => b.roomId === room.id);
    const cells = days.map((date) => {
      const booking =
        mine.find((b) => {
          const from = isoDayIST(b.checkIn!);
          const to = isoDayIST(b.checkOut!);
          // Half-open: the check-out day is free to sell again.
          return date >= from && date < to;
        }) ?? null;
      const isStart = booking ? isoDayIST(booking.checkIn!) === date : false;
      return { date, booking, isStart };
    });
    return { roomId: room.id, roomName: room.name, cells };
  });
}

/** Share of room-nights sold across the window — the one number worth showing above the grid. */
export function occupancyRate(rows: OccupancyRow[]): number {
  const total = rows.reduce((n, r) => n + r.cells.length, 0);
  if (!total) return 0;
  const sold = rows.reduce((n, r) => n + r.cells.filter((c) => c.booking).length, 0);
  return Math.round((sold / total) * 100);
}
