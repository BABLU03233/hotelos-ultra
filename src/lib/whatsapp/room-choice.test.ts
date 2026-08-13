import { describe, expect, it } from "vitest";
import { buildRoomListMessage } from "./room-list-message";
import { hasWrongRoomPrice } from "@/lib/ai/reply-safety";
import { GREET_QUESTION_BUTTON_ID } from "@/lib/ai/interactive-prompts";

// The hotel's real inventory, and the figures the model invented for it.
const ROOMS = [
  { id: "r1", name: "Classic Room", price: 999, capacity: 2 },
  { id: "r2", name: "Deluxe Room", price: 1299, capacity: 3 },
  { id: "r3", name: "Premium Room", price: 1599, capacity: 3 },
];

describe("the guest chooses the room, not Anushka", () => {
  const msg = buildRoomListMessage(ROOMS);
  const rows = msg.sections[0].rows;

  it("offers every room rather than picking one", () => {
    // Live: asked to recommend, the model chose a room on the guest's behalf.
    // With a handful of rooms, the shortlist IS the answer.
    for (const r of ROOMS) {
      expect(rows.some((row) => row.id === `room_pick_${r.id}`), r.name).toBe(true);
    }
  });

  it("labels each row as an action", () => {
    expect(rows[0].title).toBe("Book Classic Room");
    expect(rows[1].title).toBe("Book Deluxe Room");
    expect(rows[2].title).toBe("Book Premium Room");
  });

  it("shows the REAL price on every row", () => {
    // The whole point: these come from Room rows, so they cannot be invented.
    expect(rows[0].description).toContain("999");
    expect(rows[1].description).toContain("1299");
    expect(rows[2].description).toContain("1599");
  });

  it("never shows an invented price", () => {
    const all = rows.map((r) => r.title + r.description).join(" ");
    expect(all).not.toContain("1899");
    expect(all).not.toContain("2199");
  });

  it("offers a way to ask before committing", () => {
    const last = rows.at(-1)!;
    expect(last.title).toBe("Know more");
    // Reuses the FAQ handler rather than inventing an id nothing routes.
    expect(last.id).toBe(GREET_QUESTION_BUTTON_ID);
  });

  it("is a list, so no reply-arrow icons appear", () => {
    expect(msg.type).toBe("list");
  });

  it("stays within WhatsApp's row cap even with many rooms", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, name: `Room ${i}`, price: 900 + i, capacity: 2 }));
    const rowsMany = buildRoomListMessage(many).sections[0].rows;
    expect(rowsMany.length).toBeLessThanOrEqual(10);
    // "Know more" must survive the truncation — it's the escape hatch.
    expect(rowsMany.at(-1)!.id).toBe(GREET_QUESTION_BUTTON_ID);
  });

  it("renders in the guest's language", () => {
    expect(/[ऀ-ॿ]/.test(buildRoomListMessage(ROOMS, "hi").body)).toBe(true);
    expect(/[ఀ-౿]/.test(buildRoomListMessage(ROOMS, "te").body)).toBe(true);
  });

  it("keeps room ids identical across languages, so routing can't break", () => {
    const ids = (l: "en" | "hi" | "te") => buildRoomListMessage(ROOMS, l).sections[0].rows.map((r) => r.id);
    expect(ids("hi")).toEqual(ids("en"));
    expect(ids("te")).toEqual(ids("en"));
  });
});

describe("a wrong price never reaches the guest", () => {
  // Backstop for anywhere the model still mentions a rate. The exact figures
  // below are the ones it actually sent: 46% and 37% above reality.
  it("catches the prices from the live incident", () => {
    expect(hasWrongRoomPrice("Our Deluxe Room, starting from ₹1,899/night", ROOMS)).toBe(true);
    expect(hasWrongRoomPrice("Our Premium Room is ₹2,199/night", ROOMS)).toBe(true);
  });

  it("allows the correct price", () => {
    expect(hasWrongRoomPrice("Our Deluxe Room is ₹1,299/night", ROOMS)).toBe(false);
    expect(hasWrongRoomPrice("The Classic Room starts from ₹999 per night", ROOMS)).toBe(false);
  });

  it("leaves totals and discounts alone", () => {
    // "₹2,598 for 2 nights" is correct arithmetic over a real rate, and
    // "₹100 off" is a real offer — flagging either would suppress good replies.
    expect(hasWrongRoomPrice("The Deluxe Room comes to ₹2,598 for 2 nights", ROOMS)).toBe(false);
    expect(hasWrongRoomPrice("You get a flat ₹100 off on the Deluxe Room", ROOMS)).toBe(false);
  });

  it("does not fire when no room is named or two are", () => {
    // Nothing to check against, and a comparison reply legitimately mentions
    // several rooms and rates.
    expect(hasWrongRoomPrice("Rooms start from ₹1,899/night", ROOMS)).toBe(false);
    expect(hasWrongRoomPrice("Classic Room ₹999/night, Deluxe Room ₹1,299/night", ROOMS)).toBe(false);
  });

  it("does not fire on a reply with no price at all", () => {
    expect(hasWrongRoomPrice("Our Deluxe Room is lovely and quiet.", ROOMS)).toBe(false);
    expect(hasWrongRoomPrice("Check-in is from 12pm!", ROOMS)).toBe(false);
  });
});
