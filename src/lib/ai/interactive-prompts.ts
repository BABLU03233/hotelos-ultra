import { GuestLanguage, isGuestLanguage, resolveLanguage, t } from "@/lib/i18n/guest-language";
import { currentHourIST } from "@/lib/india-time";
import { guestDateLooksPast } from "./date-safety";
import { parseExplicitDate } from "@/lib/booking/explicit-date";

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

/**
 * "Where are you?" — answered with a real WhatsApp location pin.
 *
 * A Google Maps URL makes the guest leave the chat, wait for a browser, clear
 * a consent screen, then hand off to a map app. A location message opens
 * straight in whatever maps app they already have, with a Directions button,
 * without leaving WhatsApp. The hotel's pin comes from HotelProfile.lat/lng
 * (see settings/location-setting.tsx).
 */
export const SHOW_LOCATION_BUTTON_ID = "show_location";

/** The party-size row for a corporate/group enquiry — see GROUP_ROOMS below. */
export const GROUP_BOOKING_BUTTON_ID = "guests_group";

/**
 * "Call us" — replies with the hotel's number as plain text.
 *
 * WhatsApp linkifies a phone number in message text, so tapping it opens the
 * dialer with the number already filled. Deliberately NOT a cta_url button:
 * those only accept http(s), so a tel: link there is silently dropped.
 */
export const CALL_US_BUTTON_ID = "call_us";

/** How many rooms a group needs. Answered, then handed to a person. */
export const GROUP_ROOM_BUTTON_IDS = ["group_rooms_3_5", "group_rooms_6_10", "group_rooms_10plus"] as const;

/** The room-count question shown after "Group / corporate". */
export function groupRoomsPrompt(lang?: GuestLanguage | null): InteractivePrompt {
  const s = t(resolveLanguage(lang));
  return {
    type: "list",
    buttonText: s.chooseButton,
    rows: [
      { id: "group_rooms_3_5", title: s.rooms3to5 },
      { id: "group_rooms_6_10", title: s.rooms6to10 },
      { id: "group_rooms_10plus", title: s.rooms10plus },
    ],
  };
}

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
/**
 * Party size behind each GUEST_COUNT row, keyed by the row's stable id.
 *
 * A tap arrives as its title text ("3+ people"), which the text extractor
 * can read — but only for as long as nobody rewords a title, and a reworded
 * title would break capture silently, with the only symptom being guests
 * getting re-asked their party size again. The id is the durable contract,
 * so the tap is resolved from it directly (mirroring how the DATE_QUICK_PICK
 * rows resolve to real dates by id in handle-inbound-message.ts) and the
 * text extractor is left to handle genuinely typed messages.
 *
 * "3+ people" can only be its floor of 3 — see captureGuestCount for why a
 * later explicit correction is deliberately allowed to overwrite it.
 */
export const GUEST_COUNT_BUTTON_VALUES: Readonly<Record<string, number>> = {
  guests_1: 1,
  guests_2: 2,
  guests_3plus: 3,
};

/**
 * The button catalog, rendered in the guest's chosen language.
 *
 * This was a flat constant of English strings, which quietly made the
 * language picker cosmetic: tapping "हिंदी" produced one Hindi greeting and
 * then every button — and every deterministic reply, which is most of them —
 * came back in English. Built per-language now, so a choice actually governs
 * the whole conversation.
 *
 * Row IDS are deliberately unchanged across languages. Every downstream
 * decision (which room, how many guests, which date) resolves from the id,
 * never the title, so translating titles cannot break routing — the exact
 * property that made this refactor safe to do at all.
 */
function buildCatalog(lang: GuestLanguage): Record<string, CatalogEntry> {
  const s = t(lang);
  return {
    GUEST_COUNT: {
      type: "list",
      fallbackBody: s.guestCountBody,
      buttonText: s.chooseButton,
      rows: [
        { id: "guests_1", title: s.guestJustMe },
        { id: "guests_2", title: s.guest2 },
        { id: "guests_3plus", title: s.guest3Plus },
        // A corporate block is a different sale from a bigger family, and the
        // old buttons made a company booking eight rooms answer "3+ people" —
        // after which the funnel offered them a single room.
        { id: GROUP_BOOKING_BUTTON_ID, title: s.guestGroup },
      ],
    },
    ROOM_RESPONSE: {
      type: "list",
      fallbackBody: s.roomResponseBody,
      buttonText: s.chooseButton,
      rows: [
        { id: ROOM_BOOK_BUTTON_ID, title: s.roomBook },
        { id: SEE_OTHER_ROOMS_BUTTON_ID, title: s.roomOther },
        { id: VIEW_PHOTOS_BUTTON_ID, title: s.roomPhotos },
      ],
    },
    // The actual booking-commitment tap -- converted to a list too per
    // explicit user request (no arrow anywhere, even here), accepting the
    // one extra tap (open the list, then pick) at the highest-stakes moment
    // in the whole flow.
    CONFIRM_BOOKING: {
      type: "list",
      fallbackBody: s.confirmBody,
      buttonText: s.confirmButton,
      rows: [
        { id: CONFIRM_BOOKING_BUTTON_ID, title: s.confirmYes },
        { id: "not_yet", title: s.confirmNotYet },
      ],
    },
    // Never translated: this is the picker that ASKS which language, so it
    // has to be legible before one has been chosen. Each row is written in
    // the language it selects.
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
      fallbackBody: s.greetMenuBody,
      buttonText: s.chooseButton,
      rows: [
        { id: "greet_book", title: s.greetBook },
        // Reuses the deterministic room-list handler (see SEE_OTHER_ROOMS_BUTTON_ID
        // in handle-inbound-message.ts) — same id, so tapping this row here
        // gets the exact same real-data List Message as tapping "See other
        // options" mid-RECOMMEND, no separate handling needed.
        { id: SEE_OTHER_ROOMS_BUTTON_ID, title: s.greetAvailability, description: s.greetAvailabilityDesc },
        { id: GREET_QUESTION_BUTTON_ID, title: s.greetQuestion, description: s.greetQuestionDesc },
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
      fallbackBody: s.datesBody,
      buttonText: s.datesButton,
      rows: [
        { id: "dates_today", title: s.dateToday },
        { id: "dates_tomorrow", title: s.dateTomorrow },
        { id: "dates_weekend", title: s.dateWeekend },
        { id: "dates_nextweek", title: s.dateNextWeek },
        // Renamed from "I'll type dates": tapping this used to fall through to
        // the AI as free text (a dead end for a guest who wanted a specific
        // day), and now opens a real tappable date picker — see
        // date-picker-message.ts. The id is unchanged so nothing downstream
        // has to care.
        { id: "dates_custom", title: s.dateExact },
      ],
    },
    // HANDLE OBJECTIONS was 100% free-text before this — a guest pushing back
    // on price got only prose, no tappable recovery path. Fires only after a
    // room's already been named (see resolveStageKey), reusing the two
    // already-deterministic handlers below rather than inventing new ones.
    PRICE_OBJECTION: {
      type: "list",
      fallbackBody: s.priceObjectionBody,
      buttonText: s.chooseButton,
      rows: [
        { id: SEE_OTHER_ROOMS_BUTTON_ID, title: s.priceCheaper },
        { id: SHOW_OFFERS_BUTTON_ID, title: s.priceOffers },
        { id: "continue_anyway", title: s.priceContinue },
      ],
    },
    // Sent directly by the CONFIRM_BOOKING_BUTTON_ID handler in
    // handle-inbound-message.ts, never through the AI/waterfall — that reply
    // (the reference code) is never AI-generated. Closes the one moment in the
    // whole flow that used to send as plain text with zero buttons.
    POST_BOOKING: {
      type: "list",
      fallbackBody: s.postBookingBody,
      buttonText: s.chooseButton,
      rows: [
        { id: "post_booking_question", title: s.postBookingQuestion },
        { id: "post_booking_done", title: s.postBookingDone },
      ],
    },
  };
}

