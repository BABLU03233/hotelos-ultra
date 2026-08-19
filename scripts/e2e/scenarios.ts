import type { SentMessage } from "./harness";

export interface Turn {
  /** Typed message. An empty string stands for an attachment with no caption. */
  say?: string;
  /** Tapped button or list row. */
  tap?: { id: string; label: string };
  /** What the stubbed model returns for this turn, if the AI path is reached. */
  ai?: string;
  /** Age the whole conversation backwards before this turn, in hours. */
  ageHoursFirst?: number;
  checks?: Check[];
}

export interface Check {
  label: string;
  test: (sent: SentMessage[]) => boolean;
}

export interface Scenario {
  id: string;
  area: string;
  title: string;
  /** Why this case exists — printed in the report so a failure explains itself. */
  because: string;
  turns: Turn[];
}

/* ---------- reusable checks ---------- */

const bodyOf = (s: SentMessage[]) => s.map((m) => m.body).join("\n");
const idsOf = (s: SentMessage[]) => s.flatMap((m) => [...m.buttons, ...m.rows]).map((b) => b.id);
const titlesOf = (s: SentMessage[]) => s.flatMap((m) => [...m.buttons, ...m.rows]).map((b) => b.title).join(" | ");
/** Body plus every button/row label and description — a list message carries most of its content in the rows. */
const everythingOf = (s: SentMessage[]) =>
  [bodyOf(s), titlesOf(s), ...s.flatMap((m) => m.rows.map((r) => r.description ?? ""))].join(" ");

const sentSomething: Check = {
  label: "guest received a reply",
  test: (s) => s.length > 0 && Boolean(s[0].body?.trim()),
};

const matches = (label: string, pattern: RegExp): Check => ({ label, test: (s) => pattern.test(everythingOf(s)) });
const notMatches = (label: string, pattern: RegExp): Check => ({ label, test: (s) => !pattern.test(bodyOf(s)) });
const offersButtons = (label: string, ids: string[]): Check => ({
  label,
  test: (s) => ids.every((id) => idsOf(s).some((got) => got === id || got.startsWith(id))),
});

/** The canned line the safety guards fall back to — a non-sequitur when it fires wrongly. */
const NOT_CANNED: Check = {
  label: "not replaced by the canned safe-reply",
  test: (s) => !/Great, glad that works for you/i.test(bodyOf(s)),
};

const NOT_ESCALATED: Check = {
  label: "not handed off to staff",
  test: (s) => !/let me get one of our team/i.test(bodyOf(s)),
};

const NO_RAW_MARKER: Check = {
  label: "no internal marker leaked to the guest",
  test: (s) => !/ESCALATE:|IMAGE:|DATES:|BUTTONS:/.test(bodyOf(s)),
};

const NO_MARKDOWN: Check = {
  label: "no ** markdown (WhatsApp renders it literally)",
  test: (s) => !/\*\*/.test(bodyOf(s)),
};

/* ---------- scenarios ---------- */

