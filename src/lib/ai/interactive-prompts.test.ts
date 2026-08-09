import { describe, expect, it, vi } from "vitest";
import {
  CONFIRM_BOOKING_BUTTON_ID,
  ROOM_BOOK_BUTTON_ID,
  SEE_OTHER_ROOMS_BUTTON_ID,
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
  mentionsRoomPrice,
  predictedStageInstruction,
  roomResponsePrompt,
  selectDeterministicInteractive,
} from "./interactive-prompts";

describe("extractInteractivePrompt", () => {
  it("returns the text unchanged when no BUTTONS marker is present", () => {
    const result = extractInteractivePrompt("Check-out is by 11:00 AM 🕚");
    expect(result).toEqual({ text: "Check-out is by 11:00 AM 🕚" });
  });

  it("strips the marker and resolves a known key", () => {
    const result = extractInteractivePrompt("How many guests will be staying?\nBUTTONS: GUEST_COUNT");
    expect(result.text).toBe("How many guests will be staying?");
    expect(result.interactive?.buttons).toEqual([
      { id: "guests_1", title: "Just me" },
      { id: "guests_2", title: "2 people" },
      { id: "guests_3plus", title: "3+ people" },
    ]);
  });

  it("is case-insensitive on the key", () => {
    const result = extractInteractivePrompt("How many guests?\nbuttons: guest_count");
    expect(result.interactive?.buttons).toHaveLength(3);
  });

  it("resolves the ROOM_RESPONSE key at the RECOMMEND stage", () => {
    const result = extractInteractivePrompt("The Deluxe Room is ₹1,299/night with a great view.\nBUTTONS: ROOM_RESPONSE");
    expect(result.text).toBe("The Deluxe Room is ₹1,299/night with a great view.");
    expect(result.interactive?.buttons.map((b) => b.id)).toEqual([ROOM_BOOK_BUTTON_ID, SEE_OTHER_ROOMS_BUTTON_ID, VIEW_PHOTOS_BUTTON_ID]);
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
    expect(result.interactive?.buttons).toHaveLength(3);
  });

  it("exports a stable CONFIRM_BOOKING_BUTTON_ID for downstream matching", () => {
    expect(CONFIRM_BOOKING_BUTTON_ID).toBe("confirm_booking");
  });

  it("resolves a marker that shares a line with prose, keeping the prose", () => {
    const result = extractInteractivePrompt("Awesome, you're going to love it there! BUTTONS: CONFIRM_BOOKING");
    expect(result.text).toBe("Awesome, you're going to love it there!");
    expect(result.interactive?.buttons.map((b) => b.id)).toEqual([CONFIRM_BOOKING_BUTTON_ID, "not_yet"]);
  });

  it("resolves a key even with trailing punctuation right after it", () => {
    const result = extractInteractivePrompt("Great choice!\nBUTTONS: ROOM_RESPONSE.");
    expect(result.text).toBe("Great choice!");
    expect(result.interactive?.buttons.map((b) => b.id)).toEqual([ROOM_BOOK_BUTTON_ID, SEE_OTHER_ROOMS_BUTTON_ID, VIEW_PHOTOS_BUTTON_ID]);
  });

  it("resolves the CONFIRM_BOOKING key at the CLOSE stage, using the exported button id", () => {
    const result = extractInteractivePrompt("Ready when you are!\nBUTTONS: CONFIRM_BOOKING");
    expect(result.text).toBe("Ready when you are!");
    expect(result.interactive?.buttons).toEqual([
      { id: CONFIRM_BOOKING_BUTTON_ID, title: "Confirm booking" },
      { id: "not_yet", title: "Not yet" },
    ]);
  });

  it("substitutes a non-empty fallback body when the model emits a bare marker with no sentence in front of it", () => {
    const result = extractInteractivePrompt("BUTTONS: CONFIRM_BOOKING");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.interactive?.buttons).toHaveLength(2);
  });

  it("substitutes a fallback body when only whitespace is left after stripping the marker", () => {
    const result = extractInteractivePrompt("   \n BUTTONS: GUEST_COUNT \n  ");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.interactive?.buttons).toHaveLength(3);
  });

  it("resolves the LANGUAGE_SELECT key, and ROOM_RESPONSE's 'see other options' button matches SEE_OTHER_ROOMS_BUTTON_ID", () => {
    const result = extractInteractivePrompt("Hi there! 😊\nBUTTONS: LANGUAGE_SELECT");
    expect(result.interactive?.buttons).toHaveLength(3);
    expect(result.interactive?.buttons.map((b) => b.id)).toEqual(["lang_en", "lang_hi", "lang_te"]);

    const roomResponse = extractInteractivePrompt("Great room!\nBUTTONS: ROOM_RESPONSE");
    expect(roomResponse.interactive?.buttons.map((b) => b.id)).toContain(SEE_OTHER_ROOMS_BUTTON_ID);
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

  it("returns false when no price is mentioned", () => {
    expect(mentionsRoomPrice("Check-out is by 11:00 AM 🕚")).toBe(false);
    expect(mentionsRoomPrice("How many guests will be staying?")).toBe(false);
  });

  it("returns false for a non-per-night rupee mention", () => {
    expect(mentionsRoomPrice("There's a ₹100 discount available")).toBe(false);
  });
});

