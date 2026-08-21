"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface Tier {
  guests: number;
  price: number;
}

/**
 * What the room costs at each party size.
 *
 * Indian hotels price per occupancy, and until this existed the only rate the
 * assistant could quote was the single headline price — so every room list
 * said "from ₹999" and a couple was shown a number they would not be charged.
 * They then arrived expecting it.
 *
 * Optional by design: a hotel that leaves it empty keeps the old behaviour
 * exactly, with the headline rate and a "from" line.
 */
export function OccupancyPrices({
  value,
  onChange,
}: {
  value: Tier[] | null | undefined;
  onChange: (next: Tier[] | null) => void;
}) {
  const tiers = value ?? [];

  const update = (i: number, patch: Partial<Tier>) =>
    onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">Price per party size</Label>
      <p className="-mt-1 text-[11px] text-muted-foreground">
        What this room costs for 1 guest, 2 guests and so on. Leave empty to quote the single nightly rate above.
      </p>

      <div className="flex flex-col gap-1.5">
        {tiers.map((tier, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              value={tier.guests}
              onChange={(e) => update(i, { guests: Number(e.target.value) })}
              className="w-16"
              aria-label="Guests"
            />
            <span className="shrink-0 text-xs text-muted-foreground">{tier.guests === 1 ? "guest" : "guests"} · ₹</span>
            <Input
              type="number"
              min={0}
              value={tier.price}
              onChange={(e) => update(i, { price: Number(e.target.value) })}
              className="w-24"
              aria-label="Price"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove this rate"
              onClick={() => onChange(tiers.filter((_, idx) => idx !== i))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          // Next party size up, so adding rows in order takes no thought.
          onChange([...tiers, { guests: (tiers.at(-1)?.guests ?? 0) + 1, price: tiers.at(-1)?.price ?? 0 }])
        }
      >
        <Plus className="size-3.5" /> Add a rate
      </Button>
    </div>
  );
}
