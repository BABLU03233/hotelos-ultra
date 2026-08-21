import { TEST_PNID, TEST_SLUG } from "./harness";

/**
 * A complete, self-contained hotel for the suite to run against.
 *
 * Deliberately NOT a clone of whatever happens to be in the database. A test
 * that reads live data passes or fails for reasons that have nothing to do
 * with the code — and the occupancy-tier prices below are the exact shape that
 * caused the price guard to reject the hotel's own rates, so they are pinned
 * here rather than left to chance.
 */
export const HOTEL = {
  name: "E2E Test Hotel",
  address: "Uppal, Hyderabad, Telangana",
  checkInTime: "12:00 PM",
  checkOutTime: "11:00 AM",
  wifiInfo: "Complimentary high-speed Wi-Fi in every room.",
  parkingInfo: "Free covered on-site parking for all guests.",
  cancellationPolicy: "Free cancellation up to 24 hours before check-in.",
  refundPolicy: "Full refund for cancellations within policy.",
  nearbyAttractions: "Close to a major checkpost in Uppal, about 4 km from the nearest metro station.",
  googleMapsUrl: "https://maps.google.com/?q=17.4065,78.4772",
  // Real coordinates so the location-pin path is exercised. Without these the
  // "Where are you?" row is correctly hidden, and the pin would never be
  // tested at all.
  lat: 17.4065,
  lng: 78.4772,
  aiAgentName: "Anushka",
  aiSystemPrompt: "Best-value direct-booking stay in Hyderabad. Always highlight free covered parking.",
};

export const ROOMS = [
  {
    name: "Classic Room",
    type: "Classic",
    price: 999,
    capacity: 2,
    occupancyPrices: [{ guests: 1, price: 999 }, { guests: 2, price: 1299 }],
    // Two real-shaped URLs so the View photos path actually sends something —
    // with an empty array the only branch ever exercised is "no photos".
    imageUrls: ["https://example.test/classic-1.jpg", "https://example.test/classic-2.jpg"],
    description: "Queen comfort with city-view elegance. From ₹999/night for 1 person, ₹1,299/night for 2 persons.",
  },
  {
    name: "Deluxe Room",
    type: "Deluxe",
    price: 1299,
    capacity: 3,
    occupancyPrices: [{ guests: 1, price: 1299 }, { guests: 2, price: 1599 }, { guests: 3, price: 1899 }],
    description: "Signature luxury with city views. From ₹1,299/night for 1 person, ₹1,599 for 2, ₹1,899 for 3.",
  },
  {
    name: "Premium Room",
    type: "Premium",
    price: 1599,
    capacity: 3,
    occupancyPrices: [{ guests: 1, price: 1599 }, { guests: 2, price: 1899 }, { guests: 3, price: 2199 }],
    description: "Larger, made for longer stays. From ₹1,599/night for 1 person, ₹1,899 for 2, ₹2,199 for 3.",
  },
];

export const FAQS = [
  { question: "What time is check-in and check-out?", answer: "Check-in from 12:00 PM, check-out by 11:00 AM." },
  { question: "Is parking available?", answer: "Yes — free covered on-site parking." },
];

export const OFFER = { code: "WELCOME10", title: "10% Off First Stay (WELCOME10)", description: "10% off your first booking", discount: "10% off", active: true };

export interface Fixture {
  tenantId: string;
  roomIds: Record<string, string>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the fixture talks to Prisma generically so it can be reused as the schema grows */
export async function createFixture(prisma: any): Promise<Fixture> {
  await destroyFixture(prisma);

  const { encryptSecret } = await import("@/lib/crypto");
  const tenant = await prisma.tenant.create({
    data: {
      name: HOTEL.name,
      slug: TEST_SLUG,
      whatsappPhoneNumberId: TEST_PNID,
      // Never used: every graph.facebook.com call is intercepted. Present only
      // so getWhatsAppCredentials returns a value and the real send path runs.
      whatsappAccessToken: encryptSecret("e2e-fake-token"),
    },
  });

  await prisma.hotelProfile.create({ data: { ...HOTEL, tenantId: tenant.id, contactPhone: "+91 98765 43210" } });

  const roomIds: Record<string, string> = {};
  for (const room of ROOMS) {
    const created = await prisma.room.create({
      data: { ...room, tenantId: tenant.id, imageUrls: (room as { imageUrls?: string[] }).imageUrls ?? [] },
    });
    roomIds[room.name] = created.id;
  }

  await prisma.offer.create({ data: { ...OFFER, tenantId: tenant.id } });
  for (const faq of FAQS) await prisma.faq.create({ data: { ...faq, tenantId: tenant.id } });

  return { tenantId: tenant.id, roomIds };
}

export async function destroyFixture(prisma: any): Promise<void> {
  // Cascades to contacts, messages, bookings and notifications.
  await prisma.tenant.deleteMany({ where: { slug: TEST_SLUG } });
}

/**
 * Shifts every existing message for a contact backwards in time.
 *
 * The session-restart rule turns on the gap between a guest's last two inbound
 * messages, and the only honest way to test it is to make that gap real.
 */
export async function ageConversation(prisma: any, contactId: string, hours: number): Promise<void> {
  const shift = `${hours} hours`;
  await prisma.$executeRawUnsafe(
    `UPDATE "Message" SET "createdAt" = "createdAt" - INTERVAL '${shift}' WHERE "contactId" = $1`,
    contactId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "Contact" SET "lastInboundAt" = "lastInboundAt" - INTERVAL '${shift}' WHERE id = $1`,
    contactId
  );
}
