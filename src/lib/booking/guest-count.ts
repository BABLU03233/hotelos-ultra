/**
 * Structured guest-count capture — the counterpart to date-marker.ts/
 * quick-pick-dates.ts for the one slot that had no persistence path at all.
 *
 * Until now, "has the guest told us how many people?" was answered by
 * re-scanning the recent transcript with a regex on EVERY turn
 * (hasStatedGuestCount in interactive-prompts.ts). That has two failure
 * modes, and the second one is unfixable by improving the regex:
 *
 *   1. Coverage — every new phrasing/language a guest uses needs another
 *      alternative added to the pattern (six separate live-caught fixes so
 *      far: Hinglish counts, Telugu counts, bare-number replies, "myself +
 *      2", "family of N", broader phrasings).
 *   2. The history window — process-message-job.ts only loads the last 12
 *      messages, so in any conversation longer than that, the message where
 *      the guest actually stated their count scrolls out of context and is
 *      silently forgotten. The guest then gets asked again, having already
 *      answered. This is precisely the live-reported "asked to re-confirm
 *      guest count on THREE separate later turns" bug, and no amount of
 *      pattern-matching can fix it, because the text being matched against
 *      is no longer there.
 *
 * So the count is extracted once, the turn it's first stated, and persisted
 * on Contact.pendingGuestCount — the same "current negotiation state"
 * pattern already used for pendingRoomId/pendingCheckIn/pendingCheckOut.
 * The transcript scan stays as the fallback for conversations already in
 * flight with nothing stored yet; a stored value simply short-circuits it.
 *
 * Extraction returns the actual NUMBER, not a boolean, because the number is
 * independently useful downstream (matching room capacity, and populating
 * the Booking row) in a way a "yes they said something" flag is not.
 */

/** Outside this range it isn't a party size — far more likely a price, a year, or a room number. */
const MIN_GUESTS = 1;
const MAX_GUESTS = 50;

const ENGLISH_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

// Romanized Hindi, as guests actually type it on WhatsApp ("hum 3 log hain",
// "do log"). Spelling varies wildly, so the common variants are all mapped
// rather than picking one canonical form.
const HINDI_NUMBER_WORDS: Record<string, number> = {
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  che: 6,
  chhe: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  dus: 10,
};

// Telugu person-counting words — a distinct set from the ordinary cardinals
// (ఒకటి/రెండు/మూడు), used specifically for counting people and commonly
// standalone. Kept unanchored: JavaScript's \b is Latin-script-only and does
// not treat Telugu characters as word characters, so a \b-wrapped pattern
// silently matches nothing at all here (the same trap documented at length
// in interactive-prompts.ts).
const TELUGU_NUMBER_WORDS: Record<string, number> = {
  ఒక్కరు: 1,
  ఒకరు: 1,
  ఇద్దరు: 2,
  ముగ్గురు: 3,
  నలుగురు: 4,
  ఐదుగురు: 5,
};

function inRange(n: number): number | null {
  return Number.isFinite(n) && n >= MIN_GUESTS && n <= MAX_GUESTS ? n : null;
}

/**
 * A bare number ("2") is only a guest count in the context of having just
 * been asked for one — standalone it could be a room number, a price, a
 * night count, anything. Mirrors the same deliberate restriction
 * hasStatedGuestCount already applies to BARE_COUNT_REPLY_PATTERN.
 */
const BARE_COUNT = /^(\d{1,2})\+?\s*(guests?|people|persons?|pax)?[.!?]?$/i;
const BARE_COUNT_WORD = /^(one|two|three|four|five|six|seven|eight|nine|ten)\s*(guests?|people|persons?|pax)?[.!?]?$/i;

export interface ExtractGuestCountOptions {
  /**
   * True when the immediately preceding assistant message asked how many
   * people are staying — the only context in which a bare number is safely
   * a guest count.
   */
  answeringGuestCountQuestion?: boolean;
}

/**
 * Pulls a concrete party size out of one guest message, or null if the
 * message doesn't state one.
 *
 * Deliberately conservative and best-effort in the same way date-marker.ts
 * is: returning null is never a failure, it just means nothing was captured
 * this turn and the existing transcript-scan fallback still applies. A wrong
 * number is far worse than no number, so every branch here is anchored to an
 * explicit person-word rather than guessing from a loose digit.
 */
