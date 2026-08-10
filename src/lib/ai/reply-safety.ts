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
