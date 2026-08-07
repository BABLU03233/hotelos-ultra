"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFetch } from "@/hooks/use-fetch";
import { StaffNotification } from "@/types";

const POLL_MS = 15_000;
const FLASH_INTERVAL_MS = 1000;

/**
 * Global, mounted once in the (app) layout — not tied to any one page —
 * so a new booking is never missed just because the owner is on Settings
 * instead of the dashboard. Two effects: (1) toast the moment a NEW
 * unresolved BOOKING notification appears (never re-toasts ones already
 * seen this session, and never toasts the pre-existing backlog on first
 * load), (2) flash the browser tab title while at least one BOOKING
 * notification stays unresolved, so it's hard to miss even on a
 * background tab — stops the instant it's marked resolved.
 */
export function BookingAlert() {
  const { data } = useFetch<{ notifications: StaffNotification[] }>("/api/notifications", POLL_MS);
  const router = useRouter();
  const seenIds = React.useRef<Set<string>>(new Set());
  const initialized = React.useRef(false);
  const originalTitle = React.useRef<string | null>(null);
  const flashTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const bookingNotifications = React.useMemo(
    () => (data?.notifications ?? []).filter((n) => n.type === "BOOKING"),
    [data]
  );

  React.useEffect(() => {
    if (!data) return;
    for (const n of bookingNotifications) {
      if (seenIds.current.has(n.id)) continue;
      seenIds.current.add(n.id);
      if (!initialized.current) continue; // don't toast the pre-existing backlog on first load
      toast.success(n.reason, {
        duration: 10_000,
        action: { label: "View booking", onClick: () => router.push(`/crm?contact=${n.contact.id}`) },
      });
    }
    initialized.current = true;
  }, [bookingNotifications, data, router]);

  React.useEffect(() => {
    if (originalTitle.current === null) originalTitle.current = document.title;

    if (bookingNotifications.length === 0) {
      if (flashTimer.current) {
        clearInterval(flashTimer.current);
        flashTimer.current = null;
      }
      document.title = originalTitle.current;
      return;
    }

    if (flashTimer.current) return; // already flashing
    let showAlert = true;
    flashTimer.current = setInterval(() => {
      document.title = showAlert ? `🔔 New booking! — ${originalTitle.current}` : (originalTitle.current ?? document.title);
      showAlert = !showAlert;
    }, FLASH_INTERVAL_MS);

    return () => {
      if (flashTimer.current) {
        clearInterval(flashTimer.current);
        flashTimer.current = null;
      }
      if (originalTitle.current) document.title = originalTitle.current;
    };
  }, [bookingNotifications.length]);

  return null;
}
