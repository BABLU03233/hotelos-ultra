import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SEED_OWNER_EMAIL = "anumanadlarakesh@gmail.com";
const SEED_OWNER_PASSWORD = "ChangeMe123!";
const SEED_ADMIN_PASSWORD = "ChangeMeAdmin123!";

async function seedPlatformAdmin() {
  const existingAdmin = await prisma.platformAdmin.findUnique({ where: { email: SEED_OWNER_EMAIL } });
  if (existingAdmin) {
    console.log("Platform admin already seeded — skipping.");
    return;
  }
  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
  await prisma.platformAdmin.create({
    data: { name: "Rakesh", email: SEED_OWNER_EMAIL, passwordHash },
  });
  console.log(`Seeded platform admin. Login at /admin/login: ${SEED_OWNER_EMAIL} / ${SEED_ADMIN_PASSWORD}`);
}

async function main() {
  await seedPlatformAdmin();

  const existing = await prisma.tenant.findUnique({ where: { slug: "hotel-ivory-towers" } });
  if (existing) {
    console.log("Hotel Ivory Towers tenant already seeded — skipping (delete it first to reseed).");
    return;
  }

  const passwordHash = await bcrypt.hash(SEED_OWNER_PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: {
      name: "Hotel Ivory Towers",
      slug: "hotel-ivory-towers",
      subscriptionStatus: "TRIAL",
      users: {
        create: {
          name: "Rakesh",
          email: SEED_OWNER_EMAIL,
          passwordHash,
          role: "OWNER",
        },
      },
      // Real data pulled from hotelivorytower.com (their live site's own bundled
      // content — see chat history for the extraction method) so Aria's
      // knowledge base reflects the actual property, not a fictional demo.
      hotelProfile: {
        create: {
          name: "Hotel Ivory Towers",
          address: "Uppal, Hyderabad, Telangana",
          lat: 17.3917,
          lng: 78.5531,
          checkInTime: "12:00 PM",
          checkOutTime: "11:00 AM",
          wifiInfo: "Complimentary high-speed Wi-Fi in every room.",
          parkingInfo: "Free covered on-site parking for all guests.",
          restaurantInfo: null,
          cancellationPolicy:
            "Cancellation and change terms are confirmed with our front desk at the time of booking — message us on WhatsApp before booking if you'd like the details for your dates.",
          refundPolicy: null,
          nearbyAttractions: "Close to a major checkpost in Uppal, and about 4 km from the nearest metro station.",
          businessHours: "Front desk staffed 24/7 — reachable by WhatsApp any time.",
          aiSystemPrompt:
            "We're the best and most affordable direct-booking stay in Hyderabad — no OTA markup when guests book with us directly. Always highlight: free covered on-site parking, 24/7 WhatsApp support, and that booking direct (not via an OTA) gets the best price. We do not have an on-site restaurant, spa, or pool. Front Desk (call only, not WhatsApp): +91 90147 76868. Reservations (call only): +91 63053 89600. Keep replies warm, concise, and fast — most guests expect a quick WhatsApp-style reply.",
        },
      },
      rooms: {
        create: [
          {
            name: "Classic Room",
            type: "Classic",
            description:
              "Queen comfort with city-view elegance. Calming comfort with strong city energy. From ₹999/night for 1 guest, ₹1,299/night for 2 guests.",
            price: 999,
            capacity: 2,
            amenities: [
              "Queen bed with luxury linens",
              "City-view window with blackout curtains",
              "Smart TV",
              "High-speed Wi-Fi",
              "AC",
              "Work desk with ergonomic chair",
              "Room service",
              "Daily housekeeping",
            ],
            imageUrls: [
              "https://hotelivorytower.com/images/room-classic-4.jpg",
              "https://hotelivorytower.com/images/room-classic.jpg",
              "https://hotelivorytower.com/images/room-classic-entrance.jpg",
              "https://hotelivorytower.com/images/room-classic-2.jpg",
            ],
          },
          {
            name: "Deluxe Room",
            type: "Deluxe",
            description:
              "Signature luxury with floor-to-ceiling city views. Large, bright room for travellers who want space and light. From ₹1,299/night for 1 guest, ₹1,599 for 2, ₹1,899 for 3.",
            price: 1299,
            capacity: 3,
            amenities: [
              "King bed with premium linens",
              "Floor-to-ceiling panoramic window",
              "LED mood lighting",
              "Work desk",
              "Lounge seating",
              "Smart TV",
              "Complimentary Wi-Fi",
            ],
            imageUrls: ["https://hotelivorytower.com/images/room-deluxe-4.png"],
          },
          {
            name: "Premium Room",
            type: "Premium",
            description:
              "Larger, more luxurious, made for longer stays. Crafted for families and guests who value privacy, style, and lounge space. From ₹1,599/night for 1 guest, ₹1,899 for 2, ₹2,199 for 3.",
            price: 1599,
            capacity: 3,
            amenities: [
              "King bed with premium linens",
              "Separate lounge area",
              "Panoramic skyline view",
              "Smart TV",
              "Workspace",
              "Complimentary Wi-Fi",
              "Daily housekeeping",
            ],
            imageUrls: [
              "https://hotelivorytower.com/images/room-premium-full-view.jpg",
              "https://hotelivorytower.com/images/room-premium-bed.jpg",
              "https://hotelivorytower.com/images/room-premium-bed-city-view.jpg",
              "https://hotelivorytower.com/images/room-premium-alt.jpg",
              "https://hotelivorytower.com/images/room-premium-wardrobe.jpg",
            ],
          },
        ],
      },
      faqs: {
        create: [
          {
            question: "What time is check-in and check-out?",
            answer:
              "Check-in is from 12:00 PM and check-out is by 11:00 AM. Message us on WhatsApp if you need early check-in or late check-out, subject to availability.",
          },
          {
            question: "How do I book a room?",
            answer: "Right here on WhatsApp — just share your dates and how many guests, and we'll confirm availability directly with you.",
          },
          { question: "Is parking available?", answer: "Yes, Hotel Ivory Towers has free covered parking on-site for guests." },
          {
            question: "Do you offer discounts for direct bookings?",
            answer:
              "Yes — new guests get a flat 10% off their first stay with code WELCOME10 when booking directly with us. Direct bookings only.",
          },
          {
            question: "Where exactly is the hotel located?",
            answer: "We're in Uppal, Hyderabad, Telangana — close to a major checkpost and about 4 km from the metro station.",
          },
          {
            question: "Can I cancel or change my booking?",
            answer:
              "Cancellation and change terms are confirmed with our front desk at the time of booking — ask us on WhatsApp before you book if you'd like the details for your dates.",
          },
          {
            question: "Is there a restaurant, spa, or pool on site?",
            answer: "We don't have an on-site restaurant, spa, or pool — happy to point you to good options nearby if you ask.",
          },
        ],
      },
      // One offer, deliberately. Four competing discounts gave the model four
      // things to get wrong in a single sentence and gave guests a puzzle
      // rather than a reason to book; a single first-stay discount is easier
      // to state correctly and easier to act on.
      offers: {
        create: [
          {
            title: "10% Off First Stay (WELCOME10)",
            description: "First time booking with Hotel Ivory Towers? Get a flat 10% off your room price. New guests only.",
            discount: "10% off",
            code: "WELCOME10",
            active: true,
          },
        ],
      },
      followUpRules: {
        create: [
          {
            order: 1,
            delayMinutes: 60,
            action: "REMINDER",
            messageBody:
              "Hi! Just checking in — were you able to look at the room options I shared? Happy to answer any questions.",
          },
          {
            order: 2,
            delayMinutes: 60 * 24,
            action: "OFFER",
            messageBody: "Still deciding? Ask me about our current offers — I can find something that fits your budget.",
          },
          {
            order: 3,
            delayMinutes: 60 * 24 * 3,
            action: "PACKAGE",
            messageBody: "We have a great weekend package running right now — want me to share the details?",
          },
          {
            order: 4,
            delayMinutes: 60 * 24 * 7,
            action: "LAST",
            messageBody: "Just wanted to check in again — whenever you're ready to book, we'd love to host you. Let us know anytime!",
            repeatDaily: true,
          },
        ],
      },
    },
  });

  console.log(`Seeded tenant "${tenant.name}" (${tenant.id}).`);
  console.log(`Owner login: ${SEED_OWNER_EMAIL} / ${SEED_OWNER_PASSWORD} — change this password after first login.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
