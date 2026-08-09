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
    fallbackBody: "How many people will be staying? 😊",
    buttons: [
      { id: "guests_1", title: "Just me" },
      { id: "guests_2", title: "2 people" },
      { id: "guests_3plus", title: "3+ people" },
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
      { id: GREET_QUESTION_BUTTON_ID, title: "Ask a question" },
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
  // HANDLE OBJECTIONS was 100% free-text before this — a guest pushing back
  // on price got only prose, no tappable recovery path. Fires only after a
  // room's already been named (see resolveStageKey), reusing the two
  // already-deterministic handlers below rather than inventing new ones.
  PRICE_OBJECTION: {
    fallbackBody: "No worries — want a more budget-friendly option, or to see our current offers? 😊",
    buttons: [
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
    fallbackBody: "Anything else I can help with?",
    buttons: [
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
  return { buttons: BUTTON_CATALOG.ROOM_RESPONSE.buttons };
}

export function guestCountPrompt(): InteractivePrompt {
  return { buttons: BUTTON_CATALOG.GUEST_COUNT.buttons };
}

export function confirmBookingPrompt(): InteractivePrompt {
  return { buttons: BUTTON_CATALOG.CONFIRM_BOOKING.buttons };
}

export function postBookingPrompt(): InteractivePrompt {
  return { buttons: BUTTON_CATALOG.POST_BOOKING.buttons };
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

  if (isFirstReply || looksLikeBareGreeting(guestMessage)) {
    return languageObvious ? "GREET_MENU" : "LANGUAGE_SELECT";
  }
  return null;
}

function promptForStageKey(key: StageKey): InteractivePrompt | undefined {
  switch (key) {
    case "LANGUAGE_SELECT":
      return { buttons: BUTTON_CATALOG.LANGUAGE_SELECT.buttons };
    case "GREET_MENU":
      return greetMenuPrompt();
    case "GUEST_COUNT":
      return guestCountPrompt();
    case "ROOM_RESPONSE":
      return roomResponsePrompt();
    case "PRICE_OBJECTION":
      return { buttons: BUTTON_CATALOG.PRICE_OBJECTION.buttons };
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
    return "If you recommend a specific room with its price in this reply, Book this room / See other options / View photos buttons will automatically appear underneath — end the reply right after naming the room, don't also ask a follow-up question in the same message.";
  }

  const key = resolveStageKey({ ...params, replyText: "" });
  switch (key) {
    case "LANGUAGE_SELECT":
      return "This is the guest's very first message. English / हिंदी / తెలుగు language-selection buttons will automatically appear under your reply — don't ask which language they prefer yourself, just write your normal short opener.";
    case "GREET_MENU":
      return "This is the guest's very first message and their language is already clear from how they wrote. \"Book a room\" / \"View rooms\" / \"Ask a question\" buttons will automatically appear under your reply — keep your opener short and don't ask an open question yourself, the buttons already are the question.";
    case "GUEST_COUNT":
      return "This reply's job: move toward learning how many people will be staying. \"Just me\" / \"2 people\" / \"3+ people\" buttons will automatically appear under your reply — a brief version of that question in your own words is fine (or skip it, the buttons cover it), but don't ask about dates or anything else in this same reply.";
    case "DATE_QUICK_PICK":
      return "This reply's job: move toward learning their dates. \"This weekend\" / \"Next week\" / \"I'll type dates\" buttons will automatically appear under your reply — a brief version of that question in your own words is fine (or skip it, the buttons cover it), but don't ask anything else in this same reply.";
    case "PRICE_OBJECTION":
      return "See cheaper room / Show me offers / Continue anyway buttons will automatically appear under your reply. If the hotel's own \"Additional instructions from the hotel\" section above mentions a real competitive edge, lead with that specific point now — it's usually the single most persuasive thing you can say at this exact moment, not generic reassurance.";
    case "CONFIRM_BOOKING":
      return "Confirm booking / Not yet buttons will automatically appear under your reply. Write a short, warm closing line, not a new question — mention that tapping instantly gives them a real reference code to quote at check-in, with nothing to pay right now (pay at the counter when they arrive), so they know what tapping actually does. Never claim the booking is confirmed or give out a reference number yourself, only the tap does that.";
    default:
      // Nothing predictable — either no booking interest shown yet (plain
      // open chat) or genuinely nothing else applies; write normally.
      return "";
  }
}
