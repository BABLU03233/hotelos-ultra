"use client";

import { Bot, Flame, History, Target, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, formatRelativeTime } from "@/lib/format";
import { conversationMode } from "@/lib/crm/handover";
import { HOT_THRESHOLD } from "@/lib/crm/hot-lead";
import { Contact } from "@/types";
import { cn } from "@/lib/utils";

/**
 * One conversation in the desk list, built to read like WhatsApp's own chat
 * list rather than a CRM table.
 *
 * The shape that matters: a divider-separated row (not a floating card), an
 * avatar, the name and time on one line, a single-line preview, then a row of
 * small status chips. Staff scan this list dozens of times a day, so the
 * chips carry the three things they actually triage on — who is handling it,
 * where the lead stands, and whether a booking exists — instead of making
 * them open each conversation to find out.
 */

const LEAD_LABEL: Record<Contact["leadStatus"], string> = {
  NEW: "New",
  INTERESTED: "Interested",
  FOLLOW_UP: "Follow-up",
  BOOKED: "Booked",
  CLOSED: "Closed",
};

/**
 * Colour carries meaning here, so it is assigned by what the state means to
 * the hotel rather than picked for variety: green where money has landed,
 * amber where someone is waiting on staff, grey where nothing is owed.
 */
const LEAD_CHIP: Record<Contact["leadStatus"], string> = {
  NEW: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  INTERESTED: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  FOLLOW_UP: "bg-amber-500/10 text-amber-600 dark:text-amber-500",
  BOOKED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CLOSED: "bg-muted text-muted-foreground",
};

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-none font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

export function ContactListItem({ contact, active, onClick }: { contact: Contact; active: boolean; onClick: () => void }) {
  const unreadCount = contact.unreadCount ?? 0;
  const unread = unreadCount > 0;
  const mode = conversationMode(contact);
  const hot = (contact.hotScore ?? 0) >= HOT_THRESHOLD;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0",
        active ? "bg-muted" : "hover:bg-muted/50"
      )}
    >
      <Avatar className="size-10 shrink-0">
        <AvatarFallback className="text-xs font-medium">{initials(contact.name || contact.phone)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className={cn("min-w-0 flex-1 truncate text-[14px]", unread ? "font-semibold" : "font-medium")}>
            {contact.name || contact.phone}
          </p>
          <span className={cn("shrink-0 text-[11px]", unread ? "font-medium text-emerald-600" : "text-muted-foreground")}>
            {formatRelativeTime(contact.lastInboundAt || contact.updatedAt)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          <p className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "text-foreground" : "text-muted-foreground")}>
            {contact.lastMessage || "No messages yet"}
          </p>
          {unread && (
            <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {/* Who is driving the conversation — the first thing staff need to
              know before they type into it. A paused assistant means a human
              is expected to answer, and that must be visible without opening
              the chat. */}
          {mode === "human" ? (
            // A person formally holds this one. Distinct from the softer
            // "paused" below, because the two call for different behaviour: a
            // handover is somebody else's job right now, a pause is nobody's.
            <Chip className="bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <UserRound className="size-2.5" /> {contact.handoverByName || "Reception"}
            </Chip>
          ) : mode === "paused" ? (
            <Chip className="bg-amber-500/10 text-amber-600 dark:text-amber-500">
              <UserRound className="size-2.5" /> Human
            </Chip>
          ) : (
            <Chip className="bg-primary/10 text-primary">
              <Bot className="size-2.5" /> Anushka
            </Chip>
          )}

          {/* Hot leads carry their strongest reason inline. A flame with no
              explanation is a badge staff learn to ignore; "Picked a room and
              gave dates" tells them what to open the chat and say. */}
          {hot && (
            <Chip className="bg-orange-500/10 font-semibold text-orange-600 dark:text-orange-400">
              <Flame className="size-2.5" /> {contact.hotReasons?.[0] ?? "Close to booking"}
            </Chip>
          )}

          <Chip className={LEAD_CHIP[contact.leadStatus]}>{LEAD_LABEL[contact.leadStatus]}</Chip>

          {contact.bookingStatus === "CONFIRMED" && contact.leadStatus !== "BOOKED" && (
            <Chip className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Booked</Chip>
          )}
          {contact.bookingStatus === "PENDING" && (
            <Chip className="bg-amber-500/10 text-amber-600 dark:text-amber-500">Pending</Chip>
          )}

          {contact.optedOutAt && <Chip className="bg-destructive/10 text-destructive">Opted out</Chip>}

          {contact.leadSource === "META_AD" && (
            <Chip className="bg-muted text-muted-foreground" >
              <Target className="size-2.5" /> Ad
            </Chip>
          )}
          {contact.leadSource === "COLD_IMPORT" && (
            <Chip className="bg-muted text-muted-foreground">
              <History className="size-2.5" /> Imported
            </Chip>
          )}

          {contact.tags.slice(0, 2).map((t) => (
            <Chip key={t} className="bg-muted text-muted-foreground">
              {t}
            </Chip>
          ))}
        </div>
      </div>
    </button>
  );
}
