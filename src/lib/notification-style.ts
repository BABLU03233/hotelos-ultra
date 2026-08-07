import { StaffNotificationType } from "@/types";

/**
 * Icon name, color class, and quick-action label per notification type —
 * shared between notification-bell.tsx and attention-panel.tsx so a
 * receptionist glancing at "Needs attention" gets a clear, type-specific
 * next step instead of a single generic "Mark resolved" for everything.
 */
export const NOTIFICATION_STYLE: Record<
  StaffNotificationType,
  { icon: "PartyPopper" | "CalendarClock" | "TriangleAlert"; className: string; actionLabel: string }
> = {
  BOOKING: { icon: "PartyPopper", className: "text-emerald-600", actionLabel: "View booking" },
  REMINDER: { icon: "CalendarClock", className: "text-blue-600", actionLabel: "View contact" },
  ESCALATION: { icon: "TriangleAlert", className: "text-amber-600", actionLabel: "Reply now" },
};
