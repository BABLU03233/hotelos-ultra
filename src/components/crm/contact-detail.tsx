"use client";

import * as React from "react";
import {
  ArrowLeft,
  BellOff,
  Bot,
  CalendarClock,
  CircleUserRound,
  Clock,
  History,
  MessagesSquare,
  Target,
  TriangleAlert,
  X,
} from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GlossaryTerm } from "@/components/shared/glossary-term";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { formatCountdown, formatRelativeTime, hoursSince, initials } from "@/lib/format";
import { useAuthStore } from "@/store/use-auth-store";
import { cn } from "@/lib/utils";
import { BookingStatus, Contact, FollowUpAction, LeadStatus, Message, ScheduledFollowUp, StaffMember, StaffNotification } from "@/types";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
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

const ACTION_LABELS: Record<FollowUpAction, string> = {
  REMINDER: "Reminder",
  OFFER: "Offer",
  PACKAGE: "Package",
  LAST: "Last follow-up",
};

type ContactPatch = Partial<Contact> & { markRead?: boolean };

export function ContactDetail({
  contactId,
  onChanged,
  onBack,
}: {
  contactId: string | null;
  onChanged?: () => void;
  onBack?: () => void;
}) {
  const { data: contactData, reload: reloadContact } = useFetch<{ contact: Contact }>(
    contactId ? `/api/contacts/${contactId}` : null
  );
  const { data: messagesData, reload: reloadMessages } = useFetch<{ messages: Message[] }>(
    contactId ? `/api/contacts/${contactId}/messages` : null
  );
  const [sending, setSending] = React.useState(false);
  const contact = contactData?.contact;

  async function updateContact(patch: ContactPatch) {
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
    <ContactDetailPane
      key={contact.id}
      contact={contact}
      messages={messagesData?.messages}
      sending={sending}
      updateContact={updateContact}
      sendReply={sendReply}
      onBack={onBack}
    />
  );
}

