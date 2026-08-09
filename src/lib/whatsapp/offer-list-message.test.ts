import { describe, expect, it } from "vitest";
import { buildOfferListMessage } from "./offer-list-message";

const OFFERS = [
  { id: "o1", title: "Flat ₹100 Off (FLAT100)", description: "Flat ₹100 off any room type when you book directly.", discount: "₹100 off" },
  { id: "o2", title: "10% Off First Stay (WELCOME10)", description: "First-time guests only.", discount: "10% off" },
];

describe("buildOfferListMessage", () => {
  it("builds one row per offer with id/title/description combining discount and description", () => {
    const msg = buildOfferListMessage(OFFERS);
    expect(msg.type).toBe("list");
    expect(msg.sections).toHaveLength(1);
    expect(msg.sections[0].rows).toEqual([
      { id: "offer_pick_o1", title: "Flat ₹100 Off (FLAT100)", description: "₹100 off — Flat ₹100 off any room type when you book directly." },
      { id: "offer_pick_o2", title: "10% Off First Stay (WELC", description: "10% off — First-time guests only." },
    ]);
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
