"use client";

import * as React from "react";
import { MessageSquarePlus, Search, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonSwap } from "@/components/motion/skeleton-swap";
import { useFetch } from "@/hooks/use-fetch";
import { cn } from "@/lib/utils";
import { Contact, LeadStatus } from "@/types";
import { ContactListItem } from "./contact-list-item";

/**
 * The chat list, built to match WhatsApp Web rather than a CRM table.
 *
 * Everything here follows the real thing: a titled header, a pill search that
 * fills the width, a single scrolling row of filter chips with the active one
 * in green, and rows that sit flush against each other. Staff already know how
 * to read WhatsApp; the closer this is, the less there is to learn.
 */

type Filter = { key: LeadStatus | "ALL" | "UNREAD"; label: string };

const FILTERS: Filter[] = [
  { key: "ALL", label: "All" },
  { key: "UNREAD", label: "Unread" },
  { key: "NEW", label: "New" },
  { key: "INTERESTED", label: "Interested" },
  { key: "FOLLOW_UP", label: "Follow-up" },
  { key: "BOOKED", label: "Booked" },
];

export function ContactList({
  selectedId,
  onSelect,
  reloadToken,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  reloadToken?: number;
}) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<Filter["key"]>("ALL");

  const params = new URLSearchParams();
  // UNREAD is a client-side view of whatever the server returned, not a lead
  // status — sending it as one would filter on a value the API doesn't know.
  if (filter !== "ALL" && filter !== "UNREAD") params.set("leadStatus", filter);
  if (search) params.set("search", search);

  const { data, loading, reload } = useFetch<{ contacts: Contact[] }>(`/api/contacts?${params.toString()}`, 20_000);

  React.useEffect(() => {
    if (reloadToken !== undefined) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  const contacts = React.useMemo(() => {
    const all = data?.contacts ?? [];
    return filter === "UNREAD" ? all.filter((c) => (c.unreadCount ?? 0) > 0) : all;
  }, [data?.contacts, filter]);

  const unreadTotal = (data?.contacts ?? []).filter((c) => (c.unreadCount ?? 0) > 0).length;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header — WhatsApp Web keeps the product name and actions on their own
          line above the search, which is what makes the column read as an
          inbox rather than a filtered table. */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h2 className="text-[19px] font-semibold tracking-tight">Chats</h2>
        <MessageSquarePlus className="size-[18px] text-muted-foreground" />
      </div>

      <div className="px-3 pb-2">
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

      <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-[13px] font-medium whitespace-nowrap transition-colors",
              filter === f.key
                ? "bg-[#d9fdd3] text-[#015c4b] dark:bg-[#103529] dark:text-[#21c063]"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {f.label}
            {f.key === "UNREAD" && unreadTotal > 0 && <span className="ml-1 tabular-nums">{unreadTotal}</span>}
          </button>
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
              <ContactListItem key={c.id} contact={c} active={c.id === selectedId} onClick={() => onSelect(c.id)} />
            ))}
          </div>
        </SkeletonSwap>

        {!loading && contacts.length === 0 && (
          <EmptyState
            icon={Users}
            title={filter === "UNREAD" ? "Nothing unread" : "No chats yet"}
            description={
              search || filter !== "ALL"
                ? "Try a different search or filter."
                : "Conversations appear here as guests message your WhatsApp number."
            }
          />
        )}
      </ScrollArea>
    </div>
  );
}

