"use client";

import * as React from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppBubblePreview } from "@/components/templates/whatsapp-bubble-preview";
import { MetaTemplateInput } from "@/lib/validation/meta-template";
import { WA_META_TEMPLATE_STARTERS } from "@/lib/wa-meta-template-starters";
import { BodyVariableSlot, KNOWN_AUTO_VARIABLES, VariableSource } from "@/lib/whatsapp/template-variables";

type HeaderType = "none" | "text" | "image";
type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";
interface ButtonDraft {
  type: ButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
  example?: string;
}

function countPlaceholders(text: string): number {
  return new Set(Array.from(text.matchAll(/\{\{(\d+)\}\}/g)).map((m) => m[1])).size;
}

export function MetaTemplateBuilderDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [language] = React.useState("en");
  const [category, setCategory] = React.useState<MetaTemplateInput["category"]>("MARKETING");
  const [headerType, setHeaderType] = React.useState<HeaderType>("none");
  const [headerText, setHeaderText] = React.useState("");
  const [headerImage, setHeaderImage] = React.useState<File | null>(null);
  const [bodyText, setBodyText] = React.useState("");
  const [bodyVariableSlots, setBodyVariableSlots] = React.useState<BodyVariableSlot[]>([]);
  const [footerText, setFooterText] = React.useState("");
  const [buttons, setButtons] = React.useState<ButtonDraft[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  function applyStarter(id: string) {
    const starter = WA_META_TEMPLATE_STARTERS.find((s) => s.id === id);
    if (!starter) return;
    const t = starter.template;
    setCategory(t.category);
    setHeaderType(t.header.type);
    setHeaderText(t.header.type === "text" ? t.header.text : "");
    setBodyText(t.bodyText);
    setBodyVariableSlots(t.bodyVariableSlots);
    setFooterText(t.footerText ?? "");
    setButtons(
      t.buttons.map((b) => ({
        type: b.type,
        text: "text" in b ? b.text : "",
        url: "url" in b ? b.url : undefined,
        phoneNumber: "phoneNumber" in b ? b.phoneNumber : undefined,
        example: "example" in b ? b.example : undefined,
      }))
    );
    if (!name) setName(id.replace(/-/g, "_"));
  }

  function syncSlotCount() {
    const needed = countPlaceholders(bodyText);
    setBodyVariableSlots((prev) => {
      if (needed === prev.length) return prev;
      if (needed < prev.length) return prev.slice(0, needed);
      return [...prev, ...Array.from({ length: needed - prev.length }, () => ({ source: "guest_name" as VariableSource, label: "" }))];
    });
  }

  function updateSlot(index: number, patch: Partial<BodyVariableSlot>) {
    setBodyVariableSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addButton() {
    if (buttons.length >= 10) return;
    setButtons((prev) => [...prev, { type: "QUICK_REPLY", text: "" }]);
  }

  function removeButton(index: number) {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  }

  function reset() {
    setName("");
    setCategory("MARKETING");
    setHeaderType("none");
    setHeaderText("");
    setHeaderImage(null);
    setBodyText("");
    setBodyVariableSlots([]);
    setFooterText("");
    setButtons([]);
  }

  async function submit() {
    setSubmitting(true);
    try {
      const payload: MetaTemplateInput = {
        name: name.trim(),
        category,
        language,
        header:
          headerType === "text"
            ? { type: "text", text: headerText }
            : headerType === "image"
              ? { type: "image" }
              : { type: "none" },
        bodyText,
        bodyVariableSlots,
        footerText: footerText.trim() || null,
        buttons: buttons.map((b) =>
          b.type === "URL"
            ? { type: "URL", text: b.text, url: b.url ?? "" }
            : b.type === "PHONE_NUMBER"
              ? { type: "PHONE_NUMBER", text: b.text, phoneNumber: b.phoneNumber ?? "" }
              : b.type === "COPY_CODE"
                ? { type: "COPY_CODE", example: b.example ?? "" }
                : { type: "QUICK_REPLY", text: b.text }
        ),
      };

      const form = new FormData();
      form.set("payload", JSON.stringify(payload));
      if (headerType === "image" && headerImage) form.set("headerImage", headerImage);

      const res = await fetch("/api/wa-templates", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Template submission failed");
      }

      setOpen(false);
      reset();
      onCreated();
      toast.success("Submitted to Meta for review — this usually takes minutes to 24h.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Template submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    /^[a-z0-9_]+$/.test(name) &&
    bodyText.trim().length > 0 &&
    countPlaceholders(bodyText) === bodyVariableSlots.length &&
    (headerType !== "image" || !!headerImage);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus /> Create Meta template
          </Button>
        }
      />
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create a Meta-approved template</DialogTitle>
          <DialogDescription>
            Submitted directly to Meta for review — once approved, it can message guests outside the 24-hour window.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Start from</Label>
              <div className="flex flex-wrap gap-1.5">
                {WA_META_TEMPLATE_STARTERS.map((s) => (
                  <Button key={s.id} type="button" variant="outline" size="sm" onClick={() => applyStarter(s.id)}>
                    <Sparkles className="size-3" /> {s.title}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Template name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="e.g. weekend_offer_v1"
              />
              <p className="text-[11px] text-muted-foreground">Lowercase letters, numbers, and underscores only.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v as MetaTemplateInput["category"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="UTILITY">Utility</SelectItem>
                  <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Header (optional)</Label>
              <Select value={headerType} onValueChange={(v) => v && setHeaderType(v as HeaderType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
              {headerType === "text" && (
                <Input value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="A little something for you 🎁" maxLength={60} />
              )}
              {headerType === "image" && (
                <Input type="file" accept="image/*" onChange={(e) => setHeaderImage(e.target.files?.[0] ?? null)} />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Message</Label>
              <Textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                onBlur={syncSlotCount}
                placeholder="Hi {{1}}! Book with us this weekend and save {{2}} off your stay at {{3}}…"
                className="min-h-24"
                maxLength={1024}
              />
              <p className="text-[11px] text-muted-foreground">
                Use <code className="rounded bg-muted px-1">{"{{1}}"}</code>, <code className="rounded bg-muted px-1">{"{{2}}"}</code>… for values that
                change per send — a guest&apos;s name, a discount, a price.
              </p>
            </div>

            {bodyVariableSlots.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
                <Label className="text-xs text-muted-foreground">Variables in your message</Label>
                {bodyVariableSlots.map((slot, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-8 shrink-0 text-xs text-muted-foreground">{`{{${i + 1}}}`}</span>
                    <Select value={slot.source} onValueChange={(v) => v && updateSlot(i, { source: v as VariableSource })}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="guest_name">{KNOWN_AUTO_VARIABLES.guest_name.label}</SelectItem>
                        <SelectItem value="hotel_name">{KNOWN_AUTO_VARIABLES.hotel_name.label}</SelectItem>
                        <SelectItem value="custom">Custom value…</SelectItem>
                      </SelectContent>
                    </Select>
                    {slot.source === "custom" && (
                      <Input
                        value={slot.label}
                        onChange={(e) => updateSlot(i, { label: e.target.value })}
                        placeholder="e.g. Discount %"
                        className="flex-1"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Footer (optional)</Label>
              <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Reply STOP anytime to opt out" maxLength={60} />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Buttons (optional)</Label>
                {buttons.length < 10 && (
                  <Button type="button" variant="ghost" size="sm" onClick={addButton}>
                    <Plus className="size-3" /> Add button
                  </Button>
                )}
              </div>
              {buttons.map((b, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Select value={b.type} onValueChange={(v) => v && setButtons((prev) => prev.map((x, j) => (j === i ? { ...x, type: v as ButtonType } : x)))}>
                    <SelectTrigger className="w-36 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QUICK_REPLY">Quick reply</SelectItem>
                      <SelectItem value="URL">Link</SelectItem>
                      <SelectItem value="PHONE_NUMBER">Call</SelectItem>
                      <SelectItem value="COPY_CODE">Copy code</SelectItem>
                    </SelectContent>
                  </Select>
                  {b.type !== "COPY_CODE" && (
                    <Input
                      value={b.text}
                      onChange={(e) => setButtons((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                      placeholder="Button label"
                      maxLength={25}
                    />
                  )}
                  {b.type === "URL" && (
                    <Input
                      value={b.url ?? ""}
                      onChange={(e) => setButtons((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                      placeholder="https://…"
                    />
                  )}
                  {b.type === "PHONE_NUMBER" && (
                    <Input
                      value={b.phoneNumber ?? ""}
                      onChange={(e) => setButtons((prev) => prev.map((x, j) => (j === i ? { ...x, phoneNumber: e.target.value } : x)))}
                      placeholder="+91…"
                    />
                  )}
                  {b.type === "COPY_CODE" && (
                    <Input
                      value={b.example ?? ""}
                      onChange={(e) => setButtons((prev) => prev.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))}
                      placeholder="e.g. 250FF"
                      maxLength={20}
                    />
                  )}
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeButton(i)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <WhatsAppBubblePreview
              headerText={headerType === "text" ? headerText : undefined}
              hasImageHeader={headerType === "image"}
              bodyText={bodyText}
              bodyVariableSlots={bodyVariableSlots}
              footerText={footerText}
              buttons={buttons}
            />
            <Badge variant="secondary" className="w-fit">
              {category === "MARKETING" ? "Marketing" : category === "UTILITY" ? "Utility" : "Authentication"}
            </Badge>
          </div>
        </div>

        <DialogFooter>
          <Button disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? "Submitting…" : "Submit for Meta review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