/** English catalog — the shape-only reference used where language is irrelevant (e.g. the AI's BUTTONS: marker lookup). */
const BUTTON_CATALOG = buildCatalog("en");


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
//
// Live-caught a second, more serious variant of the same gap: a Telugu
// reply named a room's price as "రూ. 1599 నుండి ప్రారంభమవుతుంది" -- neither
// the ₹ symbol nor any "/night"/"per night" anchor survived translation.
// This confused the whole downstream state machine badly enough that the
// very next turn hallucinated a guest's genuinely future date as "already
// passed" with zero recovery buttons attached -- the exact class of bug the
// DATES rule in pipeline.ts calls out as serious, just reached through a
// missed price detection instead of a misread guest date. The primary fix
// is a system-prompt rule mandating the literal "₹<amount>/night" format
// verbatim in every language (see pipeline.ts's RULES section), but a live
// re-test (3 identical Telugu attempts, same conversation) found that rule
// alone only holds ~2/3 of the time -- one reply kept the ₹ symbol but still
// translated "/night" into "/రాత్రి" (Telugu for "night"). Same stochastic
// ~50% class of prompt-only miss already documented above for the English
// marker, just one language over, so "night" itself is now translated here
// too rather than trusting compliance alone. "Rs."/"INR" cover the
// realistic English/Hinglish-side currency variant.
//
// A live re-test still caught "రూ.1,299/రాత్రి" (kept the correct "రాత్రి"
// fix above, but swapped the CURRENCY marker itself for "రూ." -- the exact
// symbol substitution this comment already described once, just never
// actually added to the pattern the first time around). "రూ" added as a
// recognized currency marker alongside ₹/Rs/INR.
const ROOM_PRICE_PATTERN = /(₹|rs\.?|inr|రూ\.?)\s*[\d,]+\s*(\/|\bper\b)\s*(night|రాత్రి|रात्रि|रात)/i;

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

// Matches both the literal "View photos" button tap and a guest typing the
// same request as free text -- see PHOTOS in pipeline.ts, which already
// expects both forms to arrive as the guest's plain message.
// Stems rather than \b-bounded whole words. A soak run with realistic typing
// noise caught the gap: \b requires a non-word character before the keyword,
// so a tapped row title arriving with its space dropped ("Viewphotos") — and
// any of the ordinary misspellings guests produce on a phone keyboard —
// matched nothing, and the request got swallowed by a funnel prompt instead
// of sending photos. Matching the stem is deliberately loose here: over-
// detecting a photo request costs a guest an extra photo, while under-
// detecting it means ignoring what they actually asked for.
const PHOTO_REQUEST_PATTERN = /photo|pictur|\bpi?cs?\b|what (does|do) (it|the room) look like/i;

/**
 * True when `a` becomes `b` by swapping one adjacent pair of characters
 * ("hpotos" → "photos").
 *
 * Counted separately because a transposition is TWO substitutions under
 * plain Levenshtein and so slips past a distance-1 check — while being one
 * of the most common things a thumb actually does on a phone keyboard. This
 * is the Damerau part of Damerau-Levenshtein, added on its own rather than
 * raising the edit budget to 2, which would start matching unrelated words.
 */
function isTransposition(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const diffs: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diffs.push(i);
    if (diffs.length > 2) return false;
  }
  if (diffs.length !== 2) return false;
  const [x, y] = diffs;
  return y === x + 1 && a[x] === b[y] && a[y] === b[x];
}

/** True when `a` and `b` differ by at most one insertion, deletion or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (short.length === long.length) i++; // substitution
    j++; // insertion/deletion
  }
  return edits + (long.length - j) + (short.length - i) <= 1;
}

// The TARGET words must be this long; a shorter threshold is actively
// harmful, since "pic" and "pick" differ by one edit and "pick" appears all
// over this very flow ("Pick exact dates", "Pick a date") — a request to
// pick a date would be read as a request for photos.
//
// The guest's own word only needs 4, so a dropped letter ("phto") still
// matches. That stays safe precisely because the targets are all 5+: "pick"
// is more than one edit from every one of them.
const FUZZY_TARGET_MIN_LENGTH = 5;
const FUZZY_WORD_MIN_LENGTH = 4;
const PHOTO_WORDS = ["photo", "photos", "picture", "pictures"];

/**
 * Catches the ordinary single-character slips a phone keyboard produces
 * ("phtos", "pictuers") that stem matching alone can't. Found by a soak with
 * realistic typing noise: a typo'd photo request fell through detection and
 * got swallowed by a funnel prompt, so the guest was asked their party size
 * instead of being shown the room they asked to see.
 */
function fuzzyContains(text: string, targets: string[]): boolean {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= FUZZY_WORD_MIN_LENGTH)
    .some((w) => targets.some((t) => t.length >= FUZZY_TARGET_MIN_LENGTH && (withinOneEdit(w, t) || isTransposition(w, t))));
}

function looksLikePhotoRequest(text: string): boolean {
  return PHOTO_REQUEST_PATTERN.test(text) || fuzzyContains(text, PHOTO_WORDS);
}

/**
 * The guest pushing back on the room being offered, or asking for a
 * different one — "no", "not this one", "I only want the premium room",
 * "something else", "koi aur room".
 *
 * Deliberately broad, and the breadth is the point: this only ever
 * SUPPRESSES the push-to-confirm. A false positive costs one turn of
 * momentum; a false negative books someone into a room they refused, which
 * is exactly what happened in production before this existed. Those two
 * outcomes are not remotely symmetric.
 */
