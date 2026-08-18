import { describe, expect, it } from "vitest";
import { looksLikeDirectQuestion, predictedStageInstruction } from "./interactive-prompts";

const base = {
  isFirstReply: false,
  languageObvious: true,
  history: [
    { role: "user", content: "hi" },
    { role: "assistant", content: "Hi! I'm Anushka 😊" },
  ],
  knownGuestCount: null,
  datesKnown: false,
};

describe("a guest's question is never answered with a slot prompt", () => {
  // The live failure behind this: mid-funnel, with the party size still
  // unknown, the GUEST_COUNT stage instruction told the model its job was to
  // learn the party size and to "not ask about dates or anything else in this
  // same reply". Handed a real question at that moment, the model had been
  // instructed to ignore it — and an end-to-end run caught it escalating with
  // the reason "Need clarification on guest count" rather than answering.
  //
  // "room ka price kitna hai" is used because it is both a question AND shows
  // booking intent, which is what actually puts the conversation in the
  // GUEST_COUNT stage. A question with no booking intent yet (a browsing
  // guest asking about wifi) gets no stage instruction at all — that case is
  // handled by the ESCALATE rule in the system prompt instead.
  it("tells the model to ANSWER a question asked mid-funnel", () => {
    const result = predictedStageInstruction({ ...base, guestMessage: "room ka price kitna hai" });
    expect(result).toMatch(/ANSWER IT/);
    expect(result).not.toMatch(/don't ask about dates or anything else/i);
  });

  it("still forbids handing off something the prompt already answers", () => {
    const result = predictedStageInstruction({ ...base, guestMessage: "room ka price kitna hai" });
    expect(result).toMatch(/never hand off to a colleague/i);
  });

  it("does the same at the dates stage once the count is known", () => {
    const result = predictedStageInstruction({
      ...base,
      knownGuestCount: 2,
      guestMessage: "kitna hai room ka rate",
    });
    expect(result).toMatch(/ANSWER IT/);
  });

  it("leaves the funnel instruction alone for a plain statement of intent", () => {
    // The other half of the fix. "I'd like to book a room" is substantive
    // enough to reach the model, but it is not a question — asking for the
    // party size is exactly the right next move, and must not be suppressed.
    const result = predictedStageInstruction({ ...base, guestMessage: "I'd like to book a room" });
    expect(result).toContain("how many people");
    expect(result).not.toMatch(/ANSWER IT/);
  });
});

describe("looksLikeDirectQuestion", () => {
  it("catches questions across the registers this hotel sees", () => {
    for (const q of [
      "do you have parking?",
      "wifi hai kya",
      "kitna hai price",
      "what time is check in",
      "వైఫై ఉందా",
      "क्या पार्किंग है",
    ]) {
      expect(looksLikeDirectQuestion(q), q).toBe(true);
    }
  });

  it("does not treat intent or slot answers as questions", () => {
    for (const s of ["I'd like to book a room", "2 guests please", "ok", "sounds good", "next week"]) {
      expect(looksLikeDirectQuestion(s), s).toBe(false);
    }
  });
});
