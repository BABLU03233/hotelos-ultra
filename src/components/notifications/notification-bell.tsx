"use client";

import Link from "next/link";
import { Bell, CalendarClock, PartyPopper, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { saveWithFeedback } from "@/lib/save-with-feedback";
import { formatRelativeTime } from "@/lib/format";
import { NOTIFICATION_STYLE } from "@/lib/notification-style";
import { useAuthStore } from "@/store/use-auth-store";
import { StaffNotification } from "@/types";

const ICONS = { PartyPopper, CalendarClock, TriangleAlert };

export function NotificationBell() {
  const { data, reload } = useFetch<{ notifications: StaffNotification[] }>("/api/notifications", 20_000);
  const notifications = data?.notifications ?? [];
  const agentName = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");

  async function resolve(id: string) {
    await saveWithFeedback(
      () => apiFetch(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({}) }),
      "Couldn’t resolve that notification"
    );
    reload();
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative">
            <Bell />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-white">
                {notifications.length > 9 ? "9+" : notifications.length}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-medium">Needs attention</p>
          {notifications.length > 0 && <Badge variant="outline">{notifications.length}</Badge>}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">{agentName}&apos;s handling everything — nothing needs you right now.</p>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => {
                const style = NOTIFICATION_STYLE[n.type];
                const Icon = ICONS[style.icon];
                return (
                <div key={n.id} className="flex items-start gap-2.5 border-b border-border p-3 last:border-0">
                  <Icon className={`mt-0.5 size-3.5 shrink-0 ${style.className}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{n.contact.name || n.contact.phone}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.reason}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                        <button
                          onClick={() => resolve(n.id)}
                          className="text-[10px] font-medium text-muted-foreground hover:underline"
                        >
                          Mark resolved
                        </button>
                      </div>
                      <Link
                        href={`/crm?contact=${n.contact.id}`}
                        className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:opacity-90"
                      >
                        {style.actionLabel} →
                      </Link>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
