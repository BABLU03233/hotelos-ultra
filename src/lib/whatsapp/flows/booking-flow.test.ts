import { describe, expect, it } from "vitest";
import { buildBookingFlowJson } from "./booking-flow";

const ROOMS = [
  { id: "r1", name: "Classic Room", price: 999 },
  { id: "r2", name: "Deluxe Room", price: 1299 },
];

// Fixed "now" for deterministic tests, same convention as date-safety.test.ts.
const NOW = new Date(2026, 7, 9); // Sun, 9 Aug 2026

interface FlowScreen {
  id: string;
  terminal?: boolean;
  layout: { children: { type: string; name?: string; "data-source"?: { id: string; title: string }[]; "min-date"?: string }[] };
}
interface FlowJson {
  version: string;
  screens: FlowScreen[];
}

describe("buildBookingFlowJson", () => {
  it("has exactly one terminal screen", () => {
    const flow = buildBookingFlowJson(ROOMS, NOW) as FlowJson;
    expect(flow.screens).toHaveLength(1);
    expect(flow.screens[0].terminal).toBe(true);
  });

  it("builds a room dropdown with one option per real room, using the real room id", () => {
    const flow = buildBookingFlowJson(ROOMS, NOW) as FlowJson;
    const roomField = flow.screens[0].layout.children.find((c) => c.name === "room");
    expect(roomField?.["data-source"]).toEqual([
      { id: "r1", title: "Classic Room — from ₹999/night" },
      { id: "r2", title: "Deluxe Room — from ₹1299/night" },
    ]);
  });

  it("sets the calendar's min-date to today (no bookable dates in the past)", () => {
    const flow = buildBookingFlowJson(ROOMS, NOW) as FlowJson;
    const dateField = flow.screens[0].layout.children.find((c) => c.name === "date_range");
    expect(dateField?.["min-date"]).toBe("2026-08-09");
  });

  it("includes a guest-count dropdown with the standard three options", () => {
    const flow = buildBookingFlowJson(ROOMS, NOW) as FlowJson;
    const guestsField = flow.screens[0].layout.children.find((c) => c.name === "guests");
    expect(guestsField?.["data-source"]?.map((o) => o.id)).toEqual(["1", "2", "3+"]);
  });

  it("includes a Footer that completes the flow (never navigates to another screen)", () => {
    const flow = buildBookingFlowJson(ROOMS, NOW) as FlowJson;
    const footer = flow.screens[0].layout.children.find((c) => c.type === "Footer") as { "on-click-action"?: { name: string } };
    expect(footer?.["on-click-action"]?.name).toBe("complete");
  });

  it("handles an empty room list without throwing (an empty dropdown, not a crash)", () => {
    const flow = buildBookingFlowJson([], NOW) as FlowJson;
    const roomField = flow.screens[0].layout.children.find((c) => c.name === "room");
    expect(roomField?.["data-source"]).toEqual([]);
  });
});
