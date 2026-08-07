import { StaffNotificationType } from "@/types";

/** Icon name (lucide-react) + color class per notification type, shared between notification-bell.tsx and attention-panel.tsx. */
export const NOTIFICATION_STYLE: Record<StaffNotificationType, { icon: "PartyPopper" | "CalendarClock" | "TriangleAlert"; className: string }> = {
  BOOKING: { icon: "PartyPopper", className: "text-emerald-600" },
  REMINDER: { icon: "CalendarClock", className: "text-blue-600" },
  ESCALATION: { icon: "TriangleAlert", className: "text-amber-600" },
};
