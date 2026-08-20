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
        try {
          await handleInboundMessage(inbound(waId, turn as { say?: string; tap?: { id: string; label: string } }));
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
          const opts = [...r.buttons, ...r.rows];
          if (opts.length) console.log(`           [${opts.map((o) => o.title).join(" | ")}]`);
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
