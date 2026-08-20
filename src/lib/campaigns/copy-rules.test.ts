import { describe, expect, it } from "vitest";
import { deterministicConcerns, templateBodyText } from "./copy-rules";

/**
 * The model half of the reviewer is not tested here — it needs a live provider
 * and its output is advisory anyway. These cover the deterministic half, which
 * is the part that has to behave identically on the days every free AI tier is
 * exhausted.
 */
describe("deterministicConcerns", () => {
  const clean = "Hi Ravi, we have a quiet weekend rate at Sea View this month if you're planning a trip. Reply STOP to opt out.";

  it("passes copy that is already fine", () => {
    expect(deterministicConcerns(clean)).toEqual([]);
  });

  it("blocks an empty message and says nothing else", () => {
    const concerns = deterministicConcerns("   ");
    expect(concerns).toHaveLength(1);
    expect(concerns[0].severity).toBe("block");
  });

  it("flags a missing opt-out line", () => {
    const concerns = deterministicConcerns("Hi Ravi, we have a quiet weekend rate this month.");
    expect(concerns.some((c) => c.issue.includes("opt-out"))).toBe(true);
  });

  it("accepts any of the recognised opt-out phrasings", () => {
    for (const line of ["Reply STOP to opt out.", "Send STOP to unsubscribe.", "Reply STOP to opt-out."]) {
      expect(deterministicConcerns(`Weekend rates are open this month. ${line}`)).toEqual([]);
    }
  });

  it("flags shouty copy", () => {
    const concerns = deterministicConcerns("HUGE WEEKEND SALE AT OUR HOTEL BOOK YOUR ROOM RIGHT NOW. Reply STOP to opt out.");
    expect(concerns.some((c) => c.issue.includes("capital"))).toBe(true);
  });

  it("does not call a short message shouty", () => {
    // The ratio alone would trip on a handful of initials; the length floor is
    // what keeps "AC room at 20% off. Reply STOP to opt out." clean.
    expect(deterministicConcerns("AC ROOM 20% OFF. Reply STOP to opt out.")).toEqual([]);
  });

  it("flags manufactured urgency", () => {
    const concerns = deterministicConcerns("Hurry, last chance to book! Reply STOP to opt out.");
    expect(concerns.some((c) => c.issue.includes("urgency"))).toBe(true);
  });

  it("blocks copy past WhatsApp's 1024-character template body limit", () => {
    const concerns = deterministicConcerns("a".repeat(1100));
    expect(concerns.some((c) => c.severity === "block" && c.issue.includes("Too long"))).toBe(true);
  });

  it("only notes — does not block — merely long copy", () => {
    const concerns = deterministicConcerns(`${"a".repeat(500)} Reply STOP to opt out.`);
    expect(concerns.every((c) => c.severity !== "block")).toBe(true);
    expect(concerns.some((c) => c.issue.includes("Long for WhatsApp"))).toBe(true);
  });

  it("gives every concern something actionable to do about it", () => {
    for (const concern of deterministicConcerns("BOOK NOW!!!! HURRY!!!!")) {
      expect(concern.suggestion.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("templateBodyText", () => {
  it("pulls the body out of a Meta components array", () => {
    const components = [
      { type: "HEADER", format: "TEXT", text: "Weekend offer" },
      { type: "BODY", text: "Hi {{1}}, rooms from ₹1,899 this weekend." },
      { type: "FOOTER", text: "Reply STOP to opt out." },
    ];
    expect(templateBodyText(components)).toBe("Hi {{1}}, rooms from ₹1,899 this weekend.");
  });

  it("returns empty string for anything it cannot parse", () => {
    // Empty means "nothing auto-checked", leaving the human review as the only
    // gate — the correct direction to fail.
    expect(templateBodyText(null)).toBe("");
    expect(templateBodyText({ type: "BODY", text: "not an array" })).toBe("");
    expect(templateBodyText([{ type: "HEADER", text: "no body here" }])).toBe("");
    expect(templateBodyText([{ type: "BODY", text: 42 }])).toBe("");
  });
});
