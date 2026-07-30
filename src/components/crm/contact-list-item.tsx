"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, formatRelativeTime } from "@/lib/format";
import { Contact } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<Contact["leadStatus"], string> = {
  NEW: "bg-blue-500",
  INTERESTED: "bg-amber-500",
  FOLLOW_UP: "bg-violet-500",
  BOOKED: "bg-emerald-500",
  CLOSED: "bg-muted-foreground",
};

export function ContactListItem({ contact, active, onClick }: { contact: Contact; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors hover:bg-muted",
        active && "bg-muted"
      )}
    >
      <Avatar>
        <AvatarFallback>{initials(contact.name || contact.phone)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{contact.name || contact.phone}</p>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {formatRelativeTime(contact.lastInboundAt || contact.updatedAt)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{contact.lastMessage || "No messages yet"}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", STATUS_TONE[contact.leadStatus])} />
          <span className="text-[10px] text-muted-foreground capitalize">{contact.leadStatus.replace("_", " ").toLowerCase()}</span>
        </div>
      </div>
    </button>
  );
}
