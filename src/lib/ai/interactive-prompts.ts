/**
 * Anushka never authors WhatsApp button/list payloads directly — the
 * interactive API has hard, silently-rejecting limits (max 3 buttons,
 * 20-char titles) and the fallback chain (pipeline.ts) includes several
 * weak free-tier models. Instead the AI only ever picks a KEY from this
 * small, code-owned catalog via a "BUTTONS: <KEY>" marker line, mirroring
 * the existing "IMAGE: <url>" convention exactly (see extractImageUrls in
 * pipeline.ts). A hallucinated/unknown key just falls back to a plain-text
 * reply — it never reaches Meta malformed.
 */
export const CONFIRM_BOOKING_BUTTON_ID = "confirm_booking";
// Handled deterministically in handle-inbound-message.ts (bypasses the AI
// entirely) — sends a code-generated List Message of the tenant's real
// rooms, rather than trusting a free-tier model to relay room names/prices
// accurately in prose a second time.
export const SEE_OTHER_ROOMS_BUTTON_ID = "room_other";

export interface InteractivePrompt {
  buttons: { id: string; title: string }[];
}

// fallbackBody: WhatsApp's interactive-button API requires non-empty body
// text — live testing showed the AI sometimes emits a bare "BUTTONS: KEY"
// line with no sentence in front of it (nothing left to strip after
// removing the marker), which would otherwise reach Meta as an empty body
// and fail to send. Used only when the AI's own text is empty/whitespace.
const BUTTON_CATALOG: Record<string, InteractivePrompt & { fallbackBody: string }> = {
  GUEST_COUNT: {
    fallbackBody: "How many guests will be staying? 😊",
    buttons: [
      { id: "guests_1", title: "Just me" },
      { id: "guests_2", title: "2 guests" },
      { id: "guests_3plus", title: "3+ guests" },
    ],
  },
  ROOM_RESPONSE: {
    fallbackBody: "Would you like to go ahead with this room?",
    buttons: [
      { id: "room_book", title: "Book this room" },
      { id: SEE_OTHER_ROOMS_BUTTON_ID, title: "See other options" },
      { id: "room_question", title: "I have a question" },
    ],
  },
  CONFIRM_BOOKING: {
    fallbackBody: "Ready to confirm your booking? 🎉",
    buttons: [
      { id: CONFIRM_BOOKING_BUTTON_ID, title: "Confirm booking" },
      { id: "not_yet", title: "Not yet" },
    ],
  },
  LANGUAGE_SELECT: {
    fallbackBody: "Which language would you like to chat in? 😊",
    buttons: [
      { id: "lang_en", title: "English" },
      { id: "lang_hi", title: "हिंदी" },
      { id: "lang_te", title: "తెలుగు" },
    ],
  },
};

// Deliberately NOT anchored to "start of its own line" — live testing showed
// weak/fast models sometimes tack "BUTTONS: KEY" onto the same line as the
// preceding sentence instead of putting it on its own line as instructed.
// Matching anywhere and trimming only the marker itself (not the whole line)
// means that formatting drift doesn't silently swallow the guest's buttons.
// [A-Za-z_]+ (not \S+) also stops at trailing punctuation like a period or
// "!" the model might append, so "BUTTONS: ROOM_RESPONSE." still resolves.
const BUTTONS_MARKER = /BUTTONS:\s*([A-Za-z_]+)[.!]?/gi;

/** Strips any "BUTTONS: <KEY>" marker(s) and resolves the first one against the catalog — same idiom as extractImageUrls. */
export function extractInteractivePrompt(text: string): { text: string; interactive?: InteractivePrompt } {
  const matches = [...text.matchAll(BUTTONS_MARKER)];
  const cleaned = text
    .replace(BUTTONS_MARKER, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!matches.length) return { text: cleaned };

  const key = matches[0][1].toUpperCase();
  const prompt = BUTTON_CATALOG[key];
  if (!prompt) {
    console.warn(`Anushka emitted an unknown BUTTONS key: "${key}"`);
    return { text: cleaned };
  }
  return { text: cleaned || prompt.fallbackBody, interactive: { buttons: prompt.buttons } };
}
