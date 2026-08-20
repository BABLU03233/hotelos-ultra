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
