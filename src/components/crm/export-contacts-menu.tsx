"use client";

import * as React from "react";
import { FileDown, FileSpreadsheet, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Segment = "all" | "booked" | "interested" | "not-booked";

/**
 * Which list to download, described by what it is FOR rather than by the
 * database field it filters on.
 *
 * The segment matters more than the file format. A lookalike seeded from
 * everyone who ever messaged is a lookalike of "people who message hotels";
 * one seeded from guests who actually paid is a lookalike of customers, which
 * is the audience worth spending money on. Saying so here is the difference
 * between a feature and a useful feature.
 */
const SEGMENTS: { key: Segment; label: string; hint: string }[] = [
  {
    key: "booked",
    label: "Guests who booked",
    hint: "Best seed for a Lookalike Audience — real paying customers.",
  },
  {
    key: "not-booked",
    label: "Enquired, never booked",
    hint: "Retargeting list — they showed interest and didn't book.",
  },
  {
    key: "interested",
    label: "Interested & following up",
    hint: "Warm leads currently in conversation.",
  },
  { key: "all", label: "Everyone", hint: "Every contact who hasn't opted out." },
];

export function ExportContactsMenu() {
  const [open, setOpen] = React.useState(false);

  function download(segment: Segment, format: "csv" | "xlsx") {
    // A plain navigation rather than fetch+blob: the response carries
    // Content-Disposition, so the browser saves it with the right filename and
    // nothing has to be held in memory.
    window.location.assign(`/api/contacts/export?segment=${segment}&format=${format}`);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <FileDown className="size-3.5" /> Export
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Megaphone className="size-3.5" /> Export for Meta Ads
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Pick who to target, then upload the CSV in Ads Manager → Audiences → Create a Custom Audience → Customer
            list.
          </p>
        </div>

        <div className="flex flex-col p-1">
          {SEGMENTS.map((s) => (
            <div key={s.key} className="rounded-md p-2 hover:bg-muted">
              <p className="text-xs font-medium">{s.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{s.hint}</p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={() => download(s.key, "csv")}
                  className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                >
                  CSV for Meta
                </button>
                <button
                  onClick={() => download(s.key, "xlsx")}
                  className="flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                >
                  <FileSpreadsheet className="size-3" /> Excel
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Guests who opted out are never included. Upload only contacts you have permission to advertise to.
        </p>
      </PopoverContent>
    </Popover>
  );
}
