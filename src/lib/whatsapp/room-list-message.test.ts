import { describe, expect, it } from "vitest";
import { buildRoomListMessage } from "./room-list-message";

const ROOMS = [
  { id: "r1", name: "Classic Room", price: 999, capacity: 2 },
  { id: "r2", name: "Deluxe Room", price: 1299, capacity: 3 },
  { id: "r3", name: "Premium Room", price: 1599, capacity: 3 },
];

describe("buildRoomListMessage", () => {
  it("builds one row per room with id/title/description", () => {
    const msg = buildRoomListMessage(ROOMS);
    expect(msg.type).toBe("list");
    expect(msg.sections).toHaveLength(1);
    // Titles read as an action now — this list IS the recommendation step,
    // so a row is something the guest does, not a label. A trailing
    // "Know more" row is appended; see room-choice.test.ts.
    expect(msg.sections[0].rows.slice(0, 3)).toEqual([
      { id: "room_pick_r1", title: "Book Classic Room", description: "From ₹999/night · up to 2 persons" },
      { id: "room_pick_r2", title: "Book Deluxe Room", description: "From ₹1299/night · up to 3 persons" },
      { id: "room_pick_r3", title: "Book Premium Room", description: "From ₹1599/night · up to 3 persons" },
    ]);
  });

  it("caps at 10 rows even if a tenant has more rooms (WhatsApp's hard limit)", () => {
    const manyRooms = Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, name: `Room ${i}`, price: 1000, capacity: 2 }));
    const msg = buildRoomListMessage(manyRooms);
    expect(msg.sections[0].rows).toHaveLength(10);
  });

  it("truncates a long room name to WhatsApp's 24-char row title limit", () => {
    const msg = buildRoomListMessage([{ id: "r1", name: "The Absolutely Enormous Super Deluxe Presidential Suite", price: 5000, capacity: 4 }]);
    expect(msg.sections[0].rows[0].title.length).toBeLessThanOrEqual(24);
  });

  it("uses singular 'person' for capacity 1", () => {
    const msg = buildRoomListMessage([{ id: "r1", name: "Single Room", price: 799, capacity: 1 }]);
    expect(msg.sections[0].rows[0].description).toContain("1 person");
    expect(msg.sections[0].rows[0].description).not.toContain("1 persons");
  });

  it("handles an empty room list without throwing", () => {
    // Still carries the "Know more" escape hatch, so a guest is never shown
    // a list with nothing tappable in it.
    const msg = buildRoomListMessage([]);
    expect(msg.sections[0].rows).toHaveLength(1);
    expect(msg.sections[0].rows[0].title).toBe("Know more");
  });
});
