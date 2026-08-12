import { describe, expect, it } from "vitest";
import {
  GUEST_COUNT_BUTTON_VALUES,
  hasStatedDates,
  hasStatedGuestCount,
  mentionsRoomPrice,
  resolveDeterministicReply,
  selectDeterministicInteractive,
} from "./interactive-prompts";
import { captureGuestCount } from "@/lib/booking/guest-count";

/**
 * Randomised conversation soak test.
 *
 * Every bug in this project's history has been found the same way: a real
 * guest said something in a real order nobody had tried, and Anushka got
 * stuck, re-asked a settled question, or attached buttons that contradicted
 * her own text. Example-based tests can't find those, because the bug is
 * never in the turn you thought to write down — it's in the ordering.
 *
 * So instead of asserting outputs for hand-picked inputs, this drives
 * thousands of randomly-ordered conversations through the real state machine
 * and asserts the invariants that must hold for EVERY path. A failure prints
 * the exact transcript and the seed, so it replays deterministically.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG — reproducible, so a failing run is a bug report, not a mystery.
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// What real guests actually send, in the registers this hotel actually sees.
// ---------------------------------------------------------------------------
const GREETINGS = ["hi", "hello", "hey", "namaste", "hii", "Hi there"];
const INTENT = [
  "I'd like to book a room",
  "do you have rooms available?",
  "room chahiye is weekend",
  "I want to book a room",
  "looking for a room",
  "రూమ్ కావాలి",
  "kya room milega",
];
const COUNTS = [
  "2 people",
  "Just me",
  "3+ people",
  "family of 4",
  "we are 3",
  "just me",
  "do log",
  "ఇద్దరు",
  "myself + 2",
  "for 2",
  "3 adults",
  "we're a couple",
];
const DATES = [
  "this weekend",
  "tomorrow",
  "next week",
  "15th to 17th August",
  "checking in on the 12th",
  "Today (12 Aug)",
  "This weekend (16 Aug - 18 Aug)",
  "in 3 days",
  "వారాంతం",
];
const QUESTIONS = [
  "what time is check-in?",
  "do you have parking?",
  "is there wifi?",
  "am I talking to a real person or a bot?",
  "where exactly are you located?",
  "do you allow pets?",
];
const OBJECTIONS = ["that's too expensive", "any discount?", "anything cheaper?", "koi offer hai?"];
const PHOTO_REQUESTS = ["send photos", "can I see pictures?", "View photos"];
const NOISE = ["ok", "hmm", "sounds good", "thanks", "👍", "achha"];

// Assistant replies for the turns the waterfall hands to the AI. The exact
// prose doesn't matter — only whether it names a room with a price, since
// that's the one thing button selection genuinely depends on.
const AI_REPLIES_PLAIN = [
  "Check-in is from 12pm and check-out is 11am!",
  "Yes, we have free on-site parking 😊",
  "Absolutely — free high-speed WiFi throughout.",
  "I'm Anushka, the booking assistant here — happy to help!",
  "We're in Uppal, Hyderabad.",
];
const AI_REPLIES_WITH_ROOM = [
  "Our Classic Room is lovely — ₹999/night, sleeps 2.",
  "I'd suggest the Deluxe Room at ₹1,299/night.",
  "The Premium Room is ₹1,899/night and very spacious.",
];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

type Msg = { role: string; content: string };

interface SimState {
  history: Msg[];
  pendingGuestCount: number | null;
  datesKnown: boolean;
  roomMentioned: boolean;
}

const GUEST_COUNT_ASK = "How many people will be staying? 😊";
const DATE_ASK = "When are you looking to stay?";

/** One turn: the guest says something, the system answers. Returns the reply text. */
function step(state: SimState, guestMessage: string, rng: () => number): { text: string; deterministic: boolean; hadInteractive: boolean } {
  // Real capture path, exactly as process-message-job.ts runs it.
  const captured = captureGuestCount(guestMessage, state.history, state.pendingGuestCount);
  if (captured != null) state.pendingGuestCount = captured;

  const det = resolveDeterministicReply({
    isFirstReply: state.history.length === 0,
    languageObvious: false,
    history: state.history,
    guestMessage,
    hotelName: "Hotel Ivory Towers",
    knownGuestCount: state.pendingGuestCount,
  });

  let text: string;
  let deterministic: boolean;
  let hadInteractive: boolean;

  if (det) {
    text = det.text;
    deterministic = true;
    hadInteractive = true;
  } else {
    // The AI path. Whether it names a room is what button selection keys off.
    const namesRoom = state.pendingGuestCount != null && state.datesKnown && rng() < 0.5;
    text = namesRoom ? pick(rng, AI_REPLIES_WITH_ROOM) : pick(rng, AI_REPLIES_PLAIN);
    deterministic = false;
    const interactive = selectDeterministicInteractive({
      isFirstReply: state.history.length === 0,
      languageObvious: false,
      history: state.history,
      guestMessage,
      replyText: text,
      knownGuestCount: state.pendingGuestCount,
    });
    hadInteractive = Boolean(interactive);
  }

  if (mentionsRoomPrice(text)) state.roomMentioned = true;
  state.history.push({ role: "user", content: guestMessage });
  state.history.push({ role: "assistant", content: text });
  // Mirror the pipeline's own 12-message window so the simulation is honest
  // about what the state machine can actually see.
  if (state.history.length > 12) state.history = state.history.slice(-12);
  return { text, deterministic, hadInteractive };
}

