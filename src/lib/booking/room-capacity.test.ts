import { describe, expect, it } from "vitest";
import { roomsFittingParty } from "./room-capacity";

const ROOMS = [
  { id: "classic", capacity: 2 },
  { id: "deluxe", capacity: 3 },
  { id: "premium", capacity: 3 },
];

describe("roomsFittingParty", () => {
  it("drops a room that cannot hold the party", () => {
    // Probed live: tapping "3+ people" offered the 2-person Classic Room, and
    // nothing downstream re-checks — the guest would have reached a booking
    // reference for a room that cannot hold them.
    expect(roomsFittingParty(ROOMS, 3).map((r) => r.id)).toEqual(["deluxe", "premium"]);
  });

  it("keeps every room for a party that fits anywhere", () => {
    expect(roomsFittingParty(ROOMS, 2)).toHaveLength(3);
    expect(roomsFittingParty(ROOMS, 1)).toHaveLength(3);
  });

  it("returns everything when the party size is unknown", () => {
    expect(roomsFittingParty(ROOMS, null)).toHaveLength(3);
    expect(roomsFittingParty(ROOMS, undefined)).toHaveLength(3);
    expect(roomsFittingParty(ROOMS, 0)).toHaveLength(3);
  });

  it("falls back to the full list rather than returning nothing", () => {
    // A family of nine needs several rooms — a real situation that needs a
    // person, not an empty screen. Both callers read an empty list as "no
    // availability on these dates", which would be untrue and unhelpful.
    expect(roomsFittingParty(ROOMS, 9)).toHaveLength(3);
  });

  it("does not mutate the input", () => {
    const input = [...ROOMS];
    roomsFittingParty(input, 3);
    expect(input).toHaveLength(3);
  });
});
