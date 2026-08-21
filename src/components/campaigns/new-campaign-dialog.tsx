"use client";

import * as React from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Plus, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MetaTemplatePicker } from "@/components/templates/meta-template-picker";
import { TemplatePicker } from "@/components/templates/template-picker";
import { CopyCheck } from "@/components/campaigns/copy-check";
import { CampaignImageUpload } from "@/components/campaigns/image-upload";
import { useFetch } from "@/hooks/use-fetch";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { reachabilityWarning, unreachableForFreeForm } from "@/lib/campaigns/reachability";
import { matchesSearch } from "@/lib/contacts/search";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";
import { CampaignMessageType, CampaignSendPacing, Contact, LeadSource, LeadStatus } from "@/types";

type IntervalUnit = "seconds" | "minutes" | "hours";

function intervalToSeconds(value: number, unit: IntervalUnit): number {
  if (unit === "hours") return value * 3600;
  if (unit === "minutes") return value * 60;
  return value;
}

const MESSAGE_TYPE_LABELS: Record<CampaignMessageType, string> = {
  TEXT: "Text",
  IMAGE: "Image",
  TEMPLATE: "Approved template",
};

const MESSAGE_TYPE_HELP: Record<CampaignMessageType, string> = {
  TEXT: "A free-text message, only deliverable to contacts inside the 24h window (recent inbound message).",
  IMAGE: "An image with an optional caption, same 24h-window rule as text.",
  TEMPLATE: "A Meta-approved template — the only way to reach contacts outside the 24h window.",
};

const SEGMENT_FILTERS: { key: LeadStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "NEW", label: "New" },
  { key: "INTERESTED", label: "Interested" },
  { key: "FOLLOW_UP", label: "Follow-up" },
  { key: "BOOKED", label: "Booked" },
  { key: "CLOSED", label: "Closed" },
];

const SOURCE_FILTERS: { key: LeadSource | "ALL"; label: string }[] = [
  { key: "ALL", label: "All sources" },
  { key: "DIRECT", label: "Direct" },
  { key: "META_AD", label: "Meta ad" },
  { key: "COLD_IMPORT", label: "Cold import" },
];

/**
 * Three steps rather than one long form.
 *
 * Everything used to be stacked into a single scrolling dialog: name, type,
 * message, image, recipient search, two rows of filters, the contact list,
 * timing, pacing — and then the submit button, below all of it. Reported from
 * a screenshot: "getting very hard to find the submit button". The dialog
 * scrolled as one block, footer included, so the primary action was simply
 * off screen for most of the time you spent filling the thing in.
 *
 * So: one question per step, and a footer pinned outside the scroll area that
 * always shows what happens next. Steps stay freely clickable rather than
 * locked — this is a short form, and blocking navigation is what makes wizards
 * irritating — with validation enforced at submit instead.
 */
const STEPS = [
  { n: 1, label: "Message" },
  { n: 2, label: "Who" },
  { n: 3, label: "When" },
];

