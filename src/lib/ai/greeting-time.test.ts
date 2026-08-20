import { describe, expect, it } from "vitest";
import { resolveDeterministicReply } from "./interactive-prompts";

/** IST is UTC+5:30, so this builds a Date whose India-local hour is `h`. */
const atIST = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 21, h - 6, m + 30));

const greetingAt = (h: number, m = 0) =>
  resolveDeterministicReply({
    isFirstReply: true,
    languageObvious: false,
    history: [],
    guestMessage: "hi",
    hotelName: "Hotel Ivory Towers",
    now: atIST(h, m),
  })?.text ?? "";

describe("the agent name the hotel chose", () => {
  const introAs = (agentName?: string) =>
    resolveDeterministicReply({
      isFirstReply: true,
      languageObvious: false,
      history: [],
      guestMessage: "hi",
      hotelName: "Hotel Ivory Towers",
      agentName,
      now: atIST(9),
    })?.text ?? "";

  it("introduces itself with the hotel's own agent name", () => {
    // Reported live: a hotel renamed its assistant to MAYA in Settings, the
    // value saved correctly, and every new guest was still greeted "This is
    // Anushka" — the name was hardcoded into the one line every guest reads
    // first, so the setting worked everywhere except where it mattered most.
    expect(introAs("MAYA")).toContain("This is MAYA");
    expect(introAs("MAYA")).not.toContain("Anushka");
  });

  it("falls back to Anushka when the hotel has not set one", () => {
    expect(introAs(undefined)).toContain("This is Anushka");
    expect(introAs("   ")).toContain("This is Anushka");
  });
});

describe("time-of-day greeting", () => {
  it("does not say good morning in the middle of the night", () => {
    // A real guest's first-ever message: "Hii" at 00:24 IST was answered
    // "Good morning!". At half past midnight that reads as a machine, and it
    // is the first line the hotel ever says to them.
    expect(greetingAt(0, 24)).toContain("Hello!");
    expect(greetingAt(0, 24)).not.toContain("Good morning");
    expect(greetingAt(3)).toContain("Hello!");
  });

  it("still greets each part of the day correctly", () => {
    expect(greetingAt(9)).toContain("Good morning!");
    expect(greetingAt(14)).toContain("Good afternoon!");
    expect(greetingAt(20)).toContain("Good evening!");
  });

  it("switches at 5am, not midnight", () => {
    expect(greetingAt(4, 59)).toContain("Hello!");
    expect(greetingAt(5, 1)).toContain("Good morning!");
  });
});
