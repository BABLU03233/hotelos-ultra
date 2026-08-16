import { describe, expect, it } from "vitest";
import { looksLikeLeakedReasoning } from "./omniroute-provider";

describe("leaked reasoning never reaches a guest", () => {
  // Free tiers lean on reasoning models. Measured over three rounds against
  // the live gateway, three of four free pools each produced one reply that
  // narrated the model's thinking instead of answering. Untagged
  // chain-of-thought arrives as ordinary prose, so stripThinkingArtifacts
  // (which handles <think> blocks) never sees it.
  it("catches the exact narration observed live", () => {
    expect(looksLikeLeakedReasoning("The user is asking about room availability for tomorrow")).toBe(true);
  });

  it("catches the common narration openers", () => {
    for (const s of [
      "Okay, so the guest wants a room.",
      "Let me think about what they need.",
      "I should reply warmly and ask for dates.",
      "The guest is enquiring about pricing.",
      "Based on the system prompt, rooms start at 999.",
      "First, I need to establish the dates.",
    ]) {
      expect(looksLikeLeakedReasoning(s), s).toBe(true);
    }
  });

  it("does not treat ordinary hotel phrasing as narration", () => {
    // "we need to" / "we should" were in the first version of this pattern
    // and had to come out: they are how a concierge normally speaks. A false
    // positive here discards a good reply and moves the guest one step
    // closer to the holding message.
    for (const s of [
      "We should have availability that week 😊",
      "We need to know your check-in date to confirm.",
      "We should be able to accommodate 4 guests.",
    ]) {
      expect(looksLikeLeakedReasoning(s), s).toBe(false);
    }
  });

  it("leaves a genuine reply alone", () => {
    for (const s of [
      "Yes, we have rooms free tomorrow! How many guests? 😊",
      "Our Classic Room is ₹999/night — shall I check availability?",
      "Hi! I'm Anushka from Hotel Ivory Towers 😊",
      "Check-in is from 12pm and check-out is 11am.",
      "बढ़िया! आज मैं आपकी कैसे मदद करूँ? 😊",
    ]) {
      expect(looksLikeLeakedReasoning(s), s).toBe(false);
    }
  });

  it("only matches at the start, so a mid-sentence mention is fine", () => {
    // A real reply can legitimately reference the guest without narrating.
    expect(looksLikeLeakedReasoning("Happy to help — whatever the user prefers works for us!")).toBe(false);
    expect(looksLikeLeakedReasoning("We should have availability that week 😊")).toBe(false);
  });
});
