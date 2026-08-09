import { describe, expect, it } from "vitest";
import { parseFlowDateRange } from "./parse-flow-response";

describe("parseFlowDateRange", () => {
  it("parses a comma-separated string range", () => {
    expect(parseFlowDateRange("2026-08-15,2026-08-16")).toEqual({ checkIn: new Date("2026-08-15"), checkOut: new Date("2026-08-16") });
  });

  it("parses a ' to '-separated string range", () => {
    expect(parseFlowDateRange("2026-08-15 to 2026-08-16")).toEqual({ checkIn: new Date("2026-08-15"), checkOut: new Date("2026-08-16") });
  });

  it("parses an object with start/end keys", () => {
    expect(parseFlowDateRange({ start: "2026-08-15", end: "2026-08-16" })).toEqual({
      checkIn: new Date("2026-08-15"),
      checkOut: new Date("2026-08-16"),
    });
  });

  it("parses an object with start_date/end_date keys", () => {
    expect(parseFlowDateRange({ start_date: "2026-08-15", end_date: "2026-08-16" })).toEqual({
      checkIn: new Date("2026-08-15"),
      checkOut: new Date("2026-08-16"),
    });
  });

  it("parses an object with from/to keys", () => {
    expect(parseFlowDateRange({ from: "2026-08-15", to: "2026-08-16" })).toEqual({
      checkIn: new Date("2026-08-15"),
      checkOut: new Date("2026-08-16"),
    });
  });

  it("returns null for an unparseable string (not two comma/to-separated parts)", () => {
    expect(parseFlowDateRange("just one date 2026-08-15")).toBeNull();
  });

  it("returns null for a reversed range (checkout before checkin)", () => {
    expect(parseFlowDateRange("2026-08-16,2026-08-15")).toBeNull();
  });

  it("returns null for a zero-night range (same date twice)", () => {
    expect(parseFlowDateRange("2026-08-15,2026-08-15")).toBeNull();
  });

  it("returns null for garbage input rather than throwing", () => {
    expect(parseFlowDateRange(null)).toBeNull();
    expect(parseFlowDateRange(undefined)).toBeNull();
    expect(parseFlowDateRange(42)).toBeNull();
    expect(parseFlowDateRange({})).toBeNull();
    expect(parseFlowDateRange("not-a-date,also-not-a-date")).toBeNull();
  });
});
