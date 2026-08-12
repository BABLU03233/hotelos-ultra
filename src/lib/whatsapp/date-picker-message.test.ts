import { describe, expect, it } from "vitest";
import {
  buildCheckInPickerMessage,
  buildNightsPickerMessage,
  CHECK_IN_OTHER_ID,
  CHECK_IN_PREFIX,
  describeStay,
  NIGHTS_MORE_ID,
  NIGHTS_PREFIX,
  parseCheckInId,
  parseNightsFromText,
  parseNightsId,
} from "./date-picker-message";

// 06:00 UTC = 11:30 IST — mid-day, no timezone boundary ambiguity.
const NOW = new Date("2026-08-12T06:00:00Z");
const CHECK_IN = new Date(2026, 7, 14); // 14 Aug 2026, local calendar date

describe("buildCheckInPickerMessage", () => {
  const msg = buildCheckInPickerMessage(NOW);
  const rows = msg.sections[0].rows;

  it("never exceeds WhatsApp's 10-row cap", () => {
    expect(rows.length).toBeLessThanOrEqual(10);
  });

  it("starts at today, in India time", () => {
    expect(rows[0].id).toBe(`${CHECK_IN_PREFIX}2026-08-12`);
    expect(rows[0].description).toBe("Today");
    expect(rows[1].description).toBe("Tomorrow");
  });

  it("offers consecutive days", () => {
    expect(rows[2].id).toBe(`${CHECK_IN_PREFIX}2026-08-14`);
    expect(rows[8].id).toBe(`${CHECK_IN_PREFIX}2026-08-20`);
  });

  it("never offers a past date", () => {
    for (const r of rows) {
      if (!r.id.startsWith(CHECK_IN_PREFIX)) continue;
      expect(parseCheckInId(r.id, NOW)).not.toBeNull();
    }
  });

  it("keeps an escape hatch for dates further out", () => {
    expect(rows.at(-1)!.id).toBe(CHECK_IN_OTHER_ID);
  });

  it("gives the escape hatch an id outside the date-parsing namespace", () => {
    // "checkin_other" would share CHECK_IN_PREFIX and could be swept into
    // the date parser if routing order ever changed — which is how the
    // original loop worked. Distinct namespaces make that impossible.
    expect(CHECK_IN_OTHER_ID.startsWith(CHECK_IN_PREFIX)).toBe(false);
    expect(NIGHTS_MORE_ID.startsWith(NIGHTS_PREFIX)).toBe(false);
  });

  it("respects WhatsApp's title and description limits", () => {
    for (const r of rows) {
      expect(r.title.length).toBeLessThanOrEqual(24);
      expect(r.description.length).toBeLessThanOrEqual(72);
    }
  });

  it("uses no calendar emoji, which misrenders a wrong date on some phones", () => {
    const all = msg.body + rows.map((r) => r.title + r.description).join("");
    expect(all).not.toMatch(/[\u{1F4C5}\u{1F5D3}]/u);
  });
});

describe("buildNightsPickerMessage", () => {
  const msg = buildNightsPickerMessage(CHECK_IN);
  const rows = msg.sections[0].rows;

  it("offers nights, not a second date grid — an invalid range becomes impossible", () => {
    expect(rows[0].id).toBe(`${NIGHTS_PREFIX}1`);
    expect(rows[0].title).toBe("1 night");
    expect(rows[1].title).toBe("2 nights");
  });

  it("shows the resulting check-out date on each row", () => {
    expect(rows[0].description).toContain("15 Aug");
    expect(rows[2].description).toContain("17 Aug");
  });

  it("names the check-in date in the body so the guest can catch a mistake", () => {
    expect(msg.body).toContain("14 Aug");
  });

  it("stays within the row cap and keeps an escape hatch", () => {
    expect(rows.length).toBeLessThanOrEqual(10);
    expect(rows.at(-1)!.id).toBe(NIGHTS_MORE_ID);
  });
});

