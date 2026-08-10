import { describe, expect, it, vi } from "vitest";
import {
  CONFIRM_BOOKING_BUTTON_ID,
  GREET_QUESTION_BUTTON_ID,
  InteractivePrompt,
  ROOM_BOOK_BUTTON_ID,
  SEE_OTHER_ROOMS_BUTTON_ID,
  SHOW_OFFERS_BUTTON_ID,
  VIEW_PHOTOS_BUTTON_ID,
  confirmBookingPrompt,
  dateQuickPickPrompt,
  extractInteractivePrompt,
  greetMenuPrompt,
  guestCountPrompt,
  hasExpressedBookingIntent,
  hasStatedDates,
  hasStatedGuestCount,
  looksLikeBareGreeting,
  looksLikeObviousLanguage,
  looksLikePriceOrOfferSignal,
  mentionsRoomPrice,
  postBookingPrompt,
  predictedStageInstruction,
  resolveDeterministicReply,
  roomResponsePrompt,
  selectDeterministicInteractive,
} from "./interactive-prompts";

// Every stage renders as a List Message now (no reply-arrow icon anywhere,
// including Confirm booking, per explicit user request) -- this narrows the
// union and throws a clear, loud failure (not a silently-skipped assertion)
// if a prompt's actual shape doesn't match what a test expects.
function asRows(prompt: InteractivePrompt | undefined): { id: string; title: string; description?: string }[] {
  if (prompt?.type !== "list") throw new Error(`expected a list-type prompt, got ${prompt?.type}`);
  return prompt.rows;
}

describe("extractInteractivePrompt", () => {
  it("returns the text unchanged when no BUTTONS marker is present", () => {
    const result = extractInteractivePrompt("Check-out is by 11:00 AM 🕚");
    expect(result).toEqual({ text: "Check-out is by 11:00 AM 🕚" });
  });

  it("strips the marker and resolves a known key", () => {
    const result = extractInteractivePrompt("How many guests will be staying?\nBUTTONS: GUEST_COUNT");
    expect(result.text).toBe("How many guests will be staying?");
    expect(asRows(result.interactive)).toEqual([
      { id: "guests_1", title: "Just me" },
      { id: "guests_2", title: "2 people" },
      { id: "guests_3plus", title: "3+ people" },
    ]);
  });

  it("is case-insensitive on the key", () => {
    const result = extractInteractivePrompt("How many guests?\nbuttons: guest_count");
    expect(asRows(result.interactive)).toHaveLength(3);
  });

  it("resolves the ROOM_RESPONSE key at the RECOMMEND stage", () => {
    const result = extractInteractivePrompt("The Deluxe Room is ₹1,299/night with a great view.\nBUTTONS: ROOM_RESPONSE");
    expect(result.text).toBe("The Deluxe Room is ₹1,299/night with a great view.");
    expect(asRows(result.interactive).map((b) => b.id)).toEqual([ROOM_BOOK_BUTTON_ID, SEE_OTHER_ROOMS_BUTTON_ID, VIEW_PHOTOS_BUTTON_ID]);
  });

  it("falls back to plain text and warns on an unknown/hallucinated key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = extractInteractivePrompt("Sure thing!\nBUTTONS: MADE_UP_KEY");
    expect(result.text).toBe("Sure thing!");
    expect(result.interactive).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("MADE_UP_KEY"));
    warn.mockRestore();
  });

  it("only resolves the first marker if the model emits more than one", () => {
    const result = extractInteractivePrompt("Hi!\nBUTTONS: GUEST_COUNT\nBUTTONS: GUEST_COUNT");
    expect(result.text).toBe("Hi!");
    expect(asRows(result.interactive)).toHaveLength(3);
  });

  it("exports a stable CONFIRM_BOOKING_BUTTON_ID for downstream matching", () => {
    expect(CONFIRM_BOOKING_BUTTON_ID).toBe("confirm_booking");
  });

  it("resolves a marker that shares a line with prose, keeping the prose", () => {
    const result = extractInteractivePrompt("Awesome, you're going to love it there! BUTTONS: CONFIRM_BOOKING");
    expect(result.text).toBe("Awesome, you're going to love it there!");
    expect(asRows(result.interactive).map((b) => b.id)).toEqual([CONFIRM_BOOKING_BUTTON_ID, "not_yet"]);
  });

  it("resolves a key even with trailing punctuation right after it", () => {
    const result = extractInteractivePrompt("Great choice!\nBUTTONS: ROOM_RESPONSE.");
    expect(result.text).toBe("Great choice!");
    expect(asRows(result.interactive).map((b) => b.id)).toEqual([ROOM_BOOK_BUTTON_ID, SEE_OTHER_ROOMS_BUTTON_ID, VIEW_PHOTOS_BUTTON_ID]);
  });

  it("resolves the CONFIRM_BOOKING key at the CLOSE stage, using the exported button id", () => {
    const result = extractInteractivePrompt("Ready when you are!\nBUTTONS: CONFIRM_BOOKING");
    expect(result.text).toBe("Ready when you are!");
    expect(asRows(result.interactive)).toEqual([
      { id: CONFIRM_BOOKING_BUTTON_ID, title: "Confirm booking" },
      { id: "not_yet", title: "Not yet" },
    ]);
  });

  it("substitutes a non-empty fallback body when the model emits a bare marker with no sentence in front of it", () => {
    const result = extractInteractivePrompt("BUTTONS: CONFIRM_BOOKING");
    expect(result.text.length).toBeGreaterThan(0);
    expect(asRows(result.interactive)).toHaveLength(2);
  });

  it("substitutes a fallback body when only whitespace is left after stripping the marker", () => {
    const result = extractInteractivePrompt("   \n BUTTONS: GUEST_COUNT \n  ");
    expect(result.text.length).toBeGreaterThan(0);
    expect(asRows(result.interactive)).toHaveLength(3);
  });

  it("resolves the LANGUAGE_SELECT key, and ROOM_RESPONSE's 'see other options' button matches SEE_OTHER_ROOMS_BUTTON_ID", () => {
    const result = extractInteractivePrompt("Hi there! 😊\nBUTTONS: LANGUAGE_SELECT");
    expect(asRows(result.interactive)).toHaveLength(3);
    expect(asRows(result.interactive).map((b) => b.id)).toEqual(["lang_en", "lang_hi", "lang_te"]);

    const roomResponse = extractInteractivePrompt("Great room!\nBUTTONS: ROOM_RESPONSE");
    expect(asRows(roomResponse.interactive).map((b) => b.id)).toContain(SEE_OTHER_ROOMS_BUTTON_ID);
  });
});

