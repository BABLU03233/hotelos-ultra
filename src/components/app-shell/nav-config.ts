import { BookOpen, Clock, LayoutDashboard, LayoutTemplate, Megaphone, MessagesSquare, Settings } from "lucide-react";

/**
 * `tone` maps each section onto the shared chart-1..5 palette (globals.css)
 * so the sidebar gets a distinct accent per section instead of one flat
 * brand color everywhere — `null` (Settings) intentionally opts out to keep
 * a utility page neutral against the otherwise-colorful nav.
 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tone: 1 },
  { href: "/crm", label: "CRM", icon: MessagesSquare, tone: 5 },
  { href: "/follow-ups", label: "Follow-ups", icon: Clock, tone: 3 },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, tone: 4 },
  { href: "/templates", label: "Templates", icon: LayoutTemplate, tone: 2 },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, tone: 1 },
  { href: "/settings", label: "Settings", icon: Settings, tone: null },
] as const;
