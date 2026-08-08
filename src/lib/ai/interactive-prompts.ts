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

export interface InteractivePrompt {
  buttons: { id: string; title: string }[];
}

const BUTTON_CATALOG: Record<string, InteractivePrompt> = {
  GUEST_COUNT: {
    buttons: [
      { id: "guests_1", title: "Just me" },
      { id: "guests_2", title: "2 guests" },
      { id: "guests_3plus", title: "3+ guests" },
    ],
  },
  ROOM_RESPONSE: {
    buttons: [
      { id: "room_book", title: "Book this room" },
      { id: "room_other", title: "See other options" },
      { id: "room_question", title: "I have a question" },
    ],
  },
};

const BUTTONS_LINE = /^BUTTONS:\s*(\S+)\s*$/gim;

/** Strips a "BUTTONS: <KEY>" marker line (if present) and resolves it against the catalog — same idiom as extractImageUrls. */
export function extractInteractivePrompt(text: string): { text: string; interactive?: InteractivePrompt } {
  const matches = [...text.matchAll(BUTTONS_LINE)];
  const cleaned = text.replace(BUTTONS_LINE, "").trim();
  if (!matches.length) return { text: cleaned };

  const key = matches[0][1].toUpperCase();
  const prompt = BUTTON_CATALOG[key];
  if (!prompt) {
    console.warn(`Anushka emitted an unknown BUTTONS key: "${key}"`);
    return { text: cleaned };
  }
  return { text: cleaned, interactive: prompt };
}
