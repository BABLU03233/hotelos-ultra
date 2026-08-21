/**
 * The guest's chosen chat language, and every deterministic string rendered
 * in it.
 *
 * The language picker was effectively cosmetic before this: tapping "हिंदी"
 * produced one Hindi greeting and nothing else. The choice was never stored,
 * and every reply the deterministic waterfall owns — which is most of them —
 * was hardcoded English, so the very next message was back in English. From
 * the guest's side the picker simply didn't work.
 *
 * Two rules follow from that, and they're why this file exists rather than
 * the strings living inline:
 *
 *   1. The choice is durable. It's stored on the contact, not re-derived
 *      from a 12-message window that scrolls.
 *   2. Every guest-visible string has a translation for every language. A
 *      half-translated conversation (Hindi prose, English buttons) reads as
 *      more broken than English throughout, because it looks like something
 *      failed rather than like a choice.
 *
 * Native script is used, not romanised: the picker itself offers "हिंदी" and
 * "తెలుగు" in native script, so that is what picking them promises.
 */

export type GuestLanguage = "en" | "hi" | "te";

export const DEFAULT_LANGUAGE: GuestLanguage = "en";

/** Language-picker row ids → the language they select. */
export const LANGUAGE_BUTTON_VALUES: Readonly<Record<string, GuestLanguage>> = {
  lang_en: "en",
  lang_hi: "hi",
  lang_te: "te",
};

// Unicode blocks. JavaScript's \b cannot anchor either script (it is
// Latin-only), so these are deliberately unanchored — the same trap
// documented at length in interactive-prompts.ts.
const DEVANAGARI = /[ऀ-ॿ]/;
const TELUGU = /[ఀ-౿]/;

/**
 * The language a message is written in, or null when it carries no script
 * signal (Roman letters could be English, Hinglish or Tenglish — genuinely
 * ambiguous, so this refuses to guess rather than overriding a real choice).
 */
export function detectScriptLanguage(text: string): GuestLanguage | null {
  if (TELUGU.test(text)) return "te";
  if (DEVANAGARI.test(text)) return "hi";
  return null;
}

export function isGuestLanguage(value: string | null | undefined): value is GuestLanguage {
  return value === "en" || value === "hi" || value === "te";
}

