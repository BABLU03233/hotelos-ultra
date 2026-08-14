import { describe, expect, it } from "vitest";
import { buildOfferListMessage } from "./offer-list-message";

const OFFERS = [
  { id: "o1", title: "Flat ₹100 Off (FLAT100)", description: "Flat ₹100 off any room type when you book directly.", discount: "₹100 off" },
  { id: "o2", title: "10% Off First Stay (WELCOME10)", description: "First-time guests only.", discount: "10% off" },
];

describe("buildOfferListMessage", () => {
  it("moves the bracketed code out of the title so it can't be truncated mid-code", () => {
    // This test previously asserted the broken output — "10% Off First Stay
    // (WELC" — as though it were correct. A 30-char title cut at WhatsApp's
    // 24-char limit handed the guest half a coupon code. The code now lives
    // in the description, which has three times the room.
    const msg = buildOfferListMessage(OFFERS);
    expect(msg.type).toBe("list");
    expect(msg.sections).toHaveLength(1);
    expect(msg.sections[0].rows).toEqual([
      { id: "offer_pick_o1", title: "Flat ₹100 Off", description: "₹100 off — code FLAT100 — Flat ₹100 off any room type when you book dire" },
      { id: "offer_pick_o2", title: "10% Off First Stay", description: "10% off — code WELCOME10 — First-time guests only." },
    ]);
  });

  it("never shows a half-truncated code", () => {
    for (const row of buildOfferListMessage(OFFERS).sections[0].rows) {
      expect(row.title).not.toMatch(/\([A-Z0-9_-]*$/);
    }
  });

  it("keeps the full code visible somewhere", () => {
    const rows = buildOfferListMessage(OFFERS).sections[0].rows;
    expect(rows[1].description).toContain("WELCOME10");
  });

  it("renders in the guest's language", () => {
    expect(/[ऀ-ॿ]/.test(buildOfferListMessage(OFFERS, "hi").body)).toBe(true);
    expect(/[ఀ-౿]/.test(buildOfferListMessage(OFFERS, "te").buttonText)).toBe(true);
  });

  it("leaves a title with no bracketed code alone", () => {
    const msg = buildOfferListMessage([{ id: "o1", title: "Monsoon Special", description: null, discount: "15% off" }]);
    expect(msg.sections[0].rows[0].title).toBe("Monsoon Special");
  });

  it("caps at 10 rows even if a tenant has more offers (WhatsApp's hard limit)", () => {
    const manyOffers = Array.from({ length: 15 }, (_, i) => ({ id: `o${i}`, title: `Offer ${i}`, description: null, discount: `${i}% off` }));
    const msg = buildOfferListMessage(manyOffers);
    expect(msg.sections[0].rows).toHaveLength(10);
  });

  it("truncates a long title to WhatsApp's 24-char row title limit", () => {
    const msg = buildOfferListMessage([{ id: "o1", title: "Flat ₹500 Off for Stays of 3 Nights or Longer", description: null, discount: "₹500 off" }]);
    expect(msg.sections[0].rows[0].title.length).toBeLessThanOrEqual(24);
  });

  it("truncates a long combined description to WhatsApp's 72-char row description limit", () => {
    const longDescription =
      "Staying 3 nights or longer? Get a flat ₹500 off your total bill, valid on all room types, direct bookings only.";
    const msg = buildOfferListMessage([{ id: "o1", title: "3+ Nights Offer", description: longDescription, discount: "₹500 off" }]);
    expect(msg.sections[0].rows[0].description.length).toBeLessThanOrEqual(72);
  });

  it("handles a null description by falling back to just the discount", () => {
    const msg = buildOfferListMessage([{ id: "o1", title: "Flat Discount", description: null, discount: "₹300 off" }]);
    expect(msg.sections[0].rows[0].description).toBe("₹300 off");
  });

  it("handles a null discount by falling back to just the description", () => {
    const msg = buildOfferListMessage([{ id: "o1", title: "Special", description: "Ask front desk for details.", discount: null }]);
    expect(msg.sections[0].rows[0].description).toBe("Ask front desk for details.");
  });

  it("handles an empty offer list without throwing", () => {
    const msg = buildOfferListMessage([]);
    expect(msg.sections[0].rows).toEqual([]);
  });
});
