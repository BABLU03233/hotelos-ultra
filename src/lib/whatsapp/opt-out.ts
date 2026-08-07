import { InboundMessage } from "./webhook";

// Exact-phrase match for free-text (not a substring check) so a guest
// saying something like "can I stop by the pool bar" never trips this.
const STOP_TEXT_PHRASES = new Set(["stop", "unsubscribe", "stop promos", "stop promotions", "opt out", "optout"]);

/**
 * Required opt-out detection under WhatsApp's Business Messaging Policy —
 * a "Stop promos" quick-reply click, or a guest texting STOP/UNSUBSCRIBE.
 * Button labels are ones we author ourselves (template builder), so a
 * looser "contains stop" match is safe there; free text needs an exact
 * match to avoid false positives.
 */
export function isOptOutSignal(msg: Pick<InboundMessage, "type" | "text" | "buttonText">): boolean {
  if (msg.buttonText && /stop/i.test(msg.buttonText)) return true;
  if (msg.type === "text" && msg.text) {
    if (STOP_TEXT_PHRASES.has(msg.text.trim().toLowerCase())) return true;
  }
  return false;
}
