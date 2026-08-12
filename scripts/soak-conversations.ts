// Large-scale conversation soak. Pure functions only — no DB, no network.
// Run: npm run soak -- 100000
import {
  hasStatedDates,
  hasStatedGuestCount,
  mentionsRoomPrice,
  resolveDeterministicReply,
  selectDeterministicInteractive,
} from "../src/lib/ai/interactive-prompts";
import { captureGuestCount } from "../src/lib/booking/guest-count";
import { resolveTypedRelativeDates } from "../src/lib/booking/quick-pick-dates";

const TOTAL = Number(process.argv[2] ?? 100000);

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function pick<T>(rng: () => number, a: T[]): T {
  return a[Math.floor(rng() * a.length) % a.length];
}

/**
 * Messes a message up the way a real stranger on a phone keyboard does.
 *
 * Every pool above is spelled correctly, which quietly makes the whole soak
 * an easier test than reality: guests type "roomm", drop spaces, SHOUT, skip
 * punctuation and send bare emoji. Detection here is regex-driven, so a
 * typo can flip a slot from recognised to unrecognised — and the invariants
 * that matter (never loop, never go silent, never re-ask a settled slot)
 * must hold even when nothing is recognised at all.
 */
function mangle(rng: () => number, s: string): string {
  const r = rng();
  if (r < 0.45) return s; // most messages are typed fine
  if (r < 0.55) return s.toUpperCase();
  if (r < 0.62) return s.replace(/[?.!,]/g, ""); // no punctuation
  if (r < 0.70) return s.replace(/\s+/g, ""); // spaces dropped
  if (r < 0.78) {
    // Doubled letter — "room" -> "roomm"
    const i = Math.floor(rng() * s.length);
    return s.slice(0, i) + s.charAt(i) + s.slice(i);
  }
  if (r < 0.86) {
    // Dropped letter
    const i = Math.floor(rng() * s.length);
    return s.slice(0, i) + s.slice(i + 1);
  }
  if (r < 0.92) {
    // Adjacent-key transposition
    const i = Math.max(1, Math.floor(rng() * (s.length - 1)));
    return s.slice(0, i - 1) + s.charAt(i) + s.charAt(i - 1) + s.slice(i + 1);
  }
  if (r < 0.96) return s + "  "; // trailing whitespace
  return pick(rng, CONTENTLESS); // near-contentless
}

/**
 * Replacements that destroy the message's meaning entirely.
 *
 * Intent-based invariants are skipped for these: if the guest actually sent
 * "🏨🏨", no system can know they meant "send photos", and asserting
 * otherwise measures the mangler rather than the product. They're still fed
 * through, because the invariants that DON'T depend on intent — never loop,
 * never go silent — must hold for a bare emoji too.
 */
const CONTENTLESS = ["👍", "🙏", "??", "...", "k", "hmm", "🏨🏨"];

const GREETINGS = ["hi", "hello", "hey", "namaste", "hii", "Hi there", "నమస్కారం", "हैलो"];
const INTENT = [
  "I'd like to book a room",
  "do you have rooms available?",
  "room chahiye is weekend",
  "I want to book a room",
  "రూమ్ కావాలి",
  "kya room milega",
  "looking for accommodation",
  "book a room please",
  "बुक करना है",
];
const COUNTS = [
  "2 people", "Just me", "3+ people", "family of 4", "we are 3", "just me", "do log", "ఇద్దరు",
  "myself + 2", "for 2", "3 adults", "we're a couple", "teen log", "ముగ్గురు", "group of 5",
  "just the two of us", "me and my wife", "4 including me", "solo",
];
const DATES = [
  "this weekend", "tomorrow", "next week", "15th to 17th August", "checking in on the 12th",
  "Today (12 Aug)", "This weekend (16 Aug - 18 Aug)", "in 3 days", "వారాంతం", "kal", "अगले हफ्ते",
  "20/09 to 22/09", "Friday", "next month",
];
const QUESTIONS = [
  "what time is check-in?", "do you have parking?", "is there wifi?",
  "am I talking to a real person or a bot?", "where exactly are you located?",
  "do you allow pets?", "is breakfast included?", "do you have a lift?",
  "wifi hai kya aapke yaha", "చెక్ ఇన్ ఎప్పుడు?",
];
const OBJECTIONS = ["that's too expensive", "any discount?", "anything cheaper?", "koi offer hai?", "bahut mehenga hai"];
const PHOTOS = ["send photos", "can I see pictures?", "View photos", "photo bhejo"];
const CANCELS = ["cancel my booking", "I want to cancel", "can I reschedule my booking?", "change my reservation"];
// A guest turning down the room they were offered. Answering any of these
// with "tap Confirm booking" is how someone gets booked into a room they
// explicitly refused — which happened in production.
const REJECTIONS = [
  "No I only want premium room",
  "no",
  "not this one",
  "I don't want that room",
  "something else please",
  "koi aur room dikhao",
  "nahi",
  "I'd prefer the deluxe room",
];
const NOISE = ["ok", "hmm", "sounds good", "thanks", "👍", "achha", "k", "...", "yes", "no"];

