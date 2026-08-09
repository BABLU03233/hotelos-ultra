import { describe, expect, it } from "vitest";
import { matchOfferCode } from "./offer-match";

const OFFERS = [
  { id: "o1", title: "Flat ₹100 Off (FLAT100)", code: "FLAT100" },
  { id: "o2", title: "10% Off First Stay (WELCOME10)", code: "WELCOME10" },
  { id: "o3", title: "Special", code: null },
];

describe("matchOfferCode", () => {
  it("matches a code the guest typed, case-insensitively", () => {
    expect(matchOfferCode(OFFERS, ["I want to use flat100"])).toEqual({ id: "o1", title: "Flat ₹100 Off (FLAT100)" });
  });

  it("matches across multiple texts (e.g. conversation history)", () => {
    expect(matchOfferCode(OFFERS, ["hi", "any offers?", "yes use WELCOME10 please"])).toEqual({
      id: "o2",
      title: "10% Off First Stay (WELCOME10)",
    });
  });

  it("does not match a code as a substring of a longer word", () => {
    expect(matchOfferCode(OFFERS, ["FLAT1000 is not a real code"])).toBeNull();
  });

  it("returns null when no offer code appears in the text", () => {
    expect(matchOfferCode(OFFERS, ["just browsing, thanks"])).toBeNull();
  });

  it("skips offers with no code set, never matching them", () => {
    expect(matchOfferCode(OFFERS, ["I'd like the Special"])).toBeNull();
  });

  it("returns null for an empty offer list", () => {
    expect(matchOfferCode([], ["FLAT100"])).toBeNull();
  });
});
