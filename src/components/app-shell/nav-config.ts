import { BookOpen, Clock, LayoutDashboard, Megaphone, MessagesSquare, Settings } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/crm", label: "CRM", icon: MessagesSquare },
  { href: "/follow-ups", label: "Follow-ups", icon: Clock },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
