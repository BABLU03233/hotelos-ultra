/**
 * What the guest sees when a human needs to take over — either the model
 * itself flagged low confidence (an ESCALATE: marker, see pipeline.ts) or
 * every AI provider failed outright (see process-message-job.ts). Neither
 * case can safely hand the guest whatever text the model produced (the
 * marker case exists because that text was flagged unreliable; the outage
 * case has no model text at all), so this is deliberately a fixed,
 * pre-written pool rather than anything generated per-message.
 *
 * A pool instead of one string: reported live — the exact same sentence,
 * word for word, on every single escalation in a conversation read as a
 * canned bot reply regardless of what the guest actually said. Picking
 * between a few warm, human-sounding options doesn't fix that (nothing
 * here reacts to the guest's message — that would mean trusting exactly
 * the unverified text this exists to avoid sending), but it stops the
 * identical-repeat tell.
 */
const HOLDING_MESSAGES = [
  "Thanks for your message — let me get one of our team to help with that, they'll be with you shortly!",
  "Got it, thank you! I'll bring in one of our team to help you with this — they'll be with you shortly.",
  "Thanks for letting me know — I'm looping in one of our team so they can help you properly. Won't be long!",
  "Appreciate you telling me that — let me hand you over to one of our team, they'll be with you in just a moment.",
];

export function randomHoldingMessage(): string {
  return HOLDING_MESSAGES[Math.floor(Math.random() * HOLDING_MESSAGES.length)];
}
