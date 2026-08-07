"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFetch } from "@/hooks/use-fetch";
import { MetaTemplate } from "@/types";

function isApproved(status: string): boolean {
  const s = status.toUpperCase();
  return s.includes("APPROVED") || s.startsWith("ACTIVE");
}

/** Picks a real, Meta-approved template — and, if it has "custom" body variables, a value for each. Replaces a free-text template-name input wherever a template is needed. */
export function MetaTemplatePicker({
  metaTemplateId,
  templateVariableValues,
  onChange,
}: {
  metaTemplateId: string | null;
  templateVariableValues: Record<string, string>;
  onChange: (next: { metaTemplateId: string | null; templateVariableValues: Record<string, string> }) => void;
}) {
  const { data } = useFetch<{ templates: MetaTemplate[] }>("/api/wa-templates");
  const approved = (data?.templates ?? []).filter((t) => isApproved(t.status));
  const selected = approved.find((t) => t.id === metaTemplateId);
  const customSlots = selected?.bodyVariableSlots.filter((s) => s.source === "custom") ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={metaTemplateId ?? ""}
        onValueChange={(v) => onChange({ metaTemplateId: v || null, templateVariableValues: {} })}
      >
        <SelectTrigger className="w-full">
          <SelectValue>{() => selected?.name ?? "Select a template…"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {approved.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No approved templates yet — create one in the Templates tab.</p>
          )}
          {approved.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {customSlots.map((slot) => (
        <div key={slot.label} className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{slot.label}</Label>
          <Input
            value={templateVariableValues[slot.label] ?? ""}
            onChange={(e) =>
              onChange({
                metaTemplateId,
                templateVariableValues: { ...templateVariableValues, [slot.label]: e.target.value },
              })
            }
            placeholder={`Value for ${slot.label.toLowerCase()}`}
          />
        </div>
      ))}
    </div>
  );
}
