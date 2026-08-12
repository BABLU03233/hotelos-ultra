import { PrismaClient } from "@/generated/prisma/client";

/**
 * Looking up and changing a booking the guest already has.
 *
 * Until now a guest who had booked could not do anything about it over
 * WhatsApp. "cancel my booking" was recognised only in the negative — enough
 * to stop it being hijacked into a NEW booking funnel — after which it fell
 * to the model, which can only escalate to a human. Every completed booking
 * was therefore a future support call, which is the opposite of what an
 * always-on concierge is for.
 *
 * Cancellation is deliberately a status change, never a delete: the row is
 * the hotel's record of what was agreed, and staff need to see that a
 * booking existed and was called off. availability.ts already excludes
 * CANCELLED rows, so cancelling frees the room the moment it happens.
 */

export const CANCEL_BOOKING_ID = "booking_cancel";
export const CHANGE_DATES_ID = "booking_change_dates";
export const KEEP_BOOKING_ID = "booking_keep";

export interface ActiveBooking {
  id: string;
  referenceCode: string;
  roomId: string | null;
  roomNameSnapshot: string | null;
  checkIn: Date | null;
  checkOut: Date | null;
}

/**
 * The booking this guest would mean by "my booking".
 *
 * The most recently created one that isn't cancelled — a repeat guest can
 * have several over time, and the newest is overwhelmingly the one being
 * discussed. Returns null when there's nothing to manage, which the caller
 * treats as "let the AI handle it" rather than inventing a booking.
 */
export async function findActiveBooking(prisma: PrismaClient, tenantId: string, contactId: string): Promise<ActiveBooking | null> {
  const booking = await prisma.booking.findFirst({
    where: { tenantId, contactId, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, referenceCode: true, roomId: true, roomNameSnapshot: true, checkIn: true, checkOut: true },
  });
  return booking;
}

/**
 * Cancels it, and clears the contact's booking state so the guest is a
 * normal enquiry again rather than permanently "BOOKED".
 *
 * leadStatus goes back to INTERESTED, not NEW: they've been through the
 * whole funnel and are a warm lead, not a stranger — and follow-up rules key
 * off lead status, so calling them NEW would restart a nurture sequence
 * aimed at someone who has never spoken to the hotel.
 */
export async function cancelBooking(prisma: PrismaClient, tenantId: string, contactId: string, bookingId: string): Promise<void> {
  await prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      bookingStatus: "NONE",
      leadStatus: "INTERESTED",
      pendingRoomId: null,
      pendingCheckIn: null,
      pendingCheckOut: null,
    },
  });
}

/**
 * Starts a date change: cancels the existing booking and carries its room
 * forward as the pending choice, so the guest only has to pick new dates.
 *
 * Cancelling first is what frees the old dates for availability — leaving
 * the original active would have the guest competing with their own booking
 * for the room they're trying to move.
 */
export async function beginReschedule(prisma: PrismaClient, tenantId: string, contactId: string, booking: ActiveBooking): Promise<void> {
  await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      bookingStatus: "NONE",
      leadStatus: "INTERESTED",
      pendingRoomId: booking.roomId,
      pendingCheckIn: null,
      pendingCheckOut: null,
    },
  });
}
