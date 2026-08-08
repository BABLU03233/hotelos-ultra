import { describe, expect, it } from "vitest";
import { derivePrefix, randomReferenceCode } from "./reference-code";

describe("derivePrefix", () => {
  it("uses the owner-set prefix when configured", () => {
    expect(derivePrefix({ bookingCodePrefix: "IVR", name: "Ivory Towers" })).toBe("IVR");
  });

  it("derives from the first letters of the hotel name when unset", () => {
    expect(derivePrefix({ bookingCodePrefix: null, name: "Ivory Towers" })).toBe("IVO");
  });

  it("strips spaces and punctuation before taking the first 3 letters", () => {
    expect(derivePrefix({ bookingCodePrefix: null, name: "The Grand Hyatt" })).toBe("THE");
  });

  it("falls back to STAY when the name has no letters at all", () => {
    expect(derivePrefix({ bookingCodePrefix: null, name: "123" })).toBe("STAY");
    expect(derivePrefix({ bookingCodePrefix: null, name: "" })).toBe("STAY");
  });

  it("falls back to STAY when profile is null", () => {
    expect(derivePrefix(null)).toBe("STAY");
  });

  it("prefers the explicit prefix even over a name that would derive differently", () => {
    expect(derivePrefix({ bookingCodePrefix: "GH", name: "Ivory Towers" })).toBe("GH");
  });
});

describe("randomReferenceCode", () => {
  it("formats as PREFIX-NNNN with a 4-digit suffix", () => {
    const code = randomReferenceCode("IVR");
    expect(code).toMatch(/^IVR-\d{4}$/);
  });

  it("generates different codes across repeated calls (not a fixed constant)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => randomReferenceCode("IVR")));
    expect(codes.size).toBeGreaterThan(1);
  });
});
