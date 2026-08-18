import { describe, expect, it } from "vitest";
import { hasWrongRoomPrice, toWhatsAppFormatting } from "./reply-safety";

// The live hotel's real rooms, descriptions included — occupancy-tiered rates
// live in that text, which is the whole point of these cases.
const ROOMS = [
  {
    name: "Classic Room",
    price: 999,
    description: "Queen comfort with city-view elegance. From ₹999/night for 1 guest, ₹1,299/night for 2 guests.",
  },
  {
    name: "Deluxe Room",
    price: 1299,
    description: "Signature luxury with city views. From ₹1,299/night for 1 guest, ₹1,599 for 2, ₹1,899 for 3.",
  },
  {
    name: "Premium Room",
    price: 1599,
    description: "Larger and more luxurious. From ₹1,599/night for 1 guest, ₹1,899 for 2, ₹2,199 for 3.",
  },
];

describe("the price guard accepts prices the hotel actually published", () => {
  // The misdiagnosis this fixes. The guard's original incident report recorded
  // the model "inventing" ₹1,899 and ₹2,199 for rooms costing ₹1,299 and
  // ₹1,599 — but both figures are written verbatim in those rooms' own
  // descriptions as the 3-guest rate. The model was pricing correctly for the
  // party size, and the guard replaced the answer with a confirm-booking line
  // that answered nothing.
  it("allows the 3-guest rate from the Deluxe description", () => {
    expect(hasWrongRoomPrice("For 3 guests the Deluxe Room is ₹1,899/night 😊", ROOMS)).toBe(false);
  });

  it("allows the 3-guest rate from the Premium description", () => {
    expect(hasWrongRoomPrice("The Premium Room works out to ₹2,199/night for 3 guests", ROOMS)).toBe(false);
  });

  it("allows the 2-guest rate from the Classic description", () => {
    expect(hasWrongRoomPrice("Classic Room is ₹1,299/night for 2 guests", ROOMS)).toBe(false);
  });

  it("still allows the plain base rate", () => {
    expect(hasWrongRoomPrice("Our Classic Room starts from ₹999/night", ROOMS)).toBe(false);
  });

  it("still catches a genuinely invented price", () => {
    // Published nowhere — not the base rate, not in any description. This is
    // what the guard is actually for.
    expect(hasWrongRoomPrice("The Classic Room is ₹2,750/night", ROOMS)).toBe(true);
    expect(hasWrongRoomPrice("Deluxe Room, ₹4,000/night for you", ROOMS)).toBe(true);
  });

  it("ignores replies that name no room or quote no per-night rate", () => {
    expect(hasWrongRoomPrice("We have rooms free that weekend!", ROOMS)).toBe(false);
    expect(hasWrongRoomPrice("The Deluxe Room is lovely", ROOMS)).toBe(false);
  });

  it("copes with a room that has no description at all", () => {
    const rooms = [{ name: "Studio", price: 800, description: null }];
    expect(hasWrongRoomPrice("Studio is ₹800/night", rooms)).toBe(false);
    expect(hasWrongRoomPrice("Studio is ₹1,500/night", rooms)).toBe(true);
  });
});

describe("markdown becomes what WhatsApp actually renders", () => {
  // Caught live: "**Classic Room** – starting from ₹999/night ... **Current
  // offer:**". WhatsApp's bold is a single asterisk, so the guest saw the
  // asterisks themselves and the reply read as broken.
  it("converts double-asterisk bold to WhatsApp's single asterisk", () => {
    expect(toWhatsAppFormatting("**Classic Room** – from ₹999/night")).toBe("*Classic Room* – from ₹999/night");
  });

  it("converts __underscored__ emphasis to WhatsApp italics", () => {
    expect(toWhatsAppFormatting("__Current offer__: 10% off")).toBe("_Current offer_: 10% off");
  });

  it("strips headings, which WhatsApp has no concept of", () => {
    expect(toWhatsAppFormatting("### Our rooms\nClassic from ₹999")).toBe("Our rooms\nClassic from ₹999");
  });

  it("turns markdown bullets into real bullet characters", () => {
    // A leading "* " would otherwise read as an unterminated bold marker.
    expect(toWhatsAppFormatting("- Classic\n- Deluxe")).toBe("• Classic\n• Deluxe");
    expect(toWhatsAppFormatting("* Classic\n* Deluxe")).toBe("• Classic\n• Deluxe");
  });

  it("removes a Photos: label left dangling once the IMAGE lines are stripped", () => {
    expect(toWhatsAppFormatting("Here's the Classic Room!\n\nPhotos:")).toBe("Here's the Classic Room!");
  });

  it("leaves an ordinary reply untouched", () => {
    for (const s of [
      "Our Classic Room is ₹999/night — shall I check availability?",
      "అవును, మా హోటల్లో Wi-Fi ఉంది 📶😊",
      "Haan, har room mein complimentary Wi-Fi milta hai 📶",
    ]) {
      expect(toWhatsAppFormatting(s), s).toBe(s);
    }
  });

  it("does not mangle a lone asterisk or a multiplication sign", () => {
    expect(toWhatsAppFormatting("2 * 999 = 1998")).toBe("2 * 999 = 1998");
  });
});
