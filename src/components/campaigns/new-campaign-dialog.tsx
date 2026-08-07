"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
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

export function NewCampaignDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
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

  const { data } = useFetch<{ contacts: Contact[] }>(open ? "/api/contacts" : null);
  const visibleContacts =
    data?.contacts.filter(
      (c) => (segment === "ALL" || c.leadStatus === segment) && (source === "ALL" || c.leadSource === source)
    ) ?? [];

  const selectableContacts = visibleContacts.filter((c) => !c.optedOutAt);

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
      setName("");
      setBody("");
      setMetaTemplateId(null);
      setTemplateVariableValues({});
      setSendPacing("ALL_AT_ONCE");
      setIntervalValue(1);
      setIntervalUnit("minutes");
      setSendTiming("now");
      setScheduledAt("");
      setSelectedIds(new Set());
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    name.trim() &&
    selectedIds.size > 0 &&
    (messageType !== "TEMPLATE" || !!metaTemplateId) &&
    (sendTiming !== "scheduled" || !!scheduledAt);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus /> New campaign
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New broadcast campaign</DialogTitle>
          <DialogDescription>Send a message to selected contacts — respects the 24h WhatsApp window automatically.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend Offer — Nov" />
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
                Different from the Templates tab&apos;s starter copy — created and approved in the Templates tab&apos;s Meta templates section.
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
              <div className="flex items-center justify-between">
                <Label>Message</Label>
                <TemplatePicker onInsert={setBody} />
              </div>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-20" />
            </div>
          )}

          {messageType === "IMAGE" && (
            <div className="flex flex-col gap-1.5">
              <Label>Image URL</Label>
              <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Recipients ({selectedIds.size} selected)</Label>
              <button type="button" onClick={selectSegment} className="text-xs font-medium text-primary hover:underline">
                Select all {segment === "ALL" ? "" : SEGMENT_FILTERS.find((s) => s.key === segment)?.label.toLowerCase()} (
                {selectableContacts.length})
              </button>
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
            <ScrollArea className="h-40 rounded-lg border border-border p-2">
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
                    {c.name || c.phone}
                    {c.optedOutAt && <span className="text-[10px] font-medium text-amber-600">Opted out</span>}
                  </label>
                ))}
                {data && visibleContacts.length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">No contacts in this segment.</p>
                )}
              </div>
            </ScrollArea>
          </div>

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
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Sends automatically at this date/time — no need to come back and click send. You can reschedule or cancel it from the
                  campaign detail view any time before it fires.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Sending speed</Label>
            <div className="flex flex-wrap gap-1.5">
              {(["ALL_AT_ONCE", "SPACED"] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setSendPacing(p)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    sendPacing === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  {p === "ALL_AT_ONCE" ? "All at once" : "Spaced out"}
                </button>
              ))}
            </div>
            {sendPacing === "ALL_AT_ONCE" ? (
              <p className="text-[11px] text-muted-foreground">Every recipient is queued immediately — fastest option, good for smaller lists.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
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
                  Staggers each recipient by this interval, up to 6h total spread. You can cancel remaining sends from the campaign
                  detail view once it&apos;s running. Meta&apos;s own template pacing limits are separate and still apply.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? "Creating…" : sendTiming === "scheduled" ? "Schedule campaign" : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