export function NewCampaignDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState("");
  const [messageType, setMessageType] = React.useState<CampaignMessageType>("TEXT");
  const [body, setBody] = React.useState("");
  const [mediaUrl, setMediaUrl] = React.useState("");
  const [metaTemplateId, setMetaTemplateId] = React.useState<string | null>(null);
  const [templateVariableValues, setTemplateVariableValues] = React.useState<Record<string, string>>({});
  const [sendPacing, setSendPacing] = React.useState<CampaignSendPacing>("ALL_AT_ONCE");
  const [intervalValue, setIntervalValue] = React.useState(1);
  const [intervalUnit, setIntervalUnit] = React.useState<IntervalUnit>("minutes");
  const [sendTiming, setSendTiming] = React.useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [segment, setSegment] = React.useState<LeadStatus | "ALL">("ALL");
  const [source, setSource] = React.useState<LeadSource | "ALL">("ALL");
  const [search, setSearch] = React.useState("");
  const [showPacing, setShowPacing] = React.useState(false);

  const { data } = useFetch<{ contacts: Contact[] }>(open ? "/api/contacts" : null);
  const visibleContacts =
    data?.contacts.filter(
      (c) =>
        (segment === "ALL" || c.leadStatus === segment) &&
        (source === "ALL" || c.leadSource === source) &&
        matchesSearch(c, search)
    ) ?? [];

  const selectableContacts = visibleContacts.filter((c) => !c.optedOutAt);

  // Selections survive filtering — you can search, tick someone, search again
  // and keep them. That makes it possible to have people selected who are not
  // on screen, which on a broadcast that cannot be recalled is worth saying out
  // loud rather than leaving to be discovered after sending.
  const hiddenSelectedCount = data
    ? [...selectedIds].filter((id) => !visibleContacts.some((c) => c.id === id)).length
    : 0;

  /**
   * What is stopping this step, in words.
   *
   * The submit button used to be a silently disabled AND of five conditions:
   * when it would not light up, nothing told you which of the five was
   * missing. Every branch here returns something you can act on.
   */
  function issueForStep(n: number): string | null {
    if (n === 1) {
      if (!name.trim()) return "Give this broadcast a name — only you see it.";
      if (messageType === "TEMPLATE") return metaTemplateId ? null : "Choose an approved template to send.";
      if (messageType === "IMAGE") return mediaUrl ? null : "Add the image you want to send.";
      // A caption is optional on an image, but a text broadcast with no text
      // would send an empty WhatsApp message — which the old form allowed.
      return body.trim() ? null : "Write the message you want to send.";
    }
    if (n === 2) return selectedIds.size === 0 ? "Choose at least one person to send to." : null;
    if (sendTiming === "scheduled" && !scheduledAt) return "Pick the date and time it should go out.";
    return null;
  }

  // Whether WhatsApp will actually deliver this, worked out at the moment the
  // recipients are picked rather than discovered in a delivery report
  // afterwards. See reachability.ts for why this exists.
  const selectedContacts = (data?.contacts ?? []).filter((c) => selectedIds.has(c.id));
  const unreachable = unreachableForFreeForm(selectedContacts, messageType);
  const deliveryWarning = reachabilityWarning(unreachable.length, selectedContacts.length);

  const currentIssue = issueForStep(step);
  const blockingStep = STEPS.find((s) => issueForStep(s.n) !== null);
  const canSubmit = !blockingStep;

  function selectSegment() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of selectableContacts) next.add(c.id);
      return next;
    });
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    try {
      await apiFetch("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name,
          type: slugify(name) || "campaign",
          messageType,
          body: body || null,
          mediaUrl: mediaUrl || null,
          metaTemplateId,
          templateVariableValues: Object.keys(templateVariableValues).length ? templateVariableValues : null,
          sendPacing,
          sendIntervalSeconds: sendPacing === "SPACED" ? intervalToSeconds(intervalValue, intervalUnit) : null,
          scheduledAt: sendTiming === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          contactIds: [...selectedIds],
        }),
      });
      setOpen(false);
      setStep(1);
      setName("");
      setBody("");
      setMediaUrl("");
      setMetaTemplateId(null);
      setTemplateVariableValues({});
      setSendPacing("ALL_AT_ONCE");
      setIntervalValue(1);
      setIntervalUnit("minutes");
      setSendTiming("now");
      setScheduledAt("");
      setSelectedIds(new Set());
      setSearch("");
      setShowPacing(false);
      // Creating no longer means sending, so the dialog has to say what
      // actually happened — otherwise the owner closes it believing the
      // broadcast is on its way and only finds out days later that it never
      // went out.
      toast.success("Sent for approval — we review every broadcast before it reaches guests.");
      onCreated();
    } catch (err) {
      // The dialog deliberately stays open so the owner does not lose a
      // campaign they just spent minutes composing — but it has to say why,
      // or the only feedback is a button that appears to do nothing.
      toast.error(err instanceof Error ? err.message : "Couldn’t create that campaign");
    } finally {
      setSubmitting(false);
    }
  }

  /** The whole thing in one line, so the footer says what is about to happen. */
  const summary = [
    `${selectedIds.size || "No"} ${selectedIds.size === 1 ? "person" : "people"}`,
    MESSAGE_TYPE_LABELS[messageType],
    sendTiming === "scheduled" ? "scheduled" : "you hit send",
  ].join(" · ");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setStep(1);
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus /> New campaign
          </Button>
        }
      />
      {/*
        flex, not the default grid: the body has to be the only thing that
        scrolls, so the footer stays put. overflow-hidden here plus min-w-0 on
        the body also stops a long image URL widening the whole dialog, which
        is what put a horizontal scrollbar under it.

        sm:max-w-xl is load-bearing too. The base component ends with
        sm:max-w-sm, and a plain max-w-lg here does NOT override it — different
        breakpoints, so tailwind-merge keeps both and the sm: rule wins above
        640px. The dialog was rendering 384px wide on a desktop, which is most
        of why it felt cramped.
      */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border/60 p-4 pb-3">
          <DialogTitle>New broadcast</DialogTitle>
          <DialogDescription>
            {step === 1 && "What do you want to send?"}
            {step === 2 && "Who should receive it?"}
            {step === 3 && "When should it go out?"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress. Clickable, and a finished step is ticked, so a blocked
            submit can point at the step to fix rather than just refusing. */}
        <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-4 py-2.5">
          {STEPS.map((s, i) => {
            const done = issueForStep(s.n) === null;
            const active = step === s.n;
            return (
              <React.Fragment key={s.n}>
                <button
                  type="button"
                  onClick={() => setStep(s.n)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-medium transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      done ? "bg-primary text-primary-foreground" : active ? "bg-primary/20 text-primary" : "bg-muted"
                    )}
                  >
                    {done ? <Check className="size-3" /> : s.n}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <div className="h-px min-w-2 flex-1 bg-border" />}
              </React.Fragment>
            );
          })}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {step === 1 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend Offer — Nov" />
                <p className="text-[11px] text-muted-foreground">Just so you can find it later — guests never see this.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Message type</Label>
                <Select value={messageType} onValueChange={(v) => v && setMessageType(v as CampaignMessageType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string) => MESSAGE_TYPE_LABELS[v as CampaignMessageType]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MESSAGE_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">{MESSAGE_TYPE_HELP[messageType]}</p>
              </div>

              {messageType === "TEMPLATE" ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Meta-approved template</Label>
                  <p className="-mt-1 text-[11px] text-muted-foreground">
                    Different from the Templates tab&apos;s starter copy — created and approved in the Templates tab&apos;s Meta
                    templates section.
                  </p>
                  <MetaTemplatePicker
                    metaTemplateId={metaTemplateId}
                    templateVariableValues={templateVariableValues}
                    onChange={(next) => {
                      setMetaTemplateId(next.metaTemplateId);
                      setTemplateVariableValues(next.templateVariableValues);
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label>{messageType === "IMAGE" ? "Caption (optional)" : "Message"}</Label>
                    <TemplatePicker onInsert={setBody} bulkOnly />
                  </div>
                  <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-20" />
                  <CopyCheck body={body} />
                </div>
              )}

              {messageType === "IMAGE" && <CampaignImageUpload value={mediaUrl} onChange={setMediaUrl} />}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <Label>{selectedIds.size} selected</Label>
                <button
                  type="button"
                  onClick={selectSegment}
                  disabled={selectableContacts.length === 0}
                  className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
                >
                  {search.trim()
                    ? `Select all ${selectableContacts.length} matching`
                    : `Select all ${segment === "ALL" ? "" : SEGMENT_FILTERS.find((s) => s.key === segment)?.label.toLowerCase() + " "}(${selectableContacts.length})`}
                </button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or number…"
                  className="h-9 pl-8"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SEGMENT_FILTERS.map((f) => (
                  <button
                    type="button"
                    key={f.key}
                    onClick={() => setSegment(f.key)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      segment === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SOURCE_FILTERS.map((f) => (
                  <button
                    type="button"
                    key={f.key}
                    onClick={() => setSource(f.key)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      source === f.key ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <ScrollArea className="h-56 rounded-lg border border-border p-2">
                <div className="flex flex-col gap-1.5">
                  {visibleContacts.map((c) => (
                    <label
                      key={c.id}
                      className={cn(
                        "flex items-center gap-2 rounded px-1 py-1 text-sm",
                        c.optedOutAt ? "text-muted-foreground" : "hover:bg-muted"
                      )}
                    >
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                        disabled={!!c.optedOutAt}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {c.name || c.phone}
                        {c.name && <span className="ml-1.5 text-xs text-muted-foreground">{c.phone}</span>}
                      </span>
                      {c.optedOutAt && <span className="text-[10px] font-medium text-amber-600">Opted out</span>}
                    </label>
                  ))}
                  {data && visibleContacts.length === 0 && (
                    <p className="p-2 text-xs text-muted-foreground">
                      {search.trim() ? `No contact matches "${search.trim()}".` : "No contacts in this segment."}
                    </p>
                  )}
                </div>
              </ScrollArea>

              {deliveryWarning && (
                <div className="flex flex-col items-start gap-1.5 rounded-md bg-amber-500/10 p-2.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <p className="flex items-start gap-1.5">
                    <AlertCircle className="mt-px size-3.5 shrink-0" />
                    {deliveryWarning}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMessageType("TEMPLATE");
                      setStep(1);
                    }}
                    className="font-medium underline underline-offset-2"
                  >
                    Switch to an approved template
                  </button>
                </div>
              )}

              {hiddenSelectedCount > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {hiddenSelectedCount} more selected {hiddenSelectedCount === 1 ? "contact is" : "contacts are"} hidden by the
                  current search or filter — {selectedIds.size} will be sent to in total.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>When to send</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(["now", "scheduled"] as const).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setSendTiming(t)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        sendTiming === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                      )}
                    >
                      {t === "now" ? "Manual — I'll hit send" : "Schedule for later"}
                    </button>
                  ))}
                </div>
                {sendTiming === "scheduled" && (
                  <div className="flex flex-col gap-1.5">
                    <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                    <p className="text-[11px] text-muted-foreground">
                      Sends automatically at this date/time — no need to come back and click send. You can reschedule or cancel it
                      from the campaign detail view any time before it fires.
                    </p>
                  </div>
                )}
              </div>

              {/* Pacing is folded away. It defaults to "all at once", which is
                  right for every list this product currently sends to, and an
                  extra pair of choices on screen was part of what made this
                  dialog feel like work. */}
              <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Sending speed</p>
                    <p className="text-[11px] text-muted-foreground">
                      {sendPacing === "ALL_AT_ONCE"
                        ? "All at once — the usual choice."
                        : `One every ${intervalValue} ${intervalUnit}.`}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowPacing((v) => !v)}>
                    {showPacing ? "Done" : "Change"}
                  </Button>
                </div>

                {showPacing && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex flex-wrap gap-1.5">
                      {(["ALL_AT_ONCE", "SPACED"] as const).map((p) => (
                        <button
                          type="button"
                          key={p}
                          onClick={() => setSendPacing(p)}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                            sendPacing === p
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/70"
                          )}
                        >
                          {p === "ALL_AT_ONCE" ? "All at once" : "Spaced out"}
                        </button>
                      ))}
                    </div>
                    {sendPacing === "ALL_AT_ONCE" ? (
                      <p className="text-[11px] text-muted-foreground">
                        Every recipient is queued immediately — fastest option, good for smaller lists.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Send one every</span>
                          <Input
                            type="number"
                            min={1}
                            value={intervalValue}
                            onChange={(e) => setIntervalValue(Number(e.target.value))}
                            className="w-16"
                          />
                          <Select value={intervalUnit} onValueChange={(v) => v && setIntervalUnit(v as IntervalUnit)}>
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="seconds">Seconds</SelectItem>
                              <SelectItem value="minutes">Minutes</SelectItem>
                              <SelectItem value="hours">Hours</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Staggers each recipient by this interval, up to 6h total spread. You can cancel remaining sends from the
                          campaign detail view once it&apos;s running. Meta&apos;s own template pacing limits are separate and still
                          apply.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Said before the click, not just after it. "Schedule campaign"
                  on a button that actually queues a review would be a promise
                  the product doesn't keep. */}
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="mt-px size-3.5 shrink-0" />
                <span>
                  We review every broadcast before it reaches guests — usually within a few hours.
                  {sendTiming === "scheduled" && " It goes out at your scheduled time once approved."}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Outside the scrolling body, so it is on screen the entire time. */}
        <div className="shrink-0 border-t border-border/60 p-3">
          {step === 3 && blockingStep ? (
            <button
              type="button"
              onClick={() => setStep(blockingStep.n)}
              className="mb-2 flex w-full items-start gap-1.5 rounded-md bg-amber-500/10 p-2 text-left text-[11px] text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"
            >
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span>
                {issueForStep(blockingStep.n)} <span className="underline">Go to {blockingStep.label}</span>
              </span>
            </button>
          ) : (
            currentIssue && (
              <p className="mb-2 flex items-start gap-1.5 px-1 text-[11px] text-muted-foreground">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                {currentIssue}
              </p>
            )
          )}

          {step === 3 && deliveryWarning && (
            <p className="mb-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              {deliveryWarning}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] text-muted-foreground">{summary}</p>

            <div className="flex shrink-0 items-center gap-2">
              {step > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="size-3.5" /> Back
                </Button>
              )}
              {step < 3 ? (
                <Button size="sm" onClick={() => setStep(step + 1)}>
                  Continue <ArrowRight className="size-3.5" />
                </Button>
              ) : (
                <Button size="sm" disabled={!canSubmit || submitting} onClick={submit}>
                  {submitting ? "Submitting…" : "Submit for approval"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
