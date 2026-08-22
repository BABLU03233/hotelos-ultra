"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Check, CircleCheck, PartyPopper, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { saveWithFeedback } from "@/lib/save-with-feedback";
import { useFetch } from "@/hooks/use-fetch";
import { formatRelativeTime } from "@/lib/format";
import { NOTIFICATION_STYLE } from "@/lib/notification-style";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuthStore } from "@/store/use-auth-store";
import { StaffNotification } from "@/types";

const ICONS = { PartyPopper, CalendarClock, TriangleAlert };

const POLL_MS = 20_000;
const DISPLAY_LIMIT = 5;

export function DashboardAttentionPanel({
  initialCount,
  initialNotifications,
}: {
  initialCount: number;
  initialNotifications: StaffNotification[];
}) {
  // Polls in the background so a new escalation shows up without a manual
  // refresh. Falls back to the SSR-rendered props until the first poll
  // lands, so there's no loading flash on mount — and `justResolved` is an
  // event-driven optimistic overlay, never synced from an effect.
  const { data, reload } = useFetch<{ notifications: StaffNotification[] }>("/api/notifications", POLL_MS);
  const [justResolved, setJustResolved] = React.useState<Set<string>>(new Set());
  const agentName = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");

  const all = (data?.notifications ?? initialNotifications).filter((n) => !justResolved.has(n.id));
  const count = data ? all.length : Math.max(0, initialCount - justResolved.size);
  const visible = all.slice(0, DISPLAY_LIMIT);

  async function resolve(id: string) {
    setJustResolved((prev) => new Set(prev).add(id));
    await saveWithFeedback(
      () => apiFetch(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({}) }),
      "Couldn’t resolve that notification"
    );
    reload();
  }

  if (count === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="All clear"
        description={`${agentName} hasn't needed to escalate anything.`}
        className="[&>div:first-child]:bg-emerald-500/10 [&_svg]:text-emerald-600"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((n) => {
        const style = NOTIFICATION_STYLE[n.type];
        const Icon = ICONS[style.icon];
        return (
          <div
            key={n.id}
            className={
              n.type === "BOOKING"
                ? "flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"
                : "flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"
            }
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${
                  n.type === "BOOKING" ? "bg-emerald-500/15" : "bg-amber-500/15"
                }`}
              >
                <Icon className={`size-5 ${style.className}`} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{n.contact.name || n.contact.phone}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{n.reason}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => resolve(n.id)}>
                <Check className="size-4" /> Mark resolved
              </Button>
              <Button size="sm" nativeButton={false} render={<Link href={`/crm?contact=${n.contact.id}`} />}>
                {style.actionLabel} →
              </Button>
            </div>
          </div>
        );
      })}
      {count > visible.length && (
        <p className="pt-1 text-center text-xs text-muted-foreground">+{count - visible.length} more</p>
      )}
    </div>
  );
}
