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
