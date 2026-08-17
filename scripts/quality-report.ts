// Conversation QUALITY report — the complement to soak-conversations.ts.
//
// The soak answers "did anything break?" and returns pass/fail. It cannot
// tell you whether the flow is any GOOD: a conversation that never breaks an
// invariant can still stall three turns from a booking, answer a question
// with a form, or bury the guest in canned prompts. Every bug found in live
// use has been a quality failure of that shape, not a crash.
//
// So this measures the things a guest would actually notice, over thousands
// of randomised conversations, and prints distributions rather than a verdict.
//
// Run: npx tsx scripts/quality-report.ts [conversations]
import { readyToOfferRooms, resolveDeterministicReply, selectDeterministicInteractive } from "../src/lib/ai/interactive-prompts";
import { captureGuestCount } from "../src/lib/booking/guest-count";
import { resolveTypedRelativeDates } from "../src/lib/booking/quick-pick-dates";

const TOTAL = Number(process.argv[2] ?? 20000);

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const pick = <T,>(rng: () => number, a: T[]): T => a[Math.floor(rng() * a.length) % a.length];

const GREETINGS = ["hi", "hello", "hey", "namaste", "నమస్కారం", "हैलो", "hii"];
const INTENT = ["I want to book a room", "room chahiye", "do you have rooms", "రూమ్ కావాలి", "बुक करना है", "need a room"];
const COUNTS = ["2 people", "Just me", "3+ people", "family of 4", "do log", "ఇద్దరు", "we are 3", "just me"];
const DATES = ["this weekend", "tomorrow", "next week", "kal", "अगले हफ्ते", "వారాంతం", "friday", "in 3 days", "26aug"];
const QUESTIONS = [
  "do you have wifi", "is breakfast included", "what time is check in", "do you have parking",
  "kitna hai price", "wifi hai kya", "क्या पार्किंग है", "వైఫై ఉందా", "how far is the airport",
  "is there ac", "do you allow pets", "whats the cheapest room", "any offers",
];
const REJECTIONS = ["no", "not this one", "I want premium instead", "koi aur room", "something else"];
const AGREE = ["yes", "ok", "sounds good", "haan", "book it", "perfect"];
const NOISE = ["hmm", "k", "👍", "...", "achha", "thanks"];

const GUEST_COUNT_ASK = "How many people will be staying? 😊";
const DATE_ASK = "When are you looking to stay?";
const CANNED = new Set([GUEST_COUNT_ASK, DATE_ASK, "कितने लोग रुकेंगे? 😊", "ఎంత మంది ఉంటారు? 😊"]);

interface Metrics {
  reachedRooms: number;
  reachedClose: number;
  turnsToRooms: number[];
  questionsAsked: number;
  questionsAnswered: number;
  cannedReplies: number;
  aiReplies: number;
  turnsWithButtons: number;
  totalTurns: number;
  stalled: number;
  cooperativeTotal: number;
  cooperativeReachedRooms: number;
}

