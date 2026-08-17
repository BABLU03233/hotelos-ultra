import { describe, expect, it } from "vitest";
import { findEscalation } from "./pipeline";

describe("the ESCALATE marker never reaches a guest", () => {
  it("catches the marker at the start, the shape the prompt asks for", () => {
    expect(findEscalation("ESCALATE: guest asked about a group booking")).toEqual({
      reason: "guest asked about a group booking",
    });
  });

  it("catches the marker appended AFTER an answer", () => {
    // The live failure. A weaker free-tier model answered and then appended
    // the marker; a startsWith check passed the whole thing through, so the
    // guest's WhatsApp message literally contained "ESCALATE:".
    const reply = "Wi-Fi availablng undhi కానీ details ఇక్కడ లేదు. ESCALATE: Wi-Fi details missing";
    expect(findEscalation(reply)).toEqual({ reason: "Wi-Fi details missing" });
  });

  it("catches it after a newline, which is how models usually append it", () => {
    expect(findEscalation("Let me check that for you.\nESCALATE: no pricing for extra beds")).toEqual({
      reason: "no pricing for extra beds",
    });
  });

  it("leaves an ordinary reply alone", () => {
    for (const reply of [
      "Hi! I'm Anushka from Hotel Ivory Towers 😊",
      "Our Classic Room is ₹999/night — shall I check availability?",
      "అవును, మా హోటల్లో Wi-Fi ఉంది 📶😊",
      "26 Jul is already gone—did you mean 26 Aug? 😊",
    ]) {
      expect(findEscalation(reply), reply).toBeNull();
    }
  });

  it("survives a marker with no reason after it", () => {
    // Malformed, but it must still escalate rather than send the bare marker.
    expect(findEscalation("ESCALATE:")).toEqual({ reason: "" });
  });
});
