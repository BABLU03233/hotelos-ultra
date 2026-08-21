import { describe, expect, it } from "vitest";
import { reachabilityWarning, unreachableForFreeForm } from "./reachability";

const NOW = new Date("2026-08-21T12:00:00Z");
const recent = { id: "a", phone: "+911111111111", lastInboundAt: "2026-08-21T09:00:00Z" };
const stale = { id: "b", phone: "+912222222222", lastInboundAt: "2026-08-18T09:00:00Z" };
const never = { id: "c", phone: "+913333333333", lastInboundAt: null };

describe("unreachableForFreeForm", () => {
  it("flags a contact who has never messaged the hotel", () => {
    // The live case: two contacts with lastInboundAt NULL, an image
    // broadcast built for them, every message refused by Meta.
    expect(unreachableForFreeForm([never], "IMAGE", NOW).map((c) => c.id)).toEqual(["c"]);
  });

  it("flags a contact whose last message is older than 24 hours", () => {
    expect(unreachableForFreeForm([stale], "TEXT", NOW).map((c) => c.id)).toEqual(["b"]);
  });

  it("does not flag a contact inside the window", () => {
    expect(unreachableForFreeForm([recent], "TEXT", NOW)).toEqual([]);
  });

  it("flags nothing for a template — that is what templates are for", () => {
    expect(unreachableForFreeForm([never, stale, recent], "TEMPLATE", NOW)).toEqual([]);
  });

  it("returns only the unreachable ones from a mixed list", () => {
    expect(unreachableForFreeForm([recent, stale, never], "IMAGE", NOW).map((c) => c.id)).toEqual(["b", "c"]);
  });
});

describe("reachabilityWarning", () => {
  it("says nothing when everyone is reachable", () => {
    expect(reachabilityWarning(0, 5)).toBeNull();
  });

  it("names the fix, not just the rule, when nobody can be reached", () => {
    const msg = reachabilityWarning(2, 2)!;
    expect(msg).toContain("None of these 2");
    expect(msg).toContain("approved template");
  });

  it("handles a single unreachable contact without saying 'None of these 1'", () => {
    const msg = reachabilityWarning(1, 1)!;
    expect(msg).toContain("This contact");
    expect(msg).not.toContain("None of these");
  });

  it("reports a partial problem as a fraction", () => {
    expect(reachabilityWarning(2, 10)).toContain("2 of 10");
  });

  it("uses singular grammar for one unreachable in a larger list", () => {
    expect(reachabilityWarning(1, 10)).toContain("contact hasn't");
  });
});
