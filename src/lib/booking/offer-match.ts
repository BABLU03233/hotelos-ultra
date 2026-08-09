/**
 * Matches a guest's own words against a tenant's real Offer codes (e.g. a
 * guest typing "FLAT100" mid-conversation) so it can be snapshotted onto
 * their Booking at confirmation time. Zero guest-facing behavior change —
 * this only enriches a staff-facing record (Booking.offerId/offerSnapshot),
 * so a miss (no code typed, or code left unset on the offer) is completely
 * harmless, same fail-soft philosophy as room-match.ts.
 *
 * Offers with no code set are simply never matched — not an error.
 */
export function matchOfferCode(offers: { id: string; title: string; code: string | null }[], texts: string[]): { id: string; title: string } | null {
  const combined = texts.join(" ");
  for (const offer of offers) {
    if (!offer.code) continue;
    const pattern = new RegExp(`\\b${offer.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(combined)) return { id: offer.id, title: offer.title };
  }
  return null;
}
