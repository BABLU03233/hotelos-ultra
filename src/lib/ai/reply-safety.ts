/**
 * Deterministic interception for two specific hallucinations caught live in
 * testing: the AI fabricating a phone number to "call and finalize", and
 * claiming a booking is confirmed in prose. Both are worse than a missing
 * button — only a tap on Confirm booking actually completes a booking (see
 * complete-booking.ts) — a prose claim otherwise is simply false. A
 * prompt-only "never do this" rule is not trusted alone here given how
 * unreliable prompt-only rules proved for every other button/content
 * decision this session; replies matching either pattern are swapped for a
 * safe, generic nudge rather than risking a partial, possibly-broken
 * rewrite of the AI's own sentence.
 *
 * A hotel's phone number was never in the system prompt at all when this
 * was first built, so any phone-number-shaped string was by definition
 * invented -- no longer true. A tenant can now list real, call-only numbers
 * in their own custom "additional instructions" (aiSystemPrompt), and a
 * live-caught bug found this blanket check silently swapping out a
 * genuine, hotel-provided number for the generic fallback whenever the AI
 * correctly relayed it -- a confusing non-sequitur reply to a guest who'd
 * just asked for the number. hasHallucinationRisk now takes the set of
 * numbers actually present in that tenant's own instructions (see
 * extractLegitimatePhoneNumbers) and only flags a phone-number-shaped
 * string that ISN'T one of them.
 */
