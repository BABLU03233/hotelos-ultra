import { describe, expect, it } from "vitest";
import { captureGuestCount, extractGuestCount, messageAsksGuestCount } from "./guest-count";

describe("extractGuestCount", () => {
  it("reads a plain 'N people' count", () => {
    expect(extractGuestCount("2 people")).toBe(2);
    expect(extractGuestCount("we need a room for 4 guests")).toBe(4);
    expect(extractGuestCount("3 adults please")).toBe(3);
  });

  it("reads the exact titles of the GUEST_COUNT list rows, which arrive as plain guest text", () => {
    // A tapped list row is delivered as its title, indistinguishable from
    // typed text (see handle-inbound-message.ts) — so these three strings
    // are the single highest-traffic input this function ever sees.
    expect(extractGuestCount("Just me")).toBe(1);
    expect(extractGuestCount("2 people")).toBe(2);
    expect(extractGuestCount("3+ people")).toBe(3);
  });

  it("reads English number words", () => {
    expect(extractGuestCount("three people")).toBe(3);
    expect(extractGuestCount("Two guests")).toBe(2);
  });

  it("reads group phrasings", () => {
    expect(extractGuestCount("family of 5")).toBe(5);
    expect(extractGuestCount("we are 3")).toBe(3);
    expect(extractGuestCount("there's 4 of us")).toBe(4);
    expect(extractGuestCount("group of 6 coming")).toBe(6);
  });

  it("counts the speaker in for 'myself + N', but not for 'N including me'", () => {
    expect(extractGuestCount("myself + 2")).toBe(3);
    expect(extractGuestCount("me + 3")).toBe(4);
    expect(extractGuestCount("4 including me")).toBe(4);
  });

  it("reads solo and couple phrasings as 1 and 2", () => {
    expect(extractGuestCount("just me")).toBe(1);
    expect(extractGuestCount("solo trip")).toBe(1);
    expect(extractGuestCount("just the two of us")).toBe(2);
    expect(extractGuestCount("me and my wife")).toBe(2);
    expect(extractGuestCount("we're a couple")).toBe(2);
  });

  it("reads Hinglish counts", () => {
    expect(extractGuestCount("hum 3 log hain")).toBe(3);
    expect(extractGuestCount("do log")).toBe(2);
    expect(extractGuestCount("chaar log aayenge")).toBe(4);
  });

  it("does not read 'do log in' (a WiFi question) as 2 guests", () => {
    expect(extractGuestCount("wifi me do log in kaise kare")).toBeNull();
  });

  it("reads native Telugu counts, which no \\b-anchored pattern can match", () => {
    expect(extractGuestCount("2 మంది కోసం")).toBe(2);
    expect(extractGuestCount("ఇద్దరు")).toBe(2);
    expect(extractGuestCount("ముగ్గురు వస్తున్నాము")).toBe(3);
    expect(extractGuestCount("ఒక్కరు")).toBe(1);
  });

  it("reads a bare 'for N' but not a duration", () => {
    expect(extractGuestCount("for 3")).toBe(3);
    expect(extractGuestCount("for 2 nights")).toBeNull();
    expect(extractGuestCount("for 5 days")).toBeNull();
  });

  it("only accepts a bare number when the assistant just asked for one", () => {
    expect(extractGuestCount("2")).toBeNull();
    expect(extractGuestCount("2", { answeringGuestCountQuestion: true })).toBe(2);
    expect(extractGuestCount("three", { answeringGuestCountQuestion: true })).toBe(3);
  });

  it("ignores numbers that are plainly not a party size", () => {
    expect(extractGuestCount("is it ₹2000 per night?")).toBeNull();
    expect(extractGuestCount("my number is +91 9876543210")).toBeNull();
    expect(extractGuestCount("room 204 please")).toBeNull();
  });

  it("rejects an out-of-range count rather than storing nonsense", () => {
    expect(extractGuestCount("500 people")).toBeNull();
    expect(extractGuestCount("0 people")).toBeNull();
  });

  it("returns null for a message that says nothing about headcount", () => {
    expect(extractGuestCount("what time is check-in?")).toBeNull();
    expect(extractGuestCount("do you have parking")).toBeNull();
    expect(extractGuestCount("")).toBeNull();
  });

  it("prefers the party-size phrase over an unrelated number in the same message", () => {
    expect(extractGuestCount("family of 4, staying for 2 nights")).toBe(4);
    expect(extractGuestCount("₹3000 budget for 2 people")).toBe(2);
  });
});

describe("captureGuestCount", () => {
  const ASKED = [{ role: "assistant", content: "How many people will be staying? 😊" }];

  it("captures a bare number when it answers the assistant's own question", () => {
    expect(captureGuestCount("2", ASKED)).toBe(2);
  });

  it("ignores a bare number when the assistant asked something else", () => {
    const askedDates = [{ role: "assistant", content: "When are you looking to stay?" }];
    expect(captureGuestCount("2", askedDates)).toBeUndefined();
  });

  it("returns undefined when the count is unchanged, so no pointless write happens", () => {
    expect(captureGuestCount("2 people", [], 2)).toBeUndefined();
  });

  it("lets a later explicit count correct an earlier one -- the '3+ people' tap stores only its floor of 3", () => {
    expect(captureGuestCount("actually we're 6 people", [], 3)).toBe(6);
  });

  it("does not let an unrelated number overwrite a stored count", () => {
    expect(captureGuestCount("is ₹3000 ok for the room?", [], 2)).toBeUndefined();
    expect(captureGuestCount("we'll stay for 3 nights", [], 2)).toBeUndefined();
  });

  it("does not let a bare number overwrite a stored count outside the ask", () => {
    expect(captureGuestCount("14", [], 2)).toBeUndefined();
  });
});

describe("a guest contradicting their own headcount", () => {
  // Found by deliberately flip-flopping mid-conversation. Corrections that
  // carried a person-noun ("actually 4 people") already worked; a bare
  // downward one silently did not, so the guest watched their own
  // correction get dropped.
  it("follows a correction up and back down again", () => {
    let count: number | null = null;
    const say = (m: string) => (count = captureGuestCount(m, [], count) ?? count);

    expect(say("2 people")).toBe(2);
    expect(say("actually 4 people")).toBe(4);
    expect(say("sorry make it 3 people")).toBe(3);
    expect(say("no wait 2")).toBe(2); // bare number, no person-noun
    expect(say("just me now")).toBe(1);
  });

  it("accepts a bare number when a correction marker gives it context", () => {
    expect(captureGuestCount("no wait 2", [], 4)).toBe(2);
    expect(captureGuestCount("actually 5", [], 2)).toBe(5);
    expect(captureGuestCount("make it 3", [], 2)).toBe(3);
    expect(captureGuestCount("change it to 6", [], 2)).toBe(6);
  });

  it("does not read a room number as a correction", () => {
    // "no" alone is not a correction marker, precisely for this.
    expect(captureGuestCount("room no 2", [], 4)).toBeUndefined();
    expect(captureGuestCount("is it ₹2000?", [], 4)).toBeUndefined();
  });
});

describe("messageAsksGuestCount", () => {
  it("recognizes the ask in each language the prompt uses", () => {
    expect(messageAsksGuestCount("How many people will be staying? 😊")).toBe(true);
    expect(messageAsksGuestCount("kitne guests aayenge?")).toBe(true);
    expect(messageAsksGuestCount("ఎంత మంది ఉంటారు?")).toBe(true);
  });

  it("is false for an unrelated assistant message", () => {
    expect(messageAsksGuestCount("Our Deluxe Room starts from ₹1,299/night")).toBe(false);
  });
});
