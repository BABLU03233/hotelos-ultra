import { describe, expect, it } from "vitest";
import { describeTiers, hasExactTier, lowestPrice, parseOccupancyPrices, priceForGuests } from "./occupancy-price";

const CLASSIC = { price: 999, occupancyPrices: [{ guests: 1, price: 999 }, { guests: 2, price: 1299 }] };
const DELUXE = {
  price: 1299,
  occupancyPrices: [{ guests: 1, price: 1299 }, { guests: 2, price: 1599 }, { guests: 3, price: 1899 }],
};
const NO_TIERS = { price: 2500, occupancyPrices: undefined as unknown };

describe("priceForGuests", () => {
  it("quotes the rate for that exact party size", () => {
    // The bug this exists for: every list said "from ₹999", so a couple was
    // shown a number they would never be charged — and arrived expecting it.
    expect(priceForGuests(CLASSIC, 2)).toBe(1299);
    expect(priceForGuests(DELUXE, 3)).toBe(1899);
  });

  it("falls UP to the next tier, never down", () => {
    // Quoting low and correcting at the desk is the failure this avoids.
    expect(priceForGuests(CLASSIC, 2)).toBeGreaterThan(priceForGuests(CLASSIC, 1));
    expect(priceForGuests({ price: 999, occupancyPrices: [{ guests: 2, price: 1299 }] }, 1)).toBe(1299);
  });

  it("uses the top tier for a party larger than any listed", () => {
    expect(priceForGuests(CLASSIC, 9)).toBe(1299);
  });

  it("falls back to the headline rate when a hotel set no tiers", () => {
    expect(priceForGuests(NO_TIERS, 2)).toBe(2500);
  });

  it("falls back when the party size is unknown", () => {
    expect(priceForGuests(CLASSIC, null)).toBe(999);
  });
});

describe("parseOccupancyPrices", () => {
  it("sorts by party size", () => {
    const out = parseOccupancyPrices([{ guests: 3, price: 1899 }, { guests: 1, price: 1299 }]);
    expect(out.map((t) => t.guests)).toEqual([1, 3]);
  });

  it("drops anything malformed rather than trusting operator-edited JSON", () => {
    // A bad row here becomes a wrong price in a real conversation.
    expect(parseOccupancyPrices([{ guests: 0, price: 500 }, { guests: 2, price: -1 }, { guests: 1 }, "x", null])).toEqual([]);
    expect(parseOccupancyPrices(null)).toEqual([]);
    expect(parseOccupancyPrices("nope")).toEqual([]);
  });
});

describe("describeTiers", () => {
  it("puts the whole table on one line", () => {
    expect(describeTiers(CLASSIC)).toBe("1p ₹999 · 2p ₹1,299");
  });

  it("trims to fit a WhatsApp row description", () => {
    const many = { price: 999, occupancyPrices: Array.from({ length: 8 }, (_, i) => ({ guests: i + 1, price: 1000 + i * 500 })) };
    const out = describeTiers(many, 40)!;
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns null when there are no tiers, so the caller keeps the old line", () => {
    expect(describeTiers(NO_TIERS)).toBeNull();
  });
});

describe("lowestPrice", () => {
  it("is the cheapest real tier, not the headline field", () => {
    expect(lowestPrice({ price: 5000, occupancyPrices: [{ guests: 1, price: 999 }] })).toBe(999);
  });

  it("falls back to the headline rate", () => {
    expect(lowestPrice(NO_TIERS)).toBe(2500);
  });
});

describe("hasExactTier", () => {
  it("is true only when the hotel published a rate for exactly that party", () => {
    // Guards the case where a room is offered to a party bigger than its
    // tiers: priceForGuests falls up to the top rate, which is the right
    // number to show — but presenting it as "₹1,299 for 3 guests" states a
    // quote nobody made, and the guest arrives expecting it.
    expect(hasExactTier(CLASSIC, 2)).toBe(true);
    expect(hasExactTier(CLASSIC, 3)).toBe(false);
    expect(hasExactTier(NO_TIERS, 2)).toBe(false);
    expect(hasExactTier(CLASSIC, null)).toBe(false);
  });
});
