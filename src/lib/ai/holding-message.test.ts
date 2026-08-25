import { describe, expect, it } from "vitest";
import { randomHoldingMessage } from "./holding-message";

describe("randomHoldingMessage", () => {
  it("always returns a non-empty, warm handover line", () => {
    for (let i = 0; i < 20; i++) {
      expect(randomHoldingMessage().trim().length).toBeGreaterThan(0);
    }
  });

  it("every variant still says a team member is coming — what scripts/e2e/scenarios.ts's NOT_ESCALATED check matches on", () => {
    for (let i = 0; i < 20; i++) {
      expect(randomHoldingMessage()).toMatch(/one of our team/i);
    }
  });

  it("picks more than one variant across repeated calls", () => {
    const seen = new Set(Array.from({ length: 50 }, () => randomHoldingMessage()));
    expect(seen.size).toBeGreaterThan(1);
  });
});
