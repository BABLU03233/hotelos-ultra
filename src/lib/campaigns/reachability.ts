import { serviceWindow } from "@/lib/whatsapp/service-window";
import { CampaignMessageType } from "@/types";

/**
 * Which selected contacts a broadcast physically cannot reach.
 *
 * WhatsApp only allows a free-form message (text or image) within 24 hours of
 * the guest's own last inbound message. Outside that, an approved template is
 * the only thing that gets through — this is Meta's rule, not a setting.
 *
 * The composer needs this because the alternative is what actually happened:
 * an image broadcast was built, named, reviewed, approved and "sent" to two
 * contacts who had never messaged the hotel — so every message was refused,
 * and the owner retried it twice more before anything explained why. The rule
 * is knowable at the moment the recipients are picked, so it should be said
 * then, not discovered afterwards in a delivery report.
 */
export interface ReachabilityContact {
  id: string;
  name?: string | null;
  phone: string;
  lastInboundAt: string | null;
}

export function unreachableForFreeForm<T extends ReachabilityContact>(
  contacts: T[],
  messageType: CampaignMessageType,
  now: Date = new Date()
): T[] {
  // A template is the thing that works outside the window, so nothing is
  // unreachable on that path — that is the entire point of templates.
  if (messageType === "TEMPLATE") return [];

  return contacts.filter((c) => !serviceWindow(c.lastInboundAt ? new Date(c.lastInboundAt) : null, now).open);
}

/**
 * The warning to show, or null when everything selected can be reached.
 *
 * Worded around the fix rather than the rule: "switch to an approved
 * template" is the action, and naming the 24-hour window alone leaves the
 * owner to work that out.
 */
export function reachabilityWarning(unreachable: number, total: number): string | null {
  if (unreachable === 0) return null;

  if (unreachable === total) {
    return total === 1
      ? "This contact hasn't messaged you in the last 24 hours, so WhatsApp won't deliver a text or image broadcast. Switch the message type to an approved template."
      : `None of these ${total} contacts have messaged you in the last 24 hours, so WhatsApp won't deliver a text or image broadcast to any of them. Switch the message type to an approved template.`;
  }

  return `${unreachable} of ${total} selected ${unreachable === 1 ? "contact hasn't" : "contacts haven't"} messaged you in the last 24 hours, so this won't reach ${unreachable === 1 ? "them" : "those"}. An approved template would reach everyone.`;
}
