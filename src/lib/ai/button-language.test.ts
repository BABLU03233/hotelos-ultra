import { describe, expect, it } from "vitest";
import { selectDeterministicInteractive } from "./interactive-prompts";

const base = {
  isFirstReply: false,
  languageObvious: true,
  history: [
    { role: "user", content: "hi" },
    { role: "assistant", content: "Hi! I'm Anushka 😊" },
  ],
  guestMessage: "I want to book a room",
  replyText: "Lovely! How many of you will be staying?",
  knownGuestCount: null,
  datesKnown: false,
};

const titles = (p: ReturnType<typeof selectDeterministicInteractive>) =>
  p?.type === "list" ? p.rows.map((r) => r.title).join(" | ") : p?.buttons.map((b) => b.title).join(" | ") ?? "";

describe("buttons are written in the guest's language", () => {
  // The live failure: a Telugu guest was asked "ఎన్ని మంది కోసం బుక్ చేయాలి?"
  // above rows reading "Just me / 2 people / 3+ people". The model wrote the
  // sentence in Telugu; the buttons came from the English catalog because the
  // AI path never passed a language down, even though promptForStageKey had
  // always accepted one.
  it("renders guest-count options in Telugu", () => {
    const out = titles(selectDeterministicInteractive({ ...base, language: "te" }));
    expect(out).toMatch(/[ఀ-౿]/);
    expect(out).not.toMatch(/Just me/);
  });

  it("renders guest-count options in Hindi", () => {
    const out = titles(selectDeterministicInteractive({ ...base, language: "hi" }));
    expect(out).toMatch(/[ऀ-ॿ]/);
    expect(out).not.toMatch(/Just me/);
  });

  it("still renders English when that is the chosen language", () => {
    expect(titles(selectDeterministicInteractive({ ...base, language: "en" }))).toMatch(/Just me/);
  });

  it("falls back to English when no language is known", () => {
    // An unset language must not throw or produce empty labels.
    expect(titles(selectDeterministicInteractive({ ...base, language: null }))).toMatch(/Just me/);
    expect(titles(selectDeterministicInteractive(base))).toMatch(/Just me/);
  });

  it("changes the labels when only the language changes", () => {
    // The tightest statement of the bug: identical conversation state, one
    // different language, and previously identical English output either way.
    const en = titles(selectDeterministicInteractive({ ...base, language: "en" }));
    const te = titles(selectDeterministicInteractive({ ...base, language: "te" }));
    const hi = titles(selectDeterministicInteractive({ ...base, language: "hi" }));

    expect(en).not.toBe("");
    expect(te).not.toBe(en);
    expect(hi).not.toBe(en);
    expect(hi).not.toBe(te);
  });
});