export function resolveLanguage(stored: string | null | undefined): GuestLanguage {
  return isGuestLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

/**
 * The language to write to the contact for this message, or undefined to
 * leave whatever is stored untouched.
 *
 * Extracted rather than left inline in the message handler because the rule
 * is subtler than it looks and got it wrong once: the first version only
 * ever filled a null, so a guest who picked English and then began writing
 * in Telugu kept receiving English indefinitely — the precise opposite of
 * adapting to them.
 *
 * Switching script mid-conversation IS switching language, and following it
 * is safe here only because detectScriptLanguage refuses to guess from Roman
 * letters. A Hindi-picker typing "wifi hai kya" yields null and their choice
 * stands, which is the case the original stickiness existed to protect.
 */
export function resolveContactLanguageUpdate(
  stored: string | null | undefined,
  messageText: string | null | undefined
): GuestLanguage | undefined {
  if (!messageText) return undefined;
  const detected = detectScriptLanguage(messageText);
  if (!detected) return undefined; // ambiguous script — never overrides a choice
  return detected === stored ? undefined : detected; // no pointless write when unchanged
}

/** What to call the language in a prompt to the model. */
export const LANGUAGE_NAMES: Record<GuestLanguage, string> = {
  en: "English",
  hi: "Hindi (Devanagari script)",
  te: "Telugu (Telugu script)",
};

interface Strings {
  greetAfterLanguage: string;
  greetMenuBody: string;
  greetBook: string;
  greetAvailability: string;
  greetAvailabilityDesc: string;
  greetQuestion: string;
  greetQuestionDesc: string;
  chooseButton: string;

  guestCountBody: string;
  guestJustMe: string;
  guest2: string;
  guest3Plus: string;

  datesBody: string;
  datesButton: string;
  dateToday: string;
  dateTomorrow: string;
  dateWeekend: string;
  dateNextWeek: string;
  dateExact: string;

  roomResponseBody: string;
  roomBook: string;
  roomOther: string;
  roomPhotos: string;

  confirmBody: string;
  confirmButton: string;
  confirmYes: string;
  confirmNotYet: string;
  confirmSoftDecline: string;
  confirmGeneric: string;
  confirmWithSummary: (roomName: string, checkIn: string, checkOut: string) => string;

  priceObjectionBody: string;
  priceCheaper: string;
  priceOffers: string;
  priceContinue: string;

  postBookingBody: string;
  postBookingQuestion: string;
  postBookingDone: string;

  checkInPickerBody: string;
  checkInPickerButton: string;
  labelToday: string;
  labelTomorrow: string;
  anotherDate: string;
  anotherDateDesc: string;
  nightsBody: (checkIn: string) => string;
  nightsButton: string;
  night: (n: number) => string;
  checkOutOn: (date: string) => string;
  longerStay: string;
  longerStayDesc: string;
  typeADatePrompt: string;
  howManyNightsPrompt: string;

  roomListBody: string;
  roomListButton: string;
  roomListDesc: (price: number, capacity: number) => string;
  /** "₹1,299 for 2 guests" — the rate for THIS party, not a "from" price. */
  roomPriceForParty: (price: number, guests: number) => string;
  /** Same, when the hotel has published no rate for a party this size. */
  roomPriceForPartyApprox: (price: number, guests: number) => string;
  fullyBooked: string;
  pastDateRejected: string;
  mediaNoticed: string;
  manageBookingBody: (ref: string, room: string, dates: string) => string;
  manageBookingButton: string;
  manageCancel: string;
  manageChangeDates: string;
  manageKeep: string;
  bookingCancelled: (ref: string) => string;
  rescheduleStart: string;
  bookingKept: (ref: string) => string;
  noBookingFound: string;
  continueAnyway: string;
  farewell: string;
  /**
   * Takes no count, deliberately.
   *
   * It used to read "We have 2 rooms free for your dates". That number was
   * never inventory — it is how many room TYPES survived the capacity and
   * availability filters, so a party of three saw "2 rooms free" purely
   * because the third room sleeps two. A guest reads that as a hotel one
   * booking from full, which either invents scarcity or makes the property
   * look tiny. Reported as losing customers, and it would.
   *
   * The list itself already shows exactly what is on offer. Counting it out
   * loud adds nothing true and takes away a sale.
   */
  roomChoiceBody: () => string;
  /**
   * Same list, but for a guest who has NOT given dates yet.
   *
   * The dated version claims "free for your dates", which is a statement about
   * an availability check. Said to someone who never mentioned a date it is
   * simply untrue, and it is the kind of untrue that costs a booking: the
   * guest reasonably reads it as confirmed for the days they had in mind.
   */
  roomChoiceBodyNoDates: () => string;
  /**
   * Reply to the post-booking "I have a question" tap.
   *
   * Deliberately promises a person rather than answering. Once a booking
   * exists the conversation is handed to reception (see lib/crm/handover.ts),
   * so a person genuinely is the next responder — and the assistant is
   * forbidden from the things a booked guest usually asks about anyway
   * (payment, early check-in, an invoice).
   */
  postBookingQuestionAck: string;
  /** Caption sent alongside the hotel's map pin. */
  locationCaption: string;
  /**
   * Said back once both dates are settled, before any room is shown.
   *
   * Reported live: a guest tapped "This weekend" and the very next message was
   * a room list — so the first time their actual dates appeared was already
   * inside a booking. Repeating the range, with the hotel's own check-in and
   * check-out times, gives them one clear chance to say "no, Friday" before
   * choosing a room.
   */
  stayConfirmed: (stay: string, checkInTime: string | null, checkOutTime: string | null) => string;
  /**
   * A corporate or group enquiry — several rooms at once.
   *
   * Kept as its own branch rather than a bigger number in the party-size
   * question, because it is a different sale: rates are negotiated, a block of
   * rooms has to be held, and there is usually an invoice. None of that is
   * something the assistant may decide, so this path collects the shape of the
   * request and hands it to a person.
   */
  guestGroup: string;
  groupRoomsBody: string;
  rooms3to5: string;
  rooms6to10: string;
  rooms10plus: string;
  groupHandover: (rooms: string) => string;
  /**
   * A stated party size bigger than any single room here holds.
   *
   * Distinct from groupHandover: that one is chosen by the guest tapping
   * "Group / corporate". This fires when someone types a number no listed
   * room can fit — offering rooms none of which genuinely hold them would
   * waste their time and ours, so it goes straight to a person instead.
   */
  partyTooLargeHandover: (guests: number, maxCapacity: number) => string;
  /** Row label offering directions. */
  locationRow: string;
  /** Row offering a phone call, and the message carrying the number. */
  callRow: string;
  callRowDesc: string;
  callBody: (phone: string) => string;
  locationRowDesc: string;
  bookRoom: (name: string) => string;
  knowMore: string;
  knowMoreDesc: string;
  offersBody: string;
  offersButton: string;
  offerDetail: (title: string, discount: string, code: string) => string;
}

const EN: Strings = {
  greetAfterLanguage: "Great! How can I help you today? 😊",
  greetMenuBody: "How may I help you today? 😊",
  greetBook: "I want to book a room",
  greetAvailability: "Availability & price",
  greetAvailabilityDesc: "See our real rooms and rates",
  greetQuestion: "I need more details",
  greetQuestionDesc: "Check-in, parking, policies & more",
  chooseButton: "Choose",

  guestCountBody: "How many people will be staying? 😊",
  guestJustMe: "Just me",
  guest2: "2 people",
  guest3Plus: "3 people",

  datesBody: "When are you looking to stay?",
  datesButton: "Choose dates",
  dateToday: "Today",
  dateTomorrow: "Tomorrow",
  dateWeekend: "This weekend",
  dateNextWeek: "Next week",
  dateExact: "Pick exact dates",

  roomResponseBody: "Would you like to go ahead with this room?",
  roomBook: "Book this room",
  roomOther: "See other options",
  roomPhotos: "View photos",

  confirmBody: "Ready to confirm your booking? 🎉",
  confirmButton: "Confirm",
  confirmYes: "Confirm booking",
  confirmNotYet: "Not yet",
  confirmSoftDecline: "No worries at all — take your time! 😊 Just tap Confirm booking whenever you're ready.",
  confirmGeneric: "Great, glad that works for you! 🎉 Tap Confirm booking below and I'll get you an instant reference code — pay at the counter when you arrive!",
  confirmWithSummary: (room, ci, co) =>
    `Just to confirm: ${room}, check-in ${ci} and check-out ${co}. Tap Confirm booking below and I'll get you an instant reference code — pay at the counter when you arrive! 🎉`,

  priceObjectionBody: "No worries — want a more budget-friendly option, or to see our current offers? 😊",
  priceCheaper: "See cheaper room",
  priceOffers: "Show me offers",
  priceContinue: "Continue anyway",

  postBookingBody: "Anything else I can help with?",
  postBookingQuestion: "I have a question",
  postBookingDone: "All set, thanks!",

  checkInPickerBody: "Which day would you like to check in?",
  checkInPickerButton: "Pick a date",
  labelToday: "Today",
  labelTomorrow: "Tomorrow",
  anotherDate: "Another date",
  anotherDateDesc: "Type the date you want",
  nightsBody: (checkIn) => `Checking in ${checkIn} — how many nights?`,
  nightsButton: "Pick nights",
  night: (n) => `${n} night${n === 1 ? "" : "s"}`,
  checkOutOn: (date) => `Check out ${date}`,
  longerStay: "Longer stay",
  longerStayDesc: "Tell me how long you'd like to stay",
  typeADatePrompt: "No problem — which day would you like to check in? Just type the date (e.g. 25 Aug) 😊",
  howManyNightsPrompt: "Sure — how many nights would you like to stay? Just type the number 😊",

  roomListBody: "Here's everything we've got — tap a room to hear more about it:",
  roomListButton: "See rooms",
  roomListDesc: (price, capacity) => `From ₹${price}/night · up to ${capacity} person${capacity === 1 ? "" : "s"}`,
  roomPriceForParty: (price, guests) => `₹${price.toLocaleString("en-IN")}/night for ${guests} person${guests === 1 ? "" : "s"}`,
  roomPriceForPartyApprox: (price, guests) => `From ₹${price.toLocaleString("en-IN")}/night · rate for ${guests} confirmed by our team`,
  fullyBooked: "Ah, we're fully booked for those dates 😔 Would another date work for you?",
  pastDateRejected: "That date has already passed 😅 Which dates did you mean? Pick one below and I'll check availability.",
  mediaNoticed: "Thanks for sending that! 😊 I can't open attachments here — could you tell me in a message what you need?",
  manageBookingBody: (ref, room, dates) => `You're booked: ${room} · ${dates} · ref ${ref}. What would you like to do?`,
  manageBookingButton: "Choose",
  manageCancel: "Cancel booking",
  manageChangeDates: "Change dates",
  manageKeep: "Keep it as is",
  bookingCancelled: (ref) => `Done — booking ${ref} is cancelled. Sorry it didn't work out! Message me anytime if you'd like to rebook. 😊`,
  rescheduleStart: "No problem — let's find you new dates. When would you like to stay?",
  bookingKept: (ref) => `Great — booking ${ref} stays as it is. See you soon! 🎉`,
  noBookingFound: "I can't find an active booking for this number. If you booked under a different number, our team can help — shall I pass this on?",
  continueAnyway: "Perfect — shall I lock this room in for you?",
  farewell: "Lovely — see you soon! 😊 Message me anytime if anything comes up.",
  roomChoiceBody: () => `Here's what we have for your dates 😊 Which one would you like?`,
  roomChoiceBodyNoDates: () => `Here are our rooms 😊 Tell me your dates and I'll get one ready — or pick one to start.`,
  postBookingQuestionAck: `Of course — go ahead and type your question here. Our team has your booking and will reply personally, usually within a few minutes 😊`,
  locationCaption: `Here's our exact location 📍 Tap it for directions.`,
  stayConfirmed: (stay, checkInTime, checkOutTime) =>
    `Perfect — ${stay}.` +
    (checkInTime || checkOutTime
      ? `
Check-in ${checkInTime ? `from ${checkInTime}` : "as usual"}, check-out ${checkOutTime ? `by ${checkOutTime}` : "as usual"}.`
      : ""),
  guestGroup: "Group / corporate",
  groupRoomsBody: "Happy to help with a group booking 😊 Roughly how many rooms do you need?",
  rooms3to5: "3–5 rooms",
  rooms6to10: "6–10 rooms",
  rooms10plus: "More than 10",
  groupHandover: (rooms) => `Thanks! For ${rooms}, our team handles the rates and blocks the rooms personally — they'll message you here shortly. If you can share your dates and company name meanwhile, that speeds things up 😊`,
  partyTooLargeHandover: (guests, maxCapacity) => `For ${guests} of you our rooms (up to ${maxCapacity} each) won't all fit in one — let me get our team to work out the best combination for you, they'll message you here shortly 😊`,
  locationRow: "Where are you?",
  callRow: "Call us",
  callRowDesc: "Speak to reception directly",
  callBody: (phone) => `Of course — tap to call us: ${phone}

We're happy to help over the phone 😊`,
  locationRowDesc: "Get our exact location and directions",
  bookRoom: (name) => `Book ${name}`,
  knowMore: "Know more",
  knowMoreDesc: "Check-in, parking, policies & more",
  offersBody: "Here's what's running right now — tap one to learn more:",
  offersButton: "See offers",
  offerDetail: (title, discount, code) =>
    `${title} — ${discount}. Quote code ${code} when you book and we'll apply it. Shall we get your room sorted? 😊`,
};

const HI: Strings = {
  greetAfterLanguage: "बढ़िया! आज मैं आपकी कैसे मदद करूँ? 😊",
  greetMenuBody: "आज मैं आपकी कैसे मदद करूँ? 😊",
  greetBook: "कमरा बुक करना है",
  greetAvailability: "उपलब्धता और दाम",
  greetAvailabilityDesc: "हमारे असली कमरे और रेट देखें",
  greetQuestion: "और जानकारी चाहिए",
  greetQuestionDesc: "चेक-इन, पार्किंग, नियम वग़ैरह",
  chooseButton: "चुनें",

  guestCountBody: "कितने लोग रुकेंगे? 😊",
  guestJustMe: "सिर्फ़ मैं",
  guest2: "2 लोग",
  guest3Plus: "3 लोग",

  datesBody: "आप कब ठहरना चाहते हैं?",
  datesButton: "तारीख़ चुनें",
  dateToday: "आज",
  dateTomorrow: "कल",
  dateWeekend: "इस वीकेंड",
  dateNextWeek: "अगले हफ़्ते",
  dateExact: "सही तारीख़ चुनें",

  roomResponseBody: "क्या यह कमरा बुक करें?",
  roomBook: "यह कमरा बुक करें",
  roomOther: "और विकल्प देखें",
  roomPhotos: "फ़ोटो देखें",

  confirmBody: "बुकिंग कन्फ़र्म करें? 🎉",
  confirmButton: "कन्फ़र्म",
  confirmYes: "बुकिंग कन्फ़र्म करें",
  confirmNotYet: "अभी नहीं",
  confirmSoftDecline: "कोई बात नहीं — आराम से सोचिए! 😊 जब तैयार हों, बुकिंग कन्फ़र्म करें दबा दीजिए।",
  confirmGeneric: "बढ़िया! 🎉 नीचे बुकिंग कन्फ़र्म करें दबाइए और तुरंत रेफ़रेंस कोड पाइए — पैसे आने पर काउंटर पर दीजिए!",
  confirmWithSummary: (room, ci, co) =>
    `कन्फ़र्म कर लें: ${room}, चेक-इन ${ci} और चेक-आउट ${co}। नीचे बुकिंग कन्फ़र्म करें दबाइए — तुरंत रेफ़रेंस कोड मिलेगा, पैसे काउंटर पर! 🎉`,

  priceObjectionBody: "कोई बात नहीं — सस्ता कमरा देखें या हमारे मौजूदा ऑफ़र? 😊",
  priceCheaper: "सस्ता कमरा देखें",
  priceOffers: "ऑफ़र दिखाएँ",
  priceContinue: "इसी के साथ चलें",

  postBookingBody: "और कुछ मदद चाहिए?",
  postBookingQuestion: "एक सवाल है",
  postBookingDone: "बस, धन्यवाद!",

  checkInPickerBody: "आप किस दिन चेक-इन करना चाहेंगे?",
  checkInPickerButton: "तारीख़ चुनें",
  labelToday: "आज",
  labelTomorrow: "कल",
  anotherDate: "कोई और तारीख़",
  anotherDateDesc: "अपनी तारीख़ लिखिए",
  nightsBody: (checkIn) => `चेक-इन ${checkIn} — कितनी रातें?`,
  nightsButton: "रातें चुनें",
  night: (n) => `${n} रात${n === 1 ? "" : "ें"}`,
  checkOutOn: (date) => `चेक-आउट ${date}`,
  longerStay: "ज़्यादा दिन",
  longerStayDesc: "बताइए कितने दिन रुकना है",
  typeADatePrompt: "कोई बात नहीं — आप किस दिन चेक-इन करेंगे? तारीख़ लिख दीजिए (जैसे 25 अगस्त) 😊",
  howManyNightsPrompt: "ज़रूर — कितनी रातें रुकना चाहेंगे? बस नंबर लिख दीजिए 😊",

  roomListBody: "ये हैं हमारे सारे कमरे — किसी पर टैप करके और जानिए:",
  roomListButton: "कमरे देखें",
  roomListDesc: (price, capacity) => `₹${price}/रात से · ${capacity} लोग तक`,
  roomPriceForParty: (price, guests) => `${guests} लोगों के लिए ₹${price.toLocaleString("en-IN")}/रात`,
  roomPriceForPartyApprox: (price, guests) => `₹${price.toLocaleString("en-IN")}/रात से · ${guests} लोगों का रेट टीम बताएगी`,
  fullyBooked: "अरे, उन तारीख़ों पर सब बुक है 😔 कोई और तारीख़ चलेगी?",
  pastDateRejected: "वह तारीख़ तो निकल चुकी है 😅 आपका मतलब किन तारीख़ों से था? नीचे से चुनिए, मैं उपलब्धता देख लेती हूँ।",
  mediaNoticed: "भेजने के लिए शुक्रिया! 😊 मैं यहाँ अटैचमेंट नहीं खोल पाती — मैसेज में बता दीजिए आपको क्या चाहिए?",
  manageBookingBody: (ref, room, dates) => `आपकी बुकिंग: ${room} · ${dates} · रेफ़ ${ref}। आप क्या करना चाहेंगे?`,
  manageBookingButton: "चुनें",
  manageCancel: "बुकिंग रद्द करें",
  manageChangeDates: "तारीख़ बदलें",
  manageKeep: "ऐसे ही रहने दें",
  bookingCancelled: (ref) => `हो गया — बुकिंग ${ref} रद्द कर दी गई है। दोबारा बुक करना हो तो कभी भी मैसेज कीजिए। 😊`,
  rescheduleStart: "कोई बात नहीं — नई तारीख़ें देख लेते हैं। आप कब ठहरना चाहेंगे?",
  bookingKept: (ref) => `बढ़िया — बुकिंग ${ref} वैसी ही रहेगी। जल्दी मिलते हैं! 🎉`,
  noBookingFound: "इस नंबर पर कोई चालू बुकिंग नहीं मिली। अगर किसी और नंबर से बुक की थी, तो हमारी टीम मदद कर देगी — भेज दूँ?",
  continueAnyway: "बढ़िया — यही कमरा बुक कर दूँ?",
  farewell: "बहुत बढ़िया — जल्दी मिलते हैं! 😊 कुछ भी हो तो मैसेज कीजिए।",
  roomChoiceBody: () => `आपकी तारीख़ों के लिए ये रहे हमारे कमरे 😊 कौन सा पसंद करेंगे?`,
  roomChoiceBodyNoDates: () => `ये रहे हमारे कमरे 😊 अपनी तारीख़ें बताइए, मैं तैयार करवा दूँगी — या कोई एक चुन लीजिए.`,
  postBookingQuestionAck: `ज़रूर — अपना सवाल यहीं लिख दीजिए. आपकी बुकिंग हमारी टीम के पास है, वे कुछ ही मिनटों में खुद जवाब देंगे 😊`,
  locationCaption: `ये रही हमारी लोकेशन 📍 रास्ते के लिए टैप कीजिए.`,
  stayConfirmed: (stay, checkInTime, checkOutTime) =>
    `बढ़िया — ${stay}.` +
    (checkInTime || checkOutTime
      ? `
चेक-इन ${checkInTime ? `${checkInTime} से` : "सामान्य समय पर"}, चेक-आउट ${checkOutTime ? `${checkOutTime} तक` : "सामान्य समय पर"}.`
      : ""),
  guestGroup: "ग्रुप / कॉर्पोरेट",
  groupRoomsBody: "ग्रुप बुकिंग में मदद करके खुशी होगी 😊 लगभग कितने कमरे चाहिए?",
  rooms3to5: "3–5 कमरे",
  rooms6to10: "6–10 कमरे",
  rooms10plus: "10 से ज़्यादा",
  groupHandover: (rooms) => `धन्यवाद! ${rooms} के लिए हमारी टीम खुद रेट तय करके कमरे ब्लॉक करती है — वे जल्द ही यहीं मैसेज करेंगे. इस बीच अपनी तारीख़ें और कंपनी का नाम बता दें तो और तेज़ी होगी 😊`,
  partyTooLargeHandover: (guests, maxCapacity) => `आप ${guests} लोगों के लिए हमारे कमरे (हर एक में ${maxCapacity} तक) अकेले पूरे नहीं पड़ेंगे — हमारी टीम आपके लिए सही व्यवस्था कर देगी, वे जल्द ही यहीं मैसेज करेंगे 😊`,
  locationRow: "हम कहाँ हैं?",
  callRow: "हमें कॉल करें",
  callRowDesc: "सीधे रिसेप्शन से बात करें",
  callBody: (phone) => `ज़रूर — कॉल करने के लिए टैप कीजिए: ${phone}

फ़ोन पर बात करके भी मदद कर सकते हैं 😊`,
  locationRowDesc: "हमारी सटीक लोकेशन और रास्ता",
  bookRoom: (name) => `${name} बुक करें`,
  knowMore: "और जानकारी",
  knowMoreDesc: "चेक-इन, पार्किंग, नियम वग़ैरह",
  offersBody: "अभी ये ऑफ़र चल रहे हैं — जानने के लिए टैप कीजिए:",
  offersButton: "ऑफ़र देखें",
  offerDetail: (title, discount, code) =>
    `${title} — ${discount}। बुकिंग के समय कोड ${code} बता दीजिए, हम लगा देंगे। कमरा तय कर लें? 😊`,
};

const TE: Strings = {
  greetAfterLanguage: "సరే! ఈరోజు మీకు ఎలా సహాయం చేయగలను? 😊",
  greetMenuBody: "ఈరోజు మీకు ఎలా సహాయం చేయగలను? 😊",
  greetBook: "రూమ్ బుక్ చేయాలి",
  greetAvailability: "అందుబాటు & ధర",
  greetAvailabilityDesc: "మా నిజమైన రూమ్‌లు, ధరలు చూడండి",
  greetQuestion: "మరిన్ని వివరాలు కావాలి",
  greetQuestionDesc: "చెక్-ఇన్, పార్కింగ్, నిబంధనలు",
  chooseButton: "ఎంచుకోండి",

  guestCountBody: "ఎంత మంది ఉంటారు? 😊",
  guestJustMe: "నేను ఒక్కడినే",
  guest2: "2 మంది",
  guest3Plus: "3 మంది",

  datesBody: "మీరు ఎప్పుడు ఉండాలనుకుంటున్నారు?",
  datesButton: "తేదీలు ఎంచుకోండి",
  dateToday: "ఈరోజు",
  dateTomorrow: "రేపు",
  dateWeekend: "ఈ వారాంతం",
  dateNextWeek: "వచ్చే వారం",
  dateExact: "కచ్చితమైన తేదీలు",

  roomResponseBody: "ఈ రూమ్ బుక్ చేయాలా?",
  roomBook: "ఈ రూమ్ బుక్ చేయండి",
  roomOther: "ఇతర ఎంపికలు",
  roomPhotos: "ఫోటోలు చూడండి",

  confirmBody: "బుకింగ్ ఖరారు చేయాలా? 🎉",
  confirmButton: "ఖరారు",
  confirmYes: "బుకింగ్ ఖరారు చేయండి",
  confirmNotYet: "ఇప్పుడు కాదు",
  confirmSoftDecline: "పర్వాలేదు — తీరిగ్గా ఆలోచించండి! 😊 సిద్ధంగా ఉన్నప్పుడు బుకింగ్ ఖరారు చేయండి నొక్కండి.",
  confirmGeneric: "చాలా బాగుంది! 🎉 కింద బుకింగ్ ఖరారు చేయండి నొక్కితే వెంటనే రిఫరెన్స్ కోడ్ వస్తుంది — డబ్బు వచ్చినప్పుడు కౌంటర్‌లో ఇవ్వండి!",
  confirmWithSummary: (room, ci, co) =>
    `ఖరారు చేద్దాం: ${room}, చెక్-ఇన్ ${ci}, చెక్-అవుట్ ${co}. కింద బుకింగ్ ఖరారు చేయండి నొక్కండి — వెంటనే రిఫరెన్స్ కోడ్, డబ్బు కౌంటర్‌లో! 🎉`,

  priceObjectionBody: "పర్వాలేదు — తక్కువ ధర రూమ్ చూడాలా, లేక మా ఆఫర్లు? 😊",
  priceCheaper: "తక్కువ ధర రూమ్",
  priceOffers: "ఆఫర్లు చూపండి",
  priceContinue: "ఇదే కొనసాగించండి",

  postBookingBody: "ఇంకా ఏమైనా సహాయం కావాలా?",
  postBookingQuestion: "ఒక ప్రశ్న ఉంది",
  postBookingDone: "అంతా అయ్యింది, ధన్యవాదాలు!",

  checkInPickerBody: "మీరు ఏ రోజు చెక్-ఇన్ చేయాలనుకుంటున్నారు?",
  checkInPickerButton: "తేదీ ఎంచుకోండి",
  labelToday: "ఈరోజు",
  labelTomorrow: "రేపు",
  anotherDate: "వేరే తేదీ",
  anotherDateDesc: "మీ తేదీ టైప్ చేయండి",
  nightsBody: (checkIn) => `చెక్-ఇన్ ${checkIn} — ఎన్ని రాత్రులు?`,
  nightsButton: "రాత్రులు ఎంచుకోండి",
  night: (n) => `${n} రాత్రి${n === 1 ? "" : "లు"}`,
  checkOutOn: (date) => `చెక్-అవుట్ ${date}`,
  longerStay: "ఎక్కువ రోజులు",
  longerStayDesc: "ఎన్ని రోజులు ఉంటారో చెప్పండి",
  typeADatePrompt: "పర్వాలేదు — ఏ రోజు చెక్-ఇన్ చేస్తారు? తేదీ టైప్ చేయండి (ఉదా. 25 ఆగస్టు) 😊",
  howManyNightsPrompt: "తప్పకుండా — ఎన్ని రాత్రులు ఉంటారు? సంఖ్య టైప్ చేయండి 😊",

  roomListBody: "ఇవే మా రూమ్‌లు — వివరాలకు ఏదైనా నొక్కండి:",
  roomListButton: "రూమ్‌లు చూడండి",
  roomListDesc: (price, capacity) => `₹${price}/రాత్రి నుండి · ${capacity} మంది వరకు`,
  roomPriceForParty: (price, guests) => `${guests} మందికి ₹${price.toLocaleString("en-IN")}/రాత్రి`,
  roomPriceForPartyApprox: (price, guests) => `₹${price.toLocaleString("en-IN")}/రాత్రి నుండి · ${guests} మంది రేటు టీమ్ చెబుతుంది`,
  fullyBooked: "అయ్యో, ఆ తేదీలకు అన్నీ బుక్ అయ్యాయి 😔 వేరే తేదీ కుదురుతుందా?",
  pastDateRejected: "ఆ తేదీ అప్పుడే గడిచిపోయింది 😅 మీరు ఏ తేదీలు అనుకున్నారు? కింద ఎంచుకోండి, అందుబాటు చూస్తాను.",
  mediaNoticed: "పంపినందుకు ధన్యవాదాలు! 😊 ఇక్కడ అటాచ్‌మెంట్‌లు తెరవలేను — మీకు ఏం కావాలో మెసేజ్‌లో చెప్పండి?",
  manageBookingBody: (ref, room, dates) => `మీ బుకింగ్: ${room} · ${dates} · రెఫ్ ${ref}. మీరు ఏం చేయాలనుకుంటున్నారు?`,
  manageBookingButton: "ఎంచుకోండి",
  manageCancel: "బుకింగ్ రద్దు చేయండి",
  manageChangeDates: "తేదీలు మార్చండి",
  manageKeep: "ఇలాగే ఉంచండి",
  bookingCancelled: (ref) => `అయ్యింది — బుకింగ్ ${ref} రద్దు చేయబడింది. మళ్లీ బుక్ చేయాలంటే ఎప్పుడైనా మెసేజ్ చేయండి. 😊`,
  rescheduleStart: "పర్వాలేదు — కొత్త తేదీలు చూద్దాం. మీరు ఎప్పుడు ఉండాలనుకుంటున్నారు?",
  bookingKept: (ref) => `చాలా బాగుంది — బుకింగ్ ${ref} అలాగే ఉంటుంది. త్వరలో కలుద్దాం! 🎉`,
  noBookingFound: "ఈ నంబర్‌కి యాక్టివ్ బుకింగ్ కనిపించలేదు. వేరే నంబర్‌తో బుక్ చేసి ఉంటే మా టీమ్ సహాయం చేస్తుంది — పంపమంటారా?",
  continueAnyway: "చాలా బాగుంది — ఈ రూమ్ ఖరారు చేయనా?",
  farewell: "చాలా బాగుంది — త్వరలో కలుద్దాం! 😊 ఏదైనా ఉంటే మెసేజ్ చేయండి.",
  roomChoiceBody: () => `మీ తేదీలకు మా రూమ్‌లు ఇవి 😊 ఏది కావాలి?`,
  roomChoiceBodyNoDates: () => `ఇవి మా రూమ్‌లు 😊 మీ తేదీలు చెప్పండి, సిద్ధం చేస్తాను — లేదా ఒకటి ఎంచుకోండి.`,
  postBookingQuestionAck: `తప్పకుండా — మీ ప్రశ్న ఇక్కడే టైప్ చేయండి. మీ బుకింగ్ మా టీమ్ దగ్గర ఉంది, వాళ్ళు కొద్ది నిమిషాల్లో స్వయంగా బదులిస్తారు 😊`,
  locationCaption: `ఇదే మా లొకేషన్ 📍 దారి కోసం ట్యాప్ చేయండి.`,
  stayConfirmed: (stay, checkInTime, checkOutTime) =>
    `సరే — ${stay}.` +
    (checkInTime || checkOutTime
      ? `
చెక్-ఇన్ ${checkInTime ? `${checkInTime} నుండి` : "సాధారణ సమయం"}, చెక్-అవుట్ ${checkOutTime ? `${checkOutTime} లోపు` : "సాధారణ సమయం"}.`
      : ""),
  guestGroup: "గ్రూప్ / కార్పొరేట్",
  groupRoomsBody: "గ్రూప్ బుకింగ్‌కి సాయం చేస్తాను 😊 సుమారు ఎన్ని రూమ్‌లు కావాలి?",
  rooms3to5: "3–5 రూమ్‌లు",
  rooms6to10: "6–10 రూమ్‌లు",
  rooms10plus: "10 కంటే ఎక్కువ",
  groupHandover: (rooms) => `ధన్యవాదాలు! ${rooms} కోసం మా టీమ్ స్వయంగా రేట్లు నిర్ణయించి రూమ్‌లు బ్లాక్ చేస్తుంది — వాళ్ళు త్వరలో ఇక్కడే మెసేజ్ చేస్తారు. ఈలోపు మీ తేదీలు, కంపెనీ పేరు చెబితే వేగంగా ఉంటుంది 😊`,
  partyTooLargeHandover: (guests, maxCapacity) => `మీరు ${guests} మంది కోసం మా రూమ్‌లు (ఒక్కోటి ${maxCapacity} వరకు) సరిపోకపోవచ్చు — మా టీమ్ మీకు సరైన ఏర్పాటు చేస్తుంది, వాళ్ళు త్వరలో ఇక్కడే మెసేజ్ చేస్తారు 😊`,
  locationRow: "మీరు ఎక్కడ ఉన్నారు?",
  callRow: "మాకు కాల్ చేయండి",
  callRowDesc: "నేరుగా రిసెప్షన్‌తో మాట్లాడండి",
  callBody: (phone) => `తప్పకుండా — కాల్ చేయడానికి ట్యాప్ చేయండి: ${phone}

ఫోన్‌లో కూడా సాయం చేస్తాం 😊`,
  locationRowDesc: "మా కచ్చితమైన లొకేషన్ మరియు దారి",
  bookRoom: (name) => `${name} బుక్ చేయండి`,
  knowMore: "మరిన్ని వివరాలు",
  knowMoreDesc: "చెక్-ఇన్, పార్కింగ్, నిబంధనలు",
  offersBody: "ప్రస్తుతం ఉన్న ఆఫర్లు — వివరాలకు నొక్కండి:",
  offersButton: "ఆఫర్లు చూడండి",
  offerDetail: (title, discount, code) =>
    `${title} — ${discount}. బుక్ చేసేటప్పుడు ${code} కోడ్ చెప్పండి, వర్తింపజేస్తాం. రూమ్ చూద్దామా? 😊`,
};

const TABLE: Record<GuestLanguage, Strings> = { en: EN, hi: HI, te: TE };

export function t(language: GuestLanguage | null | undefined): Strings {
  return TABLE[resolveLanguage(language)];
}
