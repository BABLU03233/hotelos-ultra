import { describe, expect, it } from "vitest";
import { matchRecommendedRoom } from "./room-match";

const ROOMS = [
  { id: "r1", name: "Classic Room" },
  { id: "r2", name: "Deluxe Room" },
  { id: "r3", name: "Premium Room" },
];

describe("matchRecommendedRoom", () => {
  it("matches the room named in the reply text", () => {
    expect(matchRecommendedRoom("Our Deluxe Room starts from ₹1,299/night", ROOMS)).toBe("r2");
  });

  it("is case-insensitive", () => {
    expect(matchRecommendedRoom("the deluxe room is great", ROOMS)).toBe("r2");
  });

  it("returns null when no room name appears in the text (fail-soft, don't guess)", () => {
    expect(matchRecommendedRoom("Sure, we have availability!", ROOMS)).toBeNull();
  });

  it("returns null when two room names both appear (ambiguous, e.g. a cheaper-alternative reply)", () => {
    expect(matchRecommendedRoom("The Classic Room is cheaper than the Deluxe Room", ROOMS)).toBeNull();
  });

  it("returns null for an empty room list", () => {
    expect(matchRecommendedRoom("Our Deluxe Room starts from ₹1,299/night", [])).toBeNull();
  });
});
