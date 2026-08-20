"use client";

import { Bot, Clock, UserRound } from "lucide-react";
import { deskStatus, formatWait, type ChatFilterKey } from "@/lib/crm/chat-filters";
import { cn } from "@/lib/utils";
import { Contact } from "@/types";

/**
 * How the desk is doing, in one line.
 *
 * Answers the question a hotel owner actually opens this page to ask — how
 * much is the assistant handling on its own, and how much is landing on my
 * people — without making them count rows or open a report.
 *
 * The wait time is the part that changes behaviour. A bare count cannot tell
 * you whether to act: "3 in human mode" is unremarkable at 9am and alarming at 6pm.
 * The same figure with "longest waiting 4h" attached is the only one here that
 * reliably makes someone open a chat.
 *
 * Both halves are buttons rather than text, because the reaction to reading a
 * number here is always "show me those" — making that a second click through a
 * filter chip would be a worse version of the same thing.
 */
export function DeskStatus({
  contacts,
  onFilter,
  className,
}: {
  contacts: Contact[];
  onFilter: (key: ChatFilterKey) => void;
  className?: string;
}) {
  const status = deskStatus(contacts);

  // Nothing to summarise. An empty desk showing "0 with Anushka · 0 human mode"
  // is chrome pretending to be information.
  if (status.total === 0) return null;

  return (
    <div className={cn("flex items-center gap-1 text-[11px] whitespace-nowrap", className)}>
      <button
        onClick={() => onFilter("AI")}
        className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bot className="size-3 shrink-0 text-primary" />
        <span className="font-semibold tabular-nums text-foreground">{status.withAi}</span>
        <span className="truncate">with Anushka</span>
      </button>

      <span className="text-muted-foreground/40" aria-hidden>
        ·
      </span>

      <button
        onClick={() => onFilter("HUMAN")}
        className={cn(
          "flex min-w-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted",
          status.needsHuman > 0 ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <UserRound className="size-3 shrink-0" />
        <span className="font-semibold tabular-nums">{status.needsHuman}</span>
        <span className="truncate">human mode</span>
      </button>

      {/* Only rendered when someone is actually waiting. A "longest wait" of
          nothing is not a reassuring zero, it is a meaningless one. */}
      {status.longestWaitMs !== null && (
        <>
          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>
          <button
            onClick={() => onFilter("HUMAN")}
            className={cn(
              "flex min-w-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted",
              // Past an hour a guest has noticed. That is the point where the
              // number should start looking like a problem rather than a stat.
              status.longestWaitMs > 3_600_000 ? "font-medium text-destructive" : "text-muted-foreground"
            )}
            title={`${status.waiting} guest${status.waiting === 1 ? "" : "s"} waiting on a reply`}
          >
            <Clock className="size-3 shrink-0" />
            <span className="truncate">waiting {formatWait(status.longestWaitMs)}</span>
          </button>
        </>
      )}
    </div>
  );
}
