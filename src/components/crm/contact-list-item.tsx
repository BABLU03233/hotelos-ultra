"use client";

import { History, Target } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, formatRelativeTime } from "@/lib/format";
import { LEAD_STATUS_DOT } from "@/lib/lead-status-colors";
import { Contact } from "@/types";
import { cn } from "@/lib/utils";

export function ContactListItem({ contact, active, onClick }: { contact: Contact; active: boolean; onClick: () => void }) {
  const unread = !!contact.lastInboundAt && (!contact.lastReadAt || new Date(contact.lastInboundAt) > new Date(contact.lastReadAt));

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
          <p className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{contact.name || contact.phone}</p>
          {contact.assignedTo && (
            <Avatar className="size-4 shrink-0" title={`Assigned to ${contact.assignedTo.name}`}>
              <AvatarFallback className="text-[7px]">{initials(contact.assignedTo.name)}</AvatarFallback>
            </Avatar>
          )}
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {formatRelativeTime(contact.lastInboundAt || contact.updatedAt)}
          </span>
        </div>
        <p className={cn("mt-0.5 truncate text-xs", unread ? "text-foreground" : "text-muted-foreground")}>
          {contact.lastMessage || "No messages yet"}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={cn("size-1.5 shrink-0 rounded-full", LEAD_STATUS_DOT[contact.leadStatus])} />
          <span className="text-[10px] text-muted-foreground capitalize">{contact.leadStatus.replace("_", " ").toLowerCase()}</span>
          {contact.leadSource === "META_AD" && (
            <span title={contact.sourceDetail ? `From a Meta ad: ${contact.sourceDetail}` : "From a Meta ad"}>
              <Target className="size-2.5 shrink-0 text-primary" />
            </span>
          )}
          {contact.leadSource === "COLD_IMPORT" && (
            <span title="Imported old number">
              <History className="size-2.5 shrink-0 text-muted-foreground" />
            </span>
          )}
          {contact.tags.slice(0, 2).map((t) => (
            <span key={t} className="truncate rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {t}
            </span>
          ))}
          {unread && <span className="ml-auto size-2 shrink-0 rounded-full bg-primary" />}
        </div>
      </div>
    </button>
  );
}
