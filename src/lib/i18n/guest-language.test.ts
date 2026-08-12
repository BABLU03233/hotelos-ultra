import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  detectScriptLanguage,
  GuestLanguage,
  isGuestLanguage,
  LANGUAGE_BUTTON_VALUES,
  resolveLanguage,
  t,
} from "./guest-language";
import { confirmBookingPrompt, dateQuickPickPrompt, greetMenuPrompt, guestCountPrompt, resolveDeterministicReply } from "@/lib/ai/interactive-prompts";
import { buildCheckInPickerMessage, buildNightsPickerMessage } from "@/lib/whatsapp/date-picker-message";

import type { InteractivePrompt } from "@/lib/ai/interactive-prompts";

const LANGS: GuestLanguage[] = ["en", "hi", "te"];
const NOW = new Date("2026-08-12T06:00:00Z");

/** InteractivePrompt is a list|buttons union — narrow to the rows either way. */
function asRows(prompt: InteractivePrompt): { id: string; title: string }[] {
  return prompt.type === "list" ? prompt.rows : prompt.buttons;
}
const titles = (prompt: InteractivePrompt) => asRows(prompt).map((r) => r.title).join("");
const ids = (prompt: InteractivePrompt) => asRows(prompt).map((r) => r.id);

describe("language selection", () => {
  it("maps every picker row to a language", () => {
    expect(LANGUAGE_BUTTON_VALUES.lang_en).toBe("en");
    expect(LANGUAGE_BUTTON_VALUES.lang_hi).toBe("hi");
    expect(LANGUAGE_BUTTON_VALUES.lang_te).toBe("te");
  });

  it("infers language from script, and refuses to guess from Roman letters", () => {
    expect(detectScriptLanguage("नमस्ते, कमरा चाहिए")).toBe("hi");
    expect(detectScriptLanguage("రూమ్ కావాలి")).toBe("te");
    // Roman letters could be English, Hinglish or Tenglish — genuinely
    // ambiguous, so guessing would risk overriding a real choice.
    expect(detectScriptLanguage("kamra chahiye")).toBeNull();
    expect(detectScriptLanguage("I want a room")).toBeNull();
  });

  it("falls back to English for anything unrecognised", () => {
    expect(resolveLanguage(null)).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage("fr")).toBe(DEFAULT_LANGUAGE);
    expect(isGuestLanguage("hi")).toBe(true);
    expect(isGuestLanguage("fr")).toBe(false);
  });
});

describe("every guest-visible string is translated", () => {
  // A half-translated conversation (Hindi prose, English buttons) reads as
  // more broken than English throughout, because it looks like a failure
  // rather than a choice. So this asserts completeness, not spot values.
  it("has no missing or empty strings in any language", () => {
    for (const lang of LANGS) {
      const s = t(lang) as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(s)) {
        if (typeof value === "function") continue;
        expect(typeof value, `${lang}.${key} is not a string`).toBe("string");
        expect((value as string).trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("does not leave English text in the Hindi or Telugu tables", () => {
    // Catches the commonest translation slip: a key copy-pasted and never
    // translated. Compared against English rather than eyeballed.
    const en = t("en") as unknown as Record<string, unknown>;
    for (const lang of ["hi", "te"] as GuestLanguage[]) {
      const s = t(lang) as unknown as Record<string, unknown>;
      const identical = Object.keys(en).filter(
        (k) => typeof en[k] === "string" && typeof s[k] === "string" && en[k] === s[k]
      );
      expect(identical, `${lang} still uses the English string for: ${identical.join(", ")}`).toHaveLength(0);
    }
  });
});

describe("the picked language reaches the actual buttons", () => {
  // The reported bug: picking a language changed one greeting and nothing
  // else, because every button and deterministic reply was hardcoded
  // English. These assert the choice governs the whole UI.
  const devanagari = /[ऀ-ॿ]/;
  const telugu = /[ఀ-౿]/;

  it("renders the guest-count picker in the chosen language", () => {
    expect(devanagari.test(titles(guestCountPrompt("hi")))).toBe(true);
    expect(telugu.test(titles(guestCountPrompt("te")))).toBe(true);
  });

  it("renders the date picker in the chosen language", () => {
    expect(devanagari.test(titles(dateQuickPickPrompt("hi")))).toBe(true);
    expect(telugu.test(titles(dateQuickPickPrompt("te")))).toBe(true);
  });

  it("renders the greet menu and confirm rows in the chosen language", () => {
    expect(devanagari.test(titles(greetMenuPrompt("hi")))).toBe(true);
    expect(telugu.test(titles(confirmBookingPrompt("te")))).toBe(true);
  });

  it("renders the tappable calendar in the chosen language", () => {
    const hi = buildCheckInPickerMessage(NOW, "hi");
    expect(devanagari.test(hi.body + hi.buttonText)).toBe(true);
    const te = buildNightsPickerMessage(new Date(2026, 7, 17), "te");
    expect(telugu.test(te.body + te.buttonText)).toBe(true);
  });

  it("keeps row IDs identical across languages, so routing can never break", () => {
    // This is what made translating titles safe: every downstream decision
    // resolves from the id, never the visible text.
    const countIds = (l: GuestLanguage) => ids(guestCountPrompt(l));
    expect(countIds("hi")).toEqual(countIds("en"));
    expect(countIds("te")).toEqual(countIds("en"));
    const dateIds = (l: GuestLanguage) => ids(dateQuickPickPrompt(l));
    expect(dateIds("hi")).toEqual(dateIds("en"));
    expect(dateIds("te")).toEqual(dateIds("en"));
  });
});

describe("deterministic replies follow the chosen language", () => {
  const base = {
    isFirstReply: false,
    languageObvious: false,
    history: [] as { role: string; content: string }[],
    guestMessage: "I want to book a room",
    knownGuestCount: null,
  };

  it("asks for guest count in Hindi and Telugu, not English", () => {
    const hi = resolveDeterministicReply({ ...base, language: "hi" });
    expect(/[ऀ-ॿ]/.test(hi?.text ?? "")).toBe(true);
    const te = resolveDeterministicReply({ ...base, language: "te" });
    expect(/[ఀ-౿]/.test(te?.text ?? "")).toBe(true);
  });

  it("still serves a guest writing in native script, instead of bailing to the AI", () => {
    // This bail-out existed because the strings were English-only; leaving
    // it would deny non-English guests the localised buttons entirely.
    const result = resolveDeterministicReply({
      ...base,
      languageObvious: true,
      language: "hi",
      guestMessage: "मुझे कमरा बुक करना है",
    });
    expect(result).not.toBeNull();
    expect(/[ऀ-ॿ]/.test(result?.text ?? "")).toBe(true);
  });
});
