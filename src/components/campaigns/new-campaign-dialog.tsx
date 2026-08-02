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
import { TemplatePicker } from "@/components/templates/template-picker";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";
import { CampaignMessageType, Contact, LeadSource, LeadStatus } from "@/types";

const MESSAGE_TYPE_LABELS: Record<CampaignMessageType, string> = {
  TEXT: "Text",
  IMAGE: "Image",
  TEMPLATE: "Approved template",
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
  const [templateName, setTemplateName] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [segment, setSegment] = React.useState<LeadStatus | "ALL">("ALL");
  const [source, setSource] = React.useState<LeadSource | "ALL">("ALL");

  const { data } = useFetch<{ contacts: Contact[] }>(open ? "/api/contacts" : null);
  const visibleContacts =
    data?.contacts.filter(
      (c) => (segment === "ALL" || c.leadStatus === segment) && (source === "ALL" || c.leadSource === source)
    ) ?? [];

  function selectSegment() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of visibleContacts) next.add(c.id);
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
          templateName: templateName || null,
          contactIds: [...selectedIds],
        }),
      });
      setOpen(false);
      setName("");
      setBody("");
      setSelectedIds(new Set());
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = name.trim() && selectedIds.size > 0 && (messageType !== "TEMPLATE" || templateName.trim());

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
          </div>

          {messageType === "TEMPLATE" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Approved template name</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="weekend_offer_v1" />
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
                {visibleContacts.length})
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
                  <label key={c.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                    {c.name || c.phone}
                  </label>
                ))}
                {data && visibleContacts.length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">No contacts in this segment.</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? "Creating…" : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