export function extractGuestCount(text: string, opts: ExtractGuestCountOptions = {}): number | null {
  const raw = text.trim();
  if (!raw) return null;

  // --- Telugu (unanchored, checked first: it can't rely on \b at all) ---
  const teluguDigit = raw.match(/(\d+)\+?\s*మంది/);
  if (teluguDigit) return inRange(Number(teluguDigit[1]));
  for (const [word, n] of Object.entries(TELUGU_NUMBER_WORDS)) {
    if (raw.includes(word)) return n;
  }

  // --- Phrasings where the guest counts themselves separately ---
  // "myself + 2" / "me + 2" means 2 OTHERS plus the speaker. Anchored to
  // myself/me rather than a bare "+ N" so it can't collide with the leading
  // "+" of a phone number like "+91 98765...".
  const plusSelf = raw.match(/\b(?:myself|me)\s*\+\s*(\d+)\b/i);
  if (plusSelf) return inRange(Number(plusSelf[1]) + 1);

  // "3 including me" already counts the speaker — no +1.
  const includingMe = raw.match(/\b(\d+)\s*(?:people|persons?|guests?|of us)?\s*including me\b/i);
  if (includingMe) return inRange(Number(includingMe[1]));

  // --- Explicit group phrasings ---
  const groupOf = raw.match(/\b(?:family|group|party)\s+of\s+(\d+)\b/i);
  if (groupOf) return inRange(Number(groupOf[1]));

  const weAre = raw.match(/\b(?:we are|we're|hum)\s+(\d+)\b/i);
  if (weAre) return inRange(Number(weAre[1]));

  const ofUs = raw.match(/\bthere(?:'s| is|\s+are)\s+(\d+)\s+of us\b/i);
  if (ofUs) return inRange(Number(ofUs[1]));

  // --- "N people" and its many nouns, in every script/register ---
  // "log"/"logon" is the Hinglish person-noun ("3 log"); the negative
  // lookahead on "in" keeps "do log in" (a WiFi question) from matching.
  // "peopl\w*" and "ppl" rather than a strict "people": a soak with realistic
  // typing noise showed ordinary misspellings ("3+ peopple") dropping out of
  // detection entirely, which then reads to the guest as being asked their
  // party size a second time. The leading digit and a person-noun stem
  // together are specific enough that loosening the tail is safe.
  const digitNoun = raw.match(/\b(\d+)\+?\s*(?:guests?|peopl\w*|ppl|persons?|pax|adults?|members?|log(?:on)?\b(?!\s*in))/i);
  if (digitNoun) return inRange(Number(digitNoun[1]));

  const wordNoun = raw.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:guests?|people|persons?|pax|adults?|members?)\b/i);
  if (wordNoun) return ENGLISH_NUMBER_WORDS[wordNoun[1].toLowerCase()] ?? null;

  const hindiWordNoun = raw.match(/\b(ek|do|teen|chaar|char|paanch|panch|chhe|che|saat|aath|nau|dus|das)\s+log\b(?!\s*in)/i);
  if (hindiWordNoun) return HINDI_NUMBER_WORDS[hindiWordNoun[1].toLowerCase()] ?? null;

  // --- Fixed-size phrasings ---
  if (/\b(?:we'?re a couple|just the two of us|couple of us|me and my (?:wife|husband|partner|girlfriend|boyfriend))\b/i.test(raw)) {
    return 2;
  }
  if (/\b(?:just me|only me|solo|myself)\b/i.test(raw)) return 1;

  // --- "for N", guarded against durations ("for 2 nights") ---
  const forN = raw.match(/\bfor\s+(\d+)\+?(?!\s*(?:nights?|days?|hours?|weeks?|months?))\b/i);
  if (forN) return inRange(Number(forN[1]));

  // --- Bare reply, only right after being asked ---
  if (opts.answeringGuestCountQuestion) {
    const bare = raw.match(BARE_COUNT);
    if (bare) return inRange(Number(bare[1]));
    const bareWord = raw.match(BARE_COUNT_WORD);
    if (bareWord) return ENGLISH_NUMBER_WORDS[bareWord[1].toLowerCase()] ?? null;
  }

  return null;
}

const ASKED_GUEST_COUNT = /how many (people|guests|persons)|kitne (guests|log)|ఎంత మంది|ఎందరు/i;

/** True when this assistant message is the "how many people?" ask — see extractGuestCount's bare-number rule. */
export function messageAsksGuestCount(text: string): boolean {
  return ASKED_GUEST_COUNT.test(text);
}

/**
 * Reads a party size out of one turn's guest message so the caller can store
 * it on the contact, resolving the bare-number case against the transcript.
 *
 * Deliberately not driven from the AI's own output the way the DATES: marker
 * is: guest count comes from the guest's message, and the turn it most often
 * arrives on ("2 people", tapped from the GUEST_COUNT list) is answered by
 * resolveDeterministicReply, which skips the model entirely. The caller
 * (process-message-job.ts) is the one point every turn passes through.
 *
 * A later message CAN correct an earlier count, and deliberately so: the
 * GUEST_COUNT list's top row is "3+ people", which can only be stored as its
 * floor of 3, so a party of six who taps it and then says "actually we're 6"
 * has to be able to move the stored value. That's safe to allow precisely
 * because extractGuestCount only fires on an explicit person-phrase — a bare
 * number counts only in direct answer to the question, so a stray budget or
 * room number can't overwrite anything.
 *
 * Returns undefined when nothing was stated, or when the value is unchanged,
 * so the caller writes only on a real change.
 */
export function captureGuestCount(
  guestMessage: string,
  history: { role: string; content: string }[],
  knownGuestCount?: number | null
): number | undefined {
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const captured = extractGuestCount(guestMessage, {
    answeringGuestCountQuestion: lastAssistant ? messageAsksGuestCount(lastAssistant.content) : false,
  });
  if (captured == null || captured === knownGuestCount) return undefined;
  return captured;
}