describe("mentionsRoomPrice", () => {
  it("detects the standard '₹<amount>/night' price format", () => {
    expect(mentionsRoomPrice("Our Deluxe Room starts from ₹1,299/night")).toBe(true);
    expect(mentionsRoomPrice("₹999/night for a Classic Room")).toBe(true);
  });

  it("is not fooled by whitespace around the slash", () => {
    expect(mentionsRoomPrice("₹1499 / night for 2 guests")).toBe(true);
  });

  it("detects the 'per night' phrasing, not just the slash form", () => {
    expect(mentionsRoomPrice("The Deluxe Room is ₹1,299 per night")).toBe(true);
    expect(mentionsRoomPrice("Rooms start from ₹1299 per night")).toBe(true);
  });

  it("returns false when no price is mentioned", () => {
    expect(mentionsRoomPrice("Check-out is by 11:00 AM 🕚")).toBe(false);
    expect(mentionsRoomPrice("How many guests will be staying?")).toBe(false);
  });

  it("returns false for a non-per-night rupee mention", () => {
    expect(mentionsRoomPrice("There's a ₹100 discount available")).toBe(false);
  });

  it("also catches 'Rs.'/'INR' as realistic alternate currency markers -- live-caught gap: a weaker model naming a price without the literal ₹ symbol silently broke ROOM_RESPONSE detection", () => {
    expect(mentionsRoomPrice("The Classic Room is Rs.999/night")).toBe(true);
    expect(mentionsRoomPrice("Starts from Rs 1,299 per night")).toBe(true);
    expect(mentionsRoomPrice("INR 999/night for 2 guests")).toBe(true);
  });

  it("catches the ₹ symbol paired with a translated 'night' word -- live-caught: a Telugu reply kept ₹ but wrote '/రాత్రి' instead of '/night'", () => {
    expect(mentionsRoomPrice("మా ప్రీమియం రూమ్ ₹1,599/రాత్రి నుండి మొదలవుతుంది")).toBe(true);
    expect(mentionsRoomPrice("Room available hai, ₹2500/रात्रि se start hota hai")).toBe(true);
    expect(mentionsRoomPrice("₹999 per रात के लिए")).toBe(true);
  });
});

describe("looksLikePriceOrOfferSignal", () => {
  it("detects price pushback", () => {
    expect(looksLikePriceOrOfferSignal("that's too expensive for us")).toBe(true);
    expect(looksLikePriceOrOfferSignal("do you have anything cheaper")).toBe(true);
    expect(looksLikePriceOrOfferSignal("that's a bit pricey")).toBe(true);
  });

  it("detects offer/discount interest", () => {
    expect(looksLikePriceOrOfferSignal("any discount available?")).toBe(true);
    expect(looksLikePriceOrOfferSignal("do you have any offers running")).toBe(true);
    expect(looksLikePriceOrOfferSignal("got a promo code?")).toBe(true);
  });

  it("returns false for ordinary messages with no price/offer signal", () => {
    expect(looksLikePriceOrOfferSignal("sounds good, let's book it")).toBe(false);
    expect(looksLikePriceOrOfferSignal("2 guests this weekend")).toBe(false);
  });
});

describe("roomResponsePrompt", () => {
  it("returns the same three buttons as the ROOM_RESPONSE catalog entry", () => {
    const prompt = roomResponsePrompt();
    expect(asRows(prompt).map((b) => b.id)).toEqual([ROOM_BOOK_BUTTON_ID, SEE_OTHER_ROOMS_BUTTON_ID, VIEW_PHOTOS_BUTTON_ID]);
  });
});

describe("guestCountPrompt", () => {
  it("returns a list (not buttons) with the same three GUEST_COUNT rows -- no reply-arrow icon, per user request", () => {
    const prompt = guestCountPrompt();
    expect(prompt.type).toBe("list");
    expect(asRows(prompt).map((r) => r.id)).toEqual(["guests_1", "guests_2", "guests_3plus"]);
  });
});

describe("confirmBookingPrompt", () => {
  it("returns the same two buttons as the CONFIRM_BOOKING catalog entry, with the stable button id", () => {
    const prompt = confirmBookingPrompt();
    expect(asRows(prompt).map((b) => b.id)).toEqual([CONFIRM_BOOKING_BUTTON_ID, "not_yet"]);
  });
});