describe("parseCheckInId", () => {
  it("resolves a tapped row to the right calendar day", () => {
    const d = parseCheckInId(`${CHECK_IN_PREFIX}2026-08-14`, NOW);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7);
    expect(d?.getDate()).toBe(14);
  });

  it("rejects a past date rather than booking it", () => {
    expect(parseCheckInId(`${CHECK_IN_PREFIX}2026-08-11`, NOW)).toBeNull();
  });

  it("accepts today", () => {
    expect(parseCheckInId(`${CHECK_IN_PREFIX}2026-08-12`, NOW)).not.toBeNull();
  });

  it("returns null for anything that isn't a check-in row", () => {
    expect(parseCheckInId("room_pick_r1", NOW)).toBeNull();
    expect(parseCheckInId(`${CHECK_IN_PREFIX}not-a-date`, NOW)).toBeNull();
    expect(parseCheckInId(`${CHECK_IN_PREFIX}2026-13-45`, NOW)).toBeNull();
  });

  it("is not shifted by the server's timezone", () => {
    // 20:00 UTC on the 11th is already 01:30 IST on the 12th. The 12th must
    // still be selectable — a server-local reading would call it past.
    expect(parseCheckInId(`${CHECK_IN_PREFIX}2026-08-12`, new Date("2026-08-11T20:00:00Z"))).not.toBeNull();
  });
});

describe("parseNightsId", () => {
  it("turns nights into a check-out date", () => {
    const out = parseNightsId(`${NIGHTS_PREFIX}2`, CHECK_IN);
    expect(out?.getDate()).toBe(16);
  });

  it("rejects nonsense rather than producing a bad range", () => {
    expect(parseNightsId(`${NIGHTS_PREFIX}0`, CHECK_IN)).toBeNull();
    expect(parseNightsId(`${NIGHTS_PREFIX}-3`, CHECK_IN)).toBeNull();
    expect(parseNightsId(`${NIGHTS_PREFIX}999`, CHECK_IN)).toBeNull();
    expect(parseNightsId("guests_2", CHECK_IN)).toBeNull();
  });

  it("always yields a check-out strictly after check-in", () => {
    for (let n = 1; n <= 7; n++) {
      const out = parseNightsId(`${NIGHTS_PREFIX}${n}`, CHECK_IN)!;
      expect(out.getTime()).toBeGreaterThan(CHECK_IN.getTime());
    }
  });
});

describe("parseNightsFromText", () => {
  // The escape hatch is worthless if what it leads to can't be understood —
  // the guest lands back in the prose loop the picker exists to avoid.
  it("reads a stay length in the ways guests actually write it", () => {
    expect(parseNightsFromText("10 nights")).toBe(10);
    expect(parseNightsFromText("2 raat")).toBe(2);
    expect(parseNightsFromText("3 din")).toBe(3);
    expect(parseNightsFromText("ten nights")).toBe(10);
    expect(parseNightsFromText("do raat")).toBe(2);
  });

  it("understands weeks", () => {
    expect(parseNightsFromText("a week")).toBe(7);
    expect(parseNightsFromText("2 weeks")).toBe(14);
  });

  it("takes a bare number only when we just asked", () => {
    expect(parseNightsFromText("10")).toBeNull();
    expect(parseNightsFromText("10", { answeringNightsQuestion: true })).toBe(10);
    expect(parseNightsFromText("three", { answeringNightsQuestion: true })).toBe(3);
  });

  it("refuses nonsense rather than booking it", () => {
    expect(parseNightsFromText("0 nights")).toBeNull();
    expect(parseNightsFromText("400 nights")).toBeNull();
    expect(parseNightsFromText("what time is check-in?")).toBeNull();
    expect(parseNightsFromText("")).toBeNull();
  });
});

describe("describeStay", () => {
  it("reads as a date range", () => {
    expect(describeStay(CHECK_IN, new Date(2026, 7, 16))).toMatch(/14 Aug.*16 Aug/);
  });
});
