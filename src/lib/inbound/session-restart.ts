import { looksLikeBareGreeting } from "@/lib/ai/interactive-prompts";

/**
 * Starting a returning guest's conversation over.
 *
 * A guest who booked last week, or who drifted off halfway through, comes
 * back and types "hi". Until now that landed them in the middle of the old
 * conversation: the model was handed a transcript ending in "Your booking
 * reference is HOT-4821" and answered as though the thread had never paused,
 * and — worse for the ones who never booked — the funnel still held the dates
 * and party size they mentioned days earlier, so a room shortlist could be
 * re-sent for dates that had since gone stale.
 *
 * The deterministic waterfall already knows how to greet a bare "hi"
 * (looksLikeBareGreeting), but it never got the chance: `intentShown` is
 * derived partly from room prices appearing anywhere in the recent history,
 * so any guest who had once been shown a room was permanently past the
 * greeting stage. Clearing the history is what lets the existing machinery do
 * the right thing, rather than adding a second greeting path beside it.
 */

/**
 * How long a silence has to be before "hi" means "start again" rather than
 * "I'm still here".
 *
 * Six hours, chosen against how the two cases actually differ. Inside one
 * sitting a "hi" is filler — a guest re-opening the chat, or thinking aloud
 * between questions — and wiping the dates they just gave would be the very
 * "not listening" failure this codebase keeps having to fix. Across a night's
 * gap it is unambiguously a new visit. Six hours is short enough that
 * yesterday evening's enquiry and this morning's greeting are separate, and
 * long enough that nothing within a single conversation trips it.
 */
export const SESSION_GAP_HOURS = 6;

export interface RestartInput {
  guestMessage: string;
  /** Hours since the guest's PREVIOUS inbound message, or null if this is their first ever. */
  hoursSinceLastInbound: number | null;
}

/**
 * True when this turn should be treated as the start of a new conversation.
 *
 * Deliberately requires the message to be a bare greeting and nothing else. A
 * returning guest who opens with "hi, do you have rooms for the 12th?" has
 * given real content, and resetting them to a greeting menu would throw that
 * away and ask a question they just answered — the same defect from the
 * opposite direction.
 */
export function shouldRestartSession({ guestMessage, hoursSinceLastInbound }: RestartInput): boolean {
  if (!looksLikeBareGreeting(guestMessage)) return false;
  // Null means there is no previous inbound at all — a genuine first message,
  // which the normal isFirstReply path already handles. Nothing to restart.
  if (hoursSinceLastInbound === null) return false;
  return hoursSinceLastInbound >= SESSION_GAP_HOURS;
}
