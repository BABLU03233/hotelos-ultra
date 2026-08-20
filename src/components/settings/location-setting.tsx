"use client";

import * as React from "react";
import { MapPin, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isShortMapsLink, parseCoordinates } from "@/lib/maps-coordinates";
import { cn } from "@/lib/utils";

/**
 * The hotel's pin on the map, set by pasting a Google Maps link.
 *
 * lat/lng were in the schema from the beginning and always empty, because the
 * only way to fill them was to already know them — and no hotel owner knows
 * their property's decimal degrees. They do have a Maps link, because that is
 * what they already send guests. So the link is the input and the coordinates
 * are derived.
 *
 * What it buys the guest: a real WhatsApp location message instead of a URL.
 * A link means tapping out to a browser, a consent screen, then handing off to
 * a map app. A location pin opens directly in whatever maps app they already
 * use, with a Directions button, without leaving the chat.
 *
 * The parsed coordinates are shown back rather than hidden, because a silent
 * derivation the owner cannot see is one they cannot check — and a wrong pin
 * sends guests to the wrong building.
 */
export function LocationSetting({
  mapsUrl,
  lat,
  lng,
  onChange,
}: {
  mapsUrl: string;
  lat: number | null | undefined;
  lng: number | null | undefined;
  onChange: (next: { googleMapsUrl: string; lat: number | null; lng: number | null }) => void;
}) {
  const short = Boolean(mapsUrl) && isShortMapsLink(mapsUrl) && lat == null;

  function handle(value: string) {
    const parsed = parseCoordinates(value);
    // A link we cannot read must not wipe coordinates the owner already has —
    // they may be editing the label of a pin that is already correct.
    onChange({
      googleMapsUrl: value,
      lat: parsed ? parsed.lat : (lat ?? null),
      lng: parsed ? parsed.lng : (lng ?? null),
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Hotel location</Label>
      <Input
        value={mapsUrl}
        onChange={(e) => handle(e.target.value)}
        placeholder="Paste your Google Maps link, or 17.4065, 78.4772"
      />

      {lat != null && lng != null ? (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600">
          <MapPin className="size-3.5 shrink-0" />
          Pin set — {lat.toFixed(5)}, {lng.toFixed(5)}. Guests get a tappable location, not a link.
        </p>
      ) : short ? (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {/* Short links only resolve by being opened, so there is nothing to
              read here. Saying so is better than storing the link and quietly
              never sending a pin. */}
          That short link doesn&apos;t contain coordinates. Open it in Google Maps, then copy the full link from the
          address bar — or paste the coordinates directly.
        </p>
      ) : (
        <p className={cn("text-[11px]", mapsUrl ? "text-muted-foreground" : "text-muted-foreground")}>
          Open your hotel in Google Maps and copy the link from the address bar. We&apos;ll read the coordinates so your
          agent can send guests a tappable pin instead of a link.
        </p>
      )}
    </div>
  );
}
