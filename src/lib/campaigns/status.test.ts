import { describe, expect, it } from "vitest";
import { campaignStatus } from "./status";

type Args = Parameters<typeof campaignStatus>[0];
const campaign = (over: Partial<Args> = {}): Args => ({
  sentAt: null,
  scheduledAt: null,
  approval: "PENDING_REVIEW",
  reviewNote: null,
  ...over,
});

describe("campaignStatus", () => {
  it("reports a sent campaign as sent whatever its approval says", () => {
    // It already happened; nothing about the review state changes that.
    expect(campaignStatus(campaign({ sentAt: "2026-08-19T10:00:00Z", approval: "APPROVED" })).label).toBe("Sent");
  });

  it("does not call an unapproved campaign 'Scheduled'", () => {
    // The bug this guards: a scheduled-but-unapproved campaign is NOT going out
    // at that time, and an owner told otherwise plans around a broadcast that
    // never happens.
    const status = campaignStatus(campaign({ scheduledAt: "2026-09-01T10:00:00Z", approval: "PENDING_REVIEW" }));
    expect(status.label).toBe("Waiting for approval");
  });

  it("calls an approved, scheduled campaign scheduled", () => {
    const status = campaignStatus(campaign({ scheduledAt: "2026-09-01T10:00:00Z", approval: "APPROVED" }));
    expect(status.label).toBe("Scheduled");
  });

  it("calls an approved, unscheduled campaign ready to send", () => {
    expect(campaignStatus(campaign({ approval: "APPROVED" })).label).toBe("Ready to send");
  });

  it("surfaces the reviewer's note as the detail on a rejection", () => {
    const status = campaignStatus(campaign({ approval: "REJECTED", reviewNote: "Drop the 'last chance' line." }));
    expect(status.tone).toBe("rejected");
    expect(status.detail).toBe("Drop the 'last chance' line.");
  });

  it("still explains a rejection that arrived without a note", () => {
    const status = campaignStatus(campaign({ approval: "REJECTED" }));
    expect(status.detail).toBeTruthy();
  });
});

describe("campaignStatus — telling the truth about a send", () => {
  it("does NOT say 'Sent' when every message failed", () => {
    // This is the bug, exactly as it happened live: a broadcast to two
    // contacts showed a confident green "Sent" while both recipients had
    // FAILED. It had reached nobody at all.
    const status = campaignStatus(campaign({ sentAt: "2026-08-21T10:00:00Z", approval: "APPROVED" }), {
      sent: 0,
      failed: 2,
    });
    expect(status.label).toBe("Didn't reach anyone");
    expect(status.tone).toBe("rejected");
    expect(status.detail).toContain("All 2");
  });

  it("reports a partial send as a fraction rather than a flat 'Sent'", () => {
    const status = campaignStatus(campaign({ sentAt: "2026-08-21T10:00:00Z" }), { sent: 8, failed: 2 });
    expect(status.label).toBe("Sent to 8 of 10");
    expect(status.tone).toBe("sent");
    expect(status.detail).toContain("2 could not be delivered");
  });

  it("says plain 'Sent' when nothing failed", () => {
    const status = campaignStatus(campaign({ sentAt: "2026-08-21T10:00:00Z" }), { sent: 10, failed: 0 });
    expect(status.label).toBe("Sent");
    expect(status.detail).toBeNull();
  });

  it("still says 'Sent' when the caller has no delivery counts to give", () => {
    // The list may render before counts are loaded; it must not accuse a
    // healthy campaign of failing just because it does not know yet.
    expect(campaignStatus(campaign({ sentAt: "2026-08-21T10:00:00Z" })).label).toBe("Sent");
  });
});

describe("campaignStatus — changes requested", () => {
  it("shows the reviewer's note, because that is the thing to act on", () => {
    const status = campaignStatus(
      campaign({ approval: "CHANGES_REQUESTED", reviewNote: "Change 'ON ALL ROOMS' to 'ON ROOMS AT'." })
    );
    expect(status.label).toBe("Needs a change");
    expect(status.detail).toBe("Change 'ON ALL ROOMS' to 'ON ROOMS AT'.");
  });

  it("still explains itself when the note is missing", () => {
    const status = campaignStatus(campaign({ approval: "CHANGES_REQUESTED" }));
    expect(status.detail).toContain("Edit it and submit it again");
  });

  it("is distinct from rejected — the two call for different next steps", () => {
    expect(campaignStatus(campaign({ approval: "CHANGES_REQUESTED" })).label).not.toBe(
      campaignStatus(campaign({ approval: "REJECTED" })).label
    );
  });
});