describe("postBookingPrompt", () => {
  it("returns the same two buttons as the POST_BOOKING catalog entry", () => {
    const prompt = postBookingPrompt();
    expect(asRows(prompt).map((b) => b.id)).toEqual(["post_booking_question", "post_booking_done"]);
  });
});

describe("GREET_QUESTION_BUTTON_ID / SHOW_OFFERS_BUTTON_ID", () => {
  it("are stable ids used both in the catalog and for the deterministic short-circuits", () => {
    expect(GREET_QUESTION_BUTTON_ID).toBe("greet_question");
    expect(SHOW_OFFERS_BUTTON_ID).toBe("show_offers");
  });
});

describe("ROOM_BOOK_BUTTON_ID", () => {
  it("is a stable id used both in the catalog and for the deterministic short-circuit", () => {
    expect(ROOM_BOOK_BUTTON_ID).toBe("room_book");
  });
});

describe("hasStatedGuestCount", () => {
  it("detects a plain number of guests", () => {
    expect(hasStatedGuestCount([], "2 guests please")).toBe(true);
    expect(hasStatedGuestCount([], "we'll be 4 people")).toBe(true);
  });

  it("detects common solo-traveller phrasing", () => {
    expect(hasStatedGuestCount([], "just me")).toBe(true);
    expect(hasStatedGuestCount([], "it's only me")).toBe(true);
  });

  it("returns false when no message (history or latest) mentions a count", () => {
    expect(hasStatedGuestCount([], "this weekend, budget 1500")).toBe(false);
  });

  it("finds a guest count stated earlier in history, not just the latest message", () => {
    const history = [
      { role: "user", content: "hi, 2 guests for this weekend" },
      { role: "assistant", content: "Our Deluxe Room is a great fit!" },
    ];
    expect(hasStatedGuestCount(history, "sounds good")).toBe(true);
  });

  it("ignores assistant messages when scanning for a stated count", () => {
    const history = [{ role: "assistant", content: "How many guests, e.g. 2 guests or 3+?" }];
    expect(hasStatedGuestCount(history, "not sure yet")).toBe(false);
  });

  it("detects 'for N' phrasing without the word guests (a real gap found live)", () => {
    expect(hasStatedGuestCount([], "a room for 2 this weekend")).toBe(true);
    expect(hasStatedGuestCount([], "book for 4")).toBe(true);
  });

  it("does not treat 'for N nights/days' (a duration) as a guest count", () => {
    expect(hasStatedGuestCount([], "book for 2 nights")).toBe(false);
    expect(hasStatedGuestCount([], "staying for 3 days")).toBe(false);
  });

  it("detects 'log'/'logon' -- Hindi/Hinglish for 'people' (a real gap found live: '2 log ke liye room chahiye' wasn't recognized)", () => {
    expect(hasStatedGuestCount([], "2 log ke liye room chahiye is weekend")).toBe(true);
    expect(hasStatedGuestCount([], "3 logon ke liye Premium Room theek hai")).toBe(true);
  });

  it("detects numbers spelled as words when paired with a noun -- a real gap found live: 'two people please' wasn't recognized at all since the pattern required a digit", () => {
    expect(hasStatedGuestCount([], "two people please")).toBe(true);
    expect(hasStatedGuestCount([], "three guests")).toBe(true);
  });

  it("detects 'couple'/'two of us' phrasings for a headcount of 2", () => {
    expect(hasStatedGuestCount([], "we're a couple")).toBe(true);
    expect(hasStatedGuestCount([], "just the two of us")).toBe(true);
    expect(hasStatedGuestCount([], "me and my wife")).toBe(true);
  });

  it("does NOT treat a bare 'couple' idiom (e.g. 'a couple of minutes') as a guest count", () => {
    expect(hasStatedGuestCount([], "give me a couple minutes to decide")).toBe(false);
  });

  it("recognizes a bare number as a guest count ONLY when it directly follows a 'how many guests' question -- the single most severe gap found live: a guest replying just '2' (an extremely common WhatsApp reply style) was never recognized, creating a genuine stuck loop where the same question re-fired forever", () => {
    const history = [{ role: "assistant", content: "How many people will be staying? 😊" }];
    expect(hasStatedGuestCount(history, "2")).toBe(true);
    expect(hasStatedGuestCount(history, "two")).toBe(true);
    expect(hasStatedGuestCount(history, "3+")).toBe(true);
  });

  it("does NOT treat a bare number as a guest count when it wasn't asked -- too ambiguous out of context (could be a room number, a price, anything)", () => {
    const history = [{ role: "assistant", content: "Which room would you like to see photos of?" }];
    expect(hasStatedGuestCount(history, "2")).toBe(false);
  });

  it("does NOT treat a bare number as a guest count with no prior assistant message at all", () => {
    expect(hasStatedGuestCount([], "2")).toBe(false);
  });
});