/** Builds one randomised guest journey. */
function randomJourney(rng: () => number): string[] {
  const msgs: string[] = [];
  if (rng() < 0.7) msgs.push(pick(rng, GREETINGS));
  msgs.push(pick(rng, INTENT));

  // The interesting part: order the three things a booking needs at random,
  // interleaved with the noise and questions real guests actually send.
  const slots = [pick(rng, COUNTS), pick(rng, DATES)];
  if (rng() < 0.5) slots.reverse();

  for (const slot of slots) {
    const interruptions = Math.floor(rng() * 3);
    for (let i = 0; i < interruptions; i++) {
      msgs.push(pick(rng, rng() < 0.5 ? QUESTIONS : NOISE));
    }
    msgs.push(slot);
  }

  const tail = Math.floor(rng() * 6);
  for (let i = 0; i < tail; i++) {
    const r = rng();
    if (r < 0.25) msgs.push(pick(rng, QUESTIONS));
    else if (r < 0.4) msgs.push(pick(rng, OBJECTIONS));
    else if (r < 0.55) msgs.push(pick(rng, PHOTO_REQUESTS));
    else if (r < 0.7) msgs.push(pick(rng, NOISE));
    else if (r < 0.85) msgs.push(pick(rng, DATES));
    else msgs.push(pick(rng, COUNTS));
  }
  return msgs;
}

interface Violation {
  seed: number;
  rule: string;
  detail: string;
  transcript: string[];
}

function runConversation(seed: number): Violation[] {
  const rng = makeRng(seed);
  const state: SimState = { history: [], pendingGuestCount: null, datesKnown: false, roomMentioned: false };
  const violations: Violation[] = [];
  const transcript: string[] = [];
  const messages = randomJourney(rng);

  let countSettledAt: number | null = null;
  let consecutiveIdenticalAsks = 0;
  let lastAsk = "";

  messages.forEach((guestMessage, turn) => {
    const countWasKnownBefore = state.pendingGuestCount != null || hasStatedGuestCount(state.history, guestMessage, state.pendingGuestCount);
    if (hasStatedDates(state.history, guestMessage)) state.datesKnown = true;

    const { text, hadInteractive } = step(state, guestMessage, rng);
    transcript.push(`  guest> ${guestMessage}`);
    transcript.push(`  anushka> ${text}`);

    if (countWasKnownBefore && countSettledAt === null) countSettledAt = turn;

    // ---- INVARIANT 1: never re-ask a settled guest count ----
    if (text === GUEST_COUNT_ASK && countSettledAt !== null && turn > countSettledAt) {
      violations.push({
        seed,
        rule: "re-asked guest count after it was already known",
        detail: `turn ${turn}; stored=${state.pendingGuestCount}`,
        transcript: [...transcript],
      });
    }

    // ---- INVARIANT 2: no stuck loop on the same deterministic question ----
    if (text === lastAsk && (text === GUEST_COUNT_ASK || text === DATE_ASK)) {
      consecutiveIdenticalAsks++;
      if (consecutiveIdenticalAsks >= 3) {
        violations.push({
          seed,
          rule: "stuck loop: same question asked 4+ times in a row",
          detail: `"${text}" at turn ${turn}`,
          transcript: [...transcript],
        });
      }
    } else {
      consecutiveIdenticalAsks = 0;
    }
    lastAsk = text;

    // ---- INVARIANT 3: the guest is never left with nothing ----
    if (!text || !text.trim()) {
      violations.push({ seed, rule: "empty reply — guest left silent", detail: `turn ${turn}`, transcript: [...transcript] });
    }

    // ---- INVARIANT 4: text and buttons must agree ----
    // A reply whose text asks for guest count must not carry date buttons,
    // and vice versa — the mismatch class that made buttons feel bolted on.
    if (text === GUEST_COUNT_ASK && !hadInteractive) {
      violations.push({ seed, rule: "guest-count question sent with no picker", detail: `turn ${turn}`, transcript: [...transcript] });
    }
    if (text === DATE_ASK && !hadInteractive) {
      violations.push({ seed, rule: "date question sent with no picker", detail: `turn ${turn}`, transcript: [...transcript] });
    }
  });

  return violations;
}

