import { Contact } from "@/types";
import { conversationMode } from "./handover";
import { HOT_THRESHOLD } from "./hot-lead";

/**
 * The chat list's categories.
 *
 * Two groups, and the split is the point. A receptionist opening the desk asks
 * one question first — "what needs me?" — and only later "where is this guest
 * in the pipeline?". Mixing those into one undifferentiated row of chips made
 * the urgent ones (unread, waiting on a human) sit beside stage labels that
 * change nothing about what to do next.
 *
 *   attention — work waiting. Carries a count, because a category whose size
 *               you cannot see is one you have to open to check.
 *   stage     — where the lead is. No counts; these are for browsing, not
 *               triage, and numbers on them would compete with the ones that
 *               actually mean "do something".
 *
 * Every predicate runs client-side against the already-fetched list. That is
 * deliberate: the counts must reflect the whole inbox, not the current view,
 * and computing them from a server-filtered response is how a chip ends up
 * claiming "0 unread" purely because you were looking at Booked. It also makes
 * switching filters instant, with no refetch.
 */

export type ChatFilterKey =
  | "ALL"
  | "UNREAD"
  | "NEEDS_YOU"
  | "HOT"
  | "AI"
  | "NEW"
  | "INTERESTED"
  | "FOLLOW_UP"
  | "BOOKED";

export interface ChatFilter {
  key: ChatFilterKey;
  label: string;
  group: "attention" | "stage";
  /** Show a live count on the chip — only where the number prompts an action. */
  counted: boolean;
  /** Shown when the filter matches nothing, so an empty list explains itself. */
  emptyTitle: string;
  emptyBody: string;
  match: (c: Contact) => boolean;
}

export const isUnread = (c: Contact) => (c.unreadCount ?? 0) > 0;
export const isHot = (c: Contact) => (c.hotScore ?? 0) >= HOT_THRESHOLD;

/**
 * Anything the assistant is not handling.
 *
 * Covers both an explicit handover AND a plain pause, because from the guest's
 * side they are the same thing: nobody is going to answer unless a person
 * does. The pause case is arguably the more urgent of the two — a handover has
 * an owner, a pause has none — so hiding it from this list would leave the one
 * state with no responsible party as the one nobody sees.
 */
export const needsHuman = (c: Contact) => conversationMode(c) !== "ai";

export const CHAT_FILTERS: ChatFilter[] = [
  {
    key: "ALL",
    label: "All",
    group: "attention",
    counted: false,
    emptyTitle: "No chats yet",
    emptyBody: "Conversations appear here as guests message your WhatsApp number.",
    match: () => true,
  },
  {
    key: "UNREAD",
    label: "Unread",
    group: "attention",
    counted: true,
    emptyTitle: "Nothing unread",
    emptyBody: "You're caught up — every guest message has been read.",
    match: isUnread,
  },
  {
    key: "NEEDS_YOU",
    label: "Needs you",
    group: "attention",
    counted: true,
    emptyTitle: "Nothing waiting on you",
    emptyBody: "Anushka is handling every open chat. Take one over any time you want to step in.",
    match: needsHuman,
  },
  {
    key: "HOT",
    label: "Hot",
    group: "attention",
    counted: true,
    emptyTitle: "No hot leads",
    emptyBody: "Guests who picked a room or gave dates and then went quiet show up here, closest to booking first.",
    match: isHot,
  },
  {
    key: "AI",
    label: "Anushka",
    group: "stage",
    counted: false,
    emptyTitle: "Anushka isn't on any chats",
    emptyBody: "Every open conversation is being handled by a person right now.",
    match: (c) => conversationMode(c) === "ai",
  },
  {
    key: "NEW",
    label: "New",
    group: "stage",
    counted: false,
    emptyTitle: "No new leads",
    emptyBody: "New enquiries land here before they're qualified.",
    match: (c) => c.leadStatus === "NEW",
  },
  {
    key: "INTERESTED",
    label: "Interested",
    group: "stage",
    counted: false,
    emptyTitle: "Nobody marked interested",
    emptyBody: "Move a guest here once they've shown real intent.",
    match: (c) => c.leadStatus === "INTERESTED",
  },
  {
    key: "FOLLOW_UP",
    label: "Follow-up",
    group: "stage",
    counted: false,
    emptyTitle: "Nothing to follow up",
    emptyBody: "Guests you've flagged to chase appear here.",
    match: (c) => c.leadStatus === "FOLLOW_UP",
  },
  {
    key: "BOOKED",
    label: "Booked",
    group: "stage",
    counted: false,
    emptyTitle: "No bookings yet",
    emptyBody: "Confirmed stays appear here.",
    match: (c) => c.leadStatus === "BOOKED",
  },
];

export function chatFilter(key: ChatFilterKey): ChatFilter {
  return CHAT_FILTERS.find((f) => f.key === key) ?? CHAT_FILTERS[0];
}

/**
 * Applies a filter and orders the result.
 *
 * Pinned chats come first everywhere — that is what pinning means, and a pin
 * that only worked on the All tab would be a pin that vanished exactly when
 * you filtered down to find the thing you pinned.
 *
 * Hot is the one list not ordered by recency. It exists to be worked top-down
 * in whatever time reception has, so the guest closest to booking has to be the
 * one at the top; sorting it by "most recent" would put the coldest lead that
 * happened to message last above someone with a room held.
 */
export function applyChatFilter(contacts: Contact[], key: ChatFilterKey): Contact[] {
  const filter = chatFilter(key);
  const matched = contacts.filter(filter.match);

  const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);

  return matched.sort((a, b) => {
    const pinDiff = time(b.pinnedAt) - time(a.pinnedAt);
    if (pinDiff !== 0) return pinDiff;

    if (key === "HOT") {
      const scoreDiff = (b.hotScore ?? 0) - (a.hotScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
    }

    return time(b.lastInboundAt || b.updatedAt) - time(a.lastInboundAt || a.updatedAt);
  });
}

/** Live counts for the chips that carry one. */
export function chatFilterCounts(contacts: Contact[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of CHAT_FILTERS) {
    if (f.counted) counts[f.key] = contacts.filter(f.match).length;
  }
  return counts;
}
