"use client";

import * as React from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MetaTemplatePicker } from "@/components/templates/meta-template-picker";
import { TemplatePicker } from "@/components/templates/template-picker";
import { GlossaryTerm } from "@/components/shared/glossary-term";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { saveWithFeedback } from "@/lib/save-with-feedback";
import { FollowUpAction, FollowUpRule } from "@/types";

const ACTION_LABELS: Record<FollowUpAction, string> = {
  REMINDER: "Reminder",
  OFFER: "Offer",
  PACKAGE: "Package",
  LAST: "Last follow-up",
};

const ACTION_DESCRIPTIONS: Record<FollowUpAction, string> = {
  REMINDER: "A gentle nudge that they were looking at booking.",
  OFFER: "Mentions a current discount or promotion to re-spark interest.",
  PACKAGE: "Highlights a specific room or package that fits what they asked about.",
  LAST: "The final message in this sequence — turn on Repeat daily below to keep sending it every 24h until they reply.",
};

type DelayUnit = "minutes" | "hours" | "days";

function minutesToUnit(minutes: number): { value: number; unit: DelayUnit } {
  if (minutes >= 1440 && minutes % 1440 === 0) return { value: minutes / 1440, unit: "days" };
  if (minutes >= 60 && minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

function unitToMinutes(value: number, unit: DelayUnit): number {
  if (unit === "days") return value * 1440;
  if (unit === "hours") return value * 60;
  return value;
}

export function FollowUpRuleCard({ rule, isLast, onChanged }: { rule: FollowUpRule; isLast: boolean; onChanged: () => void }) {
  const initialDelay = minutesToUnit(rule.delayMinutes);
  const [delayValue, setDelayValue] = React.useState(initialDelay.value);
  const [delayUnit, setDelayUnit] = React.useState<DelayUnit>(initialDelay.unit);
  const [messageBody, setMessageBody] = React.useState(rule.messageBody ?? "");
  /**
   * Collapsed by default.
   *
   * Each step is a form roughly 400px tall, and a real sequence runs to seven
   * of them — so the page was several screens of scrolling to answer a
   * question ("what does step 4 do?") that fits on one line. Expanded is for
   * editing; collapsed is for reading the sequence, which is what someone
   * opening this page is usually doing.
   */
  const [open, setOpen] = React.useState(false);

  async function patch(body: Partial<FollowUpRule>) {
    try {
      await apiFetch(`/api/follow-up-rules/${rule.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that change");
    }
  }

  async function remove() {
    const ok = await saveWithFeedback(
      () => apiFetch(`/api/follow-up-rules/${rule.id}`, { method: "DELETE" }),
      "Couldn’t delete that follow-up"
    );
    if (!ok) return;
    onChanged();
  }

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-shadow " +
            (rule.active
              ? "bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_var(--primary)]"
              : "bg-muted text-muted-foreground")
          }
        >
          {rule.order}
        </span>
        {!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>

      <Card className="min-w-0 flex-1">
        <CardContent className="flex flex-col gap-3">
          {/* The always-visible summary. Reads as a sentence rather than a row
              of controls, so the sequence can be understood by scanning. */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-0.5 text-left"
              aria-expanded={open}
            >
              <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
              <span className="shrink-0 text-sm font-medium">{ACTION_LABELS[rule.action]}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                after {delayValue} {delayValue === 1 ? delayUnit.replace(/s$/, "") : delayUnit}
              </span>
              {rule.repeatDaily && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  repeats daily
                </span>
              )}
              {!open && messageBody.trim() && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground/80">“{messageBody.trim()}”</span>
              )}
            </button>

            {/* Outside the toggle: pausing a step and opening it are different
                intentions, and putting a switch inside a button that also
                expands makes one of them an accident. */}
            <div className="flex shrink-0 items-center gap-2">
              <Switch checked={rule.active} onCheckedChange={(checked) => patch({ active: checked })} />
              <span className="hidden text-xs text-muted-foreground sm:inline">{rule.active ? "Active" : "Paused"}</span>
              <Button variant="ghost" size="icon-sm" onClick={remove}>
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          </div>

          {open && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-0.5">
              <Select value={rule.action} onValueChange={(v) => v && patch({ action: v as FollowUpAction })}>
                <SelectTrigger className="w-40">
                  <SelectValue>{(v: string) => ACTION_LABELS[v as FollowUpAction]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="max-w-40 text-[10px] text-muted-foreground">{ACTION_DESCRIPTIONS[rule.action]}</p>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Wait</span>
              <Input
                type="number"
                min={1}
                value={delayValue}
                onChange={(e) => setDelayValue(Number(e.target.value))}
                onBlur={() => {
                  const minutes = unitToMinutes(delayValue, delayUnit);
                  if (minutes !== rule.delayMinutes) patch({ delayMinutes: minutes });
                }}
                className="w-16"
              />
              <Select
                value={delayUnit}
                onValueChange={(v) => {
                  if (!v) return;
                  const unit = v as DelayUnit;
                  setDelayUnit(unit);
                  const minutes = unitToMinutes(delayValue, unit);
                  if (minutes !== rule.delayMinutes) patch({ delayMinutes: minutes });
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">after last message</span>
            </div>

          </div>
          )}

          {open && (
          <div className="flex items-center gap-2">
            <Switch checked={rule.repeatDaily} onCheckedChange={(checked) => patch({ repeatDaily: checked })} />
            <span className="text-xs text-muted-foreground">
              {rule.repeatDaily
                ? "Repeat daily — resends this message every 24h until they reply, book, or the lead is closed"
                : "Repeat daily (off) — sends once, then this rule is done"}
            </span>
          </div>
          )}

          {open && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-end">
              <TemplatePicker
                onInsert={(text) => {
                  setMessageBody(text);
                  patch({ messageBody: text });
                }}
              />
            </div>
            <Textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              onBlur={() => messageBody !== (rule.messageBody ?? "") && patch({ messageBody })}
              placeholder="Message to send within the 24h window…"
              className="min-h-16"
            />
            <p className="text-[11px] text-muted-foreground">
              Sent as a normal message if you&apos;re still inside the <GlossaryTerm term="24h-window" />; otherwise the{" "}
              <GlossaryTerm term="approved-template" />
              {" "}below is used instead.
            </p>
          </div>
          )}

          {open && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Meta-approved template</Label>
            <p className="-mt-1 text-[11px] text-muted-foreground">
              Different from the Templates tab — created and approved in the Templates tab&apos;s Meta templates section.
            </p>
            <MetaTemplatePicker
              metaTemplateId={rule.metaTemplateId}
              templateVariableValues={rule.templateVariableValues ?? {}}
              onChange={(next) => patch({ metaTemplateId: next.metaTemplateId, templateVariableValues: next.templateVariableValues })}
            />
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
