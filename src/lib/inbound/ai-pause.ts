/**
 * When an AI pause has gone stale.
 *
 * Sending a manual reply from the CRM sets Contact.aiPaused, which is exactly
 * right while a human is actually in the conversation — Anushka talking over a
 * receptionist would be worse than silence. But nothing ever cleared it, so
 * one friendly message from staff silenced the assistant for that guest
 * permanently.
 *
 * Found in production, not by a test: five of eight contacts were paused, and
 * guests were messaging "Hi" and getting nothing at all for over a day. The
 * "Resume AI" button existed the whole time, in a header badge that is
 * `hidden lg:flex` — invisible on the phone the owner actually uses.
 *
 * A pause is a statement about right now, so it expires. Twelve hours is
 * chosen because it spans a shift: staff who replied this morning are not
 * still mid-conversation tonight, while a pause set minutes ago is respected
 * for the rest of the working day. Re-tapping Pause in the CRM re-stamps
 * aiPausedAt, so a deliberate pause can always be held indefinitely.
 *
 * An explicit HANDOVER is the exception, and it has to be. Expiry exists to
 * catch a pause nobody meant to leave running; a handover is the opposite —
 * someone deliberately took the conversation, and a receptionist settling a
 * booking cannot have Anushka wake up at hour thirteen and start negotiating
 * underneath them. See handover.ts.
 */
export const AI_PAUSE_EXPIRY_HOURS = 12;

export function isPauseStale(
  contact: { aiPaused: boolean; aiPausedAt: Date | null; handoverAt?: Date | null },
  now: Date = new Date()
): boolean {
  if (!contact.aiPaused) return false;
  // A human holds this conversation until they hand it back. Never stale.
  if (contact.handoverAt) return false;
  // A pause with no timestamp predates this field. Treating it as stale is the
  // deliberate choice: those are exactly the rows that had been silently dead,
  // and leaving them paused forever is the bug being fixed.
  if (!contact.aiPausedAt) return true;
  return now.getTime() - contact.aiPausedAt.getTime() > AI_PAUSE_EXPIRY_HOURS * 3_600_000;
}
