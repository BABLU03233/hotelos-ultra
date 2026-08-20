"use client";

import * as React from "react";
import { Bot, Flame, MailOpen, Search, UserRound, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonSwap } from "@/components/motion/skeleton-swap";
import { useFetch } from "@/hooks/use-fetch";
import {
  applyChatFilter,
  chatFilter,
  chatFilterCounts,
  CHAT_FILTERS,
  type ChatFilterKey,
} from "@/lib/crm/chat-filters";
import { cn } from "@/lib/utils";
import { Contact } from "@/types";
import { ContactListItem } from "./contact-list-item";
import { DeskStatus } from "./desk-status";

/**
 * The chat list, built to match WhatsApp Web rather than a CRM table.
 *
 * Everything here follows the real thing: a titled header, a pill search that
 * fills the width, a row of filter chips with the active one in green, and rows
 * that sit flush against each other. Staff already know how to read WhatsApp;
 * the closer this is, the less there is to learn.
 *
 * Filtering is entirely client-side now, against one fetch of the whole list.
 * Two reasons. The counts on the chips have to describe the WHOLE inbox — a
 * "Human mode 3" that silently meant "3 among the ones you are currently looking
 * at" would be worse than no number. And switching filters becomes instant, with
 * no refetch and no skeleton flash, which matters when triage means bouncing
 * between Unread and Human mode a dozen times. Search stays server-side, since
 * that is a query rather than a view.
 */

const FILTER_ICON: Partial<Record<ChatFilterKey, typeof Users>> = {
  UNREAD: MailOpen,
  HUMAN: UserRound,
  HOT: Flame,
  AI: Bot,
};

export function ContactList({
  selectedId,
  onSelect,
  reloadToken,
  initialFilter,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  reloadToken?: number;
  /**
   * Which list to open on, from ?filter= in the URL.
   *
   * Lets the dashboard cards deep-link: "Hot leads 4" goes straight to those
   * four conversations instead of dropping the owner on All and leaving them
   * to find the chip. Read once as the initial value — after that the chips
   * own it, so clicking one does not fight the URL.
   */
  initialFilter?: ChatFilterKey;
}) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<ChatFilterKey>(initialFilter ?? "ALL");

  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const { data, loading, reload } = useFetch<{ contacts: Contact[] }>(`/api/contacts?${params.toString()}`, 20_000);

  React.useEffect(() => {
    if (reloadToken !== undefined) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  const all = React.useMemo(() => data?.contacts ?? [], [data?.contacts]);
  const contacts = React.useMemo(() => applyChatFilter(all, filter), [all, filter]);
  const counts = React.useMemo(() => chatFilterCounts(all), [all]);

  const active = chatFilter(filter);
  const attention = CHAT_FILTERS.filter((f) => f.group === "attention");
  const stages = CHAT_FILTERS.filter((f) => f.group === "stage");

  function Chip({ f }: { f: (typeof CHAT_FILTERS)[number] }) {
    const Icon = FILTER_ICON[f.key];
    const count = f.counted ? (counts[f.key] ?? 0) : 0;
    return (
      <button
        onClick={() => setFilter(f.key)}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[13px] font-medium whitespace-nowrap transition-colors",
          filter === f.key
            ? "bg-[#d9fdd3] text-[#015c4b] dark:bg-[#103529] dark:text-[#21c063]"
            : "bg-muted text-muted-foreground hover:bg-muted/70"
        )}
      >
        {Icon && <Icon className="size-3.5" />}
        {f.label}
        {f.counted && count > 0 && <span className="tabular-nums">{count}</span>}
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header — WhatsApp Web keeps the product name and actions on their own
          line above the search, which is what makes the column read as an
          inbox rather than a filtered table. */}
      <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <h2 className="shrink-0 text-[19px] font-semibold tracking-tight">Chats</h2>
        {/* Takes the slot the decorative compose icon used to occupy. That icon
            did nothing — new conversations start when a guest messages the
            hotel, not from here — and this is the same pixels answering a
            question staff actually have. */}
        <DeskStatus contacts={all} onFilter={setFilter} className="no-scrollbar min-w-0 overflow-x-auto" />
      </div>

      <div className="px-3 pb-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start a new chat"
            className="h-9 w-full rounded-lg bg-muted pr-3 pl-9 text-[13px] outline-none placeholder:text-muted-foreground focus:ring-0"
          />
        </div>
      </div>

      {/* Two groups, one scrolling row, separated by a rule.
          "What needs me?" is a different question from "where is this lead?",
          and answering them with one undifferentiated strip of chips made the
          urgent ones sit beside labels that change nothing about what to do
          next. The divider is doing real work, not decoration. */}
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-2">
        {attention.map((f) => (
          <Chip key={f.key} f={f} />
        ))}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
        {stages.map((f) => (
          <Chip key={f.key} f={f} />
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1 border-t border-border/60">
        <SkeletonSwap
          showSkeleton={loading || !data}
          skeleton={
            <div className="flex flex-col">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border/60 px-3 py-3">
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          }
        >
          <div className="flex flex-col">
            {contacts.map((c) => (
              <ContactListItem
                key={c.id}
                contact={c}
                active={c.id === selectedId}
                onClick={() => onSelect(c.id)}
                onChanged={reload}
              />
            ))}
          </div>
        </SkeletonSwap>

        {!loading && contacts.length === 0 && (
          <EmptyState
            icon={FILTER_ICON[filter] ?? Users}
            // Every filter explains its own emptiness. "Try a different search
            // or filter" told staff nothing about what the tab was for — the
            // Hot tab being empty is good news, and should read that way.
            title={search ? "No matches" : active.emptyTitle}
            description={search ? "No guest matches that search." : active.emptyBody}
          />
        )}
      </ScrollArea>
    </div>
  );
}
