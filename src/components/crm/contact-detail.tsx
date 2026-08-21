"use client";

import * as React from "react";
import {
  ArrowLeft,
  BellOff,
  CalendarClock,
  CircleUserRound,
  Clock,
  History,
  MessagesSquare,
  StickyNote,
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

import { useFetch } from "@/hooks/use-fetch";
import { useMediaQuery } from "@/hooks/use-media-query";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { avatarColorClass } from "@/lib/avatar-color";
import { dayKey, formatCountdown, formatDaySeparator, initials } from "@/lib/format";

import { useAuthStore } from "@/store/use-auth-store";
import { cn } from "@/lib/utils";
import { BookingStatus, Contact, FollowUpAction, LeadStatus, Message, ScheduledFollowUp, StaffMember, StaffNotification } from "@/types";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { HandoverControls } from "./handover-controls";

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
  // Named in the empty-state splash, same source the conversation header uses.
  const agentNameForSplash = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");

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
    } catch (err) {
      // Surfaced rather than swallowed. A send that WhatsApp refuses (most
      // often the closed 24-hour window) used to leave the composer looking
      // like it had worked, which is how staff ended up believing messages
      // were delivered when they never left the building.
      toast.error(err instanceof Error ? err.message : "Couldn't send that message");
    } finally {
      setSending(false);
    }
  }

  async function sendTemplate(name: string, language: string) {
    if (!contactId) return;
    setSending(true);
    try {
      await apiFetch(`/api/contacts/${contactId}/reply`, {
        method: "POST",
        body: JSON.stringify({ templateName: name, templateLanguage: language }),
      });
      reloadMessages();
      reloadContact();
      toast.success("Template sent — this reaches the guest even outside the 24-hour window.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that template");
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File, caption: string) {
    if (!contactId) return;
    setSending(true);
    try {
      const body = new FormData();
      body.append("file", file);
      if (caption) body.append("caption", caption);
      await apiFetch(`/api/contacts/${contactId}/reply`, { method: "POST", body });
      reloadMessages();
      reloadContact();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that attachment");
    } finally {
      setSending(false);
    }
  }

  if (!contactId) {
    // WhatsApp Web fills this space with a large, calm splash rather than a
    // small centred label — it is the first thing staff see every morning, and
    // it should read as "the desk is ready", not as an empty table.
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center bg-[#f0f2f5] px-8 text-center dark:bg-[#222e35]">
        <div className="mb-6 flex size-28 items-center justify-center rounded-full bg-background/60">
          <MessagesSquare className="size-14 text-muted-foreground/50" strokeWidth={1.25} />
        </div>
        <h2 className="text-[26px] font-light tracking-tight text-muted-foreground">{agentNameForSplash} Desk</h2>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground/80">
          Pick a conversation on the left to read the full history, see the guest&apos;s details, and reply yourself
          whenever you want to step in.
        </p>
        <p className="mt-6 border-t border-border/60 pt-4 text-[12px] text-muted-foreground/70">
          Guests message your WhatsApp number and land here automatically.
        </p>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col gap-3 p-4">
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
      sendFile={sendFile}
      sendTemplate={sendTemplate}
      refresh={() => {
        reloadContact();
        onChanged?.();
      }}
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
  sendFile,
  sendTemplate,
  refresh,
  onBack,
}: {
  contact: Contact;
  messages: Message[] | undefined;
  sending: boolean;
  updateContact: (patch: ContactPatch) => Promise<void>;
  sendReply: (text: string) => Promise<void>;
  sendFile: (file: File, caption: string) => Promise<void>;
  sendTemplate: (name: string, language: string) => Promise<void>;
  /** Re-reads the contact and tells the list to refresh — used after a handover. */
  refresh: () => void;
  onBack?: () => void;
}) {
  const [notes, setNotes] = React.useState(contact.notes ?? "");
  const [tagInput, setTagInput] = React.useState("");
  const [reminderAt, setReminderAt] = React.useState("");
  const [reminderNote, setReminderNote] = React.useState("");
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  // 1280px = Tailwind's xl breakpoint used everywhere else in this app. Below
  // it there is not enough width for list + chat + a docked profile column
  // side by side, so the panel falls back to the Sheet it always was.
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const [detailsTab, setDetailsTab] = React.useState<"details" | "automation">("details");
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const agentName = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");

  const { data: staffData } = useFetch<{ staff: StaffMember[] }>("/api/settings/staff");
  const { data: notificationsData, reload: reloadNotifications } = useFetch<{ notifications: StaffNotification[] }>(
    "/api/notifications"
  );
  const { data: followUpsData } = useFetch<{ followUps: ScheduledFollowUp[] }>(`/api/contacts/${contact.id}/follow-ups`);
  const escalation = notificationsData?.notifications.find((n) => n.contact.id === contact.id);
  const upcomingFollowUps = followUpsData?.followUps.filter((f) => f.status === "PENDING") ?? [];
  // The 24-hour window is deliberately not consulted here any more. Staff can
  // message any contact at any time; WhatsApp decides, and a refusal explains
  // itself on the message. serviceWindow still backs campaigns and follow-up
  // sweeps, which genuinely must not send into a closed window unattended.

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

  // The panel that used to live only inside a slide-over Sheet, factored
  // out so the exact same JSX renders in two different homes depending on
  // screen width: docked as a permanent third column on desktop, matching
  // a real CRM's always-visible guest profile — the reference this was
  // built against keeps Profile/Notes/Timeline docked at all times, and a
  // slide-over that has to be opened for every lookup reads as an
  // afterthought next to that. Below the width a third column can't fit,
  // it stays a Sheet exactly as before. Built once per render and consumed
  // by exactly one of the two homes — see isDesktop below — so there is
  // never a moment where both are mounted at once, fighting over the same
  // controlled inputs (notes, tags, the reminder form).
  const detailsBody = (
    <>
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

              <Tabs
                value={detailsTab}
                onValueChange={(v) => v && setDetailsTab(v as "details" | "automation")}
              >
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
                              formatCountdown(contact.followUpDate) === "due now" && "text-amber-600"
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
    </>
  );

  return (
    <>
      <div className="flex h-full min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3">
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
              <AvatarFallback className={avatarColorClass(contact.id)}>{initials(contact.name || contact.phone)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{contact.name || contact.phone}</p>
              <p className="truncate text-xs text-muted-foreground">{contact.whatsappNumber}</p>
              {contact.optedOutAt && (
                <p className="text-xs font-medium text-amber-600">Opted out</p>
              )}
            </div>
          </button>
          {/* Redundant on desktop, where the panel is already docked and
              always visible — only needed below xl, where it opens the
              Sheet. */}
          {!isDesktop && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => setDetailsOpen(true)}
              aria-label="Contact details"
            >
              <CircleUserRound />
            </Button>
          )}
        </div>

        {/* Full width, directly under the name. Who is replying is the first
            thing a receptionist has to know before typing, and it used to be a
            chip that was `hidden lg:flex` — invisible on the phone they
            actually work from. */}
        <HandoverControls
          contact={contact}
          agentName={agentName}
          onChanged={refresh}
        />

        {contact.aiSummary && <p className="text-xs text-muted-foreground italic">{contact.aiSummary}</p>}

        {/* The note the last person left for Anushka. Shown to staff too — the
            next receptionist needs to know what the guest was already told, and
            a note only the model can see is a note the team cannot correct. */}
        {contact.aiBriefing && (
          <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
            <StickyNote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Note for {agentName}:</span> {contact.aiBriefing}
            </p>
          </div>
        )}

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

      {/* WhatsApp's chat surface: a warm sand ground in light mode, deep slate
          in dark, with its faint doodle tile. The tile is an inline SVG data
          URI rather than an asset — the artifact CSP and our own build both
          stay simpler with nothing external to fetch. */}
      <ScrollArea
        className="min-h-0 flex-1 bg-[#efeae2] dark:bg-[#0b141a]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' stroke='%23000' stroke-opacity='0.035' stroke-width='1.2'%3E%3Cpath d='M12 8c2-3 6-3 8 0M40 14c3 1 4 5 1 7M20 44c-3 1-6-2-4-5M46 40c2 2 1 6-2 6'/%3E%3Ccircle cx='31' cy='27' r='3'/%3E%3Cpath d='M8 30h5M50 22h5M28 52v4M33 4v4'/%3E%3C/g%3E%3C/svg%3E\")",
        }}
      >
        <div className="flex flex-col gap-2 px-4 py-5 sm:px-6">
          {!messages
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-2/3" />)
            : messages.map((m, i) => {
                // A day separator whenever the calendar day changes, exactly
                // like WhatsApp — without it a long conversation reads as one
                // undifferentiated wall.
                const prev = i > 0 ? messages[i - 1] : null;
                const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                return (
                  <React.Fragment key={m.id}>
                    {newDay && (
                      <div className="my-2 flex justify-center">
                        <span className="rounded-md bg-white/90 px-3 py-1 text-[12.5px] font-medium text-[#54656f] uppercase shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
                          {formatDaySeparator(m.createdAt)}
                        </span>
                      </div>
                    )}
                    <MessageBubble message={m} />
                  </React.Fragment>
                );
              })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* No 24-hour-window notice, in either direction. Staff can message any
          contact at any time; if WhatsApp refuses one, the message itself says
          why (see explainFailure in message-bubble.tsx). */}
      <MessageComposer onSend={sendReply} onSendFile={sendFile} onSendTemplate={sendTemplate} sending={sending} />

        </div>

        {isDesktop && (
          <div className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-border">
            <div className="border-b border-border p-3">
              <p className="text-sm font-semibold">Contact details</p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-4 p-4">{detailsBody}</div>
            </ScrollArea>
          </div>
        )}
      </div>

      {!isDesktop && (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent className="flex flex-col gap-0 p-0 data-[side=right]:sm:max-w-lg">
            <SheetHeader className="border-b border-border">
              <SheetTitle>Contact details</SheetTitle>
              <SheetDescription className="sr-only">
                Lead status, booking status, tags, notes, and automation for {contact.name || contact.phone}.
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-4 p-4">{detailsBody}</div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
