import { describe, expect, it } from "vitest";
import { conversationMode, returnToAiFields, takeOverFields, HANDOVER_REASON } from "./handover";
import { isPauseStale } from "@/lib/inbound/ai-pause";

describe("conversationMode", () => {
  it("is ai by default", () => {
    expect(conversationMode({ aiPaused: false, handoverAt: null })).toBe("ai");
  });

  it("is paused when staff replied but nobody took the chat", () => {
    expect(conversationMode({ aiPaused: true, handoverAt: null })).toBe("paused");
  });

  it("is human when someone explicitly took it", () => {
    expect(conversationMode({ aiPaused: true, handoverAt: new Date() })).toBe("human");
  });
});

describe("takeOverFields", () => {
  it("sets aiPaused alongside handoverAt", () => {
    // Load-bearing: every existing read path — the inbound pipeline, the CRM
    // badge, the follow-up sweep — checks aiPaused. A handover that only set
    // handoverAt would leave Anushka replying underneath a receptionist.
    const fields = takeOverFields(HANDOVER_REASON.MANUAL, "Priya");
    expect(fields.aiPaused).toBe(true);
    expect(fields.aiPausedAt).toBeInstanceOf(Date);
    expect(fields.handoverAt).toBeInstanceOf(Date);
    expect(fields.handoverByName).toBe("Priya");
  });

  it("records the reason", () => {
    expect(takeOverFields(HANDOVER_REASON.BOOKED).handoverReason).toBe(HANDOVER_REASON.BOOKED);
  });
});

describe("returnToAiFields", () => {
  it("clears every handover field so the chat is fully back with the AI", () => {
    const fields = returnToAiFields("Quoted 2400 for the Deluxe.");
    expect(fields.aiPaused).toBe(false);
    expect(fields.aiPausedAt).toBeNull();
    expect(fields.handoverAt).toBeNull();
    expect(fields.handoverReason).toBeNull();
    expect(fields.handoverByName).toBeNull();
    expect(fields.aiBriefing).toBe("Quoted 2400 for the Deluxe.");
  });

  it("clears a previous briefing rather than leaving it behind", () => {
    // A stale note is worse than none: Anushka is told to treat it as current
    // fact, so last month's quote would be repeated to the guest as today's.
    expect(returnToAiFields().aiBriefing).toBeNull();
    expect(returnToAiFields("   ").aiBriefing).toBeNull();
  });
});

describe("a handover never expires", () => {
  const thirtyHoursAgo = new Date(Date.now() - 30 * 3_600_000);

  it("keeps an ordinary pause expiring", () => {
    expect(isPauseStale({ aiPaused: true, aiPausedAt: thirtyHoursAgo, handoverAt: null })).toBe(true);
  });

  it("but holds a handover open indefinitely", () => {
    // The reason this distinction exists: expiry catches a pause nobody meant
    // to leave running. A receptionist settling a booking must not have
    // Anushka wake at hour thirteen and negotiate underneath them.
    expect(isPauseStale({ aiPaused: true, aiPausedAt: thirtyHoursAgo, handoverAt: thirtyHoursAgo })).toBe(false);
  });

  it("still reports no staleness once the chat is handed back", () => {
    const returned = returnToAiFields("note");
    expect(isPauseStale({ ...returned, handoverAt: returned.handoverAt })).toBe(false);
  });
});
