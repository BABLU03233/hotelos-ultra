import { PrismaClient } from "@/generated/prisma/client";

/**
 * Real-time availability check for one physical room per room type (per the
 * hotel's confirmed inventory model -- no quantity/unit counting needed).
 * Standard date-range overlap: an existing booking blocks a new one if their
 * stay ranges intersect at all.
 *
 * Legacy/undated Booking rows (created before checkIn/checkOut existed, or
 * confirmed without structured dates ever being captured) are automatically
 * excluded via SQL NULL semantics -- `NULL < x` is NULL (falsy), so they
 * never block a room. Correct default: an unknown-dates booking shouldn't
 * block the room forever.
 *
 * Known, accepted limitation: a TOCTOU race if two guests tap "Confirm
 * booking" for the same room/overlapping dates within milliseconds of each
 * other. Acceptable for this domain (one small hotel, WhatsApp-paced
 * traffic), consistent with completeBooking's own idempotency window
 * already being best-effort rather than a hard lock.
 */
export async function isRoomAvailable(prisma: PrismaClient, tenantId: string, roomId: string, checkIn: Date, checkOut: Date): Promise<boolean> {
  const conflict = await prisma.booking.findFirst({
    where: {
      tenantId,
      roomId,
      status: { not: "CANCELLED" },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
  });
  return !conflict;
}

/**
 * Every room already taken for a date range, in one query — the same overlap
 * rule as isRoomAvailable above, asked for the whole inventory at once
 * instead of once per room.
 *
 * This exists because availability used to be consulted at exactly one
 * moment: the "Confirm booking" tap, i.e. after the guest had already been
 * shown a room, sent its photos, agreed dates, and committed. Everything
 * before that point was a promise the hotel might not be able to keep, and
 * the clash surfaced at the single worst moment in the conversation. Knowing
 * the taken set up front lets the recommendation itself be honest — the
 * booking either can't be offered, or it can be kept.
 *
 * Returns a Set of roomIds to avoid an N+1 across the room list, and because
 * every caller wants membership tests rather than the rows themselves.
 */
export async function findUnavailableRoomIds(
  prisma: PrismaClient,
  tenantId: string,
  checkIn: Date,
  checkOut: Date
): Promise<Set<string>> {
  const conflicts = await prisma.booking.findMany({
    where: {
      tenantId,
      status: { not: "CANCELLED" },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
      roomId: { not: null },
    },
    select: { roomId: true },
    distinct: ["roomId"],
  });
  return new Set(conflicts.map((c) => c.roomId).filter((id): id is string => id !== null));
}