function ContactDetailPane({
  contact,
  messages,
  sending,
  updateContact,
  sendReply,
  onBack,
}: {
  contact: Contact;
  messages: Message[] | undefined;
  sending: boolean;
  updateContact: (patch: ContactPatch) => Promise<void>;
  sendReply: (text: string) => Promise<void>;
  onBack?: () => void;
}) {
  const [notes, setNotes] = React.useState(contact.notes ?? "");
  const [tagInput, setTagInput] = React.useState("");
  const [reminderAt, setReminderAt] = React.useState("");
  const [reminderNote, setReminderNote] = React.useState("");
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const agentName = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");

  const { data: staffData } = useFetch<{ staff: StaffMember[] }>("/api/settings/staff");
  const { data: notificationsData, reload: reloadNotifications } = useFetch<{ notifications: StaffNotification[] }>(
    "/api/notifications"
  );
  const { data: followUpsData } = useFetch<{ followUps: ScheduledFollowUp[] }>(`/api/contacts/${contact.id}/follow-ups`);
  const escalation = notificationsData?.notifications.find((n) => n.contact.id === contact.id);
  const upcomingFollowUps = followUpsData?.followUps.filter((f) => f.status === "PENDING") ?? [];
  const hoursSinceInbound = contact.lastInboundAt ? hoursSince(contact.lastInboundAt) : null;
  const windowOpen = hoursSinceInbound === null || hoursSinceInbound < 24;

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  React.useEffect(() => {
    updateContact({ markRead: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id]);

  async function resolveEscalation() {
    if (!escalation) return;
    await apiFetch(`/api/notifications/${escalation.id}`, { method: "PATCH", body: JSON.stringify({}) });
    reloadNotifications();
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || contact.tags.includes(tag)) {
      setTagInput("");
      return;
    }
    updateContact({ tags: [...contact.tags, tag] });
    setTagInput("");
  }

  function removeTag(tag: string) {
    updateContact({ tags: contact.tags.filter((t) => t !== tag) });
  }

  async function setReminder() {
    if (!reminderAt) return;
    await updateContact({ followUpDate: new Date(reminderAt).toISOString(), followUpNote: reminderNote || null });
    setReminderAt("");
    setReminderNote("");
  }

  async function clearReminder() {
    await updateContact({ followUpDate: null, followUpNote: null });
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon-sm" className="-ml-1 shrink-0 md:hidden" onClick={onBack}>
              <ArrowLeft />
            </Button>
          )}
          <button
            onClick={() => setDetailsOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-0.5 text-left transition hover:bg-muted/60"
          >
            <Avatar>
              <AvatarFallback>{initials(contact.name || contact.phone)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{contact.name || contact.phone}</p>
              <p className="truncate text-xs text-muted-foreground">
                {contact.whatsappNumber}
                {contact.optedOutAt && <span className="ml-1.5 font-medium text-amber-600">· Opted out</span>}
              </p>
            </div>
          </button>
          {contact.aiPaused ? (
            <div className="flex shrink-0 items-center gap-1">
              <span className="hidden items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-600 sm:flex">
                <Bot className="size-3" /> AI paused
              </span>
              <Button variant="outline" size="sm" onClick={() => updateContact({ aiPaused: false })}>
                Resume AI
              </Button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-1">
              <span className="hidden items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary sm:flex">
                <Bot className="size-3" /> {agentName} active
              </span>
              <Button variant="ghost" size="sm" onClick={() => updateContact({ aiPaused: true })}>
                Pause AI
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={() => setDetailsOpen(true)}
            aria-label="Contact details"
          >
            <CircleUserRound />
          </Button>
        </div>

        {contact.aiSummary && <p className="truncate text-xs text-muted-foreground italic">{contact.aiSummary}</p>}

        {escalation && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{agentName} escalated this conversation</p>
              <p className="text-xs text-muted-foreground">{escalation.reason}</p>
            </div>
            <button onClick={resolveEscalation} className="shrink-0 text-[11px] font-medium text-primary hover:underline">
              Mark resolved
            </button>
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2.5 p-4">
          {!messages
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-2/3" />)
            : messages.map((m) => <MessageBubble key={m.id} message={m} />)}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {contact.lastInboundAt && (
        <p
          className={cn(
            "border-t px-4 py-2 text-[11px]",
            windowOpen
              ? "border-border text-muted-foreground"
              : "border-amber-500/30 bg-amber-500/10 font-medium text-amber-600"
          )}
        >
          {windowOpen ? (
            <>Free-form replies open — guest messaged {formatRelativeTime(contact.lastInboundAt)}.</>
          ) : (
            <>
              <GlossaryTerm term="24h-window">24-hour window</GlossaryTerm>
              {" "}closed — only a{" "}
              <GlossaryTerm term="approved-template">Meta-approved template</GlossaryTerm> can reach this guest now.
            </>
          )}
        </p>
      )}
      <MessageComposer onSend={sendReply} sending={sending} />

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Contact details</SheetTitle>
            <SheetDescription className="sr-only">
              Lead status, booking status, tags, notes, and automation for {contact.name || contact.phone}.
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 p-4">
              {contact.leadSource !== "DIRECT" && (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {contact.leadSource === "META_AD" ? (
                    <>
                      <Target className="size-3 shrink-0" />
                      Meta ad{contact.sourceDetail ? ` — ${contact.sourceDetail}` : ""}
                    </>
                  ) : (
                    <>
                      <History className="size-3 shrink-0" />
                      {contact.sourceDetail || "Cold import"}
                    </>
                  )}
                </p>
              )}
              {contact.optedOutAt && (
                <p className="-mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-600">
                  <BellOff className="size-3 shrink-0" />
                  Opted out of promotions — no campaigns or follow-ups will be sent
                </p>
              )}

              <Tabs defaultValue="details">
                <TabsList className="w-full">
                  <TabsTrigger value="details" className="flex-1">
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="automation" className="flex-1">
                    Automation{upcomingFollowUps.length > 0 && ` (${upcomingFollowUps.length})`}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="flex flex-col gap-2.5">
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

                  <Select
                    value={contact.assignedToId ?? "unassigned"}
                    onValueChange={(v) => v && updateContact({ assignedToId: v === "unassigned" ? null : v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {() => (contact.assignedToId ? staffData?.staff.find((s) => s.id === contact.assignedToId)?.name : "Unassigned")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {staffData?.staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {contact.tags.map((tag) => (
                      <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="text-muted-foreground hover:text-foreground">
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ))}
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder="Add tag…"
                      className="h-6 w-24 border-none bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                    />
                  </div>

                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => notes !== (contact.notes ?? "") && updateContact({ notes })}
                    placeholder="Internal notes…"
                    className="min-h-14"
                  />
                </TabsContent>

                <TabsContent value="automation" className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold">
                      <CalendarClock className="size-3.5 shrink-0 text-primary" />
                      Personal reminder
                    </p>
                    {contact.followUpDate ? (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className={cn(
                              "text-xs font-medium",
                              new Date(contact.followUpDate) <= new Date() && "text-amber-600"
                            )}
                          >
                            {formatCountdown(contact.followUpDate)}
                          </p>
                          {contact.followUpNote && <p className="text-[11px] text-muted-foreground">{contact.followUpNote}</p>}
                        </div>
                        <button onClick={clearReminder} className="shrink-0 text-[10px] font-medium text-primary hover:underline">
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <Input type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
                        <Input
                          value={reminderNote}
                          onChange={(e) => setReminderNote(e.target.value)}
                          placeholder="What's this about? (optional)"
                          className="text-xs"
                        />
                        <Button size="sm" variant="outline" disabled={!reminderAt} onClick={setReminder}>
                          Schedule reminder
                        </Button>
                        <p className="text-[10px] text-muted-foreground">
                          Notifies you when it&apos;s time — separate from the automated follow-up steps below.
                        </p>
                      </div>
                    )}
                  </div>

                  {upcomingFollowUps.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      No follow-ups scheduled — {contact.aiPaused ? "AI is paused for this contact." : "nothing pending right now."}
                    </p>
                  ) : (
                    upcomingFollowUps.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                        <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{ACTION_LABELS[f.rule.action]}</p>
                          <p className="text-[10px] text-muted-foreground">{formatCountdown(f.runAt)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
