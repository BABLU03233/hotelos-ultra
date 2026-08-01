"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";
import { StaffNotification } from "@/types";

export function DashboardAttentionPanel({
  initialCount,
  initialNotifications,
}: {
  initialCount: number;
  initialNotifications: StaffNotification[];
}) {
  const [count, setCount] = React.useState(initialCount);
  const [notifications, setNotifications] = React.useState(initialNotifications);

  async function resolve(id: string) {
    await apiFetch(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({}) });
    setCount((c) => Math.max(0, c - 1));
    setNotifications((list) => list.filter((n) => n.id !== id));
  }

  if (count === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <CircleCheck className="size-6 text-emerald-600" />
        <p className="text-sm font-medium">All clear</p>
        <p className="text-xs text-muted-foreground">Aria hasn&apos;t needed to escalate anything.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {notifications.map((n) => (
        <div key={n.id} className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/crm?contact=${n.contact.id}`} className="truncate text-xs font-medium hover:underline">
                {n.contact.name || n.contact.phone}
              </Link>
              <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{n.reason}</p>
          </div>
          <button onClick={() => resolve(n.id)} className="shrink-0 text-[10px] font-medium text-primary hover:underline">
            Resolve
          </button>
        </div>
      ))}
      {count > notifications.length && (
        <p className="pt-1 text-center text-[11px] text-muted-foreground">+{count - notifications.length} more</p>
      )}
    </div>
  );
}
