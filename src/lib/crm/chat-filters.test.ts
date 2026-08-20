import { describe, expect, it } from "vitest";
import { applyChatFilter, chatFilter, chatFilterCounts, CHAT_FILTERS } from "./chat-filters";
import { Contact } from "@/types";

const base = (over: Partial<Contact> = {}): Contact =>
  ({
    id: Math.random().toString(36).slice(2),
    name: "Guest",
    phone: "919000000000",
    whatsappNumber: "919000000000",
    createdAt: "2026-08-01T00:00:00Z",
    lastMessage: "hi",
    lastInboundAt: "2026-08-19T10:00:00Z",
    leadStatus: "NEW",
    bookingStatus: "NONE",
    aiSummary: null,
    aiPaused: false,
    handoverAt: null,
    handoverByName: null,
    handoverReason: null,
    aiBriefing: null,
    followUpDate: null,
    followUpNote: null,
    notes: null,
    tags: [],
    lastReadAt: null,
    pinnedAt: null,
    assignedToId: null,
    leadSource: "DIRECT",
    sourceDetail: null,
    optedOutAt: null,
    updatedAt: "2026-08-19T10:00:00Z",
    unreadCount: 0,
    hotScore: 0,
    hotReasons: [],
    ...over,
  }) as Contact;

describe("chat filters", () => {
  it("ALL matches everything", () => {
    const contacts = [base(), base({ leadStatus: "BOOKED" })];
    expect(applyChatFilter(contacts, "ALL")).toHaveLength(2);
  });

  it("UNREAD only matches chats with unread messages", () => {
    const contacts = [base({ unreadCount: 3 }), base({ unreadCount: 0 })];
    expect(applyChatFilter(contacts, "UNREAD")).toHaveLength(1);
  });

  it("NEEDS_YOU covers both an explicit handover and a plain pause", () => {
    // Both mean the same thing to the guest: nobody replies unless a person
    // does. The pause case is the one with no owner at all, so hiding it here
    // would leave the most dangerous state invisible.
    const contacts = [
      base({ aiPaused: true, handoverAt: "2026-08-19T09:00:00Z" }),
      base({ aiPaused: true, handoverAt: null }),
      base({ aiPaused: false, handoverAt: null }),
    ];
    expect(applyChatFilter(contacts, "NEEDS_YOU")).toHaveLength(2);
  });

  it("AI matches only chats the assistant is actually running", () => {
    const contacts = [
      base({ aiPaused: false, handoverAt: null }),
      base({ aiPaused: true, handoverAt: null }),
      base({ aiPaused: true, handoverAt: "2026-08-19T09:00:00Z" }),
    ];
    expect(applyChatFilter(contacts, "AI")).toHaveLength(1);
  });

  it("NEEDS_YOU and AI together account for every chat", () => {
    // They are complements. A chat falling through both would be one nobody
    // can find from the two mode filters.
    const contacts = [
      base({ aiPaused: false }),
      base({ aiPaused: true }),
      base({ aiPaused: true, handoverAt: "2026-08-19T09:00:00Z" }),
    ];
    const needs = applyChatFilter(contacts, "NEEDS_YOU").length;
    const ai = applyChatFilter(contacts, "AI").length;
    expect(needs + ai).toBe(contacts.length);
  });

  it("HOT matches leads at or above the threshold, hottest first", () => {
    const contacts = [base({ hotScore: 4 }), base({ hotScore: 0 }), base({ hotScore: 9 })];
    const result = applyChatFilter(contacts, "HOT");
    expect(result).toHaveLength(2);
    expect(result[0].hotScore).toBe(9);
  });

  it("puts pinned chats first in every filter", () => {
    // A pin that only worked on All would vanish exactly when you filtered
    // down to find the thing you pinned.
    const older = base({ unreadCount: 1, pinnedAt: "2026-08-10T00:00:00Z", lastInboundAt: "2026-08-01T00:00:00Z" });
    const newer = base({ unreadCount: 1, lastInboundAt: "2026-08-20T00:00:00Z" });
    expect(applyChatFilter([newer, older], "UNREAD")[0].id).toBe(older.id);
    expect(applyChatFilter([newer, older], "ALL")[0].id).toBe(older.id);
  });

  it("ranks a pinned chat above a hotter unpinned one", () => {
    const pinnedCool = base({ hotScore: 3, pinnedAt: "2026-08-10T00:00:00Z" });
    const unpinnedHot = base({ hotScore: 9 });
    expect(applyChatFilter([unpinnedHot, pinnedCool], "HOT")[0].id).toBe(pinnedCool.id);
  });

  it("orders unpinned chats by most recent activity", () => {
    const old = base({ lastInboundAt: "2026-08-01T00:00:00Z" });
    const recent = base({ lastInboundAt: "2026-08-20T00:00:00Z" });
    expect(applyChatFilter([old, recent], "ALL")[0].id).toBe(recent.id);
  });

  it("counts describe the whole inbox, not the current view", () => {
    const contacts = [base({ unreadCount: 2 }), base({ aiPaused: true }), base({ hotScore: 7 })];
    const counts = chatFilterCounts(contacts);
    expect(counts.UNREAD).toBe(1);
    expect(counts.NEEDS_YOU).toBe(1);
    expect(counts.HOT).toBe(1);
  });

  it("only counts the chips that prompt an action", () => {
    // Numbers on browsing filters would compete with the ones that mean
    // "do something".
    const counts = chatFilterCounts([base()]);
    expect(counts.ALL).toBeUndefined();
    expect(counts.BOOKED).toBeUndefined();
  });

  it("gives every filter its own empty-state copy", () => {
    // An empty Hot tab is good news and should read that way — "try a
    // different filter" told staff nothing about what the tab was for.
    for (const f of CHAT_FILTERS) {
      expect(f.emptyTitle.length).toBeGreaterThan(0);
      expect(f.emptyBody.length).toBeGreaterThan(0);
    }
  });

  it("falls back to ALL for an unknown filter key", () => {
    expect(chatFilter("NOPE" as never).key).toBe("ALL");
  });
});
