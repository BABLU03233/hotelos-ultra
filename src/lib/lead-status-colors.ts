import { LeadStatus } from "@/types";

/**
 * Single source of truth for lead-stage color coding, mapped onto the
 * chart-1..5 design tokens (globals.css) so a stage reads as the same hue
 * everywhere — funnel chart, CRM list dots, and pipeline board — and adapts
 * automatically between light/dark mode.
 */
export const LEAD_STATUS_HEX: Record<LeadStatus, string> = {
  NEW: "var(--color-chart-5)",
  INTERESTED: "var(--color-chart-1)",
  FOLLOW_UP: "var(--color-chart-3)",
  BOOKED: "var(--color-chart-2)",
  CLOSED: "var(--color-muted-foreground)",
};

export const LEAD_STATUS_DOT: Record<LeadStatus, string> = {
  NEW: "bg-[var(--color-chart-5)]",
  INTERESTED: "bg-[var(--color-chart-1)]",
  FOLLOW_UP: "bg-[var(--color-chart-3)]",
  BOOKED: "bg-[var(--color-chart-2)]",
  CLOSED: "bg-muted-foreground",
};

export const LEAD_STATUS_BORDER: Record<LeadStatus, string> = {
  NEW: "border-t-[var(--color-chart-5)]",
  INTERESTED: "border-t-[var(--color-chart-1)]",
  FOLLOW_UP: "border-t-[var(--color-chart-3)]",
  BOOKED: "border-t-[var(--color-chart-2)]",
  CLOSED: "border-t-muted-foreground",
};
