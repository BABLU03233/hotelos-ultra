"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { cn } from "@/lib/utils";
import { Contact, LeadStatus } from "@/types";
import { ContactListItem } from "./contact-list-item";

const STATUS_FILTERS: { key: LeadStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "NEW", label: "New" },
  { key: "INTERESTED", label: "Interested" },
  { key: "FOLLOW_UP", label: "Follow-up" },
  { key: "BOOKED", label: "Booked" },
  { key: "CLOSED", label: "Closed" },
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
  const [status, setStatus] = React.useState<LeadStatus | "ALL">("ALL");

  const params = new URLSearchParams();
  if (status !== "ALL") params.set("leadStatus", status);
  if (search) params.set("search", search);

  const { data, loading, reload } = useFetch<{ contacts: Contact[] }>(`/api/contacts?${params.toString()}`, 20_000);

  React.useEffect(() => {
    if (reloadToken !== undefined) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts…" className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                status === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 pr-2">
          {loading || !data
            ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
            : data.contacts.map((c) => (
                <ContactListItem key={c.id} contact={c} active={c.id === selectedId} onClick={() => onSelect(c.id)} />
              ))}
          {!loading && data?.contacts.length === 0 && (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">No contacts yet.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
