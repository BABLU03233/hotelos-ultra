import { describe, expect, it } from "vitest";
import { ROW_TITLE_MAX, truncateRowTitle } from "./row-title";

describe("truncateRowTitle", () => {
  it("leaves a short title alone", () => {
    expect(truncateRowTitle("Is parking available?")).toBe("Is parking available?");
  });

  it("cuts at a word boundary rather than mid-word", () => {
    // The bug this exists for. Probed live, the FAQ list rendered
    // "What time is check-in an" — not a shortened question, a broken one.
    expect(truncateRowTitle("What time is check-in and check-out?")).toBe("What time is check-in…");
  });

  it("never exceeds WhatsApp's cap, ellipsis included", () => {
    const inputs = [
      "What time is check-in and check-out?",
      "Supercalifragilisticexpialidociously long single word",
      "Book Presidential Suite With Balcony",
      "మీ తేదీలకు రూమ్‌లు ఖాళీగా ఉన్నాయి ఏది కావాలి",
    ];
    for (const i of inputs) expect(truncateRowTitle(i).length).toBeLessThanOrEqual(ROW_TITLE_MAX);
  });

  it("hard-cuts a first word too long to break on", () => {
    // Honouring a word boundary here would leave two letters and a dot.
    const out = truncateRowTitle("Supercalifragilisticexpialidocious");
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(ROW_TITLE_MAX);
    expect(out.length).toBeGreaterThan(10);
  });

  it("does not leave punctuation stranded before the ellipsis", () => {
    // "Rooms, suites,…" reads as a typo.
    expect(truncateRowTitle("Rooms, suites, and villas available")).not.toMatch(/[,\s.\-]…$/);
  });

  it("trims surrounding whitespace", () => {
    expect(truncateRowTitle("  Parking?  ")).toBe("Parking?");
  });
});