function report(violations: Violation[]): string {
  const byRule = new Map<string, Violation[]>();
  for (const v of violations) {
    if (!byRule.has(v.rule)) byRule.set(v.rule, []);
    byRule.get(v.rule)!.push(v);
  }
  const lines: string[] = [];
  for (const [rule, vs] of byRule) {
    lines.push(`\n${vs.length} × ${rule}`);
    const sample = vs[0];
    lines.push(`  first seed: ${sample.seed} (${sample.detail})`);
    lines.push(...sample.transcript.slice(-10));
  }
  return lines.join("\n");
}

describe("conversation soak", () => {
  it("holds every invariant across 5,000 randomised conversations", () => {
    const violations: Violation[] = [];
    for (let seed = 1; seed <= 5000; seed++) {
      violations.push(...runConversation(seed));
    }
    expect(violations.length, report(violations)).toBe(0);
  });

  it("holds when guest count arrives before any booking intent", () => {
    const violations: Violation[] = [];
    for (let seed = 90001; seed <= 91000; seed++) {
      const rng = makeRng(seed);
      const state: SimState = { history: [], pendingGuestCount: null, datesKnown: false, roomMentioned: false };
      const msgs = [pick(rng, COUNTS), pick(rng, INTENT), pick(rng, DATES), pick(rng, QUESTIONS)];
      let settled = false;
      msgs.forEach((m, turn) => {
        if (hasStatedGuestCount(state.history, m, state.pendingGuestCount)) settled = true;
        const { text } = step(state, m, rng);
        if (settled && turn > 0 && text === GUEST_COUNT_ASK) {
          violations.push({ seed, rule: "re-asked count stated up front", detail: `turn ${turn}`, transcript: [] });
        }
      });
    }
    expect(violations.length, report(violations)).toBe(0);
  });

  it("never loses a guest count once stored, however long the conversation runs", () => {
    // Directly targets the window bug: drive far past 12 messages.
    for (let seed = 70001; seed <= 71000; seed++) {
      const rng = makeRng(seed);
      const state: SimState = { history: [], pendingGuestCount: null, datesKnown: false, roomMentioned: false };
      step(state, pick(rng, INTENT), rng);
      step(state, pick(rng, COUNTS), rng);
      const stored = state.pendingGuestCount;
      expect(stored, `seed ${seed}: count not captured from a real phrasing`).not.toBeNull();

      for (let i = 0; i < 30; i++) {
        const { text } = step(state, pick(rng, rng() < 0.5 ? QUESTIONS : NOISE), rng);
        expect(text, `seed ${seed}: re-asked guest count at filler turn ${i}`).not.toBe(GUEST_COUNT_ASK);
      }
      expect(state.pendingGuestCount, `seed ${seed}: stored count drifted`).toBe(stored);
    }
  });

  it("captures a party size from every GUEST_COUNT row title, tapped in any order", () => {
    for (const [id, expected] of Object.entries(GUEST_COUNT_BUTTON_VALUES)) {
      const titles: Record<string, string> = { guests_1: "Just me", guests_2: "2 people", guests_3plus: "3+ people" };
      const captured = captureGuestCount(titles[id], [{ role: "assistant", content: GUEST_COUNT_ASK }], null);
      expect(captured, `row ${id} ("${titles[id]}") must capture ${expected}`).toBe(expected);
    }
  });
});
