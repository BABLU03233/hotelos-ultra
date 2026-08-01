"use client";

import Link from "next/link";
import { Bell, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";
import { StaffNotification } from "@/types";

export function NotificationBell() {
  const { data, reload } = useFetch<{ notifications: StaffNotification[] }>("/api/notifications", 20_000);
  const notifications = data?.notifications ?? [];

  async function resolve(id: string) {
    await apiFetch(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({}) });
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
            <p className="p-6 text-center text-xs text-muted-foreground">Aria&apos;s handling everything — nothing needs you right now.</p>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => (
                <div key={n.id} className="flex items-start gap-2.5 border-b border-border p-3 last:border-0">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/crm?contact=${n.contact.id}`} className="text-xs font-medium hover:underline">
                      {n.contact.name || n.contact.phone}
                    </Link>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.reason}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                      <button
                        onClick={() => resolve(n.id)}
                        className="text-[10px] font-medium text-primary hover:underline"
                      >
                        Mark resolved
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
