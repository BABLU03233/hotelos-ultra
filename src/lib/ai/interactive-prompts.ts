import { currentHourIST } from "@/lib/india-time";

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
// Handled deterministically — sends a real DB list of active offers, same
// "don't trust a free-tier model to relay real data a second time" reasoning
// as SEE_OTHER_ROOMS_BUTTON_ID.
export const SHOW_OFFERS_BUTTON_ID = "show_offers";
// GREET_MENU's third option — promoted from an inline literal to a named
// export because handle-inbound-message.ts now routes this deterministically
// too (shows the tenant's real FAQ list instead of free-texting through the AI).
export const GREET_QUESTION_BUTTON_ID = "greet_question";

// WhatsApp reply-buttons always render a small reply-arrow icon next to
// every button — a hard, universal platform UI detail (every business,
// every button, no exceptions; not something the Cloud API exposes any
// control over). List Messages render as a bottom-sheet menu instead,
// without that icon, at the cost of one extra tap (open the list, then
// pick) versus a reply-button being immediately tappable inline. Guest
// explicitly chose that trade for GUEST_COUNT/DATE_QUICK_PICK specifically
// (the two most cosmetically-visible, least business-critical stages);
// every other stage stays instant-tap buttons.
export type InteractivePrompt =
  | { type: "buttons"; buttons: { id: string; title: string }[] }
  | { type: "list"; buttonText: string; rows: { id: string; title: string; description?: string }[] };

type CatalogEntry =
  | { type: "buttons"; fallbackBody: string; buttons: { id: string; title: string }[] }
  | { type: "list"; fallbackBody: string; buttonText: string; rows: { id: string; title: string; description?: string }[] };

function catalogToPrompt(entry: CatalogEntry): InteractivePrompt {
  return entry.type === "list"
    ? { type: "list", buttonText: entry.buttonText, rows: entry.rows }
    : { type: "buttons", buttons: entry.buttons };
}

