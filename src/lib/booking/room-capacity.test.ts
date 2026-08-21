import { describe, expect, it } from "vitest";
import { roomsFittingParty } from "./room-capacity";

const ROOMS = [
  { id: "classic", capacity: 2 },
  { id: "deluxe", capacity: 3 },
  { id: "premium", capacity: 3 },
];

describe("roomsFittingParty", () => {
  it("never hides a room from the guest", () => {
    // It used to drop rooms below the party size. A party of three then saw
    // two rooms and was told "we have 2 rooms free" — a hotel that looks
    // nearly full. Losing the booking costs more than a conversation about an
    // extra mattress.
    expect(roomsFittingParty(ROOMS, 3)).toHaveLength(3);
    expect(roomsFittingParty(ROOMS, 9)).toHaveLength(3);
  });

  it("puts the rooms that comfortably fit first", () => {
    expect(roomsFittingParty(ROOMS, 3).map((r) => r.id)).toEqual(["deluxe", "premium", "classic"]);
  });

  it("keeps the caller's order within each group, so the cheapest suitable room leads", () => {
    // Rooms arrive sorted by price; that must survive the reordering.
    expect(roomsFittingParty(ROOMS, 2).map((r) => r.id)).toEqual(["classic", "deluxe", "premium"]);
  });

  it("leaves the list untouched when the party size is unknown", () => {
    expect(roomsFittingParty(ROOMS, null).map((r) => r.id)).toEqual(["classic", "deluxe", "premium"]);
    expect(roomsFittingParty(ROOMS, 0).map((r) => r.id)).toEqual(["classic", "deluxe", "premium"]);
  });

  it("does not mutate the input", () => {
    const input = [...ROOMS];
    roomsFittingParty(input, 3);
    expect(input.map((r) => r.id)).toEqual(["classic", "deluxe", "premium"]);
  });
});
