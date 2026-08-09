import { describe, expect, it } from "vitest";
import { extractDatesMarker } from "./date-marker";

const TODAY = new Date(2026, 7, 9); // Sun, 9 Aug 2026, same fixed "now" as date-safety.test.ts

describe("extractDatesMarker", () => {
  it("returns the text unchanged when no DATES marker is present", () => {
    const result = extractDatesMarker("Sure, the Deluxe Room is available!", TODAY);
    expect(result).toEqual({ text: "Sure, the Deluxe Room is available!" });
  });

  it("strips the marker and extracts valid check-in/check-out dates", () => {
    const result = extractDatesMarker("Got it, 15th to 17th August works!\nDATES: 2026-08-15_2026-08-17", TODAY);
    expect(result.text).toBe("Got it, 15th to 17th August works!");
    expect(result.dates).toEqual({ checkIn: new Date(2026, 7, 15), checkOut: new Date(2026, 7, 17) });
  });

  it("is case-insensitive on the marker keyword", () => {
    const result = extractDatesMarker("Noted!\ndates: 2026-08-15_2026-08-17", TODAY);
    expect(result.dates).toBeDefined();
  });

  it("rejects a malformed date (not parseable)", () => {
    const result = extractDatesMarker("Noted!\nDATES: 2026-13-40_2026-13-41", TODAY);
    expect(result.dates).toBeUndefined();
    expect(result.text).toBe("Noted!");
  });

  it("rejects when check-out is not after check-in", () => {
    const result = extractDatesMarker("Noted!\nDATES: 2026-08-17_2026-08-15", TODAY);
    expect(result.dates).toBeUndefined();
  });

  it("rejects when check-out equals check-in (zero-night stay)", () => {
    const result = extractDatesMarker("Noted!\nDATES: 2026-08-15_2026-08-15", TODAY);
    expect(result.dates).toBeUndefined();
  });

  it("rejects a check-in date that's already in the past relative to today", () => {
    const result = extractDatesMarker("Noted!\nDATES: 2026-08-01_2026-08-03", TODAY);
    expect(result.dates).toBeUndefined();
  });

  it("accepts a check-in of today itself", () => {
    const result = extractDatesMarker("Noted!\nDATES: 2026-08-09_2026-08-10", TODAY);
    expect(result.dates).toEqual({ checkIn: new Date(2026, 7, 9), checkOut: new Date(2026, 7, 10) });
  });

  it("always strips the marker line even when the dates are rejected, so the guest never sees it", () => {
    const result = extractDatesMarker("Noted!\nDATES: 2026-08-01_2026-08-03", TODAY);
    expect(result.text).toBe("Noted!");
    expect(result.text).not.toContain("DATES:");
  });
});