// fallbackBody: WhatsApp's interactive API requires non-empty body text —
// live testing showed the AI sometimes emits a bare "BUTTONS: KEY" line
// with no sentence in front of it (nothing left to strip after removing the
// marker), which would otherwise reach Meta as an empty body and fail to
// send. Used only when the AI's own text is empty/whitespace.
const BUTTON_CATALOG: Record<string, CatalogEntry> = {
  GUEST_COUNT: {
    type: "list",
    fallbackBody: "How many people will be staying? 😊",
    buttonText: "Choose",
    rows: [
      { id: "guests_1", title: "Just me" },
      { id: "guests_2", title: "2 people" },
      { id: "guests_3plus", title: "3+ people" },
    ],
  },
  ROOM_RESPONSE: {
    type: "list",
    fallbackBody: "Would you like to go ahead with this room?",
    buttonText: "Choose",
    rows: [
      { id: ROOM_BOOK_BUTTON_ID, title: "Book this room" },
      { id: SEE_OTHER_ROOMS_BUTTON_ID, title: "See other options" },
      { id: VIEW_PHOTOS_BUTTON_ID, title: "View photos" },
    ],
  },
  // The actual booking-commitment tap -- converted to a list too per
  // explicit user request (no arrow anywhere, even here), accepting the
  // one extra tap (open the list, then pick) at the highest-stakes moment
  // in the whole flow.
  CONFIRM_BOOKING: {
    type: "list",
    fallbackBody: "Ready to confirm your booking? 🎉",
    buttonText: "Confirm",
    rows: [
      { id: CONFIRM_BOOKING_BUTTON_ID, title: "Confirm booking" },
      { id: "not_yet", title: "Not yet" },
    ],
  },
  LANGUAGE_SELECT: {
    type: "list",
    fallbackBody: "Which language would you like to chat in? 😊",
    buttonText: "Select language",
    rows: [
      { id: "lang_en", title: "English" },
      { id: "lang_hi", title: "हिंदी" },
      { id: "lang_te", title: "తెలుగు" },
    ],
  },
  GREET_MENU: {
    type: "list",
    fallbackBody: "How may I help you today? 😊",
    buttonText: "Choose",
    rows: [
      { id: "greet_book", title: "I want to book a room", description: "Tell us your dates and party size" },
      // Reuses the deterministic room-list handler (see SEE_OTHER_ROOMS_BUTTON_ID
      // in handle-inbound-message.ts) — same id, so tapping this row here
      // gets the exact same real-data List Message as tapping "See other
      // options" mid-RECOMMEND, no separate handling needed.
      { id: SEE_OTHER_ROOMS_BUTTON_ID, title: "Availability & price", description: "See our real rooms and rates" },
      { id: GREET_QUESTION_BUTTON_ID, title: "I need more details", description: "Check-in, parking, policies & more" },
    ],
  },
  DATE_QUICK_PICK: {
    type: "list",
    // Deliberately no 📅/🗓️ emoji here or anywhere else guest-facing dates
    // are discussed — live-reported issue: on some phones' emoji font, the
    // calendar emoji's own artwork prints an arbitrary unrelated date (e.g.
    // "FEB 24") right onto the glyph, which reads as a real, wrong date in
    // exactly the one context where that's most confusing and least
    // forgivable (see pipeline.ts's TONE section for the same rule applied
    // to the AI's own emoji choices).
    fallbackBody: "When are you looking to stay?",
    buttonText: "Choose dates",
    rows: [
      { id: "dates_weekend", title: "This weekend" },
      { id: "dates_nextweek", title: "Next week" },
      { id: "dates_custom", title: "I'll type dates" },
    ],
  },
  // HANDLE OBJECTIONS was 100% free-text before this — a guest pushing back
  // on price got only prose, no tappable recovery path. Fires only after a
  // room's already been named (see resolveStageKey), reusing the two
  // already-deterministic handlers below rather than inventing new ones.
  PRICE_OBJECTION: {
    type: "list",
    fallbackBody: "No worries — want a more budget-friendly option, or to see our current offers? 😊",
    buttonText: "Choose",
    rows: [
      { id: SEE_OTHER_ROOMS_BUTTON_ID, title: "See cheaper room" },
      { id: SHOW_OFFERS_BUTTON_ID, title: "Show me offers" },
      { id: "continue_anyway", title: "Continue anyway" },
    ],
  },
  // Sent directly by the CONFIRM_BOOKING_BUTTON_ID handler in
  // handle-inbound-message.ts, never through the AI/waterfall — that reply
  // (the reference code) is never AI-generated. Closes the one moment in the
  // whole flow that used to send as plain text with zero buttons.
  POST_BOOKING: {
    type: "list",
    fallbackBody: "Anything else I can help with?",
    buttonText: "Choose",
    rows: [
      { id: "post_booking_question", title: "I have a question" },
      { id: "post_booking_done", title: "All set, thanks!" },
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
  const entry = BUTTON_CATALOG[key];
  if (!entry) {
    console.warn(`Anushka emitted an unknown BUTTONS key: "${key}"`);
    return { text: cleaned };
  }
  return { text: cleaned || entry.fallbackBody, interactive: catalogToPrompt(entry) };
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
// Real production data caught this too: the AI phrases this as often as
// "₹1,299 per night" as it does "₹1,299/night", and the old pattern only
// matched the slash form — silently missing roughly half of real room
// recommendations and cascading into every check that depends on it
// (roomMentionedEver, hasExpressedBookingIntent, the CONFIRM_BOOKING
// trigger). Both phrasings now match.
const ROOM_PRICE_PATTERN = /₹[\d,]+\s*(\/|\bper\b)\s*night/i;

export function mentionsRoomPrice(text: string): boolean {
  return ROOM_PRICE_PATTERN.test(text);
}

// Covers price pushback AND offer/discount interest in one pattern — the two
// overlap in practice ("that's expensive, any discount?") and the same
// recovery buttons (cheaper room / see offers / continue anyway) serve both,
// so there's no value in two separate detectors here.
const PRICE_OR_OFFER_PATTERN =
  /\b(expensive|costly|too much|pricey|discount|cheaper|lower price|any offers?|promo(tion)?s?|any deals?|coupon)\b/i;

export function looksLikePriceOrOfferSignal(text: string): boolean {
  return PRICE_OR_OFFER_PATTERN.test(text);
}

export function roomResponsePrompt(): InteractivePrompt {
  return catalogToPrompt(BUTTON_CATALOG.ROOM_RESPONSE);
}

export function guestCountPrompt(): InteractivePrompt {
  return catalogToPrompt(BUTTON_CATALOG.GUEST_COUNT);
}

export function confirmBookingPrompt(): InteractivePrompt {
  return catalogToPrompt(BUTTON_CATALOG.CONFIRM_BOOKING);
}

export function postBookingPrompt(): InteractivePrompt {
  return catalogToPrompt(BUTTON_CATALOG.POST_BOOKING);
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
// "for N" (e.g. "a room for 2") is a real, common phrasing live testing
// caught this pattern missing — added with a negative lookahead so "for 2
// nights/days" (a duration, not a headcount) doesn't false-positive.
const GUEST_COUNT_STATED_PATTERN =
  /\b(\d+\+?\s*(guests?|people|persons?|pax|adults?)|for \d+\+?(?!\s*(nights?|days?|hours?))\b|just me\b|myself\b|solo\b|only me\b|family of \d+|we are \d+|there(?:'s| is) \d+ of us)/i;

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

// Live testing surfaced a real problem: the guest-count gate fired on the
// very next message after "Hi" regardless of what the guest actually said —
// even idle small talk or an unrelated question got railroaded straight
// into "how many guests?" That reads as robotic, not helpful. This gate
// requires the guest to have shown SOME sign of booking interest (a
// booking-related keyword, or already having stated guest count/dates
// directly) before the funnel-style prompts (GUEST_COUNT, DATE_QUICK_PICK)
// kick in at all — before that, replies fall through to whatever the AI
// itself decides (usually nothing, i.e. a normal conversational reply),
// giving room for a genuine "how can I help" exchange first.
const BOOKING_INTENT_PATTERN =
  /\b(book(ing)?|room|stay(ing)?|available|availability|vacan(t|cy)|reserve|reservation|rate|price|cost|check-?in|check-?out|accommodation|offers?|discounts?|deals?|promos?|coupons?)\b/i;

// Real production conversation caught this: it only scanned the GUEST's own
// words, but a real guest keeps replying in short, contentless
// acknowledgements ("Yeah", "S", "ok") once a conversation is already
// underway — none of which ever match a keyword — while the whole
// conversation is unmistakably about booking from the ASSISTANT's side
// (naming rooms, sending photos, asking about dates). That mismatch
// silently killed the intent gate deep into a real booking flow, well past
// the "is this even the right stage" question this gate exists to answer.
// Scanning assistant messages too fixes it without reopening the earlier
// bug this gate was built to fix — a bare "Hi! I'm Anushka, what brings you
// here?" greeting doesn't contain any of these keywords either, so it still
// doesn't trigger the funnel prematurely.
export function hasExpressedBookingIntent(history: { role: string; content: string }[], latestGuestMessage: string): boolean {
  const allTexts = [...history.map((m) => m.content), latestGuestMessage];
  return (
    allTexts.some((t) => BOOKING_INTENT_PATTERN.test(t)) ||
    hasStatedGuestCount(history, latestGuestMessage) ||
    hasStatedDates(history, latestGuestMessage)
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

// Real production data caught this: isFirstReply is true exactly once per
// contact, ever (see ReplyContext) — but a guest re-testing or re-engaging
// often just types "Hi" again, expecting a fresh start, and got zero
// buttons at all once they were no longer a first-time contact. A bare
// greeting with nothing else in it is a strong, unambiguous signal to
// treat as "start the greeting flow" regardless of isFirstReply.
const BARE_GREETING_PATTERN = /^(hi+|hello+|hey+|hii+|namaste|hola)[\s!.,]*$/i;

export function looksLikeBareGreeting(text: string): boolean {
  return BARE_GREETING_PATTERN.test(text.trim());
}

// DATE_QUICK_PICK's own "I'll type dates" button — a guest tapping it (or
// typing the same phrase back) is explicitly declining the date buttons in
// favor of typing a real date next, so re-showing the same three buttons
// on the very next reply would be exactly the redundant loop this is
// meant to prevent.
const DECLINED_DATE_QUICK_PICK_PATTERN = /^i'?ll type dates$/i;

function declinedDateQuickPick(text: string): boolean {
  return DECLINED_DATE_QUICK_PICK_PATTERN.test(text.trim());
}

// A real gap found tracing the full button journey end-to-end: tapping a
// LANGUAGE_SELECT button (its content becomes the guest's message, e.g.
// "English") isn't a bare greeting and isn't first-reply anymore (that already
// fired to show LANGUAGE_SELECT itself), and has no booking-intent keyword —
// so with no special case, the very next reply fell through to "null" (no
// buttons at all), a dead end right after the first tap in the whole funnel.
// A guest just told us their language explicitly, which is a *more*
// certain signal than the general "obvious from script" heuristic
// (languageObvious only catches Devanagari/Telugu script, so it'd stay
// false even right after tapping "English"), so this always moves straight
// to GREET_MENU rather than re-asking or falling silent.
const LANGUAGE_SELECTED_PATTERN = /^(english|हिंदी|తెలుగు)$/i;

function looksLikeLanguageSelection(text: string): boolean {
  return LANGUAGE_SELECTED_PATTERN.test(text.trim());
}

export function greetMenuPrompt(): InteractivePrompt {
  return catalogToPrompt(BUTTON_CATALOG.GREET_MENU);
}

export function dateQuickPickPrompt(): InteractivePrompt {
  return catalogToPrompt(BUTTON_CATALOG.DATE_QUICK_PICK);
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
  const key = resolveStageKey(params);
  return key ? promptForStageKey(key) : params.aiInteractive;
}

type StageKey =
  | "LANGUAGE_SELECT"
  | "GREET_MENU"
  | "GUEST_COUNT"
  | "ROOM_RESPONSE"
  | "PRICE_OBJECTION"
  | "CONFIRM_BOOKING"
  | "DATE_QUICK_PICK"
  | null;

function resolveStageKey(params: {
  isFirstReply: boolean;
  languageObvious: boolean;
  history: { role: string; content: string }[];
  guestMessage: string;
  replyText: string;
}): StageKey {
  const { isFirstReply, languageObvious, history, guestMessage, replyText } = params;

  const roomMentionedEver = history.some((m) => m.role === "assistant" && mentionsRoomPrice(m.content)) || mentionsRoomPrice(replyText);
  const intentShown = hasExpressedBookingIntent(history, guestMessage) || roomMentionedEver;

  // Content-based stages are checked BEFORE the first-reply language check,
  // not after — a real bug found live: a guest's very first message is
  // often already information-rich ("Hi, 2 guests, want a room this
  // weekend"), and forcing LANGUAGE_SELECT buttons over a reply that just
  // recommended a specific room (or asked for guest count) was a severe
  // text/button mismatch. Language-select is now the *fallback* for a
  // first reply with nothing more specific to say, not an override.
  if (intentShown) {
    if (!hasStatedGuestCount(history, guestMessage)) {
      return "GUEST_COUNT";
    }
    if (mentionsRoomPrice(replyText)) {
      return "ROOM_RESPONSE";
    }
    // Only fires post-recommendation — pre-recommendation, a price/offer
    // question just falls through to the AI's normal (already grounded)
    // prose reply below, no special-casing needed there.
    if (roomMentionedEver && looksLikePriceOrOfferSignal(guestMessage)) {
      return "PRICE_OBJECTION";
    }
    // Checked before the dates nudge, not after: dates detection is
    // necessarily broad/imprecise (guests phrase dates far more ways than
    // guest counts), so if a room's already been discussed, prioritize
    // moving the guest toward confirming over risking a guest who's ready
    // to book getting stuck being asked for dates on a loop because their
    // phrasing didn't match the pattern.
    if (roomMentionedEver) {
      return "CONFIRM_BOOKING";
    }
    if (!hasStatedDates(history, guestMessage) && !declinedDateQuickPick(guestMessage)) {
      return "DATE_QUICK_PICK";
    }
  }

  if (looksLikeLanguageSelection(guestMessage)) {
    return "GREET_MENU";
  }
  if (isFirstReply || looksLikeBareGreeting(guestMessage)) {
    return languageObvious ? "GREET_MENU" : "LANGUAGE_SELECT";
  }
  return null;
}

function promptForStageKey(key: StageKey): InteractivePrompt | undefined {
  switch (key) {
    case "LANGUAGE_SELECT":
      return catalogToPrompt(BUTTON_CATALOG.LANGUAGE_SELECT);
    case "GREET_MENU":
      return greetMenuPrompt();
    case "GUEST_COUNT":
      return guestCountPrompt();
    case "ROOM_RESPONSE":
      return roomResponsePrompt();
    case "PRICE_OBJECTION":
      return catalogToPrompt(BUTTON_CATALOG.PRICE_OBJECTION);
    case "CONFIRM_BOOKING":
      return confirmBookingPrompt();
    case "DATE_QUICK_PICK":
      return dateQuickPickPrompt();
    default:
      return undefined;
  }
}

/**
 * The mismatch that made buttons feel "bolted on"/robotic: buttons were
 * decided purely from state, entirely independent of what the AI actually
 * wrote, so a reply could ask about dates while ROOM_RESPONSE buttons
 * showed underneath, or vice versa. Most of the waterfall's state (guest
 * count known?, dates known?, has a room come up before?) is knowable
 * *before* calling the AI — only "does THIS reply name a room" genuinely
 * depends on what the AI is about to write. So the predictable stages are
 * computed pre-call (passing "" as replyText, same resolver as the real
 * decision) and turned into a short, explicit instruction for buildSystemPrompt
 * to inject — telling the AI what this specific reply's job is, so the
 * text it writes actually leads into whichever buttons will appear, instead
 * of the two drifting apart. Returns "" for the cases that can't be
 * predicted (no booking interest yet -> normal open chat; or enough is
 * already known that the AI might recommend a room this turn -> its own
 * judgment call, same as before).
 */
export function predictedStageInstruction(params: {
  isFirstReply: boolean;
  languageObvious: boolean;
  history: { role: string; content: string }[];
  guestMessage: string;
}): string {
  // Checked first, regardless of isFirstReply or what the resolver below
  // would otherwise predict: if guest count and dates are already both
  // known (a guest's very first message is often this information-rich —
  // "Hi, 2 guests, want a room this weekend" — so this is NOT only a
  // later-turn case), the AI is likely to recommend a room this reply,
  // which the pre-call resolver can never predict (replyText is empty at
  // this point). Without this check first, a rich first message would
  // wrongly get the LANGUAGE_SELECT/GREET_MENU instruction predicted below
  // even though the final buttons (decided post-hoc, once real replyText
  // exists) would actually be ROOM_RESPONSE — the exact mismatch this
  // whole mechanism exists to prevent.
  const readyToRecommend =
    hasStatedGuestCount(params.history, params.guestMessage) &&
    hasStatedDates(params.history, params.guestMessage) &&
    !params.history.some((m) => m.role === "assistant" && mentionsRoomPrice(m.content));
  if (readyToRecommend) {
    return "If you recommend a specific room with its price in this reply, a Book this room / See other options / View photos picker will automatically appear underneath — end the reply right after naming the room, don't also ask a follow-up question in the same message.";
  }

  const key = resolveStageKey({ ...params, replyText: "" });
  switch (key) {
    case "LANGUAGE_SELECT":
      return "This is the guest's very first message. An English / हिंदी / తెలుగు language-selection picker will automatically appear under your reply — don't ask which language they prefer yourself, just write your normal short opener.";
    case "GREET_MENU":
      return "This is the guest's very first message and their language is already clear from how they wrote. An \"I want to book a room\" / \"Availability & price\" / \"I need more details\" picker will automatically appear under your reply — keep your opener short and don't ask an open question yourself, the picker already is the question.";
    case "GUEST_COUNT":
      return "This reply's job: move toward learning how many people will be staying. A \"Just me\" / \"2 people\" / \"3+ people\" picker will automatically appear under your reply — a brief version of that question in your own words is fine (or skip it, the picker covers it), but don't ask about dates or anything else in this same reply.";
    case "DATE_QUICK_PICK":
      return "This reply's job: move toward learning their dates. A \"This weekend\" / \"Next week\" / \"I'll type dates\" picker will automatically appear under your reply — a brief version of that question in your own words is fine (or skip it, the picker covers it), but don't ask anything else in this same reply.";
    case "PRICE_OBJECTION":
      return "A See cheaper room / Show me offers / Continue anyway picker will automatically appear under your reply. If the hotel's own \"Additional instructions from the hotel\" section above mentions a real competitive edge, lead with that specific point now — it's usually the single most persuasive thing you can say at this exact moment, not generic reassurance.";
    case "CONFIRM_BOOKING":
      return "A Confirm booking / Not yet picker will automatically appear under your reply. Write a short, warm closing line, not a new question — mention that tapping instantly gives them a real reference code to quote at check-in, with nothing to pay right now (pay at the counter when they arrive), so they know what tapping actually does. Never claim the booking is confirmed or give out a reference number yourself, only the tap does that.";
    default:
      // Nothing predictable — either no booking interest shown yet (plain
      // open chat) or genuinely nothing else applies; write normally.
      return "";
  }
}

// Stages where the next message is 100% predictable AND needs zero real
// judgment (not "which room should I recommend" -- that's genuine synthesis
// over real DB data; not "what did the guest actually ask" -- that's a real
// question needing a real answer). Deliberately excludes GREET_MENU here:
// that's already fully deterministic via a dedicated per-language
// short-circuit in handle-inbound-message.ts (lang_en/hi/te taps produce a
// real, language-correct greeting each), and the rarer "guest's very first
// message already in Hindi/Telugu script" path is left to the AI --
// hand-writing guaranteed-correct non-English text for every stage below
// carries real risk this session hasn't validated the way the handful of
// existing hardcoded multilingual strings were.
const DETERMINISTIC_STAGE_KEYS: ReadonlySet<Exclude<StageKey, null>> = new Set([
  "LANGUAGE_SELECT",
  "GUEST_COUNT",
  "DATE_QUICK_PICK",
  "CONFIRM_BOOKING",
  "PRICE_OBJECTION",
]);

function timeOfDayGreeting(now: Date): string {
  // Real live bug: the server runs in UTC, but every guest is in India --
  // now.getHours() returned the SERVER's hour, not India's (confirmed live:
  // 8:32am UTC = 2:02pm IST said "Good morning!"). See india-time.ts.
  const hour = currentHourIST(now);
  if (hour < 12) return "Good morning!";
  if (hour < 17) return "Good afternoon!";
  return "Good evening!";
}

/**
 * Closes the exact class of bug found live twice in production: a weak
 * fallback model writes free text that ignores its own predicted-stage
 * instruction (e.g. asking about dates right under a language-selection
 * list, or asking about rooms right under a "how many guests" list) while
 * the waterfall still -- correctly -- attaches the predicted list
 * underneath, a guaranteed text/button mismatch the guest sees as
 * "irrelevant options." For the stages in DETERMINISTIC_STAGE_KEYS, skip
 * AI text-generation entirely and send a fixed, code-owned reply instead --
 * deterministic wins, the same principle the rest of this waterfall
 * already runs on. Returns null wherever the AI genuinely still has to
 * write something real (recommending a specific room, answering an actual
 * question, or a non-English-appearing conversation -- see
 * DETERMINISTIC_STAGE_KEYS's comment).
 */
export function resolveDeterministicReply(params: {
  isFirstReply: boolean;
  languageObvious: boolean;
  history: { role: string; content: string }[];
  guestMessage: string;
  hotelName?: string;
  now?: Date;
}): { text: string; interactive: InteractivePrompt } | null {
  if (params.languageObvious) return null;

  const readyToRecommend =
    hasStatedGuestCount(params.history, params.guestMessage) &&
    hasStatedDates(params.history, params.guestMessage) &&
    !params.history.some((m) => m.role === "assistant" && mentionsRoomPrice(m.content));
  if (readyToRecommend) return null;

  const key = resolveStageKey({ ...params, replyText: "" });
  if (!key || !DETERMINISTIC_STAGE_KEYS.has(key)) return null;

  const entry = BUTTON_CATALOG[key];
  let text: string;
  if (key === "LANGUAGE_SELECT") {
    const greeting = timeOfDayGreeting(params.now ?? new Date());
    const from = params.hotelName ? ` from ${params.hotelName}` : "";
    text = `${greeting} 😊 This is Anushka${from} — thank you for reaching out! Which language are you comfortable in?`;
  } else if (key === "CONFIRM_BOOKING") {
    text = "Great, glad that works for you! 🎉 Tap Confirm booking below and I'll get you an instant reference code — pay at the counter when you arrive!";
  } else {
    text = entry.fallbackBody;
  }

  return { text, interactive: catalogToPrompt(entry) };
}