describe("hasStatedDates", () => {
  it("detects common relative-date phrasing", () => {
    expect(hasStatedDates([], "this weekend")).toBe(true);
    expect(hasStatedDates([], "next week works")).toBe(true);
    expect(hasStatedDates([], "tomorrow night")).toBe(true);
  });

  it("detects 'in N days' -- a real gap found live: this wholly relative phrasing had no anchor at all, risking the same stuck-loop class of bug as the guest-count gap above", () => {
    expect(hasStatedDates([], "in 3 days")).toBe(true);
    expect(hasStatedDates([], "we can come in 10 days")).toBe(true);
  });

  it("detects day and month names", () => {
    expect(hasStatedDates([], "arriving Friday")).toBe(true);
    expect(hasStatedDates([], "sometime in August")).toBe(true);
  });

  it("detects numeric date formats", () => {
    expect(hasStatedDates([], "15/8 to 17/8")).toBe(true);
    expect(hasStatedDates([], "the 21st")).toBe(true);
  });

  it("returns false when no date is mentioned anywhere", () => {
    expect(hasStatedDates([], "2 guests, budget 1500")).toBe(false);
  });

  it("does not false-positive on ordinary words that happen to start with a weekday/month abbreviation -- a real gap found live: 'last month' was read as a stated date, wrongly treating a complaint as booking intent", () => {
    expect(hasStatedDates([], "I stayed here last month and the wifi was terrible")).toBe(false);
    expect(hasStatedDates([], "maybe next time")).toBe(false);
    expect(hasStatedDates([], "do kids under 5 stay free")).toBe(false);
  });

  it("still detects full weekday/month names, not just the 3-letter abbreviation", () => {
    expect(hasStatedDates([], "let's say Monday")).toBe(true);
    expect(hasStatedDates([], "sometime in June")).toBe(true);
    expect(hasStatedDates([], "arriving in December")).toBe(true);
  });

  it("finds a date stated earlier in history", () => {
    const history = [{ role: "user", content: "checking in this weekend" }];
    expect(hasStatedDates(history, "sounds good")).toBe(true);
  });
});

describe("looksLikeObviousLanguage", () => {
  it("detects Devanagari script", () => {
    expect(looksLikeObviousLanguage("नमस्ते, kya rooms available hai")).toBe(true);
  });

  it("detects Telugu script", () => {
    expect(looksLikeObviousLanguage("నమస్కారం, rooms available unna?")).toBe(true);
  });

  it("does not treat Roman-script Hinglish as obvious", () => {
    expect(looksLikeObviousLanguage("kya rate hai is weekend ke liye")).toBe(false);
  });

  it("does not treat plain English as obvious", () => {
    expect(looksLikeObviousLanguage("Hi, do you have rooms available?")).toBe(false);
  });
});

describe("looksLikeBareGreeting", () => {
  it("detects common bare greetings, with or without trailing punctuation", () => {
    expect(looksLikeBareGreeting("Hi")).toBe(true);
    expect(looksLikeBareGreeting("hello!")).toBe(true);
    expect(looksLikeBareGreeting("Hii")).toBe(true);
    expect(looksLikeBareGreeting("hey there".replace(" there", ""))).toBe(true);
    expect(looksLikeBareGreeting("namaste")).toBe(true);
    expect(looksLikeBareGreeting("  Hello.  ")).toBe(true);
  });

  it("does not treat a greeting with real content attached as bare", () => {
    expect(looksLikeBareGreeting("Hi, do you have rooms available?")).toBe(false);
    expect(looksLikeBareGreeting("Hi, 2 guests this weekend")).toBe(false);
  });

  it("returns false for unrelated text", () => {
    expect(looksLikeBareGreeting("what's the checkout time")).toBe(false);
  });
});

describe("greetMenuPrompt / dateQuickPickPrompt", () => {
  it("greetMenuPrompt's 'View rooms' button reuses SEE_OTHER_ROOMS_BUTTON_ID for the deterministic room-list handler", () => {
    const prompt = greetMenuPrompt();
    expect(asRows(prompt).map((b) => b.id)).toContain(SEE_OTHER_ROOMS_BUTTON_ID);
  });

  it("dateQuickPickPrompt returns a list (not buttons) with five date-shortcut rows -- no reply-arrow icon, per user request", () => {
    const prompt = dateQuickPickPrompt();
    expect(prompt.type).toBe("list");
    expect(asRows(prompt).map((r) => r.id)).toEqual(["dates_today", "dates_tomorrow", "dates_weekend", "dates_nextweek", "dates_custom"]);
  });
});

