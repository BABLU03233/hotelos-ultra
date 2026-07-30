import { describe, expect, it } from "vitest";
import { decideFollowUpAction } from "./decide";

const NOW = new Date("2026-01-15T12:00:00Z");

describe("decideFollowUpAction", () => {
  it("cancels when the rule is inactive", () => {
    const result = decideFollowUpAction(
      { ruleActive: false, ruleTemplateName: null, leadStatus: "INTERESTED", lastInboundAt: NOW },
      NOW
    );
    expect(result).toEqual({ type: "cancel" });
  });

  it("cancels once the lead is booked", () => {
    const result = decideFollowUpAction(
      { ruleActive: true, ruleTemplateName: null, leadStatus: "BOOKED", lastInboundAt: NOW },
      NOW
    );
    expect(result).toEqual({ type: "cancel" });
  });

  it("cancels once the lead is closed", () => {
    const result = decideFollowUpAction(
      { ruleActive: true, ruleTemplateName: null, leadStatus: "CLOSED", lastInboundAt: NOW },
      NOW
    );
    expect(result).toEqual({ type: "cancel" });
  });

  it("sends free-form text when still inside the 24h window", () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
    const result = decideFollowUpAction(
      { ruleActive: true, ruleTemplateName: null, leadStatus: "NEW", lastInboundAt: twoHoursAgo },
      NOW
    );
    expect(result).toEqual({ type: "send", withinWindow: true });
  });

  it("skips outside the 24h window with no approved template configured", () => {
    const twoDaysAgo = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
    const result = decideFollowUpAction(
      { ruleActive: true, ruleTemplateName: null, leadStatus: "NEW", lastInboundAt: twoDaysAgo },
      NOW
    );
    expect(result).toEqual({ type: "skip" });
  });

  it("sends via template outside the 24h window when a template is configured", () => {
    const twoDaysAgo = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
    const result = decideFollowUpAction(
      { ruleActive: true, ruleTemplateName: "follow_up_v1", leadStatus: "NEW", lastInboundAt: twoDaysAgo },
      NOW
    );
    expect(result).toEqual({ type: "send", withinWindow: false });
  });

  it("treats a contact who has never messaged as outside the window", () => {
    const result = decideFollowUpAction(
      { ruleActive: true, ruleTemplateName: null, leadStatus: "NEW", lastInboundAt: null },
      NOW
    );
    expect(result).toEqual({ type: "skip" });
  });
});
