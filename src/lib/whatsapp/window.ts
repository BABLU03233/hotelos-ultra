/** The WhatsApp Business Platform "customer service window": free-form messages are only
 *  allowed within 24h of the customer's last inbound message; outside it, an approved
 *  template is required. */
export function isWithin24HourWindow(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < 24 * 60 * 60 * 1000;
}