const AI_PLAIN = [
  "Check-in is from 12pm and check-out is 11am!",
  "Yes, we have free on-site parking 😊",
  "Absolutely — free high-speed WiFi throughout.",
  "I'm Anushka, the booking assistant here — happy to help!",
  "We're in Uppal, Hyderabad.",
  "Breakfast is included with every stay!",
];
const AI_ROOM = [
  "Our Classic Room is lovely — ₹999/night, sleeps 2.",
  "I'd suggest the Deluxe Room at ₹1,299/night.",
  "The Premium Room is ₹1,899/night and very spacious.",
];

const GUEST_COUNT_ASK = "How many people will be staying? 😊";
const DATE_ASK = "When are you looking to stay?";

interface State {
  history: { role: string; content: string }[];
  count: number | null;
  datesKnown: boolean;
  storedDates: boolean;
  roomMentioned: boolean;
}

interface Violation {
  seed: number;
  rule: string;
  detail: string;
  transcript: string[];
}

function step(st: State, msg: string, rng: () => number) {
  const cap = captureGuestCount(msg, st.history, st.count);
  if (cap != null) st.count = cap;
  // Mirrors process-message-job.ts: a typed relative date resolves to a real
  // stored range, exactly as a tapped row does.
  if (!st.storedDates) {
    const typed = resolveTypedRelativeDates(msg);
    if (typed) st.storedDates = true;
    // Models the AI's DATES: marker (date-marker.ts), the only path for
    // specifics the deterministic resolver deliberately won't guess at
    // ("15th to 17th August"). Deliberately imperfect — it depends on a
    // free-tier model choosing to emit the marker, so a share of turns
    // legitimately don't produce a structured range.
    else if (hasStatedDates([], msg) && rng() < 0.85) st.storedDates = true;
  }
  if (hasStatedDates(st.history, msg, st.storedDates)) st.datesKnown = true;

  const det = resolveDeterministicReply({
    isFirstReply: st.history.length === 0,
    languageObvious: false,
    history: st.history,
    guestMessage: msg,
    hotelName: "Hotel Ivory Towers",
    knownGuestCount: st.count,
    datesKnown: st.storedDates,
  });

  let text: string;
  let interactive: unknown;
  if (det) {
    text = det.text;
    interactive = det.interactive;
  } else {
    const namesRoom = st.count != null && st.datesKnown && rng() < 0.6;
    text = namesRoom ? pick(rng, AI_ROOM) : pick(rng, AI_PLAIN);
    interactive = selectDeterministicInteractive({
      isFirstReply: st.history.length === 0,
      languageObvious: false,
      history: st.history,
      guestMessage: msg,
      replyText: text,
      knownGuestCount: st.count,
      datesKnown: st.storedDates,
    });
  }
  if (mentionsRoomPrice(text)) st.roomMentioned = true;
  st.history.push({ role: "user", content: msg });
  st.history.push({ role: "assistant", content: text });
  if (st.history.length > 12) st.history = st.history.slice(-12);
  return { text, interactive };
}

