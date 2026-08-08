import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { fireBookingNotification } from "@/lib/contacts/fire-booking-notification";
import { derivePrefix, randomReferenceCode } from "./reference-code";

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 6;

/** True for a Prisma unique-constraint violation (P2002) — duck-typed rather than an instanceof check, since that's robust regardless of exactly how this custom generator re-exports its error classes. */
function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

async function createBookingWithUniqueCode(
  prisma: PrismaClient,
  tenantId: string,
  contactId: string,
  prefix: string,
  summary: string | null
) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await prisma.booking.create({
        data: { tenantId, contactId, referenceCode: randomReferenceCode(prefix), summary },
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
 * Idempotent within a 5-minute window — WhatsApp buttons aren't single-use,
 * so a guest tapping "Confirm booking" twice produces two distinct message
 * ids that sail past the normal whatsappMessageId dedup check; without this,
 * a double-tap would create two Booking rows and fire two notifications.
 */
export async function completeBooking(prisma: PrismaClient, tenantId: string, contactId: string): Promise<Prisma.BookingGetPayload<object>> {
  const recent = await prisma.booking.findFirst({
    where: { tenantId, contactId, createdAt: { gte: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) return recent;

  const [contact, profile] = await Promise.all([
    prisma.contact.findUniqueOrThrow({ where: { id: contactId } }),
    prisma.hotelProfile.findUnique({ where: { tenantId } }),
  ]);

  const booking = await createBookingWithUniqueCode(prisma, tenantId, contactId, derivePrefix(profile), contact.aiSummary);

  await prisma.contact.update({ where: { id: contactId }, data: { bookingStatus: "PENDING", leadStatus: "BOOKED" } });

  await fireBookingNotification(
    prisma,
    tenantId,
    contactId,
    `${contact.name || contact.phone} just booked via WhatsApp! Ref ${booking.referenceCode} 🎉${contact.aiSummary ? ` — ${contact.aiSummary}` : ""}`
  );

  return booking;
}