function runOne(seed: number, m: Metrics): void {
  const rng = makeRng(seed);
  let history: { role: string; content: string }[] = [];
  let count: number | null = null;
  let storedDates = false;
  let sawRooms = false;
  let sawClose = false;
  let turnsToRooms = 0;

  // Guests are not uniformly cooperative, and a report that only simulates
  // the ideal guest measures its own script rather than the product. Three
  // populations, roughly matching what a real inbox looks like:
  //
  //   60% cooperative — answers both slots, asks a few questions
  //   25% partial     — gives one slot and drifts; SHOULD stall short of a
  //                     room, because a room cannot honestly be offered
  //                     without knowing dates
  //   15% browsing    — only questions, never states an intent to book
  const persona = rng();
  const script: string[] = [pick(rng, GREETINGS)];

  if (persona < 0.15) {
    // Browsing: questions only, no booking intent.
    for (let i = 0, n = 2 + Math.floor(rng() * 4); i < n; i++) script.push(pick(rng, QUESTIONS));
  } else if (persona < 0.4) {
    // Partial: intent and ONE slot, then drift.
    script.push(pick(rng, INTENT));
    script.push(rng() < 0.5 ? pick(rng, COUNTS) : pick(rng, DATES));
    for (let i = 0, n = 1 + Math.floor(rng() * 3); i < n; i++) script.push(pick(rng, rng() < 0.5 ? QUESTIONS : NOISE));
  } else {
    // Cooperative: the full path, with real questions along the way.
    script.push(pick(rng, INTENT));
    for (let i = 0, n = Math.floor(rng() * 3); i < n; i++) script.push(pick(rng, QUESTIONS));
    script.push(pick(rng, COUNTS));
    if (rng() < 0.5) script.push(pick(rng, QUESTIONS));
    script.push(pick(rng, DATES));
    if (rng() < 0.4) script.push(pick(rng, REJECTIONS));
    for (let i = 0, n = Math.floor(rng() * 3); i < n; i++) script.push(pick(rng, rng() < 0.5 ? QUESTIONS : NOISE));
    script.push(pick(rng, AGREE));
  }
  const cooperative = persona >= 0.4;
  if (cooperative) m.cooperativeTotal++;

  let turn = 0; // per-conversation, NOT the global counter

  for (const msg of script) {
    m.totalTurns++;
    turn++;
    const isQuestion = QUESTIONS.includes(msg);
    if (isQuestion) m.questionsAsked++;

    const cap = captureGuestCount(msg, history, count);
    if (cap != null) count = cap;
    if (!storedDates && resolveTypedRelativeDates(msg)) storedDates = true;

    // The worker sends the room shortlist deterministically at this point.
    if (!sawRooms && readyToOfferRooms({ history, guestMessage: msg, knownGuestCount: count, datesKnown: storedDates })) {
      sawRooms = true;
      turnsToRooms = turn;
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: "We have 3 rooms free 😊 Book Classic Room — From ₹999/night · up to 2 guests" });
      m.turnsWithButtons++;
      continue;
    }

    const det = resolveDeterministicReply({
      isFirstReply: history.length === 0,
      languageObvious: false,
      history,
      guestMessage: msg,
      knownGuestCount: count,
      datesKnown: storedDates,
    });

    let reply: string;
    let hadButtons: boolean;
    if (det) {
      reply = det.text;
      hadButtons = true;
      if (CANNED.has(reply)) m.cannedReplies++;
      // A question answered with a slot prompt is the failure mode that
      // mattered most in live use.
      if (isQuestion && !CANNED.has(reply)) m.questionsAnswered++;
    } else {
      // Handed to the model — which is what a real question should get.
      reply = sawRooms && rng() < 0.5 ? "Our Classic Room is ₹999/night." : "Yes, free WiFi throughout! 😊";
      m.aiReplies++;
      if (isQuestion) m.questionsAnswered++;
      const btn = selectDeterministicInteractive({
        isFirstReply: history.length === 0,
        languageObvious: false,
        history,
        guestMessage: msg,
        replyText: reply,
        knownGuestCount: count,
        datesKnown: storedDates,
      });
      hadButtons = Boolean(btn);
    }
    if (hadButtons) m.turnsWithButtons++;
    if (/confirm booking/i.test(reply)) sawClose = true;

    history.push({ role: "user", content: msg });
    history.push({ role: "assistant", content: reply });
    if (history.length > 12) history = history.slice(-12);
  }

  if (sawRooms) {
    m.reachedRooms++;
    m.turnsToRooms.push(turnsToRooms);
    if (cooperative) m.cooperativeReachedRooms++;
  } else if (cooperative) {
    // Only a cooperative guest failing to reach a room is a defect — a
    // browsing or half-committed one legitimately never gets there.
    m.stalled++;
  }
  if (sawClose) m.reachedClose++;
}

function pct(n: number, d: number) {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

function main() {
  const m: Metrics = {
    reachedRooms: 0, reachedClose: 0, turnsToRooms: [], questionsAsked: 0, questionsAnswered: 0,
    cannedReplies: 0, aiReplies: 0, turnsWithButtons: 0, totalTurns: 0, stalled: 0, cooperativeTotal: 0, cooperativeReachedRooms: 0,
  };
  const t0 = Date.now();
  for (let seed = 1; seed <= TOTAL; seed++) runOne(seed, m);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const sorted = [...m.turnsToRooms].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const p90 = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0;

  console.log(`\nQUALITY REPORT — ${TOTAL.toLocaleString()} conversations, ${m.totalTurns.toLocaleString()} turns, ${secs}s\n`);
  console.log("FUNNEL");
  console.log(`  cooperative guests reaching rooms ${pct(m.cooperativeReachedRooms, m.cooperativeTotal).padStart(6)}  (${m.cooperativeReachedRooms.toLocaleString()}/${m.cooperativeTotal.toLocaleString()})`);
  console.log(`  all guests reaching rooms        ${pct(m.reachedRooms, TOTAL).padStart(7)}`);
  console.log(`  reached the close                ${pct(m.reachedClose, TOTAL).padStart(7)}  (${m.reachedClose.toLocaleString()})`);
  console.log(`  cooperative guests who STALLED   ${pct(m.stalled, m.cooperativeTotal).padStart(7)}  (${m.stalled.toLocaleString()})  <- defect if non-zero`);
  console.log(`  turns to rooms: median ${median}, p90 ${p90}`);
  console.log("\nLISTENING");
  console.log(`  guest questions asked            ${m.questionsAsked.toLocaleString()}`);
  console.log(`  answered rather than funnelled   ${pct(m.questionsAnswered, m.questionsAsked).padStart(7)}`);
  console.log("\nREPLY MIX");
  console.log(`  deterministic (no AI, instant)   ${pct(m.totalTurns - m.aiReplies, m.totalTurns).padStart(7)}`);
  console.log(`  model-generated                  ${pct(m.aiReplies, m.totalTurns).padStart(7)}  <- the only turns costing quota`);
  console.log(`  turns offering something tappable ${pct(m.turnsWithButtons, m.totalTurns).padStart(6)}`);
  process.exit(0);
}

main();
