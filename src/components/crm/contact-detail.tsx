"use client";

import * as React from "react";
import { Bot, MessagesSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { initials } from "@/lib/format";
import { BookingStatus, Contact, LeadStatus, Message } from "@/types";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New Lead",
  INTERESTED: "Interested",
  FOLLOW_UP: "Follow-up",
  BOOKED: "Booked",
  CLOSED: "Closed",
};

const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  NONE: "None",
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

export function ContactDetail({ contactId, onChanged }: { contactId: string | null; onChanged?: () => void }) {
  const { data: contactData, reload: reloadContact } = useFetch<{ contact: Contact }>(
    contactId ? `/api/contacts/${contactId}` : null
  );
  const { data: messagesData, reload: reloadMessages } = useFetch<{ messages: Message[] }>(
    contactId ? `/api/contacts/${contactId}/messages` : null
  );
  const [sending, setSending] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const contact = contactData?.contact;

  React.useEffect(() => {
    setNotes(contact?.notes ?? "");
  }, [contact?.id, contact?.notes]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData?.messages.length]);

  async function updateContact(patch: Partial<Contact>) {
    if (!contactId) return;
    await apiFetch(`/api/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify(patch) });
    reloadContact();
    onChanged?.();
  }

  async function sendReply(text: string) {
    if (!contactId) return;
    setSending(true);
    try {
      await apiFetch(`/api/contacts/${contactId}/reply`, { method: "POST", body: JSON.stringify({ text }) });
      reloadMessages();
      reloadContact();
    } finally {
      setSending(false);
    }
  }

  if (!contactId) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <MessagesSquare className="size-8" />
        <p className="text-sm">Select a contact to view the conversation.</p>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex h-full flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-border p-3">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials(contact.name || contact.phone)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{contact.name || contact.phone}</p>
            <p className="truncate text-xs text-muted-foreground">{contact.whatsappNumber}</p>
          </div>
          {contact.aiPaused ? (
            <Button variant="outline" size="sm" onClick={() => updateContact({ aiPaused: false })}>
              <Bot /> Resume AI
            </Button>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
              <Bot className="size-3" /> Aria active
            </span>
          )}
        </div>

        {contact.aiSummary && <p className="text-xs text-muted-foreground italic">{contact.aiSummary}</p>}

        <div className="grid grid-cols-2 gap-2">
          <Select value={contact.leadStatus} onValueChange={(v) => v && updateContact({ leadStatus: v as LeadStatus })}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => LEAD_STATUS_LABELS[v as LeadStatus]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={contact.bookingStatus} onValueChange={(v) => v && updateContact({ bookingStatus: v as BookingStatus })}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => BOOKING_STATUS_LABELS[v as BookingStatus]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (contact.notes ?? "") && updateContact({ notes })}
          placeholder="Internal notes…"
          className="min-h-14"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2.5 p-4">
          {!messagesData
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-2/3" />)
            : messagesData.messages.map((m) => <MessageBubble key={m.id} message={m} />)}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <MessageComposer onSend={sendReply} sending={sending} />
    </div>
  );
}
