"use client";

import * as React from "react";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WA_TEMPLATE_CATEGORY_LABELS, WA_TEMPLATES } from "@/lib/wa-templates";

/** Same "insert, then edit" pattern as the FAQ quick-replies popover in message-composer.tsx. */
export function TemplatePicker({ onInsert }: { onInsert: (body: string) => void }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <LayoutTemplate /> Use a template
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-medium">Message templates</p>
          <p className="text-[11px] text-muted-foreground">Insert, then edit before sending.</p>
        </div>
        <ScrollArea className="max-h-72">
          <div className="flex flex-col p-1">
            {WA_TEMPLATES.map((t) => (
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