describe("roomResponsePrompt", () => {
  it("returns the same three buttons as the ROOM_RESPONSE catalog entry", () => {
    const prompt = roomResponsePrompt();
    expect(prompt.buttons.map((b) => b.id)).toEqual([ROOM_BOOK_BUTTON_ID, SEE_OTHER_ROOMS_BUTTON_ID, VIEW_PHOTOS_BUTTON_ID]);
  });
});

describe("guestCountPrompt", () => {
  it("returns the same three buttons as the GUEST_COUNT catalog entry", () => {
    const prompt = guestCountPrompt();
    expect(prompt.buttons.map((b) => b.id)).toEqual(["guests_1", "guests_2", "guests_3plus"]);
  });
});

describe("confirmBookingPrompt", () => {
  it("returns the same two buttons as the CONFIRM_BOOKING catalog entry, with the stable button id", () => {
    const prompt = confirmBookingPrompt();
    expect(prompt.buttons.map((b) => b.id)).toEqual([CONFIRM_BOOKING_BUTTON_ID, "not_yet"]);
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
});

describe("hasStatedDates", () => {
  it("detects common relative-date phrasing", () => {
    expect(hasStatedDates([], "this weekend")).toBe(true);
    expect(hasStatedDates([], "next week works")).toBe(true);
    expect(hasStatedDates([], "tomorrow night")).toBe(true);
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
    expect(prompt.buttons.map((b) => b.id)).toContain(SEE_OTHER_ROOMS_BUTTON_ID);
  });

  it("dateQuickPickPrompt returns three date-shortcut buttons", () => {
    const prompt = dateQuickPickPrompt();
    expect(prompt.buttons.map((b) => b.id)).toEqual(["dates_weekend", "dates_nextweek", "dates_custom"]);
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
    expect(result?.buttons.map((b) => b.id)).toEqual(["lang_en", "lang_hi", "lang_te"]);
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
    expect(notObvious?.buttons.map((b) => b.id)).toEqual(["lang_en", "lang_hi", "lang_te"]);

    const obvious = selectDeterministicInteractive({ ...base, isFirstReply: false, languageObvious: true, guestMessage: "hello!" });
    expect(obvious).toEqual(greetMenuPrompt());
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

  it("finds intent stated earlier in history, not just the latest message", () => {
    const history = [{ role: "user", content: "hi, I want to book a room" }];
    expect(hasExpressedBookingIntent(history, "sure")).toBe(true);
  });
});

describe("predictedStageInstruction", () => {
  const base = { isFirstReply: false, languageObvious: true, history: [] as { role: string; content: string }[], guestMessage: "" };

  it("gives a LANGUAGE_SELECT instruction on the first reply when language isn't obvious", () => {
    const result = predictedStageInstruction({ ...base, isFirstReply: true, languageObvious: false });
    expect(result).toContain("language-selection buttons");
  });

  it("gives a GREET_MENU instruction on the first reply when language is already obvious", () => {
    const result = predictedStageInstruction({ ...base, isFirstReply: true, languageObvious: true });
    expect(result).toContain("Book a room");
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
    expect(result).not.toContain("Book a room\" / \"View rooms");
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

  it("gives a heads-up about recommending a room once guest count and dates are both known", () => {
    const result = predictedStageInstruction({ ...base, guestMessage: "2 guests, this weekend" });
    expect(result).toContain("recommend");
  });

  it("returns an empty string for plain small talk with no booking interest yet", () => {
    const result = predictedStageInstruction({ ...base, guestMessage: "just looking around, thanks" });
    expect(result).toBe("");
  });
});