describe("selectDeterministicInteractive", () => {
  const base = {
    isFirstReply: false,
    languageObvious: true,
    history: [] as { role: string; content: string }[],
    guestMessage: "",
    replyText: "",
    aiInteractive: undefined as ReturnType<typeof guestCountPrompt> | undefined,
  };

  it("offers LANGUAGE_SELECT on the first reply when language isn't obvious", () => {
    const result = selectDeterministicInteractive({ ...base, isFirstReply: true, languageObvious: false });
    expect(asRows(result).map((b) => b.id)).toEqual(["lang_en", "lang_hi", "lang_te"]);
  });

  it("offers GREET_MENU on the first reply when language is already obvious", () => {
    const result = selectDeterministicInteractive({ ...base, isFirstReply: true, languageObvious: true });
    expect(result).toEqual(greetMenuPrompt());
  });

  it("does NOT force LANGUAGE_SELECT/GREET_MENU on a first reply that's already information-rich (a severe mismatch found live)", () => {
    // "Hi, 2 guests, want a room this weekend" as the guest's first-ever
    // message: guest count is already known, so if the AI's reply names a
    // room, ROOM_RESPONSE must win over LANGUAGE_SELECT/GREET_MENU even
    // though isFirstReply is true.
    const result = selectDeterministicInteractive({
      ...base,
      isFirstReply: true,
      languageObvious: true,
      guestMessage: "Hi, 2 guests, want a room this weekend",
      replyText: "Our Deluxe Room starts from ₹1,299/night",
    });
    expect(result).toEqual(roomResponsePrompt());
  });

  it("offers GUEST_COUNT (not LANGUAGE_SELECT/GREET_MENU) on a rich first reply where only guest count is missing", () => {
    const result = selectDeterministicInteractive({
      ...base,
      isFirstReply: true,
      languageObvious: true,
      guestMessage: "Hi, I want to book a room this weekend",
      replyText: "Sure, how many guests?",
    });
    expect(result).toEqual(guestCountPrompt());
  });

  it("offers GUEST_COUNT whenever guest count is unknown, regardless of what else is in the reply", () => {
    const result = selectDeterministicInteractive({ ...base, guestMessage: "this weekend, budget 1500" });
    expect(result).toEqual(guestCountPrompt());
  });

  it("does NOT force GUEST_COUNT when the guest is trying to cancel/change an existing booking -- a real gap found live: 'I need to cancel my booking, reference HOT-9999' was hijacked into asking for a brand-new booking's guest count, completely ignoring the cancellation request", () => {
    const result = selectDeterministicInteractive({ ...base, guestMessage: "I need to cancel my booking, reference HOT-9999" });
    expect(result).toBeUndefined();
  });

  it("still offers GUEST_COUNT for a genuine new-booking message that happens to contain 'book'", () => {
    const result = selectDeterministicInteractive({ ...base, guestMessage: "I want to book a room" });
    expect(result).toEqual(guestCountPrompt());
  });

  it("offers ROOM_RESPONSE when the reply names a room's price and guest count is known", () => {
    const result = selectDeterministicInteractive({
      ...base,
      guestMessage: "2 guests",
      replyText: "Our Deluxe Room starts from ₹1,299/night",
    });
    expect(result).toEqual(roomResponsePrompt());
  });

  it("offers CONFIRM_BOOKING once a room has been discussed, even on a later turn with no new price mention", () => {
    const result = selectDeterministicInteractive({
      ...base,
      guestMessage: "sounds good",
      replyText: "Great, glad you like it!",
      history: [
        { role: "user", content: "2 guests" },
        { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
      ],
    });
    expect(result).toEqual(confirmBookingPrompt());
  });

  it("does NOT force CONFIRM_BOOKING when the guest taps 'View photos' -- the most severe gap found live: this fired completely unconditionally once a room had been mentioned, with no check on the guest's actual message, silently swallowing the photo request and replacing it with 'tap Confirm booking' instead of ever sending a single photo", () => {
    const history = [
      { role: "user", content: "2 guests" },
      { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
    ];
    const result = selectDeterministicInteractive({ ...base, guestMessage: "View photos", replyText: "Here are some photos!", history });
    expect(result).not.toEqual(confirmBookingPrompt());
  });

  it("does NOT force CONFIRM_BOOKING for a genuine question after a room's been discussed, e.g. 'is there a bathtub?'", () => {
    const history = [
      { role: "user", content: "2 guests" },
      { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
    ];
    const result = selectDeterministicInteractive({ ...base, guestMessage: "is there a bathtub?", replyText: "Yes, it has a bathtub!", history });
    expect(result).not.toEqual(confirmBookingPrompt());
  });

  it("offers DATE_QUICK_PICK only when no room has ever been discussed and dates are unknown", () => {
    const result = selectDeterministicInteractive({
      ...base,
      guestMessage: "2 guests please",
      replyText: "Got it, thanks!",
    });
    expect(result).toEqual(dateQuickPickPrompt());
  });

  it("does not regress to DATE_QUICK_PICK once a room has already been discussed, even if dates were never stated", () => {
    // Guards the exact scenario that motivated reordering the waterfall:
    // guest count known, room already recommended, but hasStatedDates would
    // still be false -- must not block a guest who's ready to book.
    const result = selectDeterministicInteractive({
      ...base,
      guestMessage: "yes let's book it",
      replyText: "Awesome, you're all set to go!",
      history: [
        { role: "user", content: "2 guests" },
        { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
      ],
    });
    expect(result).toEqual(confirmBookingPrompt());
  });

  it("falls back to the AI's own marker when no deterministic condition applies", () => {
    const aiChoice = guestCountPrompt();
    const result = selectDeterministicInteractive({
      ...base,
      guestMessage: "2 guests, this weekend",
      replyText: "Great, noted!",
      aiInteractive: aiChoice,
    });
    expect(result).toBe(aiChoice);
  });

  it("returns undefined when nothing applies and the AI offered no marker either", () => {
    const result = selectDeterministicInteractive({ ...base, guestMessage: "2 guests, this weekend" });
    expect(result).toBeUndefined();
  });

  it("does NOT force GUEST_COUNT on the message right after the greeting when the guest hasn't shown booking interest", () => {
    // The bug this gate fixes: "Hi" -> greeted -> guest says something with
    // no booking signal at all -> used to immediately show GUEST_COUNT
    // buttons, which read as robotic/presumptuous before the guest has even
    // said they want to stay anywhere.
    const result = selectDeterministicInteractive({ ...base, guestMessage: "just looking around, thanks" });
    expect(result).toBeUndefined();
  });

  it("still falls through naturally (no forced buttons) for an unrelated question with no booking signal", () => {
    const result = selectDeterministicInteractive({ ...base, guestMessage: "what's the weather like there" });
    expect(result).toBeUndefined();
  });

  it("starts the funnel the moment a booking-related keyword appears, even without a number", () => {
    const result = selectDeterministicInteractive({ ...base, guestMessage: "I'd like to book a room" });
    expect(result).toEqual(guestCountPrompt());
  });

  it("offers LANGUAGE_SELECT/GREET_MENU on a bare 'Hi' even when isFirstReply is false (a returning/re-tested contact)", () => {
    // The real bug found in production: isFirstReply only fires once ever
    // per contact, so a guest (or tester) re-sending "Hi" later got zero
    // buttons at all, which read as "buttons are broken."
    const notObvious = selectDeterministicInteractive({ ...base, isFirstReply: false, languageObvious: false, guestMessage: "Hi" });
    expect(asRows(notObvious).map((b) => b.id)).toEqual(["lang_en", "lang_hi", "lang_te"]);

    const obvious = selectDeterministicInteractive({ ...base, isFirstReply: false, languageObvious: true, guestMessage: "hello!" });
    expect(obvious).toEqual(greetMenuPrompt());
  });

  it("offers GREET_MENU right after a language-select tap, even though it's neither a first reply nor a bare greeting", () => {
    // Real gap found tracing the full button journey end-to-end: tapping a
    // LANGUAGE_SELECT button becomes the guest's next message ("English"),
    // which isn't first-reply anymore, isn't a bare greeting, and has no
    // booking-intent keyword -- without this case it fell through to no
    // buttons at all, a dead end right after the funnel's first tap.
    const english = selectDeterministicInteractive({ ...base, isFirstReply: false, languageObvious: false, guestMessage: "English" });
    expect(english).toEqual(greetMenuPrompt());

    const hindi = selectDeterministicInteractive({ ...base, isFirstReply: false, languageObvious: false, guestMessage: "हिंदी" });
    expect(hindi).toEqual(greetMenuPrompt());

    const telugu = selectDeterministicInteractive({ ...base, isFirstReply: false, languageObvious: false, guestMessage: "తెలుగు" });
    expect(telugu).toEqual(greetMenuPrompt());
  });

  it("does not treat a message with real content as a bare greeting, even if it starts with 'Hi'", () => {
    const result = selectDeterministicInteractive({
      ...base,
      isFirstReply: false,
      guestMessage: "Hi, 2 guests, this weekend",
      replyText: "Our Deluxe Room starts from ₹1,299/night",
    });
    expect(result).toEqual(roomResponsePrompt());
  });

  it("does not re-offer DATE_QUICK_PICK right after the guest declined it via 'I'll type dates'", () => {
    const result = selectDeterministicInteractive({
      ...base,
      guestMessage: "I'll type dates",
      replyText: "Sure, go ahead and type your dates.",
    });
    expect(result).toBeUndefined();
  });

  it("still offers DATE_QUICK_PICK normally when dates are unknown and the guest didn't decline it", () => {
    const result = selectDeterministicInteractive({ ...base, guestMessage: "2 people please", replyText: "Got it!" });
    expect(result).toEqual(dateQuickPickPrompt());
  });

  it("offers PRICE_OBJECTION when the guest pushes back on price after a room's already been discussed", () => {
    const result = selectDeterministicInteractive({
      ...base,
      guestMessage: "that's a bit too expensive for us",
      replyText: "No worries, I understand!",
      history: [
        { role: "user", content: "2 guests" },
        { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
      ],
    });
    expect(asRows(result).map((b) => b.id)).toEqual([SEE_OTHER_ROOMS_BUTTON_ID, SHOW_OFFERS_BUTTON_ID, "continue_anyway"]);
  });

  it("does NOT offer PRICE_OBJECTION before any room has ever been recommended", () => {
    // A price/offer question pre-recommendation just starts the normal
    // funnel (an "offer" mention now counts as booking intent) -- the AI
    // answers from its already-grounded offer data, no PRICE_OBJECTION
    // special-casing needed until a room's actually been named.
    const result = selectDeterministicInteractive({ ...base, guestMessage: "any discounts running right now?" });
    expect(result).toEqual(guestCountPrompt());
  });

  it("lets ROOM_RESPONSE win over PRICE_OBJECTION when this same reply names a (cheaper) room's price", () => {
    // The guest objected to price, and this specific reply responds by
    // naming a cheaper alternative room's price -- that's a fresh room
    // recommendation, so the guest should get the room-selection buttons,
    // not the price-objection recovery buttons, on this turn.
    const result = selectDeterministicInteractive({
      ...base,
      guestMessage: "that's too expensive, anything cheaper?",
      replyText: "The Classic Room is more budget-friendly at ₹999/night",
      history: [
        { role: "user", content: "2 guests" },
        { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
      ],
    });
    expect(result).toEqual(roomResponsePrompt());
  });
});

describe("hasExpressedBookingIntent", () => {
  it("detects common booking-related keywords", () => {
    expect(hasExpressedBookingIntent([], "do you have any rooms available")).toBe(true);
    expect(hasExpressedBookingIntent([], "what's the rate per night")).toBe(true);
    expect(hasExpressedBookingIntent([], "I want to book a stay")).toBe(true);
  });

  it("treats an already-stated guest count or date as booking intent", () => {
    expect(hasExpressedBookingIntent([], "2 guests")).toBe(true);
    expect(hasExpressedBookingIntent([], "this weekend")).toBe(true);
  });

  it("returns false for plain small talk with no booking signal", () => {
    expect(hasExpressedBookingIntent([], "just looking around, thanks")).toBe(false);
    expect(hasExpressedBookingIntent([], "haha nice")).toBe(false);
  });

  it("does not treat a plain factual check-in/check-out question as booking intent -- a real gap found live: this was railroading the guest's actual question straight into a 'how many guests?' funnel instead of answering it", () => {
    expect(hasExpressedBookingIntent([], "what time is check-in and what's your cancellation policy?")).toBe(false);
    expect(hasExpressedBookingIntent([], "what's the checkout time?")).toBe(false);
  });

  it("still detects intent when check-in/check-out appears alongside a stronger booking signal", () => {
    expect(hasExpressedBookingIntent([], "I want to book a room, check-in tomorrow")).toBe(true);
  });

  it("finds intent stated earlier in history, not just the latest message", () => {
    const history = [{ role: "user", content: "hi, I want to book a room" }];
    expect(hasExpressedBookingIntent(history, "sure")).toBe(true);
  });

  it("finds intent from the assistant's own messages, not just the guest's", () => {
    // Real production conversation: the guest only ever replied with terse
    // acknowledgements ("Hi", "Photo s send", "S", "Yeah") that never match
    // any keyword, while the assistant clearly established a booking
    // conversation ("Which room would you like to see photos of?", "Let me
    // send those photos over"). This must still count as intent.
    const history = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Which room would you like to see photos of?" },
      { role: "user", content: "Delax" },
      { role: "assistant", content: "The Deluxe Room looks great! Let me send those photos over" },
      { role: "user", content: "S" },
    ];
    expect(hasExpressedBookingIntent(history, "Yeah")).toBe(true);
  });

  it("still returns false for generic small talk even with assistant messages scanned", () => {
    const history = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hi! I'm Anushka 😊 What brings you here today?" },
    ];
    expect(hasExpressedBookingIntent(history, "just browsing")).toBe(false);
  });
});

describe("predictedStageInstruction", () => {
  const base = { isFirstReply: false, languageObvious: true, history: [] as { role: string; content: string }[], guestMessage: "" };

  it("gives a LANGUAGE_SELECT instruction on the first reply when language isn't obvious", () => {
    const result = predictedStageInstruction({ ...base, isFirstReply: true, languageObvious: false });
    expect(result).toContain("language-selection picker");
  });

  it("gives a GREET_MENU instruction on the first reply when language is already obvious", () => {
    const result = predictedStageInstruction({ ...base, isFirstReply: true, languageObvious: true });
    expect(result).toContain("I want to book a room");
  });

  it("gives the room-recommend heads-up (not GREET_MENU) on a rich first reply where guest count and dates are already known", () => {
    // The exact mismatch this function exists to prevent: without the fix,
    // this would predict GREET_MENU (since replyText is empty pre-call),
    // but the real post-call decision would end up as ROOM_RESPONSE the
    // moment the AI names a room -- telling the AI the wrong thing was
    // about to happen.
    const result = predictedStageInstruction({
      ...base,
      isFirstReply: true,
      languageObvious: true,
      guestMessage: "Hi, 2 guests, want a room this weekend",
    });
    expect(result).toContain("recommend");
    expect(result).not.toContain("I want to book a room\" / \"Availability");
  });

  it("gives a GUEST_COUNT instruction once booking intent is shown but count is unknown", () => {
    const result = predictedStageInstruction({ ...base, guestMessage: "I'd like to book a room" });
    expect(result).toContain("how many people");
  });

  it("gives a DATE_QUICK_PICK instruction once guest count is known but dates and room are not", () => {
    const result = predictedStageInstruction({ ...base, guestMessage: "2 guests please" });
    expect(result).toContain("dates");
  });

  it("gives a CONFIRM_BOOKING instruction once a room has already come up", () => {
    const result = predictedStageInstruction({
      ...base,
      guestMessage: "sounds good",
      history: [
        { role: "user", content: "2 guests" },
        { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
      ],
    });
    expect(result).toContain("Confirm booking");
  });

  it("gives a PRICE_OBJECTION instruction when the guest pushes back on price after a room's already come up", () => {
    const result = predictedStageInstruction({
      ...base,
      guestMessage: "that's too expensive for us",
      history: [
        { role: "user", content: "2 guests" },
        { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
      ],
    });
    expect(result).toContain("cheaper room");
  });

  it("gives a heads-up about recommending a room once guest count and dates are both known", () => {
    const result = predictedStageInstruction({ ...base, guestMessage: "2 guests, this weekend" });
    expect(result).toContain("recommend");
  });

  it("returns an empty string for plain small talk with no booking interest yet", () => {
    const result = predictedStageInstruction({ ...base, guestMessage: "just looking around, thanks" });
    expect(result).toBe("");
  });
});

describe("resolveDeterministicReply", () => {
  const base = {
    isFirstReply: false,
    languageObvious: false,
    history: [] as { role: string; content: string }[],
    guestMessage: "",
  };
  // UTC-anchored (not ambient-local-timezone) so these pass identically
  // regardless of what machine runs the tests -- IST is UTC+5:30, so these
  // resolve to 9am/2pm/7pm IST exactly. See india-time.test.ts.
  const MORNING = new Date(Date.UTC(2026, 7, 10, 3, 30)); // 9:00am IST
  const AFTERNOON = new Date(Date.UTC(2026, 7, 10, 8, 30)); // 2:00pm IST
  const EVENING = new Date(Date.UTC(2026, 7, 10, 13, 30)); // 7:00pm IST

  it("gives a fixed LANGUAGE_SELECT reply on the first message, with a morning greeting", () => {
    const result = resolveDeterministicReply({ ...base, isFirstReply: true, guestMessage: "Hi", now: MORNING, hotelName: "Hotel Ivory Towers" });
    expect(result?.text).toBe("Good morning! 😊 This is Anushka from Hotel Ivory Towers — thank you for reaching out! Which language are you comfortable in?");
    expect(asRows(result?.interactive).map((r) => r.id)).toEqual(["lang_en", "lang_hi", "lang_te"]);
  });

  it("varies the greeting by time of day", () => {
    expect(resolveDeterministicReply({ ...base, isFirstReply: true, guestMessage: "Hi", now: AFTERNOON })?.text).toContain("Good afternoon!");
    expect(resolveDeterministicReply({ ...base, isFirstReply: true, guestMessage: "Hi", now: EVENING })?.text).toContain("Good evening!");
  });

  it("omits the hotel name gracefully when not provided", () => {
    const result = resolveDeterministicReply({ ...base, isFirstReply: true, guestMessage: "Hi", now: MORNING });
    expect(result?.text).toBe("Good morning! 😊 This is Anushka — thank you for reaching out! Which language are you comfortable in?");
  });

  it("returns null (lets the AI handle it) when the conversation is in an obviously non-English script", () => {
    const result = resolveDeterministicReply({ ...base, isFirstReply: true, languageObvious: true, guestMessage: "नमस्ते" });
    expect(result).toBeNull();
  });

  it("gives a fixed GUEST_COUNT reply once booking intent is shown", () => {
    const result = resolveDeterministicReply({ ...base, guestMessage: "I'd like to book a room" });
    expect(result?.text).toBe("How many people will be staying? 😊");
    expect(asRows(result?.interactive).map((r) => r.id)).toEqual(["guests_1", "guests_2", "guests_3plus"]);
  });

  it("returns null (lets the AI actually answer) for a genuine question, even once booking intent is already shown -- a real gap found live: 'am I talking to a real person or a bot?' was silently swallowed and funneled straight into 'how many people will be staying?' just because the assistant's own earlier message had mentioned 'book a room'", () => {
    const result = resolveDeterministicReply({
      ...base,
      guestMessage: "am I talking to a real person or a bot?",
      history: [{ role: "assistant", content: "Are you looking to book a room with us today? 😊" }],
    });
    expect(result).toBeNull();
  });

  it("gives a fixed DATE_QUICK_PICK reply once guest count is known", () => {
    const result = resolveDeterministicReply({ ...base, guestMessage: "2 guests please" });
    expect(result?.text).toBe("When are you looking to stay?");
    expect(asRows(result?.interactive).map((r) => r.id)).toEqual(["dates_today", "dates_tomorrow", "dates_weekend", "dates_nextweek", "dates_custom"]);
  });

  it("gives a fixed CONFIRM_BOOKING reply mentioning the reference code, once a room has been discussed", () => {
    const result = resolveDeterministicReply({
      ...base,
      guestMessage: "sounds good",
      history: [
        { role: "user", content: "2 guests" },
        { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
      ],
    });
    expect(result?.text).toContain("reference code");
    expect(asRows(result?.interactive).map((r) => r.id)).toEqual([CONFIRM_BOOKING_BUTTON_ID, "not_yet"]);
  });

  it("gives a softer, non-repeated reply when the guest taps 'Not yet' -- a real gap found live: it was echoing the exact same push-to-confirm text right back at a guest who'd just declined", () => {
    const result = resolveDeterministicReply({
      ...base,
      guestMessage: "Not yet",
      history: [
        { role: "user", content: "2 guests" },
        { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
        { role: "user", content: "sounds good" },
        { role: "assistant", content: "Great, glad that works for you! 🎉 Tap Confirm booking below and I'll get you an instant reference code" },
      ],
    });
    expect(result?.text).not.toContain("reference code");
    expect(asRows(result?.interactive).map((r) => r.id)).toEqual([CONFIRM_BOOKING_BUTTON_ID, "not_yet"]);
  });

  it("gives a fixed PRICE_OBJECTION reply when the guest pushes back on price", () => {
    const result = resolveDeterministicReply({
      ...base,
      guestMessage: "that's too expensive",
      history: [
        { role: "user", content: "2 guests" },
        { role: "assistant", content: "Our Deluxe Room starts from ₹1,299/night" },
      ],
    });
    expect(asRows(result?.interactive).map((r) => r.id)).toEqual([SEE_OTHER_ROOMS_BUTTON_ID, SHOW_OFFERS_BUTTON_ID, "continue_anyway"]);
  });

  it("returns null when the AI must actually recommend a specific room (guest count and dates both known)", () => {
    const result = resolveDeterministicReply({ ...base, guestMessage: "2 guests, this weekend" });
    expect(result).toBeNull();
  });

  it("returns null for plain small talk with no booking interest yet", () => {
    const result = resolveDeterministicReply({ ...base, guestMessage: "just looking around, thanks" });
    expect(result).toBeNull();
  });

  it("never reaches GREET_MENU here -- resolveStageKey only returns it when languageObvious is true, and the top-level guard already excludes all of those", () => {
    const result = resolveDeterministicReply({ ...base, isFirstReply: true, languageObvious: true, guestMessage: "Hi, do you have rooms?" });
    expect(result).toBeNull();
  });
});
