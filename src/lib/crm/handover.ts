/**
 * Who is answering this guest right now.
 *
 * Three states, and the receptionist has to be able to tell them apart at a
 * glance — "is the bot going to reply, or am I?" is the single question a
 * shared inbox has to answer, and getting it wrong means either a guest gets
 * two answers or none.
 *
 *   ai      — Anushka is handling it. Default.
 *   human   — a person explicitly took over. Anushka stays quiet indefinitely.
 *   paused  — Anushka is quiet because staff typed a reply, but nobody
 *             formally took the conversation. This one expires (see
 *             ai-pause.ts) so a forgotten pause cannot silence her forever.
 *
 * The `human` / `paused` split is the important one. Before it existed there
 * was a single boolean, so the only way to stop the assistant permanently was
 * a pause that also silenced her permanently by accident — the production bug
 * where five of eight contacts sat dead for a day. Making the deliberate case
 * explicit lets the accidental case stay safely self-healing.
 */

export type ConversationMode = "ai" | "human" | "paused";

export interface HandoverFields {
  aiPaused: boolean;
  handoverAt: Date | string | null;
}

export function conversationMode(contact: HandoverFields): ConversationMode {
  if (contact.handoverAt) return "human";
  return contact.aiPaused ? "paused" : "ai";
}

/**
 * Why a conversation was handed to a person. Stored as free text so it can
 * carry a staff member's own wording, but these are the two the system itself
 * writes.
 */
export const HANDOVER_REASON = {
  /** A booking exists — the rest is payment, ID, arrival time. Human work. */
  BOOKED: "Booking made — needs a person",
  /** A receptionist chose to take it. */
  MANUAL: "Taken over by reception",
} as const;

/**
 * The fields to write when a person takes a conversation.
 *
 * aiPaused is set alongside handoverAt rather than being inferred from it.
 * Every existing read path in the app — the inbound pipeline, the CRM badge,
 * the follow-up sweep — already checks aiPaused, and a handover that forgot to
 * set it would leave Anushka replying underneath a receptionist. Keeping the
 * old flag authoritative means nothing has to be found and updated to respect
 * the new state.
 */
export function takeOverFields(reason: string, byName?: string | null) {
  const now = new Date();
  return {
    aiPaused: true,
    aiPausedAt: now,
    handoverAt: now,
    handoverReason: reason,
    handoverByName: byName ?? null,
  };
}

/**
 * The fields to write when a conversation goes back to Anushka.
 *
 * `briefing` is what the receptionist wants her to know — it is stored where
 * the prompt will read it, not in the CRM-only `notes` field. A handover note
 * nobody reads is how a guest gets asked the same question twice.
 *
 * An empty briefing clears the previous one rather than leaving it: a stale
 * note from last month's stay is worse than none, because Anushka would state
 * it to the guest as current fact.
 */
export function returnToAiFields(briefing?: string | null) {
  return {
    aiPaused: false,
    aiPausedAt: null,
    handoverAt: null,
    handoverReason: null,
    handoverByName: null,
    aiBriefing: briefing?.trim() ? briefing.trim() : null,
  };
}
