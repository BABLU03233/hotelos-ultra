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

/** One-clause definition of what each pipeline stage means, surfaced via tooltip on board/column headers. */
export const LEAD_STATUS_DESCRIPTION: Record<LeadStatus, string> = {
  NEW: "Just messaged in — Anushka hasn't qualified them yet.",
  INTERESTED: "Asked about rooms, dates, or pricing — actively considering a stay.",
  FOLLOW_UP: "Went quiet — automatic follow-up messages are keeping the conversation alive.",
  BOOKED: "Confirmed a booking.",
  CLOSED: "No longer an active lead — booked elsewhere, or not interested.",
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

/** Same hues as LEAD_STATUS_BORDER but for a left edge (pipeline cards) instead of a top edge (column headers). */
export const LEAD_STATUS_LEFT_BORDER: Record<LeadStatus, string> = {
  NEW: "border-l-[var(--color-chart-5)]",
  INTERESTED: "border-l-[var(--color-chart-1)]",
  FOLLOW_UP: "border-l-[var(--color-chart-3)]",
  BOOKED: "border-l-[var(--color-chart-2)]",
  CLOSED: "border-l-muted-foreground",
};

/** Soft translucent tint for column/section chrome — same hues, low-opacity fill instead of a hairline border. */
export const LEAD_STATUS_BG: Record<LeadStatus, string> = {
  NEW: "bg-[color-mix(in_oklch,var(--color-chart-5),transparent_88%)]",
  INTERESTED: "bg-[color-mix(in_oklch,var(--color-chart-1),transparent_88%)]",
  FOLLOW_UP: "bg-[color-mix(in_oklch,var(--color-chart-3),transparent_88%)]",
  BOOKED: "bg-[color-mix(in_oklch,var(--color-chart-2),transparent_88%)]",
  CLOSED: "bg-muted",
};
