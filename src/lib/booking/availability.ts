import { PrismaClient } from "@/generated/prisma/client";

/**
 * Real-time availability check, counting how many of a room type are already
 * taken against how many the hotel says it has (Room.unitCount).
 *
 * This used to assume exactly ONE physical room per type, so a single booking
 * of "Classic Room" for a date range removed Classic from every other guest
 * asking about those dates. A hotel with ten Classic rooms looked sold out
 * after one booking — reported as losing real customers, and it would.
 *
 * unitCount is null by default, meaning inventory is not a constraint and
 * nothing is ever filtered out. That asymmetry is deliberate: a wrong "sold
 * out" costs the entire booking, a wrong "available" costs a conversation at
 * the desk — which is where these bookings are confirmed anyway.
 *
 * Standard date-range overlap: an existing booking counts against a new one if
 * their stay ranges intersect at all.
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
  const room = await prisma.room.findFirst({ where: { id: roomId, tenantId }, select: { unitCount: true } });
  // No stated inventory — the hotel has not told us there is a limit, so we
  // do not invent one.
  if (!room?.unitCount) return true;

  const taken = await prisma.booking.count({
    where: {
      tenantId,
      roomId,
      status: { not: "CANCELLED" },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
  });
  return taken < room.unitCount;
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
  // Only rooms whose hotel has actually stated an inventory can ever be
  // unavailable. Everything else is offerable by definition, so there is
  // nothing to count.
  const limited = await prisma.room.findMany({
    where: { tenantId, unitCount: { not: null } },
    select: { id: true, unitCount: true },
  });
  if (!limited.length) return new Set<string>();

  const conflicts = await prisma.booking.groupBy({
    by: ["roomId"],
    where: {
      tenantId,
      status: { not: "CANCELLED" },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
      roomId: { in: limited.map((r) => r.id) },
    },
    _count: { roomId: true },
  });

  const takenByRoom = new Map(conflicts.map((c) => [c.roomId as string, c._count.roomId]));
  return new Set(limited.filter((r) => (takenByRoom.get(r.id) ?? 0) >= (r.unitCount as number)).map((r) => r.id));
}
