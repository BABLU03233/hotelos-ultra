import { describe, expect, it } from "vitest";
import { AI_PAUSE_EXPIRY_HOURS, isPauseStale } from "./ai-pause";

const NOW = new Date("2026-08-19T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("an AI pause expires so it cannot silence a guest forever", () => {
  it("leaves an unpaused contact alone", () => {
    expect(isPauseStale({ aiPaused: false, aiPausedAt: null }, NOW)).toBe(false);
    expect(isPauseStale({ aiPaused: false, aiPausedAt: hoursAgo(99) }, NOW)).toBe(false);
  });

  it("respects a pause set during this shift", () => {
    // Staff are plausibly still in the conversation; Anushka must stay quiet.
    expect(isPauseStale({ aiPaused: true, aiPausedAt: hoursAgo(0.5) }, NOW)).toBe(false);
    expect(isPauseStale({ aiPaused: true, aiPausedAt: hoursAgo(11) }, NOW)).toBe(false);
  });

  it("treats a pause older than the expiry as stale", () => {
    expect(isPauseStale({ aiPaused: true, aiPausedAt: hoursAgo(AI_PAUSE_EXPIRY_HOURS + 1) }, NOW)).toBe(true);
    expect(isPauseStale({ aiPaused: true, aiPausedAt: hoursAgo(36) }, NOW)).toBe(true);
  });

  it("treats a pause with no timestamp as stale", () => {
    // These predate the field, and are exactly the rows that were silently
    // dead in production. Leaving them paused is the bug, not the fix.
    expect(isPauseStale({ aiPaused: true, aiPausedAt: null }, NOW)).toBe(true);
  });

  it("reproduces the production incident", () => {
    // Staff replied on the 18th at 07:38; a guest wrote "Hi" on the 19th at
    // 11:26 and got nothing. That gap must now lift the pause.
    const staffReplied = new Date("2026-08-18T07:38:00Z");
    const guestWrote = new Date("2026-08-19T11:26:00Z");
    expect(isPauseStale({ aiPaused: true, aiPausedAt: staffReplied }, guestWrote)).toBe(true);
  });
});
