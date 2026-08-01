"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
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
import { apiFetch } from "@/lib/api-client";
import { formatMinutesDuration } from "@/lib/format";
import { FollowUpAction, FollowUpRule } from "@/types";

const ACTION_LABELS: Record<FollowUpAction, string> = {
  REMINDER: "Reminder",
  OFFER: "Offer",
  PACKAGE: "Package",
  LAST: "Last follow-up",
};

export function FollowUpRuleCard({ rule, isLast, onChanged }: { rule: FollowUpRule; isLast: boolean; onChanged: () => void }) {
  const [delayMinutes, setDelayMinutes] = React.useState(rule.delayMinutes);
  const [messageBody, setMessageBody] = React.useState(rule.messageBody ?? "");
  const [templateName, setTemplateName] = React.useState(rule.templateName ?? "");

  async function patch(body: Partial<FollowUpRule>) {
    await apiFetch(`/api/follow-up-rules/${rule.id}`, { method: "PATCH", body: JSON.stringify(body) });
    onChanged();
  }

  async function remove() {
    await apiFetch(`/api/follow-up-rules/${rule.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
            (rule.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
          }
        >
          {rule.order}
        </span>
        {!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>

      <Card className="mb-4 flex-1">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
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

            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(Number(e.target.value))}
                onBlur={() => delayMinutes !== rule.delayMinutes && patch({ delayMinutes })}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">min ({formatMinutesDuration(delayMinutes)} after last message)</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Switch checked={rule.active} onCheckedChange={(checked) => patch({ active: checked })} />
              <span className="text-xs text-muted-foreground">{rule.active ? "Active" : "Paused"}</span>
              <Button variant="ghost" size="icon-sm" onClick={remove}>
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          </div>

          <Textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            onBlur={() => messageBody !== (rule.messageBody ?? "") && patch({ messageBody })}
            placeholder="Message to send within the 24h window…"
            className="min-h-16"
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`template-${rule.id}`} className="text-xs text-muted-foreground">
              Approved template name (used automatically once outside the 24h WhatsApp window)
            </Label>
            <Input
              id={`template-${rule.id}`}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onBlur={() => templateName !== (rule.templateName ?? "") && patch({ templateName: templateName || null })}
              placeholder="e.g. follow_up_reminder"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