const ROOM_OBJECTION_PATTERN =
  /\b(no|nope|nah|nahi|not (this|that|it|interested)|don'?t want|do not want|instead|rather|prefer|only want|another|different|other room|something else|change (the )?room|koi aur|dusra|dusri|వేరే|नहीं|दूसरा)\b/i;

// Fuzzy-matched too, for the same reason photo requests are: a soak with
// realistic typing noise found "I'd preferr the deluxe room" sailing through
// a \b-anchored "prefer" and getting answered with a push to confirm the
// rejected room. Chasing spellings one at a time is a losing game; matching
// within one edit is not.
const ROOM_OBJECTION_WORDS = ["prefer", "another", "different", "instead", "rather", "dusra", "dusri"];

/** CONFIRM_BOOKING's own "Not yet" decline row — see resolveStageKey. */
const DECLINED_CONFIRM_PATTERN = /^not yet$/i;

export function looksLikeRoomObjection(text: string): boolean {
  return ROOM_OBJECTION_PATTERN.test(text) || fuzzyContains(text, ROOM_OBJECTION_WORDS);
}

/**
 * The guest signalling they're happy to go ahead.
 *
 * This gates the push-to-confirm, which used to be the waterfall's CATCH-ALL:
 * once any room had been mentioned, literally any message that didn't match
 * an earlier branch was answered with "tap Confirm booking". That is how a
 * guest who said "No I only want premium room" got pushed to confirm — and
 * then booked into — the Classic Room they'd just refused.
 *
 * Enumerating rejections to suppress the close was the first attempt and it
 * loses: a soak with realistic typing noise kept finding new spellings
 * ("preferr", "soomething else") that slipped through. Requiring positive
 * agreement inverts the failure. An unrecognised message now goes to the AI,
 * which answers it in context, instead of being steamrolled with a close.
 * The waterfall still re-derives buttons from whatever the AI writes, so a
 * genuine "shall I book it?" reply still gets its Confirm row.
 */
const AGREEMENT_PATTERN =
  /^(y|ya|yes|yeah|yep|yup|ok|okay|k|sure|done|fine|great|perfect|good|nice|cool|👍|✅)\b|^(sounds good|that works|go ahead|book it|lets book|let'?s book|i'?ll take it|works for me|haan|haa|ji|theek hai|thik hai|sahi|sari|ok done|yes please|please book|book kar do|confirm)\b/i;

// Question words and markers, across the registers this hotel actually
// sees. Deliberately broad — see deservesRealAnswer for why the cost of a
// false positive here is one extra AI turn, and the cost of a false
// negative is ignoring what the guest asked.
const QUESTION_MARKER =
  /\b(what|where|when|why|which|who|how|is|are|was|were|do|does|did|can|could|would|will|should|any|anyone|need|want|tell me|please tell)\b|\b(kya|kaisa|kaise|kitna|kitne|kitni|kahan|kab|kaun|hai|hain|milega|milegi|chahiye|chahta|chahti|batao|bataye)\b|ఎక్కడ|ఎప్పుడు|ఎంత|ఎలా|ఏమి|ఏమిటి|ఉందా|ఉన్నాయా|కావాలి|ఇస్తారా|చేస్తారా|చెప్పండి|क्या|कहाँ|कहां|कब|कितना|कितने|कितनी|कैसे|कौन|कौनसा|है|हैं|चाहिए|चाहता|चाहती|मिलेगा|मिलेगी|बताओ|बताइए/i;

/**
 * True when the guest's message is asking or telling us something that
 * needs a genuine reply, rather than being a slot answer or filler.
 *
 * This gates the deterministic funnel short-circuit, which does not merely
 * choose buttons — it replaces the reply entirely, so the AI never sees the
 * message at all. The previous guard was `endsWith("?")`, and an audit of
 * 105 ordinary guest messages found 66.7% of them swallowed: nobody
 * punctuates on WhatsApp, so "do you have wifi" and "kitna hai price" were
 * answered with "How many people will be staying?" — which reads exactly
 * like not listening, because functionally nothing listened.
 *
 * Deliberately generous. A false positive costs one AI turn on a message
 * the funnel could have handled; a false negative ignores a real question.
 * Those are not comparable. The waterfall still re-derives the right buttons
 * from whatever the AI writes, so the funnel isn't lost — only deferred.
 */
export function deservesRealAnswer(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  if (QUESTION_MARKER.test(t)) return true;
  // A typed date is a substantive answer, however terse. "26jul" is one word
  // with no question marker, so without this it fell into the funnel and the
  // guest was asked for dates they had just given.
  if (parseExplicitDate(t)) return true;
  // A sentence rather than a tap or a grunt. Button titles and slot answers
  // ("2 people", "Just me", "ok") sit well under this; a real remark
  // ("my flight lands at 2am") does not.
  return t.split(/\s+/).filter(Boolean).length >= 4;
}

/**
 * Did the guest actually ASK something, as opposed to saying something
 * substantive?
 *
 * Strictly narrower than deservesRealAnswer, and deliberately so. That
 * function decides whether a message is meaty enough to deserve the model
 * rather than a canned slot prompt, and its ">= 4 words" fallback is right for
 * that job — "I'd like to book a room" is substantive and should reach the
 * model. But it is not a question, and the funnel instruction for it ("your
 * job is to learn the party size") is exactly correct.
 *
 * This predicate answers the different question of whether ignoring the
 * message would read as not listening. Only an explicit question mark or a
 * real interrogative marker counts, so a statement of intent still gets the
 * funnel while "wifi hai kya aapke yaha" gets answered.
 */
export function looksLikeDirectQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return t.endsWith("?") || QUESTION_MARKER.test(t);
}

export function looksLikeAgreement(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (AGREEMENT_PATTERN.test(t)) return true;
  // Deliberately NOT "please": it is a politeness marker, not agreement, and
  // it attaches to refusals just as readily as acceptances — "something else
  // please" was being read as a yes and answered with a push to confirm.
  return fuzzyContains(t, ["sounds", "perfect", "great", "confirm"]);
}

export function roomResponsePrompt(lang?: GuestLanguage | null): InteractivePrompt {
  return catalogToPrompt(buildCatalog(resolveLanguage(lang)).ROOM_RESPONSE);
}

export function guestCountPrompt(lang?: GuestLanguage | null): InteractivePrompt {
  return catalogToPrompt(buildCatalog(resolveLanguage(lang)).GUEST_COUNT);
}

export function confirmBookingPrompt(lang?: GuestLanguage | null): InteractivePrompt {
  return catalogToPrompt(buildCatalog(resolveLanguage(lang)).CONFIRM_BOOKING);
}