function runOne(seed: number): Violation[] {
  const rng = makeRng(seed);
  const st: State = { history: [], count: null, datesKnown: false, storedDates: false, roomMentioned: false };
  const v: Violation[] = [];
  const tr: string[] = [];

  const msgs: string[] = [];
  if (rng() < 0.7) msgs.push(pick(rng, GREETINGS));
  msgs.push(pick(rng, INTENT));
  const slots = [pick(rng, COUNTS), pick(rng, DATES)];
  if (rng() < 0.5) slots.reverse();
  for (const s of slots) {
    for (let i = 0, n = Math.floor(rng() * 4); i < n; i++) msgs.push(pick(rng, rng() < 0.5 ? QUESTIONS : NOISE));
    msgs.push(s);
  }
  for (let i = 0, n = Math.floor(rng() * 8); i < n; i++) {
    const r = rng();
    if (r < 0.2) msgs.push(pick(rng, QUESTIONS));
    else if (r < 0.35) msgs.push(pick(rng, OBJECTIONS));
    else if (r < 0.5) msgs.push(pick(rng, PHOTOS));
    else if (r < 0.7) msgs.push(pick(rng, NOISE));
    else if (r < 0.8) msgs.push(pick(rng, DATES));
    else if (r < 0.9) msgs.push(pick(rng, REJECTIONS));
    else msgs.push(pick(rng, COUNTS));
  }

  let countSettledTurn: number | null = null;
  let datesSettledTurn: number | null = null;
  let sameAsk = 0;
  let last = "";
  // Legitimate re-asks (no structured range resolved) — counted, not failed,
  // but they must never exceed the cap.
  let softDateReasks = 0;
  let softCountReasks = 0;

  msgs.forEach((clean, turn) => {
    // Typed the way a real stranger types it. Intent flags are read from the
    // ORIGINAL string: a mangled "send photos" is still a photo request as
    // far as the guest is concerned, and holding the invariant against the
    // clean intent is what makes this a real test rather than a tautology.
    const msg = mangle(rng, clean);
    const countKnownBefore = st.count != null || hasStatedGuestCount(st.history, msg, st.count);
    const datesKnownBefore = st.datesKnown || hasStatedDates(st.history, msg, st.storedDates);
    const meaningSurvived = !CONTENTLESS.includes(msg.trim());
    const isPhotoReq = PHOTOS.includes(clean) && meaningSurvived;
    const isCancel = CANCELS.includes(clean) && meaningSurvived;
    const isRejection = REJECTIONS.includes(clean) && meaningSurvived;

    const { text, interactive } = step(st, msg, rng);
    tr.push(`  guest> ${msg}`);
    tr.push(`  anushka> ${text}`);

    if (countKnownBefore && countSettledTurn === null) countSettledTurn = turn;
    if (datesKnownBefore && datesSettledTurn === null) datesSettledTurn = turn;

    const add = (rule: string, detail: string) => v.push({ seed, rule, detail, transcript: [...tr] });

    // 1. never re-ask a settled slot.
    // Strict form, matching the dates rule below: once a count is actually
    // STORED, asking again is always a bug. When nothing was ever captured
    // (a typo defeated detection, say) the count genuinely is unknown, so
    // asking is correct — bounded by the stuck-loop rule, not this one.
    // Keying this off the text scan instead made the harness measure its own
    // flicker rather than the product's behaviour.
    if (text === GUEST_COUNT_ASK && st.count != null) {
      add("re-asked guest count after it was stored", `turn ${turn} stored=${st.count}`);
    }
    if (text === GUEST_COUNT_ASK && countSettledTurn !== null && turn > countSettledTurn && st.count == null) {
      softCountReasks++;
    }
    // Strict form: once a real structured range is STORED, asking again is
    // always a bug. When no range could be resolved (the AI marker didn't
    // fire on a specific phrasing), asking again is legitimate — capped at
    // MAX_UNANSWERED_ASKS, which the stuck-loop rule below enforces.
    if (text === DATE_ASK && st.storedDates) {
      add("re-asked dates after a real range was stored", `turn ${turn}`);
    }
    if (text === DATE_ASK && datesSettledTurn !== null && turn > datesSettledTurn && !st.storedDates) {
      softDateReasks++;
    }

    // 2. no stuck loop
    if (text === last && (text === GUEST_COUNT_ASK || text === DATE_ASK)) {
      if (++sameAsk >= 2) add("stuck loop: same question 3+ times running", `"${text}" turn ${turn}`);
    } else sameAsk = 0;
    last = text;

    // 3. never silent
    if (!text?.trim()) add("empty reply", `turn ${turn}`);

    // 4. a deterministic question must carry its picker
    if ((text === GUEST_COUNT_ASK || text === DATE_ASK) && !interactive) {
      add("question sent with no picker", `turn ${turn}`);
    }

    // 5. a photo request must never be swallowed by a funnel prompt
    if (isPhotoReq && (text === GUEST_COUNT_ASK || text === DATE_ASK)) {
      add("photo request swallowed by a funnel prompt", `turn ${turn}`);
    }

    // 6. a cancel/reschedule request must never be hijacked into booking
    // The production incident: a guest who says "no, I want the premium
    // room" must never be answered with a push to confirm the room they
    // just turned down — tapping it books the wrong room.
    if (isRejection && /confirm booking/i.test(text)) {
      add("pushed Confirm booking at a guest who rejected the room", `turn ${turn}`);
    }

    if (isCancel && (text === GUEST_COUNT_ASK || text === DATE_ASK)) {
      add("cancel/reschedule hijacked into the booking funnel", `turn ${turn}`);
    }

    // 7. never claim a booking is confirmed without the tap
    if (/\b(booking (is )?confirmed|your booking is (now )?confirmed)\b/i.test(text)) {
      add("claimed booking confirmed without a tap", `turn ${turn}`);
    }
  });

  // The cap is the guarantee that an unresolvable date phrasing still can't
  // turn into the interrogation the loop bug used to produce.
  if (softDateReasks > 2) {
    v.push({ seed, rule: "asked for dates more than twice without a stored range", detail: `${softDateReasks} asks`, transcript: tr });
  }
  if (softCountReasks > 2) {
    v.push({ seed, rule: "asked for guest count more than twice without a stored value", detail: `${softCountReasks} asks`, transcript: tr });
  }

  return v;
}

