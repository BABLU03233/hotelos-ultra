import { describe, expect, it, vi } from "vitest";
import {
  CONFIRM_BOOKING_BUTTON_ID,
  ROOM_BOOK_BUTTON_ID,
  SEE_OTHER_ROOMS_BUTTON_ID,
  VIEW_PHOTOS_BUTTON_ID,
  confirmBookingPrompt,
  extractInteractivePrompt,
  guestCountPrompt,
  hasStatedGuestCount,
  mentionsRoomPrice,
  roomResponsePrompt,
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
      { id: "guests_2", title: "2 guests" },
      { id: "guests_3plus", title: "3+ guests" },
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
});
