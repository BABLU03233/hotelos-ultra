/**
 * What a room actually costs for the party in front of you.
 *
 * Indian hotels price per occupancy, not per room. Until this existed the only
 * rate the assistant could quote was Room.price — the single-occupancy
 * headline — so every list said "from ₹999" and a couple was shown a number
 * that was not their number. They then arrived expecting it.
 *
 * The tiers live in Room.occupancyPrices as [{ guests, price }]. A hotel that
 * has not filled them in still works: everything here falls back to the
 * headline rate, which is what the product did before.
 */

export interface OccupancyPrice {
  guests: number;
  price: number;
}

/** Parses the JSON column defensively — it is operator-editable data. */
export function parseOccupancyPrices(raw: unknown): OccupancyPrice[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is OccupancyPrice =>
        typeof r === "object" &&
        r !== null &&
        Number.isFinite((r as OccupancyPrice).guests) &&
        Number.isFinite((r as OccupancyPrice).price) &&
        (r as OccupancyPrice).guests > 0 &&
        (r as OccupancyPrice).price > 0
    )
    .sort((a, b) => a.guests - b.guests);
}

/**
 * The rate for a specific party size.
 *
 * Falls UP to the next tier that can hold them rather than down: a hotel that
 * lists 1 and 2 guests and is asked about 3 should quote the 2-guest rate as
 * the closest real figure it has, never the cheaper 1-guest one — quoting low
 * and correcting at the desk is the failure this whole module exists to avoid.
 */
export function priceForGuests(room: { price: number; occupancyPrices?: unknown }, guests: number | null | undefined): number {
  const tiers = parseOccupancyPrices(room.occupancyPrices);
  if (!tiers.length || !guests || guests < 1) return room.price;

  const exact = tiers.find((t) => t.guests === guests);
  if (exact) return exact.price;

  const higher = tiers.find((t) => t.guests > guests);
  if (higher) return higher.price;

  // Party larger than every tier — the most expensive one is the honest floor.
  return tiers[tiers.length - 1].price;
}

/** The lowest real rate, for a list shown before the party size is known. */
export function lowestPrice(room: { price: number; occupancyPrices?: unknown }): number {
  const tiers = parseOccupancyPrices(room.occupancyPrices);
  return tiers.length ? Math.min(...tiers.map((t) => t.price)) : room.price;
}

/**
 * "1 guest ₹999 · 2 guests ₹1,299" — the whole tier table on one line.
 *
 * Shown when the party size is NOT yet known, so the guest can see where they
 * land instead of being quoted a "from" price they will not pay. Trimmed to
 * fit a WhatsApp list-row description.
 */
export function describeTiers(room: { price: number; occupancyPrices?: unknown }, maxLength = 72): string | null {
  const tiers = parseOccupancyPrices(room.occupancyPrices);
  if (!tiers.length) return null;

  const parts = tiers.map((t) => `${t.guests}p ₹${t.price.toLocaleString("en-IN")}`);
  let out = parts.join(" · ");
  while (out.length > maxLength && parts.length > 1) {
    parts.pop();
    out = `${parts.join(" · ")} · …`;
  }
  return out;
}
