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
// Also handled deterministically — a tap here has zero ambiguity (it always
// means "move to CLOSE"), so there's nothing for the AI to interpret. Live
// testing found a real failure mode when this was left to the AI: it
// sometimes fabricated a phone number and told the guest to call reception
// instead of using the established button flow at all. Fully sidestepped
// by never routing this tap through the AI in the first place.
export const ROOM_BOOK_BUTTON_ID = "room_book";
// Deliberately routed through the AI, not a deterministic short-circuit like
// SEE_OTHER_ROOMS — a guest tapping this always taps it right after Anushka
// named one specific room, so the conversation history alone already tells
// the model exactly which room's photos to send via the existing "IMAGE:
// <url>" mechanism (see PHOTOS in pipeline.ts). No new plumbing needed.
export const VIEW_PHOTOS_BUTTON_ID = "view_photos";

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
      { id: ROOM_BOOK_BUTTON_ID, title: "Book this room" },
      { id: SEE_OTHER_ROOMS_BUTTON_ID, title: "See other options" },
      { id: VIEW_PHOTOS_BUTTON_ID, title: "View photos" },
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
  GREET_MENU: {
    fallbackBody: "How can I help you today? 😊",
    buttons: [
      { id: "greet_book", title: "Book a room" },
      // Reuses the deterministic room-list handler (see SEE_OTHER_ROOMS_BUTTON_ID
      // in handle-inbound-message.ts) — same id, so tapping "View rooms" here
      // gets the exact same real-data List Message as tapping "See other
      // options" mid-RECOMMEND, no separate handling needed.
      { id: SEE_OTHER_ROOMS_BUTTON_ID, title: "View rooms" },
      { id: "greet_question", title: "Ask a question" },
    ],
  },
  DATE_QUICK_PICK: {
    fallbackBody: "When are you looking to stay? 📅",
    buttons: [
      { id: "dates_weekend", title: "This weekend" },
      { id: "dates_nextweek", title: "Next week" },
      { id: "dates_custom", title: "I'll type dates" },
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

// Live testing found a real UX consequence of ROOM_RESPONSE's ~50% marker
// miss rate on weaker/faster models: when the AI names a room's price but
// forgets the marker, the guest's only reply is a vague acknowledgement
// ("sounds good"), which the CLOSE-stage logic then reasonably reads as
// "ready to book" — skipping straight to BUTTONS: CONFIRM_BOOKING with no
// intermediate tap step. That reads as pushy/presumptuous to a guest who
// hasn't actually confirmed a room yet. ₹<amount>/night is the one
// observable signal that's true every single time a room gets named (it's
// the literal instruction in CONVERSATION FLOW's RECOMMEND step), so it's
// used as a deterministic fallback in generateReply() below: only kicks in
// when the AI's own marker decision-making produced nothing at all.
const ROOM_PRICE_PATTERN = /₹[\d,]+\s*\/\s*night/i;

export function mentionsRoomPrice(text: string): boolean {
  return ROOM_PRICE_PATTERN.test(text);
}

export function roomResponsePrompt(): InteractivePrompt {
  return { buttons: BUTTON_CATALOG.ROOM_RESPONSE.buttons };
}

export function guestCountPrompt(): InteractivePrompt {
  return { buttons: BUTTON_CATALOG.GUEST_COUNT.buttons };
}

export function confirmBookingPrompt(): InteractivePrompt {
  return { buttons: BUTTON_CATALOG.CONFIRM_BOOKING.buttons };
}

// A prompt-only "never recommend a room before you know guest count" rule
// had zero measurable effect in live testing (6/6 violations, unchanged
// from before the instruction was added) — the model's prior toward naming
// a room the moment it has dates+budget is too strong to prompt away. This
// is the code-level guarantee instead: guest-count phrases are varied
// enough (numbers, "just me", "family of 4", ...) that this can't be as
// precise as mentionsRoomPrice's fixed "₹.../night" format, so it's kept
// deliberately broad — false negatives (thinks count is unknown when it
// was given) just mean an extra GUEST_COUNT prompt the guest re-answers,
// which is mildly repetitive but harmless; false positives (thinks count
// is known when it wasn't) would defeat the whole point, so broad is the
// right way to err.
const GUEST_COUNT_STATED_PATTERN =
  /\b(\d+\+?\s*(guests?|people|persons?|pax|adults?)|just me\b|myself\b|solo\b|only me\b|family of \d+|we are \d+|there(?:'s| is) \d+ of us)/i;

export function hasStatedGuestCount(history: { role: string; content: string }[], latestGuestMessage: string): boolean {
  return [...history.filter((m) => m.role === "user").map((m) => m.content), latestGuestMessage].some((t) =>
    GUEST_COUNT_STATED_PATTERN.test(t)
  );
}

// Same "broad on purpose" reasoning as guest count — dates are phrased in
// far more ways than guest count is, so a narrow pattern would re-ask
// annoyingly often; a broad one occasionally skips the prompt when it
// technically could have fired, which is the safer failure direction here.
const DATE_STATED_PATTERN =
  /\b(weekend|tonight|tomorrow|today|next week|this week|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\s*[/-]\s*\d{1,2}|\d{1,2}(st|nd|rd|th)\b)/i;

export function hasStatedDates(history: { role: string; content: string }[], latestGuestMessage: string): boolean {
  return [...history.filter((m) => m.role === "user").map((m) => m.content), latestGuestMessage].some((t) =>
    DATE_STATED_PATTERN.test(t)
  );
}

// Devanagari (Hindi) and Telugu Unicode blocks — a guest typing in either
// script has unambiguously told us their language already, so LANGUAGE_SELECT
// would be redundant. A guest typing Hindi/Telugu in Latin/Roman script
// (e.g. "kya rate hai") is NOT caught by this and still gets offered the
// buttons — matching the original instruction's own "not already obvious"
// framing, since Roman-script Hinglish/Tenglish looks identical to English
// at the character level.
const NON_ENGLISH_SCRIPT_PATTERN = /[ऀ-ॿఀ-౿]/;

export function looksLikeObviousLanguage(text: string): boolean {
  return NON_ENGLISH_SCRIPT_PATTERN.test(text);
}

export function greetMenuPrompt(): InteractivePrompt {
  return { buttons: BUTTON_CATALOG.GREET_MENU.buttons };
}

export function dateQuickPickPrompt(): InteractivePrompt {
  return { buttons: BUTTON_CATALOG.DATE_QUICK_PICK.buttons };
}

// The single deterministic waterfall that decides which buttons (if any)
// accompany a reply — the real fix for "buttons should show up on nearly
// every message." Prompt-only BUTTONS DECISION logic proved unreliable
// across every stage tested this session (ROOM_RESPONSE ~50% miss,
// guest-count gate 0% compliance, LANGUAGE_SELECT occasional repeats), so
// this takes over as the primary decision-maker: it reads conversation
// STATE (what's already known) rather than trusting the model to remember
// a rule. The AI's own "BUTTONS: X" marker is now only a fallback for
// whatever this waterfall doesn't cover — most replies won't need it.
export function selectDeterministicInteractive(params: {
  isFirstReply: boolean;
  languageObvious: boolean;
  history: { role: string; content: string }[];
  guestMessage: string;
  replyText: string;
  aiInteractive?: InteractivePrompt;
}): InteractivePrompt | undefined {
  const { isFirstReply, languageObvious, history, guestMessage, replyText, aiInteractive } = params;

  if (isFirstReply) {
    return languageObvious ? greetMenuPrompt() : { buttons: BUTTON_CATALOG.LANGUAGE_SELECT.buttons };
  }
  if (!hasStatedGuestCount(history, guestMessage)) {
    return guestCountPrompt();
  }
  if (mentionsRoomPrice(replyText)) {
    return roomResponsePrompt();
  }
  // Checked before the dates nudge, not after: dates detection is
  // necessarily broad/imprecise (guests phrase dates far more ways than
  // guest counts), so if a room's already been discussed, prioritize
  // moving the guest toward confirming over risking a guest who's ready to
  // book getting stuck being asked for dates on a loop because their
  // phrasing didn't match the pattern.
  const roomMentionedEver = history.some((m) => m.role === "assistant" && mentionsRoomPrice(m.content)) || mentionsRoomPrice(replyText);
  if (roomMentionedEver) {
    return confirmBookingPrompt();
  }
  if (!hasStatedDates(history, guestMessage)) {
    return dateQuickPickPrompt();
  }
  return aiInteractive;
}