// ---- Cooperative-guest funnel check: does a guest who answers everything
// ---- actually reach the point of being able to book?
function runCooperative(seed: number): Violation[] {
  const rng = makeRng(seed);
  const st: State = { history: [], count: null, datesKnown: false, storedDates: false, roomMentioned: false };
  const v: Violation[] = [];
  const tr: string[] = [];
  const msgs = [pick(rng, GREETINGS), pick(rng, INTENT), pick(rng, COUNTS), pick(rng, DATES)];
  for (const m of msgs) {
    const { text } = step(st, m, rng);
    tr.push(`  guest> ${m}`);
    tr.push(`  anushka> ${text}`);
  }
  // A few more cooperative turns to let a room come up.
  for (let i = 0; i < 6; i++) {
    const { text } = step(st, pick(rng, ["ok", "sounds good", "yes"]), rng);
    tr.push(`  guest> (agrees)`);
    tr.push(`  anushka> ${text}`);
  }
  if (st.count == null) {
    v.push({ seed, rule: "cooperative guest: count never captured", detail: "", transcript: tr });
  }
  if (!st.datesKnown) {
    v.push({ seed, rule: "cooperative guest: dates never registered", detail: "", transcript: tr });
  }
  return v;
}

function main() {
  const all: Violation[] = [];
  const t0 = Date.now();
  for (let seed = 1; seed <= TOTAL; seed++) {
    all.push(...runOne(seed));
    if (seed % 5 === 0) all.push(...runCooperative(seed + 5_000_000));
  }
  const ms = Date.now() - t0;

  const byRule = new Map<string, Violation[]>();
  for (const x of all) {
    if (!byRule.has(x.rule)) byRule.set(x.rule, []);
    byRule.get(x.rule)!.push(x);
  }

  console.log(`\nRan ${TOTAL.toLocaleString()} conversations + ${(TOTAL / 5).toLocaleString()} cooperative funnels in ${(ms / 1000).toFixed(1)}s`);
  if (!all.length) {
    console.log("\nNO INVARIANT VIOLATIONS\n");
    process.exit(0);
  }
  console.log(`\n${all.length.toLocaleString()} violations across ${byRule.size} rule(s):\n`);
  for (const [rule, vs] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${vs.length.toLocaleString()} × ${rule}`);
    const s = vs[0];
    console.log(`   first seed ${s.seed} ${s.detail}`);
    for (const line of s.transcript.slice(-12)) console.log(`   ${line}`);
    console.log("");
  }
  process.exit(1);
}

main();