export function postBookingPrompt(lang?: GuestLanguage | null): InteractivePrompt {
  return catalogToPrompt(buildCatalog(resolveLanguage(lang)).POST_BOOKING);
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
// "log"/"logon" (Hindi/Hinglish for "people") is a second real, live-caught
// gap: a guest typing "2 log ke liye room chahiye" (very natural Hinglish
// for "need a room for 2 people") wasn't recognized at all, silently
// re-asking a question the guest had already answered in the same message
// — exactly the pattern this file's own system prompt tells the AI to
// expect from real Hyderabad WhatsApp chats (see pipeline.ts's LANGUAGE
// section), so the deterministic side needs to expect it too.
// "two people"/"couple" phrasings are a further live-caught gap: numbers
// spelled as words ("two people please") weren't recognized at all since
// the pattern required a digit, and "we're a couple"/"just the two of us"
// are extremely common, unambiguous ways a guest states a headcount of 2.
// Deliberately specific phrasings for "couple" rather than the bare word --
// "a couple of minutes/days" is a common, unrelated idiom for "a few," so
// matching bare "couple" anywhere would risk exactly the false-positive
// this file's own philosophy above warns against.
// Spelled-out Hindi number words ("do log", "teen log") are a further real
// gap -- as natural in Hinglish as English word-numbers are, just not
// covered by them. Requires the "log" noun immediately after (not a bare
// number word alone, which would be far too ambiguous in English) and
// excludes a trailing "in" specifically so "do log in" (a plausible WiFi/
// tech question, nothing to do with headcount) doesn't false-positive.
// "myself + 2" / "me + 2" and "N including me" are two more real phrasings
// for a guest adding themselves to a party size -- deliberately anchored to
// "myself"/"me" rather than a bare "+ N" pattern, since a bare one would
// collide with a "+91 98765..." phone number's own leading "+".
const GUEST_COUNT_STATED_PATTERN =
  /\b(\d+\+?\s*(guests?|people|persons?|pax|adults?|log(?:on)?)|(one|two|three|four|five|six|seven|eight|nine|ten)\s*(guests?|people|persons?|pax|adults?)|for \d+\+?(?!\s*(nights?|days?|hours?))\b|just me\b|myself\b|solo\b|only me\b|family of \d+|group of \d+|we are \d+|there(?:'s| is) \d+ of us|we'?re a couple\b|just the two of us\b|couple of us\b|me and my (wife|husband|partner|girlfriend|boyfriend)\b|(ek|do|teen|char|chaar|paanch|che|chhe|saat|aath|nau|das|dus)\s*log\b(?!\s*in)|(myself|me)\s*\+\s*\d+\b|\d+\s*including me\b)/i;

// A guest typing a full sentence in native Telugu script ("2 మంది కోసం ఈ
// వారాంతం" -- "for 2 people this weekend") wasn't recognized by ANYTHING
// above at all -- a real, live-caught gap, and a different KIND of gap than
// the Hindi/Hinglish work: this file's patterns are all ASCII \b-anchored,
// and JavaScript's \b is fundamentally Latin-script-only -- it does not
// treat Telugu characters as "word characters," so \b silently fails to
// match even immediately before/after a Telugu word (confirmed directly:
// /\b(వారాంతం)\b/.test("వారాంతం") is false on its own, standalone, with
// nothing else in the string). Simply adding Telugu alternatives inside the
// existing \b-wrapped patterns above would have looked like a fix while
// actually matching nothing. Kept as an entirely separate, unanchored
// pattern instead and OR'd into the result -- correct in every position
// Telugu script can appear, exactly because it never depends on \b at all.
// "మంది" is the counting classifier that always follows a person-count in
// Telugu (2 మంది = "2 people"); ఇద్దరు/ముగ్గురు/నలుగురు/ఐదుగురు are the
// specific person-counting number words for 2/3/4/5 (distinct from the
// ordinary cardinal numbers), commonly used standalone without needing
// మంది attached.
const TELUGU_GUEST_COUNT_PATTERN = /\d+\+?\s*మంది|ఒక్కరు|ఒకరు|ఇద్దరు|ముగ్గురు|నలుగురు|ఐదుగురు/;

// The single most severe gap live-caught this pass: a guest replying with
// JUST a bare number ("2") right after being asked "how many people will be
// staying?" -- an extremely common, natural WhatsApp reply style -- wasn't
// recognized at all, and since resolveStageKey's GUEST_COUNT check fires
// unconditionally whenever count still looks unknown, this created a genuine
// stuck loop: the exact same "how many people?" question re-fired forever,
// no matter what the guest said next, since nothing downstream (dates, a
// room) can ever be reached while guest count still looks unstated.
// Deliberately NOT matched unconditionally like the phrases above -- a bare
// number alone is too ambiguous out of context (could be a room number, a
// price, anything) to safely assume everywhere the way "2 people" can.
// Only trusted when the immediately preceding assistant message actually
// asked about guest count, checked via content rather than plumbing the
// stage key through every layer of these text-only scanners.
const BARE_COUNT_REPLY_PATTERN = /^(\d{1,2}\+?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(guests?|people|persons?|pax)?[.!?]?$/i;
const ASKED_GUEST_COUNT_PATTERN = /how many (people|guests|persons)|kitne (guests|log)/i;

function lastAssistantMessageAskedGuestCount(history: { role: string; content: string }[]): boolean {
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  return lastAssistant ? ASKED_GUEST_COUNT_PATTERN.test(lastAssistant.content) : false;
}

const ASKED_DATES_PATTERN = /when are you looking to stay|which dates|what dates|kab (aa|ana)|ఎప్పుడు/i;

/**
 * How many times Anushka has already put this question to the guest.
 *
 * The GUEST_COUNT and DATE_QUICK_PICK stages are hard gates: nothing further
 * in the waterfall can be reached until they're satisfied. That's correct
 * when the guest answers, and a trap when they don't — a randomised soak
 * across 5,000 conversations found ~10% of them deadlocked here, the same
 * question re-firing on every single turn forever, including for guests who
 * had just volunteered the OTHER slot ("this weekend") and guests who simply
 * said "ok". The stage fires off "is this slot still empty?" alone, with no
 * notion of having already asked.
 */
function timesAsked(history: { role: string; content: string }[], pattern: RegExp): number {
  return history.filter((m) => m.role === "assistant" && pattern.test(m.content)).length;
}

/**
 * After this many unanswered asks, stop gating the conversation on the slot.
 *
 * Two is deliberate: one ask can be missed in a busy chat, so re-asking once
 * is genuinely helpful. A third time is no longer a question, it's a loop —
 * and the guest has by then given two turns' worth of evidence they're not
 * going to answer it in the form it's being asked. The conversation moves on
 * (the AI can weave the question into real prose, or the slot gets settled
 * later when they mention it naturally); it is never a dead end, because
 * captureGuestCount/hasStatedDates keep watching every later turn.
 */
const MAX_UNANSWERED_ASKS = 2;

/**
 * `knownGuestCount` is the value already captured and persisted on the
 * contact (Contact.pendingGuestCount — see src/lib/booking/guest-count.ts).
 * When present it settles the question outright, and every text scan below
 * is skipped.
 *
 * This is what makes the answer survive a long conversation. The scans below
 * can only ever see the last 12 messages the pipeline loads, so in a chat
 * longer than that, the turn where the guest actually gave their count drops
 * out of the window and every pattern here starts returning false again —
 * the guest gets re-asked something they already answered, no matter how
 * good the patterns get. The scans remain as the fallback for conversations
 * already in flight with nothing stored yet, and as the detector that feeds
 * the store in the first place.
 */
export function hasStatedGuestCount(
  history: { role: string; content: string }[],
  latestGuestMessage: string,
  knownGuestCount?: number | null
): boolean {
  if (knownGuestCount != null) return true;

  const explicit = [...history.filter((m) => m.role === "user").map((m) => m.content), latestGuestMessage].some(
    (t) => GUEST_COUNT_STATED_PATTERN.test(t) || TELUGU_GUEST_COUNT_PATTERN.test(t)
  );
  if (explicit) return true;

  // Live-caught regression in the bare-count fix above: it only checked
  // whether the CURRENT message answers the CURRENT last question, so a
  // bare "2" was correctly recognized for exactly one turn, then silently
  // "forgotten" the moment the conversation moved on -- the very next turn
  // re-scans the whole history with GUEST_COUNT_STATED_PATTERN alone, which
  // never matched a bare number in the first place, so the guest got
  // funneled straight back into "how many people will be staying?" again.
  // Scanning every (assistant-asked, guest-bare-answered) pair across the
  // WHOLE history -- not just the latest one -- makes a bare-number answer
  // stick for the rest of the conversation the same way an explicit "2
  // people" always has.
  for (let i = 0; i < history.length - 1; i++) {
    if (
      history[i].role === "assistant" &&
      history[i + 1].role === "user" &&
      ASKED_GUEST_COUNT_PATTERN.test(history[i].content) &&
      BARE_COUNT_REPLY_PATTERN.test(history[i + 1].content.trim())
    ) {
      return true;
    }
  }

  return lastAssistantMessageAskedGuestCount(history) && BARE_COUNT_REPLY_PATTERN.test(latestGuestMessage.trim());
}

// Same "broad on purpose" reasoning as guest count — dates are phrased in
// far more ways than guest count is, so a narrow pattern would re-ask
// annoyingly often; a broad one occasionally skips the prompt when it
// technically could have fired, which is the safer failure direction here.
//
// Live-caught structural bug: the trailing \b was only attached to the very
// LAST alternative in the group (a regex authoring mistake, not a deliberate
// choice) -- every earlier alternative had no closing boundary at all, so a
// 3-letter weekday/month abbreviation matched as a bare PREFIX of any longer
// unrelated word: "mon" inside "month", "may" inside "maybe". A guest
// complaining "I stayed here last month..." was wrongly read as having
// already stated dates, which fed straight into treating the message as
// booking intent and skipping to "how many guests?" instead of engaging
// with the actual complaint. Fixed by moving \b to apply to the whole group
// (every alternative), and spelling out each month's optional full-word
// suffix the same way the weekday alternatives already do (mon(day)?,
// fri(day)?, ...) -- needed so "Aug" and "August" both still match, since a
// blanket trailing boundary alone would otherwise break the intentional
// prefix-of-a-full-month-name case too.
// "in N days" is a further live-caught gap: a wholly relative phrasing with
// no weekday/month/numeric-date anchor at all -- without it, a guest saying
// "in 3 days" fell through every alternative and re-triggered the exact
// same stuck-loop risk as the guest-count gap above (the dates prompt
// re-firing forever since nothing ever satisfies hasStatedDates).
// Romanized Hindi date words, plus the relative English phrasings the
// original pattern happened to miss. All live-caught by a randomised soak
// across 100,000 conversations: "kal" (tomorrow/yesterday), "parso", "agle
// hafte" (next week) and "next month" are ordinary ways guests here answer
// "when are you looking to stay?", and every one of them fell through,
// leaving hasStatedDates false and the date question re-firing at a guest
// who had just answered it.
const HINGLISH_DATE_PATTERN = /\b(kal|parso|parson|agle\s*(hafte|hafta|mahine|month|week)|is\s*(hafte|hafta|mahine)|month\s*end|next\s*month|this\s*month)\b/i;

const DATE_STATED_PATTERN =
  /\b(weekend|tonight|tomorrow|today|next week|this week|in \d+\s*days?|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?|\d{1,2}\s*[/-]\s*\d{1,2}|\d{1,2}(st|nd|rd|th))\b/i;

// Native Devanagari date words. Same \b trap as the Telugu pattern below:
// JavaScript's \b is Latin-script-only and does not treat Devanagari as word
// characters, so these can never be merged into the \b-wrapped pattern above
// -- they'd silently match nothing. Kept unanchored and OR'd in separately.
// Two-character words (मई = May) are deliberately excluded: too short a
// substring to match safely without word-boundary protection, the same
// judgement the Telugu pattern already makes for the identical reason.
const DEVANAGARI_DATE_PATTERN =
  /कल|परसों|अगले\s*(हफ्ते|महीने)|इस\s*(हफ्ते|महीने)|वीकेंड|आज|सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार|जनवरी|फरवरी|मार्च|अप्रैल|जून|जुलाई|अगस्त|सितंबर|अक्टूबर|नवंबर|दिसंबर/;

// Native Telugu-script date words -- same reasoning and same \b pitfall as
// TELUGU_GUEST_COUNT_PATTERN above: JavaScript's \b cannot anchor Telugu
// script at all, so this has to be its own unanchored pattern, never merged
// into the \b-wrapped one above. "మే" (May) is deliberately not included
// standalone -- at 2 characters it's too short a substring to safely match
// without word-boundary protection, a real false-positive risk this file's
// own philosophy elsewhere warns against; every other month name is long
// enough to be safe.
const TELUGU_DATE_PATTERN =
  /వారాంతం|రేపు|ఈ ?రోజు|నేడు|వచ్చే వారం|ఈ వారం|సోమవారం|మంగళవారం|బుధవారం|గురువారం|శుక్రవారం|శనివారం|ఆదివారం|జనవరి|ఫిబ్రవరి|మార్చి|ఏప్రిల్|జూన్|జూలై|ఆగస్టు|సెప్టెంబర్|అక్టోబర్|నవంబర్|డిసెంబర్/;

/**
 * `datesAlreadyKnown` reflects real dates already captured and stored on the
 * contact (Contact.pendingCheckIn / pendingCheckOut). When true it settles
 * the question outright and every text scan below is skipped.
 *
 * Exactly the same reasoning as hasStatedGuestCount's stored-count
 * short-circuit, and found the same way — a randomised soak across 100,000
 * conversations flagged ~1,200 runs where the date question re-fired at a
 * guest who had already answered it. The scans can only see the last 12
 * messages the pipeline loads, so once the turn where the guest gave their
 * dates scrolls out of that window, every pattern here goes false again and
 * the guest is asked a second time. No pattern can fix that; the text is
 * gone. The scans stay as the fallback for free-typed dates not yet resolved
 * into a structured range, and as what feeds the store in the first place.
 */
export function hasStatedDates(
  history: { role: string; content: string }[],
  latestGuestMessage: string,
  datesAlreadyKnown?: boolean
): boolean {
  if (datesAlreadyKnown) return true;
  // A date that has already gone is NOT a usable answer, however clearly it
  // was stated. Counting it as "dates known" is how a guest naming a past
  // date got carried forward through the funnel as though the question were
  // settled — the waterfall stopped asking, and the conversation marched on
  // toward a booking for a date that cannot happen. Treating it as unstated
  // sends them back to the picker, which is the only useful outcome.
  if (guestDateLooksPast(latestGuestMessage)) return false;
  return [...history.filter((m) => m.role === "user").map((m) => m.content), latestGuestMessage].some(
    (t) =>
      DATE_STATED_PATTERN.test(t) ||
      HINGLISH_DATE_PATTERN.test(t) ||
      TELUGU_DATE_PATTERN.test(t) ||
      DEVANAGARI_DATE_PATTERN.test(t) ||
      Boolean(parseExplicitDate(t))
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
//
// Deliberately does NOT include "check-in"/"check-out" — live-caught the
// same "railroaded" problem this comment describes, just from a different
// direction: a guest asking a plain factual question ("what time is
// check-in?", "what's your cancellation policy?") got funneled straight
// into resolveDeterministicReply's GUEST_COUNT bypass, which skips the AI
// call entirely, so the guest's actual question never got answered at all.
// A genuine booking-intent message almost always ALSO contains a stronger
// signal from this same list ("room", "book", "available", a stated date) —
// dropping these two specific words closes the false-positive without
// meaningfully weakening real intent detection.
const BOOKING_INTENT_PATTERN =
  /\b(book(ing)?|room|stay(ing)?|available|availability|vacan(t|cy)|reserve|reservation|rate|price|cost|accommodation|offers?|discounts?|deals?|promos?|coupons?)\b/i;

// Same \b-cannot-anchor-Telugu reasoning as the guest-count/date patterns
// above -- a guest expressing booking interest entirely in Telugu script
// ("రూమ్ కావాలి" -- "need a room") wasn't recognized at all, since
// BOOKING_INTENT_PATTERN only ever matched Latin-script words. "రూమ్"/"బుక్"
// are the common loanword spellings (room/book, written in Telugu script);
// కావాలి = want/need, అందుబాటులో = available, దొరుకుతుందా = "is it
// available?", ధర/రేటు = price/rate, ఆఫర్ = offer (loanword).
const TELUGU_BOOKING_INTENT_PATTERN = /రూమ్|బుక్|కావాలి|అందుబాటులో|దొరుకుతుందా|ధర|రేటు|ఆఫర్/;

// The Devanagari counterpart, and a gap that existed for as long as the
// Telugu one has been closed: a guest writing "मुझे कमरा बुक करना है" (I want
// to book a room) expressed no detectable booking intent at all, so the
// whole waterfall stayed shut to them. Found while making the language
// picker real — Hindi speakers could pick Hindi and then not be understood
// when they actually asked for a room in it. Same \b caveat as Telugu:
// unanchored by necessity, since \b cannot anchor Devanagari either.
// कमरा/रूम = room, बुक = book, चाहिए/चाहता = want/need, ठहरना = to stay,
// उपलब्ध = available, कीमत/दाम/रेट = price/rate, छूट = discount.
const DEVANAGARI_BOOKING_INTENT_PATTERN = /कमरा|कमरे|रूम|बुक|चाहिए|चाहता|चाहती|ठहरना|रुकना|उपलब्ध|कीमत|दाम|रेट|छूट|ऑफर/;

// Live-caught: "I need to cancel my booking, reference HOT-9999" matched
// BOOKING_INTENT_PATTERN via the word "booking" itself, then got funneled
// straight into "how many people will be staying?" -- a brand-new-booking
// question that completely ignores a guest trying to CANCEL an existing
// one. This app has no automated cancellation flow (only a static
// cancellationPolicy line shown in the system prompt), so a request to
// manage an existing booking needs to reach the AI's own judgment (which
// can escalate to staff per the RULES section) rather than being hijacked
// by the new-booking funnel.
const EXISTING_BOOKING_REQUEST_PATTERN = /\b(cancel|refund|reschedul(e|ing)|change (my|the) (booking|reservation)|modify (my|the) (booking|reservation))\b/i;

export function looksLikeExistingBookingRequest(text: string): boolean {
  return EXISTING_BOOKING_REQUEST_PATTERN.test(text);
}

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
  const saysSo = (t: string) =>
    BOOKING_INTENT_PATTERN.test(t) || TELUGU_BOOKING_INTENT_PATTERN.test(t) || DEVANAGARI_BOOKING_INTENT_PATTERN.test(t);

  // The GUEST saying it is intent, full stop.
  const guestTexts = [...history.filter((m) => m.role === "user").map((m) => m.content), latestGuestMessage];
  if (guestTexts.some(saysSo)) return true;

  // The assistant's own words may only CORROBORATE, never create.
  //
  // Scanning assistant text with the same keyword list was a real fix for a
  // real bug (a guest deep in a funnel replies "ok"/"yeah" forever and never
  // re-matches a keyword), but it took the phrasing too literally: the default
  // follow-up nudge reads "still interested in booking with us?", so the
  // assistant mentioning booking counted as the guest having asked for it.
  //
  // Caught in a live chat. The guest had said exactly one word — "hi" — got
  // two follow-ups an hour later, said "Hi" again, and was answered "How many
  // people will be staying?" for a booking nobody had ever mentioned.
  //
  // The honest marker is whether the GUEST ever engaged, not what the
  // assistant said. A guest deep in a funnel replies "Delax", "S", "Yeah" —
  // contentless, but they are clearly talking to us, so the assistant's side
  // is fair context for what "yeah" means. A guest who has only ever said
  // "hi" is not in a booking conversation no matter what we sent them.
  const guestEngaged = guestTexts.some((t) => t.trim() && !looksLikeBareGreeting(t));
  if (!guestEngaged) return false;

  return hasStatedGuestCount(history, latestGuestMessage) || hasStatedDates(history, latestGuestMessage) || history.some((m) => m.role === "assistant" && saysSo(m.content));
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
// Matches the row's current title and its former one ("I'll type dates"),
// since a guest's transcript can still contain the old wording.
const DECLINED_DATE_QUICK_PICK_PATTERN = /^(i'?ll type dates|pick exact dates|another date)$/i;

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

export function greetMenuPrompt(lang?: GuestLanguage | null): InteractivePrompt {
  return catalogToPrompt(buildCatalog(resolveLanguage(lang)).GREET_MENU);
}

export function dateQuickPickPrompt(lang?: GuestLanguage | null): InteractivePrompt {
  return catalogToPrompt(buildCatalog(resolveLanguage(lang)).DATE_QUICK_PICK);
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
  /** Already-captured party size for this contact — see hasStatedGuestCount. */
  knownGuestCount?: number | null;
  /** True when real dates are already stored for this contact — see hasStatedDates. */
  datesKnown?: boolean;
  /**
   * The guest's chosen chat language, so the buttons match the words above
   * them.
   *
   * promptForStageKey has always accepted this; the AI path simply never
   * passed it, so every button attached to a model-written reply was built
   * from the English catalog. Caught in an end-to-end run: a Telugu guest was
   * asked "ఎన్ని మంది కోసం బుక్ చేయాలి?" above rows reading "Just me / 2
   * people / 3+ people", and a Hindi guest got the same. The deterministic
   * short-circuits in handle-inbound-message.ts pass a language and were
   * always correct, which is exactly why this stayed hidden — the flow looked
   * right whenever it was driven by taps.
   */
  language?: GuestLanguage | null;
  /** See resolveStageKey's isTap — a tap is never re-read as free text. */
  isTap?: boolean;
}): InteractivePrompt | undefined {
  const key = resolveStageKey(params);
  return key ? promptForStageKey(key, params.language) : params.aiInteractive;
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
  knownGuestCount?: number | null;
  datesKnown?: boolean;
  /**
   * True when this turn was a BUTTON TAP rather than typed text.
   *
   * deservesRealAnswer is a heuristic for prose — its "four or more words"
   * fallback exists to catch remarks nobody punctuates. A tap is not prose. Its
   * text is a label this app wrote, and the guest picking it means exactly one
   * thing.
   *
   * Found by probing the real flow: the primary CTA is titled "I want to book a
   * room", which is five words, so tapping it scored as a real question and
   * bypassed the guest-count prompt entirely — the single most-used button in
   * the product fell through to the AI on every tap. The E2E suite missed it
   * because its fixture tapped a shorter label ("Book a room") than the one
   * production actually renders.
   */
  isTap?: boolean;
}): StageKey {
  const { isFirstReply, languageObvious, history, guestMessage, replyText, knownGuestCount, datesKnown, isTap } = params;

  const roomMentionedEver = history.some((m) => m.role === "assistant" && mentionsRoomPrice(m.content)) || mentionsRoomPrice(replyText);
  const intentShown = hasExpressedBookingIntent(history, guestMessage) || roomMentionedEver;

  // Content-based stages are checked BEFORE the first-reply language check,
  // not after — a real bug found live: a guest's very first message is
  // often already information-rich ("Hi, 2 guests, want a room this
  // weekend"), and forcing LANGUAGE_SELECT buttons over a reply that just
  // recommended a specific room (or asked for guest count) was a severe
  // text/button mismatch. Language-select is now the *fallback* for a
  // first reply with nothing more specific to say, not an override.
  if (intentShown && !looksLikeExistingBookingRequest(guestMessage)) {
    // Checked before every slot gate below, not after. A photo request is
    // never an answer to "how many people?" or "when are you staying?", so
    // swallowing one to re-ask a slot is always wrong -- the guest asked to
    // SEE something and got a form instead. This guard existed already but
    // sat below the gates and was additionally conditioned on a room having
    // been mentioned before, so it only protected guests who had already got
    // that far; a soak across 100,000 conversations caught ~1,600 runs where
    // an earlier photo request was swallowed. Returning null hands the turn
    // to the AI, which can actually send the photos; the waterfall still
    // re-attaches the right buttons afterward from what it wrote.
    if (looksLikePhotoRequest(guestMessage)) {
      return null;
    }
    // Gated on not having already asked twice — see MAX_UNANSWERED_ASKS.
    // Falling through rather than returning here is the whole point: the
    // waterfall continues to dates/rooms instead of deadlocking on a slot
    // this guest isn't going to fill in the form it's being asked for.
    if (!hasStatedGuestCount(history, guestMessage, knownGuestCount) && timesAsked(history, ASKED_GUEST_COUNT_PATTERN) < MAX_UNANSWERED_ASKS) {
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
    // Live-caught, the most severe instance of this class of bug found this
    // session: CONFIRM_BOOKING fired completely unconditionally once a room
    // had ever been mentioned, with NO check on what the guest's current
    // message actually says -- unlike every other branch in this block. A
    // guest tapping "View photos" (which arrives as the literal guest
    // message, exactly like typed text -- see PHOTOS in pipeline.ts) got
    // silently swallowed and replaced with "tap Confirm booking below"
    // instead of ever seeing a single photo -- deterministic, so the AI
    // never even got a chance to send them. Any genuine question after a
    // recommendation ("is there a bathtub?") was equally at risk. Return
    // null instead of falling through to a different wrong branch here --
    // this lets the AI actually respond (send real photos, answer the
    // question); the post-hoc call re-derives real buttons from what it
    // actually wrote, same mechanism ROOM_RESPONSE already relies on.
    if (roomMentionedEver && !isTap && (looksLikePhotoRequest(guestMessage) || deservesRealAnswer(guestMessage))) {
      return null;
    }
    // The worst instance of this bug class yet, caught in a real booking: a
    // guest answered a Classic Room recommendation with "No I only want
    // premium room" and, because that is not a photo request and does not
    // end in "?", fell straight through to CONFIRM_BOOKING -- which restated
    // the CLASSIC room and pushed them to confirm it. They tapped, and were
    // booked into the room they had just explicitly refused.
    //
    // A rejection is the one message that must never be answered with
    // "ready to confirm?". Handing the turn to the AI lets it engage with
    // what they actually asked for; handle-inbound-message.ts additionally
    // switches the pending room outright when they name a real one, so the
    // recovery is deterministic rather than left to the model.
    if (roomMentionedEver && looksLikeRoomObjection(guestMessage)) {
      return null;
    }
    // Checked before the dates nudge, not after: dates detection is
    // necessarily broad/imprecise (guests phrase dates far more ways than
    // guest counts), so if a room's already been discussed, prioritize
    // moving the guest toward confirming over risking a guest who's ready
    // to book getting stuck being asked for dates on a loop because their
    // phrasing didn't match the pattern.
    //
    // Now requires actual agreement rather than firing as the catch-all for
    // "a room was mentioned at some point". As a catch-all this branch
    // answered ANY unmatched message with a push to confirm — which is how a
    // guest who said "No I only want premium room" was pushed to confirm the
    // Classic Room, tapped, and got booked into it. See looksLikeAgreement
    // for why suppressing rejections was the wrong shape of fix.
    // "Not yet" is CONFIRM_BOOKING's own decline row, so it stays on this
    // branch deliberately — not to push again, but because the stage owns a
    // dedicated soft, no-pressure reply for exactly this tap (see
    // resolveDeterministicReply). Dropping it here would hand a declining
    // guest to the AI and lose that.
    if (roomMentionedEver && (looksLikeAgreement(guestMessage) || DECLINED_CONFIRM_PATTERN.test(guestMessage.trim()))) {
      // Never offer a Confirm button that cannot confirm.
      //
      // Reported live: a guest agreed to a room, was given "Confirm booking",
      // tapped it — and was answered "Just need your dates to lock this in".
      // From their side they had confirmed and been asked to start again. The
      // handler behind that button genuinely cannot complete a booking with no
      // dates, so the fix belongs here: ask for the dates first, and offer
      // Confirm once it can actually mean something.
      //
      // A decline ("Not yet") still goes to CONFIRM_BOOKING even without
      // dates: that stage owns a soft, no-pressure reply for exactly that tap,
      // and asking a declining guest for dates would be pushier than the
      // button they just declined.
      const declining = DECLINED_CONFIRM_PATTERN.test(guestMessage.trim());
      if (!declining && !hasStatedDates(history, guestMessage, datesKnown)) {
        return "DATE_QUICK_PICK";
      }
      return "CONFIRM_BOOKING";
    }
    if (
      !hasStatedDates(history, guestMessage, datesKnown) &&
      !declinedDateQuickPick(guestMessage) &&
      timesAsked(history, ASKED_DATES_PATTERN) < MAX_UNANSWERED_ASKS
    ) {
      return "DATE_QUICK_PICK";
    }
  }

  if (looksLikeLanguageSelection(guestMessage)) {
    return "GREET_MENU";
  }
  // Live-caught: gated on !intentShown for the same reason the comment
  // above this whole block explains, just a case that comment's own fix
  // didn't fully close. A guest's rich first message ("Hi, 2 guests, need a
  // room this weekend") can lead the AI to ask a narrower clarifying
  // question (e.g. "which exact weekend date?") rather than naming a room
  // outright -- count and dates are both already known so GUEST_COUNT/
  // DATE_QUICK_PICK correctly don't fire, and no price has been named yet
  // so ROOM_RESPONSE/CONFIRM_BOOKING don't either, so NOTHING in the block
  // above claims this turn -- it fell all the way through to here, where
  // isFirstReply alone was enough to wrongly attach LANGUAGE_SELECT under a
  // reply that has nothing to do with language. Real booking intent already
  // being shown means this was never actually a blank first message.
  if (!intentShown && (isFirstReply || looksLikeBareGreeting(guestMessage))) {
    // A first message that actually asks something gets answered, not handed
    // a form.
    //
    // GUEST_COUNT and DATE_QUICK_PICK have been guarded by deservesRealAnswer
    // for a while; LANGUAGE_SELECT never was, and it is the worst place to
    // miss it because it is the guest's very first impression. Probed live:
    // "how much for one night?" and "do you allow pets?" both came back with
    // "Which language are you comfortable in?" — a direct question answered
    // with a form, which is exactly what makes a bot feel like a bot.
    //
    // Nothing is lost by skipping it. Devanagari and Telugu script are
    // detected automatically (see resolveContactLanguageUpdate), the AI
    // answers in whatever language the guest wrote in, and the waterfall
    // re-attaches the right buttons to whatever it says — so the funnel is
    // deferred by one turn, not abandoned. A bare "hi" still gets the picker,
    // because there is nothing else in it to respond to.
    if (!isTap && !looksLikeBareGreeting(guestMessage) && deservesRealAnswer(guestMessage)) return null;
    return languageObvious ? "GREET_MENU" : "LANGUAGE_SELECT";
  }
  return null;
}

function promptForStageKey(key: StageKey, lang?: GuestLanguage | null): InteractivePrompt | undefined {
  switch (key) {
    case "LANGUAGE_SELECT":
      return catalogToPrompt(BUTTON_CATALOG.LANGUAGE_SELECT);
    case "GREET_MENU":
      return greetMenuPrompt(lang);
    case "GUEST_COUNT":
      return guestCountPrompt(lang);
    case "ROOM_RESPONSE":
      return roomResponsePrompt(lang);
    case "PRICE_OBJECTION":
      return catalogToPrompt(buildCatalog(resolveLanguage(lang)).PRICE_OBJECTION);
    case "CONFIRM_BOOKING":
      return confirmBookingPrompt(lang);
    case "DATE_QUICK_PICK":
      return dateQuickPickPrompt(lang);
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
/**
 * Guest count and dates are settled and no room has been named yet — the
 * moment the conversation is ready to put rooms in front of the guest.
 *
 * Exported so the worker can act on it: the room shortlist is built from
 * real Room rows and sent deterministically, rather than the model being
 * asked to recommend one. That change came from a live incident where the
 * model chose a room on the guest's behalf AND quoted prices 46% and 37%
 * above the real ones, with the correct figures sitting in its own prompt.
 */
export function readyToOfferRooms(params: {
  history: { role: string; content: string }[];
  guestMessage: string;
  knownGuestCount?: number | null;
  datesKnown?: boolean;
}): boolean {
  return (
    hasStatedGuestCount(params.history, params.guestMessage, params.knownGuestCount) &&
    hasStatedDates(params.history, params.guestMessage, params.datesKnown) &&
    !params.history.some((m) => m.role === "assistant" && mentionsRoomPrice(m.content))
  );
}

export function predictedStageInstruction(params: {
  isFirstReply: boolean;
  languageObvious: boolean;
  history: { role: string; content: string }[];
  guestMessage: string;
  knownGuestCount?: number | null;
  datesKnown?: boolean;
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
    hasStatedGuestCount(params.history, params.guestMessage, params.knownGuestCount) &&
    hasStatedDates(params.history, params.guestMessage, params.datesKnown) &&
    !params.history.some((m) => m.role === "assistant" && mentionsRoomPrice(m.content));
  if (readyToRecommend) {
    return "The guest is ready to see rooms, and a list of the hotel's real rooms with real prices is being sent separately — do NOT name a room or quote any price yourself. Keep this reply to one short warm line.";
  }

  // Did the guest actually ask something this turn?
  //
  // The slot-filling instructions below used to be unconditional, and ended
  // with "don't ask about dates or anything else in this same reply". Read by
  // a model that has just been handed a real question, that is an instruction
  // to ignore the guest. Caught in an end-to-end run: a guest asked "wifi hai
  // kya aapke yaha" before stating party size and Anushka escalated with the
  // reason "Need clarification on guest count" — the guest got a hand-off
  // message instead of the answer sitting in her own prompt.
  //
  // The waterfall already routes questions here rather than answering them
  // with a canned slot prompt (see deservesRealAnswer). This closes the other
  // half of that decision: having decided the question deserves a real
  // answer, stop simultaneously telling the model not to give one.
  const asked = looksLikeDirectQuestion(params.guestMessage);

  const key = resolveStageKey({ ...params, replyText: "" });
  switch (key) {
    case "LANGUAGE_SELECT":
      return "This is the guest's very first message. An English / हिंदी / తెలుగు language-selection picker will automatically appear under your reply — don't ask which language they prefer yourself, just write your normal short opener.";
    case "GREET_MENU":
      return "This is the guest's very first message and their language is already clear from how they wrote. An \"I want to book a room\" / \"Availability & price\" / \"I need more details\" picker will automatically appear under your reply — keep your opener short and don't ask an open question yourself, the picker already is the question.";
    case "GUEST_COUNT":
      return asked
        ? "The guest just asked you something — ANSWER IT, using the hotel information above. That answer is this reply's job. A \"Just me\" / \"2 people\" / \"3+ people\" picker appears automatically underneath, so the party-size question is already handled for you and must not crowd out their actual question. Never reply with only a request for their guest count when they asked you something else, and never hand off to a colleague for something the information above already answers."
        : "This reply's job: move toward learning how many people will be staying. A \"Just me\" / \"2 people\" / \"3+ people\" picker will automatically appear under your reply — a brief version of that question in your own words is fine (or skip it, the picker covers it), but don't ask about dates or anything else in this same reply.";
    case "DATE_QUICK_PICK":
      return asked
        ? "The guest just asked you something — ANSWER IT, using the hotel information above. That answer is this reply's job. A \"This weekend\" / \"Next week\" / \"I'll type dates\" picker appears automatically underneath, so the dates question is already handled for you and must not crowd out their actual question. Never reply with only a request for their dates when they asked you something else, and never hand off to a colleague for something the information above already answers."
        : "This reply's job: move toward learning their dates. A \"This weekend\" / \"Next week\" / \"I'll type dates\" picker will automatically appear under your reply — a brief version of that question in your own words is fine (or skip it, the picker covers it), but don't ask anything else in this same reply.";
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
  // Before 5am there is no greeting that fits. Caught live on a real guest's
  // very first message: "Hii" at 00:24 IST was answered "Good morning!", which
  // at half past midnight reads as either a machine or a joke — and it is the
  // first line the hotel ever says to them.
  //
  // The prompt already tells the model the same thing for its own greetings
  // ("when in doubt use a greeting that works at any hour"); this is the
  // deterministic path finally agreeing with it.
  if (hour < 5) return "Hello!";
  if (hour < 12) return "Good morning!";
  if (hour < 17) return "Good afternoon!";
  return "Good evening!";
}

/** "15 September 2026" -- the exact stay dates shown back to the guest before final confirmation. */
function formatDateHuman(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
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
  /**
   * The hotel's own name for its assistant, from HotelProfile.aiAgentName.
   *
   * The greeting below hardcoded "Anushka", so a hotel that renamed its agent
   * in Settings still had it introduce itself as Anushka to every new guest —
   * the setting worked everywhere except the one line every guest reads first.
   */
  agentName?: string;
  now?: Date;
  bookingSummary?: { roomName: string; checkIn: Date; checkOut: Date };
  knownGuestCount?: number | null;
  datesKnown?: boolean;
  /** The guest's chosen chat language — governs every string below. */
  language?: GuestLanguage | null;
  /** See resolveStageKey's isTap — a tap is never re-read as free text. */
  isTap?: boolean;
}): { text: string; interactive: InteractivePrompt } | null {
  // A guest writing in Devanagari or Telugu used to bail out of the entire
  // deterministic path here, because every string it produced was hardcoded
  // English and answering them in English was worse than handing the turn to
  // the AI. Now that the catalog is translated, that bail-out is exactly
  // backwards: it would deny non-English guests the localised buttons this
  // whole mechanism exists to give them, which is the reported bug. Only a
  // language we have no translations for still falls through to the AI.
  if (params.languageObvious && !isGuestLanguage(params.language)) return null;

  const readyToRecommend =
    hasStatedGuestCount(params.history, params.guestMessage, params.knownGuestCount) &&
    hasStatedDates(params.history, params.guestMessage, params.datesKnown) &&
    !params.history.some((m) => m.role === "assistant" && mentionsRoomPrice(m.content));
  if (readyToRecommend) return null;

  const key = resolveStageKey({ ...params, replyText: "" });
  if (!key || !DETERMINISTIC_STAGE_KEYS.has(key)) return null;

  // Live-caught, a more general case of the same bug the check-in/check-out
  // fix above addresses: once booking intent is EVER shown (even just from
  // the assistant's own opening line mentioning "book a room"), it stays
  // true for the rest of the conversation, so GUEST_COUNT/DATE_QUICK_PICK
  // fire unconditionally on every later turn regardless of what THIS
  // specific message actually says -- a guest asking "am I talking to a
  // real person or a bot?" got silently swallowed and re-funneled into
  // "how many people will be staying?" instead of getting answered. A
  // guest message that's phrased as a genuine question (ends in "?") and
  // doesn't itself contain a guest-count/date answer is far more likely to
  // be a real question than an attempt to fill in the missing slot -- skip
  // the deterministic bypass so the AI actually engages with it; the
  // waterfall still re-attaches the right buttons afterward based on what
  // the AI's real reply ends up saying, same mechanism ROOM_RESPONSE and
  // CONFIRM_BOOKING already rely on.
  // Widened from `endsWith("?")`, which only caught punctuated questions and
  // let two thirds of ordinary guest messages be swallowed by the funnel —
  // see deservesRealAnswer. This branch replaces the whole reply, not just
  // the buttons, so anything that reads as a real question or remark has to
  // reach the AI.
  if ((key === "GUEST_COUNT" || key === "DATE_QUICK_PICK") && !params.isTap && deservesRealAnswer(params.guestMessage)) return null;

  const lang = resolveLanguage(params.language);
  const s = t(lang);
  const entry = buildCatalog(lang)[key];
  let text: string;
  if (key === "LANGUAGE_SELECT") {
    // Stays English by construction: this is the message that ASKS which
    // language, so it has to be readable before one has been chosen.
    const greeting = timeOfDayGreeting(params.now ?? new Date());
    const from = params.hotelName ? ` from ${params.hotelName}` : "";
    const agent = params.agentName?.trim() || "Anushka";
    text = `${greeting} 😊 This is ${agent}${from} — thank you for reaching out! Which language are you comfortable in?`;
  } else if (key === "CONFIRM_BOOKING") {
    // Live-caught: a guest tapping "Not yet" (CONFIRM_BOOKING's own decline
    // row) got the exact same push-to-confirm text repeated verbatim right
    // back at them -- reads as not listening. A guest who just declined
    // gets a softer, no-pressure line instead of the identical nudge again.
    if (DECLINED_CONFIRM_PATTERN.test(params.guestMessage.trim())) {
      text = s.confirmSoftDecline;
    } else if (params.bookingSummary) {
      // Live-caught gap: the confirm-booking prompt never actually restated
      // WHAT was being confirmed -- a guest tapping "Confirm booking" had no
      // easy way to double-check the room or dates before locking it in.
      // Shown whenever the real booking details are known at this point in
      // the conversation (see process-message-job.ts, which fetches the
      // room name and pending dates from the contact record).
      const { roomName, checkIn, checkOut } = params.bookingSummary;
      text = s.confirmWithSummary(roomName, formatDateHuman(checkIn), formatDateHuman(checkOut));
    } else {
      text = s.confirmGeneric;
    }
  } else {
    text = entry.fallbackBody;
  }

  return { text, interactive: catalogToPrompt(entry) };
}
