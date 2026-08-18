/**
 * WhatsApp's 24-hour customer service window.
 *
 * Meta only accepts a free-form message to a customer within 24 hours of
 * THEIR most recent inbound message. Outside that window the only thing that
 * reaches them is a pre-approved template. This is a platform rule, not a
 * preference, and there is no way to opt out of it.
 *
 * This module exists because the rule was previously known only to the CRM's
 * banner — a hint next to a composer that stayed fully enabled. Staff tapped
 * a quick reply, Meta returned 200 and a message id (it accepts the request
 * and fails the delivery asynchronously), the bubble showed a tick, and the
 * guest received nothing. Confirmed against production: every failed outbound
 * message went to a contact whose last inbound was over 24 hours old, and the
 * one that was read had messaged 0.0 hours earlier.
 *
 * So the window now has one implementation that the server enforces and the
 * UI merely renders, rather than a rule the UI describes and nobody applies.
 */

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ServiceWindow {
  /** Whether a free-form (non-template) message may be sent right now. */
  open: boolean;
  /** When the window shuts, or null if the guest has never messaged. */
  closesAt: Date | null;
  /** Milliseconds left, floored at 0. */
  msRemaining: number;
}

/**
 * A contact who has NEVER messaged the business has no open window — there is
 * no inbound message to measure 24 hours from, and Meta will reject a
 * free-form send to them exactly as it would for an expired one. Treating an
 * unknown last-inbound as "open" is the more dangerous default: it is the
 * cold-import case, where the guest never opted into a conversation at all.
 */
export function serviceWindow(lastInboundAt: Date | string | null | undefined, now: Date = new Date()): ServiceWindow {
  if (!lastInboundAt) return { open: false, closesAt: null, msRemaining: 0 };

  const last = lastInboundAt instanceof Date ? lastInboundAt : new Date(lastInboundAt);
  if (Number.isNaN(last.getTime())) return { open: false, closesAt: null, msRemaining: 0 };

  const closesAt = new Date(last.getTime() + SERVICE_WINDOW_MS);
  const msRemaining = Math.max(0, closesAt.getTime() - now.getTime());
  return { open: msRemaining > 0, closesAt, msRemaining };
}

/** "3h left" / "42m left" — for the composer's own banner. */
export function describeRemaining(msRemaining: number): string {
  if (msRemaining <= 0) return "closed";
  const minutes = Math.floor(msRemaining / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.floor(minutes / 60)}h left`;
}
