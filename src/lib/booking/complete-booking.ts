import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { fireBookingNotification } from "@/lib/contacts/fire-booking-notification";
import { HANDOVER_REASON, takeOverFields } from "@/lib/crm/handover";
import { todayMidnightIST } from "@/lib/india-time";
import { derivePrefix, randomReferenceCode } from "./reference-code";

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 6;

/** True for a Prisma unique-constraint violation (P2002) — duck-typed rather than an instanceof check, since that's robust regardless of exactly how this custom generator re-exports its error classes. */
function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

export interface BookingExtras {
  roomId?: string;
  roomNameSnapshot?: string;
  checkIn?: Date;
  checkOut?: Date;
  offerId?: string;
  offerSnapshot?: string;
}

async function createBookingWithUniqueCode(
  prisma: PrismaClient,
  tenantId: string,
  contactId: string,
  prefix: string,
  summary: string | null,
  extras: BookingExtras
) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await prisma.booking.create({
        data: { tenantId, contactId, referenceCode: randomReferenceCode(prefix), summary, ...extras },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) continue; // code collision, retry with a fresh random suffix
      throw err;
    }
  }
  throw new Error(`Could not generate a unique booking reference code for tenant ${tenantId} after ${MAX_CODE_ATTEMPTS} attempts`);
}

/**
 * Completes a booking from the AI-driven "Confirm booking" tap: generates a
 * unique reference code, updates Contact.bookingStatus/leadStatus, and fires
 * the same StaffNotification the manual CRM path already uses.
 *
 * `extra` carries whatever real-time-availability state the caller already
 * verified (room, dates, matched offer) — this function stays a pure
 * "create the booking" boundary and never decides *whether* to book;
 * handle-inbound-message.ts is the orchestration layer that runs the
 * availability check and decides that before ever calling this.
 *
 * Idempotent within a 5-minute window — WhatsApp buttons aren't single-use,
 * so a guest tapping "Confirm booking" twice produces two distinct message
 * ids that sail past the normal whatsappMessageId dedup check; without this,
 * a double-tap would create two Booking rows and fire two notifications.
 */
export class PastDateBookingError extends Error {
  constructor(readonly checkIn: Date) {
    super(`Refusing to create a booking with a check-in already in the past: ${checkIn.toISOString()}`);
    this.name = "PastDateBookingError";
  }
}

export async function completeBooking(
  prisma: PrismaClient,
  tenantId: string,
  contactId: string,
  extra?: { roomId?: string; checkIn?: Date; checkOut?: Date; offerId?: string; offerSnapshot?: string }
): Promise<Prisma.BookingGetPayload<object>> {
  // The one hard, unconditional stop against booking a date that has
  // already gone.
  //
  // Every INPUT path had a past-date check — the AI's DATES: marker, the
  // date-picker tap, the quick-picks — and this function, the only place
  // that actually creates a Booking, had none. It documents itself above as
  // never deciding *whether* to book, and that was the gap: a check spread
  // across five callers is five chances to miss one, and a past-date
  // booking was reported live. This is not a policy decision, it is an
  // invariant: there is no caller, present or future, for which creating a
  // stay that started in the past is correct.
  //
  // Throws rather than silently correcting, because every sensible recovery
  // (ask for new dates, escalate) needs conversational context this
  // boundary deliberately doesn't have. Callers catch it and reopen the
  // date picker; see attemptBookingCompletion.
  if (extra?.checkIn && extra.checkIn.getTime() < todayMidnightIST().getTime()) {
    throw new PastDateBookingError(extra.checkIn);
  }

  // The idempotency window must ignore CANCELLED rows. Without that filter a
  // guest who cancels and immediately rebooks gets handed the cancelled
  // booking straight back — same reference code, status CANCELLED — so they
  // believe they hold a reservation that does not exist and that frees the
  // room for someone else. Caught by an end-to-end test the moment
  // cancellation became reachable; before that, nothing could be cancelled
  // inside the window, so the filter was never needed.
  const recent = await prisma.booking.findFirst({
    where: { tenantId, contactId, status: { not: "CANCELLED" }, createdAt: { gte: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) return recent;

  const [contact, profile, room] = await Promise.all([
    prisma.contact.findUniqueOrThrow({ where: { id: contactId } }),
    prisma.hotelProfile.findUnique({ where: { tenantId } }),
    extra?.roomId ? prisma.room.findUnique({ where: { id: extra.roomId } }) : Promise.resolve(null),
  ]);

  const extras: BookingExtras = {
    roomId: extra?.roomId,
    roomNameSnapshot: room?.name,
    checkIn: extra?.checkIn,
    checkOut: extra?.checkOut,
    offerId: extra?.offerId,
    offerSnapshot: extra?.offerSnapshot,
  };
  const booking = await createBookingWithUniqueCode(prisma, tenantId, contactId, derivePrefix(profile), contact.aiSummary, extras);

  await prisma.contact.update({
    where: { id: contactId },
    // pendingGuestCount is cleared alongside the rest of the negotiation
    // state: Contact is a durable per-phone record a repeat guest reuses
    // across stays, so a party size carried over from a completed booking
    // would make Anushka silently assume next year's trip has the same
    // number of people — worse than simply asking again on a fresh enquiry.
    data: {
      bookingStatus: "PENDING",
      leadStatus: "BOOKED",
      pendingRoomId: null,
      pendingCheckIn: null,
      pendingCheckOut: null,
      pendingGuestCount: null,
      // Hand the conversation to a person the moment a booking exists.
      //
      // Everything after this point is human work — taking payment, checking
      // an ID, agreeing an arrival time, honouring a request Anushka has no
      // authority over. She is explicitly forbidden from taking payment or
      // quoting a binding rate, so leaving her in charge of a booked guest
      // means the one conversation that has already produced revenue is the
      // one nobody is watching.
      //
      // Not a pause: a pause expires after twelve hours and would put her back
      // in the middle of a settled booking overnight. See handover.ts.
      ...takeOverFields(HANDOVER_REASON.BOOKED),
    },
  });

  await fireBookingNotification(
    prisma,
    tenantId,
    contactId,
    `${contact.name || contact.phone} just booked via WhatsApp! Ref ${booking.referenceCode} 🎉${contact.aiSummary ? ` — ${contact.aiSummary}` : ""}`
  );

  return booking;
}
