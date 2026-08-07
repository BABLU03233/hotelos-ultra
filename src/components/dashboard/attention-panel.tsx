"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, CircleCheck, PartyPopper, TriangleAlert } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { formatRelativeTime } from "@/lib/format";
import { NOTIFICATION_STYLE } from "@/lib/notification-style";
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
    await apiFetch(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({}) });
    reload();
  }

  if (count === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <CircleCheck className="size-6 text-emerald-600" />
        <p className="text-sm font-medium">All clear</p>
        <p className="text-xs text-muted-foreground">{agentName} hasn&apos;t needed to escalate anything.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {visible.map((n) => {
        const style = NOTIFICATION_STYLE[n.type];
        const Icon = ICONS[style.icon];
        return (
          <div
            key={n.id}
            className={
              n.type === "BOOKING"
                ? "flex flex-col gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5"
                : "flex flex-col gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5"
            }
          >
            <div className="flex items-start gap-2.5">
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${style.className}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">{n.contact.name || n.contact.phone}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.reason}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pl-6">
              <button onClick={() => resolve(n.id)} className="shrink-0 text-[10px] font-medium text-muted-foreground hover:underline">
                Mark resolved
              </button>
              <Link
                href={`/crm?contact=${n.contact.id}`}
                className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground hover:opacity-90"
              >
                {style.actionLabel} →
              </Link>
            </div>
          </div>
        );
      })}
      {count > visible.length && (
        <p className="pt-1 text-center text-[11px] text-muted-foreground">+{count - visible.length} more</p>
      )}
    </div>
  );
}