const PHONE_NUMBER_PATTERN = /(\+?91[\s-]?)?\d{5}[\s-]?\d{5}\b|\b\d{10}\b/g;
const FALSE_CONFIRMATION_PATTERN = /\b(booking(?:'s| is)? confirmed|you'?re (all )?booked|booking (?:is )?done|reservation confirmed)\b/i;

function normalizePhoneNumber(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/** Scans a tenant's own custom instructions for real phone numbers they've explicitly listed, so those don't get treated as hallucinations later. */
export function extractLegitimatePhoneNumbers(aiSystemPrompt: string): Set<string> {
  return new Set([...aiSystemPrompt.matchAll(PHONE_NUMBER_PATTERN)].map((m) => normalizePhoneNumber(m[0])));
}

export function hasHallucinationRisk(text: string, legitimatePhoneNumbers: Set<string> = new Set()): boolean {
  const phoneMatches = [...text.matchAll(PHONE_NUMBER_PATTERN)];
  const hasInventedPhoneNumber = phoneMatches.some((m) => !legitimatePhoneNumbers.has(normalizePhoneNumber(m[0])));
  return hasInventedPhoneNumber || FALSE_CONFIRMATION_PATTERN.test(text);
}

export const SAFE_REPLY_FALLBACK = "Great, glad that works for you! 🎉 Just tap Confirm booking below when you're ready and I'll take care of the rest.";

// "₹1,899/night", "₹1899 per night" — a per-night rate, which is the only
// figure that can be checked against a room's real price. Totals ("₹2,598
// for 2 nights") and discounts ("₹100 off") are deliberately out of scope:
// both are legitimate arithmetic over real numbers, and flagging them would
// suppress correct replies.
const PER_NIGHT_PRICE = /(?:₹|rs\.?|inr)\s*([\d,]+)\s*(?:\/|\bper\b)\s*night/gi;

/**
 * True when the reply names a room and quotes a per-night price for it that
 * isn't that room's real rate.
 *
 * From a live incident: asked to recommend, the model quoted ₹1,899 and
 * ₹2,199 for rooms costing ₹1,299 and ₹1,599 — 46% and 37% above the real
 * figures, which were sitting in its own prompt. A guest could have arrived
 * expecting one price and been charged another. The existing guards covered
 * invented phone numbers and false booking confirmations; an invented PRICE
 * went straight through.
 *
 * The room shortlist is now built from Room rows so the main path never
 * routes pricing through the model at all. This is the backstop for
 * everywhere else it might mention one.
 *
 * Only fires when a named room and a per-night figure appear together and
 * none of the quoted figures matches — a reply that mentions a room and a
 * total, or quotes the right price alongside a wrong one, is left alone.
 */
export function hasWrongRoomPrice(text: string, rooms: { name: string; price: number }[]): boolean {
  const quoted = [...text.matchAll(PER_NIGHT_PRICE)].map((m) => Number(m[1].replace(/,/g, "")));
  if (!quoted.length) return false;
  const lower = text.toLowerCase();
  const named = rooms.filter((r) => lower.includes(r.name.toLowerCase()));
  if (named.length !== 1) return false; // ambiguous or no room named — nothing to check against
  return !quoted.some((q) => q === named[0].price);
}

const URL_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(com|in|co\.in|net|org|me|app|link|gl|online|shop)\b\S*/gi;

/**
 * A stray URL (a fabricated booking.com/review link, an invented website)
 * is a real, separate hallucination risk from the phone-number/false-
 * confirmation cases above, but handled differently on purpose: those two
 * usually ARE the whole point of the sentence, so swapping the entire reply
 * for a safe generic line loses nothing real. A URL is more often incidental
 * to an otherwise fine, helpful reply ("check our website at X, want to
 * book?"), and SAFE_REPLY_FALLBACK's own confirm-booking-flavored wording
 * would read as a jarring non-sequitur if it replaced a reply that wasn't
 * actually about confirming a booking -- the exact same class of mismatch
 * already found and fixed once this session for "View photos". Surgically
 * removing just the URL substring keeps the rest of a genuinely useful
 * answer intact instead. The one legitimate URL this app ever sends -- the
 * hotel's own configured Google Maps link, only when a guest asks for the
 * address (see RULES in pipeline.ts) -- is passed in and never stripped.
 */
// A URL sitting mid-sentence is almost always immediately followed by real
// sentence punctuation ("...at hotel.com, hope that helps!"), which \S+
// greedily sweeps into the match. Comparing that raw match against
// approvedUrls verbatim would fail even for the one legitimate URL this app
// sends, since the approved entry itself never has trailing punctuation --
// so the punctuation is split off before the approval check, and re-attached
// either way (a URL that gets removed still leaves its trailing comma/period
// as real sentence punctuation; an approved URL keeps its own).
const TRAILING_PUNCTUATION_PATTERN = /[,.;:!?()]+$/;

export function stripUnapprovedUrls(text: string, approvedUrls: Set<string> = new Set()): string {
  return text
    .replace(URL_PATTERN, (rawMatch) => {
      const trailingPunctuation = rawMatch.match(TRAILING_PUNCTUATION_PATTERN)?.[0] ?? "";
      const url = trailingPunctuation ? rawMatch.slice(0, -trailingPunctuation.length) : rawMatch;
      return approvedUrls.has(url) ? rawMatch : trailingPunctuation;
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const THINK_BLOCK_PATTERN = /<think>[\s\S]*?<\/think>/gi;
const ORPHANED_THINK_CLOSE_PATTERN = /^[\s\S]*?<\/think>/i;

/**
 * Some free-tier "reasoning" models occasionally leak their internal
 * <think>...</think> scratch-work straight into the guest-facing reply
 * instead of keeping it out of the visible completion -- live-caught in a
 * Hindi conversation: the reply contained an orphaned "</think>" mid-
 * sentence (no matching opening tag ever appeared in the visible text, so
 * the model's provider likely truncated/misrouted the reasoning channel),
 * immediately followed by what looked like the model re-answering from
 * scratch. Handles both the well-formed case (a full <think>...</think>
 * block, stripped whole) and the orphaned-closing-tag case (strips
 * everything up to and including the first "</think>", keeping only what
 * comes after it -- in the live-caught case this alone was already a
 * complete, correct answer on its own).
 */
export function stripThinkingArtifacts(text: string): string {
  let cleaned = text.replace(THINK_BLOCK_PATTERN, "").trim();
  if (cleaned.includes("</think>")) {
    cleaned = cleaned.replace(ORPHANED_THINK_CLOSE_PATTERN, "").trim();
  }
  return cleaned;
}
