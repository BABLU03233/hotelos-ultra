import { describe, expect, it } from "vitest";
import { SESSION_GAP_HOURS, shouldRestartSession } from "./session-restart";

const restart = (guestMessage: string, hoursSinceLastInbound: number | null) =>
  shouldRestartSession({ guestMessage, hoursSinceLastInbound });

describe("a returning guest's greeting starts a new conversation", () => {
  // The reported behaviour: a guest who booked, or who drifted off mid-funnel,
  // comes back days later with "hi" and lands in the middle of the old
  // conversation — the model still holding a transcript that ends in a booking
  // reference, and the funnel still holding dates from last week.
  it("restarts on a bare greeting after a long gap", () => {
    for (const greeting of ["hi", "Hello", "hey", "HII", "namaste", "hola", "hi!"]) {
      expect(restart(greeting, 30), greeting).toBe(true);
    }
  });

  it("restarts the morning after an evening enquiry", () => {
    expect(restart("hi", 12)).toBe(true);
  });

  it("does not restart within the same sitting", () => {
    // A "hi" between questions is filler, not a new visit. Wiping the dates
    // they just gave would be the exact "not listening" failure this codebase
    // keeps having to fix.
    expect(restart("hi", 0.2)).toBe(false);
    expect(restart("hi", 3)).toBe(false);
  });

  it("treats the boundary as a restart", () => {
    expect(restart("hi", SESSION_GAP_HOURS)).toBe(true);
    expect(restart("hi", SESSION_GAP_HOURS - 0.1)).toBe(false);
  });
});

describe("a greeting carrying real content is not a restart", () => {
  // Resetting these to a greeting menu would throw away what they just said
  // and ask a question they had already answered — the same defect from the
  // opposite direction.
  it("leaves a greeting with a request alone", () => {
    for (const msg of [
      "hi, do you have rooms for the 12th?",
      "hello I want to book",
      "hey what's the price",
      "hi 2 people this weekend",
    ]) {
      expect(restart(msg, 48), msg).toBe(false);
    }
  });

  it("leaves a non-greeting alone however long the gap", () => {
    expect(restart("is breakfast included?", 200)).toBe(false);
    expect(restart("26 december", 200)).toBe(false);
  });
});

describe("a first-ever message is not a restart", () => {
  it("returns false when there is no previous inbound", () => {
    // Nothing to restart from — the normal isFirstReply path already greets
    // them, and claiming a restart here would double up.
    expect(restart("hi", null)).toBe(false);
  });
});
