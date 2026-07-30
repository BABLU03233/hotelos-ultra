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
      hotelProfile: {
        create: {
          name: "Hotel Ivory Towers",
          address: "# 93, Kalidasa Road, VV Mohalla, Mysuru 570002, Karnataka",
          checkInTime: "14:00",
          checkOutTime: "11:00",
          wifiInfo: "Free high-speed Wi-Fi in every room and throughout the property.",
          parkingInfo: "Free, secured on-site parking for all in-house guests.",
          restaurantInfo: null,
          cancellationPolicy: "Free cancellation up to 48 hours before check-in.",
          refundPolicy: "Refunds for eligible cancellations are processed within 5-7 business days.",
          nearbyAttractions: "A short ride from Mysore Palace, Chamundi Hills, and the main city centre.",
          businessHours: "Front desk staffed 24/7.",
          aiSystemPrompt:
            "Our tagline is 'Where comfort meets class' — keep replies warm, concise, and professional. We do not have a restaurant, spa, or pool on site.",
        },
      },
      rooms: {
        create: [
          {
            name: "Classic King Room",
            type: "Classic",
            description: "A spacious, quiet king-bed AC room with modern interiors.",
            price: 2500,
            capacity: 2,
            amenities: ["Free Wi-Fi", "Smart LED TV", "Work desk", "Hot & cold water"],
            imageUrls: [],
          },
          {
            name: "Deluxe King Room",
            type: "Deluxe",
            description: "A larger king-bed room with a city-facing window, a short walk from Mysore Palace.",
            price: 3500,
            capacity: 2,
            amenities: ["City view", "Free Wi-Fi", "Smart LED TV", "Mini fridge", "Work desk"],
            imageUrls: [],
          },
          {
            name: "Executive King Room",
            type: "Executive",
            description: "A generously sized room with a seating area — ideal for business travellers or small families.",
            price: 4800,
            capacity: 3,
            amenities: ["City view", "Free Wi-Fi", "Smart LED TV", "Seating area", "Complimentary bottled water"],
            imageUrls: [],
          },
          {
            name: "Premium Suite",
            type: "Suite",
            description: "Our most spacious category, with a separate living area — popular for celebrations and longer stays.",
            price: 6500,
            capacity: 4,
            amenities: ["Separate living area", "Free Wi-Fi", "Smart LED TV", "Premium toiletries", "Priority housekeeping"],
            imageUrls: [],
          },
        ],
      },
      faqs: {
        create: [
          { question: "Is parking available?", answer: "Yes, we have free secured parking for all in-house guests." },
          { question: "Are pets allowed?", answer: "We're currently unable to accommodate pets, sorry for the inconvenience." },
          {
            question: "What time is check-in and check-out?",
            answer: "Check-in is from 2:00 PM and check-out is 11:00 AM — early check-in is subject to availability.",
          },
          {
            question: "Is breakfast included?",
            answer: "Breakfast isn't included by default, but we're happy to point you to great options nearby.",
          },
          {
            question: "How far are you from Mysore Palace?",
            answer: "We're right in the heart of Mysuru, just a short ride from Mysore Palace and the main attractions.",
          },
        ],
      },
      offers: {
        create: [
          {
            title: "Weekend Getaway",
            description: "Book a 2-night weekend stay and save.",
            discount: "10% off",
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
            messageBody:
              "Just following up one last time — whenever you're ready to book, we'd love to host you. Let us know!",
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