export const SCENARIOS: Scenario[] = [
  /* ===== FUNNEL ===== */
  {
    id: "funnel-taps",
    area: "Funnel",
    title: "Complete booking entirely by tapping",
    because: "The path most guests take. Every stage must hand off to the next without a dead end.",
    turns: [
      { say: "hi", checks: [sentSomething, offersButtons("language picker shown", ["lang_en", "lang_hi", "lang_te"])] },
      {
        tap: { id: "lang_en", label: "English" },
        checks: [offersButtons("greet menu shown", ["greet_book", "room_other", "greet_question"])],
      },
      {
        tap: { id: "greet_book", label: "Book a room" },
        checks: [offersButtons("guest count asked", ["guests_1", "guests_2", "guests_3plus"])],
      },
      {
        tap: { id: "guests_2", label: "2 people" },
        checks: [offersButtons("dates asked", ["dates_today", "dates_tomorrow", "dates_weekend"])],
      },
      {
        tap: { id: "dates_tomorrow", label: "Tomorrow" },
        checks: [
          offersButtons("rooms offered as choices", ["room_pick_"]),
          matches("room list carries a real price", /₹\s?(999|1,299|1,599)/),
          {
            label: "offers all three rooms, not one recommendation",
            test: (s) => idsOf(s).filter((i) => i.startsWith("room_pick_")).length === 3,
          },
        ],
      },
      {
        tap: { id: "ROOM_CHEAPEST", label: "Book Classic Room" },
        checks: [matches("confirms the chosen room at its real price", /Classic Room[\s\S]*₹\s?999/)],
      },
      {
        tap: { id: "confirm_booking", label: "Confirm booking" },
        checks: [matches("booking reference issued", /[A-Z]{3}-\d{4}/)],
      },
    ],
  },
  {
    id: "funnel-rich-first-message",
    area: "Funnel",
    title: "Information-rich first message",
    because: "A guest often says everything at once. Slot questions they already answered must not fire.",
    turns: [
      {
        say: "hi, 2 people this weekend",
        ai: "Lovely! Here is what we have for the two of you this weekend.",
        checks: [sentSomething, notMatches("does not re-ask guest count", /how many (people|guests)/i)],
      },
    ],
  },

  /* ===== DATES ===== */
  {
    id: "date-past-refused",
    area: "Dates",
    title: "A date that has already passed is refused",
    because: "Reported live: a guest typed a past date and the funnel moved on and booked it.",
    turns: [
      { say: "hi", ai: "Hi! I am Anushka." },
      { say: "I want to book a room", ai: "Great! How many guests?" },
      { tap: { id: "guests_2", label: "2 people" } },
      {
        say: "26 jul",
        ai: "Oops, 26 July 2026 has already passed. Could you confirm the dates you meant?",
        checks: [matches("tells the guest the date has gone", /passed|already gone|already/i)],
      },
    ],
  },
  {
    id: "date-compressed",
    area: "Dates",
    title: "Compressed date format is not ignored",
    because: "Reported live: 26jul was ignored and the date picker was shown again instead of being read.",
    turns: [
      { say: "hi", ai: "Hi!" },
      { say: "book a room", ai: "How many guests?" },
      { tap: { id: "guests_2", label: "2 people" } },
      { say: "26jul", ai: "26 July has already passed - which dates did you mean?", checks: [sentSomething] },
    ],
  },

  /* ===== LISTENING ===== */
  {
    id: "question-answered-mid-funnel",
    area: "Listening",
    title: "A question mid-funnel is answered, not funnelled",
    because:
      "Reported repeatedly: a guest asked about wifi before giving a party size and got a slot prompt, or an escalation, instead of the answer sitting in the prompt.",
    turns: [
      { say: "hi", ai: "Hi! I am Anushka." },
      {
        say: "do you have parking?",
        ai: "Yes, free covered on-site parking for all guests.",
        checks: [matches("answers the parking question", /parking/i), NOT_ESCALATED, NOT_CANNED],
      },
      {
        say: "what time is check in?",
        ai: "Check-in is from 12:00 PM and check-out by 11:00 AM.",
        checks: [matches("answers with the real check-in time", /12(:00)?\s?PM/i), NOT_ESCALATED],
      },
    ],
  },

  /* ===== MODEL-OUTPUT SAFETY (the classes that actually shipped) ===== */
  {
    id: "safety-markdown",
    area: "Safety",
    title: "Markdown from the model never reaches the guest",
    because: "Caught live: the model wrote bold with double asterisks, which WhatsApp renders literally.",
    turns: [
      { say: "hi", ai: "Hi!" },
      {
        say: "tell me about the rooms",
        ai: "**Classic Room** - from ₹999/night.\n\n### Our offer\n- 10% off with **WELCOME10**",
        checks: [NO_MARKDOWN, matches("the words survive the conversion", /Classic Room/)],
      },
    ],
  },
  {
    id: "safety-escalate-marker",
    area: "Safety",
    title: "An ESCALATE marker appended after an answer never reaches the guest",
    because:
      "Caught live: a weaker model answered and then appended the marker, and a startsWith check passed the whole thing through into the guest's WhatsApp.",
    turns: [
      { say: "hi", ai: "Hi!" },
      {
        say: "do you have a helipad?",
        ai: "We do not have that listed. ESCALATE: guest asked about a helipad",
        checks: [NO_RAW_MARKER],
      },
    ],
  },
  {
    id: "safety-invented-price",
    area: "Safety",
    title: "A price the hotel never published is caught",
    because: "A guest acting on a wrong rate is the most expensive mistake this bot can make.",
    turns: [
      { say: "hi", ai: "Hi!" },
      {
        say: "how much is the classic room",
        ai: "The Classic Room is ₹4,500/night.",
        checks: [notMatches("the invented rate is not sent", /4,?500/)],
      },
    ],
  },
  {
    id: "safety-occupancy-price",
    area: "Safety",
    title: "The hotel's own occupancy-tier price is NOT treated as invented",
    because:
      "The price guard was built on a misdiagnosis and replaced correct 3-guest quotes with a canned line. 1,899 is written in the Deluxe Room's own description.",
    turns: [
      { say: "hi", ai: "Hi!" },
      {
        say: "price for 3 people in deluxe",
        ai: "For 3 guests the Deluxe Room is ₹1,899/night.",
        checks: [NOT_CANNED, matches("the real tiered price is sent", /1,?899/)],
      },
    ],
  },
  {
    id: "safety-invented-url",
    area: "Safety",
    title: "An invented booking link is stripped",
    because: "This app has no booking site, so a fabricated link sends guests somewhere that does not exist.",
    turns: [
      { say: "hi", ai: "Hi!" },
      {
        say: "where do i book",
        ai: "Book here: https://bookings.example-hotel.com/reserve",
        checks: [notMatches("no fabricated link", /example-hotel\.com/)],
      },
    ],
  },

  /* ===== SESSION ===== */
  {
    id: "session-restart-after-gap",
    area: "Session",
    title: "A bare greeting after a long gap starts over",
    because:
      "Reported: a guest who booked, or who drifted off mid-funnel, came back and landed mid-conversation with stale dates still held.",
    turns: [
      { say: "hi", ai: "Hi!" },
      { tap: { id: "lang_en", label: "English" } },
      { say: "book a room", ai: "How many guests?" },
      { tap: { id: "guests_2", label: "2 people" } },
      { tap: { id: "dates_weekend", label: "This weekend" } },
      {
        say: "hi",
        ageHoursFirst: 30,
        ai: "Welcome back! How can I help?",
        checks: [
          offersButtons("greeting menu reopened", ["greet_book"]),
          notMatches("does not resume with a room list", /rooms free for your dates/i),
          notMatches("language is remembered, not asked again", /which language/i),
        ],
      },
    ],
  },
  {
    id: "session-no-restart-same-sitting",
    area: "Session",
    title: "A greeting inside the same sitting does NOT wipe progress",
    because: "Wiping dates a guest just gave is the exact not-listening failure this codebase keeps fixing.",
    turns: [
      { say: "hi", ai: "Hi!" },
      { say: "book a room", ai: "How many guests?" },
      { tap: { id: "guests_2", label: "2 people" } },
      {
        say: "hi",
        ai: "Still here! When are you staying?",
        checks: [notMatches("does not reopen the greeting menu", /I want to book a room/i)],
      },
    ],
  },

  /* ===== LANGUAGE ===== */
  {
    id: "language-buttons-localised",
    area: "Language",
    title: "Buttons are written in the guest's chosen language",
    because:
      "Caught live: a Telugu guest was asked in Telugu above rows reading Just me / 2 people / 3+ people, because the AI path never passed a language down.",
    turns: [
      { say: "hi", ai: "Hi!" },
      { tap: { id: "lang_te", label: "తెలుగు" } },
      {
        say: "room kavali",
        ai: "ఎన్ని మంది?",
        checks: [
          {
            label: "buttons are not the English catalog",
            test: (s) => (titlesOf(s) ? !/Just me|3\+ people/.test(titlesOf(s)) : true),
          },
        ],
      },
    ],
  },
  {
    id: "language-persists",
    area: "Language",
    title: "A chosen language is not asked for twice",
    because: "Reported live: picking a language appeared to do nothing and the picker kept coming back.",
    turns: [
      { say: "hi", ai: "Hi!" },
      { tap: { id: "lang_hi", label: "हिंदी" } },
      {
        say: "wifi hai kya",
        ai: "Haan, har room mein free Wi-Fi hai.",
        checks: [notMatches("language picker not shown again", /which language/i)],
      },
    ],
  },

  /* ===== MEDIA ===== */
  {
    id: "media-no-caption",
    area: "Media",
    title: "An attachment with no caption still gets a reply",
    because: "This was once the only path in the whole flow that could leave a guest with total silence.",
    turns: [{ say: "", checks: [sentSomething] }],
  },
];
