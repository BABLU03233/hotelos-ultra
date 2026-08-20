"use client";

import * as React from "react";
import { Bot, Check, ChevronDown, Mail, MailOpen, Pin, PinOff, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";
import { conversationMode } from "@/lib/crm/handover";
import { saveWithFeedback } from "@/lib/save-with-feedback";
import { cn } from "@/lib/utils";
import { Contact, LeadStatus } from "@/types";

const STAGES: { value: LeadStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "INTERESTED", label: "Interested" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "BOOKED", label: "Booked" },
  { value: "CLOSED", label: "Closed" },
];

/**
 * The per-chat menu, in the same place WhatsApp puts it — a chevron that
 * appears on the row itself.
 *
 * Every action here was previously only reachable by opening the conversation
 * and hunting through the details panel. On a busy morning a receptionist is
 * triaging a list, not reading one chat at a time: marking three as read,
 * pinning the booking they are chasing, taking over the one that needs a call.
 * Making those cost a click each, without leaving the list, is most of what
 * "easier" means here.
 *
 * Deliberately short. The full details panel still exists for everything else;
 * a menu long enough to need scanning is slower than the panel it replaced.
 */
export function ContactRowMenu({ contact, onChanged }: { contact: Contact; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false);
  const mode = conversationMode(contact);
  const pinned = Boolean(contact.pinnedAt);
  const unread = (contact.unreadCount ?? 0) > 0;

  async function patch(body: Record<string, unknown>, success: string) {
    const ok = await saveWithFeedback(
      () => apiFetch(`/api/contacts/${contact.id}`, { method: "PATCH", body: JSON.stringify(body) }),
      "Couldn't update that chat"
    );
    if (ok) {
      toast.success(success);
      onChanged();
    }
  }

  async function handover(action: "take_over" | "return_to_ai", success: string) {
    const ok = await saveWithFeedback(
      () => apiFetch(`/api/contacts/${contact.id}/handover`, { method: "POST", body: JSON.stringify({ action }) }),
      "Couldn't change who's handling this chat"
    );
    if (ok) {
      toast.success(success);
      onChanged();
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        // Stops the click selecting the chat underneath — opening the menu and
        // opening the conversation are different intentions.
        onClick={(e) => e.stopPropagation()}
        aria-label="Chat options"
        className={cn(
          "shrink-0 rounded-md p-0.5 text-muted-foreground outline-none transition-opacity hover:bg-muted",
          // Hidden until hover on a pointer device, always present on touch —
          // WhatsApp's own behaviour, and on a phone there is no hover to
          // reveal it with.
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
        )}
      >
        <ChevronDown className="size-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        {mode === "ai" ? (
          <DropdownMenuItem onClick={() => handover("take_over", "You're handling this chat now.")}>
            <UserRound /> I&apos;ll take this
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => handover("return_to_ai", "Anushka is handling this chat again.")}>
            <Bot /> Return to Anushka
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onClick={() =>
            unread
              ? patch({ markRead: true }, "Marked as read.")
              : patch({ markUnread: true }, "Marked as unread.")
          }
        >
          {unread ? <MailOpen /> : <Mail />}
          {unread ? "Mark as read" : "Mark as unread"}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => patch({ pinned: !pinned }, pinned ? "Unpinned." : "Pinned to the top.")}
        >
          {pinned ? <PinOff /> : <Pin />}
          {pinned ? "Unpin chat" : "Pin chat"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Move to stage</DropdownMenuLabel>
        {STAGES.map((s) => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => {
              // Already there — say so rather than firing a no-op write that
              // reports success for a change that never happened.
              if (contact.leadStatus === s.value) {
                toast.info(`Already ${s.label.toLowerCase()}.`);
                return;
              }
              patch({ leadStatus: s.value }, `Moved to ${s.label}.`);
            }}
          >
            <Check className={cn("size-4", contact.leadStatus === s.value ? "opacity-100" : "opacity-0")} />
            {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
