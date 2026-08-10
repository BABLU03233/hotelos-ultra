import { describe, expect, it } from "vitest";
import { extractLegitimatePhoneNumbers, hasHallucinationRisk, stripUnapprovedUrls } from "./reply-safety";

describe("hasHallucinationRisk", () => {
  it("detects a fabricated Indian phone number in +91 format", () => {
    expect(hasHallucinationRisk("Please call our Reservations team at +91 63053 89600 to finalize.")).toBe(true);
  });

  it("detects a bare 10-digit phone number", () => {
    expect(hasHallucinationRisk("Call us on 9876543210 to confirm.")).toBe(true);
  });

  it("detects a false 'booking confirmed' claim", () => {
    expect(hasHallucinationRisk("🎉 Booking confirmed! See you this weekend.")).toBe(true);
    expect(hasHallucinationRisk("You're all booked for the Deluxe Room!")).toBe(true);
    expect(hasHallucinationRisk("Your reservation confirmed for Saturday.")).toBe(true);
  });

  it("returns false for a normal, safe reply", () => {
    expect(hasHallucinationRisk("Our Deluxe Room starts from ₹1,299/night for 2 guests 🛏️")).toBe(false);
    expect(hasHallucinationRisk("Great, glad that works for you! Tap Confirm booking when ready.")).toBe(false);
  });

  it("does not flag a room price or offer discount as a phone number", () => {
    expect(hasHallucinationRisk("Our Classic Room starts from ₹999/night")).toBe(false);
    expect(hasHallucinationRisk("Get ₹100 off with our direct booking offer")).toBe(false);
  });

  it("does not flag the new CLOSE-stage reference-code/pay-at-counter mention as a false confirmation", () => {
    expect(hasHallucinationRisk("Tap Confirm booking below and I'll get you an instant reference code — pay at the counter when you arrive! 🎉")).toBe(
      false
    );
  });

  it("does not flag a phone number the hotel itself explicitly configured -- a real gap found live: a tenant's own real, call-only number (added via their custom instructions) was being silently swapped out for a generic fallback whenever the AI correctly relayed it, producing a confusing non-sequitur reply to a guest who'd just asked for the number", () => {
    const legitimate = extractLegitimatePhoneNumbers("Front Desk (call only, not WhatsApp): +91 90147 76868. Reservations (call only): +91 63053 89600.");
    expect(hasHallucinationRisk("Sure, you can reach our front desk at +91 90147 76868 😊", legitimate)).toBe(false);
  });

  it("still flags a phone number NOT among the hotel's own configured numbers, even when some legitimate numbers exist", () => {
    const legitimate = extractLegitimatePhoneNumbers("Front Desk: +91 90147 76868.");
    expect(hasHallucinationRisk("Call us at 9876543210 instead", legitimate)).toBe(true);
  });

  it("extracts multiple real numbers from free-form custom instructions text, normalizing spacing", () => {
    const legitimate = extractLegitimatePhoneNumbers("Front Desk (call only, not WhatsApp): +91 90147 76868. Reservations (call only): +91 63053 89600.");
    expect(legitimate.has("+919014776868")).toBe(true);
    expect(legitimate.has("+916305389600")).toBe(true);
  });
});

describe("stripUnapprovedUrls", () => {
  it("removes a fabricated website/booking-site URL while keeping the rest of the reply intact", () => {
    expect(stripUnapprovedUrls("You can book directly at hotelivorytowers.com for the best rate!")).toBe("You can book directly at for the best rate!");
  });

  it("removes a bare www. URL", () => {
    expect(stripUnapprovedUrls("Check out www.example-hotel.com for more photos")).toBe("Check out for more photos");
  });

  it("removes a full https:// URL", () => {
    expect(stripUnapprovedUrls("Reviews here: https://reviews.example.com/hotel-ivory-towers")).toBe("Reviews here:");
  });

  it("leaves a reply with no URL untouched", () => {
    expect(stripUnapprovedUrls("Our Deluxe Room starts from ₹1,299/night 🛏️")).toBe("Our Deluxe Room starts from ₹1,299/night 🛏️");
  });

  it("keeps the hotel's own approved Google Maps link when explicitly allowlisted -- the one legitimate URL this app ever sends", () => {
    const approved = new Set(["https://maps.app.goo.gl/xxxxx"]);
    expect(stripUnapprovedUrls("Here you go: https://maps.app.goo.gl/xxxxx", approved)).toBe("Here you go: https://maps.app.goo.gl/xxxxx");
  });

  it("still strips a DIFFERENT url even when a Maps link is allowlisted", () => {
    const approved = new Set(["https://maps.app.goo.gl/xxxxx"]);
    expect(stripUnapprovedUrls("Directions: https://maps.app.goo.gl/xxxxx, or check reviews at fakereviews.com", approved)).toBe(
      "Directions: https://maps.app.goo.gl/xxxxx, or check reviews at"
    );
  });
});
