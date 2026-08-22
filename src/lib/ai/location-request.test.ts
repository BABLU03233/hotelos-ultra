import { describe, expect, it } from "vitest";
import { looksLikeLocationRequest } from "./interactive-prompts";

describe("looksLikeLocationRequest", () => {
  it("catches the ways guests actually ask for the location", () => {
    for (const t of [
      "where are you?",
      "where are you located",
      "where's the hotel",
      "send me your location",
      "share location",
      "what's the address",
      "your address please",
      "how do i reach you",
      "how to get there",
      "can you send the map",
      "directions please",
      "drop a pin",
    ]) {
      expect(looksLikeLocationRequest(t), t).toBe(true);
    }
  });

  it("catches Hinglish and Tenglish / native-script requests", () => {
    for (const t of ["location bhejo", "kahan ho aap", "पता क्या है", "लोकेशन भेजो", "మీరు ఎక్కడ ఉన్నారు", "అడ్రస్ చెప్పండి", "లొకేషన్ పంపండి"]) {
      expect(looksLikeLocationRequest(t), t).toBe(true);
    }
  });

  it("does NOT fire on ordinary booking-flow messages", () => {
    // A false positive would swallow the turn and send a map pin instead of
    // answering — so the common funnel messages must all stay false.
    for (const t of [
      "i want to book a room",
      "2 people",
      "do you have parking",
      "how much is the deluxe room",
      "is breakfast included",
      "tomorrow night",
      "yes please",
      "book it",
      "3 guests this weekend",
    ]) {
      expect(looksLikeLocationRequest(t), t).toBe(false);
    }
  });
});
