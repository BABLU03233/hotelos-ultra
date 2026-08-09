/**
 * Deterministic interception for two specific hallucinations caught live in
 * testing: the AI fabricating a phone number to "call and finalize", and
 * claiming a booking is confirmed in prose. Both are worse than a missing
 * button — a hotel's phone number is never in the system prompt's HOTEL
 * INFORMATION section at all, so any phone-number-shaped string in a reply
 * is by definition invented, and only a tap on Confirm booking actually
 * completes a booking (see complete-booking.ts) — a prose claim otherwise
 * is simply false. A prompt-only "never do this" rule is not trusted alone
 * here given how unreliable prompt-only rules proved for every other
 * button/content decision this session; replies matching either pattern
 * are swapped for a safe, generic nudge rather than risking a partial,
 * possibly-broken rewrite of the AI's own sentence.
 */
const PHONE_NUMBER_PATTERN = /(\+?91[\s-]?)?\d{5}[\s-]?\d{5}\b|\b\d{10}\b/;
const FALSE_CONFIRMATION_PATTERN = /\b(booking(?:'s| is)? confirmed|you'?re (all )?booked|booking (?:is )?done|reservation confirmed)\b/i;

export function hasHallucinationRisk(text: string): boolean {
  return PHONE_NUMBER_PATTERN.test(text) || FALSE_CONFIRMATION_PATTERN.test(text);
}

export const SAFE_REPLY_FALLBACK = "Great, glad that works for you! 🎉 Just tap Confirm booking below when you're ready and I'll take care of the rest.";
