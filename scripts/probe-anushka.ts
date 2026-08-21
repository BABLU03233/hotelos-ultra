/**
 * Reads what Anushka ACTUALLY says, against the real model chain.
 *
 *   npm run probe                 every conversation
 *   npm run probe -- --only=haggler
 *
 * The E2E suite scripts the model's replies so it can assert deterministically
 * — which is right for a gate that runs after every change, and useless for
 * the question "is she any good to talk to". That question can only be
 * answered by reading real output, so this runs the same inbound pipeline with
 * the AI hosts left alone and prints the transcripts.
 *
 * Every WhatsApp send is still intercepted, and it refuses to run against a
 * non-local database, so nothing here reaches a guest.
 *
 * Costs real free-tier quota. Run it deliberately, not on a loop.
 */
import "dotenv/config";
import { assertLocalDatabase, inbound, installStubs, peekOutbox, resetTurnState, takeOutbox } from "./e2e/harness";

installStubs({ liveAi: true });
assertLocalDatabase();

interface Probe {
  id: string;
  /** What kind of guest this is, and what we are watching for. */
  watch: string;
  turns: ({ say: string } | { tap: { id: string; label: string } })[];
}

/**
 * Guests who do NOT follow the happy path.
 *
 * The tap-through funnel is already covered by the E2E suite and passes. What
 * is unproven is the conversational half: someone who ignores the buttons,
 * asks three things at once, haggles, writes in Hinglish, or arrives with the
 * whole enquiry in their first message. That is where "adapts to how the guest
 * asks" either holds up or does not.
 */
