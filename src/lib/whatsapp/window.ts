import { serviceWindow } from "./service-window";

/**
 * The WhatsApp Business Platform "customer service window": free-form messages
 * are only allowed within 24h of the customer's last inbound message; outside
 * it, an approved template is required.
 *
 * Kept as a thin wrapper rather than a second implementation. Campaigns and
 * follow-up sweeps already called this, and service-window.ts was added later
 * for the CRM composer — two copies of the same platform rule is exactly the
 * kind of pair that drifts, and the one that drifted would silently start
 * sending messages Meta drops.
 */
export function isWithin24HourWindow(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  return serviceWindow(lastInboundAt, now).open;
}
