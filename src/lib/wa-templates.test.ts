import { describe, expect, it } from "vitest";
import { deterministicConcerns } from "./campaigns/copy-rules";
import { WA_TEMPLATES } from "./wa-templates";

/**
 * The app ships starter promotional copy AND a reviewer that judges
 * promotional copy. If the two disagree, the product is teaching hotels habits
 * it then penalises them for — an owner inserts a supplied template, submits
 * it, and gets it flagged.
 *
 * This is the test that keeps them honest. It caught the original offer
 * templates, none of which carried an opt-out line.
 */
describe("bundled WhatsApp templates", () => {
  const bulk = WA_TEMPLATES.filter((t) => t.bulkSafe);

  it("ships some templates meant for broadcasts", () => {
    expect(bulk.length).toBeGreaterThan(0);
  });

  it.each(bulk.map((t) => [t.id, t] as const))("%s passes our own campaign review", (_id, template) => {
    expect(deterministicConcerns(template.body)).toEqual([]);
  });

  it("marks only offer-style copy as safe to broadcast", () => {
    // A booking confirmation or check-in reminder is a reply inside a live
    // conversation. Broadcasting one to an imported list would be nonsense to
    // the recipient — they have no booking.
    for (const t of WA_TEMPLATES) {
      if (t.category === "BOOKING" || t.category === "CHECK_IN" || t.category === "WELCOME") {
        expect(t.bulkSafe).toBe(false);
      }
    }
  });

  it("gives every template a body and a distinct id", () => {
    const ids = new Set(WA_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(WA_TEMPLATES.length);
    for (const t of WA_TEMPLATES) expect(t.body.trim().length).toBeGreaterThan(0);
  });
});
