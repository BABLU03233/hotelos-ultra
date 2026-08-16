import { describe, expect, it } from "vitest";
import { parseFlowDateRange } from "./parse-flow-response";

/**
 * Dates are computed relative to today, never hardcoded.
 *
 * This file previously pinned "2026-08-15" as its future date. That was true
 * when written and quietly became false: once a past-date guard was added to
 * parseFlowDateRange, the same fixtures started being (correctly) rejected
 * the moment the real date passed the 15th, and six tests failed for a
 * reason that had nothing to do with the change being made at the time.
 *
 * A test asserting "a future range parses" has to mean it on the day it
 * runs, not on the day it was authored.
 */
const DAY = 86_400_000;
const iso = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + offsetDays * DAY)
  );

const IN = iso(10); // check-in, comfortably ahead of today
const OUT = iso(11); // check-out, one night later
const expected = { checkIn: new Date(IN), checkOut: new Date(OUT) };

describe("parseFlowDateRange", () => {
  it("parses a comma-separated string range", () => {
    expect(parseFlowDateRange(`${IN},${OUT}`)).toEqual(expected);
  });

  it("parses a ' to '-separated string range", () => {
    expect(parseFlowDateRange(`${IN} to ${OUT}`)).toEqual(expected);
  });

  it("parses an object with start/end keys", () => {
    expect(parseFlowDateRange({ start: IN, end: OUT })).toEqual(expected);
  });

  it("parses an object with start_date/end_date keys", () => {
    expect(parseFlowDateRange({ start_date: IN, end_date: OUT })).toEqual(expected);
  });

  it("parses an object with from/to keys", () => {
    expect(parseFlowDateRange({ from: IN, to: OUT })).toEqual(expected);
  });

  it("returns null for an unparseable string (not two comma/to-separated parts)", () => {
    expect(parseFlowDateRange(`just one date ${IN}`)).toBeNull();
  });

  it("returns null for a reversed range (checkout before checkin)", () => {
    expect(parseFlowDateRange(`${OUT},${IN}`)).toBeNull();
  });

  it("returns null for a zero-night range (same date twice)", () => {
    expect(parseFlowDateRange(`${IN},${IN}`)).toBeNull();
  });

  it("returns null for a range that has already passed", () => {
    // A Flow submission goes straight to booking completion with no
    // conversational turn in between, so this is the least forgiving place
    // for a past date to slip through.
    expect(parseFlowDateRange(`${iso(-10)},${iso(-9)}`)).toBeNull();
  });

  it("returns null for garbage input rather than throwing", () => {
    expect(parseFlowDateRange(null)).toBeNull();
    expect(parseFlowDateRange(undefined)).toBeNull();
    expect(parseFlowDateRange(42)).toBeNull();
    expect(parseFlowDateRange({})).toBeNull();
    expect(parseFlowDateRange("not-a-date,also-not-a-date")).toBeNull();
  });
});
