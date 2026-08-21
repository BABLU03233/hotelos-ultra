import { describe, expect, it } from "vitest";
import { digitsOnly, matchesSearch } from "./search";

const KARTHIK = { name: "GADDAM KARTHIK", phone: "+918688433376" };
const NO_NAME = { name: null, phone: "+919876543210" };

describe("matchesSearch", () => {
  it("finds a number typed the way a person reads it off a phone", () => {
    // The stored value is E.164; none of these are, and all should match.
    expect(matchesSearch(KARTHIK, "8688433376")).toBe(true);
    expect(matchesSearch(KARTHIK, "86884 33376")).toBe(true);
    expect(matchesSearch(KARTHIK, "86884-33376")).toBe(true);
    expect(matchesSearch(KARTHIK, "+91 86884 33376")).toBe(true);
    expect(matchesSearch(KARTHIK, "(868) 843-3376")).toBe(true);
  });

  it("matches a partial number, so you can stop typing once it is obvious", () => {
    expect(matchesSearch(KARTHIK, "8688")).toBe(true);
    expect(matchesSearch(KARTHIK, "3376")).toBe(true);
  });

  it("matches names case-insensitively and partially", () => {
    expect(matchesSearch(KARTHIK, "karthik")).toBe(true);
    expect(matchesSearch(KARTHIK, "GADDAM")).toBe(true);
    expect(matchesSearch(KARTHIK, "dam kar")).toBe(true);
  });

  it("still finds a contact that has no name at all", () => {
    expect(matchesSearch(NO_NAME, "9876543210")).toBe(true);
    expect(matchesSearch(NO_NAME, "karthik")).toBe(false);
  });

  it("does not match an unrelated contact", () => {
    expect(matchesSearch(KARTHIK, "9999999999")).toBe(false);
    expect(matchesSearch(KARTHIK, "priya")).toBe(false);
  });

  it("shows everything when the box is empty or only whitespace", () => {
    expect(matchesSearch(KARTHIK, "")).toBe(true);
    expect(matchesSearch(KARTHIK, "   ")).toBe(true);
  });

  it("does NOT match everyone when the query is only punctuation", () => {
    // digitsOnly("-") is "", and "" is a substring of every phone number. Left
    // unguarded this selects the entire contact list on a screen whose next
    // action is an un-recallable broadcast.
    expect(matchesSearch(KARTHIK, "-")).toBe(false);
    expect(matchesSearch(KARTHIK, "+")).toBe(false);
    expect(matchesSearch(KARTHIK, "()")).toBe(false);
  });
});

describe("digitsOnly", () => {
  it("keeps digits and drops everything else", () => {
    expect(digitsOnly("+91 (868) 843-3376")).toBe("918688433376");
    expect(digitsOnly("abc")).toBe("");
  });
});
