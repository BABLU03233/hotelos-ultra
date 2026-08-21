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

/**
 * Readable names for the trigger of each dropdown.
 *
 * <SelectValue /> renders the raw VALUE, not the chosen item's label — so the
 * SelectItems here have read "Quick reply" and "Marketing" all along while the
 * closed dropdown showed a hotel owner "QUICK_REPLY", "guest_name",
 * "MARKETING" and "none" straight off the enum.
 */
const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: "Marketing — offers and promotions",
  UTILITY: "Utility — booking updates and reminders",
  AUTHENTICATION: "Authentication — one-time codes",
};

const HEADER_LABELS: Record<string, string> = {
  none: "No title",
  text: "Text title",
  image: "Image",
};

const SLOT_LABELS: Record<string, string> = {
  guest_name: "The guest's name",
  hotel_name: "Your hotel's name",
  custom: "Something I type per send…",
};

const BUTTON_LABELS: Record<string, string> = {
  QUICK_REPLY: "Quick reply",
  URL: "Opens a link",
  PHONE_NUMBER: "Calls you",
};

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
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  function applyStarter(id: string) {
    // Picking a starter re-folds the advanced fields: whatever was opened for
    // the previous choice is not relevant to this one.
    setAdvancedOpen(false);
    const starter = WA_META_TEMPLATE_STARTERS.find((s) => s.id === id);
    if (!starter) return;
    const t = starter.template;

    // Name it too, or "ready to send" still means stopping to invent a name
    // in Meta's format. Only when the field is untouched — retyping over
    // someone's own name would be worse than not helping.
    // Dated, because Meta rejects a name that already exists on the account,
    // and a second attempt at the same offer is the common case.
    if (!name.trim()) {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      setName(`${starter.id.replace(/-/g, "_")}_${stamp}`);
    }

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

  /**
   * Everything below the message is folded away by default.
   *
   * A ready-to-send starter fills in category, title, footer and buttons
   * correctly, and an owner who picked "20% off" should see the offer and a
   * submit button — not a category dropdown, a variable mapping table and a
   * button list. It all stays one click away.
   *
   * Forced open when a blank needs a value the owner has to type, because
   * leaving THAT hidden would submit a template with an empty slot in it.
   */
  const needsAttention = bodyVariableSlots.some((slot) => slot.source === "custom" && !slot.label.trim());
  const showAdvanced = advancedOpen || needsAttention;

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
      {/*
        sm:max-w-3xl, not max-w-3xl. The base component's classes end with
        sm:max-w-sm, and a plain max-w-3xl does not override it — different
        breakpoints, so tailwind-merge keeps both and the sm: rule wins above
        640px. This dialog was rendering 384px wide with a two-column grid
        inside it, which is why the form and the preview were both squeezed
        into a sliver with a horizontal scrollbar under them.

        flex column with the body as the only scroller, so the submit button
        stays put instead of scrolling away — the same fix the campaign
        composer needed.
      */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader className="shrink-0 border-b border-border/60 p-4 pb-3">
          <DialogTitle>Create a Meta-approved template</DialogTitle>
          <DialogDescription>
            Submitted directly to Meta for review — once approved, it can message guests outside the 24-hour window.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-4 md:grid-cols-[1fr_18rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Start from</Label>
              <p className="-mt-1 text-[11px] text-muted-foreground">
                Pick one and it fills in everything below. The ready-to-send ones need no numbers from you.
              </p>
              {/* Cards rather than a row of chips: the blurb is what tells an
                  owner which one to pick, and it had nowhere to go before. */}
              <div className="grid gap-2 sm:grid-cols-2">
                {WA_META_TEMPLATE_STARTERS.map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => applyStarter(starter.id)}
                    className="flex flex-col items-start gap-1 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
                  >
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <Sparkles className="size-3.5 shrink-0 text-primary" />
                      {starter.title}
                      {starter.readyToUse && (
                        <Badge variant="secondary" className="text-[10px]">
                          Ready to send
                        </Badge>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{starter.blurb}</span>
                  </button>
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

            {showAdvanced && (
              <>
            <div className="flex flex-col gap-1.5">
              <Label>What kind of message is this?</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v as MetaTemplateInput["category"])}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => CATEGORY_LABELS[v] ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="UTILITY">Utility</SelectItem>
                  <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Title above the message (optional)</Label>
              <Select value={headerType} onValueChange={(v) => v && setHeaderType(v as HeaderType)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => HEADER_LABELS[v] ?? v}</SelectValue>
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
              </>
            )}

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

            {bodyVariableSlots.length > 0 && showAdvanced && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
                <Label className="text-xs text-muted-foreground">What goes in each blank</Label>
                {bodyVariableSlots.map((slot, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-8 shrink-0 text-xs text-muted-foreground">{`{{${i + 1}}}`}</span>
                    <Select value={slot.source} onValueChange={(v) => v && updateSlot(i, { source: v as VariableSource })}>
                      <SelectTrigger className="min-w-0 flex-1">
                        <SelectValue>{(v: string) => SLOT_LABELS[v] ?? v}</SelectValue>
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

            {showAdvanced && (
              <>
            <div className="flex flex-col gap-1.5">
              <Label>Small print at the bottom (optional)</Label>
              <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Reply STOP anytime to opt out" maxLength={60} />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Buttons guests can tap (optional)</Label>
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
                      <SelectValue>{(v: string) => BUTTON_LABELS[v] ?? v}</SelectValue>
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
              </>
            )}

            {/* One click to the machinery, and never in the way of an owner
                who just wants to send the offer they picked. */}
            {!needsAttention && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start text-muted-foreground"
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                {advancedOpen ? "Hide extra options" : "Change the title, buttons or small print"}
              </Button>
            )}
          </div>

          {/* Sticky so the bubble stays in view while the form scrolls past
              it — the whole point of a preview is watching it change. */}
          <div className="flex min-w-0 flex-col gap-2 md:sticky md:top-0 md:self-start">
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

        <DialogFooter className="shrink-0 border-t border-border/60 p-3">
          <Button disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? "Submitting…" : "Submit for Meta review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
