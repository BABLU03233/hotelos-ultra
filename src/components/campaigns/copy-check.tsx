"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { deterministicConcerns } from "@/lib/campaigns/copy-rules";
import { cn } from "@/lib/utils";

/**
 * Live feedback on campaign copy as the owner types it.
 *
 * Runs the same deterministic checks the reviewer runs, in the browser. That
 * is the point: the owner finds out about a missing opt-out line now, not two
 * days later when the campaign comes back rejected. A rejection that could
 * have been a hint is a bad trade for everyone — the hotel waits, and the
 * operator spends their review on something a regex caught.
 *
 * Only the deterministic half runs here. The model half needs a server round
 * trip and would fire on every keystroke; it runs once, at submission.
 */
export function CopyCheck({ body }: { body: string }) {
  const concerns = React.useMemo(() => (body.trim() ? deterministicConcerns(body) : []), [body]);

  if (!body.trim()) return null;

  if (concerns.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-emerald-600">
        <CheckCircle2 className="size-3.5 shrink-0" />
        Looks good — clear, and it offers a way out.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {concerns.map((concern, i) => {
        const Icon = concern.severity === "block" ? ShieldAlert : concern.severity === "warn" ? AlertTriangle : Info;
        const tone =
          concern.severity === "block"
            ? "text-red-600"
            : concern.severity === "warn"
              ? "text-amber-600"
              : "text-muted-foreground";
        return (
          <li key={i} className="flex gap-1.5 text-[11px]">
            <Icon className={cn("mt-px size-3.5 shrink-0", tone)} />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">{concern.issue}</span> {concern.suggestion}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