const PROBES: Probe[] = [
  {
    id: "everything-at-once",
    watch: "Does she use ALL the facts given, or re-ask for what she was just told?",
    turns: [{ say: "hi i need a room for 2 people tomorrow night, whats the price?" }],
  },
  {
    id: "price-first",
    watch: "Straight to money. Does she answer with a real number instead of deflecting to a menu?",
    turns: [{ say: "how much for one night?" }],
  },
  {
    id: "haggler",
    watch: "Does she hold the line without inventing a discount she cannot honour?",
    turns: [{ say: "2 people tomorrow" }, { say: "thats too expensive, can you do 700?" }],
  },
  {
    id: "hinglish",
    watch: "Must answer in Roman-script Hinglish, not switch to Devanagari.",
    turns: [{ say: "bhai kal ke liye room milega kya? 2 log hai" }],
  },
  {
    id: "off-topic-then-back",
    watch: "Answers a non-booking question, then returns to the sale without being pushy.",
    turns: [{ say: "do you allow pets?" }, { say: "ok. what about parking" }, { say: "fine, book me for tomorrow" }],
  },
  {
    id: "vague",
    watch: "Guest gives nothing. Does she ask ONE clear question rather than a wall?",
    turns: [{ say: "info" }],
  },
  {
    id: "unlisted-amenity",
    watch: "Must NOT invent a pool. Should say what it does have.",
    turns: [{ say: "is there a swimming pool and a spa?" }],
  },
  {
    id: "changes-mind",
    watch: "Guest revises the dates mid-flow. Does she carry the change or use the stale one?",
    turns: [
      { say: "room for tomorrow please" },
      { say: "2 of us" },
      { say: "actually make it next weekend instead" },
    ],
  },
  {
    id: "group-booking",
    watch: "Beyond room capacity. Should offer multiple rooms or hand to a human, not fail.",
    turns: [{ say: "we are 9 people coming for a wedding, need rooms for 2 nights" }],
  },
  {
    id: "ready-to-pay",
    watch: "Never takes payment or invents a payment link.",
    turns: [{ say: "book it for tomorrow, 2 people" }, { say: "can i pay online now? send me a link" }],
  },
  // ── Tap-driven branches. These need no model at all: the deterministic
  //    waterfall owns them end to end, so every bug here is a real one that
  //    ships regardless of which AI tier is up.
  {
    id: "tap-know-more",
    watch: "GREET_MENU 'I need more details' — does it answer, or dead-end?",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_question", label: "I need more details" } },
    ],
  },
  {
    id: "tap-availability-first",
    watch: "GREET_MENU 'Availability & price' before any dates are known.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "room_other", label: "Availability & price" } },
    ],
  },
  {
    id: "tap-decline-confirm",
    watch: "Tapping 'Not yet' at the confirm step must not repeat the same push.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_2", label: "2 people" } },
      { tap: { id: "dates_tomorrow", label: "Tomorrow" } },
      { tap: { id: "ROOM_CHEAPEST", label: "Book Classic Room" } },
      { tap: { id: "not_yet", label: "Not yet" } },
    ],
  },
  {
    id: "tap-see-other-options",
    watch: "After picking a room, 'See other options' should re-offer the list.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_2", label: "2 people" } },
      { tap: { id: "dates_tomorrow", label: "Tomorrow" } },
      { tap: { id: "ROOM_CHEAPEST", label: "Book Classic Room" } },
      { tap: { id: "room_other", label: "See other options" } },
    ],
  },
  {
    id: "tap-photos",
    watch: "'View photos' when the fixture rooms have NO images — must not send a broken/empty media message.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_2", label: "2 people" } },
      { tap: { id: "dates_tomorrow", label: "Tomorrow" } },
      { tap: { id: "ROOM_CHEAPEST", label: "Book Classic Room" } },
      { tap: { id: "view_photos", label: "View photos" } },
    ],
  },
  {
    id: "tap-offers",
    watch: "'Show me offers' should name the real WELCOME10 offer.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "show_offers", label: "Show me offers" } },
    ],
  },
  {
    id: "tap-custom-dates",
    watch: "'Pick exact dates' must open a real date picker, not dead-end.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_2", label: "2 people" } },
      { tap: { id: "dates_custom", label: "Pick exact dates" } },
    ],
  },
  {
    id: "tap-3plus-guests",
    watch: "3+ guests — rooms shown must actually fit them.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_3plus", label: "3+ people" } },
      { tap: { id: "dates_tomorrow", label: "Tomorrow" } },
    ],
  },
  {
    id: "after-booking-question",
    watch: "Post-booking 'I have a question' must not restart the funnel.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_2", label: "2 people" } },
      { tap: { id: "dates_tomorrow", label: "Tomorrow" } },
      { tap: { id: "ROOM_CHEAPEST", label: "Book Classic Room" } },
      { tap: { id: "confirm_booking", label: "Confirm booking" } },
      { tap: { id: "post_booking_question", label: "I have a question" } },
    ],
  },
  {
    id: "greeting-after-booking",
    watch: "Saying hi right after booking must NOT wipe the booking or re-ask language.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_2", label: "2 people" } },
      { tap: { id: "dates_tomorrow", label: "Tomorrow" } },
      { tap: { id: "ROOM_CHEAPEST", label: "Book Classic Room" } },
      { tap: { id: "confirm_booking", label: "Confirm booking" } },
      { say: "hi" },
    ],
  },
  {
    id: "double-confirm",
    watch: "Tapping Confirm twice must not create two bookings.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_2", label: "2 people" } },
      { tap: { id: "dates_tomorrow", label: "Tomorrow" } },
      { tap: { id: "ROOM_CHEAPEST", label: "Book Classic Room" } },
      { tap: { id: "confirm_booking", label: "Confirm booking" } },
      { tap: { id: "confirm_booking", label: "Confirm booking" } },
    ],
  },
  {
    id: "group-booking-flow",
    watch: "Corporate block: asks how many ROOMS, then hands to a person rather than selling one room.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_group", label: "Group / corporate" } },
      { tap: { id: "group_rooms_6_10", label: "6-10 rooms" } },
    ],
  },
  {
    id: "location-pin",
    watch: "Sends a real map pin, not a link. Fixture has no lat/lng, so this must NOT promise directions.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_question", label: "I need more details" } },
      { tap: { id: "show_location", label: "Where are you?" } },
    ],
  },
  {
    id: "hi-then-hi-again",
    watch: "The real chat: 'hi', follow-ups fire, then 'Hi' again. Must greet — not ask how many people.",
    turns: [{ say: "hi" }, { say: "Hi" }],
  },
  {
    id: "book-without-dates",
    watch: "Reaching 'Book this room' with no dates must ASK for dates, not offer Confirm.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "room_other", label: "Availability & price" } },
      { tap: { id: "ROOM_CHEAPEST", label: "Book Classic Room" } },
      { tap: { id: "room_book", label: "Book this room" } },
    ],
  },
  {
    id: "typed-four-people",
    watch: "Typed 4 people, one more than any room here holds. Must hand off, not offer a room list.",
    turns: [{ tap: { id: "lang_en", label: "English" } }, { say: "4 people please" }],
  },
  {
    id: "next-week-flow",
    watch: "Exact reported flow: book -> 3 people -> Next week. Must show the room LIST, not one AI-picked room.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_3plus", label: "3 people" } },
      { tap: { id: "dates_nextweek", label: "Next week" } },
    ],
  },
  {
    id: "next-week-full-path",
    watch: "Next week -> pick a day -> pick nights -> room list. Both check-in and check-out must come from the guest.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_2", label: "2 people" } },
      { tap: { id: "dates_nextweek", label: "Next week" } },
      { tap: { id: "checkin_2026-08-26", label: "Wed, 26 Aug" } },
      { tap: { id: "nights_2", label: "2 nights" } },
    ],
  },
  {
    id: "this-weekend-full-path",
    watch: "This weekend must ask which day, then nights, then confirm dates + times, THEN rooms.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_3plus", label: "3 people" } },
      { tap: { id: "dates_weekend", label: "This weekend" } },
      { tap: { id: "checkin_2026-08-22", label: "Sat, 22 Aug" } },
      { tap: { id: "nights_2", label: "2 nights" } },
    ],
  },
  {
    id: "agree-without-dates",
    watch: "Agreeing to a room with NO dates must ask for dates, not offer a Confirm that cannot confirm.",
    turns: [
      { tap: { id: "lang_en", label: "English" } },
      { tap: { id: "greet_book", label: "I want to book a room" } },
      { tap: { id: "guests_2", label: "2 people" } },
      { tap: { id: "room_other", label: "Availability & price" } },
      { tap: { id: "ROOM_CHEAPEST", label: "Book Classic Room" } },
      { say: "yes please" },
    ],
  },
  {
    id: "stop-opt-out",
    watch: "STOP must opt them out and say so.",
    turns: [{ tap: { id: "lang_en", label: "English" } }, { say: "STOP" }],
  },
];

