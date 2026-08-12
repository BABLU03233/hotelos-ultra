import { describe, expect, it } from "vitest";
import {
  buildCheckInPickerMessage,
  buildNightsPickerMessage,
  CHECK_IN_OTHER_ID,
  NIGHTS_MORE_ID,
  TYPE_DATES_ID,
} from "./date-picker-message";
import { routeDatePickerTap } from "./date-picker-router";

const NOW = new Date("2026-08-12T06:00:00Z");
const CHECK_IN = new Date(2026, 7, 17);

describe("no row may route back to the list it appears in", () => {
  // The production bug, as an invariant. "Longer stay" re-sent the nights
  // picker and "Another date" re-sent the check-in picker, so the guest
  // could tap forever and never escape. Asserted exhaustively over every
  // row of both lists rather than for the two ids that happened to break.

  it("holds for every row of the check-in picker", () => {
    for (const row of buildCheckInPickerMessage(NOW).sections[0].rows) {
      const action = routeDatePickerTap(row.id, { pendingCheckIn: null }, NOW);
      expect(action.kind, `row "${row.title}" (${row.id}) re-opens the list it is in`).not.toBe("openCheckInPicker");
    }
  });

  it("holds for every row of the nights picker", () => {
    for (const row of buildNightsPickerMessage(CHECK_IN).sections[0].rows) {
      const action = routeDatePickerTap(row.id, { pendingCheckIn: CHECK_IN }, NOW);
      // A nights row must settle the stay or hand off — never bounce back.
      expect(["setCheckOut", "prompt"], `row "${row.title}" (${row.id}) did not progress`).toContain(action.kind);
    }
  });

  it("keeps the three control ids distinct — sharing one is what caused the loop", () => {
    const ids = [TYPE_DATES_ID, CHECK_IN_OTHER_ID, NIGHTS_MORE_ID];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("escape hatches answer in prose, never with another list", () => {
    for (const id of [CHECK_IN_OTHER_ID, NIGHTS_MORE_ID]) {
      const action = routeDatePickerTap(id, { pendingCheckIn: CHECK_IN }, NOW);
      expect(action.kind).toBe("prompt");
    }
  });

  it("cannot loop even when tapped repeatedly", () => {
    // Tap the same escape hatch ten times: the reply must stay a prompt and
    // never become a list, which is what made the real bug unescapable.
    for (let i = 0; i < 10; i++) {
      expect(routeDatePickerTap(NIGHTS_MORE_ID, { pendingCheckIn: CHECK_IN }, NOW).kind).toBe("prompt");
    }
  });
});

describe("routeDatePickerTap", () => {
  it("opens the check-in list from the DATE_QUICK_PICK row", () => {
    expect(routeDatePickerTap(TYPE_DATES_ID, { pendingCheckIn: null }, NOW).kind).toBe("openCheckInPicker");
  });

  it("opens the check-in list regardless of existing state — it is the way IN", () => {
    // Branching this on pendingCheckIn is precisely how the loop was born.
    expect(routeDatePickerTap(TYPE_DATES_ID, { pendingCheckIn: CHECK_IN }, NOW).kind).toBe("openCheckInPicker");
  });

  it("settles the arrival day from a date row", () => {
    const row = buildCheckInPickerMessage(NOW).sections[0].rows[2];
    const action = routeDatePickerTap(row.id, { pendingCheckIn: null }, NOW);
    expect(action.kind).toBe("setCheckIn");
  });

  it("reopens the picker for a stale row naming a past date", () => {
    expect(routeDatePickerTap("checkin_2020-01-01", { pendingCheckIn: null }, NOW).kind).toBe("openCheckInPicker");
  });

  it("settles the stay from a nights row", () => {
    const action = routeDatePickerTap("nights_3", { pendingCheckIn: CHECK_IN }, NOW);
    expect(action.kind).toBe("setCheckOut");
    if (action.kind === "setCheckOut") expect(action.checkOut.getDate()).toBe(20);
  });

  it("asks for the arrival day when nights are tapped out of order", () => {
    expect(routeDatePickerTap("nights_3", { pendingCheckIn: null }, NOW).kind).toBe("openCheckInPicker");
  });

  it("leaves other buttons alone", () => {
    for (const id of ["guests_2", "room_pick_r1", "confirm_booking", "dates_weekend"]) {
      expect(routeDatePickerTap(id, { pendingCheckIn: CHECK_IN }, NOW).kind).toBe("notMine");
    }
  });

  it("ignores a plain typed message", () => {
    expect(routeDatePickerTap(null, { pendingCheckIn: null }, NOW).kind).toBe("notMine");
  });
});
