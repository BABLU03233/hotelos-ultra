"use client";

import * as React from "react";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WA_TEMPLATE_CATEGORY_LABELS, WA_TEMPLATES } from "@/lib/wa-templates";

/**
 * Same "insert, then edit" pattern as the FAQ quick-replies popover in
 * message-composer.tsx.
 *
 * `bulkOnly` narrows the list to copy written for broadcasts. The campaign
 * dialog passes it because the transactional templates ("your booking is
 * confirmed") are nonsense sent to an imported list — the recipient has no
 * booking — and offering them there invites exactly that mistake.
 */
export function TemplatePicker({ onInsert, bulkOnly = false }: { onInsert: (body: string) => void; bulkOnly?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const templates = bulkOnly ? WA_TEMPLATES.filter((t) => t.bulkSafe) : WA_TEMPLATES;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <LayoutTemplate /> Use a template
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={8} className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-medium">{bulkOnly ? "Broadcast templates" : "Message templates"}</p>
          <p className="text-[11px] text-muted-foreground">
            {bulkOnly
              ? "Written for sending to a list — each one names the hotel and carries an opt-out line. Insert, then edit."
              : "Insert, then edit before sending. Starter copy — not the same as a Meta-approved template."}
          </p>
        </div>
        <ScrollArea className="max-h-[min(20rem,45vh)]">
          <div className="flex flex-col p-1">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onInsert(t.body);
                  setOpen(false);
                }}
                className="rounded-md p-2 text-left text-xs hover:bg-muted"
              >
                <p className="font-medium">
                  {t.title} <span className="font-normal text-muted-foreground">· {WA_TEMPLATE_CATEGORY_LABELS[t.category]}</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-muted-foreground">{t.body}</p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