const arg = process.argv.slice(2).find((a) => a.startsWith("--only="))?.split("=")[1];

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { handleInboundMessage } = await import("@/lib/inbound/handle-inbound-message");
  const { processMessageJob } = await import("@/lib/inbound/process-message-job");
  const { createFixture, destroyFixture } = await import("./e2e/fixture");

  const selected = PROBES.filter((p) => !arg || p.id === arg);
  console.log(`\nProbing Anushka against the live model — ${selected.length} conversation(s)\n`);

  try {
    for (const [index, probe] of selected.entries()) {
      const fixture = await createFixture(prisma);
      const waId = `9${String(880000000000 + index)}`.slice(0, 12);

      console.log(`\n${"─".repeat(72)}`);
      console.log(`${probe.id}`);
      console.log(`watching: ${probe.watch}`);
      console.log("─".repeat(72));

      for (const turn of probe.turns) {
        resetTurnState();
        const started = Date.now();
        // A room row id is only knowable once the fixture exists — same
        // resolution the E2E runner does.
        const t = turn as { say?: string; tap?: { id: string; label: string } };
        const resolved =
          t.tap?.id === "ROOM_CHEAPEST"
            ? { ...t, tap: { ...t.tap, id: `room_pick_${fixture.roomIds["Classic Room"]}` } }
            : t;
        try {
          await handleInboundMessage(inbound(waId, resolved));
          if (peekOutbox().length === 0) {
            const contact = await prisma.contact.findFirst({
              where: { tenantId: fixture.tenantId, whatsappNumber: waId },
            });
            if (contact) {
              await processMessageJob({ tenantId: fixture.tenantId, contactId: contact.id, messageId: "" } as never);
            }
          }
        } catch (err) {
          console.log(`  !! THREW: ${err instanceof Error ? err.message : String(err)}`);
        }
        const ms = Date.now() - started;

        console.log(`\n  GUEST: ${"say" in turn ? turn.say : `[taps ${turn.tap.label}]`}`);
        const replies = takeOutbox();
        if (!replies.length) console.log("  ANUSHKA: (nothing sent)");
        for (const r of replies) {
          console.log(`  ANUSHKA: ${r.body}`);
          // Descriptions carry the prices, which is most of what there is to
          // check about a room list.
          for (const b of r.buttons) console.log(`           [${b.title}]`);
          for (const row of r.rows) console.log(`           [${row.title}]${row.description ? `  ${row.description}` : ""}`);
        }
        console.log(`           (${ms}ms)`);
      }

      await destroyFixture(prisma);
    }
  } finally {
    await destroyFixture(prisma).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
  console.log(`\n${"─".repeat(72)}\nDone.\n`);
}

main().catch((err) => {
  console.error("PROBE CRASHED:", err);
  process.exit(1);
});
