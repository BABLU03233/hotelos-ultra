import { describe, expect, it } from "vitest";
import { roomsFittingParty } from "./room-capacity";

const ROOMS = [
  { id: "classic", capacity: 2 },
  { id: "deluxe", capacity: 3 },
  { id: "premium", capacity: 3 },
];

describe("roomsFittingParty", () => {
  it("excludes a room that genuinely cannot hold the party", () => {
    // Reported live, with a screenshot: a party of 3 was shown the Classic
    // Room (capacity 2) as bookable, priced "rate for 3 confirmed by our
    // team". The hotel has no extra mattresses — "3 people cannot adjust" —
    // so that was a promise the room could not keep, made by name.
    expect(roomsFittingParty(ROOMS, 3).map((r) => r.id)).toEqual(["deluxe", "premium"]);
  });

  it("keeps every room that fits, in the caller's existing order", () => {
    // Rooms arrive sorted by price; filtering must not disturb that.
    expect(roomsFittingParty(ROOMS, 2).map((r) => r.id)).toEqual(["classic", "deluxe", "premium"]);
    expect(roomsFittingParty(ROOMS, 1).map((r) => r.id)).toEqual(["classic", "deluxe", "premium"]);
  });

  it("returns nothing when no room fits, rather than showing a room that cannot hold the guest", () => {
    // The caller decides what to say when this is empty — see the
    // oversized-party handover in process-message-job.ts, which normally
    // intercepts this case earlier and never lets it reach here at all.
    expect(roomsFittingParty(ROOMS, 4)).toEqual([]);
  });

  it("returns everything when the party size is unknown — nothing to filter on yet", () => {
    expect(roomsFittingParty(ROOMS, null).map((r) => r.id)).toEqual(["classic", "deluxe", "premium"]);
    expect(roomsFittingParty(ROOMS, undefined).map((r) => r.id)).toEqual(["classic", "deluxe", "premium"]);
    expect(roomsFittingParty(ROOMS, 0).map((r) => r.id)).toEqual(["classic", "deluxe", "premium"]);
  });

  it("does not mutate the input", () => {
    const input = [...ROOMS];
    roomsFittingParty(input, 3);
    expect(input.map((r) => r.id)).toEqual(["classic", "deluxe", "premium"]);
  });
});
